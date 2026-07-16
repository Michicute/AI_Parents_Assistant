# Architecture

## Request Flow

User query -> intent routing -> backend permission checks -> authorized retrieval -> AI generation -> response.

The LLM never receives credentials and never decides whether a user may access a student, class, or administrative resource.

## Backend Boundaries

- `core/security.py`: principal extraction and RBAC helpers.
- `services/tools.py`: authorized context retrieval for assistant tools.
- `services/ai_provider.py`: provider boundary for OpenAI now and Claude later.
- `services/repositories.py`: repository boundary for PostgreSQL-backed application data.

## Frontend Boundaries

- `app/page.tsx`: first-use dashboard.
- `components/AssistantWorkspace.tsx`: parent-facing progress and AI chat workspace.
- `lib/api.ts`: backend API client.

## RAG

Center policies, parent handbook content, FAQs, announcements, and course descriptions live in `documents` and `document_chunks` with pgvector embeddings. Retrieval must happen in backend services after role and student constraints have been checked.

Structured data such as assignments, attendance, skill scores, assessments, rubrics, student answers, and answer analyses must be queried from PostgreSQL tables directly, not through RAG.

## Security

Required tests cover unauthenticated access, parent isolation, teacher class isolation, and admin-only user management. Database access controls should mirror the backend checks before launch.
