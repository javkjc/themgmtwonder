import base64
import json
import logging
import os
from io import BytesIO

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps

from preprocessor import QUALITY_THRESHOLD, run_pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Preprocessor Service")

DEFAULT_STEPS = ["orientation", "deskew", "shadow", "contrast"]
QUALITY_THRESHOLD_ENV = float(os.environ.get("QUALITY_THRESHOLD", QUALITY_THRESHOLD))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/preprocess")
async def preprocess(
    file: UploadFile = File(...),
    steps: str = Form(None),
):
    """
    Accept raw image bytes (multipart) and optional steps JSON field.
    Returns preprocessed image as base64 or quality failure response.
    """
    # Parse steps
    if steps is not None:
        try:
            parsed = json.loads(steps)
            if isinstance(parsed, list):
                requested_steps = parsed
            elif isinstance(parsed, dict) and "steps" in parsed:
                requested_steps = parsed["steps"]
            else:
                requested_steps = DEFAULT_STEPS
        except (json.JSONDecodeError, TypeError):
            requested_steps = DEFAULT_STEPS
    else:
        requested_steps = DEFAULT_STEPS

    # Validate step names
    valid_steps = {"orientation", "deskew", "shadow", "contrast"}
    requested_steps = [s for s in requested_steps if s in valid_steps]
    if not requested_steps:
        requested_steps = DEFAULT_STEPS

    # Read image bytes
    contents = await file.read()
    if not contents:
        return JSONResponse(status_code=400, content={"ok": False, "reason": "empty_file"})

    # Decode image via PIL then convert to OpenCV BGR.
    # exif_transpose applies the EXIF orientation tag (e.g. phone photos taken
    # sideways) before any processing, so the pipeline always sees upright pixels.
    try:
        pil_img = ImageOps.exif_transpose(Image.open(BytesIO(contents))).convert("RGB")
        img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    except Exception as exc:
        logger.error("Failed to decode image: %s", exc)
        return JSONResponse(status_code=400, content={"ok": False, "reason": "invalid_image"})

    # Run pipeline
    result = run_pipeline(img, requested_steps, quality_threshold=QUALITY_THRESHOLD_ENV)

    if not result["ok"]:
        return JSONResponse(
            content={
                "ok": False,
                "reason": result["reason"],
                "qualityScore": result["quality_score"],
            }
        )

    # Encode output image as base64 JPEG
    processed_img = result["image"]
    success, encoded = cv2.imencode(".jpg", processed_img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        return JSONResponse(status_code=500, content={"ok": False, "reason": "encode_failed"})

    image_b64 = base64.b64encode(encoded.tobytes()).decode("utf-8")

    return {
        "ok": True,
        "imageBase64": image_b64,
        "preprocessingApplied": result["preprocessing_applied"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=6000)
