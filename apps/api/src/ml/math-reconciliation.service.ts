import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { documentTypeFields } from '../db/schema';

type Role = 'line_item_amount' | 'subtotal' | 'tax' | 'total';

export interface MathReconciliationInput {
  fieldKey: string;
  normalizedValue: string | null;
}

export interface MathReconciliationPatch {
  mathReconciliation: 'pass' | 'fail' | 'skipped';
  confidenceScore?: number;
  validationOverride?: 'math_reconciliation_failed';
  mathDelta?: string;
}

@Injectable()
export class MathReconciliationService {
  private static readonly TOLERANCE_CENTS = 2n;

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

    const lineItemsSum = lineItemValues.reduce((acc, v) => acc + v, 0n);
    const subtotal = subtotalValues[0];
    const tax = taxValues[0];
    const total = totalValues[0];

    const checkADelta = lineItemsSum - subtotal;
    const checkBDelta = subtotal + tax - total;
    const checkAPass = this.absBigInt(checkADelta) <= MathReconciliationService.TOLERANCE_CENTS;
    const checkBPass = this.absBigInt(checkBDelta) <= MathReconciliationService.TOLERANCE_CENTS;

    const patches = new Map<string, MathReconciliationPatch>();

    if (checkAPass && checkBPass) {
      for (const fieldKey of participatingFieldKeys) {
        patches.set(fieldKey, {
          mathReconciliation: 'pass',
          confidenceScore: 1.0,
        });
      }
      return patches;
    }

    const failureDelta =
      !checkAPass && !checkBPass
        ? this.absBigInt(checkADelta) >= this.absBigInt(checkBDelta)
          ? checkADelta
          : checkBDelta
        : !checkAPass
          ? checkADelta
          : checkBDelta;

    const deltaText = this.formatCentsAsDecimal(failureDelta);

    for (const fieldKey of participatingFieldKeys) {
      patches.set(fieldKey, {
        mathReconciliation: 'fail',
        confidenceScore: 0.0,
        validationOverride: 'math_reconciliation_failed',
        mathDelta: deltaText,
      });
    }

    return patches;
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
      role === 'total'
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
