import type { Brief } from "@twotoe/core";
import type { CardData } from "@twotoe/writer/card";
import { bytes, leftTheMachine, longDate, seconds } from "../format";
import { Sloth } from "./Sloth";

const MODE_LABEL: Record<Brief["meta"]["mode"], string> = {
  llm: "written by the local model",
  "llm-fallback": "model + template fallback",
  template: "template, no model",
};

export function Header({ data }: { data: CardData }) {
  const m = data.brief.meta;
  return (
    <header className="flex items-center gap-4">
      <Sloth />
      <div className="min-w-0">
        <p className="label">{longDate(data.brief.date)}</p>
        <p className="display text-xl leading-tight">Good morning.</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="font-mono text-ink">{m.model ?? "no model"}</span>
          <span className="rounded-full border border-line px-2 py-0.5 text-xs">{MODE_LABEL[m.mode]}</span>
        </p>
      </div>
    </header>
  );
}

export function TwoLines({ brief }: { brief: Brief }) {
  const calm = brief.line1.startsWith("Nothing");
  return (
    <section aria-label="Today's two lines" className="flex flex-col gap-3">
      <h1 className={`display text-[1.65rem] leading-tight font-semibold sm:text-[2.05rem] ${calm ? "text-moss" : "text-clay"}`}>
        {brief.line1}
      </h1>
      <p className="text-lg text-muted">{brief.line2}</p>
    </section>
  );
}

export function Fyi({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <section aria-labelledby="fyi-h" className="flex flex-col gap-2">
      <h2 id="fyi-h" className="label">For your information</h2>
      <ul className="flex flex-col gap-2 text-muted">
        {lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </section>
  );
}

export function EgressLedger({ egress }: { egress: Brief["meta"]["egress"] }) {
  const left = leftTheMachine(egress);
  return (
    <section aria-labelledby="egress-h" className="flex flex-col gap-2">
      <h2 id="egress-h" className="label">Network ledger</h2>
      <p className={left.length ? "font-semibold text-clay-text" : "font-semibold text-moss-text"}>
        {left.length ? `Data went to ${left.join(", ")}.` : "0 secrets left this machine."}
      </p>
      <div className="overflow-x-auto">
        <table className="tabular w-full border-collapse text-sm">
          <caption className="sr-only">Every outbound request during this run</caption>
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th scope="col" className="py-1 pr-4 font-normal">Host</th>
              <th scope="col" className="py-1 pr-4 font-normal">Method</th>
              <th scope="col" className="py-1 text-right font-normal">Bytes out</th>
            </tr>
          </thead>
          <tbody>
            {egress.length === 0 ? (
              <tr><td colSpan={3} className="py-2 text-muted">No network requests at all.</td></tr>
            ) : egress.map((e, i) => (
              <tr key={`${e.host}-${i}`} className="border-b border-line last:border-0">
                <td className="py-1 pr-4 font-mono">{e.host}</td>
                <td className="py-1 pr-4">{e.method}</td>
                <td className="py-1 text-right">{bytes(e.bytesOut)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">Loopback is the local model on this machine. Anything else would be listed by name.</p>
    </section>
  );
}

export function RunStats({ data }: { data: CardData }) {
  const m = data.brief.meta;
  const modelMs = data.attempts.reduce((s, a) => s + a.wallMs, 0);
  const rejections = m.validatorRejections;
  const rows: Array<[string, string]> = [
    ["Checks run", data.checksRun === null ? "not recorded" : String(data.checksRun)],
    ["Whole run", seconds(m.durationMs)],
    ["Model time", data.attempts.length ? `${seconds(modelMs)} over ${data.attempts.length} attempt${data.attempts.length === 1 ? "" : "s"}` : "no model call"],
    ["Validator", rejections.length ? `${rejections.length} rejection${rejections.length === 1 ? "" : "s"}` : m.mode === "template" ? "not needed" : "0 rejections"],
  ];
  return (
    <section aria-labelledby="run-h" className="flex flex-col gap-2">
      <h2 id="run-h" className="label">This run</h2>
      <dl className="tabular grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="m-0">{v}</dd>
          </div>
        ))}
      </dl>
      {rejections.length > 0 && (
        <details className="text-sm">
          <summary className="text-muted"><span className="chevron" aria-hidden="true">›</span> What the validator rejected</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 font-mono text-xs break-words">
            {rejections.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

export function Footer({ example }: { example: boolean }) {
  return (
    <footer className="flex flex-col gap-1 border-t border-line pt-4 text-sm text-muted">
      <p>TwoToe can be wrong. Every item links to the vendor.</p>
      {example && <p>These are example briefs from synthetic fixtures. Nothing here came from a real machine.</p>}
      <p>
        <a className="underline decoration-line underline-offset-4 hover:decoration-clay" href="https://github.com/T-RexBytes/twotoe">Source on GitHub</a>
      </p>
    </footer>
  );
}
