# services/worker/ingest/runner.py
import threading
from threading import Event, Thread
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

    cancel_event = Event()
    _cancel_event = cancel_event

    def _run():
        try:
            ingest_emlx_folder(path, cancel_event=cancel_event)
        finally:
            # ensure we clear references once the worker exits
            _cleanup_ingest_thread("completed")

    thread = Thread(target=_run, name="ingest-emlx", daemon=True)
    _current_thread = thread
    print("[ingest.runner] Starting ingest-emlx thread")
    thread.start()


def cancel_running():
    global _cancel_event
    if _cancel_event is not None:
        _cancel_event.set()
        prog_cancel()
    thread = _current_thread
    if thread and thread.is_alive():
        thread.join(timeout=5)
    if thread is None or not thread.is_alive():
        _cleanup_ingest_thread("cancelled")


def _cleanup_ingest_thread(reason: str):
    global _current_thread, _cancel_event
    if _current_thread is None:
        return
    active_threads = ", ".join(t.name for t in threading.enumerate())
    print(f"[ingest.runner] Ingestion thread ended ({reason}). Active threads: {active_threads}")
    _current_thread = None
    _cancel_event = None
