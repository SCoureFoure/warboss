import { Agent, GRUNT_DOGMA, extractCode } from "./agent.ts";
import { Contract } from "./contract.ts";
import { judge } from "./runner.ts";
import type { Granularity } from "./runner.ts";

export interface LoopOptions {
  agent: Agent;
  contract: Contract;
  prompt: string;
  granularity?: Granularity;
  budget?: number;
  system?: string;
  maxTokens?: number;
  kind?: string;
  tags?: Record<string, string | number>;
}

export interface AttemptRecord {
  index: number;
  code: string | undefined;
  generationFailed: boolean;
  pass: boolean;
  score: number;
  vector: readonly boolean[];
  feedback: string;
  costUsd: number;
  wallMs: number;
}

export interface LoopResult {
  status: "green" | "stalled" | "exhausted";
  green: boolean;
  attempts: readonly AttemptRecord[];
  attemptsUsed: number;
  finalCode: string | undefined;
  costUsd: number;
  wallMs: number;
}

function buildRetryPrompt(
  initialPrompt: string,
  prev: AttemptRecord,
): string {
  if (prev.generationFailed) {
    return (
      initialPrompt +
      "\n\nYour previous response contained no code block.\n\nFix the implementation. Output ONLY one fenced code block."
    );
  }
  return (
    initialPrompt +
    "\n\nYour previous implementation:\n```js\n" +
    (prev.code ?? "") +
    "\n```\n\nJudge feedback:\n" +
    prev.feedback +
    "\n\nFix the implementation. Output ONLY one fenced code block."
  );
}

export async function runLoop(opts: LoopOptions): Promise<LoopResult> {
  const budget = opts.budget ?? 5;
  const granularity = opts.granularity ?? "full";
  const system = opts.system ?? GRUNT_DOGMA;
  const maxTokens = opts.maxTokens ?? 2048;
  const kind = opts.kind ?? "grunt.loop";

  const attempts: AttemptRecord[] = [];
  let finalCode: string | undefined = undefined;
  let totalCostUsd = 0;
  let totalWallMs = 0;
  let currentPrompt = opts.prompt;
  let prevCodeForStall: string | undefined = undefined;
  let prevHadCode = false;

  for (let i = 1; i <= budget; i++) {
    let text: string | undefined;
    let costUsd = 0;
    let wallMs = 0;
    let generationFailed = false;

    const MAX_API_TRIES = 3;
    let apiSuccess = false;
    for (let t = 0; t < MAX_API_TRIES; t++) {
      try {
        const result = await opts.agent.generate({
          prompt: currentPrompt,
          system,
          maxTokens,
          kind,
          tags: { ...opts.tags, attempt: i },
        });
        text = result.text;
        costUsd = result.costUsd;
        wallMs = result.wallMs;
        apiSuccess = true;
        break;
      } catch {
        if (t === MAX_API_TRIES - 1) {
          generationFailed = true;
        }
      }
    }

    if (!apiSuccess) {
      generationFailed = true;
    }

    const code = generationFailed ? undefined : extractCode(text ?? "");
    if (code !== undefined) {
      finalCode = code;
    }

    if (generationFailed || code === undefined) {
      generationFailed = true;
      const record: AttemptRecord = {
        index: i,
        code: undefined,
        generationFailed: true,
        pass: false,
        score: 0,
        vector: [],
        feedback: "",
        costUsd,
        wallMs,
      };
      attempts.push(record);
      totalCostUsd += costUsd;
      totalWallMs += wallMs;
      prevHadCode = false;
      prevCodeForStall = undefined;

      if (i < budget) {
        currentPrompt = buildRetryPrompt(opts.prompt, record);
      }
      continue;
    }

    // Stall detection: both current and previous produced code and are equal after trim
    if (prevHadCode && code.trim() === prevCodeForStall) {
      const judged = judge(opts.contract, code, {
        expectedHash: opts.contract.hash,
        granularity,
      });
      const record: AttemptRecord = {
        index: i,
        code,
        generationFailed: false,
        pass: judged.pass,
        score: judged.score,
        vector: judged.vector,
        feedback: judged.feedback,
        costUsd,
        wallMs,
      };
      attempts.push(record);
      totalCostUsd += costUsd;
      totalWallMs += wallMs;
      return {
        status: "stalled",
        green: false,
        attempts,
        attemptsUsed: i,
        finalCode,
        costUsd: totalCostUsd,
        wallMs: totalWallMs,
      };
    }

    if (code !== undefined) {
      prevCodeForStall = code.trim();
      prevHadCode = true;
    }

    const judged = judge(opts.contract, code, {
      expectedHash: opts.contract.hash,
      granularity,
    });

    const record: AttemptRecord = {
      index: i,
      code,
      generationFailed: false,
      pass: judged.pass,
      score: judged.score,
      vector: judged.vector,
      feedback: judged.feedback,
      costUsd,
      wallMs,
    };
    attempts.push(record);
    totalCostUsd += costUsd;
    totalWallMs += wallMs;

    if (judged.pass) {
      return {
        status: "green",
        green: true,
        attempts,
        attemptsUsed: i,
        finalCode,
        costUsd: totalCostUsd,
        wallMs: totalWallMs,
      };
    }

    if (i < budget) {
      currentPrompt = buildRetryPrompt(opts.prompt, record);
    }
  }

  return {
    status: "exhausted",
    green: false,
    attempts,
    attemptsUsed: budget,
    finalCode,
    costUsd: totalCostUsd,
    wallMs: totalWallMs,
  };
}
