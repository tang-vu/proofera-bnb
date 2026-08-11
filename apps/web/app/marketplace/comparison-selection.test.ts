import { describe, expect, it } from "vitest";

import { comparisonSelectionState } from "./comparison-selection";

describe("comparisonSelectionState", () => {
  it.each([
    [0, false, "Choose two to four agents."],
    [1, false, "Choose at least one more agent."],
    [2, true, "Ready to compare."],
    [4, true, "Ready to compare."],
    [5, false, "Remove 1 agent to continue."],
    [6, false, "Remove 2 agents to continue."]
  ] as const)(
    "maps %i selections without weakening the 2–4 bound",
    (count, canSubmit, instruction) => {
      expect(comparisonSelectionState(count)).toEqual({ canSubmit, instruction });
    }
  );

  it("rejects impossible counts", () => {
    expect(() => comparisonSelectionState(-1)).toThrow(/non-negative integer/i);
    expect(() => comparisonSelectionState(1.5)).toThrow(/non-negative integer/i);
  });
});
