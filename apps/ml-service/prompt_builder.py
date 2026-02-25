from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


ZONE_ORDER = ["header", "addresses", "line_items", "instructions", "footer", "unknown"]


@dataclass
class PromptSegment:
    id: str
    text: str
    zone: str
    bounding_box: Optional[Dict[str, float]]
    page_number: int


def _band_key(page_number: int, zone: str) -> str:
    return f"{page_number}:{zone}"


def serialize_segments(segments: List[PromptSegment], page_width: float) -> str:
    """Serialize zone-tagged OCR segments into phase-2 prompt text.

    Rules:
    - Merge fragments sharing the same zone and y-band (+/- 5px)
    - For each y-band, sort cells left-to-right
    - Multi-column ordering is left column first (x < pageWidth/2), then right
    """

    half_width = max(float(page_width), 1.0) / 2.0
    grouped: Dict[str, List[Dict[str, Any]]] = {}

    for seg in segments:
        if not seg.text.strip():
            continue
        if seg.bounding_box is None:
            y = float("inf")
            x = float("inf")
        else:
            y = float(seg.bounding_box.get("y", 0.0))
            x = float(seg.bounding_box.get("x", 0.0))

        key = _band_key(seg.page_number, seg.zone)
        bands = grouped.setdefault(key, [])

        band = None
        for candidate in bands:
            if abs(candidate["y"] - y) <= 5.0:
                band = candidate
                break

        if band is None:
            band = {"y": y, "cells": []}
            bands.append(band)

        band["cells"].append(
            {
                "text": seg.text.strip(),
                "x": x,
            }
        )

    zone_lines: Dict[str, List[str]] = {zone: [] for zone in ZONE_ORDER}

    for key, bands in grouped.items():
        _, zone = key.split(":", 1)
        if zone not in zone_lines:
            zone_lines[zone] = []

        bands.sort(key=lambda band: band["y"])
        for band in bands:
            cells = band["cells"]
            cells.sort(key=lambda c: (0 if c["x"] < half_width else 1, c["x"]))
            line = "  ".join(c["text"] for c in cells if c["text"])
            if line:
                zone_lines[zone].append(line)

    blocks: List[str] = []
    for zone in ZONE_ORDER + [z for z in zone_lines if z not in ZONE_ORDER]:
        lines = zone_lines.get(zone) or []
        if not lines:
            continue
        blocks.append(f"[ZONE: {zone}]\n" + "\n".join(lines))

    return "\n\n".join(blocks)


def build_nullable_json_schema(fields: List[Dict[str, str]]) -> Dict[str, Any]:
    properties: Dict[str, Any] = {}
    required: List[str] = []

    for field in fields:
        key = field["fieldKey"]
        required.append(key)
        properties[key] = {
            "type": ["string", "null"],
            "default": None,
            "description": f"{field.get('label', key)} ({field.get('fieldType', 'text')})",
        }

    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


def build_prompt_payload(
    *,
    fields: List[Dict[str, str]],
    serialized_document: str,
    rag_examples: List[Dict[str, Any]],
) -> Dict[str, Any]:
    schema = build_nullable_json_schema(fields)

    system_prompt = (
        "You are an invoice/document field extraction engine. "
        "Extract only requested fields from the serialized OCR document. "
        "Use RAG examples as guidance, but do not hallucinate. "
        "If a field is absent, return null."
    )

    field_schema_text = json.dumps(fields, ensure_ascii=True, indent=2)
    rag_examples_text = json.dumps(rag_examples, ensure_ascii=True, indent=2)

    prompt = (
        f"{system_prompt}\n\n"
        "FIELD SCHEMA:\n"
        f"{field_schema_text}\n\n"
        "RAG EXAMPLES (few-shot):\n"
        f"{rag_examples_text}\n\n"
        "SERIALIZED DOCUMENT:\n"
        f"{serialized_document}\n\n"
        "Return JSON only, matching the schema exactly."
    )

    return {
        "prompt": prompt,
        "format": schema,
    }

