# MailLens 📨🔍

> **Open-source, local-first AI email analyzer.**  
> See through your inbox with privacy, clarity, and control.

---

## ✨ Overview
MailLens lets you ingest emails from Apple Mail (`.emlx`), `.mbox` archives, IMAP, or Gmail,
and explore them locally using powerful SQL + AI insights.

Everything stays **on your machine** — MailLens never sends your data anywhere.

---

## 🧩 Features (current and upcoming)
- [x] Local SQLite storage (fast, offline)
- [x] Tree-based explorer (sender, domain, time, attachments)
- [ ] Sentiment & category detection
- [ ] Entity extraction (names, orgs, amounts)
- [ ] Ollama / Cloud LLM integration
- [ ] Cross-platform desktop (macOS, Windows, Linux)

---

## ⚙️ Architecture
```text
Sources → Ingestion (Python) → SQLite → Analytics / LLM → Tauri Desktop UI
