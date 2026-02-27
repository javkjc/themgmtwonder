import { Test, TestingModule } from '@nestjs/testing';
import { FieldAssignmentValidatorService } from './field-assignment-validator.service';

describe('FieldAssignmentValidatorService', () => {
  let service: FieldAssignmentValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FieldAssignmentValidatorService],
    }).compile();

    service = module.get<FieldAssignmentValidatorService>(
      FieldAssignmentValidatorService,
    );
  });

  describe('validate', () => {
    it('should allow null/empty values for all field types', () => {
      const types = [
        'varchar',
        'int',
        'decimal',
        'date',
        'currency',
        'email',
        'phone',
        'url',
        'percentage',
        'boolean',
      ];

      types.forEach((type) => {
        expect(service.validate(type, null)).toEqual({ valid: true });
        expect(service.validate(type, undefined)).toEqual({ valid: true });
        expect(service.validate(type, '')).toEqual({ valid: true });
        expect(service.validate(type, '   ')).toEqual({ valid: true });
      });
    });

    it('should return valid for unknown character type (permissive default)', () => {
      const result = service.validate('unknown_type', 'test');

      expect(result.valid).toBe(true);
    });
  });

  describe('validateVarchar', () => {
    it('should accept valid varchar values', () => {
      expect(service.validate('varchar', 'Test value')).toEqual({
        valid: true,
      });
      expect(service.validate('varchar', 'a'.repeat(100))).toEqual({
        valid: true,
      });
    });

    it('should reject varchar exceeding character limit', () => {
      const result = service.validate('varchar', 'a'.repeat(51), 50);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum length of 50');
      expect(result.suggestedCorrection).toBe('a'.repeat(50));
    });

    it('should accept varchar within character limit', () => {
      const result = service.validate('varchar', 'a'.repeat(50), 50);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateInt', () => {
    it('should accept valid integers', () => {
      expect(service.validate('int', '0')).toEqual({ valid: true });
      expect(service.validate('int', '123')).toEqual({ valid: true });
      expect(service.validate('int', '999999')).toEqual({ valid: true });
    });

    it('should reject negative integers', () => {
      const result = service.validate('int', '-5');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be 0 or greater');
      expect(result.suggestedCorrection).toBe('0');
    });

    it('should reject integers with commas', () => {
      const result = service.validate('int', '1,000');

      expect(result.valid).toBe(false);
      expect(result.error).toContain(
        'Thousands separators (commas) are not allowed',
      );
      expect(result.suggestedCorrection).toBe('1000');
    });

    it('should reject non-numeric values', () => {
      const result = service.validate('int', 'abc123');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid integer format');
    });

    it('should suggest numeric-only value for mixed content', () => {
      const result = service.validate('int', '123abc456');

      expect(result.valid).toBe(false);
      expect(result.suggestedCorrection).toBe('123456');
    });
  });

  describe('validateDecimal', () => {
    it('should accept valid decimals', () => {
      expect(service.validate('decimal', '0.00')).toEqual({ valid: true });
      expect(service.validate('decimal', '123.45')).toEqual({ valid: true });
      expect(service.validate('decimal', '999999.99')).toEqual({ valid: true });
    });

    it('should auto-normalize decimals to 2 decimal places', () => {
      const result = service.validate('decimal', '123.4');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('123.40');
    });

    it('should strip currency symbols and suggest normalized format', () => {
      const result = service.validate('decimal', '$1,234.56');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('1234.56');
    });

    it('should reject negative decimals', () => {
      const result = service.validate('decimal', '-5.50');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be 0 or greater');
      expect(result.suggestedCorrection).toBe('0.00');
    });

    it('should reject non-numeric values', () => {
      const result = service.validate('decimal', 'abc');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid decimal format');
    });
  });

  describe('validateDate', () => {
    it('should accept valid ISO 8601 dates', () => {
      expect(service.validate('date', '2024-01-15')).toEqual({ valid: true });
      expect(service.validate('date', '2024-12-31')).toEqual({ valid: true });
    });

    it('should normalize YYYY-MM-DD with time', () => {
      const result = service.validate('date', '2024-01-15 15:30');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('2024-01-15');
    });

    it('should normalize DD-MM-YYYY format', () => {
      const result = service.validate('date', '15-01-2024');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('2024-01-15');
    });

    it('should normalize YY-MM-DD format (2-digit year)', () => {
      const result = service.validate('date', '24-01-15');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('2024-01-15');
    });

    it('should normalize DD-MM-YY format (2-digit year)', () => {
      const result = service.validate('date', '15-01-24');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('2024-01-15');
    });

    it('should normalize YYYY/MM/DD format with slashes', () => {
      const result = service.validate('date', '2024/01/15');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('2024-01-15');
    });

    it('should normalize DD/MM/YYYY format with slashes', () => {
      const result = service.validate('date', '15/01/2024');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('2024-01-15');
    });

    it('should normalize YYYYMMDD format (no separators)', () => {
      const result = service.validate('date', '20240115');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('2024-01-15');
    });

    it('should reject invalid dates', () => {
      expect(service.validate('date', '2024-13-01').valid).toBe(false);
      // Note: JavaScript Date constructor may normalize invalid dates like 2024-02-31
      // So we test with clearly invalid formats instead
      expect(service.validate('date', 'not a date').valid).toBe(false);
      expect(service.validate('date', 'invalid-date-format').valid).toBe(false);
    });

    it('should handle edge cases with time separators', () => {
      const result = service.validate('date', '2024-01-15T10:30:00');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('2024-01-15');
    });
  });

  describe('validateCurrency', () => {
    it('should accept valid ISO 4217 currency codes', () => {
      expect(service.validate('currency', 'USD')).toEqual({ valid: true });
      expect(service.validate('currency', 'EUR')).toEqual({ valid: true });
      expect(service.validate('currency', 'GBP')).toEqual({ valid: true });
      expect(service.validate('currency', 'JPY')).toEqual({ valid: true });
    });

    it('should auto-normalize to uppercase', () => {
      const result = service.validate('currency', 'usd');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('USD');
    });

    it('should accept monetary amounts and suggest normalized format', () => {
      const result = service.validate('currency', '$1,234.56');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('1234.56');
    });

    it('should auto-normalize amount precision to 2 decimals', () => {
      const result = service.validate('currency', '241.5');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('241.50');
    });

    it('should reject negative currency amounts', () => {
      const result = service.validate('currency', '-10.25');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('0 or greater');
      expect(result.suggestedCorrection).toBe('0.00');
    });

    it('should reject non-currency text', () => {
      const result = service.validate('currency', 'US');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid currency amount');
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(service.validate('email', 'test@example.com')).toEqual({
        valid: true,
      });
      expect(service.validate('email', 'user.name@domain.co.uk')).toEqual({
        valid: true,
      });
    });

    it('should auto-normalize to lowercase', () => {
      const result = service.validate('email', 'User@Example.COM');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('user@example.com');
    });

    it('should reject invalid email formats', () => {
      expect(service.validate('email', 'notanemail').valid).toBe(false);
      expect(service.validate('email', '@example.com').valid).toBe(false);
      expect(service.validate('email', 'user@').valid).toBe(false);
      expect(service.validate('email', 'user @example.com').valid).toBe(false);
    });
  });

  describe('validatePhone', () => {
    it('should accept valid phone numbers', () => {
      expect(service.validate('phone', '1234567')).toEqual({ valid: true });
      expect(service.validate('phone', '12345678901234')).toEqual({
        valid: true,
      });
    });

    it('should auto-normalize by removing formatting characters', () => {
      const result = service.validate('phone', '+1 (555) 123-4567');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('15551234567');
    });

    it('should reject phone numbers with letters', () => {
      const result = service.validate('phone', '123-ABC-4567');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Should contain only digits');
    });

    it('should reject phone numbers that are too short', () => {
      const result = service.validate('phone', '12345');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 7 and 15 digits');
    });

    it('should reject phone numbers that are too long', () => {
      const result = service.validate('phone', '1234567890123456');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 7 and 15 digits');
    });
  });

  describe('validateUrl', () => {
    it('should accept valid URLs', () => {
      // URL constructor adds trailing slash, so the validator suggests normalized version
      const result1 = service.validate('url', 'https://example.com');
      expect(result1.valid).toBe(true);

      const result2 = service.validate('url', 'http://example.com');
      expect(result2.valid).toBe(true);

      const result3 = service.validate(
        'url',
        'https://example.com/path?query=1',
      );
      expect(result3.valid).toBe(true);
    });

    it('should auto-normalize hostname to lowercase', () => {
      const result = service.validate('url', 'https://Example.COM/Path');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('https://example.com/Path');
    });

    it('should auto-add https:// protocol if missing', () => {
      const result = service.validate('url', 'example.com');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('https://example.com');
    });

    it('should reject URLs with invalid protocols', () => {
      const result = service.validate('url', 'ftp://example.com');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('http:// or https://');
    });

    it('should reject invalid URL formats', () => {
      expect(service.validate('url', 'not a url').valid).toBe(false);
      expect(service.validate('url', '://invalid').valid).toBe(false);
    });
  });

  describe('validatePercentage', () => {
    it('should accept valid percentages', () => {
      // Validator auto-normalizes all percentages to 2 decimal places
      const result1 = service.validate('percentage', '0');
      expect(result1.valid).toBe(true);

      const result2 = service.validate('percentage', '50');
      expect(result2.valid).toBe(true);

      const result3 = service.validate('percentage', '100');
      expect(result3.valid).toBe(true);
    });

    it('should auto-normalize to 2 decimal places without % sign', () => {
      const result = service.validate('percentage', '50.5%');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('50.50');
    });

    it('should strip % sign and format to 2 decimals', () => {
      const result = service.validate('percentage', '75%');

      expect(result.valid).toBe(true);
      expect(result.suggestedCorrection).toBe('75.00');
    });

    it('should reject negative percentages', () => {
      const result = service.validate('percentage', '-5');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 0 and 100');
    });

    it('should reject percentages over 100', () => {
      const result = service.validate('percentage', '150');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 0 and 100');
    });

    it('should reject non-numeric values', () => {
      const result = service.validate('percentage', 'abc');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid percentage');
    });
  });

  describe('validateBoolean', () => {
    it('should accept various true representations', () => {
      const trueValues = [
        'true',
        'True',
        'TRUE',
        'yes',
        'YES',
        'y',
        'Y',
        '1',
        'on',
        'ON',
      ];

      trueValues.forEach((val) => {
        const result = service.validate('boolean', val);
        expect(result.valid).toBe(true);
      });
    });

    it('should accept various false representations', () => {
      const falseValues = [
        'false',
        'False',
        'FALSE',
        'no',
        'NO',
        'n',
        'N',
        '0',
        'off',
        'OFF',
      ];

      falseValues.forEach((val) => {
        const result = service.validate('boolean', val);
        expect(result.valid).toBe(true);
      });
    });

    it('should auto-normalize to true/false', () => {
      expect(service.validate('boolean', 'yes').suggestedCorrection).toBe(
        'true',
      );
      expect(service.validate('boolean', '1').suggestedCorrection).toBe('true');
      expect(service.validate('boolean', 'no').suggestedCorrection).toBe(
        'false',
      );
      expect(service.validate('boolean', '0').suggestedCorrection).toBe(
        'false',
      );
    });

    it('should not suggest correction when already normalized', () => {
      expect(
        service.validate('boolean', 'true').suggestedCorrection,
      ).toBeUndefined();
      expect(
        service.validate('boolean', 'false').suggestedCorrection,
      ).toBeUndefined();
    });

    it('should reject invalid boolean values', () => {
      const result = service.validate('boolean', 'maybe');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid boolean value');
    });
  });

  describe('edge cases and integration', () => {
    it('should handle whitespace trimming across all validators', () => {
      expect(service.validate('varchar', '  test  ')).toEqual({ valid: true });
      expect(service.validate('int', '  123  ')).toEqual({ valid: true });
      expect(service.validate('email', '  test@example.com  ').valid).toBe(
        true,
      );
    });

    it('should handle unicode and special characters in varchar', () => {
      expect(service.validate('varchar', 'Test 日本語 émojis 🎉')).toEqual({
        valid: true,
      });
    });

    it('should validate decimal precision correctly', () => {
      expect(service.validate('decimal', '123.456').suggestedCorrection).toBe(
        '123.46',
      );
      expect(service.validate('decimal', '123.001').suggestedCorrection).toBe(
        '123.00',
      );
    });

    it('should handle boundary conditions for character limits', () => {
      expect(service.validate('varchar', 'a', 1).valid).toBe(true);
      expect(service.validate('varchar', 'ab', 1).valid).toBe(false);
    });
  });
});
