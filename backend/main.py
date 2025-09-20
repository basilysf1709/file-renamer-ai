from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import io, base64, os
from loguru import logger
from tenacity import retry, wait_exponential, stop_after_attempt
from PIL import Image
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import httpx

# ---- Config ----
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
THUMBNAIL_MAX_SIDE = int(os.getenv("THUMBNAIL_MAX_SIDE", "1024"))

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# ---- Models ----
class ListReq(BaseModel):
    access_token: str
    folder_id: str
    include_shared: bool = True

class FileInfo(BaseModel):
    id: str
    name: str
    mimeType: str
    createdTime: Optional[str] = None

class SuggestReq(BaseModel):
    access_token: str
    files: List[FileInfo]

class RenameItem(BaseModel):
    id: str
    new_name: str

class RenameReq(BaseModel):
    access_token: str
    items: List[RenameItem]
    supports_all_drives: bool = True

# ---- Utils ----

def drive_client(access_token: str):
    creds = Credentials(token=access_token)
    return build("drive", "v3", credentials=creds, cache_discovery=False)

@retry(wait=wait_exponential(multiplier=0.5, min=1, max=8), stop=stop_after_attempt(5))
def drive_update_name(service, file_id: str, new_name: str, supports_all: bool=True):
    return service.files().update(
        fileId=file_id,
        supportsAllDrives=supports_all,
        body={"name": new_name}
    ).execute()

def clamp_name(base: str, ext: str) -> str:
    # Keep total <= 80 char (excluding dot)
    base = base[:80]
    safe = ''.join(ch if ch.isalnum() or ch in ['-'] else '-' for ch in base.lower())
    while '--' in safe:
        safe = safe.replace('--','-')
    safe = safe.strip('-') or 'image'
    return f"{safe}{ext}"

async def gemini_name_for_image(img_bytes: bytes, created_time: str, orig_name: str) -> str:
    # Reduce size for token & speed
    image = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    image.thumbnail((THUMBNAIL_MAX_SIDE, THUMBNAIL_MAX_SIDE))
    buf = io.BytesIO()
    image.save(buf, format='JPEG', quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    prompt = (
        "You are a filename suggester. Return ONLY a filename (no quotes). Rules: "
        "lowercase, kebab-case, include yyyy-mm-dd (use provided createdTime if EXIF unknown), "
        "1-2 salient subjects, ascii only, <=80 chars (base), keep extension .jpg. "
        f"createdTime={created_time} orig={orig_name}. Example: 2024-07-18-toronto-cn-tower-blue-hour.jpg"
    )

    # Minimal Gemini (REST) call to gemini-1.5-flash with inline image
    # Note: Can swap to official SDK; keeping REST avoids extra deps.
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": "image/jpeg", "data": b64}}
            ]
        }]
    }
    params = {"key": GEMINI_API_KEY}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers=headers, params=params, json=payload)
        r.raise_for_status()
        data = r.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        # sanitize and clamp
        if not text.endswith('.jpg'):
            text = text.split('.')[0] + '.jpg'
        name_no_ext = text[:-4]
        return clamp_name(name_no_ext, '.jpg')

async def drive_download_image(service, file_id: str) -> bytes:
    # Simple download
    req = service.files().get_media(fileId=file_id)
    from googleapiclient.http import MediaIoBaseDownload
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, req)
    done = False
    while not done:
        status, done = downloader.next_chunk()
    return buf.getvalue()

# ---- Routes ----
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/list_images")
def list_images(req: ListReq):
    try:
        svc = drive_client(req.access_token)
        q = f"'{req.folder_id}' in parents and mimeType contains 'image/' and trashed = false"
        files = []
        pageToken = None
        while True:
            resp = svc.files().list(
                q=q,
                fields="nextPageToken, files(id,name,mimeType,createdTime)",
                includeItemsFromAllDrives=req.include_shared,
                supportsAllDrives=req.include_shared,
                pageToken=pageToken
            ).execute()
            files.extend(resp.get('files', []))
            pageToken = resp.get('nextPageToken')
            if not pageToken:
                break
        return {"files": files}
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))

@app.post("/suggest_names")
async def suggest_names(req: SuggestReq):
    svc = drive_client(req.access_token)
    out = []
    for f in req.files:
        try:
            # download & generate suggestion
            img = await drive_download_image(svc, f.id)
            suggested = await gemini_name_for_image(img, f.createdTime or '', f.name)
            out.append({"id": f.id, "old_name": f.name, "suggested_name": suggested})
        except Exception as ex:
            out.append({"id": f.id, "old_name": f.name, "error": str(ex)})
    return {"items": out}

@app.post("/rename")
def rename(req: RenameReq):
    svc = drive_client(req.access_token)
    results = []
    for it in req.items:
        try:
            resp = drive_update_name(svc, it.id, it.new_name, req.supports_all_drives)
            results.append({"id": it.id, "new_name": resp.get('name')})
        except HttpError as e:
            results.append({"id": it.id, "error": f"{e.resp.status}: {e}"})
        except Exception as e:
            results.append({"id": it.id, "error": str(e)})
    return {"results": results}
