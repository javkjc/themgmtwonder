## v8.7 � Table Review for Structured Document Data

**Date:** 2026-02-09  
**Scope:** Add user-driven table review (create, edit, validate, confirm, and list tables) on the review page with backend enforcement, auditability, and utilization locking.  
**Principles:** Minimal localized changes. Backend authoritative. No new dependencies. No background automation. Preserve auditability-first.

---

## 0) Preconditions / Guardrails

**Prerequisites:**
- ? v8.6 baseline review flow complete and verified.  
  - Evidence: `tasks/executionnotes.md` entry �2026-02-09 - v8.6 Milestone Completion & Quality Audit�.
- ? Baseline services and validators exist (FieldAssignmentValidatorService, BaselineManagementService, BaselineAssignmentsService).  
  - Evidence: `tasks/codemapcc.md` Backend Map and Data Model Map.
- ? Review page exists at `/attachments/[attachmentId]/review`.  
  - Evidence: `tasks/codemapcc.md` Frontend Map.
- ? Review `tasks/lessons.md` for v8.7 patterns before starting.

**Out of Scope:**
- ? Automatic table detection without user selection or explicit action.
- ? AI-guessed field mappings or auto-filled column assignments.
- ? Formula/calculated columns or mass transformations.
- ? Background table extraction or auto-confirmation.
- ? New UI/data grid dependencies beyond lightweight React table libraries. ✅ `@tanstack/react-table` v8.21.3 added as the table editing dependency for v8.7.
- ? v8.8 ML suggestions, v8.9 training pipeline, v8.10+ features.

**STOP Events (Halt Execution & Request Clarification):**
- **STOP - Missing Infrastructure:** If `extraction_baselines` or `field_library` is missing from `apps/api/src/db/schema.ts` or not documented in `tasks/codemapcc.md`.
- **STOP - Missing File/Codemap Entry:** If required modules/paths are not listed in `tasks/codemapcc.md` and cannot be verified.
- ~~**STOP - New Dependency Request:**~~ ✅ **RESOLVED (2026-02-09):** `@tanstack/react-table` v8.21.3 installed in `apps/web/package.json` for table editing UI (Task C2).
- **STOP - Ambiguous Requirement:** If table size limits, validation rules, or confirmation constraints conflict between `features.md` and existing baseline rules.
- **STOP - Scope Creep:** If work requires automatic table detection beyond user-selected segments or v8.8+ ML suggestions.

---

## 1) Data Model & Backend Core (P0)

> **Context:** Establish authoritative storage and enforcement for table baselines before UI work.

### A1 – Table Data Model (Milestone 8.7.1) ([Complexity: Medium])

**Status:** ✅ Completed on 2026-02-09 (Verified 2026-02-09)

**Problem statement**  
We need durable storage for tables, cells, and column mappings tied to a baseline, including validation state and auditability.

**Files / Locations**
- Backend:
  - `apps/api/src/db/schema.ts` � add `baseline_tables`, `baseline_table_cells`, `baseline_table_column_mappings`.
  - `apps/api/src/db/migrations/` � add forward and rollback migrations.
- Docs:
  - `tasks/codemapcc.md` � update Data Model Map with new tables, columns, and indexes.

**Implementation plan**
1. Add `baseline_tables` with status enum (`draft`, `confirmed`), counts, label, and confirmation fields.
2. Add `baseline_table_cells` with row/column indices, validation status, error text, and correction metadata.
3. Add `baseline_table_column_mappings` linking `columnIndex` to `fieldKey`.
4. Add unique constraints and indexes:
   - `baseline_tables`: unique `(baselineId, tableIndex)`.
   - `baseline_table_cells`: unique `(tableId, rowIndex, columnIndex)` + index `(tableId, validationStatus)`.
   - `baseline_table_column_mappings`: unique `(tableId, columnIndex)` + index `(tableId)`.
5. Update `tasks/codemapcc.md` data model section.

**Checkpoint A1 � Verification**
- Manual:
  - Confirm tables appear in `apps/api/src/db/schema.ts` with columns and indexes as specified.
- DB:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('baseline_tables', 'baseline_table_cells', 'baseline_table_column_mappings')
ORDER BY table_name;
```
  Expected result: all three tables present.
- Logs:
  - API boots without schema errors after migration.
- Regression:
  - Existing baseline assignments and OCR review still load.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### A2 � Table Management Service (Milestone 8.7.2) ([Complexity: Complex])

**Status:** ✅ Completed on 2026-02-09

**Problem statement**
Provide backend operations for creating tables, updating cells, deleting rows, mapping columns, and confirming tables with full validation and auditability.

**Files / Locations**
- Backend:
  - `apps/api/src/baseline/table-management.service.ts` � new service.
  - `apps/api/src/baseline/baseline-management.service.ts` � add table-related checks if needed.
  - `apps/api/src/baseline/field-assignment-validator.service.ts` � reuse validation rules.
  - `apps/api/src/audit/audit.service.ts` � add table audit events.
- Docs:
  - `tasks/codemapcc.md` � add service to Backend Map.

**Implementation plan**
1. Implement `createTable(baselineId, userId, options)` with baseline ownership + draft/reviewed guard.
2. Insert `baseline_tables` row and batch insert `baseline_table_cells`.
3. Implement `assignColumnToField(tableId, columnIndex, fieldKey, userId)`:
   - Validate field exists in `field_library`.
   - Update/insert column mapping.
   - Validate all cells in column using `FieldAssignmentValidatorService`.
4. Implement `updateCell(tableId, rowIndex, columnIndex, value, userId, correctionReason?)`:
   - Require correctionReason when overwriting existing value.
   - Apply validation if column mapped.
5. Implement `deleteRow(tableId, rowIndex, userId, reason)`:
   - Require reason; delete row; renumber subsequent rows.
6. Implement `confirmTable(tableId, userId)`:
   - Block if any cell invalid.
   - Set table status to `confirmed`, record timestamps/user.
7. Add audit events for each action (`table.create`, `table.cell.update`, `table.row.delete`, `table.column.assign`, `table.confirm`).

**Checkpoint A2 � Verification**
- Manual:
  - Create table then map a column; invalid cells show `validationStatus='invalid'` with error.
  - Attempt to confirm with invalid cells ? 400 with explicit message.
- DB:
```sql
SELECT status, row_count, column_count
FROM baseline_tables
WHERE id = '<TABLE_ID>';
```
  Expected result: status transitions `draft` ? `confirmed` only after all cells valid.
- Logs:
  - Audit log includes `action='table.column.assign'` with `tableId`, `columnIndex`, `fieldKey`.
- Regression:
  - Baseline field assignments still validate as before.

**Estimated effort:** 3 hours  
**Complexity flag:** Complex = GPT-4o required

### A3  Baseline Confirmation Guard for Tables (Milestone 8.7.7 dependency) ([Complexity: Medium])

**Status:** ✅ Completed on 2026-02-09

**Problem statement**  
Baseline confirmation must be blocked when any table tied to that baseline is still in draft.

**Files / Locations**
- Backend:
  - `apps/api/src/baseline/baseline-management.service.ts` � add guard in `confirmBaseline`.
  - `apps/api/src/baseline/baseline.controller.ts` � return clear error message.
- Docs:
  - `tasks/codemapcc.md` � update BaselineManagementService notes.

**Implementation plan**
1. Query for any `baseline_tables` with `status='draft'` for the baseline.
2. If found, block confirmation with detailed message listing ALL draft tables:
   - Single table: `Cannot confirm baseline: Table "<label or Table #N>" is not confirmed`
   - Multiple tables: `Cannot confirm baseline: 2 tables are not confirmed: "Line Items", "Tax Summary"`
   - Return 400 with { error: "...", draftTables: [{ id, label, status }] }
3. Ensure guard runs before baseline confirm transaction.

**Checkpoint A3 � Verification**
- Manual:
  - Create draft table and attempt baseline confirm ? blocked with explicit message.
  - Confirm all tables ? baseline confirm succeeds.
- DB:
```sql
SELECT status FROM baseline_tables WHERE baseline_id = '<BASELINE_ID>';
```
  Expected result: all `confirmed` before baseline confirm.
- Logs:
  - Audit shows `baseline.confirm` only after table confirmations complete.
- Regression:
  - Baseline confirm still archives previous confirmed baseline.

**Estimated effort:** 1-2 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 2) Table API Surface (P0)

> **Context:** Expose table CRUD endpoints to the review UI with strict validation.

### B1 � Table Controller + DTOs (Milestone 8.7.3) ([Complexity: Medium])

**Status:** ✅ Completed on 2026-02-09

**Problem statement**  
The UI needs a stable API to create tables, edit cells, delete rows, map columns, and confirm tables.

**Files / Locations**
- Backend:
  - `apps/api/src/baseline/table.controller.ts` � new controller.
  - `apps/api/src/baseline/dto/` � new DTOs for create/update/assign/delete.
- Docs:
  - `tasks/codemapcc.md` � update Backend Map with routes and DTOs.

**Implementation plan**
1. Add endpoints:
   - `POST /baselines/:baselineId/tables`
   - `GET /baselines/:baselineId/tables`
   - `GET /tables/:tableId`
   - `DELETE /tables/:tableId`
   - `PUT /tables/:tableId/cells/:rowIndex/:columnIndex`
   - `DELETE /tables/:tableId/rows/:rowIndex`
   - `POST /tables/:tableId/columns/:columnIndex/assign`
   - `POST /tables/:tableId/confirm`
2. Enforce size and security limits:
   - Max table size: 1000 rows × 50 columns (50,000 cells hard limit)
   - Cell value max length: 5000 characters (reject with 400 if exceeded)
   - Table label max length: 255 characters
   - SQL injection prevention: Use parameterized queries exclusively (NEVER string interpolation)
   - XSS prevention: HTML-escape cell values before rendering (use React's default escaping)
   - Validate row/column indices: Integers only, reject non-numeric input
3. Enforce ownership and baseline utilization lockout.
4. Standardize error shape consistent with v8.6.
5. Update `tasks/codemapcc.md` with endpoint list.

**Checkpoint B1 � Verification**
- Manual:
  - Create table with invalid size (e.g., 0 rows) ? 400 with explicit error.
  - Map column to nonexistent fieldKey ? 400 `Field not found`.
- DB:
```sql
SELECT count(*)
FROM baseline_table_cells
WHERE table_id = '<TABLE_ID>';
```
  Expected result: rowCount * columnCount inserted.
- Logs:
  - No 500s for invalid input; errors use 4xx.
- Regression:
  - Existing baseline endpoints still return as before.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### B2 � Table Read Models (Milestone 8.7.3) ([Complexity: Simple])

**Status:** ✅ Completed on 2026-02-09

**Problem statement**  
The UI needs table data grouped by row plus current column mappings and validation status.

**Files / Locations**
- Backend:
  - `apps/api/src/baseline/table-management.service.ts` � read helpers.
  - `apps/api/src/baseline/table.controller.ts` � response shaping.
- Docs:
  - `tasks/codemapcc.md` � document response shapes.

**Implementation plan**
1. Ensure `GET /tables/:tableId` returns `{ table, cells: Cell[][], columnMappings }`.
2. Ensure `GET /baselines/:baselineId/tables` returns list + mapping summary.
3. Include validation status and error per cell.

**Checkpoint B2 � Verification**
- Manual:
  - Create table, fetch `GET /tables/:id` ? rows grouped by index with correct values.
- DB:
```sql
SELECT row_index, column_index, validation_status
FROM baseline_table_cells
WHERE table_id = '<TABLE_ID>'
ORDER BY row_index, column_index;
```
  Expected result: row/column ordering matches API response.
- Logs:
  - No N+1 query warnings in logs.
- Regression:
  - Review page still loads baseline and segments.

**Estimated effort:** 1-2 hours  
**Complexity flag:** Simple = GPT-4o-mini OK

---

## 3) Review Page UI  Table Creation & Editor (P0)

> **Context:** Allow users to create tables from selected segments and edit/validate them in place.

### C1  Table Creation Modal (Milestone 8.7.4) ([Complexity: Medium])

**Status:** ✅ Completed on 2026-02-09

**Problem statement**  
Users need an explicit flow to create a table from selected text segments, with manual row/column control.

**Files / Locations**
- Frontend:
  - `apps/web/app/components/tables/TableCreationModal.tsx` – Creation UI with auto-detection preview.
  - `apps/web/app/components/tables/TableEditorPanel.tsx` – Full-screen grid editor using TanStack Table v8.
  - `apps/web/app/components/tables/TableConfirmationModal.tsx` – Summary and confirmation for locked tables.
  - `apps/web/app/components/ocr/ExtractedTextPool.tsx` – added checkboxes for multi-select and select-all.
  - `apps/web/app/attachments/[attachmentId]/review/page.tsx` – added "Create Table" button and modal integration.
- Frontend API:
  - `apps/web/app/lib/api/tables.ts` – new API client for table operations.
- Docs:
  - `tasks/codemapcc.md` – updated with new components and API client.

**Implementation plan**
1. Add selection UI to `ExtractedTextPool` (checkboxes per segment + select all).
2. Add "Create Table from Selection" button (visible only when baseline status is `draft` or `reviewed`).
3. Modal supports **Option A (Auto-detect)** and **Option B (Manual)**:
   - **Option A (Auto-detect, Enhanced Preview):**
     - Use spacing heuristics only:
       - Row breaks: vertical gap > 1.5x median line height of selected segments.
       - Column breaks: horizontal gap > 3x median character width.
     - Build a preview grid (read-only) from the detected rows/columns.
     - Display preview grid with color-coded cell confidence:
       - Green borders: High confidence detected cells
       - Red borders: Ambiguous cells (low confidence < 0.7)
     - Modal shows detection summary: "Detected X rows × Y columns"
   - **Option B (Manual):**
     - Input row count (1-1000), column count (1-50), optional label.
4. On submit, call `POST /baselines/:baselineId/tables` with `cellValues`.
5. On success, show toast and refresh baseline data. (Opening the Table Editor panel is part of Task C2).
**Checkpoint C1  Verification**
- Manual:
  - Select segments – open modal – choose **Auto-detect** – preview grid shows inferred rows/columns.
  - Select segments – open modal – choose **Manual** – create 3x3 table – success toast.
  - Attempt create when baseline is confirmed – button hidden.
- DB:
```sql
SELECT table_label, row_count, column_count
FROM baseline_tables
WHERE baseline_id = '<BASELINE_ID>'
ORDER BY created_at DESC
LIMIT 1;
```
  Expected result: row/column counts and label match modal input.
- Logs:
  - No client errors during modal open/submit.
- Regression:
  - Extracted text pool still supports hover highlight.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

### C2: Table Editor Panel (Milestone 8.7.5) [COMPLETED]
([Complexity: Complex])

**Problem statement**  
Users must edit cells, map columns to fields, and resolve validation errors within a focused table editor.

**Files / Locations**
- Frontend:
  - `apps/web/app/components/tables/TableEditorPanel.tsx` – new editor panel.
  - `apps/web/app/components/tables/TableConfirmationModal.tsx` – confirm modal.
  - `apps/web/app/attachments/[attachmentId]/review/page.tsx` – toggle between FieldAssignmentPanel and TableEditorPanel.
  - `apps/web/app/components/ValidationConfirmationModal.tsx` – reuse for invalid cell corrections.
- Frontend API:
  - `apps/web/app/lib/api/tables.ts` – updateCell, deleteRow, assignColumn, confirmTable.
- Docs:
  - `tasks/codemapcc.md` – add components/clients.

**Implementation plan**
1. ✅ **Table Component Choice (2026-02-09):** `@tanstack/react-table` v8.21.3 selected and installed
   - Rationale: Headless UI library, flexible, well-maintained, TypeScript-first
   - Package added to `apps/web/package.json`
   - Docker container rebuilt to include dependency
2. Grid features required:
   - Inline cell editing (click – edit – blur to save)
   - Keyboard navigation (Arrow keys, Tab, Enter)
   - Row selection via checkboxes
   - Validation indicators (red border + error icon)
3. Render table grid with editable cells.
4. Column header dropdown for field mapping (typeahead from Field Library list).
5. Cell editing with field-type-specific inputs:
   - If column mapped to field:
     - `varchar`: Standard text input
     - `int`: Number input (no decimals, step=1)
     - `decimal`: Number input with decimal support
     - `date`: Date picker (native HTML5 or existing date component)
     - `currency`: Text input with uppercase transform + ISO 4217 validation hint
   - If column unmapped: Text input (validation pending)
6. On cell edit:
   - PUT to update cell; if overwriting, prompt for correction reason.
   - Render validation status (green for valid, red with tooltip for invalid).
7. Row delete:
   - Checkbox select + reason modal; delete rows sequentially.
8. Validation status bar with error count and –Show Errors– filter.
9. –Confirm Table– button enabled only when errors = 0.

**Checkpoint C2 – Verification**
- Manual:
  - Map column to `int` field; invalid cell shows error tooltip.
  - Edit invalid cell – becomes valid; error count decreases.
  - Delete row with reason – row removed and indices renumbered.
- DB:
```sql
SELECT row_index, column_index, cell_value, validation_status
FROM baseline_table_cells
WHERE table_id = '<TABLE_ID>'
ORDER BY row_index, column_index;
```
  Expected result: updated values and validation statuses match UI.
- Logs:
  - Client shows explicit error message on 409 correction reason required.
- Regression:
  - FieldAssignmentPanel still works when table editor closed.

**Estimated effort:** 3-4 hours
**Complexity flag:** Complex = GPT-4o required

### C3 – Table Confirmation UI (Milestone 8.7.6) ([Complexity: Medium])

**Status:** ✅ Completed on 2026-02-09

**Problem statement**  
Confirmed tables must become read-only with a clear confirmation modal and audit trail.

**Files / Locations**
- Frontend:
  - `apps/web/app/components/tables/TableConfirmationModal.tsx` – confirm dialog.
  - `apps/web/app/components/tables/TableEditorPanel.tsx` – lock inputs on confirmed.
- Backend:
  - `apps/api/src/baseline/table-management.service.ts` – confirm logic (from A2).

**Implementation plan**
1. Confirm modal with row/column count summary and –I understand– checkbox.
2. POST `/tables/:id/confirm` and update UI state.
3. After confirm, lock all cell edits, mappings, and row deletions.
4. Show read-only banner with confirmed metadata.
5. Add export functionality for confirmed tables:
   - Show "Export to CSV" button in table editor toolbar (confirmed tables only)
   - Generate CSV with:
     - Header row: Column field labels (from columnMappings)
     - Data rows: Cell values from baseline_table_cells ordered by rowIndex, columnIndex
   - Download triggers with filename: `{baselineId}_{tableLabel}_{timestamp}.csv`
   - Sanitize CSV content (escape quotes, commas)

**Checkpoint C3 – Verification**
- Manual:
  - Confirm table – UI locks and displays –Table confirmed on <date> by <user>–.
  - Attempt edit after confirm – blocked with tooltip.
- DB:
```sql
SELECT status, confirmed_at, confirmed_by
FROM baseline_tables
WHERE id = '<TABLE_ID>';
```
  Expected result: status `confirmed` with timestamps.
- Logs:
  - Audit entry action `table.confirm` present.
- Regression:
  - Baseline confirmation still blocked until all tables confirmed (A3).

**Estimated effort:** 2-3 hours
**Complexity flag:** Medium = GPT-4o preferred

### C4 – Table List Panel + Multi-Table Switching (Milestone 8.7.7) ([Complexity: Medium])

**Problem statement**  
Users need to view and switch between multiple tables, and see status/validation at a glance.

**Files / Locations**
- Frontend:
  - `apps/web/app/components/tables/TableListPanel.tsx` – new list panel.
  - `apps/web/app/attachments/[attachmentId]/review/page.tsx` – render list and editor.
- Frontend API:
  - `apps/web/app/lib/api/tables.ts` – list tables for baseline.

**Implementation plan**
1. Add sidebar list –Tables (N)– with table label, size, status, and error count.
2. Open table on click; keep editor state per table.
3. Allow delete for draft tables only (confirm modal).
4. Provide –Create Table– shortcut in list panel.

**Checkpoint C4 – Verification**
- Manual:
  - Create two tables – list shows both with correct labels and counts.
  - Confirm one table – status badge green, other remains draft.
- DB:
```sql
SELECT id, table_label, status, row_count, column_count
FROM baseline_tables
WHERE baseline_id = '<BASELINE_ID>'
ORDER BY table_index;

```
  Expected result: list matches UI.
- Logs:
  - No console errors when switching tables.
- Regression:
  - Review page mobile tabs still function.

**Estimated effort:** 2-3 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 4) Utilization & Locking (P1)

> **Context:** Table edits must lock after utilization, consistent with baseline rules.

### D1 – Table Utilization Tracking (Milestone 8.7.8) ([Complexity: Medium])

**Problem statement**  
When table data is used for authoritative purposes, the baseline must be locked and the utilization recorded with table context.

**Files / Locations**
- Backend:
  - `apps/api/src/baseline/baseline-management.service.ts` – extend utilization to accept `tableId` metadata.
  - `apps/api/src/audit/audit.service.ts` – add `table.utilized.*` or extend baseline utilization logs.
  - `apps/api/src/baseline/table-management.service.ts` – check utilization before any mutations.
- Frontend:
  - `apps/web/app/components/tables/TableEditorPanel.tsx` – show utilized banner and lock UI.
  - `apps/web/app/components/tables/TableListPanel.tsx` – show lock icon.
- Docs:
  - `tasks/codemapcc.md` – update utilization notes.

**Implementation plan**
1. Extend baseline utilization metadata to include table-specific context:
   - `tableId`: UUID of the utilized table
   - `tableLabel`: User-assigned label (if any)
   - `rowCount`: Number of rows at time of utilization
   - `columnCount`: Number of columns at time of utilization
   - `recordId`: ID of created record (for Category A utilization)
   - `exportFormat`: CSV/Excel/etc. (for Category C utilization)
2. Reject table mutations when baseline is utilized (403 with explicit message).
3. In UI, render read-only banner: –Baseline locked due to utilization–.
4. Update utilization indicator to include table context:
   - "– Table 'Line Items' used to create 12 invoice records"
   - Click – Modal with details: Which table, which records, when, by whom

**Checkpoint D1 – Verification**
- Manual:
  - Simulate utilization and verify table editor becomes read-only.
  - Attempt update after utilization – 403 and UI toast.
- DB:
```sql
SELECT utilized_at, utilization_type, utilization_metadata
FROM extraction_baselines
WHERE id = '<BASELINE_ID>';
```
  Expected result: utilization metadata includes tableId.
- Logs:
  - Audit entry includes `tableId` and `utilizationType`.
- Regression:
  - Baseline assignments still lock on utilization.

**Estimated effort:** 2 hours  
**Complexity flag:** Medium = GPT-4o preferred

---

## 4.5) Performance Requirements & Optimization (Non-Functional)

>### **Context:** Ensure table operations meet user expectations for responsiveness.

**Backend Performance Targets:**
- Create table: < 500ms for 100 rows × 10 columns (1000 cell inserts)
- Load table: < 300ms for 100 rows × 10 columns (use JOINs, avoid N+1)
- Update cell: < 100ms (single UPDATE + validation)
- Bulk column validation: < 1s for 1000 cells

**Frontend Performance Targets:**
- Initial grid render: < 500ms for 100 visible rows
- Virtual scrolling: Render only visible rows + 50-row buffer
- Scroll performance: 60 FPS (16ms per frame)
- Cell edit optimistic update: < 50ms (background save)

**Implementation Notes:**
- Use database indexes on `(tableId, rowIndex, columnIndex)` and `(tableId, validationStatus)`
- Batch cell inserts during table creation (single transaction)
- Use virtual scrolling for tables > 100 rows
- Implement optimistic UI updates for cell edits

**Verification:**
- Use browser DevTools Performance profiler for grid rendering
- Measure API response times via logs or APM tool
- Test with table size: 100 rows × 20 columns (2000 cells)

**D2 Performance Checklist (Run After D1)**
- [ ] Create table: < 500ms for 100 rows × 10 columns (1000 cell inserts)
- [ ] Load table: < 300ms for 100 rows × 10 columns
- [ ] Update cell: < 100ms (single UPDATE + validation)
- [ ] Bulk column validation: < 1s for 1000 cells
- [ ] Initial grid render: < 500ms for 100 visible rows
- [ ] Virtual scrolling: only visible rows + 50-row buffer
- [ ] Scroll performance: 60 FPS (16ms per frame)
- [ ] Cell edit optimistic update: < 50ms (background save)

---

## 5) Execution Order (Do Not Skip)

**Critical path dependencies:**
1. **A1** Table data model – No dependencies.
2. **A2** Table management service – Depends on A1.
3. **A3** Baseline confirm guard – Depends on A1 (tables exist).
4. **B1** Table controller + DTOs – Depends on A2.
5. **B2** Table read models – Depends on B1.
6. **C1** Table creation modal – Depends on B1 and review page baseline data.
7. **C2 [COMPLETED]**: Table Editor Panel (Grid UI, API wiring, keyboard nav)
8. **C3** Table confirmation UI – Depends on C2 and A2.
9. **C4** Table list panel – Depends on C1 and B2.
10. **D1** Table utilization tracking – Depends on A2 and baseline utilization infra (v8.6).

**Parallel execution opportunities:**
- A3 can run in parallel with B1 after A1 is complete.
- C4 can run in parallel with C2 after C1 and B2 are complete.
- D1 can run after A2 while UI work proceeds.

**Blocking relationships:**
- UI table editor (C2/C3) is BLOCKED until table APIs (B1/B2) are complete.
- Baseline confirm remains BLOCKED by A3 until all tables confirmed.
- Utilization UI lockout (D1) BLOCKED until backend utilization checks exist.

---

## 6) Definition of Done

**Feature Completeness:**
- Table data model exists with correct constraints and indexes.
- Users can create, edit, validate, and confirm tables from the review page.
- Column mappings enforce field validation for all cells.
- Multiple tables can be created and switched without losing state.
- Baseline confirmation is blocked unless all tables are confirmed.
- Utilization locks all table edits and is visible in UI.

**Data Integrity:**
- ? Unique constraints on `(baselineId, tableIndex)` and `(tableId, rowIndex, columnIndex)` prevent duplicates.
- ? All edits require explicit correction reason when overwriting values.
- ? Audit logs capture table creation, edits, deletions, mappings, and confirmation.

**No Regressions:**
- ? API boots without errors (`npm run build` in `apps/api`).
- ? Web builds without errors (`npm run build` in `apps/web`).
- ? API boots without errors in Docker (`docker compose exec api npm run build`).
- ? Web builds without errors in Docker (`docker compose exec web npm run build`).
- ? Existing review page field assignment flow still works.

**Documentation:**
- ? `tasks/codemapcc.md` updated with new tables, endpoints, and components.
- ? `tasks/executionnotes.md` updated with completion evidence for v8.7 tasks.

---

## 6.5) Automated Testing Requirements

**Unit Tests (Jest/Vitest):**
- `TableManagementService`:
  - � createTable: Valid input creates table + cells
  - � updateCell: Correction reason required when overwriting
  - � deleteRow: Subsequent rows renumbered correctly
  - � assignColumnToField: Triggers bulk validation
  - � confirmTable: Blocked when validation errors exist
- `FieldAssignmentValidator`:
  - � Bulk validation: All character_types (varchar, int, decimal, date, currency)
  - � Edge cases: Empty string, null, max length (5000 chars), special characters

**Integration Tests (API-level):**
- Table lifecycle: Create � Map columns � Edit cells � Confirm � Utilize � Verify lock
- Multiple tables: Create 3 tables � Confirm 2 � Attempt baseline confirm (expect 400)
- Concurrent edits: Two users editing different cells (optimistic locking, no race conditions)

**E2E Tests (Playwright/Cypress):**
1. Create table from selection � Map columns � Fix validation errors � Confirm
2. Create 2 tables � Confirm table 1 � Edit table 2 � Confirm table 2 � Confirm baseline
3. Confirm table � Simulate utilization � Attempt edit (expect 403 toast message)
4. Delete row � Verify renumbering in UI � Confirm table � Export CSV (verify row count matches)

**Coverage Target:** 80% for new services (TableManagementService, table.controller.ts)

---

## 7) Manual Test Checklist (Run After Each Checkpoint)

**Smoke Tests (Run After Every Task):**
- [ ] API boots: `cd apps/api && npm run build` ? no errors.
- [ ] Web builds: `cd apps/web && npm run build` ? exit code 0.
- [ ] Login flow works: Navigate to `/login` ? enter credentials ? redirects to `/`.

**Task Group A � Backend:**
- [ ] Create table via API ? verify `baseline_tables` and `baseline_table_cells` rows created.
  - Steps: POST `/baselines/:baselineId/tables` with 2x2 grid ? GET `/tables/:id` ? see 2 rows x 2 columns.
- [ ] Column mapping validation
  - Steps: Map column to `int` field ? enter `abc` ? validation error returned.

**Task Group C � UI:**
- [ ] Create table from selection
  - Steps: Select segments ? click �Create Table� ? set 3x3 ? create ? editor opens with 3x3 grid.
- [ ] Cell edit + correction reason
  - Steps: Edit cell value twice ? second edit prompts for correction reason ? save succeeds.
- [ ] Confirm table
  - Steps: Resolve all validation errors ? click �Confirm Table� ? modal confirm ? table locks.

**Integration Tests (Run After All Tasks Complete):**
- [ ] Create two tables ? confirm one ? baseline confirm blocked with explicit table name.
- [ ] Confirm all tables ? baseline confirm succeeds ? task detail shows confirmed status.
- [ ] Utilize baseline ? table editor locked with utilization banner.

**Regression Tests:**
- [ ] Field assignment panel still works when no table is open.
- [ ] OCR review page loads segments and hover highlight still works.

---

## 8) Post-Completion Checklist

- [ ] Update `tasks/executionnotes.md` with:
  - [ ] Completion date
  - [ ] What was built (reference task IDs)
  - [ ] Any deviations from plan (with reasons)
  - [ ] Lessons learned (add to `tasks/lessons.md` if applicable)
- [ ] Update `tasks/codemapcc.md` with new file paths, endpoints, and tables
- [ ] Run full regression suite
- [ ] Tag commit: `git tag v8.7 -m "Table Review for Structured Document Data complete"`

---
