import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import {
  attachmentOcrOutputs,
  baselineFieldAssignments,
  extractedTextSegments,
  extractionBaselines,
  ocrResults,
  baselineTables,
} from '../db/schema';
import { fieldLibrary } from '../field-library/schema';
import { eq, and, desc } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { Baseline } from '../common/types';
import { RagEmbeddingService } from '../ml/rag-embedding.service';
import { OcrService } from '../ocr/ocr.service';
import { OcrParsingService } from '../ocr/ocr-parsing.service';
import { OcrCorrectionsService } from '../ocr/ocr-corrections.service';

/**
 * BaselineManagementService
 *
 * Implements the authoritative lifecycle logic for extraction baselines.
 * This is backend service-layer logic only (no controllers/endpoints yet).
 *
 * Lifecycle: draft → reviewed → confirmed → archived
 *
 * All transitions are validated and enforced centrally.
 * Confirmation is transactional and auto-archives previous confirmed baselines.
 */
@Injectable()
export class BaselineManagementService {
  private readonly logger = new Logger(BaselineManagementService.name);
  private readonly ragEmbeddingService: RagEmbeddingService;
  private readonly ocrService: OcrService;

  constructor(
    private readonly dbs: DbService,
    private readonly auditService: AuditService,
  ) {
    this.ragEmbeddingService = new RagEmbeddingService(
      this.dbs,
      this.auditService,
    );
    const ocrParsingService = new OcrParsingService(this.dbs);
    const ocrCorrectionsService = new OcrCorrectionsService(
      this.dbs,
      this.auditService,
    );
    this.ocrService = new OcrService(
      this.dbs,
      this.auditService,
      ocrParsingService,
      ocrCorrectionsService,
    );
  }

  /**
   * Create a new draft baseline
   *
   * @param attachmentId - ID of the attachment this baseline belongs to
   * @param userId - ID of the user creating the baseline
   * @returns The created baseline record
   *
   * Behavior:
   * - Creates baseline with status = 'draft'
   * - Does NOT auto-archive existing baselines
   * - Multiple drafts allowed (until confirmation rules apply later)
   */
  async createDraftBaseline(
    attachmentId: string,
    userId: string,
  ): Promise<Baseline> {
    // 1. Create baseline record
    const [baseline] = await this.dbs.db
      .insert(extractionBaselines)
      .values({
        attachmentId,
        status: 'draft',
        createdAt: new Date(),
      })
      .returning();

    // 2. Fetch current OCR Output
    const [currentOcr] = await this.dbs.db
      .select()
      .from(attachmentOcrOutputs)
      .where(
        and(
          eq(attachmentOcrOutputs.attachmentId, attachmentId),
          eq(attachmentOcrOutputs.isCurrent, true),
        ),
      )
      .orderBy(desc(attachmentOcrOutputs.createdAt))
      .limit(1);

    if (currentOcr) {
      // 3. Ensure segments exist for this OCR output
      const existingSegments = await this.dbs.db
        .select()
        .from(extractedTextSegments)
        .where(eq(extractedTextSegments.attachmentOcrOutputId, currentOcr.id))
        .limit(1);

      if (existingSegments.length === 0 && currentOcr.extractedText) {
        const lines = currentOcr.extractedText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length > 0) {
          await this.dbs.db.insert(extractedTextSegments).values(
            lines.map((text) => ({
              attachmentOcrOutputId: currentOcr.id,
              text,
              pageNumber: 1,
            })),
          );
        }
      }

      // 4. Populate assignments from parsed fields if they match library fields
      const results = await this.dbs.db
        .select()
        .from(ocrResults)
        .where(eq(ocrResults.attachmentOcrOutputId, currentOcr.id));

      if (results.length > 0) {
        const activeLibraryFields = await this.dbs.db
          .select()
          .from(fieldLibrary)
          .where(eq(fieldLibrary.status, 'active'));

        const validKeys = new Set(activeLibraryFields.map((f) => f.fieldKey));

        const assignmentsToInsert = results
          .filter((r) => validKeys.has(r.fieldName))
          .map((r) => ({
            baselineId: baseline.id,
            fieldKey: r.fieldName,
            assignedValue: r.fieldValue,
            assignedBy: userId,
          }));

        if (assignmentsToInsert.length > 0) {
          await this.dbs.db
            .insert(baselineFieldAssignments)
            .values(assignmentsToInsert)
            .onConflictDoNothing();
        }
      }
    }

    // Audit log
    await this.auditService.log({
      userId,
      action: 'baseline.create' as any,
      module: 'baseline' as any,
      resourceType: 'baseline',
      resourceId: baseline.id,
      details: {
        attachmentId,
        status: 'draft',
      },
    });

    return baseline;
  }

  /**
   * Mark a baseline as reviewed
   *
   * @param baselineId - ID of the baseline to mark as reviewed
   * @param userId - ID of the user performing the action
   * @returns The updated baseline record
   *
   * Valid only when:
   * - current status = 'draft'
   *
   * Behavior:
   * - status → 'reviewed'
   * - No locking yet
   * - Still editable
   *
   * Errors:
   * - 400 if status ≠ 'draft'
   * - 404 if baseline not found
   */
  async markReviewed(baselineId: string, userId: string): Promise<Baseline> {
    // Fetch current baseline
    const [existing] = await this.dbs.db
      .select()
      .from(extractionBaselines)
      .where(eq(extractionBaselines.id, baselineId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Baseline not found');
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException(
        `Cannot mark as reviewed: baseline status is '${existing.status}', expected 'draft'`,
      );
    }

    // Update to reviewed
    const [updated] = await this.dbs.db
      .update(extractionBaselines)
      .set({ status: 'reviewed' })
      .where(eq(extractionBaselines.id, baselineId))
      .returning();

    // Audit log
    await this.auditService.log({
      userId,
      action: 'baseline.review' as any,
      module: 'baseline' as any,
      resourceType: 'baseline',
      resourceId: baselineId,
      details: {
        attachmentId: existing.attachmentId,
        beforeStatus: 'draft',
        afterStatus: 'reviewed',
      },
    });

    return updated;
  }

  /**
   * Confirm a baseline (TRANSACTIONAL)
   *
   * @param baselineId - ID of the baseline to confirm
   * @param userId - ID of the user performing the action
   * @returns The confirmed baseline record
   *
   * Valid only when:
   * - current status = 'reviewed'
   *
   * Behavior (MUST be atomic):
   * 1. Set target baseline:
   *    - status → 'confirmed'
   *    - confirmedAt = now()
   *    - confirmedBy = userId
   * 2. Find any existing confirmed baseline for the same attachment
   * 3. If found:
   *    - status → 'archived'
   *    - archivedAt = now()
   *    - archivedBy = userId
   *
   * The database constraint guarantees only one confirmed baseline.
   *
   * Errors:
   * - 400 if status ≠ 'reviewed'
   * - 404 if baseline not found
   */
  async confirmBaseline(baselineId: string, userId: string): Promise<Baseline> {
    // Run inside a transaction
    const confirmed = await this.dbs.db.transaction(async (tx) => {
      // 1. Fetch current baseline
      const [existing] = await tx
        .select()
        .from(extractionBaselines)
        .where(eq(extractionBaselines.id, baselineId))
        .limit(1);

      if (!existing) {
        throw new NotFoundException('Baseline not found');
      }

      if (existing.status !== 'reviewed') {
        throw new BadRequestException(
          `Cannot confirm: baseline status is '${existing.status}', expected 'reviewed'`,
        );
      }

      // Check for unconfirmed tables
      const draftTables = await tx
        .select({ id: baselineTables.id })
        .from(baselineTables)
        .where(
          and(
            eq(baselineTables.baselineId, baselineId),
            eq(baselineTables.status, 'draft'),
          ),
        )
        .limit(1);

      if (draftTables.length > 0) {
        throw new BadRequestException(
          'Cannot confirm baseline: all tables must be confirmed first',
        );
      }

      // 2. Find any existing confirmed baseline for the same attachment
      const [previousConfirmed] = await tx
        .select()
        .from(extractionBaselines)
        .where(
          and(
            eq(extractionBaselines.attachmentId, existing.attachmentId),
            eq(extractionBaselines.status, 'confirmed'),
          ),
        )
        .limit(1);

      // 3. Archive previous confirmed baseline if found
      if (previousConfirmed) {
        await tx
          .update(extractionBaselines)
          .set({
            status: 'archived',
            archivedAt: new Date(),
            archivedBy: userId,
          })
          .where(eq(extractionBaselines.id, previousConfirmed.id));

        // Audit log for archiving previous baseline
        await this.auditService.log({
          userId,
          action: 'baseline.archive' as any,
          module: 'baseline' as any,
          resourceType: 'baseline',
          resourceId: previousConfirmed.id,
          details: {
            attachmentId: existing.attachmentId,
            beforeStatus: 'confirmed',
            afterStatus: 'archived',
            reason: 'Auto-archived due to new baseline confirmation',
          },
        });
      }

      // 4. Confirm the target baseline
      const [confirmed] = await tx
        .update(extractionBaselines)
        .set({
          status: 'confirmed',
          confirmedAt: new Date(),
          confirmedBy: userId,
        })
        .where(eq(extractionBaselines.id, baselineId))
        .returning();

      // 5. Get counts for audit log
      const activeFields = await tx
        .select()
        .from(fieldLibrary)
        .where(eq(fieldLibrary.status, 'active'));

      const assignments = await tx
        .select()
        .from(baselineFieldAssignments)
        .where(eq(baselineFieldAssignments.baselineId, baselineId));

      const assignedCount = activeFields.filter((f) =>
        assignments.some(
          (a) => a.fieldKey === f.fieldKey && a.assignedValue !== null,
        ),
      ).length;
      const emptyCount = activeFields.length - assignedCount;

      // Audit log for confirmation
      await this.auditService.log({
        userId,
        action: 'baseline.confirm' as any,
        module: 'baseline' as any,
        resourceType: 'baseline',
        resourceId: baselineId,
        details: {
          attachmentId: existing.attachmentId,
          beforeStatus: 'reviewed',
          afterStatus: 'confirmed',
          previousConfirmedId: previousConfirmed?.id || null,
          assignedCount,
          emptyCount,
        },
      });

      return confirmed;
    });

    // M1: non-blocking embed-on-confirm learning loop
    void this.ragEmbeddingService.embedOnConfirm(baselineId).catch((error) => {
      const message =
        error instanceof Error ? error.message : 'unknown embedding error';
      this.logger.error(
        `rag.embed.error baselineId=${baselineId} message=${message}`,
      );
    });

    try {
      const confirmedOcr = await this.ocrService.getCurrentConfirmedOcr(
        confirmed.attachmentId,
      );
      const fallbackDraftOcr = confirmedOcr
        ? null
        : await this.ocrService.getCurrentOcr(confirmed.attachmentId);
      const ocrIdToLock = confirmedOcr?.id ?? fallbackDraftOcr?.id ?? null;

      if (ocrIdToLock) {
        await this.ocrService.markOcrUtilized(
          ocrIdToLock,
          'authoritative_record',
          {
            baselineId,
            userId,
          },
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown ocr lock error';
      this.logger.error(
        `ocr.lock.error baselineId=${baselineId} message=${message}`,
      );
    }

    return confirmed;
  }

  /**
   * Archive a baseline
   *
   * @param baselineId - ID of the baseline to archive
   * @param userId - ID of the user performing the action
   * @param reason - Optional reason for archiving (not stored yet, future audit expansion)
   * @returns The archived baseline record
   *
   * Valid only when:
   * - status = 'confirmed'
   *
   * Behavior:
   * - status → 'archived'
   * - archivedAt / archivedBy set
   * - Reason parameter accepted but NOT stored yet (future audit expansion)
   *
   * Errors:
   * - 400 if status ≠ 'confirmed'
   * - 404 if baseline not found
   */
  async archiveBaseline(
    baselineId: string,
    userId: string,
    reason?: string,
  ): Promise<Baseline> {
    // Fetch current baseline
    const [existing] = await this.dbs.db
      .select()
      .from(extractionBaselines)
      .where(eq(extractionBaselines.id, baselineId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Baseline not found');
    }

    if (existing.status !== 'confirmed') {
      throw new BadRequestException(
        `Cannot archive: baseline status is '${existing.status}', expected 'confirmed'`,
      );
    }

    // Update to archived
    const [archived] = await this.dbs.db
      .update(extractionBaselines)
      .set({
        status: 'archived',
        archivedAt: new Date(),
        archivedBy: userId,
      })
      .where(eq(extractionBaselines.id, baselineId))
      .returning();

    // Audit log
    await this.auditService.log({
      userId,
      action: 'baseline.archive' as any,
      module: 'baseline' as any,
      resourceType: 'baseline',
      resourceId: baselineId,
      details: {
        attachmentId: existing.attachmentId,
        beforeStatus: 'confirmed',
        afterStatus: 'archived',
        reason: reason || null,
      },
    });

    return archived;
  }

  /**
   * Mark a baseline as utilized (First-write-wins)
   *
   * @param baselineId - ID of the baseline to mark as utilized
   * @param type - Type of utilization (record_created, process_committed, data_exported)
   * @param userId - ID of the user performing the action
   * @param metadata - Optional metadata about the utilization
   * @returns The updated baseline record
   *
   * - First-write-wins: If utilizedAt is already set, does nothing and returns existing record.
   * - Only confirmed baselines can be utilized.
   * - If metadata.tableId is provided, enriches metadata with table context (label, rowCount, columnCount).
   */
  async markBaselineUtilized(
    baselineId: string,
    type: 'record_created' | 'process_committed' | 'data_exported',
    userId: string,
    metadata?: Record<string, unknown>,
  ): Promise<Baseline> {
    return await this.dbs.db.transaction(async (tx) => {
      // 1. Fetch current baseline
      const [existing] = await tx
        .select()
        .from(extractionBaselines)
        .where(eq(extractionBaselines.id, baselineId))
        .limit(1);

      if (!existing) {
        throw new NotFoundException('Baseline not found');
      }

      // 2. First-write-wins: if already utilized, return existing
      if (existing.utilizedAt) {
        return existing;
      }

      // 3. Validation: only confirmed baselines can be utilized
      if (existing.status !== 'confirmed') {
        throw new BadRequestException(
          `Cannot mark as utilized: baseline status is '${existing.status}', expected 'confirmed'`,
        );
      }

      // 4. Enrich metadata with table context if tableId provided
      const finalMetadata = { ...(metadata || {}) };
      const tableId = finalMetadata.tableId as string;

      if (tableId) {
        const [table] = await tx
          .select()
          .from(baselineTables)
          .where(eq(baselineTables.id, tableId))
          .limit(1);

        if (table) {
          Object.assign(finalMetadata, {
            tableLabel: table.tableLabel,
            rowCount: table.rowCount,
            columnCount: table.columnCount,
          });
        }
      }

      // 5. Update utilization fields
      const [updated] = await tx
        .update(extractionBaselines)
        .set({
          utilizedAt: new Date(),
          utilizationType: type,
          utilizationMetadata: finalMetadata,
        })
        .where(eq(extractionBaselines.id, baselineId))
        .returning();

      // 6. Audit Log
      // Map type to audit action (plan specific naming)
      const actionMap: Record<string, string> = {
        record_created: 'baseline.utilized.record_created',
        process_committed: 'baseline.utilized.workflow_committed',
        data_exported: 'baseline.utilized.data_exported',
      };

      await this.auditService.log({
        userId,
        action:
          (actionMap[type] as any) || (`baseline.utilized.${type}` as any),
        module: 'baseline' as any,
        resourceType: 'baseline',
        resourceId: baselineId,
        details: {
          attachmentId: existing.attachmentId,
          utilizationType: type,
          utilizedAt: updated.utilizedAt,
          metadata: finalMetadata,
        },
      });

      return updated;
    });
  }
}
