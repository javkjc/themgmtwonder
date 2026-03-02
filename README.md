# Document Intelligence Platform
> A portfolio project by [Javier Koh] — [https://www.linkedin.com/in/javier-koh]

## What This Is

This started as a task management app and evolved into a full document 
intelligence platform — OCR extraction, ML-assisted field suggestion, 
RAG via pgvector, confidence tiers, activation gates, and a learning 
loop that closes on human confirmation.

It's a portfolio project, built to answer one question: what does it 
actually take to build an AI-enabled product responsibly?

The technical stack and architecture are documented below. But there's 
a second layer to this build worth understanding first.

---

## The Development Methodology

This project was built across Claude, Gemini, and Codex — switching 
models based on task complexity and context requirements. That created 
an immediate problem: no shared memory across sessions or models.

The solution was a framework of nine governance files that act as the 
persistent brain of the project:

| File | Role |
|---|---|
| `tasks/plan.md` | Single source of truth for execution |
| `tasks/features.md` | Product intent and version capability ledger |
| `tasks/codemapcc.md` | Architecture map — file paths, endpoints, schema |
| `tasks/executionnotes.md` | Append-only evidence log of what was actually built |
| `tasks/session-state.md` | Resume context — any model can pick up in <2 min |
| `tasks/lessons.md` | Dated correction patterns — same mistake never twice |
| `tasks/ai-rules.md` | Behavioral standards for AI assistants |
| `tasks/prompt_guidelines.md` | Governance spec — authority hierarchy, STOP conditions, forbidden assumptions |
| `tasks/promptsample.md` | Prompt templates for plan generation, task execution, and quality review |

### Key design decisions

**Authority hierarchy over ambiguity.** When files conflict, the rules 
are explicit: `plan.md` wins for "what to build", `executionnotes.md` 
wins for "what was built", `prompt_guidelines.md` wins for "how to build".

**STOP conditions as first-class citizens.** Most prompts are written 
for success paths. This framework engineers failure paths explicitly — 
named STOP categories, quoted triggers, required resolution before 
proceeding.

**Anti-hallucination by design.** Models are forbidden from assuming 
files exist, inferring behavior from filenames, or proceeding without 
verified evidence. Copy don't paraphrase. Verify don't assume.

**Self-improving loop.** Every correction during a session gets appended 
to `lessons.md` as a dated pattern with root cause and rule. Reviewed 
at the start of every session.

This methodology is fully documented and transferable. If you're working 
on multi-model or long-horizon AI-assisted development, the `tasks/` 
folder is designed to be adapted to other projects.

---

A task- and calendar-centric work management system with document intelligence, OCR extraction, and ML-assisted field suggestion. Designed for **explicitness**, **auditability**, and **derived views**.

> **Portfolio project** — built to demonstrate end-to-end product and engineering thinking across a realistic, multi-version feature arc. Not commercialised.

Core philosophy:
- **Tasks are the source of truth** — calendar is derived and disposable
- **No state mutation without explicit user action**
- **Audit-first correctness** — all changes logged with before/after snapshots
- **Derived data is non-binding** — OCR, ML suggestions, and calendar events never overwrite confirmed data
- **Immutable confirmed baselines** — confirmed extraction data is never re-processed

---

## Stack

**Frontend**
- Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4
- React Big Calendar (drag-and-drop scheduling), TanStack Table, react-pdf

**Backend**
- NestJS 11 + Drizzle ORM + PostgreSQL 16 with pgvector
- JWT auth via httpOnly cookies, CSRF protection on mutations
- Argon2 password hashing

**ML & Document Pipeline**
- OCR: PaddleOCR + PyMuPDF (FastAPI worker)
- ML inference: Qwen 2.5 1.5B via Ollama
- RAG: pgvector cosine similarity for few-shot injection from confirmed baselines
- Preprocessor: OpenCV-based image enhancement for scanned documents

**Infrastructure**
- Docker Compose multi-container orchestration
- Drizzle migrations (always run inside container)

---

## Services

| Container | Purpose | Exposed Port |
|---|---|---|
| `todo-web` | Next.js frontend | 3001 |
| `todo-api` | NestJS backend | 3000 |
| `todo-db` | PostgreSQL 16 + pgvector | 5432 |
| `todo-ocr-worker` | PaddleOCR + PyMuPDF | internal (4000) |
| `todo-ml-service` | Ollama inference + RAG | internal (5000) |
| `todo-preprocessor` | Document image enhancement | internal (6000) |
| `ollama` | Qwen 2.5 1.5B + nomic-embed-text | internal |

---

## Features

### Core Task Management (v1–v7)
- Task CRUD with scheduling, categories, and bulk operations
- Drag-and-drop calendar scheduling with configurable working hours
- Parent-child task relationships and workflow stage definitions
- Remarks system with threaded history
- Audit logging for all mutations (immutable, before/after snapshots)

### Attachments & OCR (v3.5)
- File upload/download with OCR extraction trigger
- PaddleOCR + PyMuPDF dual-path extraction (native PDF text vs. scanned)
- OpenCV preprocessing for low-quality scans

### Extraction Baselines & Field Library (v8.1, v8.6)
- Admin-managed field definitions with versioned schema and immutable keys
- Field status lifecycle (active / hidden / archived)
- Draft → reviewed → confirmed → archived baseline lifecycle
- Transactional confirmation: auto-archives previous confirmed baseline
- Partial unique constraint: only one confirmed baseline per attachment (DB-enforced)
- Audit logging for all lifecycle transitions

### ML Field Suggestion & Learning Loop (v8.9–v8.10)
- Qwen 2.5 1.5B via Ollama for schema-aware field value extraction
- RAG injection from confirmed baselines using pgvector similarity
- Zone-aware text serialization and prompt building
- Per-field confidence tiers (HIGH / MED / LOW_CONF tagging)
- A/B model selection with suggestion outcome tracking
- Online performance gate: activation requires ≥N accepted suggestions, hit rate ≥ threshold
- Volume-triggered automation gate (D3)
- Training worker: extraction examples written from confirmed baselines (L1/L4)
- Embed-on-confirm: pgvector embeddings updated at confirmation (M1–M4)

### Self-Healing Document Intelligence (v8.12)
- Alias engine: maps variant field names to canonical keys
- Contextual correction tracking with mandatory correction reasons
- Keyword anchoring for zone-ambiguous fields
- Rule management UI (30s auto-refresh)

### Semantic Search (v8.11)
- pgvector-powered semantic task/attachment search
- Cosine similarity ranking with configurable threshold
- Full search UI at `/search`

### Document-Type Intent Layer (v8.13)
- Document-type admin UI for managing recognized document types
- Per-type field scoping: only relevant fields suggested per document type
- Zone classifier integration for automatic document type detection

---

## Key Routes

| Route | Description |
|---|---|
| `/` | Task dashboard with bulk operations |
| `/calendar` | Drag-and-drop calendar scheduling |
| `/search` | Semantic search |
| `/activity` | Audit log viewer |
| `/attachments/[id]/review` | OCR review + baseline confirmation (keyboard flow) |
| `/task/[id]` | Task detail: remarks, attachments, history |
| `/admin` | User search + password reset |
| `/admin/ml` | ML performance dashboard (15s auto-refresh) |
| `/admin/ml/performance` | Model comparison, confidence histogram, activation gates |
| `/admin/rules` | Alias / correction rule management |
| `/admin/document-types` | Document type admin |
| `/customizations` | Categories, working hours, settings |
| `/profile` | User profile |

---

## Repo Structure

```
apps/
  api/           NestJS backend (src/ modules below)
    src/
      auth/            JWT + cookie auth, CSRF
      todos/           Task CRUD, scheduling, bulk ops
      categories/      Category management
      audit/           Immutable audit logging
      attachments/     File upload/download/OCR trigger
      ocr/             OCR service wrapper
      baseline/        Baseline lifecycle (draft → confirmed)
      field-library/   Field definitions + versioning
      ml/              Field suggestion, outcome tracking, performance gates
      search/          pgvector semantic search
      admin/           Admin APIs
    drizzle/           Drizzle schema + migrations
  web/           Next.js frontend (App Router)
  ml-service/    FastAPI: Ollama inference + RAG
  ocr-worker/    FastAPI: PaddleOCR + PyMuPDF
  preprocessor/  FastAPI: OpenCV image enhancement
seed_corpus/     Gold-standard training examples (one JSON per document type)
tasks/           Planning and execution docs (see Documentation below)
```

---

## Quick Start (Docker)

### 1. Configure environment

Copy the template and fill in real values — **never commit your `.env`**:

```bash
cp .env.example .env
# Edit .env — replace every CHANGE_ME placeholder with a real value
```

Key variables to configure:

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Database password |
| `JWT_SECRET` | Random secret — see `.env.example` for generation command |
| `ADMIN_EMAIL` | Bootstrap admin account email |
| `ADMIN_PASSWORD` | Bootstrap admin account password (**required** — app will not start without it) |

### 2. Build & run

```bash
docker compose up --build
```

Ollama will pull `qwen2.5:1.5b` and `nomic-embed-text` on first start — allow a few minutes.

### 3. Access

| Service | URL |
|---|---|
| Web UI | http://localhost:3001 |
| API | http://localhost:3000 |
| Database | localhost:5432 |

### 4. Database migrations

Migrations run automatically on API startup. To run manually:

```bash
docker compose exec api npx drizzle-kit migrate
```

> **Never run migrations on the host.** Always run inside the container.

---

## Development Notes

- **Hot reload does not work on Windows Docker** — always restart the relevant container after code changes:
  ```bash
  docker restart todo-api   # wait ~40s, then: docker logs todo-api --tail 5
  docker restart todo-web
  ```
- **DB access:** `docker exec todo-db psql -U todo -d todo_db -c "..."`
- **Date extraction:** Use `getFullYear/getMonth/getDate` (local parts). Never use `toISOString().split('T')[0]` — it shifts dates in non-UTC timezones.

---

## Troubleshooting

If tables or columns are missing after a volume reset or skipped migration, check the migrations in `apps/api/src/db/migrations/`.

---

## Documentation

| File | Purpose |
|---|---|
| [tasks/features.md](./tasks/features.md) | Full feature capability ledger per version |
| [tasks/plan.md](./tasks/plan.md) | Implementation plans with rationale and constraints |
| [tasks/lessons.md](./tasks/lessons.md) | Engineering retrospective + correction patterns |
| [tasks/prompt_guidelines.md](./tasks/prompt_guidelines.md) | AI governance spec — authority hierarchy, STOP conditions |
| [tasks/ai-rules.md](./tasks/ai-rules.md) | Behavioral standards for AI assistants |
| [SECURITY.md](./SECURITY.md) | Security model and disclosure policy |
| [.env.example](./.env.example) | Environment variable reference |

## Screenshots

**Task Detail**
Task view showing remarks, attachments, audit history, and OCR-linked documents in a single workflow interface.
<img width="1801" height="919" alt="image" src="https://github.com/user-attachments/assets/024cc204-1efd-41fd-abe9-6978806c8bc1" />

**Calendar**
Drag-and-drop scheduling derived from task data, with configurable working hours. Calendar state is disposable — tasks are the source of truth.
<img width="1805" height="795" alt="image" src="https://github.com/user-attachments/assets/b7d72427-ec84-4784-a8b5-4c2d7a5a1498" />

**Semantic Search**
pgvector-powered search across tasks and attachments using cosine similarity, returning ranked results by relevance threshold.
<img width="1807" height="908" alt="image" src="https://github.com/user-attachments/assets/bc7246d9-9cee-48b2-9611-b493a6ff24c3" />

**Metrics Dashboard**
ML performance monitoring with real-time stats on suggestion acceptance rates, confidence tier distribution, and activation gate status.
<img width="1809" height="912" alt="image" src="https://github.com/user-attachments/assets/b21505f8-bdbb-4430-8ad8-fc1d2cd94d99" />
<img width="1809" height="821" alt="image" src="https://github.com/user-attachments/assets/1582ba8e-001d-4eea-be69-e42b4de8dd88" />

**Field Library**
Admin-managed field definitions with versioned schema, immutable keys, and status lifecycle (active / hidden / archived).
<img width="1785" height="640" alt="image" src="https://github.com/user-attachments/assets/1f0cf657-a2a0-404a-a7d6-970c58a6a9bc" />

**Document Type Library**
Document type registry controlling per-type field scoping — only relevant fields are suggested per document type.
<img width="1772" height="675" alt="image" src="https://github.com/user-attachments/assets/ef8b87df-3899-4b9b-a5b7-b1e72bfecc76" />
