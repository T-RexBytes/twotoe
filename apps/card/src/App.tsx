import { useEffect, useState } from "react";
import type { CardData } from "@twotoe/writer/card";
import { Checklist } from "./components/Checklist";
import { EgressLedger, Footer, Fyi, Header, RunStats, TwoLines } from "./components/parts";
import { EXAMPLES, loadLocal, type Example } from "./data";

type View = { kind: "loading" } | { kind: "local"; data: CardData } | { kind: "example"; slug: string };

function exampleFromHash(): string {
  const h = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
  return EXAMPLES.some((e) => e.slug === h) ? h : EXAMPLES[0]?.slug ?? "";
}

function ExampleSwitcher({ current, onPick }: { current: string; onPick: (slug: string) => void }) {
  return (
    <nav aria-label="Example briefs" className="flex flex-col gap-2 rounded-lg border border-line bg-raised p-3">
      <p className="text-sm text-muted">See an example. Each one is a real TwoToe run on a synthetic fixture.</p>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((e: Example) => (
          <button
            key={e.slug}
            type="button"
            aria-pressed={current === e.slug}
            onClick={() => onPick(e.slug)}
            className={`rounded-full border px-3 py-1.5 text-sm font-bold transition-colors ${
              current === e.slug ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"
            }`}
          >
            {e.name}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function App({ fetchImpl }: { fetchImpl?: typeof fetch } = {}) {
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    loadLocal(fetchImpl).then((data) => {
      if (!alive) return;
      setView(data ? { kind: "local", data } : { kind: "example", slug: exampleFromHash() });
    });
    return () => { alive = false; };
  }, [fetchImpl]);

  const pick = (slug: string) => {
    setView({ kind: "example", slug });
    try { window.history.replaceState(null, "", `#${slug}`); } catch { /* sandboxed */ }
  };

  const data = view.kind === "local" ? view.data : view.kind === "example" ? EXAMPLES.find((e) => e.slug === view.slug)?.data : undefined;

  return (
    <main className="gutter mx-auto flex max-w-[640px] flex-col gap-8 py-8 sm:py-12">
      {view.kind === "example" && <ExampleSwitcher current={view.slug} onPick={pick} />}
      {!data ? (
        <p className="text-muted" role="status">Reading this morning's brief...</p>
      ) : (
        <>
          <Header data={data} />
          <TwoLines brief={data.brief} />
          <Checklist data={data} />
          <Fyi lines={data.brief.fyi} />
          <EgressLedger egress={data.brief.meta.egress} />
          <RunStats data={data} />
          <Footer example={view.kind === "example"} />
        </>
      )}
    </main>
  );
}
