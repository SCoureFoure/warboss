#!/usr/bin/env node
// UserPromptSubmit idle relay — stop paying to re-write a cold prefix.
//
// After an idle gap longer than the prompt-cache TTL, the next turn re-writes the
// whole prefix at the 1-hour write price. A fresh session booted from the repo's
// ground truth (/clear, then /warboss-horde:resume) is measurably cheaper; the
// idle relay was ~15% of spend in the audit. So: when the last assistant turn is
// old and its prefix is big, this hook blocks the first prompt once with the
// re-write cost and the relay hint. Resending the same prompt continues the session.
//
// Hook contract: reads the UserPromptSubmit payload on stdin
//   { prompt, transcript_path, session_id, ... } and writes JSON on stdout when it
// has something to say. Always exits 0 — a failure here must never break a turn.
//
// Env knobs (read at run time):
//   WARBOSS_IDLE_RELAY=off|warn   off: silent; warn: systemMessage only; else: block once
//   WARBOSS_IDLE_MINUTES          idle threshold in minutes (default 60)
//   WARBOSS_IDLE_MIN_TOKENS       prefix floor in tokens (default 100000)
//   WARBOSS_NOW                   ms since epoch, for tests (default Date.now())
//   WARBOSS_IDLE_STATE            marker dir (default <os.tmpdir()>/warboss-idle)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceForModel } from '../scripts/pricing.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TAIL_BYTES = 262144;

function num(v, d) {
  const s = String(v ?? '').trim();
  if (!s) return d;
  const n = Number(s);
  return Number.isFinite(n) ? n : d;
}

// Last complete assistant record in the transcript tail, or null.
function lastAssistant(file) {
  const size = fs.statSync(file).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const buf = Buffer.alloc(size - start);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buf, 0, buf.length, start);
  } finally {
    fs.closeSync(fd);
  }
  const lines = buf.toString('utf8').split(/\r?\n/);
  if (start > 0) lines.shift();
  for (let i = lines.length - 1; i >= 0; i--) {
    let rec;
    try { rec = JSON.parse(lines[i]); } catch { continue; }
    const m = rec && rec.message;
    if (!m || m.role !== 'assistant') continue;
    if (!m.usage || typeof m.usage !== 'object') continue;
    if (typeof m.model !== 'string' || m.model.startsWith('<')) continue;
    if (!Number.isFinite(Date.parse(rec.timestamp))) continue;
    return rec;
  }
  return null;
}

function decide(hook) {
  const mode = String(process.env.WARBOSS_IDLE_RELAY ?? '');
  if (mode === 'off') return null;

  if (String(hook.prompt || '').trimStart().startsWith('/')) return null;
  if (!hook.transcript_path || !fs.existsSync(hook.transcript_path)) return null;
  if (!fs.statSync(hook.transcript_path).isFile()) return null;

  const last = lastAssistant(hook.transcript_path);
  if (!last) return null;

  const now = num(process.env.WARBOSS_NOW, Date.now());
  const minutes = num(process.env.WARBOSS_IDLE_MINUTES, 60);
  const minTokens = num(process.env.WARBOSS_IDLE_MIN_TOKENS, 100000);
  const gapMin = (now - Date.parse(last.timestamp)) / 60000;

  const u = last.message.usage;
  const P = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0)
    + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
  if (gapMin <= minutes || P < minTokens) return null;

  const tiers = JSON.parse(fs.readFileSync(path.join(here, '..', 'tiers.json'), 'utf8'));
  const price = priceForModel(tiers.pricing, last.message.model);
  const cost = price && Number.isFinite(price.cache_write_1h) ? P * price.cache_write_1h / 1e6 : null;

  const msg = 'warboss idle relay: ' + Math.round(gapMin) + ' min idle, so the prompt cache has expired. Resuming re-writes ~'
    + Math.round(P / 1000) + 'k tokens' + (cost === null ? '' : ' (~$' + cost.toFixed(2) + ' at API rates)')
    + '. Cheaper: /clear, then /warboss-horde:resume to boot from the repo\'s ground truth.';

  if (mode === 'warn') return { systemMessage: msg };

  const stateDir = process.env.WARBOSS_IDLE_STATE || path.join(os.tmpdir(), 'warboss-idle');
  const marker = path.join(stateDir, (hook.session_id || path.basename(hook.transcript_path)) + '.txt');
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === last.timestamp) return null;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, last.timestamp);
  return { decision: 'block', reason: msg + ' Or send your prompt again to continue this session.' };
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    const out = decide(JSON.parse(raw || '{}'));
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    // fail open — never break a turn over the relay
  } finally {
    process.exit(0);
  }
});
