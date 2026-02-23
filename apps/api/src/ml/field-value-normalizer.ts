import { Logger } from '@nestjs/common';

const logger = new Logger('FieldValueNormalizer');

// ─── Types ─────────────────────────────────────────────────────────────────────

export type NormalizationError =
    | 'unparseable_date'
    | 'unparseable_boolean'
    | null;

export interface NormalizationResult {
    normalizedValue: string | null;
    normalizationError: NormalizationError;
}

// Month name → zero-padded number map for DD-Mon-YYYY parsing
const MONTH_NAMES: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04',
    may: '05', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04',
    june: '06', july: '07', august: '08', september: '09',
    october: '10', november: '11', december: '12',
};

// ─── Currency / Number / Decimal helpers ──────────────────────────────────────

/**
 * Detect decimal separator and normalize a numeric string to plain decimal.
 * Logic:
 *   - If the string ends with [.,]\d{1,2} treat that last separator as decimal.
 *   - Strip all preceding separators (thousands).
 *   - Replace the decimal separator with '.'.
 *
 * e.g.  "$1,200.50"  → "1200.50"
 *       "1.200,50"   → "1200.50"
 *       "1200"       → "1200"
 */
function normalizeNumericString(raw: string): string | null {
    // Extract the first numeric token from the string (handles values like "$27.54 (1 Item)").
    // Match an optional sign/currency prefix then digits with optional separators.
    const firstToken = raw.match(/[+\-]?[$€£¥]?\s*[\d,]+(?:[.,]\d+)?/);
    let s = firstToken ? firstToken[0].replace(/[^\d.,\-+]/g, '').trim() : '';

    if (!s) return null;

    // Detect the decimal separator: last occurrence of . or , with 1–2 trailing digits
    const decimalDotMatch = s.match(/\.(\d{1,2})$/);
    const decimalCommaMatch = s.match(/,(\d{1,2})$/);

    let result: string;

    if (decimalCommaMatch && !decimalDotMatch) {
        // European style: last comma is decimal separator
        // Remove all dots (thousands), replace last comma with dot
        result = s.replace(/\./g, '').replace(/,(\d{1,2})$/, '.$1');
    } else if (decimalDotMatch) {
        // Anglo/ISO style: last dot is decimal separator
        // Remove all commas (thousands)
        result = s.replace(/,/g, '');
    } else {
        // No decimal separator — treat as integer
        result = s.replace(/[,.]/g, '');
    }

    // Final validation: must be a finite number
    const num = parseFloat(result);
    if (!isFinite(num) || isNaN(num)) return null;

    return result;
}

// ─── Date parser ──────────────────────────────────────────────────────────────

/**
 * Attempt to parse a date string in priority order:
 *   1. ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
 *   2. DD/MM/YYYY
 *   3. MM/DD/YYYY
 *   4. DD-Mon-YYYY  (e.g. "23 Jan 2026" or "23-Jan-2026")
 *   5. YYYY/MM/DD
 *
 * Returns "YYYY-MM-DD" on success, null on failure.
 */
function normalizeDate(raw: string): string | null {
    const s = raw.trim();

    // 1. ISO 8601 — YYYY-MM-DD bare or with time component
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        const [, y, m, d] = iso;
        const dt = new Date(`${y}-${m}-${d}T00:00:00Z`);
        if (!isNaN(dt.getTime())) return `${y}-${m}-${d}`;
    }

    // 2. DD/MM/YYYY
    const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
        const [, d, m, y] = ddmmyyyy;
        const dt = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`);
        if (!isNaN(dt.getTime())) {
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }

    // 3. MM/DD/YYYY
    const mmddyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mmddyyyy) {
        const [, m, d, y] = mmddyyyy;
        const dt = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`);
        if (!isNaN(dt.getTime())) {
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }

    // 4. DD-Mon-YYYY or "DD Mon YYYY" (space or hyphen separator)
    const ddMonYyyy = s.match(
        /^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-](\d{4})$/,
    );
    if (ddMonYyyy) {
        const [, d, mon, y] = ddMonYyyy;
        const monthNum = MONTH_NAMES[mon.toLowerCase()];
        if (monthNum) {
            const dt = new Date(
                `${y}-${monthNum}-${d.padStart(2, '0')}T00:00:00Z`,
            );
            if (!isNaN(dt.getTime())) {
                return `${y}-${monthNum}-${d.padStart(2, '0')}`;
            }
        }
    }

    // 5. YYYY/MM/DD
    const yyyymmdd = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (yyyymmdd) {
        const [, y, m, d] = yyyymmdd;
        const dt = new Date(`${y}-${m}-${d}T00:00:00Z`);
        if (!isNaN(dt.getTime())) return `${y}-${m}-${d}`;
    }

    // 6. "Mon DD, YYYY" or "Month DD, YYYY" — e.g. "Jul 28, 2023", "August 1, 2023"
    const monDdYyyy = s.match(
        /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/,
    );
    if (monDdYyyy) {
        const [, mon, d, y] = monDdYyyy;
        const monthNum = MONTH_NAMES[mon.toLowerCase()];
        if (monthNum) {
            const dt = new Date(`${y}-${monthNum}-${d.padStart(2, '0')}T00:00:00Z`);
            if (!isNaN(dt.getTime())) {
                return `${y}-${monthNum}-${d.padStart(2, '0')}`;
            }
        }
    }

    // 7. Natural language: strip weekday prefix and time suffix, then retry
    // e.g. "Tuesday, August 1, 2023 by 10pm" → "August 1, 2023"
    const nlStripped = s
        .replace(/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*/i, '')
        .replace(/\s+(?:by|at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i, '')
        .replace(/\s+\d{2}:\d{2}(?::\d{2})?(?:\s*[zZ]|[+-]\d{2}:?\d{2})?$/, '')
        .trim();

    if (nlStripped && nlStripped !== s) {
        const dt = new Date(nlStripped);
        if (!isNaN(dt.getTime())) {
            return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        }
    }

    return null;
}

// ─── Boolean parser ───────────────────────────────────────────────────────────

const TRUTHY_VALUES = new Set(['yes', 'true', 'checked', '1', 'on']);
const FALSY_VALUES = new Set(['no', 'false', 'unchecked', '0', 'off']);

function normalizeBoolean(raw: string): string | null {
    const s = raw.trim().toLowerCase();
    if (TRUTHY_VALUES.has(s)) return 'true';
    if (FALSY_VALUES.has(s)) return 'false';
    return null;
}

// ─── Main normalizer ──────────────────────────────────────────────────────────

/**
 * Normalize a raw OCR value to a machine-readable scalar based on fieldType.
 *
 * - `currency`: strip symbols, normalize decimal → plain decimal string
 * - `date`: parse multi-format → YYYY-MM-DD
 * - `boolean`: map truthy/falsy strings → 'true' | 'false'
 * - `number` / `decimal`: same separator detection as currency, no symbol strip
 * - `text`: pass-through
 * - unknown type: pass-through
 *
 * Normalization failure is non-fatal — sets normalizationError; never throws.
 */
export function normalizeFieldValue(opts: {
    rawValue: string | null | undefined;
    fieldType: string;
    locale?: string;
}): NormalizationResult {
    const { rawValue, fieldType } = opts;

    // Null / empty raw value → pass-through with no error
    if (rawValue === null || rawValue === undefined || rawValue.trim() === '') {
        return { normalizedValue: rawValue ?? null, normalizationError: null };
    }

    const raw = rawValue.trim();

    try {
        switch (fieldType) {
            case 'currency': {
                const normalized = normalizeNumericString(raw);
                if (normalized === null) {
                    logger.warn(
                        `Currency normalization failed for rawValue="${raw}"`,
                    );
                    // currency normalization failure is treated as a non-blocking pass-through
                    // per the spec: normalization failure never blocks persistence
                    // Use generic normalization error — spec only defines date/boolean errors
                    return {
                        normalizedValue: null,
                        normalizationError: null, // not a date/boolean — no named error; just null
                    };
                }
                return { normalizedValue: normalized, normalizationError: null };
            }

            case 'number':
            case 'decimal':
            case 'int': {
                const normalized = normalizeNumericString(raw);
                if (normalized === null) {
                    logger.warn(
                        `Numeric normalization failed for type=${fieldType} rawValue="${raw}"`,
                    );
                    return { normalizedValue: null, normalizationError: null };
                }
                return { normalizedValue: normalized, normalizationError: null };
            }

            case 'date': {
                const normalized = normalizeDate(raw);
                if (normalized === null) {
                    logger.warn(
                        `Date normalization failed for rawValue="${raw}" — unparseable_date`,
                    );
                    return {
                        normalizedValue: null,
                        normalizationError: 'unparseable_date',
                    };
                }
                return { normalizedValue: normalized, normalizationError: null };
            }

            case 'boolean': {
                const normalized = normalizeBoolean(raw);
                if (normalized === null) {
                    logger.warn(
                        `Boolean normalization failed for rawValue="${raw}" — unparseable_boolean`,
                    );
                    return {
                        normalizedValue: null,
                        normalizationError: 'unparseable_boolean',
                    };
                }
                return { normalizedValue: normalized, normalizationError: null };
            }

            case 'text':
            case 'varchar':
            default:
                // Pass-through
                return { normalizedValue: raw, normalizationError: null };
        }
    } catch (err) {
        // Should never happen but guard against unexpected runtime errors
        logger.error(
            `Unexpected normalization error for fieldType=${fieldType} rawValue="${raw}": ${err}`,
        );
        return { normalizedValue: null, normalizationError: null };
    }
}
