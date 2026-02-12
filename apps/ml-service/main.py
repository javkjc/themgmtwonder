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
    load_model(timeout_seconds=20.0)


@app.get("/health")
def health():
    return {"status": "ok"}


def is_numeric_value(text: str) -> bool:
    """Check if text looks like a numeric value (not a label)"""
    text = text.strip()
    # Check for currency, numbers, decimals, negative values
    if any(c.isdigit() for c in text):
        # Remove common numeric characters
        cleaned = text.replace(",", "").replace(".", "").replace("-", "").replace("$", "").replace("€", "").replace("£", "")
        # If mostly digits remain, it's likely a value
        if cleaned and sum(c.isdigit() for c in cleaned) / len(cleaned) > 0.5:
            return True
    return False


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

        # For numeric fields, prefer numeric-looking values
        if field_type in ["int", "decimal", "currency"]:
            if not is_numeric_value(seg.text):
                continue

        # Calculate proximity score (closer is better)
        horizontal_dist = abs(seg_box.x - (label_box.x + label_box.width))
        vertical_dist = abs(seg_box.y - label_box.y)

        # Prefer right-aligned values (common in forms)
        if is_to_right and abs(vertical_dist) < 20:  # Same row
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

        suggestions: List[Suggestion] = []
        processed_segments = set()  # Track which segments we've used

        for row_index, segment in enumerate(payload.segments):
            if segment.id in processed_segments:
                continue

            scores = similarity_matrix[row_index]
            best_index = int(np.argmax(scores))
            best_score = float(scores[best_index])
            confidence = float(np.clip(best_score, 0.0, 1.0))

            if confidence >= threshold:
                matched_field = payload.fields[best_index]

                # Check if this segment looks like a label (not a value)
                is_likely_label = not is_numeric_value(segment.text) and len(segment.text.split()) <= 5

                # For numeric fields, try to find nearby value
                if (
                    is_likely_label
                    and matched_field.characterType in ["int", "decimal", "currency"]
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
