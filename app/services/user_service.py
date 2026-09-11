import logging

from app.auth.jwt import JWTManager
from app.auth.totp import TOTPManager
from app.core.config import Settings
from app.core.rate_limit import RateLimiter
from app.models.user_models import AuthResponse, AuthStartResponse, User
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
        self.totp = TOTPManager(settings)
        self.jwt = JWTManager(settings)
        self.notification_service = notification_service
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

    async def verify_enroll(self, email: str, code: str) -> AuthResponse:
        self._check_rate_limit(email)
        user = self._require_user(await self.repo.get_by_email(email))

        secret = self.totp.decrypt_secret(user.totp_secret)
        if not self.totp.verify(secret, code):
            raise AuthError("Invalid code")

        await self.repo.mark_totp_verified(user.id)
        token = self.jwt.create_token(user.id, user.email)
        return AuthResponse(token=token, telegram_linked=bool(user.telegram_chat_id))

    async def login(self, email: str, code: str) -> AuthResponse:
        self._check_rate_limit(email)
        user = self._require_user(await self.repo.get_by_email(email))

        if not user.totp_verified:
            raise AuthError("Account not enrolled yet — finish setup first")

        secret = self.totp.decrypt_secret(user.totp_secret)
        if not self.totp.verify(secret, code):
            raise AuthError("Invalid code")

        token = self.jwt.create_token(user.id, user.email)
        return AuthResponse(token=token, telegram_linked=bool(user.telegram_chat_id))

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
