# Playwright Test Plan (implementation-ready)

## Suites & Cases

### Smoke
- **SMK-01 Login + CSRF seed (standard)** — Persona: standard; Route `/`; Preconditions: none; Steps: open `/`, fill auth-email/password, click auth-submit (LoginForm); Assertions: redirects to task list, `auth.me` exists (via `/auth/me` response), `todo_csrf` cookie present; Backend check: `GET /auth/me` JSON includes userId/email/role. Flake: low; Selectors: auth-email, auth-password, auth-submit.
- **SMK-02 Create task via modal** — Persona: standard; Route `/`; Preconditions: logged-in storageState; Steps: click create-task-button, fill title, submit; Assertions: new row appears in tasks-table, persists after reload; Backend: `GET /todos` contains title. Risk: CSRF; Selectors: create-task-button, task-row.
- **SMK-03 Schedule task via modal (no drag)** — Persona: standard; Preconditions: task exists; Steps: open task schedule from row (task-schedule), set date/time in ScheduleModal, save; Assertions: scheduled badge/time renders, reload persists; Backend: `GET /todos/:id` startAt set. Flake: time math; use ISO time. Selectors: task-schedule, schedule-save (to add), schedule-modal fields.
- **SMK-04 Customizations save working hours** — Persona: standard; Route `/customizations`; Steps: adjust working hours inputs, click working-hours-save; Assertions: success toast, reload shows saved values; Backend: `GET /settings` returns new hours. Selectors: working-hours-save.
- **SMK-05 Activity log loads** — Persona: standard; Route `/activity`; Preconditions: create one task to generate audit; Steps: open route; Assertions: audit row present, pagination works; Backend: `/audit` returns same ids. Selectors: list text (no testids).
- **SMK-06 Admin users list** — Persona: admin; Route `/admin`; Steps: open page, search (admin-search-input/button), verify table renders; Backend: `/admin/users` returns matching count. Selectors: admin-search-input/button.
- **SMK-07 Workflows list view** — Persona: admin; Route `/workflows`; Steps: load page; Assertions: table rows render (or empty state), buttons present; Backend: `GET /workflows` status 200. Selectors: workflow-view, workflows-create.
- **SMK-08 Force-password overlay absent** — Persona: both; Preconditions: storageState after password change; Steps: open `/`; Assertions: ForcePasswordChange component not rendered; Backend: `/auth/me` mustChangePassword=false.

### Regression
- **REG-01 Bulk mark done** — Persona: standard; Create 2 tasks; Steps: select rows, click bulk done; Assertions: both show done, reload persists; Backend: `/todos/bulk/done` 200 and `/todos` done=true.
- **REG-02 Calendar drag schedule** — Persona: standard; Preconditions: unscheduled task; Steps: drag drag-task-card onto calendar-grid slot; Assertions: event appears; Backend: `/todos/:id` startAt updated. Flake: high; Mitigation: pause for drag settle.
- **REG-03 OCR apply remark** — Persona: standard; Preconditions: task with attachment and OCR output (trigger via task-ocr-run, wait, else mock?); Steps: click task-ocr-apply-remark; Assertions: remark added and visible; Backend: `/remarks/todo/:id` includes OCR text. Risk: worker availability.
- **REG-04 Admin reset password** — Persona: admin; Steps: open `/admin`, open reset modal for another user, confirm; Assertions: temp password displayed, target user mustChangePassword=true via `/admin/users`; Backend: `/admin/users/:id/reset-password` audit entry exists (`/audit` action=admin.reset_password).
- **REG-05 Workflow create + edit draft** — Persona: admin; Routes `/workflows/new` then `/workflows/[id]/edit`; Steps: add steps with workflow-add-step, save draft; Assertions: redirected to detail, steps count matches; Backend: `POST /workflows` created, `PUT /workflows/:id` updates.
- **REG-06 Workflow activation toggle** — Persona: admin; Steps: on `/workflows/[id]` click workflow-activate then workflow-deactivate; Assertions: status badges change, versions list updates; Backend: `POST /workflows/:id/activate` and `/deactivate` responses toggle isActive.
- **REG-07 Element template versioning** — Persona: admin; Route `/workflows/elements/[id]`; Steps: click element-create-version, assert new version in list; Backend: `POST /workflows/elements/templates/:id/version` returns new id, GET versions length increases.
- **REG-08 Categories seed defaults** — Persona: standard; Route `/customizations`; Steps: click seed-defaults; Assertions: default categories render; Backend: `/categories` includes seeded names. CSRF required.
- **REG-09 Change password via profile** — Persona: standard; Steps: fill change form, submit; Assertions: success banner, logout occurs; Backend: `/auth/change-password` clears auth cookie, next `/auth/me` 401.

### Permissions
- **PERM-01 Non-admin blocked from Admin page** — Persona: standard; Route `/admin`; Expect redirect to `/` or access denied toast (isForbidden); Backend: `/admin/users` returns 403.
- **PERM-02 Non-admin blocked from Workflows** — Persona: standard; Route `/workflows`; Expect redirect + toast; Backend: `/workflows` 403.
- **PERM-03 AdminGuard present on workflows CRUD** — Persona: admin; Hit `/workflows` success; then repeat call without admin storageState expect 403; ensures guard verified.

### Audit Integrity
- **AUD-01 Task create logged** — Persona: standard; Create task; Assert `/audit` contains action `todo.create` with resourceId task.id (use `useAuditLogs` data).
- **AUD-02 Admin role change logged** — Persona: admin; Toggle admin for user; Assert `/audit` entry `user.role.grant|revoke` with resourceId userId.
- **AUD-03 OCR apply logged** — Persona: standard; Apply OCR; Assert `/audit/resource/:id` includes `ocr.apply.*` entries.

### High-Risk / Special
- **HR-01 Schedule conflict handling** — Persona: standard; Create two tasks, schedule overlapping same slot via API, expect second 409; UI shows error toast; Backend: response 409 from `/todos/:id/schedule`.
- **HR-02 Workflows execute step action (backend only)** — Persona: standard; Precondition: active workflow + execution created via `POST /workflows/:id/execute` (no UI); call `POST /workflows/executions/:executionId/steps/:stepId/action`; Assert status change; Note: endpoints lack CsrfGuard, still send header for consistency.

For each case list required selectors from proposed plan; ensure CSRF header set for all non-GET where CsrfGuard is applied.
