// Small pure helpers shared by the card components.

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-10-23" -> "Friday, October 23" (the date is a calendar day, so no timezone math).
export function longDate(isoDay: string): string {
  const m = isoDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDay;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 100 ? 2 : 1)} s`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const LOCAL = new Set(["127.0.0.1", "localhost", "::1"]);
// The KEV feed carries no user data (SPEC 10.7).
const NO_USER_DATA = new Set(["www.cisa.gov"]);

export function leftTheMachine(egress: Array<{ host: string }>): string[] {
  return [...new Set(egress.map((e) => e.host).filter((h) => !LOCAL.has(h) && !NO_USER_DATA.has(h)))];
}
