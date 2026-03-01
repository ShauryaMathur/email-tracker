from app.repository.email_repo import EmailRepository
from app.models.models import RegisterEmail,EmailRecord
from cachetools import TTLCache
from typing import Any

cache = TTLCache(maxsize=10000, ttl=7 * 24 * 60 * 60)

class EmailService:

    def __init__(self):
        self.repo = EmailRepository()
        self.cache = cache

    async def create_email(self, registerEmailDTO: RegisterEmail):
        emailRecord = EmailRecord(
            id = str(registerEmailDTO.uuid),
            subject = registerEmailDTO.subject,
            to_email = registerEmailDTO.to
        )
        data = await self.repo.insert(emailRecord)
        email_metadata = EmailRecord(**data[0])
        self.cache[email_metadata.id] = email_metadata
        return self.cache[email_metadata.id]

    async def list_emails(self):
        return await self.repo.get_all()
    
    async def get_mail_metadata_by_id(self, id: str) -> EmailRecord:
        if id in self.cache:
            return self.cache[id]
        data = await self.repo.get_mail_metadata_by_id(id)
        email_metadata = EmailRecord(**data[0])
        self.cache[email_metadata.id] = email_metadata
        return self.cache[email_metadata.id]

    async def log_mail_open_by_id(self, id: str, ip_hash: str | None, user_agent: str | None) -> dict[str, Any] | None:
        data = await self.repo.log_mail_open_by_id(
            mail_send_id=id,
            ip_hash=ip_hash,
            user_agent=user_agent,
            store_raw_hit=True,
        )
        if not data:
            return None

        rpc_result = data[0]
        if rpc_result.get("was_counted"):
            cached_email = self.cache.get(id)
            if cached_email:
                cached_email.opened_count = rpc_result.get("open_count", cached_email.opened_count)
                cached_email.first_opened_at = rpc_result.get("first_opened_at", cached_email.first_opened_at)
                cached_email.last_opened_at = rpc_result.get("last_opened_at", cached_email.last_opened_at)
                self.cache[id] = cached_email

        return rpc_result
