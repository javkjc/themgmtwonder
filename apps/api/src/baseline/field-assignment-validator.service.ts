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
  validate(
    characterType: string,
    value: string | null | undefined,
    characterLimit?: number | null,
  ): ValidationResult {
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
      case 'email':
        return this.validateEmail(trimmed);
      case 'phone':
        return this.validatePhone(trimmed);
      case 'url':
        return this.validateUrl(trimmed);
      case 'percentage':
        return this.validatePercentage(trimmed);
      case 'boolean':
        return this.validateBoolean(trimmed);
      default:
        this.logger.warn(
          `Validation attempt for unknown character type: ${characterType}`,
        );
        return {
          valid: false,
          error: `Unknown character type: ${characterType}`,
        };
    }
  }

  private validateVarchar(
    value: string,
    limit?: number | null,
  ): ValidationResult {
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

    // Enforce minimum value of 0 (no negative numbers)
    if (parsed < 0) {
      return {
        valid: false,
        error: 'Value must be 0 or greater. Negative numbers are not allowed.',
        suggestedCorrection: '0',
      };
    }

    // Strict check: no commas in the source value
    if (value.includes(',')) {
      return {
        valid: false,
        error:
          'Thousands separators (commas) are not allowed in integer fields.',
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

    // Enforce minimum value of 0 (no negative numbers)
    if (parsed < 0) {
      return {
        valid: false,
        error: 'Value must be 0 or greater. Negative numbers are not allowed.',
        suggestedCorrection: '0.00',
      };
    }

    const fixed = parsed.toFixed(2);

    // If user input already matches normalized numeric format, accept; otherwise accept but suggest normalized
    const isNormalizedInput =
      sanitized === fixed && !value.includes(',') && !value.includes('$');

    return {
      valid: true,
      suggestedCorrection: isNormalizedInput ? undefined : fixed,
    };
  }

  private validateDate(value: string): ValidationResult {
    const trimmed = value.trim();

    // ISO 8601 strict check (YYYY-MM-DD)
    const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (isoRegex.test(trimmed)) {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime()) && date.toISOString().startsWith(trimmed)) {
        return { valid: true };
      }
    }

    // Try to extract and parse date from various formats
    let year: string | null = null;
    let month: string | null = null;
    let day: string | null = null;
    let detectedFormat: string | null = null;

    // Format 1: YYYY-MM-DD with time (space or T separator or no separator)
    // Examples: "2021-01-23 15:00", "2021-01-23T15:00", "2021-01-2315:00"
    let match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]?\d{2}:\d{2})?/);
    if (match) {
      year = match[1];
      month = match[2];
      day = match[3];
      detectedFormat = 'YYYY-MM-DD with time';
    }

    // Format 2: DD-MM-YYYY with time (space or no separator)
    // Examples: "21-05-2020 15:10", "21-05-202015:10"
    if (!match) {
      match = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})(?:[T\s]?\d{2}:\d{2})?/);
      if (match) {
        day = match[1];
        month = match[2];
        year = match[3];
        detectedFormat = 'DD-MM-YYYY';
      }
    }

    // Format 3: YY-MM-DD with time (space or no separator)
    // Examples: "21-05-23 15:10", "21-05-2315:10"
    // Need to distinguish from DD-MM-YY by checking if values make sense
    if (!match) {
      match = trimmed.match(/^(\d{2})-(\d{2})-(\d{2})(?:[T\s]?\d{2}:\d{2})?/);
      if (match) {
        const first = parseInt(match[1], 10);
        const second = parseInt(match[2], 10);
        const third = parseInt(match[3], 10);

        // If first value >= 20, likely YY-MM-DD format (year 20xx)
        if (first >= 20 && third <= 31 && second <= 12) {
          // YY-MM-DD format
          year = first >= 50 ? `19${match[1]}` : `20${match[1]}`;
          month = match[2];
          day = match[3];
          detectedFormat = 'YY-MM-DD';
        } else if (first <= 31 && second <= 12 && third >= 20) {
          // DD-MM-YY format
          day = match[1];
          month = match[2];
          year = third >= 50 ? `19${match[3]}` : `20${match[3]}`;
          detectedFormat = 'DD-MM-YY';
        }
      }
    }

    // Format 4: YYYY/MM/DD or DD/MM/YYYY with slashes
    if (!match) {
      match = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:[T\s]?\d{2}:\d{2})?/);
      if (match) {
        year = match[1];
        month = match[2];
        day = match[3];
        detectedFormat = 'YYYY/MM/DD';
      } else {
        match = trimmed.match(
          /^(\d{2})\/(\d{2})\/(\d{4})(?:[T\s]?\d{2}:\d{2})?/,
        );
        if (match) {
          day = match[1];
          month = match[2];
          year = match[3];
          detectedFormat = 'DD/MM/YYYY';
        }
      }
    }

    // Format 5: YYYYMMDD (no separators, no time)
    if (!match) {
      match = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (match) {
        year = match[1];
        month = match[2];
        day = match[3];
        detectedFormat = 'YYYYMMDD';
      }
    }

    // If we extracted date parts, validate and suggest correction
    if (year && month && day) {
      const isoFormat = `${year}-${month}-${day}`;
      const date = new Date(isoFormat);

      // Validate that the date is real (not something like Feb 31)
      if (!isNaN(date.getTime())) {
        const dateYear = date.getFullYear().toString();
        const dateMonth = (date.getMonth() + 1).toString().padStart(2, '0');
        const dateDay = date.getDate().toString().padStart(2, '0');

        // Check if the parsed date matches what we extracted (catches invalid dates like 2020-13-45)
        if (dateYear === year && dateMonth === month && dateDay === day) {
          // Valid date but wrong format - auto-normalize like decimal fields
          return {
            valid: true,
            suggestedCorrection: isoFormat,
          };
        }
      }
    }

    // Last resort: Try native Date parsing
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      try {
        const correction = date.toISOString().split('T')[0];
        // Valid date but wrong format - auto-normalize
        return {
          valid: true,
          suggestedCorrection: correction,
        };
      } catch {
        // Fall through
      }
    }

    return { valid: false, error: 'Invalid date format. Expected YYYY-MM-DD.' };
  }

  private validateCurrency(value: string): ValidationResult {
    // Currency field follows ISO 4217 standard: exactly 3 uppercase letters
    // Examples: USD, EUR, GBP, JPY, CNY
    const trimmed = value.trim();
    const iso4217Regex = /^[A-Z]{3}$/;

    // Check if it matches ISO 4217 format
    if (!iso4217Regex.test(trimmed)) {
      const uppercased = trimmed.toUpperCase();

      // If uppercasing and trimming would make it valid, suggest that
      if (iso4217Regex.test(uppercased)) {
        return {
          valid: true,
          suggestedCorrection: uppercased,
        };
      }

      // Otherwise, provide general guidance
      return {
        valid: false,
        error:
          'Currency code must be exactly 3 uppercase letters (e.g., USD, EUR, GBP).',
      };
    }

    return { valid: true };
  }

  private validateEmail(value: string): ValidationResult {
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const lowercased = value.toLowerCase();

    if (!emailRegex.test(value)) {
      return {
        valid: false,
        error: 'Invalid email format. Expected format: user@example.com',
      };
    }

    // Auto-normalize to lowercase
    if (value !== lowercased) {
      return {
        valid: true,
        suggestedCorrection: lowercased,
      };
    }

    return { valid: true };
  }

  private validatePhone(value: string): ValidationResult {
    // Remove common phone number characters for normalization
    const cleaned = value.replace(/[\s\-\(\)\+\.]/g, '');

    // Check if it contains only digits (after removing formatting)
    if (!/^\d+$/.test(cleaned)) {
      return {
        valid: false,
        error:
          'Invalid phone number. Should contain only digits and optional formatting characters.',
      };
    }

    // Phone numbers should be between 7 and 15 digits (international standard)
    if (cleaned.length < 7 || cleaned.length > 15) {
      return {
        valid: false,
        error: 'Phone number should be between 7 and 15 digits.',
      };
    }

    // Auto-normalize to digits only
    if (value !== cleaned) {
      return {
        valid: true,
        suggestedCorrection: cleaned,
      };
    }

    return { valid: true };
  }

  private validateUrl(value: string): ValidationResult {
    try {
      const url = new URL(value);

      // Ensure it's http or https
      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          valid: false,
          error: 'URL must use http:// or https:// protocol.',
        };
      }

      // Auto-normalize to lowercase hostname
      const normalized = `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname}${url.search}${url.hash}`;
      if (value !== normalized) {
        return {
          valid: true,
          suggestedCorrection: normalized,
        };
      }

      return { valid: true };
    } catch {
      // Try adding https:// if missing
      if (!value.includes('://')) {
        const withProtocol = `https://${value}`;
        try {
          new URL(withProtocol);
          return {
            valid: true,
            suggestedCorrection: withProtocol,
          };
        } catch {
          // Fall through
        }
      }

      return {
        valid: false,
        error: 'Invalid URL format. Expected format: https://example.com',
      };
    }
  }

  private validatePercentage(value: string): ValidationResult {
    // Remove % sign if present
    const cleaned = value.replace(/%/g, '').trim();
    const parsed = parseFloat(cleaned);

    if (isNaN(parsed)) {
      return {
        valid: false,
        error: 'Invalid percentage. Must be a number between 0 and 100.',
      };
    }

    if (parsed < 0 || parsed > 100) {
      return {
        valid: false,
        error: 'Percentage must be between 0 and 100.',
      };
    }

    // Auto-normalize: remove % sign, format to 2 decimals
    const normalized = parsed.toFixed(2);
    if (value !== normalized && value !== `${normalized}%`) {
      return {
        valid: true,
        suggestedCorrection: normalized,
      };
    }

    return { valid: true };
  }

  private validateBoolean(value: string): ValidationResult {
    const lowercased = value.toLowerCase().trim();

    // Accept various boolean representations
    const trueValues = ['true', 'yes', 'y', '1', 'on'];
    const falseValues = ['false', 'no', 'n', '0', 'off'];

    if (trueValues.includes(lowercased)) {
      return {
        valid: true,
        suggestedCorrection: lowercased !== 'true' ? 'true' : undefined,
      };
    }

    if (falseValues.includes(lowercased)) {
      return {
        valid: true,
        suggestedCorrection: lowercased !== 'false' ? 'false' : undefined,
      };
    }

    return {
      valid: false,
      error:
        'Invalid boolean value. Expected: true/false, yes/no, y/n, 1/0, on/off',
    };
  }
}
