from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import io, base64, os, time, hashlib
from loguru import logger
from tenacity import retry, wait_exponential, stop_after_attempt
from PIL import Image
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import httpx
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse
from fastapi import Query, Request
from pillow_heif import register_heif_opener

# Register HEIF/HEIC opener for Pillow
register_heif_opener()

# Load environment variables from .env file
load_dotenv()

# ---- Config ----
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
THUMBNAIL_MAX_SIDE = int(os.getenv("THUMBNAIL_MAX_SIDE", "1024"))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,https://renamedriveimages.work").split(',')

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# ---- Startup logs ----
key_fingerprint = None
if GEMINI_API_KEY:
    try:
        key_fingerprint = hashlib.sha256(GEMINI_API_KEY.encode()).hexdigest()[:8]
    except Exception:
        key_fingerprint = "error"
logger.info(f"Backend starting. Gemini key configured={bool(GEMINI_API_KEY)} fingerprint={key_fingerprint}")
logger.info(f"THUMBNAIL_MAX_SIDE={THUMBNAIL_MAX_SIDE}")

# ---- Request logging middleware ----
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    try:
        response = await call_next(request)
        ms = int((time.time() - start) * 1000)
        logger.info(f"{request.method} {request.url.path} {response.status_code} {ms}ms")
        return response
    except Exception as e:
        ms = int((time.time() - start) * 1000)
        logger.exception(f"{request.method} {request.url.path} error after {ms}ms: {e}")
        raise

# ---- Models ----
class SearchReq(BaseModel):
    access_token: str
    search_query: str
    include_shared: bool = True
    max_results: int = 100

class ListReq(BaseModel):
    access_token: str
    folder_id: str
    include_shared: bool = True
    recursive: bool = False

class FileInfo(BaseModel):
    id: str
    name: str
    mimeType: str
    createdTime: Optional[str] = None
    parents: Optional[List[str]] = None

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

class DownloadReq(BaseModel):
    access_token: str
    file_id: str
    name: str

class ZipItem(BaseModel):
    id: str
    name: str

class ZipReq(BaseModel):
    access_token: str
    items: List[ZipItem]

# ---- Utils ----

def drive_client(access_token: str):
    from datetime import datetime, timedelta, timezone
    
    class NoRefreshCredentials(Credentials):
        def refresh(self, request):
            # Disable automatic refresh to prevent RefreshError
            # Since we're using short-lived access tokens from frontend, we don't want auto-refresh
            pass
    
    creds = NoRefreshCredentials(
        token=access_token,
        scopes=["https://www.googleapis.com/auth/drive"]
    )
    # Set expiry far in the future to prevent refresh triggers
    creds.expiry = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=24)
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
    try:
        image = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    except Exception as e:
        raise RuntimeError(f"Image decode failed: {e}")
    # Fail fast if key missing
    if not GEMINI_API_KEY:
        raise RuntimeError("Gemini API key not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY in backend environment.")
    image.thumbnail((THUMBNAIL_MAX_SIDE, THUMBNAIL_MAX_SIDE))
    buf = io.BytesIO()
    image.save(buf, format='JPEG', quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    # Preserve original extension if present and known
    ext = os.path.splitext(orig_name)[1].lower() or '.jpg'
    if ext not in ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp']:
        ext = '.jpg'

    prompt = (
        "You are a filename suggester. Return ONLY a filename (no quotes). Rules: "
        "lowercase, kebab-case, include yyyy-mm-dd (use provided createdTime if EXIF unknown), "
        f"1-2 salient subjects, ascii only, <=80 chars (base), keep extension {ext}. "
        f"createdTime={created_time} orig={orig_name}. Example: 2024-07-18-toronto-cn-tower-blue-hour{ext}"
    )

    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{
            "role": "user",
            "parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": "image/jpeg", "data": b64}}
            ]
        }]
    }
    params = {"key": GEMINI_API_KEY}
    logger.info(f"Calling Gemini for {orig_name} ext={ext} thumb={len(b64)}b key_fp={key_fingerprint}")
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers=headers, params=params, json=payload)
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            detail = None
            try:
                detail = r.json()
            except Exception:
                detail = r.text
            logger.error(f"Gemini HTTP {r.status_code} for {orig_name}: {detail}")
            if r.status_code == 401:
                raise RuntimeError("Gemini auth failed (401). Use a Google AI Studio Generative Language API key on the backend, not OAuth or other Google API keys.") from e
            raise RuntimeError(f"Gemini error {r.status_code}: {detail}") from e
        data = r.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        logger.info(f"Gemini suggested for {orig_name}: {text}")
        # sanitize and clamp
        if not text.endswith(ext):
            base = text.split('.')[0]
            text = base + ext
        name_no_ext = text[:-len(ext)]
        return clamp_name(name_no_ext, ext)

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

def get_all_folders_recursive(service, folder_id: str, include_shared: bool = True) -> List[str]:
    """Recursively get all folder IDs starting from a root folder"""
    all_folders = [folder_id]
    folders_to_process = [folder_id]
    
    while folders_to_process:
        current_folder = folders_to_process.pop(0)
        try:
            q = f"'{current_folder}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
            resp = service.files().list(
                q=q,
                fields="files(id,name)",
                includeItemsFromAllDrives=include_shared,
                supportsAllDrives=include_shared
            ).execute()
            
            subfolders = resp.get('files', [])
            for folder in subfolders:
                folder_id = folder['id']
                if folder_id not in all_folders:
                    all_folders.append(folder_id)
                    folders_to_process.append(folder_id)
        except HttpError as e:
            logger.warning(f"Error accessing folder {current_folder}: {e}")
            continue
    
    return all_folders

# ---- Routes ----
@app.get("/health")
def health():
    return {"ok": True, "gemini_key_configured": bool(GEMINI_API_KEY)}

@app.post("/search_images")
def search_images(req: SearchReq):
    """Search for images across Google Drive using a search query"""
    try:
        svc = drive_client(req.access_token)
        q = f"mimeType contains 'image/' and trashed = false"
        if req.search_query.strip():
            q += f" and (name contains '{req.search_query}' or fullText contains '{req.search_query}')"
        logger.info(f"search_images query='{req.search_query}' include_shared={req.include_shared} max={req.max_results}")
        files = []
        pageToken = None
        while len(files) < req.max_results:
            resp = svc.files().list(
                q=q,
                fields="nextPageToken, files(id,name,mimeType,createdTime,parents)",
                includeItemsFromAllDrives=req.include_shared,
                supportsAllDrives=req.include_shared,
                pageToken=pageToken,
                pageSize=min(100, req.max_results - len(files))
            ).execute()
            files.extend(resp.get('files', []))
            pageToken = resp.get('nextPageToken')
            if not pageToken or len(files) >= req.max_results:
                break
        logger.info(f"search_images found={len(files)}")
        return {"files": files[:req.max_results], "total_found": len(files)}
    except HttpError as e:
        logger.error(f"Drive error search_images: {e}")
        raise HTTPException(status_code=e.resp.status, detail=str(e))

@app.post("/list_images")
def list_images(req: ListReq):
    """List images in a specific folder, optionally recursively"""
    try:
        logger.info(f"list_images START folder={req.folder_id} recursive={req.recursive} include_shared={req.include_shared}")
        svc = drive_client(req.access_token)
        logger.info(f"list_images drive_client created successfully")
        
        if req.recursive:
            logger.info(f"list_images getting recursive folders")
            all_folders = get_all_folders_recursive(svc, req.folder_id, req.include_shared)
            logger.info(f"list_images found {len(all_folders)} folders recursively")
            folder_query = " or ".join([f"'{folder_id}' in parents" for folder_id in all_folders])
            q = f"({folder_query}) and mimeType contains 'image/' and trashed = false"
        else:
            q = f"'{req.folder_id}' in parents and mimeType contains 'image/' and trashed = false"
        
        logger.info(f"list_images query: {q}")
        files = []
        pageToken = None
        while True:
            logger.info(f"list_images calling files().list() pageToken={pageToken}")
            resp = svc.files().list(
                q=q,
                fields="nextPageToken, files(id,name,mimeType,createdTime,parents)",
                includeItemsFromAllDrives=req.include_shared,
                supportsAllDrives=req.include_shared,
                pageToken=pageToken
            ).execute()
            files.extend(resp.get('files', []))
            pageToken = resp.get('nextPageToken')
            if not pageToken:
                break
        logger.info(f"list_images returned={len(files)}")
        return {"files": files}
    except HttpError as e:
        logger.error(f"Drive error list_images: {e}")
        raise HTTPException(status_code=e.resp.status, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error list_images: {type(e).__name__}: {e}")
        import traceback
        logger.error(f"list_images traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

@app.post("/suggest_names")
async def suggest_names(req: SuggestReq):
    """Generate AI suggestions for image names"""
    svc = drive_client(req.access_token)
    out = []
    for f in req.files:
        try:
            img = await drive_download_image(svc, f.id)
            suggested = await gemini_name_for_image(img, f.createdTime or '', f.name)
            out.append({"id": f.id, "old_name": f.name, "suggested_name": suggested})
        except Exception as ex:
            logger.error(f"suggest_names failed for id={f.id} name={f.name}: {ex}")
            out.append({"id": f.id, "old_name": f.name, "error": str(ex)})
    return {"items": out}

@app.post("/rename")
def rename(req: RenameReq):
    """Bulk rename files"""
    svc = drive_client(req.access_token)
    results = []
    for it in req.items:
        try:
            resp = drive_update_name(svc, it.id, it.new_name, req.supports_all_drives)
            results.append({"id": it.id, "new_name": resp.get('name')})
        except HttpError as e:
            logger.error(f"rename failed for id={it.id}: {e}")
            results.append({"id": it.id, "error": f"{e.resp.status}: {e}"})
        except Exception as e:
            logger.error(f"rename failed for id={it.id}: {e}")
            results.append({"id": it.id, "error": str(e)})
    return {"results": results}

@app.get("/download")
def download(access_token: str = Query(...), id: str = Query(...), name: str = Query(...)):
    svc = drive_client(access_token)
    try:
        from googleapiclient.http import MediaIoBaseDownload
        req_media = svc.files().get_media(fileId=id)
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, req_media)
        done = False
        while not done:
            status, done = downloader.next_chunk()
        buf.seek(0)
        logger.info(f"download id={id} name={name} size={buf.getbuffer().nbytes}")
        return StreamingResponse(buf, media_type='application/octet-stream', headers={
            'Content-Disposition': f"attachment; filename=\"{name}\""
        })
    except HttpError as e:
        logger.error(f"download failed id={id}: {e}")
        raise HTTPException(status_code=e.resp.status, detail=str(e))

@app.post("/download_zip")
def download_zip(req: ZipReq):
    svc = drive_client(req.access_token)
    try:
        import zipfile
        def iter_zip():
            mem = io.BytesIO()
            with zipfile.ZipFile(mem, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
                for it in req.items:
                    try:
                        from googleapiclient.http import MediaIoBaseDownload
                        buf = io.BytesIO()
                        downloader = MediaIoBaseDownload(buf, svc.files().get_media(fileId=it.id))
                        done = False
                        while not done:
                            status, done = downloader.next_chunk()
                        buf.seek(0)
                        zf.writestr(it.name, buf.read())
                    except Exception as e:
                        logger.error(f"zip add failed for {it.id}: {e}")
                        zf.writestr(f"ERROR_{it.name}.txt", str(e))
            mem.seek(0)
            yield from mem.getbuffer()
        headers = { 'Content-Disposition': 'attachment; filename="renamed-images.zip"' }
        return StreamingResponse(iter_zip(), media_type='application/zip', headers=headers)
    except HttpError as e:
        logger.error(f"download_zip failed: {e}")
        raise HTTPException(status_code=e.resp.status, detail=str(e))
