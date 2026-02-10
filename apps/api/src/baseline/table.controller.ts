import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Req,
    UseGuards,
    ForbiddenException,
    NotFoundException,
    ParseIntPipe,
    BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CsrfGuard } from '../common/csrf';
import { TableManagementService } from './table-management.service';
import { DbService } from '../db/db.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateCellDto } from './dto/update-cell.dto';
import { AssignColumnDto } from './dto/assign-column.dto';
import { DeleteRowDto } from './dto/delete-row.dto';
import { AuthorizationService } from '../common/authorization.service';

type RequestWithUser = { user: { userId: string } };

@UseGuards(JwtAuthGuard, CsrfGuard)
@Controller()
export class TableController {
    constructor(
        private readonly tableService: TableManagementService,
        private readonly dbs: DbService,
        private readonly authService: AuthorizationService,
    ) { }

    @Post('baselines/:baselineId/tables')
    async createTable(
        @Req() req: RequestWithUser,
        @Param('baselineId') baselineId: string,
        @Body() dto: CreateTableDto,
    ) {
        await this.authService.ensureUserOwnsBaseline(req.user.userId, baselineId);

        let cellValues = dto.cellValues;
        if (!cellValues || !Array.isArray(cellValues)) {
            if (!dto.rowCount || !dto.columnCount) {
                throw new BadRequestException('rowCount and columnCount are required when cellValues is not provided');
            }
            const rowCount = dto.rowCount;
            const columnCount = dto.columnCount;
            cellValues = Array.from({ length: rowCount }, () =>
                Array.from({ length: columnCount }, () => ''),
            );
        }

        return await this.tableService.createTable(baselineId, req.user.userId, {
            label: dto.tableLabel,
            cellValues,
        });
    }

    @Get('baselines/:baselineId/tables')
    async listTables(
        @Req() req: RequestWithUser,
        @Param('baselineId') baselineId: string,
    ) {
        await this.authService.ensureUserOwnsBaseline(req.user.userId, baselineId);

        // Return summary list
        return await this.tableService.listTablesForBaseline(baselineId); // replaced tables query

    }

    @Get('tables/:tableId')
    async getTable(
        @Req() req: RequestWithUser,
        @Param('tableId') tableId: string,
    ) {
        await this.authService.ensureUserOwnsTable(req.user.userId, tableId);

        return await this.tableService.getTableDetails(tableId); // replaced getTable logic

    }

    @Delete('tables/:tableId')
    async deleteTable(
        @Req() req: RequestWithUser,
        @Param('tableId') tableId: string,
    ) {
        await this.authService.ensureUserOwnsTable(req.user.userId, tableId);

        return await this.tableService.deleteTable(tableId, req.user.userId);
    }

    @Put('tables/:tableId/cells/:rowIndex/:columnIndex')
    async updateCell(
        @Req() req: RequestWithUser,
        @Param('tableId') tableId: string,
        @Param('rowIndex', ParseIntPipe) rowIndex: number,
        @Param('columnIndex', ParseIntPipe) columnIndex: number,
        @Body() dto: UpdateCellDto,
    ) {
        // Ownership check is inside service call (via ensureEditable) but we should check broad access first
        // actually service.updateCell calls getTableWithBaseline which fetches and checks logic.
        // But we need to ensure USER owns it. Service takes userId but relies on AuditService for logging.
        // Does TableManagementService ensure the user is the owner of the baseline?
        // Looking at A2 code... `createTable` takes userId but doesn't check owner.
        // `updateCell` takes userId but doesn't check owner.
        // So Controller MUST check ownership.

        await this.authService.ensureUserOwnsTable(req.user.userId, tableId);

        return await this.tableService.updateCell(
            tableId,
            rowIndex,
            columnIndex,
            dto.value || '', // Handle null/undefined as empty string if needed, though validator ensures string
            req.user.userId,
            dto.correctionReason,
        );
    }

    @Delete('tables/:tableId/rows/:rowIndex')
    async deleteRow(
        @Req() req: RequestWithUser,
        @Param('tableId') tableId: string,
        @Param('rowIndex', ParseIntPipe) rowIndex: number,
        @Body() dto: DeleteRowDto,
    ) {
        await this.authService.ensureUserOwnsTable(req.user.userId, tableId);

        return await this.tableService.deleteRow(
            tableId,
            rowIndex,
            req.user.userId,
            dto.reason,
        );
    }

    @Post('tables/:tableId/columns/:columnIndex/assign')
    async assignColumn(
        @Req() req: RequestWithUser,
        @Param('tableId') tableId: string,
        @Param('columnIndex', ParseIntPipe) columnIndex: number,
        @Body() dto: AssignColumnDto,
    ) {
        await this.authService.ensureUserOwnsTable(req.user.userId, tableId);

        return await this.tableService.assignColumnToField(
            tableId,
            columnIndex,
            dto.fieldKey,
            req.user.userId,
            dto.correctionReason,
        );
    }

    @Post('tables/:tableId/confirm')
    async confirmTable(
        @Req() req: RequestWithUser,
        @Param('tableId') tableId: string,
    ) {
        await this.authService.ensureUserOwnsTable(req.user.userId, tableId);

        return await this.tableService.confirmTable(
            tableId,
            req.user.userId,
        );
    }

}
