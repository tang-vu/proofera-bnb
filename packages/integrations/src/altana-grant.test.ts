import type { ClientGrantSessionOptions, PasskeySigner } from "@altananetwork/sdk";
import { describe, expect, it, vi } from "vitest";

import {
  beginAltanaBootstrapGrant,
  beginAltanaBootstrapSecretProvisioning,
  prepareAltanaBootstrap,
  projectAltanaBootstrapForBrowser,
  provisionAltanaBootstrapSecret,
  type AltanaBootstrapSecretCreationRequest,
  type AltanaBootstrapState
} from "./altana-bootstrap";
import {
  AltanaGrantSubmissionError,
  createAltanaGrantSubmissionRequest,
  settleAltanaGrantSubmissionResponse,
  submitAltanaGrant,
  type AltanaGrantSubmissionClaim,
  type AltanaGrantSubmissionDependencies,
  type AltanaGrantSubmissionRequest
} from "./altana-grant";
import { PublicOnlySessionSignerError, createSessionPublicGrantDescriptor } from "./altana-session";

const SESSION_PUBLIC_KEY =
  "0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8" as const;
const OTHER_SESSION_PUBLIC_KEY =
  "0x04c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee51ae168fea63dc339a3c58419466ceaeeF7f632653266d0e1236431a950cfe52a" as const;
// SEC 2 / FIPS P-256 generator, encoded in the flat x || y form used by SDK 0.7.0.
const ADMIN_P256_PUBLIC_KEY =
  "0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5" as const;
const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER_WALLET = "0x9999999999999999999999999999999999999999";
const POSITION_MANAGER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const POLICY_HASH = `0x${"aa".repeat(32)}`;
const NONCE = `0x${"cc".repeat(32)}`;
const ISSUED_AT = 1_800_000_000;
const BOOTSTRAP_TTL = 300;
const SESSION_EXPIRY = ISSUED_AT + 3_600;
const SECRET_HANDLE = "kms:opaque:grant-boundary-test";

const at = (seconds: number) => () => new Date(seconds * 1_000);

function bootstrapRequest() {
  return {
    schemaVersion: 1 as const,
    userId: "user:proof-era:grant-test",
    chainId: 97 as const,
    walletAddress: WALLET,
    policyHash: POLICY_HASH,
    permissions: {
      calls: [
        {
          to: POSITION_MANAGER,
          signature: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))"
        },
        {
          to: POSITION_MANAGER,
          signature: "collect((uint256,address,uint128,uint128))"
        }
      ],
      spend: [{ token: TOKEN, limit: "1000000000000000000", period: "day" as const }]
    },
    sessionExpiry: SESSION_EXPIRY,
    bootstrapTtlSeconds: BOOTSTRAP_TTL
  };
}

function providerResult(
  input: AltanaBootstrapSecretCreationRequest,
  publicKey: typeof SESSION_PUBLIC_KEY | typeof OTHER_SESSION_PUBLIC_KEY = SESSION_PUBLIC_KEY
) {
  return {
    bootstrapId: input.bootstrapId,
    idempotencyKey: input.idempotencyKey,
    nonce: input.nonce,
    secretHandle: SECRET_HANDLE,
    publicDescriptor: createSessionPublicGrantDescriptor(publicKey)
  };
}

async function grantReady(
  publicKey: typeof SESSION_PUBLIC_KEY | typeof OTHER_SESSION_PUBLIC_KEY = SESSION_PUBLIC_KEY
): Promise<AltanaBootstrapState> {
  const prepared = prepareAltanaBootstrap(bootstrapRequest(), {
    clock: at(ISSUED_AT),
    id: () => "bootstrap:test:grant-boundary",
    nonce: () => NONCE
  });
  const provisioning = beginAltanaBootstrapSecretProvisioning(prepared, at(ISSUED_AT + 1));
  return provisionAltanaBootstrapSecret(
    provisioning,
    {
      async createOrGet(input) {
        return providerResult(input, publicKey);
      },
      async deleteByHandle() {
        return { status: "deleted" };
      }
    },
    at(ISSUED_AT + 2)
  );
}

async function transition() {
  const ready = await grantReady();
  const submitting = beginAltanaBootstrapGrant(ready, at(ISSUED_AT + 3));
  return {
    ready,
    submitting,
    request: createAltanaGrantSubmissionRequest(ready, submitting)
  };
}

function adminSigner(credentialMarker = "credential-grant-test"): PasskeySigner {
  return {
    type: "passkey",
    address: "0x0000000000000000000000000000000000000000",
    publicKey: ADMIN_P256_PUBLIC_KEY,
    credential: {
      kind: "webauthn",
      id: credentialMarker,
      publicKey: ADMIN_P256_PUBLIC_KEY,
      rpId: "proof.example"
    },
    async signDigest() {
      throw new Error("Passkey digest signing is routed through the SDK ceremony.");
    }
  };
}

function echoedClaim(
  claim: AltanaGrantSubmissionClaim,
  status: "claimed" | "already_claimed" = "claimed"
) {
  return {
    status,
    bootstrapId: claim.bootstrapId,
    idempotencyKey: claim.idempotencyKey,
    bootstrapBindingHash: claim.bootstrapBindingHash,
    submissionBindingHash: claim.submissionBindingHash,
    grantSubmittedAt: claim.grantSubmittedAt
  };
}

function resolvedSdkSession(options: ClientGrantSessionOptions) {
  const signer = options.sessionSigner;
  if (signer === undefined) throw new Error("Test requires the public-only session signer.");
  return {
    walletAddress: options.wallet.address,
    signer,
    publicKey: signer.publicKey,
    permissions: options.permissions,
    expiry: options.expiry
  };
}

function dependencies(
  overrides: Partial<AltanaGrantSubmissionDependencies> = {}
): AltanaGrantSubmissionDependencies {
  return {
    adminSigner: adminSigner(),
    clock: at(ISSUED_AT + 3),
    expectedRpId: "proof.example",
    async claimSubmission(claim) {
      return echoedClaim(claim);
    },
    async grantSession(options) {
      return resolvedSdkSession(options);
    },
    ...overrides
  };
}

async function expectSubmissionError(
  operation: Promise<unknown> | (() => unknown),
  code: AltanaGrantSubmissionError["code"]
): Promise<void> {
  try {
    if (typeof operation === "function") operation();
    else await operation;
    throw new Error(`Expected Altana grant submission error ${code}.`);
  } catch (error) {
    if (!(error instanceof AltanaGrantSubmissionError)) throw error;
    expect(error.code).toBe(code);
  }
}

describe("Altana 0.7.0 browser grant boundary", () => {
  it("binds only an exact grant-ready to grant-submitting transition", async () => {
    const exact = await transition();
    expect(exact.request).toMatchObject({
      bootstrapId: exact.ready.bootstrapId,
      idempotencyKey: exact.ready.idempotencyKey,
      bootstrapBindingHash: exact.ready.bootstrapBindingHash,
      workerBindingHash:
        "workerBindingHash" in exact.ready ? exact.ready.workerBindingHash : undefined,
      policyHash: POLICY_HASH,
      transition: {
        priorStatus: "grant_ready",
        nextStatus: "grant_submitting",
        grantSubmittedAt: ISSUED_AT + 3
      },
      grantIntent: {
        chainId: 97,
        walletAddress: WALLET,
        expiry: SESSION_EXPIRY,
        registerInKeystore: true
      }
    });
    expect(JSON.stringify(exact.request)).not.toContain(SECRET_HANDLE);

    await expectSubmissionError(
      () => createAltanaGrantSubmissionRequest(exact.ready, exact.ready),
      "INVALID_TRANSITION"
    );

    const otherReady = await grantReady(OTHER_SESSION_PUBLIC_KEY);
    const otherSubmitting = beginAltanaBootstrapGrant(otherReady, at(ISSUED_AT + 3));
    await expectSubmissionError(
      () => createAltanaGrantSubmissionRequest(exact.ready, otherSubmitting),
      "TRANSITION_BINDING_MISMATCH"
    );
  });

  it("passes exact chain, wallet, descriptor, call, spend, expiry, and register bytes", async () => {
    const exact = await transition();
    let captured: ClientGrantSessionOptions | undefined;
    const response = await submitAltanaGrant(
      exact.request,
      dependencies({
        async grantSession(options) {
          captured = options;
          return resolvedSdkSession(options);
        }
      })
    );

    expect(captured).toBeDefined();
    if (captured === undefined) throw new Error("SDK grant options were not captured.");
    expect(Object.keys(captured).sort()).toEqual([
      "chainId",
      "expiry",
      "permissions",
      "register",
      "sessionSigner",
      "signer",
      "wallet"
    ]);
    expect(captured.chainId).toBe(97);
    expect(captured.wallet).toEqual({ address: WALLET });
    expect(captured.signer).toBeTypeOf("object");
    expect(captured.permissions.calls).toEqual([
      {
        to: POSITION_MANAGER,
        signature: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))"
      },
      {
        to: POSITION_MANAGER,
        signature: "collect((uint256,address,uint128,uint128))"
      }
    ]);
    expect(captured.permissions.spend).toEqual([
      { token: TOKEN, limit: 1_000_000_000_000_000_000n, period: "day" }
    ]);
    expect(captured.expiry).toBe(SESSION_EXPIRY);
    expect(captured.register).toBe(true);
    expect(captured.sessionSigner).toMatchObject({
      type: "injected",
      address: exact.request.grantIntent.sessionKey.address,
      publicKey: SESSION_PUBLIC_KEY
    });
    expect("_privateKey" in (captured.sessionSigner ?? {})).toBe(false);
    await expect(captured.sessionSigner?.signDigest(`0x${"00".repeat(32)}`)).rejects.toBeInstanceOf(
      PublicOnlySessionSignerError
    );

    expect(response).toMatchObject({
      outcome: "sdk_confirmed",
      executionEnabled: false,
      authorityProbeRequired: true,
      retryable: false
    });
  });

  it("settles SDK resolve to authority-pending, never execution-ready", async () => {
    const exact = await transition();
    const response = await submitAltanaGrant(exact.request, dependencies());
    const settled = settleAltanaGrantSubmissionResponse(
      exact.submitting,
      response,
      at(ISSUED_AT + 4)
    );

    expect(settled).toMatchObject({
      status: "authority_pending",
      grantResolution: "sdk_confirmed",
      authorityStatus: "probe_required",
      authorityProbeRequired: true,
      retryable: false
    });
    expect(projectAltanaBootstrapForBrowser(settled)).toMatchObject({
      lifecycleStatus: "authority_pending",
      executionEnabled: false,
      grantRetryAllowed: false
    });
  });

  it.each([
    [
      "PENDING",
      new Error("Session grant did not confirm: status=PENDING"),
      "sdk_pending",
      "grant_outcome_unknown"
    ],
    [
      "FAILED",
      new Error("Session grant did not confirm: status=FAILED"),
      "known_failed",
      "grant_failed"
    ],
    [
      "timeout",
      Object.assign(new Error("relay timed out"), { code: "ETIMEDOUT" }),
      "relay_timeout",
      "grant_outcome_unknown"
    ]
  ] as const)(
    "models SDK %s without a callsId or blind retry",
    async (_label, sdkError, outcome, stateStatus) => {
      const exact = await transition();
      const response = await submitAltanaGrant(
        exact.request,
        dependencies({
          async grantSession() {
            throw sdkError;
          }
        })
      );
      const settled = settleAltanaGrantSubmissionResponse(
        exact.submitting,
        response,
        at(ISSUED_AT + 4)
      );

      expect(response).toMatchObject({ outcome, retryable: false });
      expect(settled).toMatchObject({ status: stateStatus, retryable: false });
      expect(JSON.stringify(response)).not.toContain("callsId");
      if (stateStatus === "grant_outcome_unknown") {
        expect(settled).toMatchObject({ authorityProbeRequired: true });
        expect(response.authorityProbeRequired).toBe(true);
      } else {
        // SDK 0.7.0 emits the exact FAILED message only after waitForCalls
        // returns terminal FAILED. The atomic authorization did not land, but
        // the discarded callsId still makes the result non-retryable.
        expect(outcome).toBe("known_failed");
        expect(response.authorityProbeRequired).toBe(false);
      }
    }
  );

  it("sanitizes biometric rejection, malformed resolve, and unexpected secret errors", async () => {
    const marker = "synthetic-sensitive-sdk-detail-must-not-escape";
    const cases: readonly [() => Promise<unknown>, "wallet_rejected" | "indeterminate_error"][] = [
      [
        async () => {
          throw Object.assign(new Error(marker), { code: 4001 });
        },
        "wallet_rejected"
      ],
      [
        async () => {
          throw new DOMException(marker, "NotAllowedError");
        },
        "wallet_rejected"
      ],
      [
        async () => ({ status: "CONFIRMED", sessionPrivateMaterial: marker }),
        "indeterminate_error"
      ],
      [
        async () => {
          throw new Error(marker);
        },
        "indeterminate_error"
      ]
    ];

    for (const [grantSession, outcome] of cases) {
      const exact = await transition();
      const response = await submitAltanaGrant(exact.request, dependencies({ grantSession }));
      const json = JSON.stringify(response);
      expect(response.outcome).toBe(outcome);
      expect(json).not.toContain(marker);
      expect(json).not.toContain("sessionPrivateMaterial");
      expect(json).not.toContain("callsId");
    }
  });

  it("rejects modified chain, wallet, policy, descriptor, permissions, and expiry before claiming", async () => {
    const exact = await transition();
    const spend = exact.request.grantIntent.permissions.spend[0];
    if (spend === undefined) throw new Error("Test request requires a spend cap.");
    const modified: unknown[] = [
      {
        ...exact.request,
        grantIntent: { ...exact.request.grantIntent, chainId: 56 }
      },
      {
        ...exact.request,
        grantIntent: { ...exact.request.grantIntent, walletAddress: OTHER_WALLET }
      },
      { ...exact.request, policyHash: `0x${"bb".repeat(32)}` },
      {
        ...exact.request,
        grantIntent: {
          ...exact.request.grantIntent,
          sessionKey: {
            ...exact.request.grantIntent.sessionKey,
            address: OTHER_WALLET
          }
        }
      },
      {
        ...exact.request,
        grantIntent: {
          ...exact.request.grantIntent,
          permissions: {
            ...exact.request.grantIntent.permissions,
            spend: [{ ...spend, limit: "1000000000000000001" }]
          }
        }
      },
      {
        ...exact.request,
        grantIntent: { ...exact.request.grantIntent, expiry: SESSION_EXPIRY + 1 }
      },
      {
        ...exact.request,
        [["session", "Private", "Key"].join("")]: "not-accepted"
      }
    ];
    const claimSubmission = vi.fn();
    const grantSession = vi.fn();

    for (const request of modified) {
      await expectSubmissionError(
        submitAltanaGrant(request, dependencies({ claimSubmission, grantSession })),
        "INVALID_REQUEST"
      );
    }
    expect(claimSubmission).not.toHaveBeenCalled();
    expect(grantSession).not.toHaveBeenCalled();
  });

  it("uses an atomic stable claim to suppress double-click and reload resubmission", async () => {
    const exact = await transition();
    const claimed = new Set<string>();
    const grantSession = vi.fn(async (options: ClientGrantSessionOptions) =>
      resolvedSdkSession(options)
    );
    const claimSubmission = vi.fn(async (claim: AltanaGrantSubmissionClaim) => {
      const key = `${claim.idempotencyKey}:${claim.submissionBindingHash}`;
      if (claimed.has(key)) return echoedClaim(claim, "already_claimed");
      claimed.add(key);
      return echoedClaim(claim, "claimed");
    });

    const results = await Promise.allSettled([
      submitAltanaGrant(exact.request, dependencies({ claimSubmission, grantSession })),
      submitAltanaGrant(
        JSON.parse(JSON.stringify(exact.request)),
        dependencies({ claimSubmission, grantSession })
      )
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ code: "SUBMISSION_ALREADY_CLAIMED" })
    });
    expect(claimSubmission).toHaveBeenCalledTimes(2);
    expect(grantSession).toHaveBeenCalledTimes(1);
  });

  it("never serializes the admin credential, raw errors, SDK function, signer, or secret handle", async () => {
    const exact = await transition();
    const credentialMarker = "synthetic-admin-credential-marker";
    const response = await submitAltanaGrant(
      exact.request,
      dependencies({ adminSigner: adminSigner(credentialMarker) })
    );
    const json = JSON.stringify(response);

    for (const forbidden of [
      credentialMarker,
      SECRET_HANDLE,
      "claimSubmission",
      "grantSession",
      "callsId",
      "signDigest",
      "credential"
    ]) {
      expect(json).not.toContain(forbidden);
    }
    expect(json).not.toMatch(/private.?key/i);
    expect(JSON.parse(json)).toEqual(response);
  });

  it("rejects raw/headless admin keys and binding-mismatched claim results before SDK use", async () => {
    const exact = await transition();
    const grantSession = vi.fn();
    const privateField = ["private", "Key"].join("");
    const headless = {
      ...adminSigner(),
      credential: {
        kind: "headless" as const,
        [privateField]: "not-accepted-by-this-boundary",
        publicKey: ADMIN_P256_PUBLIC_KEY
      }
    } as unknown as PasskeySigner;
    await expectSubmissionError(
      submitAltanaGrant(exact.request, dependencies({ adminSigner: headless, grantSession })),
      "INVALID_ADMIN_SIGNER"
    );
    expect(grantSession).not.toHaveBeenCalled();

    await expectSubmissionError(
      submitAltanaGrant(
        exact.request,
        dependencies({
          grantSession,
          async claimSubmission(claim) {
            return {
              ...echoedClaim(claim),
              submissionBindingHash: `0x${"ff".repeat(32)}`
            };
          }
        })
      ),
      "CLAIM_BINDING_MISMATCH"
    );
    expect(grantSession).not.toHaveBeenCalled();
  });

  it("requires the explicit production passkey RP ID to match before claiming", async () => {
    const exact = await transition();
    const claimSubmission = vi.fn();
    await expectSubmissionError(
      submitAltanaGrant(
        exact.request,
        dependencies({ expectedRpId: "other.example", claimSubmission })
      ),
      "RP_ID_MISMATCH"
    );
    expect(claimSubmission).not.toHaveBeenCalled();

    await expectSubmissionError(
      submitAltanaGrant(
        exact.request,
        dependencies({ expectedRpId: "localhost", claimSubmission })
      ),
      "INVALID_DEPENDENCIES"
    );
    expect(claimSubmission).not.toHaveBeenCalled();

    const credentialWithoutRpId = { ...adminSigner().credential } as {
      kind: "webauthn";
      id: string;
      publicKey: typeof ADMIN_P256_PUBLIC_KEY;
      rpId?: string;
    };
    delete credentialWithoutRpId.rpId;
    const signerWithoutRpId = {
      ...adminSigner(),
      credential: credentialWithoutRpId
    } as PasskeySigner;
    await expectSubmissionError(
      submitAltanaGrant(
        exact.request,
        dependencies({ adminSigner: signerWithoutRpId, claimSubmission })
      ),
      "INVALID_ADMIN_SIGNER"
    );
    expect(claimSubmission).not.toHaveBeenCalled();
  });

  it("rejects response replay onto another submitting wallet binding", async () => {
    const exact = await transition();
    const response = await submitAltanaGrant(exact.request, dependencies());
    const tamperedRequest: AltanaGrantSubmissionRequest = {
      ...response.request,
      grantIntent: { ...response.request.grantIntent, walletAddress: OTHER_WALLET }
    };
    await expectSubmissionError(
      () =>
        settleAltanaGrantSubmissionResponse(
          exact.submitting,
          { ...response, request: tamperedRequest },
          at(ISSUED_AT + 4)
        ),
      "INVALID_REQUEST"
    );
  });

  it("never invokes signer, dependency, or thrown-error getters", async () => {
    const exact = await transition();
    let signerGetterCalls = 0;
    const signerWithGetter = {
      type: "passkey",
      address: "0x0000000000000000000000000000000000000000",
      publicKey: ADMIN_P256_PUBLIC_KEY,
      get credential() {
        signerGetterCalls += 1;
        return adminSigner().credential;
      },
      async signDigest() {
        throw new Error("not called");
      }
    } as unknown as PasskeySigner;
    await expectSubmissionError(
      submitAltanaGrant(exact.request, dependencies({ adminSigner: signerWithGetter })),
      "INVALID_ADMIN_SIGNER"
    );
    expect(signerGetterCalls).toBe(0);

    let dependencyGetterCalls = 0;
    const unsafeDependencies = {
      adminSigner: adminSigner(),
      clock: at(ISSUED_AT + 3),
      claimSubmission: dependencies().claimSubmission,
      get grantSession() {
        dependencyGetterCalls += 1;
        return dependencies().grantSession;
      }
    } as unknown as AltanaGrantSubmissionDependencies;
    await expectSubmissionError(
      submitAltanaGrant(exact.request, unsafeDependencies),
      "INVALID_DEPENDENCIES"
    );
    expect(dependencyGetterCalls).toBe(0);

    let errorGetterCalls = 0;
    const response = await submitAltanaGrant(
      exact.request,
      dependencies({
        async grantSession() {
          throw {
            get code() {
              errorGetterCalls += 1;
              return 4001;
            },
            get message() {
              errorGetterCalls += 1;
              return "user rejected";
            },
            get name() {
              errorGetterCalls += 1;
              return "NotAllowedError";
            }
          };
        }
      })
    );
    expect(response.outcome).toBe("indeterminate_error");
    expect(errorGetterCalls).toBe(0);

    let requestGetterCalls = 0;
    const requestWithGetter = {
      ...exact.request,
      get policyHash() {
        requestGetterCalls += 1;
        return exact.request.policyHash;
      }
    };
    await expectSubmissionError(
      submitAltanaGrant(requestWithGetter, dependencies()),
      "INVALID_REQUEST"
    );
    expect(requestGetterCalls).toBe(0);
  });

  it("uses Date's intrinsic time value and rejects Date subclasses", async () => {
    const exact = await transition();
    let overriddenGetTimeCalls = 0;
    const ordinary = new Date((ISSUED_AT + 3) * 1_000);
    Object.defineProperty(ordinary, "getTime", {
      get() {
        overriddenGetTimeCalls += 1;
        return () => 0;
      }
    });
    const accepted = await submitAltanaGrant(
      exact.request,
      dependencies({ clock: () => ordinary })
    );
    expect(accepted.outcome).toBe("sdk_confirmed");
    expect(overriddenGetTimeCalls).toBe(0);

    class UntrustedDate extends Date {
      override getTime(): number {
        overriddenGetTimeCalls += 1;
        return super.getTime();
      }
    }
    const second = await transition();
    await expectSubmissionError(
      submitAltanaGrant(
        second.request,
        dependencies({
          clock: () => new UntrustedDate((ISSUED_AT + 3) * 1_000)
        })
      ),
      "INVALID_CLOCK"
    );
    expect(overriddenGetTimeCalls).toBe(0);
  });

  it("rejects a structurally plausible admin key that is not on P-256", async () => {
    const exact = await transition();
    const invalidCurveSigner = {
      ...adminSigner(),
      publicKey: `0x${"12".repeat(64)}`,
      credential: {
        ...adminSigner().credential,
        publicKey: `0x${"12".repeat(64)}`
      }
    } as unknown as PasskeySigner;
    const claimSubmission = vi.fn();
    await expectSubmissionError(
      submitAltanaGrant(
        exact.request,
        dependencies({ adminSigner: invalidCurveSigner, claimSubmission })
      ),
      "INVALID_ADMIN_SIGNER"
    );
    expect(claimSubmission).not.toHaveBeenCalled();
  });
});
