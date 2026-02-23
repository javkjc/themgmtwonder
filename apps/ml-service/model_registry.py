"""
model_registry.py - Thread-safe in-memory registry for the active LayoutLMv3 model.

Holds:
  - activeVersion: version string of the currently loaded model
  - processor: LayoutLMv3Processor instance
  - model: LayoutLMv3ForTokenClassification instance
  - modelPath: file path from which the model was loaded
"""

import threading
from typing import Optional

import torch
from PIL import Image


class ModelRegistry:
    """Singleton registry holding the active LayoutLMv3 processor and model."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active_version: Optional[str] = None
        self._processor = None
        self._model = None
        self._model_path: Optional[str] = None

    @property
    def active_version(self) -> Optional[str]:
        with self._lock:
            return self._active_version

    @property
    def processor(self):
        with self._lock:
            return self._processor

    @property
    def model(self):
        with self._lock:
            return self._model

    @property
    def model_path(self) -> Optional[str]:
        with self._lock:
            return self._model_path

    def swap(self, version: str, processor, model, model_path: str) -> None:
        """Atomically replace the active processor/model, version, and path."""
        with self._lock:
            self._active_version = version
            self._processor = processor
            self._model = model
            self._model_path = model_path

    def seed(self, version: str, processor, model, model_path: str) -> None:
        """Set initial model state (used during startup, no-op if already set)."""
        with self._lock:
            if self._model is None:
                self._active_version = version
                self._processor = processor
                self._model = model
                self._model_path = model_path


# Global singleton instance
registry = ModelRegistry()


def warm_up_model(processor, model) -> str:
    """Run a warm-up forward pass and return the output shape representation."""
    image = Image.new("RGB", (224, 224), color=(255, 255, 255))
    words = ["warm", "up"]
    boxes = [[0, 0, 100, 100], [120, 0, 220, 100]]

    with torch.no_grad():
        batch = processor(
            image,
            words,
            boxes=boxes,
            truncation=True,
            padding="max_length",
            return_tensors="pt",
        )
        # Explicitly touch the expected tensor keys for checkpoint visibility.
        warmup_tensors = {
            "input_ids": batch["input_ids"],
            "attention_mask": batch["attention_mask"],
            "bbox": batch["bbox"],
            "pixel_values": batch["pixel_values"],
        }
        outputs = model(**warmup_tensors)

    shape = tuple(outputs.logits.shape)
    if len(shape) != 3 or shape[2] != model.config.num_labels:
        raise RuntimeError(
            f"Warm-up output shape mismatch: logits{shape}, expected last dim {model.config.num_labels}"
        )
    return repr(shape)
