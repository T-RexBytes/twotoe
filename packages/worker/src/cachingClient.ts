import type { ChatRequest, ChatResult, ModelClient } from "@twotoe/writer";
import { inputHash, type RunStore } from "./cache";

// A retried writeBriefWithValidation after a crash reuses a finished model
// response instead of asking the model again (SPEC 11.3).
export class CachingModelClient implements ModelClient {
  constructor(
    private readonly inner: ModelClient,
    private readonly store: RunStore,
    private readonly activity: string,
    private readonly attempt: number,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const key = inputHash({ model: req.model, system: req.system, user: req.user, schema: req.schema, think: req.think ?? false });
    const hit = this.store.read<ChatResult>("model", key);
    if (hit) {
      this.store.journal({ activity: this.activity, attempt: this.attempt, event: "model-cache-hit", key });
      return hit;
    }
    this.store.journal({ activity: this.activity, attempt: this.attempt, event: "model-call", key });
    const res = await this.inner.chat(req);
    this.store.write("model", key, res);
    this.store.journal({ activity: this.activity, attempt: this.attempt, event: "model-cached", key });
    return res;
  }
}
