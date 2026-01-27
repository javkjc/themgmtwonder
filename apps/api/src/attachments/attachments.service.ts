import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attachments, todos } from '../db/schema';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Generate UUID without external dependency
function generateUuid(): string {
  return crypto.randomUUID();
}

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

@Injectable()
export class AttachmentsService {
  constructor(private readonly dbs: DbService) {}

  async listByTodo(userId: string, todoId: string) {
    // Verify todo belongs to user
    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

    if (!todo) {
      throw new NotFoundException('Todo not found');
    }

    return this.dbs.db
      .select()
      .from(attachments)
      .where(eq(attachments.todoId, todoId));
  }

  async upload(
    userId: string,
    todoId: string,
    file: {
      originalname: string;
      buffer: Buffer;
      mimetype: string;
      size: number;
    },
  ) {
    // Verify todo belongs to user
    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));

    if (!todo) {
      throw new NotFoundException('Todo not found');
    }

    // Normalize the uploaded filename (trim whitespace + lowercase for comparison)
    const uploadedFilename = file.originalname.trim();
    const normalizedUploadedFilename = uploadedFilename.toLowerCase();

    // Fetch existing attachments for this todo
    const existingAttachments = await this.dbs.db
      .select({
        id: attachments.id,
        filename: attachments.filename,
      })
      .from(attachments)
      .where(eq(attachments.todoId, todoId));

    // Check for duplicate by comparing ORIGINAL filenames (case-insensitive, trimmed)
    const duplicate = existingAttachments.find((existing) => {
      const existingNormalized = (existing.filename || '').trim().toLowerCase();
      return existingNormalized === normalizedUploadedFilename;
    });

    if (duplicate) {
      throw new ConflictException(
        `An attachment with the filename "${uploadedFilename}" already exists for this task`,
      );
    }

    // Generate stored filename
    const ext = path.extname(file.originalname);
    const storedFilename = `${generateUuid()}${ext}`;
    const filePath = path.join(UPLOADS_DIR, storedFilename);

    // Write file to disk
    fs.writeFileSync(filePath, file.buffer);

    // Save metadata to database (store trimmed filename)
    const [attachment] = await this.dbs.db
      .insert(attachments)
      .values({
        todoId,
        userId,
        filename: uploadedFilename, // Use trimmed filename
        storedFilename,
        mimeType: file.mimetype,
        size: file.size,
        stageKeyAtCreation: todo.stageKey,
      })
      .returning();

    return attachment;
  }

  async getById(userId: string, attachmentId: string) {
    const [attachment] = await this.dbs.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId));

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Verify ownership via todo
    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, attachment.todoId), eq(todos.userId, userId)));

    if (!todo) {
      throw new ForbiddenException('Access denied');
    }

    return {
      attachment,
      filePath: path.join(UPLOADS_DIR, attachment.storedFilename),
    };
  }

  async delete(userId: string, attachmentId: string) {
    const [attachment] = await this.dbs.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId));

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Verify ownership via todo
    const [todo] = await this.dbs.db
      .select()
      .from(todos)
      .where(and(eq(todos.id, attachment.todoId), eq(todos.userId, userId)));

    if (!todo) {
      throw new ForbiddenException('Access denied');
    }

    // Delete file from disk
    const filePath = path.join(UPLOADS_DIR, attachment.storedFilename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await this.dbs.db
      .delete(attachments)
      .where(eq(attachments.id, attachmentId));

    return { deleted: true };
  }
}
