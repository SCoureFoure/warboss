// X1/X2 report: re-meters every run from its kept transcripts (runs/<id>/orchestrator.jsonl and
// runs/<id>/session/subagents/*.jsonl), then summarises per arm and per task x arm.
// Usage: node report.mjs   -> writes report.md next to this file and prints it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const plug = path.join(repo, 'plugins', 'warboss-horde', 'scripts');
const { loadCalls, prefixAttribution } = await import(pathToFileURL(path.join(plug, 'audit.mjs')).href);
const { priceForModel, messageUsd } = await import(pathToFileURL(path.join(plug, 'pricing.mjs')).href);
const pricing = JSON.parse(fs.readFileSync(path.join(repo, 'plugins', 'warboss-horde', 'tiers.json'), 'utf8')).pricing;

const usdOf = (text) => {
  const calls = loadCalls(text);
  let usd = 0;
  for (const c of calls) usd += messageUsd(priceForModel(pricing, c.model), c.usage) ?? NaN;
  return { usd, calls: calls.length };
};
const rows = fs.readFileSync(path.join(here, 'results.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
for (const r of rows) {
  const dir = path.join(here, 'runs', r.id);
  const of = path.join(dir, 'orchestrator.jsonl');
  if (!fs.existsSync(of)) { r.bad = true; continue; }
  const text = fs.readFileSync(of, 'utf8');
  const o = usdOf(text);
  r.orch = o.usd;
  r.calls = o.calls;
  r.cls = {};
  for (const e of prefixAttribution(text)) r.cls[e.cls] = (r.cls[e.cls] || 0) + e.sizeTokens;
  r.sub = 0;
  r.subN = 0;
  const sd = path.join(dir, 'session', 'subagents');
  if (fs.existsSync(sd)) for (const f of fs.readdirSync(sd).filter((x) => x.endsWith('.jsonl'))) {
    r.sub += usdOf(fs.readFileSync(path.join(sd, f), 'utf8')).usd;
    r.subN++;
  }
  // X6 loop doers are separate headless sessions, kept under runs/<id>/doers/.
  const dd = path.join(dir, 'doers');
  if (fs.existsSync(dd)) for (const f of fs.readdirSync(dd).filter((x) => x.endsWith('.jsonl') && x !== 'doer-loop.jsonl')) {
    r.sub += usdOf(fs.readFileSync(path.join(dd, f), 'utf8')).usd;
    r.subN++;
  }
}
const ok = rows.filter((r) => !r.bad);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a');
const tok = (r, k) => r.cls[k] || 0;
const L = ['# Orchestrator-tier report (X1/X2 pilot, X6)', '', `runs: ${ok.length} (unmetered: ${rows.length - ok.length})`, ''];
const line = (label, rs) => {
  const greens = rs.filter((r) => r.green).length;
  const orch = rs.reduce((a, r) => a + r.orch, 0);
  const tot = rs.reduce((a, r) => a + r.orch + r.sub, 0);
  return `| ${label} | ${rs.length} | ${greens} | $${f3(orch / Math.max(greens, 1e-9))} | $${f3(tot / Math.max(greens, 1e-9))} | ` +
    `$${f3(mean(rs.map((r) => r.orch)))} | $${f3(mean(rs.map((r) => r.sub)))} | ${f3(mean(rs.map((r) => r.calls)))} | ` +
    `${Math.round(mean(rs.map((r) => tok(r, 'result:Read:src'))))} | ${Math.round(mean(rs.map((r) => tok(r, 'use:Write:slices') + tok(r, 'use:Write:src') + tok(r, 'use:Edit'))))} | ` +
    `${Math.round(mean(rs.map((r) => tok(r, 'result:Read:horde'))))} | ${f3(mean(rs.map((r) => r.secs / 60)))} |`;
};
const head = '| group | runs | green | orch $/green | total $/green | orch $/run | sub $/run | orch calls | Read src tok | Write+Edit tok | Read horde tok | minutes |';
const sep = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
const arms = [...new Set(ok.map((r) => r.arm))];
const tasks = [...new Set(ok.map((r) => r.task))];
L.push('## By arm', '', head, sep);
for (const a of arms) L.push(line(a, ok.filter((r) => r.arm === a)));
L.push('', '## By task x arm', '', head, sep);
for (const t of tasks) for (const a of arms) {
  const rs = ok.filter((r) => r.task === t && r.arm === a);
  if (rs.length) L.push(line(`${t} ${a}`, rs));
}
L.push('', '## Runs', '', '| id | green | hidden pass/fail | typecheck | orch $ | sub $ | subagents | cli $ |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of ok) L.push(`| ${r.id} | ${r.green} | ${r.hidden_pass}/${r.hidden_fail} | ${r.typecheck_exit} | $${f3(r.orch)} | $${f3(r.sub)} | ${r.subN} | $${f3(r.cli_cost_usd)} |`);
fs.writeFileSync(path.join(here, 'report.md'), L.join('\n') + '\n');
console.log(L.join('\n'));
