import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { fieldLibrary } from './schema';
import { eq } from 'drizzle-orm';
import { CreateFieldDto, FieldCharacterType } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class FieldLibraryService {
  constructor(
    private readonly dbs: DbService,
    private readonly audit: AuditService,
  ) {}

  async listFields(status?: 'active' | 'hidden' | 'archived') {
    const query = this.dbs.db.select().from(fieldLibrary);
    if (status) {
      query.where(eq(fieldLibrary.status, status));
    }
    return query;
  }

  async getFieldByKey(fieldKey: string) {
    const result = await this.dbs.db
      .select()
      .from(fieldLibrary)
      .where(eq(fieldLibrary.fieldKey, fieldKey))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException(`Field with key "${fieldKey}" not found`);
    }
    return result[0];
  }

  async createField(dto: CreateFieldDto, adminUserId: string) {
    // Check for duplicate fieldKey
    const existing = await this.dbs.db
      .select()
      .from(fieldLibrary)
      .where(eq(fieldLibrary.fieldKey, dto.fieldKey))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(
        `Field with key "${dto.fieldKey}" already exists`,
      );
    }

    if (
      dto.characterLimit &&
      dto.characterType !== FieldCharacterType.VARCHAR
    ) {
      throw new BadRequestException(
        'characterLimit is only allowed for "varchar" type',
      );
    }

    const [newField] = await this.dbs.db
      .insert(fieldLibrary)
      .values({
        fieldKey: dto.fieldKey,
        label: dto.label,
        characterType: dto.characterType,
        characterLimit: dto.characterLimit,
        required: dto.required ?? false,
        createdBy: adminUserId,
      })
      .returning();

    await this.audit.log({
      userId: adminUserId,
      action: 'field_library.create',
      module: 'field_library',
      resourceType: 'field_library',
      resourceId: newField.id,
      details: { newField },
    });

    return newField;
  }

  async updateField(
    fieldKey: string,
    dto: UpdateFieldDto,
    adminUserId: string,
  ) {
    const field = await this.getFieldByKey(fieldKey);

    // Check if characterLimit is being set for a non-varchar type
    const finalType = dto.characterType || field.characterType;
    if (dto.characterLimit && finalType !== FieldCharacterType.VARCHAR) {
      throw new BadRequestException(
        'characterLimit is only allowed for "varchar" type',
      );
    }

    const updates: Partial<typeof fieldLibrary.$inferInsert> = {
      label: dto.label ?? field.label,
      updatedAt: new Date(),
      ...(dto.required !== undefined && { required: dto.required }),
    };

    // If type changes, handle version and characterLimit
    let versionIncremented = false;
    if (
      dto.characterType &&
      (dto.characterType as string) !== field.characterType
    ) {
      updates.characterType = dto.characterType;
      updates.version = field.version + 1;
      versionIncremented = true;

      // If changing AWAY from varchar, and no new limit is provided, clear the old one
      if (dto.characterType !== FieldCharacterType.VARCHAR) {
        updates.characterLimit = null;
      } else {
        // If changing TO varchar, use new limit or keep old (might be null)
        updates.characterLimit = dto.characterLimit ?? field.characterLimit;
      }
    } else {
      // Type didn't change, just update label or limit
      updates.characterLimit = dto.characterLimit ?? field.characterLimit;
    }

    const [updatedField] = await this.dbs.db
      .update(fieldLibrary)
      .set(updates)
      .where(eq(fieldLibrary.fieldKey, fieldKey))
      .returning();

    await this.audit.log({
      userId: adminUserId,
      action: 'field_library.update',
      module: 'field_library',
      resourceType: 'field_library',
      resourceId: field.id,
      details: {
        before: field,
        after: updatedField,
        versionIncremented,
      },
    });

    return updatedField;
  }

  async hideField(fieldKey: string, adminUserId: string) {
    const field = await this.getFieldByKey(fieldKey);

    // TODO: Milestone 8.6.9 - Check if field is in use by baseline_field_assignments
    // For now, always allow. Reference: apps/api/src/field-library/field-library.service.ts:121

    const [updatedField] = await this.dbs.db
      .update(fieldLibrary)
      .set({ status: 'hidden', updatedAt: new Date() })
      .where(eq(fieldLibrary.fieldKey, fieldKey))
      .returning();

    await this.audit.log({
      userId: adminUserId,
      action: 'field_library.hide',
      module: 'field_library',
      resourceType: 'field_library',
      resourceId: field.id,
      details: {
        before: field,
        after: updatedField,
      },
    });

    return updatedField;
  }

  async unhideField(fieldKey: string, adminUserId: string) {
    const field = await this.getFieldByKey(fieldKey);

    // Validate state transition
    if (field.status === 'active') {
      throw new BadRequestException(`Field "${fieldKey}" is already active`);
    }

    if (field.status === 'archived') {
      throw new ConflictException(
        `Field "${fieldKey}" is archived and cannot be unhidden`,
      );
    }

    const [updatedField] = await this.dbs.db
      .update(fieldLibrary)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(fieldLibrary.fieldKey, fieldKey))
      .returning();

    await this.audit.log({
      userId: adminUserId,
      action: 'field_library.unhide',
      module: 'field_library',
      resourceType: 'field_library',
      resourceId: field.id,
      details: {
        before: field,
        after: updatedField,
      },
    });

    return updatedField;
  }

  async archiveField(fieldKey: string, adminUserId: string) {
    const field = await this.getFieldByKey(fieldKey);

    // TODO: Milestone 8.6.9 - Check if field is in use by baseline_field_assignments
    // For now, always allow. Reference: apps/api/src/field-library/field-library.service.ts:145

    const [updatedField] = await this.dbs.db
      .update(fieldLibrary)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(fieldLibrary.fieldKey, fieldKey))
      .returning();

    await this.audit.log({
      userId: adminUserId,
      action: 'field_library.archive',
      module: 'field_library',
      resourceType: 'field_library',
      resourceId: field.id,
      details: {
        before: field,
        after: updatedField,
      },
    });

    return updatedField;
  }
}
