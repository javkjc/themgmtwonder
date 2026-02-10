import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DbService } from '../db/db.service';
import { OcrService } from './ocr.service';
import { OcrParsingService } from './ocr-parsing.service';
import { OcrCorrectionsService } from './ocr-corrections.service';

const MOCK_USER_ID = 'user-123';
const MOCK_ATTACHMENT_ID = 'att-456';
const MOCK_TODO_ID = 'todo-789';
const MOCK_OCR_OUTPUT_ID = 'ocr-output-1';
const MOCK_OCR_RESULT_ID = 'ocr-result-1';

const mockAttachment = {
  id: MOCK_ATTACHMENT_ID,
  filename: 'invoice.pdf',
  mimeType: 'application/pdf',
  todoId: MOCK_TODO_ID,
  userId: MOCK_USER_ID,
  storedFilename: 'stored-invoice.pdf',
  size: 1024,
  createdAt: new Date('2024-02-01'),
  stageKeyAtCreation: null,
};

const mockTodo = {
  id: MOCK_TODO_ID,
  userId: MOCK_USER_ID,
  title: 'Test Todo',
  description: null,
  done: false,
  createdAt: new Date('2024-02-01'),
  updatedAt: new Date('2024-02-01'),
  startAt: null,
  durationMin: null,
  category: null,
  unscheduledAt: null,
  isPinned: false,
  stageKey: 'default',
  parentId: null,
};

const mockRawOcr = {
  id: MOCK_OCR_OUTPUT_ID,
  attachmentId: MOCK_ATTACHMENT_ID,
  extractedText: 'Invoice #12345\nTotal: $1,234.56',
  metadata: null,
  status: 'confirmed',
  createdAt: new Date('2024-02-01'),
};

const mockDraftOcr = {
  id: 'ocr-output-2',
  attachmentId: MOCK_ATTACHMENT_ID,
  extractedText: 'Invoice #00000\nTotal: $0.00',
  metadata: null,
  status: 'draft',
  createdAt: new Date('2024-01-01'),
};

const mockParsedResult = {
  id: MOCK_OCR_RESULT_ID,
  attachmentOcrOutputId: MOCK_OCR_OUTPUT_ID,
  fieldName: 'invoice_number',
  fieldValue: '12345',
  confidence: '0.95',
  boundingBox: null,
  pageNumber: 1,
  createdAt: new Date('2024-02-01'),
};

const mockCorrection = {
  id: 'corr-1',
  ocrResultId: MOCK_OCR_RESULT_ID,
  correctedBy: MOCK_USER_ID,
  originalValue: '12345',
  correctedValue: '12346',
  correctionReason: 'Typo in OCR',
  createdAt: new Date('2024-02-02'),
};

const createMockDbService = (
  attachmentResult: unknown[],
  todoResult: unknown[],
  currentOcrResult: unknown[] = [],
) => {
  const mockDbService = {
    db: {
      query: {
        attachments: {
          findFirst: jest
            .fn()
            .mockResolvedValue(attachmentResult[0] ?? null),
        },
        todos: {
          findFirst: jest.fn().mockResolvedValue(todoResult[0] ?? null),
        },
      },
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => ({
            limit: jest.fn().mockResolvedValue(currentOcrResult),
          })),
        })),
      })),
    },
  } as unknown as DbService;

  return {
    service: mockDbService,
  };
};

const createMockOcrParsingService = (results: unknown[]) => ({
  getOcrResultsByOutputId: jest.fn().mockResolvedValue(results),
});

const createMockOcrCorrectionsService = (corrections: unknown[]) => ({
  getCorrectionHistory: jest.fn().mockResolvedValue(corrections),
});

const createMockAuditService = () =>
  ({
    log: jest.fn().mockResolvedValue(undefined),
  }) as unknown as AuditService;

const buildOcrService = (
  dbService: DbService,
  parsingService: unknown,
  correctionsService: unknown,
) => {
  const auditService = createMockAuditService();
  const service = new OcrService(
    dbService,
    auditService,
    parsingService as OcrParsingService,
    correctionsService as OcrCorrectionsService,
  );
  return { service, auditService };
};

describe('OcrService', () => {
  describe('getOcrResultsWithCorrections', () => {
    it('should return full response with parsed fields and corrections', async () => {
      const { service: dbService } = createMockDbService(
        [mockAttachment],
        [mockTodo],
        [mockRawOcr],
      );
      const parsingService = createMockOcrParsingService([mockParsedResult]);
      const correctionsService = createMockOcrCorrectionsService([
        mockCorrection,
      ]);

      const { service } = buildOcrService(
        dbService,
        parsingService,
        correctionsService,
      );

      const result = await service.getOcrResultsWithCorrections(
        MOCK_ATTACHMENT_ID,
        MOCK_USER_ID,
      );

      expect(result.attachmentId).toBe(MOCK_ATTACHMENT_ID);
      expect(result.attachment.id).toBe(MOCK_ATTACHMENT_ID);
      expect(result.attachment.filename).toBe('invoice.pdf');
      expect(result.rawOcr).toBeDefined();
      expect(result.rawOcr?.id).toBe(MOCK_OCR_OUTPUT_ID);
      expect(result.parsedFields).toHaveLength(1);

      const field = result.parsedFields[0];
      expect(field.id).toBe(MOCK_OCR_RESULT_ID);
      expect(field.fieldName).toBe('invoice_number');
      expect(field.originalValue).toBe('12345');
      expect(field.currentValue).toBe('12346');
      expect(field.confidence).toBe(0.95);
      expect(field.isCorrected).toBe(true);
      expect(field.correctionCount).toBe(1);
      expect(field.correctionHistory).toHaveLength(1);
      expect(field.correctionHistory[0].correctedValue).toBe('12346');
    });

    it('should prefer confirmed OCR when others exist', async () => {
      const { service: dbService } = createMockDbService(
        [mockAttachment],
        [mockTodo],
        [mockRawOcr, mockDraftOcr],
      );
      const parsingService = createMockOcrParsingService([mockParsedResult]);
      const correctionsService = createMockOcrCorrectionsService([
        mockCorrection,
      ]);

      const { service } = buildOcrService(
        dbService,
        parsingService,
        correctionsService,
      );

      const result = await service.getOcrResultsWithCorrections(
        MOCK_ATTACHMENT_ID,
        MOCK_USER_ID,
      );

      expect(result.rawOcr?.id).toBe(MOCK_OCR_OUTPUT_ID);
      expect(result.rawOcr?.status).toBe('confirmed');
    });

    it('should return rawOcr null when OCR not triggered', async () => {
      const { service: dbService } = createMockDbService(
        [mockAttachment],
        [mockTodo],
        [],
      );
      const parsingService = createMockOcrParsingService([]);
      const correctionsService = createMockOcrCorrectionsService([]);

      const { service } = buildOcrService(
        dbService,
        parsingService,
        correctionsService,
      );

      const result = await service.getOcrResultsWithCorrections(
        MOCK_ATTACHMENT_ID,
        MOCK_USER_ID,
      );

      expect(result.attachmentId).toBe(MOCK_ATTACHMENT_ID);
      expect(result.rawOcr).toBeNull();
      expect(result.parsedFields).toEqual([]);
    });

    it('should return empty parsedFields when not parsed yet', async () => {
      const { service: dbService } = createMockDbService(
        [mockAttachment],
        [mockTodo],
        [mockRawOcr],
      );
      const parsingService = createMockOcrParsingService([]);
      const correctionsService = createMockOcrCorrectionsService([]);

      const { service } = buildOcrService(
        dbService,
        parsingService,
        correctionsService,
      );

      const result = await service.getOcrResultsWithCorrections(
        MOCK_ATTACHMENT_ID,
        MOCK_USER_ID,
      );

      expect(result.rawOcr).toBeDefined();
      expect(result.rawOcr?.id).toBe(MOCK_OCR_OUTPUT_ID);
      expect(result.parsedFields).toEqual([]);
    });

    it('should include correction history for corrected fields', async () => {
      const correction1 = {
        ...mockCorrection,
        id: 'corr-1',
        correctedValue: '12346',
        createdAt: new Date('2024-02-02'),
      };
      const correction2 = {
        ...mockCorrection,
        id: 'corr-2',
        originalValue: '12346',
        correctedValue: '12347',
        createdAt: new Date('2024-02-03'),
      };

      const { service: dbService } = createMockDbService(
        [mockAttachment],
        [mockTodo],
        [mockRawOcr],
      );
      const parsingService = createMockOcrParsingService([mockParsedResult]);
      const correctionsService = createMockOcrCorrectionsService([
        correction1,
        correction2,
      ]);

      const { service } = buildOcrService(
        dbService,
        parsingService,
        correctionsService,
      );

      const result = await service.getOcrResultsWithCorrections(
        MOCK_ATTACHMENT_ID,
        MOCK_USER_ID,
      );

      const field = result.parsedFields[0];
      expect(field.isCorrected).toBe(true);
      expect(field.correctionCount).toBe(2);
      expect(field.correctionHistory).toHaveLength(2);
      expect(field.correctionHistory[0].id).toBe('corr-1');
      expect(field.correctionHistory[1].id).toBe('corr-2');
    });

    it('should throw ForbiddenException when user does not own attachment', async () => {
      const { service: dbService } = createMockDbService([mockAttachment], []);
      const parsingService = createMockOcrParsingService([]);
      const correctionsService = createMockOcrCorrectionsService([]);

      const { service } = buildOcrService(
        dbService,
        parsingService,
        correctionsService,
      );

      await expect(
        service.getOcrResultsWithCorrections(MOCK_ATTACHMENT_ID, 'wrong-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      const { service: dbService } = createMockDbService([], []);
      const parsingService = createMockOcrParsingService([]);
      const correctionsService = createMockOcrCorrectionsService([]);

      const { service } = buildOcrService(
        dbService,
        parsingService,
        correctionsService,
      );

      await expect(
        service.getOcrResultsWithCorrections('missing-att', MOCK_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should calculate currentValue from latest correction', async () => {
      const correction1 = {
        ...mockCorrection,
        id: 'corr-1',
        originalValue: '100',
        correctedValue: '200',
        createdAt: new Date('2024-02-02'),
      };
      const correction2 = {
        ...mockCorrection,
        id: 'corr-2',
        originalValue: '200',
        correctedValue: '300',
        createdAt: new Date('2024-02-03'),
      };

      const parsedWithOriginal = {
        ...mockParsedResult,
        fieldValue: '100',
      };

      const { service: dbService } = createMockDbService(
        [mockAttachment],
        [mockTodo],
        [mockRawOcr],
      );
      const parsingService = createMockOcrParsingService([parsedWithOriginal]);
      const correctionsService = createMockOcrCorrectionsService([
        correction1,
        correction2,
      ]);

      const { service } = buildOcrService(
        dbService,
        parsingService,
        correctionsService,
      );

      const result = await service.getOcrResultsWithCorrections(
        MOCK_ATTACHMENT_ID,
        MOCK_USER_ID,
      );

      const field = result.parsedFields[0];
      expect(field.originalValue).toBe('100');
      expect(field.currentValue).toBe('300');
      expect(field.correctionCount).toBe(2);
    });

    it('should use original value as currentValue when no corrections exist', async () => {
      const { service: dbService } = createMockDbService(
        [mockAttachment],
        [mockTodo],
        [mockRawOcr],
      );
      const parsingService = createMockOcrParsingService([mockParsedResult]);
      const correctionsService = createMockOcrCorrectionsService([]);

      const { service } = buildOcrService(
        dbService,
        parsingService,
        correctionsService,
      );

      const result = await service.getOcrResultsWithCorrections(
        MOCK_ATTACHMENT_ID,
        MOCK_USER_ID,
      );

      const field = result.parsedFields[0];
      expect(field.originalValue).toBe('12345');
      expect(field.currentValue).toBe('12345');
      expect(field.isCorrected).toBe(false);
      expect(field.correctionCount).toBe(0);
      expect(field.correctionHistory).toEqual([]);
    });
  });
});
