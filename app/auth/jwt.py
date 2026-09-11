import datetime

import jwt

from app.core.config import Settings

ALGORITHM = "HS256"


class JWTManager:
    def __init__(self, settings: Settings):
        self._secret = settings.jwt_secret
        self._expiry_days = settings.jwt_expiry_days

    def create_token(self, user_id: str, email: str) -> str:
        now = datetime.datetime.now(datetime.timezone.utc)
        payload = {
            "sub": user_id,
            "email": email,
            "iat": now,
            "exp": now + datetime.timedelta(days=self._expiry_days),
        }
        return jwt.encode(payload, self._secret, algorithm=ALGORITHM)

    def decode_token(self, token: str) -> dict:
        # Raises jwt.ExpiredSignatureError / jwt.InvalidTokenError on failure —
        # callers (see app/auth/dependencies.py) turn those into 401s.
        return jwt.decode(token, self._secret, algorithms=[ALGORITHM])
