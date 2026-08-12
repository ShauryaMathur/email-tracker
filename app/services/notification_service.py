import logging

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, settings: Settings):
        self.chat_id = settings.chat_id
        self.bot_token = settings.bot_token

    async def notify(self, uuid: str, to_email: str | None, subject: str | None):
        await self._send(
            f"📬 Email sent to {to_email or 'unknown'} titled {subject or 'unknown'} opened",
            log_extra={"uuid": uuid},
        )

    async def send_alert(self, text: str):
        """Freeform ops alert (e.g. Supabase health transitions), reusing the same bot/chat."""
        await self._send(text)

    async def _send(self, text: str, log_extra: dict | None = None):
        if not self.chat_id or not self.bot_token:
            logger.warning("Telegram config missing; skipping notification")
            return

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        async with httpx.AsyncClient() as client:
            await client.post(url, json={
                "chat_id": self.chat_id,
                "text": text,
            })
        logger.info("Telegram notification sent", extra=log_extra or {})
