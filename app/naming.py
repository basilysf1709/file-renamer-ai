import re
from datetime import datetime


BLOCK = set(["fuck","shit","ass","bitch","slur"])  # extend


_slug_re = re.compile(r"[^a-z0-9]+")


def to_kebab(s: str, max_words: int = 10, max_len: int = 60) -> str:
    s = s.lower().strip()
    s = _slug_re.sub("-", s).strip("-")
    parts = [p for p in s.split("-") if p]
    parts = [p for p in parts if p not in BLOCK]
    out = "-".join(parts[:max_words])
    return out[:max_len] or "image"


def dedupe(name: str, existing: set) -> str:
    base, i = name, 1
    while name in existing:
        name = f"{base}-{i:03d}"
        i += 1
    existing.add(name)
    return name


def system_prompt() -> str:
    return (
        "You are an image filename generator. "
        "Return ONLY a safe filename in kebab-case. "
        "ASCII only, <=10 words, <=60 characters. "
        "No punctuation except '-'."
    ) 