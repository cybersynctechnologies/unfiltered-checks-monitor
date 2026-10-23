// Tiny local server for the dashboard, so the "Refresh now" button can run collect.mjs.
// Listens on 127.0.0.1 only. Run: node server.mjs, then open http://localhost:4777
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 4777;
const COOLDOWN_MS = 60e3; // don't hit YouTube more than once a minute
const ROOT = dirname(fileURLToPath(import.meta.url));

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/data/snapshots.json': ['data/snapshots.json', 'application/json; charset=utf-8'],
  '/data/research.json': ['data/research.json', 'application/json; charset=utf-8'],
};

let running = null;
let lastRun = 0;

function collect() {
  return new Promise((resolve) => {
    execFile(process.execPath, [join(ROOT, 'collect.mjs')], { cwd: ROOT, timeout: 60e3 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: (stdout || stderr || err?.message || '').trim() });
    });
  });
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;

  if (path === '/api/refresh' && req.method === 'POST') {
    if (!running && Date.now() - lastRun < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (Date.now() - lastRun)) / 1000);
      return send(res, 429, JSON.stringify({ ok: false, output: `Checked moments ago. Try again in ${wait}s.` }));
    }
    running ??= collect().finally(() => {
      lastRun = Date.now();
      running = null;
    });
    const result = await running;
    console.log(`${new Date().toISOString()}  manual refresh: ${result.output}`);
    return send(res, result.ok ? 200 : 502, JSON.stringify(result));
  }

  const file = FILES[path];
  if (!file || req.method !== 'GET') return send(res, 404, 'Not found', 'text/plain');
  try {
    send(res, 200, await readFile(join(ROOT, file[0])), file[1]);
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`${new Date().toISOString()}  dashboard on http://localhost:${PORT}`);
});
