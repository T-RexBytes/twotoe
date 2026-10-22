import { buildFinding, itemsOf, type Matcher } from "../finding";

// Which part of the fix a trust store needs, from its store label.
function storePart(store: string): "node" | "certifi" | "git" | "os" | null {
  if (store === "node") return "node";
  if (store.startsWith("certifi:")) return "certifi";
  if (store === "git-for-windows") return "git";
  if (/^windows:.*\\Root$/i.test(store) || store.startsWith("macos:")) return "os";
  return null;            // e.g. windows:*\Disallowed: present there means blocked
}

const PART_ORDER = ["node", "certifi", "git"] as const;

// A non-browser client that still trusts the distrusted root (Node, certifi,
// Git for Windows curl) is likely. The OS store alone is possible: Microsoft
// and Apple block through their own mechanisms (SPEC 8.2.9, VERIFY).
export const matcher: Matcher = {
  advisoryId: "emudhra-weak-ca-keys",
  match(inv, advisory, config) {
    const p = advisory.check.params as { subjects: string[] };
    const present = itemsOf(inv, "trustAnchor").filter((t) => t.present && p.subjects.includes(t.subject));
    const likelyParts = new Set<string>();
    const likely = [];
    const os = [];
    for (const t of present) {
      const part = storePart(t.store);
      const ev = { detector: "trustStores", location: t.store, detail: `trusts ${t.subject}` };
      if (part === "os") os.push(ev);
      else if (part) { likelyParts.add(part); likely.push(ev); }
    }
    const out = [];
    if (likely.length) {
      const variant = PART_ORDER.filter((x) => likelyParts.has(x)).join("+");
      out.push(buildFinding(advisory, { confidence: "likely", variant, evidence: likely }, config));
    }
    if (os.length) out.push(buildFinding(advisory, { confidence: "possible", variant: "confirmOs", evidence: os }, config));
    return out;
  },
};
