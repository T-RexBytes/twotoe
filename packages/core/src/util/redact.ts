import os from "node:os";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replaces home directories with "~" in any text: the real home (as written,
// with forward slashes, and JSON-escaped), then any other C:\Users\<name>,
// /Users/<name> or /home/<name>. Short 8.3 names (SOURIS~1) are caught by the
// generic patterns.
export function redactText(text: string, home: string = os.homedir()): string {
  let out = text;
  if (home && home.length > 3) {
    const variants = new Set([
      home,
      home.replace(/\\/g, "/"),
      home.replace(/\\/g, "\\\\"),
      home.replace(/\//g, "\\"),
    ]);
    for (const v of [...variants].sort((a, b) => b.length - a.length)) {
      // Boundary check so C:\Users\alice never eats the start of C:\Users\ALICE~1.
      out = out.replace(new RegExp(`${escapeRe(v)}(?=[\\\\/"'\\s:;,)\\]}]|$)`, "gi"), "~");
    }
  }
  return out
    .replace(/\b[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\\/"'\s:*?<>|]+/gi, "~")
    .replace(/\/Users\/[^/"'\s]+/g, "~")
    .replace(/\/home\/[^/"'\s]+/g, "~");
}

export const redactPath = redactText;
