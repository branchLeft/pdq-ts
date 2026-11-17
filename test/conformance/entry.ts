// What the bundle executes on load. Kept apart from main.ts so that importing
// main.ts in a unit test runs nothing.
import { render, runConformance } from './main.js';
import type { ConformanceReport } from './main.js';

async function start(): Promise<void> {
  const holder = globalThis as { __pdqConformance?: ConformanceReport };
  const report = await runConformance();
  console.log(render(report));
  holder.__pdqConformance = report;
  if (report.failed > 0) {
    throw new Error(`${report.failed} conformance checks failed on ${report.engine}`);
  }
}

void start();
