# C2-APP-129 Product Architecture Diagram

```mermaid
flowchart LR
    %% C2-APP-129 - English Learning Center Parent AI Assistant

    subgraph U["User Channels"]
        Parent["Parent<br/>Progress, attendance, assessments,<br/>AI learning support"]
        Teacher["Teacher<br/>Classes, attendance,<br/>assessments, feedback"]
        Admin["Admin<br/>Users, classes, documents,<br/>system configuration"]
        Student["Student<br/>Assessment taking"]
        ZaloParent["Parent on Zalo"]
    end

    subgraph EDGE["Public Edge"]
        Cloudflare["Cloudflare<br/>DNS + HTTPS"]
        Nginx["Nginx<br/>Reverse proxy + blue/green routing"]
    end

    subgraph WEB["Web Application"]
        Next["Next.js Frontend<br/>TypeScript + Tailwind<br/>Role-based UI"]
    end

    subgraph API["FastAPI Backend - Trust Boundary"]
        Auth["Authentication<br/>Email/password + JWT<br/>Session epoch"]
        RBAC["Authorization<br/>RBAC + object-level checks"]
        AppRoutes["REST API Routes"]
        Domain["Business Services<br/>students, classes, attendance,<br/>scores, assessments, insights"]
        Repo["Repository Layer<br/>typed database access"]
        AuditSvc["Audit Service<br/>sensitive reads/actions"]
    end

    subgraph AI["AI Assistant Pipeline"]
        GuardIn["Input Guardrails<br/>homework refusal,<br/>prompt-injection checks"]
        Intent["Intent Router<br/>rule-first + LLM fallback"]
        Tools["Authorized Tool Routing<br/>deterministic retrieval"]
        Context["Prompt Builder<br/>authorized context only"]
        LLM["AI Provider Adapter<br/>OpenAI-first<br/>Claude/local-compatible"]
        GuardOut["Output Guardrails<br/>no leaks, no submit-ready answers"]
    end

    subgraph DATA["Data and Knowledge Layer"]
        PG[("PostgreSQL<br/>structured operational data")]
        Vector[("pgvector<br/>document chunks + embeddings")]
        AuditDB[("Audit Logs")]
        Docs["Approved RAG Documents<br/>policies, FAQ, handbook,<br/>announcements, course descriptions"]
    end

    subgraph ZALO["Zalo Integration"]
        ZaloPlatform["Zalo Platform"]
        ZaloBot["Zalo Bot Service<br/>Node.js / TypeScript"]
    end

    subgraph DEPLOY["Deployment"]
        GHA["GitHub Actions<br/>CI/CD"]
        TF["Terraform<br/>EC2 infrastructure"]
        EC2["AWS EC2<br/>Docker Compose"]
        Blue["Blue Slot<br/>frontend + backend + bot"]
        Green["Green Slot<br/>frontend + backend + bot"]
    end

    Parent --> Cloudflare
    Teacher --> Cloudflare
    Admin --> Cloudflare
    Student --> Cloudflare
    Cloudflare --> Nginx
    Nginx --> Next

    Next -->|"Bearer JWT"| AppRoutes
    AppRoutes --> Auth
    Auth --> RBAC
    RBAC --> Domain
    Domain --> Repo
    Repo --> PG
    AuditSvc --> AuditDB
    Domain --> AuditSvc

    AppRoutes --> GuardIn
    GuardIn --> Intent
    Intent --> Tools
    Tools --> RBAC
    Tools --> Repo
    Tools --> Vector
    Tools --> Context
    Context --> LLM
    LLM --> GuardOut
    GuardOut --> AppRoutes

    Docs --> Vector
    Docs --> PG
    PG --> Repo

    ZaloParent --> ZaloPlatform
    ZaloPlatform --> ZaloBot
    ZaloBot -->|"internal API + shared secret"| AppRoutes
    ZaloBot --> PG

    GHA --> TF
    TF --> EC2
    GHA --> EC2
    EC2 --> Blue
    EC2 --> Green
    Nginx -->|"active upstream"| Blue
    Nginx -. "switch on release" .-> Green
```

## Key Reading Notes

- The **FastAPI backend is the trust boundary**. It authenticates users, enforces RBAC and validates object-level access before any data retrieval or AI call.
- The **LLM never accesses PostgreSQL directly** and never decides permissions.
- **Structured student data** comes from PostgreSQL through repositories/services.
- **RAG is only for approved unstructured documents** such as policies, FAQ, handbook, announcements and course descriptions.
- The **Zalo bot service** is separate because channel/session handling is operationally different from the core web application.
- The current deployment model uses **AWS EC2 + Docker Compose + Nginx blue/green routing**, which is practical for MVP and can later evolve to managed PostgreSQL and ECS/Fargate.

