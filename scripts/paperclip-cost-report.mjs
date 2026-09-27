#!/usr/bin/env node
// Usage: node scripts/paperclip-cost-report.mjs
// Requires PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_COMPANY_ID in the environment
// (already injected inside an agent run; export them manually for a local shell).
//
// Aggregates spend directly from heartbeat-run usageJson, because
// /api/companies/{id}/costs/* report $0 while billingType is
// "subscription_included" (see IDE-27). This bypasses that rollup and sums
// costUsd/tokens straight from the run records, which are populated
// regardless of billing classification.

const apiUrl = process.env.PAPERCLIP_API_URL;
const apiKey = process.env.PAPERCLIP_API_KEY;
const companyId = process.env.PAPERCLIP_COMPANY_ID;

if (!apiUrl || !apiKey || !companyId) {
  console.error(
    "Missing PAPERCLIP_API_URL / PAPERCLIP_API_KEY / PAPERCLIP_COMPANY_ID in environment."
  );
  process.exit(1);
}

const base = apiUrl.replace(/^http:/, "https:").replace(/\/$/, "");

async function apiGet(path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchAllRuns() {
  // The endpoint ignores offset/before and just returns everything up to
  // `limit`; ask for far more than we expect so a growing company doesn't
  // silently get truncated, and warn if we hit the ceiling anyway.
  const limit = 20000;
  const runs = await apiGet(
    `/api/companies/${companyId}/heartbeat-runs?limit=${limit}`
  );
  if (runs.length === limit) {
    console.error(
      `WARNING: heartbeat-runs returned exactly the requested limit (${limit}) — results may be truncated.`
    );
  }
  return runs;
}

async function resolveAgentNames(agentIds) {
  const names = new Map();
  const known = await apiGet(`/api/companies/${companyId}/agents`);
  for (const a of known) names.set(a.id, a.name);

  const missing = [...agentIds].filter((id) => !names.has(id));
  await Promise.all(
    missing.map(async (id) => {
      try {
        const a = await apiGet(`/api/agents/${id}`);
        names.set(id, `${a.name} (terminated)`);
      } catch {
        names.set(id, `${id.slice(0, 8)}… (unknown)`);
      }
    })
  );
  return names;
}

function fmtUsd(n) {
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n) {
  return n.toLocaleString("en-US");
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length))
  );
  const line = (cells) =>
    cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

const FAILED_STATUSES = new Set(["failed", "interrupted"]);

async function main() {
  const runs = await fetchAllRuns();
  const withUsage = runs.filter((r) => r.usageJson && r.usageJson.costUsd != null);

  const agentNames = await resolveAgentNames(new Set(runs.map((r) => r.agentId)));

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  // --- Spend by window (24h / 7d / all-time) ---
  const windows = [
    ["24h", DAY],
    ["7d", 7 * DAY],
    ["all-time", Infinity],
  ];
  const windowRows = windows.map(([label, ms]) => {
    const inWindow = withUsage.filter(
      (r) => now - new Date(r.startedAt).getTime() <= ms
    );
    const cost = inWindow.reduce((s, r) => s + r.usageJson.costUsd, 0);
    const input = inWindow.reduce((s, r) => s + (r.usageJson.inputTokens || 0), 0);
    const output = inWindow.reduce((s, r) => s + (r.usageJson.outputTokens || 0), 0);
    const cached = inWindow.reduce((s, r) => s + (r.usageJson.cachedInputTokens || 0), 0);
    return [label, inWindow.length, fmtUsd(cost), fmtTokens(input), fmtTokens(output), fmtTokens(cached)];
  });

  console.log("## Spend by window\n");
  printTable(
    ["Window", "Runs", "Cost USD", "Input tok", "Output tok", "Cached tok"],
    windowRows
  );

  // --- Spend by agent (all-time) ---
  const byAgent = new Map();
  for (const r of withUsage) {
    const key = r.agentId;
    const acc = byAgent.get(key) || { runs: 0, cost: 0 };
    acc.runs += 1;
    acc.cost += r.usageJson.costUsd;
    byAgent.set(key, acc);
  }
  const agentRows = [...byAgent.entries()]
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([agentId, acc]) => [
      agentNames.get(agentId) || agentId,
      acc.runs,
      fmtUsd(acc.cost),
      fmtUsd(acc.cost / acc.runs),
    ]);

  console.log("\n## Spend by agent (all-time, runs with usage recorded)\n");
  printTable(["Agent", "Runs", "Cost USD", "Avg/run"], agentRows);

  // --- Failed-run waste ---
  const failed = withUsage.filter((r) => FAILED_STATUSES.has(r.status));
  const failedCost = failed.reduce((s, r) => s + r.usageJson.costUsd, 0);
  const totalCost = withUsage.reduce((s, r) => s + r.usageJson.costUsd, 0);
  const wastePct = totalCost > 0 ? (100 * failedCost) / totalCost : 0;

  console.log("\n## Failed-run waste (status: failed or interrupted)\n");
  printTable(
    ["Metric", "Value"],
    [
      ["Failed/interrupted runs", failed.length],
      ["Cost of failed/interrupted runs", fmtUsd(failedCost)],
      ["Total cost (all runs w/ usage)", fmtUsd(totalCost)],
      ["Waste %", `${wastePct.toFixed(1)}%`],
    ]
  );

  console.log(
    `\nRuns fetched: ${runs.length} (with usage recorded: ${withUsage.length}, without: ${
      runs.length - withUsage.length
    })`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
