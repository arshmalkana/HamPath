"use client";
import { meterLabVariables, type OhmsLabState } from "@hampath/ham-sim";
import { OhmsLawLab } from "./OhmsLawLab";
import type { LabBodyProps } from "./registry";

/**
 * LAB-25 Meter Lab: the LAB-20 breadboard with the battery and resistor already wired; the learner
 * places the ammeter and voltmeter (right or wrong) and sees what each instrument does to the circuit.
 */
export function MeterLab({ config, mode, onState }: LabBodyProps) {
  return (
    <OhmsLawLab
      config={{
        ...config,
        build: true,
        preplaced: { source: "battery", load: "resistor" },
        tray: ["ammeter", "voltmeter"],
      }}
      mode={mode}
      onState={(_vars, state) => onState(meterLabVariables(state as unknown as OhmsLabState), state)}
    />
  );
}
