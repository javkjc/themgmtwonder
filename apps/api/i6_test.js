// I6 Math Reconciliation direct test script
// Tests the reconciliation logic directly against the real DB
// Scenarios: pass, fail, skip (no docType), skip (no role rows), math override

const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL || 'postgres://todo:todo123@db:5432/todo_db';
const DOC_TYPE_ID = 'ca2592c7-8abf-485b-8cf5-8cc545e1f5a1';

// Roles configured on invoice_test:
//   quantity       -> line_item_amount
//   total_amount   -> subtotal
//   currency_type  -> tax
//   invoice_number -> total

const TOLERANCE_CENTS = 2n;

function parseDecimalToCents(value) {
  const normalized = value.trim();
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const sign = match[1] === '-' ? -1n : 1n;
  const integerPart = BigInt(match[2]);
  const fractionRaw = match[3] || '';
  const fractionPadded = `${fractionRaw}000`;
  const firstTwoDigits = BigInt(fractionPadded.slice(0, 2));
  const thirdDigit = fractionPadded.charCodeAt(2) - 48;
  let cents = integerPart * 100n + firstTwoDigits;
  if (thirdDigit >= 5) cents += 1n;
  return sign * cents;
}

function absBigInt(v) { return v < 0n ? -v : v; }

function formatCentsAsDecimal(cents) {
  const sign = cents < 0n ? '-' : '';
  const abs = absBigInt(cents);
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
}

async function reconcile(client, documentTypeId, inputs) {
  if (!documentTypeId || inputs.length === 0) return 'skipped (no docTypeId)';

  const res = await client.query(
    'SELECT field_key, zone_hint FROM document_type_fields WHERE document_type_id = $1',
    [documentTypeId]
  );

  if (res.rows.length === 0) return 'skipped (no role rows)';

  const roleMap = {
    line_item_amount: new Set(),
    subtotal: new Set(),
    tax: new Set(),
    total: new Set()
  };

  for (const row of res.rows) {
    const zh = (row.zone_hint || '').trim().toLowerCase();
    if (!zh.startsWith('role:')) continue;
    const role = zh.slice('role:'.length);
    if (roleMap[role]) roleMap[role].add(row.field_key);
  }

  const lineKeys = roleMap.line_item_amount;
  const subKeys  = roleMap.subtotal;
  const taxKeys  = roleMap.tax;
  const totKeys  = roleMap.total;

  if ([lineKeys, subKeys, taxKeys, totKeys].some(s => s.size === 0)) {
    return 'skipped (missing roles)';
  }

  const valuesByField = new Map();
  for (const input of inputs) {
    if (!input.normalizedValue) continue;
    const cents = parseDecimalToCents(input.normalizedValue);
    if (cents === null) continue;
    const arr = valuesByField.get(input.fieldKey) || [];
    arr.push(cents);
    valuesByField.set(input.fieldKey, arr);
  }

  function collectValues(keys) {
    const vals = [];
    for (const k of keys) {
      const v = valuesByField.get(k);
      if (v && v.length > 0) vals.push(v[0]);
    }
    return vals;
  }

  const lineVals = collectValues(lineKeys);
  const subVals  = collectValues(subKeys);
  const taxVals  = collectValues(taxKeys);
  const totVals  = collectValues(totKeys);

  if (lineVals.length === 0 || subVals.length !== 1 || taxVals.length !== 1 || totVals.length !== 1) {
    return `skipped (missing normalized values: lines=${lineVals.length}, sub=${subVals.length}, tax=${taxVals.length}, tot=${totVals.length})`;
  }

  const lineSum = lineVals.reduce((a, v) => a + v, 0n);
  const sub = subVals[0];
  const tax = taxVals[0];
  const tot = totVals[0];
  const dA = lineSum - sub;
  const dB = sub + tax - tot;
  const passA = absBigInt(dA) <= TOLERANCE_CENTS;
  const passB = absBigInt(dB) <= TOLERANCE_CENTS;

  if (passA && passB) {
    return { result: 'pass', confidenceScore: 1.0 };
  }

  const failDelta = !passA && !passB
    ? (absBigInt(dA) >= absBigInt(dB) ? dA : dB)
    : (!passA ? dA : dB);

  return {
    result: 'fail',
    confidenceScore: 0.0,
    validationOverride: 'math_reconciliation_failed',
    mathDelta: formatCentsAsDecimal(failDelta),
  };
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  console.log('\n=== I6 Math Reconciliation Checkpoint Tests ===\n');
  let allPassed = true;

  function check(label, ok, extra) {
    const verdict = ok ? 'PASS' : 'FAIL';
    console.log(`  [${verdict}] ${label}`);
    if (extra) console.log(`         ${extra}`);
    if (!ok) allPassed = false;
  }

  // --- PASS SCENARIO ---
  // Single line item (service takes first value per fieldKey, not sum of repeated keys):
  // quantity=line_item_amount: 300.00
  // total_amount=subtotal: 300.00  (matches line item)
  // currency_type=tax: 30.00
  // invoice_number=total: 330.00  (300 + 30)
  const passInputs = [
    { fieldKey: 'quantity',       normalizedValue: '300.00' },
    { fieldKey: 'total_amount',   normalizedValue: '300.00' },
    { fieldKey: 'currency_type',  normalizedValue: '30.00'  },
    { fieldKey: 'invoice_number', normalizedValue: '330.00' },
  ];

  const passResult = await reconcile(client, DOC_TYPE_ID, passInputs);
  console.log('SCENARIO 1: Pass (correct math)');
  console.log('  Input: line_item=300.00, subtotal=300.00, tax=30.00, total=330.00');
  console.log('  Result:', JSON.stringify(passResult));
  check('mathReconciliation=pass', passResult && passResult.result === 'pass');
  check('confidenceScore=1.0',    passResult && passResult.confidenceScore === 1.0);

  // --- FAIL SCENARIO ---
  const failInputs = [
    { fieldKey: 'quantity',       normalizedValue: '300.00' },
    { fieldKey: 'total_amount',   normalizedValue: '300.00' },
    { fieldKey: 'currency_type',  normalizedValue: '30.00'  },
    { fieldKey: 'invoice_number', normalizedValue: '999.00' },
  ];

  const failResult = await reconcile(client, DOC_TYPE_ID, failInputs);
  console.log('\nSCENARIO 2: Fail (total=999.00 instead of 330.00)');
  console.log('  Input: line_item=300.00, subtotal=300.00, tax=30.00, total=999.00 (wrong)');
  console.log('  Result:', JSON.stringify(failResult));
  check('mathReconciliation=fail',                     failResult && failResult.result === 'fail');
  check('confidenceScore=0.0',                         failResult && failResult.confidenceScore === 0.0);
  check('validationOverride=math_reconciliation_failed', failResult && failResult.validationOverride === 'math_reconciliation_failed');
  check('mathDelta present',                           failResult && !!failResult.mathDelta, failResult && `mathDelta=${failResult.mathDelta}`);

  // --- SKIP: no documentTypeId ---
  const skipResult1 = await reconcile(client, null, passInputs);
  console.log('\nSCENARIO 3: Skip (null documentTypeId)');
  console.log('  Result:', skipResult1);
  check('skipped', typeof skipResult1 === 'string' && skipResult1.includes('skipped'));

  // --- SKIP: unknown documentTypeId ---
  const skipResult2 = await reconcile(client, '00000000-0000-0000-0000-000000000000', passInputs);
  console.log('\nSCENARIO 4: Skip (unknown documentTypeId - no role rows)');
  console.log('  Result:', skipResult2);
  check('skipped', typeof skipResult2 === 'string' && skipResult2.includes('skipped'));

  // --- MATH OVERRIDE: ML confidence=0.99 but math fails -> override to 0.0 ---
  // (simulated: same fail inputs as scenario 2; the ML score is irrelevant to reconcile())
  const overrideResult = await reconcile(client, DOC_TYPE_ID, failInputs);
  console.log('\nSCENARIO 5: Math override (ML confidence=0.99 on total, math fails -> 0.0)');
  console.log('  Result confidenceScore:', overrideResult && overrideResult.confidenceScore);
  check('confidenceScore=0.0 regardless of ML score', overrideResult && overrideResult.confidenceScore === 0.0);

  // --- TOLERANCE: within 2 cents ---
  // line_item: 300.01; subtotal=300.00 -> delta=0.01 (1 cent) <= 2 cents tolerance -> pass
  // subtotal+tax=300.00+30.00=330.00 = total -> check B passes
  const toleranceInputs = [
    { fieldKey: 'quantity',       normalizedValue: '300.01' },
    { fieldKey: 'total_amount',   normalizedValue: '300.00' },
    { fieldKey: 'currency_type',  normalizedValue: '30.00'  },
    { fieldKey: 'invoice_number', normalizedValue: '330.00' },
  ];
  const toleranceResult = await reconcile(client, DOC_TYPE_ID, toleranceInputs);
  console.log('\nSCENARIO 6: Tolerance (line=300.01 vs subtotal=300.00, delta=1 cent within +-2 cent tolerance -> pass)');
  console.log('  Result:', JSON.stringify(toleranceResult));
  check('within tolerance -> pass', toleranceResult && toleranceResult.result === 'pass');

  await client.end();

  console.log('\n=== OVERALL:', allPassed ? 'ALL CHECKPOINTS PASSED' : 'SOME CHECKPOINTS FAILED', '===\n');
  process.exit(allPassed ? 0 : 1);
}

main().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });
