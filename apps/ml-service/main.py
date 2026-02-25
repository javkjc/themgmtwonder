import logging
import time
from typing import Any, Dict, List, Literal, Optional

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field

from model import MODEL_VERSION, ModelNotReadyError, generate_fields, get_model_error, load_model, load_model_from_path
from model_registry import registry
from prompt_builder import PromptSegment, build_prompt_payload, serialize_segments
from table_detect import detect_tables
import zone_classifier

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ML Service", version="0.4.0")


class SegmentBoundingBoxInput(BaseModel):
    x: float
    y: float
    width: float
    height: float


class SegmentInput(BaseModel):
    id: str
    text: str
    boundingBox: Optional[SegmentBoundingBoxInput] = None
    pageNumber: int = 0
    confidence: float = 0.0


class FieldInput(BaseModel):
    fieldKey: str
    label: str
    fieldType: str


class RagExampleInput(BaseModel):
    serializedText: str
    confirmedFields: Dict[str, Any]


class SuggestFieldsRequest(BaseModel):
    baselineId: str
    documentTypeId: Optional[str] = None
    segments: List[SegmentInput]
    fields: List[FieldInput]
    pageWidth: int
    pageHeight: int
    pageType: Literal["digital", "scanned"]
    ragExamples: List[RagExampleInput] = Field(default_factory=list)


class Suggestion(BaseModel):
    fieldKey: str
    suggestedValue: Optional[str]
    zone: str
    boundingBox: Optional[SegmentBoundingBoxInput]
    extractionMethod: Literal["qwen-1.5b-rag"]
    rawOcrConfidence: Optional[float]
    ragAgreement: float
    modelConfidence: Optional[float] = None


class ErrorPayload(BaseModel):
    code: str
    message: str


class SuggestFieldsResponse(BaseModel):
    ok: bool
    modelVersion: str
    suggestions: List[Suggestion]
    ragAgreementNote: str = (
        "ragAgreement is pre-normalization string matching in ml-service; API re-evaluates after normalization."
    )
    error: Optional[ErrorPayload] = None


class SerializeSegmentInput(BaseModel):
    text: str
    boundingBox: Optional[SegmentBoundingBoxInput] = None
    pageNumber: int = 0
    zone: str


class SerializeRequest(BaseModel):
    segments: List[SerializeSegmentInput]
    pageWidth: int


class SerializeResponse(BaseModel):
    serializedText: str


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
    load_model(timeout_seconds=15.0)


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
        result = load_model_from_path(payload.filePath)
        active_version = result.get("activeVersion", payload.version)
        logging.info(
            "ml.model.activate.success",
            extra={
                "version": payload.version,
                "filePath": payload.filePath,
                "activeVersion": active_version,
            },
        )
        return ActivateModelResponse(ok=True, activeVersion=active_version)
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


def _segment_zone(segment: SegmentInput, page_height: int) -> str:
    if segment.boundingBox is None:
        return "unknown"
    return zone_classifier.classify(
        bbox_y=segment.boundingBox.y,
        bbox_height=segment.boundingBox.height,
        page_height=float(page_height),
    )


def _find_contributing_segment(value: str, segments: List[SegmentInput]) -> Optional[SegmentInput]:
    normalized_value = value.strip().lower()
    if not normalized_value:
        return None

    best: Optional[SegmentInput] = None
    best_conf = -1.0

    for seg in segments:
        seg_text = (seg.text or "").strip().lower()
        if not seg_text:
            continue
        if normalized_value in seg_text or seg_text in normalized_value:
            confidence = float(seg.confidence or 0.0)
            if confidence > best_conf:
                best_conf = confidence
                best = seg

    return best


def _compute_rag_agreement(field_key: str, suggested_value: Optional[str], rag_examples: List[RagExampleInput]) -> float:
    if suggested_value is None:
        return 0.0

    for example in rag_examples:
        confirmed = example.confirmedFields.get(field_key)
        if isinstance(confirmed, str) and confirmed == suggested_value:
            return 1.0
    return 0.0


@app.post("/ml/suggest-fields", response_model=SuggestFieldsResponse)
def suggest_fields(payload: SuggestFieldsRequest) -> SuggestFieldsResponse:
    load_model(timeout_seconds=10.0)

    if not registry.ready:
        model_error = get_model_error() or registry.last_error or "Model registry not initialized"
        return SuggestFieldsResponse(
            ok=False,
            modelVersion=MODEL_VERSION,
            suggestions=[],
            error=ErrorPayload(code="model_not_ready", message=model_error),
        )

    if not payload.fields:
        return SuggestFieldsResponse(
            ok=True,
            modelVersion=registry.active_version or MODEL_VERSION,
            suggestions=[],
        )

    segments_sorted = sorted(
        payload.segments,
        key=lambda s: (
            int(s.pageNumber or 0),
            float(s.boundingBox.y) if s.boundingBox is not None else float("inf"),
            float(s.boundingBox.x) if s.boundingBox is not None else float("inf"),
        ),
    )

    serialized_segments: List[PromptSegment] = []
    for segment in segments_sorted:
        serialized_segments.append(
            PromptSegment(
                id=segment.id,
                text=segment.text,
                zone=_segment_zone(segment, payload.pageHeight),
                bounding_box=segment.boundingBox.model_dump() if segment.boundingBox else None,
                page_number=int(segment.pageNumber or 0),
            )
        )

    if not payload.ragExamples:
        logging.warning(
            "ml.rag.examples.empty",
            extra={"baselineId": payload.baselineId},
        )

    serialized_document = serialize_segments(serialized_segments, page_width=float(payload.pageWidth))

    fields_payload = [field.model_dump() for field in payload.fields]
    rag_payload = [example.model_dump() for example in payload.ragExamples]
    prompt_payload = build_prompt_payload(
        fields=fields_payload,
        serialized_document=serialized_document,
        rag_examples=rag_payload,
    )

    try:
        generated = generate_fields(
            prompt=prompt_payload["prompt"],
            json_schema=prompt_payload["format"],
            timeout_seconds=45.0,
        )
    except ModelNotReadyError as exc:
        return SuggestFieldsResponse(
            ok=False,
            modelVersion=registry.active_version or MODEL_VERSION,
            suggestions=[],
            error=ErrorPayload(code="model_not_ready", message=str(exc)),
        )
    except Exception as exc:  # noqa: BLE001
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
            suggestions=[],
            error=ErrorPayload(code="SUGGESTION_FAILED", message=f"{type(exc).__name__}: {exc}"),
        )

    suggestions: List[Suggestion] = []
    for field in payload.fields:
        raw_value = generated.get(field.fieldKey)
        suggested_value = raw_value if isinstance(raw_value, str) else None

        contributing = _find_contributing_segment(suggested_value or "", segments_sorted) if suggested_value else None
        zone = _segment_zone(contributing, payload.pageHeight) if contributing else "unknown"
        bbox = contributing.boundingBox if contributing else None
        raw_ocr_confidence = float(contributing.confidence) if contributing is not None else None
        rag_agreement = _compute_rag_agreement(field.fieldKey, suggested_value, payload.ragExamples)

        suggestions.append(
            Suggestion(
                fieldKey=field.fieldKey,
                suggestedValue=suggested_value,
                zone=zone,
                boundingBox=bbox,
                extractionMethod="qwen-1.5b-rag",
                rawOcrConfidence=raw_ocr_confidence,
                ragAgreement=rag_agreement,
                modelConfidence=None,
            )
        )

    logging.info(
        "ml_suggest_fields",
        extra={
            "baselineId": payload.baselineId,
            "documentTypeId": payload.documentTypeId,
            "modelVersion": registry.active_version or MODEL_VERSION,
            "pageType": payload.pageType,
            "suggestionCount": len(suggestions),
        },
    )

    return SuggestFieldsResponse(
        ok=True,
        modelVersion=registry.active_version or MODEL_VERSION,
        suggestions=suggestions,
    )


@app.post("/ml/serialize", response_model=SerializeResponse)
def serialize_endpoint(payload: SerializeRequest) -> SerializeResponse:
    serialized_segments: List[PromptSegment] = []
    for index, segment in enumerate(payload.segments):
        serialized_segments.append(
            PromptSegment(
                id=f"segment-{index}",
                text=segment.text,
                zone=segment.zone,
                bounding_box=segment.boundingBox.model_dump() if segment.boundingBox else None,
                page_number=int(segment.pageNumber or 0),
            )
        )

    serialized_text = serialize_segments(serialized_segments, page_width=float(payload.pageWidth))
    return SerializeResponse(serializedText=serialized_text)


@app.post("/ml/detect-tables", response_model=DetectTablesResponse)
def detect_tables_endpoint(payload: DetectTablesRequest) -> DetectTablesResponse:
    start_time = time.perf_counter()
    threshold = payload.threshold if payload.threshold is not None else 0.50
    threshold = float(np.clip(threshold, 0.0, 1.0))

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
    except Exception as exc:  # noqa: BLE001
        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        logging.error(
            "ml_detect_tables_failed",
            extra={
                "attachmentId": payload.attachmentId,
                "error": f"{type(exc).__name__}: {exc}",
                "processingTimeMs": processing_time_ms,
            },
        )
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

