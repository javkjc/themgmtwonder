import logging
import time
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field

from model import MODEL_VERSION, embed_texts, get_model_error, load_model
from table_detect import detect_tables

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ML Service", version="0.2.0")


class SegmentBoundingBoxInput(BaseModel):
    x: float
    y: float
    width: float
    height: float


class SegmentInput(BaseModel):
    id: str
    text: str
    boundingBox: Optional[SegmentBoundingBoxInput] = None
    pageNumber: Optional[int] = None


class FieldInput(BaseModel):
    fieldKey: str
    label: str
    characterType: Optional[str] = None  # varchar, int, decimal, date, currency


class SuggestFieldsRequest(BaseModel):
    baselineId: str
    segments: List[SegmentInput]
    fields: List[FieldInput]
    threshold: Optional[float] = Field(default=None)


class Suggestion(BaseModel):
    segmentId: str
    fieldKey: str
    confidence: float


class ErrorPayload(BaseModel):
    code: str
    message: str


class SuggestFieldsResponse(BaseModel):
    ok: bool
    modelVersion: str
    threshold: float
    suggestions: List[Suggestion]
    error: Optional[ErrorPayload] = None


class SegmentBoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class TableSegmentInput(BaseModel):
    id: str
    text: str
    boundingBox: SegmentBoundingBox
    pageNumber: Optional[int] = None
    confidence: Optional[float] = None


class DetectTablesRequest(BaseModel):
    attachmentId: str
    segments: List[TableSegmentInput]
    threshold: Optional[float] = Field(default=None)


class TableCell(BaseModel):
    rowIndex: int
    columnIndex: int
    text: str
    segmentId: str


class TableBoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class TableDetection(BaseModel):
    regionId: str
    rowCount: int
    columnCount: int
    confidence: float
    boundingBox: TableBoundingBox
    cells: List[TableCell]
    suggestedLabel: str


class DetectTablesResponse(BaseModel):
    ok: bool
    attachmentId: str
    threshold: float
    tables: List[TableDetection]
    processingTimeMs: int
    error: Optional[ErrorPayload] = None


@app.on_event("startup")
def startup_event() -> None:
    load_model(timeout_seconds=120.0)


@app.get("/health")
def health():
    return {"status": "ok"}


def is_numeric_value(text: str) -> bool:
    """Check if text looks like a numeric value (not a label)"""
    text = text.strip()

    # Quick check: if no digits, definitely not numeric
    if not any(c.isdigit() for c in text):
        return False

    # Check for currency symbols - strong indicator it's a value
    if any(symbol in text for symbol in ["$", "€", "£", "¥", "₹"]):
        return True

    # Check for number patterns with decimals/commas
    # Remove currency symbols, whitespace, and common numeric formatting
    cleaned = text.replace("$", "").replace("€", "").replace("£", "").replace("¥", "").replace("₹", "")
    cleaned = cleaned.replace(",", "").replace(" ", "")

    # Split on common delimiters to extract the main numeric part
    # This handles cases like "$27.54 (1 item)" -> "$27.54"
    for delimiter in ["(", ")", "[", "]", "{", "}"]:
        if delimiter in cleaned:
            parts = cleaned.split(delimiter)
            # Take the first part that contains digits
            for part in parts:
                if any(c.isdigit() for c in part):
                    cleaned = part.strip()
                    break

    # Now check if what remains is mostly numeric
    # Remove decimal points and dashes (for negative numbers)
    numeric_check = cleaned.replace(".", "").replace("-", "")

    if numeric_check:
        digit_ratio = sum(c.isdigit() for c in numeric_check) / len(numeric_check)
        # More lenient threshold: 40% instead of 50%
        if digit_ratio > 0.4:
            return True

    return False


def normalize_text(text: str) -> str:
    return (
        text.lower()
        .replace(",", " ")
        .replace(".", " ")
        .replace(":", " ")
        .replace("-", " ")
        .replace("/", " ")
        .replace("  ", " ")
        .strip()
    )


def label_tokens(label: str) -> List[str]:
    tokens = [t for t in normalize_text(label).split() if t]
    # Normalize common synonyms/abbreviations
    normalized = []
    for token in tokens:
        if token in ["#", "no", "num", "number"]:
            normalized.append("number")
        else:
            normalized.append(token)
    return normalized


def matches_label(segment_text: str, field_label: str) -> bool:
    tokens = label_tokens(field_label)
    if not tokens:
        return False
    seg = normalize_text(segment_text)
    # Normalize segment text with same synonym rules
    seg_tokens = normalize_text(seg).split()
    seg_tokens = ["number" if t in ["#", "no", "num", "number"] else t for t in seg_tokens]

    # For multi-word labels, require at least one significant token match
    # (not just generic words like "total", "date", "number")
    if len(tokens) > 1:
        # Check if any distinctive (non-generic) token matches
        distinctive_field_tokens = [t for t in tokens if t not in {"date", "number", "total", "amount", "name", "id"}]
        distinctive_seg_tokens = [t for t in seg_tokens if t not in {"date", "number", "total", "amount", "name", "id"}]

        # If there are distinctive tokens in the field label, require at least one to match
        if distinctive_field_tokens:
            has_distinctive_match = any(t in seg_tokens for t in distinctive_field_tokens)
            if has_distinctive_match:
                # Also require at least one common token to match
                common_matches = sum(1 for t in tokens if t in seg_tokens)
                return common_matches >= 1
        else:
            # All tokens are generic (e.g., "total amount"), require majority match
            matches = sum(1 for t in tokens if t in seg_tokens)
            return matches >= len(tokens) / 2

    # For single-word labels, require exact match
    return all(token in seg_tokens for token in tokens)


def calculate_token_overlap_boost(segment_text: str, field_label: str) -> float:
    """
    Calculate a boost score based on exact token matches between segment and field label.
    Returns a value between 0.0 and 0.3 to add to the similarity score.

    Examples:
    - "Receive Date" segment vs "Receive Date" field → high boost (0.3)
    - "Order Date" segment vs "Receive Date" field → low boost (0.1, only "date" matches)
    - "Jul 28, 2023" segment vs "Receive Date" field → no boost (0.0)
    """
    field_tokens = set(label_tokens(field_label))
    seg_tokens = set(label_tokens(segment_text))

    if not field_tokens or not seg_tokens:
        return 0.0

    # Calculate overlap ratio
    overlap = field_tokens & seg_tokens  # Intersection
    overlap_ratio = len(overlap) / len(field_tokens)

    # Special boost for distinctive tokens (not common words like "date", "number")
    distinctive_matches = overlap - {"date", "number", "total", "amount", "name", "id"}

    # Base boost from overlap ratio (up to 0.15)
    base_boost = overlap_ratio * 0.15

    # Additional boost for distinctive token matches (up to 0.15)
    distinctive_boost = min(len(distinctive_matches) / max(len(field_tokens), 1), 1.0) * 0.15

    return base_boost + distinctive_boost


def is_date_value(text: str) -> bool:
    # Basic heuristics: contains month name or date-like digits
    lower = text.strip().lower()
    if any(month in lower for month in [
        "jan", "feb", "mar", "apr", "may", "jun",
        "jul", "aug", "sep", "oct", "nov", "dec"
    ]):
        return True
    # Date patterns like 2023-07-28, 07/28/2023, 28/07/2023
    digits = [c for c in lower if c.isdigit()]
    return len(digits) >= 6 and any(sep in lower for sep in ["-", "/"])


def is_value_for_field(text: str, field_type: Optional[str]) -> bool:
    if field_type in ["int", "decimal", "currency"]:
        return is_numeric_value(text)
    if field_type == "date":
        return is_date_value(text)
    return True


def find_value_near_label(
    label_segment: SegmentInput,
    all_segments: List[SegmentInput],
    field_type: Optional[str],
) -> Optional[SegmentInput]:
    """Find a value segment near a label segment based on layout proximity"""
    if not label_segment.boundingBox:
        return None

    label_box = label_segment.boundingBox
    label_page = label_segment.pageNumber or 1

    # Find candidates on same page, to the right or below the label
    candidates = []
    for seg in all_segments:
        if seg.id == label_segment.id:
            continue
        if not seg.boundingBox:
            continue
        if (seg.pageNumber or 1) != label_page:
            continue

        seg_box = seg.boundingBox

        # Calculate relative position
        is_to_right = seg_box.x > label_box.x
        is_below = seg_box.y > label_box.y

        # Prefer value-looking segments based on field type
        if not is_value_for_field(seg.text, field_type):
            continue

        # Calculate proximity score (closer is better)
        horizontal_dist = abs(seg_box.x - (label_box.x + label_box.width))
        vertical_dist = abs(seg_box.y - label_box.y)

        # Prefer right-aligned values (common in forms)
        # Accept values on approximately the same row (within 20px vertical tolerance)
        # This handles cases where value appears slightly above OR below the label
        if is_to_right and vertical_dist < 20:  # Same row (value can be above or below)
            proximity = horizontal_dist
        elif is_below and abs(horizontal_dist) < 50:  # Below, aligned
            proximity = vertical_dist + 50  # Penalty for not being on same row
        else:
            continue

        candidates.append((seg, proximity))

    if not candidates:
        return None

    # Return closest candidate
    candidates.sort(key=lambda x: x[1])
    return candidates[0][0]


@app.post("/ml/suggest-fields", response_model=SuggestFieldsResponse)
def suggest_fields(payload: SuggestFieldsRequest) -> SuggestFieldsResponse:
    threshold = payload.threshold if payload.threshold is not None else 0.5
    threshold = float(np.clip(threshold, 0.0, 1.0))

    model_error = get_model_error()
    if model_error is not None:
        load_model(timeout_seconds=120.0)
        model_error = get_model_error()

    if model_error is not None:
        logging.error(
            "ml_suggest_fields_unavailable",
            extra={
                "baselineId": payload.baselineId,
                "modelVersion": MODEL_VERSION,
                "suggestionCount": 0,
                "error": model_error,
            },
        )
        return SuggestFieldsResponse(
            ok=False,
            modelVersion=MODEL_VERSION,
            threshold=threshold,
            suggestions=[],
            error=ErrorPayload(code="MODEL_UNAVAILABLE", message=model_error),
        )

    if not payload.fields or not payload.segments:
        logging.info(
            "ml_suggest_fields",
            extra={
                "baselineId": payload.baselineId,
                "modelVersion": MODEL_VERSION,
                "suggestionCount": 0,
            },
        )
        return SuggestFieldsResponse(
            ok=True,
            modelVersion=MODEL_VERSION,
            threshold=threshold,
            suggestions=[],
        )

    try:
        field_texts = [field.label for field in payload.fields]
        segment_texts = [segment.text for segment in payload.segments]

        field_embeddings = embed_texts(field_texts)
        segment_embeddings = embed_texts(segment_texts)

        similarity_matrix = segment_embeddings @ field_embeddings.T

        # Apply token overlap boost to similarity scores
        for seg_idx, segment in enumerate(payload.segments):
            for field_idx, field in enumerate(payload.fields):
                boost = calculate_token_overlap_boost(segment.text, field.label)
                if boost > 0:
                    similarity_matrix[seg_idx, field_idx] = min(
                        similarity_matrix[seg_idx, field_idx] + boost, 1.0
                    )

        suggestions: List[Suggestion] = []
        processed_segments = set()  # Track which segments we've used
        suggested_field_keys = set()

        # First pass: try label-to-value proximity using text match (for numeric/date)
        for field in payload.fields:
            if field.characterType not in ["int", "decimal", "currency", "date"]:
                continue
            if field.fieldKey in suggested_field_keys:
                continue
            logging.info(
                "ml_suggest_fields_first_pass_field",
                extra={
                    "baselineId": payload.baselineId,
                    "fieldKey": field.fieldKey,
                    "fieldLabel": field.label,
                    "fieldType": field.characterType,
                },
            )
            for segment in payload.segments:
                if segment.id in processed_segments:
                    logging.info(
                        "ml_suggest_fields_first_pass_skip_segment",
                        extra={
                            "baselineId": payload.baselineId,
                            "fieldKey": field.fieldKey,
                            "segmentId": segment.id,
                            "segmentText": segment.text,
                            "reason": "processed_segment",
                        },
                    )
                    continue
                if not segment.boundingBox:
                    logging.info(
                        "ml_suggest_fields_first_pass_skip_segment",
                        extra={
                            "baselineId": payload.baselineId,
                            "fieldKey": field.fieldKey,
                            "segmentId": segment.id,
                            "segmentText": segment.text,
                            "reason": "missing_bounding_box",
                        },
                    )
                    continue
                if not matches_label(segment.text, field.label):
                    logging.info(
                        "ml_suggest_fields_first_pass_no_label_match",
                        extra={
                            "baselineId": payload.baselineId,
                            "fieldKey": field.fieldKey,
                            "fieldLabel": field.label,
                            "segmentId": segment.id,
                            "segmentText": segment.text,
                        },
                    )
                    continue

                value_segment = find_value_near_label(
                    segment,
                    payload.segments,
                    field.characterType,
                )
                if value_segment:
                    logging.info(
                        "ml_suggest_fields_first_pass_match",
                        extra={
                            "baselineId": payload.baselineId,
                            "fieldKey": field.fieldKey,
                            "fieldLabel": field.label,
                            "labelSegmentId": segment.id,
                            "labelSegmentText": segment.text,
                            "valueSegmentId": value_segment.id,
                            "valueSegmentText": value_segment.text,
                        },
                    )
                    suggestions.append(
                        Suggestion(
                            segmentId=value_segment.id,
                            fieldKey=field.fieldKey,
                            confidence=0.9,
                        )
                    )
                    processed_segments.add(segment.id)
                    processed_segments.add(value_segment.id)
                    suggested_field_keys.add(field.fieldKey)
                    break
                else:
                    logging.info(
                        "ml_suggest_fields_first_pass_no_value_near_label",
                        extra={
                            "baselineId": payload.baselineId,
                            "fieldKey": field.fieldKey,
                            "fieldLabel": field.label,
                            "labelSegmentId": segment.id,
                            "labelSegmentText": segment.text,
                        },
                    )

        for row_index, segment in enumerate(payload.segments):
            if segment.id in processed_segments:
                continue

            scores = similarity_matrix[row_index]
            best_index = int(np.argmax(scores))
            best_score = float(scores[best_index])
            confidence = float(np.clip(best_score, 0.0, 1.0))

            if confidence >= threshold:
                matched_field = payload.fields[best_index]
                if matched_field.fieldKey in suggested_field_keys:
                    continue

                # Check if this segment looks like a label (not a value)
                is_likely_label = not is_numeric_value(segment.text) and len(segment.text.split()) <= 5

                # For numeric/date fields, try to find nearby value
                if (
                    is_likely_label
                    and matched_field.characterType in ["int", "decimal", "currency", "date"]
                    and segment.boundingBox
                ):
                    value_segment = find_value_near_label(
                        segment,
                        payload.segments,
                        matched_field.characterType,
                    )
                    if value_segment:
                        # Use the nearby value instead
                        suggestions.append(
                            Suggestion(
                                segmentId=value_segment.id,
                                fieldKey=matched_field.fieldKey,
                                confidence=confidence * 0.9,  # Slight penalty for proximity match
                            )
                        )
                        processed_segments.add(segment.id)
                        processed_segments.add(value_segment.id)
                        suggested_field_keys.add(matched_field.fieldKey)
                        continue

                # Use the segment directly
                suggestions.append(
                    Suggestion(
                        segmentId=segment.id,
                        fieldKey=matched_field.fieldKey,
                        confidence=confidence,
                    )
                )
                processed_segments.add(segment.id)
                suggested_field_keys.add(matched_field.fieldKey)

        logging.info(
            "ml_suggest_fields",
            extra={
                "baselineId": payload.baselineId,
                "modelVersion": MODEL_VERSION,
                "suggestionCount": len(suggestions),
            },
        )

        return SuggestFieldsResponse(
            ok=True,
            modelVersion=MODEL_VERSION,
            threshold=threshold,
            suggestions=suggestions,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced via error payload
        logging.error(
            "ml_suggest_fields_failed",
            extra={
                "baselineId": payload.baselineId,
                "modelVersion": MODEL_VERSION,
                "error": f"{type(exc).__name__}: {exc}",
            },
        )
        return SuggestFieldsResponse(
            ok=False,
            modelVersion=MODEL_VERSION,
            threshold=threshold,
            suggestions=[],
            error=ErrorPayload(
                code="SUGGESTION_FAILED",
                message=f"{type(exc).__name__}: {exc}",
            ),
        )


@app.post("/ml/detect-tables", response_model=DetectTablesResponse)
def detect_tables_endpoint(payload: DetectTablesRequest) -> DetectTablesResponse:
    start_time = time.perf_counter()
    threshold = payload.threshold if payload.threshold is not None else 0.60
    threshold = float(np.clip(threshold, 0.0, 1.0))

    # Input validation: max 1000 segments, max 5000 chars per segment
    if len(payload.segments) > 1000:
        error_msg = f"Too many segments: {len(payload.segments)} (max 1000)"
        logging.warning(
            "ml_detect_tables_input_limit",
            extra={
                "attachmentId": payload.attachmentId,
                "segmentCount": len(payload.segments),
                "error": error_msg,
            },
        )
        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        return DetectTablesResponse(
            ok=True,
            attachmentId=payload.attachmentId,
            threshold=threshold,
            tables=[],
            processingTimeMs=processing_time_ms,
            error=ErrorPayload(code="INPUT_LIMIT_EXCEEDED", message=error_msg),
        )

    # Check text length limits
    for seg in payload.segments:
        if len(seg.text) > 5000:
            error_msg = f"Segment text too long: {len(seg.text)} chars (max 5000)"
            logging.warning(
                "ml_detect_tables_input_limit",
                extra={
                    "attachmentId": payload.attachmentId,
                    "segmentId": seg.id,
                    "textLength": len(seg.text),
                    "error": error_msg,
                },
            )
            processing_time_ms = int((time.perf_counter() - start_time) * 1000)
            return DetectTablesResponse(
                ok=True,
                attachmentId=payload.attachmentId,
                threshold=threshold,
                tables=[],
                processingTimeMs=processing_time_ms,
                error=ErrorPayload(code="INPUT_LIMIT_EXCEEDED", message=error_msg),
            )

    # Empty input handling
    if not payload.segments:
        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        logging.info(
            "ml_detect_tables",
            extra={
                "attachmentId": payload.attachmentId,
                "tableCount": 0,
                "processingTimeMs": processing_time_ms,
            },
        )
        return DetectTablesResponse(
            ok=True,
            attachmentId=payload.attachmentId,
            threshold=threshold,
            tables=[],
            processingTimeMs=processing_time_ms,
        )

    try:
        # Convert segments to dict format expected by detect_tables
        segments_dict = [
            {
                "id": seg.id,
                "text": seg.text,
                "boundingBox": {
                    "x": seg.boundingBox.x,
                    "y": seg.boundingBox.y,
                    "width": seg.boundingBox.width,
                    "height": seg.boundingBox.height,
                },
                "pageNumber": seg.pageNumber,
                "confidence": seg.confidence,
            }
            for seg in payload.segments
        ]

        # Run detection
        table_results = detect_tables(segments_dict, threshold=threshold)

        processing_time_ms = int((time.perf_counter() - start_time) * 1000)

        logging.info(
            "ml_detect_tables",
            extra={
                "attachmentId": payload.attachmentId,
                "tableCount": len(table_results),
                "processingTimeMs": processing_time_ms,
            },
        )

        return DetectTablesResponse(
            ok=True,
            attachmentId=payload.attachmentId,
            threshold=threshold,
            tables=[TableDetection(**table) for table in table_results],
            processingTimeMs=processing_time_ms,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced via error payload
        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        logging.error(
            "ml_detect_tables_failed",
            extra={
                "attachmentId": payload.attachmentId,
                "error": f"{type(exc).__name__}: {exc}",
                "processingTimeMs": processing_time_ms,
            },
        )
        # Graceful degradation: return empty tables list with error info
        return DetectTablesResponse(
            ok=True,
            attachmentId=payload.attachmentId,
            threshold=threshold,
            tables=[],
            processingTimeMs=processing_time_ms,
            error=ErrorPayload(
                code="DETECTION_FAILED",
                message=f"{type(exc).__name__}: {exc}",
            ),
        )
