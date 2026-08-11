import type { GrantSessionOptions, SessionPermissions, Signer } from "@altananetwork/sdk";
import { getAddress, isAddress, parseAbiItem, type Address, type Hex } from "viem";
import { publicKeyToAddress } from "viem/accounts";
import { z } from "zod";

const BSC_TESTNET_CHAIN_ID = 97 as const;
const UINT40_MAX = 2 ** 40 - 1;
const UINT256_MAX = (1n << 256n) - 1n;
const SECP256K1_FIELD_PRIME = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Invalid EVM address")
  .transform((value) => getAddress(value) as Address);

const nonZeroAddressSchema = addressSchema.refine(
  (value) => value !== ZERO_ADDRESS,
  "The zero address is not allowed"
);

function isUncompressedSecp256k1PublicKey(value: string): value is Hex {
  if (!/^0x04[0-9a-fA-F]{128}$/.test(value)) return false;

  const x = BigInt(`0x${value.slice(4, 68)}`);
  const y = BigInt(`0x${value.slice(68, 132)}`);
  if (x >= SECP256K1_FIELD_PRIME || y >= SECP256K1_FIELD_PRIME) return false;

  const left = (y * y) % SECP256K1_FIELD_PRIME;
  const right = (x * x * x + 7n) % SECP256K1_FIELD_PRIME;
  return left === right;
}

export const uncompressedSecp256k1PublicKeySchema = z
  .string()
  .refine(
    isUncompressedSecp256k1PublicKey,
    "Expected a valid SEC1 uncompressed secp256k1 public key"
  )
  .transform((value) => value.toLowerCase() as Hex);

const functionSignatureSchema = z
  .string()
  .min(3)
  .max(512)
  .refine((value) => !/\s/.test(value), "Use a canonical signature without whitespace")
  .refine((value) => {
    try {
      const item = parseAbiItem(`function ${value}`);
      return item.type === "function";
    } catch {
      return false;
    }
  }, "Invalid ABI function signature");

const decimalUint256Schema = z
  .string()
  .regex(/^[1-9][0-9]*$/, "Expected a positive decimal integer string")
  .refine((value) => {
    try {
      return BigInt(value) <= UINT256_MAX;
    } catch {
      return false;
    }
  }, "Value exceeds uint256");

const spendPeriodSchema = z.enum(["minute", "hour", "day", "week", "month", "year"]);

export const sessionPublicGrantDescriptorSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    custody: z.literal("worker-kms"),
    curve: z.literal("secp256k1"),
    publicKey: uncompressedSecp256k1PublicKeySchema,
    address: nonZeroAddressSchema
  })
  .superRefine((descriptor, context) => {
    const derived = publicKeyToAddress(descriptor.publicKey);
    if (derived !== descriptor.address) {
      context.addIssue({
        code: "custom",
        path: ["address"],
        message: "Address does not match the supplied public key"
      });
    }
  });

export type SessionPublicGrantDescriptor = z.infer<typeof sessionPublicGrantDescriptorSchema>;

export const exactCallPermissionSchema = z.strictObject({
  to: nonZeroAddressSchema,
  signature: functionSignatureSchema
});

export const serializedSpendPermissionSchema = z.strictObject({
  token: nonZeroAddressSchema.nullable(),
  limit: decimalUint256Schema,
  period: spendPeriodSchema
});

export const serializedExactSessionPermissionsSchema = z
  .strictObject({
    calls: z.array(exactCallPermissionSchema).min(1).max(32),
    spend: z.array(serializedSpendPermissionSchema).min(1).max(32)
  })
  .superRefine((permissions, context) => {
    const callKeys = permissions.calls.map(
      ({ to, signature }) => `${to.toLowerCase()}:${signature}`
    );
    if (new Set(callKeys).size !== callKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["calls"],
        message: "Duplicate call permissions are not allowed"
      });
    }

    const spendKeys = permissions.spend.map(
      ({ token, period }) => `${token?.toLowerCase() ?? "native"}:${period}`
    );
    if (new Set(spendKeys).size !== spendKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["spend"],
        message: "Duplicate token/period spend caps are not allowed"
      });
    }
  });

export const serializedSessionGrantIntentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  chainId: z.literal(BSC_TESTNET_CHAIN_ID),
  walletAddress: nonZeroAddressSchema,
  sessionKey: sessionPublicGrantDescriptorSchema,
  permissions: serializedExactSessionPermissionsSchema,
  expiry: z.number().int().positive().max(UINT40_MAX),
  registerInKeystore: z.literal(true)
});

export type SerializedExactSessionPermissions = z.infer<
  typeof serializedExactSessionPermissionsSchema
>;
export type SerializedSessionGrantIntent = z.infer<typeof serializedSessionGrantIntentSchema>;

export type ExactSessionPermissions = {
  calls: readonly z.infer<typeof exactCallPermissionSchema>[];
  spend: readonly {
    token: Address | null;
    limit: bigint;
    period: z.infer<typeof spendPeriodSchema>;
  }[];
};

export type SessionGrantIntent = Omit<SerializedSessionGrantIntent, "permissions"> & {
  permissions: ExactSessionPermissions;
};

export class PublicOnlySessionSignerError extends Error {
  constructor() {
    super(
      "This public-only session signer cannot sign. Signing must occur inside the dedicated worker/KMS."
    );
    this.name = "PublicOnlySessionSignerError";
  }
}

/**
 * Builds the exact descriptor the worker may hand to the browser. The private
 * key is neither accepted nor represented by this boundary.
 */
export function createSessionPublicGrantDescriptor(publicKey: Hex): SessionPublicGrantDescriptor {
  const normalizedPublicKey = uncompressedSecp256k1PublicKeySchema.parse(publicKey);
  return sessionPublicGrantDescriptorSchema.parse({
    schemaVersion: 1,
    custody: "worker-kms",
    curve: "secp256k1",
    publicKey: normalizedPublicKey,
    address: publicKeyToAddress(normalizedPublicKey)
  });
}

/**
 * Altana 0.7.0 accepts a Signer as the public key descriptor passed to
 * grantSession. It must not ask this object to sign: the rejecting method is a
 * fail-closed guard if SDK behavior changes or it is used on the wrong path.
 * `injected` is the SDK's secp256k1-without-raw-private-material discriminator.
 */
export function createPublicOnlySessionSigner(
  descriptorInput: SessionPublicGrantDescriptor
): Signer {
  const descriptor = sessionPublicGrantDescriptorSchema.parse(descriptorInput);
  return Object.freeze({
    type: "injected",
    address: descriptor.address,
    publicKey: descriptor.publicKey,
    async signDigest(): Promise<Hex> {
      throw new PublicOnlySessionSignerError();
    }
  } satisfies Signer);
}

export function serializeSessionGrantIntent(
  intent: SessionGrantIntent
): SerializedSessionGrantIntent {
  return serializedSessionGrantIntentSchema.parse({
    ...intent,
    permissions: {
      calls: intent.permissions.calls,
      spend: intent.permissions.spend.map((permission) => ({
        ...permission,
        limit: permission.limit.toString(10)
      }))
    }
  });
}

export function deserializeSessionGrantIntent(input: unknown): SessionGrantIntent {
  const serialized = serializedSessionGrantIntentSchema.parse(input);
  return {
    ...serialized,
    permissions: {
      calls: serialized.permissions.calls,
      spend: serialized.permissions.spend.map((permission) => ({
        ...permission,
        limit: BigInt(permission.limit)
      }))
    }
  };
}

/** Converts a validated wire intent into the exact Altana 0.7.0 grant input. */
export function toAltanaGrantSessionOptions(input: unknown): GrantSessionOptions {
  const intent = deserializeSessionGrantIntent(input);
  const spend: NonNullable<SessionPermissions["spend"]> = intent.permissions.spend.map(
    ({ token, limit, period }) => (token === null ? { limit, period } : { token, limit, period })
  );

  return {
    permissions: {
      calls: intent.permissions.calls,
      spend
    },
    expiry: intent.expiry,
    sessionSigner: createPublicOnlySessionSigner(intent.sessionKey),
    register: true
  };
}

export const observedSessionAuthoritySchema = z.strictObject({
  chainId: z.literal(BSC_TESTNET_CHAIN_ID),
  walletAddress: nonZeroAddressSchema,
  publicKey: uncompressedSecp256k1PublicKeySchema,
  permissions: serializedExactSessionPermissionsSchema,
  expiry: z.number().int().positive().max(UINT40_MAX)
});

export type ObservedSessionAuthority = z.infer<typeof observedSessionAuthoritySchema>;
export type AuthorityMismatch =
  "authority_shape" | "chain_id" | "wallet_address" | "public_key" | "permissions" | "expiry";

export type AuthorityVerification =
  | { matches: true; mismatches: readonly [] }
  | { matches: false; mismatches: readonly AuthorityMismatch[] };

function canonicalPermissions(permissions: SerializedExactSessionPermissions): string {
  const calls = permissions.calls
    .map(({ to, signature }) => `${to.toLowerCase()}:${signature}`)
    .sort();
  const spend = permissions.spend
    .map(({ token, limit, period }) => `${token?.toLowerCase() ?? "native"}:${period}:${limit}`)
    .sort();
  return JSON.stringify({ calls, spend });
}

/**
 * Worker execution must remain blocked unless this exact comparison succeeds
 * against a fresh authority read from the configured BSC testnet account.
 */
export function verifySessionAuthority(
  expectedInput: unknown,
  observedInput: unknown
): AuthorityVerification {
  const expectedResult = serializedSessionGrantIntentSchema.safeParse(expectedInput);
  const observedResult = observedSessionAuthoritySchema.safeParse(observedInput);
  if (!expectedResult.success || !observedResult.success) {
    return { matches: false, mismatches: ["authority_shape"] };
  }

  const expected = expectedResult.data;
  const observed = observedResult.data;
  const mismatches: AuthorityMismatch[] = [];
  if (expected.chainId !== observed.chainId) mismatches.push("chain_id");
  if (expected.walletAddress !== observed.walletAddress) {
    mismatches.push("wallet_address");
  }
  if (expected.sessionKey.publicKey !== observed.publicKey) {
    mismatches.push("public_key");
  }
  if (canonicalPermissions(expected.permissions) !== canonicalPermissions(observed.permissions)) {
    mismatches.push("permissions");
  }
  if (expected.expiry !== observed.expiry) mismatches.push("expiry");

  return mismatches.length === 0
    ? { matches: true, mismatches: [] }
    : { matches: false, mismatches };
}

type GrantStateBase = {
  intent: SerializedSessionGrantIntent;
};

export type SessionGrantLifecycle =
  | (GrantStateBase & { status: "ready" })
  | (GrantStateBase & { status: "submitting" })
  | (GrantStateBase & {
      status: "confirmed";
      confirmation: "sdk" | "authority_probe";
    })
  | (GrantStateBase & { status: "rejected"; reason: string })
  | (GrantStateBase & {
      status: "failed";
      reason: string;
      retryable: boolean;
    })
  | (GrantStateBase & {
      status: "outcome_unknown";
      reason: "sdk_pending" | "relay_timeout" | "indeterminate_error";
      probeRequired: true;
    });

export type SessionGrantSubmissionOutcome =
  | { kind: "confirmed" }
  | { kind: "known_failed"; reason: string }
  | { kind: "threw"; error: unknown };

export type SessionAuthorityProbe =
  { status: "present"; authority: unknown } | { status: "absent" } | { status: "unavailable" };

export function createReadySessionGrant(intentInput: unknown): SessionGrantLifecycle {
  return {
    status: "ready",
    intent: serializedSessionGrantIntentSchema.parse(intentInput)
  };
}

export function beginSessionGrantSubmission(state: SessionGrantLifecycle): SessionGrantLifecycle {
  if (state.status !== "ready") {
    throw new Error(`Cannot submit a session grant from ${state.status}`);
  }
  return { status: "submitting", intent: state.intent };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

export function settleSessionGrantSubmission(
  state: SessionGrantLifecycle,
  outcome: SessionGrantSubmissionOutcome
): SessionGrantLifecycle {
  if (state.status !== "submitting") {
    throw new Error(`Cannot settle a session grant from ${state.status}`);
  }

  if (outcome.kind === "confirmed") {
    return { status: "confirmed", intent: state.intent, confirmation: "sdk" };
  }
  if (outcome.kind === "known_failed") {
    return {
      status: "failed",
      intent: state.intent,
      reason: outcome.reason,
      retryable: true
    };
  }

  const message = errorMessage(outcome.error);
  const code = errorCode(outcome.error);
  if (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    /user (?:rejected|denied)|request rejected/i.test(message)
  ) {
    return { status: "rejected", intent: state.intent, reason: message };
  }
  if (/status\s*=\s*PENDING|\bPENDING\b/i.test(message)) {
    return {
      status: "outcome_unknown",
      intent: state.intent,
      reason: "sdk_pending",
      probeRequired: true
    };
  }
  if (/timed?\s*out|timeout|relay.*unavailable|fetch failed/i.test(message)) {
    return {
      status: "outcome_unknown",
      intent: state.intent,
      reason: "relay_timeout",
      probeRequired: true
    };
  }
  if (/status\s*=\s*FAILED/i.test(message)) {
    return {
      status: "failed",
      intent: state.intent,
      reason: message,
      retryable: true
    };
  }

  // Unknown exceptions may happen after relay acceptance. Conservatively
  // require an authority read before another admin signature is requested.
  return {
    status: "outcome_unknown",
    intent: state.intent,
    reason: "indeterminate_error",
    probeRequired: true
  };
}

export function resolveUnknownGrantWithAuthorityProbe(
  state: SessionGrantLifecycle,
  probe: SessionAuthorityProbe
): SessionGrantLifecycle {
  if (state.status !== "outcome_unknown") {
    throw new Error(`Cannot resolve an unknown outcome from ${state.status}`);
  }
  if (probe.status === "unavailable") return state;
  if (probe.status === "absent") {
    return {
      status: "failed",
      intent: state.intent,
      reason: "Authority was absent after an explicit probe",
      retryable: true
    };
  }

  const verification = verifySessionAuthority(state.intent, probe.authority);
  return verification.matches
    ? {
        status: "confirmed",
        intent: state.intent,
        confirmation: "authority_probe"
      }
    : {
        status: "failed",
        intent: state.intent,
        reason: `Observed authority did not match: ${verification.mismatches.join(", ")}`,
        retryable: false
      };
}

export function canRetrySessionGrant(state: SessionGrantLifecycle): boolean {
  return state.status === "rejected" || (state.status === "failed" && state.retryable);
}

export function prepareSessionGrantRetry(state: SessionGrantLifecycle): SessionGrantLifecycle {
  if (!canRetrySessionGrant(state)) {
    throw new Error(`Cannot retry a session grant from ${state.status}`);
  }
  return { status: "ready", intent: state.intent };
}
