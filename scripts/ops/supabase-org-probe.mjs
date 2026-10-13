// Focused probe for the organizations_read / preflight failure (sanitized output only).
// Distinguishes: (a) token invalid, (b) token valid but zero orgs (account mismatch),
// (c) token valid with orgs present (provisioning should then succeed).
const BASE = 'https://api.supabase.com';
const PAT = process.env.SUPBESE;

async function api(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(BASE + path, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 300); }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function summarize(label, { status, body }) {
  if (status === 200 && Array.isArray(body)) {
    console.log(`${label}: HTTP 200 — count=${body.length}`);
    for (const item of body) {
      const id = item?.id || item?.organization_id || '(no id)';
      const name = item?.name || '(no name)';
      console.log(`  ${label} item: id=${id} name="${name}"`);
    }
  } else {
    const msg = typeof body === 'string' ? body : JSON.stringify(body);
    console.log(`${label}: HTTP ${status} ${msg.slice(0, 300)}`);
  }
}

if (!PAT) {
  console.log('SUPBESE is not set — cannot probe.');
  process.exit(0);
}

console.log('== organizations endpoint (preflight used by provisioning) ==');
summarize('GET /v1/organizations', await api('/v1/organizations'));

console.log('== projects endpoint (control; expected 403 missing projects_read) ==');
summarize('GET /v1/projects', await api('/v1/projects?per_page=5'));

console.log('== token introspection via a harmless scoped endpoint ==');
const who = await api('/v1/oauth/authorize');
console.log(`GET /v1/oauth/authorize: HTTP ${who.status} (any non-network response proves API reachability)`);
