import { describe, expect, it } from "vitest";

import { auditPermissionBundle as auditDeployedAgentBundle } from "../../../agents/lpRangeAgent/app/agent/src/permissionAudit.js";
import { canonicalJson } from "./canonical.js";
import { auditPermissionBundle } from "./permissionAudit.js";
import { permissionAuditFixtureBundle } from "./permissionAuditTestFixture.js";

describe("permission audit benchmark/deployed-agent parity", () => {
  it("produces byte-identical canonical output for safe and adversarial bundles", () => {
    const safe = permissionAuditFixtureBundle();
    expect(canonicalJson(auditDeployedAgentBundle(safe))).toBe(
      canonicalJson(auditPermissionBundle(safe))
    );

    const adversarial = permissionAuditFixtureBundle();
    const firstCase = adversarial.adversarialCorpus[0];
    if (firstCase === undefined) throw new Error("Missing adversarial fixture");
    firstCase.candidate = {
      ...firstCase.candidate,
      chainId: 56,
      dispatcher: "generic",
      revokePath: "missing",
      sessionSignerExposure: "raw-material",
      spendCaps: [],
      unknownOutcomePolicy: "retry-immediately"
    };
    expect(canonicalJson(auditDeployedAgentBundle(adversarial))).toBe(
      canonicalJson(auditPermissionBundle(adversarial))
    );
  });
});
