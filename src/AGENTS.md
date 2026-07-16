# AGENTS.md

These instructions apply to all implementation work inside `src`.

Follow the root `AGENTS.md` as the authoritative product, architecture, security, AI, RAG, testing, and deployment guide.

Key implementation reminders:

- This is an English Learning Center parent-support AI, not a general school system.
- This is not a homework-solving AI.
- Use Single Agent + Tool Routing only.
- The LLM must never directly access the database.
- The backend must authenticate the user, enforce RBAC, and retrieve authorized context before prompt construction.
- Parents can only access linked students.
- Teachers can only access assigned classes.
- Admins manage users, roles, classes, enrollments, documents, and system configuration.
- Use PostgreSQL for structured data: scores, assignments, attendance, assessments, assessment questions, student answers, teacher comments, and progress records.
- Use RAG only for unstructured documents: policies, FAQ, handbook, announcements, course descriptions, and approved learning-center documents.
- Student Answer Analysis may explain retrieved student work, strengths, gaps, and practice suggestions, but must not generate submit-ready homework, quiz, exam, writing, or speaking answers.
- Add or update tests for RBAC, retrieval boundaries, AI guardrails, RAG behavior, and student answer analysis whenever those areas change.
