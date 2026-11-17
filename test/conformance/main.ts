// Entry of the conformance bundle. Runs every check on whatever engine loads
// it, prints one line per check, leaves the report on globalThis for a
// browser driver to read, and throws if anything failed so that a
// command-line engine exits non-zero.
import { CHECKS } from './checks.js';

export interface ConformanceReport {
  engine: string;
  results: Array<{ name: string; problems: string[] }>;
  failed: number;
}

interface EngineGlobals {
  Deno?: { version?: { deno?: string } };
  Bun?: { version?: string };
  process?: { versions?: { node?: string; v8?: string }; arch?: string };
  navigator?: { userAgent?: string };
  __pdqConformance?: ConformanceReport;
}

const engineGlobals = globalThis as EngineGlobals;

function engineName(): string {
  const { Deno, Bun, process: proc, navigator: nav } = engineGlobals;
  if (Deno?.version?.deno !== undefined) {
    return `Deno ${Deno.version.deno}`;
  }
  if (Bun?.version !== undefined) {
    return `Bun ${Bun.version} (${proc?.arch ?? 'unknown arch'})`;
  }
  if (proc?.versions?.node !== undefined) {
    return `Node ${proc.versions.node} (V8 ${proc.versions.v8 ?? '?'}, ${proc.arch ?? '?'})`;
  }
  return nav?.userAgent ?? 'unknown engine';
}

export async function runConformance(): Promise<ConformanceReport> {
  const results: ConformanceReport['results'] = [];
  for (const check of CHECKS) {
    let problems: string[];
    try {
      problems = await check.run();
    } catch (error) {
      problems = [`threw: ${error instanceof Error ? error.message : String(error)}`];
    }
    results.push({ name: check.name, problems });
  }
  const failed = results.filter((result) => result.problems.length > 0).length;
  return { engine: engineName(), results, failed };
}

export function render(report: ConformanceReport): string {
  const lines = [`engine: ${report.engine}`];
  for (const result of report.results) {
    lines.push(`${result.problems.length === 0 ? 'ok  ' : 'FAIL'} ${result.name}`);
    for (const problem of result.problems.slice(0, 10)) {
      lines.push(`       ${problem}`);
    }
  }
  lines.push(`${report.results.length - report.failed} of ${report.results.length} checks passed`);
  return lines.join('\n');
}
