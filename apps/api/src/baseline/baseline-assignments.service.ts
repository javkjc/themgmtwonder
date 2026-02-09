import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { and, eq, desc } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
    attachmentOcrOutputs,
    attachments,
    baselineFieldAssignments,
    extractedTextSegments,
    extractionBaselines,
    ocrResults,
    todos,
} from '../db/schema';
import { fieldLibrary } from '../field-library/schema';
import { AuditService } from '../audit/audit.service';
import { FieldAssignmentValidatorService } from './field-assignment-validator.service';
import { FieldLibraryService } from '../field-library/field-library.service';
import { AssignBaselineFieldDto } from './dto/assign-baseline-field.dto';

type BaselineContext = {
    id: string;
    attachmentId: string;
    status: string;
    utilizationType: string | null;
    utilizedAt: Date | null;
    ownerId: string;
};

type BoundingBox = { x: number; y: number; width: number; height: number };

@Injectable()
export class BaselineAssignmentsService {
    constructor(
        private readonly dbs: DbService,
        private readonly auditService: AuditService,
        private readonly validator: FieldAssignmentValidatorService,
        private readonly fieldLibraryService: FieldLibraryService,
    ) { }

    async getAggregatedBaseline(attachmentId: string, userId: string) {
        await this.ensureUserOwnsAttachment(userId, attachmentId);

        // 1. Find Latest Non-Archived Baseline
        // After re-retrieval, a new draft is created while confirmed baseline may still exist.
        // We want the LATEST non-archived baseline (most recent createdAt) for the review page.
        const allBaselines = await this.dbs.db
            .select()
            .from(extractionBaselines)
            .where(eq(extractionBaselines.attachmentId, attachmentId))
            .orderBy(desc(extractionBaselines.createdAt))
            .limit(10);

        // Find first non-archived baseline (will be the most recent)
        const baselineRecord = allBaselines.find(b => b.status !== 'archived');

        if (!baselineRecord) {
            return null;
        }

        // 2. Fetch Assignments
        const assignments = await this.listAssignments(baselineRecord.id, userId);

        // 3. Find Current OCR Output & Segments
        const [currentOcr] = await this.dbs.db
            .select()
            .from(attachmentOcrOutputs)
            .where(
                and(
                    eq(attachmentOcrOutputs.attachmentId, attachmentId),
                    eq(attachmentOcrOutputs.isCurrent, true),
                ),
            )
            .limit(1);

        let segments: any[] = [];
        if (currentOcr) {
            segments = await this.dbs.db
                .select()
                .from(extractedTextSegments)
                .where(eq(extractedTextSegments.attachmentOcrOutputId, currentOcr.id))
                .orderBy(extractedTextSegments.pageNumber, extractedTextSegments.createdAt);

            segments = segments.map((segment) => ({
                ...segment,
                confidence:
                    segment.confidence === null || segment.confidence === undefined
                        ? null
                        : Number(segment.confidence),
                boundingBox: segment.boundingBox as BoundingBox | null,
                pageNumber: segment.pageNumber ?? 1,
            }));

            if (!segments.length && (currentOcr.extractedText ?? '').trim()) {
                segments = await this.backfillSegmentsFromText(
                    currentOcr.id,
                    currentOcr.extractedText ?? '',
                );
            }

            // Fallback: If assignments are empty and this is a draft, try to backfill from OCR results
            if (baselineRecord.status === 'draft' && assignments.length === 0) {
                const backfilled = await this.backfillAssignmentsFromOcrResults(
                    currentOcr.id,
                    baselineRecord.id,
                    userId,
                );
                if (backfilled.length > 0) {
                    assignments.push(...backfilled);
                }
            }
        }

        return {
            ...baselineRecord,
            assignments,
            segments,
            currentOcrId: currentOcr?.id || null,
        };
    }

    async listAssignments(baselineId: string, userId: string) {
        await this.ensureBaselineOwnership(baselineId, userId);

        const rows = await this.dbs.db
            .select({
                id: baselineFieldAssignments.id,
                fieldKey: baselineFieldAssignments.fieldKey,
                assignedValue: baselineFieldAssignments.assignedValue,
                sourceSegmentId: baselineFieldAssignments.sourceSegmentId,
                assignedBy: baselineFieldAssignments.assignedBy,
                assignedAt: baselineFieldAssignments.assignedAt,
                correctedFrom: baselineFieldAssignments.correctedFrom,
                correctionReason: baselineFieldAssignments.correctionReason,
                validationValid: baselineFieldAssignments.validationValid,
                validationError: baselineFieldAssignments.validationError,
                validationSuggestion: baselineFieldAssignments.validationSuggestion,
            })
            .from(baselineFieldAssignments)
            .where(eq(baselineFieldAssignments.baselineId, baselineId));

        return rows.map(row => ({
            ...row,
            validation: row.validationValid !== null ? {
                valid: row.validationValid,
                error: row.validationError ?? undefined,
                suggestedCorrection: row.validationSuggestion ?? undefined,
            } : undefined,
        }));
    }

    async upsertAssignment(
        baselineId: string,
        dto: AssignBaselineFieldDto,
        userId: string,
    ) {
        const context = await this.ensureBaselineEditable(baselineId, userId);
        const field = await this.fieldLibraryService.getFieldByKey(dto.fieldKey);

        const validation = this.validator.validate(
            field.characterType,
            dto.assignedValue,
            field.characterLimit,
        );

        // If validation fails and user hasn't confirmed, require explicit confirmation
        if (!validation.valid && !dto.confirmInvalid) {
            throw new BadRequestException({
                message: 'Validation failed - explicit confirmation required',
                validation,
                requiresConfirmation: true,
            });
        }

        // Auto-normalize valid values that have suggestions (dates and decimals)
        const normalizedValue = validation.valid && validation.suggestedCorrection
            ? validation.suggestedCorrection
            : dto.assignedValue;

        const [existing] = await this.dbs.db
            .select()
            .from(baselineFieldAssignments)
            .where(
                and(
                    eq(baselineFieldAssignments.baselineId, baselineId),
                    eq(baselineFieldAssignments.fieldKey, dto.fieldKey),
                ),
            )
            .limit(1);

        const providedReason = dto.correctionReason?.trim();
        const isOverwrite = !!existing;

        if (context.status === 'reviewed' && isOverwrite) {
            if (!providedReason || providedReason.length < 10) {
                throw new BadRequestException(
                    'correctionReason (min 10 chars) is required when overwriting an assignment in reviewed status',
                );
            }
        } else if (providedReason && providedReason.length < 10) {
            throw new BadRequestException(
                'correctionReason must be at least 10 characters when provided',
            );
        }

        const correctedFromValue = isOverwrite ? existing?.assignedValue ?? null : null;
        const correctionReasonValue =
            (context.status === 'reviewed' && (isOverwrite || providedReason))
                ? providedReason ?? null
                : providedReason ?? null;

        const [assignment] = await this.dbs.db
            .insert(baselineFieldAssignments)
            .values({
                baselineId,
                fieldKey: dto.fieldKey,
                assignedValue: normalizedValue ?? null,
                sourceSegmentId: dto.sourceSegmentId ?? null,
                assignedBy: userId,
                assignedAt: new Date(),
                correctedFrom: correctedFromValue,
                correctionReason: correctionReasonValue,
                validationValid: validation.valid,
                validationError: validation.error ?? null,
                validationSuggestion: validation.suggestedCorrection ?? null,
            })
            .onConflictDoUpdate({
                target: [baselineFieldAssignments.baselineId, baselineFieldAssignments.fieldKey],
                set: {
                    assignedValue: normalizedValue ?? null,
                    sourceSegmentId: dto.sourceSegmentId ?? null,
                    assignedBy: userId,
                    assignedAt: new Date(),
                    correctedFrom: correctedFromValue,
                    correctionReason: correctionReasonValue,
                    validationValid: validation.valid,
                    validationError: validation.error ?? null,
                    validationSuggestion: validation.suggestedCorrection ?? null,
                },
            })
            .returning();

        await this.auditService.log({
            userId,
            action: 'baseline.assignment.upsert',
            module: 'baseline',
            resourceType: 'baseline_assignment',
            resourceId: assignment.id,
            details: {
                baselineId,
                fieldKey: assignment.fieldKey,
                assignedBy: userId,
                correctedFrom: assignment.correctedFrom,
                correctionReason: assignment.correctionReason,
            },
        });

        return { assignment, validation };
    }

    async deleteAssignment(
        baselineId: string,
        fieldKey: string,
        userId: string,
        correctionReason?: string | null,
    ) {
        const context = await this.ensureBaselineEditable(baselineId, userId);

        const [existing] = await this.dbs.db
            .select()
            .from(baselineFieldAssignments)
            .where(
                and(
                    eq(baselineFieldAssignments.baselineId, baselineId),
                    eq(baselineFieldAssignments.fieldKey, fieldKey),
                ),
            )
            .limit(1);

        if (!existing) {
            throw new NotFoundException('Assignment not found');
        }

        const trimmedReason = correctionReason?.trim();
        if (context.status === 'reviewed') {
            if (!trimmedReason || trimmedReason.length < 10) {
                throw new BadRequestException(
                    'correctionReason (min 10 chars) is required to delete an assignment in reviewed status',
                );
            }
        } else if (trimmedReason && trimmedReason.length < 10) {
            throw new BadRequestException(
                'correctionReason must be at least 10 characters when provided',
            );
        }

        await this.dbs.db
            .delete(baselineFieldAssignments)
            .where(
                and(
                    eq(baselineFieldAssignments.baselineId, baselineId),
                    eq(baselineFieldAssignments.fieldKey, fieldKey),
                ),
            );

        await this.auditService.log({
            userId,
            action: 'baseline.assignment.delete',
            module: 'baseline',
            resourceType: 'baseline_assignment',
            resourceId: existing.id,
            details: {
                baselineId,
                fieldKey,
                assignedBy: userId,
                correctedFrom: existing.assignedValue ?? null,
                correctionReason: trimmedReason ?? null,
            },
        });

        return { deleted: true };
    }

    private async ensureBaselineEditable(baselineId: string, userId: string): Promise<BaselineContext> {
        const context = await this.ensureBaselineOwnership(baselineId, userId);

        if (context.status === 'archived') {
            throw new BadRequestException('Cannot modify an archived baseline');
        }

        if (context.utilizationType || context.utilizedAt) {
            await this.auditService.log({
                userId,
                action: 'baseline.assignment.denied',
                module: 'baseline',
                resourceType: 'baseline',
                resourceId: baselineId,
                details: {
                    reason: 'utilized',
                    utilizationType: context.utilizationType,
                },
            });
            throw new ForbiddenException('Baseline has been utilized and cannot be modified');
        }

        return context;
    }

    private async ensureBaselineOwnership(baselineId: string, userId: string): Promise<BaselineContext> {
        const [record] = await this.dbs.db
            .select({
                id: extractionBaselines.id,
                attachmentId: extractionBaselines.attachmentId,
                status: extractionBaselines.status,
                utilizationType: extractionBaselines.utilizationType,
                utilizedAt: extractionBaselines.utilizedAt,
                ownerId: todos.userId,
            })
            .from(extractionBaselines)
            .innerJoin(attachments, eq(attachments.id, extractionBaselines.attachmentId))
            .innerJoin(todos, eq(todos.id, attachments.todoId))
            .where(eq(extractionBaselines.id, baselineId))
            .limit(1);

        if (!record) {
            throw new NotFoundException('Baseline not found');
        }

        if (record.ownerId !== userId) {
            throw new ForbiddenException('Access denied for baseline');
        }

        return record as BaselineContext;
    }
    private async ensureUserOwnsAttachment(userId: string, attachmentId: string) {
        const [attachment] = await this.dbs.db
            .select()
            .from(attachments)
            .where(eq(attachments.id, attachmentId))
            .limit(1);

        if (!attachment) {
            throw new NotFoundException('Attachment not found');
        }

        const [todo] = await this.dbs.db
            .select()
            .from(todos)
            .where(and(eq(todos.id, attachment.todoId), eq(todos.userId, userId)))
            .limit(1);

        if (!todo) {
            throw new ForbiddenException('Access denied for attachment');
        }

        return attachment;
    }

    private async backfillSegmentsFromText(
        attachmentOcrOutputId: string,
        extractedText: string,
    ) {
        const lines = extractedText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (!lines.length) {
            return [];
        }

        const rows = await this.dbs.db.insert(extractedTextSegments).values(
            lines.map((text) => ({
                attachmentOcrOutputId,
                text,
                confidence: null,
                boundingBox: null,
                pageNumber: 1,
                createdAt: new Date(),
            })),
        ).returning();

        return rows;
    }
    private async backfillAssignmentsFromOcrResults(
        attachmentOcrOutputId: string,
        baselineId: string,
        userId: string,
    ) {
        const results = await this.dbs.db
            .select()
            .from(ocrResults)
            .where(eq(ocrResults.attachmentOcrOutputId, attachmentOcrOutputId));

        if (results.length === 0) return [];

        const libraryFields = await this.dbs.db
            .select()
            .from(fieldLibrary)
            .where(eq(fieldLibrary.status, 'active'));

        const validKeys = new Set(libraryFields.map((f) => f.fieldKey));

        const toInsert = results
            .filter((r) => validKeys.has(r.fieldName))
            .map((r) => ({
                baselineId,
                fieldKey: r.fieldName,
                assignedValue: r.fieldValue,
                assignedBy: userId,
            }));

        if (toInsert.length === 0) return [];

        await this.dbs.db
            .insert(baselineFieldAssignments)
            .values(toInsert)
            .onConflictDoNothing();

        // Refresh assignments list
        return this.listAssignments(baselineId, userId);
    }
}
