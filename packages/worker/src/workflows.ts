import { proxyActivities, workflowInfo } from "@temporalio/workflow";
import type { Activities } from "./activities";

// SPEC 11.3. Deterministic orchestration only: all I/O lives in activities.

const fast = proxyActivities<Activities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});
const model = proxyActivities<Activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "30 seconds",
  retry: { maximumAttempts: 4, initialInterval: "10s", backoffCoefficient: 2, nonRetryableErrorTypes: ["ValidationExhausted"] },
});

export interface NightlyInput {
  configPath: string;
  offline: boolean;
}

export interface NightlyResult {
  date: string;
  actions: number;
  mode: "llm" | "template" | "llm-fallback";
}

export async function nightlyTriage(input: NightlyInput): Promise<NightlyResult> {
  const startedAt = workflowInfo().startTime.toISOString();
  const collected = await fast.collectInventory(input.configPath);
  const pack = input.offline ? await fast.loadPack() : await fast.refreshKevAndLoadPack();
  const findings = await fast.matchAdvisories(collected, pack);
  const write = await model.writeBriefWithValidation({ findings, collected, pack });   // includes retry + fallback
  const brief = await fast.assembleBrief({ collected, findings, write, startedAt, egress: [...pack.egress, ...write.egress] });
  await fast.persistAndNotify({
    brief, findings, notify: collected.notify,
    run: { checksRun: collected.checksRun, promptVersion: write.promptVersion, attempts: write.attemptLog },
  });
  return { date: brief.date, actions: brief.checklist.length, mode: brief.meta.mode };
}
