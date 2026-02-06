# Reusable Prompt: Fix Bounding Box Data Pipeline

Copy and paste this prompt to any AI assistant (Claude, ChatGPT, etc.) to work on fixing the bounding box extraction pipeline.

---

## PROMPT START

I need to implement bounding box extraction for OCR text segments to enable hover highlighting in a document review interface. The system uses PaddleOCR (Python) for text extraction, NestJS (TypeScript) for the backend API, and React for the frontend.

### Current Problem

The hover highlighting feature is not working because bounding box data is being discarded in the OCR pipeline:

1. **OCR Worker (Python)**: PaddleOCR provides bounding box coordinates in its results, but the current implementation only extracts plain text using a `flatten_text()` function that discards all coordinate data
2. **Backend (TypeScript)**: The `replaceTextSegments()` method hardcodes `boundingBox: null` when creating segment records
3. **Database**: The `extracted_text_segments` table has a `bounding_box` JSONB column, but it only contains NULL values
4. **Frontend**: Components are correctly implemented and ready to display highlights, but receive no bounding box data

### What I Need

Implement the complete data pipeline to extract, store, and serve bounding box coordinates:

**OCR Worker Changes:**
- Create a function to extract structured segments from PaddleOCR results
- Each segment should include: text, confidence score, bounding box (normalized 0-1 coordinates), and page number
- Normalize pixel coordinates from PaddleOCR to relative coordinates (0-1 range)
- Return both flattened text (backward compatibility) and structured segments array

**Backend API Changes:**
- Update the OcrService to accept structured segments from the worker
- Modify `replaceTextSegments()` to store actual bounding box data instead of null
- Update TypeScript types/interfaces for the worker response format
- Handle both new structured format and legacy plain text fallback

**Data Format:**
- Worker should return segments as: `{ text: string, confidence: number|null, boundingBox: {x, y, width, height}|null, pageNumber: number }`
- Bounding box coordinates should be normalized (0-1 range)
- Confidence should be a float between 0-1 (or null if unavailable)
- Page numbers should be 1-indexed

### Implementation Details

**File Locations:**
- OCR Worker: `apps/ocr-worker/main.py` (FastAPI, Python)
- Backend Service: `apps/api/src/ocr/ocr.service.ts` (NestJS)
- Database Schema: `apps/api/src/db/schema.ts` (Drizzle ORM)
- Table: `extracted_text_segments` with columns: `id, attachment_ocr_output_id, text, confidence, bounding_box (JSONB), page_number, created_at`

**PaddleOCR Result Structure:**
```python
# PaddleOCR returns:
[
  [  # Page 0
    [
      [[x1, y1], [x2, y2], [x3, y3], [x4, y4]],  # Bounding box (4 corner points in pixels)
      ('extracted text', 0.95)                    # (text, confidence_score)
    ],
    # ... more items
  ],
  # ... more pages
]
```

**Normalization Required:**
- Extract min/max x and y from the 4 corner points
- Normalize by dividing by page width/height to get 0-1 range
- Store as: `{x: float, y: float, width: float, height: float}`

**Backend Current Implementation (to modify):**
```typescript
// Current code in apps/api/src/ocr/ocr.service.ts (~line 823)
await this.dbs.db.insert(extractedTextSegments).values(
  lines.map((text) => ({
    attachmentOcrOutputId,
    text,
    confidence: null,           // <-- Need to populate from OCR
    boundingBox: null,          // <-- Need to populate from OCR
    pageNumber: 1,              // <-- Need to track actual page
    createdAt: new Date(),
  })),
);
```

### Requirements

1. **Maintain backward compatibility**: Keep returning plain `text` field from worker
2. **Handle edge cases**: Gracefully handle segments without bounding boxes (set to null)
3. **Coordinate validation**: Ensure coordinates are within 0-1 range (clamp if needed)
4. **Type safety**: Add proper TypeScript interfaces for the new data structures
5. **No frontend changes**: Frontend is already correct, just needs backend data
6. **Testing**: Provide examples of how to verify the changes work correctly

### Success Criteria

After implementation:
- OCR worker returns structured segments with bounding boxes
- Database `extracted_text_segments` table contains non-null bounding box values
- API endpoint returns segments with bounding box data
- Frontend hover highlighting displays orange box over correct text region
- Confidence badges display with appropriate colors (green/yellow/red)
- Multi-page PDFs track correct page numbers

### Constraints

- Do not modify database schema (columns already exist)
- Do not modify frontend components (already implemented correctly)
- Maintain existing OCR confirmation and baseline workflows
- Support both new structured format and legacy text-only fallback

### Additional Context

**Related Files (read these first):**
- `apps/ocr-worker/main.py` - OCR worker endpoint and text extraction
- `apps/api/src/ocr/ocr.service.ts` - OcrService with extractFromWorker() and replaceTextSegments()
- `apps/api/src/baseline/baseline-assignments.service.ts` - backfillSegmentsFromText() method
- `apps/api/src/db/schema.ts` - Database table definitions

**Testing Approach:**
1. Upload a test document (PDF or image)
2. Trigger OCR via API
3. Query database to verify bounding_box is not null
4. Check API response includes segments with boundingBox data
5. Open review UI and verify hover highlighting works

Please implement these changes step by step, starting with the OCR worker, then the backend service. Provide clear explanations of the changes and how to test them.

## PROMPT END

---

## Usage Instructions

1. **Copy everything between "PROMPT START" and "PROMPT END"**
2. **Paste into any AI assistant** (Claude Code, ChatGPT, Cursor, etc.)
3. **The assistant will have full context** to implement the fix
4. **No need to reference task numbers** - all details are self-contained

## Customization

You can modify this prompt to:
- Add/remove specific requirements
- Change implementation priorities
- Add additional constraints
- Include more context files
- Adjust success criteria

## Related Documents

- Full implementation plan: `tasks/fix-bounding-box-pipeline.md`
- Original task: Task B3 in `tasks/plan.md`
- Root cause analysis: See investigation notes in fix plan
