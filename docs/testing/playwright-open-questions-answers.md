# Playwright Open Questions & Answers
(Status per evidence; UNKNOWN only when repo lacks proof)

A) JWT payload shape & persona truth — ? Confirmed
- JWT validate returns `{ userId, email, mustChangePassword, role, isAdmin }` mapped from DB — `apps/api/src/auth/jwt.strategy.ts` validate().
- User defaults role=user/isAdmin=false in schema — `apps/api/src/db/schema.ts` users table.

B) Admin/role checks (AdminGuard logic) — ? Confirmed (user.isAdmin)
- AdminGuard throws Forbidden unless `request.user.isAdmin` — `apps/api/src/auth/auth.guard.ts`.
- Admin routes guard stack `JwtAuthGuard, CsrfGuard, AdminGuard` — `apps/api/src/admin/admin.controller.ts` class decorator.
- Workflow controller is `@UseGuards(JwtAuthGuard)` with per-route AdminGuard on definition/template CRUD and list; execution routes (`POST /workflows/:id/execute`, `POST /workflows/executions/:executionId/steps/:stepId/action`) run without AdminGuard (Jwt only) — `apps/api/src/workflows/workflows.controller.ts`.

C) CSRF details — ? Confirmed
- Cookie name `todo_csrf`, header `x-csrf-token` (lowercased) — `apps/api/src/common/csrf.ts` constants.
- Guard enforces header==cookie for non-GET when authenticated — `CsrfGuard.canActivate` same file.
- Controllers with CsrfGuard: todos, categories, settings, attachments, remarks, admin, audit — see `@UseGuards(JwtAuthGuard, CsrfGuard)` in respective controller files. Notably **workflows controller lacks CsrfGuard** (risk for mutations).
- Frontend injects header from cookie via `applyCsrfHeader` — `apps/web/app/lib/api.ts`.

D) Register/login UI reality — ? Confirmed
- `/` renders `LoginForm` when `!auth.me` — `apps/web/app/page.tsx` early return.
- `useAuth.register` hits `/auth/register` then `/auth/login`; `login` hits `/auth/login`; both set cookies and then refresh `/auth/me` — `apps/web/app/hooks/useAuth.ts`.

E) Forced password change flow & triggers — ? Confirmed
- `mustChangePassword` flag in JWT; pages render `ForcePasswordChange` overlay when true (e.g., `apps/web/app/page.tsx`, `/admin/page.tsx`, `/profile/page.tsx`, workflows pages).
- Bootstrap admin created with `mustChangePassword=true` — `apps/api/src/bootstrap/bootstrap.service.ts` ensureAdminExists().
- Admin password reset sets `mustChangePassword=true` — `apps/api/src/admin/admin.service.ts` resetUserPassword().

F) Admin bootstrap/promotion paths — ? Confirmed
- Bootstrap seeds admin using env `ADMIN_EMAIL/ADMIN_PASSWORD` with role=admin,isAdmin=true — `apps/api/src/bootstrap/bootstrap.service.ts`.
- Admin can promote/demote via `/admin/users/:id/toggle-admin` — `apps/api/src/admin/admin.controller.ts` + `admin.service.ts`.

G) Data reset/seed strategies — ? Confirmed
- Categories defaults seed endpoint `/categories/seed-defaults` guarded auth+CSRF — `apps/api/src/categories/categories.controller.ts` seedDefaults(); UI calls it from Customizations page — `apps/web/app/customizations/page.tsx` handleSeedDefaults().
- Manual DB repair commands documented in `help_fixes.md` (root) for stage columns/OCR table; not automated.

H) Selector readiness (data-testid presence) — ? Not present
- `rg data-testid` in `apps/web/app` returns none (no data-testid attributes). UI elements rely on text/role only.

I) Flake risks — ? Cataloged
- Drag/drop calendar uses dnd-kit + react-big-calendar (`apps/web/app/calendar/page.tsx`) — prone to timing/hover issues.
- OCR worker is remote container call (`apps/api/src/attachments/attachments.controller.ts` uses `OcrService.extractFromWorker`); failures logged/audited, can be slow.
- Time-based UI: audit timestamps formatting (`apps/web/app/activity/page.tsx`), calendar date math; schedule conflicts return 409 from TodosService — `apps/api/src/todos/todos.service.ts` overlap checks.
- Workflows endpoints lack CsrfGuard => potential auth/CSRF mismatch during tests.
