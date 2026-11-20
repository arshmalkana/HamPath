"use client";
import { useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from "react";

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

const THEME_KEY = "hp-theme";

/** Inline script for <head>: applies the saved theme before first paint (no flash). */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const THEME_EVENT = "hp-theme-change";

/** Re-read the theme when the device setting changes or the switch is used. */
function subscribeTheme(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

/** The theme in effect: the saved choice, or the device's setting when nothing is saved. */
function effectiveDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Light/dark switch: a sun and a moon with a highlight under the active one. Until the learner
 * picks, it follows the device. The highlight's position comes from CSS (html[data-theme] and
 * prefers-color-scheme), so it's right from first paint; aria-checked is synced once mounted.
 */
export function ThemeToggle() {
  // null on the server (it can't know); the device setting and the saved choice in the browser.
  const dark = useSyncExternalStore(subscribeTheme, effectiveDark, () => null);
  const toggle = () => {
    const next = !effectiveDark();
    const value = next ? "dark" : "light";
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  return (
    <button
      type="button"
      role="switch"
      className="theme-switch"
      aria-checked={dark ?? undefined}
      aria-label="Dark theme"
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
      suppressHydrationWarning
    >
      <span className="theme-switch-knob" aria-hidden="true" />
      <svg className="theme-switch-icon theme-switch-sun" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7" />
      </svg>
      <svg className="theme-switch-icon theme-switch-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 14.6A8.4 8.4 0 0 1 9.4 4a8.4 8.4 0 1 0 10.6 10.6Z" />
      </svg>
    </button>
  );
}
