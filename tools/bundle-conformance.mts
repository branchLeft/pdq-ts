// Bundles test/conformance/entry.ts, the port and the recorded reference
// values into one standard module, conformance-bundle/conformance.js, that
// any engine can load with no resolver, no file system and no permissions.
// esbuild removes the types and joins the files; it is not asked to minify,
// so the arithmetic is the source's, statement for statement.
//
// Usage: node tools/bundle-conformance.mts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'conformance-bundle');

mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: [join(ROOT, 'test', 'conformance', 'entry.ts')],
  outfile: join(OUT, 'conformance.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: false,
  logLevel: 'info',
});
writeFileSync(
  join(OUT, 'index.html'),
  '<!doctype html>\n<meta charset="utf-8">\n<title>pdq-ts conformance</title>\n' +
    '<script type="module" src="./conformance.js"></script>\n',
);
