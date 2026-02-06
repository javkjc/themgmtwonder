import { Injectable, Logger } from '@nestjs/common';

export interface ValidationResult {
    valid: boolean;
    error?: string;
    suggestedCorrection?: string;
}

@Injectable()
export class FieldAssignmentValidatorService {
    private readonly logger = new Logger(FieldAssignmentValidatorService.name);

    /**
     * Validate a value against its field type rules.
     * Does not perform mutations; only returns validation status and suggestions.
     */
    validate(characterType: string, value: string | null | undefined, characterLimit?: number | null): ValidationResult {
        if (value === null || value === undefined || value.trim() === '') {
            return { valid: true }; // Null/empty assignments are allowed (unassigning)
        }

        const trimmed = value.trim();

        switch (characterType) {
            case 'varchar':
                return this.validateVarchar(trimmed, characterLimit);
            case 'int':
                return this.validateInt(trimmed);
            case 'decimal':
                return this.validateDecimal(trimmed);
            case 'date':
                return this.validateDate(trimmed);
            case 'currency':
                return this.validateCurrency(trimmed);
            default:
                this.logger.warn(`Validation attempt for unknown character type: ${characterType}`);
                return { valid: false, error: `Unknown character type: ${characterType}` };
        }
    }

    private validateVarchar(value: string, limit?: number | null): ValidationResult {
        if (limit && value.length > limit) {
            return {
                valid: false,
                error: `Value exceeds maximum length of ${limit} characters.`,
                suggestedCorrection: value.substring(0, limit),
            };
        }
        return { valid: true };
    }

    private validateInt(value: string): ValidationResult {
        // Allow thousands separators during parsing but not in final strict check
        const normalized = value.replace(/,/g, '');
        const parsed = parseInt(normalized, 10);

        if (isNaN(parsed) || !/^-?\d+$/.test(normalized)) {
            const numericOnly = value.replace(/[^\d-]/g, '');
            return {
                valid: false,
                error: 'Invalid integer format. Only numbers are allowed.',
                suggestedCorrection: numericOnly || undefined,
            };
        }

        // Strict check: no commas in the source value
        if (value.includes(',')) {
            return {
                valid: false,
                error: 'Thousands separators (commas) are not allowed in integer fields.',
                suggestedCorrection: normalized,
            };
        }

        return { valid: true };
    }

    private validateDecimal(value: string): ValidationResult {
        // Allow common currency decorations ($, commas, spaces) but store/compare on sanitized value
        const sanitized = value.replace(/\$/g, '').replace(/,/g, '').trim();
        const parsed = parseFloat(sanitized);

        if (isNaN(parsed) || isNaN(Number(sanitized))) {
            return { valid: false, error: 'Invalid decimal format.' };
        }

        const fixed = parsed.toFixed(2);

        // If user input already matches normalized numeric format, accept; otherwise accept but suggest normalized
        const isNormalizedInput = sanitized === fixed && !value.includes(',') && !value.includes('$');

        return {
            valid: true,
            suggestedCorrection: isNormalizedInput ? undefined : fixed,
        };
    }

    private validateDate(value: string): ValidationResult {
        // ISO 8601 strict check (YYYY-MM-DD)
        const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (isoRegex.test(value)) {
            const date = new Date(value);
            if (!isNaN(date.getTime()) && date.toISOString().startsWith(value)) {
                return { valid: true };
            }
        }

        // Try to parse and suggest ISO format
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            try {
                const correction = date.toISOString().split('T')[0];
                return {
                    valid: false,
                    error: 'Invalid date format. Expected YYYY-MM-DD.',
                    suggestedCorrection: correction,
                };
            } catch {
                // Fall through
            }
        }

        return { valid: false, error: 'Invalid date format. Expected YYYY-MM-DD.' };
    }

    private validateCurrency(value: string): ValidationResult {
        // Accept with normalization of $, commas, and spacing; suggest clean numeric string
        const normalized = value.replace(/[^\d.]/g, '').trim();
        const parsed = parseFloat(normalized);

        if (isNaN(parsed)) {
            return { valid: false, error: 'Invalid currency format.' };
        }

        const fixed = parsed.toFixed(2);
        const strictRegex = /^\d+(\.\d{2})?$/;
        const isStrict = strictRegex.test(value);

        return {
            valid: true,
            suggestedCorrection: isStrict ? undefined : fixed,
        };
    }
}
