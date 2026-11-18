"use client";
import { useMemo } from "react";
import { azimuthalPaths } from "./worldGeometry";
import type { MapMarker } from "./WorldMap";

export interface AzimuthalMapProps {
  /** Your station: the map's centre, [lon, lat]. */
  center: [number, number];
  centerLabel: string;
  markers?: MapMarker[];
  /** Antenna heading to draw from the centre, degrees true. */
  heading?: number;
  label?: string;
}

const S = 360;

/**
 * Azimuthal equidistant map centred on your station: every straight line from the centre is a
 * great circle, so its angle is the true bearing and its length the distance. The far edge of the
 * disc is the point on the opposite side of the Earth.
 */
export function AzimuthalMap({
  center,
  centerLabel,
  markers = [],
  heading,
  label = "Azimuthal map",
}: AzimuthalMapProps) {
  const p = useMemo(() => azimuthalPaths(S, center), [center]);
  const r = S / 2 - 4;
  const rad = ((heading ?? 0) - 90) * (Math.PI / 180);
  const desc = `Centred on ${centerLabel}.${heading !== undefined ? ` Antenna heading ${Math.round(heading)} degrees.` : ""}${markers.length ? ` Stations: ${markers.map((m) => m.label).join(", ")}.` : ""}`;
  return (
    <figure className="worldmap" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`${label}. ${desc}`}>
        <circle className="worldmap-sea" cx={S / 2} cy={S / 2} r={r} />
        <path className="worldmap-grid" d={p.grid} />
        <path className="worldmap-land" d={p.land} />
        {heading !== undefined && (
          <path
            className="worldmap-path"
            d={`M${S / 2},${S / 2} L${S / 2 + r * Math.cos(rad)},${S / 2 + r * Math.sin(rad)}`}
          />
        )}
        {(["N", "E", "S", "W"] as const).map((d, i) => (
          <text
            key={d}
            className="worldmap-mark-label"
            x={[S / 2, S - 14, S / 2, 6][i]}
            y={[16, S / 2 + 4, S - 6, S / 2 + 4][i]}
            textAnchor="middle"
          >
            {d}
          </text>
        ))}
        <circle className="worldmap-mark" cx={S / 2} cy={S / 2} r="4.5" />
        {markers.map((m) => {
          const [x, y] = p.project(m.lon, m.lat);
          return (
            <g key={m.label}>
              <circle className="worldmap-mark" cx={x} cy={y} r="4.5" />
              <text className="worldmap-mark-label" x={x + 7} y={y + 4}>
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
