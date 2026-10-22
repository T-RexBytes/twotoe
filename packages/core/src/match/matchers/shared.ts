import type { Advisory, Confidence, Finding, Inventory } from "../../schemas";
import { buildFinding, HitGroups, itemsOf, type MatchConfig } from "../finding";
import { cmpDotted, leadingVersion, lineStatus, lowestFixed } from "../semverUtil";

// Location part of an inventory source like ".nvmrc:~\code\x\.nvmrc".
export function sourcePath(source: string): string {
  const i = source.indexOf(":");
  return i >= 0 ? source.slice(i + 1) : source;
}

function dockerTarget(image: string, names: string[]): boolean {
  return names.includes(image) || names.some((n) => image.endsWith(`/${n}`) && !n.includes("/"));
}

// Node and PHP (SPEC 8.2.1, 8.2.2, 9.3): installed runtime versions, exact
// version pins, and docker base image tags, compared per release line.
export function matchRuntime(inv: Inventory, advisory: Advisory, config: MatchConfig, opts: {
  runtime: "node" | "php";
  belowVariant: "unsupported" | "offline";
  belowConfidence: Confidence;
  belowFixedTarget: string;
}): Finding[] {
  const params = advisory.check.params as { fixed: Record<string, string>; dockerImages?: string[] };
  const fixed = params.fixed;
  const groups = new HitGroups();

  const consider = (version: string, confidence: Confidence, evidence: Finding["evidence"][number]) => {
    const status = lineStatus(version, fixed);
    if (status === "vulnerable") {
      const target = fixed[version.split(".").slice(0, 2).join(".")] ?? fixed[version.split(".")[0]!]!;
      groups.add(`default|${target}`, { confidence, found: version, fixed: target, evidence: [evidence] });
    } else if (status === "belowLines" || status === "gap") {
      groups.add(`${opts.belowVariant}|`, {
        confidence: opts.belowVariant === "offline" ? confidence : opts.belowConfidence,
        found: version, fixed: opts.belowFixedTarget, variant: opts.belowVariant,
        evidence: [{ ...evidence, detail: `${evidence.detail} (line has no fixed release)` }],
      });
    }
  };

  for (const r of itemsOf(inv, "runtime").filter((r) => r.name === opts.runtime)) {
    const lv = leadingVersion(r.version);
    if (!lv || lv.parts < 3) continue;           // "24", "lts/*", ">=18" are not versions
    if (r.source.startsWith(`${opts.runtime} -`) || r.source.startsWith(`${opts.runtime} --`)) {
      consider(lv.version, "definite", { detector: "runtimeVersion", location: r.source, detail: `${opts.runtime} ${lv.version} installed` });
    } else if (r.source.startsWith(".nvmrc:") || r.source.startsWith(".node-version:")) {
      consider(lv.version, "likely", { detector: "nvmrc", location: sourcePath(r.source), detail: `pins ${opts.runtime} ${lv.version}` });
    } else if (r.source.startsWith("package.json#engines.node:") && /^\d+\.\d+\.\d+$/.test(r.version.trim())) {
      consider(lv.version, "likely", { detector: "engines", location: sourcePath(r.source), detail: `engines pins ${opts.runtime} ${lv.version}` });
    }
  }

  const images = params.dockerImages ?? [opts.runtime];
  for (const d of itemsOf(inv, "dockerImage").filter((d) => dockerTarget(d.image, images))) {
    const location = d.source;
    const ref = `${d.image}:${d.tag}`;
    if (d.tag.includes("${")) {
      groups.add(`confirmImage|${d.tag}`, {
        confidence: "possible", found: d.tag, variant: "confirmImage",
        evidence: [{ detector: "dockerTag", location, detail: `FROM ${ref} (version set by a build arg)` }],
      });
      continue;
    }
    const lv = leadingVersion(d.tag);
    if (lv && lv.parts >= 3) {
      consider(lv.version, "definite", { detector: "dockerTag", location, detail: `image ${ref}` });
      continue;
    }
    // Floating tag: "24-alpine", "8.3-apache", "latest", "lts". A rebuild pulls
    // the patched image, unless the line itself is out of support.
    if (lv) {
      const status = lineStatus(lv.version, fixed);
      if (status === "belowLines" || status === "gap") {
        groups.add(`${opts.belowVariant}|`, {
          confidence: opts.belowConfidence, found: lv.version, fixed: opts.belowFixedTarget, variant: opts.belowVariant,
          evidence: [{ detector: "dockerTag", location, detail: `image ${ref} (line has no fixed release)` }],
        });
        continue;
      }
      if (status === "aboveLines") continue;
    }
    groups.add("floating|", {
      confidence: "likely", found: d.tag, variant: "floating",
      evidence: [{ detector: "dockerTag", location, detail: `image ${ref} (floating tag, rebuild to pull the patched image)` }],
    });
  }

  return groups.hits().map((h) => buildFinding(advisory, h, config));
}

// GitLab (SPEC 8.2.8): installed version (Linux) or gitlab/gitlab-ce|ee image tags.
export function matchGitlab(inv: Inventory, advisory: Advisory, config: MatchConfig): Finding[] {
  const params = advisory.check.params as { fixed: Record<string, string>; affectedFrom: string; dockerImages: string[] };
  const groups = new HitGroups();
  const consider = (version: string, confidence: Confidence, evidence: Finding["evidence"][number]) => {
    const status = lineStatus(version, params.fixed);
    if (status === "vulnerable") {
      const target = params.fixed[version.split(".").slice(0, 2).join(".")]!;
      groups.add(`default|${target}`, { confidence, found: version, fixed: target, evidence: [evidence] });
    } else if ((status === "belowLines" || status === "gap") && cmpDotted(version, params.affectedFrom) >= 0) {
      const target = lowestFixed(params.fixed);
      groups.add("noLine|", { confidence, found: version, fixed: target, variant: "noLine", evidence: [evidence] });
    }
  };
  for (const a of itemsOf(inv, "app").filter((a) => a.name === "gitlab")) {
    const lv = leadingVersion(a.version);
    if (lv && lv.parts >= 3) consider(lv.version, "definite", { detector: "appVersion", location: a.source, detail: `GitLab ${lv.version} installed` });
  }
  for (const d of itemsOf(inv, "dockerImage").filter((d) => params.dockerImages.includes(d.image))) {
    const lv = leadingVersion(d.tag);
    const evidence = { detector: "dockerTag", location: d.source, detail: `image ${d.image}:${d.tag}` };
    if (lv && lv.parts >= 3) consider(lv.version, "definite", evidence);
    else groups.add(`confirmImage|${d.tag}`, { confidence: "possible", found: `${d.image}:${d.tag}`, variant: "confirmImage", evidence: [evidence] });
  }
  return groups.hits().map((h) => buildFinding(advisory, h, config));
}
