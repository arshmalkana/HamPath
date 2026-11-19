import { describe, expect, it } from "vitest";
import { MIN_DEG, moveDrag, startDrag, unitPerStep } from "./knobDrag";

// An 88 px knob at the origin: centre (44, 44), radius 44.
const rect = { left: 0, top: 0, width: 88, height: 88 };
const at = (deg: number, r = 36) =>
  [44 + r * Math.cos((deg * Math.PI) / 180), 44 + r * Math.sin((deg * Math.PI) / 180)] as const;

/** Drag along an arc from one angle to another (screen angles: 0 = right, 90 = down). */
function arc(range: { min: number; max: number; step: number }, value: number, from: number, to: number) {
  const [x0, y0] = at(from);
  const d = startDrag(rect, x0, y0, value);
  let v = value;
  const n = Math.ceil(Math.abs(to - from));
  for (let i = 1; i <= n; i++) {
    const [x, y] = at(from + ((to - from) * i) / n);
    v = moveDrag(d, x, y, range);
  }
  return { v, d };
}

describe("knob drag", () => {
  const range = { min: 0, max: 10, step: 1 };

  it("turns clockwise to increase when dragged around the dial", () => {
    // From the top (−90°) a quarter turn clockwise to the right (0°): 90° of a 27°-per-step range.
    const { v, d } = arc(range, 5, -90, 0);
    expect(d.mode).toBe("rotate");
    expect(v).toBe(8);
  });

  it("turns anticlockwise to decrease", () => {
    expect(arc(range, 5, -90, -144).v).toBe(3);
  });

  it("takes several turns on a fine range so every step is reachable", () => {
    const fine = { min: 0, max: 60, step: 0.5 }; // 120 steps
    expect(unitPerStep("rotate", fine)).toBe(MIN_DEG);
    // Turning 6° at a time lands on each value in turn.
    const [x0, y0] = at(-90);
    const d = startDrag(rect, x0, y0, 40);
    const seen = new Set<number>();
    for (let a = -89; a <= 90; a++) {
      const [x, y] = at(a);
      seen.add(moveDrag(d, x, y, fine));
    }
    for (let v = 40; v <= 55; v += 0.5) expect(seen.has(v)).toBe(true);
  });

  it("acts as a slider when dragged up from the middle", () => {
    const d = startDrag(rect, 44, 44, 5);
    let v = 5;
    for (let y = 43; y >= 4; y--) v = moveDrag(d, 44, y, range);
    expect(d.mode).toBe("linear");
    expect(v).toBe(7); // 40 px at 20 px per step
  });

  it("acts as a slider when pulled straight up from the top edge", () => {
    const [x0, y0] = at(-90);
    const d = startDrag(rect, x0, y0, 5);
    let v = 5;
    for (let y = y0 - 1; y >= y0 - 60; y--) v = moveDrag(d, x0, y, range);
    expect(d.mode).toBe("linear");
    expect(v).toBe(8);
  });

  it("stops at the end and responds at once when turned back", () => {
    const [x0, y0] = at(-90);
    const d = startDrag(rect, x0, y0, 9);
    let v = 9;
    for (let a = -89; a <= 90; a++) v = moveDrag(d, ...at(a), range); // far past the top
    expect(v).toBe(10);
    for (let a = 89; a >= 60; a--) v = moveDrag(d, ...at(a), range); // back 30°
    expect(v).toBe(9);
  });

  it("ignores jitter before the mode is chosen", () => {
    const d = startDrag(rect, 60, 20, 5);
    expect(moveDrag(d, 61, 21, range)).toBe(5);
    expect(d.mode).toBe("pending");
  });
});
