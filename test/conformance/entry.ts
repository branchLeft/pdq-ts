// What the bundle executes on load. Kept apart from main.ts so that importing
// main.ts in a unit test runs nothing.
import { render, runConformance } from './main.js';
import type { ConformanceReport } from './main.js';

interface Host {
  __pdqConformance?: ConformanceReport;
  Deno?: { exit?: (code: number) => never };
  process?: { exitCode?: number | string | null };
}

const host = globalThis as Host;

// A failure sets the exit status itself, on each command-line engine's own
// terms, rather than leaving it to how that engine treats a rejected promise.
// A browser has no exit status: its driver reads the report.
function exitNonZero(): void {
  if (typeof host.Deno?.exit === 'function') {
    host.Deno.exit(1);
  }
  if (host.process !== undefined) {
    host.process.exitCode = 1;
  }
}

async function start(): Promise<void> {
  const report = await runConformance();
  console.log(render(report));
  host.__pdqConformance = report;
  if (report.failed > 0) {
    exitNonZero();
  }
}

start().catch((error: unknown) => {
  console.log(`conformance could not run: ${error instanceof Error ? error.message : String(error)}`);
  host.__pdqConformance = { engine: 'unknown', results: [], failed: 1 };
  exitNonZero();
});
