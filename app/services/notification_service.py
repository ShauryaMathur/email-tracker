import requests
from app.core.config import Settings

class NotificationService:
    def __init__(self, settings: Settings):
        self.chat_id = settings.chat_id
        self.bot_token = settings.bot_token
    
    async def notify(self, uuid: str, to_email: str | None, subject: str | None):
        if not self.chat_id or not self.bot_token:
            print("[TrackerExt] Telegram config missing; skipping notification")
            return

        print('[TrackerExt] Notifying...')
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        requests.post(url, json={
            "chat_id": self.chat_id,
            "text": f"📬 Email sent to {to_email or 'unknown'} titled {subject or 'unknown'} opened"
        })
