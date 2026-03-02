from __future__ import annotations

import json
import logging
import string
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


ZONE_ORDER = ["header", "addresses", "line_items", "instructions", "footer", "unknown"]


ANCHOR_SYNONYMS = {
    "Total": [
        "Total", "Total Due", "Balance Due", "Amount Due",
        "Amount to Pay", "Grand Total", "Net Payable", "Amount Payable"
    ],
    "Subtotal": [
        "Subtotal", "Sub-total", "Net Amount", "Net Total",
        "Before Tax", "Taxable Amount"
    ],
    "Tax": [
        "Tax", "GST", "VAT", "HST", "SST", "Sales Tax",
        "Tax Amount", "Tax Total"
    ],
    "Invoice Date": [
        "Invoice Date", "Date", "Issue Date", "Billing Date", "Date of Issue"
    ],
    "Due Date": [
        "Due Date", "Payment Due", "Pay By", "Due By", "Payment Date"
    ],
    "Invoice": [
        "Invoice", "Invoice No", "Invoice Number", "Invoice #", "Inv No", "Inv #"
    ],
    "Bill To": ["Bill To", "Billed To", "Client", "Customer", "Sold To"],
    "Ship To": ["Ship To", "Deliver To", "Delivery Address", "Shipping Address"],
}

_SYNONYM_LOOKUP: dict[str, str] = {
    syn.lower(): canonical
    for canonical, synonyms in ANCHOR_SYNONYMS.items()
    for syn in synonyms
}


@dataclass
class PromptSegment:
    id: str
    text: str
    zone: str
    bounding_box: Optional[Dict[str, float]]
    page_number: int
    confidence: Optional[float] = None
    alias_applied: bool = False


def _band_key(page_number: int, zone: str) -> str:
    return f"{page_number}:{zone}"


def _serialize_zone_lines(zone_lines: Dict[str, List[str]]) -> str:
    blocks: List[str] = []
    for zone in ZONE_ORDER + [z for z in zone_lines if z not in ZONE_ORDER]:
        lines = zone_lines.get(zone) or []
        if not lines:
            continue
        blocks.append(f"[ZONE: {zone}]\n" + "\n".join(lines))
    return "\n\n".join(blocks)


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
            y_raw = float(seg.bounding_box.get("y", 0.0))
            y = y_raw * 1000.0 if 0.0 <= y_raw <= 1.0 else y_raw
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

        cell_text = seg.text.strip()
        if seg.confidence is not None and seg.confidence < 0.6 and not seg.alias_applied:
            cell_text = f"{cell_text} [LOW_CONF]"
        if seg.zone in ("footer", "line_items") and seg.bounding_box is not None:
            y_pct = round(float(seg.bounding_box.get("y", 0.0)) * 100)
            side = "r" if float(seg.bounding_box.get("x", 0.0)) > 0.5 else "l"
            cell_text = f"{cell_text} [b{y_pct}%,{side}]"

        band["cells"].append(
            {
                "text": cell_text,
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

    serialized_output = _serialize_zone_lines(zone_lines)
    line_items_rows = zone_lines.get("line_items") or []
    if len(line_items_rows) > 10 and len(serialized_output) > 6000:
        dropped_row_count = len(line_items_rows) - 10
        zone_lines["line_items"] = line_items_rows[:2] + line_items_rows[-8:]
        logging.info("prompt.truncated droppedRowCount=%d", dropped_row_count)
        serialized_output = _serialize_zone_lines(zone_lines)

    anchor_matches = {}
    for seg in segments:
        if not seg.text.strip() or seg.bounding_box is None:
            continue
            
        clean_text = seg.text.translate(str.maketrans('', '', string.punctuation)).lower()
        conf = seg.confidence if seg.confidence is not None else 0.0
        y_val = float(seg.bounding_box.get("y", 0.0))
        
        for key, canonical in _SYNONYM_LOOKUP.items():
            clean_key = key.translate(str.maketrans('', '', string.punctuation)).lower()
            if clean_key in clean_text:
                existing = anchor_matches.get(canonical)
                if existing is None:
                    anchor_matches[canonical] = (conf, y_val)
                else:
                    ex_conf, ex_y = existing
                    if conf > ex_conf:
                        anchor_matches[canonical] = (conf, y_val)
                    elif conf == ex_conf and y_val > ex_y:
                        anchor_matches[canonical] = (conf, y_val)

    if anchor_matches:
        serialized_output += "\n\n[ANCHORS]"
        for canonical, (c, y_val) in anchor_matches.items():
            serialized_output += f'\n"{canonical}" at Y={y_val:.2f}'

    return serialized_output


def build_nullable_json_schema(fields: List[Dict[str, str]]) -> Dict[str, Any]:
    properties: Dict[str, Any] = {}
    properties["_reasoning"] = {
        "type": "string",
        "description": "Overall document structure analysis: spatial anchor for totals, any math discrepancy. One sentence. Do not describe individual fields.",
        "maxLength": 200,
    }
    required: List[str] = []

    for field in fields:
        key = field["fieldKey"]
        required.append(key)
        base_description = f"{field.get('label', key)} ({field.get('fieldType', 'text')})"
        hint = field.get("extractionHint") or ""
        description = f"{base_description}. {hint.strip()}" if hint.strip() else base_description
        properties[key] = {
            "type": ["string", "null"],
            "default": None,
            "description": description,
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
        "You are a document field extraction engine. "
        "In '_reasoning', briefly describe the overall document structure: the spatial anchor used for totals and any math discrepancy observed. This applies to the entire document, not individual fields. "
        "Segments tagged [LOW_CONF] have unreliable OCR character recognition. Use surrounding context and linguistic reasoning to infer the correct value. Do not rely on the literal character string of a [LOW_CONF] segment. "
        "Then extract all fields accurately. "
        "Use RAG examples as guidance. If a field is absent, return null."
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
