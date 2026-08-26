import { describe, expect, it } from "vitest";

import {
  verifiedAltanaLifecycle,
  verifiedReferenceEvidence,
  verifiedReferenceEvidenceForCategory,
  verifiedTermixPairs
} from "./verified-submission-evidence";

describe("verified submission evidence projections", () => {
  it("joins exactly four finalized identities without promoting execution", () => {
    expect(verifiedReferenceEvidence).toHaveLength(4);
    expect(verifiedReferenceEvidence.map((item) => item.agentId)).toEqual([
      "1825",
      "1826",
      "1827",
      "1828"
    ]);
    expect(verifiedReferenceEvidenceForCategory("lp-rebalancing").paidHireReceipts).toHaveLength(2);
    expect(
      verifiedReferenceEvidenceForCategory("health-factor-monitoring").paidHireReceipts
    ).toHaveLength(1);
    expect(verifiedReferenceEvidenceForCategory("grid-trading").paidHireReceipts).toHaveLength(0);
  });

  it("projects the verified Altana grant-execute-revoke lifecycle as historical and revoked", () => {
    expect(verifiedAltanaLifecycle).toMatchObject({
      chainId: 97,
      applicationAmountRaw: "0",
      finalAuthorityAbsent: true,
      finalAuthorityAbsenceProviderCount: 2,
      historicalAuthorityProviderCount: 1,
      taskEffect: "PTA Approval(owner, session, 0) only"
    });
    expect(verifiedAltanaLifecycle.grantTransactionHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(verifiedAltanaLifecycle.executeTransactionHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(verifiedAltanaLifecycle.revokeTransactionHash).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  it("keeps the three TermiX comparisons task-specific", () => {
    expect(verifiedTermixPairs).toHaveLength(3);
    expect(verifiedTermixPairs.map((pair) => pair.timingWinner)).toEqual([
      "agent",
      "manual",
      "manual"
    ]);
    for (const pair of verifiedTermixPairs) {
      expect(pair).toMatchObject({
        agentQualityPoints: 100,
        manualQualityPoints: 100,
        maximumQualityPoints: 100,
        agentCostMinorUnits: "0",
        manualCostMinorUnits: "0"
      });
    }
  });
});
