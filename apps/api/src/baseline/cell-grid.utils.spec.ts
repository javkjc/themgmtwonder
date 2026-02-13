import { createPlaceholderCell, reconstructCellGrid } from './cell-grid.utils';
import type { Cell } from '../common/types';

describe('Cell Grid Utils', () => {
  describe('createPlaceholderCell', () => {
    it('should create a valid placeholder cell with correct properties', () => {
      const tableId = 'table-123';
      const rowIndex = 2;
      const columnIndex = 5;

      const placeholder = createPlaceholderCell(tableId, rowIndex, columnIndex);

      expect(placeholder).toMatchObject({
        tableId,
        rowIndex,
        columnIndex,
        cellValue: '',
        validationStatus: 'valid',
        errorText: null,
        correctionFrom: null,
        correctionReason: null,
      });
      expect(placeholder.id).toContain('placeholder');
      expect(placeholder.id).toContain(tableId);
      expect(placeholder.updatedAt).toBeInstanceOf(Date);
    });

    it('should create unique IDs for different positions', () => {
      const tableId = 'table-123';

      const cell1 = createPlaceholderCell(tableId, 0, 0);
      const cell2 = createPlaceholderCell(tableId, 0, 1);
      const cell3 = createPlaceholderCell(tableId, 1, 0);

      expect(cell1.id).not.toBe(cell2.id);
      expect(cell1.id).not.toBe(cell3.id);
      expect(cell2.id).not.toBe(cell3.id);
    });
  });

  describe('reconstructCellGrid', () => {
    const tableId = 'table-abc';

    const createCell = (
      rowIndex: number,
      columnIndex: number,
      cellValue: string = '',
    ): Cell => ({
      id: `cell-${rowIndex}-${columnIndex}`,
      tableId,
      rowIndex,
      columnIndex,
      cellValue,
      validationStatus: 'valid',
      errorText: null,
      correctionFrom: null,
      correctionReason: null,
      updatedAt: new Date(),
    });

    it('should reconstruct a complete 3x3 grid without gaps', () => {
      const cellsFlat: Cell[] = [
        createCell(0, 0, 'A1'),
        createCell(0, 1, 'B1'),
        createCell(0, 2, 'C1'),
        createCell(1, 0, 'A2'),
        createCell(1, 1, 'B2'),
        createCell(1, 2, 'C2'),
        createCell(2, 0, 'A3'),
        createCell(2, 1, 'B3'),
        createCell(2, 2, 'C3'),
      ];

      const grid = reconstructCellGrid(cellsFlat, 3, 3, tableId);

      expect(grid).toHaveLength(3);
      expect(grid[0]).toHaveLength(3);
      expect(grid[0][0].cellValue).toBe('A1');
      expect(grid[1][1].cellValue).toBe('B2');
      expect(grid[2][2].cellValue).toBe('C3');

      // Verify all cells are from original data
      grid.forEach((row) => {
        row.forEach((cell) => {
          expect(cell.id).toContain('cell-');
        });
      });
    });

    it('should fill missing cells with placeholders (sparse data)', () => {
      // Missing cells at (0,1), (1,0), (1,2)
      const cellsFlat: Cell[] = [
        createCell(0, 0, 'A1'),
        createCell(0, 2, 'C1'),
        createCell(1, 1, 'B2'),
        createCell(2, 0, 'A3'),
        createCell(2, 1, 'B3'),
        createCell(2, 2, 'C3'),
      ];

      const grid = reconstructCellGrid(cellsFlat, 3, 3, tableId);

      expect(grid).toHaveLength(3);
      expect(grid[0]).toHaveLength(3);
      expect(grid[1]).toHaveLength(3);
      expect(grid[2]).toHaveLength(3);

      // Verify existing cells
      expect(grid[0][0].cellValue).toBe('A1');
      expect(grid[0][2].cellValue).toBe('C1');
      expect(grid[1][1].cellValue).toBe('B2');

      // Verify placeholders
      expect(grid[0][1].id).toContain('placeholder');
      expect(grid[0][1].rowIndex).toBe(0);
      expect(grid[0][1].columnIndex).toBe(1);
      expect(grid[0][1].cellValue).toBe('');

      expect(grid[1][0].id).toContain('placeholder');
      expect(grid[1][2].id).toContain('placeholder');
    });

    it('should handle empty cell array (all placeholders)', () => {
      const cellsFlat: Cell[] = [];

      const grid = reconstructCellGrid(cellsFlat, 2, 2, tableId);

      expect(grid).toHaveLength(2);
      expect(grid[0]).toHaveLength(2);
      expect(grid[1]).toHaveLength(2);

      // All should be placeholders
      grid.forEach((row, r) => {
        row.forEach((cell, c) => {
          expect(cell.id).toContain('placeholder');
          expect(cell.rowIndex).toBe(r);
          expect(cell.columnIndex).toBe(c);
          expect(cell.cellValue).toBe('');
        });
      });
    });

    it('should handle single row grid', () => {
      const cellsFlat: Cell[] = [
        createCell(0, 0, 'A'),
        createCell(0, 1, 'B'),
        createCell(0, 2, 'C'),
      ];

      const grid = reconstructCellGrid(cellsFlat, 1, 3, tableId);

      expect(grid).toHaveLength(1);
      expect(grid[0]).toHaveLength(3);
      expect(grid[0][0].cellValue).toBe('A');
      expect(grid[0][1].cellValue).toBe('B');
      expect(grid[0][2].cellValue).toBe('C');
    });

    it('should handle single column grid', () => {
      const cellsFlat: Cell[] = [
        createCell(0, 0, 'Row1'),
        createCell(1, 0, 'Row2'),
        createCell(2, 0, 'Row3'),
      ];

      const grid = reconstructCellGrid(cellsFlat, 3, 1, tableId);

      expect(grid).toHaveLength(3);
      grid.forEach((row) => {
        expect(row).toHaveLength(1);
      });
      expect(grid[0][0].cellValue).toBe('Row1');
      expect(grid[1][0].cellValue).toBe('Row2');
      expect(grid[2][0].cellValue).toBe('Row3');
    });

    it('should handle 1x1 grid', () => {
      const cellsFlat: Cell[] = [createCell(0, 0, 'Single')];

      const grid = reconstructCellGrid(cellsFlat, 1, 1, tableId);

      expect(grid).toHaveLength(1);
      expect(grid[0]).toHaveLength(1);
      expect(grid[0][0].cellValue).toBe('Single');
    });

    it('should handle missing cells at the end of rows', () => {
      // Grid is 2x3 but we're missing the last column of each row
      const cellsFlat: Cell[] = [
        createCell(0, 0, 'A1'),
        createCell(0, 1, 'B1'),
        createCell(1, 0, 'A2'),
        createCell(1, 1, 'B2'),
      ];

      const grid = reconstructCellGrid(cellsFlat, 2, 3, tableId);

      expect(grid).toHaveLength(2);
      expect(grid[0]).toHaveLength(3);
      expect(grid[1]).toHaveLength(3);

      // Existing cells
      expect(grid[0][0].cellValue).toBe('A1');
      expect(grid[0][1].cellValue).toBe('B1');
      expect(grid[1][0].cellValue).toBe('A2');
      expect(grid[1][1].cellValue).toBe('B2');

      // Placeholders at end
      expect(grid[0][2].id).toContain('placeholder');
      expect(grid[1][2].id).toContain('placeholder');
    });

    it('should preserve validation status from actual cells', () => {
      const invalidCell: Cell = {
        id: 'cell-invalid',
        tableId,
        rowIndex: 0,
        columnIndex: 0,
        cellValue: 'abc',
        validationStatus: 'invalid',
        errorText: 'Must be a number',
        correctionFrom: '123',
        correctionReason: 'User correction',
        updatedAt: new Date(),
      };

      const cellsFlat: Cell[] = [invalidCell];

      const grid = reconstructCellGrid(cellsFlat, 1, 1, tableId);

      expect(grid[0][0]).toEqual(invalidCell);
      expect(grid[0][0].validationStatus).toBe('invalid');
      expect(grid[0][0].errorText).toBe('Must be a number');
    });

    it('should maintain correct dimensions for large grids', () => {
      // Create a 100x10 grid with only first and last cells populated
      const cellsFlat: Cell[] = [
        createCell(0, 0, 'First'),
        createCell(99, 9, 'Last'),
      ];

      const grid = reconstructCellGrid(cellsFlat, 100, 10, tableId);

      expect(grid).toHaveLength(100);
      grid.forEach((row) => {
        expect(row).toHaveLength(10);
      });

      expect(grid[0][0].cellValue).toBe('First');
      expect(grid[99][9].cellValue).toBe('Last');

      // Spot check some placeholders
      expect(grid[0][1].id).toContain('placeholder');
      expect(grid[50][5].id).toContain('placeholder');
    });

    it('should return an empty grid when rowCount is 0', () => {
      const cellsFlat: Cell[] = [createCell(0, 0, 'A1')];

      const grid = reconstructCellGrid(cellsFlat, 0, 3, tableId);

      expect(grid).toEqual([]);
    });

    it('should return empty rows when columnCount is 0', () => {
      const cellsFlat: Cell[] = [createCell(0, 0, 'A1')];

      const grid = reconstructCellGrid(cellsFlat, 3, 0, tableId);

      expect(grid).toHaveLength(3);
      grid.forEach((row) => {
        expect(row).toEqual([]);
      });
    });

    it('should preserve object identity for existing cells', () => {
      const cellA = createCell(0, 0, 'A1');
      const cellB = createCell(0, 1, 'B1');
      const cellsFlat: Cell[] = [cellA, cellB];

      const grid = reconstructCellGrid(cellsFlat, 1, 2, tableId);

      expect(grid[0][0]).toBe(cellA);
      expect(grid[0][1]).toBe(cellB);
    });

    it('should fill leading gaps before the first provided cell', () => {
      const cellsFlat: Cell[] = [createCell(0, 2, 'C1')];

      const grid = reconstructCellGrid(cellsFlat, 1, 3, tableId);

      expect(grid[0][0].id).toContain('placeholder');
      expect(grid[0][1].id).toContain('placeholder');
      expect(grid[0][2].cellValue).toBe('C1');
    });

    it('should ignore cells that are outside the expected grid bounds', () => {
      const outOfBounds: Cell = createCell(5, 5, 'Out');
      const cellsFlat: Cell[] = [outOfBounds];

      const grid = reconstructCellGrid(cellsFlat, 2, 2, tableId);

      expect(grid).toHaveLength(2);
      expect(grid[0]).toHaveLength(2);
      expect(grid[1]).toHaveLength(2);
      grid.forEach((row) => {
        row.forEach((cell) => {
          expect(cell.id).toContain('placeholder');
        });
      });
    });
  });
});
