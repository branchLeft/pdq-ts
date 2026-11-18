// Loads the conformance bundle in real browsers through Playwright and fails
// if any check fails in any of them. With --control it loads the sabotaged
// bundle instead and fails unless every browser reports failed checks.
//
// Usage: node tools/conformance-in-browsers.mts [--control] chromium firefox webkit
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import type { BrowserType } from 'playwright';

interface Report {
  engine: string;
  results: Array<{ name: string; problems: string[] }>;
  failed: number;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'conformance-bundle');
const BROWSERS: Readonly<Record<string, BrowserType>> = { chromium, firefox, webkit };
const TIMEOUT_MS = 15 * 60_000;

// Served from 127.0.0.1 rather than opened as a file: Web Crypto exists only
// in a secure context, and a loopback origin is one.
const FILES: Readonly<Record<string, string>> = {
  '/conformance.html': 'text/html; charset=utf-8',
  '/conformance.js': 'text/javascript; charset=utf-8',
  '/sabotaged.html': 'text/html; charset=utf-8',
  '/sabotaged.js': 'text/javascript; charset=utf-8',
};

const server = createServer((request, response) => {
  const path = request.url ?? '';
  const type = FILES[path];
  if (type === undefined) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': type }).end(readFileSync(join(BUNDLE, path)));
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const { port } = server.address() as AddressInfo;

const args = process.argv.slice(2);
const control = args.includes('--control');
const names = args.filter((arg) => arg !== '--control');
const page = control ? 'sabotaged.html' : 'conformance.html';

const wrong: string[] = [];
try {
  if (names.length === 0) {
    throw new Error('usage: conformance-in-browsers.mts [--control] chromium|firefox|webkit ...');
  }
  for (const name of names) {
    const type = BROWSERS[name];
    if (type === undefined) {
      throw new Error(`unknown browser ${name}`);
    }
    const browser = await type.launch();
    try {
      const tab = await browser.newPage();
      tab.on('console', (message) => console.log(`[${name}] ${message.text()}`));
      tab.on('pageerror', (error) => console.log(`[${name}] page error: ${error.message}`));
      await tab.goto(`http://127.0.0.1:${port}/${page}`);
      const handle = await tab.waitForFunction(
        () => (globalThis as { __pdqConformance?: unknown }).__pdqConformance,
        undefined,
        { timeout: TIMEOUT_MS },
      );
      const report = (await handle.jsonValue()) as Report;
      console.log(`[${name}] ${browser.version()}: ${report.failed} failed`);
      const ran = report.results.length > 0;
      if (control ? !ran || report.failed === 0 : !ran || report.failed > 0) {
        wrong.push(name);
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
if (wrong.length > 0) {
  throw new Error(
    control
      ? `the sabotaged bundle did not fail in: ${wrong.join(', ')}`
      : `conformance checks failed in: ${wrong.join(', ')}`,
  );
}
if (control) {
  console.log(`control: the sabotaged bundle failed in ${names.join(', ')}, as it must`);
}
