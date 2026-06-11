import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Contract, type ContractCase } from "../contract.ts";

export interface HiddenCase {
  readonly name: string;
  readonly input: readonly unknown[];
  readonly expected: unknown;
  readonly throws?: true;
  readonly coveredBy: readonly string[];
}

export interface TaskDef {
  readonly prose: string;
  readonly grader: Contract;
  readonly partial: Contract;
  readonly hidden: readonly HiddenCase[];
  readonly armCSubset: readonly string[];
  readonly isolation: "vm" | "process";
}

interface RawExample {
  name: string;
  input: unknown[];
  expected: unknown;
  throws?: true;
}

interface RawTask {
  name: string;
  entry: string;
  version: string;
  examples: RawExample[];
  armCSubset: string[];
  isolation?: string;
}

interface RawHiddenCase {
  name: string;
  input: unknown[];
  expected: unknown;
  throws?: true;
  coveredBy: string[];
}

export function loadTask(dir: string): TaskDef {
  const prose = readFileSync(join(dir, "requirement.md"), "utf8").trim();
  const taskRaw = JSON.parse(
    readFileSync(join(dir, "task.json"), "utf8"),
  ) as RawTask;
  const hiddenRaw = JSON.parse(
    readFileSync(join(dir, "hidden-battery.json"), "utf8"),
  ) as RawHiddenCase[];

  const isolation = taskRaw.isolation ?? "vm";
  if (isolation !== "vm" && isolation !== "process") {
    throw new Error(`task.json: isolation must be "vm" or "process", got "${isolation}"`);
  }

  if (!taskRaw.examples || taskRaw.examples.length === 0) {
    throw new Error("task.json: examples array is empty");
  }

  const exampleNames = new Set<string>();
  for (const ex of taskRaw.examples) {
    if (!ex.name) throw new Error("task.json: example missing name field");
    if (exampleNames.has(ex.name))
      throw new Error(`task.json: duplicate example name "${ex.name}"`);
    exampleNames.add(ex.name);
  }

  for (const name of taskRaw.armCSubset) {
    if (!exampleNames.has(name))
      throw new Error(
        `task.json: armCSubset references unknown example "${name}"`,
      );
  }

  if (!hiddenRaw || hiddenRaw.length === 0) {
    throw new Error("hidden-battery.json: array is empty");
  }

  const hiddenNames = new Set<string>();
  for (const c of hiddenRaw) {
    if (!c.name) throw new Error("hidden-battery.json: case missing name field");
    if (hiddenNames.has(c.name))
      throw new Error(`hidden-battery.json: duplicate case name "${c.name}"`);
    hiddenNames.add(c.name);
    for (const ref of c.coveredBy) {
      if (!exampleNames.has(ref))
        throw new Error(
          `hidden-battery.json: case "${c.name}" coveredBy references unknown example "${ref}"`,
        );
    }
  }

  const examples: ContractCase[] = taskRaw.examples.map((ex) => ({
    name: ex.name,
    input: ex.input,
    expected: ex.expected,
    ...(ex.throws ? { throws: true as const } : {}),
  }));

  const grader = Contract.freeze({
    requirement: taskRaw.name,
    entry: taskRaw.entry,
    version: taskRaw.version,
    examples,
  });

  const subsetExamples: ContractCase[] = taskRaw.armCSubset.map((name) => {
    const ex = taskRaw.examples.find((e) => e.name === name)!;
    return {
      name: ex.name,
      input: ex.input,
      expected: ex.expected,
      ...(ex.throws ? { throws: true as const } : {}),
    };
  });

  const partial = Contract.freeze({
    requirement: taskRaw.name,
    entry: taskRaw.entry,
    version: `${taskRaw.version}-partial`,
    examples: subsetExamples,
  });

  const hidden: HiddenCase[] = hiddenRaw.map((c) => ({
    name: c.name,
    input: c.input,
    expected: c.expected,
    coveredBy: c.coveredBy,
    ...(c.throws ? { throws: true as const } : {}),
  }));

  return { prose, grader, partial, hidden, armCSubset: taskRaw.armCSubset, isolation: isolation as "vm" | "process" };
}

export function auditNoContamination(
  prompts: readonly string[],
  hidden: readonly HiddenCase[],
): void {
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i]!;
    for (const c of hidden) {
      for (const inp of c.input) {
        const needle = JSON.stringify(inp);
        if (prompt.includes(needle)) {
          throw new Error(
            `Contamination in prompt[${i}]: hidden case "${c.name}" input ${needle} appears in prompt`,
          );
        }
      }
    }
  }
}
