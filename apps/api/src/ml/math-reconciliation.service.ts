import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { documentTypeFields } from '../db/schema';

type Role =
  | 'line_item_amount'
  | 'subtotal'
  | 'tax'
  | 'total'
  | 'unit_price'
  | 'qty'
  | 'line_total';

interface BoundingBoxLike {
  y?: number;
  height?: number;
}

export interface MathReconciliationInput {
  fieldKey: string;
  normalizedValue: string | null;
  pageNumber?: number | null;
  boundingBox?: BoundingBoxLike | null;
}

export interface MathReconciliationPatch {
  mathReconciliation: 'pass' | 'fail' | 'skipped';
  confidenceScore?: number;
  validationOverride?: 'math_reconciliation_failed';
  mathDelta?: string;
  failingCheck?: 'header' | 'summation' | 'line_item_arithmetic';
  failingRowY?: number;
  failingYMin?: number;
  failingYMax?: number;
  taxRateSuspicious?: boolean;
}

@Injectable()
export class MathReconciliationService {
  private static readonly TOLERANCE_CENTS = 2n;
  private static readonly Y_BAND_TOLERANCE = 0.02;
  private static readonly QTY_SCALE_DIGITS = 4;

  constructor(private readonly dbs: DbService) { }

  async reconcile(
    documentTypeId: string | null | undefined,
    inputs: MathReconciliationInput[],
  ): Promise<Map<string, MathReconciliationPatch>> {
    const fieldKeys = Array.from(new Set(inputs.map((x) => x.fieldKey)));
    if (!documentTypeId || fieldKeys.length === 0) {
      return this.buildSkippedPatches(fieldKeys);
    }

    const roleRows = await this.dbs.db
      .select({
        fieldKey: documentTypeFields.fieldKey,
        zoneHint: documentTypeFields.zoneHint,
      })
      .from(documentTypeFields)
      .where(eq(documentTypeFields.documentTypeId, documentTypeId));

    if (roleRows.length === 0) {
      return this.buildSkippedPatches(fieldKeys);
    }

    const roleMap = new Map<Role, Set<string>>([
      ['line_item_amount', new Set<string>()],
      ['subtotal', new Set<string>()],
      ['tax', new Set<string>()],
      ['total', new Set<string>()],
      ['unit_price', new Set<string>()],
      ['qty', new Set<string>()],
      ['line_total', new Set<string>()],
    ]);

    for (const row of roleRows) {
      const parsedRole = this.parseRole(row.zoneHint);
      if (!parsedRole) continue;
      roleMap.get(parsedRole)!.add(row.fieldKey);
    }

    const lineItemRoleKeys = roleMap.get('line_item_amount')!;
    const subtotalRoleKeys = roleMap.get('subtotal')!;
    const taxRoleKeys = roleMap.get('tax')!;
    const totalRoleKeys = roleMap.get('total')!;
    const unitPriceRoleKeys = roleMap.get('unit_price')!;
    const qtyRoleKeys = roleMap.get('qty')!;
    const lineTotalRoleKeys = roleMap.get('line_total')!;

    if (
      lineItemRoleKeys.size === 0 ||
      subtotalRoleKeys.size === 0 ||
      taxRoleKeys.size === 0 ||
      totalRoleKeys.size === 0
    ) {
      return this.buildSkippedPatches(fieldKeys);
    }

    const valuesByField = new Map<string, bigint[]>();
    for (const input of inputs) {
      if (!input.normalizedValue) continue;
      const cents = this.parseDecimalToCents(input.normalizedValue);
      if (cents === null) continue;
      const current = valuesByField.get(input.fieldKey) ?? [];
      current.push(cents);
      valuesByField.set(input.fieldKey, current);
    }

    const lineItemValues = this.collectValues(valuesByField, lineItemRoleKeys);
    const subtotalValues = this.collectValues(valuesByField, subtotalRoleKeys);
    const taxValues = this.collectValues(valuesByField, taxRoleKeys);
    const totalValues = this.collectValues(valuesByField, totalRoleKeys);

    if (
      lineItemValues.length === 0 ||
      subtotalValues.length !== 1 ||
      taxValues.length !== 1 ||
      totalValues.length !== 1
    ) {
      return this.buildSkippedPatches(fieldKeys);
    }

    const participatingFieldKeys = new Set<string>([
      ...this.intersectionKeys(valuesByField, lineItemRoleKeys),
      ...this.intersectionKeys(valuesByField, subtotalRoleKeys),
      ...this.intersectionKeys(valuesByField, taxRoleKeys),
      ...this.intersectionKeys(valuesByField, totalRoleKeys),
    ]);
    const checkCParticipatingFieldKeys = new Set<string>(
      this.intersectionKeys(valuesByField, unitPriceRoleKeys)
        .concat(this.intersectionKeys(valuesByField, qtyRoleKeys))
        .concat(this.intersectionKeys(valuesByField, lineTotalRoleKeys)),
    );
    for (const fieldKey of checkCParticipatingFieldKeys) {
      participatingFieldKeys.add(fieldKey);
    }

    const lineItemsSum = lineItemValues.reduce((acc, v) => acc + v, 0n);
    const subtotal = subtotalValues[0];
    const tax = taxValues[0];
    const total = totalValues[0];

    const checkADelta = lineItemsSum - subtotal;
    const checkBDelta = subtotal + tax - total;
    const checkAPass = this.absBigInt(checkADelta) <= MathReconciliationService.TOLERANCE_CENTS;
    const checkBPass = this.absBigInt(checkBDelta) <= MathReconciliationService.TOLERANCE_CENTS;
    const taxRateSuspicious = this.isTaxRateSuspicious(subtotal, tax);
    const checkCResult = this.evaluateCheckC(
      inputs,
      unitPriceRoleKeys,
      qtyRoleKeys,
      lineTotalRoleKeys,
    );
    const checkCPass = checkCResult.pass;

    const patches = new Map<string, MathReconciliationPatch>();
    const addTaxWarning = (patch: MathReconciliationPatch): MathReconciliationPatch =>
      taxRateSuspicious ? { ...patch, taxRateSuspicious: true } : patch;

    if (checkAPass && checkBPass && checkCPass) {
      for (const fieldKey of participatingFieldKeys) {
        patches.set(fieldKey, addTaxWarning({
          mathReconciliation: 'pass',
          confidenceScore: 1.0,
        }));
      }
      return patches;
    }

    if (!checkCPass) {
      for (const rowFailure of checkCResult.failures) {
        const rowPatch = addTaxWarning({
          mathReconciliation: 'fail',
          confidenceScore: 0.0,
          validationOverride: 'math_reconciliation_failed',
          mathDelta: this.formatCentsAsDecimal(rowFailure.delta),
          failingCheck: 'line_item_arithmetic',
          failingRowY: rowFailure.rowY,
          failingYMin: rowFailure.yMin,
          failingYMax: rowFailure.yMax,
        });
        for (const fieldKey of rowFailure.fieldKeys) {
          patches.set(fieldKey, rowPatch);
        }
      }
    }

    if (!checkAPass || !checkBPass) {
      const failureDelta =
        !checkAPass && !checkBPass
          ? this.absBigInt(checkADelta) >= this.absBigInt(checkBDelta)
            ? checkADelta
            : checkBDelta
          : !checkAPass
            ? checkADelta
            : checkBDelta;
      const failingCheck: 'summation' | 'header' = !checkAPass ? 'summation' : 'header';
      const deltaText = this.formatCentsAsDecimal(failureDelta);

      for (const fieldKey of participatingFieldKeys) {
        patches.set(fieldKey, addTaxWarning({
          mathReconciliation: 'fail',
          confidenceScore: 0.0,
          validationOverride: 'math_reconciliation_failed',
          mathDelta: deltaText,
          failingCheck,
        }));
      }
      return patches;
    }

    for (const fieldKey of participatingFieldKeys) {
      if (patches.has(fieldKey)) continue;
      patches.set(fieldKey, addTaxWarning({
        mathReconciliation: 'pass',
        confidenceScore: 1.0,
      }));
    }

    return patches;
  }

  private evaluateCheckC(
    inputs: MathReconciliationInput[],
    unitPriceRoleKeys: Set<string>,
    qtyRoleKeys: Set<string>,
    lineTotalRoleKeys: Set<string>,
  ): {
    pass: boolean;
    failures: Array<{
      fieldKeys: string[];
      delta: bigint;
      rowY: number;
      yMin: number;
      yMax: number;
    }>;
  } {
    if (
      unitPriceRoleKeys.size === 0 ||
      qtyRoleKeys.size === 0 ||
      lineTotalRoleKeys.size === 0
    ) {
      return { pass: true, failures: [] };
    }

    type RowRole = 'unit_price' | 'qty' | 'line_total';
    type Candidate = {
      fieldKey: string;
      role: RowRole;
      pageNumber: number | null;
      yCenter: number;
      yMin: number;
      yMax: number;
      value: bigint;
    };

    const candidates: Candidate[] = [];

    for (const input of inputs) {
      if (!input.normalizedValue) continue;
      let role: RowRole | null = null;
      if (unitPriceRoleKeys.has(input.fieldKey)) role = 'unit_price';
      if (qtyRoleKeys.has(input.fieldKey)) role = 'qty';
      if (lineTotalRoleKeys.has(input.fieldKey)) role = 'line_total';
      if (!role) continue;

      const yInfo = this.extractNormalizedY(input.boundingBox);
      if (!yInfo) continue;

      const parsed =
        role === 'qty'
          ? this.parseDecimalToScaled(input.normalizedValue, MathReconciliationService.QTY_SCALE_DIGITS)
          : this.parseDecimalToCents(input.normalizedValue);
      if (parsed === null) continue;

      candidates.push({
        fieldKey: input.fieldKey,
        role,
        pageNumber: typeof input.pageNumber === 'number' ? input.pageNumber : null,
        yCenter: yInfo.yCenter,
        yMin: yInfo.yMin,
        yMax: yInfo.yMax,
        value: parsed,
      });
    }

    if (candidates.length === 0) {
      return { pass: true, failures: [] };
    }

    type RowGroup = {
      pageNumber: number | null;
      yCenter: number;
      yMin: number;
      yMax: number;
      byRole: Map<RowRole, Candidate[]>;
    };

    const rows: RowGroup[] = [];

    const sorted = [...candidates].sort((a, b) => {
      const aPage = a.pageNumber ?? -1;
      const bPage = b.pageNumber ?? -1;
      if (aPage !== bPage) return aPage - bPage;
      return a.yCenter - b.yCenter;
    });

    for (const candidate of sorted) {
      let target: RowGroup | null = null;
      for (const row of rows) {
        if (row.pageNumber !== candidate.pageNumber) continue;
        if (
          Math.abs(row.yCenter - candidate.yCenter) <=
          MathReconciliationService.Y_BAND_TOLERANCE
        ) {
          target = row;
          break;
        }
      }

      if (!target) {
        target = {
          pageNumber: candidate.pageNumber,
          yCenter: candidate.yCenter,
          yMin: candidate.yMin,
          yMax: candidate.yMax,
          byRole: new Map<RowRole, Candidate[]>([
            ['unit_price', []],
            ['qty', []],
            ['line_total', []],
          ]),
        };
        rows.push(target);
      }

      const roleEntries = target.byRole.get(candidate.role)!;
      roleEntries.push(candidate);

      const totalCount = Array.from(target.byRole.values()).reduce(
        (count, entries) => count + entries.length,
        0,
      );
      target.yCenter =
        (target.yCenter * (totalCount - 1) + candidate.yCenter) / totalCount;
      target.yMin = Math.min(target.yMin, candidate.yMin);
      target.yMax = Math.max(target.yMax, candidate.yMax);
    }

    const failures: Array<{
      fieldKeys: string[];
      delta: bigint;
      rowY: number;
      yMin: number;
      yMax: number;
    }> = [];

    for (const row of rows) {
      const unitPriceEntries = row.byRole.get('unit_price')!;
      const qtyEntries = row.byRole.get('qty')!;
      const lineTotalEntries = row.byRole.get('line_total')!;

      if (
        unitPriceEntries.length === 0 ||
        qtyEntries.length === 0 ||
        lineTotalEntries.length === 0
      ) {
        continue;
      }

      const unitPrice = unitPriceEntries[0].value;
      const qtyScaled = qtyEntries[0].value;
      const lineTotal = lineTotalEntries[0].value;

      const expected = this.multiplyCentsByScaledQuantity(
        unitPrice,
        qtyScaled,
        MathReconciliationService.QTY_SCALE_DIGITS,
      );
      const delta = expected - lineTotal;
      if (this.absBigInt(delta) <= MathReconciliationService.TOLERANCE_CENTS) {
        continue;
      }

      const fieldKeys = new Set<string>();
      for (const entry of unitPriceEntries) fieldKeys.add(entry.fieldKey);
      for (const entry of qtyEntries) fieldKeys.add(entry.fieldKey);
      for (const entry of lineTotalEntries) fieldKeys.add(entry.fieldKey);

      failures.push({
        fieldKeys: Array.from(fieldKeys),
        delta,
        rowY: row.yCenter,
        yMin: row.yMin,
        yMax: row.yMax,
      });
    }

    return {
      pass: failures.length === 0,
      failures,
    };
  }

  private multiplyCentsByScaledQuantity(
    cents: bigint,
    qtyScaled: bigint,
    scaleDigits: number,
  ): bigint {
    const scale = 10n ** BigInt(scaleDigits);
    const product = cents * qtyScaled;
    if (product === 0n) return 0n;

    const sign = product < 0n ? -1n : 1n;
    const absProduct = this.absBigInt(product);
    const rounded = (absProduct + scale / 2n) / scale;
    return sign * rounded;
  }

  private parseDecimalToScaled(value: string, scaleDigits: number): bigint | null {
    const normalized = value.trim();
    const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!match) return null;

    const sign = match[1] === '-' ? -1n : 1n;
    const integerPart = BigInt(match[2]);
    const fractionRaw = match[3] ?? '';
    const fractionPadded = `${fractionRaw}${'0'.repeat(scaleDigits + 1)}`;
    const used = BigInt(fractionPadded.slice(0, scaleDigits));
    const nextDigit = fractionPadded.charCodeAt(scaleDigits) - 48;

    let scaled = integerPart * (10n ** BigInt(scaleDigits)) + used;
    if (nextDigit >= 5) {
      scaled += 1n;
    }

    return sign * scaled;
  }

  private extractNormalizedY(
    boundingBox: BoundingBoxLike | null | undefined,
  ): { yCenter: number; yMin: number; yMax: number } | null {
    if (!boundingBox) return null;
    const y = typeof boundingBox.y === 'number' ? boundingBox.y : null;
    if (y === null) return null;
    const height =
      typeof boundingBox.height === 'number' && Number.isFinite(boundingBox.height)
        ? Math.max(0, boundingBox.height)
        : 0;
    const yMin = Math.max(0, Math.min(1, y));
    const yMax = Math.max(0, Math.min(1, y + height));
    const yCenter = (yMin + yMax) / 2;
    return { yCenter, yMin, yMax };
  }

  private isTaxRateSuspicious(subtotal: bigint, tax: bigint): boolean {
    if (subtotal <= 0n) {
      return tax < 0n;
    }

    if (tax < 0n) {
      return true;
    }

    return tax * 100n > subtotal * 30n;
  }

  private parseRole(zoneHint: string | null): Role | null {
    if (!zoneHint) return null;
    const normalized = zoneHint.trim().toLowerCase();
    if (!normalized.startsWith('role:')) return null;
    const role = normalized.slice('role:'.length);

    if (
      role === 'line_item_amount' ||
      role === 'subtotal' ||
      role === 'tax' ||
      role === 'total' ||
      role === 'unit_price' ||
      role === 'qty' ||
      role === 'line_total'
    ) {
      return role;
    }

    return null;
  }

  private collectValues(
    valuesByField: Map<string, bigint[]>,
    fieldKeys: Set<string>,
  ): bigint[] {
    const values: bigint[] = [];
    for (const fieldKey of fieldKeys) {
      const fieldValues = valuesByField.get(fieldKey);
      if (!fieldValues || fieldValues.length === 0) continue;
      values.push(fieldValues[0]);
    }
    return values;
  }

  private intersectionKeys(
    valuesByField: Map<string, bigint[]>,
    fieldKeys: Set<string>,
  ): string[] {
    const keys: string[] = [];
    for (const fieldKey of fieldKeys) {
      const values = valuesByField.get(fieldKey);
      if (values && values.length > 0) {
        keys.push(fieldKey);
      }
    }
    return keys;
  }

  private parseDecimalToCents(value: string): bigint | null {
    const normalized = value.trim();
    const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!match) return null;

    const sign = match[1] === '-' ? -1n : 1n;
    const integerPart = BigInt(match[2]);
    const fractionRaw = match[3] ?? '';
    const fractionPadded = `${fractionRaw}000`;
    const firstTwoDigits = BigInt(fractionPadded.slice(0, 2));
    const thirdDigit = fractionPadded.charCodeAt(2) - 48;

    let cents = integerPart * 100n + firstTwoDigits;
    if (thirdDigit >= 5) {
      cents += 1n;
    }

    return sign * cents;
  }

  private formatCentsAsDecimal(cents: bigint): string {
    const sign = cents < 0n ? '-' : '';
    const abs = this.absBigInt(cents);
    const whole = abs / 100n;
    const frac = abs % 100n;
    return `${sign}${whole.toString()}.${frac.toString().padStart(2, '0')}`;
  }

  private absBigInt(value: bigint): bigint {
    return value < 0n ? -value : value;
  }

  private buildSkippedPatches(fieldKeys: string[]): Map<string, MathReconciliationPatch> {
    const patches = new Map<string, MathReconciliationPatch>();
    for (const fieldKey of fieldKeys) {
      patches.set(fieldKey, {
        mathReconciliation: 'skipped',
      });
    }
    return patches;
  }
}
