"""
zone_classifier.py — Rule-based zone classifier for I2 (v8.10 Optimal Extraction Accuracy).

Assigns a zone label (header / addresses / line_items / instructions / footer / unknown)
to each segment based on its normalised y-midpoint ratio.

y_ratio = (boundingBox.y + boundingBox.height / 2) / pageHeight

Boundaries (from plan.md §I2):
  y_ratio < 0.15               → 'header'
  0.15 ≤ y_ratio < 0.30        → 'addresses'
  0.30 ≤ y_ratio < 0.75        → 'line_items'
  0.75 ≤ y_ratio < 0.88        → 'instructions'
  y_ratio ≥ 0.88               → 'footer'
  no bounding box              → 'unknown'

Important: pageHeight is used as-is (same 0–1000 normalised space as bboxes after
normalize_bbox() has been applied in main.py).  Do NOT re-normalise here.
"""

from typing import Optional


def classify(bbox_y: Optional[float], bbox_height: Optional[float], page_height: float) -> str:
    """Return a zone label for a segment.

    Parameters
    ----------
    bbox_y:
        The normalised y-coordinate of the top edge of the segment bounding box.
        Must be in the same coordinate space as page_height (0–1000 after
        normalize_bbox() in main.py).  Pass None when the segment has no
        bounding box.
    bbox_height:
        The normalised height of the segment bounding box.
        Pass None when the segment has no bounding box.
    page_height:
        The page height in the same coordinate space as bbox_y / bbox_height.
        Must be > 0.

    Returns
    -------
    str
        One of: 'header', 'addresses', 'line_items', 'instructions', 'footer', 'unknown'.
    """
    if bbox_y is None or bbox_height is None or page_height <= 0:
        return "unknown"

    y_mid = float(bbox_y) + float(bbox_height) / 2.0
    y_ratio = y_mid / float(page_height)

    if y_ratio < 0.15:
        return "header"
    elif y_ratio < 0.30:
        return "addresses"
    elif y_ratio < 0.75:
        return "line_items"
    elif y_ratio < 0.88:
        return "instructions"
    else:
        return "footer"
