// Loads the conformance bundle in real browsers through Playwright and fails
// if any check fails in any of them.
//
// Usage: node tools/conformance-in-browsers.mts chromium firefox webkit
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
const FILES: Readonly<Record<string, readonly [string, string]>> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/conformance.js': ['conformance.js', 'text/javascript; charset=utf-8'],
};

const server = createServer((request, response) => {
  const file = FILES[request.url ?? ''];
  if (file === undefined) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': file[1] }).end(readFileSync(join(BUNDLE, file[0])));
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const { port } = server.address() as AddressInfo;

let failures = 0;
try {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    throw new Error('usage: conformance-in-browsers.mts chromium|firefox|webkit ...');
  }
  for (const name of names) {
    const type = BROWSERS[name];
    if (type === undefined) {
      throw new Error(`unknown browser ${name}`);
    }
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      page.on('console', (message) => console.log(`[${name}] ${message.text()}`));
      page.on('pageerror', (error) => console.log(`[${name}] page error: ${error.message}`));
      await page.goto(`http://127.0.0.1:${port}/`);
      const handle = await page.waitForFunction(
        () => (globalThis as { __pdqConformance?: unknown }).__pdqConformance,
        undefined,
        { timeout: TIMEOUT_MS },
      );
      const report = (await handle.jsonValue()) as Report;
      console.log(`[${name}] ${browser.version()}: ${report.failed} failed`);
      failures += report.failed;
      if (report.results.length === 0) {
        failures += 1;
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
if (failures > 0) {
  throw new Error(`${failures} conformance checks failed`);
}
