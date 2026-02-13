import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { MlService } from './ml.service';
import { AuditService } from '../audit/audit.service';
import {
  mlTableSuggestions,
  attachments,
  todos,
  extractionBaselines,
  extractedTextSegments,
  attachmentOcrOutputs,
} from '../db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';

interface DetectTablesOptions {
  attachmentId: string;
  userId: string;
  threshold?: number;
}

interface IgnoreSuggestionOptions {
  suggestionId: string;
  userId: string;
}

interface ConvertSuggestionOptions {
  suggestionId: string;
  userId: string;
}

@Injectable()
export class TableSuggestionService {
  constructor(
    private readonly dbs: DbService,
    private readonly mlService: MlService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Detect tables for an attachment using ML service
   * Persists suggestions with status 'pending'
   */
  async detectTables(options: DetectTablesOptions) {
    const { attachmentId, userId, threshold = 0.5 } = options;

    return await this.dbs.db.transaction(async (tx) => {
      // 1. Verify attachment exists and user owns it
      const [attachment] = await tx
        .select({
          attachment: attachments,
          todo: todos,
        })
        .from(attachments)
        .leftJoin(todos, eq(attachments.todoId, todos.id))
        .where(eq(attachments.id, attachmentId))
        .limit(1);

      if (!attachment || !attachment.todo) {
        throw new NotFoundException('Attachment not found');
      }

      if (attachment.todo.userId !== userId) {
        throw new ForbiddenException('Access denied');
      }

      // 2. Get editable baseline for attachment (draft or reviewed)
      const [editableBaseline] = await tx
        .select()
        .from(extractionBaselines)
        .where(
          and(
            eq(extractionBaselines.attachmentId, attachmentId),
            inArray(extractionBaselines.status, ['draft', 'reviewed']),
          ),
        )
        .orderBy(desc(extractionBaselines.createdAt))
        .limit(1);

      if (!editableBaseline) {
        throw new BadRequestException(
          'No editable baseline found for attachment',
        );
      }

      // Check utilization
      if (editableBaseline.utilizedAt) {
        throw new ForbiddenException('Baseline is locked due to utilization');
      }

      // 3. Get OCR segments (use latest OCR output, draft or confirmed)
      const [ocrOutput] = await tx
        .select()
        .from(attachmentOcrOutputs)
        .where(eq(attachmentOcrOutputs.attachmentId, attachmentId))
        .orderBy(desc(attachmentOcrOutputs.createdAt))
        .limit(1);

      if (!ocrOutput) {
        throw new BadRequestException(
          'No OCR output found for this attachment',
        );
      }

      const segments = await tx
        .select()
        .from(extractedTextSegments)
        .where(eq(extractedTextSegments.attachmentOcrOutputId, ocrOutput.id));

      if (segments.length === 0) {
        throw new BadRequestException(
          'No text segments available for detection',
        );
      }

      // Deduplicate segments by text + bounding box
      // (OCR may produce duplicates with different IDs)
      const uniqueSegments = segments.filter((seg, index, self) => {
        const bbox = seg.boundingBox as any;
        const key = `${seg.text}|${bbox?.x}|${bbox?.y}|${bbox?.width}|${bbox?.height}`;
        return (
          index ===
          self.findIndex((s) => {
            const sBbox = s.boundingBox as any;
            const sKey = `${s.text}|${sBbox?.x}|${sBbox?.y}|${sBbox?.width}|${sBbox?.height}`;
            return sKey === key;
          })
        );
      });

      // 4. Call ML service
      const mlPayload = {
        attachmentId,
        segments: uniqueSegments.map((s) => ({
          id: s.id,
          text: s.text,
          boundingBox: s.boundingBox as any,
          pageNumber: s.pageNumber ?? undefined,
          confidence: s.confidence ? parseFloat(s.confidence) : undefined,
        })),
        threshold,
      };

      const mlResponse = await this.mlService.detectTables(mlPayload);

      if (!mlResponse.ok) {
        // Graceful degradation - return empty suggestions
        await this.auditService.log({
          userId,
          action: 'ml.table.detect',
          module: 'ml',
          resourceType: 'attachment',
          resourceId: attachmentId,
          details: {
            success: false,
            error: mlResponse.error?.message,
          },
        });

        return {
          suggestions: [],
          error: mlResponse.error,
        };
      }

      const detections = mlResponse.data || [];

      // 5. Delete any old pending suggestions for this attachment
      await tx
        .delete(mlTableSuggestions)
        .where(
          and(
            eq(mlTableSuggestions.attachmentId, attachmentId),
            eq(mlTableSuggestions.status, 'pending'),
          ),
        );

      // 6. Persist new suggestions with status 'pending'
      const insertedSuggestions: any[] = [];

      for (const detection of detections) {
        const [suggestion] = await tx
          .insert(mlTableSuggestions)
          .values({
            attachmentId,
            regionId: detection.regionId,
            rowCount: detection.rowCount,
            columnCount: detection.columnCount,
            confidence: detection.confidence.toString(),
            boundingBox: detection.boundingBox,
            cellMapping: detection.cells,
            suggestedLabel: detection.suggestedLabel,
            status: 'pending',
          })
          .returning();

        insertedSuggestions.push(suggestion);
      }

      // 7. Audit log
      await this.auditService.log({
        userId,
        action: 'ml.table.detect',
        module: 'ml',
        resourceType: 'attachment',
        resourceId: attachmentId,
        details: {
          suggestionCount: insertedSuggestions.length,
          threshold,
        },
      });

      return {
        suggestions: insertedSuggestions,
      };
    });
  }

  /**
   * Get pending table suggestions for an attachment
   */
  async listSuggestions(attachmentId: string, userId: string) {
    // 1. Verify ownership
    const [attachment] = await this.dbs.db
      .select({
        attachment: attachments,
        todo: todos,
      })
      .from(attachments)
      .leftJoin(todos, eq(attachments.todoId, todos.id))
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!attachment || !attachment.todo) {
      throw new NotFoundException('Attachment not found');
    }

    if (attachment.todo.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // 2. Get pending suggestions
    const suggestions = await this.dbs.db
      .select()
      .from(mlTableSuggestions)
      .where(
        and(
          eq(mlTableSuggestions.attachmentId, attachmentId),
          eq(mlTableSuggestions.status, 'pending'),
        ),
      )
      .orderBy(desc(mlTableSuggestions.suggestedAt));

    return suggestions;
  }

  /**
   * Ignore a suggestion (mark as ignored)
   */
  async ignoreSuggestion(options: IgnoreSuggestionOptions) {
    const { suggestionId, userId } = options;

    return await this.dbs.db.transaction(async (tx) => {
      // 1. Verify suggestion exists and user owns it
      const [suggestion] = await tx
        .select({
          suggestion: mlTableSuggestions,
          attachment: attachments,
          todo: todos,
        })
        .from(mlTableSuggestions)
        .leftJoin(
          attachments,
          eq(mlTableSuggestions.attachmentId, attachments.id),
        )
        .leftJoin(todos, eq(attachments.todoId, todos.id))
        .where(eq(mlTableSuggestions.id, suggestionId))
        .limit(1);

      if (!suggestion || !suggestion.attachment || !suggestion.todo) {
        throw new NotFoundException('Suggestion not found');
      }

      if (suggestion.todo.userId !== userId) {
        throw new ForbiddenException('Access denied');
      }

      // 2. Update status to ignored
      const [updated] = await tx
        .update(mlTableSuggestions)
        .set({
          status: 'ignored',
          ignoredAt: new Date(),
        })
        .where(eq(mlTableSuggestions.id, suggestionId))
        .returning();

      // 3. Audit log
      await this.auditService.log({
        userId,
        action: 'ml.table.ignore',
        module: 'ml',
        resourceType: 'ml_table_suggestion',
        resourceId: suggestionId,
        details: {
          attachmentId: suggestion.suggestion.attachmentId,
          suggestionId,
        },
      });

      return { success: true, suggestion: updated };
    });
  }

  /**
   * Convert a suggestion into a baseline table
   * Returns the new table ID for frontend redirection
   */
  async convertSuggestion(options: ConvertSuggestionOptions) {
    const { suggestionId, userId } = options;

    return await this.dbs.db.transaction(async (tx) => {
      // 1. Verify suggestion exists and user owns it
      const [suggestionRow] = await tx
        .select({
          suggestion: mlTableSuggestions,
          attachment: attachments,
          todo: todos,
        })
        .from(mlTableSuggestions)
        .leftJoin(
          attachments,
          eq(mlTableSuggestions.attachmentId, attachments.id),
        )
        .leftJoin(todos, eq(attachments.todoId, todos.id))
        .where(eq(mlTableSuggestions.id, suggestionId))
        .limit(1);

      if (!suggestionRow || !suggestionRow.attachment || !suggestionRow.todo) {
        throw new NotFoundException('Suggestion not found');
      }

      if (suggestionRow.todo.userId !== userId) {
        throw new ForbiddenException('Access denied');
      }

      const suggestion = suggestionRow.suggestion;

      // 2. Check suggestion is pending
      if (suggestion.status !== 'pending') {
        throw new BadRequestException(
          `Cannot convert suggestion with status: ${suggestion.status}`,
        );
      }

      // 3. Get baseline (must be draft or reviewed)
      const [baseline] = await tx
        .select()
        .from(extractionBaselines)
        .where(
          and(
            eq(extractionBaselines.attachmentId, suggestion.attachmentId),
            inArray(extractionBaselines.status, ['draft', 'reviewed']),
          ),
        )
        .orderBy(desc(extractionBaselines.createdAt))
        .limit(1);

      if (!baseline) {
        throw new NotFoundException('No baseline found for attachment');
      }

      if (baseline.utilizedAt) {
        throw new ForbiddenException('Baseline is locked due to utilization');
      }

      // 4. Extract cell values from cellMapping
      const cellMapping = suggestion.cellMapping as any[];
      if (!Array.isArray(cellMapping) || cellMapping.length === 0) {
        throw new BadRequestException('Invalid cell mapping in suggestion');
      }

      // Build 2D array for table creation
      const rowCount = suggestion.rowCount;
      const columnCount = suggestion.columnCount;
      const cellValues: string[][] = Array.from({ length: rowCount }, () =>
        Array(columnCount).fill(''),
      );

      for (const cell of cellMapping) {
        const { rowIndex, columnIndex, text } = cell;
        if (
          rowIndex >= 0 &&
          rowIndex < rowCount &&
          columnIndex >= 0 &&
          columnIndex < columnCount
        ) {
          cellValues[rowIndex][columnIndex] = text || '';
        }
      }

      // 5. Mark suggestion as converted
      await tx
        .update(mlTableSuggestions)
        .set({
          status: 'converted',
          convertedAt: new Date(),
        })
        .where(eq(mlTableSuggestions.id, suggestionId));

      // 6. Audit log
      await this.auditService.log({
        userId,
        action: 'ml.table.convert',
        module: 'ml',
        resourceType: 'ml_table_suggestion',
        resourceId: suggestionId,
        details: {
          attachmentId: suggestion.attachmentId,
          baselineId: baseline.id,
          suggestionId,
          rowCount,
          columnCount,
        },
      });

      // 7. Return conversion info (table creation will be handled by caller)
      return {
        success: true,
        baselineId: baseline.id,
        cellValues,
        label: suggestion.suggestedLabel || `Table`,
      };
    });
  }
}
