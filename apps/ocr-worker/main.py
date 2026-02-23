import base64
import io
import json
import os
import time
from collections import Counter
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib import error as urllib_error
from urllib import request as urllib_request

import fitz
import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from paddleocr import PaddleOCR, __version__ as paddleocr_version
from PIL import Image, ImageEnhance, UnidentifiedImageError

app = FastAPI()

ENGINE_NAME = 'paddleocr'
ENGINE_VERSION = paddleocr_version
DEFAULT_LANG = 'eng'
MAX_PDF_PAGES = 10

OCR_PDF_DPI = int(os.getenv('OCR_PDF_DPI', '300'))
OCR_UPSCALE_MIN_DIM = int(os.getenv('OCR_UPSCALE_MIN_DIM', '0'))
OCR_CONTRAST = float(os.getenv('OCR_CONTRAST', '1.0'))
OCR_ANGLE_CLS_IMAGES = os.getenv('OCR_ANGLE_CLS_IMAGES', 'false').lower() in ('1', 'true', 'yes', 'on')
OCR_ANGLE_CLS_PDFS = os.getenv('OCR_ANGLE_CLS_PDFS', 'false').lower() in ('1', 'true', 'yes', 'on')
PREPROCESSOR_URL = os.getenv('OCR_PREPROCESSOR_URL', 'http://preprocessor:6000/preprocess')
TEXT_LAYER_MIN_WORDS = int(os.getenv('OCR_TEXT_LAYER_MIN_WORDS', '5'))

_ocr_clients: Dict[bool, PaddleOCR] = {}


def get_ocr_client(use_angle_cls: bool) -> PaddleOCR:
    global _ocr_clients
    if use_angle_cls not in _ocr_clients:
        _ocr_clients[use_angle_cls] = PaddleOCR(
            use_angle_cls=use_angle_cls,
            lang='en',
            use_gpu=False,
            show_log=False,
        )
    return _ocr_clients[use_angle_cls]


def preprocess_image(image: Image.Image) -> Image.Image:
    if image.mode != 'RGB':
        image = image.convert('RGB')

    max_dim = max(image.width, image.height)
    if max_dim > 0 and max_dim < OCR_UPSCALE_MIN_DIM:
        scale = OCR_UPSCALE_MIN_DIM / max_dim
        new_size = (int(image.width * scale), int(image.height * scale))
        image = image.resize(new_size, Image.LANCZOS)

    if OCR_CONTRAST > 0:
        image = ImageEnhance.Contrast(image).enhance(OCR_CONTRAST)
    return image


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def normalize_bbox(points: Sequence[Sequence[float]], width: float, height: float) -> Optional[Dict[str, float]]:
    try:
        xs = [float(p[0]) for p in points]
        ys = [float(p[1]) for p in points]
    except Exception:
        return None

    if not xs or not ys or width <= 0 or height <= 0:
        return None

    min_x, max_x = max(min(xs), 0.0), min(max(xs), width)
    min_y, max_y = max(min(ys), 0.0), min(max(ys), height)

    box_width = max_x - min_x
    box_height = max_y - min_y
    if box_width <= 0 or box_height <= 0:
        return None

    return {
        'x': clamp01(min_x / width),
        'y': clamp01(min_y / height),
        'width': clamp01(box_width / width),
        'height': clamp01(box_height / height),
    }


def normalize_xyxy_bbox(
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    width: float,
    height: float,
) -> Optional[Dict[str, float]]:
    if width <= 0 or height <= 0:
        return None

    min_x = max(min(x0, x1), 0.0)
    max_x = min(max(x0, x1), width)
    min_y = max(min(y0, y1), 0.0)
    max_y = min(max(y0, y1), height)

    if max_x <= min_x or max_y <= min_y:
        return None

    return {
        'x': clamp01(min_x / width),
        'y': clamp01(min_y / height),
        'width': clamp01((max_x - min_x) / width),
        'height': clamp01((max_y - min_y) / height),
    }


def extract_segments(
    result: Sequence,
    page_size: Tuple[int, int],
    page_number: int,
) -> Tuple[str, List[Dict[str, Any]]]:
    lines: List[str] = []
    segments: List[Dict[str, Any]] = []
    page_width, page_height = page_size

    entries = result or []
    if (
        isinstance(entries, Sequence)
        and len(entries) == 1
        and isinstance(entries[0], Sequence)
    ):
        possible_entries = entries[0]
        if (
            isinstance(possible_entries, Sequence)
            and possible_entries
            and isinstance(possible_entries[0], Sequence)
        ):
            entries = possible_entries

    for entry in entries:
        if not (isinstance(entry, Sequence) and len(entry) >= 2):
            continue

        points, payload = entry[0], entry[1]
        text_candidate = None
        confidence = None

        if isinstance(payload, Sequence) and len(payload) >= 1:
            if isinstance(payload[0], str):
                text_candidate = payload[0].strip()
            if len(payload) >= 2 and isinstance(payload[1], (float, int)):
                confidence = clamp01(float(payload[1]))

        if text_candidate:
            lines.append(text_candidate)

            bbox = None
            if isinstance(points, Sequence) and len(points) == 4:
                bbox = normalize_bbox(points, page_width, page_height)

            segments.append(
                {
                    'text': text_candidate,
                    'confidence': confidence,
                    'boundingBox': bbox,
                    'pageNumber': page_number,
                }
            )

    return '\n'.join(lines), segments


def extract_text_layer_segments(page: fitz.Page, page_number: int) -> Tuple[str, List[Dict[str, Any]]]:
    words = page.get_text('words') or []
    if len(words) < TEXT_LAYER_MIN_WORDS:
        return '', []

    sorted_words = sorted(
        words,
        key=lambda w: (int(w[5]), int(w[6]), int(w[7]), float(w[1]), float(w[0])),
    )

    page_width = float(page.rect.width)
    page_height = float(page.rect.height)
    text_parts: List[str] = []
    segments: List[Dict[str, Any]] = []

    for word in sorted_words:
        token = str(word[4]).strip()
        if not token:
            continue

        x0, y0, x1, y1 = float(word[0]), float(word[1]), float(word[2]), float(word[3])
        bbox = normalize_xyxy_bbox(x0, y0, x1, y1, page_width, page_height)
        text_parts.append(token)
        segments.append(
            {
                'text': token,
                'confidence': None,
                'boundingBox': bbox,
                'pageNumber': page_number,
            }
        )

    return ' '.join(text_parts), segments


def image_to_jpeg_bytes(image: Image.Image) -> bytes:
    image_bytes = io.BytesIO()
    image.save(image_bytes, format='JPEG', quality=95)
    return image_bytes.getvalue()


def build_multipart_body(file_bytes: bytes, filename: str = 'page.jpg') -> Tuple[bytes, str]:
    boundary = f'----ocr-worker-{int(time.time() * 1000)}'
    header = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        'Content-Type: image/jpeg\r\n\r\n'
    ).encode('utf-8')
    footer = f'\r\n--{boundary}--\r\n'.encode('utf-8')
    body = header + file_bytes + footer
    return body, boundary


def call_preprocessor(image: Image.Image, page_number: int) -> Tuple[Image.Image, Dict[str, Any], str]:
    original_image = image
    image_bytes = image_to_jpeg_bytes(original_image)
    body, boundary = build_multipart_body(image_bytes)
    request_headers = {
        'Content-Type': f'multipart/form-data; boundary={boundary}',
        'Accept': 'application/json',
    }

    try:
        req = urllib_request.Request(
            PREPROCESSOR_URL,
            data=body,
            headers=request_headers,
            method='POST',
        )
        with urllib_request.urlopen(req, timeout=20) as response:
            response_body = response.read().decode('utf-8')
            payload = json.loads(response_body)
    except (urllib_error.URLError, TimeoutError, ValueError) as exc:
        print(f'[OCR] Preprocessor request failed on page {page_number}: {exc}')
        return (
            original_image,
            {
                'pageNumber': page_number,
                'ok': False,
                'reason': 'request_failed',
                'details': str(exc),
            },
            'ocr_unprocessed',
        )

    if payload.get('ok') is not True:
        reason = payload.get('reason', 'unknown')
        print(f'[OCR] Preprocessor quality fallback on page {page_number}: {reason}')
        return (
            original_image,
            {
                'pageNumber': page_number,
                'ok': False,
                'reason': reason,
                'qualityScore': payload.get('qualityScore'),
            },
            'ocr_unprocessed',
        )

    image_base64 = payload.get('imageBase64')
    if not isinstance(image_base64, str) or not image_base64:
        print(f'[OCR] Preprocessor returned invalid imageBase64 on page {page_number}')
        return (
            original_image,
            {
                'pageNumber': page_number,
                'ok': False,
                'reason': 'invalid_image_base64',
            },
            'ocr_unprocessed',
        )

    try:
        processed_bytes = base64.b64decode(image_base64)
        processed_image = Image.open(io.BytesIO(processed_bytes)).convert('RGB')
    except Exception as exc:
        print(f'[OCR] Preprocessor decode failed on page {page_number}: {exc}')
        return (
            original_image,
            {
                'pageNumber': page_number,
                'ok': False,
                'reason': 'decode_failed',
                'details': str(exc),
            },
            'ocr_unprocessed',
        )

    return (
        processed_image,
        {
            'pageNumber': page_number,
            'ok': True,
            'preprocessingApplied': payload.get('preprocessingApplied', {}),
        },
        'ocr_preprocessed',
    )


def aggregate_extraction_path(page_paths: List[str]) -> str:
    if not page_paths:
        return 'unknown'

    counts = Counter(page_paths)
    if len(counts) == 1:
        return page_paths[0]

    top = counts.most_common(2)
    if len(top) == 1 or top[0][1] > top[1][1]:
        return top[0][0]

    return 'mixed'


@app.get('/health')
async def health():
    return PlainTextResponse('ok')


@app.post('/ocr')
async def ocr(request: Request):
    body = await request.body()
    if not body:
        return JSONResponse(
            status_code=400,
            content={'error': 'Request body must contain the raw attachment bytes'},
        )

    mime_type = request.headers.get('x-mime-type', '')

    if mime_type == 'application/pdf':
        try:
            with fitz.open(stream=body, filetype='pdf') as document:
                total_pages = len(document)
                if total_pages == 0:
                    return JSONResponse(
                        status_code=400,
                        content={'error': 'PDF conversion produced no pages'},
                    )

                pages_to_process = min(total_pages, MAX_PDF_PAGES)
                print(f'[OCR] Processing PDF: {total_pages} total pages, processing {pages_to_process}')

                ocr_client = get_ocr_client(OCR_ANGLE_CLS_PDFS)
                start = time.perf_counter()

                all_text_parts: List[str] = []
                all_segments: List[Dict[str, Any]] = []
                preprocessing_applied: List[Dict[str, Any]] = []
                page_extraction_paths: List[str] = []

                for page_num in range(1, pages_to_process + 1):
                    page_start = time.perf_counter()
                    page = document.load_page(page_num - 1)

                    text_layer_text, text_layer_segments = extract_text_layer_segments(page, page_num)
                    if text_layer_segments:
                        page_extraction_paths.append('text_layer')
                        preprocessing_applied.append(
                            {
                                'pageNumber': page_num,
                                'ok': True,
                                'mode': 'text_layer',
                            }
                        )
                        if text_layer_text.strip():
                            all_text_parts.append(text_layer_text)
                        all_segments.extend(text_layer_segments)
                    else:
                        pixmap = page.get_pixmap(dpi=OCR_PDF_DPI)
                        raw_image = Image.open(io.BytesIO(pixmap.tobytes('png'))).convert('RGB')
                        raw_image = preprocess_image(raw_image)

                        ocr_image, preprocess_meta, extraction_path = call_preprocessor(raw_image, page_num)
                        page_extraction_paths.append(extraction_path)
                        preprocessing_applied.append(preprocess_meta)

                        try:
                            raw_result = ocr_client.ocr(np.array(ocr_image), cls=False)
                        except Exception as exc:
                            return JSONResponse(
                                status_code=500,
                                content={
                                    'error': f'OCR extraction failed on page {page_num}',
                                    'details': str(exc),
                                },
                            )

                        page_text, page_segments = extract_segments(
                            raw_result or [],
                            (ocr_image.width, ocr_image.height),
                            page_num,
                        )
                        if page_text.strip():
                            all_text_parts.append(page_text)
                        all_segments.extend(page_segments)

                    if page_num < pages_to_process:
                        all_text_parts.append(f'\n\n--- PAGE {page_num + 1} ---\n\n')

                    page_duration_ms = int((time.perf_counter() - page_start) * 1_000)
                    print(f'[OCR] Page {page_num}/{pages_to_process} completed in {page_duration_ms}ms')

                text = ''.join(all_text_parts)
                duration_ms = int((time.perf_counter() - start) * 1_000)
                extraction_path = aggregate_extraction_path(page_extraction_paths)
                print(f'[OCR] PDF OCR completed: {pages_to_process} pages in {duration_ms}ms ({extraction_path})')

                meta = {
                    'engine': ENGINE_NAME,
                    'engineVersion': ENGINE_VERSION,
                    'lang': DEFAULT_LANG,
                    'durationMs': duration_ms,
                    'pages': pages_to_process,
                    'totalPages': total_pages,
                    'extractionPath': extraction_path,
                    'pageExtractionPaths': page_extraction_paths,
                    'preprocessingApplied': preprocessing_applied,
                }
                if request.headers.get('x-request-id'):
                    meta['requestId'] = request.headers['x-request-id']
                if request.headers.get('x-filename'):
                    meta['filename'] = request.headers['x-filename']
                if request.headers.get('x-mime-type'):
                    meta['mimeType'] = request.headers['x-mime-type']

                return JSONResponse(
                    status_code=200,
                    content={
                        'text': text,
                        'segments': all_segments,
                        'meta': meta,
                    },
                )
        except Exception as exc:
            return JSONResponse(
                status_code=400,
                content={'error': 'Unable to decode PDF from provided bytes', 'details': str(exc)},
            )

    try:
        image = Image.open(io.BytesIO(body))
    except (UnidentifiedImageError, OSError):
        return JSONResponse(
            status_code=400,
            content={'error': 'Unable to decode an image from the provided bytes'},
        )

    image = preprocess_image(image)
    ocr_image, preprocess_meta, extraction_path = call_preprocessor(image, page_number=1)

    ocr_client = get_ocr_client(OCR_ANGLE_CLS_IMAGES)

    start = time.perf_counter()
    try:
        raw_result = ocr_client.ocr(np.array(ocr_image), cls=False)
    except Exception as exc:  # pragma: no cover
        return JSONResponse(
            status_code=500,
            content={'error': 'OCR extraction failed', 'details': str(exc)},
        )

    text, segments = extract_segments(
        raw_result or [],
        (ocr_image.width, ocr_image.height),
        page_number=1,
    )
    duration_ms = int((time.perf_counter() - start) * 1_000)

    meta = {
        'engine': ENGINE_NAME,
        'engineVersion': ENGINE_VERSION,
        'lang': DEFAULT_LANG,
        'durationMs': duration_ms,
        'pages': 1,
        'extractionPath': extraction_path,
        'preprocessingApplied': [preprocess_meta],
    }
    if request.headers.get('x-request-id'):
        meta['requestId'] = request.headers['x-request-id']
    if request.headers.get('x-filename'):
        meta['filename'] = request.headers['x-filename']
    if request.headers.get('x-mime-type'):
        meta['mimeType'] = request.headers['x-mime-type']

    return JSONResponse(
        status_code=200,
        content={
            'text': text,
            'segments': segments,
            'meta': meta,
        },
    )
