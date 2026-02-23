import json
import logging
import os
import threading
import urllib.error
import urllib.request
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from finetune import run_finetune

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("training-worker")

app = FastAPI(title="training-worker")


class TrainRequest(BaseModel):
    jobId: str = Field(min_length=1)
    exportPath: str = Field(min_length=1)
    syntheticPath: Optional[str] = None
    syntheticRatio: Optional[float] = None
    candidateVersion: str = Field(min_length=1)
    epochs: Optional[int] = None
    batchSize: Optional[int] = None
    learningRate: Optional[float] = None


def _post_callback(job_id: str, suffix: str, payload: dict[str, Any]) -> None:
    base = os.getenv("API_CALLBACK_BASE_URL", "http://api:3000/admin/ml/training-jobs").rstrip("/")
    token = os.getenv("API_CALLBACK_TOKEN")
    url = f"{base}/{job_id}/{suffix}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(
        url=url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
    except urllib.error.URLError as exc:
        logger.warning("callback_failed jobId=%s suffix=%s error=%s", job_id, suffix, str(exc))


def _run_training(payload: TrainRequest) -> None:
    logger.info("training_started jobId=%s candidateVersion=%s", payload.jobId, payload.candidateVersion)
    try:
        result = run_finetune(
            input_path=payload.exportPath,
            output_root="/app/models",
            candidate_version=payload.candidateVersion,
            synthetic_path=payload.syntheticPath,
            synthetic_ratio=payload.syntheticRatio,
            epochs=payload.epochs,
            batch_size=payload.batchSize,
            learning_rate=payload.learningRate,
        )
        _post_callback(
            payload.jobId,
            "complete",
            {
                "metrics": result["metrics"],
                "modelPath": result["modelPath"],
                "candidateVersion": payload.candidateVersion,
            },
        )
        logger.info("training_succeeded jobId=%s modelPath=%s", payload.jobId, result["modelPath"])
    except Exception as exc:
        _post_callback(payload.jobId, "fail", {"error": str(exc)})
        logger.exception("training_failed jobId=%s", payload.jobId)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/train")
def train(payload: TrainRequest) -> dict[str, str]:
    if not os.path.exists(payload.exportPath):
        raise HTTPException(status_code=400, detail=f"exportPath does not exist: {payload.exportPath}")

    thread = threading.Thread(target=_run_training, args=(payload,), daemon=True)
    thread.start()
    return {"status": "accepted", "jobId": payload.jobId}
