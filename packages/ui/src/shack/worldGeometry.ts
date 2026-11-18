import { geoCircle, geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection } from "geojson";
import type { Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";

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

let landCache: FeatureCollection | null = null;
const land = () => {
  if (!landCache) {
    const topo = land110 as unknown as Topology;
    landCache = feature(topo, topo.objects.land!) as unknown as FeatureCollection;
  }
  return landCache;
};

/** SVG path data for an equirectangular world map of the given size at `date` (pure, server-safe). */
export function worldPaths(width: number, height: number, date: Date) {
  const projection = geoEquirectangular().fitSize([width, height], { type: "Sphere" });
  const path = geoPath(projection);
  const sun = subsolarPoint(date);
  const night = geoCircle()
    .center([sun.lon + 180, -sun.lat])
    .radius(90)();
  return {
    land: path(land()) ?? "",
    night: path(night) ?? "",
    grid: path(geoGraticule10()) ?? "",
    project: (lon: number, lat: number) => projection([lon, lat]) ?? [0, 0],
  };
}
