export interface AnalogMeterProps {
  label: string;
  /** Present reading, in `unit`. null = instrument not connected. */
  value: number | null;
  /** Full-scale value. Use autoRange() to pick one. */
  max: number;
  unit: string;
  format: (v: number) => string;
  /** Pegged past full scale, e.g. a short circuit. */
  overload?: boolean;
}

const RANGES = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000];

/** Smallest standard full-scale range that shows `v` on the scale. */
export function autoRange(v: number): number {
  const a = Math.abs(v);
  return RANGES.find((r) => a <= r * 1.0000001) ?? RANGES[RANGES.length - 1]!;
}

/**
 * Lit analog meter with a red needle. A role="meter" with the reading in aria-valuetext,
 * and a digital readout under it so the number never depends on reading a needle.
 */
export function AnalogMeter({ label, value, max, unit, format, overload }: AnalogMeterProps) {
  const off = value === null;
  const frac = off ? 0 : Math.min(1.04, Math.max(0, value / max));
  const angle = -50 + frac * 100;
  const ticks = Array.from({ length: 11 }, (_, i) => i);
  const text = off ? "not connected" : overload ? "off scale" : format(value);
  // Scale numbers share one SI prefix, taken from full scale (0.3 A → 0, 150, 300 in mA).
  const exp = Math.floor(Math.log10(max) / 3) * 3;
  const scaleLabel = (i: number) => String(Number(((max * i) / 10 / 10 ** exp).toPrecision(3)));
  return (
    <div className="meter" data-off={off}>
      <div className="meter-name">
        <span>{label}</span>
        {!off && <span className="meter-range">0 to {format(max)}</span>}
      </div>
      <svg
        viewBox="0 0 200 120"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={off ? 0 : Math.min(value, max)}
        aria-valuetext={text}
      >
        <rect className="meter-face" x="4" y="4" width="192" height="112" rx="8" />
        {ticks.map((i) => {
          const a = ((-50 + i * 10) * Math.PI) / 180;
          const long = i % 5 === 0;
          const r1 = long ? 72 : 78;
          return (
            <line
              key={i}
              className="meter-tick"
              strokeWidth={long ? 2 : 1}
              x1={100 + Math.sin(a) * r1}
              y1={104 - Math.cos(a) * r1}
              x2={100 + Math.sin(a) * 86}
              y2={104 - Math.cos(a) * 86}
            />
          );
        })}
        {[0, 5, 10].map((i) => {
          const a = ((-50 + i * 10) * Math.PI) / 180;
          return (
            <text
              key={i}
              className="meter-label"
              x={100 + Math.sin(a) * 62}
              y={108 - Math.cos(a) * 62}
              textAnchor="middle"
            >
              {scaleLabel(i)}
            </text>
          );
        })}
        <text className="meter-unit" x="100" y="80" textAnchor="middle">
          {unit}
        </text>
        <line
          className="meter-needle"
          x1="100"
          y1="104"
          x2="100"
          y2="22"
          style={{ transform: `rotate(${angle}deg)` }}
        />
        <circle className="meter-hub" cx="100" cy="104" r="6" />
      </svg>
      <output className="readout" data-dim={off}>
        {text}
      </output>
    </div>
  );
}
