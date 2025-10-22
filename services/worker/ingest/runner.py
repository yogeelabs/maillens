# services/worker/ingest/runner.py
from threading import Thread, Event
from typing import Optional

from .emlx import ingest_emlx_folder
from utils.progress import cancel as prog_cancel

_current_thread: Optional[Thread] = None
_cancel_event: Optional[Event] = None

def is_running() -> bool:
    return _current_thread is not None and _current_thread.is_alive()

def start_emlx(path: str):
    global _current_thread, _cancel_event
    if is_running():
        raise RuntimeError("ingestion_already_running")
    _cancel_event = Event()
    def _run():
        ingest_emlx_folder(path, cancel_event=_cancel_event)
    _current_thread = Thread(target=_run, name="ingest-emlx", daemon=True)
    _current_thread.start()

def cancel_running():
    global _cancel_event
    if _cancel_event is not None:
        _cancel_event.set()
        prog_cancel()