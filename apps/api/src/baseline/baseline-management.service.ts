import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { extractionBaselines } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';

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
    constructor(
        private readonly dbs: DbService,
        private readonly auditService: AuditService,
    ) { }

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
    ): Promise<any> {
        const [baseline] = await this.dbs.db
            .insert(extractionBaselines)
            .values({
                attachmentId,
                status: 'draft',
                createdAt: new Date(),
            })
            .returning();

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
    async markReviewed(baselineId: string, userId: string): Promise<any> {
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
    async confirmBaseline(baselineId: string, userId: string): Promise<any> {
        // Run inside a transaction
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

            if (existing.status !== 'reviewed') {
                throw new BadRequestException(
                    `Cannot confirm: baseline status is '${existing.status}', expected 'reviewed'`,
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
                },
            });

            return confirmed;
        });
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
    ): Promise<any> {
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
}
