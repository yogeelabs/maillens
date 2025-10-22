import hashlib
from bs4 import BeautifulSoup

def html_to_text(html: str) -> str:
    return BeautifulSoup(html or "", "html.parser").get_text(" ").strip()

def sha256_text(s: str) -> str:
    return hashlib.sha256((s or "").encode("utf-8", "ignore")).hexdigest()