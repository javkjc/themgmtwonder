import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { promises as fs } from 'fs';
import { DbService } from '../db/db.service';
import {
  attachmentOcrOutputs,
  attachments,
  todos,
} from '../db/schema';

export type DerivedOcrStatus = 'complete' | 'failed';
export type OcrWorkerMeta = Record<string, unknown> | null;

type OcrWorkerPayload = {
  attachmentId: string;
  filePath: string;
  mimeType: string;
  filename?: string | null;
};

type OcrWorkerResult = {
  text: string;
  meta: OcrWorkerMeta;
  workerHost: string;
};

@Injectable()
export class OcrService {
  constructor(private readonly dbs: DbService) {}

  async createDerivedOutput({
    userId,
    attachmentId,
    extractedText,
    status,
    metadata,
  }: {
    userId: string;
    attachmentId: string;
    extractedText: string;
    status: DerivedOcrStatus;
    metadata?: Record<string, unknown> | string | null;
  }) {
    await this.ensureUserOwnsAttachment(userId, attachmentId);

    const [record] = await this.dbs.db
      .insert(attachmentOcrOutputs)
      .values({
        attachmentId,
        extractedText,
        metadata:
          metadata == null
            ? null
            : typeof metadata === 'string'
            ? metadata
            : JSON.stringify(metadata),
        status,
      })
      .returning();

    return record;
  }

  async extractFromWorker(payload: OcrWorkerPayload): Promise<OcrWorkerResult> {
    const workerHost = this.resolveWorkerHost();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      let fileBuffer: Buffer;
      try {
        fileBuffer = await fs.readFile(payload.filePath);
      } catch (err) {
        throw new InternalServerErrorException(
          'Unable to read attachment bytes for OCR',
        );
      }
      const start = fileBuffer.byteOffset;
      const end = start + fileBuffer.byteLength;
      const arrayBuffer = fileBuffer.buffer as ArrayBuffer;
      const bufferPart =
        start === 0 && end === arrayBuffer.byteLength
          ? arrayBuffer
          : arrayBuffer.slice(start, end);
      const fileBody = new Blob([bufferPart], {
        type: payload.mimeType ?? 'application/octet-stream',
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream',
      };
      if (payload.filename) {
        headers['x-filename'] = payload.filename;
      }
      if (payload.mimeType) {
        headers['x-mime-type'] = payload.mimeType;
      }

      const response = await fetch(`${workerHost}/ocr`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: fileBody,
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          (body && typeof body.error === 'string' && body.error) ||
          `OCR worker responded with ${response.status}`;
        const details =
          body && typeof body.details === 'string' ? body.details : undefined;
        const err = new Error(message);
        if (details) {
          (err as Error & { details?: string }).details = details;
        }
        throw err;
      }

      if (!body || typeof body.text !== 'string') {
        throw new Error('OCR worker returned an invalid response');
      }

      return {
        text: body.text,
        meta:
          body.meta && typeof body.meta === 'object'
            ? (body.meta as Record<string, unknown>)
            : null,
        workerHost,
      };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error('OCR worker request timed out after 30 seconds');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async listByAttachment(userId: string, attachmentId: string) {
    await this.ensureUserOwnsAttachment(userId, attachmentId);

    return this.dbs.db
      .select()
      .from(attachmentOcrOutputs)
      .where(eq(attachmentOcrOutputs.attachmentId, attachmentId))
      .orderBy(desc(attachmentOcrOutputs.createdAt));
  }

  private async ensureUserOwnsAttachment(
    userId: string,
    attachmentId: string,
  ) {
    const [attachment] = await this.dbs.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId));

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(
        and(
          eq(todos.id, attachment.todoId),
          eq(todos.userId, userId),
        ),
      );

    if (!todo) {
      throw new ForbiddenException('Access denied');
    }

    return attachment;
  }

  resolveWorkerHost(): string {
    const configured = process.env.OCR_WORKER_BASE_URL;
    if (!configured) {
      throw new InternalServerErrorException(
        'OCR worker base URL is not configured. Set OCR_WORKER_BASE_URL.',
      );
    }
    return configured.replace(/\/+$/, '');
  }
}
