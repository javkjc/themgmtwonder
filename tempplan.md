# PLAN — v8 Evidence Review & Derived Data Verification (Visual)

**Document Version:** 2.0  
**Status:** NOT STARTED  
**Current Phase:** Planning  
**Baseline:** v3.5 Complete (OCR draft/confirm/archive states implemented)  
**Target Completion:** TBD

---

## Overview

**What we're building:**
Visual, side-by-side inspection of confirmed OCR data with field-level confidence indicators, correction interface, and full audit trail. This builds on v3.5's OCR confirmation workflow by adding structured field parsing and visual review capabilities.

**What we're NOT building:**
- No authoritative data mutation (OCR results remain derived/non-authoritative)
- No automatic correction or learning
- No workflow coupling (workflow integration deferred to post-v9)

**Success Criteria:**
- [ ] Users can view PDF attachments side-by-side with parsed OCR fields
- [ ] Users can see per-field confidence scores with color-coded indicators
- [ ] Users can manually correct OCR fields (creates correction records)
- [ ] All OCR corrections preserved in immutable history
- [ ] Audit log captures all correction actions
- [ ] Confirmed OCR data (from v3.5) displayed in visual review interface

---

## Prerequisites (Dependencies Check)

**Required Complete:**
- [x] v3.5 — OCR draft/confirm/archive flow (status states, utilization tracking)
- [x] v3 — Attachments system with upload/download
- [x] v1 — Audit logging system

**Current State:**
- ✅ `attachment_ocr_outputs` table with status (draft/confirmed/archived)
- ✅ Confirmation workflow (draft → confirm submit → confirmed)
- ✅ Utilization tracking (Category A/B/C)
- ✅ Redo validation and Option-C archive
- ❌ Missing: Structured field parsing from confirmed OCR
- ❌ Missing: Field-level corrections (separate from confirm edits)
- ❌ Missing: Visual OCR review page
- ❌ Missing: PDF viewer with bounding box highlights

---

## Relationship to v3.5

**v3.5 provides:**
- OCR state machine (draft → confirmed → archived)
- Utilization tracking (determines redo eligibility)
- Confirmation workflow (user edits → confirms → immutable)

**v8 adds:**
- Structured field parsing (extract invoice_number, total_amount, etc. from confirmed OCR)
- Field-level corrections (post-confirmation corrections with history)
- Visual review UI (side-by-side PDF + field list)
- Confidence indicators (color-coded field confidence scores)

**Key distinction:**
- v3.5 `confirmOcrResult()` allows editing `extractedText` before confirming (one-time edit)
- v8 corrections apply AFTER confirmation (create immutable correction records, don't modify confirmed data)

---

## Database Schema Changes

### 1. New Table: `ocr_results`

**Purpose:** Store structured, parsed fields from confirmed OCR

```sql
CREATE TABLE ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_ocr_output_id UUID NOT NULL REFERENCES attachment_ocr_outputs(id) ON DELETE CASCADE,
  field_name VARCHAR(255) NOT NULL,
  field_value TEXT,
  confidence DECIMAL(5,4), -- 0.0000 to 1.0000
  bounding_box JSON, -- {x, y, width, height} for highlighting
  page_number INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_ocr_results_attachment_ocr_output_id (attachment_ocr_output_id),
  INDEX idx_ocr_results_field_name (field_name)
);
```

**Rationale:**
- Separates structured field data from raw `extractedText` blob
- Enables per-field confidence querying
- Bounding box enables visual highlighting on PDF
- Only created for `status='confirmed'` OCR (not drafts)

**Lifecycle:**
1. OCR worker completes → draft created (v3.5)
2. User confirms → `status='confirmed'` (v3.5)
3. **NEW:** System parses confirmed `extractedText` → creates `ocr_results` records (v8)
4. User views fields in visual review page (v8)

---

### 2. New Table: `ocr_corrections`

**Purpose:** Immutable correction history for OCR fields (post-confirmation)

```sql
CREATE TABLE ocr_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocr_result_id UUID NOT NULL REFERENCES ocr_results(id) ON DELETE CASCADE,
  corrected_by UUID NOT NULL REFERENCES users(id),
  original_value TEXT,
  corrected_value TEXT NOT NULL,
  correction_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_ocr_corrections_ocr_result_id (ocr_result_id),
  INDEX idx_ocr_corrections_corrected_by (corrected_by),
  INDEX idx_ocr_corrections_created_at (created_at)
);
```

**Rationale:**
- Preserves original parsed field value (immutable)
- Tracks who made correction and why
- Append-only (no updates or deletes)
- Separate from v3.5 confirmation edits (those edit raw `extractedText` before confirming)

**Distinction from v3.5 confirmation:**
- v3.5: Edit `extractedText` → confirm → locked
- v8: Parse confirmed text → extract fields → correct individual fields → create correction records

---

## Backend Implementation Plan

### Task 1: OcrParsingService (NEW)

**Objective:** Parse confirmed OCR `extractedText` into structured fields

**File:** `apps/api/src/ocr/ocr-parsing.service.ts` (NEW)

**Methods:**

```typescript
class OcrParsingService {
  /**
   * Parse confirmed OCR text into structured fields
   * Only called on status='confirmed' OCR
   */
  async parseOcrOutput(
    attachmentOcrOutputId: string
  ): Promise<OcrResult[]> {
    // 1. Load OCR output
    const ocrOutput = await this.db.query.attachmentOcrOutputs.findFirst({
      where: eq(attachmentOcrOutputs.id, attachmentOcrOutputId),
    });
    
    if (!ocrOutput) {
      throw new NotFoundException('OCR output not found');
    }
    
    // 2. Verify status is confirmed
    if (ocrOutput.status !== 'confirmed') {
      throw new BadRequestException(
        `Cannot parse OCR with status '${ocrOutput.status}'. Must be 'confirmed'.`
      );
    }
    
    // 3. Check if already parsed (avoid duplicate parsing)
    const existingResults = await this.db.query.ocrResults.findMany({
      where: eq(ocrResults.attachmentOcrOutputId, attachmentOcrOutputId),
    });
    
    if (existingResults.length > 0) {
      return existingResults; // Already parsed, return existing
    }
    
    // 4. Extract fields from confirmed text
    const extractedText = ocrOutput.extractedText || '';
    const fields = await this.extractFields(extractedText, ocrOutput.metadata);
    
    // 5. Insert parsed fields
    const results = await this.db.insert(ocrResults).values(fields).returning();
    
    // 6. Audit log
    await this.auditService.log({
      action: 'OCR_PARSED',
      resourceType: 'attachment_ocr_output',
      resourceId: attachmentOcrOutputId,
      metadata: { fieldsExtracted: results.length },
    });
    
    return results;
  }
  
  /**
   * Extract common document fields using regex patterns
   */
  private async extractFields(
    rawText: string,
    ocrMetadata: any
  ): Promise<Array<{
    fieldName: string;
    fieldValue: string;
    confidence: number;
    boundingBox: any | null;
    pageNumber: number | null;
  }>> {
    const fields = [];
    
    // Invoice Number
    const invoiceNumber = this.extractField(
      rawText,
      'invoice_number',
      [/Invoice\s*#?\s*:?\s*(\w+)/i, /Invoice\s*Number\s*:?\s*(\w+)/i]
    );
    if (invoiceNumber) fields.push(invoiceNumber);
    
    // Invoice Date
    const invoiceDate = this.extractField(
      rawText,
      'invoice_date',
      [/Invoice\s*Date\s*:?\s*([\d\/\-]+)/i, /Date\s*:?\s*([\d\/\-]+)/i]
    );
    if (invoiceDate) fields.push(invoiceDate);
    
    // Total Amount
    const totalAmount = this.extractField(
      rawText,
      'total_amount',
      [/Total\s*:?\s*\$?([\d,]+\.?\d*)/i, /Amount\s*Due\s*:?\s*\$?([\d,]+\.?\d*)/i]
    );
    if (totalAmount) fields.push(totalAmount);
    
    // Vendor Name (simple: first line often contains vendor)
    const lines = rawText.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      fields.push({
        fieldName: 'vendor_name',
        fieldValue: lines[0].trim(),
        confidence: 0.7, // Lower confidence for heuristic extraction
        boundingBox: null,
        pageNumber: 1,
      });
    }
    
    return fields;
  }
  
  /**
   * Extract single field using regex patterns
   */
  private extractField(
    rawText: string,
    fieldName: string,
    patterns: RegExp[]
  ): {
    fieldName: string;
    fieldValue: string;
    confidence: number;
    boundingBox: any | null;
    pageNumber: number | null;
  } | null {
    for (const pattern of patterns) {
      const match = rawText.match(pattern);
      if (match && match[1]) {
        return {
          fieldName,
          fieldValue: match[1].trim(),
          confidence: this.calculateConfidence(match[1], fieldName),
          boundingBox: null, // TODO: Extract from OCR metadata if available
          pageNumber: 1, // TODO: Detect page from OCR metadata
        };
      }
    }
    return null;
  }
  
  /**
   * Calculate confidence based on field type and value format
   */
  private calculateConfidence(value: string, fieldType: string): number {
    // Invoice number: alphanumeric, reasonable length
    if (fieldType === 'invoice_number') {
      return /^[A-Z0-9\-]+$/i.test(value) && value.length >= 3 && value.length <= 20
        ? 0.9
        : 0.6;
    }
    
    // Date: valid format
    if (fieldType === 'invoice_date') {
      const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
      return datePattern.test(value) ? 0.85 : 0.5;
    }
    
    // Amount: numeric with optional decimals
    if (fieldType === 'total_amount') {
      const amountPattern = /^[\d,]+\.?\d*$/;
      return amountPattern.test(value) ? 0.9 : 0.6;
    }
    
    // Default
    return 0.7;
  }
}
```

**Verification:**
- [ ] Create confirmed OCR with sample invoice text
- [ ] Call `parseOcrOutput()` → creates `ocr_results` records
- [ ] Verify fields: invoice_number, invoice_date, total_amount, vendor_name
- [ ] Verify confidence scores calculated correctly
- [ ] Verify audit log has `OCR_PARSED` event
- [ ] Call parse again → returns existing results (no duplicates)

---

### Task 2: OcrCorrectionsService (NEW)

**Objective:** Handle field-level corrections (post-confirmation)

**File:** `apps/api/src/ocr/ocr-corrections.service.ts` (NEW)

**Methods:**

```typescript
class OcrCorrectionsService {
  /**
   * Create correction for a parsed OCR field
   * User must own the attachment
   */
  async createCorrection(
    ocrResultId: string,
    correctedValue: string,
    correctionReason: string | null,
    userId: string
  ): Promise<OcrCorrection> {
    // 1. Load OCR result
    const ocrResult = await this.db.query.ocrResults.findFirst({
      where: eq(ocrResults.id, ocrResultId),
      with: {
        attachmentOcrOutput: {
          with: {
            attachment: {
              with: { todo: true },
            },
          },
        },
      },
    });
    
    if (!ocrResult) {
      throw new NotFoundException('OCR result not found');
    }
    
    // 2. Verify ownership
    const task = ocrResult.attachmentOcrOutput.attachment.todo;
    if (task.userId !== userId) {
      throw new ForbiddenException('You do not own this attachment');
    }
    
    // 3. Verify OCR is confirmed (can't correct draft or archived)
    if (ocrResult.attachmentOcrOutput.status !== 'confirmed') {
      throw new BadRequestException(
        `Cannot correct OCR with status '${ocrResult.attachmentOcrOutput.status}'. Must be 'confirmed'.`
      );
    }
    
    // 4. Create correction record
    const [correction] = await this.db
      .insert(ocrCorrections)
      .values({
        ocrResultId,
        correctedBy: userId,
        originalValue: ocrResult.fieldValue,
        correctedValue,
        correctionReason,
        createdAt: new Date(),
      })
      .returning();
    
    // 5. Audit log
    await this.auditService.log({
      action: 'OCR_FIELD_CORRECTED',
      resourceType: 'ocr_result',
      resourceId: ocrResultId,
      metadata: {
        fieldName: ocrResult.fieldName,
        originalValue: ocrResult.fieldValue,
        correctedValue,
        correctionReason,
      },
    });
    
    return correction;
  }
  
  /**
   * Get correction history for an OCR field
   */
  async getCorrectionHistory(
    ocrResultId: string
  ): Promise<OcrCorrection[]> {
    return this.db.query.ocrCorrections.findMany({
      where: eq(ocrCorrections.ocrResultId, ocrResultId),
      orderBy: asc(ocrCorrections.createdAt),
    });
  }
  
  /**
   * Get latest value for an OCR field (original or most recent correction)
   */
  async getLatestValue(
    ocrResultId: string
  ): Promise<{
    value: string;
    isCorrected: boolean;
    correctedAt?: Date;
    correctedBy?: string;
  }> {
    const ocrResult = await this.db.query.ocrResults.findFirst({
      where: eq(ocrResults.id, ocrResultId),
    });
    
    if (!ocrResult) {
      throw new NotFoundException('OCR result not found');
    }
    
    // Get most recent correction
    const latestCorrection = await this.db.query.ocrCorrections.findFirst({
      where: eq(ocrCorrections.ocrResultId, ocrResultId),
      orderBy: desc(ocrCorrections.createdAt),
    });
    
    if (latestCorrection) {
      return {
        value: latestCorrection.correctedValue,
        isCorrected: true,
        correctedAt: latestCorrection.createdAt,
        correctedBy: latestCorrection.correctedBy,
      };
    }
    
    // No corrections, return original
    return {
      value: ocrResult.fieldValue || '',
      isCorrected: false,
    };
  }
}
```

**Verification:**
- [ ] Create parsed OCR result (via Task 1)
- [ ] Call `createCorrection()` with new value
- [ ] Verify correction record created
- [ ] Verify audit log has `OCR_FIELD_CORRECTED` event
- [ ] Call `getLatestValue()` → returns corrected value
- [ ] Create second correction → verify history has 2 entries

---

### Task 3: Extend OcrService

**Objective:** Add method to get parsed fields with corrections for visual review UI

**File:** `apps/api/src/ocr/ocr.service.ts` (EXTEND)

**New Method:**

```typescript
/**
 * Get OCR results with parsed fields and corrections for visual review
 * Returns structured data for evidence review UI
 */
async getOcrResultsWithCorrections(
  attachmentId: string,
  userId: string
): Promise<{
  attachmentId: string;
  rawOcr: AttachmentOcrOutput;
  parsedFields: Array<{
    id: string;
    fieldName: string;
    originalValue: string;
    currentValue: string; // latest corrected value or original
    confidence: number;
    boundingBox: any | null;
    pageNumber: number | null;
    isCorrected: boolean;
    correctionHistory: OcrCorrection[];
  }>;
}> {
  // 1. Verify attachment exists and user owns it
  const attachment = await this.db.query.attachments.findFirst({
    where: eq(attachments.id, attachmentId),
    with: { todo: true },
  });
  
  if (!attachment) {
    throw new NotFoundException('Attachment not found');
  }
  
  if (attachment.todo.userId !== userId) {
    throw new ForbiddenException('You do not own this attachment');
  }
  
  // 2. Get current confirmed OCR (from v3.5)
  const rawOcr = await this.getCurrentConfirmedOcr(attachmentId);
  
  if (!rawOcr) {
    throw new NotFoundException('No confirmed OCR found for this attachment');
  }
  
  // 3. Get parsed fields (or parse if not yet done)
  let ocrResultsRecords = await this.db.query.ocrResults.findMany({
    where: eq(ocrResults.attachmentOcrOutputId, rawOcr.id),
  });
  
  if (ocrResultsRecords.length === 0) {
    // Auto-parse on first access
    ocrResultsRecords = await this.ocrParsingService.parseOcrOutput(rawOcr.id);
  }
  
  // 4. For each field, get corrections and latest value
  const parsedFields = await Promise.all(
    ocrResultsRecords.map(async (result) => {
      const correctionHistory = await this.ocrCorrectionsService.getCorrectionHistory(result.id);
      const latestValue = await this.ocrCorrectionsService.getLatestValue(result.id);
      
      return {
        id: result.id,
        fieldName: result.fieldName,
        originalValue: result.fieldValue || '',
        currentValue: latestValue.value,
        confidence: result.confidence,
        boundingBox: result.boundingBox,
        pageNumber: result.pageNumber,
        isCorrected: latestValue.isCorrected,
        correctionHistory,
      };
    })
  );
  
  return {
    attachmentId,
    rawOcr,
    parsedFields,
  };
}
```

**Verification:**
- [ ] Create confirmed OCR
- [ ] Call `getOcrResultsWithCorrections()` → returns parsed fields
- [ ] Verify auto-parsing triggered if not yet parsed
- [ ] Verify correction history included for each field
- [ ] Verify currentValue reflects latest correction

---

### Task 4: API Endpoints (NEW)

**Objective:** Add REST endpoints for parsing and corrections

**File:** `apps/api/src/ocr/ocr.controller.ts` (EXTEND)

**New Endpoints:**

```typescript
/**
 * Trigger parsing of confirmed OCR into structured fields
 * (Usually auto-triggered on first view, but can be called manually)
 */
@Post('attachments/:attachmentId/ocr/parse')
@UseGuards(AuthGuard)
async parseOcr(
  @Param('attachmentId') attachmentId: string,
  @CurrentUser() user: User
): Promise<{ parsedFields: number; ocrResultIds: string[] }> {
  // Get confirmed OCR
  const ocr = await this.ocrService.getCurrentConfirmedOcr(attachmentId);
  
  if (!ocr) {
    throw new NotFoundException('No confirmed OCR found');
  }
  
  // Parse
  const results = await this.ocrParsingService.parseOcrOutput(ocr.id);
  
  return {
    parsedFields: results.length,
    ocrResultIds: results.map(r => r.id),
  };
}

/**
 * Get structured OCR results with corrections for visual review
 */
@Get('attachments/:attachmentId/ocr/results')
@UseGuards(AuthGuard)
async getOcrResults(
  @Param('attachmentId') attachmentId: string,
  @CurrentUser() user: User
): Promise<OcrResultsWithCorrections> {
  return this.ocrService.getOcrResultsWithCorrections(attachmentId, user.id);
}

/**
 * Create correction for OCR field
 */
@Post('ocr-results/:ocrResultId/corrections')
@UseGuards(AuthGuard)
async createCorrection(
  @Param('ocrResultId') ocrResultId: string,
  @Body() dto: CreateOcrCorrectionDto,
  @CurrentUser() user: User
): Promise<OcrCorrection> {
  return this.ocrCorrectionsService.createCorrection(
    ocrResultId,
    dto.correctedValue,
    dto.correctionReason,
    user.id
  );
}

/**
 * Get correction history for OCR field
 */
@Get('ocr-results/:ocrResultId/corrections')
@UseGuards(AuthGuard)
async getCorrectionHistory(
  @Param('ocrResultId') ocrResultId: string,
  @CurrentUser() user: User
): Promise<OcrCorrection[]> {
  return this.ocrCorrectionsService.getCorrectionHistory(ocrResultId);
}
```

**DTOs:**

```typescript
class CreateOcrCorrectionDto {
  @IsString()
  @IsNotEmpty()
  correctedValue: string;

  @IsString()
  @IsOptional()
  correctionReason?: string;
}
```

**Verification:**
- [ ] POST `/attachments/:id/ocr/parse` → returns parsed field count
- [ ] GET `/attachments/:id/ocr/results` → returns fields with corrections
- [ ] POST `/ocr-results/:id/corrections` → creates correction
- [ ] GET `/ocr-results/:id/corrections` → returns correction history
- [ ] Verify ownership checks on all endpoints

---

## Frontend Changes

### Task 5: OCR Review Page (NEW)

**Objective:** Visual side-by-side review interface

**File:** `apps/web/app/attachments/[attachmentId]/review/page.tsx` (NEW)

**Layout:**

```
+----------------------+----------------------+
|  Document View       |  OCR Fields          |
|  (PDF Viewer)        |  (Field List)        |
|                      |                      |
|  [PDF Preview]       |  Invoice Number      |
|  with highlight      |  INV-12345  ✓ 95%   |
|  boxes               |  [Edit] [History]    |
|                      |                      |
|                      |  Invoice Date        |
|                      |  02/01/2024 ⚠️ 72%  |
|                      |  [Edit] [History]    |
|                      |                      |
|                      |  Total Amount        |
|                      |  $1,234.56  ✓ 90%   |
|                      |  [Edit] [History]    |
+----------------------+----------------------+
```

**Components to Build:**

1. **PDFViewer Component**
   - Library: `react-pdf`
   - Features: Zoom, pan, page navigation
   - Highlight bounding boxes from parsed fields
   - Click highlight → jump to field in right panel

2. **OcrFieldList Component**
   - Display all parsed fields
   - Color-coded confidence:
     - Green (≥80%): ✓
     - Yellow (60-79%): ⚠️
     - Red (<60%): ❌
   - Show current value (original or corrected)
   - Actions: [Edit] [View History]

3. **OcrFieldEditModal Component**
   - Display: Field name, original value, current value, confidence
   - Input: New corrected value
   - Optional: Correction reason
   - Buttons: [Cancel] [Save Correction]

4. **OcrCorrectionHistoryModal Component**
   - Timeline of all corrections for field
   - Show: Who, when, original → corrected, reason
   - Read-only

**State Management:**

```typescript
interface OcrReviewPageState {
  attachmentId: string;
  attachment: Attachment;
  ocrData: OcrResultsWithCorrections | null;
  selectedFieldId: string | null;
  isEditModalOpen: boolean;
  isHistoryModalOpen: boolean;
  highlightedBoundingBox: BoundingBox | null;
  loading: boolean;
  error: string | null;
}
```

**Data Flow:**
1. Page loads → Fetch attachment
2. Fetch OCR results with corrections
3. Display PDF + field list
4. User clicks field → Highlight bounding box on PDF
5. User clicks [Edit] → Open edit modal
6. User saves correction → POST → Refresh results
7. User clicks [History] → Open history modal

**Verification:**
- [ ] Page renders with PDF and field list
- [ ] Confidence colors display correctly
- [ ] Edit modal opens and saves corrections
- [ ] History modal displays correction timeline
- [ ] Bounding box highlights work (if available in OCR data)

---

### Task 6: Update Task Detail Page

**Objective:** Add link to OCR review page

**File:** `apps/web/app/task/[id]/page.tsx` (MODIFY)

**Changes:**

Add link for attachments with confirmed OCR:

```tsx
{attachment.ocrStatus === 'confirmed' && (
  <Link 
    href={`/attachments/${attachment.id}/review`}
    className="text-blue-600 hover:underline text-sm"
  >
    📋 Review OCR Fields
  </Link>
)}
```

**Show OCR summary:**
```tsx
{ocrSummary && (
  <div className="text-xs text-gray-500 mt-1">
    {ocrSummary.fieldsExtracted} fields extracted
    {ocrSummary.fieldsCorrected > 0 && (
      <span className="text-orange-600">
        {' '}• {ocrSummary.fieldsCorrected} corrected
      </span>
    )}
  </div>
)}
```

**Verification:**
- [ ] Link appears for confirmed OCR attachments
- [ ] Link navigates to review page
- [ ] OCR summary displays correctly

---

## Frontend Libraries

**PDF Viewing:**
```bash
npm install react-pdf pdfjs-dist
```

**Usage:**
- `react-pdf`: React wrapper for PDF.js
- Rendering PDF with bounding box overlays

---

## Testing Strategy

### Unit Tests (Backend)

**OcrParsingService:**
- Parse invoice text → verify fields extracted
- Parse receipt text → verify different field patterns
- Parse with no matches → verify empty array returned
- Confidence calculation → verify scoring logic

**OcrCorrectionsService:**
- Create correction → verify record created
- Get correction history → verify chronological order
- Get latest value → verify returns most recent correction

### Integration Tests (API)

- POST `/attachments/:id/ocr/parse` → Creates ocr_results
- GET `/attachments/:id/ocr/results` → Returns parsed fields
- POST `/ocr-results/:id/corrections` → Creates correction
- Verify ownership checks (cannot correct other user's OCR)

### E2E Tests (Frontend)

- Load OCR review page → PDF and fields render
- Click field → Bounding box highlights on PDF
- Edit field → Save → Value updates
- View history → Timeline displays correctly

---

## Implementation Order

### Phase 1: Backend Foundation (Tasks 1-4)
**Status:** Not Started

1. Database migrations (ocr_results, ocr_corrections tables)
2. Build OcrParsingService (Task 1)
3. Build OcrCorrectionsService (Task 2)
4. Extend OcrService (Task 3)
5. Add API endpoints (Task 4)
6. Unit tests
7. Integration tests

**Definition of Done:**
- [ ] Migrations run successfully
- [ ] API endpoints return expected responses
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual API testing successful

---

### Phase 2: Frontend Review Page (Task 5)
**Status:** Not Started

1. Install react-pdf library
2. Build PDFViewer component
3. Build OcrFieldList component
4. Build OcrFieldEditModal component
5. Build OcrCorrectionHistoryModal component
6. Wire up API calls and state
7. Add loading/error states

**Definition of Done:**
- [ ] Review page accessible
- [ ] PDF renders correctly
- [ ] Field list displays with confidence colors
- [ ] Edit modal saves corrections
- [ ] History modal displays timeline
- [ ] Responsive design

---

### Phase 3: Integration (Task 6)
**Status:** Not Started

1. Update task detail page with review link
2. Add OCR summary display
3. E2E tests
4. Manual testing with various documents
5. Bug fixes
6. Documentation updates

**Definition of Done:**
- [ ] Task page links to review correctly
- [ ] E2E tests pass
- [ ] No console errors
- [ ] codemapcc.md updated
- [ ] executionnotes.md updated

---

## Edge Cases & Error Handling

### Backend

1. **No confirmed OCR exists:**
   - Status: 404
   - Message: "No confirmed OCR found for this attachment"

2. **Parsing returns no fields:**
   - Return empty array
   - Log warning
   - UI shows "No fields detected"

3. **User doesn't own attachment:**
   - Status: 403
   - Message: "You don't have permission to review this attachment"

### Frontend

1. **PDF fails to load:**
   - Show error message
   - Provide download link as fallback

2. **No fields parsed:**
   - Show "No fields detected" message
   - Suggest trying different OCR engine (future)

3. **Bounding box missing:**
   - Don't render highlight
   - Show "(No location data)" in field list

---

## Governance & Audit Compliance

### Explicit User Intent
- ✅ Parsing triggered explicitly (auto on first view, or manual)
- ✅ Corrections require explicit save action
- ✅ Correction reason encouraged (audit trail)

### Auditability
- ✅ All corrections logged to audit_logs
- ✅ Original field values preserved (immutable)
- ✅ Correction history append-only
- ✅ Timestamps on all records

### Derived Data Non-Authoritative
- ✅ Parsed fields are derived (from confirmed OCR)
- ✅ Corrections are derived (from parsed fields)
- ✅ Neither mutate task data
- ✅ Task data remains authoritative

### Backend Authority
- ✅ All validation happens server-side
- ✅ Ownership checks on all endpoints
- ✅ No client-side-only state for corrections
- ✅ Parsing and correction logic in backend services

---

## Success Metrics

**Functional Metrics:**
- [ ] Users can review parsed OCR fields for confirmed attachments
- [ ] Users can correct OCR fields and see corrections persist
- [ ] Correction history visible for all fields
- [ ] PDF bounding boxes highlight correctly (when available)
- [ ] Confidence indicators display with correct colors

**Performance Metrics:**
- [ ] OCR review page loads in <2 seconds
- [ ] PDF rendering completes in <3 seconds
- [ ] Correction save responds in <500ms
- [ ] Field parsing completes in <1 second

**Quality Metrics:**
- [ ] Zero data loss (all corrections preserved)
- [ ] Zero unauthorized access (ownership enforced)
- [ ] All actions audited (100% audit coverage)
- [ ] Parsing accuracy >70% for common invoice fields

---

## Post-Completion Checklist

- [ ] All tests pass (unit, integration, E2E)
- [ ] Manual testing completed with 5+ document types (invoices, receipts, contracts)
- [ ] codemapcc.md updated with new services/components
- [ ] executionnotes.md documents completion date and findings
- [ ] No TODO comments in committed code
- [ ] All migrations run successfully on staging
- [ ] Performance metrics validated
- [ ] Governance review confirms audit compliance
- [ ] v3.5 integration verified (confirm workflow → parse → correct flow works end-to-end)

---

## Known Limitations (v8)

1. **Simple field extraction:**
   - Basic regex patterns only (invoice_number, invoice_date, total_amount, vendor_name)
   - No advanced NLP/ML extraction
   - No custom field definitions (user cannot add new field types)
   - Deferred: Advanced extraction patterns

2. **No workflow integration:**
   - OCR review is standalone feature
   - Workflow evidence gates deferred to post-v9
   - Category B utilization (workflow approval) not yet implemented

3. **No confidence threshold enforcement:**
   - All fields displayed regardless of confidence
   - No blocking based on low confidence
   - Enforcement added when workflow integration added

4. **No batch operations:**
   - Must correct fields one at a time
   - No bulk correction across multiple fields
   - Deferred: Batch correction feature

5. **Bounding box limitations:**
   - Depends on OCR worker providing location data
   - May be null if OCR engine doesn't support it
   - Highlighting won't work without bounding box data

6. **No OCR re-run from review page:**
   - Must use v3.5 redo workflow (check eligibility → archive if needed → trigger new OCR)
   - Review page is read-only for OCR state changes
   - Redo controls remain in attachment list/task detail page

---

## Integration with v3.5

**v3.5 provides the foundation:**
- Draft/confirm/archive states → v8 only works with `status='confirmed'` OCR
- Utilization tracking → v8 corrections don't affect utilization (corrections are post-confirmation, utilization tracks confirmation usage)
- Redo rules → v8 respects v3.5 redo eligibility (cannot parse archived OCR)

**v8 extends v3.5:**
- Parses confirmed `extractedText` into structured fields
- Adds field-level corrections (separate from confirmation edits)
- Provides visual review UI for confirmed data

**State flow:**
```
v3.5: [Draft] → Confirm Submit → [Confirmed] → Utilized → [Archived if Category C]
                                       ↓
v8:                              [Parse Fields] → [Correct Fields] → [View History]
```

**Key distinction:**
- v3.5 `confirmOcrResult()`: Edit `extractedText` before confirming (one-time, pre-confirmation)
- v8 corrections: Correct parsed fields after confirming (multiple times, post-confirmation, creates correction records)

---

## Stop Conditions

**Do NOT proceed to implementation if:**
- [ ] v3.5 not complete (OCR confirmation workflow not working)
- [ ] v3 attachment upload/download broken
- [ ] v1 audit logging system not functioning
- [ ] Database migrations fail on dev/staging
- [ ] PDF viewer library incompatible with Next.js version

**Do NOT mark v8 complete until:**
- [ ] All tasks (1-6) marked DONE
- [ ] All tests pass (unit, integration, E2E)
- [ ] Manual testing with 5+ document types successful
- [ ] Governance review passes
- [ ] codemapcc.md and executionnotes.md updated
- [ ] v3.5 → v8 integration verified (confirm → parse → correct flow works)

---

## Notes for AI Code Generation

**When generating code prompts from this plan:**

1. **Task Boundaries:** Each task (1-6) should be a separate prompt
2. **File Context:** Include relevant existing files (schema.ts, ocr.service.ts from v3.5)
3. **Governance Reminders:** Include audit logging requirements in every prompt
4. **Testing Requirements:** Include test case examples in backend prompts
5. **Error Handling:** Specify error responses in API endpoint prompts
6. **TypeScript Strict:** All code must satisfy strict TypeScript checks
7. **v3.5 Context:** Reference v3.5 methods (getCurrentConfirmedOcr, checkRedoEligibility) where applicable

**Prompt Template:**
```
Task: [Task Number and Name]
Context: [Current files to modify/extend, v3.5 dependencies]
Requirements: [Specific acceptance criteria]
Governance: [Audit/validation requirements]
v3.5 Integration: [How this task uses v3.5 functionality]
Testing: [Test cases to implement]
Output: [Expected files and changes]
```

---

## Relationship to Other Versions

**Depends on:**
- v3.5 (OCR confirmation workflow) — REQUIRED
- v3 (Attachments, OCR worker) — REQUIRED
- v1 (Audit logging) — REQUIRED

**Enables:**
- Future: Workflow evidence gates (post-v9) can read corrected OCR fields
- Future: Export functions can use corrected field values
- Future: Record creation can prefill from corrected OCR data

**No modifications required to:**
- v1-v2 (Tasks, Calendar)
- v4 (Parent/Child relationships)
- v5-v7 (Workflows)