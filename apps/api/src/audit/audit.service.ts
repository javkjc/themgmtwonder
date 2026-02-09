import { ForbiddenException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { auditLogs, users, todos } from '../db/schema';
import { desc, eq, and, gte, lte, ilike } from 'drizzle-orm';

export type AuditActorType = 'user' | 'system';

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.register'
  | 'auth.password_change'
  | 'auth.password_reset'
  | 'admin.toggle_admin'
  | 'user.role.grant'
  | 'user.role.revoke'
  | 'todo.create'
  | 'todo.update'
  | 'todo.stage_change'
  | 'todo.delete'
  | 'todo.delete_child'
  | 'todo.schedule'
  | 'todo.unschedule'
  | 'todo.bulk_update'
  | 'todo.bulk_delete'
  | 'todo.associate'
  | 'todo.disassociate'
  | 'category.create'
  | 'category.update'
  | 'category.delete'
  | 'settings.update'
  | 'settings.duration.update'
  | 'admin.reset_password'
  | 'remark.create'
  | 'remark.delete'
  | 'attachment.upload'
  | 'attachment.delete'
  | 'OCR_REQUESTED'
  | 'OCR_SUCCEEDED'
  | 'OCR_DRAFT_CREATED'
  | 'OCR_CONFIRMED'
  | 'OCR_FAILED'
  | 'ocr.apply.remark'
  | 'ocr.apply.description'
  | 'process.start'
  | 'process.step_action'
  | 'process.create'
  | 'process.update'
  | 'process.create_version'
  | 'process.activate'
  | 'process.deactivate'
  | 'process.element_template.create'
  | 'process.element_template.create_version'
  | 'process.element_template.update'
  | 'process.element_template.deprecate'
  | 'ocr.field_corrected'
  | 'OCR_ARCHIVED'
  | 'OCR_REDO_BLOCKED'
  | 'OCR_REDO_ALLOWED'
  | 'ocr.field_added_manually'
  | 'ocr.field_deleted_manually'
  | 'OCR_UTILIZED_RECORD'
  | 'OCR_UTILIZED_HUMAN_APPROVAL'
  | 'OCR_UTILIZED_EXPORT'
  | 'field_library.create'
  | 'field_library.update'
  | 'field_library.hide'
  | 'field_library.unhide'
  | 'field_library.archive'
  | 'baseline.create'
  | 'baseline.review'
  | 'baseline.confirm'
  | 'baseline.archive'
  | 'baseline.assignment.upsert'
  | 'baseline.assignment.delete'
  | 'baseline.assignment.denied'
  | 'baseline.utilized.record_created'
  | 'baseline.utilized.workflow_committed'
  | 'baseline.utilized.data_exported';

export type AuditModule =
  | 'auth'
  | 'task'
  | 'remark'
  | 'attachment'
  | 'category'
  | 'settings'
  | 'admin'
  | 'process'
  | 'field_library'
  | 'baseline';

export type CreateAuditLogDto = {
  userId?: string | null;
  actorType?: AuditActorType;
  action: AuditAction;
  module?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type ListAuditLogsQuery = {
  limit?: number;
  offset?: number;
  action?: string;
  startDate?: string;
  endDate?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly dbs: DbService) { }

  async log(dto: CreateAuditLogDto) {
    try {
      await this.dbs.db.insert(auditLogs).values({
        userId: dto.userId || null,
        actorType: dto.actorType || 'user',
        action: dto.action,
        module: dto.module || null,
        resourceType: dto.resourceType || null,
        resourceId: dto.resourceId || null,
        details: dto.details ? JSON.stringify(dto.details) : null,
        ipAddress: dto.ipAddress || null,
        userAgent: dto.userAgent || null,
      });
    } catch (e) {
      // Don't fail the main operation if audit logging fails
      console.error('Failed to write audit log:', e);
    }
  }

  async list(userId: string, query: ListAuditLogsQuery = {}) {
    const { limit = 50, offset = 0, action, startDate, endDate } = query;

    const conditions: any[] = [eq(auditLogs.userId, userId)];

    if (action) {
      conditions.push(ilike(auditLogs.action, `%${action}%`));
    }

    if (startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(endDate)));
    }

    const rows = await this.dbs.db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        actorType: auditLogs.actorType,
        action: auditLogs.action,
        module: auditLogs.module,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        details: auditLogs.details,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      actorType: row.actorType,
      userEmail: row.userEmail,
      action: row.action,
      module: row.module,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      details: row.details ? JSON.parse(row.details) : null,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
    }));
  }

  // Get history for a specific resource (task)
  async getResourceHistory(
    userId: string,
    resourceId: string,
    resourceType: string = 'todo',
    limit: number = 10,
    offset: number = 0,
    isAdmin: boolean = false,
  ) {
    if (!isAdmin) {
      if (resourceType !== 'todo') {
        throw new ForbiddenException('Not authorized to view history');
      }

      const owner = await this.dbs.db
        .select({ userId: todos.userId })
        .from(todos)
        .where(eq(todos.id, resourceId))
        .limit(1);

      if (owner.length === 0 || owner[0].userId !== userId) {
        throw new ForbiddenException('Not authorized to view history');
      }
    }

    const rows = await this.dbs.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorType: auditLogs.actorType,
        module: auditLogs.module,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(
        and(
          eq(auditLogs.resourceId, resourceId),
          eq(auditLogs.resourceType, resourceType),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorType: row.actorType,
      module: row.module,
      userEmail: row.userEmail,
      details: row.details ? JSON.parse(row.details) : null,
      createdAt: row.createdAt,
    }));
  }

  // Admin-only: list all logs
  async listAll(query: ListAuditLogsQuery & { userId?: string } = {}) {
    const {
      limit = 50,
      offset = 0,
      action,
      startDate,
      endDate,
      userId,
    } = query;

    const conditions: any[] = [];

    if (userId) {
      conditions.push(eq(auditLogs.userId, userId));
    }

    if (action) {
      conditions.push(ilike(auditLogs.action, `%${action}%`));
    }

    if (startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(endDate)));
    }

    const rows = await this.dbs.db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        actorType: auditLogs.actorType,
        action: auditLogs.action,
        module: auditLogs.module,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        details: auditLogs.details,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      actorType: row.actorType,
      userEmail: row.userEmail,
      action: row.action,
      module: row.module,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      details: row.details ? JSON.parse(row.details) : null,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
    }));
  }
}
