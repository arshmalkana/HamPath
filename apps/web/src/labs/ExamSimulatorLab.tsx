"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Feedback, SevenSegment } from "@hampath/ui";
import { ApiError, api, ensureSession } from "../lib/api";
import type { LabBodyProps } from "./registry";
import { Readouts, SegChoice, useReport } from "./common";

interface Blueprint {
  total: number;
  timeLimitMinutes: number;
  passPercent: number;
  honoursPercent: number;
}

const DEMO_BLUEPRINT: Blueprint = { total: 100, timeLimitMinutes: 120, passPercent: 70, honoursPercent: 80 };

/** LAB-35 Exam Simulator: the exam format at a glance, your mock count, and the start button. */
export function ExamSimulatorLab({ mode, onState }: LabBodyProps) {
  const demo = mode === "demo";
  const [bp, setBp] = useState<Blueprint | null>(demo ? DEMO_BLUEPRINT : null);
  const [taken, setTaken] = useState<number | null>(demo ? 0 : null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [timed, setTimed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    try {
      await ensureSession();
      const m = await api<{ id: string }>("POST", "/mocks", { timed });
      router.push(`/mocks/${m.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the exam.");
      setBusy(false);
    }
  };
  useReport(onState, { mocks: taken ?? 0, ready: (taken ?? 0) >= 3 }, { mocks: taken ?? 0 }, [taken]);

  useEffect(() => {
    if (demo) return;
    let live = true;
    ensureSession()
      .then(() => api<{ mocks: unknown[]; blueprint: Blueprint }>("GET", "/mocks"))
      .then((r) => {
        if (!live) return;
        setBp(r.blueprint);
        setTaken(r.mocks.length);
      })
      .catch(() => live && setTaken(0));
    return () => {
      live = false;
    };
  }, [demo]);

  return (
    <div className="lab">
      <div className="shack-row">
        <div className="shack-well" style={{ display: "grid", placeItems: "center", gap: "var(--space-xs)" }}>
          <SevenSegment label="Questions" value={bp ? String(bp.total) : "---"} digits={3} />
          <p className="shack-label">questions</p>
        </div>
        <div className="shack-well" style={{ display: "grid", placeItems: "center", gap: "var(--space-xs)" }}>
          <SevenSegment label="Time limit in minutes" value={bp ? String(bp.timeLimitMinutes) : "---"} digits={3} />
          <p className="shack-label">minutes</p>
        </div>
      </div>
      <Readouts
        items={[
          ["Pass mark", bp ? `${bp.passPercent}%` : "–"],
          ["Honours (HF below 30 MHz)", bp ? `${bp.honoursPercent}%` : "–"],
          ["Mock exams taken", taken === null ? "–" : String(taken)],
        ]}
      />
      <p className="lab-state" role="status">
        {taken !== null && taken < 3
          ? `Questions are drawn from every section by the exam blueprint. Your readiness score appears after three mock exams (${3 - taken} to go).`
          : "Questions are drawn from every section by the exam blueprint, and graded the moment you submit."}{" "}
        Untimed mocks have no countdown, for extra-time practice; they count toward readiness the same way.
      </p>
      {error && (
        <Feedback tone="bad" title="Not started">
          <p>{error}</p>
        </Feedback>
      )}
      <div className="lab-foot">
        <SegChoice
          label="Clock"
          value={timed ? "timed" : "untimed"}
          onChange={(x) => setTimed(x === "timed")}
          disabled={demo || busy}
          options={[
            { value: "timed", label: bp ? `Timed, ${bp.timeLimitMinutes} min` : "Timed" },
            { value: "untimed", label: "Untimed" },
          ]}
        />
        <Button onClick={() => void start()} disabled={demo || busy}>
          {busy ? "Drawing your questions…" : "Start a mock exam"}
        </Button>
      </div>
    </div>
  );
}
