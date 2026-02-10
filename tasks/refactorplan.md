Comprehensive Module-by-Module Refactoring Plan
Context
This refactoring addresses critical technical debt across both the API (NestJS) and Web (Next.js) modules of the todo-docker monorepo. The codebase has grown to include complex features (OCR review, baseline management, table extraction) without systematic refactoring, leading to:

API Issues:

Excessive any types breaking type safety (7+ instances in table-management.service.ts)
Code duplication with 15+ repeated authorization checks across 4 files
Missing test coverage for critical services (0% for BaselineManagementService, TableManagementService)
Inefficient algorithms (O(n²) cell grid reconstruction)
Scattered validation constants
Web Issues:

God component (review/page.tsx at 1,530 lines with 30+ useState hooks)
Inline style duplication across 30+ files (689 hardcoded color instances)
No unit tests (only E2E Playwright tests)
Modal state proliferation (6+ separate modal states)
Validation logic duplication
User Requirements:

Approach: Test-first refactoring (write tests BEFORE changing code)
Scope: Comprehensive restructure (~2 weeks, 100 hours effort)
Breaking Changes: Acceptable if architecturally justified
Priority: Both API and Web modules in parallel
This plan restructures the codebase systematically while maintaining backward compatibility and ensuring no regressions through comprehensive testing.

Implementation Strategy
Phased Approach (7 Phases)
Phases 1-3: API refactoring (test coverage → common utilities → service extraction)
Phases 4-6: Web refactoring (shared styles → base components → god component decomposition)
Phase 7: Integration testing and verification

Parallel Execution:

API (Phases 1-3) and Web (Phases 4-6) can be developed simultaneously
Phase 7 requires both tracks complete
Total Estimated Effort: ~100 hours (2-2.5 weeks)

PHASE 1: API Foundation - Common Utilities & Type Safety (12 hours)
Objective
Extract duplicated patterns and establish type safety foundation before refactoring services.

1.1 Create AuthorizationService (Test-First)
Problem: 15+ duplicated authorization methods across 4 files (table.controller.ts, baseline.controller.ts, baseline-assignments.service.ts, ocr.service.ts)

Test File: c:\todo-docker\apps\api\src\common\authorization.service.spec.ts


describe('AuthorizationService', () => {
  it('should allow owner to access todo');
  it('should throw ForbiddenException for non-owner');
  it('should validate attachment ownership through todo chain');
  it('should validate baseline ownership through attachment → todo chain');
  it('should validate table ownership through baseline → attachment → todo chain');
  it('should throw NotFoundException for missing resources');
});
Implementation File: c:\todo-docker\apps\api\src\common\authorization.service.ts


@Injectable()
export class AuthorizationService {
  constructor(private readonly dbs: DbService) {}

  async ensureUserOwnsTodo(userId: string, todoId: string): Promise<Todo>
  async ensureUserOwnsAttachment(userId: string, attachmentId: string): Promise<{attachment: Attachment, todo: Todo}>
  async ensureUserOwnsBaseline(userId: string, baselineId: string): Promise<{baseline: Baseline, attachment: Attachment, todo: Todo}>
  async ensureUserOwnsTable(userId: string, tableId: string): Promise<{table: Table, baseline: Baseline, attachment: Attachment, todo: Todo}>
}
Files to Refactor (Phase 2):

apps/api/src/baseline/table.controller.ts (lines 203-223, 173-193)
apps/api/src/baseline/baseline.controller.ts (lines 243-258)
apps/api/src/baseline/baseline-assignments.service.ts (lines 386-408)
apps/api/src/ocr/ocr.service.ts (lines 848-866)
Impact: Eliminates 40+ lines of duplicated code, centralizes security logic.

1.2 Create Validation Constants (Test-First)
Problem: Hardcoded validation limits scattered across codebase (1000 rows, 50 cols, 5000 char cells, etc.)

Test File: c:\todo-docker\apps\api\src\common\constants.spec.ts


describe('Validation Constants', () => {
  it('should have all required table limits');
  it('should validate table dimensions correctly');
  it('should reject oversized tables');
  it('should validate cell value length');
});
Implementation File: c:\todo-docker\apps\api\src\common\constants.ts


export const TABLE_LIMITS = {
  MAX_ROWS: 1000,
  MAX_COLUMNS: 50,
  MAX_CELLS: 50000,
  MAX_CELL_LENGTH: 5000,
} as const;

export const validateTableDimensions = (rows: number, cols: number): void => {
  if (rows < 1 || cols < 1) throw new BadRequestException('Table must have at least 1 row and 1 column');
  if (rows > TABLE_LIMITS.MAX_ROWS || cols > TABLE_LIMITS.MAX_COLUMNS) throw new BadRequestException(`Table size exceeds limits`);
  if (rows * cols > TABLE_LIMITS.MAX_CELLS) throw new BadRequestException('Table exceeds maximum cell count');
};

export const validateCellValue = (value: string): void => {
  if (value && value.length > TABLE_LIMITS.MAX_CELL_LENGTH) throw new BadRequestException('Cell value too long');
};
Impact: Single source of truth for validation limits.

1.3 Extract Type Definitions
Problem: 7+ any return types in table-management.service.ts (lines 42, 107, 166, 264, 373, 431, 492)

Implementation File: c:\todo-docker\apps\api\src\common\types.ts


export type Table = typeof baselineTables.$inferSelect;
export type TableInsert = typeof baselineTables.$inferInsert;
export type Cell = typeof baselineTableCells.$inferSelect;
export type ColumnMapping = typeof baselineTableColumnMappings.$inferSelect;
export type Assignment = typeof baselineFieldAssignments.$inferSelect;
export type Baseline = typeof extractionBaselines.$inferSelect;

export interface TableWithDetails {
  table: Table;
  cells: Cell[][];
  columnMappings: ColumnMapping[];
}

export interface BaselineContext {
  id: string;
  attachmentId: string;
  status: string;
  utilizationType: string | null;
  utilizedAt: Date | null;
  ownerId: string;
}
Impact: Replace all any with proper TypeScript types.

1.4 Update Common Module
File: c:\todo-docker\apps\api\src\common\common.module.ts

Add AuthorizationService to providers and exports
Register as global module if needed
Verification:


cd apps/api
npm test -- common/*.spec.ts --coverage
# Target: 100% coverage for new utilities
Deliverables:

✅ AuthorizationService with 100% test coverage
✅ Validation constants with helper functions
✅ Type definitions extracted from schema
✅ All tests passing
PHASE 2: API Services Refactoring (20 hours)
Objective
Refactor core services to use common utilities, fix type safety, and add comprehensive tests.

2.1 Refactor TableManagementService (Test-First)
Test File: c:\todo-docker\apps\api\src\baseline\table-management.service.spec.ts

Test Coverage (30+ tests):


describe('TableManagementService', () => {
  describe('createTable', () => {
    it('should create table with valid dimensions');
    it('should reject if baseline is confirmed');
    it('should reject if baseline is archived');
    it('should reject if baseline is utilized');
    it('should reject dimensions exceeding limits');
    it('should reject inconsistent row lengths');
    it('should reject cell values exceeding character limit');
    it('should batch insert cells for large tables');
    it('should create audit log entry');
  });

  describe('assignColumnToField', () => {
    it('should assign column and validate all cells');
    it('should reject if column index out of bounds');
    it('should reject if field is inactive');
    it('should update cell validation statuses');
  });

  describe('updateCell', () => {
    it('should update cell with validation');
    it('should require correction reason for overwrites');
    it('should handle mapped vs unmapped cells differently');
  });

  describe('deleteRow', () => {
    it('should delete row and re-index remaining rows');
    it('should require correction reason');
    it('should decrement row count');
  });

  describe('confirmTable', () => {
    it('should confirm valid table');
    it('should reject if invalid cells exist');
    it('should be idempotent');
  });

  describe('getTableDetails', () => {
    it('should reconstruct 2D cell grid correctly');
    it('should throw for missing cells');
    it('should perform efficiently with large tables');
  });
});
Critical File: c:\todo-docker\apps\api\src\baseline\table-management.service.ts (696 lines)

Refactoring Tasks:

Replace all any types (lines 42, 107, 166, 264, 373, 431, 492):

// BEFORE (line 42)
async createTable(...): Promise<any> { ... }

// AFTER
async createTable(...): Promise<TableWithDetails> { ... }
Extract createTable logic (113 lines → 4 methods):

// Current: Lines 43-155 (113 lines, too complex)
// Split into:
private async validateBaselineEditable(tx: Transaction, baselineId: string): Promise<Baseline>
private async calculateNextTableIndex(tx: Transaction, baselineId: string): Promise<number>
private async insertTableCells(tx: Transaction, tableId: string, cellValues: string[][]): Promise<void>
async createTable(baselineId: string, userId: string, options: CreateTableOptions): Promise<TableWithDetails>
Fix cell grid reconstruction (lines 537-582):

// BEFORE: O(n²) with hardcoded 'missing' placeholders
let flatIndex = 0;
for (let r = 0; r < table.rowCount; r++) {
  for (let c = 0; c < table.columnCount; c++) {
    if (cell.rowIndex === r && cell.columnIndex === c) { /* ... */ }
    else { row.push({ id: 'missing', /* ... */ }); } // ← Bad
  }
}

// AFTER: O(n) with Map lookup
private reconstructCellGrid(cells: Cell[], rowCount: number, colCount: number): Cell[][] {
  const cellMap = new Map<string, Cell>();
  cells.forEach(cell => cellMap.set(`${cell.rowIndex},${cell.columnIndex}`, cell));

  return Array.from({length: rowCount}, (_, r) =>
    Array.from({length: colCount}, (_, c) => {
      const cell = cellMap.get(`${r},${c}`);
      if (!cell) throw new InternalServerErrorException(`Missing cell at (${r},${c})`);
      return cell;
    })
  );
}
Use AuthorizationService instead of local ensureUserOwnsAttachment

Use constants from common/constants.ts

Verification:


npm test -- baseline/table-management.service.spec.ts --coverage
# Target: >90% coverage
2.2 Refactor BaselineManagementService (Test-First)
Test File: c:\todo-docker\apps\api\src\baseline\baseline-management.service.spec.ts

Test Coverage (25+ tests):


describe('BaselineManagementService', () => {
  describe('createDraftBaseline', () => {
    it('should create draft with OCR data');
    it('should create draft without OCR data');
    it('should populate segments from extractedText');
    it('should populate assignments from parsed fields');
    it('should be idempotent');
  });

  describe('markReviewed', () => {
    it('should transition draft to reviewed');
    it('should reject if not draft');
    it('should create audit log');
  });

  describe('confirmBaseline', () => {
    it('should confirm baseline and archive previous');
    it('should reject if unconfirmed tables exist');
    it('should verify transaction atomicity');
    it('should include assignment counts in audit');
  });

  describe('archiveBaseline', () => {
    it('should archive confirmed baseline');
    it('should reject if not confirmed');
  });

  describe('markBaselineUtilized', () => {
    it('should mark as utilized (first-write-wins)');
    it('should reject non-confirmed baselines');
    it('should handle all utilization types');
  });
});
Critical File: c:\todo-docker\apps\api\src\baseline\baseline-management.service.ts

Refactoring Tasks:

Replace all any return types with Baseline type
Extract segment creation into private async createSegmentsFromText(tx, baselineId, text)
Extract assignment population into private async populateAssignmentsFromOcr(tx, baselineId, ocrFields)
Use constants from common/constants.ts
2.3 Refactor BaselineAssignmentsService (Test-First)
Test File: c:\todo-docker\apps\api\src\baseline\baseline-assignments.service.spec.ts

Test Coverage (20+ tests):


describe('BaselineAssignmentsService', () => {
  describe('upsertAssignment', () => {
    it('should create new assignment');
    it('should update existing assignment');
    it('should validate value against field type');
    it('should require confirmation for invalid values');
    it('should require correction reason for reviewed baselines');
    it('should create audit logs');
  });

  describe('deleteAssignment', () => {
    it('should delete assignment');
    it('should require correction reason');
    it('should create audit log');
  });

  describe('getAggregatedBaseline', () => {
    it('should include segments, assignments, tables');
    it('should work with/without OCR data');
    it('should perform efficiently with large datasets');
  });
});
Critical File: c:\todo-docker\apps\api\src\baseline\baseline-assignments.service.ts

Refactoring Tasks:

Use AuthorizationService instead of local ensureBaselineOwnership and ensureUserOwnsAttachment
Replace any types with proper types
Extract validation logic into separate method
2.4 Refactor FieldAssignmentValidatorService (Test-First)
Test File: c:\todo-docker\apps\api\src\baseline\field-assignment-validator.service.spec.ts

Test Coverage (15+ tests):


describe('FieldAssignmentValidatorService', () => {
  describe('validate', () => {
    it('should validate text fields');
    it('should validate numeric fields');
    it('should validate date fields');
    it('should validate email fields');
    it('should validate phone fields');
    it('should validate URL fields');
    it('should enforce character limits');
    it('should handle null/empty values');
    it('should provide suggested corrections');
  });
});
2.5 Update Controllers
Files to Update:

c:\todo-docker\apps\api\src\baseline\baseline.controller.ts
c:\todo-docker\apps\api\src\baseline\table.controller.ts
c:\todo-docker\apps\api\src\ocr\ocr.service.ts
Changes:


// Inject AuthorizationService
constructor(
  private readonly authService: AuthorizationService,
  // ... other services
) {}

// Replace local authorization methods
const {attachment, todo} = await this.authService.ensureUserOwnsAttachment(req.user.userId, attachmentId);
const {baseline, attachment, todo} = await this.authService.ensureUserOwnsBaseline(req.user.userId, baselineId);
Verification:


npm test -- baseline/**/*.spec.ts --coverage
# Target: >85% coverage across all baseline services
Deliverables:

✅ TableManagementService: Zero any types, 90%+ coverage
✅ BaselineManagementService: Proper types, 85%+ coverage
✅ BaselineAssignmentsService: Uses AuthorizationService, 85%+ coverage
✅ FieldAssignmentValidatorService: 100% coverage
✅ Controllers updated to use shared authorization
PHASE 3: API DTOs & Error Handling (8 hours)
Objective
Standardize input validation and error response formats.

3.1 Create DTOs for Controller Endpoints
New Files (with tests):

c:\todo-docker\apps\api\src\baseline\dto\create-table.dto.ts + .spec.ts
c:\todo-docker\apps\api\src\baseline\dto\update-cell.dto.ts + .spec.ts
c:\todo-docker\apps\api\src\baseline\dto\assign-column.dto.ts + .spec.ts
c:\todo-docker\apps\api\src\baseline\dto\delete-row.dto.ts + .spec.ts
Example:


export class CreateTableDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TABLE_LIMITS.MAX_ROWS)
  @IsArray({ each: true })
  @ValidateNested({ each: true })
  cellValues: string[][];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TABLE_LIMITS.MAX_ROWS)
  rowCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TABLE_LIMITS.MAX_COLUMNS)
  columnCount?: number;
}
Update Controllers:


// table.controller.ts
@Post(':baselineId')
async createTable(
  @Param('baselineId') baselineId: string,
  @Body() dto: CreateTableDto, // ← Use DTO
  @Req() req: any,
) {
  // Validation happens automatically via class-validator
}
3.2 Standardize Error Responses
Implementation File: c:\todo-docker\apps\api\src\common\exceptions.ts


export class ValidationException extends BadRequestException {
  constructor(validation: {
    error: string;
    suggestedCorrection?: string;
  }) {
    super({
      statusCode: 400,
      error: 'Validation Error',
      validation,
      requiresConfirmation: true,
    });
  }
}

export class EditabilityException extends ForbiddenException {
  constructor(reason: string) {
    super({
      statusCode: 403,
      error: 'Resource Not Editable',
      reason,
    });
  }
}
Usage in Services:


// Replace inconsistent error throwing
if (!validation.valid) {
  throw new ValidationException(validation);
}

if (baseline.utilizedAt) {
  throw new EditabilityException('Baseline is locked due to utilization');
}
Verification:


npm test -- baseline/dto/*.spec.ts
npm run build # Verify no TypeScript errors
Deliverables:

✅ All controller endpoints use DTOs with validation
✅ Standardized error response format
✅ 100% DTO test coverage
PHASE 4: Web Foundation - Shared Utilities (12 hours)
Objective
Extract shared styles, create testing infrastructure, and build reusable utilities.

4.1 Setup React Testing Infrastructure
Install Dependencies:


cd apps/web
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom @types/jest
Create Config Files:

c:\todo-docker\apps\web\jest.config.js:


module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/app/$1',
  },
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    '!app/**/*.spec.{ts,tsx}',
  ],
};
c:\todo-docker\apps\web\jest.setup.js:


import '@testing-library/jest-dom';
Update package.json:


{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
4.2 Create Shared Style Constants (Test-First)
Problem: 689 hardcoded color instances across 30+ files (#475569, #e2e8f0, #1e293b, etc.)

Test File: c:\todo-docker\apps\web\app\lib\styles.spec.ts


describe('Style Constants', () => {
  it('should have all color constants');
  it('should have valid hex color values');
  it('should have frozen style objects');
  it('should merge styles correctly');
});
Implementation File: c:\todo-docker\apps\web\app\lib\styles.ts


export const COLORS = {
  SLATE_50: '#f8fafc',
  SLATE_200: '#e2e8f0',
  SLATE_600: '#475569',
  SLATE_800: '#1e293b',
  SLATE_900: '#0f172a',

  BLUE_500: '#2563eb',
  BLUE_600: '#1d4ed8',

  SUCCESS_BG: '#dcfce7',
  SUCCESS_BORDER: '#bbf7d0',
  SUCCESS_TEXT: '#166534',

  ERROR_BG: '#fee2e2',
  ERROR_BORDER: '#fecaca',
  ERROR_TEXT: '#b91c1c',

  WARNING_BG: '#fffbeb',
  WARNING_BORDER: '#fde68a',
  WARNING_TEXT: '#92400e',
} as const;

export const COMMON_STYLES = {
  FLEX_CENTER: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  FLEX_BETWEEN: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  HEADING_1: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.SLATE_900,
  },
  HEADING_2: {
    fontSize: 20,
    fontWeight: 700,
    color: COLORS.SLATE_900,
  },
  BUTTON_PRIMARY: {
    padding: '8px 14px',
    borderRadius: 10,
    border: `1px solid ${COLORS.BLUE_500}`,
    background: COLORS.BLUE_500,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  BUTTON_SECONDARY: {
    padding: '8px 14px',
    borderRadius: 10,
    border: `1px solid ${COLORS.SLATE_200}`,
    background: '#ffffff',
    color: COLORS.SLATE_600,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  CARD: {
    background: '#ffffff',
    border: `1px solid ${COLORS.SLATE_200}`,
    borderRadius: 12,
    padding: 16,
  },
} as const;

export const mergeStyles = (...styles: Array<React.CSSProperties | undefined>): React.CSSProperties => {
  return Object.assign({}, ...styles.filter(Boolean));
};
Impact: Replaces 689 hardcoded colors across 30+ files.

4.3 Create Notification Helpers (Test-First)
Problem: 50+ instances of addNotification({ id: Date.now().toString(), type: 'success', ... })

Test File: c:\todo-docker\apps\web\app\lib\notifications.spec.ts

Implementation File: c:\todo-docker\apps\web\app\lib\notifications.ts


export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
}

export const createNotification = (
  type: NotificationType,
  title: string,
  message: string
): Notification => ({
  id: `${Date.now()}-${Math.random()}`,
  type,
  title,
  message,
});

export const notifySuccess = (title: string, message: string = '') =>
  createNotification('success', title, message);

export const notifyError = (title: string, message: string = '') =>
  createNotification('error', title, message);

export const notifyWarning = (title: string, message: string = '') =>
  createNotification('warning', title, message);

// Usage:
// addNotification(notifySuccess('Saved', 'Assignment updated'));
Impact: Simplifies 50+ notification calls.

4.4 Create Unified Modal Manager Hook (Test-First)
Problem: 6+ separate modal state variables in review/page.tsx (isEditOpen, isCreateOpen, isConfirmModalOpen, etc.)

Test File: c:\todo-docker\apps\web\app\hooks\useModalStack.spec.ts

Implementation File: c:\todo-docker\apps\web\app\hooks\useModalStack.ts


export interface ModalState {
  id: string;
  type: 'edit' | 'create' | 'correction' | 'validation' | 'confirm' | 'history' | 'tableCreation';
  props?: any;
}

export const useModalStack = () => {
  const [modalStack, setModalStack] = useState<ModalState[]>([]);

  const openModal = useCallback((type: ModalState['type'], props?: any) => {
    setModalStack(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, type, props }]);
  }, []);

  const closeModal = useCallback((id?: string) => {
    setModalStack(prev => {
      if (id) return prev.filter(m => m.id !== id);
      return prev.slice(0, -1);
    });
  }, []);

  const closeAllModals = useCallback(() => {
    setModalStack([]);
  }, []);

  const currentModal = modalStack[modalStack.length - 1] || null;

  return {
    currentModal,
    modalStack,
    openModal,
    closeModal,
    closeAllModals,
    isOpen: (type: ModalState['type']) => modalStack.some(m => m.type === type),
  };
};
Impact: Replaces 6+ modal state hooks with unified manager.

Verification:


npm test -- lib/*.spec.ts hooks/*.spec.ts
# Target: 100% coverage for utilities
Deliverables:

✅ Testing infrastructure configured
✅ Shared style constants with 100% coverage
✅ Notification helpers with 100% coverage
✅ Unified modal manager with 100% coverage
PHASE 5: Web Base Components (16 hours)
Objective
Create reusable base components to eliminate duplication.

5.1 Create Base Button Component (Test-First)
Test File: c:\todo-docker\apps\web\app\components\ui\Button.spec.tsx


describe('Button', () => {
  it('should render with primary variant');
  it('should render with secondary variant');
  it('should render with success variant');
  it('should render with danger variant');
  it('should handle disabled state');
  it('should show loading state');
  it('should merge custom styles');
  it('should call onClick handler');
});
Implementation File: c:\todo-docker\apps\web\app\components\ui\Button.tsx


interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
  isLoading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  isLoading = false,
  disabled,
  style,
  children,
  ...props
}) => {
  const variantStyles = {
    primary: COMMON_STYLES.BUTTON_PRIMARY,
    secondary: COMMON_STYLES.BUTTON_SECONDARY,
    success: { ...COMMON_STYLES.BUTTON_PRIMARY, background: COLORS.SUCCESS_BG, borderColor: COLORS.SUCCESS_BORDER, color: COLORS.SUCCESS_TEXT },
    danger: { ...COMMON_STYLES.BUTTON_PRIMARY, background: COLORS.ERROR_BG, borderColor: COLORS.ERROR_BORDER, color: COLORS.ERROR_TEXT },
  };

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      style={mergeStyles(variantStyles[variant], style, {
        cursor: (disabled || isLoading) ? 'not-allowed' : 'pointer',
        opacity: (disabled || isLoading) ? 0.6 : 1,
      })}
    >
      {isLoading ? 'Loading...' : children}
    </button>
  );
};
5.2 Create Base Modal Component (Test-First)
Test File: c:\todo-docker\apps\web\app\components\ui\Modal.spec.tsx

Implementation File: c:\todo-docker\apps\web\app\components\ui\Modal.tsx


interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}) => {
  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeStyles = {
    sm: { width: 'min(400px, 92vw)' },
    md: { width: 'min(520px, 92vw)' },
    lg: { width: 'min(720px, 92vw)' },
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
    }} onClick={onClose}>
      <div
        style={mergeStyles(COMMON_STYLES.CARD, sizeStyles[size], {
          boxShadow: '0 20px 70px rgba(15, 23, 42, 0.15)',
        })}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={COMMON_STYLES.FLEX_BETWEEN}>
          <h3 style={COMMON_STYLES.HEADING_2}>{title}</h3>
          <Button variant="secondary" onClick={onClose}>✕</Button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
        {footer && <div style={{ marginTop: 20, ...COMMON_STYLES.FLEX_BETWEEN }}>{footer}</div>}
      </div>
    </div>
  );
};
5.3 Create Base Input Components (Test-First)
Files:

c:\todo-docker\apps\web\app\components\ui\TextInput.tsx + .spec.tsx
c:\todo-docker\apps\web\app\components\ui\TextArea.tsx + .spec.tsx
c:\todo-docker\apps\web\app\components\ui\Select.tsx + .spec.tsx
Example TextInput:


interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const TextInput: React.FC<TextInputProps> = ({ label, error, style, ...props }) => {
  return (
    <div>
      {label && <label style={{ fontSize: 14, fontWeight: 500, color: COLORS.SLATE_700 }}>{label}</label>}
      <input
        {...props}
        style={mergeStyles({
          width: '100%',
          padding: '8px 12px',
          border: `1px solid ${error ? COLORS.ERROR_BORDER : COLORS.SLATE_200}`,
          borderRadius: 6,
          fontSize: 14,
        }, style)}
      />
      {error && <span style={{ fontSize: 12, color: COLORS.ERROR_TEXT }}>{error}</span>}
    </div>
  );
};
Verification:


npm test -- components/ui/*.spec.tsx
# Target: 100% coverage for base components
Deliverables:

✅ Button component with 100% coverage
✅ Modal component with 100% coverage
✅ Input components with 100% coverage
PHASE 6: Web God Component Decomposition (24 hours)
Objective
Break down review/page.tsx (1,530 lines) into 5-7 manageable components.

6.1 Component Architecture Design
New Structure:


apps/web/app/attachments/[attachmentId]/review/
├── page.tsx (~200 lines - orchestrator only)
├── components/
│   ├── DocumentPreviewPanel.tsx (~150 lines)
│   ├── ExtractedTextPanel.tsx (~120 lines)
│   ├── FieldAssignmentSidebar.tsx (~180 lines)
│   ├── BaselineStatusHeader.tsx (~100 lines)
│   ├── BaselineActionsToolbar.tsx (~120 lines)
│   ├── TableManagementPanel.tsx (~200 lines)
│   └── ReviewPageModals.tsx (~150 lines)
├── hooks/
│   ├── useBaselineData.ts (~100 lines)
│   ├── useBaselineActions.ts (~120 lines)
│   ├── useFieldAssignments.ts (~100 lines)
│   └── useTableManagement.ts (~80 lines)
└── types.ts (~50 lines)
Total Reduction: 1,530 lines → ~200 lines (main page) + 1,170 lines (7 components + 4 hooks)

6.2 Extract Custom Hooks (Test-First)
useBaselineData Hook
Test File: c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\hooks\useBaselineData.spec.ts

Implementation File: c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\hooks\useBaselineData.ts


export const useBaselineData = (attachmentId: string) => {
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [libraryFields, setLibraryFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBaseline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAggregatedBaseline(attachmentId);
      setBaseline(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [attachmentId]);

  const loadLibraryFields = useCallback(async () => {
    const fields = await fetchActiveFields();
    setLibraryFields(fields);
  }, []);

  useEffect(() => {
    loadBaseline();
    loadLibraryFields();
  }, [loadBaseline, loadLibraryFields]);

  return { baseline, libraryFields, loading, error, refetch: loadBaseline };
};
Test Coverage:

Test initial loading
Test error handling
Test refetch behavior
Mock API calls
useBaselineActions Hook
Implementation File: c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\hooks\useBaselineActions.ts


export const useBaselineActions = (baseline: Baseline | null, onSuccess: () => void) => {
  const [loading, setLoading] = useState(false);

  const markReviewed = useCallback(async () => {
    if (!baseline) return;
    setLoading(true);
    try {
      await markBaselineReviewed(baseline.id);
      onSuccess();
      return notifySuccess('Marked as Reviewed', 'Baseline status updated');
    } catch (e: any) {
      return notifyError('Failed', e.message);
    } finally {
      setLoading(false);
    }
  }, [baseline, onSuccess]);

  const confirmBaseline = useCallback(async () => {
    if (!baseline) return;

    // Validation logic (extracted from lines 642-750)
    const invalidAssignments = baseline.assignments?.filter(a =>
      a.validation && !a.validation.valid
    ) || [];

    if (invalidAssignments.length > 0) {
      return notifyWarning('Invalid Assignments', 'Please fix validation errors');
    }

    // Check required fields
    const libraryFields = await fetchActiveFields();
    const emptyRequiredFields = libraryFields.filter(field => {
      const assignment = baseline.assignments?.find(a => a.fieldKey === field.fieldKey);
      return !assignment || !assignment.assignedValue;
    });

    if (emptyRequiredFields.length > 0) {
      return notifyWarning('Missing Fields', `${emptyRequiredFields.length} required fields empty`);
    }

    // Check unconfirmed tables
    const unconfirmedTables = baseline.tables?.filter(t => t.status !== 'confirmed') || [];
    if (unconfirmedTables.length > 0) {
      return notifyWarning('Unconfirmed Tables', 'All tables must be confirmed first');
    }

    setLoading(true);
    try {
      await confirmBaselineApi(baseline.id);
      onSuccess();
      return notifySuccess('Confirmed', 'Baseline confirmed successfully');
    } catch (e: any) {
      return notifyError('Failed', e.message);
    } finally {
      setLoading(false);
    }
  }, [baseline, onSuccess]);

  return { markReviewed, confirmBaseline, loading };
};
Impact: Eliminates duplicate validation logic (lines 642-688 vs 715-750).

useFieldAssignments Hook
Implementation: Handles assignment CRUD with validation, correction reasons, etc.

useTableManagement Hook
Implementation: Handles table creation, selection, deletion.

6.3 Extract DocumentPreviewPanel Component (Test-First)
Test File: c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\components\DocumentPreviewPanel.spec.tsx

Implementation File: c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\components\DocumentPreviewPanel.tsx


interface DocumentPreviewPanelProps {
  attachment: Attachment | null;
  documentUrl: string;
  highlightedSegment: Segment | null;
  selectedField: OcrField | null;
  onDocumentError: (error: string) => void;
}

export const DocumentPreviewPanel: React.FC<DocumentPreviewPanelProps> = ({
  attachment,
  documentUrl,
  highlightedSegment,
  selectedField,
  onDocumentError,
}) => {
  return (
    <div style={{ flex: '1 1 40%', minWidth: 300, ...COMMON_STYLES.CARD }}>
      <h2 style={COMMON_STYLES.HEADING_2}>1. Document Preview</h2>
      {attachment?.mimeType.includes('pdf') && (
        <PdfDocumentViewer
          url={documentUrl}
          highlightSegment={highlightedSegment}
          onError={onDocumentError}
        />
      )}
      {attachment?.mimeType.startsWith('image/') && (
        <img src={documentUrl} alt="Document" style={{ maxWidth: '100%' }} />
      )}
    </div>
  );
};
Test Coverage:

Render PDF documents
Render images
Handle unsupported file types
Error handling
6.4 Extract ExtractedTextPanel Component (Test-First)
Props:


interface ExtractedTextPanelProps {
  segments: Segment[];
  onHighlight: (segment: Segment | null) => void;
  onDragStart: (segment: Segment) => void;
  selectedSegmentId: string | null;
}
Test Coverage:

Segment selection
Drag-and-drop functionality
Confidence badge rendering
6.5 Extract FieldAssignmentSidebar Component (Test-First)
Props:


interface FieldAssignmentSidebarProps {
  sidebarTab: 'fields' | 'tables';
  onTabChange: (tab: 'fields' | 'tables') => void;
  libraryFields: any[];
  baseline: Baseline | null;
  assignments: Assignment[];
  tables: Table[];
  activeTableId: string | null;
  onSelectTable: (id: string) => void;
  onDeleteTable: (table: Table) => void;
  onCreateTable: () => void;
  onAssignmentUpdate: (fieldKey: string, value: string) => void;
  onAssignmentDelete: (fieldKey: string) => void;
  isReadOnly: boolean;
}
Consolidates:

Field assignments panel
Table list panel (TableListPanel.tsx)
Tab switching logic
6.6 Extract BaselineActionsToolbar Component (Test-First)
Props:


interface BaselineActionsToolbarProps {
  baseline: Baseline | null;
  onMarkReviewed: () => Promise<Notification>;
  onConfirmBaseline: () => Promise<Notification>;
  isLoading: boolean;
}
Renders:

Status badges
Mark as Reviewed button
Confirm Baseline button
6.7 Extract ReviewPageModals Component (Test-First)
Props:


interface ReviewPageModalsProps {
  modalState: ReturnType<typeof useModalStack>;
  baseline: Baseline | null;
  pendingActions: {
    correction?: { type: string; fieldKey: string; value: string };
    validation?: { fieldKey: string; value: string };
    tableCreation?: any;
  };
  onCorrectionConfirm: (reason: string) => void;
  onValidationConfirm: () => void;
  onTableCreationConfirm: (data: any) => void;
}
Consolidates all modals:

CorrectionReasonModal
ValidationConfirmationModal
TableCreationModal
OcrFieldEditModal
CorrectionHistoryModal
6.8 Refactor page.tsx (Orchestrator Only)
New Structure (~200 lines):


'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/app/hooks/useAuth';
import { useModalStack } from '@/app/hooks/useModalStack';
import { useBaselineData } from './hooks/useBaselineData';
import { useBaselineActions } from './hooks/useBaselineActions';
import { useFieldAssignments } from './hooks/useFieldAssignments';
import { useTableManagement } from './hooks/useTableManagement';
import { DocumentPreviewPanel } from './components/DocumentPreviewPanel';
import { ExtractedTextPanel } from './components/ExtractedTextPanel';
import { FieldAssignmentSidebar } from './components/FieldAssignmentSidebar';
import { BaselineActionsToolbar } from './components/BaselineActionsToolbar';
import { ReviewPageModals } from './components/ReviewPageModals';
import Layout from '@/app/components/Layout';
import NotificationToast from '@/app/components/NotificationToast';
import { COMMON_STYLES } from '@/app/lib/styles';

export default function AttachmentOcrReviewPage() {
  const params = useParams();
  const attachmentId = params?.attachmentId as string;

  const { me, logout } = useAuth();
  const modalStack = useModalStack();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sidebarTab, setSidebarTab] = useState<'fields' | 'tables'>('fields');

  const { baseline, libraryFields, loading, error, refetch } = useBaselineData(attachmentId);

  const addNotification = useCallback((notification: Notification) => {
    setNotifications(prev => [...prev, notification]);
  }, []);

  const { markReviewed, confirmBaseline } = useBaselineActions(baseline, async () => {
    await refetch();
  });

  const handleMarkReviewed = useCallback(async () => {
    const notification = await markReviewed();
    addNotification(notification);
  }, [markReviewed, addNotification]);

  const handleConfirmBaseline = useCallback(async () => {
    const notification = await confirmBaseline();
    addNotification(notification);
  }, [confirmBaseline, addNotification]);

  const { handleAssignmentUpdate, handleAssignmentDelete } = useFieldAssignments(
    baseline,
    refetch,
    addNotification
  );

  const { activeTable, onSelectTable, onDeleteTable, onCreateTable } = useTableManagement(
    baseline,
    addNotification
  );

  if (!me) return null; // Redirect handled by Layout

  return (
    <Layout currentPage="home" userEmail={me.email} onLogout={logout}>
      <BaselineActionsToolbar
        baseline={baseline}
        onMarkReviewed={handleMarkReviewed}
        onConfirmBaseline={handleConfirmBaseline}
        isLoading={loading}
      />

      <div style={COMMON_STYLES.FLEX_START}>
        <DocumentPreviewPanel
          attachment={baseline?.attachment}
          documentUrl={`${process.env.NEXT_PUBLIC_API_URL}/attachments/${attachmentId}/download`}
          highlightedSegment={null}
          selectedField={null}
          onDocumentError={(err) => addNotification(notifyError('Error', err))}
        />

        <ExtractedTextPanel
          segments={baseline?.segments || []}
          onHighlight={() => {}}
          onDragStart={() => {}}
          selectedSegmentId={null}
        />

        <FieldAssignmentSidebar
          sidebarTab={sidebarTab}
          onTabChange={setSidebarTab}
          libraryFields={libraryFields}
          baseline={baseline}
          assignments={baseline?.assignments || []}
          tables={baseline?.tables || []}
          activeTableId={activeTable?.table.id}
          onSelectTable={onSelectTable}
          onDeleteTable={onDeleteTable}
          onCreateTable={() => modalStack.openModal('tableCreation')}
          onAssignmentUpdate={handleAssignmentUpdate}
          onAssignmentDelete={handleAssignmentDelete}
          isReadOnly={baseline?.status === 'confirmed'}
        />
      </div>

      <ReviewPageModals
        modalState={modalStack}
        baseline={baseline}
        pendingActions={{}}
        onCorrectionConfirm={() => {}}
        onValidationConfirm={() => {}}
        onTableCreationConfirm={() => {}}
      />

      <NotificationToast
        notifications={notifications}
        onDismiss={(id) => setNotifications(prev => prev.filter(n => n.id !== id))}
      />
    </Layout>
  );
}
Impact:

1,530 lines → ~200 lines (87% reduction)
30+ useState → 4 custom hooks
15+ useCallback → extracted to hooks
Clear separation of concerns
Verification:


npm test -- attachments/[attachmentId]/review/**/*.spec.tsx
npm run build # Verify no TypeScript errors
npm run test:e2e # Verify E2E tests pass
Deliverables:

✅ 4 custom hooks with 80%+ coverage
✅ 7 components with 70%+ coverage
✅ Main page reduced to ~200 lines
✅ All E2E tests passing
PHASE 7: Integration Testing & Verification (8 hours)
Objective
Ensure all refactorings work together correctly with no regressions.

7.1 API Integration Tests
Test File: c:\todo-docker\apps\api\test\integration\baseline-workflow.e2e.spec.ts

Test Scenarios:

Full baseline workflow:
Create draft baseline → Mark reviewed → Confirm → Archive
Verify audit logs at each step
Field assignment workflow:
Create assignment → Update → Delete with correction reason
Test validation errors
Table workflow:
Create table → Map columns → Update cells → Confirm table → Confirm baseline
Test cell validation
Authorization validation:
Verify user cannot access other users' resources
Test all AuthorizationService methods
Utilization locking:
Verify confirmed baseline cannot be modified after utilization
Test first-write-wins behavior
Run Tests:


cd apps/api
npm test # All unit tests
npm run test:e2e # E2E integration tests
npm run test:cov # Generate coverage report

# Target Coverage:
# - Overall: >85%
# - Common utilities: 100%
# - Services: >90%
7.2 Web Integration Tests
Test File: c:\todo-docker\apps\web\tests\baseline-review.spec.ts (Playwright)

Test Scenarios:

Full review workflow:
Login → Navigate to attachment → Load baseline
View document → Assign fields → Mark reviewed → Confirm
Table creation:
Select text segments → Create table → Map columns → Edit cells → Confirm table
Validation flow:
Enter invalid value → See validation modal → Choose correction → Save
Verify error messages
Modal stack behavior:
Open multiple modals → Verify z-index stacking → Close with escape key
Notification system:
Trigger success/error notifications → Verify display → Dismiss
Run Tests:


cd apps/web
npm test # Unit tests
npm run test:coverage # Coverage report
npm run test:e2e # Playwright E2E tests

# Target Coverage:
# - Utilities: 100%
# - Hooks: >80%
# - Components: >70%
7.3 Regression Testing Checklist
API Regression:

 All existing E2E tests pass
 No breaking changes to API contracts (endpoint paths, request/response formats)
 Audit logs still created correctly for all mutations
 Database schema unchanged (no migrations required)
 Authorization guards work for all endpoints
 Performance not degraded (query execution time)
Web Regression:

 All Playwright E2E tests pass
 No visual regressions (screenshot comparison)
 All user workflows functional (login → review → confirm)
 Performance not degraded (Lighthouse score ≥90)
 Mobile responsiveness maintained
 Keyboard navigation works (Tab, Enter, Escape)
Smoke Test Script:


# Build both apps
cd apps/api && npm run build
cd apps/web && npm run build

# Start services
docker compose up -d

# Run E2E tests
cd apps/web && npm run test:e2e

# Manual smoke test:
# 1. Login as admin@taskflow.local
# 2. Create task → Upload PDF → Trigger OCR
# 3. Navigate to review page
# 4. Assign fields → Create table → Confirm baseline
# 5. Verify audit logs in activity page
Verification:


# Final checks
npm run build # Both apps build successfully
npm test # All unit tests pass
npm run test:e2e # All E2E tests pass
npm run test:cov # Coverage meets targets
Deliverables:

✅ All unit tests passing (API: 85%+ coverage, Web: 70%+ coverage)
✅ All E2E tests passing
✅ No visual regressions
✅ Performance benchmarks met
✅ Documentation updated
Critical Files Reference
API Module Files
Phase 1 (Foundation):

c:\todo-docker\apps\api\src\common\authorization.service.ts (NEW)
c:\todo-docker\apps\api\src\common\authorization.service.spec.ts (NEW)
c:\todo-docker\apps\api\src\common\constants.ts (NEW)
c:\todo-docker\apps\api\src\common\constants.spec.ts (NEW)
c:\todo-docker\apps\api\src\common\types.ts (NEW)
c:\todo-docker\apps\api\src\common\common.module.ts (UPDATE)
Phase 2 (Services):

c:\todo-docker\apps\api\src\baseline\table-management.service.ts (REFACTOR - 696 lines, fix 7 any types)
c:\todo-docker\apps\api\src\baseline\table-management.service.spec.ts (NEW - 30+ tests)
c:\todo-docker\apps\api\src\baseline\baseline-management.service.ts (REFACTOR)
c:\todo-docker\apps\api\src\baseline\baseline-management.service.spec.ts (NEW - 25+ tests)
c:\todo-docker\apps\api\src\baseline\baseline-assignments.service.ts (REFACTOR)
c:\todo-docker\apps\api\src\baseline\baseline-assignments.service.spec.ts (NEW - 20+ tests)
c:\todo-docker\apps\api\src\baseline\field-assignment-validator.service.spec.ts (NEW - 15+ tests)
c:\todo-docker\apps\api\src\baseline\baseline.controller.ts (UPDATE - use AuthorizationService)
c:\todo-docker\apps\api\src\baseline\table.controller.ts (UPDATE - use AuthorizationService)
c:\todo-docker\apps\api\src\ocr\ocr.service.ts (UPDATE - use AuthorizationService)
Phase 3 (DTOs):

c:\todo-docker\apps\api\src\baseline\dto\create-table.dto.ts + .spec.ts (NEW)
c:\todo-docker\apps\api\src\baseline\dto\update-cell.dto.ts + .spec.ts (NEW)
c:\todo-docker\apps\api\src\baseline\dto\assign-column.dto.ts + .spec.ts (NEW)
c:\todo-docker\apps\api\src\baseline\dto\delete-row.dto.ts + .spec.ts (NEW)
c:\todo-docker\apps\api\src\common\exceptions.ts (NEW)
Web Module Files
Phase 4 (Foundation):

c:\todo-docker\apps\web\jest.config.js (NEW)
c:\todo-docker\apps\web\jest.setup.js (NEW)
c:\todo-docker\apps\web\app\lib\styles.ts + .spec.ts (NEW)
c:\todo-docker\apps\web\app\lib\notifications.ts + .spec.ts (NEW)
c:\todo-docker\apps\web\app\hooks\useModalStack.ts + .spec.ts (NEW)
Phase 5 (Base Components):

c:\todo-docker\apps\web\app\components\ui\Button.tsx + .spec.tsx (NEW)
c:\todo-docker\apps\web\app\components\ui\Modal.tsx + .spec.tsx (NEW)
c:\todo-docker\apps\web\app\components\ui\TextInput.tsx + .spec.tsx (NEW)
c:\todo-docker\apps\web\app\components\ui\TextArea.tsx + .spec.tsx (NEW)
c:\todo-docker\apps\web\app\components\ui\Select.tsx + .spec.tsx (NEW)
Phase 6 (God Component Decomposition):

c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\page.tsx (REFACTOR - 1,530 → 200 lines)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\hooks\useBaselineData.ts + .spec.ts (NEW)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\hooks\useBaselineActions.ts + .spec.ts (NEW)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\hooks\useFieldAssignments.ts + .spec.ts (NEW)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\hooks\useTableManagement.ts + .spec.ts (NEW)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\components\DocumentPreviewPanel.tsx + .spec.tsx (NEW)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\components\ExtractedTextPanel.tsx + .spec.tsx (NEW)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\components\FieldAssignmentSidebar.tsx + .spec.tsx (NEW)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\components\BaselineStatusHeader.tsx + .spec.tsx (NEW)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\components\BaselineActionsToolbar.tsx + .spec.tsx (NEW)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\components\ReviewPageModals.tsx + .spec.tsx (NEW)
c:\todo-docker\apps\web\app\attachments\[attachmentId]\review\types.ts (NEW)
Phase 7 (Integration Tests):

c:\todo-docker\apps\api\test\integration\baseline-workflow.e2e.spec.ts (NEW)
c:\todo-docker\apps\web\tests\baseline-review.spec.ts (UPDATE - add new test scenarios)
Git Strategy & Branching
Branch Structure

main
├── refactor/api-phase1-foundation
├── refactor/api-phase2-services
├── refactor/api-phase3-dtos
├── refactor/web-phase4-foundation
├── refactor/web-phase5-components
├── refactor/web-phase6-decomposition
└── refactor/phase7-integration
Merge Strategy
Each phase is a separate feature branch
Merge phases incrementally after verification:
Phase 1 → main (after tests pass)
Phase 2 → main (after tests pass)
Continue sequentially
Run full regression suite before each merge
Tag releases: v8.7.1-refactor-complete
Rollback Plan
If issues arise:

Identify problematic phase from git log
Revert specific commits:

git revert <commit-hash>
Fix issues in new commits rather than force-push
Re-run test suite to verify fix
Success Metrics
API Module
 Zero any types in baseline services
 100% test coverage for AuthorizationService
 90%+ test coverage for all baseline services
 Code duplication reduced from 15+ methods to 1 shared service
 All DTOs with class-validator validation
 All endpoints with proper authorization checks
 Audit logs created for all mutations
Web Module
 God component reduced from 1,530 lines to <200 lines
 6 modal states → 1 unified modal manager
 689 hardcoded colors → centralized style constants
 50+ inline addNotification → helper functions
 30+ useState hooks → 4 custom hooks
 70%+ test coverage for new components
 80%+ test coverage for hooks
Overall
 All existing E2E tests pass
 No performance degradation (API response time <200ms, Lighthouse score ≥90)
 No visual regressions
 No breaking changes to API contracts
 Documentation updated for new patterns
 Code review completed
Effort Summary
Phase	Module	Focus Area	Effort	Cumulative
1	API	Common utilities & types	12h	12h
2	API	Service refactoring	20h	32h
3	API	DTOs & error handling	8h	40h
4	Web	Shared utilities	12h	52h
5	Web	Base components	16h	68h
6	Web	God component split	24h	92h
7	Both	Integration testing	8h	100h
Total Estimated Effort: 100 hours (~2-2.5 weeks at 40h/week)

Parallel Execution:

API track (Phases 1-3): 40 hours
Web track (Phases 4-6): 52 hours
Can run simultaneously with 2 developers
Integration (Phase 7): 8 hours (requires both complete)
If parallelized: ~60 hours wall-clock time (1.5 weeks)

Risk Assessment
High Risk Areas
God Component Decomposition (Phase 6)

Risk: Breaking existing functionality
Mitigation: Comprehensive E2E tests before refactoring, component-by-component extraction
Authorization Service Extraction (Phase 1-2)

Risk: Security holes if authorization checks missed
Mitigation: Audit all controller endpoints, integration tests for access control
Type Safety Fixes (Phase 2)

Risk: Uncovering hidden bugs when replacing any
Mitigation: Test-first approach ensures behavior unchanged
Medium Risk Areas
Cell Grid Reconstruction Algorithm (Phase 2)

Risk: Edge cases with missing cells
Mitigation: Comprehensive unit tests, performance benchmarks
Modal State Management (Phase 4)

Risk: Breaking existing modal interactions
Mitigation: E2E tests cover modal workflows
Low Risk Areas
Style Constants Extraction (Phase 4)

Risk: Minimal - purely cosmetic
Mitigation: Visual regression tests
DTO Creation (Phase 3)

Risk: Minimal - validation only becomes stricter
Mitigation: Unit tests for DTOs
Next Steps
Review this plan with team/stakeholders
Create feature branches for each phase
Start Phase 1 (API Foundation) - lowest risk, highest impact
Run tests after each phase before proceeding to next
Merge incrementally to minimize risk
Update documentation as new patterns emerge
Conduct code review after each phase completion
This comprehensive refactoring plan provides a systematic, test-first approach to eliminating critical technical debt while maintaining system stability and ensuring no regressions through extensive testing at every phase.

User approved the plan