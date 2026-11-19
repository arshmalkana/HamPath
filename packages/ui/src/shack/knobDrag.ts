/**
 * Pointer handling for the rotary Knob, kept pure so it can be tested.
 *
 * A drag picks its mode from its first few pixels:
 * - "rotate": the pointer started away from the centre and moved around it. The knob follows the
 *   pointer's angle like a real dial: clockwise turns it up.
 * - "linear": the pointer started near the centre, or moved straight in or out from it. Up or right
 *   turns it up, like a slider.
 *
 * Each step needs at least MIN_DEG of turn (or MIN_PX of travel), so a range with many steps takes
 * more than one turn, like a tuning encoder, and every single value can be reached by hand.
 * At either end the knob stops, and reversing responds straight away (no unwinding).
 */

export const SWEEP = 270; // degrees of knob travel from min to max
export const MIN_DEG = 6; // smallest turn that moves one step
export const MIN_PX = 3; // smallest linear travel that moves one step
const FULL_PX = 200; // linear travel across the whole range, when steps allow
const DECIDE_PX = 4; // movement needed before the mode is chosen
const CENTRE_ZONE = 0.3; // fraction of the radius treated as "the middle"

export interface KnobDrag {
  cx: number;
  cy: number;
  radius: number;
  /** Last pointer position. */
  x: number;
  y: number;
  /** Where the drag started (for choosing the mode). */
  x0: number;
  y0: number;
  /** Value the accumulated movement is measured from. */
  base: number;
  /** Accumulated movement since `base`, in degrees (rotate) or pixels (linear). */
  acc: number;
  mode: "pending" | "rotate" | "linear";
}

export interface KnobRange {
  min: number;
  max: number;
  step: number;
}

export function startDrag(
  rect: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
  value: number,
): KnobDrag {
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    radius: Math.min(rect.width, rect.height) / 2,
    x,
    y,
    x0: x,
    y0: y,
    base: value,
    acc: 0,
    mode: "pending",
  };
}

const angleOf = (d: KnobDrag, x: number, y: number) => (Math.atan2(y - d.cy, x - d.cx) * 180) / Math.PI;

/** Degrees (rotate) or pixels (linear) per step for this range. */
export function unitPerStep(mode: "rotate" | "linear", { min, max, step }: KnobRange): number {
  const steps = Math.max(1, Math.round((max - min) / step));
  return mode === "rotate" ? Math.max(SWEEP / steps, MIN_DEG) : Math.max(FULL_PX / steps, MIN_PX);
}

/**
 * Feed a pointer move. Mutates `d` and returns the knob's new value (unrounded to the step grid
 * only by floating point; callers clamp and round as usual).
 */
export function moveDrag(d: KnobDrag, x: number, y: number, range: KnobRange): number {
  const { min, max, step } = range;
  if (d.mode === "pending") {
    const mx = x - d.x0;
    const my = y - d.y0;
    if (Math.hypot(mx, my) < DECIDE_PX) return d.base;
    const rx = d.x0 - d.cx;
    const ry = d.y0 - d.cy;
    const rl = Math.hypot(rx, ry);
    if (rl < d.radius * CENTRE_ZONE) d.mode = "linear";
    else {
      const radial = Math.abs((mx * rx + my * ry) / rl);
      const tangential = Math.abs((mx * ry - my * rx) / rl);
      d.mode = tangential > radial ? "rotate" : "linear";
    }
    // Measure from where the drag started, so the deciding pixels count too.
    d.x = d.x0;
    d.y = d.y0;
  }

  if (d.mode === "rotate") {
    // Close to the centre the angle swings wildly: follow the pointer but don't count it.
    if (Math.hypot(x - d.cx, y - d.cy) > d.radius * 0.15 && Math.hypot(d.x - d.cx, d.y - d.cy) > d.radius * 0.15) {
      let da = angleOf(d, x, y) - angleOf(d, d.x, d.y);
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      d.acc += da; // screen y points down, so clockwise is a growing angle
    }
  } else {
    d.acc += x - d.x - (y - d.y);
  }
  d.x = x;
  d.y = y;

  const unit = unitPerStep(d.mode, range);
  let v = d.base + Math.round(d.acc / unit) * step;
  // Stop at the ends, and rebase so turning back responds at once.
  if (v > max) {
    v = max;
    d.base = max;
    d.acc = 0;
  } else if (v < min) {
    v = min;
    d.base = min;
    d.acc = 0;
  }
  return v;
}
