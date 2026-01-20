from fastapi import FastAPI, Response, Request
import base64
import datetime

app = FastAPI()

# 1x1 transparent PNG
PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
)

@app.get("/health")
async def health():
    print("OK")
    return {"status": "ok"}

@app.get("/track/{email_id}")
async def track(email_id: str, request: Request):
    ip = request.client.host
    ua = request.headers.get("user-agent")

    print({
        "email_id": email_id,
        "ip": ip,
        "user_agent": ua,
        "time": datetime.datetime.utcnow()
    })

    return Response(content=PIXEL, media_type="image/png")
