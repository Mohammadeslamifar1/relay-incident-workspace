import time
from collections import defaultdict, deque
from threading import Lock

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response
from relay.db import User
from sqlalchemy.orm import Session

hasher = PasswordHasher()
DUMMY_HASH = hasher.hash("constant-time-fallback-not-a-user-password")
COOKIE = "relay_session"


def database(request: Request):
    with request.app.state.sessions() as db:
        yield db


def current_user(request: Request, db: Session = Depends(database)) -> User:
    token = request.cookies.get(COOKIE)
    try:
        payload = jwt.decode(
            token or "",
            request.app.state.settings.secret_key,
            algorithms=["HS256"],
            audience="relay",
            options={"require": ["sub", "exp", "iat", "aud"]},
        )
        user = db.get(User, payload["sub"])
        if user is None:
            raise HTTPException(401, "Session expired. Please sign in again.")
        return user
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Sign in to continue.") from None


def editor(user: User = Depends(current_user)) -> User:
    if user.role not in {"owner", "analyst"}:
        raise HTTPException(403, "An analyst or owner role is required.")
    return user


def session_cookie(response: Response, request: Request, user: User):
    token = jwt.encode(
        {"sub": user.id, "iat": int(time.time()), "exp": int(time.time()) + 28800, "aud": "relay"},
        request.app.state.settings.secret_key,
        algorithm="HS256",
    )
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=request.app.state.settings.cookie_secure,
        samesite="strict",
        max_age=28800,
        path="/api",
    )


def verify_password(encoded: str | None, password: str) -> bool:
    try:
        return hasher.verify(encoded or DUMMY_HASH, password) and encoded is not None
    except (VerificationError, InvalidHashError):
        return False


class RateLimiter:
    """Single-process sliding window. Use an edge/shared limiter when scaling."""

    def __init__(self):
        self.windows: dict[str, deque] = defaultdict(deque)
        self.lock = Lock()

    def check(self, key: str, limit: int, seconds: int = 60):
        instant = time.monotonic()
        with self.lock:
            if len(self.windows) > 5000:
                self.windows = defaultdict(
                    deque,
                    {k: q for k, q in self.windows.items() if q and q[-1] > instant - seconds},
                )
            queue = self.windows[key]
            while queue and queue[0] <= instant - seconds:
                queue.popleft()
            if len(queue) >= limit:
                raise HTTPException(
                    429,
                    "Too many requests. Try again in a minute.",
                    headers={"Retry-After": str(seconds)},
                )
            queue.append(instant)
