import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { CategoriesService } from './categories.service';
import { AuditService } from '../audit/audit.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
@UseGuards(JwtAuthGuard, CsrfGuard)
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  @UseGuards(AdminGuard)
  async create(@Req() req: any, @Body() dto: CreateCategoryDto) {
    const result = await this.categoriesService.create(
      req.user.userId,
      dto.name,
      dto.color,
    );
    await this.audit.log({
      userId: req.user.userId,
      action: 'category.create',
      module: 'category',
      resourceType: 'category',
      resourceId: result.id,
      details: { name: dto.name, color: dto.color },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const result = await this.categoriesService.update(id, dto);
    await this.audit.log({
      userId: req.user.userId,
      action: 'category.update',
      module: 'category',
      resourceType: 'category',
      resourceId: id,
      details: dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async delete(@Req() req: any, @Param('id') id: string) {
    const result = await this.categoriesService.delete(id);
    await this.audit.log({
      userId: req.user.userId,
      action: 'category.delete',
      module: 'category',
      resourceType: 'category',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return result;
  }

  @Post('seed-defaults')
  @UseGuards(AdminGuard)
  async seedDefaults(@Req() req: any) {
    return this.categoriesService.seedDefaults(req.user.userId);
  }
}
