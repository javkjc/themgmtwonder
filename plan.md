# PLAN — v8.5 Field Builder & Structured Extraction Authoring

**Document Version:** 4.0  
**Status:** 🚧 NOT STARTED  
**Current Phase:** Planning  
**Baseline:** v8.1 Complete (Extraction Review UI & Governance)  
**Target Completion:** TBD

---

## Overview

**What we are building (v8.5):**
A governed **Field Builder** inside the Extracted Data Review page. This allows users to convert raw extracted text into structured fields (key/value pairs) using explicit, auditable actions. This is critical for handling "no fields extracted" scenarios or refining incomplete data.

**Key Features:**
- **Field Builder Panel:** Toggleable section in the review interface
- **Manual Field Creation:** Explicit "Add Field" with mandatory correction reason
- **Text Selection:** Highlight text in raw output to create fields
- **Templates & Helpers:** Quick-add common fields (Vendor, Date, etc.) and normalization tools

**What we are NOT building:**
- No automatic/background extraction (still user-initiated)
- No ML model training
- No changes to the backend OCR engine
- No authoritative record creation (data remains derived until utilized)

**Success Criteria:**
- [ ] Users can manually add fields when OCR returns zero results
- [ ] Users can select text from raw output to populate field values
- [ ] All manual field creations capture a mandatory "reason" for audit
- [ ] Field Builder is disabled when extraction is Confirmed or Utilized
- [ ] "No fields extracted" state guides users to the Field Builder

---

## Prerequisites (Dependencies Check)

**Required Complete:**
- [x] v8.1 — Extraction Review UI & Governance (Review page, Provenance, Lockout rules)
- [x] v3.5 — OCR draft/confirm/archive flow
- [x] v1 — Audit logging system

**Current State (v8.1 Baseline):**
- ✅ Review page exists with PDF viewer and Field List
- ✅ Governance gates (lockout on utilized) are in place
- ✅ Correction infrastructure (mandatory reasons) is ready
- ✅ "Raw Extracted Text" is available in backend `attachment_ocr_outputs`

---


---

## v8.5 Implementation Plan

### Task 1: Field Builder UI Panel & Empty States
**Objective:** Create the container and layout for the Field Builder within the existing Review Page.

**Files:**
- `apps/web/app/attachments/[attachmentId]/review/page.tsx`
- `apps/web/components/ocr/FieldBuilderPanel.tsx` (NEW)

**Requirements:**
1. **Layout updates:**
   - Add a toggle button "Field Builder" to the review page toolbar.
   - When active, split the view to show:
     - **Pane A:** Document Viewer (Existing)
     - **Pane B:** Raw Extracted Text (New/Visible)
     - **Pane C:** Extracted Fields List (Existing)
   - Layout should be responsive.

2. **Empty State Handling:**
   - Detect when `fields.length === 0`.
   - Display prominent "No fields extracted" message.
   - Show CTA: "Create fields from extracted text".
   - Clicking CTA opens the Field Builder panel.
   - Ensure "Raw Extracted Text" is visible even when fields are empty.

**Verification:**
- [ ] Toggle button shows/hides the panel.
- [ ] Empty state appears correctly when no fields exist.
- [ ] Raw text is displayed (read-only) in the panel.

---

### Task 2: Governance Gates (Status + Utilization)
**Objective:** Enforce lockout rules so Field Builder cannot be used on finalized or authoritative data.

**Files:**
- `apps/web/components/ocr/FieldBuilderPanel.tsx`
- `apps/api/src/ocr/ocr.service.ts` (Validation check)

**Requirements:**
1. **Status-based Enablement:**
   - `draft`: Field Builder inputs **Enabled**.
   - `confirmed`: Field Builder **Read-only** (view raw text/logic, no creation).
   - `archived`: **Read-only**.

2. **Utilization-based Lockout (Critical):**
   - Check `utilizationType` (Category A/B/C).
   - If utilized: **Disable** all Field Builder inputs.
   - Show "Read-only (data in use)" badge with tooltip explaining why (Reuse existing logic from v8.1).

3. **Backend Validation:**
   - Ensure the definition of "correction" or "update" endpoints rejects changes if:
     - Status is `confirmed` OR `archived`.
     - Utilization type is NOT null/none.

**Verification:**
- [ ] Inputs disabled when status is 'confirmed'.
- [ ] Inputs disabled when `utilizationType` is present.
- [ ] Backend returns 400 if update attempted on utilized record.

---

### Task 3: Capability A - Manual Field Creation
**Objective:** Allow users to manually type in a new field key/value with a mandatory audit reason.

**Files:**
- `apps/web/components/ocr/FieldBuilderPanel.tsx`
- `apps/web/components/ocr/ManualFieldForm.tsx` (NEW)

**Requirements:**
1. **Form Fields:**
   - **Field Name** (Required, text input).
   - **Field Value** (Required, text input).
   - **Reason** (Required, reuse `CorrectionReasonInput` component).
   - **Type** (Optional: text, number, date, currency) - UI validation only for now.

2. **Actions:**
   - "Add Field" button (Explicit submit, no auto-save).
   - Validates that Name, Value, and Reason are present.

3. **Data Handling:**
   - On submit, treat as a "correction" or "patch" to the draft data.
   - Send to backend (e.g., `PATCH /attachments/:id/ocr/draft`).
   - Refresh local state to show new field in the list.

**Verification:**
- [ ] Cannot submit without field name, value, and reason.
- [ ] Submitting adds the field to the "Extracted Fields" list.
- [ ] Audit log reflects the addition with the provided reason.

---

### Task 4: Capability B - Text Selection Creation
**Objective:** Allow creating fields by highlighting text in the raw output pane.

**Files:**
- `apps/web/components/ocr/RawTextPanel.tsx` (NEW)
- `apps/web/components/ocr/FieldBuilderPanel.tsx`

**Requirements:**
1. **Selection Interaction:**
   - User highlights text in "Raw Extracted Text" pane.
   - Show floating toolbar or context actions:
     - "Use as Value"
     - "Use as Field Name" (Optional)

2. **Flow:**
   - User clicks "Use as Value".
   - The highlighted text populates the **Field Value** input in the Manual Field Form (Task 3).
   - User enters Field Name (or selects template).
   - User adds Reason and clicks "Add Field".

3. **Constraints:**
   - Selection *only* populates the form; it does NOT auto-create the field.
   - Explicit confirmation (Add Field button) is still required.

**Verification:**
- [ ] Highlighting text shows "Use as..." options.
- [ ] Clicking option populates the form correctly.
- [ ] Form still requires manual confirmation.

---

### Task 5: Capabilities C & D - Templates & Helpers
**Objective:** Provide UI conveniences for common fields and data normalization.

**Files:**
- `apps/web/components/ocr/FieldTemplates.tsx` (NEW)
- `apps/web/components/ocr/NormalizationHelpers.tsx` (NEW)

**Requirements:**
1. **Templates:**
   - Dropdown or chips for common fields: "Invoice Number", "Date", "Total", "Vendor".
   - Clicking a template populates the **Field Name** input.
   - Does NOT populate value (user must enter or select text).

2. **Normalization Helpers:**
   - "Trim Whitespace" button (previews change to Value).
   - "Currency Format" (removes currency symbols/commas).
   - "Date Format" (attempts to verify YYYY-MM-DD compatibility).
   - **Rule:** These only modify the input form value. They do not auto-save.

**Verification:**
- [ ] Clicking "Invoice Number" template sets field name input.
- [ ] Normalization buttons modify the form value input correctly.

---

## Implementation Order

1. **Step 1: UI Skeleton (Task 1).** Get the panel toggling and layout working.
2. **Step 2: Backend Check (Task 2).** Verify strictly that we can't edit utilized/confirmed data.
3. **Step 3: Manual Creation (Task 3).** Implement the core "Add Field" form and wire it to backend.
4. **Step 4: Text Selection (Task 4).** Implement the interaction listener on raw text.
5. **Step 5: Templates/Helpers (Task 5).** Add the polish features.

---

## Constraints & Governance

- **Explicit Intent:** No auto-extraction. All fields must be explicitly added by the user.
- **Auditability:** Every field addition MUST have a reason. This allows us to distinguish "machine extracted" vs "human added".
- **Backend Authority:** The backend owns the strict "Draft vs Confirmed" state. Front-end is just a view.
- **Utilization:** If the data has been used (Category A/B/C), NO edits are allowed. The user must Archive & Redo if they need changes.

---

## Testing Strategy

### Manual Test Cases
1. **Empty State:**
    - Open review page for attachment with 0 fields.
    - Verify "No fields extracted" and CTA exists.
    - Verify Raw Text is visible.
2. **Add Field:**
    - Type "Test Field", Value "123", Reason "Missing".
    - Click Add.
    - Verify field appears in list.
    - Verify audit log.
3. **Selection:**
    - Highlight text "Total: $500".
    - Click "Use as Value".
    - Verify "$500" appears in Value input.
4. **Lockout:**
    - Confirm the extraction.
    - Try to add a field.
    - Verify inputs are disabled/hidden.
    - Utilize the data (e.g. export).
    - check `checkRedoEligibility` blocks changes.

---

## Notes for AI Code Generation

**Prompt Template:**
```
Task: [Task Number and Name]
Context: [Current files to modify/extend, v8.1 baseline]
Requirements: [Specific acceptance criteria]
Governance: [Audit/reason requirements]
Output: [Expected files and changes]
```

**Key Context:**
- We are extending `apps/web/app/attachments/[attachmentId]/review/page.tsx`.
- We reuse correcting logic (sending patch to backend).
- `rawOcr` contains the `extractedText` needed for the Raw Text pane.
  - Section headers: "OCR Fields" → "Extracted Fields"
  - Help text explains reviewing extraction, not document
  - State badge displays: "Draft" / "Confirmed" / "Archived"
- **Files modified:**

**B2: Show Extraction Provenance**
- **Status:** ✅ Complete
- **What was built:**
  - For each field, displays:
    - Original extracted value (grayed out if corrected)
    - Current value (highlighted if corrected)
    - "Extracted via: OCR" badge
    - Correction history link (if corrections exist)
  - Visual distinction between original vs corrected
- **Files modified:**
  - `apps/web/app/attachments/[attachmentId]/review/page.tsx`
  - `OcrFieldList` component

**B3: Handle Empty/Failed Extraction**
- **Status:** ✅ Complete
- **What was built:**
  - Empty state: "No fields extracted" message
  - PDF preview failure: Error message + download link
  - Low confidence warning: Banner for universally low confidence
  - Non-blocking error banner for API/network errors
- **Files modified:**
  - `apps/web/app/attachments/[attachmentId]/review/page.tsx`

---

#### **TASK GROUP C: Editing Governance** ✅ COMPLETE

**C1: Block Editing on Utilized Extraction**
- **Status:** ✅ Complete
- **What was built:**
  - Checks `attachment_ocr_outputs.utilization_type` before showing edit button
  - If utilized: Hides edit button, shows "Read-only (data in use)" badge
  - Tooltips explain lock reason based on utilization type
- **Files modified:**
  - `OcrFieldList` component
  - Backend: Extended `getOcrResultsWithCorrections()` to include `utilizationType`

**C2: Require Correction Reason for Edits**
- **Status:** ✅ Complete
- **What was built:**
  - `OcrFieldEditModal` has mandatory "Reason for correction" textarea
  - Cannot save without reason (client + server validation)
  - Reason shown in correction history
- **Files modified:**
  - `OcrFieldEditModal` component
  - Backend DTO validation updated to require `correctionReason`

**C3: Show Draft vs Confirmed State Clearly**
- **Status:** ✅ Complete
- **What was built:**
  - Review page shows banner at top:
    - Draft: Yellow banner "This is a draft extraction..."
    - Confirmed: Green banner "This is the confirmed baseline extraction."
    - Archived: Gray banner "This extraction is archived (view only)."
  - Confirm button hidden if already confirmed
- **Files modified:**
  - `apps/web/app/attachments/[attachmentId]/review/page.tsx`

---

#### **TASK GROUP D: Confirmation Semantics** ✅ COMPLETE

**D1: Add Confirmation Explanation Modal**
- **Status:** ✅ Complete
- **What was built:**
  - Modal before confirm explains:
    - "Confirming will lock this data as the baseline"
    - "Make it available for use in tasks/exports/workflows"
    - "Cannot be edited after utilization"
  - Requires explicit "Yes, Confirm" click
  - Dismissible by clicking outside or ESC
- **Files modified:**
  - `apps/web/app/attachments/[attachmentId]/review/page.tsx`
  - Confirmation modal component

**D2: Block Confirm Button on Existing Confirmed**
- **Status:** ✅ Complete
- **What was built:**
  - If confirmed extraction already exists: Hides confirm button
  - Shows message: "A confirmed extraction already exists for this attachment"
- **Files modified:**
  - `apps/web/app/attachments/[attachmentId]/review/page.tsx`

---

#### **TASK GROUP E: Terminology Cleanup** ✅ COMPLETE

**E1: Decouple "OCR" from "Extraction" in Code**
- **Status:** ✅ Complete
- **What was built:**
  - All user-facing copy uses "Extraction" not "OCR"
  - Backend schema and API endpoints unchanged (no breaking changes)
  - Component names and internal code can reference OCR (implementation detail)
  - Provenance badge shows "Extracted via: OCR" (implementation detail is acceptable)
- **Files modified:**
  - All frontend components with user-facing text
  - Task detail page
  - Review page
  - Audit log labels

---


## Original v8 Plan (Deferred Features)

The original v8 plan envisioned a comprehensive structured field parsing system. These features were **NOT implemented in v8.1** and may be considered for future versions if business requirements demand them.

### Deferred: Database Schema Changes

**New Table: `ocr_results` (NOT CREATED)**
- Purpose: Store structured, parsed fields from confirmed OCR
- Fields: field_name, field_value, confidence, bounding_box, page_number
- Would enable per-field confidence querying and visual highlighting

**New Table: `ocr_corrections` (NOT CREATED)**
- Purpose: Immutable correction history for individual OCR fields
- Fields: ocr_result_id, corrected_by, original_value, corrected_value, correction_reason
- Would track field-level correction history separately from confirmation edits

### Deferred: Backend Services

**OcrParsingService (NOT BUILT)**
- Would parse confirmed `extractedText` into structured fields using regex patterns
- Would extract common fields: invoice_number, invoice_date, total_amount, vendor_name
- Would calculate per-field confidence scores
- Would support bounding box extraction from OCR metadata

**OcrCorrectionsService (NOT BUILT)**
- Would handle field-level corrections post-confirmation
- Would create immutable correction records
- Would track correction history per field
- Would provide latest value computation (original or most recent correction)

**Extended OcrService Methods (NOT BUILT)**
- `getOcrResultsWithCorrections()` - Would return structured fields with correction history
- `parseOcrOutput()` - Would trigger field parsing on confirmed OCR
- Field-level correction endpoints

### Deferred: Frontend Components

**PDF Viewer with Bounding Boxes (NOT BUILT)**
- react-pdf integration
- Bounding box highlights on PDF
- Click field → highlight source in document
- Zoom, pan, page navigation

**Field-Level UI Components (NOT BUILT)**
- OcrFieldList with per-field confidence indicators (green/yellow/red)
- Color-coded confidence badges (≥80% green, 60-79% yellow, <60% red)
- Field-to-document linkage via bounding box clicks
- Separate field-level correction modals

### Why v8.1 Took a Different Approach

**Pragmatic considerations:**
1. **Existing infrastructure sufficient** - v3.5's `confirmedData` field already supports structured data
2. **Simpler architecture** - No need for parallel data structures
3. **Faster delivery** - UI governance layer provides immediate value
4. **Lower maintenance** - Fewer tables and services to maintain
5. **Flexibility** - Can still add structured parsing later if needed

**What v8.1 achieves without new tables:**
- Full extraction review workflow
- Correction tracking (via `confirmedData` JSON structure)
- Utilization enforcement
- State management
- Audit trail
- User governance controls

### Future Consideration

If business requirements demand:
- Granular field-level confidence tracking
- Advanced regex-based field extraction
- PDF bounding box highlights
- Per-field correction history with separate table

Then the original v8 plan could be revisited as **v8.5** or **v9** with the deferred features listed above.


---

## v8.1 Completion Summary

### What Was Delivered

**Completed:** 2026-02-03  
**Implementation Time:** ~2 weeks (across 15 conversation sessions)  
**Approach:** Iterative UI governance layer on existing v3.5 infrastructure

**Key Deliverables:**
1. ✅ Extraction state visibility across all UI touchpoints
2. ✅ Redo eligibility enforcement with clear user messaging
3. ✅ Extraction review page with provenance display
4. ✅ Mandatory correction reasons with audit trail
5. ✅ Confirmation modals explaining consequences
6. ✅ Utilization-based editing lockout
7. ✅ Empty/failed extraction state handling
8. ✅ Terminology alignment ("Extraction" vs "OCR")

**Files Modified:**
- `apps/web/app/task/[id]/page.tsx` - Task detail UI governance
- `apps/web/app/attachments/[attachmentId]/review/page.tsx` - Extraction review page
- `apps/web/components/OcrFieldList.tsx` - Field list with provenance
- `apps/web/components/OcrFieldEditModal.tsx` - Correction modal with mandatory reason
- `apps/api/src/ocr/ocr.service.ts` - Extended to include `utilizationType` in responses
- Backend DTOs - Updated to require `correctionReason`

**No New Files Created:**
- No new database tables
- No new backend services
- No new API endpoints (used existing v3.5 endpoints)

### Governance Alignment

**Explicit User Intent:** ✅
- All state transitions require explicit user action
- Confirmation requires modal acknowledgment
- Corrections require mandatory reason input
- Redo blocked with clear explanation when not allowed

**Auditability:** ✅
- All corrections logged with before/after values
- Correction reasons captured and displayed
- State transitions tracked (draft → confirmed → utilized)
- Provenance visible (original vs corrected values)

**Backend Authority:** ✅
- UI strictly adheres to backend state
- No client-side-only state for critical data
- Utilization rules enforced by backend, respected by UI
- Ownership checks on all operations

**Derived Data Non-Authoritative:** ✅
- Extraction data clearly labeled as derived
- Does not mutate task data
- Utilization tracking prevents inconsistency
- Archive mechanism for soft-utilization scenarios

### Testing & Validation

**Manual Testing Completed:**
- ✅ Draft → Confirm → Utilize → Archive flow
- ✅ Redo eligibility for all utilization categories (A/B/C)
- ✅ Correction workflow with mandatory reasons
- ✅ Empty extraction state handling
- ✅ Failed PDF preview fallback
- ✅ Concurrent retrieval blocking
- ✅ Utilization-based editing lockout

**Known Limitations:**
- No automated tests added (manual testing only)
- No PDF bounding box highlights (deferred feature)
- No per-field confidence indicators (deferred feature)
- Correction history displayed inline (no separate modal)

---

## Next Steps & Future Enhancements

### Immediate Next Steps (If Needed)

1. **Add Automated Tests**
   - E2E tests for extraction review workflow
   - Integration tests for redo eligibility
   - Unit tests for correction validation

2. **Update Documentation**
   - Update `codemapcc.md` with v8.1 components
   - Update `executionnotes.md` with completion notes
   - Document extraction review workflow in user guide

3. **Performance Optimization**
   - Add caching for redo eligibility checks
   - Optimize PDF preview loading
   - Add loading skeletons for better UX

### Future Enhancements (v8.5 or v9)

If business requirements demand the original v8 vision:

**v8.5: Structured Field Parsing**
- Implement `ocr_results` table for granular field storage
- Build `OcrParsingService` with regex-based extraction
- Add per-field confidence tracking
- Support custom field definitions

**v8.6: PDF Bounding Boxes**
- Integrate `react-pdf` library
- Implement bounding box highlights
- Add field-to-document linkage
- Support zoom/pan/page navigation

**v8.7: Advanced Correction History**
- Implement `ocr_corrections` table
- Build field-level correction timeline
- Add correction comparison view
- Support correction rollback

**v9: Workflow Integration**
- Connect extraction data to workflow evidence gates
- Implement Category B utilization (workflow approval)
- Add extraction quality requirements for workflow progression
- Support workflow-driven extraction validation

---

## Relationship to Other Versions

**Depends on:**
- ✅ v3.5 (OCR confirmation workflow) — REQUIRED & COMPLETE
- ✅ v3 (Attachments, OCR worker) — REQUIRED & COMPLETE
- ✅ v1 (Audit logging) — REQUIRED & COMPLETE

**Enables:**
- Future: Workflow evidence gates (post-v9) can read confirmed extraction data
- Future: Export functions can use corrected extraction values
- Future: Record creation can prefill from confirmed extraction data
- Future: Structured field parsing (v8.5) can build on v8.1 governance layer

**No modifications required to:**
- v1-v2 (Tasks, Calendar)
- v4 (Parent/Child relationships)
- v5-v7 (Workflows)

---

## Lessons Learned

**What Worked Well:**
1. **Pragmatic approach** - Building on existing infrastructure was faster than creating parallel systems
2. **Iterative delivery** - Task groups A-E allowed incremental progress
3. **UI-first governance** - Enforcing backend rules in UI provided immediate value
4. **Terminology alignment** - "Extraction" vs "OCR" improved user understanding

**What Could Be Improved:**
1. **Test coverage** - Should have added automated tests alongside implementation
2. **Documentation lag** - Documentation updates should happen during implementation, not after
3. **Scope clarity** - Original plan.md didn't match actual implementation approach

**Recommendations for Future Versions:**
1. **Update plan.md first** - Ensure plan matches intended approach before starting
2. **Test-driven development** - Write tests alongside features
3. **Document as you go** - Update codemapcc.md and executionnotes.md incrementally
4. **Validate assumptions** - Confirm technical approach before extensive planning

---

## Conclusion

**v8.1 Status:** ✅ **COMPLETE**

v8.1 successfully delivered a comprehensive UI governance layer for the extraction review workflow. By building on existing v3.5 infrastructure rather than creating new database tables and services, we achieved:

- **Faster delivery** - 2 weeks vs estimated 4-6 weeks for original v8 plan
- **Lower complexity** - No new tables, services, or API endpoints
- **Full governance** - All required controls and audit trails in place
- **Future flexibility** - Can still add structured parsing later if needed

The original v8 vision (structured field parsing, PDF bounding boxes, field-level correction history) remains valid and can be pursued as v8.5+ if business requirements demand those capabilities.

**Next recommended work:** Update `codemapcc.md` and `executionnotes.md` to reflect v8.1 completion, then proceed to v9 or other planned features.
