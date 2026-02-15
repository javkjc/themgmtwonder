import { Test, TestingModule } from '@nestjs/testing';
import { MlMetricsService } from './ml-metrics.service';
import { DbService } from '../db/db.service';
import { sql } from 'drizzle-orm';

describe('MlMetricsService', () => {
    let service: MlMetricsService;
    let dbService: DbService;

    beforeEach(async () => {
        const mockDb: any = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            groupBy: jest.fn().mockReturnThis(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MlMetricsService,
                {
                    provide: DbService,
                    useValue: { db: mockDb },
                },
            ],
        }).compile();

        service = module.get<MlMetricsService>(MlMetricsService);
        dbService = module.get<DbService>(DbService);
    });

    it('should compute metrics correctly from assignments and audit logs', async () => {
        // Mock assignment stats
        const mockAssignmentStats = [
            { fieldKey: 'total_amount', suggestionAccepted: true, count: 8 },
            { fieldKey: 'total_amount', suggestionAccepted: false, count: 2 },
            { fieldKey: 'date', suggestionAccepted: true, count: 5 },
        ];

        // Mock clear stats
        const mockClearStats = [
            { fieldKey: 'date', count: 5 },
        ];

        // Set up mock return values for the two queries
        (dbService.db as any)
            .groupBy.mockResolvedValueOnce(mockAssignmentStats) // First call for assignments
            .mockResolvedValueOnce(mockClearStats);     // Second call for clears

        const result = await service.getMetrics();

        // Calculations:
        // total_amount: 8 accepted, 2 modified, 0 cleared. Total = 10. Accuracy = 0.8
        // date: 5 accepted, 0 modified, 5 cleared. Total = 10. Accuracy = 0.5
        // Global:
        // Total Accepted = 8 + 5 = 13
        // Total Modified = 2
        // Total Cleared = 5
        // Total Acted = 13 + 2 + 5 = 20
        // Accept Rate = 13 / 20 = 0.65
        // Modify Rate = 2 / 20 = 0.1
        // Clear Rate = 5 / 20 = 0.25
        // Top-1 Accuracy = 13 / 20 = 0.65

        expect(result.totalActed).toBe(20);
        expect(result.acceptRate).toBe(0.65);
        expect(result.modifyRate).toBe(0.1);
        expect(result.clearRate).toBe(0.25);
        expect(result.top1Accuracy).toBe(0.65);

        expect(result.fieldConfusion).toHaveLength(2);
        const dateConfusion = result.fieldConfusion.find(f => f.fieldKey === 'date');
        expect(dateConfusion?.accuracy).toBe(0.5);
        expect(dateConfusion?.cleared).toBe(5);
    });

    it('should return zeros when no data is found', async () => {
        (dbService.db as any)
            .groupBy.mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await service.getMetrics();

        expect(result.totalActed).toBe(0);
        expect(result.acceptRate).toBe(0);
        expect(result.fieldConfusion).toHaveLength(0);
    });
});
