const API = 'http://api:3000';

function parseCookies(setCookieHeader) {
  const jar = {};
  if (!setCookieHeader) return jar;
  const parts = setCookieHeader.split(/,\s*(?=[^;]+=[^;]+)/g);
  for (const p of parts) {
    const first = p.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0) {
      const k = first.slice(0, eq).trim();
      const v = first.slice(eq + 1).trim();
      jar[k] = v;
    }
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
}

async function req(method, path, {jar, body, csrf, expectJson=true} = {}) {
  const headers = { 'content-type': 'application/json' };
  if (jar && Object.keys(jar).length) headers.cookie = cookieHeader(jar);
  if (csrf) headers['x-csrf-token'] = csrf;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  if (expectJson) {
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
  }
  return { res, json, text };
}

(async () => {
  const out = { steps: [], errors: [] };

  const loginResp = await req('POST', '/auth/login', {
    body: { email: 'test@test.com', password: '12341234' },
  });

  out.steps.push({ step: 'login', status: loginResp.res.status, body: loginResp.json });
  if (!loginResp.res.ok) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const cookieRaw = loginResp.res.headers.get('set-cookie') || '';
  const jar = parseCookies(cookieRaw);
  const csrf = jar['todo_csrf'];
  out.steps.push({ step: 'cookies', keys: Object.keys(jar), hasCsrf: Boolean(csrf) });

  const todosResp = await req('GET', '/todos', { jar });
  out.steps.push({ step: 'todos', status: todosResp.res.status, count: Array.isArray(todosResp.json) ? todosResp.json.length : null });
  if (!todosResp.res.ok || !Array.isArray(todosResp.json)) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  let target = null;
  for (const t of todosResp.json) {
    const attResp = await req('GET', `/attachments/todo/${t.id}`, { jar });
    if (attResp.res.ok && Array.isArray(attResp.json) && attResp.json.length > 0) {
      target = { todo: t, attachments: attResp.json };
      break;
    }
  }

  if (!target) {
    out.errors.push('No todo with attachments found for test user');
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const attachment = target.attachments.find(a => a.mimeType === 'application/pdf' || (a.mimeType || '').startsWith('image/')) || target.attachments[0];
  out.steps.push({ step: 'target_attachment', attachmentId: attachment.id, mimeType: attachment.mimeType, filename: attachment.filename });

  const triggerResp = await req('POST', `/attachments/${attachment.id}/ocr`, { jar, csrf });
  out.steps.push({ step: 'trigger_ocr', status: triggerResp.res.status, body: triggerResp.json });
  if (!triggerResp.res.ok) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  let current = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const listResp = await req('GET', `/attachments/${attachment.id}/ocr`, { jar });
    if (!listResp.res.ok || !Array.isArray(listResp.json) || listResp.json.length === 0) continue;
    const row = listResp.json[0];
    current = row;
    if (row.processingStatus === 'completed' || row.processingStatus === 'failed') {
      break;
    }
  }

  out.steps.push({
    step: 'ocr_output',
    found: Boolean(current),
    ocrId: current?.id ?? null,
    processingStatus: current?.processingStatus ?? null,
    status: current?.status ?? null,
    metadata: current?.metadata ?? null,
  });

  if (!current || current.processingStatus !== 'completed') {
    out.errors.push('OCR did not complete in time');
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const confirmResp = await req('POST', `/ocr/${current.id}/confirm`, { jar, csrf, body: {} });
  out.steps.push({ step: 'confirm_ocr', status: confirmResp.res.status, body: confirmResp.json });
  if (!confirmResp.res.ok) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const draftResp = await req('POST', `/attachments/${attachment.id}/baseline/draft`, { jar, csrf });
  out.steps.push({ step: 'baseline_draft', status: draftResp.res.status, baselineId: draftResp.json?.id ?? null, body: draftResp.json });

  const baselineResp = await req('GET', `/attachments/${attachment.id}/baseline`, { jar });
  out.steps.push({ step: 'baseline_get', status: baselineResp.res.status, hasBaseline: Boolean(baselineResp.json), baselineStatus: baselineResp.json?.baseline?.status ?? baselineResp.json?.status ?? null });

  console.log(JSON.stringify(out, null, 2));
})();
