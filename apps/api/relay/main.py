import asyncio
import contextlib
import logging
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from relay.auth import (
    COOKIE,
    RateLimiter,
    current_user,
    database,
    editor,
    hasher,
    session_cookie,
    verify_password,
)
from relay.config import Settings
from relay.db import (
    Analysis,
    Audit,
    Base,
    Chunk,
    Decision,
    Document,
    Evaluation,
    Incident,
    User,
    Workspace,
    make_engine,
    now,
)
from relay.evaluation import run_evaluation
from relay.jobs import AnalysisWorker
from relay.retrieval import add_document, redact
from relay.schemas import (
    AnalysisCreate,
    DecisionCreate,
    DocumentCreate,
    IncidentCreate,
    Login,
    Register,
    StatusUpdate,
)
from relay.seed import seed_workspace
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

log = logging.getLogger("relay.http")


def serialize(row):
    result = {}
    for column in row.__table__.columns:
        if column.name == "password_hash":
            continue
        value = getattr(row, column.name)
        if isinstance(value, datetime):
            value = (
                value.replace(tzinfo=UTC).isoformat() if value.tzinfo is None else value.isoformat()
            )
        result[column.name] = value
    return result


def scoped(db, model, resource_id, user):
    row = db.scalar(
        select(model).where(model.id == resource_id, model.workspace_id == user.workspace_id)
    )
    if row is None:
        raise HTTPException(404, "Resource not found.")
    return row


def audit(db, user, action, resource_id, detail):
    db.add(
        Audit(
            workspace_id=user.workspace_id,
            actor=user.name,
            action=action,
            resource_id=resource_id,
            detail=detail,
        )
    )


def create_app(settings: Settings | None = None, *, create_tables: bool = False) -> FastAPI:
    settings = settings or Settings()
    if settings.database_url.startswith("sqlite:///./data/"):
        Path("data").mkdir(exist_ok=True)
    engine, sessions = make_engine(settings.database_url)
    if create_tables:  # Tests only. Normal startup uses Alembic migrations.
        Base.metadata.create_all(engine)
    worker = AnalysisWorker(sessions, settings)

    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(worker.run())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        engine.dispose()

    app = FastAPI(
        title="Relay API",
        version="0.1.0",
        description="Evidence-first incident investigation. All resource endpoints are workspace-scoped.",
        lifespan=lifespan,
    )
    app.state.settings, app.state.sessions = settings, sessions
    app.state.limiter = RateLimiter()
    app.state.worker = worker

    @app.middleware("http")
    async def guard_and_trace(request: Request, call_next):
        request_id = str(uuid4())
        started = time.perf_counter()
        if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
            origin = request.headers.get("origin")
            if origin and origin not in settings.allowed_origins:
                return JSONResponse({"detail": "Origin is not allowed."}, status_code=403)
            if request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)
            # Limit streamed bodies as well as Content-Length declarations.
            body = bytearray()
            async for part in request.stream():
                body.extend(part)
                if len(body) > 150000:
                    return JSONResponse({"detail": "Request exceeds 150 KB."}, status_code=413)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        log.info(
            "request id=%s method=%s path=%s status=%d latency_ms=%d",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            round((time.perf_counter() - started) * 1000),
        )
        return response

    def auth_limit(request):
        app.state.limiter.check(f"auth:{request.client.host if request.client else 'local'}", 20)

    def profile(db, user):
        return {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "workspace": db.get(Workspace, user.workspace_id).name,
        }

    @app.get("/api/health")
    def health(db: Session = Depends(database)):
        db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "version": "0.1.0",
            "provider": settings.ai_provider,
            "demo_enabled": settings.demo_enabled,
        }

    @app.post("/api/auth/demo")
    def demo(request: Request, response: Response, db: Session = Depends(database)):
        auth_limit(request)
        if not settings.demo_enabled:
            raise HTTPException(403, "Demo workspaces are disabled.")
        workspace = Workspace(name="Acme Engineering")
        db.add(workspace)
        db.flush()
        user = User(
            workspace_id=workspace.id,
            email=f"demo-{uuid4()}@relay.local",
            name="Demo engineer",
            role="owner",
        )
        db.add(user)
        db.flush()
        seed_workspace(db, workspace.id, user.name)
        db.commit()
        session_cookie(response, request, user)
        return profile(db, user)

    @app.post("/api/auth/register", status_code=201)
    def register(
        body: Register, request: Request, response: Response, db: Session = Depends(database)
    ):
        auth_limit(request)
        workspace = Workspace(name=body.workspace)
        db.add(workspace)
        db.flush()
        user = User(
            workspace_id=workspace.id,
            email=body.email,
            name=body.name,
            password_hash=hasher.hash(body.password),
            role="owner",
        )
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "An account with that email already exists.") from None
        session_cookie(response, request, user)
        return profile(db, user)

    @app.post("/api/auth/login")
    def login(body: Login, request: Request, response: Response, db: Session = Depends(database)):
        auth_limit(request)
        user = db.scalar(select(User).where(User.email == body.email.lower()))
        if not verify_password(user.password_hash if user else None, body.password):
            raise HTTPException(401, "Email or password is incorrect.")
        session_cookie(response, request, user)
        return profile(db, user)

    @app.post("/api/auth/logout", status_code=204)
    def logout(response: Response):
        response.delete_cookie(
            COOKIE, path="/api", secure=settings.cookie_secure, httponly=True, samesite="strict"
        )

    @app.get("/api/auth/me")
    def me(user: User = Depends(current_user), db: Session = Depends(database)):
        return profile(db, user)

    @app.get("/api/incidents")
    def incidents(user: User = Depends(current_user), db: Session = Depends(database)):
        return [
            serialize(row)
            for row in db.scalars(
                select(Incident)
                .where(Incident.workspace_id == user.workspace_id)
                .order_by(Incident.created_at.desc())
                .limit(200)
            )
        ]

    @app.post("/api/incidents", status_code=201)
    def create_incident(
        body: IncidentCreate, user: User = Depends(editor), db: Session = Depends(database)
    ):
        # Lock the parent in PostgreSQL to serialize per-workspace numbering.
        db.scalar(select(Workspace).where(Workspace.id == user.workspace_id).with_for_update())
        number = (
            db.scalar(
                select(func.max(Incident.number)).where(Incident.workspace_id == user.workspace_id)
            )
            or 1000
        ) + 1
        incident = Incident(
            workspace_id=user.workspace_id,
            number=number,
            **{key: redact(value) for key, value in body.model_dump().items()},
        )
        db.add(incident)
        try:
            db.flush()
            audit(
                db, user, "incident.created", incident.id, f"Opened RLY-{number}: {incident.title}"
            )
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                409, "Another incident was created concurrently. Please retry."
            ) from None
        return serialize(incident)

    @app.get("/api/incidents/{incident_id}")
    def detail(
        incident_id: str, user: User = Depends(current_user), db: Session = Depends(database)
    ):
        incident = scoped(db, Incident, incident_id, user)
        analyses = list(
            db.scalars(
                select(Analysis)
                .where(
                    Analysis.incident_id == incident.id, Analysis.workspace_id == user.workspace_id
                )
                .order_by(Analysis.created_at.desc())
                .limit(20)
            )
        )
        decisions = (
            list(
                db.scalars(
                    select(Decision).where(
                        Decision.workspace_id == user.workspace_id,
                        Decision.analysis_id.in_([a.id for a in analyses]),
                    )
                )
            )
            if analyses
            else []
        )
        events = db.scalars(
            select(Audit)
            .where(Audit.workspace_id == user.workspace_id, Audit.resource_id == incident.id)
            .order_by(Audit.created_at.desc())
            .limit(50)
        )
        return {
            **serialize(incident),
            "analyses": [serialize(a) for a in analyses],
            "decisions": [serialize(d) for d in decisions],
            "events": [serialize(e) for e in events],
        }

    @app.patch("/api/incidents/{incident_id}")
    def change_status(
        incident_id: str,
        body: StatusUpdate,
        user: User = Depends(editor),
        db: Session = Depends(database),
    ):
        incident = scoped(db, Incident, incident_id, user)
        transitions = {
            "investigating": {"monitoring"},
            "monitoring": {"investigating", "resolved"},
            "resolved": {"investigating"},
        }
        if body.version != incident.version:
            raise HTTPException(409, "This incident changed. Refresh before updating it.")
        if body.status not in transitions[incident.status]:
            raise HTTPException(
                422, "Invalid transition. Move through monitoring before resolving."
            )
        changed = db.execute(
            update(Incident)
            .where(
                Incident.id == incident.id,
                Incident.workspace_id == user.workspace_id,
                Incident.version == body.version,
            )
            .values(status=body.status, version=body.version + 1, updated_at=now())
        )
        if changed.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "This incident changed. Refresh before updating it.")
        audit(db, user, "incident.status_changed", incident.id, f"Status changed to {body.status}")
        db.commit()
        db.refresh(incident)
        return serialize(incident)

    @app.post("/api/incidents/{incident_id}/analyses", status_code=202)
    def analyze(
        incident_id: str,
        body: AnalysisCreate,
        user: User = Depends(editor),
        db: Session = Depends(database),
    ):
        incident = scoped(db, Incident, incident_id, user)
        existing = db.scalar(
            select(Analysis).where(
                Analysis.incident_id == incident.id,
                Analysis.idempotency_key == body.idempotency_key,
            )
        )
        if existing:
            return serialize(existing)
        app.state.limiter.check(f"analysis:{user.workspace_id}", 10)
        active = db.scalar(
            select(func.count())
            .select_from(Analysis)
            .where(
                Analysis.workspace_id == user.workspace_id,
                Analysis.status.in_(["queued", "running"]),
            )
        )
        if active >= 3:
            raise HTTPException(
                429, "Three investigations are already queued. Wait for one to finish."
            )
        job = Analysis(
            workspace_id=user.workspace_id,
            incident_id=incident.id,
            idempotency_key=body.idempotency_key,
            provider=settings.ai_provider,
        )
        db.add(job)
        try:
            db.flush()
            audit(
                db,
                user,
                "analysis.queued",
                incident.id,
                "Requested an evidence-based investigation",
            )
            db.commit()
        except IntegrityError:
            db.rollback()
            job = db.scalar(
                select(Analysis).where(
                    Analysis.incident_id == incident.id,
                    Analysis.idempotency_key == body.idempotency_key,
                )
            )
        # The persisted queue is also polled; no cross-thread event mutation is needed.
        return serialize(job)

    @app.post("/api/analyses/{analysis_id}/decisions", status_code=201)
    def decide(
        analysis_id: str,
        body: DecisionCreate,
        user: User = Depends(editor),
        db: Session = Depends(database),
    ):
        job = scoped(db, Analysis, analysis_id, user)
        if (
            job.status != "completed"
            or not job.result
            or body.action_index >= len(job.result["actions"])
        ):
            raise HTTPException(422, "This action is not available for review.")
        decision = Decision(
            workspace_id=user.workspace_id,
            analysis_id=job.id,
            action_index=body.action_index,
            verdict=body.verdict,
            note=redact(body.note),
            actor=user.name,
        )
        db.add(decision)
        audit(
            db,
            user,
            f"action.{body.verdict}",
            job.incident_id,
            f"Action {body.action_index + 1}: {redact(body.note)}",
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                409, "This action already has a decision. Decisions are immutable."
            ) from None
        return serialize(decision)

    @app.get("/api/documents")
    def documents(user: User = Depends(current_user), db: Session = Depends(database)):
        rows = db.execute(
            select(Document, func.count(Chunk.id))
            .outerjoin(Chunk)
            .where(Document.workspace_id == user.workspace_id)
            .group_by(Document.id)
            .order_by(Document.created_at.desc())
        ).all()
        return [{**serialize(doc), "chunks": count} for doc, count in rows]

    @app.post("/api/documents", status_code=201)
    def create_document(
        body: DocumentCreate, user: User = Depends(editor), db: Session = Depends(database)
    ):
        count = db.scalar(
            select(func.count())
            .select_from(Document)
            .where(Document.workspace_id == user.workspace_id)
        )
        if count >= 100:
            raise HTTPException(409, "This workspace has reached the 100-document limit.")
        try:
            doc = add_document(db, user.workspace_id, **body.model_dump())
            audit(db, user, "document.indexed", doc.id, f"Indexed {doc.title}")
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "This document's content has already been indexed.") from None
        return serialize(doc)

    @app.delete("/api/documents/{document_id}", status_code=204)
    def delete_document(
        document_id: str, user: User = Depends(editor), db: Session = Depends(database)
    ):
        doc = scoped(db, Document, document_id, user)
        audit(
            db,
            user,
            "document.deleted",
            doc.id,
            f"Deleted {doc.title}; existing analysis evidence snapshots retained",
        )
        db.delete(doc)
        db.commit()

    @app.get("/api/audit")
    def events(user: User = Depends(current_user), db: Session = Depends(database)):
        return [
            serialize(e)
            for e in db.scalars(
                select(Audit)
                .where(Audit.workspace_id == user.workspace_id)
                .order_by(Audit.created_at.desc())
                .limit(200)
            )
        ]

    @app.get("/api/evaluations")
    def evaluations(user: User = Depends(current_user), db: Session = Depends(database)):
        return [
            serialize(e)
            for e in db.scalars(
                select(Evaluation)
                .where(Evaluation.workspace_id == user.workspace_id)
                .order_by(Evaluation.created_at.desc())
                .limit(20)
            )
        ]

    @app.post("/api/evaluations", status_code=201)
    def evaluate(user: User = Depends(editor), db: Session = Depends(database)):
        app.state.limiter.check(f"eval:{user.workspace_id}", 5)
        evaluation = Evaluation(workspace_id=user.workspace_id, results=run_evaluation())
        db.add(evaluation)
        db.flush()
        audit(
            db,
            user,
            "evaluation.completed",
            evaluation.id,
            "Ran eight reference-corpus regression cases",
        )
        db.commit()
        return serialize(evaluation)

    @app.get("/api/incidents/{incident_id}/export", response_class=PlainTextResponse)
    def export(
        incident_id: str, user: User = Depends(current_user), db: Session = Depends(database)
    ):
        data = detail(incident_id, user, db)
        lines = [
            f"# RLY-{data['number']}: {data['title']}",
            "",
            f"Status: {data['status']} | Severity: {data['severity']}",
            "",
            data["summary"],
            "",
        ]
        completed = next((a for a in data["analyses"] if a["status"] == "completed"), None)
        if completed:
            brief = completed["result"]
            lines += [
                "## Investigation brief",
                "",
                f"Provider: {completed['provider']}",
                "",
                brief["summary"],
                "",
                "## Hypotheses to verify",
                "",
            ]
            for hypothesis in brief["hypotheses"]:
                lines.append(f"- {hypothesis['claim']} [{', '.join(hypothesis['evidence_ids'])}]")
            lines += ["", "## Proposed actions (not executed)", ""]
            for i, action in enumerate(brief["actions"]):
                decision = next(
                    (
                        d
                        for d in data["decisions"]
                        if d["analysis_id"] == completed["id"] and d["action_index"] == i
                    ),
                    None,
                )
                lines.append(
                    f"- {action['title']}: {action['rationale']} [{', '.join(action['evidence_ids'])}] — {decision['verdict'] if decision else 'pending review'}"
                )
                if decision:
                    lines.append(f"  Review by {decision['actor']}: {decision['note']}")
            lines += [
                "",
                "## Unknowns",
                "",
                *[f"- {u}" for u in brief["unknowns"]],
                "",
                "## Evidence snapshots",
                "",
            ]
            for e in completed["evidence"]:
                lines += [
                    f"### {e['id']}: {e['title']} (lines {e['start_line']}–{e['end_line']})",
                    "",
                    e["content"],
                    "",
                ]
        return PlainTextResponse(
            "\n".join(lines),
            headers={"Content-Disposition": f'attachment; filename="relay-{data["number"]}.md"'},
        )

    if settings.static_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=settings.static_dir / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def frontend(path: str):
            if path.startswith("api/"):
                raise HTTPException(404, "Not found")
            return FileResponse(settings.static_dir / "index.html")

    return app


app = create_app()
