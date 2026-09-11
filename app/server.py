from contextlib import asynccontextmanager
from pathlib import Path
import base64
import datetime
import hashlib
import logging

from fastapi import Depends, FastAPI, HTTPException, Response, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.auth.dependencies import get_current_user
from app.core.config import get_settings
from app.models.models import RegisterEmail
from app.models.user_models import (
    AuthStartRequest,
    AuthStartResponse,
    AuthResponse,
    CompleteSetupRequest,
    CurrentUser,
    LoginRequest,
    VerifyEnrollRequest,
)
from app.repository.user_repo import UserRepository
from app.services.health_service import HealthService
from app.services.mail_service import EmailService
from app.services.notification_service import NotificationService
from app.services.user_service import AuthError, UserService
from app.supabase_client import init_supabase

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent / "static"

settings = get_settings()
email_service = EmailService()
notification_service = NotificationService(settings=settings)
health_service = HealthService()
user_repo = UserRepository()
user_service = UserService(settings=settings, notification_service=notification_service)

# 1x1 transparent PNG
PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_supabase(settings)
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    result = await health_service.check()

    if result.transitioned_down:
        logger.warning("health: supabase went down")
        await notification_service.send_alert(
            "🔴 Supabase looks unreachable from the backend. "
            "Tracking opens will fail until it's back — wake it up manually."
        )
    elif result.transitioned_up:
        logger.info("health: supabase recovered", extra={"down_duration_seconds": result.down_duration_seconds})
        down_for = ""
        if result.down_duration_seconds is not None:
            down_for = f" (was down for ~{round(result.down_duration_seconds / 60, 1)} min)"
        await notification_service.send_alert(f"✅ Supabase is back up{down_for}.")

    return {
        "status": "ok",
        "supabase": "up" if result.supabase_up else "down",
    }


@app.get("/track/{uuid}")
async def track(uuid: str, request: Request, viewer: str | None = Query(default=None)):
    if viewer == "sender":
        logger.info("track: skipped sender_view", extra={"uuid": uuid})
        return Response(content=PIXEL, media_type="image/png")

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    ip_hash = hashlib.sha256(ip.encode("utf-8")).hexdigest() if ip else None

    open_log = await email_service.log_mail_open_by_id(
        id=uuid,
        ip_hash=ip_hash,
        user_agent=ua,
    )

    was_counted = open_log.get("was_counted") if open_log else False
    logger.info("track", extra={"uuid": uuid, "was_counted": was_counted, "ip_hash": ip_hash})

    if was_counted:
        # Falls back to a DB fetch (and repopulates the cache) if this uuid
        # isn't in the in-memory cache — e.g. after a Render free-tier
        # cold restart wipes it. A raw cache.get() here would silently drop
        # the notification for anyone whose open lands after such a restart.
        email = await email_service.get_mail_metadata_by_id(uuid)
        if email:
            owner = await user_repo.get_by_id(email.user_id)
            chat_id = owner.telegram_chat_id if owner else None
            owner_email = owner.email if owner else None
            await notification_service.notify(uuid, owner_email, email.to_email, email.subject, chat_id=chat_id)

    return Response(content=PIXEL, media_type="image/png")


@app.post("/register")
async def register(payload: RegisterEmail, current_user: CurrentUser = Depends(get_current_user)):
    data = await email_service.create_email(payload, user_id=current_user.id)
    return {"ok": True, "data": data}


@app.get("/getMailMetadata/{id}")
async def get_mail_metadata_by_id(id: str, current_user: CurrentUser = Depends(get_current_user)):
    data = await email_service.get_mail_metadata_by_id(id)
    if not data or data.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")
    return data


@app.get("/setup")
async def setup_page():
    return FileResponse(STATIC_DIR / "setup.html")


@app.get("/auth/telegram-info")
async def auth_telegram_info():
    return {"bot_username": settings.telegram_bot_username}


@app.post("/auth/start", response_model=AuthStartResponse)
async def auth_start(payload: AuthStartRequest):
    return await user_service.start(payload.email)


@app.post("/auth/verify-enroll", response_model=AuthResponse)
async def auth_verify_enroll(payload: VerifyEnrollRequest):
    try:
        return await user_service.verify_enroll(payload.email, payload.code)
    except AuthError as e:
        raise HTTPException(status_code=400, detail=e.message)


@app.post("/auth/login", response_model=AuthResponse)
async def auth_login(payload: LoginRequest):
    try:
        return await user_service.login(payload.email, payload.code)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=e.message)


@app.post("/auth/complete-setup")
async def auth_complete_setup(
    payload: CompleteSetupRequest, current_user: CurrentUser = Depends(get_current_user)
):
    try:
        await user_service.complete_setup(current_user.id, payload.telegram_chat_id)
    except AuthError as e:
        raise HTTPException(status_code=400, detail=e.message)
    return {"ok": True}


@app.post("/telegram/webhook")
async def telegram_webhook(update: dict, request: Request):
    # Telegram itself is the only caller — there's no user session on this
    # path, so a shared secret (set once via setWebhook's secret_token) is
    # the only thing stopping randoms on the internet from making our bot
    # spam arbitrary chat_ids using our Telegram API quota.
    if settings.telegram_webhook_secret:
        header = request.headers.get("x-telegram-bot-api-secret-token")
        if header != settings.telegram_webhook_secret:
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    message = update.get("message") or update.get("edited_message")
    chat_id = message.get("chat", {}).get("id") if message else None
    if chat_id is None:
        # Not a plain text message we care about (e.g. a reaction, a
        # channel post) — Telegram still expects a 200 or it'll retry.
        return {"ok": True}

    await notification_service.send_to(
        str(chat_id),
        "Your Telegram Chat ID is:\n"
        f"{chat_id}\n\n"
        "Paste this into the Email Tracker setup page to finish linking your account.",
    )
    return {"ok": True}
