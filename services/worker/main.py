from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ingest.runner import start_emlx, cancel_running, is_running
from db.init_db import init_db
from ingest.emlx import ingest_emlx_folder
from utils.progress import get as get_progress

app = FastAPI()

# allow the Vite dev server origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "MailLens Worker running!"}

@app.post("/db/init")
def api_init_db():
    init_db()
    return {"ok": True}

class IngestRequest(BaseModel):
    source: str  # "emlx" | "mbox" | ...
    path: str

@app.post("/ingest/start")
def api_ingest_start(req: IngestRequest):
    if req.source != "emlx":
        raise HTTPException(status_code=400, detail="unsupported_source")
    try:
        start_emlx(req.path)
        return {"ok": True, "status": "started"}
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))

@app.get("/progress")
def api_progress():
    snapshot = get_progress()
    status = snapshot.get("status")
    if status in {"done", "cancelled", "error"}:
        running_flag = False
    else:
        running_flag = is_running()
    snapshot["running"] = running_flag
    return snapshot

@app.post("/cancel")
def api_cancel():
    if not is_running():
        return {"ok": False, "status": "idle"}
    cancel_running()
    return {"ok": True, "status": "cancelling"}

@app.get("/stats")
def api_stats():
    from db.connection import connect
    con = connect(); cur = con.cursor()
    cur.execute("SELECT COUNT(*) FROM emails")
    total = cur.fetchone()[0]

    def _safe_count(col, val=1):
        try:
            cur.execute(f"SELECT COUNT(*) FROM emails WHERE {col}=?", (val,))
            return cur.fetchone()[0]
        except Exception:
            return 0

    flagged = _safe_count("is_flagged")
    unread  = _safe_count("is_read", 0)
    junk    = _safe_count("is_junk", 1)

    cur.execute("SELECT COUNT(DISTINCT from_email) FROM emails WHERE from_email IS NOT NULL AND from_email <> ''")
    unique_senders = cur.fetchone()[0]

    cur.execute("SELECT MAX(date_ts) FROM emails")
    latest_ts = cur.fetchone()[0]

    con.close()
    return {
        "total": total,
        "flagged": flagged,
        "unread": unread,
        "junk": junk,
        "unique_senders": unique_senders,
        "latest_ts": latest_ts,
    }

@app.get("/emails")
def api_emails(limit: int = 50):
    from db.connection import connect
    con = connect(); cur = con.cursor()
    cur.execute("""SELECT id, date_ts, from_email, subject, snippet
                   FROM emails ORDER BY date_ts DESC, id DESC LIMIT ?""", (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    con.close(); return rows
