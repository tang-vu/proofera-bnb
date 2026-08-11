import { describe, expect, it } from "vitest";

import {
  PublicOnlySessionSignerError,
  beginSessionGrantSubmission,
  canRetrySessionGrant,
  createPublicOnlySessionSigner,
  createReadySessionGrant,
  createSessionPublicGrantDescriptor,
  deserializeSessionGrantIntent,
  prepareSessionGrantRetry,
  resolveUnknownGrantWithAuthorityProbe,
  serializedSessionGrantIntentSchema,
  serializeSessionGrantIntent,
  settleSessionGrantSubmission,
  toAltanaGrantSessionOptions,
  verifySessionAuthority,
  type ObservedSessionAuthority,
  type SessionGrantIntent
} from "./altana-session";

const GENERATOR_PUBLIC_KEY =
  "0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8" as const;
const WALLET = "0x1111111111111111111111111111111111111111" as const;
const POSITION_MANAGER = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

function createRuntimeIntent(): SessionGrantIntent {
  return {
    schemaVersion: 1,
    chainId: 97,
    walletAddress: WALLET,
    sessionKey: createSessionPublicGrantDescriptor(GENERATOR_PUBLIC_KEY),
    permissions: {
      calls: [
        {
          to: POSITION_MANAGER,
          signature: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))"
        }
      ],
      spend: [{ token: TOKEN, limit: 1_000_000_000_000_000_000n, period: "day" }]
    },
    expiry: 1_800_000_000,
    registerInKeystore: true
  };
}

function createObservedAuthority(): ObservedSessionAuthority {
  const intent = serializeSessionGrantIntent(createRuntimeIntent());
  return {
    chainId: intent.chainId,
    walletAddress: intent.walletAddress,
    publicKey: intent.sessionKey.publicKey,
    permissions: intent.permissions,
    expiry: intent.expiry
  };
}

describe("Altana public session-key handoff", () => {
  it("derives the key address and never serializes private material", () => {
    const descriptor = createSessionPublicGrantDescriptor(GENERATOR_PUBLIC_KEY);
    const signer = createPublicOnlySessionSigner(descriptor);

    expect(descriptor.address).toBe("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf");
    expect("privateKey" in descriptor).toBe(false);
    expect("_privateKey" in signer).toBe(false);
    expect(JSON.stringify({ descriptor, signer })).not.toMatch(/privateKey/i);
  });

  it("fails closed if the grant-only signer is asked to sign", async () => {
    const signer = createPublicOnlySessionSigner(
      createSessionPublicGrantDescriptor(GENERATOR_PUBLIC_KEY)
    );

    await expect(signer.signDigest(`0x${"00".repeat(32)}`)).rejects.toBeInstanceOf(
      PublicOnlySessionSignerError
    );
  });

  it("round-trips bigint spend caps as strict decimal strings", () => {
    const runtime = createRuntimeIntent();
    const serialized = serializeSessionGrantIntent(runtime);
    const json = JSON.stringify(serialized);

    expect(serialized.permissions.spend[0]?.limit).toBe("1000000000000000000");
    expect(typeof serialized.permissions.spend[0]?.limit).toBe("string");
    expect(deserializeSessionGrantIntent(JSON.parse(json))).toEqual(runtime);

    const sdkOptions = toAltanaGrantSessionOptions(JSON.parse(json));
    expect(sdkOptions.permissions.spend?.[0]?.limit).toBe(1_000_000_000_000_000_000n);
    expect(sdkOptions.register).toBe(true);
  });

  it("rejects extra fields, non-BSC-testnet intents, and invalid curve points", () => {
    const serialized = serializeSessionGrantIntent(createRuntimeIntent());

    expect(() =>
      deserializeSessionGrantIntent({ ...serialized, privateKey: "not-accepted" })
    ).toThrow();
    expect(() => deserializeSessionGrantIntent({ ...serialized, chainId: 56 })).toThrow();

    const malformedLimit = {
      ...serialized,
      permissions: {
        ...serialized.permissions,
        spend: [{ ...serialized.permissions.spend[0], limit: "1/../../keystore" }]
      }
    };
    expect(() => serializedSessionGrantIntentSchema.safeParse(malformedLimit)).not.toThrow();
    expect(serializedSessionGrantIntentSchema.safeParse(malformedLimit).success).toBe(false);
    expect(() => createSessionPublicGrantDescriptor(`0x04${"00".repeat(64)}`)).toThrow();
  });
});

describe("authority verification", () => {
  it("matches semantically exact permissions even if set order differs", () => {
    const expected = serializeSessionGrantIntent(createRuntimeIntent());
    const observed = createObservedAuthority();

    expect(verifySessionAuthority(expected, observed)).toEqual({
      matches: true,
      mismatches: []
    });
  });

  it("reports permission tampering and blocks worker execution", () => {
    const expected = serializeSessionGrantIntent(createRuntimeIntent());
    const observed = createObservedAuthority();
    const tampered = {
      ...observed,
      permissions: {
        ...observed.permissions,
        spend: [{ ...observed.permissions.spend[0], limit: "1000000000000000001" }]
      }
    };

    expect(verifySessionAuthority(expected, tampered)).toEqual({
      matches: false,
      mismatches: ["permissions"]
    });
  });
});

describe("grant lifecycle", () => {
  it("does not blindly retry SDK PENDING or relay-timeout outcomes", () => {
    const ready = createReadySessionGrant(serializeSessionGrantIntent(createRuntimeIntent()));
    const submitting = beginSessionGrantSubmission(ready);
    const pending = settleSessionGrantSubmission(submitting, {
      kind: "threw",
      error: new Error("Session grant did not confirm: status=PENDING")
    });

    expect(pending).toMatchObject({
      status: "outcome_unknown",
      reason: "sdk_pending",
      probeRequired: true
    });
    expect(canRetrySessionGrant(pending)).toBe(false);
    expect(() => prepareSessionGrantRetry(pending)).toThrow();
    expect(JSON.stringify(pending)).not.toContain("callsId");

    const timeout = settleSessionGrantSubmission(submitting, {
      kind: "threw",
      error: new Error("relay request timed out")
    });
    expect(timeout).toMatchObject({
      status: "outcome_unknown",
      reason: "relay_timeout"
    });
    expect(canRetrySessionGrant(timeout)).toBe(false);
  });

  it("allows a retry only after a probe establishes authority absence", () => {
    const submitting = beginSessionGrantSubmission(
      createReadySessionGrant(serializeSessionGrantIntent(createRuntimeIntent()))
    );
    const unknown = settleSessionGrantSubmission(submitting, {
      kind: "threw",
      error: new Error("network transport stopped")
    });
    const absent = resolveUnknownGrantWithAuthorityProbe(unknown, {
      status: "absent"
    });

    expect(absent).toMatchObject({ status: "failed", retryable: true });
    expect(canRetrySessionGrant(absent)).toBe(true);
    expect(prepareSessionGrantRetry(absent).status).toBe("ready");
  });

  it("confirms only an exact probed authority and rejects a tampered one", () => {
    const submitting = beginSessionGrantSubmission(
      createReadySessionGrant(serializeSessionGrantIntent(createRuntimeIntent()))
    );
    const unknown = settleSessionGrantSubmission(submitting, {
      kind: "threw",
      error: new Error("unknown relay exception")
    });

    expect(
      resolveUnknownGrantWithAuthorityProbe(unknown, {
        status: "present",
        authority: createObservedAuthority()
      })
    ).toMatchObject({ status: "confirmed", confirmation: "authority_probe" });

    const tampered = {
      ...createObservedAuthority(),
      expiry: createObservedAuthority().expiry + 1
    };
    const mismatch = resolveUnknownGrantWithAuthorityProbe(unknown, {
      status: "present",
      authority: tampered
    });
    expect(mismatch).toMatchObject({ status: "failed", retryable: false });
    expect(canRetrySessionGrant(mismatch)).toBe(false);
  });
});
