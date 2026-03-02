"""
auth.py — JWT Authentication & RBAC for Synergy Sales Genius
=============================================================
Provides lightweight JWT-based authentication for the FastAPI backend.

Key exports:
  create_access_token(data)  — Signs and returns a JWT string.
  verify_token(token)        — Decodes the JWT; raises 401 on failure.
  get_current_user           — FastAPI Depends() callable; injects CurrentUser.
  verify_password(plain, h)  — bcrypt comparison of a plaintext password to its hash.
  get_password_hash(pw)      — Returns a bcrypt hash of the given plaintext password.
  bootstrap_demo_users()     — Seeds Cosmos DB Users container on first startup.
  LoginRequest               — Pydantic schema for POST /api/auth/login body.
  TokenResponse              — Pydantic schema for the login success response.

Authentication flow:
  1. POST /api/auth/login:  query Cosmos DB Users container by email.
  2. verify_password():     compare the submitted password to the stored bcrypt hash.
  3. create_access_token(): sign a JWT embedding sub/name/role/bu claims.
  4. Frontend stores the JWT and sends it as a Bearer token on every subsequent request.

Demo accounts (created automatically on first startup via bootstrap_demo_users):
  marvis@chinhin.com  / admin123   → Role: Admin      (sees ALL leads)
  sales@stucken.com   / sales123   → Role: Sales_Rep  (sees Stucken AAC leads only)
  … plus 6 more BU-specific Sales_Rep accounts.

Production considerations:
  • Replace SECRET_KEY with a vault-managed secret (Azure Key Vault).
  • Add refresh-token endpoint and short-lived access tokens.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# Load environment variables from .env (same pattern as ai_engine.py / database.py)
load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# ⚠️  Override JWT_SECRET_KEY via environment variable before deploying!
SECRET_KEY: str = os.environ.get(
    "JWT_SECRET_KEY",
    "synergy-hackathon-secret-key-2026-replace-before-prod",
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8-hour sessions for demo convenience

# ---------------------------------------------------------------------------
# Password hashing — bcrypt via passlib
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    """Return a bcrypt hash of the given plaintext password."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if plain_password matches the stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# Demo user definitions (used ONLY by bootstrap_demo_users at first startup).
# Passwords are hashed before being written to Cosmos DB.
# ---------------------------------------------------------------------------
_DEMO_USERS: list[Dict[str, Any]] = [
    {"email": "marvis@chinhin.com",  "name": "Marvis Chin",                    "role": "Admin",    "bu": None,                    "password": "admin123"},
    {"email": "sales@stucken.com",   "name": "Sales Rep (Stucken AAC)",         "role": "Sales_Rep","bu": "Stucken AAC",            "password": "sales123"},
    {"email": "sales@ajiya.com",     "name": "Sales Rep (Ajiya Metal/Glass)",   "role": "Sales_Rep","bu": "Ajiya Metal / Glass",    "password": "sales123"},
    {"email": "sales@gcast.com",     "name": "Sales Rep (G-Cast)",              "role": "Sales_Rep","bu": "G-Cast",                 "password": "sales123"},
    {"email": "sales@signature.com", "name": "Sales Rep (Signature Alliance)",  "role": "Sales_Rep","bu": "Signature Alliance",     "password": "sales123"},
    {"email": "sales@kitchen.com",   "name": "Sales Rep (Signature Kitchen)",   "role": "Sales_Rep","bu": "Signature Kitchen",      "password": "sales123"},
    {"email": "sales@fiamma.com",    "name": "Sales Rep (Fiamma Holding)",      "role": "Sales_Rep","bu": "Fiamma Holding",         "password": "sales123"},
    {"email": "sales@ppghing.com",   "name": "Sales Rep (PPG Hing)",            "role": "Sales_Rep","bu": "PPG Hing",               "password": "sales123"},
]


def bootstrap_demo_users() -> None:
    """
    Seed the Cosmos DB Users container with the 8 hackathon demo accounts.

    Called once during server startup (inside the lifespan context manager).
    If the container already contains at least one user document, this function
    is a no-op — it never overwrites existing production data.

    Passwords are bcrypt-hashed before being persisted; plaintext is never stored.
    """
    import database  # local import to avoid circular dependency at module level

    try:
        if database.count_users() > 0:
            logger.info("Users container already populated — skipping bootstrap.")
            return
        for demo in _DEMO_USERS:
            doc: Dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "email": demo["email"],
                "name": demo["name"],
                "role": demo["role"],
                "bu": demo["bu"],
                "hashed_password": get_password_hash(demo["password"]),
            }
            database.save_user(doc)
            logger.info("Bootstrapped demo user — email='%s' role='%s'", doc["email"], doc["role"])
        logger.info("Demo user bootstrap complete — %d users seeded.", len(_DEMO_USERS))
    except Exception as exc:
        logger.error("Demo user bootstrap failed: %s", exc)


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    """Inbound body for POST /api/auth/login."""
    email: str
    password: str


class CurrentUser(BaseModel):
    """Decoded JWT payload; injected into protected endpoints via Depends."""
    email: str
    name: str
    role: str              # "Admin" | "Sales_Rep"
    bu: Optional[str] = None  # Business Unit — relevant for Sales_Rep only


class TokenResponse(BaseModel):
    """Response envelope returned by POST /api/auth/login on success."""
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]   # Mirrors CurrentUser fields for the frontend


# ---------------------------------------------------------------------------
# Token Utilities
# ---------------------------------------------------------------------------

def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Signs a JWT with the app secret key.

    Args:
        data:          Claims to embed (sub, name, role, bu, etc.).
        expires_delta: Optional custom TTL; defaults to ACCESS_TOKEN_EXPIRE_MINUTES.

    Returns:
        Signed JWT string.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> CurrentUser:
    """
    Decodes and validates a JWT.

    Args:
        token: Raw Bearer token string from the Authorization header.

    Returns:
        CurrentUser — the decoded identity payload.

    Raises:
        HTTPException(401) if the token is missing, expired, or tampered.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials — token missing or expired.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: Optional[str] = payload.get("sub")
        if email is None:
            raise credentials_exception
        return CurrentUser(
            email=email,
            name=payload.get("name", "Unknown User"),
            role=payload.get("role", "Sales_Rep"),
            bu=payload.get("bu"),
        )
    except JWTError:
        raise credentials_exception


# ---------------------------------------------------------------------------
# FastAPI Dependency
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> CurrentUser:
    """
    FastAPI dependency — extract and validate the Bearer token from the request.

    Usage:
        @app.get("/api/leads")
        def get_leads(user: CurrentUser = Depends(get_current_user)): ...

    Raises:
        HTTPException(401) if no token is present or the token is invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_token(credentials.credentials)
