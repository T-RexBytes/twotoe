// An original sloth, drawn for TwoToe: a rounded body hanging from a branch by
// its two-toed arms, eyes closed, still asleep. Colors come from theme tokens.
export function Sloth({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="A sleeping sloth hanging from a branch" className="shrink-0">
      <rect x="4" y="9" width="88" height="6" rx="3" fill="var(--branch)" />
      <g className="sloth-sway">
        {/* arms up to the branch */}
        <path d="M30 52 C 26 36, 28 22, 33 14" stroke="var(--fur-shadow)" strokeWidth="9" strokeLinecap="round" fill="none" />
        <path d="M66 52 C 70 36, 68 22, 63 14" stroke="var(--fur-shadow)" strokeWidth="9" strokeLinecap="round" fill="none" />
        {/* two toes on each hand, curled over the branch */}
        <path d="M29 15 c 0 -6, 5 -8, 7 -4" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M33 15 c 0 -6, 5 -8, 7 -4" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M56 11 c 2 -4, 7 -2, 7 4" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M60 11 c 2 -4, 7 -2, 7 4" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        {/* body */}
        <ellipse cx="48" cy="62" rx="24" ry="22" fill="var(--fur)" />
        {/* face */}
        <ellipse cx="48" cy="58" rx="15" ry="12" fill="var(--face)" />
        {/* eye stripes with closed eyes */}
        <path d="M36 56 q 4 -4, 9 0" stroke="var(--fur-shadow)" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M51 56 q 5 -4, 9 0" stroke="var(--fur-shadow)" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M38 57 q 3 2.5, 6 0" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <path d="M52 57 q 3 2.5, 6 0" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        {/* nose and a small content smile */}
        <ellipse cx="48" cy="61.5" rx="2.6" ry="1.8" fill="var(--ink)" />
        <path d="M44.5 65 q 3.5 2.5, 7 0" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}
