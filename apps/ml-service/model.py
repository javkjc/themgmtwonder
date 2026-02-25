import json
import logging
import os
import threading
import time
from typing import Any, Dict, Optional

import httpx

MODEL_VERSION = os.getenv("ML_MODEL_VERSION", "qwen2.5:1.5b")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_GENERATE_URL = f"{OLLAMA_BASE_URL}/api/generate"

_model_error: Optional[str] = None
_model_loaded_at: Optional[float] = None
_lock = threading.Lock()


class ModelNotReadyError(RuntimeError):
    pass


def load_model(timeout_seconds: float = 10.0) -> None:
    global _model_error, _model_loaded_at

    from model_registry import registry

    with _lock:
        if registry.ready:
            return

        if registry.warm_up_model(timeout_seconds=timeout_seconds):
            _model_loaded_at = time.time()
            _model_error = None
        else:
            _model_error = registry.last_error or "Ollama model not ready"


def load_model_from_path(file_path: str, timeout_seconds: float = 10.0) -> Dict[str, Any]:
    """Compatibility endpoint for model activation flow.

    In the Ollama/qwen flow, file_path is treated as the target model tag.
    """

    from model_registry import registry

    ok = registry.warm_up_model(timeout_seconds=timeout_seconds, model_name=file_path)
    if not ok:
        raise ModelNotReadyError(registry.last_error or f"Model not ready: {file_path}")

    return {"activeVersion": file_path}


def get_model_error() -> Optional[str]:
    return _model_error


def get_model_loaded_at() -> Optional[float]:
    return _model_loaded_at


def generate_fields(prompt: str, json_schema: Dict[str, Any], timeout_seconds: float = 30.0) -> Dict[str, Any]:
    payload = {
        "model": MODEL_VERSION,
        "prompt": prompt,
        "format": json_schema,
        "stream": False,
    }

    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            response = client.post(OLLAMA_GENERATE_URL, json=payload)
            response.raise_for_status()
            body = response.json()
    except Exception as exc:  # noqa: BLE001
        raise ModelNotReadyError(f"{type(exc).__name__}: {exc}") from exc

    raw = body.get("response")
    if raw is None:
        return {}

    if isinstance(raw, dict):
        return raw

    if not isinstance(raw, str):
        return {}

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
        logging.warning("ml.ollama.parse.non_object")
        return {}
    except json.JSONDecodeError:
        logging.warning("ml.ollama.parse.invalid_json")
        return {}

