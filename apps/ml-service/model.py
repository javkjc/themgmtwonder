import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from typing import Optional, Tuple

MODEL_VERSION = os.getenv("ML_MODEL_VERSION", "microsoft/layoutlmv3-base")

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

_model_error: Optional[str] = None
_model_loaded_at: Optional[float] = None
_lock = threading.Lock()


def _load_model_sync(model_path: str):
    from transformers import LayoutLMv3ForTokenClassification, LayoutLMv3Processor

    processor = LayoutLMv3Processor.from_pretrained(
        model_path,
        local_files_only=True,
        apply_ocr=False,
    )
    model = LayoutLMv3ForTokenClassification.from_pretrained(model_path, local_files_only=True)
    return processor, model


def _load_model_sync_from_path(model_path: str):
    from transformers import LayoutLMv3ForTokenClassification, LayoutLMv3Processor

    processor = LayoutLMv3Processor.from_pretrained(model_path, apply_ocr=False)
    model = LayoutLMv3ForTokenClassification.from_pretrained(model_path)
    return processor, model


def load_model(timeout_seconds: float = 60.0) -> None:
    global _model_error, _model_loaded_at

    from model_registry import registry, warm_up_model

    with _lock:
        if registry.model is not None and registry.processor is not None:
            return

        start_time = time.time()
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_load_model_sync, MODEL_VERSION)
                processor, model = future.result(timeout=timeout_seconds)

            warmup_shape = warm_up_model(processor, model)
            _model_loaded_at = time.time()
            _model_error = None
            registry.seed(MODEL_VERSION, processor, model, MODEL_VERSION)
            logging.info(
                "ml_model_loaded",
                extra={
                    "modelVersion": MODEL_VERSION,
                    "loadMs": int((_model_loaded_at - start_time) * 1000),
                    "warmupOutputShape": warmup_shape,
                },
            )
        except TimeoutError:
            _model_error = f"TimeoutError: model load exceeded {timeout_seconds}s"
            logging.error(
                "ml_model_load_timeout",
                extra={"modelVersion": MODEL_VERSION, "error": _model_error},
            )
        except Exception as exc:  # noqa: BLE001 - surfaced via error payload
            _model_error = f"{type(exc).__name__}: {exc}"
            logging.error(
                "ml_model_load_failed",
                extra={"modelVersion": MODEL_VERSION, "error": _model_error},
            )


def load_model_from_path(file_path: str, timeout_seconds: float = 90.0) -> Tuple[object, object, str]:
    """Load a LayoutLMv3 processor/model from an explicit path and run warm-up.

    Returns (processor, model, warm_up_shape_repr) on success.
    Raises on any failure so the caller can keep the prior model active.
    """

    from model_registry import warm_up_model

    start_time = time.time()
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_load_model_sync_from_path, file_path)
        processor, model = future.result(timeout=timeout_seconds)

    warmup_shape = warm_up_model(processor, model)
    load_ms = int((time.time() - start_time) * 1000)
    logging.info(
        "ml_model_from_path_loaded",
        extra={
            "filePath": file_path,
            "loadMs": load_ms,
            "warmupOutputShape": warmup_shape,
        },
    )
    return processor, model, warmup_shape


def get_model_error() -> Optional[str]:
    return _model_error


def get_model_loaded_at() -> Optional[float]:
    return _model_loaded_at
