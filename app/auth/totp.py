import base64
import io

import pyotp
import qrcode
from qrcode.image.pure import PyPNGImage
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import Settings


class TOTPManager:
    """TOTP secret lifecycle: generation, at-rest encryption, and verification.

    Secrets are stored in the DB only as Fernet ciphertext (settings.fernet_key)
    — never write a plaintext secret to `users.totp_secret`.
    """

    def __init__(self, settings: Settings):
        self._fernet = Fernet(settings.fernet_key.encode("utf-8"))
        self.issuer = settings.totp_issuer

    def generate_secret(self) -> str:
        return pyotp.random_base32()

    def encrypt_secret(self, secret: str) -> str:
        return self._fernet.encrypt(secret.encode("utf-8")).decode("utf-8")

    def decrypt_secret(self, encrypted_secret: str) -> str:
        try:
            return self._fernet.decrypt(encrypted_secret.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise ValueError("Stored TOTP secret could not be decrypted") from exc

    def provisioning_uri(self, secret: str, email: str) -> str:
        return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=self.issuer)

    def qr_data_uri(self, provisioning_uri: str) -> str:
        """Render the provisioning URI as a QR PNG, inline as a data: URI.

        Rendered server-side (not via a client-side JS lib) so the raw TOTP
        secret never has to travel through a URL or third-party script.
        """
        image = qrcode.make(provisioning_uri, image_factory=PyPNGImage)
        buf = io.BytesIO()
        image.save(buf)
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{encoded}"

    def verify(self, secret: str, code: str) -> bool:
        # valid_window=1 tolerates +/- one 30s step of clock skew.
        return pyotp.TOTP(secret).verify(code, valid_window=1)
