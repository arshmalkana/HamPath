"use client";

/** Hook for 5.04: the learner commits to a guess; the lesson brings it back on the relay card. */
export function RelayHook({ guess, onGuess }: { guess: string | null; onGuess: (v: string) => void }) {
  return (
    <div className="shack shack-panel">
      <div className="lab-task">
        <div>
          <p className="shack-label">Relay coil</p>
          <p className="readout" style={{ textAlign: "left" }}>25 Ω · 200 mA</p>
        </div>
      </div>
      <fieldset className="choices" style={{ gap: "var(--space-xs)" }}>
        <legend className="shack-label" style={{ fontSize: "var(--text-sm)", fontWeight: 400 }}>Your guess: which supply output?</legend>
        <div className="chip-row">
          {["5 V", "8 V", "12 V"].map((v) => (
            <button key={v} type="button" className="chip" aria-pressed={guess === v} onClick={() => onGuess(v)}>
              {v}
            </button>
          ))}
        </div>
      </fieldset>
      {guess && <p className="lab-hint" role="status">Locked in: {guess}. You'll find out on the relay card.</p>}
    </div>
  );
}

/** The Ohm's Law triangle; `focus` highlights the covered quantity. */
export function OhmsTriangle({ focus, alt }: { focus: string | null; alt: string }) {
  const covered = (k: string) => focus === k;
  return (
    <svg viewBox="0 0 240 200" width="240" role="img" aria-label={alt} style={{ maxWidth: "100%" }}>
      <path d="M120 12 L228 188 L12 188 Z" fill="none" stroke="currentColor" strokeWidth="3" />
      <line x1="62" y1="110" x2="178" y2="110" stroke="currentColor" strokeWidth="3" />
      <line x1="120" y1="110" x2="120" y2="188" stroke="currentColor" strokeWidth="3" />
      {[
        ["E", 120, 88],
        ["I", 82, 164],
        ["R", 158, 164],
      ].map(([k, x, y]) => (
        <g key={k as string} opacity={covered(k as string) ? 0.25 : 1}>
          <text x={x as number} y={y as number} textAnchor="middle" fontSize="40" fontWeight="700" fill="currentColor">{k}</text>
        </g>
      ))}
    </svg>
  );
}
