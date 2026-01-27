## Code Quality
- **Strengths**
  - Global `ValidationPipe` with whitelist/transform prevents payload pollution (`apps/api/src/main.ts`).
  - DTO validators cover auth and todo inputs, including scheduling bounds (`apps/api/src/auth/dto/*.ts`, `apps/api/src/todos/dto/*.ts`).
  - Scheduling uses transactional overlap checks to avoid conflicting events (`apps/api/src/todos/todos.service.ts`).
  - Consistent audit logging service available to controllers for traceability (`apps/api/src/audit/audit.service.ts`).
- **Weaknesses**
  - Default admin email/password are hardcoded and logged on startup, exposing credentials (`apps/api/src/bootstrap/bootstrap.service.ts`).
  - JWT/Cookie secrets are not validated at boot; app can start with `JWT_SECRET` undefined (`apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/auth.controller.ts`).
  - Missing/not-found todos return `{ error }` with 200 instead of proper HTTP errors (`apps/api/src/todos/todos.controller.ts`).
  - Attachment endpoints lack validation and use sync filesystem ops without error handling (`apps/api/src/attachments/attachments.controller.ts`, `apps/api/src/attachments/attachments.service.ts`).
- **Recommendations**
  - Require admin credentials from env, never log passwords, and fail fast if missing.
  - Enforce presence/strength of `JWT_SECRET` and cookie settings at bootstrap; default to secure/sameSite=strict in production.
  - Use Nest exceptions for 4xx/5xx paths so clients get correct status codes.
  - Add file type/size validation and async error-handled storage for attachments.

## DRY/WET
- **Strengths**
  - Shared `DbService`/Drizzle schema centralizes data access (`apps/api/src/db/db.service.ts`, `apps/api/src/db/schema.ts`).
  - React hooks consolidate API access for auth, todos, settings (`apps/web/app/hooks/*.ts`).
- **Weaknesses**
  - Duration limits defined separately in backend and multiple frontend files, risking drift (`apps/api/src/common/constants.ts`, `apps/web/app/lib/constants.ts`, `apps/web/app/lib/durationSettings.ts`).
  - Default categories duplicated between backend seed and frontend constants (`apps/api/src/categories/categories.service.ts`, `apps/web/app/lib/constants.ts`).
  - Audit logging payloads are hand-built in each controller instead of a shared helper (`apps/api/src/todos/todos.controller.ts`, `apps/api/src/categories/categories.controller.ts`, `apps/api/src/auth/auth.controller.ts`).
  - Task page bypasses `apiFetchJson` and hardcodes `http://localhost:3000` for attachments, creating config duplication (`apps/web/app/task/[id]/page.tsx`).
  - Extensive inline styling repeated within components instead of shared styles (`apps/web/app/task/[id]/page.tsx`).
- **Recommendations**
  - Generate shared config (duration bounds, categories, API base) from a single source or env-driven module for both apps.
  - Provide an audit logging helper/decorator to standardize payloads.
  - Route all API calls through a single client and central base URL; remove hardcoded hosts.
  - Extract shared style tokens/components and reduce inline style repetition.

## Stability & Reliability
- **Strengths**
  - System settings bootstrap guards min/max/default invariants on startup (`apps/api/src/bootstrap/bootstrap.service.ts`, `apps/api/src/settings/settings.service.ts`).
  - Audit trail covers auth, todo, category, and admin actions (`apps/api/src/audit/audit.service.ts`).
  - Scheduling operations use row locks and conflicts checks to maintain consistency (`apps/api/src/todos/todos.service.ts`).
- **Weaknesses**
  - No rate limiting or account lockout on login/register, leaving brute-force exposure (`apps/api/src/auth/auth.controller.ts`).
  - Cookie-based auth lacks CSRF protection and defaults to lax security flags; tokens are long-lived (7d) with no rotation (`apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/auth.controller.ts`).
  - Attachments accept any file type/size and write synchronously without rollback, risking resource exhaustion and partial writes (`apps/api/src/attachments/attachments.service.ts`).
  - Database pool created without health checks/retries or SSL options; missing required envs cause runtime throws (`apps/api/src/db/db.service.ts`).
- **Recommendations**
  - Add throttling/lockout and structured login failure logging; consider captcha for repeated failures.
  - Enable CSRF mitigation (sameSite=strict + CSRF token) and shorten token lifetime with refresh/rotation.
  - Enforce upload limits, MIME/extension allowlists, antivirus scanning, and transactional cleanup; use async streaming storage.
  - Introduce health endpoints, pool/backoff configuration, and env schema validation to fail before serving traffic.

## Optimization & Performance
- **Strengths**
  - Useful indexes on todos and audit logs plus query limits reduce common query costs (`apps/api/src/db/schema.ts`).
  - Duration settings fetched once and cached client-side to cut repeat requests (`apps/web/app/lib/durationSettings.ts`).
- **Weaknesses**
  - Synchronous filesystem reads/writes for attachments block the event loop (`apps/api/src/attachments/attachments.service.ts`).
  - Admin user search returns all rows with no pagination or max limit (`apps/api/src/admin/admin.service.ts`).
  - Audit log `listAll` trusts client-supplied limit/offset without bounding, enabling expensive scans (`apps/api/src/audit/audit.service.ts`).
  - Task detail page triggers multiple sequential fetches instead of batching (`apps/web/app/task/[id]/page.tsx`).
- **Recommendations**
  - Switch to async/streaming file handlers (multer disk/storage service) and move heavy files off the API node.
  - Add pagination and sane upper bounds for admin and audit queries.
  - Batch parallel fetches (task, attachments, history) and memoize where possible to cut latency.

## Maintainability
- **Strengths**
  - Clear Nest module boundaries for auth/todos/categories/settings aid navigability (`apps/api/src/*/*.module.ts`).
  - Typed Drizzle schema and React hooks provide consistent contracts between layers (`apps/api/src/db/schema.ts`, `apps/web/app/hooks/*.ts`).
- **Weaknesses**
  - `apps/web/app/task/[id]/page.tsx` is a monolithic, >1000-line component with mixed concerns and inline styles, making changes risky.
  - Stray directory `apps/web/Ctodo-dockerappsweb` suggests tooling/path issues and adds noise.
  - Automated tests are effectively absent beyond the Nest scaffold (`apps/api/src/app.controller.spec.ts`); no coverage for core flows.
  - Hardcoded localhost endpoints complicate deployment/config management (`apps/web/app/task/[id]/page.tsx`, `apps/web/app/lib/durationSettings.ts`).
- **Recommendations**
  - Decompose the task page into focused components (details, attachments, history, notifications) and move styling into CSS modules or a design system.
  - Remove the stray path artifact and add lint/CI checks to catch unexpected files.
  - Add integration/e2e tests for auth, todo CRUD, scheduling conflicts, and attachments; wire into CI.
  - Centralize environment/config handling (e.g., zod schema) and consume via a single client to ease deployment.
## Code Quality
- **Strengths**
  - Global `ValidationPipe` with whitelist/transform/forbidNonWhitelisted prevents payload pollution (`apps/api/src/main.ts`).
  - DTOs validate auth/todo inputs including scheduling bounds (`apps/api/src/auth/dto/*.ts`, `apps/api/src/todos/dto/*.ts`).
  - Scheduling uses row locks/overlap checks inside transactions to avoid conflicts (`apps/api/src/todos/todos.service.ts`).
  - Audit logging is plumbed through controllers for traceability across features (`apps/api/src/audit/audit.service.ts`).
  - Drizzle schema types keep DB access strongly typed (`apps/api/src/db/schema.ts`).
- **Weaknesses**
  - Default admin credentials are hardcoded and logged at startup (`apps/api/src/bootstrap/bootstrap.service.ts`); allows credential leakage.
  - `JWT_SECRET`/cookie settings are not required or validated at boot; app can run insecurely (`apps/api/src/auth/auth.module.ts`, `.env`).
  - Missing/not-found todos return 200 with `{ error }` instead of HTTP 404 (`apps/api/src/todos/todos.controller.ts`).
  - Attachments lack validation, use sync fs writes, and have no error handling or size/type checks (`apps/api/src/attachments/*.ts`).
  - Calendar/task pages use extensive inline styles and large monolithic components (>1000 LOC) reducing readability (`apps/web/app/task/[id]/page.tsx`, `apps/web/app/calendar/page.tsx`, `apps/web/app/page.tsx`).
  - Hardcoded localhost URLs bypass shared API client for uploads (`apps/web/app/task/[id]/page.tsx`).
- **Recommendations**
  - Require admin creds via env, never log passwords; fail fast if absent.
  - Add config schema (zod/env) to enforce `JWT_SECRET`, cookie flags, DB URL, CORS origins; default secure/sameSite=strict in production.
  - Return proper HTTP exceptions for 404/400 paths in todos and attachments.
  - Add file type/size allowlist, async storage with error handling, and virus scanning hook for uploads.
  - Break down oversized pages into smaller components and move styling to shared CSS/theme tokens.
  - Route all API calls (including attachments) through a single client/base URL.

## DRY/WET
- **Strengths**
  - Shared DbService/Drizzle schema centralize data access (`apps/api/src/db/db.service.ts`, `apps/api/src/db/schema.ts`).
  - React hooks encapsulate API access and state (auth, todos, settings, audit, duration) (`apps/web/app/hooks/*.ts`).
- **Weaknesses**
  - Duration bounds duplicated across backend constants and multiple frontend files (`apps/api/src/common/constants.ts`, `apps/web/app/lib/constants.ts`, `apps/web/app/lib/durationSettings.ts`).
  - Default categories duplicated in frontend constants and backend seeding (`apps/web/app/lib/constants.ts`, `apps/api/src/categories/categories.service.ts`).
  - Audit log payloads are hand-built in each controller; risk of inconsistent fields (`apps/api/src/*/*controller.ts`).
  - Inline style blocks repeat typography/spacing across many components.
  - Hardcoded API base URLs duplicated (`apps/web/app/lib/api.ts` vs direct fetches).
- **Recommendations**
  - Generate shared config (duration limits, category list, API base) from a single shared module/env-driven package consumed by API and web.
  - Provide an audit logging helper/decorator to standardize payloads and automatically capture ip/userAgent.
  - Centralize styling via CSS modules/tokens and extract reusable UI components.
  - Ensure all network calls use `apiFetchJson` (or similar) with base URL from env.

## Stability & Reliability
- **Strengths**
  - System settings bootstrap validates min/max/default invariants (`apps/api/src/bootstrap/bootstrap.service.ts`, `apps/api/src/settings/settings.service.ts`).
  - Audit trail covers auth/todo/category/admin actions (`apps/api/src/audit/audit.service.ts`).
  - Todos scheduling conflict detection protects data integrity (`apps/api/src/todos/todos.service.ts`).
- **Weaknesses**
  - No rate limiting, lockout, or captcha on login/register; brute-force risk (`apps/api/src/auth/auth.controller.ts`).
  - Cookies are lax/secure=false by default; CSRF protection absent; JWT tokens valid 7 days with no rotation (`.env`, `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/auth.controller.ts`).
  - Attachments can exhaust disk/CPU via unbounded size/type and sync IO; no cleanup on DB failures (`apps/api/src/attachments/*.ts`).
  - DB pool created without health checks/retries/SSL; missing envs cause runtime throw instead of startup fail (`apps/api/src/db/db.service.ts`).
  - Frontend relies on localStorage notifications and lacks error boundaries; some fetch flows ignore failures (history/attachments) leading to silent data loss.
- **Recommendations**
  - Add throttling/lockout per IP/user and log auth failures; consider captcha after N failures.
  - Enforce secure cookies in non-dev, add CSRF token or sameSite=strict + double-submit, shorten JWT expiry and add refresh/rotation.
  - Enforce upload limits (size/count), MIME/extension allowlist, AV scan, async streaming storage with transactional rollback.
  - Add DB health check endpoint and connection retry/backoff; validate env at boot and exit early if missing/weak.
  - Add React error boundaries and surfaced errors for secondary fetches (history/attachments).

## Optimization & Performance
- **Strengths**
  - Useful DB indexes on todos/audit and query limits by default (`apps/api/src/db/schema.ts`, `apps/api/src/audit/audit.service.ts`).
  - Duration settings cached client-side to reduce repeat calls (`apps/web/app/lib/durationSettings.ts`).
- **Weaknesses**
  - Attachments use blocking fs operations on the request thread (`apps/api/src/attachments/attachments.service.ts`).
  - Admin user search returns all users when query empty; no pagination cap (`apps/api/src/admin/admin.service.ts`).
  - Audit list endpoints trust client limit/offset without max bounds, risking large scans (`apps/api/src/audit/audit.service.ts`).
  - Large React pages fetch serially and do redundant state updates; no memoization for derived lists (`apps/web/app/task/[id]/page.tsx`, `apps/web/app/page.tsx`, `apps/web/app/calendar/page.tsx`).
  - Unbounded local search/filter happens on every render; could be memoized/debounced (`apps/web/app/page.tsx`).
- **Recommendations**
  - Move attachments to async streaming storage (multer disk/S3) and offload scanning.
  - Add pagination and upper limits to admin/audit queries; default sensible page sizes.
  - Batch or parallelize task/attachments/history fetches; memoize filtered lists.
  - Consider virtualized task list/calendar rendering for large datasets.

## Maintainability
- **Strengths**
  - Nest modules clearly separated by domain (`apps/api/src/*/*.module.ts`).
  - Hooks and typed DTOs provide consistent contracts between client and server.
- **Weaknesses**
  - `apps/web/app/task/[id]/page.tsx` and `apps/web/app/calendar/page.tsx` are monolithic with mixed concerns and inline styles, increasing cognitive load.
  - Stray directory `apps/web/Ctodo-dockerappsweb` indicates tooling/path issues and adds repo noise.
  - Minimal automated tests beyond scaffold; no coverage for auth, scheduling, categories, attachments (`apps/api/src/app.controller.spec.ts` only).
  - Environment secrets in `.env` are weak defaults (e.g., `dev_super_secret_change_me`, `todo123`) and lack per-env separation.
  - Hardcoded localhost URLs hamper deployment flexibility (`apps/web/app/lib/api.ts`, `apps/web/app/task/[id]/page.tsx` uploads).
- **Recommendations**
  - Refactor large pages into composable components (details, attachments, history, notifications) with shared styling system.
  - Remove stray path directory and add lint/CI checks for unexpected artifacts.
  - Add integration/e2e tests for auth, todo CRUD/scheduling conflicts, categories, attachments, and admin password reset; integrate in CI.
  - Use env schema + per-environment config; generate `.env.example` without real secrets and enforce strong defaults.
  - Centralize base URLs via env and use a single HTTP client across the web app.
