import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DbService } from '../db/db.service';
import { OcrCorrectionsService } from './ocr-corrections.service';

type SelectResponse = unknown[];

const createSelectBuilder = (result: SelectResponse) => {
  const builder = {
    from: () => builder,
    where: () => builder,
    innerJoin: () => builder,
    limit: jest.fn().mockResolvedValue(result),
    then(
      onFulfilled: (value: SelectResponse) => unknown,
      onRejected?: (reason?: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
    catch(onRejected: (reason?: unknown) => unknown) {
      return Promise.resolve(result).catch(onRejected);
    },
  };

  return builder;
};

const createMockDb = (selectResults: SelectResponse[]) => {
  const results = [...selectResults];
  const selectMock = jest.fn().mockImplementation(() => {
    const next = results.shift() ?? [];
    return createSelectBuilder(next);
  });

  const inserted: Record<string, unknown>[] = [];
  const insertMock = jest.fn().mockImplementation(() => ({
    values: jest.fn().mockImplementation((payload) => {
      inserted.push(payload);
      const returning = jest.fn().mockResolvedValue([
        {
          id: 'correction-1',
          ...payload,
          createdAt: new Date('2026-02-02T00:00:00.000Z'),
        },
      ]);
      return { returning };
    }),
  }));

  return {
    selectMock,
    insertMock,
    inserted,
    dbService: {
      db: { select: selectMock, insert: insertMock },
    } as unknown as DbService,
  };
};

const createAuditService = () =>
  ({
    log: jest.fn().mockResolvedValue(undefined),
  }) as unknown as AuditService;

const buildOcrResult = () => ({
  id: 'ocr-1',
  fieldName: 'invoice_number',
  fieldValue: 'INV-2026-001',
  attachmentOcrOutputId: 'output-1',
});

describe('OcrCorrectionsService', () => {
  it('creates a correction with valid ownership', async () => {
    const { selectMock, insertMock, inserted, dbService } = createMockDb([
      [buildOcrResult()],
      [{ todoOwnerId: 'user-1', ocrStatus: 'confirmed' }],
    ]);
    const auditService = createAuditService();
    const service = new OcrCorrectionsService(dbService, auditService);

    const correction = await service.createCorrection(
      'ocr-1',
      'INV-2026-001A',
      'typo',
      'user-1',
    );

    expect(correction.id).toBe('correction-1');
    expect(selectMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(inserted[0]).toMatchObject({
      originalValue: 'INV-2026-001',
      correctedValue: 'INV-2026-001A',
      correctedBy: 'user-1',
      correctionReason: 'typo',
    });
    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith({
      action: 'ocr.field_corrected',
      module: 'ocr',
      resourceType: 'ocr_result',
      resourceId: 'ocr-1',
      details: {
        fieldName: 'invoice_number',
        originalValue: 'INV-2026-001',
        correctedValue: 'INV-2026-001A',
        correctionReason: 'typo',
      },
    });
  });

  it('throws ForbiddenException for non-owner', async () => {
    const { dbService } = createMockDb([
      [buildOcrResult()],
      [{ todoOwnerId: 'owner-2', ocrStatus: 'confirmed' }],
    ]);
    const auditService = createAuditService();
    const service = new OcrCorrectionsService(dbService, auditService);

    await expect(
      service.createCorrection('ocr-1', 'INV-2026-001A', null, 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when OCR output is not confirmed', async () => {
    const { dbService } = createMockDb([
      [buildOcrResult()],
      [{ todoOwnerId: 'user-1', ocrStatus: 'draft' }],
    ]);
    const auditService = createAuditService();
    const service = new OcrCorrectionsService(dbService, auditService);

    await expect(
      service.createCorrection('ocr-1', 'INV-2026-001A', null, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for empty correction values', async () => {
    const { dbService } = createMockDb([]);
    const auditService = createAuditService();
    const service = new OcrCorrectionsService(dbService, auditService);

    await expect(
      service.createCorrection('ocr-1', '   ', null, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('preserves original OCR result value', async () => {
    const { inserted, dbService } = createMockDb([
      [buildOcrResult()],
      [{ todoOwnerId: 'user-1', ocrStatus: 'confirmed' }],
    ]);
    const auditService = createAuditService();
    const service = new OcrCorrectionsService(dbService, auditService);

    await service.createCorrection('ocr-1', 'INV-2026-001A', null, 'user-1');

    expect(inserted[0].originalValue).toBe('INV-2026-001');
  });

  it('returns chronological correction history', async () => {
    const corrections = [
      {
        id: 'corr-1',
        correctedValue: 'INV-2026-001A',
        createdAt: new Date('2026-02-02T12:00:00.000Z'),
      },
      {
        id: 'corr-2',
        correctedValue: 'INV-2026-001B',
        createdAt: new Date('2026-02-02T08:00:00.000Z'),
      },
    ];
    const { dbService } = createMockDb([[buildOcrResult()], corrections]);
    const auditService = createAuditService();
    const service = new OcrCorrectionsService(dbService, auditService);

    const history = await service.getCorrectionHistory('ocr-1');

    expect(history.map((item) => item.id)).toEqual(['corr-2', 'corr-1']);
  });

  it('returns latest corrected value when corrections exist', async () => {
    const corrections = [
      {
        id: 'corr-1',
        correctedValue: 'INV-2026-001A',
        createdAt: new Date('2026-02-02T08:00:00.000Z'),
      },
      {
        id: 'corr-2',
        correctedValue: 'INV-2026-001B',
        createdAt: new Date('2026-02-02T12:00:00.000Z'),
      },
    ];
    const { dbService } = createMockDb([[buildOcrResult()], corrections]);
    const auditService = createAuditService();
    const service = new OcrCorrectionsService(dbService, auditService);

    const latest = await service.getLatestValue('ocr-1');

    expect(latest).toEqual({
      value: 'INV-2026-001B',
      isCorrected: true,
      correctedAt: new Date('2026-02-02T12:00:00.000Z'),
    });
  });

  it('returns original value when no corrections exist', async () => {
    const { dbService } = createMockDb([[buildOcrResult()], []]);
    const auditService = createAuditService();
    const service = new OcrCorrectionsService(dbService, auditService);

    const latest = await service.getLatestValue('ocr-1');

    expect(latest).toEqual({
      value: 'INV-2026-001',
      isCorrected: false,
    });
  });
});
