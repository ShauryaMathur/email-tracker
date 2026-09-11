import logging

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, settings: Settings):
        # This is the ops/admin channel only (e.g. Supabase health alerts) —
        # per-user "your email was opened" notifications go to each user's own
        # telegram_chat_id (see notify()), never here.
        self.ops_chat_id = settings.admin_chat_id
        self.bot_token = settings.bot_token

    async def notify(
        self,
        uuid: str,
        owner_email: str | None,
        to_email: str | None,
        subject: str | None,
        chat_id: str | None,
    ):
        if not chat_id:
            logger.warning("notify: no telegram chat linked for this email's owner; skipping", extra={"uuid": uuid})
            return
        # Prefix which inbox this is — needed once the same person links more
        # than one email identity to the same Telegram chat (a single bot
        # can only ever have one chat thread per person, so this is how they
        # tell accounts apart rather than needing a separate bot per inbox).
        inbox_line = f"Inbox: {owner_email}\n" if owner_email else ""
        await self._send(
            chat_id,
            f"{inbox_line}📬 Email sent to {to_email or 'unknown'} titled {subject or 'unknown'} opened",
            log_extra={"uuid": uuid},
        )

    async def send_alert(self, text: str):
        """Freeform ops alert (e.g. Supabase health transitions) to the admin chat."""
        if not self.ops_chat_id:
            logger.warning("Telegram ops chat not configured; skipping alert")
            return
        await self._send(self.ops_chat_id, text)

    async def send_to(self, chat_id: str, text: str) -> bool:
        """Direct send to an arbitrary chat id. Used to validate a user-supplied
        chat_id during /auth/complete-setup — a failed send means the user
        hasn't messaged the bot yet (or mistyped the id)."""
        return await self._send(chat_id, text)

    async def _send(self, chat_id: str, text: str, log_extra: dict | None = None) -> bool:
        if not self.bot_token:
            logger.warning("Telegram bot token missing; skipping notification")
            return False

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json={"chat_id": chat_id, "text": text})
                response.raise_for_status()
        except httpx.HTTPError:
            logger.exception("Telegram send failed", extra=log_extra or {})
            return False

        logger.info("Telegram notification sent", extra=log_extra or {})
        return True
