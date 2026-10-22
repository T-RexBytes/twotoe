import { forEachLine, type ReadOutcome } from "../util/safeFs";

// SPEC 8.2.1 / 8.2.2 / 8.2.8: base images from Dockerfile FROM lines and
// docker-compose `image:` lines. Lines are streamed and every other line is
// dropped at once (ENV and ARG lines can hold secrets). ARG values are never
// resolved, so `node:${NODE_VERSION}` is reported as written.

export interface ImageRef {
  image: string;
  tag: string;
  line: number;
}

// "docker.io/library/node:24.22.0-alpine@sha256:..." -> { image: "node", tag: "24.22.0-alpine" }
export function parseImageRef(ref: string): { image: string; tag: string } | null {
  let r = ref.trim().replace(/^["']|["']$/g, "");
  if (!r || r.toLowerCase() === "scratch") return null;
  const at = r.indexOf("@");
  if (at >= 0) r = r.slice(0, at);
  const slash = r.lastIndexOf("/");
  const colon = r.lastIndexOf(":");
  let image = r;
  let tag = "latest";
  if (colon > slash) {
    image = r.slice(0, colon);
    tag = r.slice(colon + 1);
  }
  image = image.replace(/^(docker\.io|index\.docker\.io|registry-1\.docker\.io)\//i, "").replace(/^library\//, "");
  if (!image) return null;
  return { image: image.toLowerCase(), tag };
}

const FROM_RE = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i;

export function parseDockerfileFroms(lines: Iterable<[string, number]>): ImageRef[] {
  const stages = new Set<string>();
  const out: ImageRef[] = [];
  for (const [line, lineNo] of lines) {
    const m = line.match(FROM_RE);
    if (!m) continue;
    const ref = m[1]!;
    if (!stages.has(ref.toLowerCase())) {
      const parsed = parseImageRef(ref);
      if (parsed) out.push({ ...parsed, line: lineNo });
    }
    if (m[2]) stages.add(m[2].toLowerCase());
  }
  return out;
}

export async function readDockerfileImages(file: string): Promise<{ outcome: ReadOutcome; images: ImageRef[] }> {
  const fromLines: Array<[string, number]> = [];
  const outcome = await forEachLine(file, (line, n) => {
    if (/^\s*FROM\s/i.test(line)) fromLines.push([line, n]);
  });
  return { outcome, images: outcome === "ok" ? parseDockerfileFroms(fromLines) : [] };
}

const IMAGE_RE = /^\s*(?:-\s+)?image:\s*["']?([^"'\s#]+)/;

export async function readComposeImages(file: string): Promise<{ outcome: ReadOutcome; images: ImageRef[] }> {
  const images: ImageRef[] = [];
  const outcome = await forEachLine(file, (line, n) => {
    const m = line.match(IMAGE_RE);
    if (!m) return;
    const parsed = parseImageRef(m[1]!);
    if (parsed) images.push({ ...parsed, line: n });
  });
  return { outcome, images: outcome === "ok" ? images : [] };
}
