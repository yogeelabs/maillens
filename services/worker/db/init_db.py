from contextlib import closing
import sqlite3
import time

from .connection import DB_PATH, connect

RETRY_ATTEMPTS = 5
RETRY_DELAY_BASE = 0.5  # seconds


def init_db():
    sql = (DB_PATH.parent / "db" / "schema.sql").read_text(encoding="utf-8")
    last_exc: Exception | None = None

    for attempt in range(RETRY_ATTEMPTS):
        try:
            with closing(connect(write=True)) as con:
                cur = con.cursor()
                cur.execute("BEGIN IMMEDIATE")
                cur.executescript(sql)
                cur.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version','1')")
                con.commit()
            return
        except sqlite3.OperationalError as exc:
            last_exc = exc
            if "locked" in str(exc).lower() and attempt < RETRY_ATTEMPTS - 1:
                time.sleep(RETRY_DELAY_BASE * (attempt + 1))
                continue
            raise

    if last_exc:
        raise last_exc

if __name__ == "__main__":
    init_db()
    print("DB initialized at:", DB_PATH)
