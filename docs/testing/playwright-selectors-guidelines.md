# Playwright Selectors Guidelines
## Existing selector inventory
- Search for `data-testid` in the repo returns zero hits, meaning tests currently rely on text content, DOM order, and styles (`rg -n "data-testid" -n`).

## Proposed `data-testid` additions (path + element + reason)
1. `apps/web/app/components/LoginForm.tsx`
   - Wrap the login/register form in an element with `data-testid="auth-form"` and add `data-testid` to the email field (`input[type=email]`), password field, and submit button; this lets tests distinguish between login, register, and reset modes without brittle text matching.
2. `apps/web/app/page.tsx`
   - Add `data-testid="create-task-button"` to the "Create Task" button, `data-testid="tasks-table-row"` to each `<tr>` inside `TasksTable`, and `data-testid` attributes on the bulk action buttons (`onSchedule`, `onUnschedule`, `onDelete`); these keep smoke/regression tests anchored while the table layout may change.
3. `apps/web/app/calendar/page.tsx`
   - Mark the calendar container drop zone with `data-testid="calendar-grid"`, the unscheduled panel toggle with `data-testid="unscheduled-panel-toggle"`, and the unschedule drop target with `data-testid="unschedule-zone"` so drag/drop tests have explicit handles.
4. `apps/web/app/task/[id]/page.tsx`
   - Instrument the attachments drop zone (`handleDrop` area) with `data-testid="attachments-dropzone"`, the upload button with `data-testid="attachments-upload"`, the OCR trigger button for each attachment with `data-testid="attachment-ocr-trigger"`, and the OCR apply buttons with `data-testid="ocr-apply-remark"`/`...-description"` so OCR flows can be asserted without relying on emoji icons.
5. `apps/web/app/admin/page.tsx`
   - Tag each user row with `data-testid="admin-user-row"`, the reset button with `data-testid="admin-reset-password"`, and the admin toggle with `data-testid="admin-toggle-admin"` to simplify permission regression coverage.
6. `apps/web/app/activity/page.tsx`
   - Add `data-testid="activity-filter"` to the action filter buttons so audit-tier tests can target filters without brittle label text.

## Naming convention
- Prefer `kebab-case` identifiers composed of the component/context and action (e.g., `create-task-button`, `attachment-ocr-trigger`).
- Prefix per page when necessary (`admin-`, `calendar-`).
- Keep values stable across translations/UX tweaks by avoiding visible text (use semantic contexts instead).
- Store selectors centrally (e.g., `tests/playwright/selectors.ts`) so components can be referenced from multiple tests.
