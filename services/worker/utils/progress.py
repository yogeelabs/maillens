# services/worker/utils/progress.py
from threading import Lock

_progress = {
    "kind": "idle",     # emlx | mbox | imap | ...
    "total": 0,
    "done": 0,
    "status": "idle",   # idle | running | done | cancelled | error
    "note": "",
    "error": ""
}
_lock = Lock()

def reset(kind: str, total: int):
    with _lock:
        _progress.update(kind=kind, total=total, done=0, status="running", note="", error="")

def step(note: str = ""):
    with _lock:
        _progress["done"] += 1
        if note:
            _progress["note"] = note

def finish():
    with _lock:
        _progress["status"] = "done"

def cancel():
    with _lock:
        _progress["status"] = "cancelled"
        _progress["note"] = ""

def fail(msg: str):
    with _lock:
        _progress["status"] = "error"
        _progress["error"] = msg

def get():
    with _lock:
        return dict(_progress)
