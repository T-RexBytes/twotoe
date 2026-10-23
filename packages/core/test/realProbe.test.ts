import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTree, tempDir } from "./helpers";

// RealProbe with the exec layer mocked, so its parsing and branching are
// tested the same way on every machine (the smoke test in scan.test.ts covers
// the real children).
const exec = vi.hoisted(() => ({
  resolveExe: vi.fn<(cmd: string) => Promise<string | null>>(),
  runFile: vi.fn(),
  runPowerShell: vi.fn(),
  whichAll: vi.fn<(cmd: string) => Promise<string[]>>(),
  programFilesDirs: vi.fn<() => string[]>(),
}));
vi.mock("../src/util/exec", () => exec);

const { RealProbe } = await import("../src/probe/RealProbe");

const ok = (stdout: string) => ({ ok: true, stdout, timedOut: false });
const fail = { ok: false, stdout: "", timedOut: true };
const onWindows = process.platform === "win32";

function winProbe(home?: string) {
  const probe = new RealProbe(home ? { home } : {});
  vi.spyOn(probe, "platform").mockResolvedValue("win32");
  return probe;
}

beforeEach(() => {
  vi.resetAllMocks();
  exec.resolveExe.mockImplementation(async (cmd) => `C:\\bin\\${cmd}.exe`);
  exec.programFilesDirs.mockReturnValue([]);
});

describe("RealProbe versions", () => {
  it("reads node and php versions, and returns null when absent or failing", async () => {
    exec.runFile.mockImplementation(async (file: string) => (file.endsWith("node.exe") ? ok("v24.22.1\r\n") : ok("PHP 8.3.12 (cli) (built: Oct 1 2026)")));
    const probe = winProbe();
    expect(await probe.nodeVersion()).toBe("24.22.1");
    expect(await probe.phpVersion()).toBe("8.3.12");
    expect(exec.runFile).toHaveBeenCalledWith("C:\\bin\\php.exe", ["-n", "-v"]);

    exec.runFile.mockResolvedValue(fail);
    expect(await winProbe().nodeVersion()).toBeNull();
    expect(await winProbe().phpVersion()).toBeNull();

    exec.resolveExe.mockResolvedValue(null);
    expect(await winProbe().nodeVersion()).toBeNull();
    expect(await winProbe().phpVersion()).toBeNull();
  });

  it("has no GitLab outside Linux and no Plex when it is not installed", async () => {
    expect(await winProbe().gitlabVersion()).toBeNull();
    exec.programFilesDirs.mockReturnValue([tempDir()]);
    expect(await winProbe().plexVersion()).toBeNull();
    expect(exec.runPowerShell).not.toHaveBeenCalled();
  });

  it.runIf(onWindows)("reads the Plex version from its exe, passing the path only through env", async () => {
    const pf = makeTree(tempDir(), { "Plex/Plex Media Server/Plex Media Server.exe": "" });
    exec.programFilesDirs.mockReturnValue([pf]);
    exec.runPowerShell.mockResolvedValue(ok("1.43.2.9999\r\n"));
    expect(await winProbe().plexVersion()).toBe("1.43.2.9999");
    const [script, env] = exec.runPowerShell.mock.calls[0]!;
    expect(script).not.toContain(pf);
    expect(env).toEqual({ TWOTOE_P: path.join(pf, "Plex", "Plex Media Server", "Plex Media Server.exe") });
  });
});

describe("RealProbe docker", () => {
  it("notes when docker is missing or not running", async () => {
    exec.resolveExe.mockResolvedValue(null);
    const missing = winProbe();
    expect(await missing.dockerImages()).toEqual([]);
    expect(missing.notes()).toEqual(["docker not installed"]);

    exec.resolveExe.mockResolvedValue("C:\\bin\\docker.exe");
    exec.runFile.mockResolvedValue(fail);
    const stopped = winProbe();
    expect(await stopped.dockerImages()).toEqual([]);
    expect(stopped.notes()).toEqual(["docker not running"]);
  });

  it("parses repo:tag lines and skips untagged images", async () => {
    exec.runFile.mockResolvedValue(ok("gitlab/gitlab-ce:19.5.0-ce.0\r\nlocalhost:5000/app:1\n<none>:<none>\nbusybox:<none>\nnotag\n\n"));
    expect(await winProbe().dockerImages()).toEqual([
      { repo: "gitlab/gitlab-ce", tag: "19.5.0-ce.0" },
      { repo: "localhost:5000/app", tag: "1" },
    ]);
  });
});

describe("RealProbe trust stores", () => {
  const S = "emSign ECC Root CA - G3";

  it("maps Windows store hits by exact CN and reads Node's root list", async () => {
    exec.runPowerShell.mockResolvedValue(ok([
      `Microsoft.PowerShell.Security\\Certificate::LocalMachine\\Root|CN=${S}, O=eMudhra Technologies Limited, C=IN`,
      `Microsoft.PowerShell.Security\\Certificate::CurrentUser\\Root|CN=emSign ECC Root CA - G3 Extra, C=IN`,
      `Microsoft.PowerShell.Security\\Certificate::CurrentUser\\Disallowed|CN=${S}`,
      "no bar here",
    ].join("\r\n")));
    exec.runFile.mockResolvedValue(ok(`C=IN, OU=emSign PKI, O=eMudhra Technologies Limited, CN=${S}\nC=US, CN=Other Root\n`));
    const stores = await winProbe().trustStoreHas(S);
    expect(stores).toEqual([
      { store: "windows:LocalMachine\\Root", present: true },
      { store: "windows:CurrentUser\\Root", present: false },
      { store: "windows:LocalMachine\\Disallowed", present: false },
      { store: "windows:CurrentUser\\Disallowed", present: true },
      { store: "node", present: true },
    ]);
    expect(exec.runPowerShell.mock.calls[0]![1]).toEqual({ TWOTOE_S: S });
  });

  it("leaves out stores it could not read", async () => {
    exec.runPowerShell.mockResolvedValue(fail);
    exec.runFile.mockResolvedValue(fail);
    expect(await winProbe().trustStoreHas(S)).toEqual([]);
    exec.resolveExe.mockResolvedValue(null);
    expect(await winProbe().trustStoreHas(S)).toEqual([]);
  });

  it.runIf(onWindows)("checks the Git for Windows bundle when Git is installed", async () => {
    const pf = makeTree(tempDir(), { "Git/mingw64/etc/ssl/certs/ca-bundle.crt": `# ${S}\n-----BEGIN CERTIFICATE-----\n` });
    exec.programFilesDirs.mockReturnValue([tempDir(), pf]);
    exec.runPowerShell.mockResolvedValue(fail);
    exec.runFile.mockResolvedValue(fail);
    expect(await winProbe().trustStoreHas(S)).toEqual([{ store: "git-for-windows", present: true }]);
  });
});

describe("RealProbe commands and home markers", () => {
  it("finds commands through where.exe", async () => {
    exec.whichAll.mockImplementation(async (cmd) => (cmd === "railway" ? ["C:\\npm\\railway.cmd"] : []));
    const probe = winProbe();
    expect(await probe.commandExists("railway")).toBe(true);
    expect(await probe.commandExists("opencode")).toBe(false);
  });

  it("reports marker directories as ~ paths and ignores files with the same name", async () => {
    const home = makeTree(tempDir(), { ".railway/config.json": "{}", ".config/opencode": "a file, not a dir" });
    expect(await winProbe(home).homeMarkers()).toEqual([path.join("~", ".railway")]);
  });
});
