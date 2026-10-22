// X6 doer loop: the judge -> feedback -> retry cycle run by code instead of by the orchestrator. One slice contract,
// one verify command; each try is a fresh headless doer session on the chosen model, judged by the verify command,
// with the failing output fed back on the next try. The orchestrator sees only the final verdict.
//
// Usage: node doer-loop.mjs --slice <path> --verify "<cmd>" [--model haiku] [--tries 3] [--doer-cmd "<cmd>"]
//   --doer-cmd  replaces the `claude -p` doer (tests): a shell command that reads the prompt on stdin and prints the
//               CLI's JSON result line on stdout.
// Exit codes: 0 green, 1 red (tries exhausted or stalled), 2 fork (the doer left an UNDECIDED gap; the rank above
// resolves it), 3 usage or doer crash. Every try appends a row to .warboss-horde/doer-loop.jsonl in the cwd.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCTRINE_FILE = path.resolve(here, '..', '..', 'plugins', 'warboss-horde', 'agents', 'doer.md');
const TAIL_LINES = 60;
const REPORT_TAIL = 20;

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SLICE = arg('--slice');
const VERIFY = arg('--verify');
const MODEL = arg('--model', 'haiku');
const TRIES = Number(arg('--tries', 3));
const DOER_CMD = arg('--doer-cmd');

function usage(msg) { console.log(`doer-loop: usage error: ${msg}`); process.exit(3); }
if (!SLICE || !VERIFY) usage('--slice and --verify are required');
if (!fs.existsSync(SLICE)) usage(`slice not found: ${SLICE}`);
if (!Number.isInteger(TRIES) || TRIES < 1) usage('--tries must be a positive integer');

const sliceName = path.basename(SLICE, path.extname(SLICE));
const outDir = path.join('.warboss-horde', 'doer-loop');
const logFile = path.join('.warboss-horde', 'doer-loop.jsonl');
fs.mkdirSync(outDir, { recursive: true });

const doctrine = fs.readFileSync(DOCTRINE_FILE, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
const contract = fs.readFileSync(SLICE, 'utf8');
const tail = (s, n) => s.split('\n').slice(-n).join('\n');
// The loop is itself started from inside a Claude Code session (the runner's Bash); drop the marker that makes a
// nested `claude` refuse to start.
// Each doer session lasts a minute or two, so pin the 5-minute cache TTL instead of Claude Code's 1-hour default.
const env = { ...process.env, FORCE_PROMPT_CACHING_5M: '1' };
delete env.CLAUDECODE;
const sh = (cmd, input) => spawnSync(cmd, { shell: true, encoding: 'utf8', input, env, maxBuffer: 64 * 1024 * 1024 });

// The working-tree state a try produced, so two tries that changed nothing are caught as a stall.
function treeHash() {
  sh('git add -A -N');
  const d = sh('git diff -- . ":!node_modules" ":!.warboss-horde"');
  return { hash: crypto.createHash('sha256').update(d.stdout || '').digest('hex'), diff: d.stdout || '' };
}

function prompt(tryNo, failure) {
  const parts = [doctrine, '## Slice contract', contract];
  if (failure) {
    parts.push(`## Try ${tryNo}: the previous try failed the verify command`,
      `The rank above ran \`${VERIFY}\` on your changes and it failed. Last ${TAIL_LINES} lines:`,
      '```', failure, '```', 'Fix the code so the contract holds. The changes from the previous try are still in the working tree.');
  }
  return parts.join('\n\n');
}

function runDoer(p) {
  const cmd = DOER_CMD ?? `claude -p --output-format json --model ${MODEL} --permission-mode bypassPermissions --disallowedTools Bash,Agent,WebFetch,WebSearch`;
  const r = sh(cmd, p);
  let res = null;
  try { res = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch {}
  return { status: r.status, res, err: (r.stderr || '').slice(-2000) };
}

function log(row) { fs.appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), slice: sliceName, model: MODEL, ...row }) + '\n'); }

let failure = null;
let prevHash = treeHash().hash;
for (let t = 1; t <= TRIES; t++) {
  const d = runDoer(prompt(t, failure));
  if (d.status !== 0 || !d.res || d.res.is_error) {
    log({ try: t, outcome: 'crash', session: d.res?.session_id ?? null, cli_usd: d.res?.total_cost_usd ?? null });
    console.log(`doer-loop: doer crashed on try ${t}/${TRIES}: ${String(d.res?.result ?? d.err).slice(0, 300)}`);
    process.exit(3);
  }
  const base = { try: t, session: d.res.session_id ?? null, cli_usd: d.res.total_cost_usd ?? null };
  const report = typeof d.res.result === 'string' ? d.res.result : '';
  const tree = treeHash();

  // A gap the doer marked in code is a fork, whatever the tests say: the rank above decides it, not a retry.
  const gaps = tree.diff.split('\n').filter((l) => l.startsWith('+') && l.includes('UNDECIDED:'));
  if (gaps.length) {
    log({ ...base, outcome: 'fork', gaps: gaps.length });
    console.log(`doer-loop: fork on try ${t}/${TRIES} (${gaps.length} UNDECIDED gap(s)) — resolve in the slice and rerun`);
    console.log(gaps.map((g) => g.slice(1).trim()).slice(0, REPORT_TAIL).join('\n'));
    process.exit(2);
  }
  if (t > 1 && tree.hash === prevHash) {
    log({ ...base, outcome: 'stall' });
    console.log(`doer-loop: red (stalled on try ${t}/${TRIES}: no change since the previous try)`);
    console.log(tail(failure, REPORT_TAIL));
    process.exit(1);
  }
  prevHash = tree.hash;

  const v = sh(VERIFY);
  const out = (v.stdout || '') + (v.stderr || '');
  fs.writeFileSync(path.join(outDir, `${sliceName}-try${t}.txt`), out);
  if (v.status === 0) {
    log({ ...base, outcome: 'green' });
    console.log(`doer-loop: green on try ${t}/${TRIES} (model ${MODEL})`);
    console.log(tail(report.trim(), 10));
    process.exit(0);
  }
  log({ ...base, outcome: 'red', verify_exit: v.status });
  failure = tail(out.trimEnd(), TAIL_LINES);
}
console.log(`doer-loop: red after ${TRIES}/${TRIES} tries (model ${MODEL}); full output in ${outDir}/`);
console.log(tail(failure, REPORT_TAIL));
process.exit(1);
