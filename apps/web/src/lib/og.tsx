import { ImageResponse } from "next/og";

/**
 * The social share card (1200 × 630), drawn like a lab's shack panel. ImageResponse takes inline
 * styles with plain colours only, so these are the hex equivalents of the tokens in
 * packages/ui/src/styles/tokens.css (--shack-panel, --shack-panel-2, --shack-ink, --shack-ink-2,
 * --shack-lamp, --shack-readout, --shack-readout-ground).
 */
const C = {
  panel: "#1c2830",
  panel2: "#27353d",
  ink: "#f2eee6",
  ink2: "#c8d3da",
  lamp: "#f7b245",
  readout: "#7eeca8",
  ground: "#051213",
};

export const OG_SIZE = { width: 1200, height: 630 };

export function shareCard({ kicker, title, stats }: { kicker: string; title: string; stats: [string, string][] }) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: C.panel,
        color: C.ink,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="64" height="64" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="7" fill={C.panel2} />
          <path d="M6 22a10 10 0 0 1 20 0" fill="none" stroke={C.lamp} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M16 22 22 11" stroke={C.readout} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="16" cy="22" r="2.5" fill={C.lamp} />
        </svg>
        <div style={{ fontSize: 40, fontWeight: 700 }}>HamPath</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 32, color: C.lamp }}>{kicker}</div>
        <div style={{ fontSize: title.length > 40 ? 60 : 72, fontWeight: 700, lineHeight: 1.05, maxWidth: 1050 }}>
          {title}
        </div>
      </div>
      <div style={{ display: "flex", gap: 20 }}>
        {stats.map(([value, label]) => (
          <div
            key={label}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "16px 24px",
              borderRadius: 14,
              background: C.ground,
              border: `2px solid ${C.panel2}`,
            }}
          >
            <div style={{ fontSize: 44, color: C.readout, fontFamily: "monospace" }}>{value}</div>
            <div style={{ fontSize: 24, color: C.ink2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>,
    OG_SIZE,
  );
}
