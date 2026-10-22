// Pure helpers for the eval (importable by tests without running the eval).

// Validator reason strings -> histogram categories (ids and token values stripped).
export function reasonCategory(r: string): string {
  if (/^ungrounded token .* in line1Actions$/.test(r)) return "ungrounded token in line 1";
  if (/^ungrounded token .* in fyi$/.test(r)) return "ungrounded token in FYI";
  if (/^ungrounded token/.test(r)) return "ungrounded token in checklist";
  if (/^hype word/.test(r)) return "hype word";
  if (/must start with "Confirm"/.test(r)) return "possible item not starting with Confirm";
  if (/^digits in line2Tail|^line2Tail mentions/.test(r)) return "line-2 tail with numbers or names";
  if (/^line2Tail over/.test(r)) return "line-2 tail over 60 chars";
  if (/^why over/.test(r)) return "why over 140 chars";
  if (/^action over/.test(r)) return "action over 90 chars";
  if (/^line1 action over/.test(r)) return "line-1 action over 60 chars";
  if (/^fyi line over/.test(r)) return "FYI line over 160 chars";
  if (/^line1Actions has/.test(r)) return "wrong number of line-1 actions";
  if (/^fyi has/.test(r)) return "wrong number of FYI lines";
  if (/^missing finding/.test(r)) return "finding left out";
  if (/^unknown findingId/.test(r)) return "invented finding id";
  if (/^duplicate findingId/.test(r)) return "duplicate finding";
  if (/^FYI finding .* placed/.test(r)) return "FYI item in checklist";
  if (/beyond the/.test(r)) return "item beyond the 7-item checklist";
  if (/not valid JSON/.test(r)) return "invalid JSON";
  if (/does not match the schema/.test(r)) return "schema mismatch";
  if (/model call failed/.test(r)) return "model call failed";
  if (/^empty/.test(r)) return "empty field";
  return "other";
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function p90(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)]!;
}
