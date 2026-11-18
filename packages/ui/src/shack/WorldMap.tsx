"use client";
import { useMemo } from "react";
import { geoCircle, geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import type { Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";

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

/** Sub-solar point (where the sun is overhead), good to about a degree for teaching. */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86_400_000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = (12 - utcHours) * 15;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: decl, lon };
}

/**
 * World map panel: land, a graticule, the night side shaded and the grey line (the day/night
 * terminator, where HF propagation is often enhanced) drawn as a dashed lamp-coloured line.
 * Markers are labelled on the map and listed in the accessible description.
 */
export function WorldMap({ date, markers = [], label = "World map" }: WorldMapProps) {
  const { landPath, nightPath, gridPath, project } = useMemo(() => {
    const projection = geoEquirectangular().fitSize([W, H], { type: "Sphere" });
    const path = geoPath(projection);
    const topo = land110 as unknown as Topology;
    const landGeo = feature(topo, topo.objects.land!) as unknown as FeatureCollection;
    const sun = subsolarPoint(date);
    const night = geoCircle().center([sun.lon + 180, -sun.lat]).radius(90)();
    return {
      landPath: path(landGeo) ?? "",
      nightPath: path(night) ?? "",
      gridPath: path(geoGraticule10()) ?? "",
      project: (lon: number, lat: number) => projection([lon, lat]) ?? [0, 0],
    };
  }, [date]);

  const utc = date.toISOString().slice(11, 16);
  const desc = `UTC ${utc}. Night side shaded; grey line dashed.${markers.length ? ` Stations: ${markers.map((m) => m.label).join(", ")}.` : ""}`;
  return (
    <figure className="worldmap" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. ${desc}`}>
        <rect className="worldmap-sea" width={W} height={H} />
        <path className="worldmap-grid" d={gridPath} />
        <path className="worldmap-land" d={landPath} />
        <path className="worldmap-night" d={nightPath} />
        <path className="worldmap-grey" d={nightPath} />
        {markers.map((m) => {
          const [x, y] = project(m.lon, m.lat);
          return (
            <g key={m.label}>
              <circle className="worldmap-mark" cx={x} cy={y} r="4.5" />
              <text className="worldmap-mark-label" x={x + 7} y={y + 4}>{m.label}</text>
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
