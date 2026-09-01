import { describe, expect, it } from "vitest";

import { publicSourceAccess } from "./public-source-access";

describe("public source access evidence", () => {
  it("binds anonymous access to the repository, exact commit, README and final demo", () => {
    expect(publicSourceAccess.repository).toMatchObject({
      visibility: "PUBLIC",
      observedCommit: "7ad4a8ef3f361bcb8e5dae27d516b3e6f27f5641"
    });
    expect(publicSourceAccess.anonymousHeadObservations).toHaveLength(6);
    expect(
      publicSourceAccess.anonymousHeadObservations.every(({ httpStatus }) => httpStatus === 200)
    ).toBe(true);
    expect(publicSourceAccess.rawFinalDemo.contentLengthBytes).toBe(37_636_488);
  });

  it("does not promote source access into submission or uptime evidence", () => {
    expect(publicSourceAccess.classification).toMatchObject({
      boundedObservationOnly: true,
      organizerReceipt: false,
      submissionCompleted: false,
      freshRevalidationRequired: true
    });
  });
});
