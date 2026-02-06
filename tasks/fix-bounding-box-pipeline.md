# Fix Plan: Bounding Box Data Pipeline (B3 Completion)

**Date:** 2026-02-06
**Scope:** Enable hover highlighting by implementing bounding box extraction and storage throughout the OCR pipeline
**Status:** Not Started
**Priority:** P1 (Blocks Task B3 completion)

---

## Problem Statement

Task B3 "Extracted Text Pool Display" was marked complete based on frontend code review, but **hover highlighting does not work** because:

1. OCR Worker discards bounding box data from PaddleOCR
2. Backend hardcodes `boundingBox: null` when creating segments
3. Confidence scores are also hardcoded to `null`
4. Page numbers are hardcoded to `1` for all segments

**Current State:**
- Database column `extracted_text_segments.bounding_box` exists but contains only NULL values
- Frontend components are correctly wired and ready to display highlights
- PaddleOCR provides bounding box coordinates but they are discarded

**Desired State:**
- Bounding boxes extracted from PaddleOCR and stored in database
- Confidence scores preserved
- Correct page numbers tracked
- Hover highlighting works in review UI

---

## Root Cause Analysis

### 1. OCR Worker (apps/ocr-worker/main.py)

**Problem:** Lines 36-50 `flatten_text()` function discards all coordinate data

```python
def flatten_text(raw_result: list) -> str:
    """Extract plain text from PaddleOCR result, discarding coordinates."""
    lines = []
    for page in raw_result:
        if page is None:
            continue
        for item in page:
            if item is None or len(item) < 2:
                continue
            text = item[1][0] if isinstance(item[1], tuple) else item[1]
            lines.append(text.strip())
    return "\n".join(lines)
```

**What's Available:** PaddleOCR returns rich structured data:
```python
[
  [  # Page 0
    [
      [[x1, y1], [x2, y2], [x3, y3], [x4, y4]],  # Bounding box coordinates
      ('extracted text', confidence_score)        # Text and confidence
    ],
    ...
  ],
  ...  # More pages
]
```

**What We Need:** Extract and return:
- Text content
- Bounding box (normalized coordinates)
- Confidence score
- Page number

### 2. Backend OcrService (apps/api/src/ocr/ocr.service.ts)

**Problem:** Line 823 in `replaceTextSegments()` hardcodes nulls:

```typescript
await this.dbs.db.insert(extractedTextSegments).values(
  lines.map((text) => ({
    attachmentOcrOutputId,
    text,
    confidence: null,           // <-- Should be from OCR
    boundingBox: null,          // <-- Should be from OCR
    pageNumber: 1,              // <-- Should be from OCR
    createdAt: new Date(),
  })),
);
```

**What We Need:** Accept structured segment data from worker instead of plain text lines.

### 3. BaselineAssignmentsService (apps/api/src/baseline/baseline-assignments.service.ts)

**Problem:** Lines 373-376 in `backfillSegmentsFromText()` also hardcodes nulls (same issue as #2)

---

## Implementation Plan

### Task 1: Update OCR Worker Response Format

**File:** `apps/ocr-worker/main.py`

**Changes Required:**

1. **Create new function to extract structured segments** (add after `flatten_text`):

```python
def extract_segments(raw_result: list, page_width: int, page_height: int) -> list:
    """
    Extract structured segments with bounding boxes from PaddleOCR result.

    Returns:
    [
      {
        "text": "extracted text",
        "confidence": 0.95,
        "boundingBox": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.05},
        "pageNumber": 1
      },
      ...
    ]
    """
    segments = []
    for page_idx, page in enumerate(raw_result):
        if page is None:
            continue
        for item in page:
            if item is None or len(item) < 2:
                continue

            # Extract bounding box coordinates
            coords = item[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]

            # Normalize coordinates to 0-1 range
            x_coords = [pt[0] for pt in coords]
            y_coords = [pt[1] for pt in coords]
            x_min = min(x_coords) / page_width
            y_min = min(y_coords) / page_height
            x_max = max(x_coords) / page_width
            y_max = max(y_coords) / page_height

            # Extract text and confidence
            text_data = item[1]
            text = text_data[0] if isinstance(text_data, tuple) else text_data
            confidence = text_data[1] if isinstance(text_data, tuple) and len(text_data) > 1 else None

            segments.append({
                "text": text.strip(),
                "confidence": float(confidence) if confidence is not None else None,
                "boundingBox": {
                    "x": float(x_min),
                    "y": float(y_min),
                    "width": float(x_max - x_min),
                    "height": float(y_max - y_min)
                },
                "pageNumber": page_idx + 1  # 1-indexed
            })

    return segments
```

2. **Update OCR endpoint to return both formats** (modify `/ocr` endpoint, lines 150-205):

```python
@app.post("/ocr")
async def ocr_endpoint(request: Request):
    # ... existing code to get raw_result from PaddleOCR ...

    # Get page dimensions for normalization
    if mime_type == "application/pdf":
        # For PDF, get first page dimensions
        page_width = images[0].width if images else 1000
        page_height = images[0].height if images else 1000
    else:
        # For images, use actual dimensions
        page_width = images[0].width
        page_height = images[0].height

    # Extract structured segments
    segments = extract_segments(raw_result, page_width, page_height)

    # Keep backward compatibility with flattened text
    flattened = flatten_text(raw_result)

    return {
        "text": flattened,  # Keep for backward compatibility
        "segments": segments,  # NEW: Structured segments with bounding boxes
        "meta": {
            "engine": "paddleocr",
            "filename": filename,
            "mime_type": mime_type,
            "page_count": len(raw_result)
        }
    }
```

**Checkpoint Task 1:**
- Manual: POST a test image to `/ocr`, verify response includes `segments` array
- Expected: Each segment has `text`, `confidence`, `boundingBox` with `x/y/width/height`, and `pageNumber`
- Verify: Bounding box coordinates are between 0 and 1
- Verify: Confidence is a float between 0 and 1 (or null)

---

### Task 2: Update Backend OcrService to Accept Structured Segments

**File:** `apps/api/src/ocr/ocr.service.ts`

**Changes Required:**

1. **Update worker response type** (add interface near top of file):

```typescript
interface OcrWorkerSegment {
  text: string;
  confidence: number | null;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  pageNumber: number;
}

interface OcrWorkerResponse {
  text: string;          // Flattened text (backward compat)
  segments?: OcrWorkerSegment[];  // NEW: Structured segments
  meta: {
    engine: string;
    filename: string;
    mime_type: string;
    page_count?: number;
  };
}
```

2. **Update `extractFromWorker()` method** (around line 129):

```typescript
// After receiving worker response
const workerData = await workerResponse.json() as OcrWorkerResponse;

// Store the response with segments if available
const ocrOutputRecord = await this.dbs.db.insert(attachmentOcrOutputs).values({
  attachmentId: attachment.id,
  extractedText: workerData.text,
  metadata: JSON.stringify(workerData.meta),
  processingStatus: 'completed',
  status: 'draft',
  createdAt: new Date(),
}).returning();

// If worker provided structured segments, use them
if (workerData.segments && workerData.segments.length > 0) {
  await this.replaceTextSegments(
    ocrOutputRecord[0].id,
    workerData.segments  // Pass structured segments
  );
} else {
  // Fallback: split flattened text into lines (legacy mode)
  await this.replaceTextSegments(
    ocrOutputRecord[0].id,
    workerData.text.split('\n').map((text, idx) => ({
      text,
      confidence: null,
      boundingBox: null,
      pageNumber: 1
    }))
  );
}
```

3. **Update `replaceTextSegments()` signature** (around line 795):

```typescript
private async replaceTextSegments(
  attachmentOcrOutputId: string,
  segments: Array<{
    text: string;
    confidence: number | null;
    boundingBox: { x: number; y: number; width: number; height: number } | null;
    pageNumber: number;
  }>
): Promise<void> {
  await this.dbs.db
    .delete(extractedTextSegments)
    .where(eq(extractedTextSegments.attachmentOcrOutputId, attachmentOcrOutputId));

  if (segments.length === 0) return;

  await this.dbs.db.insert(extractedTextSegments).values(
    segments
      .filter(seg => seg.text.trim().length > 0)
      .map((seg) => ({
        attachmentOcrOutputId,
        text: seg.text.trim(),
        confidence: seg.confidence !== null ? seg.confidence.toString() : null,
        boundingBox: seg.boundingBox,  // Store actual bounding box
        pageNumber: seg.pageNumber,    // Store actual page number
        createdAt: new Date(),
      })),
  );
}
```

**Checkpoint Task 2:**
- Manual: Trigger OCR on a test document via API
- DB Query:
```sql
SELECT text, confidence, bounding_box, page_number
FROM extracted_text_segments
WHERE attachment_ocr_output_id = '<OUTPUT_ID>'
LIMIT 5;
```
- Expected: `confidence` is not null, `bounding_box` contains JSON with x/y/width/height, `page_number` varies
- Logs: No errors during OCR processing

---

### Task 3: Update BaselineAssignmentsService Backfill

**File:** `apps/api/src/baseline/baseline-assignments.service.ts`

**Changes Required:**

1. **Update `backfillSegmentsFromText()` method** (around line 355):

```typescript
private async backfillSegmentsFromText(
  attachmentOcrOutputId: string,
  extractedText: string,
): Promise<void> {
  // Split text into lines as before
  const lines = extractedText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return;

  // Insert with null bounding boxes (backfill mode - no coordinates available)
  const rows = await this.dbs.db.insert(extractedTextSegments).values(
    lines.map((text) => ({
      attachmentOcrOutputId,
      text,
      confidence: null,      // No confidence in backfill mode
      boundingBox: null,     // No bounding box in backfill mode
      pageNumber: 1,         // Default to page 1
      createdAt: new Date(),
    })),
  ).returning();

  this.logger.log(
    `Backfilled ${rows.length} text segments for output ${attachmentOcrOutputId} (no bounding boxes available in backfill mode)`,
  );
}
```

**Note:** This method is only for legacy/backfill scenarios. New OCR runs will use the structured segments from Task 2.

**Checkpoint Task 3:**
- Manual: Verify existing baselines still work
- DB: Check that backfilled segments have `bounding_box = null` (expected)
- Logs: Warning/info message about backfill mode

---

### Task 4: Frontend Verification (No Code Changes)

**Files:**
- `apps/web/app/components/ocr/ExtractedTextPool.tsx`
- `apps/web/app/components/ocr/PdfDocumentViewer.tsx`
- `apps/web/app/attachments/[attachmentId]/review/page.tsx`

**Verification Steps:**

1. **Upload a new test document** (PDF or image with text)
2. **Trigger OCR** on the document
3. **Create/confirm baseline** to populate segments
4. **Open review page** (`/attachments/{id}/review`)
5. **Test hover highlighting:**
   - Hover over segment in Panel 2 (Extracted Text)
   - Verify orange box appears on document in Panel 1
   - Verify box is in correct location
   - Verify page auto-navigates for multi-page PDFs
6. **Test confidence badges:**
   - Verify segments show colored badges (green/yellow/red)
   - Verify percentage matches confidence score
7. **Test truncation:**
   - Find long segment (>120 chars)
   - Verify "..." and "Show more" appears
   - Click to expand/collapse

**Checkpoint Task 4:**
- Manual: All tests above pass
- UI: Orange box highlights correct text region
- UI: Confidence badges show correct colors
- Regression: Existing functionality (assignments, drag-drop) still works

---

### Task 5: Handle Edge Cases

**Edge Cases to Test:**

1. **Image without text:** OCR returns empty segments
   - Expected: "No extracted text segments available" message

2. **Low-quality image:** OCR returns low confidence scores
   - Expected: Red confidence badges (<60%)

3. **Multi-page PDF:** Different text on each page
   - Expected: Correct page numbers, hover navigates to right page

4. **Segment without bounding box:** Worker fails to extract coords for some text
   - Expected: No highlight on hover (graceful degradation)

5. **Legacy documents:** Existing attachments with null bounding boxes
   - Expected: UI works, no highlights, no errors

**Checkpoint Task 5:**
- Manual: Test all edge cases above
- Logs: No errors or warnings
- UI: Graceful degradation when data is missing

---

## Execution Order

**Critical Path:**
1. Task 1 (OCR Worker) - MUST be first
2. Task 2 (Backend OcrService) - Depends on Task 1
3. Task 3 (Backfill service) - Can run parallel with Task 2
4. Task 4 (Frontend verification) - Depends on Tasks 1 & 2
5. Task 5 (Edge cases) - Depends on Task 4

**Time Estimates:**
- Task 1: 2 hours (Python OCR worker changes + testing)
- Task 2: 2 hours (TypeScript backend changes + testing)
- Task 3: 1 hour (Backfill service update)
- Task 4: 1 hour (Frontend manual testing)
- Task 5: 1 hour (Edge case testing)
- **Total: 7 hours**

---

## Rollback Plan

If issues arise:

1. **OCR Worker Rollback:**
   - Keep backward compatibility by always returning `text` field
   - Frontend/backend can ignore `segments` if not present
   - Old OCR outputs with null bounding boxes continue to work

2. **Database Rollback:**
   - No schema changes required (column already exists)
   - Can set `boundingBox` back to null if needed

3. **Frontend Rollback:**
   - No frontend changes required
   - Frontend already handles `boundingBox: null` gracefully

---

## Success Criteria

**Task B3 is COMPLETE when:**

- [ ] OCR Worker extracts and returns bounding boxes with confidence scores
- [ ] Backend stores bounding boxes in `extracted_text_segments` table
- [ ] Hovering over segment in review UI shows orange box on document
- [ ] Orange box appears in correct location matching the text
- [ ] Confidence badges display with correct colors (green/yellow/red)
- [ ] Multi-page PDFs show correct page numbers and auto-navigate on hover
- [ ] No console errors or API errors during hover
- [ ] Legacy documents (null bounding boxes) still work without errors
- [ ] All regression tests pass (OCR confirm, baseline review, assignments)

---

## Files to Modify

### Python Files
- [ ] `apps/ocr-worker/main.py` - Add `extract_segments()` function and update `/ocr` endpoint

### TypeScript Files
- [ ] `apps/api/src/ocr/ocr.service.ts` - Update `extractFromWorker()` and `replaceTextSegments()`
- [ ] `apps/api/src/baseline/baseline-assignments.service.ts` - Update `backfillSegmentsFromText()` with warning

### No Changes Required
- `apps/web/app/components/ocr/ExtractedTextPool.tsx` - Already correct
- `apps/web/app/components/ocr/PdfDocumentViewer.tsx` - Already correct
- `apps/web/app/attachments/[attachmentId]/review/page.tsx` - Already correct
- `apps/api/src/db/schema.ts` - Column already exists

---

## Testing Checklist

### Unit Testing
- [ ] OCR Worker: Test `extract_segments()` with sample PaddleOCR output
- [ ] Backend: Test `replaceTextSegments()` with structured segment data

### Integration Testing
- [ ] End-to-end: Upload → OCR → Baseline → Review page
- [ ] Verify database contains non-null bounding boxes
- [ ] Verify API response includes bounding boxes

### UI Testing
- [ ] Hover highlighting works on single-page PDF
- [ ] Hover highlighting works on multi-page PDF
- [ ] Hover highlighting works on images
- [ ] Confidence badges show correct colors
- [ ] No errors with documents that have null bounding boxes

### Regression Testing
- [ ] Existing OCR confirm flow works
- [ ] Baseline creation/review/confirm works
- [ ] Field assignments work
- [ ] Drag-and-drop assignments work
- [ ] OCR correction history works

---

## Notes

1. **Backward Compatibility:** The OCR worker changes maintain backward compatibility by keeping the `text` field. Older API versions can ignore the `segments` field.

2. **Performance:** Extracting bounding boxes adds minimal overhead to OCR processing (< 100ms per document).

3. **Coordinate System:** PaddleOCR uses pixel coordinates. We normalize to 0-1 range to handle different image/PDF sizes.

4. **Confidence Scores:** PaddleOCR confidence is already 0-1, stored as string in DB for consistency with frontend parsing.

5. **Page Numbers:** 1-indexed to match PDF viewer conventions.

---

## Related Tasks

- Task B3: Extracted Text Pool Display (8.6.8) - **Blocked by this fix**
- Task C4: Drag-and-Drop Assignment (8.6.16) - May benefit from bounding box data for better UX
- Task E1+E2: ML Suggestions - Could use bounding box data for spatial matching

---

## Open Questions

1. Should we add a migration to backfill bounding boxes for existing documents?
   - Recommendation: No, only new OCR runs get bounding boxes
   - Legacy documents work fine with null boxes

2. Should we re-run OCR automatically after this fix?
   - Recommendation: No, let users trigger re-OCR manually if needed
   - Check redo eligibility flow (checkRedoEligibility)

3. Should we validate bounding box coordinates (0-1 range)?
   - Recommendation: Yes, add validation in backend before insert
   - Clamp values to [0, 1] to prevent rendering issues

---

**Status:** Ready for implementation
**Assigned To:** TBD
**Review Required:** Yes (Python + TypeScript changes)
