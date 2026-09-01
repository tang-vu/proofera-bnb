import { describe, expect, it } from "vitest";

import { hackathonSubmissionAudit } from "./hackathon-submission-audit";

describe("official hackathon submission audit", () => {
  it("retains the exact official deadline, main journey, and four required categories", () => {
    expect(hackathonSubmissionAudit.officialPage.endsAtUtc).toBe("2026-09-09T12:00:00Z");
    expect(hackathonSubmissionAudit.linkedForm.availabilityJudgingEndDateUtc).toBe("2026-09-23");
    expect(hackathonSubmissionAudit.officialPage.mainTrack.journey).toEqual([
      "land",
      "find",
      "understand",
      "activate"
    ]);
    expect(hackathonSubmissionAudit.officialPage.mainTrack.categories).toHaveLength(4);
    expect(hackathonSubmissionAudit.officialPage.mainTrack.agentsLiveOnBscRequired).toBe(true);
  });

  it("does not turn the linked form into a demo upload or completed submission", () => {
    expect(hackathonSubmissionAudit.linkedForm.projectFieldsPresent).toBe(true);
    expect(hackathonSubmissionAudit.linkedForm.demoFieldPresent).toBe(false);
    expect(hackathonSubmissionAudit.linkedForm.evidenceFieldPresent).toBe(false);
    expect(hackathonSubmissionAudit.linkedForm.altanaTrackOptionPresent).toBe(false);
    expect(hackathonSubmissionAudit.classification.submissionCompleted).toBe(false);
    expect(hackathonSubmissionAudit.classification.rawResponseRetained).toBe(false);
  });

  it("retains the observed public blockers instead of inferring readiness", () => {
    expect(hackathonSubmissionAudit.candidateObservation.publicProduct.readiness).toEqual({
      activation: "unavailable",
      readyForActivation: false,
      readyForJudging: false,
      status: "not_ready"
    });
    expect(hackathonSubmissionAudit.candidateObservation.sourceRepository).toMatchObject({
      authenticatedVisibility: "PRIVATE",
      publicSourceVerified: false
    });
  });
});
