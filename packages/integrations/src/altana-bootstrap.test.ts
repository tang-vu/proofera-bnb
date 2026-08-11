import { describe, expect, it, vi } from "vitest";

import {
  AltanaBootstrapTransitionError,
  altanaBootstrapStateSchema,
  authorityProbeBindingFromState,
  beginAltanaBootstrapGrant,
  beginAltanaBootstrapOrphanCleanup,
  beginAltanaBootstrapSecretProvisioning,
  canRetryAltanaBootstrapGrant,
  prepareAltanaBootstrap,
  projectAltanaBootstrapForBrowser,
  provisionAltanaBootstrapSecret,
  reconcileAltanaBootstrapAuthority,
  settleAltanaBootstrapGrant,
  settleAltanaBootstrapOrphanCleanup,
  type AltanaBootstrapSecretCreationRequest,
  type AltanaBootstrapSecretProvider,
  type AltanaBootstrapState,
  type AltanaBootstrapTransitionErrorCode
} from "./altana-bootstrap";
import {
  createSessionPublicGrantDescriptor,
  type ObservedSessionAuthority,
  type SessionPublicGrantDescriptor
} from "./altana-session";

const GENERATOR_PUBLIC_KEY =
  "0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8" as const;
const SECOND_PUBLIC_KEY =
  "0x04c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee51ae168fea63dc339a3c58419466ceaeeF7f632653266d0e1236431a950cfe52a" as const;
const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER_WALLET = "0x9999999999999999999999999999999999999999";
const POSITION_MANAGER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const POLICY_HASH = `0x${"aa".repeat(32)}`;
const OTHER_POLICY_HASH = `0x${"bb".repeat(32)}`;
const NONCE = `0x${"cc".repeat(32)}`;
const ISSUED_AT = 1_800_000_000;
const BOOTSTRAP_TTL = 300;
const SESSION_EXPIRY = ISSUED_AT + 3_600;
const SECRET_HANDLE = "kms:opaque:proofera-bootstrap-0001";

const at = (seconds: number) => () => new Date(seconds * 1_000);

function request() {
  return {
    schemaVersion: 1 as const,
    userId: "user:proof-era:0001",
    chainId: 97 as const,
    walletAddress: WALLET,
    policyHash: POLICY_HASH,
    permissions: {
      calls: [
        {
          to: POSITION_MANAGER,
          signature: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))"
        }
      ],
      spend: [{ token: TOKEN, limit: "1000000000000000000", period: "day" as const }]
    },
    sessionExpiry: SESSION_EXPIRY,
    bootstrapTtlSeconds: BOOTSTRAP_TTL
  };
}

function dependencies() {
  return {
    clock: at(ISSUED_AT),
    id: () => "bootstrap:test:0001",
    nonce: () => NONCE
  };
}

function descriptor(): SessionPublicGrantDescriptor {
  return createSessionPublicGrantDescriptor(GENERATOR_PUBLIC_KEY);
}

function providerResult(input: AltanaBootstrapSecretCreationRequest) {
  return {
    bootstrapId: input.bootstrapId,
    idempotencyKey: input.idempotencyKey,
    nonce: input.nonce,
    secretHandle: SECRET_HANDLE,
    publicDescriptor: descriptor()
  };
}

function workingProvider(
  overrides: Partial<AltanaBootstrapSecretProvider> = {}
): AltanaBootstrapSecretProvider {
  return {
    async createOrGet(input) {
      return providerResult(input);
    },
    async deleteByHandle() {
      return { status: "deleted" };
    },
    ...overrides
  };
}

function expectTransitionError(
  operation: () => unknown,
  code: AltanaBootstrapTransitionErrorCode
): void {
  try {
    operation();
    throw new Error(`Expected transition error ${code}.`);
  } catch (error) {
    if (!(error instanceof AltanaBootstrapTransitionError)) throw error;
    expect(error.code).toBe(code);
  }
}

function prepared(): AltanaBootstrapState {
  return prepareAltanaBootstrap(request(), dependencies());
}

function provisioning(): AltanaBootstrapState {
  return beginAltanaBootstrapSecretProvisioning(prepared(), at(ISSUED_AT + 1));
}

async function grantReady(
  provider: AltanaBootstrapSecretProvider = workingProvider()
): Promise<AltanaBootstrapState> {
  return provisionAltanaBootstrapSecret(provisioning(), provider, at(ISSUED_AT + 2));
}

async function grantSubmitting(): Promise<AltanaBootstrapState> {
  return beginAltanaBootstrapGrant(await grantReady(), at(ISSUED_AT + 3));
}

async function unknownGrant(): Promise<AltanaBootstrapState> {
  return settleAltanaBootstrapGrant(
    await grantSubmitting(),
    { kind: "relay_timeout" },
    at(ISSUED_AT + 4)
  );
}

function observedAuthority(state: AltanaBootstrapState): ObservedSessionAuthority {
  if (!("sessionKey" in state)) throw new Error("Test state requires a public descriptor.");
  return {
    chainId: 97,
    walletAddress: state.walletAddress,
    publicKey: state.sessionKey.publicKey,
    permissions: state.permissions,
    expiry: state.sessionExpiry
  };
}

function presentProbe(state: AltanaBootstrapState, observedAt: number) {
  return {
    status: "present" as const,
    binding: authorityProbeBindingFromState(state),
    observedAt,
    authority: observedAuthority(state)
  };
}

describe("Altana worker/KMS bootstrap boundary", () => {
  it("creates a deterministic, JSON-safe binding from injected clock, ID, and nonce", () => {
    const first = prepared();
    const second = prepared();

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      status: "bootstrap_ready",
      bootstrapId: "bootstrap:test:0001",
      nonce: NONCE,
      issuedAt: ISSUED_AT,
      bootstrapExpiresAt: ISSUED_AT + BOOTSTRAP_TTL,
      chainId: 97,
      policyHash: POLICY_HASH
    });
    expect(altanaBootstrapStateSchema.parse(JSON.parse(JSON.stringify(first)))).toEqual(first);
  });

  it("never exposes the opaque handle or provider details in the browser grant bundle", async () => {
    const state = await grantReady();
    const projection = projectAltanaBootstrapForBrowser(state);
    const json = JSON.stringify(projection);

    expect("secretHandle" in projection).toBe(false);
    expect(json).not.toContain(SECRET_HANDLE);
    expect(json).not.toMatch(/private.?key/i);
    expect(json).not.toMatch(/provider/i);
    expect(projection.sessionKey).toEqual(descriptor());
    expect(projection.grantIntent).toMatchObject({
      chainId: 97,
      walletAddress: state.walletAddress,
      expiry: SESSION_EXPIRY,
      registerInKeystore: true
    });
  });

  it("rejects strict record tampering of wallet, key, policy, permissions, handle, or expiry", async () => {
    const state = await grantReady();
    if (state.status !== "grant_ready") throw new Error("Expected a ready grant.");
    const firstSpend = state.permissions.spend[0];
    if (firstSpend === undefined) throw new Error("Test fixture requires a spend cap.");

    const tamperedRecords: unknown[] = [
      { ...state, walletAddress: OTHER_WALLET },
      { ...state, policyHash: OTHER_POLICY_HASH },
      {
        ...state,
        permissions: {
          ...state.permissions,
          spend: [{ ...firstSpend, limit: "1000000000000000001" }]
        }
      },
      { ...state, sessionExpiry: state.sessionExpiry + 1 },
      { ...state, secretHandle: `${SECRET_HANDLE}-changed` },
      {
        ...state,
        sessionKey: { ...state.sessionKey, publicKey: `0x04${"00".repeat(64)}` }
      }
    ];

    for (const tampered of tamperedRecords) {
      expect(altanaBootstrapStateSchema.safeParse(tampered).success).toBe(false);
    }
    expect(
      altanaBootstrapStateSchema.safeParse({ ...state, unreviewedProvider: "kms-default" }).success
    ).toBe(false);
  });

  it("turns a strict provider result containing private material into a sanitized unknown state", async () => {
    const privateField = ["private", "Key"].join("");
    const marker = ["synthetic", "provider", "material", "must", "not", "escape"].join("-");
    const provider = workingProvider({
      async createOrGet(input) {
        return { ...providerResult(input), [privateField]: marker };
      }
    });

    const state = await grantReady(provider);
    expect(state).toMatchObject({
      status: "secret_outcome_unknown",
      reason: "invalid_provider_result",
      retryable: false,
      manualReconciliationRequired: true
    });
    expect(JSON.stringify(state)).not.toContain(marker);
    expect(JSON.stringify(projectAltanaBootstrapForBrowser(state))).not.toContain(marker);
  });

  it("sanitizes provider exceptions and never blindly recreates after ambiguity", async () => {
    const marker = ["synthetic", "provider", "exception", "must", "not", "escape"].join("-");
    const createOrGet = vi.fn(async () => {
      throw new Error(marker);
    });
    const provider = workingProvider({ createOrGet });
    const state = await grantReady(provider);

    expect(state).toMatchObject({
      status: "secret_outcome_unknown",
      reason: "secret_provider_exception",
      retryable: false
    });
    expect(JSON.stringify(state)).not.toContain(marker);
    await expect(
      provisionAltanaBootstrapSecret(state, provider, at(ISSUED_AT + 3))
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(createOrGet).toHaveBeenCalledTimes(1);
  });

  it("uses one stable idempotency key across two tabs without creating two secrets", async () => {
    const records = new Map<string, ReturnType<typeof providerResult>>();
    let actualCreations = 0;
    const requests: AltanaBootstrapSecretCreationRequest[] = [];
    const provider = workingProvider({
      async createOrGet(input) {
        requests.push(input);
        const existing = records.get(input.idempotencyKey);
        if (existing !== undefined) return existing;
        actualCreations += 1;
        const created = providerResult(input);
        records.set(input.idempotencyKey, created);
        return created;
      }
    });
    const pending = provisioning();

    const [first, second] = await Promise.all([
      provisionAltanaBootstrapSecret(pending, provider, at(ISSUED_AT + 2)),
      provisionAltanaBootstrapSecret(pending, provider, at(ISSUED_AT + 2))
    ]);
    expect(first).toEqual(second);
    expect(actualCreations).toBe(1);
    expect(requests).toHaveLength(2);
    expect(new Set(requests.map((entry) => entry.idempotencyKey)).size).toBe(1);
    expectTransitionError(
      () => beginAltanaBootstrapSecretProvisioning(pending, at(ISSUED_AT + 2)),
      "INVALID_TRANSITION"
    );
  });
});

describe("grant and authority lifecycle", () => {
  it("keeps an unknown grant non-retryable but enables execution after one exact fresh probe", async () => {
    const unknown = await unknownGrant();
    expect(unknown).toMatchObject({
      status: "grant_outcome_unknown",
      retryable: false,
      authorityProbeRequired: true
    });
    expect(canRetryAltanaBootstrapGrant(unknown)).toBe(false);
    expectTransitionError(
      () => beginAltanaBootstrapGrant(unknown, at(ISSUED_AT + 5)),
      "INVALID_TRANSITION"
    );

    const enabled = reconcileAltanaBootstrapAuthority(
      unknown,
      presentProbe(unknown, ISSUED_AT + 5),
      at(ISSUED_AT + 5)
    );
    expect(enabled).toMatchObject({
      status: "execution_enabled",
      authorityVerification: "exact",
      authorityObservedAt: ISSUED_AT + 5
    });
    expect(projectAltanaBootstrapForBrowser(enabled).executionEnabled).toBe(true);
  });

  it.each(["absent", "unavailable"] as const)(
    "keeps execution disabled when authority is %s",
    async (status) => {
      const unknown = await unknownGrant();
      const result = reconcileAltanaBootstrapAuthority(
        unknown,
        {
          status,
          binding: authorityProbeBindingFromState(unknown),
          observedAt: ISSUED_AT + 5
        },
        at(ISSUED_AT + 5)
      );
      expect(result).toMatchObject({
        status: "authority_pending",
        authorityStatus: status,
        authorityProbeRequired: true
      });
      expect(projectAltanaBootstrapForBrowser(result).executionEnabled).toBe(false);
    }
  );

  it("rejects stale and future probes without enabling execution", async () => {
    const unknown = await unknownGrant();
    const stale = reconcileAltanaBootstrapAuthority(
      unknown,
      presentProbe(unknown, ISSUED_AT + 5),
      at(ISSUED_AT + 126)
    );
    const future = reconcileAltanaBootstrapAuthority(
      unknown,
      presentProbe(unknown, ISSUED_AT + 7),
      at(ISSUED_AT + 6)
    );

    expect(stale).toMatchObject({ status: "authority_pending", authorityStatus: "stale" });
    expect(future).toMatchObject({ status: "authority_pending", authorityStatus: "future" });
    expect(projectAltanaBootstrapForBrowser(stale).executionEnabled).toBe(false);
    expect(projectAltanaBootstrapForBrowser(future).executionEnabled).toBe(false);
  });

  it("rejects pre-issuance and replayed authority observations", async () => {
    const unknown = await unknownGrant();
    const preIssuance = reconcileAltanaBootstrapAuthority(
      unknown,
      presentProbe(unknown, ISSUED_AT - 1),
      at(ISSUED_AT + 5)
    );
    const absent = reconcileAltanaBootstrapAuthority(
      unknown,
      {
        status: "absent",
        binding: authorityProbeBindingFromState(unknown),
        observedAt: ISSUED_AT + 10
      },
      at(ISSUED_AT + 10)
    );
    const replayed = reconcileAltanaBootstrapAuthority(
      absent,
      presentProbe(absent, ISSUED_AT + 10),
      at(ISSUED_AT + 11)
    );

    expect(preIssuance).toMatchObject({
      status: "authority_pending",
      authorityStatus: "stale",
      lastAuthorityObservedAt: null
    });
    expect(replayed).toMatchObject({
      status: "authority_pending",
      authorityStatus: "stale",
      lastAuthorityObservedAt: ISSUED_AT + 10
    });
    expect(projectAltanaBootstrapForBrowser(replayed).executionEnabled).toBe(false);
  });

  it("fails a probe envelope bound to another wallet, policy, nonce, or record", async () => {
    const unknown = await unknownGrant();
    const exact = presentProbe(unknown, ISSUED_AT + 5);
    const wrongBindings = [
      { ...exact.binding, walletAddress: OTHER_WALLET },
      { ...exact.binding, policyHash: OTHER_POLICY_HASH },
      { ...exact.binding, nonce: `0x${"dd".repeat(32)}` },
      { ...exact.binding, bootstrapBindingHash: OTHER_POLICY_HASH }
    ];

    for (const binding of wrongBindings) {
      expectTransitionError(
        () => reconcileAltanaBootstrapAuthority(unknown, { ...exact, binding }, at(ISSUED_AT + 5)),
        "RECORD_BINDING_MISMATCH"
      );
    }
  });

  it("uses existing exact-authority verification for wallet, key, permissions, and expiry", async () => {
    const unknown = await unknownGrant();
    const exact = presentProbe(unknown, ISSUED_AT + 5);
    const spend = exact.authority.permissions.spend[0];
    if (spend === undefined) throw new Error("Test authority requires a spend cap.");
    const otherDescriptor = createSessionPublicGrantDescriptor(SECOND_PUBLIC_KEY);
    const authorities: ObservedSessionAuthority[] = [
      { ...exact.authority, walletAddress: OTHER_WALLET },
      { ...exact.authority, publicKey: otherDescriptor.publicKey },
      {
        ...exact.authority,
        permissions: {
          ...exact.authority.permissions,
          spend: [{ ...spend, limit: "1000000000000000001" }]
        }
      },
      { ...exact.authority, expiry: exact.authority.expiry + 1 }
    ];

    for (const authority of authorities) {
      const result = reconcileAltanaBootstrapAuthority(
        unknown,
        { ...exact, authority },
        at(ISSUED_AT + 5)
      );
      expect(result).toMatchObject({
        status: "authority_pending",
        authorityStatus: "mismatch"
      });
      expect(projectAltanaBootstrapForBrowser(result).executionEnabled).toBe(false);
    }
  });

  it("never enables an exact authority after the short bootstrap expiry", async () => {
    const unknown = await unknownGrant();
    const expired = reconcileAltanaBootstrapAuthority(
      unknown,
      presentProbe(unknown, ISSUED_AT + BOOTSTRAP_TTL),
      at(ISSUED_AT + BOOTSTRAP_TTL)
    );

    expect(expired).toMatchObject({ status: "grant_expired", retryable: false });
    expect(projectAltanaBootstrapForBrowser(expired).executionEnabled).toBe(false);
  });
});

describe("orphan secret cleanup", () => {
  it("deletes only by opaque handle after TTL and makes completed cleanup idempotent", async () => {
    const ready = await grantReady();
    const pending = beginAltanaBootstrapOrphanCleanup(ready, at(ISSUED_AT + BOOTSTRAP_TTL));
    const deleteByHandle = vi.fn(async (handle: string) => {
      expect(handle).toBe(SECRET_HANDLE);
      return { status: "deleted" };
    });
    const provider = workingProvider({ deleteByHandle });
    const cleaned = await settleAltanaBootstrapOrphanCleanup(
      pending,
      provider,
      at(ISSUED_AT + BOOTSTRAP_TTL + 1)
    );

    expect(cleaned).toMatchObject({ status: "cleaned", deleteOutcome: "deleted" });
    expect("secretHandle" in cleaned).toBe(false);
    expect(projectAltanaBootstrapForBrowser(cleaned).cleanupStatus).toBe("complete");
    expect(
      await settleAltanaBootstrapOrphanCleanup(cleaned, provider, at(ISSUED_AT + BOOTSTRAP_TTL + 2))
    ).toEqual(cleaned);
    expect(deleteByHandle).toHaveBeenCalledTimes(1);
  });

  it("makes early cleanup fail and provider deletion failures explicit but sanitized", async () => {
    const ready = await grantReady();
    expectTransitionError(
      () => beginAltanaBootstrapOrphanCleanup(ready, at(ISSUED_AT + 20)),
      "CLEANUP_TOO_EARLY"
    );

    const pending = beginAltanaBootstrapOrphanCleanup(ready, at(ISSUED_AT + BOOTSTRAP_TTL));
    const marker = ["synthetic", "delete", "exception", "must", "not", "escape"].join("-");
    const failed = await settleAltanaBootstrapOrphanCleanup(
      pending,
      workingProvider({
        async deleteByHandle() {
          throw new Error(marker);
        }
      }),
      at(ISSUED_AT + BOOTSTRAP_TTL + 1)
    );

    expect(failed).toMatchObject({
      status: "cleanup_failed",
      reason: "secret_delete_exception",
      cleanupRequired: true
    });
    expect(JSON.stringify(failed)).not.toContain(marker);
    expect(JSON.stringify(projectAltanaBootstrapForBrowser(failed))).not.toContain(SECRET_HANDLE);

    const retryPending = beginAltanaBootstrapOrphanCleanup(
      failed,
      at(ISSUED_AT + BOOTSTRAP_TTL + 2)
    );
    expect(retryPending).toMatchObject({
      status: "cleanup_pending",
      cleanupOperationId: failed.status === "cleanup_failed" ? failed.cleanupOperationId : undefined
    });
    const cleaned = await settleAltanaBootstrapOrphanCleanup(
      retryPending,
      workingProvider({
        async deleteByHandle() {
          return { status: "already_absent" };
        }
      }),
      at(ISSUED_AT + BOOTSTRAP_TTL + 3)
    );
    expect(cleaned).toMatchObject({
      status: "cleaned",
      deleteOutcome: "already_absent"
    });
  });

  it("never treats an execution-enabled key as an orphan", async () => {
    const unknown = await unknownGrant();
    const enabled = reconcileAltanaBootstrapAuthority(
      unknown,
      presentProbe(unknown, ISSUED_AT + 5),
      at(ISSUED_AT + 5)
    );
    expectTransitionError(
      () => beginAltanaBootstrapOrphanCleanup(enabled, at(ISSUED_AT + BOOTSTRAP_TTL + 1)),
      "EXECUTION_ALREADY_ENABLED"
    );
  });
});
