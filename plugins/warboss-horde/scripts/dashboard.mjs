#!/usr/bin/env node
// warboss-horde ledger dashboard.
//
// `ledger.mjs summary` is the terminal board for ONE ledger. This is its
// display sibling: it DISCOVERS every `.warboss-horde/ledger.jsonl` under a
// root (the repo's own run, plus each delegated-project), AGGREGATES them, and
// emits ONE self-contained HTML file — inline CSS + inline SVG, zero deps, no
// server, opens straight in a browser and works offline. Same ethos as the
// ledger: crash-safe jsonl in, a frozen artifact out.
//
// Usage:
//   node dashboard.mjs                       discover under cwd, HTML → stdout
//   node dashboard.mjs > board.html          write the artifact
//   node dashboard.mjs --root <dir>          search a different tree
//   node dashboard.mjs --out board.html      write to a file instead of stdout
//   node dashboard.mjs --file <ledger.jsonl> a single explicit ledger (no walk)
//   node dashboard.mjs --tiers <tiers.json>  ladder for tier fallback (default ../tiers.json)
//
// The dashboard reads `est_usd` straight off each row (already costed at log
// time), so it never needs the price map — tiers.json is loaded only to map a
// model → tier when a row predates the `tier` field.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') out.root = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--tiers') out.tiers = argv[++i];
    else out._.push(a);
  }
  return out;
}

function die(msg) {
  process.stderr.write(`dashboard: ${msg}\n`);
  process.exit(1);
}

// --- discovery --------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'worktrees']);

// Walk `root` for every `.warboss-horde/ledger.jsonl`. Each hit is one project,
// named by the directory that owns the `.warboss-horde` folder (root → '.').
function discoverLedgers(root) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.name === '.warboss-horde') {
        const ledger = path.join(full, 'ledger.jsonl');
        if (fs.existsSync(ledger)) {
          const projDir = dir;
          const rel = path.relative(root, projDir) || '.';
          found.push({
            project: rel.split(path.sep).join('/'),
            dir: projDir,
            ledgerFile: ledger,
            verdictsFile: path.join(full, 'verdicts.jsonl'),
          });
        }
        continue; // don't descend into .warboss-horde
      }
      walk(full);
    }
  };
  walk(root);
  return found.sort((a, b) => (a.project === '.' ? -1 : b.project === '.' ? 1 : a.project.localeCompare(b.project)));
}

// --- parsing ----------------------------------------------------------------

// Same dedup rule as ledger.mjs summary: a SubagentStop hook can fire more than
// once for one dispatch, each line re-summing a growing transcript. Keep the
// LAST line per (agent_id, model). Manual `add` rows (no agent_id) never merge.
function parseLedger(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const all = text.split('\n').filter((l) => l.trim()).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  const seen = new Map();
  const rows = [];
  for (const r of all) {
    if (r && r.agent_id) {
      const key = `${r.agent_id}::${r.model}`;
      if (seen.has(key)) { rows[seen.get(key)] = r; continue; }
      seen.set(key, rows.length);
    }
    rows.push(r);
  }
  return rows;
}

// Last verdict per agent_id (later annotate wins).
function loadVerdicts(file) {
  const byId = new Map();
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return byId; }
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    try { const r = JSON.parse(l); if (r && r.agent_id) byId.set(r.agent_id, r); } catch { /* skip */ }
  }
  return byId;
}

function loadLadder(args) {
  const tiersPath = args.tiers ? path.resolve(args.tiers) : path.resolve(__dirname, '..', 'tiers.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(tiersPath, 'utf8'));
    return Array.isArray(cfg.ladder) ? cfg.ladder : [];
  } catch { return []; }
}

function tierForModel(ladder, model) {
  if (!Array.isArray(ladder) || !model) return null;
  const m = String(model).toLowerCase();
  for (const rung of ladder) {
    const lm = String(rung && rung.model ? rung.model : '').toLowerCase();
    if (lm && (m.includes(lm) || lm.includes(m))) return rung.tier || null;
  }
  for (const word of ['haiku', 'sonnet', 'opus']) {
    if (!m.includes(word)) continue;
    const rung = ladder.find((r) => String(r && r.model ? r.model : '').toLowerCase().includes(word));
    if (rung) return rung.tier || null;
  }
  return null;
}

// --- aggregation ------------------------------------------------------------

const isOrchestrator = (r) => r.agent_type === 'warboss-orchestrator';

function aggregate(projects, ladder) {
  const tierOf = (r) => r.tier || tierForModel(ladder, r.model) || 'untiered';

  const totals = {
    dispatches: 0, doerDispatches: 0, tokens: 0, usd: 0, usdKnown: true,
    decideUsd: 0, doUsd: 0, sawOrchestrator: false,
  };
  const byModel = new Map();   // model -> {dispatches, tokens, usd, usdKnown}
  const byTier = new Map();    // tier  -> {dispatches, usd}  (doer rows only)
  const byTask = new Map();    // task  -> {dispatches, tokens, usd, green, red}
  const verdict = { annotated: 0, green: 0, red: 0, causes: new Map() };
  const series = [];           // {ts, usd, decide:bool} sorted later
  const perProject = [];

  for (const p of projects) {
    const rows = parseLedger(p.ledgerFile);
    const verdicts = loadVerdicts(p.verdictsFile);
    let pUsd = 0, pTok = 0, pDisp = 0, pGreen = 0, pRed = 0, pUsdKnown = true;

    for (const r of rows) {
      const usd = typeof r.est_usd === 'number' ? r.est_usd : null;
      const tok = r.tokens || 0;
      const orch = isOrchestrator(r);

      totals.dispatches += 1;
      totals.tokens += tok;
      if (usd === null) totals.usdKnown = false; else totals.usd += usd;
      pDisp += 1; pTok += tok;
      if (usd === null) pUsdKnown = false; else pUsd += usd;

      const m = byModel.get(r.model) || { dispatches: 0, tokens: 0, usd: 0, usdKnown: true };
      m.dispatches += 1; m.tokens += tok;
      if (usd === null) m.usdKnown = false; else m.usd += usd;
      byModel.set(r.model, m);

      if (r.ts) series.push({ ts: r.ts, usd: usd || 0, decide: orch });

      if (orch) {
        totals.sawOrchestrator = true;
        if (usd !== null) totals.decideUsd += usd;
      } else {
        totals.doerDispatches += 1;
        if (usd !== null) totals.doUsd += usd;

        const t = tierOf(r);
        const tm = byTier.get(t) || { dispatches: 0, usd: 0 };
        tm.dispatches += 1; tm.usd += usd || 0;
        byTier.set(t, tm);

        const taskKey = r.task || r.slice || '(untitled)';
        const tk = byTask.get(taskKey) || { dispatches: 0, tokens: 0, usd: 0, green: 0, red: 0 };
        tk.dispatches += 1; tk.tokens += tok; tk.usd += usd || 0;

        const v = verdicts.get(r.agent_id);
        if (v && v.verdict) {
          verdict.annotated += 1;
          if (v.verdict === 'green') { verdict.green += 1; tk.green += 1; pGreen += 1; }
          else {
            verdict.red += 1; tk.red += 1; pRed += 1;
            const c = v.cause || 'unspecified';
            verdict.causes.set(c, (verdict.causes.get(c) || 0) + 1);
          }
        }
        byTask.set(taskKey, tk);
      }
    }

    perProject.push({
      project: p.project, dispatches: pDisp, tokens: pTok, usd: pUsd,
      usdKnown: pUsdKnown, green: pGreen, red: pRed,
    });
  }

  series.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return { totals, byModel, byTier, byTask, verdict, series, perProject };
}

// --- rendering --------------------------------------------------------------

const TIER_COLOR = { LOW: '#3fb950', MID: '#d29922', HIGH: '#a371f7', untiered: '#6e7681' };
const tierColor = (t) => TIER_COLOR[t] || '#6e7681';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const usd = (v, known = true) => (known ? '' : '~') + '$' + Number(v).toFixed(4);
const num = (n) => Number(n).toLocaleString('en-US');

// Donut from [{label, value, color}]. Pure SVG, stroke-dasharray segments.
function donut(segments, { size = 160, stroke = 26 } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let offset = 0;
  const arcs = segments.filter((s) => s.value > 0).map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const dash = `${(frac * c).toFixed(3)} ${(c - frac * c).toFixed(3)}`;
    const el = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset * c).toFixed(3)}" transform="rotate(-90 ${cx} ${cx})"><title>${esc(s.label)}: ${(frac * 100).toFixed(0)}%</title></circle>`;
    offset += frac;
    return el;
  }).join('');
  const ring = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#21262d" stroke-width="${stroke}"/>`;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">${ring}${arcs}</svg>`;
}

// Cumulative-cost area chart over time. One series = every costed dispatch,
// summed in ts order. Decide vs do are drawn as two stacked cumulative areas.
function costChart(series, { w = 720, h = 200, pad = 28 } = {}) {
  const pts = series.filter((p) => p.usd > 0);
  if (pts.length < 2) return '<p class="muted">Not enough costed dispatches yet to chart over time.</p>';
  let cumDo = 0, cumAll = 0;
  const t0 = new Date(pts[0].ts).getTime();
  const t1 = new Date(pts[pts.length - 1].ts).getTime();
  const span = Math.max(1, t1 - t0);
  const total = pts.reduce((s, p) => s + p.usd, 0);
  const x = (ts) => pad + ((new Date(ts).getTime() - t0) / span) * (w - 2 * pad);
  const y = (v) => h - pad - (v / Math.max(total, 1e-9)) * (h - 2 * pad);

  const allPath = [], doPath = [];
  for (const p of pts) {
    cumAll += p.usd;
    if (!p.decide) cumDo += p.usd;
    allPath.push([x(p.ts), y(cumAll)]);
    doPath.push([x(p.ts), y(cumDo)]);
  }
  const toLine = (a) => a.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const toArea = (a) => toLine(a) + ` L${a[a.length - 1][0].toFixed(1)} ${(h - pad).toFixed(1)} L${a[0][0].toFixed(1)} ${(h - pad).toFixed(1)} Z`;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const yy = (h - pad - f * (h - 2 * pad)).toFixed(1);
    return `<line x1="${pad}" y1="${yy}" x2="${w - pad}" y2="${yy}" stroke="#21262d"/><text x="4" y="${(+yy + 3).toFixed(1)}" class="ax">${usd(f * total)}</text>`;
  }).join('');
  const d0 = new Date(t0).toISOString().slice(0, 10);
  const d1 = new Date(t1).toISOString().slice(0, 10);
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img">
    ${grid}
    <path d="${toArea(allPath)}" fill="#388bfd22" stroke="none"/>
    <path d="${toLine(allPath)}" fill="none" stroke="#58a6ff" stroke-width="2"/>
    <path d="${toArea(doPath)}" fill="#3fb95022" stroke="none"/>
    <path d="${toLine(doPath)}" fill="none" stroke="#3fb950" stroke-width="2"/>
    <text x="${pad}" y="${h - 8}" class="ax">${d0}</text>
    <text x="${w - pad}" y="${h - 8}" class="ax" text-anchor="end">${d1}</text>
  </svg>`;
}

// Horizontal bar list from [{label, value, sub, color}].
function bars(items, { max } = {}) {
  const top = max || Math.max(1, ...items.map((i) => i.value));
  return `<div class="bars">` + items.map((i) => `
    <div class="bar-row">
      <div class="bar-label">${esc(i.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${((100 * i.value) / top).toFixed(1)}%;background:${i.color || '#58a6ff'}"></div></div>
      <div class="bar-val">${esc(i.sub != null ? i.sub : i.value)}</div>
    </div>`).join('') + `</div>`;
}

function render(agg, meta) {
  const { totals, byModel, byTier, byTask, verdict, series, perProject } = agg;
  const decideDo = totals.doUsd > 0 ? (totals.decideUsd / totals.doUsd).toFixed(2) + ' : 1' : 'n/a';
  const triesPerGreen = verdict.green > 0 ? (verdict.annotated / verdict.green).toFixed(2) : 'n/a';
  const lowShare = totals.doerDispatches > 0
    ? ((100 * (byTier.get('LOW')?.dispatches || 0)) / totals.doerDispatches).toFixed(0) + '%'
    : 'n/a';

  const tierSegs = ['LOW', 'MID', 'HIGH', 'untiered']
    .filter((t) => byTier.has(t))
    .map((t) => ({ label: t, value: byTier.get(t).dispatches, color: tierColor(t) }));

  const modelRows = [...byModel.entries()].sort((a, b) => b[1].usd - a[1].usd);
  const taskRows = [...byTask.entries()].sort((a, b) => b[1].usd - a[1].usd);
  const causeBars = [...verdict.causes.entries()].sort((a, b) => b[1] - a[1])
    .map(([c, n]) => ({ label: c, value: n, sub: n, color: '#f85149' }));

  const card = (title, body, extra = '') => `<section class="card"><h2>${esc(title)}${extra}</h2>${body}</section>`;
  const kpi = (label, value, hint = '') => `<div class="kpi"><div class="kpi-v">${esc(value)}</div><div class="kpi-l">${esc(label)}</div>${hint ? `<div class="kpi-h">${esc(hint)}</div>` : ''}</div>`;

  const tierLegend = tierSegs.map((s) => `<span class="lg"><i style="background:${s.color}"></i>${esc(s.label)} ${s.value}</span>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>warboss-horde ledger</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#0d1117;color:#c9d1d9;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
  header{padding:24px 28px 8px;border-bottom:1px solid #21262d}
  h1{margin:0;font-size:20px}
  .sub{color:#8b949e;font-size:13px;margin-top:4px}
  main{padding:20px 28px;max-width:1100px;margin:0 auto}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
  .kpi{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:14px 16px}
  .kpi-v{font-size:22px;font-weight:600;color:#f0f6fc}
  .kpi-l{color:#8b949e;font-size:12px;margin-top:2px}
  .kpi-h{color:#6e7681;font-size:11px;margin-top:4px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .card{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:16px 18px;margin-bottom:16px}
  .card h2{margin:0 0 12px;font-size:14px;color:#f0f6fc;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #21262d}
  th{color:#8b949e;font-weight:500}
  td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
  .muted{color:#6e7681}
  .donut-wrap{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
  .legend{display:flex;flex-direction:column;gap:6px}
  .lg{display:flex;align-items:center;gap:7px;color:#c9d1d9;font-size:13px}
  .lg i{width:11px;height:11px;border-radius:2px;display:inline-block}
  .ax{fill:#6e7681;font-size:10px}
  .bars{display:flex;flex-direction:column;gap:8px}
  .bar-row{display:grid;grid-template-columns:90px 1fr 40px;align-items:center;gap:10px}
  .bar-label{font-size:12px;color:#c9d1d9}
  .bar-track{background:#21262d;border-radius:4px;height:14px;overflow:hidden}
  .bar-fill{height:100%;border-radius:4px}
  .bar-val{text-align:right;font-size:12px;color:#8b949e;font-variant-numeric:tabular-nums}
  .pill{display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600}
  .pill.g{background:#23863633;color:#3fb950}.pill.r{background:#da363322;color:#f85149}
  @media(max-width:720px){.grid{grid-template-columns:1fr}}
</style></head>
<body>
<header>
  <h1>warboss-horde ledger</h1>
  <div class="sub">${esc(meta.scope)} · ${num(totals.dispatches)} dispatches across ${perProject.length} project${perProject.length === 1 ? '' : 's'} · generated ${esc(meta.now)}</div>
</header>
<main>
  <div class="kpis">
    ${kpi('total spend', usd(totals.usd, totals.usdKnown), 'decide + do')}
    ${kpi('decide : do', decideDo, 'orchestrator vs workers')}
    ${kpi('tokens', num(totals.tokens))}
    ${kpi('LOW-share', lowShare, 'cheapest rung, doer band')}
    ${kpi('tries-per-green', triesPerGreen, verdict.annotated ? `${verdict.green}✓ / ${verdict.red}✗ of ${verdict.annotated}` : 'no verdicts yet')}
  </div>

  ${card('cumulative spend over time', `<div class="donut-wrap"></div>${costChart(series)}<div class="sub"><span style="color:#58a6ff">■</span> all spend &nbsp; <span style="color:#3fb950">■</span> do band (workers)</div>`)}

  <div class="grid">
    ${card('tier split — the "do" band', tierSegs.length
      ? `<div class="donut-wrap">${donut(tierSegs)}<div class="legend">${tierLegend}</div></div><div class="sub">LOW-share ${lowShare}${totals.doerDispatches && (byTier.get('LOW')?.dispatches || 0) / totals.doerDispatches < 0.25 ? ' ⚠ ladder under-exploited' : ''}</div>`
      : '<p class="muted">No doer dispatches logged yet.</p>')}

    ${card('verdict board', verdict.annotated
      ? `<div class="kpis" style="margin:0 0 12px">${kpi('green', verdict.green)}${kpi('red', verdict.red)}${kpi('tries/green', triesPerGreen)}</div>${causeBars.length ? `<div class="sub" style="margin-bottom:6px">red causes</div>${bars(causeBars)}` : '<p class="muted">No red causes recorded.</p>'}`
      : '<p class="muted">No verdicts annotated yet. <code>ledger.mjs annotate</code> to record judge truth.</p>')}
  </div>

  ${card('spend by model', `<table><thead><tr><th>model</th><th class="r">dispatches</th><th class="r">tokens</th><th class="r">est_usd</th></tr></thead><tbody>${
    modelRows.map(([m, v]) => `<tr><td>${esc(m)}</td><td class="r">${num(v.dispatches)}</td><td class="r">${num(v.tokens)}</td><td class="r">${usd(v.usd, v.usdKnown)}</td></tr>`).join('')
  }</tbody></table>`)}

  ${card('spend by task — the "do" band', taskRows.length
    ? `<table><thead><tr><th>task / slice</th><th class="r">dispatches</th><th class="r">tokens</th><th class="r">est_usd</th><th class="r">verdict</th></tr></thead><tbody>${
      taskRows.map(([t, v]) => `<tr><td>${esc(t)}</td><td class="r">${num(v.dispatches)}</td><td class="r">${num(v.tokens)}</td><td class="r">${usd(v.usd)}</td><td class="r">${v.green ? `<span class="pill g">${v.green}✓</span> ` : ''}${v.red ? `<span class="pill r">${v.red}✗</span>` : ''}${!v.green && !v.red ? '<span class="muted">—</span>' : ''}</td></tr>`).join('')
    }</tbody></table>`
    : '<p class="muted">No tasked doer dispatches yet.</p>')}

  ${card('by project', `<table><thead><tr><th>project</th><th class="r">dispatches</th><th class="r">tokens</th><th class="r">est_usd</th><th class="r">verdicts</th></tr></thead><tbody>${
    perProject.map((p) => `<tr><td>${esc(p.project)}</td><td class="r">${num(p.dispatches)}</td><td class="r">${num(p.tokens)}</td><td class="r">${usd(p.usd, p.usdKnown)}</td><td class="r">${p.green ? `<span class="pill g">${p.green}✓</span> ` : ''}${p.red ? `<span class="pill r">${p.red}✗</span>` : ''}${!p.green && !p.red ? '<span class="muted">—</span>' : ''}</td></tr>`).join('')
  }</tbody></table>`)}

  <p class="muted" style="font-size:12px;margin-top:24px">Costs are estimates from the ledger's per-row <code>est_usd</code> (usage × tiers.json price). Reconcile against <code>/cost</code> for the ground-truth session figure.</p>
</main>
</body></html>`;
}

// --- main -------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const ladder = loadLadder(args);

let projects;
let scope;
if (args.file) {
  const f = path.resolve(args.file);
  if (!fs.existsSync(f)) die(`no ledger at ${f}`);
  projects = [{
    project: '.', dir: path.dirname(path.dirname(f)),
    ledgerFile: f, verdictsFile: path.join(path.dirname(f), 'verdicts.jsonl'),
  }];
  scope = f;
} else {
  const root = path.resolve(args.root || process.cwd());
  projects = discoverLedgers(root);
  if (projects.length === 0) die(`no .warboss-horde/ledger.jsonl found under ${root}`);
  scope = `aggregated under ${root}`;
}

const agg = aggregate(projects, ladder);
const html = render(agg, { scope, now: new Date().toISOString() });

if (args.out) {
  const out = path.resolve(args.out);
  fs.writeFileSync(out, html);
  process.stderr.write(`dashboard: wrote ${out} (${projects.length} project${projects.length === 1 ? '' : 's'}, ${agg.totals.dispatches} dispatches)\n`);
} else {
  process.stdout.write(html);
}
