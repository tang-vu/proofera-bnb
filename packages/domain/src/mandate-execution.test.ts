import { describe, expect, it } from "vitest";

import {
  evaluateMandateAction,
  sessionMandateSchema,
  type MandateActionRequest,
  type MandateExecutionContext,
  type SessionMandate
} from "./mandate-execution";

const wallet = "0x1111111111111111111111111111111111111111";
const sessionKey = "0x2222222222222222222222222222222222222222";
const target = "0x3333333333333333333333333333333333333333";
const token = "0x4444444444444444444444444444444444444444";
const policyHash = `0x${"aa".repeat(32)}`;

function mandate(): SessionMandate {
  return {
    schemaVersion: 1,
    chainId: 97,
    wallet,
    sessionKey,
    policyHash,
    status: "active",
    expiresAtUnixSeconds: 2_000,
    allowedCalls: [{ to: target, selector: "0x12345678" }],
    spendCaps: [{ token, limitRaw: "1000", usedRaw: "100" }],
    maxExecutionsPerDay: 4,
    executionsToday: 1,
    consumedIdempotencyKeys: ["previous-action"],
    userCanPause: true,
    userCanRevoke: true
  };
}

function request(): MandateActionRequest {
  return {
    chainId: 97,
    to: target,
    selector: "0x12345678",
    spends: [{ token, amountRaw: "200" }],
    idempotencyKey: "next-action",
    quoteObservedAtUnixSeconds: 1_000,
    quoteValidUntilUnixSeconds: 1_300,
    transactionDeadlineUnixSeconds: 1_250
  };
}

function context(): MandateExecutionContext {
  return {
    nowUnixSeconds: 1_100,
    maxQuoteAgeSeconds: 120,
    runtimePolicyHash: policyHash,
    runtimeWallet: wallet,
    calldataConstraintsVerified: true,
    simulation: "succeeded"
  };
}

describe("evaluateMandateAction", () => {
  it("authorizes an exact in-mandate action without another owner signature", () => {
    expect(evaluateMandateAction(mandate(), request(), context())).toEqual({
      canSubmit: true,
      decision: "authorized_without_new_signature",
      issues: [],
      ownerPresenceRequired: false
    });
  });

  it("requires a fresh grant only for authority or scope expansion", () => {
    const expired = evaluateMandateAction(
      { ...mandate(), status: "revoked" },
      request(),
      context()
    );
    expect(expired.decision).toBe("requires_new_grant");
    expect(expired.ownerPresenceRequired).toBe(true);
    expect(expired.issues.map((issue) => issue.code)).toContain("MANDATE_REVOKED");

    const outside = evaluateMandateAction(
      mandate(),
      { ...request(), selector: "0x87654321" },
      context()
    );
    expect(outside.decision).toBe("requires_new_grant");
    expect(outside.issues.map((issue) => issue.code)).toContain("CALL_OUTSIDE_SCOPE");
  });

  it("blocks paused, stale, duplicate, unsimulated, and unverified actions without prompting", () => {
    const result = evaluateMandateAction(
      {
        ...mandate(),
        status: "paused",
        executionsToday: 4,
        consumedIdempotencyKeys: ["next-action"]
      },
      request(),
      {
        ...context(),
        nowUnixSeconds: 1_201,
        calldataConstraintsVerified: false,
        simulation: "unavailable"
      }
    );

    expect(result.decision).toBe("blocked");
    expect(result.ownerPresenceRequired).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "MANDATE_PAUSED",
        "EXECUTION_LIMIT_REACHED",
        "IDEMPOTENCY_ALREADY_USED",
        "QUOTE_STALE",
        "CALLDATA_CONSTRAINTS_UNVERIFIED",
        "SIMULATION_NOT_SUCCEEDED"
      ])
    );
  });

  it("aggregates spends and requires a new grant before a cap can be exceeded", () => {
    const result = evaluateMandateAction(
      mandate(),
      {
        ...request(),
        spends: [
          { token, amountRaw: "500" },
          { token, amountRaw: "401" }
        ]
      },
      context()
    );

    expect(result.decision).toBe("requires_new_grant");
    expect(result.issues.map((issue) => issue.code)).toContain("SPEND_EXCEEDS_CAP");
  });

  it("rejects duplicate scope and impossible consumed-cap state at the schema boundary", () => {
    const base = mandate();
    expect(
      sessionMandateSchema.safeParse({
        ...base,
        allowedCalls: [...base.allowedCalls, ...base.allowedCalls]
      }).success
    ).toBe(false);
    expect(
      sessionMandateSchema.safeParse({
        ...base,
        spendCaps: [{ token, limitRaw: "100", usedRaw: "101" }]
      }).success
    ).toBe(false);
    expect(
      sessionMandateSchema.safeParse({
        ...base,
        spendCaps: [{ token, limitRaw: (1n << 256n).toString(), usedRaw: "0" }]
      }).success
    ).toBe(false);
  });
});
