import { BadRequestException } from '@nestjs/common';
import {
  TABLE_LIMITS,
  BASELINE_LIMITS,
  validateTableDimensions,
  validateCellValue,
  validateCorrectionReason,
} from './constants';

describe('Constants', () => {
  describe('TABLE_LIMITS', () => {
    it('should have all required table limit constants', () => {
      expect(TABLE_LIMITS).toBeDefined();
      expect(TABLE_LIMITS.MAX_ROWS).toBeDefined();
      expect(TABLE_LIMITS.MAX_COLUMNS).toBeDefined();
      expect(TABLE_LIMITS.MAX_CELLS).toBeDefined();
      expect(TABLE_LIMITS.MAX_CELL_LENGTH).toBeDefined();
    });

    it('should have numeric values for all limits', () => {
      expect(typeof TABLE_LIMITS.MAX_ROWS).toBe('number');
      expect(typeof TABLE_LIMITS.MAX_COLUMNS).toBe('number');
      expect(typeof TABLE_LIMITS.MAX_CELLS).toBe('number');
      expect(typeof TABLE_LIMITS.MAX_CELL_LENGTH).toBe('number');
    });

    it('should have positive values', () => {
      expect(TABLE_LIMITS.MAX_ROWS).toBeGreaterThan(0);
      expect(TABLE_LIMITS.MAX_COLUMNS).toBeGreaterThan(0);
      expect(TABLE_LIMITS.MAX_CELLS).toBeGreaterThan(0);
      expect(TABLE_LIMITS.MAX_CELL_LENGTH).toBeGreaterThan(0);
    });

    it('should have expected values matching current implementation', () => {
      expect(TABLE_LIMITS.MAX_ROWS).toBe(1000);
      expect(TABLE_LIMITS.MAX_COLUMNS).toBe(50);
      expect(TABLE_LIMITS.MAX_CELLS).toBe(50000);
      expect(TABLE_LIMITS.MAX_CELL_LENGTH).toBe(5000);
    });
  });

  describe('BASELINE_LIMITS', () => {
    it('should have all required baseline limit constants', () => {
      expect(BASELINE_LIMITS).toBeDefined();
      expect(BASELINE_LIMITS.MIN_CORRECTION_REASON_LENGTH).toBeDefined();
    });

    it('should have numeric values for all limits', () => {
      expect(typeof BASELINE_LIMITS.MIN_CORRECTION_REASON_LENGTH).toBe('number');
    });

    it('should have expected value matching current implementation', () => {
      expect(BASELINE_LIMITS.MIN_CORRECTION_REASON_LENGTH).toBe(10);
    });
  });

  describe('validateTableDimensions', () => {
    it('should not throw for valid dimensions', () => {
      expect(() => validateTableDimensions(5, 3)).not.toThrow();
      expect(() => validateTableDimensions(100, 10)).not.toThrow();
      expect(() => validateTableDimensions(1000, 50)).not.toThrow();
    });

    it('should throw BadRequestException for rows < 1', () => {
      expect(() => validateTableDimensions(0, 5)).toThrow(BadRequestException);
      expect(() => validateTableDimensions(-1, 5)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for columns < 1', () => {
      expect(() => validateTableDimensions(5, 0)).toThrow(BadRequestException);
      expect(() => validateTableDimensions(5, -1)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message for zero dimensions', () => {
      expect(() => validateTableDimensions(0, 0)).toThrow(
        'Table must have at least 1 row and 1 column'
      );
    });

    it('should throw BadRequestException for rows > MAX_ROWS', () => {
      expect(() => validateTableDimensions(1001, 10)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for columns > MAX_COLUMNS', () => {
      expect(() => validateTableDimensions(10, 51)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message for exceeding limits', () => {
      expect(() => validateTableDimensions(2000, 5)).toThrow(
        'Table size exceeds limits'
      );
      expect(() => validateTableDimensions(5, 100)).toThrow(
        'Table size exceeds limits'
      );
    });

    it('should throw BadRequestException for total cells > MAX_CELLS', () => {
      // 1000 * 51 = 51000 > 50000
      expect(() => validateTableDimensions(1000, 51)).toThrow(BadRequestException);
      // 501 * 100 = 50100 > 50000
      expect(() => validateTableDimensions(501, 100)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message for exceeding cell count', () => {
      expect(() => validateTableDimensions(1000, 51)).toThrow(
        'Table exceeds maximum cell count'
      );
    });

    it('should accept maximum valid dimensions', () => {
      expect(() => validateTableDimensions(1000, 50)).not.toThrow();
    });

    it('should accept dimensions where rows * cols = MAX_CELLS', () => {
      // 500 * 100 = 50000 (should be valid)
      expect(() => validateTableDimensions(500, 100)).toThrow(BadRequestException);
      // Exceeds MAX_COLUMNS (50), so should throw

      // 1000 * 50 = 50000 (should be valid)
      expect(() => validateTableDimensions(1000, 50)).not.toThrow();
    });
  });

  describe('validateCellValue', () => {
    it('should not throw for null values', () => {
      expect(() => validateCellValue(null)).not.toThrow();
    });

    it('should not throw for undefined values', () => {
      expect(() => validateCellValue(undefined)).not.toThrow();
    });

    it('should not throw for empty string', () => {
      expect(() => validateCellValue('')).not.toThrow();
    });

    it('should not throw for valid short strings', () => {
      expect(() => validateCellValue('short')).not.toThrow();
      expect(() => validateCellValue('This is a test')).not.toThrow();
    });

    it('should not throw for strings at max length', () => {
      const maxLengthString = 'a'.repeat(5000);
      expect(() => validateCellValue(maxLengthString)).not.toThrow();
    });

    it('should throw BadRequestException for strings exceeding max length', () => {
      const tooLongString = 'a'.repeat(5001);
      expect(() => validateCellValue(tooLongString)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message', () => {
      const tooLongString = 'a'.repeat(6000);
      expect(() => validateCellValue(tooLongString)).toThrow(
        'Cell value exceeds maximum length of 5000 characters'
      );
    });

    it('should handle unicode characters correctly', () => {
      const unicodeString = '你好'.repeat(2500); // 5000 characters
      expect(() => validateCellValue(unicodeString)).not.toThrow();

      const tooLongUnicode = '你好'.repeat(2501); // 5002 characters
      expect(() => validateCellValue(tooLongUnicode)).toThrow(BadRequestException);
    });
  });

  describe('validateCorrectionReason', () => {
    it('should not throw for valid correction reasons', () => {
      expect(() => validateCorrectionReason('Fixed typo error')).not.toThrow();
      expect(() => validateCorrectionReason('Updated based on new information')).not.toThrow();
    });

    it('should throw BadRequestException for reasons shorter than minimum length', () => {
      expect(() => validateCorrectionReason('short')).toThrow(BadRequestException);
      expect(() => validateCorrectionReason('fix')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message', () => {
      expect(() => validateCorrectionReason('test')).toThrow(
        `Correction reason must be at least ${BASELINE_LIMITS.MIN_CORRECTION_REASON_LENGTH} characters`
      );
    });

    it('should accept reason at minimum length (10 characters)', () => {
      const minLengthReason = '1234567890'; // Exactly 10 characters
      expect(() => validateCorrectionReason(minLengthReason)).not.toThrow();
    });

    it('should reject reason at 9 characters', () => {
      const shortReason = '123456789'; // 9 characters
      expect(() => validateCorrectionReason(shortReason)).toThrow(BadRequestException);
    });

    it('should handle whitespace correctly', () => {
      // Should count actual characters including spaces
      expect(() => validateCorrectionReason('a b c d e f')).not.toThrow(); // 11 chars with spaces
      expect(() => validateCorrectionReason('   test   ')).not.toThrow(); // 10 chars total (valid)
      expect(() => validateCorrectionReason('  test  ')).toThrow(BadRequestException); // 9 chars (invalid)
    });
  });
});
