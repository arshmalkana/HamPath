"use client";
import { useMemo } from "react";
import { worldPaths } from "./worldGeometry";

export { subsolarPoint } from "./worldGeometry";

export interface MapMarker {
  lat: number;
  lon: number;
  label: string;
}

export interface WorldMapProps {
  /** Time shown (sets the day/night shading and grey line). */
  date: Date;
  markers?: MapMarker[];
  label?: string;
}

const W = 720;
const H = 360;

/**
 * World map panel: land, a graticule, the night side shaded and the grey line (the day/night
 * terminator, where HF propagation is often enhanced) drawn as a dashed lamp-coloured line.
 * Markers are labelled on the map and listed in the accessible description.
 */
export function WorldMap({ date, markers = [], label = "World map" }: WorldMapProps) {
  const paths = useMemo(() => worldPaths(W, H, date), [date]);
  const utc = date.toISOString().slice(11, 16);
  const desc = `UTC ${utc}. Night side shaded; grey line dashed.${markers.length ? ` Stations: ${markers.map((m) => m.label).join(", ")}.` : ""}`;
  return (
    <figure className="worldmap" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. ${desc}`}>
        <rect className="worldmap-sea" width={W} height={H} />
        <path className="worldmap-grid" d={paths.grid} />
        <path className="worldmap-land" d={paths.land} />
        <path className="worldmap-night" d={paths.night} />
        <path className="worldmap-grey" d={paths.night} />
        {markers.map((m) => {
          const [x, y] = paths.project(m.lon, m.lat);
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
      <figcaption className="worldmap-caption">
        <span>UTC {utc}</span>
        <span>Dashed line: grey line</span>
      </figcaption>
    </figure>
  );
}
