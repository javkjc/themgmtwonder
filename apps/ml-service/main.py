import logging
import re
import time
from typing import Dict, List, Literal, Optional

import numpy as np
import torch
from fastapi import FastAPI
from PIL import Image
from pydantic import BaseModel, Field

from model import MODEL_VERSION, get_model_error, load_model, load_model_from_path
from model_registry import registry
from table_detect import detect_tables
import zone_classifier

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ML Service", version="0.3.0")


class SegmentBoundingBoxInput(BaseModel):
    x: float
    y: float
    width: float
    height: float


class SegmentInput(BaseModel):
    id: str
    text: str
    boundingBox: Optional[SegmentBoundingBoxInput] = None


class FieldInput(BaseModel):
    fieldKey: str
    label: str


class PairCandidateInput(BaseModel):
    labelSegmentId: str
    valueSegmentId: str
    pairConfidence: float
    relation: str
    pageNumber: Optional[int] = None


class SegmentContextInput(BaseModel):
    segmentId: str
    contextText: str
    contextSegmentIds: List[str]


class SuggestFieldsRequest(BaseModel):
    baselineId: str
    pageWidth: int
    pageHeight: int
    pageType: Literal["digital", "scanned"]
    segments: List[SegmentInput]
    fields: List[FieldInput]
    pairCandidates: Optional[List[PairCandidateInput]] = Field(default=None)
    segmentContext: Optional[List[SegmentContextInput]] = Field(default=None)
    threshold: Optional[float] = Field(default=None)


class Suggestion(BaseModel):
    segmentId: str
    fieldKey: str
    confidence: float
    zone: str
    boundingBox: SegmentBoundingBoxInput
    extractionMethod: Literal["layoutlmv3"]


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
    load_model(timeout_seconds=180.0)


@app.get("/health")
def health():
    return {"status": "ok"}


class ActivateModelRequest(BaseModel):
    version: str
    filePath: str


class ActivateModelResponse(BaseModel):
    ok: bool
    activeVersion: Optional[str] = None
    error: Optional[ErrorPayload] = None


@app.post("/ml/models/activate", response_model=ActivateModelResponse)
def activate_model(payload: ActivateModelRequest) -> ActivateModelResponse:
    try:
        processor, new_model, warmup_shape = load_model_from_path(payload.filePath)
        registry.swap(payload.version, processor, new_model, payload.filePath)
        logging.info(
            "ml.model.activate.success",
            extra={
                "version": payload.version,
                "filePath": payload.filePath,
                "warmupOutputShape": warmup_shape,
            },
        )
        return ActivateModelResponse(ok=True, activeVersion=payload.version)
    except Exception as exc:  # noqa: BLE001
        logging.error(
            "ml.model.activate.failed",
            extra={
                "version": payload.version,
                "filePath": payload.filePath,
                "error": f"{type(exc).__name__}: {exc}",
            },
        )
        return ActivateModelResponse(
            ok=False,
            error=ErrorPayload(code="load_failed", message=f"{type(exc).__name__}: {exc}"),
        )


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(value, max_value))


def normalize_bbox(box: SegmentBoundingBoxInput, page_width: int, page_height: int) -> SegmentBoundingBoxInput:
    if page_width <= 0 or page_height <= 0:
        raise ValueError("pageWidth and pageHeight must be positive")
    if box.width <= 0 or box.height <= 0:
        raise ValueError("boundingBox width and height must be positive")

    x = float(box.x)
    y = float(box.y)
    w = float(box.width)
    h = float(box.height)
    right = x + w
    bottom = y + h

    # Validate coordinate scale before normalization:
    # - fractional [0,1]
    # - page-space [0,pageWidth/pageHeight]
    # - already normalized [0,1000]
    if right <= 1.0 and bottom <= 1.0:
        x0 = _clamp(x * 1000.0, 0.0, 1000.0)
        y0 = _clamp(y * 1000.0, 0.0, 1000.0)
        x1 = _clamp((x + w) * 1000.0, 0.0, 1000.0)
        y1 = _clamp((y + h) * 1000.0, 0.0, 1000.0)
    elif right <= (page_width * 1.05) and bottom <= (page_height * 1.05):
        x0 = _clamp((x / page_width) * 1000.0, 0.0, 1000.0)
        y0 = _clamp((y / page_height) * 1000.0, 0.0, 1000.0)
        x1 = _clamp(((x + w) / page_width) * 1000.0, 0.0, 1000.0)
        y1 = _clamp(((y + h) / page_height) * 1000.0, 0.0, 1000.0)
    elif right <= 1000.0 and bottom <= 1000.0:
        x0 = _clamp(x, 0.0, 1000.0)
        y0 = _clamp(y, 0.0, 1000.0)
        x1 = _clamp(x + w, 0.0, 1000.0)
        y1 = _clamp(y + h, 0.0, 1000.0)
    else:
        x0 = _clamp((x / page_width) * 1000.0, 0.0, 1000.0)
        y0 = _clamp((y / page_height) * 1000.0, 0.0, 1000.0)
        x1 = _clamp(((x + w) / page_width) * 1000.0, 0.0, 1000.0)
        y1 = _clamp(((y + h) / page_height) * 1000.0, 0.0, 1000.0)

    width = max(0.0, x1 - x0)
    height = max(0.0, y1 - y0)
    return SegmentBoundingBoxInput(x=x0, y=y0, width=width, height=height)


def _norm_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _resolve_field_key(class_id: int, label_name: str, fields: List[FieldInput]) -> Optional[str]:
    by_key = {_norm_key(field.fieldKey): field.fieldKey for field in fields}
    by_label = {_norm_key(field.label): field.fieldKey for field in fields}

    cleaned_label = re.sub(r"^[BILUS]-", "", label_name)
    cleaned_label = cleaned_label.replace("_", " ").strip()

    for candidate in (cleaned_label, label_name):
        norm = _norm_key(candidate)
        if norm in by_key:
            return by_key[norm]
        if norm in by_label:
            return by_label[norm]

    if 0 <= class_id < len(fields):
        return fields[class_id].fieldKey

    return None


@app.post("/ml/suggest-fields", response_model=SuggestFieldsResponse)
def suggest_fields(payload: SuggestFieldsRequest) -> SuggestFieldsResponse:
    threshold = payload.threshold if payload.threshold is not None else 0.5
    threshold = float(np.clip(threshold, 0.0, 1.0))

    if registry.model is None or registry.processor is None:
        load_model(timeout_seconds=180.0)

    if registry.model is None or registry.processor is None:
        model_error = get_model_error() or "Model registry not initialized"
        logging.error(
            "ml_suggest_fields_unavailable",
            extra={
                "baselineId": payload.baselineId,
                "modelVersion": MODEL_VERSION,
                "error": model_error,
            },
        )
        return SuggestFieldsResponse(
            ok=False,
            modelVersion=MODEL_VERSION,
            threshold=threshold,
            suggestions=[],
            error=ErrorPayload(code="model_not_ready", message=model_error),
        )

    if not payload.fields or not payload.segments:
        return SuggestFieldsResponse(
            ok=True,
            modelVersion=registry.active_version or MODEL_VERSION,
            threshold=threshold,
            suggestions=[],
        )

    normalized_segment_boxes: Dict[str, SegmentBoundingBoxInput] = {}
    ordered_segment_ids: List[str] = []
    words: List[str] = []
    boxes_xyxy: List[List[int]] = []
    word_segment_ids: List[str] = []

    # I2: sort segments into human reading order before zone classification and
    # LayoutLMv3 inference.  Segments without a boundingBox sort last within each
    # page so they are still processed (zone = 'unknown').
    def _reading_order_key(seg: SegmentInput):
        page = getattr(seg, 'pageNumber', None) or 0
        bb = seg.boundingBox
        y = float(bb.y) if bb is not None else float('inf')
        x = float(bb.x) if bb is not None else float('inf')
        return (page, y, x)

    sorted_segments = sorted(payload.segments, key=_reading_order_key)

    # Track which segments have a real bbox (for zone = 'unknown' when absent).
    segment_has_bbox: Dict[str, bool] = {}
    # Zero-bbox placeholder for segments without a bounding box (LayoutLMv3 requires a bbox).
    _ZERO_BBOX = SegmentBoundingBoxInput(x=0.0, y=0.0, width=0.0, height=0.0)

    for segment in sorted_segments:
        if not segment.text.strip():
            continue

        if segment.boundingBox is not None:
            try:
                normalized_box = normalize_bbox(segment.boundingBox, payload.pageWidth, payload.pageHeight)
            except ValueError:
                continue
            segment_has_bbox[segment.id] = True
        else:
            # No bbox — use zero placeholder; zone will be 'unknown'.
            normalized_box = _ZERO_BBOX
            segment_has_bbox[segment.id] = False

        normalized_segment_boxes[segment.id] = normalized_box
        ordered_segment_ids.append(segment.id)

        token_words = [token for token in segment.text.split() if token]
        if not token_words:
            continue

        x0 = int(round(normalized_box.x))
        y0 = int(round(normalized_box.y))
        x1 = int(round(normalized_box.x + normalized_box.width))
        y1 = int(round(normalized_box.y + normalized_box.height))

        for token in token_words:
            words.append(token)
            boxes_xyxy.append([x0, y0, x1, y1])
            word_segment_ids.append(segment.id)

    if not words:
        return SuggestFieldsResponse(
            ok=True,
            modelVersion=registry.active_version or MODEL_VERSION,
            threshold=threshold,
            suggestions=[],
        )

    image_width = max(1, min(int(payload.pageWidth), 2048))
    image_height = max(1, min(int(payload.pageHeight), 2048))
    image = Image.new("RGB", (image_width, image_height), color=(255, 255, 255))

    processor = registry.processor
    model = registry.model

    try:
        with torch.no_grad():
            encoded = processor(
                image,
                words,
                boxes=boxes_xyxy,
                truncation=True,
                padding="max_length",
                return_tensors="pt",
            )

            inputs = {
                "input_ids": encoded["input_ids"],
                "attention_mask": encoded["attention_mask"],
                "bbox": encoded["bbox"],
                "pixel_values": encoded["pixel_values"],
            }

            outputs = model(**inputs)
            probabilities = torch.softmax(outputs.logits, dim=-1)
            class_ids = torch.argmax(probabilities, dim=-1)

        token_word_ids = encoded.word_ids(batch_index=0)

        segment_field_scores: Dict[str, Dict[str, List[float]]] = {}
        for token_index, word_index in enumerate(token_word_ids):
            if word_index is None:
                continue
            if word_index < 0 or word_index >= len(word_segment_ids):
                continue

            segment_id = word_segment_ids[word_index]
            class_id = int(class_ids[0, token_index].item())
            confidence = float(probabilities[0, token_index, class_id].item())
            label_name = model.config.id2label.get(class_id, str(class_id))
            field_key = _resolve_field_key(class_id, label_name, payload.fields)
            if field_key is None:
                continue

            segment_field_scores.setdefault(segment_id, {}).setdefault(field_key, []).append(confidence)

        suggestions: List[Suggestion] = []
        for segment_id in ordered_segment_ids:
            field_scores = segment_field_scores.get(segment_id)
            if not field_scores:
                continue

            best_field_key = ""
            best_confidence = 0.0
            for field_key, scores in field_scores.items():
                score = float(sum(scores) / len(scores))
                if score > best_confidence:
                    best_confidence = score
                    best_field_key = field_key

            if best_confidence < threshold:
                continue

            normalized_bbox = normalized_segment_boxes[segment_id]
            has_bbox = segment_has_bbox.get(segment_id, True)
            zone = zone_classifier.classify(
                bbox_y=normalized_bbox.y if has_bbox else None,
                bbox_height=normalized_bbox.height if has_bbox else None,
                page_height=float(payload.pageHeight),
            )
            suggestions.append(
                Suggestion(
                    segmentId=segment_id,
                    fieldKey=best_field_key,
                    confidence=best_confidence,
                    zone=zone,
                    boundingBox=normalized_bbox,
                    extractionMethod="layoutlmv3",
                )
            )

        logging.info(
            "ml_suggest_fields",
            extra={
                "baselineId": payload.baselineId,
                "modelVersion": registry.active_version or MODEL_VERSION,
                "pageType": payload.pageType,
                "suggestionCount": len(suggestions),
            },
        )

        return SuggestFieldsResponse(
            ok=True,
            modelVersion=registry.active_version or MODEL_VERSION,
            threshold=threshold,
            suggestions=suggestions,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced via error payload
        logging.error(
            "ml_suggest_fields_failed",
            extra={
                "baselineId": payload.baselineId,
                "modelVersion": registry.active_version or MODEL_VERSION,
                "error": f"{type(exc).__name__}: {exc}",
            },
        )
        return SuggestFieldsResponse(
            ok=False,
            modelVersion=registry.active_version or MODEL_VERSION,
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
    threshold = payload.threshold if payload.threshold is not None else 0.50
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
