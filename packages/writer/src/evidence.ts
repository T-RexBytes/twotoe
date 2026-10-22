import type { Finding } from "@twotoe/core";

function base(location: string): string {
  const parts = location.replace(/:\d+$/, "").split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? location;
}

// "~\code\x\.venv\Lib\site-packages" -> ".venv"
function envLabel(location: string): string {
  const parts = location.split(/[\\/]/).filter(Boolean);
  const i = parts.findIndex((p) => p.toLowerCase() === "site-packages");
  if (i < 0) return base(location);
  const libAt = parts.slice(0, i).map((p) => p.toLowerCase()).lastIndexOf("lib");
  return parts[(libAt > 0 ? libAt : i) - 1] ?? "site-packages";
}

function label(e: Finding["evidence"][number]): string {
  switch (e.detector) {
    case "envKeys": return `${base(e.location)} (${e.detail})`;
    case "railwayMarkers": return e.detail === "railway CLI on PATH" ? "railway on PATH" : base(e.location);
    case "opencodePresence": return e.detail === "opencode on PATH" ? "opencode on PATH" : e.location;
    case "pypiExactVersion": return envLabel(e.location);
    case "iocFiles": return `${e.detail.split(" ")[0]} in ${envLabel(e.location)}`;
    case "trustStores": return e.location.startsWith("certifi:") ? `certifi in ${envLabel(e.location.slice(8))}` : `${e.location} store`;
    case "runtimeVersion":
    case "appVersion":
    case "region": return e.location === "config" ? e.detail : e.location;
    default: return base(e.location);
  }
}

// Short "where it was found" text for the terminal checklist and the card.
export function evidenceSummary(finding: Finding, max = 48): string {
  const labels = [...new Set(finding.evidence.map(label))];
  let out = "";
  for (let i = 0; i < labels.length; i++) {
    const next = out ? `${out}, ${labels[i]}` : labels[i]!;
    const rest = labels.length - i - 1;
    if (next.length + (rest ? ` +${rest}`.length : 0) > max && out) return `${out} +${labels.length - i}`;
    out = next;
  }
  return out;
}
