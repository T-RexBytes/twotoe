import { runFile, runPowerShell } from "@twotoe/core";

// SPEC 2.3 story 9 / 11.8: read the two lines aloud with the built-in, fully
// local speech engine (Windows System.Speech, macOS `say`). Nothing leaves the
// machine. The text travels in an env var, never inside the script text.
// The ElevenLabs option in 11.8 is not built: it needs an API key and a new
// egress host, which CLAUDE.md rule 4 says to ask about first.

export const SPEAK_SCRIPT =
  "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = -1; $s.Speak($env:TWOTOE_TEXT)";

// Line 1 and line 2 never carry paths or key names, only actions and counts.
export function speechText(line1: string, line2: string): string {
  return `${line1} ${line2}`.replace(/\s+/g, " ").trim();
}

export async function speak(text: string): Promise<boolean> {
  if (process.platform === "win32") {
    const r = await runPowerShell(SPEAK_SCRIPT, { TWOTOE_TEXT: text }, 60_000);
    return r.ok;
  }
  if (process.platform === "darwin") {
    const r = await runFile("/usr/bin/say", [text], { timeoutMs: 60_000 });
    return r.ok;
  }
  return false;
}
