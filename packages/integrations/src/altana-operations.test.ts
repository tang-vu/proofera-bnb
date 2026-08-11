import type { ExecuteResult } from "@altananetwork/sdk";
import { describe, expect, it } from "vitest";

import {
  AltanaOperationTransitionError,
  altanaExecuteOperationStateSchema,
  altanaRevokeOperationStateSchema,
  beginAltanaExecute,
  beginAltanaRevoke,
  canRetryAltanaOperation,
  createReadyAltanaExecute,
  createReadyAltanaRevoke,
  isAltanaRevokeFinal,
  reconcileAltanaExecuteCall,
  reconcileAltanaRevokeAuthority,
  reconcileAltanaRevokeCall,
  settleAltanaExecuteSubmission,
  settleAltanaRevokeSubmission,
  type AltanaOperationTransitionErrorCode,
  type AltanaRevokeOperationState,
  type ExecuteAuthorization,
  type SessionAuthorityObservation
} from "./altana-operations.js";

const WALLET = "0x1111111111111111111111111111111111111111";
const SESSION_KEY = "0x2222222222222222222222222222222222222222";
const OTHER_SESSION_KEY = "0x3333333333333333333333333333333333333333";
const POLICY_HASH = `0x${"aa".repeat(32)}`;
const OTHER_POLICY_HASH = `0x${"bb".repeat(32)}`;
const CALLS_ID = `0x${"11".repeat(32)}` as `0x${string}`;
const OTHER_CALLS_ID = `0x${"22".repeat(32)}` as `0x${string}`;
const TRANSACTION_HASH = `0x${"33".repeat(32)}` as `0x${string}`;
const CREATED_AT = "2026-08-11T12:00:00.000Z";
const AUTHORITY_AT = "2026-08-11T12:00:30.000Z";
const SUBMITTED_AT = "2026-08-11T12:01:00.000Z";
const SETTLED_AT = "2026-08-11T12:02:00.000Z";
const RECONCILED_AT = "2026-08-11T12:03:00.000Z";
const SESSION_EXPIRY = Math.floor(Date.parse("2026-08-11T13:00:00.000Z") / 1_000);

const executeSpec = () => ({
  schemaVersion: 1 as const,
  kind: "execute" as const,
  chainId: 97 as const,
  walletAddress: WALLET,
  sessionKeyAddress: SESSION_KEY,
  sessionExpiry: SESSION_EXPIRY,
  policyHash: POLICY_HASH,
  operationId: "execute:lp-rebalance:0001",
  idempotencyKey: "execute:wallet-1:policy-a:0001",
  createdAt: CREATED_AT
});

const revokeSpec = () => ({
  ...executeSpec(),
  kind: "revoke" as const,
  operationId: "revoke:session-key:0001",
  idempotencyKey: "revoke:wallet-1:session-key:0001"
});

function authority(
  status: SessionAuthorityObservation["status"] = "present_exact",
  observedAt = AUTHORITY_AT
): SessionAuthorityObservation {
  return {
    status,
    observedAt,
    walletAddress: WALLET,
    sessionKeyAddress: SESSION_KEY,
    policyHash: POLICY_HASH
  };
}

function authorization(overrides: Partial<ExecuteAuthorization> = {}): ExecuteAuthorization {
  return {
    asOf: SUBMITTED_AT,
    maximumAuthorityAgeSeconds: 300,
    revocationStatus: "active",
    authority: authority(),
    ...overrides
  };
}

function executeSubmitting() {
  return beginAltanaExecute(createReadyAltanaExecute(executeSpec()), authorization());
}

function revokeSubmitting() {
  return beginAltanaRevoke(createReadyAltanaRevoke(revokeSpec()), SUBMITTED_AT);
}

function expectTransitionError(
  operation: () => unknown,
  code: AltanaOperationTransitionErrorCode
): void {
  try {
    operation();
    throw new Error(`Expected transition error ${code}.`);
  } catch (error) {
    if (!(error instanceof AltanaOperationTransitionError)) throw error;
    expect(error.code).toBe(code);
  }
}

describe("Altana execute lifecycle", () => {
  it("survives crash/reload and blocks a second-click begin with stable keys", () => {
    const ready = createReadyAltanaExecute(executeSpec());
    const submitting = beginAltanaExecute(ready, authorization());
    const reloaded = altanaExecuteOperationStateSchema.parse(
      JSON.parse(JSON.stringify(submitting))
    );

    expect(reloaded).toMatchObject({
      status: "submitting",
      operationId: ready.operationId,
      idempotencyKey: ready.idempotencyKey,
      policyHash: ready.policyHash
    });
    expectTransitionError(
      () => beginAltanaExecute(reloaded, authorization()),
      "INVALID_TRANSITION"
    );
  });

  it.each([
    ["present_mismatch", "AUTHORITY_NOT_EXACT"],
    ["absent", "AUTHORITY_ABSENT"],
    ["unavailable", "AUTHORITY_NOT_EXACT"]
  ] as const)("blocks execution when authority is %s", (status, code) => {
    const ready = createReadyAltanaExecute(executeSpec());
    expectTransitionError(
      () => beginAltanaExecute(ready, authorization({ authority: authority(status) })),
      code
    );
  });

  it("blocks stale, future, or policy-mismatched authority observations", () => {
    const ready = createReadyAltanaExecute(executeSpec());
    expectTransitionError(
      () =>
        beginAltanaExecute(
          ready,
          authorization({ authority: authority("present_exact", "2026-08-11T11:50:00.000Z") })
        ),
      "AUTHORITY_PROBE_STALE"
    );
    expectTransitionError(
      () =>
        beginAltanaExecute(
          ready,
          authorization({ authority: authority("present_exact", "2026-08-11T12:01:00.001Z") })
        ),
      "AUTHORITY_PROBE_FROM_FUTURE"
    );
    expectTransitionError(
      () =>
        beginAltanaExecute(
          ready,
          authorization({ authority: { ...authority(), policyHash: OTHER_POLICY_HASH } })
        ),
      "AUTHORITY_BINDING_MISMATCH"
    );
  });

  it.each([
    ["revoke_in_progress", "REVOCATION_IN_PROGRESS"],
    ["revoked", "SESSION_REVOKED"]
  ] as const)("blocks execution when revocation state is %s", (revocationStatus, code) => {
    expectTransitionError(
      () =>
        beginAltanaExecute(
          createReadyAltanaExecute(executeSpec()),
          authorization({ revocationStatus })
        ),
      code
    );
  });

  it("blocks execution at session expiry even with exact authority", () => {
    const expiredSpec = {
      ...executeSpec(),
      sessionExpiry: Math.floor(Date.parse(SUBMITTED_AT) / 1_000)
    };
    expectTransitionError(
      () => beginAltanaExecute(createReadyAltanaExecute(expiredSpec), authorization()),
      "SESSION_EXPIRED"
    );
  });

  it("models exact SDK PENDING, FAILED, and CONFIRMED results", () => {
    const pendingResult = {
      callsId: CALLS_ID,
      status: "PENDING"
    } satisfies ExecuteResult;
    const failedResult = {
      callsId: CALLS_ID,
      status: "FAILED"
    } satisfies ExecuteResult;
    const confirmedResult = {
      callsId: CALLS_ID,
      status: "CONFIRMED",
      transactionHash: TRANSACTION_HASH
    } satisfies ExecuteResult;

    expect(
      settleAltanaExecuteSubmission(
        executeSubmitting(),
        { kind: "returned", result: pendingResult },
        SETTLED_AT
      )
    ).toMatchObject({ status: "pending", callsId: CALLS_ID, transactionHash: null });

    const failed = settleAltanaExecuteSubmission(
      executeSubmitting(),
      { kind: "returned", result: failedResult },
      SETTLED_AT
    );
    expect(failed).toMatchObject({
      status: "failed",
      callsId: CALLS_ID,
      transactionHash: null,
      retryable: false
    });
    expect(canRetryAltanaOperation(failed)).toBe(false);

    expect(
      settleAltanaExecuteSubmission(
        executeSubmitting(),
        { kind: "returned", result: confirmedResult },
        SETTLED_AT
      )
    ).toMatchObject({
      status: "confirmed",
      callsId: CALLS_ID,
      transactionHash: TRANSACTION_HASH
    });
  });

  it("models explicit rejection and ambiguous throws as non-retryable", () => {
    const rejected = settleAltanaExecuteSubmission(
      executeSubmitting(),
      { kind: "rejected", reason: "User rejected the request." },
      SETTLED_AT
    );
    expect(rejected).toMatchObject({ status: "rejected", retryable: false });
    expect(canRetryAltanaOperation(rejected)).toBe(false);

    const unknown = settleAltanaExecuteSubmission(
      executeSubmitting(),
      { kind: "threw", reason: "Relay connection ended after submit." },
      SETTLED_AT
    );
    expect(unknown).toMatchObject({
      status: "outcome_unknown",
      callsId: null,
      transactionHash: null,
      callStatusProbeRequired: true,
      retryable: false
    });
    expect(canRetryAltanaOperation(unknown)).toBe(false);
    expectTransitionError(() => beginAltanaExecute(unknown, authorization()), "INVALID_TRANSITION");
  });

  it("preserves a valid callsId from a malformed result without inventing a tx hash", () => {
    const malformed = settleAltanaExecuteSubmission(
      executeSubmitting(),
      {
        kind: "returned",
        result: { callsId: CALLS_ID, status: "CONFIRMED", transactionHash: "not-a-hash" }
      },
      SETTLED_AT
    );

    expect(malformed).toMatchObject({
      status: "outcome_unknown",
      reason: "malformed_sdk_result",
      callsId: CALLS_ID,
      transactionHash: null,
      retryable: false
    });
  });

  it("reconciles the exact callsId after reload and never fabricates a transaction hash", () => {
    const pending = settleAltanaExecuteSubmission(
      executeSubmitting(),
      { kind: "returned", result: { callsId: CALLS_ID, status: "PENDING" } },
      SETTLED_AT
    );
    const reloaded = altanaExecuteOperationStateSchema.parse(JSON.parse(JSON.stringify(pending)));
    const confirmed = reconcileAltanaExecuteCall(
      reloaded,
      { callsId: CALLS_ID, status: "CONFIRMED" },
      RECONCILED_AT
    );

    expect(confirmed).toMatchObject({
      status: "confirmed",
      callsId: CALLS_ID,
      transactionHash: null,
      operationId: pending.operationId,
      idempotencyKey: pending.idempotencyKey,
      policyHash: pending.policyHash
    });
  });

  it("rejects cross-operation call reconciliation and malformed status observations", () => {
    const pending = settleAltanaExecuteSubmission(
      executeSubmitting(),
      { kind: "returned", result: { callsId: CALLS_ID, status: "PENDING" } },
      SETTLED_AT
    );
    expectTransitionError(
      () =>
        reconcileAltanaExecuteCall(
          pending,
          { callsId: OTHER_CALLS_ID, status: "CONFIRMED" },
          RECONCILED_AT
        ),
      "CALLS_ID_MISMATCH"
    );
    expect(
      reconcileAltanaExecuteCall(pending, { callsId: CALLS_ID, status: "UNKNOWN" }, RECONCILED_AT)
    ).toMatchObject({ status: "outcome_unknown", reason: "malformed_call_status" });
  });

  it("rejects private or unreviewed fields in serialized execute state", () => {
    const state = createReadyAltanaExecute(executeSpec());
    expect(
      altanaExecuteOperationStateSchema.safeParse({ ...state, privateKey: "0xsecret" }).success
    ).toBe(false);
  });

  it("rejects serialized execute timestamps outside the operation chronology", () => {
    const submitting = executeSubmitting();
    expect(
      altanaExecuteOperationStateSchema.safeParse({
        ...submitting,
        submittedAt: "2026-08-11T11:59:59.999Z"
      }).success
    ).toBe(false);
  });
});

describe("Altana revoke lifecycle", () => {
  function confirmedRelayRevoke(): AltanaRevokeOperationState {
    const result = {
      callsId: CALLS_ID,
      status: "CONFIRMED",
      transactionHash: TRANSACTION_HASH
    } satisfies ExecuteResult;
    return settleAltanaRevokeSubmission(
      revokeSubmitting(),
      { kind: "returned", result },
      SETTLED_AT
    );
  }

  it("keeps a relay-confirmed revoke pending until a fresh absent-authority probe", () => {
    const relayConfirmed = confirmedRelayRevoke();
    expect(relayConfirmed).toMatchObject({
      status: "pending",
      relayStatus: "confirmed",
      authorityStatus: "probe_required",
      callsId: CALLS_ID,
      transactionHash: TRANSACTION_HASH
    });
    expect(isAltanaRevokeFinal(relayConfirmed)).toBe(false);

    const revoked = reconcileAltanaRevokeAuthority(
      relayConfirmed,
      authority("absent", "2026-08-11T12:02:30.000Z"),
      { asOf: RECONCILED_AT, maximumAuthorityAgeSeconds: 300 }
    );
    expect(revoked).toMatchObject({
      status: "confirmed",
      confirmation: "fresh_authority_absent",
      callsId: CALLS_ID,
      transactionHash: TRANSACTION_HASH,
      authorityObservedAt: "2026-08-11T12:02:30.000Z"
    });
    expect(isAltanaRevokeFinal(revoked)).toBe(true);
  });

  it("keeps authority active when a fresh probe still finds the exact key", () => {
    const pending = confirmedRelayRevoke();
    const stillPresent = reconcileAltanaRevokeAuthority(
      pending,
      authority("present_exact", "2026-08-11T12:02:30.000Z"),
      { asOf: RECONCILED_AT, maximumAuthorityAgeSeconds: 300 }
    );

    expect(stillPresent).toMatchObject({
      status: "pending",
      relayStatus: "confirmed",
      authorityStatus: "present"
    });
    expect(isAltanaRevokeFinal(stillPresent)).toBe(false);
  });

  it.each([
    ["present_mismatch", "authority_mismatch"],
    ["unavailable", "authority_probe_unavailable"]
  ] as const)("does not finalize a %s authority observation", (status, reason) => {
    const result = reconcileAltanaRevokeAuthority(
      confirmedRelayRevoke(),
      authority(status, "2026-08-11T12:02:30.000Z"),
      { asOf: RECONCILED_AT, maximumAuthorityAgeSeconds: 300 }
    );
    expect(result).toMatchObject({
      status: "outcome_unknown",
      reason,
      authorityProbeRequired: true,
      retryable: false
    });
    expect(isAltanaRevokeFinal(result)).toBe(false);
  });

  it("does not finalize a stale or future absent-authority probe", () => {
    const pending = confirmedRelayRevoke();
    const stale = reconcileAltanaRevokeAuthority(
      pending,
      authority("absent", "2026-08-11T11:00:00.000Z"),
      { asOf: RECONCILED_AT, maximumAuthorityAgeSeconds: 300 }
    );
    expect(stale).toMatchObject({
      status: "outcome_unknown",
      reason: "authority_probe_stale"
    });
    expect(isAltanaRevokeFinal(stale)).toBe(false);

    const future = reconcileAltanaRevokeAuthority(
      pending,
      authority("absent", "2026-08-11T12:03:00.001Z"),
      { asOf: RECONCILED_AT, maximumAuthorityAgeSeconds: 300 }
    );
    expect(future).toMatchObject({
      status: "outcome_unknown",
      reason: "authority_probe_from_future"
    });
    expect(isAltanaRevokeFinal(future)).toBe(false);
  });

  it("rejects an authority observation bound to another session or policy", () => {
    const pending = confirmedRelayRevoke();
    expectTransitionError(
      () =>
        reconcileAltanaRevokeAuthority(
          pending,
          { ...authority("absent"), sessionKeyAddress: OTHER_SESSION_KEY },
          { asOf: RECONCILED_AT, maximumAuthorityAgeSeconds: 300 }
        ),
      "AUTHORITY_BINDING_MISMATCH"
    );
  });

  it("models pending and failed relay results without assuming revocation", () => {
    const pending = settleAltanaRevokeSubmission(
      revokeSubmitting(),
      { kind: "returned", result: { callsId: CALLS_ID, status: "PENDING" } },
      SETTLED_AT
    );
    expect(pending).toMatchObject({
      status: "pending",
      relayStatus: "pending",
      callsId: CALLS_ID,
      transactionHash: null
    });
    expect(isAltanaRevokeFinal(pending)).toBe(false);

    const failed = settleAltanaRevokeSubmission(
      revokeSubmitting(),
      { kind: "returned", result: { callsId: CALLS_ID, status: "FAILED" } },
      SETTLED_AT
    );
    expect(failed).toMatchObject({ status: "failed", retryable: false });
    expect(isAltanaRevokeFinal(failed)).toBe(false);
    expect(canRetryAltanaOperation(failed)).toBe(false);
  });

  it("handles rejection, throws, and malformed SDK results without retry or fake hashes", () => {
    const rejected = settleAltanaRevokeSubmission(
      revokeSubmitting(),
      { kind: "rejected", reason: "Passkey request rejected." },
      SETTLED_AT
    );
    expect(rejected).toMatchObject({ status: "rejected", retryable: false });

    const threw = settleAltanaRevokeSubmission(
      revokeSubmitting(),
      { kind: "threw", reason: "Relay disconnected after signing." },
      SETTLED_AT
    );
    expect(threw).toMatchObject({
      status: "outcome_unknown",
      callsId: null,
      transactionHash: null,
      retryable: false
    });

    const malformed = settleAltanaRevokeSubmission(
      revokeSubmitting(),
      { kind: "returned", result: { callsId: CALLS_ID, status: "SUCCESS" } },
      SETTLED_AT
    );
    expect(malformed).toMatchObject({
      status: "outcome_unknown",
      reason: "malformed_sdk_result",
      callsId: CALLS_ID,
      transactionHash: null,
      retryable: false
    });
  });

  it("can prove revocation by fresh absence even after an ambiguous throw", () => {
    const unknown = settleAltanaRevokeSubmission(
      revokeSubmitting(),
      { kind: "threw", reason: "Relay disconnected after signing." },
      SETTLED_AT
    );
    const confirmed = reconcileAltanaRevokeAuthority(
      unknown,
      authority("absent", "2026-08-11T12:02:30.000Z"),
      { asOf: RECONCILED_AT, maximumAuthorityAgeSeconds: 300 }
    );

    expect(confirmed).toMatchObject({
      status: "confirmed",
      callsId: null,
      transactionHash: null,
      confirmation: "fresh_authority_absent"
    });
  });

  it("survives reload, reconciles the same callsId, but remains non-final", () => {
    const pending = settleAltanaRevokeSubmission(
      revokeSubmitting(),
      { kind: "returned", result: { callsId: CALLS_ID, status: "PENDING" } },
      SETTLED_AT
    );
    const reloaded = altanaRevokeOperationStateSchema.parse(JSON.parse(JSON.stringify(pending)));
    const relayConfirmed = reconcileAltanaRevokeCall(
      reloaded,
      { callsId: CALLS_ID, status: "CONFIRMED" },
      RECONCILED_AT
    );

    expect(relayConfirmed).toMatchObject({
      status: "pending",
      relayStatus: "confirmed",
      callsId: CALLS_ID,
      transactionHash: null,
      operationId: pending.operationId,
      idempotencyKey: pending.idempotencyKey,
      policyHash: pending.policyHash
    });
    expect(isAltanaRevokeFinal(relayConfirmed)).toBe(false);
  });

  it("blocks duplicate begin and every retry path", () => {
    const submitting = revokeSubmitting();
    expectTransitionError(() => beginAltanaRevoke(submitting, SETTLED_AT), "INVALID_TRANSITION");

    const failed = settleAltanaRevokeSubmission(
      submitting,
      { kind: "returned", result: { callsId: CALLS_ID, status: "FAILED" } },
      SETTLED_AT
    );
    expect(canRetryAltanaOperation(failed)).toBe(false);
    expectTransitionError(() => beginAltanaRevoke(failed, RECONCILED_AT), "INVALID_TRANSITION");
  });

  it("rejects cross-operation call status during revoke reconciliation", () => {
    const pending = settleAltanaRevokeSubmission(
      revokeSubmitting(),
      { kind: "returned", result: { callsId: CALLS_ID, status: "PENDING" } },
      SETTLED_AT
    );
    expectTransitionError(
      () =>
        reconcileAltanaRevokeCall(
          pending,
          { callsId: OTHER_CALLS_ID, status: "CONFIRMED" },
          RECONCILED_AT
        ),
      "CALLS_ID_MISMATCH"
    );
  });

  it("rejects private or extra fields in serialized revoke state", () => {
    const state = createReadyAltanaRevoke(revokeSpec());
    expect(
      altanaRevokeOperationStateSchema.safeParse({ ...state, sessionPrivateKey: "secret" }).success
    ).toBe(false);
  });

  it("rejects pre-submission authority evidence in serialized revoked state", () => {
    const relayConfirmed = confirmedRelayRevoke();
    const revoked = reconcileAltanaRevokeAuthority(
      relayConfirmed,
      authority("absent", "2026-08-11T12:02:30.000Z"),
      { asOf: RECONCILED_AT, maximumAuthorityAgeSeconds: 300 }
    );

    expect(
      altanaRevokeOperationStateSchema.safeParse({
        ...revoked,
        authorityObservedAt: "2026-08-11T11:59:59.999Z"
      }).success
    ).toBe(false);
  });
});
