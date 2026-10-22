import { fileURLToPath } from "node:url";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { defaultConfigPath, installEgressGuard, Ledger, twotoeHome } from "@twotoe/core";
import { OllamaClient, type ModelClient } from "@twotoe/writer";
import { createActivities } from "./activities";
import { notifyToast } from "./notify";
import { ensureSchedule, type ScheduleOptions } from "./schedule";
import { assertLoopbackAddress, isPortOpen, TASK_QUEUE, TEMPORAL_ADDRESS } from "./temporal";

export const WORKFLOWS_PATH = fileURLToPath(new URL("./workflows.ts", import.meta.url));

export interface RunWorkerOptions {
  address?: string;
  namespace?: string;
  taskQueue?: string;
  stateDir?: string;
  modelDelayMs?: number;
  modelClient?: ModelClient;
  ensureSchedule?: Omit<ScheduleOptions, "taskQueue"> | false;
  waitForServerMs?: number;
  log?: (line: string) => void;
}

// At log on the server task and the worker task start together; the server may
// need a while (first start creates the DB). Wait for it instead of exiting.
export async function waitForServer(address: string, timeoutMs: number, log: (l: string) => void): Promise<void> {
  const [host, port] = [address.replace(/:\d+$/, ""), Number(address.split(":").pop())];
  const until = Date.now() + timeoutMs;
  let said = false;
  while (!(await isPortOpen(host, port))) {
    if (Date.now() > until) throw new Error(`Temporal server not reachable on ${address} after ${Math.round(timeoutMs / 1000)}s`);
    if (!said) { log(`waiting for the Temporal server on ${address}`); said = true; }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function runWorker(opts: RunWorkerOptions = {}): Promise<void> {
  const address = opts.address ?? TEMPORAL_ADDRESS;
  const namespace = opts.namespace ?? "default";
  const taskQueue = opts.taskQueue ?? TASK_QUEUE;
  const log = opts.log ?? ((l: string) => process.stdout.write(`${l}\n`));
  assertLoopbackAddress(address);
  const ledger = new Ledger();
  installEgressGuard({ ledger });
  await waitForServer(address, opts.waitForServerMs ?? 180_000, log);

  if (opts.ensureSchedule) {
    const connection = await Connection.connect({ address });
    try {
      const r = await ensureSchedule(new Client({ connection, namespace }), { ...opts.ensureSchedule, taskQueue });
      log(`schedule ${r}`);
    } finally {
      await connection.close();
    }
  }

  const connection = await NativeConnection.connect({ address });
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: WORKFLOWS_PATH,
    activities: createActivities({
      stateDir: opts.stateDir ?? twotoeHome(),
      modelClient: opts.modelClient ?? new OllamaClient(),
      ledger,
      ...(opts.modelDelayMs ? { modelDelayMs: opts.modelDelayMs } : {}),
      notify: notifyToast,
    }),
  });
  log(`worker ready on ${taskQueue} (pid ${process.pid})`);
  try {
    await worker.run();
  } finally {
    await connection.close();
  }
}

export { defaultConfigPath };
