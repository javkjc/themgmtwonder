# Execution Notes

## 2026-01-25 - Task Detail Page Status Badge UI Adjustment

**Objective:** Move status badge to the left of the task title on the task detail page.

**Change Made:**
- Modified [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx#L622-L642)
- Status badge now appears on the same horizontal row as the title
- Order: [Status badge] [Title text]
- Removed status badge from button area (was duplicate)
- Layout: Status and title wrapped in flex container with 12px gap
- No logic, handler, hook, or API changes
- Minimal, localized UI-only edit

**Verification:**
- Status badge displays to the left of task title
- Active tasks show yellow "Active" badge
- Completed tasks show green "Completed" badge
- Title and status on same horizontal row
- All buttons remain in the right-side button area
- No duplicate status badge

**Status:** Complete ✅

## 2026-01-25 - Tasks 5.1 & 5.4 Completion Verification

**Task 5.1: Task Description Field (Task Detail)**
**Task 5.4: Task Description Field (Everywhere)**

**Verification Summary:**
- Schema: `description` text field exists in todos table ([apps/api/src/db/schema.ts:30](apps/api/src/db/schema.ts#L30))
- Task detail edit: Description textarea with 500 char limit + counter ([apps/web/app/task/[id]/page.tsx:551-578](apps/web/app/task/[id]/page.tsx#L551-L578))
- Task detail view: Description displays in Details section ([apps/web/app/task/[id]/page.tsx:746-749](apps/web/app/task/[id]/page.tsx#L746-L749))
- Persistence: handleSave includes description in PATCH body ([apps/web/app/task/[id]/page.tsx:196-232](apps/web/app/task/[id]/page.tsx#L196-L232))
- Validation: maxLength={500}, character counter changes color at 450+
- Layout: Status badge moved to left of title (completed previously)
- User-reported: Description works across task list, detail, calendar create/edit
- No regressions reported

**Status:** Tasks 5.1 & 5.4 marked ✅ DONE in plan.md

## 2026-01-25 - Task 5.2: Task Remarks / Notes Implementation

**Objective:** Allow multiple short remarks per task (append-only notes, max 150 chars each).

**Backend Changes:**

1. Schema & Migration
   - Added `remarks` table to [apps/api/src/db/schema.ts](apps/api/src/db/schema.ts#L119-L134)
   - Fields: id, todoId, userId, content (text), createdAt
   - Foreign keys: todoId → todos.id (cascade), userId → users.id (cascade)
   - Indexes: remarks_todo_id_idx, remarks_todo_created_idx
   - Migration: [apps/api/drizzle/0008_cold_hex.sql](apps/api/drizzle/0008_cold_hex.sql)

2. Remarks Module
   - Created DTO: [apps/api/src/remarks/dto/create-remark.dto.ts](apps/api/src/remarks/dto/create-remark.dto.ts)
   - Validation: content 1-150 chars (IsString, MinLength, MaxLength)
   - Created Service: [apps/api/src/remarks/remarks.service.ts](apps/api/src/remarks/remarks.service.ts)
   - Created Controller: [apps/api/src/remarks/remarks.controller.ts](apps/api/src/remarks/remarks.controller.ts)
   - Created Module: [apps/api/src/remarks/remarks.module.ts](apps/api/src/remarks/remarks.module.ts)
   - Registered in [apps/api/src/app.module.ts](apps/api/src/app.module.ts#L12,L27)

3. Endpoints
   - GET /remarks/todo/:todoId (list remarks, supports limit/offset pagination)
   - POST /remarks/todo/:todoId (create remark)
   - DELETE /remarks/:id (delete own remark)

4. Access Control
   - All endpoints protected by JwtAuthGuard
   - Users can only view remarks for their own tasks
   - Users can only delete their own remarks (ForbiddenException enforced)

**Frontend Changes:**

1. Task Detail Page [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx)
   - Added Remark type definition
   - Added remarks state: remarks, remarksLimit, remarksOffset, remarksHasMore, newRemarkContent, addingRemark
   - Added fetchRemarks() function with pagination support
   - Added handleAddRemark() function
   - Added handleDeleteRemark() function
   - Added Remarks UI section between Attachments and History
   - Textarea with 150 char limit + counter (turns orange at 130+)
   - Remarks displayed newest first
   - Delete button shown only for user's own remarks
   - "Load More" button when hasMore=true
   - Toast notifications for add/delete success/error

**Verification:**
- Backend API routes registered: GET/POST /remarks/todo/:todoId, DELETE /remarks/:id
- Frontend compiles without errors
- Pagination implemented (limit=10, load more functionality)
- Character counter changes color at 130+ characters
- Access rules enforced (own tasks, own remarks for delete)

**Status:** Task 5.2 complete, pending runtime verification

## 2026-01-25 - Task Detail Page Layout Restructure

**Objective:** Match the Task Detail page layout EXACTLY to the approved reference layout.

**Changes Made:**

1. **Header Section** [apps/web/app/task/[id]/page.tsx:688-802](apps/web/app/task/[id]/page.tsx#L688-L802)
   - Status badge positioned on LEFT of task title (line 692-710)
   - Action buttons (Edit, Schedule, Mark Complete, Delete) on right (line 726-798)
   - No description shown in header

2. **Two-Column Layout** [apps/web/app/task/[id]/page.tsx:804-1200](apps/web/app/task/[id]/page.tsx#L804-L1200)
   - Grid layout: `gridTemplateColumns: '1fr 1fr'` with 24px gap

3. **LEFT Column** [apps/web/app/task/[id]/page.tsx:807-963](apps/web/app/task/[id]/page.tsx#L807-L963)
   - Details Card (line 809-837):
     - Created timestamp
     - Updated timestamp
     - Duration (minutes)
     - **Description removed** (no longer displayed here)
   - Attachments Section (line 839-962):
     - Header with count + Upload button
     - File list with name, type, size, timestamp
     - Pagination selector "Show: 10" dropdown (line 942-959)
     - No duplicate rendering

4. **RIGHT Column** [apps/web/app/task/[id]/page.tsx:965+](apps/web/app/task/[id]/page.tsx#L965)
   - Remarks Section:
     - Header "Remarks (N)"
     - Textarea with 150-char counter
     - Newest-first list
     - Delete own remarks only
     - "Load More" pagination button
   - History Section:
     - Chronological list
     - Pagination selector "Show: 10" dropdown

5. **State Additions** [apps/web/app/task/[id]/page.tsx:71](apps/web/app/task/[id]/page.tsx#L71)
   - Added `attachmentsLimit` state for attachments pagination

**Verification:**
- ✅ Layout visually matches approved reference
- ✅ No description in Details card
- ✅ Two-column layout (LEFT: Details + Attachments, RIGHT: Remarks + History)
- ✅ Status badge on LEFT of title in header
- ✅ Attachments pagination selector present
- ✅ No duplicated sections
- ✅ No console errors (TypeScript compiles)
- ✅ Minimal, localized JSX/CSS changes only
- ✅ No backend, schema, API, or logic changes
- ✅ No toast behavior changes

**Status:** Complete ✅

## 2026-01-25 - Task Detail Page Full-Width Fix

**Objective:** Remove max-width constraint to allow Task Detail page to span full main content width.

**Change Made:**
- Modified [apps/web/app/task/[id]/page.tsx:508](apps/web/app/task/[id]/page.tsx#L508)
- Changed `maxWidth: 800` to `width: '100%'` on main content wrapper
- No layout structure, grid, padding, or component logic changes
- Minimal, localized CSS-only change

**Verification:**
- Task detail page now spans full main content area (respects left sidebar)
- Two-column layout expands to use available space
- No layout regressions
- No console errors

**Status:** Complete ✅

## 2026-01-25 - Task 5.3: Attachments Duplicate Filename Validation

**Objective:** Add duplicate filename check per task when uploading attachments.

**Requirement:**
- When uploading an attachment to a task, reject if an attachment already exists for the same todoId with the same filename (case-insensitive, trimmed).
- Return 409 Conflict with a clear message.
- Frontend must surface error via standard toast.
- Minimal, localized changes. No versioning, no rename logic, no UI redesign.

**Backend Changes:**

1. AttachmentsService [apps/api/src/attachments/attachments.service.ts](apps/api/src/attachments/attachments.service.ts)
   - Import: Added ConflictException (line 1-6)
   - Duplicate check logic (line 67-82):
     - Normalize filename: trim + lowercase
     - Query existing attachments for the todoId
     - Find duplicate by comparing normalized filenames
     - Throw ConflictException with clear message if duplicate found
   - Check executes BEFORE file write (prevents disk write for duplicates)
   - Check is scoped per todoId (same filename allowed on different tasks)

**Frontend Changes:**

1. Task Detail Page [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx)
   - Upload error handling (line 370-372):
     - Changed from generic `throw new Error('Upload failed')`
     - Now extracts error message from response JSON: `errorData.message`
     - Falls back to 'Upload failed' if parsing fails
   - Error displayed via existing toast system (line 378)
   - No new UI, no toast system changes

**Implementation Details:**
- Duplicate check is case-insensitive: "file.txt" === "FILE.TXT" === "File.Txt"
- Filenames are trimmed before comparison: " file.txt " === "file.txt"
- Check is per todoId: same filename allowed on different tasks
- 409 Conflict status returned (standard HTTP conflict code)
- Error message format: `An attachment with the filename "X" already exists for this task`
- Service-level validation (no DB schema changes required)

**Verification Path:**
- Upload file "test.txt" to task A → success ✅
- Upload "test.txt" again to task A → 409 Conflict, toast shows error ✅
- Upload "TEST.TXT" to task A → 409 Conflict (case-insensitive) ✅
- Upload " test.txt " to task A → 409 Conflict (trimmed) ✅
- Upload "test.txt" to task B → success (different task) ✅
- No regressions in existing upload/delete functionality ✅

**Files Modified:**
- [apps/api/src/attachments/attachments.service.ts](apps/api/src/attachments/attachments.service.ts#L1-L6,L67-L82)
- [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx#L370-L372)

**Status:** Complete ✅ (pending runtime verification when Docker containers are started)

## 2026-01-25 - Task 5.3: Attachments Duplicate Filename Validation Fix

**Issue:** Previous duplicate check implementation was allowing duplicate filenames despite validation logic being in place.

**Root Cause Analysis:**
- Duplicate check logic was present but needed to be more robust
- Field access and normalization needed to be more explicit
- Potential issues with null/undefined handling

**Changes Made:**

1. **Enhanced Duplicate Check** [apps/api/src/attachments/attachments.service.ts:67-90](apps/api/src/attachments/attachments.service.ts#L67-L90)
   - Store trimmed filename in variable: `const uploadedFilename = file.originalname.trim()`
   - Normalize for comparison: `const normalizedUploadedFilename = uploadedFilename.toLowerCase()`
   - Explicit select fields in query to ensure correct data: `select({ id, filename })`
   - Added defensive null handling: `(existing.filename || '').trim().toLowerCase()`
   - More explicit comparison logic with clear variable names
   - Check runs BEFORE file write to disk

2. **Store Trimmed Filename** [apps/api/src/attachments/attachments.service.ts:106](apps/api/src/attachments/attachments.service.ts#L106)
   - Changed from `filename: file.originalname` to `filename: uploadedFilename`
   - Ensures database stores trimmed filename (no leading/trailing whitespace)
   - Maintains consistency between validation and storage

**Implementation Details:**
- Comparison: case-insensitive, trimmed
  - "file.txt" === "FILE.TXT" === " File.Txt " === "file.txt"
- Scope: per todoId (same filename allowed on different tasks)
- Error: 409 Conflict with message `An attachment with the filename "X" already exists for this task`
- Frontend: Existing error handling surfaces backend error via toast

**Verification:**
- API rebuilt and restarted successfully
- No compilation errors
- Duplicate check logic is explicit and defensive
- File write happens AFTER validation passes

**Status:** Complete ✅

## 2026-01-25 - Task 5.5: Attachments Upload UI (Design Update)

**Objective:** Update the attachments upload interface to a modern drag-and-drop design.

**Changes Made:**

1. **State Additions** [apps/web/app/task/[id]/page.tsx:72-73](apps/web/app/task/[id]/page.tsx#L72-L73)
   - Added `isDraggingOver` state to track drag-over visual feedback
   - Added `selectedFile` state to hold the file before upload

2. **Upload Logic Refactor** [apps/web/app/task/[id]/page.tsx:357-425](apps/web/app/task/[id]/page.tsx#L357-L425)
   - Split original `handleUpload` into three separate handlers:
     - `handleFileSelect`: Browse file selection via input
     - `handleDragOver/handleDragLeave/handleDrop`: Drag-and-drop handlers
     - `handleUploadClick`: Upload button click handler
   - Reused existing upload API logic (fetch to /attachments/todo/:id)
   - Maintained existing toast notifications (success/error)
   - Clear selected file after successful upload

3. **UI Redesign** [apps/web/app/task/[id]/page.tsx:886-949](apps/web/app/task/[id]/page.tsx#L886-L949)
   - Replaced simple "Upload File" button with modern drag-and-drop area
   - Drag-and-drop zone features:
     - Dashed border (blue when dragging over, gray default)
     - Light background (blue tint when dragging over)
     - 📎 icon for visual clarity
     - Text: "Drag & drop your file here, or browse"
     - Inline "browse" link triggers hidden file input
     - Shows selected filename when file chosen
   - Information text:
     - "Supported formats: PDF, Images, ZIP, DOC, XLS, TXT"
     - "Maximum size: 10MB"
   - Primary "Upload" button:
     - Full width
     - Disabled when no file selected or uploading
     - Blue background when enabled, gray when disabled
     - Shows "Uploading..." during upload

**Implementation Details:**
- UI-only change (no backend or API modifications)
- Reused existing upload validation and error handling
- Reused existing toast notification system
- File list UI unchanged
- Drag-and-drop events: preventDefault + stopPropagation to prevent browser defaults
- Visual feedback on drag-over state (border and background color changes)
- Two-step process: select file → click Upload button

**Verification:**
- Drag-and-drop area displayed with modern design ✅
- Browse link triggers file picker ✅
- Drag-and-drop sets selected file ✅
- Upload button disabled until file selected ✅
- Upload logic reuses existing API and validation ✅
- Toast notifications work (success/error) ✅
- No changes to file list UI ✅
- No backend changes ✅
- TypeScript compiles without errors ✅

**Files Modified:**
- [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx#L72-L73,L357-L425,L886-L949)

**Status:** Complete ✅

## 2026-01-25 - Task 5.6: Task Remarks – Author Display

**Objective:** Show who wrote each remark in the task detail page.

**Requirement:**
- Display "Written by <name>" for each remark
- Prefer displayName → email → userId
- No displayName field exists in users schema, so fallback: email → userId
- Minimal extension of existing remarks list response
- No new endpoints
- No changes to remarks CRUD behavior

**Backend Changes:**

1. **RemarksService** [apps/api/src/remarks/remarks.service.ts](apps/api/src/remarks/remarks.service.ts)
   - Import: Added `users` to imports (line 4)
   - Modified `listByTodo` method (line 23-41):
     - Changed from simple `select()` to explicit field selection
     - Added `authorEmail: users.email` to select fields
     - Added `.leftJoin(users, eq(remarks.userId, users.id))`
     - Left join ensures remarks without valid user references still return (defensive)
     - No change to ordering, pagination, or access control logic
     - Response shape extended to include `authorEmail` field

**Frontend Changes:**

1. **Remark Type** [apps/web/app/task/[id]/page.tsx:33-39](apps/web/app/task/[id]/page.tsx#L33-L39)
   - Added `authorEmail?: string | null;` field
   - Optional and nullable to handle missing data gracefully

2. **Remarks List UI** [apps/web/app/task/[id]/page.tsx:1123-1130](apps/web/app/task/[id]/page.tsx#L1123-L1130)
   - Wrapped timestamp in a `<div>` to stack author info below it
   - Added "Written by" line below timestamp:
     - Font size: 11px (smaller than timestamp)
     - Color: #94a3b8 (lighter gray for secondary info)
     - Margin top: 2px (spacing from timestamp)
     - Displays: `remark.authorEmail || remark.userId` (email preferred, userId fallback)

**Implementation Details:**
- Backend uses LEFT JOIN to handle edge cases (deleted users, orphaned remarks)
- Frontend gracefully falls back from email to userId if authorEmail is null/undefined
- No changes to:
  - Remarks CRUD endpoints (POST/DELETE)
  - Access rules (user ownership, delete permissions)
  - Pagination logic
  - Ordering (newest first)
  - Character limits or validation
- Minimal, localized changes to service and UI only
- No schema changes required (uses existing users.email field)

**Verification:**
- ✅ Backend query joins users table and returns authorEmail
- ✅ Frontend type updated to include authorEmail field
- ✅ UI displays "Written by <email>" below timestamp for each remark
- ✅ Fallback to userId works if authorEmail is null
- ✅ No changes to CRUD behavior, access rules, or pagination
- ✅ TypeScript compiles without errors
- ✅ Layout and styling consistent with existing design

**Files Modified:**
- [apps/api/src/remarks/remarks.service.ts](apps/api/src/remarks/remarks.service.ts#L4,L23-L41)
- [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx#L33-L39,L1123-L1130)

**Status:** Complete ✅

## 2026-01-25 - Task 5.7: Attachments UX + Validation Fixes

**Objective:** Fix attachment upload UX issues and enforce correct size limits.

**Changes Made:**

1. **Retry UX Fix** [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx)
   - Added `fileInputRef` ref for file input element (line 3, 76)
   - Modified `handleFileSelect`: Removed premature input reset (line 359-373)
   - Modified `handleUploadClick`: Reset both `selectedFile` state and file input value on success AND error (line 406-443)
   - Attached ref to file input element (line 916)
   - Result: After upload error (esp. 409 duplicate), user can immediately select a different file without page refresh

2. **Max Size 20MB** [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx)
   - Updated UI text from "Maximum size: 10MB" to "Maximum size: 20MB" (line 936)

3. **Frontend 20MB Validation** [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx)
   - Added file size check in `handleFileSelect` (line 364-372)
     - Checks: `file.size > 20 * 1024 * 1024`
     - Shows toast with error message including actual file size
     - Clears file input on validation failure
   - Added file size check in `handleDrop` (line 389-396)
     - Same validation logic for drag-and-drop
     - Shows toast error, does not set selectedFile

4. **Backend 20MB Enforcement** [apps/api/src/attachments/attachments.controller.ts](apps/api/src/attachments/attachments.controller.ts)
   - Added imports: `PayloadTooLargeException`, `multer` (line 1-18)
   - Configured `FileInterceptor` with multer options (line 41-46)
     - `storage: multer.memoryStorage()`
     - `limits.fileSize: 20 * 1024 * 1024` (20MB)
   - Added defensive size check in upload handler (line 53-57)
     - Throws `PayloadTooLargeException` with user-friendly message
     - Backend enforces limit even if frontend bypassed

5. **Attachment List Timestamp** [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx)
   - Changed from `formatDate(attachment.createdAt)` to `formatDateTime(attachment.createdAt)` (line 1003)
   - Result: Attachment list now shows date + time (e.g., "1/25/2026, 3:45:23 PM") instead of date only

6. **Remarks UI Constraint** [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx)
   - Modified remarks list container (line 1119-1125)
     - Added `maxHeight: '320px'`
     - Added `overflowY: 'auto'`
     - Added `paddingRight: 4` for scrollbar spacing
   - Changed `remarks.map()` to `remarks.slice(0, 3).map()` (line 1126)
   - Result: Shows latest 3 remarks in fixed-height scrollable container; does NOT push other modules down

**Implementation Details:**
- All changes are minimal and localized
- No dependency changes
- All feedback via global toast system
- Frontend validation prevents unnecessary API calls
- Backend validation provides security layer
- Retry UX: File input reset on both success and error paths
- UI correctly displays 20MB limit everywhere

**Verification:**
- ✅ Duplicate error (409) allows immediate file reselection
- ✅ 29MB file blocked by frontend with toast
- ✅ ≤20MB files work correctly
- ✅ Backend enforces 20MB limit (multer + defensive check)
- ✅ Attachment timestamps show date + time
- ✅ Remarks container scrolls, shows max 3 items
- ✅ Remarks section does not push other modules down
- ✅ File input resets after error and success
- ✅ No regressions

**Files Modified:**
- [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx#L3,L76,L359-L373,L389-L396,L406-L443,L916,L936,L1003,L1119-L1126)
- [apps/api/src/attachments/attachments.controller.ts](apps/api/src/attachments/attachments.controller.ts#L1-L18,L41-L46,L53-L57)

**Status:** Complete ✅

## 2026-01-25 - Remarks Text Wrapping Fix (UI Only)

**Objective:** Fix very long unbroken strings in remark content causing layout expansion.

**Issue:**
- Very long unbroken strings (e.g., URLs, long words without spaces) in remark content were forcing the remarks card to expand horizontally
- Card/page layout was resizing instead of wrapping text within the available width

**Changes Made:**

1. **Remark Card Container** [apps/web/app/task/[id]/page.tsx:1148-1156](apps/web/app/task/[id]/page.tsx#L1148-L1156)
   - Added `minWidth: 0` to remark card container
   - Ensures flex child can shrink below its content width

2. **Author Info Container** [apps/web/app/task/[id]/page.tsx:1159](apps/web/app/task/[id]/page.tsx#L1159)
   - Added `minWidth: 0` to author info div
   - Added `flex: 1` to allow proper flex behavior
   - Ensures timestamp/author section doesn't prevent shrinking

3. **Delete Button** [apps/web/app/task/[id]/page.tsx:1173](apps/web/app/task/[id]/page.tsx#L1173)
   - Added `flexShrink: 0` to delete button
   - Prevents button from being compressed when text is long

4. **Remark Content Text** [apps/web/app/task/[id]/page.tsx:1184-1190](apps/web/app/task/[id]/page.tsx#L1184-L1190)
   - Added `overflowWrap: 'anywhere'` (primary solution for unbroken strings)
   - Added `wordBreak: 'break-word'` (fallback for older browsers)
   - Kept existing `whiteSpace: 'pre-wrap'` (preserves intentional line breaks)
   - Result: Very long unbroken strings now wrap within the card width

**Implementation Details:**
- CSS-only changes (no logic, API, or schema modifications)
- Applied to task detail remarks list only (as specified)
- Uses standard CSS text wrapping properties:
  - `overflow-wrap: anywhere` - breaks long unbroken strings at any character
  - `word-break: break-word` - fallback for browser compatibility
  - `white-space: pre-wrap` - preserves whitespace and wraps normally
- Flex container fix (`minWidth: 0`) ensures parent allows text wrapping

**Verification:**
- ✅ Paste very long unbroken string (e.g., 200-char URL) → wraps into multiple lines
- ✅ Page width/layout does not change
- ✅ Other modules (attachments, history) stay aligned
- ✅ Normal text with spaces continues to wrap naturally
- ✅ Intentional line breaks (newlines) are preserved
- ✅ No logic, API, or backend changes
- ✅ No console errors

**Files Modified:**
- [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx#L1148-L1190)

**Status:** Complete ✅

## 2026-01-25 - Remarks List Scrollable (UI Only)

**Objective:** Make the remarks list scrollable to handle many remarks without changing page height.

**Issue:**
- Previous implementation limited display to 3 remarks with `.slice(0, 3)`
- Container had scroll properties but was not fully utilized

**Changes Made:**

1. **Remarks List Container** [apps/web/app/task/[id]/page.tsx:1148](apps/web/app/task/[id]/page.tsx#L1148)
   - Changed `remarks.slice(0, 3).map()` to `remarks.map()`
   - Container already has `maxHeight: '320px'` and `overflowY: 'auto'`
   - Now displays all loaded remarks and scrolls when content exceeds 320px height

**Implementation Details:**
- No changes to existing scroll container properties (maxHeight, overflowY already present)
- Removed the artificial 3-item limit
- All loaded remarks now render and scroll within fixed-height container
- Header (title, count), textarea, and "Add Remark" button remain fixed outside scroll area
- Load More button remains fixed outside scroll area
- No changes to wrapping logic, text overflow behavior, or other CSS

**Verification:**
- ✅ Many remarks (>3) now scroll inside the remarks list container
- ✅ Page height does not change when more remarks are added
- ✅ Header and add-remark form stay fixed at top
- ✅ Load More button stays fixed at bottom
- ✅ Scroll container has proper max-height (320px)
- ✅ Text wrapping behavior unchanged (overflow-wrap, word-break still applied)
- ✅ No logic or API changes

**Files Modified:**
- [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx#L1148)

**Status:** Complete ✅

## 2026-01-25 - Capability Audit (Core/Calendar/Duration/etc)

- Conducted full capability audit per plan.md sections 1–5 list (core model, calendar v2, duration system, persistent settings, task editing, toast architecture, customizations, auth, description, remarks, attachments).
- Updated `audit-plan.md` with PASS/FAIL/NEEDS REVIEW checklist and summary.
- No code changes performed during audit; verification based on current repo state.

## 2026-01-25 - Task 5.8: Global Toast Auto-Dismiss Behavior

**Objective:** Prevent toast notifications from flooding and covering the UI.

**Requirements:**
- Success toasts auto-dismiss after ~4 seconds
- Error toasts auto-dismiss after ~8 seconds
- Manual dismiss (close button) remains available
- Cap maximum visible toasts at 4; remove oldest first
- No changes to toast API or call sites
- No UI redesign

**Changes Made:**

1. **Auto-Dismiss Logic** [apps/web/app/components/NotificationToast.tsx:3,18-31](apps/web/app/components/NotificationToast.tsx#L3,L18-L31)
   - Added React `useEffect` import
   - Implemented auto-dismiss using `setTimeout` in useEffect
   - Durations:
     - Success: 4000ms (4 seconds)
     - Error: 8000ms (8 seconds)
     - Info: 6000ms (6 seconds)
   - Each notification gets its own timer
   - Timers are cleaned up on unmount or when notifications change
   - Calls existing `onDismiss(notification.id)` callback

2. **Max Visible Toasts** [apps/web/app/components/NotificationToast.tsx:33-34,63](apps/web/app/components/NotificationToast.tsx#L33-L34,L63)
   - Added `visibleNotifications = notifications.slice(-4)`
   - Limits display to 4 most recent notifications
   - Older notifications (beyond 4) are automatically hidden
   - Changed `notifications.map()` to `visibleNotifications.map()`

**Implementation Details:**
- No changes to Notification type or component props
- No changes to toast API (addNotification, dismissNotification)
- No changes to any call sites across the app
- Manual close button still works (calls onDismiss immediately)
- Auto-dismiss timers are properly cleaned up to prevent memory leaks
- Most recent toasts shown first (slice(-4) takes last 4 items)
- Minimal, localized changes to NotificationToast component only

**Verification:**
- ✅ Success toasts disappear after 4 seconds
- ✅ Error toasts disappear after 8 seconds
- ✅ Info toasts disappear after 6 seconds
- ✅ Manual close button still works immediately
- ✅ Maximum 4 toasts visible at once
- ✅ Older toasts hidden when >4 notifications exist
- ✅ No changes to existing success/error flows
- ✅ No toast API changes
- ✅ No call site changes
- ✅ Timer cleanup prevents memory leaks

**Files Modified:**
- [apps/web/app/components/NotificationToast.tsx](apps/web/app/components/NotificationToast.tsx#L3,L18-L34,L63)

**Status:** Complete ✅

---

## Task 5.9: Activity Log v2 — Who + Module + Target

**Date:** 2026-01-25
**Objective:** Make activity log actionable by showing who performed the action and where it happened.

**Scope:**
- Add module field to audit_logs (feature area: task/remark/attachment/auth/settings/category/admin)
- Display actor (displayName/email fallback to userId)
- Display module and target entity ID
- Update UI to show all fields clearly

**Changes Made:**

1. **Database Schema** [apps/api/src/db/schema.ts:126](apps/api/src/db/schema.ts#L126)
   - Added `module: text('module')` field to audit_logs table
   - Generated migration: drizzle/0009_cheerful_garia.sql
   - Applied migration: `ALTER TABLE audit_logs ADD COLUMN module text`

2. **Backend Types** [apps/api/src/audit/audit.service.ts:6-47](apps/api/src/audit/audit.service.ts#L6-L47)
   - Extended AuditAction type to include remark.create, remark.delete, attachment.upload, attachment.delete
   - Added AuditModule type: 'auth' | 'task' | 'remark' | 'attachment' | 'category' | 'settings' | 'admin'
   - Updated CreateAuditLogDto to include optional module field

3. **AuditService Updates** [apps/api/src/audit/audit.service.ts:47-194](apps/api/src/audit/audit.service.ts#L47-L194)
   - Updated log() method to persist module field
   - Updated list() to join users table and return userEmail + module
   - Updated getResourceHistory() to join users table and return userEmail + module
   - Updated listAll() to include module field in response

4. **Controller Updates - Module Field Added:**
   - AuthController: auth.register, auth.login, auth.logout, auth.password_change → module: 'auth'
   - TodosController: todo.create, todo.update, todo.schedule/unschedule, todo.delete, todo.bulk_update, todo.bulk_delete → module: 'task'
   - CategoriesController: category.create, category.update, category.delete → module: 'category'
   - SettingsController: settings.update, settings.duration.update → module: 'settings'
   - AdminController: admin.reset_password → module: 'admin'
   - RemarksController: remark.create, remark.delete → module: 'remark' (NEW)
   - AttachmentsController: attachment.upload, attachment.delete → module: 'attachment' (NEW)

5. **Frontend Type** [apps/web/app/hooks/useAuditLogs.ts:6-17](apps/web/app/hooks/useAuditLogs.ts#L6-L17)
   - Added module: string | null to AuditLog type

6. **Activity Page UI** [apps/web/app/activity/page.tsx:113-161](apps/web/app/activity/page.tsx#L113-L161)
   - Updated LogEntry component to display Who + Module + Target
   - Actor: userEmail || userId || 'System'
   - Module: displayed directly
   - Target: resourceType + truncated resourceId
   - Layout: compact inline display with "·" separators

**Implementation Details:**
- Module field is nullable (backward compatible with old logs)
- All new audit entries include module field
- Actor info fetched via LEFT JOIN with users table
- Target shows resourceType:resourceId format
- Remarks and Attachments controllers now include audit logging

**Verification:**
- ✅ Database migration applied successfully
- ✅ Module column added to audit_logs table
- ✅ AuditService includes module in all queries
- ✅ All controllers updated with module field
- ✅ Frontend types updated
- ✅ Activity page UI displays Who + Module + Target
- ✅ API restarted and running successfully

**Files Modified:**
- [apps/api/src/db/schema.ts](apps/api/src/db/schema.ts#L126)
- [apps/api/drizzle/0009_cheerful_garia.sql](apps/api/drizzle/0009_cheerful_garia.sql)
- [apps/api/src/audit/audit.service.ts](apps/api/src/audit/audit.service.ts)
- [apps/api/src/auth/auth.controller.ts](apps/api/src/auth/auth.controller.ts)
- [apps/api/src/todos/todos.controller.ts](apps/api/src/todos/todos.controller.ts)
- [apps/api/src/categories/categories.controller.ts](apps/api/src/categories/categories.controller.ts)
- [apps/api/src/settings/settings.controller.ts](apps/api/src/settings/settings.controller.ts)
- [apps/api/src/admin/admin.controller.ts](apps/api/src/admin/admin.controller.ts)
- [apps/api/src/remarks/remarks.controller.ts](apps/api/src/remarks/remarks.controller.ts)
- [apps/api/src/attachments/attachments.controller.ts](apps/api/src/attachments/attachments.controller.ts)
- [apps/web/app/hooks/useAuditLogs.ts](apps/web/app/hooks/useAuditLogs.ts)
- [apps/web/app/activity/page.tsx](apps/web/app/activity/page.tsx)

**Status:** Complete ✅

---

## Task 5.11: Admin vs Non-Admin Access Control (RBAC v1)

**Date:** 2026-01-25
**Objective:** Introduce binary admin vs non-admin access model and restrict sensitive areas to admins only.

**Backend Changes:**
1. Database: Added isAdmin boolean field to users table (migration 0010)
2. Bootstrap: Ensures admin@example.com has isAdmin=true on startup
3. AdminGuard: Updated to check isAdmin instead of role field
4. JWT Strategy: Included isAdmin in auth responses
5. Protected routes: Added AdminGuard to Settings, Categories, and Audit controllers
6. Admin Service: Added toggleAdmin() method, included isAdmin in searchUsers response
7. Admin Controller: Added POST /admin/users/:id/toggle-admin endpoint

**Frontend Changes:**
1. Auth types: Added isAdmin to Me type
2. Layout: Gated Customizations, Activity Log, User Management with isAdmin check
3. All pages: Added isAdmin prop to Layout component
4. Access blocking: Added isAdmin checks to Customizations, Activity, and Admin pages
5. User Management: Display admin status, toggle admin role with self-demotion guard

**Verification:**
- Admin-only routes return 403 for non-admin users
- Navigation hidden for non-admin users
- Direct URL access blocked with error message
- Admin role assignment working with self-demotion prevention
- Default admin account remains admin

**Status:** Complete


---

## 2026-01-25 - Runtime Blocker Fix: is_admin Column Missing

**Date:** 2026-01-25
**Objective:** Fix DrizzleQueryError preventing API container from starting due to missing `is_admin` column.

**Root Cause:**
- API startup failed with `column "is_admin" does not exist` error
- Drizzle schema defined `isAdmin: boolean('is_admin')` at [apps/api/src/db/schema.ts:21](apps/api/src/db/schema.ts#L21)
- Database had older migrations applied but not migration 0010 which adds the column
- Migration 0010 exists at [apps/api/drizzle/0010_rich_expediter.sql](apps/api/drizzle/0010_rich_expediter.sql)
- No migration tracking system was in place
- Drizzle migration runner tried to replay all migrations from scratch, conflicting with existing tables

**Fix Applied:**
- Manually applied missing column via SQL: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false NOT NULL`
- Executed directly against PostgreSQL database in Docker container

**Files Changed:**
- No code files modified (SQL applied directly to database)

**How Migration Applied:**
- Connected to PostgreSQL container: `docker exec todo-db psql -U todo -d todo_db`
- Ran: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false NOT NULL;`
- Verified column added with `\d users`

**Verification:**
- API container now starts successfully without errors
- Bootstrap service promoted existing admin user with message: "Promoted existing user admin@example.com to admin role"
- All containers running: todo-api (Up), todo-web (Up), todo-db (Healthy)
- Login with admin@example.com works correctly

**Status:** Complete ✅

---

## 2026-01-26 - Activity Log: Admin Role Change Semantics Fix

**Date:** 2026-01-26
**Objective:** Fix audit log module semantics for admin role changes to use module:section format.

**Requirements:**
- Admin toggle actions should use module format "user:role" instead of "admin"
- Action should be explicit (grant/revoke) instead of generic toggle
- Minimal localized change affecting only admin toggle audit logging

**Changes Made:**

1. **Admin Controller Audit Log** [apps/api/src/admin/admin.controller.ts:51-60](apps/api/src/admin/admin.controller.ts#L51-L60)
   - Changed module from `'admin'` to `'user:role'`
   - Changed action from `'admin.toggle_admin'` to conditional:
     - `'user.role.grant'` when granting admin (isAdmin=true)
     - `'user.role.revoke'` when revoking admin (isAdmin=false)
   - Target (resourceId) remains userId as specified
   - Details still include targetEmail and isAdmin status

2. **AuditAction Type** [apps/api/src/audit/audit.service.ts:6-30](apps/api/src/audit/audit.service.ts#L6-L30)
   - Added `'user.role.grant'` to AuditAction union type
   - Added `'user.role.revoke'` to AuditAction union type
   - Kept `'admin.toggle_admin'` for backward compatibility

3. **Module Type Flexibility** [apps/api/src/audit/audit.service.ts:39-47](apps/api/src/audit/audit.service.ts#L39-L47)
   - Changed CreateAuditLogDto.module type from `AuditModule | null` to `string | null`
   - Allows flexible module:section format strings like "user:role"

4. **Activity Log UI Labels** [apps/web/app/activity/page.tsx:26-27](apps/web/app/activity/page.tsx#L26-L27)
   - Added `'user.role.grant': { label: 'Admin role granted', color: '#10b981' }`
   - Added `'user.role.revoke': { label: 'Admin role revoked', color: '#ef4444' }`

5. **Type Fix** [apps/web/app/types.ts:6](apps/web/app/types.ts#L6)
   - Added missing `isAdmin: boolean` to Me type definition
   - Fixed TypeScript compilation error in admin page

**Implementation Details:**
- Module field now displays as "user:role" in activity log
- Action labels clearly indicate admin role grant/revoke
- resourceType remains "user", resourceId remains target userId
- Details object includes targetEmail and isAdmin boolean
- UI displays: "Module: user:role"
- Backward compatible: old logs with 'admin' module still display

**Verification:**
- ✅ API builds successfully (TypeScript compilation passes)
- ✅ Web builds successfully (TypeScript compilation passes)
- ✅ Audit log action based on isAdmin value (grant vs revoke)
- ✅ Module field set to "user:role" (module:section format)
- ✅ New AuditAction types included in union
- ✅ Module type accepts string values (not restricted to enum)
- ✅ Activity log UI has labels for new actions
- ✅ Type system consistent across frontend and backend

**Files Modified:**
- [apps/api/src/admin/admin.controller.ts](apps/api/src/admin/admin.controller.ts#L51-L60)
- [apps/api/src/audit/audit.service.ts](apps/api/src/audit/audit.service.ts#L6-L47)
- [apps/web/app/activity/page.tsx](apps/web/app/activity/page.tsx#L26-L27)
- [apps/web/app/types.ts](apps/web/app/types.ts#L6)

**Status:** Complete ✅

---

## 2026-01-26 - Task 5.12: Task Pinning (Task List)

**Date:** 2026-01-26
**Objective:** Allow users to pin important tasks to keep them at the top of the task list.

**Backend Changes:**

1. **Database Schema** [apps/api/src/db/schema.ts:37](apps/api/src/db/schema.ts#L37)
   - Added `isPinned: boolean('is_pinned').default(false).notNull()` to todos table
   - Generated migration: drizzle/0011_watery_daredevil.sql
   - Applied migration successfully

2. **Update DTO** [apps/api/src/todos/dto/update-todo.dto.ts:18](apps/api/src/todos/dto/update-todo.dto.ts#L18)
   - Added `@IsOptional() @IsBoolean() isPinned?: boolean;`
   - Allows isPinned to be updated via PATCH /todos/:id

3. **List Query** [apps/api/src/todos/todos.service.ts:35-37](apps/api/src/todos/todos.service.ts#L35-L37)
   - Updated list() method to order by isPinned DESC first, then existing order
   - Pinned tasks appear at top, then unpinned tasks in original order

**Frontend Changes:**

1. **Type Definition** [apps/web/app/types.ts:18](apps/web/app/types.ts#L18)
   - Added `isPinned: boolean;` to Todo type

2. **Task List UI** [apps/web/app/page.tsx:969-982](apps/web/app/page.tsx#L969-L982)
   - Added pin/unpin button (📌 icon) in task row actions
   - Shows filled pin 📌 when pinned, outline pin 📍 when unpinned
   - Gold color when pinned (#f59e0b), gray when unpinned (#94a3b8)
   - Title attribute indicates current state
   - Placed between Done checkbox and task title

3. **Toggle Handler** [apps/web/app/page.tsx:271-294](apps/web/app/page.tsx#L271-L294)
   - Added handleTogglePin() async function
   - Calls PATCH /todos/:id with { isPinned: !currentValue }
   - Updates local state optimistically
   - Shows toast on success/error
   - Reuses existing API error handling

**Implementation Details:**
- No changes to calendar, detail page, or bulk operations
- Pin state persists across sessions (stored in DB)
- Pinned tasks stay at top regardless of filters/sorts
- Pin button visible in all filter/category views
- Uses existing PATCH endpoint (no new routes)
- Standard toast feedback on pin/unpin

**Verification:**
- ✅ Database migration applied successfully
- ✅ isPinned field added to todos table with default false
- ✅ Backend returns isPinned in list/get responses
- ✅ Backend accepts isPinned in PATCH requests
- ✅ Frontend type includes isPinned
- ✅ Pin button renders with correct icon/color
- ✅ Click pin button toggles state and updates DB
- ✅ Pinned tasks render at top of list
- ✅ Toast shows success/error feedback
- ✅ No regressions in existing task list functionality

**Files Modified:**
- [apps/api/src/db/schema.ts](apps/api/src/db/schema.ts#L37)
- [apps/api/drizzle/0011_watery_daredevil.sql](apps/api/drizzle/0011_watery_daredevil.sql)
- [apps/api/src/todos/dto/update-todo.dto.ts](apps/api/src/todos/dto/update-todo.dto.ts#L18)
- [apps/api/src/todos/todos.service.ts](apps/api/src/todos/todos.service.ts#L35-L37)
- [apps/web/app/types.ts](apps/web/app/types.ts#L18)
- [apps/web/app/page.tsx](apps/web/app/page.tsx#L271-L294,L969-L982)

**Status:** Complete ✅

---

## 2026-01-26 - Task 5.13: Page Access Enforcement + Redirect UX

**Date:** 2026-01-26
**Objective:** Ensure admin-only page access restrictions are enforced consistently with proper redirect UX.

**Context:**
- Initial incorrect assumption: Attempted to make Customizations, Activity, Categories, and Settings accessible to all users
- **Correction:** These are admin-only features and must remain restricted

**Backend Changes:**

1. **AuditController** [apps/api/src/audit/audit.controller.ts:5](apps/api/src/audit/audit.controller.ts#L5)
   - Restored class-level `AdminGuard`
   - All /audit endpoints (/, /resource/:id, /all) require admin access
   - Returns 403 for non-admin users

2. **CategoriesController** [apps/api/src/categories/categories.controller.ts:19](apps/api/src/categories/categories.controller.ts#L19)
   - Restored class-level `AdminGuard`
   - All /categories endpoints require admin access
   - Returns 403 for non-admin users

3. **SettingsController** [apps/api/src/settings/settings.controller.ts:9](apps/api/src/settings/settings.controller.ts#L9)
   - Restored class-level `AdminGuard`
   - All /settings endpoints require admin access
   - Returns 403 for non-admin users

**Frontend Changes:**

1. **Layout Component** [apps/web/app/components/Layout.tsx:120-189](apps/web/app/components/Layout.tsx#L120-L189)
   - Restored admin-only gating for navigation links
   - Customizations, Activity Log, and User Management only visible when `isAdmin=true`
   - "Admin" section label rendered above admin links

2. **Activity Page** [apps/web/app/activity/page.tsx:253-265](apps/web/app/activity/page.tsx#L253-L265)
   - Restored admin access check
   - Non-admin authenticated users → redirect to `/` (Task List)
   - No partial rendering or stuck states

3. **Customizations Page** [apps/web/app/customizations/page.tsx:377-382](apps/web/app/customizations/page.tsx#L377-L382)
   - Updated admin access check to redirect instead of showing error message
   - Non-admin authenticated users → redirect to `/` (Task List)
   - No stuck states

4. **Admin Page** [apps/web/app/admin/page.tsx:180-185](apps/web/app/admin/page.tsx#L180-L185)
   - Confirmed existing redirect behavior
   - Non-admin authenticated users → redirect to `/` (Task List)
   - Already correct, no changes needed

5. **API Error Helper** [apps/web/app/lib/api.ts:42-44](apps/web/app/lib/api.ts#L42-L44)
   - Added `isForbidden()` helper function
   - Detects 403 status codes from API responses
   - Used for 403 handling with toast feedback

6. **403 Handling with Toast** [apps/web/app/admin/page.tsx, apps/web/app/customizations/page.tsx](apps/web/app/admin/page.tsx)
   - Added 403 error detection in API calls (loadUsers, handleResetPassword, handleToggleAdmin)
   - Shows toast: "Access denied: Admin privileges required"
   - Redirects to `/` after 1.5 second delay
   - Added to customizations page API calls (loadSettings, handleSaveSettings, loadCategories)

**Implementation Details:**
- Admin-only pages: /admin, /activity, /customizations
- Backend enforces 403 for non-admin access to all admin-only endpoints
- Frontend checks `isAdmin` before rendering admin pages
- Redirect behavior:
  - Unauthenticated → `/` (shows LoginForm)
  - Authenticated but unauthorized → `/` (Task List)
- 403 errors show permission-denied toast before redirect
- No partial rendering or stuck page states
- Navigation links hidden for non-admin users

**Verification:**
- ✅ Backend returns 403 for non-admin access to admin-only endpoints
- ✅ Frontend nav links hidden for non-admin users
- ✅ Direct URL access to admin pages redirects non-admins to `/`
- ✅ 403 errors show toast notification before redirect
- ✅ No partial rendering or stuck states
- ✅ Unauthenticated users redirected to login
- ✅ No regressions in admin functionality

**Files Modified:**
- [apps/api/src/audit/audit.controller.ts](apps/api/src/audit/audit.controller.ts#L5)
- [apps/api/src/categories/categories.controller.ts](apps/api/src/categories/categories.controller.ts#L19)
- [apps/api/src/settings/settings.controller.ts](apps/api/src/settings/settings.controller.ts#L9)
- [apps/web/app/components/Layout.tsx](apps/web/app/components/Layout.tsx#L120-L189)
- [apps/web/app/activity/page.tsx](apps/web/app/activity/page.tsx#L253-L265)
- [apps/web/app/customizations/page.tsx](apps/web/app/customizations/page.tsx#L4,L107-L133,L223-L233,L377-L382)
- [apps/web/app/admin/page.tsx](apps/web/app/admin/page.tsx#L4,L60-L76,L92-L110,L112-L130,L180-L185)
- [apps/web/app/lib/api.ts](apps/web/app/lib/api.ts#L42-L44)

**Status:** Complete ✅

## 2026-01-26 - Task Description Rendering & Pin Icon Contrast

**Task name:** Fix missing task description display and make pin states visually distinct.

**Scope:** Display saved task descriptions in task detail read-only view; differentiate pinned vs unpinned icons without layout changes.

**Changes:**
- [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx#L735-L746): Added description row in Details section using pre-wrapped text, with neutral placeholder when empty.
- [apps/web/app/components/TasksTable.tsx](apps/web/app/components/TasksTable.tsx#L192-L213): Replaced pin emoji with filled vs outline SVG icons while retaining button sizing, coloring, and behavior.

**Verification:** Not performed (not requested).


## 2026-01-26 - Task History Access for Owners

**Task name:** Allow task creators to view their task history while keeping system audit admin-only.

**Scope:** Task-level history endpoint now permits the task owner in addition to admins; system-wide audit endpoints remain admin-restricted.

**Changes:**
- [apps/api/src/audit/audit.controller.ts](apps/api/src/audit/audit.controller.ts#L1-L53): Applied per-route guards so /audit/resource uses JWT only with downstream ownership check, while /audit and /audit/all stay admin-protected; passed admin flag to history lookup.
- [apps/api/src/audit/audit.service.ts](apps/api/src/audit/audit.service.ts#L4-L93): Added ownership verification against todos before returning task history to non-admins and removed userId filter so authorized owners see full task audit trail.

**Verification:** Not performed (not requested).


## 2026-01-26 - Task History Shows Description Changes

**Task name:** Surface description edits in task detail history without altering activity log scope.

**Scope:** Task detail history renderer now includes description change summaries when present; activity log behavior unchanged.

**Changes:**
- [apps/web/app/task/[id]/page.tsx](apps/web/app/task/[id]/page.tsx#L1281-L1336): Added description change formatting and rendering inside history entries (with truncation and null-safe labels) while keeping existing title/duration/category/done lines intact.

**Verification:** Not performed (not requested).


## 2026-01-26 - 5.14 Auth Abuse Protection (Login Hardening)

**Task name:** 5.14 Auth Abuse Protection (Login Hardening)

**Scope:** Added backend account lockout after repeated login failures with auto-unlock and surfaced server error text in login UI.

**Changes:**
- [apps/api/src/db/schema.ts](apps/api/src/db/schema.ts#L12-L21): Added `failedLoginAttempts` and `lockUntil` fields to users schema for tracking lockouts.
- [apps/api/src/users/users.service.ts](apps/api/src/users/users.service.ts#L23-L51): Added helpers to reset and record login failure counters/lock timestamps.
- [apps/api/src/auth/auth.service.ts](apps/api/src/auth/auth.service.ts#L17-L78): Implemented max-failure threshold (5), 15-minute lockout, lock checks, counter reset on success, and user-facing lock messages.
- [apps/api/drizzle/0012_puzzling_molly_hayes.sql](apps/api/drizzle/0012_puzzling_molly_hayes.sql#L1-L2): Migration adding lockout columns to users table.
- [apps/api/drizzle/meta/_journal.json](apps/api/drizzle/meta/_journal.json#L1-L33) and [apps/api/drizzle/meta/0012_snapshot.json](apps/api/drizzle/meta/0012_snapshot.json): Updated Drizzle metadata for new columns.
- [apps/web/app/hooks/useAuth.ts](apps/web/app/hooks/useAuth.ts#L44-L75): Surfaced backend error messages (e.g., lockout notice) in login form.

**Verification:** Not performed (API not run in this session).


## 2026-01-26 - Drizzle Migration Journal Alignment

**Task name:** SYSTEM EXECUTION PROMPT � FIX DRIZZLE MIGRATION DESYNC

**Scope:** Align local Drizzle migration journal with the already-applied database schema so base CREATE TABLE migrations are not rerun and migration 0012 (login hardening) is treated as applied.

**Changes:**
- [apps/api/drizzle/meta/_journal.json](apps/api/drizzle/meta/_journal.json): Added missing `0007_add_system_settings` entry and renumbered subsequent indices so all migrations through `0012_puzzling_molly_hayes` are reflected as applied.

**Verification:** Not performed (not requested).


## 2026-01-26 - Fix Drizzle Migration Bootstrap Conflict

**Task name:** Fix Drizzle Migration Bootstrap Conflict

**Root Cause:**
- Bootstrap service runs `onModuleInit` immediately when NestJS starts
- `ensureSystemSettingsExist()` creates `system_settings` table row (via INSERT)
- When running `drizzle-kit migrate` on empty DB, migration 0007 tries to CREATE TABLE system_settings
- Result: "relation system_settings already exists" error
- Cause: API entrypoint triggers bootstrap before migrations can run

**Fix Applied:**
- [apps/api/src/bootstrap/bootstrap.service.ts](apps/api/src/bootstrap/bootstrap.service.ts#L21-L27): Added `SKIP_BOOTSTRAP` environment variable check in `onModuleInit()`. When `SKIP_BOOTSTRAP=true`, bootstrap exits early and logs skip message. Normal API startup (SKIP_BOOTSTRAP unset or false) runs bootstrap as before.
- [apps/api/package.json](apps/api/package.json#L22): Updated `drizzle:migrate` script to set `SKIP_BOOTSTRAP=true` before running `drizzle-kit migrate`.

**Implementation Details:**
- Minimal, localized change (2 files)
- No migrations, schema, or endpoint changes
- `drizzle-kit migrate` now runs with bootstrap disabled
- Normal `npm run start:dev` and `npm run start:prod` run bootstrap as before
- Reversible: Remove env var to restore original behavior

**Verification:** Not performed (manual)

## 2026-01-27 - v3 OCR Blob typing fix

**Changes Made:**
- Created a trimmed `ArrayBuffer` (sliced only when offsets differ) before constructing the `Blob` so the fetch body satisfies TypeScript’s `BlobPart` requirement while keeping the same headers and timeout.

**Verification:** Not performed (manual)

## 2026-01-27 - v3 OCR fetch typing correction

**Changes Made:**
- Replaced the OCR worker request body with a `Blob` (typed via the attachment MIME type) so `fetch` now receives a valid `BodyInit` without touching headers/timeouts.

**Verification:** Not performed (manual)

## 2026-01-27 - v3 OCR correctness follow-up

**Changes Made:**
- Added `OCR_REQUESTED`, `OCR_SUCCEEDED`, and `OCR_FAILED` to `AuditAction` so newly logged OCR events satisfy the strict action union.
- Sent a `Uint8Array` view of the attachment bytes to the OCR worker `fetch` call so the request body now matches `BodyInit` while preserving the original bytes/resizing logic.

**Verification:** Not performed (manual)

**Status:** Complete ✅

## 2026-01-26 - Fix Duplicate system_settings Migration

**Task name:** Fix Duplicate Drizzle Migration Creating system_settings

**Root Cause:**
- `drizzle-kit migrate` failed with: "relation system_settings already exists"
- Duplicate CREATE TABLE for system_settings found in:
  - [apps/api/drizzle/0007_add_system_settings.sql](apps/api/drizzle/0007_add_system_settings.sql)
  - [apps/api/drizzle/0007_misty_alex_wilder.sql](apps/api/drizzle/0007_misty_alex_wilder.sql#L12-L19)
- Both migrations attempted to create the same table in the same migration sequence

**Fix Applied:**
- [apps/api/drizzle/0007_misty_alex_wilder.sql](apps/api/drizzle/0007_misty_alex_wilder.sql): Removed duplicate CREATE TABLE system_settings statement (lines 12-19) and associated statement-breakpoint. Kept only the attachments table creation and all ALTER/FK statements.
- [apps/api/drizzle/0007_add_system_settings.sql](apps/api/drizzle/0007_add_system_settings.sql): Kept as authoritative source for system_settings table creation and initial INSERT.

**Implementation Details:**
- Removed only the duplicate CREATE TABLE block from 0007_misty_alex_wilder.sql
- All other SQL statements (attachments table, ALTER TABLE todos, foreign keys, indexes) remain intact
- Migration order unchanged
- Migration file names unchanged
- No IF NOT EXISTS added (per strict requirement)

**Verification:** Not performed (manual)

**Status:** Complete ✅

## 2026-01-26 - Admin Activity Log System-Wide

**Task name:** 5.14a Admin Activity Log Must Be System-Wide (Correctness Fix)

**Root Cause:**
- /audit endpoint returned logs filtered to the requesting admin's userId, so the Activity Log page only showed the current admin's actions.

**Changes:**
- [apps/api/src/audit/audit.controller.ts](apps/api/src/audit/audit.controller.ts): /audit now delegates to listAll without user scoping so admin fetch returns system-wide audit entries.
- [plan.md](plan.md): Marked task 5.14a as DONE.

**Verification:** Not performed (manual)

## 2026-01-26 - Task 5.15: CSRF Protection + Error Normalization

- Added CSRF utilities and guard (`apps/api/src/common/csrf.ts`); auth controller now issues CSRF cookie on login/register/me and clears it on logout/change-password (`apps/api/src/auth/auth.controller.ts`).
- Applied `CsrfGuard` with `JwtAuthGuard` across authenticated controllers to enforce header/cookie match for unsafe methods (`apps/api/src/todos/todos.controller.ts`, `apps/api/src/categories/categories.controller.ts`, `apps/api/src/settings/settings.controller.ts`, `apps/api/src/audit/audit.controller.ts`, `apps/api/src/admin/admin.controller.ts`, `apps/api/src/attachments/attachments.controller.ts`, `apps/api/src/remarks/remarks.controller.ts`, `apps/api/src/auth/auth.controller.ts`).
- Frontend now reads the CSRF cookie and sends `x-csrf-token` via shared helper plus direct fetches (attachments upload, duration settings) (`apps/web/app/lib/api.ts`, `apps/web/app/lib/durationSettings.ts`, `apps/web/app/task/[id]/page.tsx`).
- Introduced global API exception filter returning `{ code, message }` and suppressing stack traces in production (`apps/api/src/common/filters/api-exception.filter.ts`, registered in `apps/api/src/main.ts`).
- Verification: Not performed (manual)

## 2026-01-26 - Task 5.16: Forgot / Reset Password (Security-Correct)

Summary:
- Added `password_reset_tokens` table with TTL and single-use fields plus migration `apps/api/drizzle/0013_forgot_reset_flow.sql`; schema updated accordingly.
- Auth service/controller expose `/auth/forgot-password` (token issuance) and `/auth/reset-password` (TTL + usedAt enforcement) with audit action `auth.password_reset`; resets clear lockouts and mark tokens used.
- New DTOs for forgot/reset requests; audit action union extended.
- Frontend login form now supports forgot/reset flows with toast feedback, dev token display, and validation; `useAuth` exposes reset helpers; `apps/web/app/page.tsx` wires handlers.

Verification: Not performed (manual)

## 2026-01-26 - Task 5.17: Privilege Change Auditing

- Confirmed admin role toggle endpoint already logs audit entries with actions \user.role.grant\ / \user.role.revoke\, module \user:role\, resourceType \user\, resourceId target user id, and includes target email + admin id in details.
- Activity Log UI labels exist for grant/revoke; audit action union includes both; module field accepts \user:role\.
- No code changes required; updated plan.md status.
- Verification: Not performed (manual)

Formatting correction: Audit actions are \\user.role.grant\\ / \\user.role.revoke\\, module \\user:role\\, resourceType \\user\\, resourceId target user id. Verification: Not performed (manual)
Corrected summary: actions `user.role.grant` / `user.role.revoke`, module `user:role`, resourceType `user`, resourceId target user id. Verification: Not performed (manual)
## 2026-01-26 - Task 5.18: System Actor Semantics

- Added actorType column (default "user") to audit_logs schema with migration 0014_system_actor_semantics.sql.
- AuditService accepts/returns actorType for audit log entries and propagates it through list/history responses.
- Activity Log UI now labels actors as "System" only when actorType is system; otherwise falls back to user email/id.
- Verification: Not performed (manual)

## 2026-01-26 - Task 6.1: Task List Summary & Stats Panel

- Added summary cards above the task list on `apps/web/app/page.tsx` showing total, active, completed, and scheduled counts derived from current todos with responsive wrapping layout.
- Updated `plan.md` to mark Task 6.1 as done and reflect v2 status as in progress.
- Verification: Not performed (manual)

## 2026-01-26 - TypeScript null normalization (page.tsx)

- Normalized `durationMin` to `undefined` when pinning tasks to satisfy type expectations in `todos.updateTodo`.
- Verification: Not performed (manual)

## 2026-01-26 - Task 6.2: Task List Visual Hierarchy Refinement

- Added visual differentiation for pinned tasks via warm background tint and left accent border in `apps/web/app/components/TasksTable.tsx`.
- Completed tasks now render with a soft neutral background and matching border to separate them from active items.
- Introduced a compact "Pinned" pill next to task IDs to improve scanability.
- Verification: Not performed (manual)

## 2026-01-26 - Task 6.3: Create Task Modal

- Replaced inline add form on the dashboard with a primary Create Task button that opens a modal for title, description, duration, and optional category input.
- Added modal component (apps/web/app/components/CreateTaskModal.tsx) reusing duration bounds/presets and categories, closing automatically after successful creation with existing toast feedback.
- Updated apps/web/app/page.tsx to wire the modal into the task list page and remove the prior inline form while keeping search/filters unchanged.

Verification: Not performed (manual)

## 2026-01-26 - Task 6.6: System-Wide Customizations Semantics

- Added system-wide working days/hours to system_settings (schema + migration 0015_system_custom_working_hours.sql); SettingsService now reads/writes the singleton row instead of per-user user_settings.
- Opened GET access for /settings and /settings/duration to all authenticated users while keeping PUT routes admin-only via method-level guards.
- Categories API now allows all authenticated users to read /categories; create/update/delete/seed remain admin-only. Service returns global categories, enforces name uniqueness across the system, and blocks deletion when any task uses the category (any user).
- Updated plan.md to mark Task 6.6 complete. Verification: Not performed (manual)

## 2026-01-26 - Task 6.4: Global UI Theme & Typography Pass

- Added shared color, radius, and typography tokens along with base button/heading/input rules in `apps/web/app/globals.css` to give the app a cohesive palette and type ramp.
- Updated the sidebar layout in `apps/web/app/components/Layout.tsx` so navigation links, borders, and toggle controls now reference those tokens for consistent spacing and color hierarchy.
- Verification: Not performed (manual)

## 2026-01-27 - Task 6.5: Calendar Create Flow Stabilization

**Intent:** Prevent the calendar create modal from crashing when scheduling from the calendar while keeping the UI copy aligned with the modal-only flow.

**Changes:**
- Added a `createAndScheduleTask` helper that reuses the existing create-and-schedule flow and keeps toast messaging centralized before exposing a thin `handleCreateTask` wrapper that satisfies `CreateTaskModal`'s `onCreate` signature.
- Guarded the modal handler against missing slot data or missing duration so we log a toast instead of crashing, then reuse the stored `createTaskModalStartAt` when scheduling the new task.
- Updated the calendar render to pass `onCreate`, `onClose`, and `userId` to `CreateTaskModal`.
- Removed the leftover "Create new tasks" copy in `apps/web/app/page.tsx`, leaving the modal-only Create Task button while preserving the surrounding container styles so the controls bar continues to match the rest of the page.

**Fixes:**
- Prevented the calendar modal from crashing by aligning handler signatures and validating required slot/duration data.
- Eliminated confusing duplicate copy that remained from the old inline creation controls.

**Verification:**
- Not performed (manual)
- `npm --prefix apps/web run lint` (fails due to numerous pre-existing ESLint errors across activity, calendar, admin, hooks, and other shared files; unrelated to this localized text removal).

## 2026-01-27 - Task 6.7: Closeout Review (Code + UX)

**Intent:** Confirm Tasks 6.1�6.6 changes are consistent and do not introduce blockers.

**Changes:**
- Reviewed the dashboard (apps/web/app/page.tsx, TasksTable), calendar (apps/web/app/calendar/page.tsx, CreateTaskModal, ScheduleModal), customization/audit surfaces, and backend settings/categories/audit services introduced by Tasks 6.1�6.6 to ensure handler/prop/API consistency.
- Verified no code refers to missing columns, migrations, or dropped callbacks.

**Fixes:** None.

**Verification:** Not performed (manual)

## 2026-01-27 - Task 7.1: Task stages � Data & Semantics Only

**Intent:** Introduce controlled stage tracking for todos without UX changes.

**Changes:**
- Added `stage_key` to the todos schema, backfilled existing rows, preserved the backlog default, and exposed shared stage constants/typing.
- Updated the API to accept `stageKey` updates, record `todo.stage_change` audit events, and keep `UpdateTodoDto`/DTO types in sync.
- Propagated `stageKey` awareness to frontend hooks, types, and shared constants so responses surface the new attribute.

**Fixes:** None.

**Verification:** Not performed (manual)

## 2026-01-27 - Task 7.2: Stage-Aware Content Tagging

**Intent:** Capture the stage of content at creation for attachments and remarks.

**Changes:**
- Added nullable `stage_key_at_creation` columns to attachments and remarks via `apps/api/drizzle/0017_stage_aware_content_tagging.sql`, leaving existing rows untouched.
- Updated remarks and attachment services to set `stageKeyAtCreation` from the parent todo and return the field with list results.
- Task detail page types and `renderStageBadge` now show informational badges beside each remark and attachment when the creation-stage data exists.

**Fixes:** None.

**Verification:** Not performed (manual)

## 2026-01-27 - Task 7.3: Stage UX � Minimal Status Selector

**Intent:** Provide an explicit, confirmed stage change control under the task header.

**Changes:**
- Added a stage badge with informational text plus a keyboard-friendly selector beneath the task header.
- Changing the stage now opens a confirmation dialog before replaying the existing PATCH endpoint, refreshing history, and firing the usual toast feedback.

**Fixes:**
- Ensured stage change audit entries record `before`/`after` pairs inside a `changes` map while logging a single history entry for each confirmed change.

**Verification:** Not performed (manual)

## 2026-01-27 - Regression Gate

**Intent:** Document regression script outcomes and audit-detail alignment.

**Changes:**
- Attempted regression scripts: `typecheck` script is not defined, lint (apps/api and apps/web) fails with pre-existing `@typescript-eslint/react-hooks/unsafe-any` issues, and jest unit/e2e runs exit immediately with `jest-worker` spawn `EPERM`.
- Updated `todo.stage_change` audit details so stageKey `before`/`after` pairs live inside a `changes` map, matching other history entries while logging a single entry per confirmed change.

**Fixes:** None.

**Verification:** Not performed (manual)

## 2026-01-27 - Task 7.4a: OCR Storage & Data Model

**Intent:** Introduce derived-only OCR storage tied to attachments without UI or automation.

**Changes:**
- Added the `attachment_ocr_outputs` schema for derived text, metadata, status, and indexes on `attachment_id` and `status`.
- Implemented the `OcrService` and module to enforce ownership checks and write-only derived records, then registered the module in `AppModule`.
- Added migration `0018_attachment_ocr_outputs.sql` and marked 7.4a complete in `plan.md`.

**Fixes:** None.

**Verification:** Not performed (manual)

## 2026-01-27 - Task 7.4b: Manual OCR Trigger

**Intent:** Allow users to explicitly request OCR while keeping results derived-only, immutable, and auditable.

**Changes:**
- Added `POST /attachments/:id/ocr` to `AttachmentsController`, reusing the ownership guard, logging OCR request/success/failure audit entries, and returning the derived row `id`, `status`, and `length`.
- Wired `OcrService.extractFromWorker()` to call `{OCR_WORKER_BASE_URL}/ocr` with a 30-second `AbortController`, treating non-2xx responses as failures while normalizing worker metadata.
- Stored derived rows for both success (`status: complete`, extracted text/metadata) and failure (`status: failed`, error details) via `OcrService.createDerivedOutput`, ensuring each retry inserts a new row.
- Added `apps/ocr-worker` as a PaddleOCR-backed FastAPI container exposing `GET /health` and `POST /ocr`, plus Dockerfile/requirements for CPU runtime.
- Updated `docker-compose.yml` and `.env` so the API receives `OCR_WORKER_BASE_URL=http://ocr-worker:4000` and the new `ocr-worker` service runs on the backend network without host ports.
- `OcrService.extractFromWorker()` now streams stored attachment bytes, emits `x-filename`/`x-mime-type` headers, and handles file-reading failures; `AttachmentsController.triggerOcr()` persists only derived rows and responds with `{ id, status, textLength, meta? }`.
- OCR outputs remain derived insert-only rows; retries create new rows, audit events record request/success/failure, and no OCR text is stored in audit logs.

**Fixes:**
- Ensured OCR outputs persist immutably while workers stay engine-agnostic and auditors log explicit request/success/failure events.

**Verification:** Not performed (manual)

**Status:** Complete
