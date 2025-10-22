from .connection import connect, DB_PATH

def init_db():
    sql = (DB_PATH.parent / "db" / "schema.sql").read_text(encoding="utf-8")
    con = connect(write=True); cur = con.cursor()
    cur.execute("BEGIN")
    cur.executescript(sql)
    cur.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version','1')")
    con.commit(); con.close()

if __name__ == "__main__":
    init_db()
    print("DB initialized at:", DB_PATH)