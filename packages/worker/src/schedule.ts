import { Client, Connection, ScheduleAlreadyRunning, ScheduleNotFoundError, ScheduleOverlapPolicy } from "@temporalio/client";
import { assertLoopbackAddress, TASK_QUEUE, TEMPORAL_ADDRESS } from "./temporal";

export async function withClient<T>(fn: (client: Client) => Promise<T>, address: string = TEMPORAL_ADDRESS): Promise<T> {
  assertLoopbackAddress(address);
  const connection = await Connection.connect({ address });
  try {
    return await fn(new Client({ connection }));
  } finally {
    await connection.close();
  }
}

export const SCHEDULE_ID = "twotoe-nightly";

export interface ScheduleOptions {
  configPath: string;
  at?: string;              // "HH:MM" local time
  timezone?: string;        // IANA; defaults to this machine's zone
  catchupWindow?: string;   // SPEC 11.3: "6h"
  offline?: boolean;
  taskQueue?: string;
}

export function parseAt(at: string): { hour: number; minute: number } {
  const m = at.match(/^(\d{1,2}):(\d{2})$/);
  const hour = m ? Number(m[1]) : NaN;
  const minute = m ? Number(m[2]) : NaN;
  if (!m || hour > 23 || minute > 59) throw new Error(`--at must be HH:MM, got "${at}"`);
  return { hour, minute };
}

export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function scheduleSpec(opts: ScheduleOptions) {
  const { hour, minute } = parseAt(opts.at ?? "03:00");
  return {
    spec: { calendars: [{ hour, minute }], timezone: opts.timezone ?? localTimezone() },
    action: {
      type: "startWorkflow" as const,
      workflowType: "nightlyTriage",
      workflowId: "twotoe-nightly-run",
      taskQueue: opts.taskQueue ?? TASK_QUEUE,
      args: [{ configPath: opts.configPath, offline: opts.offline === true }],
    },
    policies: { overlap: ScheduleOverlapPolicy.SKIP, catchupWindow: opts.catchupWindow ?? "6h" },
  };
}

// Create the nightly schedule, or update it in place if it exists (idempotent).
export async function ensureSchedule(client: Client, opts: ScheduleOptions): Promise<"created" | "updated"> {
  const s = scheduleSpec(opts);
  try {
    await client.schedule.create({ scheduleId: SCHEDULE_ID, ...s });
    return "created";
  } catch (err) {
    if (!(err instanceof ScheduleAlreadyRunning)) throw err;
    await client.schedule.getHandle(SCHEDULE_ID).update((prev) => ({ ...prev, spec: s.spec, action: s.action, policies: s.policies }));
    return "updated";
  }
}

export async function removeSchedule(client: Client): Promise<boolean> {
  try {
    await client.schedule.getHandle(SCHEDULE_ID).delete();
    return true;
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) return false;
    throw err;
  }
}
