import type { Cell } from '../common/types';

/**
 * Creates a placeholder cell for missing grid positions
 */
export function createPlaceholderCell(
  tableId: string,
  rowIndex: number,
  columnIndex: number,
): Cell {
  return {
    id: `placeholder-${tableId}-${rowIndex}-${columnIndex}`,
    tableId,
    rowIndex,
    columnIndex,
    cellValue: '',
    validationStatus: 'valid',
    errorText: null,
    correctionFrom: null,
    correctionReason: null,
    updatedAt: new Date(),
  };
}

/**
 * Reconstructs a 2D cell grid from flat, ordered cell array
 *
 * Assumes cellsFlat is pre-sorted by rowIndex, columnIndex.
 * Fills missing cells with placeholders to maintain grid integrity.
 *
 * @param cellsFlat - Flat array of cells ordered by rowIndex, columnIndex
 * @param rowCount - Expected number of rows
 * @param columnCount - Expected number of columns
 * @param tableId - Table ID for placeholder generation
 * @returns 2D array [row][column] of cells
 */
export function reconstructCellGrid(
  cellsFlat: Cell[],
  rowCount: number,
  columnCount: number,
  tableId: string,
): Cell[][] {
  const grid: Cell[][] = [];
  let flatIndex = 0;

  for (let r = 0; r < rowCount; r++) {
    const row: Cell[] = [];

    for (let c = 0; c < columnCount; c++) {
      const cell = cellsFlat[flatIndex];

      // Check if current cell matches expected position
      if (cell && cell.rowIndex === r && cell.columnIndex === c) {
        row.push(cell);
        flatIndex++;
      } else {
        // Cell missing at this position - use placeholder
        row.push(createPlaceholderCell(tableId, r, c));
      }
    }

    grid.push(row);
  }

  return grid;
}
