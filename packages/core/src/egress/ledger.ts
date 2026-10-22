// Every outbound request TwoToe makes, shown on the card and in brief.meta.egress.

export interface EgressEntry {
  host: string;
  method: string;
  bytesOut: number;
}

export const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export class Ledger {
  private readonly list: EgressEntry[] = [];

  // Returns the stored entry so streaming writers can add bytes as they go.
  record(e: EgressEntry): EgressEntry {
    const entry = { ...e };
    this.list.push(entry);
    return entry;
  }

  entries(): EgressEntry[] {
    return this.list.map((e) => ({ ...e }));
  }

  nonLocal(): EgressEntry[] {
    return this.entries().filter((e) => !LOOPBACK_HOSTS.has(e.host));
  }
}
