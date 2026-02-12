"""
Rule-based table detection heuristics for OCR segments.

Uses spatial clustering and grid alignment analysis to detect tabular structures.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


class BoundingBox:
    """Helper class for bounding box operations."""

    def __init__(self, x: float, y: float, width: float, height: float):
        self.x = x
        self.y = y
        self.width = width
        self.height = height

    @property
    def x2(self) -> float:
        return self.x + self.width

    @property
    def y2(self) -> float:
        return self.y + self.height

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2

    def to_dict(self) -> Dict[str, float]:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}


class Segment:
    """OCR segment with bounding box."""

    def __init__(
        self,
        segment_id: str,
        text: str,
        bbox: BoundingBox,
        page_number: Optional[int] = None,
        confidence: Optional[float] = None,
    ):
        self.id = segment_id
        self.text = text
        self.bbox = bbox
        self.page_number = page_number
        self.confidence = confidence


def group_segments_into_rows(
    segments: List[Segment], y_tolerance: float = 10.0
) -> List[List[Segment]]:
    """
    Group segments into rows based on vertical proximity.

    Args:
        segments: List of OCR segments
        y_tolerance: Maximum vertical distance to consider segments in same row

    Returns:
        List of rows, each containing segments ordered left-to-right
    """
    if not segments:
        return []

    # Sort by vertical position first
    sorted_segs = sorted(segments, key=lambda s: s.bbox.center_y)

    rows: List[List[Segment]] = []
    current_row: List[Segment] = [sorted_segs[0]]

    for seg in sorted_segs[1:]:
        # Check if this segment is close enough to current row
        current_row_y = np.mean([s.bbox.center_y for s in current_row])
        if abs(seg.bbox.center_y - current_row_y) <= y_tolerance:
            current_row.append(seg)
        else:
            # Sort current row left-to-right before storing
            current_row.sort(key=lambda s: s.bbox.center_x)
            rows.append(current_row)
            current_row = [seg]

    # Don't forget the last row
    if current_row:
        current_row.sort(key=lambda s: s.bbox.center_x)
        rows.append(current_row)

    return rows


def compute_column_alignment_score(rows: List[List[Segment]]) -> float:
    """
    Compute how well segments align into columns across rows.

    Returns score 0.0-1.0 where 1.0 means perfect column alignment.
    """
    if len(rows) < 2:
        return 0.0

    # Extract x-coordinates of segment centers for each row
    x_coords_per_row = [[seg.bbox.center_x for seg in row] for row in rows]

    # Find minimum number of columns
    min_cols = min(len(x_coords) for x_coords in x_coords_per_row)
    max_cols = max(len(x_coords) for x_coords in x_coords_per_row)

    if min_cols == 0 or max_cols == 0:
        return 0.0

    # Penalize unequal column counts
    col_count_consistency = min_cols / max_cols

    # For each column position, check alignment across rows
    column_variances = []
    for col_idx in range(min_cols):
        col_x_values = [
            x_coords[col_idx]
            for x_coords in x_coords_per_row
            if col_idx < len(x_coords)
        ]
        if len(col_x_values) > 1:
            variance = np.var(col_x_values)
            # Normalize variance (lower is better)
            # Use coefficient of variation to normalize
            mean_x = np.mean(col_x_values)
            if mean_x > 0:
                cv = np.sqrt(variance) / mean_x
                # Convert to score (lower cv = higher score)
                score = 1.0 / (1.0 + cv)
                column_variances.append(score)

    if not column_variances:
        return 0.0

    alignment_score = np.mean(column_variances)
    return float(alignment_score * col_count_consistency)


def compute_spacing_regularity_score(rows: List[List[Segment]]) -> float:
    """
    Compute how regular the spacing is between segments.

    Regular spacing suggests tabular structure.
    Returns score 0.0-1.0 where 1.0 means perfectly regular spacing.
    """
    all_gaps: List[float] = []

    for row in rows:
        if len(row) < 2:
            continue
        for i in range(len(row) - 1):
            gap = row[i + 1].bbox.x - row[i].bbox.x2
            if gap >= 0:  # Only consider positive gaps
                all_gaps.append(gap)

    if len(all_gaps) < 2:
        return 0.0

    # Measure consistency of gaps using coefficient of variation
    mean_gap = np.mean(all_gaps)
    std_gap = np.std(all_gaps)

    if mean_gap == 0:
        return 0.0

    cv = std_gap / mean_gap
    # Convert to score: lower CV = higher regularity
    regularity_score = 1.0 / (1.0 + cv)
    return float(regularity_score)


def compute_cell_population_score(rows: List[List[Segment]]) -> float:
    """
    Compute how well-populated the grid is.

    Empty cells are expected in tables, but too many suggest non-table structure.
    Returns score 0.0-1.0.
    """
    if not rows:
        return 0.0

    total_cells = sum(len(row) for row in rows)
    num_rows = len(rows)
    max_cols = max(len(row) for row in rows) if rows else 0

    if num_rows == 0 or max_cols == 0:
        return 0.0

    expected_cells = num_rows * max_cols
    population_ratio = total_cells / expected_cells

    # Tables should have at least 50% cells populated
    if population_ratio < 0.5:
        return 0.0

    return float(population_ratio)


def compute_table_confidence(rows: List[List[Segment]]) -> float:
    """
    Compute overall confidence that the given rows form a table.

    Uses weighted combination of:
    - Alignment consistency (0-0.4)
    - Spacing regularity (0-0.3)
    - Cell population (0-0.3)

    Returns confidence 0.0-1.0.
    """
    alignment_score = compute_column_alignment_score(rows)
    spacing_score = compute_spacing_regularity_score(rows)
    population_score = compute_cell_population_score(rows)

    # Weighted combination
    confidence = (
        0.4 * alignment_score + 0.3 * spacing_score + 0.3 * population_score
    )

    return float(np.clip(confidence, 0.0, 1.0))


def validate_grid_structure(rows: List[List[Segment]]) -> bool:
    """
    Validate that rows form a valid grid (minimum 2x2).

    Returns True if structure is valid, False otherwise.
    """
    if len(rows) < 2:
        return False

    # Check that we have at least 2 columns
    min_cols = min(len(row) for row in rows)
    if min_cols < 2:
        return False

    return True


def compute_bounding_box_for_table(rows: List[List[Segment]]) -> BoundingBox:
    """
    Compute bounding box that encompasses all segments in the table.
    """
    all_segments = [seg for row in rows for seg in row]

    if not all_segments:
        return BoundingBox(0, 0, 0, 0)

    min_x = min(seg.bbox.x for seg in all_segments)
    min_y = min(seg.bbox.y for seg in all_segments)
    max_x = max(seg.bbox.x2 for seg in all_segments)
    max_y = max(seg.bbox.y2 for seg in all_segments)

    return BoundingBox(min_x, min_y, max_x - min_x, max_y - min_y)


def generate_suggested_label(rows: List[List[Segment]], table_index: int) -> str:
    """
    Generate a suggested label for the table.

    Uses first row content as hint, or falls back to generic label.
    """
    # Try to use first row first cell as hint
    if rows and rows[0]:
        first_cell = rows[0][0].text.strip()
        if first_cell and len(first_cell) < 30:
            return f"Table: {first_cell}"

    return f"Table {table_index + 1}"


def detect_tables(
    segments: List[Dict[str, Any]], threshold: float = 0.60
) -> List[Dict[str, Any]]:
    """
    Detect table structures from OCR segments using rule-based heuristics.

    Args:
        segments: List of segment dicts with id, text, boundingBox
        threshold: Minimum confidence threshold (default 0.60)

    Returns:
        List of table detection results, each containing:
        - regionId: unique identifier
        - rowCount: number of rows
        - columnCount: number of columns
        - confidence: detection confidence (0.0-1.0)
        - boundingBox: {x, y, width, height}
        - cells: list of cell objects with rowIndex, columnIndex, text, segmentId
        - suggestedLabel: human-readable label
    """
    # Convert input segments to Segment objects
    seg_objects: List[Segment] = []
    for seg_dict in segments:
        try:
            bbox_dict = seg_dict.get("boundingBox", {})
            bbox = BoundingBox(
                x=float(bbox_dict.get("x", 0)),
                y=float(bbox_dict.get("y", 0)),
                width=float(bbox_dict.get("width", 0)),
                height=float(bbox_dict.get("height", 0)),
            )
            seg = Segment(
                segment_id=seg_dict.get("id", ""),
                text=seg_dict.get("text", ""),
                bbox=bbox,
                page_number=seg_dict.get("pageNumber"),
                confidence=seg_dict.get("confidence"),
            )
            seg_objects.append(seg)
        except (KeyError, ValueError, TypeError) as e:
            logger.warning(f"Skipping invalid segment: {e}")
            continue

    if not seg_objects:
        return []

    # Group segments into rows
    rows = group_segments_into_rows(seg_objects)

    if not rows:
        return []

    # Validate grid structure (minimum 2x2)
    if not validate_grid_structure(rows):
        logger.debug(
            f"Grid validation failed: {len(rows)} rows, "
            f"min {min(len(row) for row in rows)} cols"
        )
        return []

    # Compute confidence
    confidence = compute_table_confidence(rows)

    if confidence < threshold:
        logger.debug(f"Confidence {confidence:.2f} below threshold {threshold}")
        return []

    # Build table result
    row_count = len(rows)
    col_count = max(len(row) for row in rows)
    bbox = compute_bounding_box_for_table(rows)

    # Build cells array in row-major order
    cells: List[Dict[str, Any]] = []
    for row_idx, row in enumerate(rows):
        for col_idx, seg in enumerate(row):
            cells.append(
                {
                    "rowIndex": row_idx,
                    "columnIndex": col_idx,
                    "text": seg.text,
                    "segmentId": seg.id,
                }
            )

    table_result = {
        "regionId": str(uuid.uuid4()),
        "rowCount": row_count,
        "columnCount": col_count,
        "confidence": confidence,
        "boundingBox": bbox.to_dict(),
        "cells": cells,
        "suggestedLabel": generate_suggested_label(rows, 0),
    }

    # For v8.8, we detect at most one table per request
    # Future versions could support multiple table detection
    return [table_result]
