import type { HiddenCase } from "./task.ts";

export interface RunRecord {
  readonly arm: string;
  readonly index: number;
  readonly model: string;
  readonly code: string | undefined;
  readonly generationFailed: boolean;
  readonly viable: boolean;
  readonly vector: readonly boolean[];
  readonly score: number;
  readonly coveredScore: number;
  readonly uncoveredScore: number;
  readonly costUsd: number;
  readonly wallMs: number;
}

export interface ClusterResult {
  readonly count: number;
  readonly sizes: readonly number[];
}

export interface SplitResult {
  readonly coveredIndices: readonly number[];
  readonly uncoveredIndices: readonly number[];
  readonly coveredByCIndices: readonly number[];
}

export interface ArmAnalysis {
  readonly arm: string;
  readonly clusterResult: ClusterResult;
  readonly modalShare: number;
  readonly meanPassRate: number;
  readonly coveredPassRate: number;
  readonly uncoveredPassRate: number;
  readonly notCoveredByCPassRate: number;
  readonly totalCostUsd: number;
}

export interface CriterionVerdict {
  readonly pass: boolean;
  readonly detail: string;
}

export interface CriteriaResult {
  readonly criterion1: CriterionVerdict;
  readonly criterion2: CriterionVerdict;
  readonly criterion3: CriterionVerdict;
  readonly criterion4: CriterionVerdict;
}

export function applyViabilityGate(
  vector: readonly boolean[],
  hidden: readonly HiddenCase[],
): { viable: boolean; vector: readonly boolean[] } {
  const passesAnyNonThrows = hidden.some((c, i) => !c.throws && vector[i] === true);
  if (passesAnyNonThrows) {
    return { viable: true, vector };
  }
  const gated = vector.map((v, i) => (hidden[i]?.throws ? false : v));
  return { viable: false, vector: gated };
}

export function cluster(records: readonly RunRecord[]): ClusterResult {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = r.vector.map((v) => (v ? "1" : "0")).join("");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sizes = [...counts.values()].sort((a, b) => b - a);
  return { count: sizes.length, sizes };
}

export function splits(
  hidden: readonly HiddenCase[],
  armCSubset: readonly string[],
): SplitResult {
  const subsetSet = new Set(armCSubset);
  const coveredIndices: number[] = [];
  const uncoveredIndices: number[] = [];
  const coveredByCIndices: number[] = [];

  hidden.forEach((c, i) => {
    if (c.coveredBy.length > 0) {
      coveredIndices.push(i);
    } else {
      uncoveredIndices.push(i);
    }
    if (c.coveredBy.some((ref) => subsetSet.has(ref))) {
      coveredByCIndices.push(i);
    }
  });

  return { coveredIndices, uncoveredIndices, coveredByCIndices };
}

function meanPassRateAt(
  records: readonly RunRecord[],
  indices: readonly number[],
): number {
  if (records.length === 0 || indices.length === 0) return 0;
  let sum = 0;
  for (const r of records) {
    const passing = indices.filter((i) => r.vector[i] === true).length;
    sum += passing / indices.length;
  }
  return sum / records.length;
}

export function analyzeArm(
  arm: string,
  records: readonly RunRecord[],
  split: SplitResult,
  allIndices: readonly number[],
): ArmAnalysis {
  const notCoveredByCIndices = allIndices.filter(
    (i) => !split.coveredByCIndices.includes(i),
  );
  const clusterResult = cluster(records);
  const modalShare =
    clusterResult.sizes[0] !== undefined ? clusterResult.sizes[0] / records.length : 0;
  return {
    arm,
    clusterResult,
    modalShare,
    meanPassRate: meanPassRateAt(records, allIndices),
    coveredPassRate: meanPassRateAt(records, split.coveredIndices),
    uncoveredPassRate: meanPassRateAt(records, split.uncoveredIndices),
    notCoveredByCPassRate: meanPassRateAt(records, notCoveredByCIndices),
    totalCostUsd: records.reduce((s, r) => s + r.costUsd, 0),
  };
}

export function evaluateCriteria(
  armA: ArmAnalysis,
  armB: ArmAnalysis,
  armC: ArmAnalysis,
): CriteriaResult {
  const c1Pass = armB.modalShare >= 0.9 && armA.modalShare <= 0.7;
  const c2Diff = armB.coveredPassRate - armA.coveredPassRate;
  const c2Pass = c2Diff >= 0.15;
  const c3Pass = armC.notCoveredByCPassRate <= armA.notCoveredByCPassRate;

  return {
    criterion1: {
      pass: c1Pass,
      detail: `modalShare(B)=${armB.modalShare.toFixed(3)} ≥ 0.9 && modalShare(A)=${armA.modalShare.toFixed(3)} ≤ 0.7`,
    },
    criterion2: {
      pass: c2Pass,
      detail: `meanPassRate(B,covered)=${armB.coveredPassRate.toFixed(3)} − meanPassRate(A,covered)=${armA.coveredPassRate.toFixed(3)} = ${c2Diff.toFixed(3)} (need ≥ 0.15)`,
    },
    criterion3: {
      pass: c3Pass,
      detail: `meanPassRate(C,notCovByC)=${armC.notCoveredByCPassRate.toFixed(3)} ≤ meanPassRate(A,notCovByC)=${armA.notCoveredByCPassRate.toFixed(3)}`,
    },
    criterion4: {
      pass: false,
      detail: "deferred (E1b)",
    },
  };
}
