import { keccak256, stringToHex } from "viem";
import { z } from "zod";

import {
  observedSessionAuthoritySchema,
  serializedExactSessionPermissionsSchema,
  serializedSessionGrantIntentSchema,
  sessionPublicGrantDescriptorSchema,
  verifySessionAuthority,
  type SerializedExactSessionPermissions,
  type SerializedSessionGrantIntent,
  type SessionPublicGrantDescriptor
} from "./altana-session";

const BSC_TESTNET_CHAIN_ID = 97 as const;
const UINT40_MAX = 2 ** 40 - 1;
const MAX_BOOTSTRAP_TTL_SECONDS = 10 * 60;
const MIN_BOOTSTRAP_TTL_SECONDS = 30;
export const MAX_AUTHORITY_PROBE_AGE_SECONDS = 120 as const;

const policyHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Expected a canonical 32-byte policy hash")
  .transform((value) => value.toLowerCase() as `0x${string}`);
const bootstrapIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/, "Invalid bootstrap identifier");
const userIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._@/-]*$/, "Invalid user identifier");
const nonceSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Expected a canonical 32-byte nonce")
  .transform((value) => value.toLowerCase() as `0x${string}`);
const opaqueSecretHandleSchema = z
  .string()
  .min(1)
  .max(320)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/, "Invalid opaque secret handle");
const unixSecondsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sessionExpirySchema = z.number().int().positive().max(UINT40_MAX);
const bootstrapTtlSchema = z
  .number()
  .int()
  .min(MIN_BOOTSTRAP_TTL_SECONDS)
  .max(MAX_BOOTSTRAP_TTL_SECONDS);
const bindingHashSchema = policyHashSchema;
const idempotencyKeySchema = bindingHashSchema;

export const altanaBootstrapRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  userId: userIdSchema,
  chainId: z.literal(BSC_TESTNET_CHAIN_ID),
  walletAddress: serializedSessionGrantIntentSchema.shape.walletAddress,
  policyHash: policyHashSchema,
  permissions: serializedExactSessionPermissionsSchema,
  sessionExpiry: sessionExpirySchema,
  bootstrapTtlSeconds: bootstrapTtlSchema
});

export type AltanaBootstrapRequest = z.infer<typeof altanaBootstrapRequestSchema>;

const immutableBaseShape = {
  schemaVersion: z.literal(1),
  bootstrapId: bootstrapIdSchema,
  idempotencyKey: idempotencyKeySchema,
  userId: userIdSchema,
  chainId: z.literal(BSC_TESTNET_CHAIN_ID),
  walletAddress: serializedSessionGrantIntentSchema.shape.walletAddress,
  policyHash: policyHashSchema,
  permissions: serializedExactSessionPermissionsSchema,
  sessionExpiry: sessionExpirySchema,
  nonce: nonceSchema,
  issuedAt: unixSecondsSchema,
  bootstrapExpiresAt: unixSecondsSchema,
  bootstrapTtlSeconds: bootstrapTtlSchema,
  bootstrapBindingHash: bindingHashSchema,
  updatedAt: unixSecondsSchema
} as const;

const provisionedShape = {
  secretHandle: opaqueSecretHandleSchema,
  sessionKey: sessionPublicGrantDescriptorSchema,
  workerBindingHash: bindingHashSchema
} as const;

const submittedShape = {
  ...provisionedShape,
  grantSubmittedAt: unixSecondsSchema
} as const;

const cleanupPriorStatusSchema = z.enum([
  "grant_ready",
  "grant_submitting",
  "grant_outcome_unknown",
  "grant_rejected",
  "grant_failed",
  "authority_pending",
  "grant_expired"
]);

export const altanaBootstrapStateSchema = z
  .discriminatedUnion("status", [
    z.strictObject({
      ...immutableBaseShape,
      status: z.literal("bootstrap_ready")
    }),
    z.strictObject({
      ...immutableBaseShape,
      status: z.literal("secret_provisioning"),
      provisioningStartedAt: unixSecondsSchema
    }),
    z.strictObject({
      ...immutableBaseShape,
      status: z.literal("secret_outcome_unknown"),
      provisioningStartedAt: unixSecondsSchema,
      unknownAt: unixSecondsSchema,
      reason: z.enum([
        "secret_provider_exception",
        "invalid_provider_result",
        "provider_binding_mismatch"
      ]),
      manualReconciliationRequired: z.literal(true),
      retryable: z.literal(false)
    }),
    z.strictObject({
      ...immutableBaseShape,
      ...provisionedShape,
      status: z.literal("grant_ready")
    }),
    z.strictObject({
      ...immutableBaseShape,
      ...submittedShape,
      status: z.literal("grant_submitting")
    }),
    z.strictObject({
      ...immutableBaseShape,
      ...submittedShape,
      status: z.literal("grant_outcome_unknown"),
      unknownAt: unixSecondsSchema,
      reason: z.enum(["sdk_pending", "relay_timeout", "indeterminate_error"]),
      authorityProbeRequired: z.literal(true),
      retryable: z.literal(false)
    }),
    z.strictObject({
      ...immutableBaseShape,
      ...submittedShape,
      status: z.literal("grant_rejected"),
      rejectedAt: unixSecondsSchema,
      reason: z.literal("wallet_rejected"),
      retryable: z.literal(false)
    }),
    z.strictObject({
      ...immutableBaseShape,
      ...submittedShape,
      status: z.literal("grant_failed"),
      failedAt: unixSecondsSchema,
      reason: z.literal("known_grant_failure"),
      retryable: z.literal(false)
    }),
    z.strictObject({
      ...immutableBaseShape,
      ...submittedShape,
      status: z.literal("authority_pending"),
      grantResolution: z.enum(["sdk_confirmed", "unknown_outcome_probe"]),
      authorityStatus: z.enum([
        "probe_required",
        "mismatch",
        "absent",
        "unavailable",
        "stale",
        "future"
      ]),
      authorityMismatches: z
        .array(
          z.enum([
            "authority_shape",
            "chain_id",
            "wallet_address",
            "public_key",
            "permissions",
            "expiry"
          ])
        )
        .max(6),
      lastAuthorityObservedAt: unixSecondsSchema.nullable(),
      authorityProbeRequired: z.literal(true),
      retryable: z.literal(false)
    }),
    z.strictObject({
      ...immutableBaseShape,
      ...submittedShape,
      status: z.literal("execution_enabled"),
      enabledAt: unixSecondsSchema,
      authorityObservedAt: unixSecondsSchema,
      authorityVerification: z.literal("exact")
    }),
    z.strictObject({
      ...immutableBaseShape,
      ...provisionedShape,
      status: z.literal("grant_expired"),
      expiredAt: unixSecondsSchema,
      priorGrantStatus: z.enum([
        "secret_provisioning",
        "grant_ready",
        "grant_submitting",
        "grant_outcome_unknown",
        "authority_pending"
      ]),
      retryable: z.literal(false)
    }),
    z.strictObject({
      ...immutableBaseShape,
      ...provisionedShape,
      status: z.literal("cleanup_pending"),
      cleanupOperationId: bindingHashSchema,
      cleanupStartedAt: unixSecondsSchema,
      priorStatus: cleanupPriorStatusSchema
    }),
    z.strictObject({
      ...immutableBaseShape,
      ...provisionedShape,
      status: z.literal("cleanup_failed"),
      cleanupOperationId: bindingHashSchema,
      cleanupStartedAt: unixSecondsSchema,
      cleanupFailedAt: unixSecondsSchema,
      priorStatus: cleanupPriorStatusSchema,
      reason: z.enum(["secret_delete_exception", "invalid_delete_result"]),
      cleanupRequired: z.literal(true)
    }),
    z.strictObject({
      ...immutableBaseShape,
      status: z.literal("cleaned"),
      sessionKey: sessionPublicGrantDescriptorSchema,
      cleanupOperationId: bindingHashSchema,
      cleanedAt: unixSecondsSchema,
      priorStatus: cleanupPriorStatusSchema,
      deleteOutcome: z.enum(["deleted", "already_absent"])
    })
  ])
  .superRefine((state, context) => {
    if (state.bootstrapExpiresAt !== state.issuedAt + state.bootstrapTtlSeconds) {
      context.addIssue({
        code: "custom",
        path: ["bootstrapExpiresAt"],
        message: "Bootstrap expiry must equal issued time plus the bounded TTL"
      });
    }
    if (state.sessionExpiry <= state.bootstrapExpiresAt) {
      context.addIssue({
        code: "custom",
        path: ["sessionExpiry"],
        message: "Session expiry must outlive the bootstrap handoff"
      });
    }
    if (state.updatedAt < state.issuedAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "State update cannot predate bootstrap issuance"
      });
    }
    if (bootstrapBindingHash(state) !== state.bootstrapBindingHash) {
      context.addIssue({
        code: "custom",
        path: ["bootstrapBindingHash"],
        message: "Bootstrap record binding does not match its immutable fields"
      });
    }
    if ("secretHandle" in state && "workerBindingHash" in state) {
      if (workerBindingHash(state) !== state.workerBindingHash) {
        context.addIssue({
          code: "custom",
          path: ["workerBindingHash"],
          message: "Worker record binding does not match its secret handle and public key"
        });
      }
    }

    const eventFields = [
      "provisioningStartedAt",
      "unknownAt",
      "grantSubmittedAt",
      "rejectedAt",
      "failedAt",
      "enabledAt",
      "authorityObservedAt",
      "lastAuthorityObservedAt",
      "expiredAt",
      "cleanupStartedAt",
      "cleanupFailedAt",
      "cleanedAt"
    ] as const;
    for (const field of eventFields) {
      if (!(field in state)) continue;
      const value = state[field as keyof typeof state];
      if (typeof value !== "number") continue;
      if (value < state.issuedAt || value > state.updatedAt) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Lifecycle event must be between issuance and the latest update"
        });
      }
    }
  });

export type AltanaBootstrapState = z.infer<typeof altanaBootstrapStateSchema>;

const secretCreationRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  bootstrapId: bootstrapIdSchema,
  idempotencyKey: idempotencyKeySchema,
  userId: userIdSchema,
  chainId: z.literal(BSC_TESTNET_CHAIN_ID),
  walletAddress: serializedSessionGrantIntentSchema.shape.walletAddress,
  policyHash: policyHashSchema,
  nonce: nonceSchema,
  issuedAt: unixSecondsSchema,
  bootstrapExpiresAt: unixSecondsSchema,
  sessionExpiry: sessionExpirySchema
});

export type AltanaBootstrapSecretCreationRequest = z.infer<typeof secretCreationRequestSchema>;

const secretCreationResultSchema = z.strictObject({
  bootstrapId: bootstrapIdSchema,
  idempotencyKey: idempotencyKeySchema,
  nonce: nonceSchema,
  secretHandle: opaqueSecretHandleSchema,
  publicDescriptor: sessionPublicGrantDescriptorSchema
});

const secretDeleteResultSchema = z.strictObject({
  status: z.enum(["deleted", "already_absent"])
});

export interface AltanaBootstrapSecretProvider {
  createOrGet(request: AltanaBootstrapSecretCreationRequest): Promise<unknown>;
  deleteByHandle(secretHandle: string): Promise<unknown>;
}

export interface AltanaBootstrapDependencies {
  readonly clock: () => Date;
  readonly id: () => string;
  readonly nonce: () => string;
}

export const altanaBootstrapGrantOutcomeSchema = z.strictObject({
  kind: z.enum([
    "sdk_confirmed",
    "wallet_rejected",
    "known_failed",
    "sdk_pending",
    "relay_timeout",
    "indeterminate_error"
  ])
});

export type AltanaBootstrapGrantOutcome = z.infer<typeof altanaBootstrapGrantOutcomeSchema>;

const authorityProbeBindingSchema = z.strictObject({
  bootstrapId: bootstrapIdSchema,
  bootstrapBindingHash: bindingHashSchema,
  chainId: z.literal(BSC_TESTNET_CHAIN_ID),
  nonce: nonceSchema,
  policyHash: policyHashSchema,
  walletAddress: serializedSessionGrantIntentSchema.shape.walletAddress
});

export const altanaBootstrapAuthorityProbeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("present"),
    binding: authorityProbeBindingSchema,
    observedAt: unixSecondsSchema,
    authority: observedSessionAuthoritySchema
  }),
  z.strictObject({
    status: z.literal("absent"),
    binding: authorityProbeBindingSchema,
    observedAt: unixSecondsSchema
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    binding: authorityProbeBindingSchema,
    observedAt: unixSecondsSchema
  })
]);

export type AltanaBootstrapAuthorityProbe = z.infer<typeof altanaBootstrapAuthorityProbeSchema>;

const projectionStatusSchema = z.enum([
  "bootstrap_ready",
  "secret_provisioning",
  "secret_outcome_unknown",
  "grant_ready",
  "grant_submitting",
  "grant_outcome_unknown",
  "grant_rejected",
  "grant_failed",
  "authority_pending",
  "execution_enabled",
  "grant_expired",
  "cleanup_pending",
  "cleanup_failed",
  "cleaned"
]);

export const altanaBootstrapBrowserProjectionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  bootstrapId: bootstrapIdSchema,
  userId: userIdSchema,
  chainId: z.literal(BSC_TESTNET_CHAIN_ID),
  walletAddress: serializedSessionGrantIntentSchema.shape.walletAddress,
  policyHash: policyHashSchema,
  nonce: nonceSchema,
  issuedAt: unixSecondsSchema,
  bootstrapExpiresAt: unixSecondsSchema,
  sessionExpiry: sessionExpirySchema,
  bootstrapBindingHash: bindingHashSchema,
  lifecycleStatus: projectionStatusSchema,
  executionEnabled: z.boolean(),
  grantRetryAllowed: z.literal(false),
  cleanupStatus: z.enum(["not_required", "required", "pending", "failed", "complete"]),
  sessionKey: sessionPublicGrantDescriptorSchema.nullable(),
  grantIntent: serializedSessionGrantIntentSchema.nullable()
});

export type AltanaBootstrapBrowserProjection = z.infer<
  typeof altanaBootstrapBrowserProjectionSchema
>;

export type AltanaBootstrapTransitionErrorCode =
  | "INVALID_TRANSITION"
  | "INVALID_CLOCK"
  | "INVALID_GENERATOR"
  | "TIME_REGRESSION"
  | "BOOTSTRAP_EXPIRED"
  | "SESSION_EXPIRED"
  | "RECORD_BINDING_MISMATCH"
  | "CLEANUP_TOO_EARLY"
  | "NO_SECRET_HANDLE"
  | "EXECUTION_ALREADY_ENABLED";

export class AltanaBootstrapTransitionError extends Error {
  readonly code: AltanaBootstrapTransitionErrorCode;

  constructor(code: AltanaBootstrapTransitionErrorCode) {
    super(`Altana bootstrap transition rejected: ${code}`);
    this.name = "AltanaBootstrapTransitionError";
    this.code = code;
  }
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort(compareStrings)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new AltanaBootstrapTransitionError("RECORD_BINDING_MISMATCH");
}

function canonicalPermissions(permissions: SerializedExactSessionPermissions) {
  return {
    calls: permissions.calls
      .map((call) => ({ signature: call.signature, to: call.to.toLowerCase() }))
      .sort((left, right) =>
        compareStrings(`${left.to}:${left.signature}`, `${right.to}:${right.signature}`)
      ),
    spend: permissions.spend
      .map((spend) => ({
        limit: spend.limit,
        period: spend.period,
        token: spend.token?.toLowerCase() ?? null
      }))
      .sort((left, right) =>
        compareStrings(
          `${left.token ?? "native"}:${left.period}:${left.limit}`,
          `${right.token ?? "native"}:${right.period}:${right.limit}`
        )
      )
  };
}

function domainHash(domain: string, value: unknown): `0x${string}` {
  return keccak256(stringToHex(`${domain}\n${canonicalJson(value)}`));
}

function bootstrapBindingHash(
  state: Pick<
    AltanaBootstrapState,
    | "bootstrapId"
    | "userId"
    | "chainId"
    | "walletAddress"
    | "policyHash"
    | "permissions"
    | "sessionExpiry"
    | "nonce"
    | "issuedAt"
    | "bootstrapExpiresAt"
    | "bootstrapTtlSeconds"
  >
): `0x${string}` {
  return domainHash("ProofEra Altana bootstrap binding v1", {
    bootstrapExpiresAt: state.bootstrapExpiresAt,
    bootstrapId: state.bootstrapId,
    bootstrapTtlSeconds: state.bootstrapTtlSeconds,
    chainId: state.chainId,
    issuedAt: state.issuedAt,
    nonce: state.nonce,
    permissions: canonicalPermissions(state.permissions),
    policyHash: state.policyHash.toLowerCase(),
    sessionExpiry: state.sessionExpiry,
    userId: state.userId,
    walletAddress: state.walletAddress.toLowerCase()
  });
}

function workerBindingHash(
  state: Pick<AltanaBootstrapState, "bootstrapBindingHash"> & {
    secretHandle: string;
    sessionKey: SessionPublicGrantDescriptor;
  }
): `0x${string}` {
  return domainHash("ProofEra Altana worker binding v1", {
    bootstrapBindingHash: state.bootstrapBindingHash,
    secretHandle: state.secretHandle,
    sessionKey: state.sessionKey
  });
}

function idempotencyKey(bootstrapId: string, nonce: string, policyHash: string) {
  return domainHash("ProofEra Altana bootstrap idempotency v1", {
    bootstrapId,
    nonce,
    policyHash: policyHash.toLowerCase()
  });
}

function stateBase(state: AltanaBootstrapState) {
  return {
    schemaVersion: state.schemaVersion,
    bootstrapId: state.bootstrapId,
    idempotencyKey: state.idempotencyKey,
    userId: state.userId,
    chainId: state.chainId,
    walletAddress: state.walletAddress,
    policyHash: state.policyHash,
    permissions: state.permissions,
    sessionExpiry: state.sessionExpiry,
    nonce: state.nonce,
    issuedAt: state.issuedAt,
    bootstrapExpiresAt: state.bootstrapExpiresAt,
    bootstrapTtlSeconds: state.bootstrapTtlSeconds,
    bootstrapBindingHash: state.bootstrapBindingHash
  };
}

function provisionedStateFields(state: Extract<AltanaBootstrapState, { secretHandle: string }>) {
  return {
    secretHandle: state.secretHandle,
    sessionKey: state.sessionKey,
    workerBindingHash: state.workerBindingHash
  };
}

function submittedStateFields(state: Extract<AltanaBootstrapState, { grantSubmittedAt: number }>) {
  return {
    ...provisionedStateFields(state),
    grantSubmittedAt: state.grantSubmittedAt
  };
}

function clockSeconds(clock: () => Date): number {
  let value: Date;
  try {
    value = clock();
  } catch {
    throw new AltanaBootstrapTransitionError("INVALID_CLOCK");
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new AltanaBootstrapTransitionError("INVALID_CLOCK");
  }
  const seconds = Math.floor(value.getTime() / 1_000);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new AltanaBootstrapTransitionError("INVALID_CLOCK");
  }
  return seconds;
}

function transitionAt(state: AltanaBootstrapState, clock: () => Date): number {
  const at = clockSeconds(clock);
  if (at < state.updatedAt) {
    throw new AltanaBootstrapTransitionError("TIME_REGRESSION");
  }
  return at;
}

function generatedValue<Output>(generator: () => string, schema: z.ZodType<Output>): Output {
  let value: unknown;
  try {
    value = generator();
  } catch {
    throw new AltanaBootstrapTransitionError("INVALID_GENERATOR");
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new AltanaBootstrapTransitionError("INVALID_GENERATOR");
  return result.data;
}

function ensureActive(state: AltanaBootstrapState, at: number): void {
  if (at >= state.bootstrapExpiresAt) {
    throw new AltanaBootstrapTransitionError("BOOTSTRAP_EXPIRED");
  }
  if (at >= state.sessionExpiry) {
    throw new AltanaBootstrapTransitionError("SESSION_EXPIRED");
  }
}

function grantIntentFromState(
  state: Pick<
    AltanaBootstrapState,
    "chainId" | "walletAddress" | "permissions" | "sessionExpiry"
  > & { sessionKey: SessionPublicGrantDescriptor }
): SerializedSessionGrantIntent {
  return serializedSessionGrantIntentSchema.parse({
    schemaVersion: 1,
    chainId: state.chainId,
    walletAddress: state.walletAddress,
    sessionKey: state.sessionKey,
    permissions: state.permissions,
    expiry: state.sessionExpiry,
    registerInKeystore: true
  });
}

function secretCreationRequest(
  state: Extract<AltanaBootstrapState, { status: "secret_provisioning" }>
): AltanaBootstrapSecretCreationRequest {
  return secretCreationRequestSchema.parse({
    schemaVersion: 1,
    bootstrapId: state.bootstrapId,
    idempotencyKey: state.idempotencyKey,
    userId: state.userId,
    chainId: state.chainId,
    walletAddress: state.walletAddress,
    policyHash: state.policyHash,
    nonce: state.nonce,
    issuedAt: state.issuedAt,
    bootstrapExpiresAt: state.bootstrapExpiresAt,
    sessionExpiry: state.sessionExpiry
  });
}

function secretUnknownState(
  state: Extract<AltanaBootstrapState, { status: "secret_provisioning" }>,
  at: number,
  reason: Extract<AltanaBootstrapState, { status: "secret_outcome_unknown" }>["reason"]
): AltanaBootstrapState {
  return altanaBootstrapStateSchema.parse({
    ...stateBase(state),
    status: "secret_outcome_unknown",
    provisioningStartedAt: state.provisioningStartedAt,
    unknownAt: at,
    reason,
    manualReconciliationRequired: true,
    retryable: false,
    updatedAt: at
  });
}

export function prepareAltanaBootstrap(
  unparsedRequest: unknown,
  dependencies: AltanaBootstrapDependencies
): AltanaBootstrapState {
  const request = altanaBootstrapRequestSchema.parse(unparsedRequest);
  const issuedAt = clockSeconds(dependencies.clock);
  const bootstrapId = generatedValue(dependencies.id, bootstrapIdSchema);
  const nonce = generatedValue(dependencies.nonce, nonceSchema);
  const bootstrapExpiresAt = issuedAt + request.bootstrapTtlSeconds;
  if (!Number.isSafeInteger(bootstrapExpiresAt)) {
    throw new AltanaBootstrapTransitionError("INVALID_CLOCK");
  }
  if (request.sessionExpiry <= bootstrapExpiresAt) {
    throw new AltanaBootstrapTransitionError("SESSION_EXPIRED");
  }

  const withoutHashes = {
    schemaVersion: 1 as const,
    bootstrapId,
    idempotencyKey: idempotencyKey(bootstrapId, nonce, request.policyHash),
    userId: request.userId,
    chainId: request.chainId,
    walletAddress: request.walletAddress,
    policyHash: request.policyHash,
    permissions: request.permissions,
    sessionExpiry: request.sessionExpiry,
    nonce,
    issuedAt,
    bootstrapExpiresAt,
    bootstrapTtlSeconds: request.bootstrapTtlSeconds
  };
  return altanaBootstrapStateSchema.parse({
    ...withoutHashes,
    bootstrapBindingHash: bootstrapBindingHash(withoutHashes),
    status: "bootstrap_ready",
    updatedAt: issuedAt
  });
}

export function beginAltanaBootstrapSecretProvisioning(
  unparsedState: unknown,
  clock: () => Date
): AltanaBootstrapState {
  const state = altanaBootstrapStateSchema.parse(unparsedState);
  if (state.status !== "bootstrap_ready") {
    throw new AltanaBootstrapTransitionError("INVALID_TRANSITION");
  }
  const at = transitionAt(state, clock);
  ensureActive(state, at);
  return altanaBootstrapStateSchema.parse({
    ...stateBase(state),
    status: "secret_provisioning",
    provisioningStartedAt: at,
    updatedAt: at
  });
}

export async function provisionAltanaBootstrapSecret(
  unparsedState: unknown,
  provider: AltanaBootstrapSecretProvider,
  clock: () => Date
): Promise<AltanaBootstrapState> {
  const state = altanaBootstrapStateSchema.parse(unparsedState);
  if (state.status !== "secret_provisioning") {
    throw new AltanaBootstrapTransitionError("INVALID_TRANSITION");
  }

  let unparsedResult: unknown;
  try {
    unparsedResult = await provider.createOrGet(secretCreationRequest(state));
  } catch {
    return secretUnknownState(state, transitionAt(state, clock), "secret_provider_exception");
  }
  const at = transitionAt(state, clock);
  const result = secretCreationResultSchema.safeParse(unparsedResult);
  if (!result.success) return secretUnknownState(state, at, "invalid_provider_result");
  if (
    result.data.bootstrapId !== state.bootstrapId ||
    result.data.idempotencyKey !== state.idempotencyKey ||
    result.data.nonce !== state.nonce
  ) {
    return secretUnknownState(state, at, "provider_binding_mismatch");
  }

  const provisioned = {
    secretHandle: result.data.secretHandle,
    sessionKey: result.data.publicDescriptor,
    workerBindingHash: workerBindingHash({
      bootstrapBindingHash: state.bootstrapBindingHash,
      secretHandle: result.data.secretHandle,
      sessionKey: result.data.publicDescriptor
    })
  };
  if (at >= state.bootstrapExpiresAt || at >= state.sessionExpiry) {
    return altanaBootstrapStateSchema.parse({
      ...stateBase(state),
      ...provisioned,
      status: "grant_expired",
      expiredAt: at,
      priorGrantStatus: "secret_provisioning",
      retryable: false,
      updatedAt: at
    });
  }
  return altanaBootstrapStateSchema.parse({
    ...stateBase(state),
    ...provisioned,
    status: "grant_ready",
    updatedAt: at
  });
}

export function beginAltanaBootstrapGrant(
  unparsedState: unknown,
  clock: () => Date
): AltanaBootstrapState {
  const state = altanaBootstrapStateSchema.parse(unparsedState);
  if (state.status !== "grant_ready") {
    throw new AltanaBootstrapTransitionError("INVALID_TRANSITION");
  }
  const at = transitionAt(state, clock);
  ensureActive(state, at);
  return altanaBootstrapStateSchema.parse({
    ...stateBase(state),
    ...provisionedStateFields(state),
    status: "grant_submitting",
    grantSubmittedAt: at,
    updatedAt: at
  });
}

export function settleAltanaBootstrapGrant(
  unparsedState: unknown,
  unparsedOutcome: unknown,
  clock: () => Date
): AltanaBootstrapState {
  const state = altanaBootstrapStateSchema.parse(unparsedState);
  if (state.status !== "grant_submitting") {
    throw new AltanaBootstrapTransitionError("INVALID_TRANSITION");
  }
  const outcome = altanaBootstrapGrantOutcomeSchema.parse(unparsedOutcome);
  const at = transitionAt(state, clock);
  if (at >= state.bootstrapExpiresAt || at >= state.sessionExpiry) {
    return altanaBootstrapStateSchema.parse({
      ...stateBase(state),
      ...provisionedStateFields(state),
      status: "grant_expired",
      expiredAt: at,
      priorGrantStatus: "grant_submitting",
      retryable: false,
      updatedAt: at
    });
  }

  const submitted = submittedStateFields(state);
  if (outcome.kind === "sdk_confirmed") {
    return altanaBootstrapStateSchema.parse({
      ...stateBase(state),
      ...submitted,
      status: "authority_pending",
      grantResolution: "sdk_confirmed",
      authorityStatus: "probe_required",
      authorityMismatches: [],
      lastAuthorityObservedAt: null,
      authorityProbeRequired: true,
      retryable: false,
      updatedAt: at
    });
  }
  if (outcome.kind === "wallet_rejected") {
    return altanaBootstrapStateSchema.parse({
      ...stateBase(state),
      ...submitted,
      status: "grant_rejected",
      rejectedAt: at,
      reason: outcome.kind,
      retryable: false,
      updatedAt: at
    });
  }
  if (outcome.kind === "known_failed") {
    return altanaBootstrapStateSchema.parse({
      ...stateBase(state),
      ...submitted,
      status: "grant_failed",
      failedAt: at,
      reason: "known_grant_failure",
      retryable: false,
      updatedAt: at
    });
  }
  return altanaBootstrapStateSchema.parse({
    ...stateBase(state),
    ...submitted,
    status: "grant_outcome_unknown",
    unknownAt: at,
    reason: outcome.kind,
    authorityProbeRequired: true,
    retryable: false,
    updatedAt: at
  });
}

export function canRetryAltanaBootstrapGrant(unparsedState: unknown): false {
  altanaBootstrapStateSchema.parse(unparsedState);
  return false;
}

export function authorityProbeBindingFromState(unparsedState: unknown) {
  const state = altanaBootstrapStateSchema.parse(unparsedState);
  return authorityProbeBindingSchema.parse({
    bootstrapId: state.bootstrapId,
    bootstrapBindingHash: state.bootstrapBindingHash,
    chainId: state.chainId,
    nonce: state.nonce,
    policyHash: state.policyHash,
    walletAddress: state.walletAddress
  });
}

function recordBindingMatches(
  state: AltanaBootstrapState,
  binding: z.infer<typeof authorityProbeBindingSchema>
): boolean {
  return (
    state.bootstrapId === binding.bootstrapId &&
    state.bootstrapBindingHash === binding.bootstrapBindingHash &&
    state.chainId === binding.chainId &&
    state.nonce === binding.nonce &&
    state.policyHash === binding.policyHash &&
    state.walletAddress === binding.walletAddress
  );
}

function authorityPendingState(
  state: Extract<AltanaBootstrapState, { status: "authority_pending" | "grant_outcome_unknown" }>,
  at: number,
  authorityStatus: Extract<
    AltanaBootstrapState,
    { status: "authority_pending" }
  >["authorityStatus"],
  observedAt: number | null,
  mismatches: Extract<
    AltanaBootstrapState,
    { status: "authority_pending" }
  >["authorityMismatches"] = []
): AltanaBootstrapState {
  return altanaBootstrapStateSchema.parse({
    ...stateBase(state),
    ...submittedStateFields(state),
    status: "authority_pending",
    grantResolution:
      state.status === "authority_pending" ? state.grantResolution : "unknown_outcome_probe",
    authorityStatus,
    authorityMismatches: mismatches,
    lastAuthorityObservedAt: observedAt,
    authorityProbeRequired: true,
    retryable: false,
    updatedAt: at
  });
}

function expiredGrantState(
  state: Extract<AltanaBootstrapState, { status: "authority_pending" | "grant_outcome_unknown" }>,
  at: number
): AltanaBootstrapState {
  return altanaBootstrapStateSchema.parse({
    ...stateBase(state),
    ...provisionedStateFields(state),
    status: "grant_expired",
    expiredAt: at,
    priorGrantStatus: state.status,
    retryable: false,
    updatedAt: at
  });
}

export function reconcileAltanaBootstrapAuthority(
  unparsedState: unknown,
  unparsedProbe: unknown,
  clock: () => Date
): AltanaBootstrapState {
  const state = altanaBootstrapStateSchema.parse(unparsedState);
  if (state.status !== "authority_pending" && state.status !== "grant_outcome_unknown") {
    throw new AltanaBootstrapTransitionError("INVALID_TRANSITION");
  }
  const probe = altanaBootstrapAuthorityProbeSchema.parse(unparsedProbe);
  if (!recordBindingMatches(state, probe.binding)) {
    throw new AltanaBootstrapTransitionError("RECORD_BINDING_MISMATCH");
  }
  const at = transitionAt(state, clock);
  if (at >= state.bootstrapExpiresAt || at >= state.sessionExpiry) {
    return expiredGrantState(state, at);
  }
  if (probe.observedAt > at) {
    // A future-dated probe is not a valid observation and must not advance the
    // lifecycle's last-authority timestamp.
    return authorityPendingState(state, at, "future", null);
  }
  if (probe.observedAt < state.issuedAt) {
    return authorityPendingState(state, at, "stale", null);
  }
  if (
    state.status === "authority_pending" &&
    state.lastAuthorityObservedAt !== null &&
    probe.observedAt <= state.lastAuthorityObservedAt
  ) {
    // Never let an older (or contradictory same-timestamp) snapshot replace a
    // newer authority observation.
    return authorityPendingState(state, at, "stale", state.lastAuthorityObservedAt);
  }
  if (at - probe.observedAt > MAX_AUTHORITY_PROBE_AGE_SECONDS) {
    return authorityPendingState(state, at, "stale", probe.observedAt);
  }
  if (probe.status === "absent") {
    return authorityPendingState(state, at, "absent", probe.observedAt);
  }
  if (probe.status === "unavailable") {
    return authorityPendingState(state, at, "unavailable", probe.observedAt);
  }

  const verification = verifySessionAuthority(grantIntentFromState(state), probe.authority);
  if (!verification.matches) {
    return authorityPendingState(state, at, "mismatch", probe.observedAt, [
      ...verification.mismatches
    ]);
  }
  return altanaBootstrapStateSchema.parse({
    ...stateBase(state),
    ...submittedStateFields(state),
    status: "execution_enabled",
    enabledAt: at,
    authorityObservedAt: probe.observedAt,
    authorityVerification: "exact",
    updatedAt: at
  });
}

function cleanupOperationId(workerHash: string): `0x${string}` {
  return domainHash("ProofEra Altana orphan cleanup v1", { workerBindingHash: workerHash });
}

export function beginAltanaBootstrapOrphanCleanup(
  unparsedState: unknown,
  clock: () => Date
): AltanaBootstrapState {
  const state = altanaBootstrapStateSchema.parse(unparsedState);
  if (state.status === "cleaned" || state.status === "cleanup_pending") return state;
  if (state.status === "execution_enabled") {
    throw new AltanaBootstrapTransitionError("EXECUTION_ALREADY_ENABLED");
  }
  if (!("secretHandle" in state) || !("workerBindingHash" in state)) {
    throw new AltanaBootstrapTransitionError("NO_SECRET_HANDLE");
  }
  const at = transitionAt(state, clock);
  if (at < state.bootstrapExpiresAt && state.status !== "grant_expired") {
    throw new AltanaBootstrapTransitionError("CLEANUP_TOO_EARLY");
  }
  const priorStatus =
    state.status === "cleanup_failed"
      ? state.priorStatus
      : cleanupPriorStatusSchema.parse(state.status);
  const cleanupStartedAt = state.status === "cleanup_failed" ? state.cleanupStartedAt : at;
  return altanaBootstrapStateSchema.parse({
    ...stateBase(state),
    ...provisionedStateFields(state),
    status: "cleanup_pending",
    cleanupOperationId: cleanupOperationId(state.workerBindingHash),
    cleanupStartedAt,
    priorStatus,
    updatedAt: at
  });
}

export async function settleAltanaBootstrapOrphanCleanup(
  unparsedState: unknown,
  provider: AltanaBootstrapSecretProvider,
  clock: () => Date
): Promise<AltanaBootstrapState> {
  const state = altanaBootstrapStateSchema.parse(unparsedState);
  if (state.status === "cleaned") return state;
  if (state.status !== "cleanup_pending") {
    throw new AltanaBootstrapTransitionError("INVALID_TRANSITION");
  }

  let unparsedResult: unknown;
  try {
    unparsedResult = await provider.deleteByHandle(state.secretHandle);
  } catch {
    const at = transitionAt(state, clock);
    return altanaBootstrapStateSchema.parse({
      ...stateBase(state),
      ...provisionedStateFields(state),
      status: "cleanup_failed",
      cleanupOperationId: state.cleanupOperationId,
      cleanupStartedAt: state.cleanupStartedAt,
      cleanupFailedAt: at,
      priorStatus: state.priorStatus,
      reason: "secret_delete_exception",
      cleanupRequired: true,
      updatedAt: at
    });
  }
  const at = transitionAt(state, clock);
  const result = secretDeleteResultSchema.safeParse(unparsedResult);
  if (!result.success) {
    return altanaBootstrapStateSchema.parse({
      ...stateBase(state),
      ...provisionedStateFields(state),
      status: "cleanup_failed",
      cleanupOperationId: state.cleanupOperationId,
      cleanupStartedAt: state.cleanupStartedAt,
      cleanupFailedAt: at,
      priorStatus: state.priorStatus,
      reason: "invalid_delete_result",
      cleanupRequired: true,
      updatedAt: at
    });
  }
  return altanaBootstrapStateSchema.parse({
    ...stateBase(state),
    status: "cleaned",
    sessionKey: state.sessionKey,
    cleanupOperationId: state.cleanupOperationId,
    cleanedAt: at,
    priorStatus: state.priorStatus,
    deleteOutcome: result.data.status,
    updatedAt: at
  });
}

function cleanupStatus(state: AltanaBootstrapState) {
  if (state.status === "cleaned") return "complete" as const;
  if (state.status === "cleanup_pending") return "pending" as const;
  if (state.status === "cleanup_failed") return "failed" as const;
  if (
    state.status === "grant_rejected" ||
    state.status === "grant_failed" ||
    state.status === "grant_outcome_unknown" ||
    state.status === "grant_expired"
  ) {
    return "required" as const;
  }
  return "not_required" as const;
}

export function projectAltanaBootstrapForBrowser(
  unparsedState: unknown
): AltanaBootstrapBrowserProjection {
  const state = altanaBootstrapStateSchema.parse(unparsedState);
  const sessionKey = "sessionKey" in state ? state.sessionKey : null;
  return altanaBootstrapBrowserProjectionSchema.parse({
    schemaVersion: 1,
    bootstrapId: state.bootstrapId,
    userId: state.userId,
    chainId: state.chainId,
    walletAddress: state.walletAddress,
    policyHash: state.policyHash,
    nonce: state.nonce,
    issuedAt: state.issuedAt,
    bootstrapExpiresAt: state.bootstrapExpiresAt,
    sessionExpiry: state.sessionExpiry,
    bootstrapBindingHash: state.bootstrapBindingHash,
    lifecycleStatus: state.status,
    executionEnabled: state.status === "execution_enabled",
    grantRetryAllowed: false,
    cleanupStatus: cleanupStatus(state),
    sessionKey,
    grantIntent: sessionKey === null ? null : grantIntentFromState({ ...state, sessionKey })
  });
}
