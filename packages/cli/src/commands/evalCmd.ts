import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// SPEC 12 `twotoe eval`: runs the eval harness (eval/run-eval.ts) and writes
// eval/RESULTS.md. The harness lives in the repo, not in a package, so this
// needs a checkout. Fixtures only; it never scans this machine.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
export const RUN_EVAL = path.join(REPO, "eval", "run-eval.ts");

export interface EvalOptions {
  models?: string;
  runs?: string;
  only?: string;
  llm?: boolean;       // commander sets false for --no-llm
}

const MODEL_LIST = /^[A-Za-z0-9._:/-]+(,[A-Za-z0-9._:/-]+)*$/;

export function evalArgs(opts: EvalOptions): string[] {
  const args: string[] = [];
  if (opts.llm === false) args.push("--no-llm");
  else {
    if (opts.models) {
      if (!MODEL_LIST.test(opts.models)) throw new Error("--models must be a comma-separated list of Ollama tags");
      args.push("--models", opts.models);
    }
    if (opts.runs) {
      if (!/^[1-9]\d?$/.test(opts.runs)) throw new Error("--runs must be a number from 1 to 99");
      args.push("--runs", opts.runs);
    }
  }
  if (opts.only) {
    if (!/^[A-Za-z0-9,-]+$/.test(opts.only)) throw new Error("--only must be fixture prefixes like f22,f06");
    args.push("--only", opts.only);
  }
  return args;
}

export async function runEval(opts: EvalOptions): Promise<number> {
  if (!fs.existsSync(RUN_EVAL)) {
    process.stdout.write("The eval harness is not in this install (it needs the repo checkout: eval/run-eval.ts).\n");
    return 2;
  }
  let args: string[];
  try {
    args = evalArgs(opts);
  } catch (err) {
    process.stderr.write(`twotoe: ${(err as Error).message}\n`);
    return 2;
  }
  // Same Node that runs TwoToe, argument array, no shell.
  const child = spawn(process.execPath, ["--import", "tsx", RUN_EVAL, ...args], { cwd: REPO, stdio: "inherit", shell: false });
  return new Promise<number>((resolve) => {
    child.once("error", () => resolve(2));
    child.once("exit", (code) => resolve(code ?? 2));
  });
}
