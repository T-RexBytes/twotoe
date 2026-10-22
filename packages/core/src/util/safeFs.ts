import fs from "node:fs";

// Windows Defender and editors hold files open. These codes mean "skip and
// count", never "crash the scan" (SPEC 5.4 rule 6).
export const LOCK_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);

export type ReadOutcome = "ok" | "locked" | "missing" | "error";

export function classifyError(err: unknown): Exclude<ReadOutcome, "ok"> {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code && LOCK_CODES.has(code)) return "locked";
  if (code === "ENOENT" || code === "ENOTDIR") return "missing";
  return "error";
}

// Counts skipped files by reason. Shared by every scanner in one scan.
export class SkipCounter {
  locked = 0;
  missing = 0;
  error = 0;
  note(outcome: ReadOutcome): void {
    if (outcome !== "ok") this[outcome]++;
  }
}

// Streams a file as utf8 chunks. Error messages are never surfaced, because
// they can echo paths; callers only get the outcome.
export async function forEachChunk(
  file: string,
  onChunk: (chunk: string) => boolean | void,
): Promise<ReadOutcome> {
  let stream: fs.ReadStream | undefined;
  try {
    stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: 64 * 1024 });
    for await (const chunk of stream) {
      if (onChunk(chunk as string) === false) break;
    }
    return "ok";
  } catch (err) {
    return classifyError(err);
  } finally {
    stream?.destroy();
  }
}

// Streams a file line by line. Accepts LF and CRLF; strips a leading BOM.
// Return false from onLine to stop early.
export async function forEachLine(
  file: string,
  onLine: (line: string, lineNo: number) => boolean | void,
): Promise<ReadOutcome> {
  let rest = "";
  let lineNo = 0;
  let stopped = false;
  const emit = (raw: string): boolean => {
    lineNo++;
    let line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (lineNo === 1 && line.charCodeAt(0) === 0xfeff) line = line.slice(1);
    if (onLine(line, lineNo) === false) {
      stopped = true;
      return false;
    }
    return true;
  };
  const outcome = await forEachChunk(file, (chunk) => {
    let start = 0;
    let nl = chunk.indexOf("\n");
    while (nl !== -1) {
      const piece = rest + chunk.slice(start, nl);
      rest = "";
      if (!emit(piece)) return false;
      start = nl + 1;
      nl = chunk.indexOf("\n", start);
    }
    rest += chunk.slice(start);
    return true;
  });
  if (outcome === "ok" && !stopped && rest.length > 0) emit(rest);
  return outcome;
}

// Small text files only (lockfiles, .nvmrc, package.json). Never used for env
// files or IOC files.
export async function readSmallText(
  file: string,
  maxBytes = 50 * 1024 * 1024,
): Promise<{ outcome: ReadOutcome; text: string }> {
  try {
    const st = await fs.promises.stat(file);
    if (st.size > maxBytes) return { outcome: "error", text: "" };
    const text = await fs.promises.readFile(file, "utf8");
    return { outcome: "ok", text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text };
  } catch (err) {
    return { outcome: classifyError(err), text: "" };
  }
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.promises.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(p)).isDirectory();
  } catch {
    return false;
  }
}
