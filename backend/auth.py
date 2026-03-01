"""
auth.py — JWT Authentication & RBAC for Synergy Sales Genius
=============================================================
Provides lightweight JWT-based authentication for the FastAPI backend.

Key exports:
  create_access_token(data)  — Signs and returns a JWT string.
  verify_token(token)        — Decodes the JWT; raises 401 on failure.
  get_current_user           — FastAPI Depends() callable; injects CurrentUser.
  LoginRequest               — Pydantic schema for POST /api/auth/login body.
  TokenResponse              — Pydantic schema for the login success response.

Demo users (hardcoded for hackathon):
  marvis@chinhin.com  / admin123   → Role: Admin      (sees ALL leads)
  sales@stucken.com   / sales123   → Role: Sales_Rep  (sees Stucken AAC leads only)

In production:
  • Replace SECRET_KEY with a vault-managed secret (Azure Key Vault).
  • Replace MOCK_USERS with Cosmos DB 'Users' container lookup.
  • Add refresh-token endpoint and short-lived access tokens.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

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
# Hardcoded demo users
# In production: query the Cosmos DB 'Users' container.
# ---------------------------------------------------------------------------
MOCK_USERS: Dict[str, Dict[str, Any]] = {
    "marvis@chinhin.com": {
        "email": "marvis@chinhin.com",
        "name": "Marvis Tan",
        "role": "Admin",
        "bu": None,           # Admin sees across all BUs
        "password": "admin123",
    },
    "sales@stucken.com": {
        "email": "sales@stucken.com",
        "name": "Ahmad Razif",
        "role": "Sales_Rep",
        "bu": "Stucken AAC",  # Sees only leads matched to this BU
        "password": "sales123",
    },
}


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
