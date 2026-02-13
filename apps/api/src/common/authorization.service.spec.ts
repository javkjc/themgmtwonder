import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { DbService } from '../db/db.service';

describe('AuthorizationService', () => {
  let service: AuthorizationService;
  let dbService: DbService;

  // Mock data
  const mockUserId = 'user-123';
  const mockOtherUserId = 'user-456';
  const mockTodoId = 'todo-123';
  const mockAttachmentId = 'attachment-123';
  const mockBaselineId = 'baseline-123';
  const mockTableId = 'table-123';

  const mockTodo = {
    id: mockTodoId,
    userId: mockUserId,
    title: 'Test Todo',
    description: 'Test description',
    done: false,
    category: null,
    priority: 'medium',
    dueDate: null,
    durationMin: 30,
    startAt: null,
    unscheduledAt: null,
    isPinned: false,
    stageKey: 'draft',
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAttachment = {
    id: mockAttachmentId,
    todoId: mockTodoId,
    userId: mockUserId,
    filename: 'test.pdf',
    storedFilename: 'stored-test.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    stageKeyAtCreation: 'draft',
    createdAt: new Date(),
  };

  const mockBaseline = {
    id: mockBaselineId,
    attachmentId: mockAttachmentId,
    status: 'draft',
    utilizationType: null,
    utilizedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    confirmedAt: null,
    confirmedBy: null,
    archivedAt: null,
    archivedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTable = {
    id: mockTableId,
    baselineId: mockBaselineId,
    label: 'Test Table',
    status: 'draft',
    rowCount: 5,
    columnCount: 3,
    tableIndex: 0,
    confirmedAt: null,
    confirmedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Mock DbService
    const mockDbService = {
      db: {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationService,
        {
          provide: DbService,
          useValue: mockDbService,
        },
      ],
    }).compile();

    service = module.get<AuthorizationService>(AuthorizationService);
    dbService = module.get<DbService>(DbService);
  });

  describe('ensureUserOwnsTodo', () => {
    it('should return todo when user owns it', async () => {
      jest.spyOn(dbService.db, 'limit').mockResolvedValueOnce([mockTodo]);

      const result = await service.ensureUserOwnsTodo(mockUserId, mockTodoId);

      expect(result).toEqual(mockTodo);
    });

    it('should throw ForbiddenException when user does not own todo', async () => {
      jest.spyOn(dbService.db, 'limit').mockResolvedValueOnce([]);

      await expect(
        service.ensureUserOwnsTodo(mockOtherUserId, mockTodoId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException with correct message', async () => {
      jest.spyOn(dbService.db, 'limit').mockResolvedValueOnce([]);

      await expect(
        service.ensureUserOwnsTodo(mockOtherUserId, mockTodoId),
      ).rejects.toThrow('Access denied for todo');
    });
  });

  describe('ensureUserOwnsAttachment', () => {
    it('should return attachment and todo when user owns them', async () => {
      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockAttachment]) // First query for attachment
        .mockResolvedValueOnce([mockTodo]); // Second query for todo

      const result = await service.ensureUserOwnsAttachment(
        mockUserId,
        mockAttachmentId,
      );

      expect(result).toEqual({
        attachment: mockAttachment,
        todo: mockTodo,
      });
    });

    it('should throw NotFoundException when attachment not found', async () => {
      jest.spyOn(dbService.db, 'limit').mockResolvedValueOnce([]);

      await expect(
        service.ensureUserOwnsAttachment(mockUserId, mockAttachmentId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with correct message for missing attachment', async () => {
      jest.spyOn(dbService.db, 'limit').mockResolvedValueOnce([]);

      await expect(
        service.ensureUserOwnsAttachment(mockUserId, mockAttachmentId),
      ).rejects.toThrow('Attachment not found');
    });

    it('should throw ForbiddenException when user does not own todo', async () => {
      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockAttachment])
        .mockResolvedValueOnce([]); // Todo not found or wrong owner

      await expect(
        service.ensureUserOwnsAttachment(mockOtherUserId, mockAttachmentId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException with correct message for todo access denial', async () => {
      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockAttachment])
        .mockResolvedValueOnce([]);

      await expect(
        service.ensureUserOwnsAttachment(mockOtherUserId, mockAttachmentId),
      ).rejects.toThrow('Access denied for attachment');
    });

    it('should validate attachment ownership through todo chain', async () => {
      const attachmentWithDifferentTodo = {
        ...mockAttachment,
        todoId: 'different-todo-id',
      };
      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([attachmentWithDifferentTodo])
        .mockResolvedValueOnce([]);

      await expect(
        service.ensureUserOwnsAttachment(mockUserId, mockAttachmentId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ensureUserOwnsBaseline', () => {
    it('should return baseline context when user owns it', async () => {
      const mockBaselineRecord = {
        id: mockBaseline.id,
        attachmentId: mockBaseline.attachmentId,
        status: mockBaseline.status,
        utilizationType: mockBaseline.utilizationType,
        utilizedAt: mockBaseline.utilizedAt,
        ownerId: mockUserId,
      };

      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockBaselineRecord]);

      const result = await service.ensureUserOwnsBaseline(
        mockUserId,
        mockBaselineId,
      );

      expect(result).toEqual(mockBaselineRecord);
    });

    it('should throw NotFoundException when baseline not found', async () => {
      jest.spyOn(dbService.db, 'limit').mockResolvedValueOnce([]);

      await expect(
        service.ensureUserOwnsBaseline(mockUserId, mockBaselineId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with correct message', async () => {
      jest.spyOn(dbService.db, 'limit').mockResolvedValueOnce([]);

      await expect(
        service.ensureUserOwnsBaseline(mockUserId, mockBaselineId),
      ).rejects.toThrow('Baseline not found');
    });

    it('should throw ForbiddenException when user does not own baseline', async () => {
      const mockBaselineRecord = {
        id: mockBaseline.id,
        attachmentId: mockBaseline.attachmentId,
        status: mockBaseline.status,
        utilizationType: mockBaseline.utilizationType,
        utilizedAt: mockBaseline.utilizedAt,
        ownerId: mockOtherUserId,
      };

      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockBaselineRecord]);

      await expect(
        service.ensureUserOwnsBaseline(mockUserId, mockBaselineId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException with correct message', async () => {
      const mockBaselineRecord = {
        id: mockBaseline.id,
        attachmentId: mockBaseline.attachmentId,
        status: mockBaseline.status,
        utilizationType: mockBaseline.utilizationType,
        utilizedAt: mockBaseline.utilizedAt,
        ownerId: mockOtherUserId,
      };

      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockBaselineRecord]);

      await expect(
        service.ensureUserOwnsBaseline(mockUserId, mockBaselineId),
      ).rejects.toThrow('Access denied for baseline');
    });

    it('should validate baseline ownership through attachment → todo chain', async () => {
      const mockBaselineRecord = {
        id: mockBaseline.id,
        attachmentId: mockBaseline.attachmentId,
        status: mockBaseline.status,
        utilizationType: mockBaseline.utilizationType,
        utilizedAt: mockBaseline.utilizedAt,
        ownerId: mockUserId,
      };

      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockBaselineRecord]);

      const result = await service.ensureUserOwnsBaseline(
        mockUserId,
        mockBaselineId,
      );

      expect(result.ownerId).toBe(mockUserId);
    });
  });

  describe('ensureUserOwnsTable', () => {
    it('should return table context when user owns it', async () => {
      const mockTableRecord = {
        tableId: mockTable.id,
        tableBaselineId: mockTable.baselineId,
        tableLabel: mockTable.label,
        tableStatus: mockTable.status,
        baselineId: mockBaseline.id,
        baselineAttachmentId: mockBaseline.attachmentId,
        baselineStatus: mockBaseline.status,
        baselineUtilizationType: mockBaseline.utilizationType,
        baselineUtilizedAt: mockBaseline.utilizedAt,
        attachmentId: mockAttachment.id,
        attachmentTodoId: mockAttachment.todoId,
        todoId: mockTodo.id,
        todoUserId: mockUserId,
      };

      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockTableRecord]);

      const result = await service.ensureUserOwnsTable(mockUserId, mockTableId);

      expect(result.tableId).toBe(mockTableId);
      expect(result.todoUserId).toBe(mockUserId);
    });

    it('should throw NotFoundException when table not found', async () => {
      jest.spyOn(dbService.db, 'limit').mockResolvedValueOnce([]);

      await expect(
        service.ensureUserOwnsTable(mockUserId, mockTableId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with correct message', async () => {
      jest.spyOn(dbService.db, 'limit').mockResolvedValueOnce([]);

      await expect(
        service.ensureUserOwnsTable(mockUserId, mockTableId),
      ).rejects.toThrow('Table not found');
    });

    it('should throw ForbiddenException when user does not own table', async () => {
      const mockTableRecord = {
        tableId: mockTable.id,
        tableBaselineId: mockTable.baselineId,
        tableLabel: mockTable.label,
        tableStatus: mockTable.status,
        baselineId: mockBaseline.id,
        baselineAttachmentId: mockBaseline.attachmentId,
        baselineStatus: mockBaseline.status,
        baselineUtilizationType: mockBaseline.utilizationType,
        baselineUtilizedAt: mockBaseline.utilizedAt,
        attachmentId: mockAttachment.id,
        attachmentTodoId: mockAttachment.todoId,
        todoId: mockTodo.id,
        todoUserId: mockOtherUserId,
      };

      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockTableRecord]);

      await expect(
        service.ensureUserOwnsTable(mockUserId, mockTableId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException with correct message', async () => {
      const mockTableRecord = {
        tableId: mockTable.id,
        tableBaselineId: mockTable.baselineId,
        tableLabel: mockTable.label,
        tableStatus: mockTable.status,
        baselineId: mockBaseline.id,
        baselineAttachmentId: mockBaseline.attachmentId,
        baselineStatus: mockBaseline.status,
        baselineUtilizationType: mockBaseline.utilizationType,
        baselineUtilizedAt: mockBaseline.utilizedAt,
        attachmentId: mockAttachment.id,
        attachmentTodoId: mockAttachment.todoId,
        todoId: mockTodo.id,
        todoUserId: mockOtherUserId,
      };

      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockTableRecord]);

      await expect(
        service.ensureUserOwnsTable(mockUserId, mockTableId),
      ).rejects.toThrow('Access denied for table');
    });

    it('should validate table ownership through baseline → attachment → todo chain', async () => {
      const mockTableRecord = {
        tableId: mockTable.id,
        tableBaselineId: mockTable.baselineId,
        tableLabel: mockTable.label,
        tableStatus: mockTable.status,
        baselineId: mockBaseline.id,
        baselineAttachmentId: mockBaseline.attachmentId,
        baselineStatus: mockBaseline.status,
        baselineUtilizationType: mockBaseline.utilizationType,
        baselineUtilizedAt: mockBaseline.utilizedAt,
        attachmentId: mockAttachment.id,
        attachmentTodoId: mockAttachment.todoId,
        todoId: mockTodo.id,
        todoUserId: mockUserId,
      };

      jest
        .spyOn(dbService.db, 'limit')
        .mockResolvedValueOnce([mockTableRecord]);

      const result = await service.ensureUserOwnsTable(mockUserId, mockTableId);

      expect(result.baselineId).toBe(mockBaseline.id);
      expect(result.attachmentId).toBe(mockAttachment.id);
      expect(result.todoId).toBe(mockTodo.id);
      expect(result.todoUserId).toBe(mockUserId);
    });
  });
});
