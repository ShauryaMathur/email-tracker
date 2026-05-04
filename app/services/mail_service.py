from typing import Any

from cachetools import TTLCache

from app.models.models import EmailRecord, RegisterEmail
from app.repository.email_repo import EmailRepository

_cache: TTLCache = TTLCache(maxsize=10000, ttl=7 * 24 * 60 * 60)


class EmailService:

    def __init__(self):
        self.repo = EmailRepository()
        self.cache = _cache

    async def create_email(self, payload: RegisterEmail) -> EmailRecord:
        record = EmailRecord(
            id=str(payload.uuid),
            subject=payload.subject,
            to_email=payload.to,
        )
        data = await self.repo.insert(record)
        saved = EmailRecord(**data[0])
        self.cache[saved.id] = saved
        return saved

    async def get_mail_metadata_by_id(self, id: str) -> EmailRecord | None:
        if id in self.cache:
            return self.cache[id]
        data = await self.repo.get_mail_metadata_by_id(id)
        if not data:
            return None
        record = EmailRecord(**data[0])
        self.cache[record.id] = record
        return record

    async def log_mail_open_by_id(
        self, id: str, ip_hash: str | None, user_agent: str | None
    ) -> dict[str, Any] | None:
        data = await self.repo.log_mail_open_by_id(
            mail_send_id=id,
            ip_hash=ip_hash,
            user_agent=user_agent,
        )
        if not data:
            return None

        rpc_result = data[0]
        if rpc_result.get("was_counted"):
            record = self.cache.get(id) or await self.get_mail_metadata_by_id(id)
            if record:
                record.opened_count = rpc_result.get("open_count", record.opened_count)
                record.first_opened_at = rpc_result.get("first_opened_at", record.first_opened_at)
                record.last_opened_at = rpc_result.get("last_opened_at", record.last_opened_at)
                self.cache[id] = record

        return rpc_result
