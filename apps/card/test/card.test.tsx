import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { EXAMPLES } from "../src/data";
import { longDate } from "../src/format";
import { tickKey } from "../src/storage";

const notFound: typeof fetch = async () => new Response("no", { status: 404 });
const localFetch = (body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

async function renderExample(slug: string) {
  window.location.hash = `#${slug}`;
  const view = render(<App fetchImpl={notFound} />);
  await screen.findByRole("heading", { level: 1 });
  return view;
}

describe("bundled examples", () => {
  it("has the three fixture briefs in order", () => {
    expect(EXAMPLES.map((e) => e.slug)).toEqual(["f22", "f06", "f23"]);
  });

  it("contain no real paths and no canary", () => {
    const dir = path.join(__dirname, "..", "src", "example");
    for (const f of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      expect(text).not.toContain("TWOTOE_CANARY_9f3a");
      expect(text).not.toMatch(/AppData|[A-Za-z]:\\\\Users|\/home\/|\/Users\//i);
      expect(text).toMatch(/~\\\\code\\\\|"evidence": \[\]|"findings": \[\]/);
    }
  });
});

describe.each(EXAMPLES.map((e) => [e.slug, e] as const))("card renders example %s", (slug, example) => {
  it("shows the two lines, the checklist, the ledger and the run", async () => {
    await renderExample(slug);
    const b = example.data.brief;
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(b.line1);
    expect(screen.getByText(b.line2)).toBeTruthy();
    expect(screen.getByText(longDate(b.date))).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(b.checklist.length);
    for (const item of b.checklist) expect(screen.getByLabelText(item.action)).toBeTruthy();
    expect(screen.getByText("0 secrets left this machine.")).toBeTruthy();
    expect(screen.getByRole("button", { name: EXAMPLES.find((e) => e.slug === slug)!.name }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Nothing here came from a real machine/)).toBeTruthy();
  });

  it("has no axe violations (contrast is checked in a real browser by Lighthouse)", async () => {
    const { container } = await renderExample(slug);
    for (const d of container.querySelectorAll("details")) d.open = true;
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});

describe("checklist", () => {
  it("remembers a tick per brief date and finding, across reloads", async () => {
    const view = await renderExample("f22");
    const first = EXAMPLES[0]!.data.brief.checklist[0]!;
    const box = screen.getByLabelText(first.action) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await userEvent.click(box);
    expect(window.localStorage.getItem(tickKey(EXAMPLES[0]!.data.brief.date, first.findingId))).toBe("1");
    view.unmount();
    await renderExample("f22");
    expect((screen.getByLabelText(first.action) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByLabelText(first.action));
    expect(window.localStorage.getItem(tickKey(EXAMPLES[0]!.data.brief.date, first.findingId))).toBeNull();
  });

  it("shows evidence and vendor links for each item", async () => {
    await renderExample("f06");
    const item = screen.getAllByRole("checkbox")[0]!.closest("li")! as HTMLElement;
    const links = within(item).getAllByRole("link", { hidden: true });
    expect(links.every((a) => a.getAttribute("rel") === "noopener noreferrer" && a.getAttribute("target") === "_blank")).toBe(true);
    expect(within(item).getByText("Vendor advisory: blog.railway.com", { exact: false })).toBeTruthy();
    expect(within(item).getByText("~\\code\\side-hustle-api\\.env", { exact: false })).toBeTruthy();
  });

  it("works when storage is blocked", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); }, configurable: true });
    try {
      await renderExample("f22");
      const box = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
      await userEvent.click(box);
      expect(box.checked).toBe(true);
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});

describe("modes", () => {
  it("switches between examples", async () => {
    await renderExample("f22");
    await userEvent.click(screen.getByRole("button", { name: "Clean night" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Nothing needs you today.");
    expect(screen.getByText(/Empty\. Nothing on this machine matched/)).toBeTruthy();
    expect(window.location.hash).toBe("#f23");
  });

  it("local mode: shows the served brief and no example switcher", async () => {
    const local = { ...EXAMPLES[1]!.data, source: "local", label: "Your brief" };
    render(<App fetchImpl={localFetch(local)} />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(local.brief.line1));
    expect(screen.queryByRole("navigation", { name: "Example briefs" })).toBeNull();
    expect(screen.queryByText(/Nothing here came from a real machine/)).toBeNull();
  });

  it("falls back to examples when brief.json is not a brief", async () => {
    render(<App fetchImpl={localFetch({ hello: "world" })} />);
    expect(await screen.findByRole("navigation", { name: "Example briefs" })).toBeTruthy();
  });

  it("names what left the machine when the ledger has a non-local host", async () => {
    const d = structuredClone(EXAMPLES[0]!.data);
    d.brief.meta.egress.push({ host: "o1.ingest.sentry.io", method: "POST", bytesOut: 2048 });
    render(<App fetchImpl={localFetch(d)} />);
    expect(await screen.findByText("Data went to o1.ingest.sentry.io.")).toBeTruthy();
  });
});
