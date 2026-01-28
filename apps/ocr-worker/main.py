
import io
import os
import tempfile
import time
from typing import Optional, Sequence

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from paddleocr import PaddleOCR, __version__ as paddleocr_version
from pdf2image import convert_from_path
from pdf2image.exceptions import PDFInfoNotInstalledError, PDFPageCountError, PDFSyntaxError
from PIL import Image, UnidentifiedImageError
app = FastAPI()

ENGINE_NAME = 'paddleocr'
ENGINE_VERSION = paddleocr_version
DEFAULT_LANG = 'eng'
MAX_PDF_PAGES = 10
_ocr_client: Optional[PaddleOCR] = None


def get_ocr_client() -> PaddleOCR:
    global _ocr_client
    if _ocr_client is None:
        _ocr_client = PaddleOCR(
            use_angle_cls=False,
            lang='en',
            use_gpu=False,
            show_log=False,
        )
    return _ocr_client


def flatten_text(result: Sequence) -> str:
    lines = []
    for block in result:
        if not isinstance(block, Sequence):
            continue
        for line in block:
            if (
                isinstance(line, Sequence)
                and len(line) >= 2
                and isinstance(line[1], Sequence)
            ):
                text_candidate = line[1][0]
                if isinstance(text_candidate, str) and text_candidate.strip():
                    lines.append(text_candidate.strip())
    return '\n'.join(lines)


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
            images = convert_from_path(temp_path)
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

        ocr_client = get_ocr_client()
        start = time.perf_counter()

        all_text_parts = []
        for page_num, image in enumerate(images[:pages_to_process], start=1):
            page_start = time.perf_counter()
            if image.mode != 'RGB':
                image = image.convert('RGB')

            try:
                raw_result = ocr_client.ocr(np.array(image), cls=False)
            except Exception as exc:
                return JSONResponse(
                    status_code=500,
                    content={'error': f'OCR extraction failed on page {page_num}', 'details': str(exc)},
                )

            page_text = flatten_text(raw_result or [])
            if page_text.strip():
                all_text_parts.append(page_text)

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

    if image.mode != 'RGB':
        image = image.convert('RGB')

    ocr_client = get_ocr_client()

    start = time.perf_counter()
    try:
        raw_result = ocr_client.ocr(np.array(image), cls=False)
    except Exception as exc:  # pragma: no cover
        return JSONResponse(
            status_code=500,
            content={'error': 'OCR extraction failed', 'details': str(exc)},
        )

    text = flatten_text(raw_result or [])
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
            'meta': meta,
        },
    )
