from pathlib import Path
import sqlite3

DB_PATH = Path(__file__).resolve().parent.parent / "maillens.db"

BUSY_TIMEOUT_MS = 30_000  # wait up to 30s when the database is busy


def connect(write: bool = False):
    conn = sqlite3.connect(DB_PATH, timeout=BUSY_TIMEOUT_MS / 1000)
    # ensure we respect the busy timeout for long-running writes
    conn.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.row_factory = sqlite3.Row
    if write:
        conn.isolation_level = None  # manual transactions
    return conn
