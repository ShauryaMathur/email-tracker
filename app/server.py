from contextlib import asynccontextmanager
import base64
import datetime
import hashlib
import logging

from fastapi import FastAPI, Response, Request, Query
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.models.models import RegisterEmail
from app.services.mail_service import EmailService
from app.services.notification_service import NotificationService
from app.supabase_client import init_supabase

logger = logging.getLogger(__name__)

settings = get_settings()
email_service = EmailService()
notification_service = NotificationService(settings=settings)

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
    return {"status": "ok"}


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
        email = email_service.cache.get(uuid)
        if email:
            await notification_service.notify(uuid, email.to_email, email.subject)

    return Response(content=PIXEL, media_type="image/png")


@app.post("/register")
async def register(payload: RegisterEmail):
    data = await email_service.create_email(payload)
    return {"ok": True, "data": data}


@app.get("/getMailMetadata/{id}")
async def get_mail_metadata_by_id(id: str):
    data = await email_service.get_mail_metadata_by_id(id)
    return data
