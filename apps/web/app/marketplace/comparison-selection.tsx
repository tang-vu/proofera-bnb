"use client";

import { useState, type FormEvent, type ReactNode } from "react";

const MINIMUM_SELECTION = 2;
const MAXIMUM_SELECTION = 4;

function countUniqueSelections(form: HTMLFormElement): number {
  const submitted = new FormData(form)
    .getAll("agent")
    .filter((value): value is string => typeof value === "string");
  return new Set(submitted).size;
}

export function comparisonSelectionState(count: number): {
  readonly canSubmit: boolean;
  readonly instruction: string;
} {
  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError("Comparison selection count must be a non-negative integer");
  }

  let instruction: string;
  if (count === 0) instruction = "Choose two to four agents.";
  else if (count === 1) instruction = "Choose at least one more agent.";
  else if (count <= MAXIMUM_SELECTION) instruction = "Ready to compare.";
  else {
    const excess = count - MAXIMUM_SELECTION;
    instruction = `Remove ${excess} ${excess === 1 ? "agent" : "agents"} to continue.`;
  }
  return {
    canSubmit: count >= MINIMUM_SELECTION && count <= MAXIMUM_SELECTION,
    instruction
  };
}

export function ComparisonSelectionForm({ children }: Readonly<{ children: ReactNode }>) {
  const [selectedCount, setSelectedCount] = useState(0);
  const selection = comparisonSelectionState(selectedCount);

  function updateSelection(event: FormEvent<HTMLFormElement>) {
    setSelectedCount(countUniqueSelections(event.currentTarget));
  }

  function guardSubmission(event: FormEvent<HTMLFormElement>) {
    if (!selection.canSubmit) event.preventDefault();
  }

  return (
    <form action="/compare" method="get" onChange={updateSelection} onSubmit={guardSubmission}>
      {children}
      <div className="compare-submit-bar">
        <div>
          <strong>Compare two to four</strong>
          <span
            aria-atomic="true"
            aria-live="polite"
            className="comparison-selection-status"
            id="comparison-selection-status"
          >
            {selectedCount} selected. {selection.instruction}
          </span>
          <span>Missing evidence stays visible side by side.</span>
        </div>
        <button
          aria-describedby="comparison-selection-status"
          className="button button-primary"
          disabled={!selection.canSubmit}
          type="submit"
        >
          Compare selected
        </button>
      </div>
    </form>
  );
}
