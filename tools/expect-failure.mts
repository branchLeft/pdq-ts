// Runs a control: a command that must fail, and must fail for the stated
// reason. Exits zero only when the command exits non-zero and its output
// contains every --needs text; a control that passes, or that fails some
// other way, is itself a failure.
//
// Usage: node tools/expect-failure.mts --needs <text> [--needs <text>] -- <command> [args]
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const split = args.indexOf('--');
if (split === -1 || split === args.length - 1) {
  throw new Error('usage: expect-failure.mts --needs <text> ... -- <command> [args]');
}
const needs: string[] = [];
for (let i = 0; i < split; i += 2) {
  const text = args[i + 1];
  if (args[i] !== '--needs' || text === undefined || i + 1 >= split) {
    throw new Error('before --, only --needs <text> pairs are accepted');
  }
  needs.push(text);
}
if (needs.length === 0) {
  throw new Error('a control must say what its failure looks like: give --needs');
}
const [command, ...rest] = args.slice(split + 1);
const run = spawnSync(command!, rest, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
console.log(output);
if (run.error !== undefined) {
  throw new Error(`the control could not start: ${run.error.message}`);
}
if (run.status === 0) {
  throw new Error('the control passed, and it must fail');
}
const missing = needs.filter((text) => !output.includes(text));
if (missing.length > 0) {
  throw new Error(`the control failed, but not as expected: output lacks ${JSON.stringify(missing)}`);
}
console.log(`control: exit ${String(run.status)}, as it must`);
