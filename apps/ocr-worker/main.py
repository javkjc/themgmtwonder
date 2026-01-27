import io
import time
from typing import Optional, Sequence

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from paddleocr import PaddleOCR, __version__ as paddleocr_version
from PIL import Image, UnidentifiedImageError

app = FastAPI()

ENGINE_NAME = 'paddleocr'
ENGINE_VERSION = paddleocr_version
DEFAULT_LANG = 'eng'
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
