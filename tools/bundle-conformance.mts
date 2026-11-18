// Bundles test/conformance/entry.ts, the port and the recorded reference
// values into one standard module, conformance-bundle/conformance.js, that
// any engine can load with no resolver, no file system and no permissions.
// esbuild removes the types and joins the files; it is not asked to minify,
// so the arithmetic is the source's, statement for statement.
//
// It also writes the control, conformance-bundle/sabotaged.js: the same
// bundle with one DCT matrix entry moved by one unit in the last place. Every
// engine must fail it, or a pass on that engine proves nothing.
//
// Usage: node tools/bundle-conformance.mts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Plugin } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'conformance-bundle');
const TABLE = join(ROOT, 'src', 'dct-table.ts');
const RIGHT = '0x3e34f6fe, 0x3e348763';
const WRONG = '0x3e34f6ff, 0x3e348763';

const sabotage: Plugin = {
  name: 'one-entry-one-ulp',
  setup(hooks) {
    hooks.onLoad({ filter: /dct-table\.ts$/ }, () => {
      const source = readFileSync(TABLE, 'utf8');
      if (source.split(RIGHT).length !== 2) {
        throw new Error('the entry the control changes is not where it was');
      }
      return { contents: source.replace(RIGHT, WRONG), loader: 'ts' };
    });
  },
};

async function bundle(name: string, plugins: Plugin[]): Promise<void> {
  await build({
    entryPoints: [join(ROOT, 'test', 'conformance', 'entry.ts')],
    outfile: join(OUT, `${name}.js`),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    minify: false,
    logLevel: 'info',
    plugins,
  });
  writeFileSync(
    join(OUT, `${name}.html`),
    '<!doctype html>\n<meta charset="utf-8">\n<title>pdq-ts conformance</title>\n' +
      `<script type="module" src="./${name}.js"></script>\n`,
  );
}

mkdirSync(OUT, { recursive: true });
await bundle('conformance', []);
await bundle('sabotaged', [sabotage]);
