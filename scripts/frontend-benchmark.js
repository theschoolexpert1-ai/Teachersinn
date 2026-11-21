'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend', 'app.js'), 'utf8');
const boot = source.indexOf('  // ====================================================================== boot');
if (boot < 0) throw new Error('Frontend boot marker not found');

function client(fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })) {
  const listeners = { document: [], window: [] };
  const storage = new Map();
  const sandbox = {
    URLSearchParams, console, fetch: fetchImpl, confirm: () => true,
    setTimeout: () => 1, clearTimeout() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    location: { hash: '#/', host: 'localhost' },
    window: {
      addEventListener: type => listeners.window.push(type), scrollTo() {}, print() {},
      matchMedia: () => ({ matches: false }),
    },
    document: {
      documentElement: { dataset: {} }, activeElement: null,
      addEventListener: type => listeners.document.push(type),
      querySelector: () => null, querySelectorAll: () => [],
    },
  };
  vm.createContext(sandbox);
  const hooks = `globalThis.__benchmark = {
    layout, routes,
    setMe(user) { state.me = user; },
    setApi(fn) { api = fn; },
    invokeApi(...args) { return api(...args); }
  }; })();`;
  vm.runInContext(source.slice(0, boot) + hooks, sandbox, { filename: 'frontend/app.js' });
  return { hooks: sandbox.__benchmark, listeners };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    iterations: values.length,
    averageMs: +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4),
    p95Ms: +sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)].toFixed(4),
  };
}

async function measure(iterations, operation) {
  for (let i = 0; i < 10; i += 1) await operation();
  const values = [];
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    await operation();
    values.push(performance.now() - started);
  }
  return summarize(values);
}

async function main() {
  const { hooks, listeners } = client();
  hooks.setMe({ id: 1, name: 'Benchmark Teacher', designation: 'Teacher', role: 'educator' });
  const layout = await measure(500, () => hooks.layout('dashboard', { s: '<section><h1>Dashboard</h1></section>' }).s);

  const courses = Array.from({ length: 500 }, (_, index) => ({
    id: index + 1, title: `Course ${index + 1}`, category: index % 2 ? 'Assessment' : 'Pedagogy',
    level: 'Beginner', instructor: 'Teacher Educator', summary: 'Representative professional learning course.',
    cpd_hours: 2, lessons: 6, enrolled: index % 3 === 0 ? 1 : 0,
    completed_lessons: index % 3 === 0 ? 2 : 0, completed: 0,
  }));
  hooks.setApi(async (method, url) => {
    if (method === 'GET' && url === '/api/courses') return courses;
    throw new Error(`Unexpected benchmark request: ${method} ${url}`);
  });
  const learnRoute = hooks.routes.find(route => route.re.test('/learn'));
  const courseCatalogue = await measure(100, async () => (await learnRoute.fn('/learn'.match(learnRoute.re), new URLSearchParams())).s.length);

  let fetches = 0;
  const concurrent = client(async () => {
    fetches += 1;
    await Promise.resolve();
    return { ok: true, status: 200, json: async () => ({ stats: {} }) };
  });
  await Promise.all([
    concurrent.hooks.invokeApi('GET', '/api/dashboard'),
    concurrent.hooks.invokeApi('GET', '/api/dashboard'),
  ]);

  const assets = ['index.html', 'theme-init.js', 'app.js', 'styles.css'].map(name => ({
    name, bytes: fs.statSync(path.join(root, 'frontend', name)).size,
  }));
  console.log(JSON.stringify({
    environment: { node: process.version, host: process.platform, synthetic: true },
    assets,
    initialAssetRequests: assets.length + 1,
    listeners: { document: listeners.document, window: listeners.window },
    concurrentIdenticalGetFetches: fetches,
    benchmarks: { layout, courseCatalogue500Items: courseCatalogue },
    limitations: 'VM/template benchmark only; no browser paint, layout, heap, Web Vitals, device, or network measurement.',
  }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
