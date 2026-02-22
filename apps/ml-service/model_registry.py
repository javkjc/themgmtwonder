"""
model_registry.py — Thread-safe in-memory registry for the active model.

Holds:
  - activeVersion: version string of the currently loaded model
  - model: the SentenceTransformer instance
  - modelPath: file path from which the model was loaded

v8.9 B2: ML Service Hot Swap Endpoint
"""

import threading
from typing import Optional


class ModelRegistry:
    """Singleton registry holding the active SentenceTransformer model."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active_version: Optional[str] = None
        self._model = None
        self._model_path: Optional[str] = None

    @property
    def active_version(self) -> Optional[str]:
        with self._lock:
            return self._active_version

    @property
    def model(self):
        with self._lock:
            return self._model

    @property
    def model_path(self) -> Optional[str]:
        with self._lock:
            return self._model_path

    def swap(self, version: str, model, model_path: str) -> None:
        """Atomically replace the active model, version, and path."""
        with self._lock:
            self._active_version = version
            self._model = model
            self._model_path = model_path

    def seed(self, version: str, model, model_path: str) -> None:
        """Set initial model state (used during startup, no-op if already set)."""
        with self._lock:
            if self._model is None:
                self._active_version = version
                self._model = model
                self._model_path = model_path


# Global singleton instance
registry = ModelRegistry()
