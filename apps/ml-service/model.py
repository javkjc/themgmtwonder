import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from typing import List, Optional, Tuple

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
        if _model is not None:
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
            # Seed the registry with the default model so hot-swap can fall back to it
            from model_registry import registry
            registry.seed(MODEL_VERSION, _model, MODEL_VERSION)
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


def load_model_from_path(file_path: str, timeout_seconds: float = 60.0) -> Tuple[object, str]:
    """Load a SentenceTransformer model from an explicit file path.

    Returns (model, warm_up_embedding_repr) on success.
    Raises on any failure so the caller can keep the prior model active.
    """
    def _load():
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer(file_path)

    start_time = time.time()
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_load)
        model = future.result(timeout=timeout_seconds)

    # Warm-up: generate one embedding to confirm the model works
    warmup = model.encode(["warm-up"], convert_to_numpy=True, normalize_embeddings=True)
    load_ms = int((time.time() - start_time) * 1000)
    logging.info(
        "ml_model_from_path_loaded",
        extra={"filePath": file_path, "loadMs": load_ms},
    )
    return model, repr(warmup.shape)


def get_model_error() -> Optional[str]:
    return _model_error


def get_model_loaded_at() -> Optional[float]:
    return _model_loaded_at


def embed_texts(texts: List[str]) -> np.ndarray:
    # Prefer the registry's active model (updated by hot-swap); fall back to startup model
    from model_registry import registry
    active = registry.model if registry.model is not None else _model
    if active is None:
        raise RuntimeError("Model not loaded")
    if not texts:
        return np.zeros((0, 0), dtype=np.float32)
    embeddings = active.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    return embeddings.astype(np.float32)
