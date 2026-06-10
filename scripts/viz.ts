import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LedgerEntry {
  uuid: string;
  requestId: string;
  sessionId: string;
  kind: string;
  model: string;
  modelLabel: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
  costUsd: number;
  cost: {
    inputCost: number;
    outputCost: number;
    cacheReadCost: number;
    cacheWriteCost: number;
    totalCost: number;
  };
  at: string;
}

// ---------------------------------------------------------------------------
// Read & deduplicate
// ---------------------------------------------------------------------------

async function readLedger(filePath: string): Promise<LedgerEntry[]> {
  const seen = new Set<string>();
  const entries: LedgerEntry[] = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = JSON.parse(trimmed) as LedgerEntry;
    if (!seen.has(entry.requestId)) {
      seen.add(entry.requestId);
      entries.push(entry);
    }
  }

  // Sort ascending by timestamp so cumulative line chart is chronological
  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return entries;
}

// ---------------------------------------------------------------------------
// Summary stats
// ---------------------------------------------------------------------------

interface ModelStats {
  totalCost: number;
  requestCount: number;
}

function buildStats(entries: LedgerEntry[]): {
  totalCost: number;
  totalRequests: number;
  byModel: Record<string, ModelStats>;
} {
  const byModel: Record<string, ModelStats> = {};
  let totalCost = 0;

  for (const e of entries) {
    totalCost += e.costUsd;
    if (!byModel[e.modelLabel]) {
      byModel[e.modelLabel] = { totalCost: 0, requestCount: 0 };
    }
    byModel[e.modelLabel]!.totalCost += e.costUsd;
    byModel[e.modelLabel]!.requestCount += 1;
  }

  return { totalCost, totalRequests: entries.length, byModel };
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

const MODEL_COLORS: Record<string, string> = {
  "fable-5": "#6366f1",
  "opus-4-8": "#f59e0b",
  "sonnet-4-6": "#10b981",
};

function colorFor(label: string): string {
  return MODEL_COLORS[label] ?? "#94a3b8";
}

function abbrevRequestId(id: string): string {
  // "req_011CbumEG913vacnzVFNej4K" → "req_…ej4K"
  if (id.length <= 12) return id;
  return id.slice(0, 6) + "…" + id.slice(-4);
}

function buildHtml(entries: LedgerEntry[]): string {
  const stats = buildStats(entries);

  // --- Chart 1: cumulative cost over time, per model ---
  const models = [...new Set(entries.map((e) => e.modelLabel))].sort();

  // Build per-model cumulative series
  const cumulativeSeries: Record<string, { x: string; y: number }[]> = {};
  const runningTotals: Record<string, number> = {};
  for (const m of models) {
    cumulativeSeries[m] = [];
    runningTotals[m] = 0;
  }
  for (const e of entries) {
    runningTotals[e.modelLabel] += e.costUsd;
    cumulativeSeries[e.modelLabel]!.push({
      x: e.at,
      y: Math.round(runningTotals[e.modelLabel]! * 1e6) / 1e6,
    });
  }

  const chart1Datasets = models.map((m) => ({
    label: m,
    data: cumulativeSeries[m],
    borderColor: colorFor(m),
    backgroundColor: colorFor(m) + "22",
    tension: 0.3,
    fill: false,
    pointRadius: 3,
  }));

  // --- Chart 2: cost per request bar ---
  const reqLabels = entries.map((e) => abbrevRequestId(e.requestId));
  const reqColors = entries.map((e) => colorFor(e.modelLabel));
  const reqCosts = entries.map((e) =>
    Math.round(e.costUsd * 1e6) / 1e6
  );

  const chart2Data = {
    labels: reqLabels,
    datasets: [
      {
        label: "Cost USD",
        data: reqCosts,
        backgroundColor: reqColors,
        borderRadius: 3,
      },
    ],
  };

  // --- Chart 3: token breakdown stacked bar ---
  const chart3Data = {
    labels: reqLabels,
    datasets: [
      {
        label: "Input Tokens",
        data: entries.map((e) => e.usage.inputTokens),
        backgroundColor: "#6366f1",
        stack: "tokens",
      },
      {
        label: "Output Tokens",
        data: entries.map((e) => e.usage.outputTokens),
        backgroundColor: "#10b981",
        stack: "tokens",
      },
      {
        label: "Cache Read",
        data: entries.map((e) => e.usage.cacheReadInputTokens),
        backgroundColor: "#f59e0b",
        stack: "tokens",
      },
      {
        label: "Cache Write",
        data: entries.map((e) => e.usage.cacheCreationInputTokens),
        backgroundColor: "#f43f5e",
        stack: "tokens",
      },
    ],
  };

  // --- Summary table rows ---
  const tableRows = models
    .map((m) => {
      const s = stats.byModel[m]!;
      return `<tr>
        <td><span class="model-dot" style="background:${colorFor(m)}"></span>${m}</td>
        <td>${s.requestCount}</td>
        <td>$${s.totalCost.toFixed(4)}</td>
        <td>$${(s.totalCost / s.requestCount).toFixed(4)}</td>
      </tr>`;
    })
    .join("\n");

  // Inline data as a JS variable so the page is fully self-contained
  const inlineData = JSON.stringify({
    chart1Datasets,
    chart2Data,
    chart3Data,
    stats: {
      totalCost: stats.totalCost,
      totalRequests: stats.totalRequests,
      byModel: stats.byModel,
    },
  });

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Warboss Cost Ledger — Viz</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    padding: 2rem;
    line-height: 1.5;
  }
  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; color: #f1f5f9; }
  .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .card.full { grid-column: 1 / -1; }
  .card h2 { font-size: 0.9rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1rem; }
  canvas { max-height: 300px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th { text-align: left; padding: 0.5rem 0.75rem; color: #64748b; font-weight: 500; border-bottom: 1px solid #334155; }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e293b; }
  tr:last-child td { border-bottom: none; }
  .model-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .stat-pills { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .pill {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 0.5rem;
    padding: 0.75rem 1.25rem;
    min-width: 160px;
  }
  .pill-label { font-size: 0.75rem; color: #64748b; margin-bottom: 0.25rem; }
  .pill-value { font-size: 1.25rem; font-weight: 700; color: #f1f5f9; }
</style>
</head>
<body>
<h1>Warboss Cost Ledger</h1>
<p class="subtitle">Deduplicated by requestId — generated ${new Date().toISOString()}</p>

<div class="stat-pills" id="pills"></div>

<div class="grid">
  <div class="card full">
    <h2>Cumulative Cost Over Time</h2>
    <canvas id="chart1"></canvas>
  </div>
  <div class="card full">
    <h2>Cost per Request</h2>
    <canvas id="chart2"></canvas>
  </div>
  <div class="card full">
    <h2>Token Breakdown per Request</h2>
    <canvas id="chart3"></canvas>
  </div>
  <div class="card full">
    <h2>Summary by Model</h2>
    <table>
      <thead><tr><th>Model</th><th>Requests</th><th>Total Cost</th><th>Avg Cost / Req</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
</div>

<script>
const VIZ_DATA = ${inlineData};

// Stat pills
const pillDefs = [
  { label: "Total Cost", value: "$" + VIZ_DATA.stats.totalCost.toFixed(4) },
  { label: "Total Requests", value: VIZ_DATA.stats.totalRequests.toString() },
  { label: "Avg Cost / Req", value: "$" + (VIZ_DATA.stats.totalCost / VIZ_DATA.stats.totalRequests).toFixed(4) },
];
const pillsEl = document.getElementById("pills");
for (const p of pillDefs) {
  const el = document.createElement("div");
  el.className = "pill";
  el.innerHTML = \`<div class="pill-label">\${p.label}</div><div class="pill-value">\${p.value}</div>\`;
  pillsEl.appendChild(el);
}

// Chart defaults
Chart.defaults.color = "#94a3b8";
Chart.defaults.borderColor = "#334155";

// Chart 1 — cumulative cost over time
new Chart(document.getElementById("chart1"), {
  type: "line",
  data: { datasets: VIZ_DATA.chart1Datasets },
  options: {
    responsive: true,
    maintainAspectRatio: true,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        type: "time",
        time: { tooltipFormat: "HH:mm:ss", displayFormats: { second: "HH:mm:ss", minute: "HH:mm" } },
        title: { display: true, text: "Time" },
      },
      y: {
        title: { display: true, text: "Cumulative Cost (USD)" },
        ticks: { callback: (v) => "$" + Number(v).toFixed(3) },
      },
    },
    plugins: { legend: { position: "top" } },
  },
});

// Chart 2 — cost per request bar
new Chart(document.getElementById("chart2"), {
  type: "bar",
  data: VIZ_DATA.chart2Data,
  options: {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      x: { ticks: { maxRotation: 60, font: { size: 9 } } },
      y: {
        title: { display: true, text: "Cost (USD)" },
        ticks: { callback: (v) => "$" + Number(v).toFixed(3) },
      },
    },
    plugins: { legend: { display: false } },
  },
});

// Chart 3 — stacked token breakdown
new Chart(document.getElementById("chart3"), {
  type: "bar",
  data: VIZ_DATA.chart3Data,
  options: {
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      x: { stacked: true, ticks: { maxRotation: 60, font: { size: 9 } } },
      y: { stacked: true, title: { display: true, text: "Tokens" } },
    },
    plugins: { legend: { position: "top" } },
  },
});
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const LEDGER_PATH = path.resolve(
  getArg("--file") ?? path.join(REPO_ROOT, "runs", "dev-cost-ledger.jsonl"),
);
const OUTPUT_PATH = path.resolve(
  getArg("--out") ?? path.join(REPO_ROOT, "runs", "viz.html"),
);

if (!fs.existsSync(LEDGER_PATH)) {
  console.error(`Ledger file not found: ${LEDGER_PATH}`);
  process.exit(1);
}

const entries = await readLedger(LEDGER_PATH);
console.log(
  `Read ${entries.length} unique requests (deduplicated by requestId).`
);

const html = buildHtml(entries);
fs.writeFileSync(OUTPUT_PATH, html, "utf8");

const stats = buildStats(entries);
console.log(`Written: ${OUTPUT_PATH}`);
console.log(
  `Total cost: $${stats.totalCost.toFixed(4)} across ${stats.totalRequests} requests`
);
for (const [model, s] of Object.entries(stats.byModel)) {
  console.log(
    `  ${model}: ${s.requestCount} reqs  $${s.totalCost.toFixed(4)}`
  );
}
