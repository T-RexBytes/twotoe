import bundled from "./advisories.json";
import { AdvisoryPack } from "../schemas";

// Parses the bundled pack through the zod schema so a bad edit fails loudly at load.
export function loadPack(raw: unknown = bundled): AdvisoryPack {
  return AdvisoryPack.parse(raw);
}
