// Supabase Management API discovery — sanitized output only.
// Never prints the PAT or any secret; prints statuses, refs, org/project metadata.
const BASE = 'https://api.supabase.com';
const PAT = process.env.SUPBESE;

function redact(value) {
  if (typeof value !== 'string') return value;
  // Defensive: if a secret-shaped string ever leaks into output, mask everything but last 4.
  if (/^sbp_|^sb_secret_|^eyJ/.test(value) || value.length > 80) return `<redacted len=${value.length}>`;
  return value;
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(BASE + path, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 300); }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function fail(label, status, body) {
  const msg = typeof body === 'string' ? body : JSON.stringify(body);
  console.log(`${label}: HTTP ${status} ${msg.slice(0, 300)}`);
}

async function runQuery(ref, sql) {
  return api(`/v1/projects/${ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: sql }),
  });
}

async function main() {
  if (!PAT) {
    console.log('SUPBESE is not set — cannot test Management API.');
    return;
  }
  console.log('== 1. Management API authentication test (GET /v1/projects) ==');
  const projects = await api('/v1/projects?per_page=100');
  if (projects.status !== 200) {
    fail('projects list', projects.status, projects.body);
    return;
  }
  const list = Array.isArray(projects.body) ? projects.body : [];
  console.log(`HTTP 200 — PAT authenticates. Visible projects: ${list.length}`);
  for (const p of list) {
    console.log(`  ref=${p.id} name="${p.name}" org=${p.organization_id} region=${p.region} status=${p.status}`);
  }

  console.log('== 2. Organizations visible to this PAT ==');
  const orgs = await api('/v1/organizations');
  if (orgs.status !== 200) {
    fail('organizations list', orgs.status, orgs.body);
  } else {
    const orgList = Array.isArray(orgs.body) ? orgs.body : [];
    console.log(`HTTP 200 — visible organizations: ${orgList.length}`);
    for (const o of orgList) console.log(`  id=${o.id} name="${o.name}"`);
  }

  if (list.length === 0) {
    console.log('RESULT: PAT is valid but sees zero projects/organizations — integration is bound to an account that owns no project.');
    return;
  }

  const match = list.find((p) => /international-visa-platform/i.test(p.name || ''));
  const target = match || list[0];
  console.log(`== 3. SQL access test on ${match ? 'MATCHED' : 'first visible'} project ref=${target.id} ==`);
  const ping = await runQuery(target.id, 'select 1 as ok');
  if (ping.status !== 200) {
    fail('database/query ping', ping.status, ping.body);
    return;
  }
  console.log(`HTTP 200 — direct SQL access works. ${JSON.stringify(ping.body).slice(0, 120)}`);

  console.log('== 4. Existing public tables and approximate row counts ==');
  const tables = await runQuery(
    target.id,
    `select table_name from information_schema.tables where table_schema='public' order by table_name limit 300`,
  );
  if (tables.status !== 200) {
    fail('public tables', tables.status, tables.body);
  } else {
    const names = (tables.body || []).map((r) => r.table_name);
    console.log(`public tables (${names.length}): ${names.join(', ')}`);
    if (names.length > 0) {
      const counts = await runQuery(
        target.id,
        `select relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by relname`,
      );
      if (counts.status === 200) {
        for (const row of counts.body || []) console.log(`  ${row.relname}: ~${row.n_live_tup} rows`);
      } else {
        fail('row counts', counts.status, counts.body);
      }
    }
  }

  console.log('== 5. Migration history (supabase_migrations.schema_migrations) ==');
  const migrations = await runQuery(
    target.id,
    `select version, name, statements, applied_at from supabase_migrations.schema_migrations order by version limit 200`,
  );
  if (migrations.status !== 200) {
    fail('migration history', migrations.status, migrations.body);
  } else {
    const rows = migrations.body || [];
    console.log(`recorded migrations: ${rows.length}`);
    for (const r of rows) console.log(`  ${r.version} ${r.name} (applied ${r.applied_at || 'unknown'})`);
  }

  console.log('== 6. Supabase version ==');
  const version = await api(`/v1/projects/${target.id}`);
  if (version.status === 200 && version.body) {
    console.log(`  db_version=${redact(version.body.database?.version || 'unknown')} db_host=${redact(version.body.database?.host || 'unknown')}`);
  }
}

main().catch((err) => {
  console.log(`DISCOVERY ERROR: ${err && err.name === 'AbortError' ? 'request timed out' : err.message}`);
});
