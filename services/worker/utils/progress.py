from threading import Lock

_progress = {"kind":"idle","total":0,"done":0,"status":"idle","note":""}
_lock = Lock()

def reset(kind:str, total:int):
    with _lock:
        _progress.update(kind=kind, total=total, done=0, status="running", note="")

def step(note:str=""):
    with _lock:
        _progress["done"] += 1
        if note: _progress["note"] = note

def finish():
    with _lock:
        _progress["status"] = "done"

def get():
    with _lock:
        return dict(_progress)