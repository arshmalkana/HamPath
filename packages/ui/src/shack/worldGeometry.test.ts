import { describe, expect, it } from "vitest";
import { azimuthalPaths, worldPaths } from "./worldGeometry";

/** Bounding box of every coordinate in an SVG path's data. */
function bounds(d: string) {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe("world map geometry", () => {
  const map = worldPaths(292, 146, new Date("2026-06-21T12:00:00Z"));

  it("stays small enough to server-render into the dashboard", () => {
    // The unthinned path was ~73 kB of land and ~40 kB of graticule.
    expect(map.land.length).toBeLessThan(30_000);
    expect(map.grid.length).toBeLessThan(1_000);
    expect(azimuthalPaths(320, [-75.7, 45.4]).land.length).toBeLessThan(45_000);
  });

  it("thinning keeps the coastline's full extent", () => {
    const b = bounds(map.land.replace(/[MLZ]/g, " "));
    // Equirectangular 292 × 146: land runs from about 180°W to 180°E and down to Antarctica.
    expect(b.minX).toBeLessThan(5);
    expect(b.maxX).toBeGreaterThan(287);
    expect(b.maxY).toBeGreaterThan(140);
  });

  it("draws a straight 10° graticule", () => {
    expect(map.grid.match(/V/g)).toHaveLength(37);
    expect(map.grid.match(/H/g)).toHaveLength(17);
  });

  it("projects Ottawa into the right part of the map", () => {
    const [x, y] = map.project(-75.7, 45.4);
    expect(x).toBeCloseTo(((180 - 75.7) / 360) * 292, 0);
    expect(y).toBeCloseTo(((90 - 45.4) / 180) * 146, 0);
  });
});
