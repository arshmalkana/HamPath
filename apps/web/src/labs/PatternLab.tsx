"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { patternField, patternVariables, type PatternState } from "@hampath/ham-sim";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, useReport } from "./common";

interface Config extends PatternState {
  antennas: PatternState["antenna"][];
  controls: { antenna: boolean; orientation: boolean; rx: boolean; parasitic: boolean };
}

const NAMES: Record<PatternState["antenna"], string> = {
  isotropic: "Isotropic",
  dipole: "Half-wave dipole",
  yagi: "3-element Yagi",
};

/** CSS colour token → [r, g, b] in 0..1, via a 1×1 canvas (handles oklch). */
function tokenRgb(el: HTMLElement, name: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d");
  if (!ctx) return [0.5, 0.9, 0.6];
  ctx.fillStyle = getComputedStyle(el).getPropertyValue(name).trim() || "#7fe0a0";
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0]! / 255, d[1]! / 255, d[2]! / 255];
}

/** 2D cut through the pattern. plane "above": x right, z up the page; "side": z right, y up. */
function cut(s: PatternState, plane: "above" | "side"): string {
  return Array.from({ length: 145 }, (_, i) => {
    const t = (i / 144) * 2 * Math.PI;
    const [a, b] = [Math.cos(t), Math.sin(t)];
    const r = 60 * (plane === "above" ? patternField(s, a, 0, b) : patternField(s, 0, b, a));
    return `${(80 + r * a).toFixed(1)},${(80 - r * b).toFixed(1)}`;
  }).join(" ");
}

type Three = typeof import("three");
interface Scene {
  THREE: Three;
  renderer: import("three").WebGLRenderer;
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  controls: { update: () => void; dispose: () => void; target: import("three").Vector3 };
  lobe: import("three").Mesh;
  wire: import("three").LineSegments;
  antenna: import("three").Group;
  render: () => void;
}

/** LAB-29 Radiation Pattern 3D: isotropic sphere, dipole doughnut, Yagi lobe; polarization. */
export function PatternLab({ config, mode, onState }: LabBodyProps) {
  const cfg = config as unknown as Config;
  const demo = mode === "demo";
  const [s, setS] = useState<PatternState>({
    antenna: cfg.antenna,
    orientation: cfg.orientation,
    rx: cfg.rx,
    parasitic: cfg.parasitic ?? "none",
  });
  const v = patternVariables(s)!;
  useReport(onState, v, s as unknown as Record<string, unknown>, [s]);
  const set = <K extends keyof PatternState>(k: K, x: PatternState[K]) => setS((cur) => ({ ...cur, [k]: x }));
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<Scene | null>(null);
  const [webgl, setWebgl] = useState<"loading" | "ok" | "none">("loading");

  // Build the scene once.
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const el = host.current;
      if (!el) return;
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        if (cancelled) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        const w = el.clientWidth || 320;
        const h = Math.round(Math.min(360, w * 0.75));
        renderer.setSize(w, h);
        // The host div is the named image; the bare canvas inside it is decoration.
        renderer.domElement.setAttribute("aria-hidden", "true");
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 50);
        camera.position.set(2.6, 1.8, 3.2);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.minDistance = 2.5;
        controls.maxDistance = 8;
        const ink = tokenRgb(el, "--shack-readout");
        const lamp = tokenRgb(el, "--shack-lamp");
        const grid = tokenRgb(el, "--shack-grid");
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const sun = new THREE.DirectionalLight(0xffffff, 1.4);
        sun.position.set(3, 5, 4);
        scene.add(sun);
        const ground = new THREE.GridHelper(4, 8, new THREE.Color(...grid), new THREE.Color(...grid));
        ground.position.y = -1.2;
        scene.add(ground);
        const lobe = new THREE.Mesh(
          new THREE.SphereGeometry(1, 72, 36),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(...ink),
            transparent: true,
            opacity: 0.55,
            roughness: 0.6,
          }),
        );
        scene.add(lobe);
        const wire = new THREE.LineSegments(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: new THREE.Color(...ink), transparent: true, opacity: 0.35 }),
        );
        scene.add(wire);
        const antenna = new THREE.Group();
        antenna.userData.color = new THREE.Color(...lamp);
        scene.add(antenna);
        const render = () => renderer.render(scene, camera);
        controls.addEventListener("change", render);
        three.current = { THREE, renderer, scene, camera, controls, lobe, wire, antenna, render };
        setWebgl("ok");
        const onResize = () => {
          const ww = el.clientWidth || 320;
          const hh = Math.round(Math.min(360, ww * 0.75));
          renderer.setSize(ww, hh);
          camera.aspect = ww / hh;
          camera.updateProjectionMatrix();
          render();
        };
        window.addEventListener("resize", onResize);
        cleanup = () => {
          window.removeEventListener("resize", onResize);
          controls.dispose();
          renderer.dispose();
          renderer.domElement.remove();
          three.current = null;
        };
      } catch {
        if (!cancelled) setWebgl("none");
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  // Reshape the lobe and the antenna whenever the state changes.
  useEffect(() => {
    const t = three.current;
    if (!t || webgl !== "ok") return;
    const { THREE } = t;
    const geo = new THREE.SphereGeometry(1, 72, 36);
    const pos = geo.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const r = Math.max(0.02, patternField(s, x, y, z));
      pos.setXYZ(i, x * r, y * r, z * r);
    }
    geo.computeVertexNormals();
    t.lobe.geometry.dispose();
    t.lobe.geometry = geo;
    t.wire.geometry.dispose();
    t.wire.geometry = new THREE.WireframeGeometry(geo);
    t.antenna.clear();
    const mat = new THREE.MeshBasicMaterial({ color: t.antenna.userData.color as import("three").Color });
    const rod = (len: number, zOff: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 8), mat);
      if (s.orientation === "horizontal") m.rotation.z = Math.PI / 2;
      m.position.z = zOff;
      t.antenna.add(m);
    };
    if (s.antenna === "isotropic") t.antenna.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat));
    else {
      rod(1.4, 0);
      if (s.antenna === "yagi") {
        rod(1.5, -0.35);
        rod(1.3, 0.35);
      } else if (s.parasitic === "director") rod(1.3, 0.35);
      else if (s.parasitic === "reflector") rod(1.5, -0.35);
    }
    t.render();
  }, [s, webgl]);

  /** Turn the 3D view one step; returns false for keys it doesn't handle. */
  const turn = (key: string): boolean => {
    const t = three.current;
    if (!t) return false;
    const step = Math.PI / 12;
    const sph = new t.THREE.Spherical().setFromVector3(t.camera.position.clone().sub(t.controls.target));
    if (key === "ArrowLeft") sph.theta -= step;
    else if (key === "ArrowRight") sph.theta += step;
    else if (key === "ArrowUp") sph.phi = Math.max(0.15, sph.phi - step);
    else if (key === "ArrowDown") sph.phi = Math.min(Math.PI - 0.15, sph.phi + step);
    else return false;
    t.camera.position.setFromSpherical(sph).add(t.controls.target);
    t.controls.update();
    t.render();
    return true;
  };
  const onKey = (e: KeyboardEvent) => {
    if (turn(e.key)) e.preventDefault();
  };

  const shape =
    s.antenna === "isotropic"
      ? "a sphere: equal in every direction"
      : s.antenna === "dipole" && s.parasitic === "none"
        ? `a doughnut around the ${s.orientation} wire: strongest broadside, nothing off the ends`
        : `a lobe pointing ${v.forward === 1 ? "from the dipole toward the shorter element" : "from the longer element toward the dipole"}`;

  return (
    <div className="lab">
      <div className="shack-row">
        <div className="shack-well pattern-3d">
          <div
            ref={host}
            className="pattern-canvas"
            tabIndex={webgl === "ok" ? 0 : -1}
            role="img"
            aria-label={`3D radiation pattern of a ${NAMES[s.antenna].toLowerCase()}${s.antenna === "isotropic" ? "" : `, ${s.orientation}`}: ${shape}. Drag or use the arrow keys to turn it.`}
            onKeyDown={onKey}
          />
          {webgl === "ok" && (
            <div className="chip-row pattern-turn" role="group" aria-label="Turn the 3D view">
              {(
                [
                  ["ArrowLeft", "Turn left"],
                  ["ArrowRight", "Turn right"],
                  ["ArrowUp", "Tilt up"],
                  ["ArrowDown", "Tilt down"],
                ] as const
              ).map(([k, name]) => (
                <button key={k} type="button" className="chip" onClick={() => turn(k)}>
                  {name}
                </button>
              ))}
            </div>
          )}
          <p className="shack-label">
            {webgl === "none"
              ? "3D view unavailable on this device: the cuts show the same pattern."
              : "Drag, use the buttons, or focus and use the arrow keys, to turn it."}
          </p>
        </div>
        <div className="shack-well pattern-cuts">
          {(["above", "side"] as const).map((p) => (
            <figure key={p} className="pattern-cut">
              <svg
                viewBox="0 0 160 160"
                width="140"
                role="img"
                aria-label={`Pattern ${p === "above" ? "seen from above" : "seen from the side"}.`}
              >
                <circle className="polar-ring" cx="80" cy="80" r="60" />
                <circle className="polar-ring" cx="80" cy="80" r="30" />
                <polygon className="polar-lobe" points={cut(s, p)} />
              </svg>
              <figcaption className="shack-label">{p === "above" ? "From above" : "From the side"}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="knobs">
        {cfg.controls.antenna && (
          <SegChoice
            label="Antenna"
            value={s.antenna}
            onChange={(x) => set("antenna", x)}
            disabled={demo}
            options={cfg.antennas.map((a) => ({ value: a, label: NAMES[a] }))}
          />
        )}
        {cfg.controls.orientation && (
          <SegChoice
            label="Transmit antenna"
            value={s.orientation}
            onChange={(x) => set("orientation", x)}
            disabled={demo}
            options={[
              { value: "horizontal", label: "Horizontal" },
              { value: "vertical", label: "Vertical" },
            ]}
          />
        )}
        {cfg.controls.rx && (
          <SegChoice
            label="Receive antenna"
            value={s.rx ?? "horizontal"}
            onChange={(x) => set("rx", x)}
            disabled={demo}
            options={[
              { value: "horizontal", label: "Horizontal" },
              { value: "vertical", label: "Vertical" },
            ]}
          />
        )}
        {cfg.controls.parasitic && (
          <SegChoice
            label="Add an element"
            value={s.parasitic ?? "none"}
            onChange={(x) => set("parasitic", x)}
            disabled={demo}
            options={[
              { value: "none", label: "None" },
              { value: "director", label: "Slightly shorter" },
              { value: "reflector", label: "Slightly longer" },
            ]}
          />
        )}
      </div>
      <Readouts
        items={[
          ["Gain", `${(v.gainDbi as number).toFixed(2)} dBi`],
          ["Over a dipole", `${(v.gainDbd as number).toFixed(2)} dBd`],
          [
            "Polarization",
            s.antenna === "isotropic" ? "none (theoretical)" : s.orientation === "vertical" ? "Vertical" : "Horizontal",
          ],
          ...(cfg.controls.rx
            ? ([["Received", v.matched ? "full strength" : "about 20 dB weaker (cross-polarized)"]] as [
                string,
                string,
              ][])
            : []),
        ]}
      />
      <p className="lab-state" role="status">
        The pattern is {shape}.
      </p>
    </div>
  );
}
