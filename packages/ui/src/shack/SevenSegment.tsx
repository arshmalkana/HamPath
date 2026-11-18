// Segments: a top, b upper-right, c lower-right, d bottom, e lower-left, f upper-left, g middle
const GLYPHS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  " ": "",
  A: "abcefg",
  b: "cdefg",
  C: "adef",
  d: "bcdeg",
  E: "adefg",
  F: "aefg",
  H: "bcefg",
  L: "def",
  P: "abefg",
};
const SEG: Record<string, string> = {
  a: "M4 2 h16 l-3 3 h-10 z",
  b: "M21 3 v16 l-3 -2 v-11 z",
  c: "M21 21 v16 l-3 -3 v-11 z",
  d: "M4 38 h16 l-3 -3 h-10 z",
  e: "M3 21 v16 l3 -3 v-11 z",
  f: "M3 3 v16 l3 -2 v-11 z",
  g: "M4 20 l3 -2 h10 l3 2 l-3 2 h-10 z",
};

export interface SevenSegmentProps {
  /** Text to show: digits, '-', ' ', a few letters; '.' lights the previous digit's point. */
  value: string;
  label: string;
  /** Pad on the left to this many digits. */
  digits?: number;
}

/** Seven-segment display (frequency readouts). The whole value is the accessible name. */
export function SevenSegment({ value, label, digits }: SevenSegmentProps) {
  const cells: { ch: string; dot: boolean }[] = [];
  for (const ch of value) {
    if (ch === "." && cells.length) cells[cells.length - 1]!.dot = true;
    else cells.push({ ch, dot: false });
  }
  while (digits && cells.length < digits) cells.unshift({ ch: " ", dot: false });
  const w = 28;
  return (
    <span className="seg" role="img" aria-label={`${label}: ${value.trim()}`}>
      <svg viewBox={`0 0 ${cells.length * w} 42`} aria-hidden="true">
        {cells.map((c, i) => {
          const on = GLYPHS[c.ch] ?? "";
          return (
            <g key={i} transform={`translate(${i * w} 1)`}>
              {Object.entries(SEG).map(([k, d]) => (
                <path key={k} d={d} className={on.includes(k) ? "seg-on" : "seg-off"} />
              ))}
              <circle cx="25" cy="37" r="2" className={c.dot ? "seg-on" : "seg-off"} />
            </g>
          );
        })}
      </svg>
    </span>
  );
}

/** "14074000" Hz → "14.074.00" (MHz.kHz.10 Hz), the usual transceiver dial format. */
export function formatDial(hz: number): string {
  const tens = Math.round(hz / 10);
  const mhz = Math.floor(tens / 100000);
  const khz = Math.floor((tens % 100000) / 100);
  const rest = tens % 100;
  return `${mhz}.${String(khz).padStart(3, "0")}.${String(rest).padStart(2, "0")}`;
}
