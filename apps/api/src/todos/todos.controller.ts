import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Param,
  UseGuards,
  Delete,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { TodosService } from './todos.service';
import {
  CreateTodoDto,
  UpdateTodoDto,
  ListTodosQueryDto,
  ScheduleTodoDto,
} from './dto';
import { AuditService } from '../audit/audit.service';
import { TaskStageKey } from '../common/constants';

@UseGuards(JwtAuthGuard, CsrfGuard)
@Controller('todos')
export class TodosController {
  constructor(
    private readonly todos: TodosService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @Req() req: any,
    @Query('done') done?: string,
    @Query('limit') limit?: string,
    @Query('sortDir') sortDir?: string,
    @Query('createdAfter') createdAfter?: string,
    @Query('createdBefore') createdBefore?: string,
    @Query('scheduledAfter') scheduledAfter?: string,
    @Query('scheduledBefore') scheduledBefore?: string,
  ) {
    const doneBool =
      done === undefined
        ? undefined
        : done.toLowerCase() === 'true'
          ? true
          : done.toLowerCase() === 'false'
            ? false
            : undefined;

    const limitNum = limit ? Number(limit) : undefined;

    const sortDirNorm =
      sortDir?.toLowerCase() === 'asc'
        ? 'asc'
        : sortDir?.toLowerCase() === 'desc'
          ? 'desc'
          : undefined;

    // Parse date filters
    const createdAfterDate = createdAfter ? new Date(createdAfter) : undefined;
    const createdBeforeDate = createdBefore
      ? new Date(createdBefore)
      : undefined;
    const scheduledAfterDate = scheduledAfter
      ? new Date(scheduledAfter)
      : undefined;
    const scheduledBeforeDate = scheduledBefore
      ? new Date(scheduledBefore)
      : undefined;

    return this.todos.list(req.user.userId, {
      done: doneBool,
      limit: Number.isFinite(limitNum) ? limitNum : undefined,
      sortDir: sortDirNorm,
      createdAfter:
        createdAfterDate && !isNaN(createdAfterDate.getTime())
          ? createdAfterDate
          : undefined,
      createdBefore:
        createdBeforeDate && !isNaN(createdBeforeDate.getTime())
          ? createdBeforeDate
          : undefined,
      scheduledAfter:
        scheduledAfterDate && !isNaN(scheduledAfterDate.getTime())
          ? scheduledAfterDate
          : undefined,
      scheduledBefore:
        scheduledBeforeDate && !isNaN(scheduledBeforeDate.getTime())
          ? scheduledBeforeDate
          : undefined,
    });
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateTodoDto) {
    const result = await this.todos.create(req.user.userId, dto);
    await this.audit.log({
      userId: req.user.userId,
      action: 'todo.create',
      module: 'task',
      resourceType: 'todo',
      resourceId: result.id,
      details: { title: dto.title, category: dto.category },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Get('search')
  search(
    @Req() req: any,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? Number(limit) : 20;
    return this.todos.search(
      req.user.userId,
      query,
      Number.isFinite(limitNum) ? limitNum : 20,
    );
  }

  @Get('recently-unscheduled')
  recentlyUnscheduled(@Req() req: any, @Query('limit') limit?: string) {
    const limitNum = limit ? Number(limit) : 10;
    return this.todos.recentlyUnscheduled(
      req.user.userId,
      Number.isFinite(limitNum) ? limitNum : 10,
    );
  }

  @Get(':id')
  async getById(@Req() req: any, @Param('id') id: string) {
    const result = await this.todos.getById(req.user.userId, id);
    if (!result) {
      return { error: 'Not found' };
    }
    return result;
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    const patch: Partial<{
      title: string;
      description: string | null;
      done: boolean;
      category: string | null;
      durationMin: number;
      isPinned: boolean;
      stageKey: TaskStageKey | null;
    }> = {};

    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.done !== undefined) patch.done = dto.done;
    if (dto.category !== undefined) patch.category = dto.category;
    if (dto.durationMin !== undefined) patch.durationMin = dto.durationMin;
    if (dto.isPinned !== undefined) patch.isPinned = dto.isPinned;
    if (dto.stageKey !== undefined) patch.stageKey = dto.stageKey;

    // Fetch previous values for delta capture
    const previous = await this.todos.getById(req.user.userId, id);

    const result = await this.todos.update(req.user.userId, id, patch);

    // Build deltas for supported fields
    const changes: Record<string, { from: any; to: any }> = {};
    if (previous && result) {
      if (dto.title !== undefined && previous.title !== result.title) {
        changes.title = { from: previous.title, to: result.title };
      }
      if (
        dto.description !== undefined &&
        previous.description !== result.description
      ) {
        changes.description = {
          from: previous.description,
          to: result.description,
        };
      }
      if (dto.done !== undefined && previous.done !== result.done) {
        changes.done = { from: previous.done, to: result.done };
      }
      if (
        dto.durationMin !== undefined &&
        previous.durationMin !== result.durationMin
      ) {
        changes.durationMin = {
          from: previous.durationMin,
          to: result.durationMin,
        };
      }
      if (dto.isPinned !== undefined && previous.isPinned !== result.isPinned) {
        changes.isPinned = { from: previous.isPinned, to: result.isPinned };
      }
      if (dto.stageKey !== undefined && previous.stageKey !== result.stageKey) {
        changes.stageKey = { from: previous.stageKey, to: result.stageKey };
      }
    }

    await this.audit.log({
      userId: req.user.userId,
      action: 'todo.update',
      module: 'task',
      resourceType: 'todo',
      resourceId: id,
      details: {
        ...patch,
        changes: Object.keys(changes).length > 0 ? changes : undefined,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (
      previous &&
      result &&
      dto.stageKey !== undefined &&
      previous.stageKey !== result.stageKey
    ) {
      await this.audit.log({
        userId: req.user.userId,
        action: 'todo.stage_change',
        module: 'task',
        resourceType: 'todo',
        resourceId: id,
        details: {
          changes: {
            stageKey: {
              from: previous.stageKey,
              to: result.stageKey,
            },
          },
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
    return result;
  }

  @Patch(':id/schedule')
  async schedule(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ScheduleTodoDto,
  ) {
    // Fetch previous values for delta capture
    const previous = await this.todos.getById(req.user.userId, id);

    const result = await this.todos.schedule(req.user.userId, id, dto);
    const action = dto.startAt ? 'todo.schedule' : 'todo.unschedule';

    // Build deltas for startAt and durationMin
    const changes: Record<string, { from: any; to: any }> = {};
    if (previous && result) {
      if (previous.startAt !== result.startAt) {
        changes.startAt = { from: previous.startAt, to: result.startAt };
      }
      if (previous.durationMin !== result.durationMin) {
        changes.durationMin = {
          from: previous.durationMin,
          to: result.durationMin,
        };
      }
    }

    await this.audit.log({
      userId: req.user.userId,
      action,
      module: 'task',
      resourceType: 'todo',
      resourceId: id,
      details: {
        startAt: dto.startAt,
        durationMin: dto.durationMin,
        changes: Object.keys(changes).length > 0 ? changes : undefined,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const result = await this.todos.remove(req.user.userId, id);
    await this.audit.log({
      userId: req.user.userId,
      action: 'todo.delete',
      module: 'task',
      resourceType: 'todo',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post('bulk/done')
  async bulkMarkDone(
    @Req() req: any,
    @Body() dto: { ids: string[]; done: boolean },
  ) {
    const result = await this.todos.bulkUpdateDone(
      req.user.userId,
      dto.ids,
      dto.done,
    );
    await this.audit.log({
      userId: req.user.userId,
      action: 'todo.bulk_update',
      module: 'task',
      resourceType: 'todo',
      details: { ids: dto.ids, done: dto.done, count: result.updated },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post('bulk/category')
  async bulkChangeCategory(
    @Req() req: any,
    @Body() dto: { ids: string[]; category: string | null },
  ) {
    const result = await this.todos.bulkUpdateCategory(
      req.user.userId,
      dto.ids,
      dto.category,
    );
    await this.audit.log({
      userId: req.user.userId,
      action: 'todo.bulk_update',
      module: 'task',
      resourceType: 'todo',
      details: { ids: dto.ids, category: dto.category, count: result.updated },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post('bulk/delete')
  async bulkDelete(@Req() req: any, @Body() dto: { ids: string[] }) {
    const result = await this.todos.bulkDelete(req.user.userId, dto.ids);
    await this.audit.log({
      userId: req.user.userId,
      action: 'todo.bulk_delete',
      module: 'task',
      resourceType: 'todo',
      details: { ids: dto.ids, count: result.deleted },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
