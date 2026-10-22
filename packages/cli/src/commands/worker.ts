import path from "node:path";
import { defaultConfigPath, twotoeHome } from "@twotoe/core";
import { runWorker } from "@twotoe/worker";

export interface WorkerCommandOptions {
  taskQueue?: string;
  stateDir?: string;
  injectModelDelay?: string;
  ensureSchedule?: boolean;
  at?: string;
  config?: string;
}

export async function runWorkerCommand(opts: WorkerCommandOptions): Promise<void> {
  const stateDir = path.resolve(opts.stateDir ?? twotoeHome());
  const delay = opts.injectModelDelay ? Number(opts.injectModelDelay) : 0;
  await runWorker({
    stateDir,
    ...(opts.taskQueue ? { taskQueue: opts.taskQueue } : {}),
    ...(delay > 0 ? { modelDelayMs: delay } : {}),
    ensureSchedule: opts.ensureSchedule ? { configPath: path.resolve(opts.config ?? defaultConfigPath()), at: opts.at ?? "03:00" } : false,
  });
}
