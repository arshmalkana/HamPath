import {
  geoAzimuthalEquidistant,
  geoCircle,
  geoEquirectangular,
  geoGraticule10,
  geoPath,
  type GeoProjection,
  type GeoStream,
} from "d3-geo";
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

/**
 * Wraps a projection so its output skips points closer than `minPx` to the last one drawn. At map
 * sizes of a few hundred pixels most of the 110m coastline is sub-pixel detail; dropping it keeps
 * the path data (which is server-rendered into the page) a fraction of the size with no visible change.
 */
function thinned(projection: GeoProjection, minPx: number) {
  return {
    stream(output: GeoStream): GeoStream {
      let last: [number, number] | null = null;
      return projection.stream({
        point(x, y) {
          if (!last || Math.hypot(x - last[0], y - last[1]) >= minPx) {
            output.point(x, y);
            last = [x, y];
          }
        },
        lineStart() {
          last = null;
          output.lineStart();
        },
        lineEnd: () => output.lineEnd(),
        polygonStart: () => output.polygonStart(),
        polygonEnd: () => output.polygonEnd(),
        sphere: () => output.sphere?.(),
      });
    },
  };
}

/** Compact path generator: thinned to `minPx` and one decimal place. */
const compactPath = (projection: GeoProjection, minPx = 1) => geoPath(thinned(projection, minPx)).digits(1);

/** A 10° graticule for an equirectangular map: straight lines, so a few hundred bytes instead of 40 kB. */
function flatGraticule(width: number, height: number) {
  const parts: string[] = [];
  for (let lon = -180; lon <= 180; lon += 10) parts.push(`M${+(((lon + 180) / 360) * width).toFixed(1)},0V${height}`);
  for (let lat = -80; lat <= 80; lat += 10) parts.push(`M0,${+(((90 - lat) / 180) * height).toFixed(1)}H${width}`);
  return parts.join("");
}

/** SVG path data for an equirectangular world map of the given size at `date` (pure, server-safe). */
export function worldPaths(width: number, height: number, date: Date) {
  const projection = geoEquirectangular().fitSize([width, height], { type: "Sphere" });
  const path = compactPath(projection);
  const sun = subsolarPoint(date);
  const night = geoCircle()
    .center([sun.lon + 180, -sun.lat])
    .radius(90)();
  return {
    land: path(land()) ?? "",
    night: path(night) ?? "",
    grid: flatGraticule(width, height),
    project: (lon: number, lat: number) => projection([lon, lat]) ?? [0, 0],
  };
}

/** Azimuthal equidistant projection centred on a station (pure, server-safe). */
export function azimuthalPaths(size: number, center: [number, number]) {
  const projection = geoAzimuthalEquidistant()
    .rotate([-center[0], -center[1]])
    .clipAngle(179.9)
    .fitSize([size - 8, size - 8], { type: "Sphere" })
    .translate([size / 2, size / 2]);
  const path = compactPath(projection);
  return {
    land: path(land()) ?? "",
    grid: path(geoGraticule10()) ?? "",
    project: (lon: number, lat: number) => projection([lon, lat]) ?? [size / 2, size / 2],
  };
}
