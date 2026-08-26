import { z } from "zod";

const addressSchema = z.string().regex(/^0x[a-f0-9]{40}$/u);
const bytes32Schema = z.string().regex(/^0x[a-f0-9]{64}$/u);
const selectorSchema = z.string().regex(/^0x[a-f0-9]{8}$/u);
const maximumUint256 = (1n << 256n) - 1n;
const canonicalUnsignedIntegerSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/u)
  .refine((value) => BigInt(value) <= maximumUint256, "Value exceeds uint256.");

export const sessionMandateStatusSchema = z.enum([
  "pending_authority",
  "active",
  "paused",
  "revoked",
  "expired"
]);

export const sessionMandateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    chainId: z.union([z.literal(56), z.literal(97)]),
    wallet: addressSchema,
    sessionKey: addressSchema,
    policyHash: bytes32Schema,
    status: sessionMandateStatusSchema,
    expiresAtUnixSeconds: z.number().int().positive(),
    allowedCalls: z
      .array(
        z.strictObject({
          to: addressSchema,
          selector: selectorSchema
        })
      )
      .min(1)
      .max(24),
    spendCaps: z
      .array(
        z.strictObject({
          token: addressSchema,
          limitRaw: canonicalUnsignedIntegerSchema,
          usedRaw: canonicalUnsignedIntegerSchema
        })
      )
      .max(16),
    maxExecutionsPerDay: z.number().int().min(1).max(144),
    executionsToday: z.number().int().min(0).max(144),
    consumedIdempotencyKeys: z.array(z.string().min(1).max(160)).max(512),
    userCanPause: z.literal(true),
    userCanRevoke: z.literal(true)
  })
  .superRefine((mandate, context) => {
    const calls = new Set<string>();
    for (const [index, call] of mandate.allowedCalls.entries()) {
      const key = `${call.to}:${call.selector}`;
      if (calls.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate allowed call.",
          path: ["allowedCalls", index]
        });
      }
      calls.add(key);
    }

    const tokens = new Set<string>();
    for (const [index, cap] of mandate.spendCaps.entries()) {
      if (tokens.has(cap.token)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate token spend cap.",
          path: ["spendCaps", index]
        });
      }
      tokens.add(cap.token);
      if (BigInt(cap.usedRaw) > BigInt(cap.limitRaw)) {
        context.addIssue({
          code: "custom",
          message: "Consumed spend exceeds the mandate cap.",
          path: ["spendCaps", index, "usedRaw"]
        });
      }
    }

    if (new Set(mandate.consumedIdempotencyKeys).size !== mandate.consumedIdempotencyKeys.length) {
      context.addIssue({
        code: "custom",
        message: "Consumed idempotency keys must be unique.",
        path: ["consumedIdempotencyKeys"]
      });
    }
  });

export const mandateActionRequestSchema = z.strictObject({
  chainId: z.union([z.literal(56), z.literal(97)]),
  to: addressSchema,
  selector: selectorSchema,
  spends: z
    .array(
      z.strictObject({
        token: addressSchema,
        amountRaw: canonicalUnsignedIntegerSchema
      })
    )
    .max(16),
  idempotencyKey: z.string().min(1).max(160),
  quoteObservedAtUnixSeconds: z.number().int().nonnegative(),
  quoteValidUntilUnixSeconds: z.number().int().positive(),
  transactionDeadlineUnixSeconds: z.number().int().positive()
});

export const mandateExecutionContextSchema = z.strictObject({
  nowUnixSeconds: z.number().int().nonnegative(),
  maxQuoteAgeSeconds: z.number().int().min(0).max(3_600),
  runtimePolicyHash: bytes32Schema,
  runtimeWallet: addressSchema,
  calldataConstraintsVerified: z.boolean(),
  simulation: z.enum(["succeeded", "failed", "unavailable"])
});

export type SessionMandate = z.infer<typeof sessionMandateSchema>;
export type MandateActionRequest = z.infer<typeof mandateActionRequestSchema>;
export type MandateExecutionContext = z.infer<typeof mandateExecutionContextSchema>;

export type MandateActionIssueCode =
  | "AUTHORITY_PENDING"
  | "MANDATE_PAUSED"
  | "MANDATE_REVOKED"
  | "MANDATE_EXPIRED"
  | "CHAIN_OUTSIDE_SCOPE"
  | "CALL_OUTSIDE_SCOPE"
  | "TOKEN_OUTSIDE_SCOPE"
  | "SPEND_EXCEEDS_CAP"
  | "POLICY_BINDING_MISMATCH"
  | "WALLET_BINDING_MISMATCH"
  | "EXECUTION_LIMIT_REACHED"
  | "IDEMPOTENCY_ALREADY_USED"
  | "QUOTE_FROM_FUTURE"
  | "QUOTE_STALE"
  | "QUOTE_EXPIRED"
  | "DEADLINE_INVALID"
  | "CALLDATA_CONSTRAINTS_UNVERIFIED"
  | "SIMULATION_NOT_SUCCEEDED";

export type MandateActionIssue = Readonly<{
  code: MandateActionIssueCode;
  message: string;
}>;

export type MandateActionDecision = Readonly<{
  canSubmit: boolean;
  decision: "authorized_without_new_signature" | "blocked" | "requires_new_grant";
  issues: readonly MandateActionIssue[];
  ownerPresenceRequired: boolean;
}>;

function lower(value: string): string {
  return value.toLowerCase();
}

/**
 * Evaluates one server-assembled action against an already granted session mandate.
 * A passing action needs no new wallet signature. Scope expansion and expired/revoked
 * authority require a new owner grant; transient/runtime failures stay blocked instead.
 */
export function evaluateMandateAction(
  unparsedMandate: unknown,
  unparsedRequest: unknown,
  unparsedContext: unknown
): MandateActionDecision {
  const mandate = sessionMandateSchema.parse(unparsedMandate);
  const request = mandateActionRequestSchema.parse(unparsedRequest);
  const context = mandateExecutionContextSchema.parse(unparsedContext);
  const issues: MandateActionIssue[] = [];
  let requiresNewGrant = false;

  const add = (code: MandateActionIssueCode, message: string, scopeChange = false): void => {
    issues.push({ code, message });
    requiresNewGrant ||= scopeChange;
  };

  if (mandate.status === "pending_authority") {
    add("AUTHORITY_PENDING", "Wait for the exact onchain authority probe before execution.");
  } else if (mandate.status === "paused") {
    add("MANDATE_PAUSED", "The user paused this mandate; no action may be submitted.");
  } else if (mandate.status === "revoked") {
    add("MANDATE_REVOKED", "The session was revoked and requires a fresh owner grant.", true);
  } else if (
    mandate.status === "expired" ||
    mandate.expiresAtUnixSeconds <= context.nowUnixSeconds
  ) {
    add("MANDATE_EXPIRED", "The session expired and requires a fresh owner grant.", true);
  }

  if (request.chainId !== mandate.chainId) {
    add("CHAIN_OUTSIDE_SCOPE", "The requested chain is outside the granted mandate.", true);
  }

  const callAllowed = mandate.allowedCalls.some(
    (call) => call.to === request.to && call.selector === request.selector
  );
  if (!callAllowed) {
    add(
      "CALL_OUTSIDE_SCOPE",
      "The requested contract and selector are outside the granted mandate.",
      true
    );
  }

  const spendByToken = new Map<string, bigint>();
  for (const spend of request.spends) {
    spendByToken.set(spend.token, (spendByToken.get(spend.token) ?? 0n) + BigInt(spend.amountRaw));
  }
  const caps = new Map(mandate.spendCaps.map((cap) => [cap.token, cap]));
  for (const [token, amount] of spendByToken) {
    const cap = caps.get(token);
    if (cap === undefined) {
      add("TOKEN_OUTSIDE_SCOPE", "The action spends a token outside the mandate.", true);
    } else if (BigInt(cap.usedRaw) + amount > BigInt(cap.limitRaw)) {
      add("SPEND_EXCEEDS_CAP", "The action would exceed the granted token spend cap.", true);
    }
  }

  if (lower(context.runtimePolicyHash) !== lower(mandate.policyHash)) {
    add("POLICY_BINDING_MISMATCH", "Runtime policy hash does not match the granted mandate.");
  }
  if (lower(context.runtimeWallet) !== lower(mandate.wallet)) {
    add("WALLET_BINDING_MISMATCH", "Runtime wallet does not match the granted mandate.");
  }
  if (mandate.executionsToday >= mandate.maxExecutionsPerDay) {
    add("EXECUTION_LIMIT_REACHED", "The runtime execution limit for this day is exhausted.");
  }
  if (mandate.consumedIdempotencyKeys.includes(request.idempotencyKey)) {
    add("IDEMPOTENCY_ALREADY_USED", "This exact action was already admitted or submitted.");
  }

  if (request.quoteObservedAtUnixSeconds > context.nowUnixSeconds) {
    add("QUOTE_FROM_FUTURE", "The quote observation is later than the server clock.");
  } else if (
    context.nowUnixSeconds - request.quoteObservedAtUnixSeconds >
    context.maxQuoteAgeSeconds
  ) {
    add("QUOTE_STALE", "The quote is older than the runtime freshness limit.");
  }
  if (
    request.quoteValidUntilUnixSeconds <= context.nowUnixSeconds ||
    request.quoteValidUntilUnixSeconds < request.quoteObservedAtUnixSeconds
  ) {
    add("QUOTE_EXPIRED", "The quote is expired or has an invalid validity window.");
  }
  if (
    request.transactionDeadlineUnixSeconds <= context.nowUnixSeconds ||
    request.transactionDeadlineUnixSeconds > request.quoteValidUntilUnixSeconds ||
    request.transactionDeadlineUnixSeconds > mandate.expiresAtUnixSeconds
  ) {
    add("DEADLINE_INVALID", "The transaction deadline is outside the fresh mandate window.");
  }
  if (!context.calldataConstraintsVerified) {
    add(
      "CALLDATA_CONSTRAINTS_UNVERIFIED",
      "Recipient, amounts, slippage, and strategy arguments were not fully verified."
    );
  }
  if (context.simulation !== "succeeded") {
    add("SIMULATION_NOT_SUCCEEDED", "A fresh simulation did not succeed.");
  }

  if (issues.length === 0) {
    return {
      canSubmit: true,
      decision: "authorized_without_new_signature",
      issues: [],
      ownerPresenceRequired: false
    };
  }

  return {
    canSubmit: false,
    decision: requiresNewGrant ? "requires_new_grant" : "blocked",
    issues,
    ownerPresenceRequired: requiresNewGrant
  };
}
