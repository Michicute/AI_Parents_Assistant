# AI Parent Assistant for English Learning Centers

Production-ready MVP monorepo for a parent-support AI assistant. The product helps parents understand their child's English learning progress, review assessment answer analysis, and receive practical recommendations for home support.

This is not a homework-solving AI. The assistant uses authorized data retrieval, RAG over center documents, and strict RBAC before generating parent-facing guidance.

## Stack

- Frontend: Next.js, TypeScript, Tailwind CSS
- Backend: FastAPI, Python
- Database/Auth: PostgreSQL in Docker, backend-issued JWT local auth
- AI: OpenAI-first provider boundary, Claude-compatible later
- Deployment target: Vercel frontend, Railway backend, managed PostgreSQL-compatible database later

## Monorepo

```text
apps/
  frontend/   Next.js parent/teacher/admin web app
  backend/    FastAPI API, RBAC, tool routing, AI services
docs/         Architecture, database schema, deployment notes
scripts/      Local setup helpers
```

## Quick Start

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Install frontend dependencies:

```bash
npm install
```

3. Run backend and database in Docker:

```bash
docker compose up --build -d
```

4. Run the frontend outside Docker only if you want hot reload on your host:

```bash
npm run dev
```

Docker frontend runs at `http://localhost:3002`. Backend runs at `http://localhost:8000`.
Host dev frontend runs at `http://localhost:3000` or the next available port.

## Authentication Setup

The frontend posts email/password to FastAPI at `/api/auth/login`. FastAPI verifies the password hash stored in PostgreSQL, issues a signed local JWT using `APP_SECRET_KEY`, and the frontend stores that token in `localStorage`.

### Login locally

1. Start Docker services:

```bash
docker compose up --build -d
```

2. Start the frontend:

```bash
npm run dev
```

3. Open Docker frontend at `http://localhost:3002/login`, or host dev frontend at the port printed by `npm run dev`.
4. Sign in with one of the seeded accounts:

```text
admin@englishcenter.test / Password123!
teacher.lan@englishcenter.test / Password123!
parent.minh@englishcenter.test / Password123!
parent.linh@englishcenter.test / Password123!
```

The frontend sends the local JWT to FastAPI in `Authorization: Bearer <token>`, and FastAPI resolves role and object-level permissions from PostgreSQL.

### Test teacher login

1. Sign in as the admin.
2. Open `/admin/teachers/new`.
3. Create a teacher with an email and temporary password.
4. Open `/admin/classes` and assign the teacher to a class.
5. Sign out, then sign in with the new teacher credentials.
6. The teacher should land on `/teacher/dashboard` and only access assigned class data.

## Database Setup

Docker Compose starts PostgreSQL at `localhost:54322`. On FastAPI startup in development, `app.db.seed.seed()` creates ORM tables and inserts demo data.

Reset local Docker data with:

```bash
docker compose down -v
docker compose up --build -d
```

Seed data includes:

- 1 admin, 1 teacher, 2 parents, and 2 students
- 1 A2 English class and 1 English course
- parent-student and teacher-class links
- 3 assignments, attendance records, teacher feedback, and skill scores
- 1 English test with reading, grammar, and writing questions
- sample student answers and parent-facing answer analyses
- sample center policy/handbook documents for RAG

RAG is only for unstructured documents in `documents` and `document_chunks`. Structured data such as scores, assignments, attendance, assessments, and student answers must be queried from PostgreSQL tables directly.

## MVP Capabilities

- Backend local-auth login shell
- Role-aware parent, teacher, and admin dashboard surfaces
- Student progress and parent-student linking contracts
- Classes, courses, assignments, attendance, feedback, assessments
- First-class student answer analysis with rubrics and parent-facing insights
- AI chat with tool routing and RAG document retrieval boundary
- Audit log model for sensitive reads and actions

## Security Model

- Backend decides permissions.
- LLM never directly accesses the database.
- Parents can only access linked students.
- Teachers can only access assigned classes.
- Admins can manage users.
- All sensitive reads should write audit logs.

## Deployment

See [docs/deployment.md](docs/deployment.md).
