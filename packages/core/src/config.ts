import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

// ~/.twotoe/config.json (SPEC 12). Only the fields used so far; unknown keys pass through.
export const TwotoeConfig = z.object({
  roots: z.array(z.string()).optional(),
  region: z.string().nullable().optional(),
  model: z.string().optional(),
}).passthrough();
export type TwotoeConfig = z.infer<typeof TwotoeConfig>;

export function defaultConfigPath(home: string = os.homedir()): string {
  return path.join(home, ".twotoe", "config.json");
}

// Missing file -> {}. A file that exists but does not parse is an error the
// user should see, not a silently empty config.
export function loadConfig(file: string = defaultConfigPath()): TwotoeConfig {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return {};
  }
  return TwotoeConfig.parse(JSON.parse(text.replace(/^﻿/, "")));
}
