# Todo + Calendar Planner

A task- and calendar-centric work management system with document intelligence, OCR extraction, and ML-assisted field suggestion. Designed for **explicitness**, **auditability**, and **derived views**.

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

Copy or create a `.env` in the repo root (do **not** commit it):

```env
NODE_ENV=development
API_PORT=3000

POSTGRES_USER=todo
POSTGRES_PASSWORD=todo123
POSTGRES_DB=todo_db
DATABASE_URL=postgres://todo:todo123@db:5432/todo_db

JWT_SECRET=dev_super_secret_change_me
COOKIE_NAME=todo_auth
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

OCR_WORKER_BASE_URL=http://ocr-worker:4000
ML_SERVICE_URL=http://ml-service:5000

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=12341234
```

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

If tables or columns are missing after a volume reset or skipped migration, refer to [help_fixes.md](./help_fixes.md).

---

## Documentation

| File | Purpose |
|---|---|
| [tasks/plan.md](./tasks/plan.md) | Authoritative implementation plan (single source of truth) |
| [tasks/features.md](./tasks/features.md) | Feature roadmap and capability reference |
| [tasks/session-state.md](./tasks/session-state.md) | Current execution position |
| [tasks/codemapcc.md](./tasks/codemapcc.md) | Codebase navigation and file ownership |
| [tasks/lessons.md](./tasks/lessons.md) | Mistakes to avoid |
