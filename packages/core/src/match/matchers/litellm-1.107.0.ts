import path from "node:path";
import type { Finding } from "../../schemas";
import { SOURCE_PIN, SOURCE_SITE_PACKAGES } from "../../sources";
import { buildFinding, HitGroups, itemsOf, type Hit, type Matcher } from "../finding";
import { sourcePath } from "./shared";

type Evidence = Finding["evidence"][number];

interface Params {
  package: string;
  badExact: string[];
  lastSafe: string;
  iocFilenames: string[];
  suspiciousIfPresent: string[];
  iocSha256: Record<string, { windows: string; linuxMac: string }>;
  dockerImages: string[];
  dockerBadTags: string[];
  dockerFloatingTagsDuringWindow: string[];
}

// "__pycache__/cook.cpython-312.pyc" -> "cook.py"; "cook.pth" -> "cook.pth".
function iocBase(filename: string): string {
  const base = path.posix.basename(filename.replace(/\\/g, "/"));
  const pyc = base.match(/^(cook|sitecustomize)\..*\.pyc$/i);
  return pyc ? `${pyc[1]!.toLowerCase()}.py` : base.toLowerCase();
}

// SPEC 8.2.3, 8.2.4, 9.3. One finding per root cause:
//   cook.pth / cook.py present            -> definite, "compromised" wording
//   1.107.0 installed or v1.107.0 image   -> definite
//   only a pin to 1.107.0                 -> likely
//   only sitecustomize.py (unknown hash)  -> possible
//   litellm image on a tag that moved during the bad window -> possible
// A sitecustomize.py whose SHA-256 matches a published IOC hash is definite.
export const matcher: Matcher = {
  advisoryId: "litellm-1.107.0",
  match(inv, advisory, config) {
    const p = advisory.check.params as unknown as Params;
    const bad = p.badExact[0]!;
    const knownHashes = new Map<string, string>();
    for (const [file, h] of Object.entries(p.iocSha256)) {
      knownHashes.set(h.windows, file);
      knownHashes.set(h.linuxMac, file);
    }

    const compromise: Evidence[] = [];
    const installed: Evidence[] = [];
    const pins: Evidence[] = [];
    const suspicious: Array<{ dir: string; ev: Evidence }> = [];
    const window: Evidence[] = [];
    const compromisedDirs = new Set<string>();

    for (const f of itemsOf(inv, "iocFile")) {
      const base = iocBase(f.filename);
      const hashNote = knownHashes.has(f.sha256) ? ", SHA-256 matches a published IOC" : "";
      const ev = { detector: "iocFiles", location: f.dir, detail: `${f.filename} present (${f.size} bytes${hashNote})` };
      if (p.iocFilenames.includes(base) || knownHashes.has(f.sha256)) {
        compromise.push(ev);
        compromisedDirs.add(f.dir);
      } else if (p.suspiciousIfPresent.includes(base)) {
        suspicious.push({ dir: f.dir, ev });
      }
    }
    // sitecustomize.py next to cook files is part of the compromise; alone it is only suspicious.
    const lonelySuspicious: Evidence[] = [];
    for (const s of suspicious) {
      if (compromisedDirs.has(s.dir)) compromise.push(s.ev);
      else lonelySuspicious.push(s.ev);
    }

    for (const pkg of itemsOf(inv, "package").filter((x) => x.ecosystem === "pypi" && x.name === p.package && p.badExact.includes(x.version))) {
      if (pkg.source.startsWith(SOURCE_SITE_PACKAGES)) {
        installed.push({ detector: "pypiExactVersion", location: sourcePath(pkg.source), detail: `litellm ${pkg.version} installed` });
      } else if (pkg.source.startsWith(SOURCE_PIN)) {
        pins.push({ detector: "pypiPin", location: sourcePath(pkg.source), detail: `pins litellm==${pkg.version}` });
      }
    }
    for (const d of itemsOf(inv, "dockerImage").filter((x) => p.dockerImages.includes(x.image))) {
      const ev = { detector: "dockerTag", location: d.source, detail: `image ${d.image}:${d.tag}` };
      if (p.dockerBadTags.includes(d.tag)) installed.push(ev);
      else if (p.dockerFloatingTagsDuringWindow.includes(d.tag)) window.push(ev);
    }

    const groups = new HitGroups();
    const base: Omit<Hit, "confidence" | "evidence"> = { found: bad, fixed: p.lastSafe };
    if (compromise.length) {
      groups.add("compromise", { ...base, confidence: "definite", variant: "compromise", evidence: [...compromise, ...installed, ...pins] });
    } else if (installed.length) {
      groups.add("installed", { ...base, confidence: "definite", evidence: [...installed, ...pins] });
    } else if (pins.length) {
      groups.add("pin", { ...base, confidence: "likely", variant: "pin", evidence: pins });
    }
    if (lonelySuspicious.length) {
      groups.add("sitecustomize", { ...base, confidence: "possible", variant: "sitecustomize", evidence: lonelySuspicious.map((e) => ({ ...e, detail: `${e.detail}; unexpected sitecustomize.py, inspect manually in a sandbox` })) });
    }
    if (window.length) {
      groups.add("dockerWindow", { ...base, confidence: "possible", variant: "dockerWindow", evidence: window });
    }
    return groups.hits().map((h) => buildFinding(advisory, h, config));
  },
};
