import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { documentTypeFields, documentTypes } from '../db/schema';
import { fieldLibrary } from '../field-library/schema';
import { AddDocumentTypeFieldDto } from './dto/add-document-type-field.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeFieldDto } from './dto/update-document-type-field.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';

@Injectable()
export class DocumentTypesService {
  constructor(private readonly dbs: DbService) {}

  async listDocumentTypes() {
    return this.dbs.db
      .select({
        id: documentTypes.id,
        name: documentTypes.name,
        description: documentTypes.description,
        createdAt: documentTypes.createdAt,
      })
      .from(documentTypes)
      .orderBy(asc(documentTypes.createdAt));
  }

  async createDocumentType(dto: CreateDocumentTypeDto) {
    try {
      const [created] = await this.dbs.db
        .insert(documentTypes)
        .values({
          name: dto.name,
          description: dto.description,
        })
        .returning();
      return created;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException(
          `Document type with name "${dto.name}" already exists`,
        );
      }
      throw error;
    }
  }

  async updateDocumentType(id: string, dto: UpdateDocumentTypeDto) {
    const updates: Partial<typeof documentTypes.$inferInsert> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.description !== undefined) updates.description = dto.description;

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('No fields provided for update');
    }

    try {
      const [updated] = await this.dbs.db
        .update(documentTypes)
        .set(updates)
        .where(eq(documentTypes.id, id))
        .returning();

      if (!updated) {
        throw new NotFoundException(`Document type "${id}" not found`);
      }

      return updated;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException(
          `Document type with name "${dto.name}" already exists`,
        );
      }
      throw error;
    }
  }

  async deleteDocumentType(id: string) {
    const [deleted] = await this.dbs.db
      .delete(documentTypes)
      .where(eq(documentTypes.id, id))
      .returning();

    if (!deleted) {
      throw new NotFoundException(`Document type "${id}" not found`);
    }

    return { deleted: true, id };
  }

  async getDocumentTypeFields(id: string) {
    await this.assertDocumentTypeExists(id);

    return this.dbs.db
      .select({
        fieldKey: documentTypeFields.fieldKey,
        label: fieldLibrary.label,
        characterType: fieldLibrary.characterType,
        required: documentTypeFields.required,
        zoneHint: documentTypeFields.zoneHint,
        sortOrder: documentTypeFields.sortOrder,
      })
      .from(documentTypeFields)
      .innerJoin(fieldLibrary, eq(documentTypeFields.fieldKey, fieldLibrary.fieldKey))
      .where(eq(documentTypeFields.documentTypeId, id))
      .orderBy(asc(documentTypeFields.sortOrder), asc(documentTypeFields.fieldKey));
  }

  async addFieldToDocumentType(id: string, dto: AddDocumentTypeFieldDto) {
    await this.assertDocumentTypeExists(id);
    await this.assertFieldExists(dto.fieldKey);

    try {
      const [created] = await this.dbs.db
        .insert(documentTypeFields)
        .values({
          documentTypeId: id,
          fieldKey: dto.fieldKey,
          required: dto.required ?? false,
          zoneHint: dto.zoneHint,
          sortOrder: dto.sortOrder ?? 0,
        })
        .returning();
      return created;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException(
          `Field "${dto.fieldKey}" already exists on document type "${id}"`,
        );
      }
      throw error;
    }
  }

  async updateDocumentTypeField(
    id: string,
    fieldKey: string,
    dto: UpdateDocumentTypeFieldDto,
  ) {
    const updates: Partial<typeof documentTypeFields.$inferInsert> = {};
    if (dto.required !== undefined) updates.required = dto.required;
    if (dto.zoneHint !== undefined) updates.zoneHint = dto.zoneHint;
    if (dto.sortOrder !== undefined) updates.sortOrder = dto.sortOrder;

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('No fields provided for update');
    }

    const [updated] = await this.dbs.db
      .update(documentTypeFields)
      .set(updates)
      .where(
        and(
          eq(documentTypeFields.documentTypeId, id),
          eq(documentTypeFields.fieldKey, fieldKey),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundException(
        `Field "${fieldKey}" not found for document type "${id}"`,
      );
    }

    return updated;
  }

  async removeFieldFromDocumentType(id: string, fieldKey: string) {
    const [deleted] = await this.dbs.db
      .delete(documentTypeFields)
      .where(
        and(
          eq(documentTypeFields.documentTypeId, id),
          eq(documentTypeFields.fieldKey, fieldKey),
        ),
      )
      .returning();

    if (!deleted) {
      throw new NotFoundException(
        `Field "${fieldKey}" not found for document type "${id}"`,
      );
    }

    return { deleted: true, id, fieldKey };
  }

  private async assertDocumentTypeExists(id: string): Promise<void> {
    const [row] = await this.dbs.db
      .select({ id: documentTypes.id })
      .from(documentTypes)
      .where(eq(documentTypes.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Document type "${id}" not found`);
    }
  }

  private async assertFieldExists(fieldKey: string): Promise<void> {
    const [row] = await this.dbs.db
      .select({ fieldKey: fieldLibrary.fieldKey })
      .from(fieldLibrary)
      .where(eq(fieldLibrary.fieldKey, fieldKey))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Field "${fieldKey}" not found in field library`);
    }
  }
}
