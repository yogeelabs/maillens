from pathlib import Path
import sqlite3

DB_PATH = Path(__file__).resolve().parent.parent / "maillens.db"

def connect(write=False):
    conn = sqlite3.connect(DB_PATH)
    # performance & safety
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.row_factory = sqlite3.Row
    if write:
        conn.isolation_level = None  # manual transactions
    return conn