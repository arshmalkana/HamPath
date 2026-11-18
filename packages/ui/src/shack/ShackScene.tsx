import { worldPaths } from "./worldGeometry";

export interface ShackBand {
  label: string;
  /** 0..100 */
  percent: number;
}

export interface ShackSceneProps {
  /** Time on the clock and the map's grey line. */
  now: Date;
  /** Readiness 0..100, or null until there is enough data (the meter rests at zero and says so). */
  readiness: number | null;
  /** One row per section on the "band conditions" board: the learner's mastery. */
  bands: ShackBand[];
}

// Seven-segment glyphs for the transceiver display (same geometry as SevenSegment).
const SEG: Record<string, string> = {
  a: "M4 2 h16 l-3 3 h-10 z",
  b: "M21 3 v16 l-3 -2 v-11 z",
  c: "M21 21 v16 l-3 -3 v-11 z",
  d: "M4 38 h16 l-3 -3 h-10 z",
  e: "M3 21 v16 l3 -3 v-11 z",
  f: "M3 3 v16 l3 -2 v-11 z",
  g: "M4 20 l3 -2 h10 l3 2 l-3 2 h-10 z",
};
const DIGIT: Record<string, string> = {
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
};

function Digits({ text, x, y, scale }: { text: string; x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {[...text].map((ch, i) => {
        if (ch === ":") {
          return (
            <g key={i} transform={`translate(${i * 26 + 2} 0)`}>
              <circle cx="4" cy="13" r="2.2" className="scene-seg-on" />
              <circle cx="4" cy="27" r="2.2" className="scene-seg-on" />
            </g>
          );
        }
        const on = DIGIT[ch] ?? "";
        return (
          <g key={i} transform={`translate(${i * 26} 0)`}>
            {Object.entries(SEG).map(([k, d]) => (
              <path key={k} d={d} className={on.includes(k) ? "scene-seg-on" : "scene-seg-off"} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/**
 * The virtual shack (SPEC §1): a station desk with a transceiver, power supply, microphone and
 * Morse key, a wall map with today's grey line, a "band conditions" board, and the antenna farm
 * through the window. Every reading in the scene is real: the clock is UTC, the transceiver's
 * meter is the learner's readiness, and the board shows mastery per section.
 */
export function ShackScene({ now, readiness, bands }: ShackSceneProps) {
  const map = worldPaths(292, 146, now);
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const needle = -50 + ((readiness ?? 0) / 100) * 100;
  const label =
    `Your shack. Clock: ${hh}:${mm} UTC. ` +
    (readiness === null
      ? "Readiness meter at rest until you have taken three mock exams. "
      : `Readiness meter: ${readiness}%. `) +
    `Band conditions board, your mastery by section: ${bands.map((b) => `${b.label} ${Math.round(b.percent)}%`).join(", ")}. ` +
    "Wall map shows today's grey line.";

  return (
    <svg className="scene" viewBox="0 0 960 400" role="img" aria-label={label}>
      <defs>
        <linearGradient id="scene-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="scene-sky-top" />
          <stop offset="1" className="scene-sky-low" />
        </linearGradient>
        <linearGradient id="scene-desk-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="scene-wood-light" />
          <stop offset="1" className="scene-wood" />
        </linearGradient>
        <clipPath id="scene-window">
          <rect x="672" y="34" width="248" height="186" rx="4" />
        </clipPath>
        <clipPath id="scene-map">
          <rect x="0" y="0" width="292" height="146" />
        </clipPath>
      </defs>

      {/* Wall */}
      <rect width="960" height="400" className="scene-wall" />
      <rect y="250" width="960" height="4" className="scene-wall-trim" />

      {/* Window with the antenna farm */}
      <rect x="662" y="24" width="268" height="206" rx="8" className="scene-frame" />
      <g clipPath="url(#scene-window)">
        <rect x="672" y="34" width="248" height="186" fill="url(#scene-sky)" />
        <circle cx="712" cy="196" r="20" className="scene-sun" />
        <path d="M672 200 Q720 178 770 192 T870 186 T920 196 V220 H672 Z" className="scene-hill" />
        {/* Lattice tower with a three-element Yagi */}
        <g className="scene-silhouette-line">
          <path d="M812 214 L826 82 L840 214" />
          {[200, 182, 164, 146, 128, 110, 94].map((y, i) => {
            const half = 14 - ((214 - y) / 132) * 7;
            return (
              <path
                key={y}
                d={`M${826 - half} ${y} L${826 + half} ${y - 14} ${i % 2 ? `M${826 + half} ${y} L${826 - half} ${y - 14}` : ""}`}
              />
            );
          })}
          <path d="M826 82 V64" />
          <path d="M790 66 H862" strokeWidth="3" />
          <path d="M796 56 V76 M826 54 V78 M856 58 V74" />
        </g>
        {/* Wire dipole off the tower */}
        <path d="M826 96 Q870 120 916 104" className="scene-wire" />
        <path d="M826 96 Q780 124 690 112" className="scene-wire" />
        <circle cx="690" cy="112" r="2.5" className="scene-insulator" />
        <circle cx="916" cy="104" r="2.5" className="scene-insulator" />
      </g>
      <path d="M796 24 V230 M662 128 H930" className="scene-mullion" />

      {/* Wall map with today's grey line */}
      <rect x="34" y="16" width="350" height="166" rx="6" className="scene-frame" />
      <g transform="translate(63 26)" clipPath="url(#scene-map)">
        <rect width="292" height="146" className="worldmap-sea" />
        <path d={map.grid} className="worldmap-grid" />
        <path d={map.land} className="worldmap-land" />
        <path d={map.night} className="worldmap-night" />
        <path d={map.night} className="worldmap-grey" />
      </g>

      {/* Band conditions board: the learner's mastery per section */}
      <rect x="404" y="16" width="238" height="166" rx="6" className="scene-board" />
      <text x="418" y="38" className="scene-board-title">
        Band conditions
      </text>
      <text x="418" y="53" className="scene-board-sub">
        your mastery by section
      </text>
      {bands.slice(0, 8).map((b, i) => {
        const y = 62 + i * 13.5;
        return (
          <g key={b.label}>
            <text x="418" y={y + 9} className="scene-board-label">
              {b.label}
            </text>
            <rect x="500" y={y} width="96" height="10" rx="2" className="scene-board-track" />
            <rect
              x="500"
              y={y}
              width={Math.max(0, Math.min(96, (b.percent / 100) * 96))}
              height="10"
              rx="2"
              className="scene-board-fill"
            />
            <text x="630" y={y + 9} textAnchor="end" className="scene-board-value">
              {Math.round(b.percent)}%
            </text>
          </g>
        );
      })}

      {/* Desk */}
      <path d="M0 300 L40 262 H920 L960 300 Z" fill="url(#scene-desk-top)" />
      <rect y="300" width="960" height="16" className="scene-wood-edge" />
      <rect y="316" width="960" height="84" className="scene-desk-front" />

      {/* Coax up to the window */}
      <path d="M606 200 C 630 200, 648 214, 668 216" className="scene-coax" />

      {/* Power supply */}
      <rect x="120" y="212" width="170" height="80" rx="6" className="scene-case" />
      <rect x="132" y="224" width="70" height="42" rx="3" className="scene-meter-face" />
      <path d="M140 258 A30 30 0 0 1 194 258" className="scene-meter-arc" />
      <line x1="167" y1="262" x2="180" y2="236" className="scene-needle" />
      <text x="214" y="246" className="scene-case-text">
        13.8 V
      </text>
      <circle cx="262" cy="270" r="9" className="scene-knob" />
      <circle cx="226" cy="274" r="4" className="scene-lamp" />

      {/* Transceiver */}
      <rect x="316" y="190" width="300" height="102" rx="8" className="scene-case" />
      <rect x="328" y="202" width="96" height="58" rx="4" className="scene-meter-face" />
      <path d="M340 252 A36 36 0 0 1 412 252" className="scene-meter-arc" />
      <g transform="translate(376 256)">
        <line x1="0" y1="0" x2="0" y2="-38" className="scene-needle" style={{ transform: `rotate(${needle}deg)` }} />
      </g>
      <circle cx="376" cy="256" r="3.5" className="scene-hub" />
      <text x="336" y="214" className="scene-meter-text">
        ready
      </text>
      <rect x="434" y="202" width="116" height="40" rx="4" className="scene-display" />
      <Digits text={`${hh}:${mm}`} x={446} y={208} scale={0.72} />
      <text x="436" y="256" className="scene-case-text">
        UTC
      </text>
      <circle cx="580" cy="236" r="24" className="scene-knob" />
      <circle cx="580" cy="236" r="6" className="scene-knob-dimple" />
      {[448, 474, 500, 526].map((x) => (
        <circle key={x} cx={x} cy={274} r="6.5" className="scene-knob" />
      ))}

      {/* Desk microphone */}
      <path d="M662 290 h44" className="scene-base" />
      <path d="M684 290 V250" className="scene-stand" />
      <rect x="672" y="222" width="24" height="34" rx="12" className="scene-mic" />

      {/* Morse key */}
      <rect x="736" y="276" width="96" height="14" rx="3" className="scene-key-base" />
      <path d="M752 276 L816 266" className="scene-key-lever" />
      <circle cx="818" cy="264" r="7" className="scene-knob" />
    </svg>
  );
}
