import {
    Controller,
    Post,
    Get,
    Param,
    Body,
    UseGuards,
    Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { TableSuggestionService } from './table-suggestion.service';
import { TableManagementService } from '../baseline/table-management.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class TableSuggestionController {
    constructor(
        private readonly tableSuggestionService: TableSuggestionService,
        private readonly tableManagementService: TableManagementService,
    ) {}

    /**
     * POST /attachments/:attachmentId/table-suggestions/detect
     * Detect tables using ML service and persist as pending suggestions
     */
    @Post('attachments/:attachmentId/table-suggestions/detect')
    async detectTables(
        @Param('attachmentId') attachmentId: string,
        @Request() req,
        @Body() body: { threshold?: number },
    ) {
        const userId = req.user.userId;
        const result = await this.tableSuggestionService.detectTables({
            attachmentId,
            userId,
            threshold: body.threshold,
        });

        return result;
    }

    /**
     * GET /attachments/:attachmentId/table-suggestions
     * List pending table suggestions for an attachment
     */
    @Get('attachments/:attachmentId/table-suggestions')
    async listSuggestions(
        @Param('attachmentId') attachmentId: string,
        @Request() req,
    ) {
        const userId = req.user.userId;
        const suggestions = await this.tableSuggestionService.listSuggestions(
            attachmentId,
            userId,
        );

        return { suggestions };
    }

    /**
     * POST /table-suggestions/:id/ignore
     * Mark a suggestion as ignored
     */
    @Post('table-suggestions/:id/ignore')
    async ignoreSuggestion(@Param('id') suggestionId: string, @Request() req) {
        const userId = req.user.userId;
        const result = await this.tableSuggestionService.ignoreSuggestion({
            suggestionId,
            userId,
        });

        return result;
    }

    /**
     * POST /table-suggestions/:id/convert
     * Convert a suggestion into a baseline table
     * Returns the new table ID for frontend redirection
     */
    @Post('table-suggestions/:id/convert')
    async convertSuggestion(@Param('id') suggestionId: string, @Request() req) {
        const userId = req.user.userId;

        // 1. Convert suggestion (marks as converted, returns cell data)
        const conversionResult =
            await this.tableSuggestionService.convertSuggestion({
                suggestionId,
                userId,
            });

        // 2. Create baseline table using table management service
        const table = await this.tableManagementService.createTable(
            conversionResult.baselineId,
            userId,
            {
                label: conversionResult.label,
                cellValues: conversionResult.cellValues,
            },
        );

        // 3. Return success with table ID for redirect
        return {
            success: true,
            tableId: table.id,
            redirectUrl: `/tables/${table.id}`,
        };
    }
}
