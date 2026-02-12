import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from typing import List, Optional

import numpy as np

MODEL_VERSION = "all-MiniLM-L6-v2"

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

_model = None
_model_error: Optional[str] = None
_model_loaded_at: Optional[float] = None
_lock = threading.Lock()


def _load_model_sync():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_VERSION, local_files_only=True)


def load_model(timeout_seconds: float = 20.0) -> None:
    global _model, _model_error, _model_loaded_at

    with _lock:
        if _model is not None or _model_error is not None:
            return

        start_time = time.time()
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_load_model_sync)
                _model = future.result(timeout=timeout_seconds)
            _model_loaded_at = time.time()
            _model_error = None
            logging.info(
                "ml_model_loaded",
                extra={
                    "modelVersion": MODEL_VERSION,
                    "loadMs": int((_model_loaded_at - start_time) * 1000),
                },
            )
        except TimeoutError:
            _model = None
            _model_error = f"TimeoutError: model load exceeded {timeout_seconds}s"
            logging.error(
                "ml_model_load_timeout",
                extra={"modelVersion": MODEL_VERSION, "error": _model_error},
            )
        except Exception as exc:  # noqa: BLE001 - surfaced via error payload
            _model = None
            _model_error = f"{type(exc).__name__}: {exc}"
            logging.error(
                "ml_model_load_failed",
                extra={"modelVersion": MODEL_VERSION, "error": _model_error},
            )


def get_model_error() -> Optional[str]:
    return _model_error


def get_model_loaded_at() -> Optional[float]:
    return _model_loaded_at


def embed_texts(texts: List[str]) -> np.ndarray:
    if _model is None:
        raise RuntimeError("Model not loaded")
    if not texts:
        return np.zeros((0, 0), dtype=np.float32)
    embeddings = _model.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    return embeddings.astype(np.float32)
