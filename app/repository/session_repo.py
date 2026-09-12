import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

import app.supabase_client as supabase_client

_FRACTIONAL_SECONDS = re.compile(r"^(.*\.\d+)([+-]\d{2}:\d{2}|Z)$")


def _parse_timestamptz(value: str) -> datetime:
    """PostgREST trims trailing zeros off timestamptz fractional seconds
    (e.g. ".87451" instead of ".874510"), and datetime.fromisoformat() on
    Python <3.11 only accepts exactly 3 or 6 fractional digits — confirmed
    live, a real expires_at value from this exact table raised
    ValueError: Invalid isoformat string. Pad the fraction out to 6 digits
    rather than assume a Python version we don't control on Render."""
    match = _FRACTIONAL_SECONDS.match(value)
    if match:
        head, tz = match.groups()
        whole, frac = head.split(".")
        value = f"{whole}.{frac.ljust(6, '0')}{tz}"
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class SessionRepository:
    """Backs the long-lived refresh-token cookie (see app/server.py's
    /auth/refresh) that lets the extension silently re-authenticate after
    losing its cached JWT — e.g. a remove+reinstall wiping chrome.storage.local
    — without the user re-entering a TOTP code every time.

    Only a hash of the raw token is ever persisted — same principle as a
    password hash. The raw value lives exclusively in the browser's HttpOnly
    cookie and in-memory during a single request; a DB leak of this table
    can't be turned into a usable session."""

    TABLE = "refresh_sessions"

    @staticmethod
    def _hash(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    async def create(self, user_id: str, expiry_days: int) -> str:
        raw_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=expiry_days)
        await (
            supabase_client.supabase.table(self.TABLE)
            .insert(
                {
                    "user_id": user_id,
                    "token_hash": self._hash(raw_token),
                    "expires_at": expires_at.isoformat(),
                }
            )
            .execute()
        )
        return raw_token

    async def get_valid_user_id(self, raw_token: str) -> str | None:
        """Returns the owning user_id if this token exists, isn't revoked,
        and hasn't expired — None otherwise (caller can't distinguish which
        case, deliberately: all three should just mean "log in again")."""
        response = (
            await supabase_client.supabase.table(self.TABLE)
            .select("user_id, expires_at, revoked_at")
            .eq("token_hash", self._hash(raw_token))
            .limit(1)
            .execute()
        )
        if not response.data:
            return None

        row = response.data[0]
        if row["revoked_at"]:
            return None
        if _parse_timestamptz(row["expires_at"]) < datetime.now(timezone.utc):
            return None
        return row["user_id"]

    async def revoke(self, raw_token: str) -> None:
        await (
            supabase_client.supabase.table(self.TABLE)
            .update({"revoked_at": datetime.now(timezone.utc).isoformat()})
            .eq("token_hash", self._hash(raw_token))
            .execute()
        )

    async def rotate(self, old_raw_token: str, user_id: str, expiry_days: int) -> str:
        """Issues a fresh token and revokes the one being replaced. Doing
        this on every refresh (rather than reusing one long-lived token)
        gives a sliding expiration — a user who keeps sending emails every
        few days never actually hits the wall, while one who goes quiet
        eventually needs to log in again `expiry_days` after their last
        send."""
        new_token = await self.create(user_id, expiry_days)
        await self.revoke(old_raw_token)
        return new_token
