import app.supabase_client as supabase_client
from app.models.models import EmailRecord


class EmailRepository:

    TABLE = "mail_sends"

    async def insert(self, record: EmailRecord):
        # Plain insert, not upsert: `id` is client-supplied (the extension's
        # crypto.randomUUID()), so upserting would let anyone who POSTs a
        # UUID that already belongs to another user's row silently overwrite
        # its owner. A genuine conflict here (retry, or an actual collision)
        # surfaces as an error instead of a silent cross-tenant hijack.
        response = await supabase_client.supabase.table(self.TABLE).insert(record.model_dump(mode="json")).execute()
        return response.data

    async def get_mail_metadata_by_id(self, id: str):
        response = await supabase_client.supabase.table(self.TABLE).select("*").eq("id", id).execute()
        return response.data

    async def log_mail_open_by_id(
        self,
        mail_send_id: str,
        ip_hash: str | None = None,
        user_agent: str | None = None,
    ):
        response = await supabase_client.supabase.rpc(
            "log_mail_open_by_id",
            {
                "p_mail_send_id": mail_send_id,
                "p_ip_hash": ip_hash,
                "p_user_agent": user_agent,
                "p_store_raw_hit": True,
            },
        ).execute()
        return response.data
