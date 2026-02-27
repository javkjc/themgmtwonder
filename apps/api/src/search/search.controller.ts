import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { AuditService } from '../audit/audit.service';
import { createHash } from 'crypto';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
    constructor(
        private readonly searchService: SearchService,
        private readonly auditService: AuditService,
    ) { }

    @Get('extractions')
    async searchExtractions(
        @Req() req: any,
        @Query('q') q: string,
        @Query('documentType') documentType?: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('limit') limit?: string,
    ) {
        if (!q) {
            return { results: [] };
        }
        const dFrom = dateFrom ? new Date(dateFrom) : undefined;
        const dTo = dateTo ? new Date(dateTo) : undefined;
        const limitNum = limit ? parseInt(limit, 10) : 20;

        const response = await this.searchService.searchExtractions(q, documentType, dFrom, dTo, limitNum);

        const queryHash = createHash('sha256').update(q).digest('hex');
        const filterApplied = !!(documentType || dateFrom || dateTo);

        await this.auditService.log({
            userId: req.user?.id,
            action: 'search.extractions',
            resourceType: 'search',
            details: {
                queryHash,
                filterApplied,
                resultCount: response.results.length,
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });

        return response;
    }
}
