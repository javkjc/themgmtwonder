import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard, JwtAuthGuard } from '../auth/auth.guard';
import { AddDocumentTypeFieldDto } from './dto/add-document-type-field.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeFieldDto } from './dto/update-document-type-field.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { DocumentTypesService } from './document-types.service';

@Controller('document-types')
@UseGuards(JwtAuthGuard)
export class DocumentTypesController {
  constructor(private readonly documentTypesService: DocumentTypesService) {}

  @Get()
  async listDocumentTypes() {
    return this.documentTypesService.listDocumentTypes();
  }

  @Post()
  @UseGuards(AdminGuard)
  async createDocumentType(@Body() dto: CreateDocumentTypeDto) {
    return this.documentTypesService.createDocumentType(dto);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  async updateDocumentType(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentTypeDto,
  ) {
    return this.documentTypesService.updateDocumentType(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async deleteDocumentType(@Param('id') id: string) {
    return this.documentTypesService.deleteDocumentType(id);
  }

  @Get(':id/fields')
  async getDocumentTypeFields(@Param('id') id: string) {
    return this.documentTypesService.getDocumentTypeFields(id);
  }

  @Post(':id/fields')
  @UseGuards(AdminGuard)
  async addFieldToDocumentType(
    @Param('id') id: string,
    @Body() dto: AddDocumentTypeFieldDto,
  ) {
    return this.documentTypesService.addFieldToDocumentType(id, dto);
  }

  @Patch(':id/fields/:fieldKey')
  @UseGuards(AdminGuard)
  async updateDocumentTypeField(
    @Param('id') id: string,
    @Param('fieldKey') fieldKey: string,
    @Body() dto: UpdateDocumentTypeFieldDto,
  ) {
    return this.documentTypesService.updateDocumentTypeField(id, fieldKey, dto);
  }

  @Delete(':id/fields/:fieldKey')
  @UseGuards(AdminGuard)
  async removeFieldFromDocumentType(
    @Param('id') id: string,
    @Param('fieldKey') fieldKey: string,
  ) {
    return this.documentTypesService.removeFieldFromDocumentType(id, fieldKey);
  }
}
