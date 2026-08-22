import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ProofRoomPage from "./page";

describe("Proof room", () => {
  it("renders all seven closure gates and the exact public agent skills", () => {
    const html = renderToStaticMarkup(<ProofRoomPage />);

    for (const gate of [
      "production release",
      "agent registration",
      "altana lifecycle",
      "pancake benefit",
      "termix pairs",
      "demo",
      "submission"
    ]) {
      expect(html).toContain(gate);
    }
    for (const skill of [
      "analyze_lp_range",
      "audit_altana_permission_bundle",
      "analyze_grid_trading",
      "analyze_yield_opportunities",
      "analyze_venus_health_factor"
    ]) {
      expect(html).toContain(skill);
    }
    expect(html).toContain("No — gates remain open");
    expect(html).toContain("BSC-testnet registration verified");
    expect(html).toContain("all six raw lanes are retained");
    expect(html).toContain("permission audit unverified pair");
    expect(html).toContain("permission audit non independent review");
    for (const agentId of ["1825", "1826", "1827", "1828"]) {
      expect(html).toContain(`Agent ID ${agentId}`);
    }
  });

  it("does not render successful receipt or submission claims from the incomplete ledger", () => {
    const html = renderToStaticMarkup(<ProofRoomPage />);

    expect(html).not.toContain('Submission-ready</dt><dd class="verified');
    expect(html).not.toContain("Execution verified");
    expect(html).not.toContain("TermiX advantage verified");
  });
});
