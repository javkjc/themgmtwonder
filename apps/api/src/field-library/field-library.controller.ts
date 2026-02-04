import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard, AdminGuard } from '../auth/auth.guard';
import { FieldLibraryService } from './field-library.service';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';

@Controller('fields')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FieldLibraryController {
  constructor(private readonly fieldLibraryService: FieldLibraryService) { }

  @Get()
  async listFields(@Query('status') status?: 'active' | 'hidden' | 'archived') {
    return this.fieldLibraryService.listFields(status);
  }

  @Get(':fieldKey')
  async getField(@Param('fieldKey') fieldKey: string) {
    return this.fieldLibraryService.getFieldByKey(fieldKey);
  }

  @Post()
  async createField(
    @Body() dto: CreateFieldDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.fieldLibraryService.createField(dto, req.user.userId);
  }

  @Put(':fieldKey')
  async updateField(
    @Param('fieldKey') fieldKey: string,
    @Body() dto: UpdateFieldDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.fieldLibraryService.updateField(fieldKey, dto, req.user.userId);
  }

  @Patch(':fieldKey/hide')
  async hideField(
    @Param('fieldKey') fieldKey: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.fieldLibraryService.hideField(fieldKey, req.user.userId);
  }

  @Patch(':fieldKey/unhide')
  async unhideField(
    @Param('fieldKey') fieldKey: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.fieldLibraryService.unhideField(fieldKey, req.user.userId);
  }

  @Patch(':fieldKey/archive')
  async archiveField(
    @Param('fieldKey') fieldKey: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.fieldLibraryService.archiveField(fieldKey, req.user.userId);
  }
}
