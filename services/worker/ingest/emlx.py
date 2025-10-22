import os, json, time
from email import policy
from email.header import decode_header, make_header
from email.parser import BytesParser
from email.utils import getaddresses, parseaddr
from pathlib import Path
from dateutil import parser as dateparse
from db.connection import connect
from utils.text import html_to_text, sha256_text
from utils.progress import cancel, reset, step, finish, fail
from threading import Event

def _to_ms(dt: str | None) -> int:
    if not dt: return int(time.time() * 1000)
    try: return int(dateparse.parse(dt).timestamp() * 1000)
    except Exception: return int(time.time() * 1000)

def _decode_part_text(part) -> tuple[str, str]:
    payload = part.get_payload(decode=True)
    charset = part.get_content_charset() or "utf-8"
    if payload is None:
        raw = part.get_payload()
        if isinstance(raw, str):
            text = raw
        else:
            text = ""
    else:
        try:
            text = payload.decode(charset, errors="replace")
        except LookupError:
            text = payload.decode("utf-8", errors="replace")
    return part.get_content_type(), text

def _extract_body(msg):
    # prefer text/plain; fallback to text/html converted
    plain_segments = []
    html_segments = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            ctype, text = _decode_part_text(part)
            if ctype == "text/plain":
                plain_segments.append(text.strip())
            elif ctype == "text/html":
                html_segments.append(html_to_text(text))
    else:
        ctype, text = _decode_part_text(msg)
        if ctype == "text/html":
            html_segments.append(html_to_text(text))
        else:
            plain_segments.append(text.strip())
    body = "\n".join(filter(None, plain_segments)) or "\n".join(filter(None, html_segments))
    return body

def _header_to_str(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return ", ".join(filter(None, (_header_to_str(v) for v in value)))
    raw = getattr(value, "value", None)
    if isinstance(raw, str):
        return raw
    try:
        return str(value)
    except Exception:
        return ""

def _decode_header(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(str(value))))
    except Exception:
        return str(value)

def _first_address(headers) -> tuple[str, str]:
    header_strings = [_header_to_str(h) for h in headers]
    for name, addr in getaddresses(header_strings):
        clean_addr = addr.strip()
        if clean_addr:
            return _decode_header(name), clean_addr
    if header_strings:
        parsed_name, parsed_addr = parseaddr(header_strings[0])
        parsed_addr = parsed_addr.strip()
        if parsed_addr:
            return _decode_header(parsed_name), parsed_addr
        return ("", header_strings[0].strip())
    return ("", "")

def _address_list(headers) -> list[str]:
    header_strings = [_header_to_str(h) for h in headers]
    seen: list[str] = []
    for _, addr in getaddresses(header_strings):
        clean = addr.strip()
        if clean and clean not in seen:
            seen.append(clean)
    if not seen and header_strings:
        fallback = header_strings[0].strip()
        if fallback:
            seen.append(fallback)
    return seen

def ingest_emlx_folder(folder_path: str, *, limit: int | None = None, cancel_event: Event | None = None) -> dict:
    if not os.path.isdir(folder_path):
        return {"ok": False, "error": "path_not_directory", "path": folder_path}

    files: list[str] = []
    for root, _, fs in os.walk(folder_path):
        for f in fs:
            if f.endswith(".emlx"):
                files.append(os.path.join(root, f))

    files.sort()
    if limit is not None and limit > 0:
        files = files[:limit]

    total = len(files)
    reset("emlx", total)
    con = connect(write=True); cur = con.cursor()
    cur.execute("BEGIN")
    inserted = 0

    try:
        for idx, path in enumerate(files, start=1):
            if cancel_event and cancel_event.is_set():
                con.commit()
                con.close()
                cancel()
                return {"ok": False, "cancelled": True, "total": total, "inserted": inserted}
            raw = Path(path).read_bytes()
            try:
                first_line, rest = raw.split(b"\n", 1)
                if first_line.strip().isdigit():
                    raw_msg = rest
                else:
                    raw_msg = raw
            except ValueError:
                raw_msg = raw

            msg = BytesParser(policy=policy.compat32).parsebytes(raw_msg)

            body_text = (_extract_body(msg) or "").strip()
            snippet = (body_text[:200] + "…") if len(body_text) > 200 else body_text
            date_ms = _to_ms(str(msg.get("Date") or ""))

            raw_from = msg.get_all("From", [])
            from_name, from_email = _first_address(raw_from)
            if not from_email and raw_from:
                from_email = str(raw_from[0]).strip()

            to_addresses = _address_list(msg.get_all("To", []))
            cc_addresses = _address_list(msg.get_all("Cc", []))
            subject = _decode_header(msg.get("Subject"))
            message_id = str(msg.get("Message-ID") or "").strip()

            has_attach = 1 if any(p.get_filename() for p in msg.walk()) else 0

            cur.execute("""
                INSERT OR IGNORE INTO emails
                (source, source_uid, message_id, date_ts, from_name, from_email,
                 to_json, cc_json, subject, snippet, body_text, body_hash, size_bytes, has_attach)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "emlx",
                path,
                message_id,
                date_ms,
                from_name,
                from_email,
                json.dumps(to_addresses, ensure_ascii=False),
                json.dumps(cc_addresses, ensure_ascii=False),
                subject,
                snippet,
                body_text,
                sha256_text(body_text),
                os.path.getsize(path),
                has_attach
            ))

            if cur.rowcount > 0:
                cur.execute("SELECT id FROM emails WHERE source=? AND source_uid=?", ("emlx", path))
                rid = cur.fetchone()[0]
                cur.execute("INSERT INTO emails_fts(rowid, subject, body) VALUES(?,?,?)",
                            (rid, subject, body_text))
                inserted += 1

            # Optional: commit in batches to keep WAL small
            if idx % 500 == 0:
                con.commit()
                cur.execute("BEGIN")
            step(path)
        finish()
        con.commit(); con.close()
        return {"ok": True, "total": total, "inserted": inserted}
    except Exception as e:
        fail(str(e))
        con.commit(); con.close()
        return {"ok": False, "error": str(e), "total": total, "inserted": inserted}
