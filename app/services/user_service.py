import logging

from app.auth.jwt import JWTManager
from app.auth.totp import TOTPManager
from app.core.config import Settings
from app.core.rate_limit import RateLimiter
from app.models.user_models import AuthResponse, AuthStartResponse, User
from app.repository.session_repo import SessionRepository
from app.repository.user_repo import UserRepository
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


class AuthError(Exception):
    """Raised for any expected auth failure; server.py maps this to an HTTP error."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class UserService:
    def __init__(self, settings: Settings, notification_service: NotificationService):
        self.repo = UserRepository()
        self.sessions = SessionRepository()
        self.totp = TOTPManager(settings)
        self.jwt = JWTManager(settings)
        self.notification_service = notification_service
        self._refresh_expiry_days = settings.refresh_token_expiry_days
        # 5 code attempts / 15 min / email — a 6-digit TOTP is brute-forceable
        # without this.
        self._attempt_limiter = RateLimiter(max_attempts=5, window_seconds=15 * 60)

    async def start(self, email: str) -> AuthStartResponse:
        """First step of the setup-page flow: figure out if this email is new
        (needs a QR to scan) or already enrolled (just needs a login code)."""
        user = await self.repo.get_by_email(email)

        if user and user.totp_verified:
            return AuthStartResponse(status="existing")

        if user:
            # Enrolled a secret before but never finished verifying it —
            # reuse the same secret rather than orphaning it.
            secret = self.totp.decrypt_secret(user.totp_secret)
        else:
            secret = self.totp.generate_secret()
            await self.repo.create(email, self.totp.encrypt_secret(secret))

        uri = self.totp.provisioning_uri(secret, email)
        return AuthStartResponse(
            status="new",
            qr_data_uri=self.totp.qr_data_uri(uri),
            manual_entry_secret=secret,
        )

    async def verify_enroll(self, email: str, code: str) -> tuple[AuthResponse, str]:
        self._check_rate_limit(email)
        user = self._require_user(await self.repo.get_by_email(email))

        secret = self.totp.decrypt_secret(user.totp_secret)
        if not self.totp.verify(secret, code):
            raise AuthError("Invalid code")

        await self.repo.mark_totp_verified(user.id)
        return await self._issue_session(user)

    async def login(self, email: str, code: str) -> tuple[AuthResponse, str]:
        self._check_rate_limit(email)
        user = self._require_user(await self.repo.get_by_email(email))

        if not user.totp_verified:
            raise AuthError("Account not enrolled yet — finish setup first")

        secret = self.totp.decrypt_secret(user.totp_secret)
        if not self.totp.verify(secret, code):
            raise AuthError("Invalid code")

        return await self._issue_session(user)

    async def refresh(self, email: str, candidate_refresh_tokens: list[str]) -> tuple[AuthResponse, str, str]:
        """Silent re-auth path: given the raw refresh tokens sitting in the
        browser's cookie (one per account that's ever logged in on this
        browser — see server.py's cookie helpers), find the one that belongs
        to `email` and is still valid, then rotate it for a fresh JWT.
        Tokens for OTHER accounts in the same cookie are left untouched.
        Returns (auth_response, matched_old_token, new_token) — the caller
        needs the old token back so it can swap it in place in the cookie
        rather than just appending, or the cap on tokens-per-cookie could
        eventually evict a different, still-valid account's session."""
        for raw_token in candidate_refresh_tokens:
            user_id = await self.sessions.get_valid_user_id(raw_token)
            if not user_id:
                continue
            user = await self.repo.get_by_id(user_id)
            if user and user.email == email.lower():
                auth_response, new_token = await self._issue_session(user, replacing=raw_token)
                return auth_response, raw_token, new_token

        raise AuthError("No active session for this account — please log in again")

    async def _issue_session(self, user: User, replacing: str | None = None) -> tuple[AuthResponse, str]:
        token = self.jwt.create_token(user.id, user.email)
        if replacing:
            refresh_token = await self.sessions.rotate(replacing, user.id, self._refresh_expiry_days)
        else:
            refresh_token = await self.sessions.create(user.id, self._refresh_expiry_days)
        return (
            AuthResponse(token=token, telegram_linked=bool(user.telegram_chat_id), email=user.email),
            refresh_token,
        )

    async def complete_setup(self, user_id: str, telegram_chat_id: str) -> None:
        ok = await self.notification_service.send_to(
            telegram_chat_id, "✅ You're linked — pixel opens will land here."
        )
        if not ok:
            raise AuthError("Couldn't reach that chat — message the bot first, then try again")
        await self.repo.set_telegram_chat_id(user_id, telegram_chat_id)

    def _require_user(self, user: User | None) -> User:
        if not user:
            raise AuthError("No account for that email — start enrollment first")
        return user

    def _check_rate_limit(self, email: str) -> None:
        if not self._attempt_limiter.allow(email.lower()):
            raise AuthError("Too many attempts — try again later")
