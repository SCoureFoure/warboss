import type { ContractCase } from "../contract.ts";
import type { TaskDef } from "./task.ts";
import { type Tier } from "../models.ts";

export type ArmId = "A" | "B" | "C" | "D";

export const E1A_SYSTEM =
  "Implement the requested function in JavaScript. Output ONLY one fenced code block. No prose.";

export interface ArmSpec {
  readonly tier: Tier;
  readonly usesContract: boolean;
}

export function armSpec(arm: ArmId): ArmSpec {
  switch (arm) {
    case "A": return { tier: "LOW",  usesContract: false };
    case "B": return { tier: "LOW",  usesContract: true  };
    case "C": return { tier: "LOW",  usesContract: true  };
    case "D": return { tier: "HIGH", usesContract: false };
  }
}

export function formatContractSection(
  entry: string,
  examples: readonly ContractCase[],
  hash: string,
): string {
  const lines = examples.map((ex) => {
    const args = (ex.input as unknown[]).map((a) => JSON.stringify(a)).join(", ");
    return `${entry}(${args}) === ${JSON.stringify(ex.expected)}`;
  });
  return `\n\nFrozen contract (hash ${hash}):\n${lines.join("\n")}`;
}

export function buildPrompt(arm: ArmId, task: TaskDef): string {
  switch (arm) {
    case "A":
    case "D":
      return task.prose;
    case "B":
      return (
        task.prose +
        formatContractSection(
          task.grader.entry,
          task.grader.examples,
          task.grader.hash,
        )
      );
    case "C":
      return (
        task.prose +
        formatContractSection(
          task.partial.entry,
          task.partial.examples,
          task.partial.hash,
        )
      );
  }
}
