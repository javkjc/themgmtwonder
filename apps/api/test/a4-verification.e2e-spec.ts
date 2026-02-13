import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { DbService } from './../src/db/db.service';
import {
  users,
  categories,
  todos,
  attachments,
  extractionBaselines,
  baselineFieldAssignments,
  auditLogs,
  fieldLibrary,
} from './../src/db/schema';
import { eq, desc } from 'drizzle-orm';

import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

describe('A4 Verification (e2e)', () => {
  let app: INestApplication;
  let dbService: DbService;
  let agent: any; // using any to avoid SuperAgentTest type issues if slightly incompatible
  let userId: string;
  let todoId: string;
  let attachmentId: string;
  let baselineId: string;

  const email = `test-a4-${Date.now()}@example.com`;
  const password = 'password123';
  let csrfToken: string;
  jest.setTimeout(30000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    dbService = app.get(DbService);
    await app.init();
    agent = request.agent(app.getHttpServer());

    // 1. Register User
    const regRes = await agent
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    // Extract CSRF token from Set-Cookie header
    const csrfCookieName = process.env.CSRF_COOKIE_NAME || 'todo_csrf';
    const setCookie = regRes.headers['set-cookie'] as string[];
    if (setCookie) {
      const csrfCookie = setCookie.find((c) =>
        c.startsWith(`${csrfCookieName}=`),
      );
      if (csrfCookie) {
        csrfToken = csrfCookie.split('=')[1].split(';')[0];
      }
    }

    // Get userId from DB
    const user = await dbService.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    userId = user!.id;

    // 2. Setup Data
    // Create Todo
    const [todo] = await dbService.db
      .insert(todos)
      .values({
        userId,
        title: 'Test Todo',
        category: 'General',
      })
      .returning();
    todoId = todo.id;

    // Create Attachment
    const [att] = await dbService.db
      .insert(attachments)
      .values({
        userId,
        todoId: todo.id,
        filename: 'test.pdf',
        storedFilename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1000,
      })
      .returning();
    attachmentId = att.id;

    // Ensure Invoice Number field exists
    const field = await dbService.db.query.fieldLibrary.findFirst({
      where: eq(fieldLibrary.fieldKey, 'invoice_number'),
    });
    if (!field) {
      await dbService.db.insert(fieldLibrary).values({
        fieldKey: 'invoice_number',
        label: 'Invoice Number',
        characterType: 'varchar',
        characterLimit: 50,
        createdBy: userId,
      });
    }
  });

  afterAll(async () => {
    // Cleanup resources
    if (baselineId)
      await dbService.db
        .delete(extractionBaselines)
        .where(eq(extractionBaselines.id, baselineId));
    if (attachmentId)
      await dbService.db
        .delete(attachments)
        .where(eq(attachments.id, attachmentId));
    if (todoId) await dbService.db.delete(todos).where(eq(todos.id, todoId));
    if (userId) await dbService.db.delete(users).where(eq(users.id, userId));

    await app.close();
  });

  it('Checkpoint A4: Full Flow', async () => {
    // 1. Create Draft Baseline
    const draftRes = await agent
      .post(`/attachments/${attachmentId}/baseline/draft`)
      .set('x-csrf-token', csrfToken)
      .expect(201);
    baselineId = draftRes.body.id;
    expect(baselineId).toBeDefined();

    // 2. Assign Field (New) - Should Succeed
    await agent
      .post(`/baselines/${baselineId}/assign`)
      .set('x-csrf-token', csrfToken)
      .send({
        fieldKey: 'invoice_number',
        assignedValue: 'INV-123',
      })
      .expect(201);

    // Verify DB
    const assign1 = await dbService.db.query.baselineFieldAssignments.findFirst(
      {
        where: (t, { and, eq }) =>
          and(eq(t.baselineId, baselineId), eq(t.fieldKey, 'invoice_number')),
      },
    );
    expect(assign1).toBeDefined();
    expect(assign1?.assignedValue).toBe('INV-123');
    expect(assign1?.correctedFrom).toBeNull();

    // 3. Overwrite without Reason -> 400
    await agent
      .post(`/baselines/${baselineId}/assign`)
      .set('x-csrf-token', csrfToken)
      .send({
        fieldKey: 'invoice_number',
        assignedValue: 'INV-456',
      })
      .expect(400);

    // 4. Overwrite WITH Reason -> 200/201
    await agent
      .post(`/baselines/${baselineId}/assign`)
      .set('x-csrf-token', csrfToken)
      .send({
        fieldKey: 'invoice_number',
        assignedValue: 'INV-456',
        correctionReason: 'Typo fixed',
      })
      .expect(201);

    // Verify DB update
    const assign2 = await dbService.db.query.baselineFieldAssignments.findFirst(
      {
        where: (t, { and, eq }) =>
          and(eq(t.baselineId, baselineId), eq(t.fieldKey, 'invoice_number')),
      },
    );
    expect(assign2?.assignedValue).toBe('INV-456');
    expect(assign2?.correctedFrom).toBe('INV-123');
    expect(assign2?.correctionReason).toBe('Typo fixed');

    // 5. Audit Log Verification
    const allLogs = await dbService.db.query.auditLogs.findMany({
      orderBy: desc(auditLogs.createdAt),
      limit: 20,
    });

    // Find upsert log by checking if details contains baselineId and action matches
    const upsertLog = allLogs.find(
      (l) =>
        l.action === 'baseline.assignment.upsert' &&
        l.details?.includes(baselineId) &&
        l.details?.includes('Typo fixed'),
    );
    expect(upsertLog).toBeDefined();

    const details = JSON.parse(upsertLog?.details || '{}');
    expect(details.fieldKey).toBe('invoice_number');
    expect(details.correctedFrom).toBe('INV-123');
    expect(details.correctionReason).toBe('Typo fixed');

    // 6. Delete without Reason -> 400
    await agent
      .delete(`/baselines/${baselineId}/assign/invoice_number`)
      .set('x-csrf-token', csrfToken)
      .expect(400);

    // 7. Delete with Reason -> 200
    await agent
      .delete(`/baselines/${baselineId}/assign/invoice_number`)
      .set('x-csrf-token', csrfToken)
      .send({ correctionReason: 'Removed invalid field' })
      .expect(200);

    // Verify DB deleted
    const assign3 = await dbService.db.query.baselineFieldAssignments.findFirst(
      {
        where: (t, { and, eq }) =>
          and(eq(t.baselineId, baselineId), eq(t.fieldKey, 'invoice_number')),
      },
    );
    expect(assign3).toBeUndefined();

    // Verify Delete Audit Log
    const logsAfterDelete = await dbService.db.query.auditLogs.findMany({
      orderBy: desc(auditLogs.createdAt),
      limit: 5,
    });
    const deleteLog = logsAfterDelete.find(
      (l) =>
        l.action === 'baseline.assignment.delete' &&
        l.details?.includes(baselineId) &&
        l.details?.includes('Removed invalid field'),
    );
    expect(deleteLog).toBeDefined();
    const delDetails = JSON.parse(deleteLog?.details || '{}');
    expect(delDetails.correctionReason).toBe('Removed invalid field');
    // 8. Test Reserved Guards: Archived
    // Set to archived manually
    await dbService.db
      .update(extractionBaselines)
      .set({ status: 'archived' })
      .where(eq(extractionBaselines.id, baselineId));

    await agent
      .post(`/baselines/${baselineId}/assign`)
      .set('x-csrf-token', csrfToken)
      .send({ fieldKey: 'invoice_number', assignedValue: 'TEST' })
      .expect(400); // Cannot modify archived

    // 9. Test Aggregated Payload (Task A5)
    const aggregatedRes = await agent
      .get(`/attachments/${attachmentId}/baseline`)
      .expect(200);
    expect(aggregatedRes.body).toBeDefined();
    expect(aggregatedRes.body.status).toBe('archived'); // currently set to archived from step 8
    expect(aggregatedRes.body.assignments).toBeDefined();
    expect(Array.isArray(aggregatedRes.body.assignments)).toBe(true);
    expect(aggregatedRes.body.segments).toBeDefined();
    expect(Array.isArray(aggregatedRes.body.segments)).toBe(true);

    // 10. Test Reserved Guards: Utilized
    // Reset to draft but set utilizedAt
    await dbService.db
      .update(extractionBaselines)
      .set({
        status: 'draft',
        utilizedAt: new Date(),
        utilizationType: 'record_created',
      })
      .where(eq(extractionBaselines.id, baselineId));

    await agent
      .post(`/baselines/${baselineId}/assign`)
      .set('x-csrf-token', csrfToken)
      .send({ fieldKey: 'invoice_number', assignedValue: 'TEST' })
      .expect(403); // Forbidden when utilized
  });
});
