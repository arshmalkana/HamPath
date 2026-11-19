"use client";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "link" };
export function Button({ variant = "primary", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "quiet" && "btn-quiet",
        variant === "link" && "btn-link",
        className,
      )}
      {...rest}
    />
  );
}

export function ExamFact({ children }: { children: ReactNode }) {
  return (
    <aside className="exam-fact" aria-label="Exam fact">
      <span className="exam-fact-label">Exam fact</span>
      <span className="exam-fact-text">{children}</span>
    </aside>
  );
}

export function Feedback({
  tone,
  title,
  children,
}: {
  tone: "good" | "bad" | "neutral";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="feedback" data-tone={tone} role="status">
      <p className="feedback-title">{title}</p>
      {children}
    </div>
  );
}

export interface Phase {
  label: string;
  /** 0..1 */
  fill: number;
  current: boolean;
}

/** The lesson's five-step progress (Hook → Explore → Learn → Check → Recap). */
export function PhaseProgress({ phases, label }: { phases: Phase[]; label: string }) {
  const done = phases.reduce((s, p) => s + p.fill, 0);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={phases.length}
      aria-valuenow={Math.round(done * 10) / 10}
      aria-valuetext={`${phases.find((p) => p.current)?.label ?? ""} step, ${Math.round((done / phases.length) * 100)}% through the lesson`}
    >
      <ol className="phases">
        {phases.map((p) => (
          <li key={p.label} className="phase" data-current={p.current}>
            <span className="phase-label">{p.label}</span>
            <span className="phase-bar">
              <span className="phase-fill" style={{ ["--fill" as string]: p.fill }} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Mastery ring: mastered (green) and learning (accent) segments of `total` questions.
 * The numbers are in the accessible name; colour is never the only signal (the legend says it too).
 */
export function MasteryRing({
  total,
  mastered,
  learning,
  size = 200,
  caption,
}: {
  total: number;
  mastered: number;
  learning: number;
  size?: number;
  caption?: string;
}) {
  const r = 80;
  const c = 2 * Math.PI * r;
  const m = total ? (mastered / total) * c : 0;
  const l = total ? (learning / total) * c : 0;
  const label = `${mastered} of ${total} mastered, ${learning} learning, ${total - mastered - learning} to review`;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={label}>
      <circle className="ring-track" cx="100" cy="100" r={r} strokeWidth="16" />
      <circle
        className="ring-seg-mastered"
        cx="100"
        cy="100"
        r={r}
        strokeWidth="16"
        strokeDasharray={`${m} ${c}`}
        transform="rotate(-90 100 100)"
      />
      <circle
        className="ring-seg-learning"
        cx="100"
        cy="100"
        r={r}
        strokeWidth="16"
        strokeDasharray={`${l} ${c}`}
        strokeDashoffset={-m}
        transform="rotate(-90 100 100)"
      />
      <text className="ring-num" x="100" y="104" textAnchor="middle">
        {mastered + learning}/{total}
      </text>
      <text className="ring-sub" x="100" y="126" textAnchor="middle">
        {caption ?? "answered right"}
      </text>
    </svg>
  );
}

type ThemePref = "system" | "light" | "dark";
const THEME_KEY = "hp-theme";

/** Inline script for <head>: applies the saved theme before first paint (no flash). */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function ThemeToggle() {
  // The init script has already applied any saved choice to <html data-theme>; read it back.
  const [pref, setPref] = useState<ThemePref>(() => {
    if (typeof document === "undefined") return "system";
    const t = document.documentElement.dataset.theme;
    return t === "light" || t === "dark" ? t : "system";
  });
  const next: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
  const shown: Record<ThemePref, string> = { system: "Auto", light: "Light", dark: "Dark" };
  const choose = () => {
    const p = next[pref];
    setPref(p);
    if (p === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = p;
    try {
      if (p === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, p);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      className="toplink"
      onClick={choose}
      // Starts with the visible word so voice control ("click Auto") works (WCAG 2.5.3).
      aria-label={`${shown[pref]} theme, switch to ${shown[next[pref]]}`}
      suppressHydrationWarning
    >
      {shown[pref]}
    </button>
  );
}
