# Session State - 2026-02-13

## Current Status
- Milestone v8.8 -- ML-Assisted Field Suggestions (**COMPLETED**)
  - âœ… A1: ML Model Version Table (completed and verified)
  - âœ… A2: Field Assignment Suggestion Metadata (completed and verified)
  - âœ… A3: ML Table Suggestions Table (completed and verified)
  - âœ… B1: ML Service Skeleton + Health Check (completed and verified)
  - âœ… B2: Field Suggestion Endpoint (completed and verified)
  - âœ… B3: Table Detection Endpoint (Rule-Based) (completed and verified)
  - âœ… C1: ML Client Service + Config (completed and verified)
  - âœ… C2: Field Suggestion Generation Endpoint (completed, verified, **enhanced with fixes**)
  - âœ… C3: Accept / Modify / Clear Suggestion Actions (completed, verified, patched)
  - âœ… C4: Table Suggestion Persistence + Convert/Ignore (completed and verified)
  - âœ… D1: Suggestion Trigger + API Wiring (completed and verified)
  - âœ… D2: Suggested Field Input + Badges (completed and verified)
  - âœ… D3: Accept / Modify / Clear Suggestion Actions (completed and verified)
  - âœ… E1: Table Detection Manual Trigger + Inline Suggestions (completed and verified)
  - âœ… E2: Table Suggestion Preview Modal (completed and verified)

## Recent Achievements (2026-02-13 Evening)
- âœ… **Table Detection UX Redesign** - Changed from auto-trigger to manual "Get Suggestions" button
- âœ… **Inline Table Suggestions** - Moved suggestions from sidebar into Tables tab with blue background
- âœ… **Duplicate Prevention** - Backend now deletes old pending suggestions before creating new ones
- âœ… **Layout Optimization** - Removed sidebar, consolidated all content into 3-panel layout
- âœ… **Detection Fixes** - Fixed y-coordinate tolerance (0.02 for normalized coords), relaxed grid validation, lowered threshold to 0.50
- âœ… **Segment Deduplication** - Backend filters duplicate OCR segments before sending to ML service
- âœ… **E2 Stability Fixes** - Guarded preview grid rendering, refreshed suggestions after convert, and fixed mojibake/JSX issues

## Recent Achievements (2026-02-13 Morning)
- âœ… **Table Detection Auto-Trigger** - Implemented automatic table discovery on review page load with a 2-second delay.
- âœ… **Table Suggestion Banners** - Created UI components for non-blocking table discovery banners.
- âœ… **Manual Ignore Persistence** - Users can now ignore table suggestions with persistent state.

## Recent Achievements (2026-02-12)
- âœ… **Fixed numeric value detection** - Currency amounts with extra text (e.g., `$27.54 (1 item)`) now recognized
- âœ… **Implemented token overlap boost** - Disambiguates similar fields (Order Date vs Receive Date vs Shipment Date)
- âœ… Increased suggestion rate limit to 1000/hour for dev testing
- âœ… ML service restarted with both fixes active

## Critical Fixes Applied
1. **Numeric Detection Fix** ([main.py:127-165](apps/ml-service/main.py#L127-L165))
   - Currency symbols (`$`, `â‚¬`, `Â£`, etc.) trigger immediate recognition
   - Strips parenthetical content before digit ratio check
   - Lowered threshold to 40% for more lenient detection
   - **Impact**: Total Amount field now suggests `$27.54 (1 item)` instead of empty/label

2. **Token Overlap Boost** ([main.py:176-205](apps/ml-service/main.py#L176-L205))
   - Adds up to +0.30 boost for exact token matches
   - Distinctive tokens (e.g., "receive", "order") weighted higher than generic tokens (e.g., "date")
   - **Impact**: "Receive Date:" label now strongly prefers "Receive Date" field over "Order Date" field

## How ML Suggestions Work (Complete Flow)
```
OCR Segments â†’ Label Matching (with token boost) â†’ Spatial Proximity â†’ Value Selection
```

Example:
- OCR extracts: "Receive Date:" (label) + "10-10-2020" (value)
- Field library: "Receive Date" field
- **Step 1**: Match "Receive Date:" segment to "Receive Date" field (token boost ensures correct field)
- **Step 2**: Find nearby value "10-10-2020" using bounding box proximity
- **Result**: Suggest "10-10-2020" for "Receive Date" field âœ“

## Context
- ML service running with enhanced heuristics
- Suggestion rate limit: 1000 requests/hour (dev environment)
- Both fixes verified via unit tests in ml-service container

## Next Immediate Step
- User testing: Verify suggestions work correctly with real invoices containing multiple date fields and currency amounts

## Verification Status
- âœ… Numeric detection fix: Verified (test cases pass)
- âœ… Token overlap boost: Verified (test cases pass)
- âœ… ML service restart: Complete
- â³ End-to-end testing: Pending user verification
- âœ… API build: Passed after E2 follow-up fixes
- âœ… Web build: Passed after E2 follow-up fixes

## Known Issues (Non-Blocking)
- ML service model loading takes ~30 seconds on cold start (acceptable)
- CSRF token required for testing endpoints (expected security behavior)

## Blockers
- None

## Latest Fix Applied (2026-02-12)
3. **Proximity Logic Fix** ([main.py:294](apps/ml-service/main.py#L294))
   - Changed condition from `abs(vertical_dist) < 20` to `vertical_dist < 20`
   - Allows values slightly above OR below the label on the same row
   - **Impact**: Fixes Amazon-style layouts where "$27.54 (1 item)" appears 2px above "Order total" label

## Files Modified in Recent Session (2026-02-13)
### ML Detection Fixes
- `apps/ml-service/table_detect.py` - Changed y_tolerance from 10.0 to 0.02 for normalized coordinates
- `apps/ml-service/table_detect.py` - Relaxed grid validation (min 2 rows with 2+ cols instead of all rows)
- `apps/ml-service/main.py` - Lowered default threshold from 0.60 to 0.50

### Backend API Changes
- `apps/api/src/ml/table-suggestion.service.ts` - Added deduplication of OCR segments
- `apps/api/src/ml/table-suggestion.service.ts` - Delete old pending suggestions before creating new ones
- `apps/api/src/ml/table-suggestion.service.ts` - Changed default threshold to 0.5
- `apps/api/src/ml/table-suggestion.service.ts` - Use `mlResponse.data` for table detections

### Frontend UI Changes
- `apps/web/app/attachments/[attachmentId]/review/page.tsx` - Removed auto-detection on page load
- `apps/web/app/attachments/[attachmentId]/review/page.tsx` - Added "Get Suggestions" button in Tables tab
- `apps/web/app/attachments/[attachmentId]/review/page.tsx` - Moved table suggestions inline to Tables tab with blue background
- `apps/web/app/attachments/[attachmentId]/review/page.tsx` - Removed sidebar layout
- `apps/web/app/attachments/[attachmentId]/review/page.tsx` - Compact header design

### Documentation
- `tasks/plan.md` - Updated E1 with revised implementation approach
- `tasks/session-state.md` - Updated status (this file)
- `tasks/executionnotes.md` - To be updated with final summary
