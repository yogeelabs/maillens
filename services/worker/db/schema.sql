CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,                 -- 'emlx' | 'mbox' | 'imap' | 'gmail'
  source_uid TEXT,             -- path/UID/gmail_id (dedupe key)
  message_id TEXT,             -- RFC Message-ID
  date_ts INTEGER,             -- unix ms
  from_name TEXT,
  from_email TEXT,
  to_json TEXT,                -- JSON array
  cc_json TEXT,                -- JSON array
  subject TEXT,
  snippet TEXT,
  body_text TEXT,
  body_hash TEXT,              -- sha256 of normalized text
  size_bytes INTEGER,
  has_attach INTEGER DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_emails_source_uid ON emails(source, source_uid);
CREATE INDEX IF NOT EXISTS ix_emails_date ON emails(date_ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_emails_from ON emails(from_email);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id INTEGER REFERENCES emails(id) ON DELETE CASCADE,
  filename TEXT,
  mime_major TEXT,
  mime_minor TEXT,
  bytes INTEGER,
  sha256 TEXT
);
CREATE INDEX IF NOT EXISTS ix_att_email ON attachments(email_id);
CREATE INDEX IF NOT EXISTS ix_att_mime ON attachments(mime_major, mime_minor);

-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
  subject, body, content='',
  tokenize='porter unicode61'
);