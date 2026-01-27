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

## Repo Structure (high level)

- `apps/api` — NestJS API + Drizzle schema/migrations
- `apps/web` — Next.js web app
- `apps/ocr-worker` — OCR worker service (FastAPI + PaddleOCR CPU)
- `plan.md` — authoritative execution contract (v3 only)
- `features.md` — product intent/pipeline (non-authoritative ordering)
- `executionnotes.md` — append-only evidence of completed work
- `codemapcc.md` — navigation/index to avoid repo-scanning

---

## Quick Start (Docker)

### 1) Configure environment
Create a `.env` in repo root (do **not** commit it). It should include your DB + API values used by docker-compose.

### 2) Build & run
```bash
docker compose up --build
