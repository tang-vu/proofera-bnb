import type {
  ClientGrantSessionOptions,
  PasskeySigner,
  SessionPermissions,
  Signer
} from "@altananetwork/sdk";
import { keccak256, stringToHex } from "viem";
import { z } from "zod";

import {
  altanaBootstrapStateSchema,
  beginAltanaBootstrapGrant,
  settleAltanaBootstrapGrant,
  type AltanaBootstrapState
} from "./altana-bootstrap";
import { serializedSessionGrantIntentSchema, toAltanaGrantSessionOptions } from "./altana-session";

const BSC_TESTNET_CHAIN_ID = 97 as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const P256_FIELD_PRIME = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

const hashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Expected a canonical 32-byte hash")
  .transform((value) => value.toLowerCase() as `0x${string}`);
const bootstrapIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/, "Invalid bootstrap identifier");
const unixSecondsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const transitionSchema = z.strictObject({
  priorStatus: z.literal("grant_ready"),
  nextStatus: z.literal("grant_submitting"),
  issuedAt: unixSecondsSchema,
  readyUpdatedAt: unixSecondsSchema,
  grantSubmittedAt: unixSecondsSchema,
  bootstrapExpiresAt: unixSecondsSchema
});

const requestBaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  bootstrapId: bootstrapIdSchema,
  idempotencyKey: hashSchema,
  bootstrapBindingHash: hashSchema,
  workerBindingHash: hashSchema,
  policyHash: hashSchema,
  transition: transitionSchema,
  grantIntent: serializedSessionGrantIntentSchema
});

type AltanaGrantSubmissionRequestBase = z.infer<typeof requestBaseSchema>;

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
  throw new AltanaGrantSubmissionError("INVALID_REQUEST");
}

function submissionBindingHash(base: AltanaGrantSubmissionRequestBase): `0x${string}` {
  return keccak256(stringToHex(`ProofEra Altana grant submission v1\n${canonicalJson(base)}`));
}

export const altanaGrantSubmissionRequestSchema = requestBaseSchema
  .extend({ submissionBindingHash: hashSchema })
  .superRefine((request, context) => {
    if (
      request.transition.issuedAt > request.transition.readyUpdatedAt ||
      request.transition.readyUpdatedAt > request.transition.grantSubmittedAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["transition"],
        message: "Grant transition chronology is invalid"
      });
    }
    if (
      request.transition.grantSubmittedAt >= request.transition.bootstrapExpiresAt ||
      request.transition.bootstrapExpiresAt >= request.grantIntent.expiry
    ) {
      context.addIssue({
        code: "custom",
        path: ["transition", "bootstrapExpiresAt"],
        message: "The grant transition must precede bootstrap and session expiry"
      });
    }
    const base = requestBaseSchema.parse({
      schemaVersion: request.schemaVersion,
      bootstrapId: request.bootstrapId,
      idempotencyKey: request.idempotencyKey,
      bootstrapBindingHash: request.bootstrapBindingHash,
      workerBindingHash: request.workerBindingHash,
      policyHash: request.policyHash,
      transition: request.transition,
      grantIntent: request.grantIntent
    });
    if (submissionBindingHash(base) !== request.submissionBindingHash) {
      context.addIssue({
        code: "custom",
        path: ["submissionBindingHash"],
        message: "Grant submission binding does not match its immutable request"
      });
    }
  });

export type AltanaGrantSubmissionRequest = z.infer<typeof altanaGrantSubmissionRequestSchema>;

export const altanaGrantSubmissionClaimSchema = z.strictObject({
  schemaVersion: z.literal(1),
  bootstrapId: bootstrapIdSchema,
  idempotencyKey: hashSchema,
  bootstrapBindingHash: hashSchema,
  submissionBindingHash: hashSchema,
  priorStatus: z.literal("grant_ready"),
  nextStatus: z.literal("grant_submitting"),
  grantSubmittedAt: unixSecondsSchema
});

export type AltanaGrantSubmissionClaim = z.infer<typeof altanaGrantSubmissionClaimSchema>;

const claimResultSchema = z.strictObject({
  status: z.enum(["claimed", "already_claimed"]),
  bootstrapId: bootstrapIdSchema,
  idempotencyKey: hashSchema,
  bootstrapBindingHash: hashSchema,
  submissionBindingHash: hashSchema,
  grantSubmittedAt: unixSecondsSchema
});

const grantOutcomeSchema = z.enum([
  "sdk_confirmed",
  "wallet_rejected",
  "known_failed",
  "sdk_pending",
  "relay_timeout",
  "indeterminate_error"
]);

export const altanaGrantSubmissionResponseSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    request: altanaGrantSubmissionRequestSchema,
    outcome: grantOutcomeSchema,
    executionEnabled: z.literal(false),
    authorityProbeRequired: z.boolean(),
    retryable: z.literal(false)
  })
  .superRefine((response, context) => {
    const expectedProbe =
      response.outcome === "sdk_confirmed" ||
      response.outcome === "sdk_pending" ||
      response.outcome === "relay_timeout" ||
      response.outcome === "indeterminate_error";
    if (response.authorityProbeRequired !== expectedProbe) {
      context.addIssue({
        code: "custom",
        path: ["authorityProbeRequired"],
        message: "Authority-probe requirement does not match the grant outcome"
      });
    }
  });

export type AltanaGrantSubmissionResponse = z.infer<typeof altanaGrantSubmissionResponseSchema>;

export type AltanaSdkGrantSession = (options: ClientGrantSessionOptions) => Promise<unknown>;

export interface AltanaGrantSubmissionDependencies {
  readonly adminSigner: Signer;
  readonly clock: () => Date;
  readonly expectedRpId: string;
  readonly claimSubmission: (claim: AltanaGrantSubmissionClaim) => Promise<unknown>;
  readonly grantSession: AltanaSdkGrantSession;
}

export type AltanaGrantSubmissionErrorCode =
  | "INVALID_STATE"
  | "INVALID_TRANSITION"
  | "TRANSITION_BINDING_MISMATCH"
  | "INVALID_REQUEST"
  | "INVALID_DEPENDENCIES"
  | "INVALID_ADMIN_SIGNER"
  | "RP_ID_MISMATCH"
  | "INVALID_CLOCK"
  | "TIME_REGRESSION"
  | "SUBMISSION_EXPIRED"
  | "CLAIM_UNAVAILABLE"
  | "CLAIM_MALFORMED"
  | "CLAIM_BINDING_MISMATCH"
  | "SUBMISSION_ALREADY_CLAIMED";

const ERROR_MESSAGES: Readonly<Record<AltanaGrantSubmissionErrorCode, string>> = {
  INVALID_STATE: "The Altana bootstrap state is invalid.",
  INVALID_TRANSITION: "The Altana grant must be an exact ready-to-submitting transition.",
  TRANSITION_BINDING_MISMATCH:
    "The Altana grant transition does not match the immutable bootstrap record.",
  INVALID_REQUEST: "The Altana grant request is invalid or has been modified.",
  INVALID_DEPENDENCIES: "The Altana grant dependencies are invalid.",
  INVALID_ADMIN_SIGNER: "A device-bound Altana passkey signer is required.",
  RP_ID_MISMATCH: "The Altana passkey does not match the configured relying-party domain.",
  INVALID_CLOCK: "The Altana grant clock is invalid.",
  TIME_REGRESSION: "The Altana grant clock moved backward.",
  SUBMISSION_EXPIRED: "The Altana grant window has expired.",
  CLAIM_UNAVAILABLE: "The one-time Altana grant claim could not be confirmed.",
  CLAIM_MALFORMED: "The one-time Altana grant claim returned an invalid response.",
  CLAIM_BINDING_MISMATCH: "The one-time Altana grant claim did not match this request.",
  SUBMISSION_ALREADY_CLAIMED:
    "This Altana grant was already claimed; reload state and reconcile authority."
};

export class AltanaGrantSubmissionError extends Error {
  readonly code: AltanaGrantSubmissionErrorCode;

  constructor(code: AltanaGrantSubmissionErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "AltanaGrantSubmissionError";
    this.code = code;
  }
}

function parsedBootstrapState(input: unknown): AltanaBootstrapState {
  const result = altanaBootstrapStateSchema.safeParse(input);
  if (!result.success) throw new AltanaGrantSubmissionError("INVALID_STATE");
  return result.data;
}

function isOrdinaryJsonData(
  input: unknown,
  seen: Set<object> = new Set<object>(),
  depth = 0
): boolean {
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "boolean" ||
    (typeof input === "number" && Number.isFinite(input))
  ) {
    return true;
  }
  if (typeof input !== "object" || depth > 32 || seen.size > 2_048 || seen.has(input)) {
    return false;
  }
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(input);
    keys = Reflect.ownKeys(input);
  } catch {
    return false;
  }
  const isArray = Array.isArray(input);
  if (
    isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
  ) {
    return false;
  }
  seen.add(input);
  for (const key of keys) {
    if (isArray && key === "length") continue;
    if (typeof key !== "string") return false;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(input, key);
    } catch {
      return false;
    }
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !isOrdinaryJsonData(descriptor.value, seen, depth + 1)
    ) {
      return false;
    }
  }
  seen.delete(input);
  return true;
}

function parsedRequest(input: unknown): AltanaGrantSubmissionRequest {
  if (!isOrdinaryJsonData(input)) {
    throw new AltanaGrantSubmissionError("INVALID_REQUEST");
  }
  let result: ReturnType<typeof altanaGrantSubmissionRequestSchema.safeParse>;
  try {
    result = altanaGrantSubmissionRequestSchema.safeParse(input);
  } catch {
    throw new AltanaGrantSubmissionError("INVALID_REQUEST");
  }
  if (!result.success) throw new AltanaGrantSubmissionError("INVALID_REQUEST");
  return result.data;
}

function exactEqual(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function grantIntentFromState(state: Extract<AltanaBootstrapState, { sessionKey: unknown }>) {
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

/**
 * Produces the public, JSON-safe request only after verifying an exact
 * grant_ready -> grant_submitting transition. The caller must durably compare
 * and swap that transition through `claimSubmission` before the browser may
 * prompt its passkey.
 */
export function createAltanaGrantSubmissionRequest(
  unparsedReadyState: unknown,
  unparsedSubmittingState: unknown
): AltanaGrantSubmissionRequest {
  const ready = parsedBootstrapState(unparsedReadyState);
  const submitting = parsedBootstrapState(unparsedSubmittingState);
  if (ready.status !== "grant_ready" || submitting.status !== "grant_submitting") {
    throw new AltanaGrantSubmissionError("INVALID_TRANSITION");
  }

  let expected: AltanaBootstrapState;
  try {
    expected = beginAltanaBootstrapGrant(
      ready,
      () => new Date(submitting.grantSubmittedAt * 1_000)
    );
  } catch {
    throw new AltanaGrantSubmissionError("INVALID_TRANSITION");
  }
  if (!exactEqual(expected, submitting)) {
    throw new AltanaGrantSubmissionError("TRANSITION_BINDING_MISMATCH");
  }

  const base = requestBaseSchema.parse({
    schemaVersion: 1,
    bootstrapId: ready.bootstrapId,
    idempotencyKey: ready.idempotencyKey,
    bootstrapBindingHash: ready.bootstrapBindingHash,
    workerBindingHash: ready.workerBindingHash,
    policyHash: ready.policyHash,
    transition: {
      priorStatus: "grant_ready",
      nextStatus: "grant_submitting",
      issuedAt: ready.issuedAt,
      readyUpdatedAt: ready.updatedAt,
      grantSubmittedAt: submitting.grantSubmittedAt,
      bootstrapExpiresAt: ready.bootstrapExpiresAt
    },
    grantIntent: grantIntentFromState(ready)
  });
  return altanaGrantSubmissionRequestSchema.parse({
    ...base,
    submissionBindingHash: submissionBindingHash(base)
  });
}

function claimFromRequest(request: AltanaGrantSubmissionRequest): AltanaGrantSubmissionClaim {
  return altanaGrantSubmissionClaimSchema.parse({
    schemaVersion: 1,
    bootstrapId: request.bootstrapId,
    idempotencyKey: request.idempotencyKey,
    bootstrapBindingHash: request.bootstrapBindingHash,
    submissionBindingHash: request.submissionBindingHash,
    priorStatus: request.transition.priorStatus,
    nextStatus: request.transition.nextStatus,
    grantSubmittedAt: request.transition.grantSubmittedAt
  });
}

function safeClockSeconds(clock: () => Date): number {
  let value: Date;
  try {
    value = clock();
  } catch {
    throw new AltanaGrantSubmissionError("INVALID_CLOCK");
  }
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    throw new AltanaGrantSubmissionError("INVALID_CLOCK");
  }
  if (prototype !== Date.prototype) {
    throw new AltanaGrantSubmissionError("INVALID_CLOCK");
  }
  let milliseconds: number;
  try {
    milliseconds = Date.prototype.getTime.call(value);
  } catch {
    throw new AltanaGrantSubmissionError("INVALID_CLOCK");
  }
  if (!Number.isFinite(milliseconds)) {
    throw new AltanaGrantSubmissionError("INVALID_CLOCK");
  }
  const seconds = Math.floor(milliseconds / 1_000);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new AltanaGrantSubmissionError("INVALID_CLOCK");
  }
  return seconds;
}

function ownDataValue(input: object, key: PropertyKey): unknown {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(input, key);
  } catch {
    return undefined;
  }
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function isP256PublicKey(value: unknown): value is `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{128}$/.test(value)) return false;
  const x = BigInt(`0x${value.slice(2, 66)}`);
  const y = BigInt(`0x${value.slice(66, 130)}`);
  if (x >= P256_FIELD_PRIME || y >= P256_FIELD_PRIME) return false;
  const left = (y * y) % P256_FIELD_PRIME;
  const right = (x * x * x - 3n * x + P256_B + 3n * P256_FIELD_PRIME) % P256_FIELD_PRIME;
  return left === right;
}

function hasOnlyOwnDataProperties(input: object, allowed: readonly string[]): boolean {
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(input);
  } catch {
    return false;
  }
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.includes(key)) return false;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(input, key);
    } catch {
      return false;
    }
    if (descriptor === undefined || !("value" in descriptor)) return false;
  }
  return true;
}

/**
 * Validates the exact SDK 0.7.0 production-passkey data shape and that its flat
 * x||y public key is on P-256. This cannot prove possession or RP-ID/origin
 * binding; only the SDK-triggered WebAuthn ceremony can prove those properties.
 */
function isProductionPasskeySigner(input: unknown): input is PasskeySigner {
  if (typeof input !== "object" || input === null) return false;
  if (
    !hasOnlyOwnDataProperties(input, ["type", "address", "publicKey", "credential", "signDigest"])
  ) {
    return false;
  }
  if (ownDataValue(input, "type") !== "passkey") return false;
  if (ownDataValue(input, "address") !== ZERO_ADDRESS) return false;
  const publicKey = ownDataValue(input, "publicKey");
  if (!isP256PublicKey(publicKey)) return false;
  if (typeof ownDataValue(input, "signDigest") !== "function") return false;

  const credential = ownDataValue(input, "credential");
  if (typeof credential !== "object" || credential === null) return false;
  if (!hasOnlyOwnDataProperties(credential, ["kind", "id", "publicKey", "rpId"])) {
    return false;
  }
  if (ownDataValue(credential, "kind") !== "webauthn") return false;
  const id = ownDataValue(credential, "id");
  if (
    typeof id !== "string" ||
    id.length < 1 ||
    id.length > 4_096 ||
    !/^[A-Za-z0-9_-]+$/.test(id)
  ) {
    return false;
  }
  if (ownDataValue(credential, "publicKey") !== publicKey) return false;
  const rpId = ownDataValue(credential, "rpId");
  return typeof rpId === "string" && rpId.length >= 1 && rpId.length <= 253;
}

function isCanonicalRpId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 253 &&
    value === value.toLowerCase() &&
    /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/.test(
      value
    )
  );
}

function claimResultMatches(
  claim: AltanaGrantSubmissionClaim,
  result: z.infer<typeof claimResultSchema>
): boolean {
  return (
    result.bootstrapId === claim.bootstrapId &&
    result.idempotencyKey === claim.idempotencyKey &&
    result.bootstrapBindingHash === claim.bootstrapBindingHash &&
    result.submissionBindingHash === claim.submissionBindingHash &&
    result.grantSubmittedAt === claim.grantSubmittedAt
  );
}

function freezePermissions(permissions: SessionPermissions): SessionPermissions {
  const calls = Object.freeze((permissions.calls ?? []).map((call) => Object.freeze({ ...call })));
  const spend = Object.freeze(
    (permissions.spend ?? []).map((permission) => Object.freeze({ ...permission }))
  );
  return Object.freeze({ calls, spend });
}

function sdkInputFromRequest(
  request: AltanaGrantSubmissionRequest,
  adminSigner: Signer
): Readonly<ClientGrantSessionOptions> {
  const grantOptions = toAltanaGrantSessionOptions(request.grantIntent);
  if (grantOptions.sessionSigner === undefined || grantOptions.register !== true) {
    throw new AltanaGrantSubmissionError("INVALID_REQUEST");
  }
  return Object.freeze({
    wallet: Object.freeze({ address: request.grantIntent.walletAddress }),
    signer: adminSigner,
    chainId: BSC_TESTNET_CHAIN_ID,
    permissions: freezePermissions(grantOptions.permissions),
    expiry: grantOptions.expiry,
    sessionSigner: grantOptions.sessionSigner,
    register: true
  });
}

function hasExactOwnStringKeys(input: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== "string")) return false;
  const actual = (keys as string[]).sort(compareStrings);
  const wanted = [...expected].sort(compareStrings);
  return exactEqual(actual, wanted);
}

function isExactSdkSessionResult(
  input: unknown,
  options: Readonly<ClientGrantSessionOptions>
): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(input);
  } catch {
    return false;
  }
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (
    !hasExactOwnStringKeys(input, ["walletAddress", "signer", "publicKey", "permissions", "expiry"])
  ) {
    return false;
  }
  const sessionSigner = options.sessionSigner;
  if (sessionSigner === undefined) return false;
  return (
    ownDataValue(input, "walletAddress") === options.wallet.address &&
    ownDataValue(input, "signer") === sessionSigner &&
    ownDataValue(input, "publicKey") === sessionSigner.publicKey &&
    ownDataValue(input, "permissions") === options.permissions &&
    ownDataValue(input, "expiry") === options.expiry
  );
}

function errorField(error: unknown, key: "code" | "message" | "name"): unknown {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) {
    return undefined;
  }
  let current: object | null = error;
  for (let depth = 0; current !== null && depth < 8; depth += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key);
    } catch {
      return undefined;
    }
    if (descriptor !== undefined) {
      // Never invoke a thrown object's accessor. Native Error messages and
      // ordinary error codes/names are data properties in the reviewed path.
      return "value" in descriptor ? descriptor.value : undefined;
    }
    try {
      current = Object.getPrototypeOf(current);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function nativeDomExceptionField(error: unknown, key: "message" | "name"): string | undefined {
  if (typeof DOMException !== "function" || typeof error !== "object" || error === null) {
    return undefined;
  }
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(error);
  } catch {
    return undefined;
  }
  if (prototype !== DOMException.prototype) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(DOMException.prototype, key);
  if (descriptor?.get === undefined) return undefined;
  try {
    const value = descriptor.get.call(error);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function classifyGrantThrow(error: unknown): z.infer<typeof grantOutcomeSchema> {
  const code = errorField(error, "code");
  const name = errorField(error, "name") ?? nativeDomExceptionField(error, "name");
  const messageValue = errorField(error, "message") ?? nativeDomExceptionField(error, "message");
  const message = typeof messageValue === "string" ? messageValue : "";

  if (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    code === "USER_REJECTED_REQUEST" ||
    name === "NotAllowedError" ||
    /user (?:rejected|denied)|request rejected|biometric.*(?:cancel|denied)|operation.*cancelled/i.test(
      message
    )
  ) {
    return "wallet_rejected";
  }
  if (/^Session grant did not confirm: status=PENDING$/i.test(message.trim())) {
    return "sdk_pending";
  }
  if (/^Session grant did not confirm: status=FAILED$/i.test(message.trim())) {
    // SDK 0.7.0 reaches this exact message only after waitForCalls returned the
    // relay's terminal FAILED status. The authorization batch is atomic, so it
    // is a known terminal failure, not an ambiguous transport outcome. It is
    // still non-retryable because grantSession discarded the callsId.
    return "known_failed";
  }
  if (
    name === "TimeoutError" ||
    name === "NetworkError" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    /timed?\s*out|timeout|fetch failed|failed to fetch|network error|relay.*unavailable/i.test(
      message
    )
  ) {
    return "relay_timeout";
  }
  return "indeterminate_error";
}

function responseFor(
  request: AltanaGrantSubmissionRequest,
  outcome: z.infer<typeof grantOutcomeSchema>
): AltanaGrantSubmissionResponse {
  return altanaGrantSubmissionResponseSchema.parse({
    schemaVersion: 1,
    request,
    outcome,
    executionEnabled: false,
    authorityProbeRequired:
      outcome === "sdk_confirmed" ||
      outcome === "sdk_pending" ||
      outcome === "relay_timeout" ||
      outcome === "indeterminate_error",
    retryable: false
  });
}

/**
 * Performs exactly one reviewed SDK 0.7.0 browser grant attempt. The injected
 * claim must atomically persist the stable ready -> submitting transition; an
 * already-claimed request is never resubmitted. The returned object contains
 * no SDK Session, signer, client/function, raw error, or callsId.
 */
export async function submitAltanaGrant(
  unparsedRequest: unknown,
  dependencies: AltanaGrantSubmissionDependencies
): Promise<AltanaGrantSubmissionResponse> {
  const request = parsedRequest(unparsedRequest);
  if (typeof dependencies !== "object" || dependencies === null) {
    throw new AltanaGrantSubmissionError("INVALID_DEPENDENCIES");
  }
  const adminSigner = ownDataValue(dependencies, "adminSigner");
  const clock = ownDataValue(dependencies, "clock");
  const expectedRpId = ownDataValue(dependencies, "expectedRpId");
  const claimSubmission = ownDataValue(dependencies, "claimSubmission");
  const grantSession = ownDataValue(dependencies, "grantSession");
  if (
    typeof clock !== "function" ||
    !isCanonicalRpId(expectedRpId) ||
    typeof claimSubmission !== "function" ||
    typeof grantSession !== "function"
  ) {
    throw new AltanaGrantSubmissionError("INVALID_DEPENDENCIES");
  }
  if (!isProductionPasskeySigner(adminSigner)) {
    throw new AltanaGrantSubmissionError("INVALID_ADMIN_SIGNER");
  }
  if (ownDataValue(adminSigner.credential, "rpId") !== expectedRpId) {
    throw new AltanaGrantSubmissionError("RP_ID_MISMATCH");
  }

  const at = safeClockSeconds(clock as () => Date);
  if (at < request.transition.grantSubmittedAt) {
    throw new AltanaGrantSubmissionError("TIME_REGRESSION");
  }
  if (at >= request.transition.bootstrapExpiresAt || at >= request.grantIntent.expiry) {
    throw new AltanaGrantSubmissionError("SUBMISSION_EXPIRED");
  }

  const sdkInput = sdkInputFromRequest(request, adminSigner);
  const claim = Object.freeze(claimFromRequest(request));
  let unparsedClaimResult: unknown;
  try {
    unparsedClaimResult = await (
      claimSubmission as (claimInput: AltanaGrantSubmissionClaim) => Promise<unknown>
    )(claim);
  } catch {
    throw new AltanaGrantSubmissionError("CLAIM_UNAVAILABLE");
  }

  let parsedClaimResult: ReturnType<typeof claimResultSchema.safeParse>;
  if (!isOrdinaryJsonData(unparsedClaimResult)) {
    throw new AltanaGrantSubmissionError("CLAIM_MALFORMED");
  }
  try {
    parsedClaimResult = claimResultSchema.safeParse(unparsedClaimResult);
  } catch {
    throw new AltanaGrantSubmissionError("CLAIM_MALFORMED");
  }
  if (!parsedClaimResult.success) {
    throw new AltanaGrantSubmissionError("CLAIM_MALFORMED");
  }
  if (!claimResultMatches(claim, parsedClaimResult.data)) {
    throw new AltanaGrantSubmissionError("CLAIM_BINDING_MISMATCH");
  }
  if (parsedClaimResult.data.status === "already_claimed") {
    throw new AltanaGrantSubmissionError("SUBMISSION_ALREADY_CLAIMED");
  }

  try {
    const result = await (grantSession as AltanaSdkGrantSession)(sdkInput);
    return responseFor(
      request,
      isExactSdkSessionResult(result, sdkInput) ? "sdk_confirmed" : "indeterminate_error"
    );
  } catch (error) {
    return responseFor(request, classifyGrantThrow(error));
  }
}

function requestMatchesSubmittingState(
  request: AltanaGrantSubmissionRequest,
  state: Extract<AltanaBootstrapState, { status: "grant_submitting" }>
): boolean {
  return (
    request.bootstrapId === state.bootstrapId &&
    request.idempotencyKey === state.idempotencyKey &&
    request.bootstrapBindingHash === state.bootstrapBindingHash &&
    request.workerBindingHash === state.workerBindingHash &&
    request.policyHash === state.policyHash &&
    request.transition.issuedAt === state.issuedAt &&
    request.transition.grantSubmittedAt === state.grantSubmittedAt &&
    request.transition.bootstrapExpiresAt === state.bootstrapExpiresAt &&
    exactEqual(request.grantIntent, grantIntentFromState(state))
  );
}

/** Settles only a response bound to the exact persisted submitting record. */
export function settleAltanaGrantSubmissionResponse(
  unparsedSubmittingState: unknown,
  unparsedResponse: unknown,
  clock: () => Date
): AltanaBootstrapState {
  const state = parsedBootstrapState(unparsedSubmittingState);
  if (state.status !== "grant_submitting") {
    throw new AltanaGrantSubmissionError("INVALID_TRANSITION");
  }
  let parsedResponse: ReturnType<typeof altanaGrantSubmissionResponseSchema.safeParse>;
  if (!isOrdinaryJsonData(unparsedResponse)) {
    throw new AltanaGrantSubmissionError("INVALID_REQUEST");
  }
  try {
    parsedResponse = altanaGrantSubmissionResponseSchema.safeParse(unparsedResponse);
  } catch {
    throw new AltanaGrantSubmissionError("INVALID_REQUEST");
  }
  if (!parsedResponse.success) throw new AltanaGrantSubmissionError("INVALID_REQUEST");
  if (!requestMatchesSubmittingState(parsedResponse.data.request, state)) {
    throw new AltanaGrantSubmissionError("TRANSITION_BINDING_MISMATCH");
  }
  return settleAltanaBootstrapGrant(state, { kind: parsedResponse.data.outcome }, clock);
}
