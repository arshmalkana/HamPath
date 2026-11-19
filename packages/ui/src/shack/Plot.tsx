export interface PlotSeries {
  points: [number, number][];
  /** "a" (lamp), "b" (phosphor) or "c" (needle red) trace colour. */
  tone?: "a" | "b" | "c";
  dashed?: boolean;
  label?: string;
}

export interface PlotMarker {
  x: number;
  label?: string;
}

export interface PlotProps {
  /** Accessible summary of what the plot shows (state the key numbers). */
  label: string;
  series: PlotSeries[];
  xDomain: [number, number];
  yDomain: [number, number];
  xLog?: boolean;
  yLog?: boolean;
  xLabel?: string;
  yLabel?: string;
  xTicks?: number[];
  yTicks?: number[];
  formatX?: (x: number) => string;
  formatY?: (y: number) => string;
  markers?: PlotMarker[];
  height?: number;
}

const W = 520;
const BASE_PAD = { l: 52, r: 14, t: 12, b: 36 };

/** Instrument-style line plot (oscilloscope / analyser screen) for the shack labs. */
export function Plot({
  label,
  series,
  xDomain,
  yDomain,
  xLog,
  yLog,
  xLabel,
  yLabel,
  xTicks = [],
  yTicks = [],
  formatX = (x) => String(x),
  formatY = (y) => String(y),
  markers = [],
  height = 220,
}: PlotProps) {
  const H = height;
  // The left margin grows with the longest y label ("10 W/m²", "100 mΩ") so it isn't clipped.
  const longestY = Math.max(0, ...yTicks.map((t) => formatY(t).length));
  const PAD = { ...BASE_PAD, l: Math.max(BASE_PAD.l, longestY * 6.9 + 14) };
  const tx = (v: number) => (xLog ? Math.log10(v) : v);
  const ty = (v: number) => (yLog ? Math.log10(Math.max(v, 1e-30)) : v);
  const [x0, x1] = [tx(xDomain[0]), tx(xDomain[1])];
  const [y0, y1] = [ty(yDomain[0]), ty(yDomain[1])];
  const sx = (v: number) => PAD.l + ((tx(v) - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => {
    const t = (ty(v) - y0) / (y1 - y0);
    return H - PAD.b - Math.min(1.05, Math.max(-0.05, t)) * (H - PAD.t - PAD.b);
  };
  const path = (pts: [number, number][]) =>
    pts
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      .map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`)
      .join("");

  // Keep end labels inside the screen instead of clipping them at the edges.
  const anchorAt = (x: number) => (x < PAD.l + 24 ? "start" : x > W - PAD.r - 24 ? "end" : "middle");

  const legend = series.filter((s) => s.label);

  const plot = (
    <svg className="plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <rect className="plot-screen" x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} rx="4" />
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line className="plot-grid" x1={sx(t)} x2={sx(t)} y1={PAD.t} y2={H - PAD.b} />
          <text className="plot-tick" x={sx(t)} y={H - PAD.b + 14} textAnchor={anchorAt(sx(t))}>
            {formatX(t)}
          </text>
        </g>
      ))}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line className="plot-grid" x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} />
          <text className="plot-tick" x={PAD.l - 6} y={sy(t) + 4} textAnchor="end">
            {formatY(t)}
          </text>
        </g>
      ))}
      {series.map((s, i) => (
        <path
          key={i}
          d={path(s.points)}
          className={`plot-line plot-line-${s.tone ?? "a"}`}
          strokeDasharray={s.dashed ? "6 5" : undefined}
        />
      ))}
      {placeMarkerLabels(markers, sx, W - PAD.r).map(({ m, x, row, anchor }) => (
        <g key={`m${m.x}${m.label}`}>
          <line className="plot-marker" x1={sx(m.x)} x2={sx(m.x)} y1={PAD.t} y2={H - PAD.b} />
          {m.label && (
            <text className="plot-marker-label" x={x} y={PAD.t + 12 + row * 13} textAnchor={anchor}>
              {m.label}
            </text>
          )}
        </g>
      ))}
      {xLabel && (
        <text className="plot-axis" x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          className="plot-axis"
          x={12}
          y={(PAD.t + H - PAD.b) / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
  if (!legend.length) return plot;
  // Traces are told apart by a written label and a dash pattern, never by colour alone.
  return (
    <>
      {plot}
      <ul className="plot-legend">
        {legend.map((s) => (
          <li key={s.label}>
            <svg viewBox="0 0 28 8" width="28" height="8" aria-hidden="true">
              <path
                d="M1,4 H27"
                className={`plot-line plot-line-${s.tone ?? "a"}`}
                strokeDasharray={s.dashed ? "6 5" : undefined}
              />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Approximate width (viewBox units) of a marker label in the 11px monospace face. */
const labelWidth = (label: string) => label.length * 6.8 + 6;

/**
 * Marker labels that don't collide: each goes right of its line (left, near the right edge) in the
 * first row where it clears every label already placed there.
 */
function placeMarkerLabels(markers: PlotMarker[], sx: (x: number) => number, right: number) {
  const rows: { from: number; to: number }[][] = [];
  return [...markers]
    .sort((p, q) => sx(p.x) - sx(q.x))
    .map((m) => {
      const lx = sx(m.x);
      const w = m.label ? labelWidth(m.label) : 0;
      const flip = lx + 4 + w > right;
      const span = flip ? { from: lx - 4 - w, to: lx - 4 } : { from: lx + 4, to: lx + 4 + w };
      let row = rows.findIndex((r) => r.every((o) => span.to < o.from || span.from > o.to));
      if (row === -1) row = rows.push([]) - 1;
      rows[row]!.push(span);
      return { m, row, x: flip ? lx - 4 : lx + 4, anchor: (flip ? "end" : "start") as "end" | "start" };
    });
}

/** Evenly spaced samples of f over [a, b] (log-spaced when log is true). */
export function sample(f: (x: number) => number, a: number, b: number, n = 200, log = false): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = log ? 10 ** (Math.log10(a) + ((Math.log10(b) - Math.log10(a)) * i) / n) : a + ((b - a) * i) / n;
    out.push([x, f(x)]);
  }
  return out;
}
