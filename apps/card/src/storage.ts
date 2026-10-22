// Checklist ticks live only in this browser, keyed by brief date + finding id
// (SPEC 13.2). Storage can be missing or blocked; the card works without it.

export function tickKey(date: string, findingId: string): string {
  return `twotoe:${date}:${findingId}`;
}

export function readTick(date: string, findingId: string): boolean {
  try {
    return window.localStorage.getItem(tickKey(date, findingId)) === "1";
  } catch {
    return false;
  }
}

export function writeTick(date: string, findingId: string, done: boolean): void {
  try {
    if (done) window.localStorage.setItem(tickKey(date, findingId), "1");
    else window.localStorage.removeItem(tickKey(date, findingId));
  } catch {
    // storage blocked: the tick lasts until the page closes
  }
}
