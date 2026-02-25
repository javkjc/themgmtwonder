import logging
import os
import threading
from typing import Optional

import httpx


class ModelRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active_version: Optional[str] = None
        self._ready = False
        self._last_error: Optional[str] = None

    @property
    def active_version(self) -> Optional[str]:
        with self._lock:
            return self._active_version

    @property
    def ready(self) -> bool:
        with self._lock:
            return self._ready

    @property
    def last_error(self) -> Optional[str]:
        with self._lock:
            return self._last_error

    def mark_ready(self, version: str) -> None:
        with self._lock:
            self._active_version = version
            self._ready = True
            self._last_error = None

    def mark_error(self, error: str) -> None:
        with self._lock:
            self._ready = False
            self._last_error = error

    def warm_up_model(self, timeout_seconds: float = 10.0, model_name: Optional[str] = None) -> bool:
        target_model = model_name or os.getenv("ML_MODEL_VERSION", "qwen2.5:1.5b")
        base_url = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
        tags_url = f"{base_url}/api/tags"

        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.get(tags_url)
                response.raise_for_status()
                body = response.json()
        except Exception as exc:  # noqa: BLE001
            error = f"{type(exc).__name__}: {exc}"
            self.mark_error(error)
            logging.warning("ml.ollama.tags.unreachable", extra={"error": error})
            return False

        models = body.get("models") or []
        names = {m.get("name") for m in models if isinstance(m, dict)}

        if target_model in names:
            self.mark_ready(target_model)
            logging.info("ml.ollama.tags.ready", extra={"model": target_model})
            return True

        self.mark_error(f"Model not found in /api/tags: {target_model}")
        logging.warning(
            "ml.ollama.tags.model_missing",
            extra={
                "model": target_model,
                "availableModels": sorted(name for name in names if isinstance(name, str)),
            },
        )
        return False


registry = ModelRegistry()

