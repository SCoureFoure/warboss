import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCriteria, type ArmAnalysis, type ClusterResult } from "./analysis.ts";

interface ArtifactArmEntry {
  readonly clusterResult: ClusterResult;
  readonly modalShare?: number;
  readonly meanPassRate?: number;
  readonly coveredPassRate?: number;
  readonly uncoveredPassRate?: number;
  readonly notCoveredByCPassRate?: number;
  readonly totalCostUsd?: number;
}

interface Artifact {
  readonly analysis: Record<string, ArtifactArmEntry>;
}

function computeModalShare(entry: ArtifactArmEntry): number {
  const sizes = entry.clusterResult.sizes;
  if (sizes.length === 0) return 0;
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return sizes[0]! / total;
}

function buildArmAnalysis(arm: string, entry: ArtifactArmEntry): ArmAnalysis {
  const modalShare = computeModalShare(entry);
  return {
    arm,
    clusterResult: entry.clusterResult,
    modalShare,
    meanPassRate: entry.meanPassRate ?? 0,
    coveredPassRate: entry.coveredPassRate ?? 0,
    uncoveredPassRate: entry.uncoveredPassRate ?? 0,
    notCoveredByCPassRate: entry.notCoveredByCPassRate ?? 0,
    totalCostUsd: entry.totalCostUsd ?? 0,
  };
}

export async function rescore(artifactPath: string): Promise<void> {
  const absPath = resolve(artifactPath);
  const raw = await readFile(absPath, "utf8");
  const artifact = JSON.parse(raw) as Artifact;

  const analysis = artifact.analysis;
  const armA = buildArmAnalysis("A", analysis["A"] ?? { clusterResult: { count: 0, sizes: [] } });
  const armB = buildArmAnalysis("B", analysis["B"] ?? { clusterResult: { count: 0, sizes: [] } });
  const armC = buildArmAnalysis("C", analysis["C"] ?? { clusterResult: { count: 0, sizes: [] } });

  const criteria = evaluateCriteria(armA, armB, armC);

  const modalShares: Record<string, number> = {};
  for (const [arm, entry] of Object.entries(analysis)) {
    modalShares[arm] = computeModalShare(entry);
  }

  console.log(`\n=== Rescore (rev 3, provisional) — ${absPath} ===\n`);
  console.log(`  criterion 1 (rev 3, provisional): ${criteria.criterion1.pass ? "PASS" : "FAIL"} — ${criteria.criterion1.detail}`);
  console.log(`  criterion 2: ${criteria.criterion2.pass ? "PASS" : "FAIL"} — ${criteria.criterion2.detail}`);
  console.log(`  criterion 3: ${criteria.criterion3.pass ? "PASS" : "FAIL"} — ${criteria.criterion3.detail}`);
  console.log(`  criterion 4: ${criteria.criterion4.pass ? "PASS" : "FAIL"} — ${criteria.criterion4.detail}`);

  const base = basename(absPath, ".json");
  const outPath = join(dirname(absPath), `${base}-rescore-r3.json`);

  const output = {
    sourceArtifact: absPath,
    criteria,
    modalShares,
    provisional: true,
  };

  await writeFile(outPath, JSON.stringify(output, null, 2));
  console.log(`\nOutput: ${outPath}`);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const artifactPath = process.argv[2];
  if (!artifactPath) {
    console.error("Usage: npm run rescore -- <path-to-e1a-artifact.json>");
    process.exit(1);
  }
  rescore(artifactPath).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
