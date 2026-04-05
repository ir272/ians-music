import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, UploadFile

router = APIRouter(prefix="/api/settings", tags=["settings"])

_COOKIE_FILE_PATH = os.getenv("COOKIE_FILE_PATH", "/data/yt_cookies.txt")


def _resolve_cookie_path() -> str:
    """Return the configured cookie file path, falling back to a local path
    when the /data volume is not available (e.g. local development)."""
    path = _COOKIE_FILE_PATH
    parent = os.path.dirname(path) or "."
    if not os.path.isdir(parent):
        local = os.path.join(os.getcwd(), "yt_cookies.txt")
        return local
    return path


@router.get("/cookies")
async def get_cookie_status() -> dict:
    path = _resolve_cookie_path()
    if os.path.isfile(path):
        mtime = os.path.getmtime(path)
        updated_at = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        size = os.path.getsize(path)
        return {"is_set": True, "updated_at": updated_at, "size_bytes": size}
    return {"is_set": False, "updated_at": None, "size_bytes": 0}


@router.post("/cookies")
async def upload_cookies(file: UploadFile) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Basic sanity-check: Netscape cookie files start with "# Netscape HTTP Cookie File"
    first_line = content.split(b"\n")[0].strip()
    if not first_line.startswith(b"#"):
        raise HTTPException(
            status_code=400,
            detail="File does not look like a Netscape cookie file. Export using a browser extension like 'Get cookies.txt LOCALLY'.",
        )

    path = _resolve_cookie_path()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)

    with open(path, "wb") as f:
        f.write(content)

    return {"ok": True, "path": path, "size_bytes": len(content)}


@router.delete("/cookies")
async def delete_cookies() -> dict:
    path = _resolve_cookie_path()
    if os.path.isfile(path):
        os.remove(path)
        return {"ok": True}
    raise HTTPException(status_code=404, detail="No cookie file is configured")
