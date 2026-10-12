"""Bounded, explainable BM25 retrieval. Scores are relevance, not confidence."""

import hashlib
import math
import re
from collections import Counter

from relay.db import Chunk, Document
from sqlalchemy import select
from sqlalchemy.orm import Session

STOPWORDS = set(
    "a an the and or to of in is for on with at from by as be are was were this that it we has have after before during our please what how can should investigate incident service elevated".split()
)


def redact(text: str) -> str:
    text = re.sub(r"(?i)\b(authorization\s*:\s*bearer\s+)\S+", r"\1[REDACTED]", text)
    text = re.sub(r"\bsk-[A-Za-z0-9_-]{16,}\b", "[REDACTED]", text)
    return re.sub(
        r"(?i)\b(api[_-]?key|password|secret|token)\s*[:=]\s*[^\s,;]+", r"\1=[REDACTED]", text
    )


def tokenize(text: str) -> list[str]:
    return [
        word
        for word in re.findall(r"[a-z0-9]+", text.lower())
        if len(word) > 1 and word not in STOPWORDS
    ]


def split_chunks(content: str, max_chars: int = 1100):
    lines = content.splitlines()
    buffer, size, start = [], 0, 1
    for index, line in enumerate(lines, 1):
        if buffer and size + len(line) > max_chars:
            yield "\n".join(buffer), start, index - 1
            buffer, size, start = [], 0, index
        # A single long line is bounded by the document size limit.
        buffer.append(line)
        size += len(line) + 1
    if buffer:
        yield "\n".join(buffer), start, len(lines)


def add_document(db: Session, workspace_id: str, **values) -> Document:
    values["content"] = redact(values["content"])
    values["title"] = redact(values["title"])
    digest = hashlib.sha256(values["content"].encode()).hexdigest()
    doc = Document(workspace_id=workspace_id, digest=digest, **values)
    db.add(doc)
    db.flush()
    for content, start, end in split_chunks(doc.content):
        db.add(Chunk(document_id=doc.id, content=content, start_line=start, end_line=end))
    db.flush()
    return doc


def rank(query: str, candidates: list[dict], limit: int = 5) -> list[dict]:
    terms = set(tokenize(query))
    if not candidates or not terms:
        return []
    tokenized = [tokenize(f"{c['title']} {c['service']} {c['content']}") for c in candidates]
    average = sum(map(len, tokenized)) / len(tokenized) or 1
    frequencies = Counter(term for tokens in tokenized for term in set(tokens))
    scored = []
    for candidate, tokens in zip(candidates, tokenized, strict=True):
        counts, score = Counter(tokens), 0.0
        for term in terms:
            tf = counts[term]
            if tf:
                idf = math.log(
                    1 + (len(candidates) - frequencies[term] + 0.5) / (frequencies[term] + 0.5)
                )
                score += idf * tf * 2.5 / (tf + 1.5 * (0.25 + 0.75 * len(tokens) / average))
        # Require at least two overlapping tokens; a single service word isn't enough evidence.
        if score > 0 and len(terms & set(tokens)) >= 2:
            scored.append({**candidate, "score": round(score, 3)})
    scored.sort(key=lambda item: (-item["score"], item["chunk_id"]))
    return [{**item, "id": f"E{index}"} for index, item in enumerate(scored[:limit], 1)]


def retrieve(db: Session, workspace_id: str, query: str) -> list[dict]:
    rows = db.execute(
        select(Chunk, Document).join(Document).where(Document.workspace_id == workspace_id)
    ).all()
    candidates = [
        {
            "chunk_id": c.id,
            "document_id": d.id,
            "title": d.title,
            "service": d.service,
            "content": c.content,
            "start_line": c.start_line,
            "end_line": c.end_line,
        }
        for c, d in rows
    ]
    return rank(redact(query), candidates)
