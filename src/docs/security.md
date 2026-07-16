# Security Requirements

## RBAC

- `ADMIN`: manage users, courses, classes, documents, and system settings.
- `TEACHER`: access assigned classes and students in those classes.
- `PARENT`: access only linked students.

## Non-Negotiables

- Backend owns authorization decisions.
- LLM never accesses the database directly.
- AI responses use retrieved context and clearly avoid invented policy claims.
- Student answer analysis can explain learning patterns but must not generate exam answers or complete homework.
- Sensitive reads, chats, and analysis actions should write audit logs.

## MVP Test Matrix

- No bearer token returns `401`.
- Parent A cannot access Parent B's linked student.
- Teacher A cannot access Teacher B's class.
- Non-admin cannot call `/api/admin/users`.
- Parent can analyze only their linked student's answer.
