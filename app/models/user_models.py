from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class User(BaseModel):
    id: str
    email: str
    totp_secret: Optional[str] = None
    totp_verified: bool = False
    telegram_chat_id: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None


class CurrentUser(BaseModel):
    """Trimmed-down user identity attached to a request by get_current_user."""
    id: str
    email: str


class AuthStartRequest(BaseModel):
    email: EmailStr


class AuthStartResponse(BaseModel):
    status: str  # "new" (needs QR + first code) | "existing" (needs login code)
    qr_data_uri: Optional[str] = None
    manual_entry_secret: Optional[str] = None


class VerifyEnrollRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class AuthResponse(BaseModel):
    token: str
    telegram_linked: bool


class CompleteSetupRequest(BaseModel):
    telegram_chat_id: str
