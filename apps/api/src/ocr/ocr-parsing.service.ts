import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attachmentOcrOutputs, ocrResults } from '../db/schema';

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const OCR_FIELD_PATTERNS = {
  invoice_number: [
    /Invoice\s*#?\s*:?\s*(\d+)/i,
    /Invoice\s*No\.?\s*:?\s*(\d+)/i,
    /Inv\s*#?\s*:?\s*(\d+)/i,
  ],
  invoice_date: [
    /Invoice\s*Date\s*:?\s*(\d{4}-\d{2}-\d{2})/i,
    /Date\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{4}-\d{2}-\d{2})/,
  ],
  total_amount: [
    /Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /Amount\s*Due\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /\$\s*([\d,]+\.?\d{2})/,
  ],
  vendor_name: [/From\s*:?\s*(.+?)(?:\n|$)/i, /Vendor\s*:?\s*(.+?)(?:\n|$)/i],
  due_date: [
    /Due\s*Date\s*:?\s*(\d{4}-\d{2}-\d{2})/i,
    /Payment\s*Due\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i,
  ],
} as const;

type FieldName = keyof typeof OCR_FIELD_PATTERNS;

const FIELD_NAMES = Object.keys(OCR_FIELD_PATTERNS) as FieldName[];

type ParsedField = {
  fieldName: FieldName;
  value: string;
  confidence: number;
  boundingBox: BoundingBox | null;
};

export interface ParsedOcrResult {
  id: string;
  attachmentOcrOutputId: string;
  fieldName: string;
  fieldValue: string | null;
  confidence: string | null;
  boundingBox: BoundingBox | null;
  pageNumber: number | null;
  createdAt: Date;
  fieldType: string;
}

type ExtractedField = {
  value: string;
  confidence: number;
  boundingBox: BoundingBox | null;
};

@Injectable()
export class OcrParsingService {
  private readonly logger = new Logger(OcrParsingService.name);

  constructor(private readonly dbs: DbService) {}

  /**
   * Parse an OCR output record into structured fields with confidence scores.
   */
  async parseOcrOutput(
    attachmentOcrOutputId: string,
  ): Promise<ParsedOcrResult[]> {
    const ocrOutput = await this.loadOcrOutput(attachmentOcrOutputId);
    if (ocrOutput.status !== 'confirmed') {
      throw new BadRequestException(
        'OCR output must be confirmed before parsing',
      );
    }
    const rawText = (ocrOutput.extractedText ?? '').trim();
    if (!rawText) {
      this.logger.warn('OCR output has no text content');
      return [];
    }
    const parsedFields = this.buildParsedFields(rawText);
    if (!parsedFields.length) {
      this.logger.log('No fields extracted from OCR text');
      return [];
    }
    return this.saveParsedFields(ocrOutput.id, parsedFields);
  }

  private async loadOcrOutput(attachmentOcrOutputId: string) {
    const [ocrOutput] = await this.dbs.db
      .select()
      .from(attachmentOcrOutputs)
      .where(eq(attachmentOcrOutputs.id, attachmentOcrOutputId))
      .limit(1);
    if (!ocrOutput) {
      throw new NotFoundException(
        `OCR output ${attachmentOcrOutputId} not found`,
      );
    }
    return ocrOutput;
  }

  private buildParsedFields(rawText: string): ParsedField[] {
    const parsed: ParsedField[] = [];
    for (const fieldName of FIELD_NAMES) {
      const match = this.extractField(
        rawText,
        fieldName,
        OCR_FIELD_PATTERNS[fieldName],
      );
      if (match) {
        parsed.push({ fieldName, ...match });
      }
    }
    return parsed;
  }

  private async saveParsedFields(
    attachmentOcrOutputId: string,
    parsedFields: ParsedField[],
  ): Promise<ParsedOcrResult[]> {
    const results: ParsedOcrResult[] = [];
    for (const field of parsedFields) {
      const [record] = await this.dbs.db
        .insert(ocrResults)
        .values({
          attachmentOcrOutputId,
          fieldName: field.fieldName,
          fieldValue: field.value,
          fieldType: 'text',
          confidence: field.confidence.toString(),
          boundingBox: field.boundingBox,
          pageNumber: null,
        })
        .returning();
      results.push({
        ...record,
        boundingBox: record.boundingBox as BoundingBox | null,
      });
    }
    return results;
  }

  private extractField(
    rawText: string,
    fieldName: FieldName,
    patterns: readonly RegExp[],
  ): ExtractedField | null {
    for (let idx = 0; idx < patterns.length; idx += 1) {
      const pattern = patterns[idx];
      pattern.lastIndex = 0;
      const match = pattern.exec(rawText);
      if (!match) {
        continue;
      }
      const candidate = typeof match[1] === 'string' ? match[1].trim() : '';
      const confidence = this.calculateConfidence(candidate, fieldName, idx);
      return { value: candidate, confidence, boundingBox: null };
    }
    return null;
  }

  private calculateConfidence(
    value: string,
    fieldType: FieldName,
    patternIndex: number,
  ): number {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0.5;
    }
    const base = patternIndex === 0 ? 0.9 : patternIndex === 1 ? 0.8 : 0.7;
    let confidence = base;
    if (this.isValidDateFormat(trimmed)) {
      confidence += 0.05;
    }
    if (fieldType === 'total_amount' && this.isValidCurrencyFormat(trimmed)) {
      confidence += 0.05;
    }
    return Math.max(0.5, Math.min(1, confidence));
  }

  private isValidDateFormat(value: string): boolean {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/;
    const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const iso = isoMatch.exec(value);
    if (iso) {
      const [, year, month, day] = iso;
      return this.matchesDate(Number(year), Number(month), Number(day));
    }
    const slash = slashMatch.exec(value);
    if (slash) {
      const [, month, day, year] = slash;
      return this.matchesDate(Number(year), Number(month), Number(day));
    }
    return false;
  }

  private matchesDate(year: number, month: number, day: number): boolean {
    if ([year, month, day].some((n) => Number.isNaN(n))) {
      return false;
    }
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    );
  }

  private isValidCurrencyFormat(value: string): boolean {
    const normalized = value.replace(/,/g, '');
    return /^\d+(\.\d{1,2})?$/.test(normalized);
  }

  /**
   * Get all parsed OCR results for a given OCR output ID.
   */
  async getOcrResultsByOutputId(
    attachmentOcrOutputId: string,
  ): Promise<ParsedOcrResult[]> {
    const results = await this.dbs.db
      .select()
      .from(ocrResults)
      .where(eq(ocrResults.attachmentOcrOutputId, attachmentOcrOutputId))
      .orderBy(asc(ocrResults.fieldName));

    return results.map((result) => ({
      ...result,
      boundingBox: result.boundingBox as BoundingBox | null,
    }));
  }
}
