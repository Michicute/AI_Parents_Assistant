from __future__ import annotations

import time

from sqlalchemy import func, select

from app.db import models as orm
from app.db.session import SessionLocal


def main() -> None:
    deadline = time.monotonic() + 180
    required_document_types = {"announcement", "center_policy", "course_description", "faq", "parent_handbook"}
    previous_snapshot: tuple[tuple[str, int], ...] | None = None
    stable_polls = 0
    while time.monotonic() < deadline:
        try:
            with SessionLocal() as db:
                chunk_rows = db.execute(
                    select(orm.Document.document_type, func.count(orm.DocumentChunk.id))
                    .join(orm.DocumentChunk, orm.DocumentChunk.document_id == orm.Document.id)
                    .group_by(orm.Document.document_type)
                ).all()
                assessment_count = db.scalar(
                    select(func.count()).select_from(orm.Assessment).where(orm.Assessment.id.like("eval-assessment-%"))
                ) or 0
            snapshot = tuple(sorted((str(document_type), int(count)) for document_type, count in chunk_rows))
            available_types = {document_type for document_type, count in snapshot if count > 0}
            if required_document_types.issubset(available_types) and assessment_count >= 7:
                stable_polls = stable_polls + 1 if snapshot == previous_snapshot else 1
            else:
                stable_polls = 0
            previous_snapshot = snapshot
            if stable_polls >= 2:
                chunk_count = sum(count for _, count in snapshot)
                print(f"Evaluation data ready: chunks={chunk_count}, assessments={assessment_count}, document_types={len(available_types)}")
                return
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError("Evaluation database or RAG ingestion did not become ready within 180 seconds")


if __name__ == "__main__":
    main()
