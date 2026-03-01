from supabase import create_async_client, AsyncClient
from app.core.config import Settings

supabase: AsyncClient | None = None

async def init_supabase(settings: Settings):
    print('Initializing Supabase...')
    global supabase
    supabase = await create_async_client(
        settings.supabase_url,
        settings.supabase_key,
    )
