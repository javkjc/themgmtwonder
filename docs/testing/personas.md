# Personas

## Standard user (task owner)
- **Identity/session**: `POST /auth/register` and `/auth/login` (see `apps/api/src/auth/auth.controller.ts`) issue an httpOnly JWT cookie named by `COOKIE_NAME` (default `todo_auth`) plus the `todo_csrf` cookie; `apps/api/src/auth/jwt.strategy.ts` validates the token and populates `req.user` with `userId`, `email`, `role`, `isAdmin`, and `mustChangePassword` before the request reaches any controller.
- **Authorization enforcement**: every data controller uses `JwtAuthGuard` plus `CsrfGuard` (`apps/api/src/common/csrf.ts`); `TodosController`, `AttachmentsController`, `RemarksController`, `CategoriesController`, `SettingsController` (GET only), `AuditController` (resource history), and `WorkflowsController` all check `req.user.userId`/ownership before mutating records (`apps/api/src/todos/todos.service.ts`, `apps/api/src/attachments/attachments.service.ts`, `apps/api/src/remarks/remarks.service.ts`).
- **Accessible routes/pages**:
  - `/` (task dashboard, bulk actions) via `apps/web/app/page.tsx`.
  - `/calendar` scheduling drag/drop and the `ScheduleModal` (`apps/web/app/calendar/page.tsx`).
  - `/task/[id]` detail for attachments, OCR, remarks, history (`apps/web/app/task/[id]/page.tsx`).
  - `/profile` for profile/password (`apps/web/app/profile/page.tsx`).
  - All authenticated APIs listed above that verify `userId` before returning data.
- **Forbidden routes/pages**: `/admin`, `/activity`, `/customizations` hide themselves or redirect unless `auth.me.isAdmin` is true (`apps/web/app/admin/page.tsx`, `apps/web/app/activity/page.tsx`, `apps/web/app/customizations/page.tsx`); `AdminController`, `SettingsController` PUTs, and `AuditController` list endpoints all throw 403 via `AdminGuard` (`apps/api/src/auth/auth.guard.ts`).
- **Permitted mutations** (explicit UI actions only): task CRUD/schedule/bulk operations (`TodosController` + `todos.service.ts`), parent/child attach-detach/rules, attachments upload/download/delete, OCR trigger/list/apply (`AttachmentsController` + `ocr.service.ts`), remarks create/delete (`RemarksController` + `create-remark.dto.ts`), categories CRUD (`CategoriesController`), workflow start/step actions (`WorkflowsController`), and reading settings (`SettingsController` GET). No background automation exists because each mutation is tied to a button/modal (`apps/web/app/components/*`).
- **How to create persona for tests**:
  - UI register: `apps/web/app/components/LoginForm.tsx` calls `POST /auth/register` and auto-logs in via `/auth/login`.
  - API: call `POST /auth/register` directly with unique email/password (`apps/api/src/auth/auth.controller.ts`).
  - Direct DB: insert into `users` per `apps/api/src/db/schema.ts` (`email`, `password_hash`, `role`, `is_admin`, `must_change_password`).
- **Default-deny semantics**: new accounts default to `role = 'user'`, `isAdmin = false` (`users` schema) so `AdminGuard` rejects any admin path and the UI never renders the admin nav.

## Admin user (privileged)
- **Identity/session**: same cookie/CSRF flow; `BootstrapService` ensures an admin row exists with `role = 'admin'`, `isAdmin = true`, `mustChangePassword = true`, and credentials from `ADMIN_EMAIL`/`ADMIN_PASSWORD` or the defaults `admin@example.com`/`admin123` (`apps/api/src/bootstrap/bootstrap.service.ts`).
- **Authorization enforcement**: admin-only controllers stack `AdminGuard` on top of `JwtAuthGuard` + `CsrfGuard` (`apps/api/src/auth/auth.guard.ts`), so `AdminController`, admin `SettingsController` PUTs, and `AuditController` listing endpoints require that flag.
- **Accessible routes/pages**: everything Standard users can access plus `/admin` (user resets and toggle admin), `/activity` (audit viewer), `/customizations` (working hours/duration/categories) because each of those components checks `me.isAdmin` before rendering (`apps/web/app/admin/page.tsx`, `apps/web/app/activity/page.tsx`, `apps/web/app/customizations/page.tsx`).
- **Allowed mutations**: same as Standard plus `POST /admin/users/:id/reset-password`, `POST /admin/users/:id/toggle-admin`, `PUT /settings`, `PUT /settings/duration`, and `GET /audit`/`GET /audit/all` for oversight; every admin mutation is logged by `AuditService.log` as seen in the controllers listed above.
- **How to create persona for tests**:
  - Bootstrap seed: `BootstrapService` runs on module init (unless `SKIP_BOOTSTRAP=true`) and logs the default admin password in the server logs (`apps/api/src/bootstrap/bootstrap.service.ts`).
  - API: once an admin exists, use `POST /admin/users/:id/toggle-admin` to promote another user via `AdminService.toggleAdmin`.
  - Direct DB: flip `users.is_admin`/`users.role` via SQL (fields defined at `apps/api/src/db/schema.ts:9-24`).
- **Default-deny semantics**: admin pages/API still require the flag, and the UI/ForcePasswordChange combo (`apps/web/app/components/ForcePasswordChange.tsx`) blocks progress until the bootstrap password is refreshed.

## Permission boundary notes
- **Task ownership**: every task, attachment, remark, and workflow operation compares `req.user.userId` to the row owner before writing (see the repeated `eq(... userId, userId)` calls in `TodosService`, `AttachmentsService`, `RemarksService`, `WorkflowsService`).
- **Workflows**: any authenticated user can hit `/workflows/:id/execute` or `/workflows/executions/:executionId/steps/:stepId/action`, but `WorkflowsService.validateResourceOwnership` only allows them to address their own `todo` records (`apps/api/src/workflows/workflows.service.ts`).
