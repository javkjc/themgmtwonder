
import io
import os
import tempfile
import time
from typing import Optional, Sequence, Tuple, List, Dict, Any

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from paddleocr import PaddleOCR, __version__ as paddleocr_version
from pdf2image import convert_from_path
from pdf2image.exceptions import PDFInfoNotInstalledError, PDFPageCountError, PDFSyntaxError
from PIL import Image, ImageEnhance, UnidentifiedImageError
app = FastAPI()

ENGINE_NAME = 'paddleocr'
ENGINE_VERSION = paddleocr_version
DEFAULT_LANG = 'eng'
MAX_PDF_PAGES = 10

OCR_PDF_DPI = int(os.getenv('OCR_PDF_DPI', '150'))
OCR_UPSCALE_MIN_DIM = int(os.getenv('OCR_UPSCALE_MIN_DIM', '0'))
OCR_CONTRAST = float(os.getenv('OCR_CONTRAST', '1.0'))
OCR_ANGLE_CLS_IMAGES = os.getenv('OCR_ANGLE_CLS_IMAGES', 'false').lower() in ('1', 'true', 'yes', 'on')
OCR_ANGLE_CLS_PDFS = os.getenv('OCR_ANGLE_CLS_PDFS', 'false').lower() in ('1', 'true', 'yes', 'on')

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


def extract_segments(
    result: Sequence,
    page_size: Tuple[int, int],
    page_number: int,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Convert PaddleOCR raw result for a single page into
    flattened text (for backwards compatibility) and structured segments.
    """
    lines: List[str] = []
    segments: List[Dict[str, Any]] = []
    page_width, page_height = page_size

    entries = result or []
    # PaddleOCR can return [[...]] for a single image; unwrap if needed.
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

    # Handle PDF files
    if mime_type == 'application/pdf':
        temp_path = None
        images = []
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
                temp_path = tmp_file.name
                tmp_file.write(body)
            images = convert_from_path(temp_path, dpi=OCR_PDF_DPI)
        except (PDFPageCountError, PDFSyntaxError, PDFInfoNotInstalledError) as exc:
            return JSONResponse(
                status_code=400,
                content={'error': 'Unable to decode PDF from provided bytes', 'details': str(exc)},
            )
        except Exception as exc:
            return JSONResponse(
                status_code=400,
                content={'error': 'Unable to decode PDF from provided bytes', 'details': str(exc)},
            )
        finally:
            if temp_path:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

        if not images:
            return JSONResponse(
                status_code=400,
                content={'error': 'PDF conversion produced no pages'},
            )

        total_pages = len(images)
        pages_to_process = min(total_pages, MAX_PDF_PAGES)
        print(f'[OCR] Processing PDF: {total_pages} total pages, processing {pages_to_process}')

        ocr_client = get_ocr_client(OCR_ANGLE_CLS_PDFS)
        start = time.perf_counter()

        all_text_parts: List[str] = []
        all_segments: List[Dict[str, Any]] = []
        for page_num, image in enumerate(images[:pages_to_process], start=1):
            page_start = time.perf_counter()
            image = preprocess_image(image)

            try:
                raw_result = ocr_client.ocr(np.array(image), cls=False)
            except Exception as exc:
                return JSONResponse(
                    status_code=500,
                    content={'error': f'OCR extraction failed on page {page_num}', 'details': str(exc)},
                )

            page_text, page_segments = extract_segments(
                raw_result or [],
                (image.width, image.height),
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
        print(f'[OCR] PDF OCR completed: {pages_to_process} pages in {duration_ms}ms')

        meta = {
            'engine': ENGINE_NAME,
            'engineVersion': ENGINE_VERSION,
            'lang': DEFAULT_LANG,
            'durationMs': duration_ms,
            'pages': pages_to_process,
            'totalPages': total_pages,
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

    # Handle image files (existing logic)
    try:
        image = Image.open(io.BytesIO(body))
    except (UnidentifiedImageError, OSError):
        return JSONResponse(
            status_code=400,
            content={'error': 'Unable to decode an image from the provided bytes'},
        )

    image = preprocess_image(image)

    ocr_client = get_ocr_client(OCR_ANGLE_CLS_IMAGES)

    start = time.perf_counter()
    try:
        raw_result = ocr_client.ocr(np.array(image), cls=False)
    except Exception as exc:  # pragma: no cover
        return JSONResponse(
            status_code=500,
            content={'error': 'OCR extraction failed', 'details': str(exc)},
        )

    text, segments = extract_segments(
        raw_result or [],
        (image.width, image.height),
        page_number=1,
    )
    duration_ms = int((time.perf_counter() - start) * 1_000)

    meta = {
        'engine': ENGINE_NAME,
        'engineVersion': ENGINE_VERSION,
        'lang': DEFAULT_LANG,
        'durationMs': duration_ms,
        'pages': 1,
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
