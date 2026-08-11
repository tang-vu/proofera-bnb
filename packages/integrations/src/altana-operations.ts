import { z } from "zod";

const utcDateTimeSchema = z.iso
  .datetime()
  .refine((value) => value.endsWith("Z"), "Timestamp must be UTC with a Z suffix");
const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address")
  .transform((value) => value.toLowerCase());
const policyHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid policy hash")
  .transform((value) => value.toLowerCase());
const transactionHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash")
  .transform((value) => value.toLowerCase());
const callsIdSchema = z
  .string()
  .regex(/^0x(?:[a-fA-F0-9]{2})+$/, "Invalid Altana calls ID")
  .max(514)
  .transform((value) => value.toLowerCase());
const operationKeySchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/, "Invalid stable operation key");
const reasonSchema = z.string().trim().min(1).max(1_000);

type OperationChronology = {
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt?: string;
  readonly lastObservedAt?: string;
  readonly confirmedAt?: string;
  readonly failedAt?: string;
  readonly rejectedAt?: string;
  readonly unknownAt?: string;
  readonly authorityObservedAt?: string;
  readonly lastAuthorityObservedAt?: string | null;
};

function addOperationChronologyIssues(state: OperationChronology, context: z.RefinementCtx): void {
  const createdAt = Date.parse(state.createdAt);
  const updatedAt = Date.parse(state.updatedAt);
  if (updatedAt < createdAt) {
    context.addIssue({
      code: "custom",
      path: ["updatedAt"],
      message: "Operation update cannot predate creation"
    });
  }

  const submittedAt = state.submittedAt === undefined ? null : Date.parse(state.submittedAt);
  if (submittedAt !== null && (submittedAt < createdAt || submittedAt > updatedAt)) {
    context.addIssue({
      code: "custom",
      path: ["submittedAt"],
      message: "Submission time must be between operation creation and its latest update"
    });
  }

  const eventTimes = [
    ["lastObservedAt", state.lastObservedAt],
    ["confirmedAt", state.confirmedAt],
    ["failedAt", state.failedAt],
    ["rejectedAt", state.rejectedAt],
    ["unknownAt", state.unknownAt],
    ["authorityObservedAt", state.authorityObservedAt],
    ["lastAuthorityObservedAt", state.lastAuthorityObservedAt]
  ] as const;
  for (const [field, value] of eventTimes) {
    if (value === undefined || value === null) continue;
    const timestamp = Date.parse(value);
    const lowerBound = submittedAt ?? createdAt;
    if (timestamp < lowerBound || timestamp > updatedAt) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: "Operation observation must be between submission and its latest update"
      });
    }
  }

  if (
    state.authorityObservedAt !== undefined &&
    state.confirmedAt !== undefined &&
    Date.parse(state.authorityObservedAt) > Date.parse(state.confirmedAt)
  ) {
    context.addIssue({
      code: "custom",
      path: ["authorityObservedAt"],
      message: "Revocation authority evidence cannot postdate confirmation"
    });
  }
}

export const altanaSdkOperationResultSchema = z.strictObject({
  callsId: callsIdSchema,
  status: z.enum(["PENDING", "CONFIRMED", "FAILED"]),
  transactionHash: transactionHashSchema.optional()
});

export type AltanaSdkOperationResult = z.infer<typeof altanaSdkOperationResultSchema>;

const operationSpecShape = {
  schemaVersion: z.literal(1),
  chainId: z.union([z.literal(56), z.literal(97)]),
  walletAddress: addressSchema,
  sessionKeyAddress: addressSchema,
  sessionExpiry: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  policyHash: policyHashSchema,
  operationId: operationKeySchema,
  idempotencyKey: operationKeySchema,
  createdAt: utcDateTimeSchema
} as const;

export const altanaExecuteOperationSpecSchema = z
  .strictObject({
    ...operationSpecShape,
    kind: z.literal("execute")
  })
  .superRefine((spec, context) => {
    if (!spec.operationId.startsWith("execute:")) {
      context.addIssue({
        code: "custom",
        path: ["operationId"],
        message: "Execute operation IDs must use the execute: namespace"
      });
    }
    if (!spec.idempotencyKey.startsWith("execute:")) {
      context.addIssue({
        code: "custom",
        path: ["idempotencyKey"],
        message: "Execute idempotency keys must use the execute: namespace"
      });
    }
  });

export const altanaRevokeOperationSpecSchema = z
  .strictObject({
    ...operationSpecShape,
    kind: z.literal("revoke")
  })
  .superRefine((spec, context) => {
    if (!spec.operationId.startsWith("revoke:")) {
      context.addIssue({
        code: "custom",
        path: ["operationId"],
        message: "Revoke operation IDs must use the revoke: namespace"
      });
    }
    if (!spec.idempotencyKey.startsWith("revoke:")) {
      context.addIssue({
        code: "custom",
        path: ["idempotencyKey"],
        message: "Revoke idempotency keys must use the revoke: namespace"
      });
    }
  });

export type AltanaExecuteOperationSpec = z.infer<typeof altanaExecuteOperationSpecSchema>;
export type AltanaRevokeOperationSpec = z.infer<typeof altanaRevokeOperationSpecSchema>;

const executeStateBaseShape = {
  ...operationSpecShape,
  kind: z.literal("execute"),
  updatedAt: utcDateTimeSchema
} as const;

const revokeStateBaseShape = {
  ...operationSpecShape,
  kind: z.literal("revoke"),
  updatedAt: utcDateTimeSchema
} as const;

const submittedStateShape = {
  submittedAt: utcDateTimeSchema,
  callsId: callsIdSchema,
  transactionHash: transactionHashSchema.nullable()
} as const;

export const altanaExecuteOperationStateSchema = z
  .discriminatedUnion("status", [
    z.strictObject({
      ...executeStateBaseShape,
      status: z.literal("ready")
    }),
    z.strictObject({
      ...executeStateBaseShape,
      status: z.literal("submitting"),
      submittedAt: utcDateTimeSchema
    }),
    z.strictObject({
      ...executeStateBaseShape,
      ...submittedStateShape,
      status: z.literal("pending"),
      lastObservedAt: utcDateTimeSchema
    }),
    z.strictObject({
      ...executeStateBaseShape,
      ...submittedStateShape,
      status: z.literal("confirmed"),
      confirmedAt: utcDateTimeSchema
    }),
    z.strictObject({
      ...executeStateBaseShape,
      status: z.literal("failed"),
      submittedAt: utcDateTimeSchema,
      callsId: callsIdSchema.nullable(),
      transactionHash: transactionHashSchema.nullable(),
      failedAt: utcDateTimeSchema,
      reason: reasonSchema,
      retryable: z.literal(false)
    }),
    z.strictObject({
      ...executeStateBaseShape,
      status: z.literal("rejected"),
      submittedAt: utcDateTimeSchema,
      callsId: callsIdSchema.nullable(),
      transactionHash: transactionHashSchema.nullable(),
      rejectedAt: utcDateTimeSchema,
      reason: reasonSchema,
      retryable: z.literal(false)
    }),
    z.strictObject({
      ...executeStateBaseShape,
      status: z.literal("outcome_unknown"),
      submittedAt: utcDateTimeSchema,
      callsId: callsIdSchema.nullable(),
      transactionHash: transactionHashSchema.nullable(),
      unknownAt: utcDateTimeSchema,
      reason: z.enum(["submission_threw", "malformed_sdk_result", "malformed_call_status"]),
      reasonDetail: reasonSchema,
      callStatusProbeRequired: z.literal(true),
      retryable: z.literal(false)
    })
  ])
  .superRefine(addOperationChronologyIssues);

export type AltanaExecuteOperationState = z.infer<typeof altanaExecuteOperationStateSchema>;

export const altanaRevokeOperationStateSchema = z
  .discriminatedUnion("status", [
    z.strictObject({
      ...revokeStateBaseShape,
      status: z.literal("ready")
    }),
    z.strictObject({
      ...revokeStateBaseShape,
      status: z.literal("submitting"),
      submittedAt: utcDateTimeSchema
    }),
    z.strictObject({
      ...revokeStateBaseShape,
      ...submittedStateShape,
      status: z.literal("pending"),
      relayStatus: z.enum(["pending", "confirmed"]),
      authorityStatus: z.enum(["probe_required", "present", "mismatch", "unavailable"]),
      lastObservedAt: utcDateTimeSchema,
      lastAuthorityObservedAt: utcDateTimeSchema.nullable()
    }),
    z.strictObject({
      ...revokeStateBaseShape,
      status: z.literal("confirmed"),
      submittedAt: utcDateTimeSchema,
      callsId: callsIdSchema.nullable(),
      transactionHash: transactionHashSchema.nullable(),
      confirmedAt: utcDateTimeSchema,
      authorityObservedAt: utcDateTimeSchema,
      confirmation: z.literal("fresh_authority_absent")
    }),
    z.strictObject({
      ...revokeStateBaseShape,
      status: z.literal("failed"),
      submittedAt: utcDateTimeSchema,
      callsId: callsIdSchema.nullable(),
      transactionHash: transactionHashSchema.nullable(),
      failedAt: utcDateTimeSchema,
      reason: reasonSchema,
      retryable: z.literal(false)
    }),
    z.strictObject({
      ...revokeStateBaseShape,
      status: z.literal("rejected"),
      submittedAt: utcDateTimeSchema,
      callsId: callsIdSchema.nullable(),
      transactionHash: transactionHashSchema.nullable(),
      rejectedAt: utcDateTimeSchema,
      reason: reasonSchema,
      retryable: z.literal(false)
    }),
    z.strictObject({
      ...revokeStateBaseShape,
      status: z.literal("outcome_unknown"),
      submittedAt: utcDateTimeSchema,
      callsId: callsIdSchema.nullable(),
      transactionHash: transactionHashSchema.nullable(),
      unknownAt: utcDateTimeSchema,
      reason: z.enum([
        "submission_threw",
        "malformed_sdk_result",
        "malformed_call_status",
        "authority_mismatch",
        "authority_probe_unavailable",
        "authority_probe_stale",
        "authority_probe_from_future",
        "authority_still_present"
      ]),
      reasonDetail: reasonSchema,
      authorityProbeRequired: z.literal(true),
      retryable: z.literal(false)
    })
  ])
  .superRefine(addOperationChronologyIssues);

export type AltanaRevokeOperationState = z.infer<typeof altanaRevokeOperationStateSchema>;

export const sessionAuthorityObservationSchema = z.strictObject({
  status: z.enum(["present_exact", "present_mismatch", "absent", "unavailable"]),
  observedAt: utcDateTimeSchema,
  walletAddress: addressSchema,
  sessionKeyAddress: addressSchema,
  policyHash: policyHashSchema
});

export type SessionAuthorityObservation = z.infer<typeof sessionAuthorityObservationSchema>;

export const executeAuthorizationSchema = z.strictObject({
  asOf: utcDateTimeSchema,
  maximumAuthorityAgeSeconds: z.number().int().positive().max(3_600),
  revocationStatus: z.enum(["active", "revoke_in_progress", "revoked"]),
  authority: sessionAuthorityObservationSchema
});

export type ExecuteAuthorization = z.infer<typeof executeAuthorizationSchema>;

export const revokeAuthorityReconciliationContextSchema = z.strictObject({
  asOf: utcDateTimeSchema,
  maximumAuthorityAgeSeconds: z.number().int().positive().max(3_600)
});

export type RevokeAuthorityReconciliationContext = z.infer<
  typeof revokeAuthorityReconciliationContextSchema
>;

export const altanaSdkSubmissionOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("returned"), result: z.unknown() }),
  z.strictObject({ kind: z.literal("rejected"), reason: reasonSchema }),
  z.strictObject({ kind: z.literal("threw"), reason: reasonSchema })
]);

export type AltanaSdkSubmissionOutcome = z.infer<typeof altanaSdkSubmissionOutcomeSchema>;

export type AltanaOperationTransitionErrorCode =
  | "INVALID_TRANSITION"
  | "TIME_REGRESSION"
  | "AUTHORITY_BINDING_MISMATCH"
  | "AUTHORITY_NOT_EXACT"
  | "AUTHORITY_ABSENT"
  | "AUTHORITY_PROBE_STALE"
  | "AUTHORITY_PROBE_FROM_FUTURE"
  | "SESSION_EXPIRED"
  | "REVOCATION_IN_PROGRESS"
  | "SESSION_REVOKED"
  | "CALLS_ID_UNAVAILABLE"
  | "CALLS_ID_MISMATCH";

export class AltanaOperationTransitionError extends Error {
  readonly code: AltanaOperationTransitionErrorCode;

  constructor(code: AltanaOperationTransitionErrorCode, message: string) {
    super(message);
    this.name = "AltanaOperationTransitionError";
    this.code = code;
  }
}

function executeBase(state: AltanaExecuteOperationState) {
  return {
    schemaVersion: state.schemaVersion,
    kind: state.kind,
    chainId: state.chainId,
    walletAddress: state.walletAddress,
    sessionKeyAddress: state.sessionKeyAddress,
    sessionExpiry: state.sessionExpiry,
    policyHash: state.policyHash,
    operationId: state.operationId,
    idempotencyKey: state.idempotencyKey,
    createdAt: state.createdAt
  };
}

function revokeBase(state: AltanaRevokeOperationState) {
  return {
    schemaVersion: state.schemaVersion,
    kind: state.kind,
    chainId: state.chainId,
    walletAddress: state.walletAddress,
    sessionKeyAddress: state.sessionKeyAddress,
    sessionExpiry: state.sessionExpiry,
    policyHash: state.policyHash,
    operationId: state.operationId,
    idempotencyKey: state.idempotencyKey,
    createdAt: state.createdAt
  };
}

function transitionAt(currentUpdatedAt: string, unparsedAt: unknown): string {
  const at = utcDateTimeSchema.parse(unparsedAt);
  if (Date.parse(at) < Date.parse(currentUpdatedAt)) {
    throw new AltanaOperationTransitionError(
      "TIME_REGRESSION",
      "Operation transition cannot move backward in time"
    );
  }
  return at;
}

function bindingMatches(
  state: Pick<
    AltanaExecuteOperationState | AltanaRevokeOperationState,
    "walletAddress" | "sessionKeyAddress" | "policyHash"
  >,
  observation: SessionAuthorityObservation
): boolean {
  return (
    state.walletAddress === observation.walletAddress &&
    state.sessionKeyAddress === observation.sessionKeyAddress &&
    state.policyHash === observation.policyHash
  );
}

function ensureAuthorityBinding(
  state: Pick<
    AltanaExecuteOperationState | AltanaRevokeOperationState,
    "walletAddress" | "sessionKeyAddress" | "policyHash"
  >,
  observation: SessionAuthorityObservation
): void {
  if (!bindingMatches(state, observation)) {
    throw new AltanaOperationTransitionError(
      "AUTHORITY_BINDING_MISMATCH",
      "Authority observation is not bound to this wallet, session key, and policy hash"
    );
  }
}

function authorityAge(
  observedAt: string,
  asOf: string,
  maximumAgeSeconds: number
): "fresh" | "stale" | "future" {
  const ageMs = Date.parse(asOf) - Date.parse(observedAt);
  if (ageMs < 0) return "future";
  if (ageMs > maximumAgeSeconds * 1_000) return "stale";
  return "fresh";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractValidResultIdentifiers(result: unknown): {
  callsId: string | null;
  transactionHash: string | null;
} {
  if (!isRecord(result)) return { callsId: null, transactionHash: null };
  const callsIdResult = callsIdSchema.safeParse(result.callsId);
  const transactionHashResult = transactionHashSchema.safeParse(result.transactionHash);
  return {
    callsId: callsIdResult.success ? callsIdResult.data : null,
    transactionHash: transactionHashResult.success ? transactionHashResult.data : null
  };
}

function assertExecuteSubmitting(
  state: AltanaExecuteOperationState
): asserts state is Extract<AltanaExecuteOperationState, { status: "submitting" }> {
  if (state.status !== "submitting") {
    throw new AltanaOperationTransitionError(
      "INVALID_TRANSITION",
      `Cannot settle execute submission from ${state.status}`
    );
  }
}

function assertRevokeSubmitting(
  state: AltanaRevokeOperationState
): asserts state is Extract<AltanaRevokeOperationState, { status: "submitting" }> {
  if (state.status !== "submitting") {
    throw new AltanaOperationTransitionError(
      "INVALID_TRANSITION",
      `Cannot settle revoke submission from ${state.status}`
    );
  }
}

export function createReadyAltanaExecute(unparsedSpec: unknown): AltanaExecuteOperationState {
  const spec = altanaExecuteOperationSpecSchema.parse(unparsedSpec);
  return altanaExecuteOperationStateSchema.parse({
    ...spec,
    status: "ready",
    updatedAt: spec.createdAt
  });
}

export function createReadyAltanaRevoke(unparsedSpec: unknown): AltanaRevokeOperationState {
  const spec = altanaRevokeOperationSpecSchema.parse(unparsedSpec);
  return altanaRevokeOperationStateSchema.parse({
    ...spec,
    status: "ready",
    updatedAt: spec.createdAt
  });
}

export function beginAltanaExecute(
  unparsedState: unknown,
  unparsedAuthorization: unknown
): AltanaExecuteOperationState {
  const state = altanaExecuteOperationStateSchema.parse(unparsedState);
  if (state.status !== "ready") {
    throw new AltanaOperationTransitionError(
      "INVALID_TRANSITION",
      `Cannot begin execute from ${state.status}`
    );
  }

  const authorization = executeAuthorizationSchema.parse(unparsedAuthorization);
  const at = transitionAt(state.updatedAt, authorization.asOf);
  ensureAuthorityBinding(state, authorization.authority);
  if (authorization.revocationStatus === "revoke_in_progress") {
    throw new AltanaOperationTransitionError(
      "REVOCATION_IN_PROGRESS",
      "Execution is blocked while revocation is in progress"
    );
  }
  if (authorization.revocationStatus === "revoked") {
    throw new AltanaOperationTransitionError(
      "SESSION_REVOKED",
      "Execution is blocked after session revocation"
    );
  }
  if (authorization.authority.status === "absent") {
    throw new AltanaOperationTransitionError(
      "AUTHORITY_ABSENT",
      "Execution requires the expected session authority to be present"
    );
  }
  if (authorization.authority.status !== "present_exact") {
    throw new AltanaOperationTransitionError(
      "AUTHORITY_NOT_EXACT",
      "Execution requires prior exact session-authority verification"
    );
  }

  const authorityFreshness = authorityAge(
    authorization.authority.observedAt,
    authorization.asOf,
    authorization.maximumAuthorityAgeSeconds
  );
  if (authorityFreshness === "future") {
    throw new AltanaOperationTransitionError(
      "AUTHORITY_PROBE_FROM_FUTURE",
      "Authority observation cannot postdate execution authorization"
    );
  }
  if (authorityFreshness === "stale") {
    throw new AltanaOperationTransitionError(
      "AUTHORITY_PROBE_STALE",
      "Execution requires a fresh exact-authority observation"
    );
  }
  if (Math.floor(Date.parse(authorization.asOf) / 1_000) >= state.sessionExpiry) {
    throw new AltanaOperationTransitionError(
      "SESSION_EXPIRED",
      "Execution is blocked at or after session expiry"
    );
  }

  return altanaExecuteOperationStateSchema.parse({
    ...executeBase(state),
    status: "submitting",
    submittedAt: at,
    updatedAt: at
  });
}

export function beginAltanaRevoke(
  unparsedState: unknown,
  unparsedAt: unknown
): AltanaRevokeOperationState {
  const state = altanaRevokeOperationStateSchema.parse(unparsedState);
  if (state.status !== "ready") {
    throw new AltanaOperationTransitionError(
      "INVALID_TRANSITION",
      `Cannot begin revoke from ${state.status}`
    );
  }
  const at = transitionAt(state.updatedAt, unparsedAt);
  return altanaRevokeOperationStateSchema.parse({
    ...revokeBase(state),
    status: "submitting",
    submittedAt: at,
    updatedAt: at
  });
}

export function settleAltanaExecuteSubmission(
  unparsedState: unknown,
  unparsedOutcome: unknown,
  unparsedAt: unknown
): AltanaExecuteOperationState {
  const state = altanaExecuteOperationStateSchema.parse(unparsedState);
  assertExecuteSubmitting(state);
  const outcome = altanaSdkSubmissionOutcomeSchema.parse(unparsedOutcome);
  const at = transitionAt(state.updatedAt, unparsedAt);
  const base = executeBase(state);

  if (outcome.kind === "rejected") {
    return altanaExecuteOperationStateSchema.parse({
      ...base,
      status: "rejected",
      submittedAt: state.submittedAt,
      callsId: null,
      transactionHash: null,
      rejectedAt: at,
      reason: outcome.reason,
      retryable: false,
      updatedAt: at
    });
  }
  if (outcome.kind === "threw") {
    return altanaExecuteOperationStateSchema.parse({
      ...base,
      status: "outcome_unknown",
      submittedAt: state.submittedAt,
      callsId: null,
      transactionHash: null,
      unknownAt: at,
      reason: "submission_threw",
      reasonDetail: outcome.reason,
      callStatusProbeRequired: true,
      retryable: false,
      updatedAt: at
    });
  }

  const result = altanaSdkOperationResultSchema.safeParse(outcome.result);
  if (!result.success) {
    const identifiers = extractValidResultIdentifiers(outcome.result);
    return altanaExecuteOperationStateSchema.parse({
      ...base,
      status: "outcome_unknown",
      submittedAt: state.submittedAt,
      ...identifiers,
      unknownAt: at,
      reason: "malformed_sdk_result",
      reasonDetail: "Altana SDK returned a result outside the reviewed 0.7.0 shape",
      callStatusProbeRequired: true,
      retryable: false,
      updatedAt: at
    });
  }

  const transactionHash = result.data.transactionHash ?? null;
  if (result.data.status === "PENDING") {
    return altanaExecuteOperationStateSchema.parse({
      ...base,
      status: "pending",
      submittedAt: state.submittedAt,
      callsId: result.data.callsId,
      transactionHash,
      lastObservedAt: at,
      updatedAt: at
    });
  }
  if (result.data.status === "FAILED") {
    return altanaExecuteOperationStateSchema.parse({
      ...base,
      status: "failed",
      submittedAt: state.submittedAt,
      callsId: result.data.callsId,
      transactionHash,
      failedAt: at,
      reason: "Altana call status is FAILED",
      retryable: false,
      updatedAt: at
    });
  }
  return altanaExecuteOperationStateSchema.parse({
    ...base,
    status: "confirmed",
    submittedAt: state.submittedAt,
    callsId: result.data.callsId,
    transactionHash,
    confirmedAt: at,
    updatedAt: at
  });
}

export function settleAltanaRevokeSubmission(
  unparsedState: unknown,
  unparsedOutcome: unknown,
  unparsedAt: unknown
): AltanaRevokeOperationState {
  const state = altanaRevokeOperationStateSchema.parse(unparsedState);
  assertRevokeSubmitting(state);
  const outcome = altanaSdkSubmissionOutcomeSchema.parse(unparsedOutcome);
  const at = transitionAt(state.updatedAt, unparsedAt);
  const base = revokeBase(state);

  if (outcome.kind === "rejected") {
    return altanaRevokeOperationStateSchema.parse({
      ...base,
      status: "rejected",
      submittedAt: state.submittedAt,
      callsId: null,
      transactionHash: null,
      rejectedAt: at,
      reason: outcome.reason,
      retryable: false,
      updatedAt: at
    });
  }
  if (outcome.kind === "threw") {
    return altanaRevokeOperationStateSchema.parse({
      ...base,
      status: "outcome_unknown",
      submittedAt: state.submittedAt,
      callsId: null,
      transactionHash: null,
      unknownAt: at,
      reason: "submission_threw",
      reasonDetail: outcome.reason,
      authorityProbeRequired: true,
      retryable: false,
      updatedAt: at
    });
  }

  const result = altanaSdkOperationResultSchema.safeParse(outcome.result);
  if (!result.success) {
    const identifiers = extractValidResultIdentifiers(outcome.result);
    return altanaRevokeOperationStateSchema.parse({
      ...base,
      status: "outcome_unknown",
      submittedAt: state.submittedAt,
      ...identifiers,
      unknownAt: at,
      reason: "malformed_sdk_result",
      reasonDetail: "Altana SDK returned a result outside the reviewed 0.7.0 shape",
      authorityProbeRequired: true,
      retryable: false,
      updatedAt: at
    });
  }

  const transactionHash = result.data.transactionHash ?? null;
  if (result.data.status === "FAILED") {
    return altanaRevokeOperationStateSchema.parse({
      ...base,
      status: "failed",
      submittedAt: state.submittedAt,
      callsId: result.data.callsId,
      transactionHash,
      failedAt: at,
      reason: "Altana revoke call status is FAILED",
      retryable: false,
      updatedAt: at
    });
  }

  return altanaRevokeOperationStateSchema.parse({
    ...base,
    status: "pending",
    submittedAt: state.submittedAt,
    callsId: result.data.callsId,
    transactionHash,
    relayStatus: result.data.status === "CONFIRMED" ? "confirmed" : "pending",
    authorityStatus: "probe_required",
    lastObservedAt: at,
    lastAuthorityObservedAt: null,
    updatedAt: at
  });
}

function executeUnknownFromCallStatus(
  state: Extract<AltanaExecuteOperationState, { status: "pending" | "outcome_unknown" }>,
  at: string
): AltanaExecuteOperationState {
  return altanaExecuteOperationStateSchema.parse({
    ...executeBase(state),
    status: "outcome_unknown",
    submittedAt: state.submittedAt,
    callsId: state.callsId,
    transactionHash: state.transactionHash,
    unknownAt: at,
    reason: "malformed_call_status",
    reasonDetail: "Observed call status did not match the reviewed Altana 0.7.0 shape",
    callStatusProbeRequired: true,
    retryable: false,
    updatedAt: at
  });
}

export function reconcileAltanaExecuteCall(
  unparsedState: unknown,
  unparsedObservation: unknown,
  unparsedAt: unknown
): AltanaExecuteOperationState {
  const state = altanaExecuteOperationStateSchema.parse(unparsedState);
  if (state.status !== "pending" && state.status !== "outcome_unknown") {
    throw new AltanaOperationTransitionError(
      "INVALID_TRANSITION",
      `Cannot reconcile execute call from ${state.status}`
    );
  }
  const at = transitionAt(state.updatedAt, unparsedAt);
  const observation = altanaSdkOperationResultSchema.safeParse(unparsedObservation);
  if (!observation.success) return executeUnknownFromCallStatus(state, at);
  if (state.callsId === null) {
    throw new AltanaOperationTransitionError(
      "CALLS_ID_UNAVAILABLE",
      "Cannot bind a call-status observation without the submitted calls ID"
    );
  }
  if (observation.data.callsId !== state.callsId) {
    throw new AltanaOperationTransitionError(
      "CALLS_ID_MISMATCH",
      "Observed call status belongs to a different calls ID"
    );
  }

  const transactionHash = observation.data.transactionHash ?? state.transactionHash;
  if (observation.data.status === "PENDING") {
    return altanaExecuteOperationStateSchema.parse({
      ...executeBase(state),
      status: "pending",
      submittedAt: state.submittedAt,
      callsId: state.callsId,
      transactionHash,
      lastObservedAt: at,
      updatedAt: at
    });
  }
  if (observation.data.status === "FAILED") {
    return altanaExecuteOperationStateSchema.parse({
      ...executeBase(state),
      status: "failed",
      submittedAt: state.submittedAt,
      callsId: state.callsId,
      transactionHash,
      failedAt: at,
      reason: "Observed Altana call status is FAILED",
      retryable: false,
      updatedAt: at
    });
  }
  return altanaExecuteOperationStateSchema.parse({
    ...executeBase(state),
    status: "confirmed",
    submittedAt: state.submittedAt,
    callsId: state.callsId,
    transactionHash,
    confirmedAt: at,
    updatedAt: at
  });
}

function revokeUnknownFromCallStatus(
  state: Extract<AltanaRevokeOperationState, { status: "pending" | "outcome_unknown" }>,
  at: string
): AltanaRevokeOperationState {
  return altanaRevokeOperationStateSchema.parse({
    ...revokeBase(state),
    status: "outcome_unknown",
    submittedAt: state.submittedAt,
    callsId: state.callsId,
    transactionHash: state.transactionHash,
    unknownAt: at,
    reason: "malformed_call_status",
    reasonDetail: "Observed call status did not match the reviewed Altana 0.7.0 shape",
    authorityProbeRequired: true,
    retryable: false,
    updatedAt: at
  });
}

export function reconcileAltanaRevokeCall(
  unparsedState: unknown,
  unparsedObservation: unknown,
  unparsedAt: unknown
): AltanaRevokeOperationState {
  const state = altanaRevokeOperationStateSchema.parse(unparsedState);
  if (state.status !== "pending" && state.status !== "outcome_unknown") {
    throw new AltanaOperationTransitionError(
      "INVALID_TRANSITION",
      `Cannot reconcile revoke call from ${state.status}`
    );
  }
  const at = transitionAt(state.updatedAt, unparsedAt);
  const observation = altanaSdkOperationResultSchema.safeParse(unparsedObservation);
  if (!observation.success) return revokeUnknownFromCallStatus(state, at);
  if (state.callsId === null) {
    throw new AltanaOperationTransitionError(
      "CALLS_ID_UNAVAILABLE",
      "Cannot bind a call-status observation without the submitted calls ID"
    );
  }
  if (observation.data.callsId !== state.callsId) {
    throw new AltanaOperationTransitionError(
      "CALLS_ID_MISMATCH",
      "Observed revoke status belongs to a different calls ID"
    );
  }

  const transactionHash = observation.data.transactionHash ?? state.transactionHash;
  if (observation.data.status === "FAILED") {
    return altanaRevokeOperationStateSchema.parse({
      ...revokeBase(state),
      status: "failed",
      submittedAt: state.submittedAt,
      callsId: state.callsId,
      transactionHash,
      failedAt: at,
      reason: "Observed Altana revoke call status is FAILED",
      retryable: false,
      updatedAt: at
    });
  }

  const previousAuthorityStatus =
    state.status === "pending" ? state.authorityStatus : "probe_required";
  const previousAuthorityObservedAt =
    state.status === "pending" ? state.lastAuthorityObservedAt : null;
  return altanaRevokeOperationStateSchema.parse({
    ...revokeBase(state),
    status: "pending",
    submittedAt: state.submittedAt,
    callsId: state.callsId,
    transactionHash,
    relayStatus: observation.data.status === "CONFIRMED" ? "confirmed" : "pending",
    authorityStatus: previousAuthorityStatus,
    lastObservedAt: at,
    lastAuthorityObservedAt: previousAuthorityObservedAt,
    updatedAt: at
  });
}

function revokeUnknownFromAuthority(
  state: Extract<AltanaRevokeOperationState, { status: "pending" | "outcome_unknown" }>,
  at: string,
  reason: Extract<AltanaRevokeOperationState, { status: "outcome_unknown" }>["reason"],
  detail: string,
  observedAt: string
): AltanaRevokeOperationState {
  return altanaRevokeOperationStateSchema.parse({
    ...revokeBase(state),
    status: "outcome_unknown",
    submittedAt: state.submittedAt,
    callsId: state.callsId,
    transactionHash: state.transactionHash,
    unknownAt: at,
    reason,
    reasonDetail: `${detail} Observed at ${observedAt}.`,
    authorityProbeRequired: true,
    retryable: false,
    updatedAt: at
  });
}

export function reconcileAltanaRevokeAuthority(
  unparsedState: unknown,
  unparsedObservation: unknown,
  unparsedContext: unknown
): AltanaRevokeOperationState {
  const state = altanaRevokeOperationStateSchema.parse(unparsedState);
  if (state.status !== "pending" && state.status !== "outcome_unknown") {
    throw new AltanaOperationTransitionError(
      "INVALID_TRANSITION",
      `Cannot reconcile revoke authority from ${state.status}`
    );
  }
  const observation = sessionAuthorityObservationSchema.parse(unparsedObservation);
  const context = revokeAuthorityReconciliationContextSchema.parse(unparsedContext);
  const at = transitionAt(state.updatedAt, context.asOf);
  ensureAuthorityBinding(state, observation);

  const freshness = authorityAge(
    observation.observedAt,
    context.asOf,
    context.maximumAuthorityAgeSeconds
  );
  if (freshness === "future") {
    return revokeUnknownFromAuthority(
      state,
      at,
      "authority_probe_from_future",
      "Authority observation postdates reconciliation and cannot finalize revocation.",
      observation.observedAt
    );
  }
  if (freshness === "stale") {
    return revokeUnknownFromAuthority(
      state,
      at,
      "authority_probe_stale",
      "Stale authority observation cannot finalize revocation.",
      observation.observedAt
    );
  }

  if (observation.status === "absent") {
    return altanaRevokeOperationStateSchema.parse({
      ...revokeBase(state),
      status: "confirmed",
      submittedAt: state.submittedAt,
      callsId: state.callsId,
      transactionHash: state.transactionHash,
      confirmedAt: at,
      authorityObservedAt: observation.observedAt,
      confirmation: "fresh_authority_absent",
      updatedAt: at
    });
  }
  if (observation.status === "present_mismatch") {
    return revokeUnknownFromAuthority(
      state,
      at,
      "authority_mismatch",
      "Observed authority did not exactly match the expected session authority.",
      observation.observedAt
    );
  }
  if (observation.status === "unavailable") {
    return revokeUnknownFromAuthority(
      state,
      at,
      "authority_probe_unavailable",
      "Authority probe was unavailable and cannot finalize revocation.",
      observation.observedAt
    );
  }

  if (state.status === "pending") {
    return altanaRevokeOperationStateSchema.parse({
      ...revokeBase(state),
      status: "pending",
      submittedAt: state.submittedAt,
      callsId: state.callsId,
      transactionHash: state.transactionHash,
      relayStatus: state.relayStatus,
      authorityStatus: "present",
      lastObservedAt: state.lastObservedAt,
      lastAuthorityObservedAt: observation.observedAt,
      updatedAt: at
    });
  }
  return revokeUnknownFromAuthority(
    state,
    at,
    "authority_still_present",
    "Expected session authority remains present.",
    observation.observedAt
  );
}

export function isAltanaRevokeFinal(stateInput: unknown): boolean {
  return altanaRevokeOperationStateSchema.parse(stateInput).status === "confirmed";
}

export function canRetryAltanaOperation(
  stateInput: AltanaExecuteOperationState | AltanaRevokeOperationState
): false {
  if (stateInput.kind === "execute") {
    altanaExecuteOperationStateSchema.parse(stateInput);
  } else {
    altanaRevokeOperationStateSchema.parse(stateInput);
  }
  return false;
}
