from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware

import base64
import datetime
import requests


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow Gmail / any website
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EMAILS = {}

# 1x1 transparent PNG
PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
)

BOT_TOKEN = "8522230167:AAGAYR7f8lZUammixvsPeZk4BhygYSzH3JI"
CHAT_ID = "1308183390"

def notify(uuid: str):
    print('[TrackerExt] Notifying...')
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    email = EMAILS.get(uuid)
    print(email)
    requests.post(url, json={
        "chat_id": CHAT_ID,
        "text": f"📬 Email sent to {email['to']} titled {email['subject']} opened"
    })

@app.get("/health")
async def health():
    print("OK")
    return {"status": "ok"}

@app.get("/track/{uuid}")
async def track(uuid: str, request: Request):
    ip = request.client.host
    ua = request.headers.get("user-agent")
    email_id = EMAILS.get(uuid)

    print({
        "email_id": email_id,
        "ip": ip,
        "user_agent": ua,
        "time": datetime.datetime.utcnow()
    })

    if email_id:
        EMAILS[uuid]["opened"] = True
        notify(uuid)

    return Response(content=PIXEL, media_type="image/png")


@app.post("/register")
def register(data: dict):
    EMAILS[data["uuid"]] = {
        "subject": data["subject"],
        "to": data["to"],
        "opened": False
    }
    return {"ok": True}
