from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

@app.post("/ingest/emlx")
def api_ingest_emlx(payload: str | dict = Body(...)):
    if isinstance(payload, str):
        path = payload
        limit = None
    else:
        path = payload.get("path") if payload else None
        limit = payload.get("limit") if payload else None
    if not path:
        raise HTTPException(status_code=400, detail="path is required")
    return ingest_emlx_folder(path, limit=limit)

@app.get("/progress")
def api_progress():
    return get_progress()

@app.get("/emails")
def api_emails(limit: int = 50):
    from db.connection import connect
    con = connect(); cur = con.cursor()
    cur.execute("""SELECT id, date_ts, from_email, subject, snippet
                   FROM emails ORDER BY date_ts DESC, id DESC LIMIT ?""", (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    con.close(); return rows
