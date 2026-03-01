from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.services.mail_service import EmailService
from app.services.notification_service import NotificationService
from app.supabase_client import init_supabase
import base64
import datetime
import hashlib
from app.models.models import RegisterEmail

settings = get_settings()
app = FastAPI()
email_service = EmailService()
notification_service = NotificationService(settings=settings)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow Gmail / any website
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.on_event("startup") 
async def startup_event(): 
    await init_supabase(settings)

# 1x1 transparent PNG
PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
)

@app.get("/health")
async def health():
    print("OK")
    return {"status": "ok"}

@app.get("/track/{uuid}")
async def track(uuid: str, request: Request):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    ip_hash = hashlib.sha256(ip.encode("utf-8")).hexdigest() if ip else None
    
    open_log = await email_service.log_mail_open_by_id(
        id=uuid,
        ip_hash=ip_hash,
        user_agent=ua,
    )

    print({
        "mail_send_id": uuid,
        "was_counted": open_log.get("was_counted") if open_log else False,
        "ip_hash": ip_hash,
        "user_agent": ua,
        "time": datetime.datetime.utcnow()
    })

    if open_log and open_log.get("was_counted"):
        email = email_service.cache.get(uuid)

        if email:
            await notification_service.notify(uuid, email.to_email, email.subject)

    return Response(content=PIXEL, media_type="image/png")


@app.post("/register")
async def register(payload: RegisterEmail):
    print(payload)
    data = await email_service.create_email(payload)
    
    return {"ok": True, "data": data}

@app.get("/getMailMetadata/{id}")
async def get_mail_metadata_by_id(id: str):
    data = await email_service.get_mail_metadata_by_id(id)
    return data
