import { describe, expect, it } from "vitest";
import { readContentTree } from "@hampath/content";
import { LAB_REGISTRY } from "./registry";

describe("lab registry", () => {
  it("has all 35 labs, matching content/labs.yaml ids and names", () => {
    const catalogue = readContentTree().labs;
    expect(LAB_REGISTRY.map((l) => [l.id, l.name])).toEqual(catalogue.map((l) => [l.id, l.name]));
    expect(LAB_REGISTRY).toHaveLength(35);
  });

  it("has a component exactly for the labs the catalogue marks as built", () => {
    const built = readContentTree().labs.filter((l) => l.component).map((l) => l.id);
    expect(LAB_REGISTRY.filter((l) => l.component).map((l) => l.id)).toEqual(built);
  });
});
