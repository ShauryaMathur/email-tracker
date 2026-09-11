import app.supabase_client as supabase_client
from app.models.user_models import User


class UserRepository:

    TABLE = "users"

    async def get_by_email(self, email: str) -> User | None:
        response = (
            await supabase_client.supabase.table(self.TABLE)
            .select("*")
            .eq("email", email.lower())
            .limit(1)
            .execute()
        )
        return User(**response.data[0]) if response.data else None

    async def get_by_id(self, user_id: str) -> User | None:
        response = (
            await supabase_client.supabase.table(self.TABLE)
            .select("*")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        return User(**response.data[0]) if response.data else None

    async def create(self, email: str, encrypted_totp_secret: str) -> User:
        response = (
            await supabase_client.supabase.table(self.TABLE)
            .insert(
                {
                    "email": email.lower(),
                    "totp_secret": encrypted_totp_secret,
                    "totp_verified": False,
                }
            )
            .execute()
        )
        return User(**response.data[0])

    async def mark_totp_verified(self, user_id: str) -> None:
        await (
            supabase_client.supabase.table(self.TABLE)
            .update({"totp_verified": True})
            .eq("id", user_id)
            .execute()
        )

    async def set_telegram_chat_id(self, user_id: str, chat_id: str) -> None:
        await (
            supabase_client.supabase.table(self.TABLE)
            .update({"telegram_chat_id": chat_id})
            .eq("id", user_id)
            .execute()
        )
