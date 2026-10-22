import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { programFilesDirs, resolveExe, runFile, runPowerShell, whichAll } from "../util/exec";
import { redactPath } from "../util/redact";
import { forEachLine } from "../util/safeFs";
import {
  HOME_MARKER_DIRS, normalizeVersion, parsePhpVersion, subjectHasCN,
  type ProbeNotes, type SystemProbe,
} from "./SystemProbe";

// Prints one subject per line from the user's Node root store. Runs only Node
// core code, from an empty cwd, with an empty env (no NODE_OPTIONS).
const NODE_ROOTS_SCRIPT =
  "const{X509Certificate}=require('node:crypto');" +
  "for(const p of require('node:tls').rootCertificates){" +
  "try{console.log(new X509Certificate(p).subject.split('\\n').join(', '))}catch{}}";

const WIN_STORES_SCRIPT =
  "Get-ChildItem Cert:\\LocalMachine\\Root, Cert:\\CurrentUser\\Root, " +
  "Cert:\\LocalMachine\\Disallowed, Cert:\\CurrentUser\\Disallowed " +
  "| Where-Object { $_.Subject -like ('*' + $env:TWOTOE_S + '*') } " +
  "| ForEach-Object { $_.PSParentPath + '|' + $_.Subject }";

const WIN_STORE_NAMES = [
  "LocalMachine\\Root", "CurrentUser\\Root", "LocalMachine\\Disallowed", "CurrentUser\\Disallowed",
];

// Windows first (SPEC 8.1). macOS and Linux branches are minimal for now.
export class RealProbe implements SystemProbe, ProbeNotes {
  private readonly home: string;
  private readonly noteList: string[] = [];
  private nodeExe: Promise<string | null> | undefined;
  private nodeRoots: Promise<string[] | null> | undefined;

  constructor(opts: { home?: string } = {}) {
    this.home = opts.home ?? os.homedir();
  }

  notes(): string[] {
    return [...this.noteList];
  }

  async platform(): Promise<"win32" | "darwin" | "linux" | "other"> {
    const p = process.platform;
    return p === "win32" || p === "darwin" || p === "linux" ? p : "other";
  }

  private userNode(): Promise<string | null> {
    this.nodeExe ??= resolveExe("node");
    return this.nodeExe;
  }

  async nodeVersion(): Promise<string | null> {
    const exe = await this.userNode();
    if (!exe) return null;
    const r = await runFile(exe, ["--version"]);
    return r.ok ? normalizeVersion(r.stdout) : null;
  }

  async phpVersion(): Promise<string | null> {
    const exe = await resolveExe("php");
    if (!exe) return null;
    // -n: no php.ini, so no auto_prepend_file or extensions get loaded.
    const r = await runFile(exe, ["-n", "-v"]);
    return r.ok ? parsePhpVersion(r.stdout) : null;
  }

  async plexVersion(): Promise<string | null> {
    const platform = await this.platform();
    if (platform === "win32") {
      for (const pf of programFilesDirs()) {
        const exe = path.win32.join(pf, "Plex", "Plex Media Server", "Plex Media Server.exe");
        if (!fs.existsSync(exe)) continue;
        const r = await runPowerShell("(Get-Item $env:TWOTOE_P).VersionInfo.ProductVersion", { TWOTOE_P: exe });
        const v = r.ok ? normalizeVersion(r.stdout) : null;
        if (v) return v;
      }
      return null;
    }
    if (platform === "darwin") {
      const plist = "/Applications/Plex Media Server.app/Contents/Info.plist";
      if (!fs.existsSync(plist)) return null;
      const r = await runFile("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", plist]);
      return r.ok ? normalizeVersion(r.stdout) : null;
    }
    if (platform === "linux") {
      const r = await runFile("/usr/bin/dpkg-query", ["-W", "-f=${Version}", "plexmediaserver"]);
      return r.ok ? normalizeVersion(r.stdout) : null;
    }
    return null;
  }

  async gitlabVersion(): Promise<string | null> {
    // No native Windows GitLab exists; on Windows only docker tags count.
    if ((await this.platform()) !== "linux") return null;
    let version: string | null = null;
    await forEachLine("/opt/gitlab/embedded/service/gitlab-rails/VERSION", (line) => {
      version = normalizeVersion(line);
      return false;
    });
    return version;
  }

  async dockerImages(): Promise<Array<{ repo: string; tag: string }>> {
    const exe = await resolveExe("docker");
    if (!exe) {
      this.noteList.push("docker not installed");
      return [];
    }
    const r = await runFile(exe, ["images", "--format", "{{.Repository}}:{{.Tag}}"], { timeoutMs: 3000 });
    if (!r.ok) {
      this.noteList.push("docker not running");
      return [];
    }
    const out: Array<{ repo: string; tag: string }> = [];
    for (const line of r.stdout.split(/\r?\n/)) {
      const t = line.trim();
      const i = t.lastIndexOf(":");
      if (i <= 0) continue;
      const repo = t.slice(0, i);
      const tag = t.slice(i + 1);
      if (repo === "<none>" || tag === "<none>") continue;
      out.push({ repo, tag });
    }
    return out;
  }

  private userNodeRoots(): Promise<string[] | null> {
    this.nodeRoots ??= (async () => {
      const exe = await this.userNode();
      if (!exe) return null;
      const r = await runFile(exe, ["-e", NODE_ROOTS_SCRIPT]);
      return r.ok ? r.stdout.split(/\r?\n/).filter(Boolean) : null;
    })();
    return this.nodeRoots;
  }

  async trustStoreHas(subject: string): Promise<Array<{ store: string; present: boolean }>> {
    const out: Array<{ store: string; present: boolean }> = [];
    const platform = await this.platform();

    if (platform === "win32") {
      const r = await runPowerShell(WIN_STORES_SCRIPT, { TWOTOE_S: subject });
      if (r.ok) {
        const hits = new Set<string>();
        for (const line of r.stdout.split(/\r?\n/)) {
          const bar = line.indexOf("|");
          if (bar < 0) continue;
          const parent = line.slice(0, bar);
          if (!subjectHasCN(line.slice(bar + 1), subject)) continue;
          const store = WIN_STORE_NAMES.find((s) => parent.toLowerCase().endsWith(s.toLowerCase()));
          if (store) hits.add(store);
        }
        for (const s of WIN_STORE_NAMES) out.push({ store: `windows:${s}`, present: hits.has(s) });
      }
      // Git for Windows ships its own bundle; Git Bash curl trusts it.
      for (const pf of programFilesDirs()) {
        const bundle = path.win32.join(pf, "Git", "mingw64", "etc", "ssl", "certs", "ca-bundle.crt");
        if (!fs.existsSync(bundle)) continue;
        out.push({ store: "git-for-windows", present: await pemBundleHas(bundle, subject) });
        break;
      }
    } else if (platform === "darwin") {
      const r = await runFile("/usr/bin/security", [
        "find-certificate", "-a", "-c", subject, "/System/Library/Keychains/SystemRootCertificates.keychain",
      ]);
      out.push({ store: "macos:SystemRoots", present: r.ok && r.stdout.includes(subject) });
      if (fs.existsSync("/etc/ssl/cert.pem")) {
        out.push({ store: "macos:/etc/ssl/cert.pem", present: await pemBundleHas("/etc/ssl/cert.pem", subject) });
      }
    }

    const roots = await this.userNodeRoots();
    if (roots) out.push({ store: "node", present: roots.some((s) => subjectHasCN(s, subject)) });
    return out;
  }

  async commandExists(cmd: string): Promise<boolean> {
    // where.exe also finds .cmd shims (railway, opencode via npm).
    return (await whichAll(cmd)).length > 0;
  }

  async homeMarkers(): Promise<string[]> {
    const out: string[] = [];
    for (const rel of HOME_MARKER_DIRS) {
      const abs = path.join(this.home, ...rel.split("/"));
      try {
        if ((await fs.promises.stat(abs)).isDirectory()) out.push(redactPath(abs, this.home));
      } catch {
        // absent
      }
    }
    return out;
  }
}

// Text search in a PEM bundle for a certificate by name. Matches mk-ca-bundle
// headings ("emSign ECC Root CA - G3" on its own line), p11-kit headings as
// shipped by Git for Windows ("# emSign ECC Root CA - G3"), certifi labels
// ('# Label: "..."'), and "# Subject: CN=..." comments.
export async function pemBundleHas(file: string, subject: string): Promise<boolean> {
  let found = false;
  const label = `# Label: "${subject}"`;
  await forEachLine(file, (line) => {
    const t = line.trim();
    if (t === subject || t === `# ${subject}` || t === label) found = true;
    else if (t.startsWith("# Subject:") || t.startsWith("# Issuer:")) {
      const i = t.indexOf(`CN=${subject}`);
      if (i >= 0) {
        const after = t.charAt(i + 3 + subject.length);
        if (after === "" || after === " " || after === ",") found = true;
      }
    }
    return !found;
  });
  return found;
}
