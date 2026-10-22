import os from "node:os";
import path from "node:path";
import type { SystemProbe } from "./probe/SystemProbe";
import { Inventory, type InventoryItem } from "./schemas";
import { readComposeImages, readDockerfileImages } from "./scanners/dockerfiles";
import { readComposeEnvKeys, readEnvKeys, type EnvKeyResult } from "./scanners/envKeys";
import { scanIocFiles } from "./scanners/iocFiles";
import {
  parseEnginesNode, parseNodeVersionFile, parseNpmLock, parsePnpmLock, parseYarnLock,
} from "./scanners/nodeLockfiles";
import { machineMarkerHits, projectMarkerHits } from "./scanners/projectMarkers";
import {
  dedupeByRealpath, discoverMachineSitePackages, parsePipfileLock, parseRequirementsLine,
  parseTomlLock, readPyvenvVersion, readSitePackages,
} from "./scanners/pythonEnvs";
import { scanTrustStores } from "./scanners/trustStores";
import { walkRoots, type WalkOptions, type WalkStats } from "./scanners/walk";
import { redactPath } from "./util/redact";
import { forEachLine, isDir, readSmallText, SkipCounter } from "./util/safeFs";

import { SOURCE_LOCKFILE, SOURCE_PIN, SOURCE_SITE_PACKAGES } from "./sources";

export { SOURCE_LOCKFILE, SOURCE_PIN, SOURCE_SITE_PACKAGES };

// Default trust subjects (SPEC 7.3 emudhra-weak-ca-keys).
export const DEFAULT_TRUST_SUBJECTS = ["emSign ECC Root CA - G3"];

export interface ScanOptions {
  roots: string[];
  probe: SystemProbe;
  home?: string;                 // used for redaction and machine Python discovery
  machinePython?: boolean;       // scan %LOCALAPPDATA% Python etc. (off for fixtures)
  trustSubjects?: string[];
  walk?: WalkOptions;
  now?: () => Date;
}

export interface ScanStats extends WalkStats {
  skippedLocked: number;
  skippedOther: number;
  rootsMissing: string[];
  sitePackagesScanned: number;
  envFilesScanned: number;
  envSuspectedFragments: number;
  envUnterminatedQuotes: number;
  notes: string[];
}

export interface ScanResult {
  inventory: Inventory;
  stats: ScanStats;
}

export async function collectInventory(opts: ScanOptions): Promise<ScanResult> {
  const start = Date.now();
  const now = opts.now ?? (() => new Date());
  const home = opts.home ?? os.homedir();
  const probe = opts.probe;
  const red = (p: string) => redactPath(p, home);
  const skips = new SkipCounter();
  const items: InventoryItem[] = [];
  let checks = 0;
  const rootsMissing: string[] = [];
  let envSuspectedFragments = 0;
  let envUnterminatedQuotes = 0;

  const roots: string[] = [];
  for (const r of opts.roots) {
    if (await isDir(r)) roots.push(path.resolve(r));
    else rootsMissing.push(red(path.resolve(r)));
  }

  const walked = await walkRoots(roots, skips, opts.walk);
  const f = walked.files;

  // ---- env key names (8.2.6) ----
  const addEnvKeys = (file: string, r: EnvKeyResult) => {
    checks++;
    skips.note(r.outcome);
    envSuspectedFragments += r.suspectedFragments;
    if (r.unterminatedQuote) envUnterminatedQuotes++;
    for (const key of r.keys) items.push({ kind: "envKey", key, file: red(file) });
  };
  for (const file of f.env) addEnvKeys(file, await readEnvKeys(file));
  for (const file of f.compose) addEnvKeys(file, await readComposeEnvKeys(file));

  // ---- docker images from files (8.2.1, 8.2.2, 8.2.8) ----
  for (const file of f.dockerfile) {
    checks++;
    const r = await readDockerfileImages(file);
    skips.note(r.outcome);
    for (const img of r.images) items.push({ kind: "dockerImage", image: img.image, tag: img.tag, source: `${red(file)}:${img.line}` });
  }
  for (const file of f.compose) {
    checks++;
    const r = await readComposeImages(file);
    skips.note(r.outcome);
    for (const img of r.images) items.push({ kind: "dockerImage", image: img.image, tag: img.tag, source: `${red(file)}:${img.line}` });
  }

  // ---- node version files and engines (8.2.1) ----
  for (const file of f.nodeVersionFile) {
    checks++;
    const r = await readSmallText(file, 4096);
    skips.note(r.outcome);
    const v = r.outcome === "ok" ? parseNodeVersionFile(r.text) : null;
    if (v) items.push({ kind: "runtime", name: "node", version: v, source: `${path.basename(file)}:${red(file)}` });
  }
  for (const file of f.packageJson) {
    checks++;
    const r = await readSmallText(file, 2 * 1024 * 1024);
    skips.note(r.outcome);
    const v = r.outcome === "ok" ? parseEnginesNode(r.text) : null;
    if (v) items.push({ kind: "runtime", name: "node", version: v, source: `package.json#engines.node:${red(file)}` });
  }

  // ---- npm lockfiles (8.2.5) ----
  const lockParsers = [
    [f.npmLock, parseNpmLock], [f.pnpmLock, parsePnpmLock], [f.yarnLock, parseYarnLock],
  ] as const;
  for (const [files, parse] of lockParsers) {
    for (const file of files) {
      checks++;
      const r = await readSmallText(file);
      skips.note(r.outcome);
      if (r.outcome !== "ok") continue;
      for (const p of parse(r.text)) {
        items.push({ kind: "package", ecosystem: "npm", name: p.name, version: p.version, source: `${SOURCE_LOCKFILE}${red(file)}` });
      }
    }
  }

  // ---- python pins (8.2.3) ----
  for (const file of f.pyPins) {
    checks++;
    const base = path.basename(file).toLowerCase();
    if (base.endsWith(".txt")) {
      const outcome = await forEachLine(file, (line, n) => {
        const p = parseRequirementsLine(line);
        if (p) items.push({ kind: "package", ecosystem: "pypi", name: p.name, version: p.version, source: `${SOURCE_PIN}${red(file)}:${n}` });
      });
      skips.note(outcome);
      continue;
    }
    const r = await readSmallText(file);
    skips.note(r.outcome);
    if (r.outcome !== "ok") continue;
    const pins = base === "pipfile.lock" ? parsePipfileLock(r.text) : parseTomlLock(r.text);
    for (const p of pins) {
      items.push({ kind: "package", ecosystem: "pypi", name: p.name, version: p.version, source: `${SOURCE_PIN}${red(file)}${p.line ? `:${p.line}` : ""}` });
    }
  }
  for (const file of f.pyvenvCfg) {
    checks++;
    const r = await readPyvenvVersion(file);
    skips.note(r.outcome);
    if (r.version) items.push({ kind: "runtime", name: "python", version: r.version, source: `pyvenv.cfg:${red(file)}` });
  }

  // ---- site-packages: installed packages + IOC files (8.2.3, 8.2.4) ----
  const platform = await probe.platform();
  const machineSite = opts.machinePython ? await discoverMachineSitePackages(home, platform) : [];
  const sites = await dedupeByRealpath([...walked.sitePackages, ...machineSite]);
  const certifiPems: Array<{ pem: string; label: string }> = [];
  for (const dir of sites) {
    checks += 2;
    const info = await readSitePackages(dir, skips);
    for (const p of info.packages) {
      items.push({ kind: "package", ecosystem: "pypi", name: p.name, version: p.version, source: `${SOURCE_SITE_PACKAGES}${red(dir)}` });
    }
    if (info.certifiPem) certifiPems.push({ pem: info.certifiPem, label: red(dir) });
    for (const hit of await scanIocFiles(dir, skips)) {
      items.push({ kind: "iocFile", filename: hit.filename, dir: red(hit.dir), size: hit.size, sha256: hit.sha256 });
    }
  }

  // ---- machine facts through the probe (8.2.1, 8.2.2, 8.2.8, 8.2.10) ----
  const nodeV = await probe.nodeVersion();
  checks++;
  if (nodeV) items.push({ kind: "runtime", name: "node", version: nodeV, source: "node --version" });
  const phpV = await probe.phpVersion();
  checks++;
  if (phpV) items.push({ kind: "runtime", name: "php", version: phpV, source: "php -v" });
  const plexV = await probe.plexVersion();
  checks++;
  if (plexV) items.push({ kind: "app", name: "plex", version: plexV, source: "Plex Media Server" });
  const gitlabV = await probe.gitlabVersion();
  checks++;
  if (gitlabV) items.push({ kind: "app", name: "gitlab", version: gitlabV, source: "gitlab-rails/VERSION" });
  checks++;
  for (const d of await probe.dockerImages()) {
    const parsedImage = d.repo.replace(/^(docker\.io\/)?(library\/)?/, "").toLowerCase();
    items.push({ kind: "dockerImage", image: parsedImage, tag: d.tag, source: "docker images" });
  }

  // ---- trust stores (8.2.9) ----
  const trust = await scanTrustStores(probe, opts.trustSubjects ?? DEFAULT_TRUST_SUBJECTS, certifiPems);
  checks += trust.checks;
  for (const h of trust.hits) items.push({ kind: "trustAnchor", store: h.store, subject: h.subject, present: h.present });

  // ---- markers (8.2.7) ----
  for (const m of projectMarkerHits(f.railway)) items.push({ kind: "marker", marker: m.marker, path: red(m.path) });
  checks += f.railway.length;
  const machineMarkers = await machineMarkerHits(probe);
  checks += machineMarkers.checks;
  for (const m of machineMarkers.hits) items.push({ kind: "marker", marker: m.marker, path: red(m.path) });

  const probeNotes = "notes" in probe && typeof probe.notes === "function" ? (probe.notes as () => string[])() : [];

  const inventory = Inventory.parse({
    scannedAt: now().toISOString(),
    roots: roots.map(red),
    durationMs: Date.now() - start,
    items,
    checksRun: checks,
  });
  return {
    inventory,
    stats: {
      ...walked.stats,
      skippedLocked: skips.locked,
      skippedOther: skips.error,
      rootsMissing,
      sitePackagesScanned: sites.length,
      envFilesScanned: f.env.length + f.compose.length,
      envSuspectedFragments,
      envUnterminatedQuotes,
      notes: probeNotes,
    },
  };
}
