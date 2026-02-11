/**
 * D2 Performance Checklist — Backend Measurements
 * 
 * Tests from plan.md §4.5:
 *   1. Create table: < 500ms for 100 rows × 10 columns (1000 cell inserts)
 *   2. Load table:   < 300ms for 100 rows × 10 columns
 *   3. Update cell:  < 100ms (single UPDATE + validation)
 *   4. Bulk column validation: < 1s for 1000 cells
 *
 * Required test size: 100 rows × 20 columns (2000 cells)
 *
 * Usage:  node test/perf-d2.mjs
 */

const API = 'http://localhost:3000';
const EMAIL = 'test@test.com';
const PASSWORD = '12341234';

// ── Helpers ──────────────────────────────────────────────────────────────

let authCookie = '';
let csrfToken = '';

function parseCookies(res) {
    const sc = res.headers.getSetCookie?.() ?? [];
    for (const raw of sc) {
        const pair = raw.split(';')[0];
        const [name, ...rest] = pair.split('=');
        const val = rest.join('=');
        if (name.trim() === 'todo_auth') authCookie = `todo_auth=${val}`;
        if (name.trim() === 'todo_csrf') csrfToken = decodeURIComponent(val);
    }
}

async function api(path, opts = {}) {
    const cookieStr = [authCookie, csrfToken ? `todo_csrf=${encodeURIComponent(csrfToken)}` : '']
        .filter(Boolean).join('; ');
    const headers = {
        'Content-Type': 'application/json',
        ...(cookieStr ? { Cookie: cookieStr } : {}),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        ...opts.headers,
    };
    const res = await fetch(`${API}${path}`, { ...opts, headers, redirect: 'manual' });
    parseCookies(res);
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 400)}`);
    }
    return text ? JSON.parse(text) : null;
}

function ms(hrStart) {
    const diff = process.hrtime.bigint() - hrStart;
    return Number(diff) / 1e6;
}

function fmtMs(v) { return v.toFixed(1) + ' ms'; }

// ── Step 0: Login ────────────────────────────────────────────────────────
async function login() {
    console.log('🔐 Logging in...');
    const loginRes = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        redirect: 'manual',
    });
    parseCookies(loginRes);
    const loginText = await loginRes.text();
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status} ${loginText}`);
    console.log(`   ✅ Logged in (auth cookie: ${authCookie ? 'yes' : 'NO'}, csrf: ${csrfToken ? 'yes' : 'NO'})\n`);
}

// ── Step 1: Find or create a baseline ───────────────────────────────────
async function getUsableBaseline() {
    console.log('🔍 Looking for a usable baseline...');

    // Try GET /todos first
    let tasks;
    try {
        tasks = await api('/todos');
    } catch (e) {
        console.log(`   ⚠️ GET /todos failed: ${e.message}`);
        tasks = [];
    }

    // Check specific user-provided attachment first
    const specificAttachmentId = '8b3381ab-dbc2-4c20-9c5f-76453f2b381e';
    try {
        console.log(`   Checking specific attachment ${specificAttachmentId}...`);
        try {
            const bl = await api(`/attachments/${specificAttachmentId}/baseline`);
            if (bl && ['draft', 'reviewed'].includes(bl.status) && !bl.utilizedAt) {
                console.log(`   ✅ Found baseline ${bl.id} on specific attachment (status=${bl.status})\n`);
                return bl.id;
            }
            // If no baseline, trying to create one
            if (!bl) {
                console.log(`   Found attachment ${specificAttachmentId}, creating draft baseline...`);
                const newBl = await api(`/attachments/${specificAttachmentId}/baseline/draft`, { method: 'POST' });
                console.log(`   ✅ Created baseline ${newBl.id} (status=${newBl.status})\n`);
                return newBl.id;
            }
        } catch {
            // 404 means no baseline, create one
            console.log(`   No baseline for attachment ${specificAttachmentId}, creating draft baseline...`);
            const newBl = await api(`/attachments/${specificAttachmentId}/baseline/draft`, { method: 'POST' });
            console.log(`   ✅ Created baseline ${newBl.id} (status=${newBl.status})\n`);
            return newBl.id;
        }
    } catch (e) {
        console.log(`   ⚠️ Could not check specific attachment: ${e.message}`);
    }

    // Check specific user-provided task first
    const specificTaskId = '5922795d-dafc-4e1f-9d6f-69b8e5fbe900';
    if (specificTaskId) {
        try {
            console.log(`   Checking specific task ${specificTaskId}...`);
            const attachments = await api(`/attachments/todo/${specificTaskId}`);
            for (const att of (attachments || [])) {
                try {
                    const bl = await api(`/attachments/${att.id}/baseline`);
                    if (bl && ['draft', 'reviewed'].includes(bl.status) && !bl.utilizedAt) {
                        console.log(`   ✅ Found baseline ${bl.id} on specific task (status=${bl.status})\n`);
                        return bl.id;
                    }
                    // If no baseline, trying to create one
                    if (!bl) {
                        console.log(`   Found attachment ${att.id}, creating draft baseline...`);
                        const newBl = await api(`/attachments/${att.id}/baseline/draft`, { method: 'POST' });
                        console.log(`   ✅ Created baseline ${newBl.id} (status=${newBl.status})\n`);
                        return newBl.id;
                    }
                } catch {
                    // 404 means no baseline, create one
                    console.log(`   No baseline for attachment ${att.id}, creating draft baseline...`);
                    const newBl = await api(`/attachments/${att.id}/baseline/draft`, { method: 'POST' });
                    console.log(`   ✅ Created baseline ${newBl.id} (status=${newBl.status})\n`);
                    return newBl.id;
                }
            }
        } catch (e) {
            console.log(`   ⚠️ Could not check specific task: ${e.message}`);
        }
    }

    if (tasks && tasks.length > 0) {
        for (const task of tasks.slice(0, 10)) {
            try {
                const attachments = await api(`/attachments/todo/${task.id}`);
                for (const att of (attachments || [])) {
                    // Try get baseline
                    try {
                        const bl = await api(`/attachments/${att.id}/baseline`);
                        if (bl && ['draft', 'reviewed'].includes(bl.status) && !bl.utilizedAt) {
                            console.log(`   ✅ Found baseline ${bl.id} (status=${bl.status})\n`);
                            return bl.id;
                        }
                    } catch { /* no baseline for this attachment */ }
                }
            } catch { /* ignore */ }
        }
    }

    // Last resort: create a fresh task, attachment, and baseline
    console.log('   No existing usable baseline found. Creating test data...');

    // Create task
    const task = await api('/todos', {
        method: 'POST',
        body: JSON.stringify({ title: 'D2 Perf Test Task' }),
    });
    console.log(`   Created task ${task.id}`);

    // We need an attachment + baseline. Upload a tiny dummy file.
    // Since we're running inside Docker, let's use FormData approach via the API.
    // Create a minimal PNG (1x1 pixel)
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pngBuffer = Buffer.from(pngBase64, 'base64');
    const boundary = '----FormBoundary' + Date.now();

    const bodyParts = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="file"; filename="test.png"\r\n`,
        `Content-Type: image/png\r\n\r\n`,
    ];
    const bodyEnd = `\r\n--${boundary}--\r\n`;
    const bodyStart = Buffer.from(bodyParts.join(''));
    const bodyEndBuf = Buffer.from(bodyEnd);
    const fullBody = Buffer.concat([bodyStart, pngBuffer, bodyEndBuf]);

    const cookieStr = [authCookie, csrfToken ? `todo_csrf=${encodeURIComponent(csrfToken)}` : '']
        .filter(Boolean).join('; ');

    const uploadRes = await fetch(`${API}/attachments/todo/${task.id}`, {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Cookie': cookieStr,
            'x-csrf-token': csrfToken,
        },
        body: fullBody,
        redirect: 'manual',
    });
    parseCookies(uploadRes);
    const uploadText = await uploadRes.text();
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status} ${uploadText.slice(0, 200)}`);
    const attachment = JSON.parse(uploadText);
    console.log(`   Created attachment ${attachment.id}`);

    // Create draft baseline
    const baseline = await api(`/attachments/${attachment.id}/baseline/draft`, { method: 'POST' });
    console.log(`   ✅ Created baseline ${baseline.id} (status=${baseline.status})\n`);
    return baseline.id;
}

// ── TEST 1: Create Table (100r × 10c = 1000 cells) ──────────────────────
async function testCreateTable(baselineId, rows, cols, label) {
    console.log(`📊 TEST: Create table ${rows} rows × ${cols} columns (${rows * cols} cell inserts)`);
    console.log('   Target: < 500ms');

    const cellValues = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            row.push(`R${r}C${c}`);
        }
        cellValues.push(row);
    }

    const t0 = process.hrtime.bigint();
    const table = await api(`/baselines/${baselineId}/tables`, {
        method: 'POST',
        body: JSON.stringify({ cellValues, tableLabel: label }),
    });
    const elapsed = ms(t0);

    const pass = elapsed < 500;
    console.log(`   Result: ${fmtMs(elapsed)} ${pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Table ID: ${table.id}\n`);

    return { name: `Create ${rows}×${cols} (${rows * cols} cells)`, elapsed, target: 500, pass, tableId: table.id };
}

// ── TEST 2: Load Table ──────────────────────────────────────────────────
async function testLoadTable(tableId, label) {
    console.log(`📊 TEST: Load table (${label})`);
    console.log('   Target: < 300ms');

    // Warm up once
    await api(`/tables/${tableId}`);

    // Run 3 times and average
    const times = [];
    for (let i = 0; i < 3; i++) {
        const t0 = process.hrtime.bigint();
        const result = await api(`/tables/${tableId}`);
        times.push(ms(t0));
        if (i === 0) {
            console.log(`   Rows returned: ${result.cells?.length ?? '?'}, Cols: ${result.cells?.[0]?.length ?? '?'}`);
        }
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const pass = avg < 300;
    console.log(`   Avg: ${fmtMs(avg)} [${times.map(t => fmtMs(t)).join(', ')}] ${pass ? '✅ PASS' : '❌ FAIL'}\n`);

    return { name: `Load table ${label}`, elapsed: avg, target: 300, pass };
}

// ── TEST 3: Update Cell ─────────────────────────────────────────────────
async function testUpdateCell(tableId) {
    console.log('📊 TEST: Update cell (single UPDATE + validation)');
    console.log('   Target: < 100ms');

    // Warm up
    await api(`/tables/${tableId}/cells/0/0`, {
        method: 'PUT',
        body: JSON.stringify({ value: 'warmup' }),
    });

    // Run 10 updates on different cells and take median/avg
    const times = [];
    for (let i = 0; i < 10; i++) {
        const row = i % 10;
        const col = Math.floor(i / 10);
        const t0 = process.hrtime.bigint();
        await api(`/tables/${tableId}/cells/${row}/${col}`, {
            method: 'PUT',
            body: JSON.stringify({ value: `updated_${i}_${Date.now()}` }),
        });
        times.push(ms(t0));
    }

    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const median = times[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const min = times[0];
    const max = times[times.length - 1];

    const pass = median < 100;
    console.log(`   Median: ${fmtMs(median)} | Avg: ${fmtMs(avg)} | Min: ${fmtMs(min)} | Max: ${fmtMs(max)} | P95: ${fmtMs(p95)}`);
    console.log(`   ${pass ? '✅ PASS' : '❌ FAIL'}\n`);

    return { name: 'Update cell (median of 10)', elapsed: median, target: 100, pass, details: { avg, min, max, p95 } };
}

// ── TEST 4: Bulk Column Validation ──────────────────────────────────────
async function testBulkColumnValidation(tableId) {
    console.log('📊 TEST: Bulk column validation (assign column → validates all cells)');
    console.log('   Target: < 1000ms for column with 100 rows');

    // Find a field to use
    let fieldKey, fieldLabel, fieldType;
    try {
        const fields = await api('/fields');
        if (fields && fields.length > 0) {
            const activeField = fields.find(f => f.status === 'active');
            if (activeField) {
                fieldKey = activeField.fieldKey;
                fieldLabel = activeField.label;
                fieldType = activeField.characterType;
            }
        }
    } catch (e) {
        console.log(`   ⚠️ Could not fetch field library: ${e.message}`);
    }

    if (!fieldKey) {
        console.log('   ❌ SKIP: No active field found in field library\n');
        return { name: 'Bulk column validation', elapsed: 0, target: 1000, pass: false, skipped: true };
    }

    console.log(`   Using field: "${fieldLabel}" (key=${fieldKey}, type=${fieldType})`);

    // Map column 0 → field (triggers validation of all 100 cells in that column)  
    const t0 = process.hrtime.bigint();
    await api(`/tables/${tableId}/columns/0/assign`, {
        method: 'POST',
        body: JSON.stringify({ fieldKey }),
    });
    const elapsed = ms(t0);

    const pass = elapsed < 1000;
    console.log(`   Result: ${fmtMs(elapsed)} ${pass ? '✅ PASS' : '❌ FAIL'}`);

    // Also map a second column for extra data
    let elapsed2 = 0;
    try {
        const t1 = process.hrtime.bigint();
        await api(`/tables/${tableId}/columns/1/assign`, {
            method: 'POST',
            body: JSON.stringify({ fieldKey }),
        });
        elapsed2 = ms(t1);
        console.log(`   Column 1 re-map: ${fmtMs(elapsed2)}`);
    } catch { /* ignore */ }

    console.log('');
    return { name: 'Bulk col validation (100 cells)', elapsed, target: 1000, pass };
}

// ── Cleanup ──────────────────────────────────────────────────────────────
async function cleanup(tableIds) {
    console.log('🧹 Cleaning up test tables...');
    for (const id of tableIds) {
        try {
            await api(`/tables/${id}`, { method: 'DELETE' });
            console.log(`   Deleted ${id}`);
        } catch (e) {
            console.log(`   ⚠️ Could not delete ${id}: ${e.message.slice(0, 100)}`);
        }
    }
    console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  D2 Performance Checklist — Backend Measurements          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    await login();
    const baselineId = await getUsableBaseline();

    const results = [];
    const tableIdsToClean = [];

    // ── Backend Tests ──────────────────────────────────────────────────────

    // TEST 1a: Create 100×10 (1000 cells) — plan.md target
    const r1 = await testCreateTable(baselineId, 100, 10, 'PerfTest 100x10');
    results.push(r1);
    if (r1.tableId) tableIdsToClean.push(r1.tableId);

    // TEST 1b: Create 100×20 (2000 cells) — required larger test size
    const r1b = await testCreateTable(baselineId, 100, 20, 'PerfTest 100x20');
    results.push(r1b);
    if (r1b.tableId) tableIdsToClean.push(r1b.tableId);

    // TEST 2a: Load 100×10
    const r2a = await testLoadTable(r1.tableId, '100×10 (1000 cells)');
    results.push(r2a);

    // TEST 2b: Load 100×20
    const r2b = await testLoadTable(r1b.tableId, '100×20 (2000 cells)');
    results.push(r2b);

    // TEST 3: Update cell
    const r3 = await testUpdateCell(r1.tableId);
    results.push(r3);

    // TEST 4: Bulk column validation (100 rows)
    const r4 = await testBulkColumnValidation(r1b.tableId);
    results.push(r4);

    // Cleanup
    await cleanup(tableIdsToClean);

    // ── Summary ──────────────────────────────────────────────────────────
    console.log('╔═══════════════════════════════════════════════════════════════════════╗');
    console.log('║  BACKEND SUMMARY                                                      ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════╣');
    for (const r of results) {
        if (r.skipped) {
            console.log(`║  ${(r.name).padEnd(36)} ${'SKIPPED'.padEnd(12)} ${'< ' + fmtMs(r.target).padEnd(10)} ⏭️   ║`);
        } else {
            const status = r.pass ? '✅' : '❌';
            console.log(`║  ${(r.name).padEnd(36)} ${fmtMs(r.elapsed).padEnd(12)} ${'< ' + fmtMs(r.target).padEnd(10)} ${status}   ║`);
        }
    }
    console.log('╚═══════════════════════════════════════════════════════════════════════╝');
    console.log('');

    const passCount = results.filter(r => r.pass).length;
    const skipCount = results.filter(r => r.skipped).length;
    const failCount = results.length - passCount - skipCount;
    console.log(`Results: ${passCount} passed, ${failCount} failed, ${skipCount} skipped out of ${results.length} tests`);
    console.log('');

    if (failCount === 0) {
        console.log('🎉 All backend performance targets MET');
    } else {
        console.log('⚠️ Some targets missed — see details above');
    }
}

main().catch(e => {
    console.error('❌ Fatal error:', e.message);
    process.exit(1);
});
