// Preview smoke test (sanitized): HTTP status for key routes on the live dev preview.
const BASE = process.env.PREVIEW_URL || 'http://localhost:3000';
const routes = [
  '/',
  '/login',
  '/register',
  '/flights/fares',
  '/airports',
  '/visa-categories',
  '/countries',
  '/planner',
];
let failures = 0;
for (const route of routes) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(BASE + route, { signal: controller.signal, redirect: 'manual' });
    clearTimeout(timer);
    const ok = res.status < 500;
    if (!ok) failures++;
    console.log(`${route} -> HTTP ${res.status}${ok ? '' : '  <-- SERVER ERROR'}`);
  } catch (err) {
    failures++;
    console.log(`${route} -> ERROR ${err.cause?.code || err.name}: ${err.message}`);
  }
}
console.log(failures === 0 ? 'SMOKE RESULT: all routes healthy (no 5xx).' : `SMOKE RESULT: ${failures} route(s) errored.`);
