# Playwright Risk Register

- **Drag/drop calendar fragility** (`apps/web/app/calendar/page.tsx` uses dnd-kit + react-big-calendar): pointer math/time slot detection can jitter. Mitigation: prefer API scheduling for setup; keep drag tests minimal (smoke: one drag), add generous pointer move steps and visual asserts on start/end times; fallback to ScheduleModal API (`handleSaveSchedule`).
- **Time determinism**: UI derives “today/this week” filters (`apps/web/app/hooks/useTodos.ts` dateFilter) and activity timestamps (`apps/web/app/activity/page.tsx` formatDate). Mitigation: freeze clock via `page.addInitScript(() => Date.now = () => ...)` or use ISO strings in API setup; assert on relative text cautiously.
- **OCR worker availability** (`apps/api/src/attachments/attachments.controller.ts` triggerOcr/apply): depends on ocr-worker service; failures throw 500 and audit events. Mitigation: mark OCR tests as regression-only; gate on worker health (optional ping to 4000/health) and assert graceful error copy; reuse existing attachment fixture instead of uploading large files.
- **Schedule conflicts/409**: TodosService enforces overlap checks (`apps/api/src/todos/todos.service.ts` schedule/createScheduled). Mitigation: choose non-overlapping times or expect 409 path with assertion; for bulk scheduling use fresh tasks.
- **Permissions redirects**: admin-only pages redirect when `!me.isAdmin` (`apps/web/app/admin/page.tsx`, `workflows/page.tsx`). Mitigation: include explicit permissions suite verifying redirect/forbidden; ensure storageState matches persona.
- **Workflows endpoints missing CSRF guard** (`apps/api/src/workflows/workflows.controller.ts`): mutations may pass without CSRF header; risk of inconsistent helper reuse. Mitigation: still send CSRF header for consistency; flag in audit/integrity tests.
- **Forced password change**: must-change flow blocks all pages when flag set (ForcePasswordChange overlay). Mitigation: storageState generation must resolve flag before running suites; add smoke check to ensure overlay absent post-login.

**Suite priority**
- Smoke: login, create task, schedule via modal, list audit, profile change-password happy path (with CSRF), admin view (only for admin persona), workflows list load.
- Regression: OCR apply remark/description, bulk actions, calendar drag, admin reset password, workflow versioning, element template CRUD, conflict handling.
- Permissions: non-admin barred from `/admin` and `/workflows*`.
- Audit integrity: verify audit log entries after admin reset, OCR apply, workflow actions (controllers call `AuditService.log`).
