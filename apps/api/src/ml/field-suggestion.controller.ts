import {
  Controller,
  Post,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { FieldSuggestionService } from './field-suggestion.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class FieldSuggestionController {
  constructor(
    private readonly fieldSuggestionService: FieldSuggestionService,
  ) {}

  @Post('baselines/:baselineId/suggestions/generate')
  @HttpCode(HttpStatus.OK)
  async generateSuggestions(
    @Param('baselineId') baselineId: string,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    return this.fieldSuggestionService.generateSuggestions(baselineId, userId);
  }
}
