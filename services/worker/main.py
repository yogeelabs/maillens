import json
import time

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ingest.runner import start_emlx, cancel_running, is_running
from db.init_db import init_db
from ingest.emlx import ingest_emlx_folder
from utils.progress import get as get_progress
from typing import List, Optional

SECONDS_IN_DAY = 86400
DEFAULT_DORMANT_INACTIVE_DAYS = 365

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


@app.get("/insights/senders/first-time")
def api_insights_first_time_senders(limit: int = 50):
    from db.connection import connect

    con = connect()
    cur = con.cursor()

    cur.execute(
        """
        WITH first_time AS (
            SELECT from_email
            FROM emails
            WHERE from_email IS NOT NULL
              AND TRIM(from_email) <> ''
            GROUP BY from_email
            HAVING COUNT(*) = 1
        )
        SELECT COUNT(*) FROM first_time
        """
    )
    unique_senders = cur.fetchone()[0]

    cur.execute(
        """
        WITH first_time AS (
            SELECT from_email
            FROM emails
            WHERE from_email IS NOT NULL
              AND TRIM(from_email) <> ''
            GROUP BY from_email
            HAVING COUNT(*) = 1
        )
        SELECT COUNT(*) AS total_emails,
               MAX(date_ts) AS latest_ts
        FROM emails
        WHERE from_email IN (SELECT from_email FROM first_time)
        """
    )
    totals_row = cur.fetchone()
    total_emails = totals_row[0] or 0
    latest_ts = totals_row[1]

    cur.execute(
        """
        WITH first_time AS (
            SELECT from_email
            FROM emails
            WHERE from_email IS NOT NULL
              AND TRIM(from_email) <> ''
            GROUP BY from_email
            HAVING COUNT(*) = 1
        )
        SELECT id, date_ts, from_email, subject, snippet
        FROM emails
        WHERE from_email IN (SELECT from_email FROM first_time)
        ORDER BY date_ts DESC, id DESC
        LIMIT ?
        """,
        (limit,),
    )
    emails = [dict(row) for row in cur.fetchall()]

    cur.execute(
        """
        WITH first_time AS (
            SELECT from_email
            FROM emails
            WHERE from_email IS NOT NULL
              AND TRIM(from_email) <> ''
            GROUP BY from_email
            HAVING COUNT(*) = 1
        )
        SELECT from_email,
               COUNT(*) AS total_emails,
               MAX(date_ts) AS latest_ts
        FROM emails
        WHERE from_email IN (SELECT from_email FROM first_time)
        GROUP BY from_email
        ORDER BY latest_ts DESC, from_email ASC
        LIMIT ?
        """,
        (limit,),
    )
    senders = [dict(row) for row in cur.fetchall()]

    con.close()
    return {
        "stats": {
            "unique_senders": unique_senders,
            "total_emails": total_emails,
            "latest_ts": latest_ts,
        },
        "senders": senders,
        "emails": emails,
    }


@app.get("/insights/senders/top")
def api_insights_top_senders(limit: int = 50):
    from db.connection import connect

    con = connect()
    cur = con.cursor()

    cur.execute(
        """
        SELECT from_email,
               COUNT(*) AS total_emails,
               MAX(date_ts) AS latest_ts
        FROM emails
        WHERE from_email IS NOT NULL
          AND TRIM(from_email) <> ''
        GROUP BY from_email
        ORDER BY total_emails DESC,
                 latest_ts DESC,
                 from_email ASC
        LIMIT ?
        """,
        (limit,),
    )
    sender_rows = [dict(row) for row in cur.fetchall()]

    unique_senders = len(sender_rows)
    total_emails = sum(row.get("total_emails") or 0 for row in sender_rows)
    latest_ts_candidates = [row.get("latest_ts") for row in sender_rows if row.get("latest_ts") is not None]
    latest_ts = max(latest_ts_candidates) if latest_ts_candidates else None

    con.close()
    return {
        "stats": {
            "unique_senders": unique_senders,
            "total_emails": total_emails,
            "latest_ts": latest_ts,
        },
        "senders": sender_rows,
        "emails": [],
    }


def _parse_recipient_addresses(row) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for key in ("to_json", "cc_json"):
        raw = row[key]
        if not raw:
            continue
        try:
            entries = json.loads(raw)
        except Exception:
            continue
        if isinstance(entries, str):
            entries = [entries]
        for value in entries:
            if not isinstance(value, str):
                continue
            clean = value.strip()
            if clean and clean not in seen:
                seen.add(clean)
                unique.append(clean)
    return unique


def _collect_recipient_insight(limit: int, matches_fn):
    from db.connection import connect

    con = connect()
    cur = con.cursor()
    cur.execute(
        """
        SELECT id, date_ts, from_email, subject, snippet, to_json, cc_json
        FROM emails
        ORDER BY date_ts DESC, id DESC
        """
    )
    rows = cur.fetchall()
    con.close()

    recipients: dict[str, dict[str, int | None]] = {}
    emails: list[dict] = []
    total_emails = 0
    latest_ts: int | None = None

    for row in rows:
        addresses = _parse_recipient_addresses(row)
        count = len(addresses)
        if count == 0 or not matches_fn(count):
            continue

        total_emails += 1
        ts = row["date_ts"]
        if ts is not None:
            latest_ts = ts if latest_ts is None else max(latest_ts, ts)

        if len(emails) < limit:
            emails.append(
                {
                    "id": row["id"],
                    "date_ts": row["date_ts"],
                    "from_email": row["from_email"],
                    "subject": row["subject"],
                    "snippet": row["snippet"],
                }
            )

        for address in addresses:
            entry = recipients.setdefault(
                address,
                {
                    "total_emails": 0,
                    "latest_ts": None,
                },
            )
            entry["total_emails"] = int(entry["total_emails"]) + 1
            if ts is not None:
                latest_entry_ts = entry["latest_ts"]
                entry["latest_ts"] = ts if latest_entry_ts is None else max(int(latest_entry_ts), ts)

    sorted_recipients = sorted(
        (
            {
                "address": address,
                "total_emails": int(values["total_emails"]),
                "latest_ts": values["latest_ts"],
            }
            for address, values in recipients.items()
        ),
        key=lambda item: (
            -item["total_emails"],
            -(item["latest_ts"] or 0),
            item["address"],
        ),
    )[:limit]

    return {
        "stats": {
            "unique_recipients": len(recipients),
            "total_emails": total_emails,
            "latest_ts": latest_ts,
        },
        "recipients": sorted_recipients,
        "emails": emails,
    }


@app.get("/insights/recipients/count-type")
def api_insights_recipient_count_type(mode: str = Query("single"), limit: int = 50):
    normalized = (mode or "").strip().lower()
    if normalized not in {"single", "multiple"}:
        raise HTTPException(status_code=400, detail="invalid_mode")

    if normalized == "single":
        matcher = lambda count: count == 1
    else:
        matcher = lambda count: count >= 2

    return _collect_recipient_insight(limit=max(1, limit), matches_fn=matcher)


@app.get("/insights/recipients/distribution")
def api_insights_recipient_distribution(bucket: str = Query("small"), limit: int = 50):
    normalized = (bucket or "").strip().lower()
    if normalized == "small":
        matcher = lambda count: 2 <= count <= 5
    elif normalized == "medium":
        matcher = lambda count: 6 <= count <= 20
    elif normalized == "large":
        matcher = lambda count: count >= 21
    else:
        raise HTTPException(status_code=400, detail="invalid_bucket")

    return _collect_recipient_insight(limit=max(1, limit), matches_fn=matcher)


@app.get("/insights/senders/by-address")
def api_insights_senders_by_address(
    address: Optional[List[str]] = Query(default=None),
    limit: int = 50,
):
    from db.connection import connect

    addresses = [entry.strip() for entry in (address or []) if entry and entry.strip()]
    if not addresses:
        return {
            "stats": {
                "unique_senders": 0,
                "total_emails": 0,
                "latest_ts": None,
            },
            "senders": [],
            "emails": [],
        }

    patterns = []
    for addr in addresses:
        pattern = addr.lower()
        if "%" not in pattern:
            if not pattern.endswith("%"):
                pattern = f"{pattern}%"
        patterns.append(pattern)

    predicate_parts = ["LOWER(from_email) LIKE ?" for _ in patterns]
    predicate_sql = " OR ".join(predicate_parts)
    where_sql = (
        "WHERE from_email IS NOT NULL "
        "AND TRIM(from_email) <> '' "
        f"AND ({predicate_sql})"
    )

    con = connect()
    cur = con.cursor()

    pattern_tuple = tuple(patterns)

    cur.execute(
        f"SELECT COUNT(DISTINCT from_email) FROM emails {where_sql}",
        pattern_tuple,
    )
    unique_senders = cur.fetchone()[0]

    cur.execute(
        f"SELECT COUNT(*) AS total_emails, MAX(date_ts) AS latest_ts FROM emails {where_sql}",
        pattern_tuple,
    )
    totals_row = cur.fetchone()
    total_emails = totals_row[0] or 0
    latest_ts = totals_row[1]

    cur.execute(
        f"""
        SELECT id, date_ts, from_email, subject, snippet
        FROM emails
        {where_sql}
        ORDER BY date_ts DESC, id DESC
        LIMIT ?
        """,
        pattern_tuple + (limit,),
    )
    emails = [dict(row) for row in cur.fetchall()]

    cur.execute(
        f"""
        SELECT from_email,
               COUNT(*) AS total_emails,
               MAX(date_ts) AS latest_ts
        FROM emails
        {where_sql}
        GROUP BY from_email
        ORDER BY latest_ts DESC, from_email ASC
        LIMIT ?
        """,
        pattern_tuple + (limit,),
    )
    senders = [dict(row) for row in cur.fetchall()]

    con.close()
    return {
        "stats": {
            "unique_senders": unique_senders,
            "total_emails": total_emails,
            "latest_ts": latest_ts,
        },
        "senders": senders,
        "emails": emails,
    }


@app.get("/insights/senders/dormant")
def api_insights_senders_dormant(
    limit: int = 50,
    inactive_days: int = DEFAULT_DORMANT_INACTIVE_DAYS,
):
    from db.connection import connect

    if inactive_days <= 0:
        inactive_days = DEFAULT_DORMANT_INACTIVE_DAYS

    cutoff_seconds = int(time.time()) - inactive_days * SECONDS_IN_DAY
    cutoff_millis = cutoff_seconds * 1000

    con = connect()
    cur = con.cursor()

    normalized_ts = "CASE WHEN date_ts IS NULL THEN NULL WHEN date_ts > 1000000000000 THEN date_ts ELSE date_ts * 1000 END"

    cur.execute(
        f"""
        WITH eligible AS (
            SELECT from_email,
                   MAX({normalized_ts}) AS latest_ts
            FROM emails
            WHERE from_email IS NOT NULL
              AND TRIM(from_email) <> ''
            GROUP BY from_email
            HAVING latest_ts IS NOT NULL AND latest_ts < ?
        )
        SELECT COUNT(*) FROM eligible
        """,
        (cutoff_millis,),
    )
    unique_senders = cur.fetchone()[0]

    cur.execute(
        f"""
        WITH eligible AS (
            SELECT from_email
            FROM emails
            WHERE from_email IS NOT NULL
              AND TRIM(from_email) <> ''
            GROUP BY from_email
            HAVING MAX({normalized_ts}) IS NOT NULL AND MAX({normalized_ts}) < ?
        )
        SELECT COUNT(*) AS total_emails,
               MAX({normalized_ts}) AS latest_ts
        FROM emails
        WHERE from_email IN (SELECT from_email FROM eligible)
        """,
        (cutoff_millis,),
    )
    totals_row = cur.fetchone()
    total_emails = (totals_row[0] or 0) if totals_row else 0
    latest_ts = totals_row[1] if totals_row else None

    cur.execute(
        """
        WITH eligible AS (
            SELECT from_email
            FROM emails
            WHERE from_email IS NOT NULL
              AND TRIM(from_email) <> ''
            GROUP BY from_email
            HAVING MAX(CASE WHEN date_ts IS NULL THEN NULL WHEN date_ts > 1000000000000 THEN date_ts ELSE date_ts * 1000 END) IS NOT NULL
              AND MAX(CASE WHEN date_ts IS NULL THEN NULL WHEN date_ts > 1000000000000 THEN date_ts ELSE date_ts * 1000 END) < ?
        )
        SELECT id, date_ts, from_email, subject, snippet
        FROM emails
        WHERE from_email IN (SELECT from_email FROM eligible)
        ORDER BY date_ts DESC, id DESC
        LIMIT ?
        """,
        (cutoff_millis, limit),
    )
    emails = [dict(row) for row in cur.fetchall()]

    cur.execute(
        f"""
        WITH eligible AS (
            SELECT from_email
            FROM emails
            WHERE from_email IS NOT NULL
              AND TRIM(from_email) <> ''
            GROUP BY from_email
            HAVING MAX({normalized_ts}) IS NOT NULL AND MAX({normalized_ts}) < ?
        )
        SELECT from_email,
               COUNT(*) AS total_emails,
               MAX({normalized_ts}) AS latest_ts
        FROM emails
        WHERE from_email IN (SELECT from_email FROM eligible)
        GROUP BY from_email
        ORDER BY latest_ts DESC, from_email ASC
        LIMIT ?
        """,
        (cutoff_millis, limit),
    )
    senders = [dict(row) for row in cur.fetchall()]

    con.close()
    return {
        "stats": {
            "unique_senders": unique_senders,
            "total_emails": total_emails,
            "latest_ts": latest_ts,
        },
        "senders": senders,
        "emails": emails,
    }
