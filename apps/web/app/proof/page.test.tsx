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
    expect(html).toContain('data-gate-id="termix-pairs" data-gate-state="verified"');
    expect(html).toContain(
      'data-gate-id="pancake-benefit" data-gate-state="controlled_outcome_observed"'
    );
    expect(html).toContain('data-gate-id="demo" data-gate-state="recorded_pending_human_playback"');
    expect(html).toContain("325.014-second MiMo narrated MP4");
    expect(html).toContain("proofera-final-demo.mp4");
    expect(html).toContain("automated playback check");
    expect(html).toContain("controlled test-fixture LP position");
    expect(html).toContain("No fee income, price movement or liquidity change was observed");
    expect(html).toContain("residual PTA allowance is zero");
    expect(html).toContain("Both lanes scored 100/100 on all three bounded tasks");
    expect(html).toContain("Three paired tasks. Mixed timing. Quality parity.");
    expect(html).toContain("Pancake LP boundary decision");
    expect(html).toContain("Altana permission-security audit");
    expect(html).toContain("Venus health-factor decision");
    expect(html).toContain("Agent faster");
    expect(html).toContain("Manual faster");
    expect(html).toContain("paired report");
    expect(html).toContain("raw runs");
    expect(html).toContain("adjudication");
    for (const agentId of ["1825", "1826", "1827", "1828"]) {
      expect(html).toContain(`Agent ID ${agentId}`);
    }
    expect(html).toContain("Finalized paid hire receipts 2");
    expect(html).toContain("Finalized paid hire receipts 1");
    expect(html).toContain("What the official page requires — and what remains.");
    expect(html).toContain("Analysis activation live");
    expect(html).toContain("Marketplace-to-Studio handoff");
    expect(html).toContain("not autonomous capital execution");
    expect(html).toContain("Build the Era Hackathon Registration");
    expect(html).toContain("PancakeSwap, AltLayer, TermiX, Not sure");
    expect(html).toContain("Verified — repository and demo return 200");
    expect(html).toContain("raw 37,636,488-byte MP4");
    expect(html).toContain("https://github.com/tang-vu/proofera-bnb/blob/");
  });

  it("does not render successful receipt or submission claims from the incomplete ledger", () => {
    const html = renderToStaticMarkup(<ProofRoomPage />);

    expect(html).not.toContain('Submission-ready</dt><dd class="verified');
    expect(html).not.toContain("Execution verified");
    expect(html).not.toContain("TermiX advantage verified");
  });
});
