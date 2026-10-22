// Orchestrator-tier live experiment driver (X1/X2 pilot, X6). One run = one headless Opus orchestrator session in a fresh git worktree at the
// pre-fix commit, told to deliver one task under one arm's protocol. After it stops, the real post-fix test files
// are copied in and run: that is the hidden battery. Cost is read from the session's own transcripts.
//
// Usage: node run.mjs [--tasks kick,gate,e1b] [--arms A,X1,X2] [--reps 1] [--conc 3] [--cap 40] [--control]
//   --control  only check that every hidden battery FAILS on the untouched base (the battery must bite).
// Rows append to results.jsonl next to this file; diffs and transcripts land in runs/<id>/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const plug = path.join(repo, 'plugins', 'warboss-horde', 'scripts');
const { loadCalls, prefixAttribution } = await import(pathToFileURL(path.join(plug, 'audit.mjs')).href);
const { priceForModel, messageUsd } = await import(pathToFileURL(path.join(plug, 'pricing.mjs')).href);
const pricing = JSON.parse(fs.readFileSync(path.join(repo, 'plugins', 'warboss-horde', 'tiers.json'), 'utf8')).pricing;
const suite = JSON.parse(fs.readFileSync(path.join(here, 'tasks.json'), 'utf8'));

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const TASKS = arg('--tasks', 'kick,gate,e1b').split(',');
const ARMS = arg('--arms', 'A,X1,X2').split(',');
const REPS = Number(arg('--reps', 1));
const CONC = Number(arg('--conc', 3));
const CAP = Number(arg('--cap', 40));
const CONTROL = argv.includes('--control');
// Claude Code writes the prompt cache with the 1-hour TTL by default ($8/M on Opus 5.5 vs $5/M for 5 minutes).
// A run lasts minutes, so the hour buys nothing; --ttl5m pins the 5-minute TTL for the orchestrator and loop doers.
const TTL5M = argv.includes('--ttl5m');
const childEnv = TTL5M ? { ...process.env, FORCE_PROMPT_CACHING_5M: '1' } : process.env;
const WT_ROOT = 'C:/tmp/x12';
const RESULTS = path.join(here, 'results.jsonl');
const projRoot = path.join(os.homedir(), '.claude', 'projects');

const COMMON = `Use the warboss-horde:delegate skill (the WARBOSS playbook) to deliver the task below in this repository.

Run rules for this session:
- No Leader is reachable. Do not ask questions. Where a fork is fiat, choose, and list every fiat fork in your final message.
- Do not commit, push, or branch. Leave the changes in the working tree.
- Done = the module's test file and \`npm run typecheck\` are green. Then stop with a final message of at most 10 lines.`;

const ARM_RULES = {
  A: '',
  X1: `
Experiment arm X1 (drafter rung). This overrides Step 3 of the skill where they conflict:
- You MUST NOT use Read, Grep or Glob on any path outside \`.warboss-horde/\` yourself.
- First dispatch a \`doer\` with model \`sonnet\` as the DRAFTER. Its prompt: the task text, plus "Read the code you need and write a draft contract to .warboss-horde/slices/<slice>.md: files to touch, entry point, acceptance cases as concrete input -> expected pairs (at least one that fails under a wrong reading), and a forks: list tagging every behaviour choice intent|fiat. Do not implement."
- Read only that draft. Resolve or correct forks by editing the draft, then continue with the skill from Step 4 (tier, dispatch the implementing doer, judge with the runner).`,
  X2: `
Experiment arm X2 (contract = test file). This overrides Step 3 of the skill where they conflict:
- Your contract is the test file. Write the acceptance cases directly as tests in the module's test file (concrete input -> expected, at least one that fails under a wrong reading). That test file is also the verify target.
- The slice file under \`.warboss-horde/slices/\` holds only: files to touch, entry point, the test file path, and the fork tags. Do not restate the cases in prose.
- The implementing doer may read the test file. Continue with the skill from Step 4.`,
  X6: `
Experiment arm X6 (code-run doer loop). This overrides the dispatch-and-judge steps of the skill where they conflict:
- Author the slice contract as the skill says, into \`.warboss-horde/slices/<slice>.md\`, and choose one verify command.
- Do NOT dispatch the implementing doer with the Agent tool, and do not judge its rounds yourself. Instead dispatch the
  \`runner\` with exactly: \`node ${path.join(here, 'doer-loop.mjs').replace(/\\/g, '/')} --slice .warboss-horde/slices/<slice>.md --verify "<verify command>" --model haiku --tries 3\`
  Tell the runner to give that Bash call the maximum timeout (600000 ms).
  The script runs fresh haiku doers, judges each try with the verify command and feeds failures back by itself.
- Exit 0 = green. Exit 2 = the doer marked an UNDECIDED fork: decide it, amend the slice, run the loop again.
  Exit 1 = red after its tries: improve the slice (or split it) and run the loop again, at most twice more.
  Exit 3 = crash or usage error: fix the command and run again.`,
};

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const git = (...a) => sh('git', a, { cwd: repo });

// The worktree borrows the main repo's node_modules through a junction. Always drop the junction itself
// (rmdir on a junction removes only the link) before any recursive delete, so nothing walks into the real one.
function dropWorktree(wt) {
  const nm = path.join(wt, 'node_modules').replace(/\//g, '\\');
  if (fs.existsSync(nm)) sh('cmd', ['/c', 'rmdir', nm]);
  if (fs.existsSync(nm)) throw new Error('junction still present, refusing to remove worktree: ' + nm);
  git('worktree', 'remove', '--force', wt);
}

function makeWorktree(id) {
  const wt = path.join(WT_ROOT, id);
  if (fs.existsSync(wt)) dropWorktree(wt);
  const r = git('worktree', 'add', '--detach', wt, suite.base);
  if (r.status !== 0) throw new Error('worktree add failed: ' + r.stderr);
  sh('cmd', ['/c', 'mklink', '/J', path.join(wt, 'node_modules').replace(/\//g, '\\'), path.join(repo, 'node_modules')]);
  fs.mkdirSync(path.join(wt, '.warboss-horde'), { recursive: true });
  fs.writeFileSync(path.join(wt, '.warboss-horde', 'gate.on'), '');
  return wt;
}

function judge(wt, task) {
  for (const f of suite.tasks[task].hidden) {
    const r = git('show', `${suite.fix}:${f}`);
    if (r.status !== 0) throw new Error('git show failed: ' + f);
    fs.writeFileSync(path.join(wt, f), r.stdout);
  }
  const t = sh('npx', ['tsx', '--test', ...suite.tasks[task].hidden], { cwd: wt, shell: true, timeout: 300000 });
  const tc = sh('npx', ['tsc', '--noEmit'], { cwd: wt, shell: true, timeout: 300000 });
  const m = /# pass (\d+)[\s\S]*# fail (\d+)/.exec(t.stdout || '');
  return { hidden_exit: t.status, hidden_pass: m ? Number(m[1]) : null, hidden_fail: m ? Number(m[2]) : null, typecheck_exit: tc.status, hidden_out: (t.stdout || '') + (t.stderr || '') };
}

function callsUsd(text) {
  let usd = 0, unpriced = 0;
  const calls = loadCalls(text);
  for (const c of calls) {
    const v = messageUsd(priceForModel(pricing, c.model), c.usage);
    if (v === null) unpriced++; else usd += v;
  }
  return { usd, calls: calls.length, unpriced };
}

function findSession(sid) {
  for (const d of fs.readdirSync(projRoot)) {
    const f = path.join(projRoot, d, sid + '.jsonl');
    if (fs.existsSync(f)) return { dir: path.join(projRoot, d), file: f };
  }
  return null;
}

// X6: the doer loop runs its doers as separate headless sessions, so they are not under the orchestrator's
// subagents dir. Read their session ids from the loop's log in the worktree, price them, and move them out too.
function meterLoopDoers(wt, keepDir) {
  const logf = path.join(wt, '.warboss-horde', 'doer-loop.jsonl');
  if (!fs.existsSync(logf)) return [];
  const rows = fs.readFileSync(logf, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  fs.mkdirSync(keepDir, { recursive: true });
  fs.copyFileSync(logf, path.join(keepDir, 'doer-loop.jsonl'));
  const subs = [];
  for (const row of rows) {
    const s = row.session && findSession(row.session);
    if (!s) { subs.push({ file: `loop:${row.session}`, models: [], usd: 0, calls: 0, unpriced: 1 }); continue; }
    const t = fs.readFileSync(s.file, 'utf8');
    const models = [...new Set(loadCalls(t).map((c) => c.model))];
    subs.push({ file: `loop:${row.session}`, models, outcome: row.outcome, ...callsUsd(t) });
    fs.renameSync(s.file, path.join(keepDir, `${row.session}.jsonl`));
  }
  return subs;
}

function meter(sid, keepDir, loopSubs = []) {
  const s = findSession(sid);
  if (!s) return { error: 'transcript not found' };
  const text = fs.readFileSync(s.file, 'utf8');
  const orch = callsUsd(text);
  const cls = {};
  for (const e of prefixAttribution(text)) cls[e.cls] = (cls[e.cls] || 0) + e.sizeTokens;
  const subDir = path.join(s.dir, sid, 'subagents');
  const subs = [...loopSubs];
  if (fs.existsSync(subDir)) {
    for (const f of fs.readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
      const t = fs.readFileSync(path.join(subDir, f), 'utf8');
      const models = [...new Set(loadCalls(t).map((c) => c.model))];
      subs.push({ file: f, models, ...callsUsd(t) });
    }
  }
  // Move the run's transcripts out of ~/.claude/projects so later audits of real work do not count them.
  fs.mkdirSync(keepDir, { recursive: true });
  fs.renameSync(s.file, path.join(keepDir, 'orchestrator.jsonl'));
  if (fs.existsSync(path.join(s.dir, sid))) fs.renameSync(path.join(s.dir, sid), path.join(keepDir, 'session'));
  return {
    orch_usd: orch.usd, orch_calls: orch.calls, orch_unpriced: orch.unpriced, orch_cls_tokens: cls,
    sub_usd: subs.reduce((a, b) => a + b.usd, 0), sub_count: subs.length, subs,
  };
}

function runClaude(wt, prompt) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn('claude', ['-p', '--output-format', 'json', '--model', 'opus', '--permission-mode', 'bypassPermissions'],
      { cwd: wt, shell: true, env: childEnv });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const kill = setTimeout(() => p.kill(), 40 * 60 * 1000);
    p.on('close', (code) => {
      clearTimeout(kill);
      let res = null;
      try { res = JSON.parse(out.trim().split('\n').pop()); } catch {}
      resolve({ code, res, err: err.slice(-2000), secs: (Date.now() - t0) / 1000 });
    });
    p.stdin.end(prompt);
  });
}

async function one(task, arm, rep) {
  const id = `${task}-${arm}-r${rep}-${Date.now().toString(36)}`;
  const runDir = path.join(here, 'runs', id);
  fs.mkdirSync(runDir, { recursive: true });
  const wt = makeWorktree(id);
  const prompt = `${COMMON}\n${ARM_RULES[arm]}\n\n## Task\n\n${suite.tasks[task].intent}\n`;
  fs.writeFileSync(path.join(runDir, 'prompt.md'), prompt);
  const r = await runClaude(wt, prompt);
  // A run the CLI did not finish (usage limit, crash, timeout) is not data: never record it as a red.
  if (r.code !== 0 || !r.res || r.res.is_error) {
    const msg = (r.res && r.res.result) || r.err || `exit ${r.code}`;
    dropWorktree(wt);
    fs.rmSync(runDir, { recursive: true, force: true });
    if (/limit/i.test(msg)) halted = msg;
    throw new Error('run did not complete: ' + String(msg).slice(0, 200));
  }
  sh('git', ['add', '-A', '-N'], { cwd: wt });
  fs.writeFileSync(path.join(runDir, 'diff.patch'), sh('git', ['diff', '--', '.', ':!node_modules'], { cwd: wt }).stdout || '');
  for (const sub of ['slices', 'reports']) {
    const d = path.join(wt, '.warboss-horde', sub);
    if (fs.existsSync(d)) fs.cpSync(d, path.join(runDir, sub), { recursive: true });
  }
  const j = judge(wt, task);
  fs.writeFileSync(path.join(runDir, 'hidden.txt'), j.hidden_out);
  delete j.hidden_out;
  const loopSubs = meterLoopDoers(wt, path.join(runDir, 'doers'));
  const m = r.res && r.res.session_id ? meter(r.res.session_id, runDir, loopSubs) : { error: 'no session id' };
  // The loop's doers are billed outside the orchestrator's CLI total; count them toward the spend cap.
  const loop_cli_usd = loopSubs.reduce((a, b) => a + (b.usd || 0), 0);
  const row = {
    ts: new Date().toISOString(), id, task, arm: TTL5M ? `${arm}+5m` : arm, rep, ttl: TTL5M ? '5m' : '1h', exit: r.code, secs: r.secs,
    session: r.res && r.res.session_id, cli_cost_usd: r.res && r.res.total_cost_usd, loop_cli_usd, num_turns: r.res && r.res.num_turns,
    final: r.res && typeof r.res.result === 'string' ? r.res.result.slice(0, 1500) : null,
    green: j.hidden_exit === 0 && j.typecheck_exit === 0, ...j, ...m, stderr: r.code === 0 ? undefined : r.err,
  };
  fs.appendFileSync(RESULTS, JSON.stringify(row) + '\n');
  dropWorktree(wt);
  console.log(`${id}: green=${row.green} orch=$${(row.orch_usd ?? 0).toFixed(3)} sub=$${(row.sub_usd ?? 0).toFixed(3)} cli=$${row.cli_cost_usd}`);
  return row;
}

if (CONTROL) {
  for (const task of TASKS) {
    const id = `control-${task}`;
    const wt = makeWorktree(id);
    const j = judge(wt, task);
    console.log(`${task}: hidden_exit=${j.hidden_exit} pass=${j.hidden_pass} fail=${j.hidden_fail} typecheck=${j.typecheck_exit} -> ${j.hidden_exit !== 0 ? 'bites' : 'DOES NOT BITE'}`);
    dropWorktree(wt);
  }
  process.exit(0);
}

let halted = null;
let spent = 0;
const prior = fs.existsSync(RESULTS) ? fs.readFileSync(RESULTS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
for (const p of prior) spent += (Number(p.cli_cost_usd) || 0) + (Number(p.loop_cli_usd) || 0);
// Resumable: a (task, arm, rep) that already has a recorded row is not run again.
const done = new Set(prior.map((p) => `${p.task}|${p.arm}|${p.rep}`));
const queue = [];
for (let rep = 1; rep <= REPS; rep++) for (const task of TASKS) for (const arm of ARMS) {
  if (!done.has(`${task}|${TTL5M ? `${arm}+5m` : arm}|${rep}`)) queue.push([task, arm, rep]);
}
console.log(`queue ${queue.length} runs (${done.size} already recorded), prior spend $${spent.toFixed(2)}, cap $${CAP}`);
async function worker() {
  while (queue.length) {
    if (halted) { console.log(`halted: ${halted}`); return; }
    if (spent >= CAP) { console.log(`cap reached ($${spent.toFixed(2)}), stopping`); return; }
    const [task, arm, rep] = queue.shift();
    try { const row = await one(task, arm, rep); spent += (Number(row.cli_cost_usd) || 0) + (Number(row.loop_cli_usd) || 0); }
    catch (e) { console.log(`${task}-${arm}-r${rep}: ERROR ${e.message}`); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`done, total spend $${spent.toFixed(2)}`);
