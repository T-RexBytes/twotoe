import { useState } from "react";
import type { Finding } from "@twotoe/core";
import type { CardAdvisory, CardData } from "@twotoe/writer/card";
import { evidenceSummary } from "@twotoe/writer/evidence";
import { hostOf } from "../format";
import { readTick, writeTick } from "../storage";

const CHIP: Record<Finding["confidence"], { cls: string; hint: string }> = {
  definite: { cls: "bg-clay-text text-on-accent", hint: "matched exactly" },
  likely: { cls: "bg-amber text-on-amber", hint: "strong signal" },
  possible: { cls: "border border-moss-text text-moss-text", hint: "please confirm" },
  fyi: { cls: "border border-line text-muted", hint: "awareness only" },
};

const DETECTOR: Record<string, string> = {
  runtimeVersion: "installed runtime",
  nvmrc: "version file",
  engines: "package.json engines",
  dockerTag: "Docker image",
  pypiExactVersion: "installed package",
  pypiPin: "pinned version",
  iocFiles: "indicator file",
  envKeys: "env key name",
  railwayMarkers: "Railway marker",
  opencodePresence: "OpenCode presence",
  appVersion: "installed app",
  trustStores: "trust store",
  region: "region",
  kevProductMatch: "CISA KEV match",
};

function Chip({ confidence }: { confidence: Finding["confidence"] }) {
  const c = CHIP[confidence];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${c.cls}`}>
      {confidence}<span className="sr-only">: {c.hint}</span>
    </span>
  );
}

function Item({ n, date, item, finding, advisory }: {
  n: number;
  date: string;
  item: CardData["brief"]["checklist"][number];
  finding: Finding | undefined;
  advisory: CardAdvisory | undefined;
}) {
  const [done, setDone] = useState(() => readTick(date, item.findingId));
  const id = `item-${n}`;
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3 border-t border-line pt-4">
      <input
        id={id}
        type="checkbox"
        className="mt-1.5 h-5 w-5"
        checked={done}
        onChange={(e) => { setDone(e.target.checked); writeTick(date, item.findingId, e.target.checked); }}
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <label htmlFor={id} className={`text-[1.05rem] font-bold ${done ? "text-muted line-through" : ""}`}>{item.action}</label>
          {finding && <Chip confidence={finding.confidence} />}
        </div>
        <p className="text-muted">{item.why}</p>
        {finding && (
          <details className="text-sm">
            <summary className="text-muted">
              <span className="chevron" aria-hidden="true">›</span> Where: <span className="font-mono">{evidenceSummary(finding)}</span>
            </summary>
            <div className="mt-2 flex flex-col gap-3 rounded-md border border-line bg-raised p-3">
              <ul className="flex flex-col gap-2">
                {finding.evidence.map((e, i) => (
                  <li key={`${e.location}-${i}`} className="flex flex-col">
                    <span className="label">{DETECTOR[e.detector] ?? e.detector}</span>
                    <span className="font-mono text-xs break-all">{e.location}</span>
                    <span className="text-muted">{e.detail}</span>
                  </li>
                ))}
              </ul>
              {advisory && (
                <p className="flex flex-col gap-1">
                  {advisory.sourceUrls.map((u) => (
                    <a key={u} className="underline decoration-line underline-offset-4 hover:decoration-clay" href={u} target="_blank" rel="noopener noreferrer">
                      Vendor advisory: {hostOf(u)}<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ))}
                  <span className="text-xs text-muted">{advisory.title}. Source checked {advisory.verifiedAt}.</span>
                </p>
              )}
            </div>
          </details>
        )}
      </div>
    </li>
  );
}

export function Checklist({ data }: { data: CardData }) {
  const findings = new Map(data.findings.map((f) => [f.id, f]));
  const advisories = new Map(data.advisories.map((a) => [a.id, a]));
  if (!data.brief.checklist.length) {
    return (
      <section aria-labelledby="check-h" className="flex flex-col gap-2">
        <h2 id="check-h" className="label">Checklist</h2>
        <p className="text-muted">Empty. Nothing on this machine matched this week's advisories.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="check-h" className="flex flex-col gap-2">
      <h2 id="check-h" className="label">Checklist, most urgent first</h2>
      <ol className="flex flex-col gap-4">
        {data.brief.checklist.map((item, i) => {
          const f = findings.get(item.findingId);
          return (
            <Item
              key={`${data.brief.date}-${item.findingId}`}
              n={i + 1}
              date={data.brief.date}
              item={item}
              finding={f}
              advisory={f ? advisories.get(f.advisoryId) : undefined}
            />
          );
        })}
      </ol>
    </section>
  );
}
