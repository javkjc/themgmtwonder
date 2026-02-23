import { Logger } from '@nestjs/common';

const logger = new Logger('FieldTypeValidator');

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidationOverride =
    | 'type_mismatch'
    | 'conflicting_zones'
    | 'conflicting_pages'
    | null;

export interface LlmReasoning {
    rawOcrConfidence: number | null;
    modelConfidence: number;
    zone: string;
    dsppApplied: boolean;
    dsppTransforms: string[];
    validationOverride: ValidationOverride;
    ragAdjustment: null;
    ragRetrievedCount: null;
    documentTypeScoped: null;
    fieldSchemaVersion: 1;
    finalScore?: number;
}

export interface ProcessedSuggestion {
    segmentId: string;
    fieldKey: string;
    /** Original value returned by the model — never modified */
    originalValue: string;
    /** Value after DSPP cleaning (may equal originalValue if no transforms applied) */
    cleanedValue: string;
    confidence: number;
    /** Final weighted score stored as confidence_score */
    finalScore: number;
    zone: string;
    boundingBox: Record<string, number> | null;
    extractionMethod: string;
    validationOverride: ValidationOverride;
    llmReasoning: LlmReasoning;
}

// ─── DSPP Cleaning ────────────────────────────────────────────────────────────

/**
 * Run domain-specific pre-processing (DSPP) on a raw ML-suggested value.
 * Returns the cleaned value and the list of substitutions applied.
 */
export function dsppClean(
    rawValue: string,
    fieldType: string,
): { cleaned: string; transforms: string[] } {
    const numericTypes = ['currency', 'number', 'decimal', 'int'];

    if (numericTypes.includes(fieldType)) {
        let cleaned = rawValue;
        const transforms: string[] = [];

        // Glyph substitutions
        const substitutions: Array<[RegExp, string, string]> = [
            [/S/g, '5', 'S→5'],
            [/O/g, '0', 'O→0'],
            [/l/g, '1', 'l→1'],
            [/I(?=\d)|(?<=\d)I|^I(?=\d)/g, '1', 'I→1'],
            [/B/g, '8', 'B→8'],
        ];

        for (const [pattern, replacement, label] of substitutions) {
            const before = cleaned;
            cleaned = cleaned.replace(pattern, replacement);
            if (cleaned !== before) {
                transforms.push(label);
            }
        }

        // Handle I→1 separately with a simpler approach
        // The above regex for I is complex; use a simpler pass
        const beforeI = cleaned;
        cleaned = cleaned.replace(/I/g, '1');
        if (cleaned !== beforeI && !transforms.includes('I→1')) {
            transforms.push('I→1');
        }

        // Extract the first numeric token to avoid trailing noise like "(1 Item)"
        // e.g. "$27.54 (1 Item)" → take "$27.54" before processing separators.
        const firstToken = cleaned.match(/[+\-]?[$€£¥]?\s*[\d,]+(?:[.,]\d+)?/);
        cleaned = firstToken ? firstToken[0] : cleaned;

        // Determine decimal separator: last occurrence of . or , with 1–2 trailing digits
        const hasEuroDecimal = /,\d{1,2}$/.test(cleaned);
        if (hasEuroDecimal) {
            // European format: 1.234,50 → strip thousands dots, replace comma with dot
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            // Strip commas (thousands separators), keep dots
            cleaned = cleaned.replace(/,/g, '');
        }

        // Strip non-numeric characters except . and -
        cleaned = cleaned.replace(/[^\d.\-]/g, '');

        return { cleaned, transforms };
    }

    if (fieldType === 'date') {
        let cleaned = rawValue;
        const transforms: string[] = [];

        // Replace O→0 in date context (common OCR error for digits)
        const beforeO = cleaned;
        cleaned = cleaned.replace(/O/g, '0');
        if (cleaned !== beforeO) transforms.push('O→0');

        // Replace I→1 and l→1 in date context
        const beforeI = cleaned;
        cleaned = cleaned.replace(/[Il]/g, '1');
        if (cleaned !== beforeI) transforms.push('Il→1');

        // Attempt common format normalisation
        // Try DD/MM/YYYY
        const ddmmyyyy = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (ddmmyyyy) {
            const normalised = `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
            if (normalised !== cleaned) {
                transforms.push('DD/MM/YYYY→YYYY-MM-DD');
                cleaned = normalised;
            }
        }

        // Try MM-DD-YYYY
        const mmddyyyy = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (mmddyyyy && !cleaned.match(/^\d{4}/)) {
            const normalised = `${mmddyyyy[3]}-${mmddyyyy[1]}-${mmddyyyy[2]}`;
            if (normalised !== cleaned) {
                transforms.push('MM-DD-YYYY→YYYY-MM-DD');
                cleaned = normalised;
            }
        }

        return { cleaned, transforms };
    }

    // All other types: pass-through
    return { cleaned: rawValue, transforms: [] };
}

// ─── Type Validation ──────────────────────────────────────────────────────────

/**
 * Validate a cleaned value against the field's declared type.
 * Returns whether validation passed and the override key if it failed.
 */
export function typeValidate(
    cleanedValue: string,
    fieldType: string,
): { passes: boolean; override: ValidationOverride } {
    const numericTypes = ['currency', 'number', 'decimal', 'int'];

    if (numericTypes.includes(fieldType)) {
        const num = parseFloat(cleanedValue);
        if (!isFinite(num) || isNaN(num)) {
            return { passes: false, override: 'type_mismatch' };
        }
        return { passes: true, override: null };
    }

    if (fieldType === 'date') {
        if (!cleanedValue || !cleanedValue.trim()) {
            return { passes: false, override: 'type_mismatch' };
        }
        const d = new Date(cleanedValue);
        if (isNaN(d.getTime())) {
            return { passes: false, override: 'type_mismatch' };
        }
        return { passes: true, override: null };
    }

    // text, varchar, boolean, or unknown: always passes
    return { passes: true, override: null };
}

// ─── Weighted FinalScore ───────────────────────────────────────────────────────

/**
 * Compute the weighted FinalScore from available signals and apply penalties.
 */
export function computeFinalScore(opts: {
    modelConfidence: number;
    rawOcrConfidence: number | null;
    ragAgreement: number;
    dsppApplied: boolean;
    validationOverride: ValidationOverride;
}): number {
    const { modelConfidence, rawOcrConfidence, ragAgreement, dsppApplied, validationOverride } = opts;

    const ocrSignal = rawOcrConfidence ?? modelConfidence;

    let score =
        0.7 * modelConfidence +
        0.2 * ragAgreement +
        0.1 * ocrSignal;

    // Clamp to [0, 1]
    score = Math.max(0.0, Math.min(1.0, score));

    // Apply penalties in order
    if (dsppApplied) {
        score = Math.max(0.0, score - 0.1);
    }

    // Hard overrides
    if (validationOverride === 'type_mismatch') {
        score = 0.0;
    }
    // conflicting_zones and conflicting_pages are applied externally.
    if (
        validationOverride === 'conflicting_zones' ||
        validationOverride === 'conflicting_pages'
    ) {
        score = 0.0;
    }

    return Math.round(score * 10000) / 10000; // 4 decimal places
}

// ─── Per-suggestion Processing ────────────────────────────────────────────────

export interface RawMlSuggestion {
    segmentId: string;
    fieldKey: string;
    confidence: number;
    zone: string;
    boundingBox: Record<string, number> | null;
    extractionMethod: string;
}

export interface SegmentMeta {
    text: string;
    confidence: number | null; // rawOcrConfidence from OCR
}

export interface FieldMeta {
    fieldKey: string;
    characterType: string;
}

/**
 * Process a single ML suggestion through DSPP cleaning + type validation +
 * weighted FinalScore. Returns a fully annotated ProcessedSuggestion.
 */
export function processSuggestion(
    suggestion: RawMlSuggestion,
    segmentMeta: SegmentMeta,
    fieldMeta: FieldMeta,
): ProcessedSuggestion {
    const rawOcrConfidence =
        segmentMeta.confidence !== null && segmentMeta.confidence !== undefined
            ? Number(segmentMeta.confidence)
            : null;

    const modelConfidence = suggestion.confidence;
    const fieldType = fieldMeta.characterType;

    // Step 1: DSPP cleaning
    const { cleaned: cleanedValue, transforms } = dsppClean(
        segmentMeta.text,
        fieldType,
    );
    const dsppApplied = transforms.length > 0;

    // Step 2: Type validation
    const { passes, override: validationOverride } = typeValidate(
        cleanedValue,
        fieldType,
    );

    if (!passes) {
        logger.warn(
            `Type validation failed for field=${fieldMeta.fieldKey} type=${fieldType} cleanedValue="${cleanedValue}" — confidence zeroed`,
        );
    }

    // Step 3: Weighted FinalScore
    const finalScore = computeFinalScore({
        modelConfidence,
        rawOcrConfidence,
        ragAgreement: 0.0, // RAG disabled until v8.11
        dsppApplied,
        validationOverride,
    });

    const llmReasoning: LlmReasoning = {
        rawOcrConfidence,
        modelConfidence,
        zone: suggestion.zone,
        dsppApplied,
        dsppTransforms: transforms,
        validationOverride,
        ragAdjustment: null,
        ragRetrievedCount: null,
        documentTypeScoped: null,
        fieldSchemaVersion: 1,
        finalScore,
    };

    return {
        segmentId: suggestion.segmentId,
        fieldKey: suggestion.fieldKey,
        originalValue: segmentMeta.text,
        cleanedValue,
        confidence: modelConfidence,
        finalScore,
        zone: suggestion.zone,
        boundingBox: suggestion.boundingBox,
        extractionMethod: suggestion.extractionMethod ?? 'layoutlmv3',
        validationOverride,
        llmReasoning,
    };
}

// ─── Conflicting Field Detection ─────────────────────────────────────────────

/**
 * Scan for any fieldKey that appears in more than one zone with confidence ≥ 0.50.
 * Zero confidence on all but the highest-confidence occurrence;
 * set validationOverride = 'conflicting_zones' on the losers.
 *
 * Mutates the processed suggestions in-place.
 */
export function detectConflictingZones(
    suggestions: ProcessedSuggestion[],
): void {
    // Group by fieldKey
    const byField = new Map<string, ProcessedSuggestion[]>();
    for (const s of suggestions) {
        if (!byField.has(s.fieldKey)) byField.set(s.fieldKey, []);
        byField.get(s.fieldKey)!.push(s);
    }

    for (const [fieldKey, group] of byField) {
        if (group.length <= 1) continue;

        // Only consider occurrences with finalScore >= 0.50 when scanning for conflicts
        const highConfGroup = group.filter((s) => s.finalScore >= 0.5);
        if (highConfGroup.length <= 1) continue;

        // Gather distinct zones
        const zones = new Set(highConfGroup.map((s) => s.zone));
        if (zones.size <= 1) continue; // Same zone — no conflict

        // Conflict detected: find the winner (highest finalScore)
        let winner = highConfGroup[0];
        for (const s of highConfGroup) {
            if (s.finalScore > winner.finalScore) winner = s;
        }

        logger.warn(
            `Conflicting zones detected for fieldKey="${fieldKey}" across zones=[${[...zones].join(', ')}] — winner zone="${winner.zone}" score=${winner.finalScore}`,
        );

        // Zero out all losers
        for (const s of group) {
            if (s === winner) continue;
            const wasHighConf = highConfGroup.includes(s);
            if (!wasHighConf) continue; // Low-confidence occurrences are not flagged

            s.finalScore = 0.0;
            s.validationOverride = 'conflicting_zones';
            s.llmReasoning = {
                ...s.llmReasoning,
                validationOverride: 'conflicting_zones',
                finalScore: 0.0,
            };
        }
    }
}
