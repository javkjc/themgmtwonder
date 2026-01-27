import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { RemarksService } from './remarks.service';
import { AuditService } from '../audit/audit.service';
import { CreateRemarkDto } from './dto/create-remark.dto';

@Controller('remarks')
@UseGuards(JwtAuthGuard, CsrfGuard)
export class RemarksController {
  constructor(
    private readonly remarksService: RemarksService,
    private readonly audit: AuditService,
  ) {}

  @Get('todo/:todoId')
  async listByTodo(
    @Param('todoId') todoId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Request() req?,
  ) {
    const userId = req.user.userId;
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    return this.remarksService.listByTodo(
      todoId,
      userId,
      parsedLimit,
      parsedOffset,
    );
  }

  @Post('todo/:todoId')
  async create(
    @Param('todoId') todoId: string,
    @Body() dto: CreateRemarkDto,
    @Request() req?,
  ) {
    const userId = req.user.userId;
    const result = await this.remarksService.create(todoId, userId, dto);
    await this.audit.log({
      userId,
      action: 'remark.create',
      module: 'remark',
      resourceType: 'remark',
      resourceId: result.id,
      details: { todoId, content: dto.content },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req?) {
    const userId = req.user.userId;
    const result = await this.remarksService.delete(id, userId);
    await this.audit.log({
      userId,
      action: 'remark.delete',
      module: 'remark',
      resourceType: 'remark',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
