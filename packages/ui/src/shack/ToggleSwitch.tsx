"use client";

export interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  /** Words for each state, read aloud and shown (default "On"/"Off"). */
  onText?: string;
  offText?: string;
  disabled?: boolean;
}

/** Panel toggle switch: role="switch", Space/Enter toggles, the state is spoken and shown as text. */
export function ToggleSwitch({
  label,
  checked,
  onChange,
  onText = "On",
  offText = "Off",
  disabled,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-knob" />
      </span>
      <span>
        {label}: {checked ? onText : offText}
      </span>
    </button>
  );
}
