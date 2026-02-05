# Todo + Calendar Planner

A task- and calendar-centric work management system designed for **explicitness**, **auditability**, and **derived views**.

Core philosophy:
- **Tasks are the source of truth**
- **Calendar is a derived, disposable view**
- **No state mutation without explicit user action**
- **Audit-first correctness**

---

## Stack

**Frontend**
- Next.js (App Router), React, TypeScript

**Backend**
- NestJS + Drizzle ORM

**Database**
- PostgreSQL 16

**Auth**
- JWT via **httpOnly cookies**
- CSRF protection enforced for mutation requests

**Infrastructure**
- Docker Compose (Web → API → DB)
- OCR worker runs as a **separate container** (FastAPI) when enabled

---

## Current Features

### ✅ Core Task Management (v1-v5)
- Task CRUD with scheduling, categories, and bulk operations
- Drag-and-drop calendar scheduling with working hours
- Parent-child task relationships
- Task stages and workflow definitions
- Audit logging for all mutations

### ✅ Attachments & OCR (v3.5 + v8.1)
- File upload/download with OCR extraction
- Extraction review UI with provenance tracking
- Correction history with mandatory reasons
- Utilization-based editing lockout
- Draft/confirmed/archived lifecycle

### ✅ Field Library (v8.6.1-8.6.3)
- Admin-managed field definitions
- Versioned field schema with immutable keys
- Field status lifecycle (active/hidden/archived)
- CRUD APIs with audit logging

### 🚧 Extraction Baselines (v8.6.4-8.6.5) — **IN PROGRESS**
- **✅ v8.6.4:** Baseline data model with partial unique constraints
- **✅ v8.6.5:** Baseline state machine (draft → reviewed → confirmed → archived)
  - Transactional confirmation with auto-archiving
  - Audit logging for all lifecycle transitions
  - Service-layer implementation (no UI yet)
- **⏳ v8.6.6+:** Baseline confirmation UI, field assignments, utilization tracking

---

## Repo Structure (high level)

- `apps/api` — NestJS API + Drizzle schema/migrations
  - `src/baseline/` — Baseline lifecycle management (v8.6.5)
  - `src/field-library/` — Field definitions and CRUD (v8.6.1-8.6.3)
  - `src/ocr/` — OCR extraction and review logic
  - `src/audit/` — Audit logging service
- `apps/web` — Next.js web app
- `apps/ocr-worker` — OCR worker service (FastAPI + PaddleOCR CPU)
- `tasks/plan.md` — authoritative execution contract
- `tasks/features.md` — product intent/pipeline (non-authoritative ordering)
- `tasks/executionnotes.md` — append-only evidence of completed work
- `tasks/codemapcc.md` — navigation/index to avoid repo-scanning

---

## Baseline State Machine (v8.6.5)

The baseline lifecycle enforces strict state transitions for extraction baselines:

```
draft → reviewed → confirmed → archived
```

**Key Features:**
- **Transactional confirmation:** Confirming a new baseline automatically archives the previous confirmed baseline (atomic operation)
- **Partial unique constraint:** Only one confirmed baseline allowed per attachment (enforced at DB level)
- **Audit logging:** All transitions emit audit events (baseline.create/review/confirm/archive)
- **Service-layer only:** No controllers/endpoints yet (deferred to v8.6.6+)

**Methods:**
- `createDraftBaseline(attachmentId, userId)` — Creates new draft baseline
- `markReviewed(baselineId, userId)` — Transitions draft → reviewed
- `confirmBaseline(baselineId, userId)` — Transitions reviewed → confirmed (transactional)
- `archiveBaseline(baselineId, userId, reason?)` — Transitions confirmed → archived

---

## Quick Start (Docker)

### 1) Configure environment
Create a `.env` in repo root (do **not** commit it). It should include your DB + API values used by docker-compose.

### 2) Build & run
```bash
docker compose up --build
```

### 3) Access the application
- **Web UI:** http://localhost:3001
- **API:** http://localhost:3000
- **Database:** PostgreSQL on port 5432

### Troubleshooting

If your local database is missing tables or columns (e.g. after volume resets or skipped migrations), refer to the manual recovery commands in [help_fixes.md](./help_fixes.md).

---

## Documentation

- **[plan.md](./tasks/plan.md)** — Authoritative implementation plan (single source of truth)
- **[features.md](./tasks/features.md)** — Feature roadmap and capability reference
- **[executionnotes.md](./tasks/executionnotes.md)** — Execution evidence (append-only)
- **[codemapcc.md](./tasks/codemapcc.md)** — Codebase navigation and file ownership
