'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const profiles = [1, 5, 10, 25];
const endpoints = ['/api/dashboard', '/api/courses', '/api/workshops', '/api/educators',
  '/api/discussions', '/api/notifications?page=1', '/api/admin/overview', '/api/admin/analytics?period=30'];

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teachersinn-benchmark-'));
  process.env.TEACHERSINN_DATA_DIR = root;
  process.env.DATA_BACKEND = 'sqlite';
  process.env.AUTH_BACKEND = 'legacy';
  process.env.TRUST_PROXY = '1';
  process.env.ADMIN_EMAIL = 'benchmark-admin@test.local';
  process.env.ADMIN_PASSWORD = 'BenchmarkPassword2026';
  const server = require('../src/server');
  const { db } = require('../src/db');

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
    });
    if (!login.ok) throw new Error(`Benchmark login failed with HTTP ${login.status}`);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const report = [];

    for (const concurrency of profiles) {
      const jobs = Array.from({ length: 40 }, (_, index) => endpoints[index % endpoints.length]);
      const latencies = [];
      let succeeded = 0; let failed = 0; let cursor = 0;
      const started = performance.now();
      async function worker() {
        while (cursor < jobs.length) {
          const index = cursor++;
          const began = performance.now();
          try {
            const response = await fetch(base + jobs[index], { headers: { Cookie: cookie, 'X-Forwarded-For': `192.0.2.${concurrency}` } });
            await response.arrayBuffer();
            if (response.ok) succeeded += 1; else failed += 1;
          } catch { failed += 1; }
          latencies.push(performance.now() - began);
        }
      }
      await Promise.all(Array.from({ length: concurrency }, worker));
      const elapsed = performance.now() - started;
      latencies.sort((a, b) => a - b);
      const average = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
      report.push({ concurrency, requests: jobs.length, succeeded, failed,
        averageMs: +average.toFixed(2), medianMs: +percentile(latencies, .5).toFixed(2),
        p95Ms: +percentile(latencies, .95).toFixed(2), p99Ms: +percentile(latencies, .99).toFixed(2),
        throughputRps: +(jobs.length / (elapsed / 1000)).toFixed(2) });
    }
    console.log(JSON.stringify({ environment: { node: process.version, host: 'localhost', database: 'disposable SQLite WAL' }, endpoints, report }, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
