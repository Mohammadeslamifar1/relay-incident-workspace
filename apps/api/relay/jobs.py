import asyncio
import logging
import time

from relay.ai import PROMPT_VERSION, ProviderFailure, contains_instruction_attack, generate_brief
from relay.db import Analysis, Audit, Incident
from relay.retrieval import retrieve
from sqlalchemy import select

logger = logging.getLogger("relay.jobs")


class AnalysisWorker:
    """Persisted queue drained by one application worker; no silent retries of paid calls."""

    def __init__(self, sessions, settings):
        self.sessions, self.settings = sessions, settings
        self.wakeup = asyncio.Event()

    async def run(self):
        with self.sessions() as db:
            for job in db.scalars(select(Analysis).where(Analysis.status == "running")):
                job.status = "failed"
                job.error = "The application restarted during analysis. Start a new investigation."
            db.commit()
        while True:
            with self.sessions() as db:
                job_id = db.scalar(
                    select(Analysis.id)
                    .where(Analysis.status == "queued")
                    .order_by(Analysis.created_at)
                    .limit(1)
                )
            if job_id:
                await self.process(job_id)
                continue
            self.wakeup.clear()
            try:
                await asyncio.wait_for(self.wakeup.wait(), timeout=1)
            except TimeoutError:
                pass

    async def process(self, job_id: str):
        started = time.perf_counter()
        with self.sessions() as db:
            job = db.get(Analysis, job_id)
            job.status = "running"
            incident = db.get(Incident, job.incident_id)
            context = {
                "title": incident.title,
                "summary": incident.summary,
                "service": incident.service,
            }
            evidence = retrieve(db, job.workspace_id, " ".join(context.values()))
            # Bound the model context independently of uploaded document length.
            evidence = [{**item, "content": item["content"][:1800]} for item in evidence]
            job.evidence = evidence
            job.trace = [
                {
                    "step": "Retrieve",
                    "detail": f"BM25 · {len(evidence)} passages · workspace-scoped",
                },
                {
                    "step": "Inspect",
                    "detail": (
                        "Instruction-like content detected; treated as untrusted data"
                        if any(contains_instruction_attack(e["content"]) for e in evidence)
                        else "Evidence treated as untrusted data · secret patterns redacted"
                    ),
                },
                {"step": "Compose", "detail": f"{self.settings.ai_provider} · {PROMPT_VERSION}"},
            ]
            db.commit()
        try:
            brief = await generate_brief(self.settings, context, evidence)
            with self.sessions() as db:
                job = db.get(Analysis, job_id)
                job.result = brief.model_dump()
                job.status = "completed"
                job.latency_ms = round((time.perf_counter() - started) * 1000)
                job.trace = [
                    *job.trace,
                    {
                        "step": "Validate",
                        "detail": "Schema and evidence references checked · awaiting human review",
                    },
                ]
                db.add(
                    Audit(
                        workspace_id=job.workspace_id,
                        actor="Relay",
                        action="analysis.completed",
                        resource_id=job.incident_id,
                        detail=f"Brief generated with {len(evidence)} evidence passages ({job.provider}).",
                    )
                )
                db.commit()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("analysis_failed id=%s type=%s", job_id, type(exc).__name__)
            with self.sessions() as db:
                job = db.get(Analysis, job_id)
                job.status = "failed"
                job.error = (
                    str(exc)
                    if isinstance(exc, ProviderFailure)
                    else "Analysis could not complete. Please retry."
                )
                job.latency_ms = round((time.perf_counter() - started) * 1000)
                db.add(
                    Audit(
                        workspace_id=job.workspace_id,
                        actor="Relay",
                        action="analysis.failed",
                        resource_id=job.incident_id,
                        detail=job.error,
                    )
                )
                db.commit()
