import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import {
  OcrParsingService,
  OCR_FIELD_PATTERNS,
} from './ocr-parsing.service';

const SAMPLE_OCR_TEXT = `
INVOICE

From: Acme Corporation
123 Business St
New York, NY 10001

Invoice #: 12345
Invoice Date: 2024-02-01
Due Date: 2024-03-01

Description: Consulting Services
Amount: $1,234.56

Total: $1,234.56
`;

const SAMPLE_RECORD = {
  id: 'ocr-output-1',
  attachmentId: 'attachment-1',
  extractedText: SAMPLE_OCR_TEXT,
  metadata: null,
  status: 'confirmed',
  createdAt: new Date(),
};

const createMockService = (selectResult: unknown[]) => {
  const limitMock = jest.fn().mockResolvedValue(selectResult);
  const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
  const fromMock = jest.fn().mockReturnValue({ where: whereMock });
  const selectMock = jest.fn().mockReturnValue({ from: fromMock });

  const inserted = [] as any[];
  const insertMock = jest.fn().mockImplementation(() => ({
    values: jest.fn().mockImplementation((payload) => {
      inserted.push(payload);
      const returning = jest.fn().mockResolvedValue([
        {
          id: `${payload.fieldName}-result`,
          attachmentOcrOutputId: payload.attachmentOcrOutputId,
          fieldName: payload.fieldName,
          fieldValue: payload.fieldValue,
          confidence: payload.confidence,
          boundingBox: payload.boundingBox,
          pageNumber: payload.pageNumber,
          createdAt: new Date('2026-02-02T00:00:00.000Z'),
        },
      ]);
      return { returning };
    }),
  }));

  const mockDbService = {
    db: {
      select: selectMock,
      insert: insertMock,
    },
  } as unknown as DbService;

  return {
    service: new OcrParsingService(mockDbService),
    selectMock,
    whereMock,
    limitMock,
    insertMock,
    inserted,
  };
};

describe('OcrParsingService', () => {
  describe('parseOcrOutput', () => {
    it('should extract invoice fields from valid OCR text', async () => {
      const { service, insertMock, inserted } = createMockService([SAMPLE_RECORD]);
      const results = await service.parseOcrOutput(SAMPLE_RECORD.id);
      expect(results).toHaveLength(5);
      expect(results.map((r) => r.fieldName)).toEqual([
        'invoice_number',
        'invoice_date',
        'total_amount',
        'vendor_name',
        'due_date',
      ]);
      const invoiceNumber = results.find((r) => r.fieldName === 'invoice_number');
      expect(invoiceNumber).toBeDefined();
      expect(Number(invoiceNumber?.confidence)).toBeGreaterThanOrEqual(0.85);
      expect(insertMock).toHaveBeenCalledTimes(5);
      expect(inserted).toHaveLength(5);
    });

    it('should return empty array when no fields match', async () => {
      const { service, insertMock } = createMockService([
        { ...SAMPLE_RECORD, extractedText: 'nothing here' },
      ]);
      const results = await service.parseOcrOutput('ocr-output-1');
      expect(results).toEqual([]);
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('should handle missing extractedText gracefully', async () => {
      const { service, insertMock } = createMockService([
        { ...SAMPLE_RECORD, extractedText: '' },
      ]);
      const results = await service.parseOcrOutput('ocr-output-1');
      expect(results).toEqual([]);
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('should calculate confidence scores correctly', async () => {
      const { service } = createMockService([SAMPLE_RECORD]);
      const results = await service.parseOcrOutput(SAMPLE_RECORD.id);
      const invoiceDate = results.find((r) => r.fieldName === 'invoice_date');
      expect(Number(invoiceDate?.confidence)).toBeCloseTo(0.95, 2);
    });

    it('should throw NotFoundException for invalid OCR output ID', async () => {
      const { service } = createMockService([]);
      await expect(service.parseOcrOutput('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when OCR output is not confirmed', async () => {
      const { service } = createMockService([
        { ...SAMPLE_RECORD, status: 'draft' },
      ]);
      await expect(service.parseOcrOutput(SAMPLE_RECORD.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('extractField', () => {
    it('should extract value from first matching pattern', () => {
      const { service } = createMockService([SAMPLE_RECORD]);
      const field = service['extractField'](
        'Invoice #12345',
        'invoice_number',
        OCR_FIELD_PATTERNS.invoice_number,
      );
      expect(field).toEqual({
        value: '12345',
        confidence: 0.9,
        boundingBox: null,
      });
    });

    it('should return null when no patterns match', () => {
      const { service } = createMockService([SAMPLE_RECORD]);
      const field = service['extractField'](
        'No invoice here',
        'invoice_number',
        OCR_FIELD_PATTERNS.invoice_number,
      );
      expect(field).toBeNull();
    });
  });

  describe('calculateConfidence', () => {
    it('should return 0.9 for first pattern match', () => {
      const { service } = createMockService([SAMPLE_RECORD]);
      const result = service['calculateConfidence']('12345', 'invoice_number', 0);
      expect(result).toBe(0.9);
    });

    it('should boost confidence for valid date format', () => {
      const { service } = createMockService([SAMPLE_RECORD]);
      const result = service['calculateConfidence']('2024-02-01', 'invoice_date', 1);
      expect(result).toBeCloseTo(0.85, 2);
    });

    it('should cap confidence at 1.0', () => {
      const { service } = createMockService([SAMPLE_RECORD]);
      const originalDate = service['isValidDateFormat'];
      service['isValidDateFormat'] = () => true;
      const result = service['calculateConfidence']('1,234.56', 'total_amount', 0);
      expect(result).toBe(1);
      service['isValidDateFormat'] = originalDate;
    });
  });
});
