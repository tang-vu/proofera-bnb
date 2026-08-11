import { z } from "zod";

/** Evidence classification; it never implies that an agent is live. */
export const EvidenceEnvironmentSchema = z.enum(["fixture", "simulation", "testnet", "mainnet"]);

export const EvidenceAvailabilitySchema = z.enum(["available", "unknown", "unavailable"]);
export const EvidenceFreshnessSchema = z.enum(["fresh", "stale", "expired", "unknown"]);
export const AvailableEvidenceFreshnessSchema = z.enum(["fresh", "stale", "expired"]);

/**
 * Units belong to the evidence envelope so a number can never silently change
 * meaning between an adapter, score calculation, and UI. Structured values use
 * `none`; their member schemas retain any more granular units.
 */
export const MetricUnitSchema = z.enum([
  "none",
  "ratio",
  "percent",
  "usd",
  "base_units",
  "seconds",
  "timestamp",
  "count"
]);

export const EvidenceSourceKindSchema = z.enum([
  "api",
  "benchmark",
  "calculation",
  "contract",
  "explorer",
  "fixture",
  "indexer",
  "protocol-documentation",
  "registry",
  "transaction",
  "user-feedback"
]);

export const UtcDateTimeSchema = z.iso
  .datetime()
  .refine((value) => value.endsWith("Z"), "Timestamp must be expressed in UTC with a Z suffix");

export const HttpUrlSchema = z
  .url()
  .max(2_048)
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "Only http and https URLs are permitted"
      });
    }
    if (url.username !== "" || url.password !== "") {
      context.addIssue({
        code: "custom",
        message: "URLs must not embed credentials"
      });
    }
  });

/** CIDv0 and lowercase base32 CIDv1 IPFS URIs, intentionally separate from URLs. */
export const IpfsUriSchema = z
  .string()
  .max(2_048)
  .regex(
    /^ipfs:\/\/(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/,
    "Invalid IPFS URI"
  );

export const EvmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address");
export const TransactionHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid EVM transaction hash");
export const ChainIdSchema = z.number().int().positive();

export const HttpLocatorSchema = z.strictObject({
  type: z.literal("http"),
  url: HttpUrlSchema
});

export const IpfsLocatorSchema = z.strictObject({
  type: z.literal("ipfs"),
  uri: IpfsUriSchema
});

export const ContractLocatorSchema = z.strictObject({
  type: z.literal("contract"),
  chainId: ChainIdSchema,
  contractAddress: EvmAddressSchema
});

export const TransactionLocatorSchema = z.strictObject({
  type: z.literal("transaction"),
  chainId: ChainIdSchema,
  transactionHash: TransactionHashSchema
});

export const ExternalIdLocatorSchema = z.strictObject({
  type: z.literal("external-id"),
  id: z.string().trim().min(1).max(500)
});

export const EvidenceLocatorSchema = z.discriminatedUnion("type", [
  HttpLocatorSchema,
  IpfsLocatorSchema,
  ContractLocatorSchema,
  TransactionLocatorSchema,
  ExternalIdLocatorSchema
]);

/** A descriptor is retained even when reading the source fails. */
export const EvidenceSourceDescriptorSchema = z
  .strictObject({
    kind: EvidenceSourceKindSchema,
    label: z.string().trim().min(1).max(200),
    locator: EvidenceLocatorSchema
  })
  .superRefine((source, context) => {
    if (source.kind === "transaction" && source.locator.type !== "transaction") {
      context.addIssue({
        code: "custom",
        path: ["locator"],
        message: "Transaction evidence requires a transaction locator"
      });
    }
    if (source.kind === "contract" && source.locator.type !== "contract") {
      context.addIssue({
        code: "custom",
        path: ["locator"],
        message: "Contract evidence requires a contract locator"
      });
    }
  });

/** Available sources and unavailable expected sources share the same safe descriptor. */
export const EvidenceSourceSchema = EvidenceSourceDescriptorSchema;

export const EvidenceProviderErrorSchema = z.strictObject({
  provider: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/),
  message: z.string().trim().min(1).max(1_000),
  retryable: z.boolean()
});

export const EvidenceObservationWindowSchema = z
  .strictObject({
    start: UtcDateTimeSchema,
    end: UtcDateTimeSchema
  })
  .refine(
    ({ start, end }) => Date.parse(start) <= Date.parse(end),
    "Observation window end must not precede its start"
  );

export const EvidenceMethodologySchema = z.strictObject({
  summary: z.string().trim().min(1).max(1_000),
  version: z.string().trim().min(1).max(100),
  observationWindow: EvidenceObservationWindowSchema.nullable(),
  limitations: z.array(z.string().trim().min(1).max(500)).max(25)
});

const evidenceContextShape = {
  ingestedAt: UtcDateTimeSchema,
  methodology: EvidenceMethodologySchema,
  environment: EvidenceEnvironmentSchema
} as const;

/**
 * Builds a strict evidence envelope for one value schema and one immutable unit.
 * Unknown means there is no known trustworthy source. Unavailable means a named
 * source was attempted and failed; an optional last-good observation remains
 * nested evidence and is never promoted to the current value.
 */
export const createEvidenceMetricSchema = <
  T extends z.ZodType,
  U extends z.infer<typeof MetricUnitSchema>
>(
  valueSchema: T,
  unit: U
) => {
  const availableSchema = z
    .strictObject({
      availability: z.literal("available"),
      value: valueSchema,
      unit: z.literal(unit),
      source: EvidenceSourceSchema,
      observedAt: UtcDateTimeSchema,
      ...evidenceContextShape,
      freshness: AvailableEvidenceFreshnessSchema,
      reason: z.null(),
      expectedSource: z.null(),
      attemptedAt: z.null(),
      error: z.null(),
      lastGood: z.null()
    })
    .refine(({ observedAt, ingestedAt }) => Date.parse(observedAt) <= Date.parse(ingestedAt), {
      path: ["ingestedAt"],
      message: "Ingestion time must not precede observation time"
    });

  const unknownSchema = z.strictObject({
    availability: z.literal("unknown"),
    value: z.null(),
    unit: z.literal(unit),
    source: z.null(),
    observedAt: z.null(),
    ...evidenceContextShape,
    freshness: z.literal("unknown"),
    reason: z.string().trim().min(1).max(500),
    expectedSource: z.null(),
    attemptedAt: z.null(),
    error: z.null(),
    lastGood: z.null()
  });

  const unavailableSchema = z
    .strictObject({
      availability: z.literal("unavailable"),
      value: z.null(),
      unit: z.literal(unit),
      source: z.null(),
      observedAt: z.null(),
      ...evidenceContextShape,
      freshness: z.literal("unknown"),
      reason: z.string().trim().min(1).max(500),
      expectedSource: EvidenceSourceDescriptorSchema,
      attemptedAt: UtcDateTimeSchema,
      error: EvidenceProviderErrorSchema,
      lastGood: availableSchema.nullable()
    })
    .superRefine((evidence, context) => {
      if (Date.parse(evidence.attemptedAt) > Date.parse(evidence.ingestedAt)) {
        context.addIssue({
          code: "custom",
          path: ["attemptedAt"],
          message: "Attempt time must not follow ingestion time"
        });
      }
      if (
        evidence.lastGood !== null &&
        Date.parse(evidence.lastGood.observedAt) > Date.parse(evidence.attemptedAt)
      ) {
        context.addIssue({
          code: "custom",
          path: ["lastGood", "observedAt"],
          message: "Last-good evidence cannot postdate the failed attempt"
        });
      }
      if (
        evidence.lastGood !== null &&
        Date.parse(evidence.lastGood.ingestedAt) > Date.parse(evidence.attemptedAt)
      ) {
        context.addIssue({
          code: "custom",
          path: ["lastGood", "ingestedAt"],
          message: "Last-good evidence must have been ingested before the failed attempt"
        });
      }
      if (evidence.lastGood !== null && evidence.lastGood.environment !== evidence.environment) {
        context.addIssue({
          code: "custom",
          path: ["lastGood", "environment"],
          message: "Last-good evidence must come from the same environment"
        });
      }
    });

  return z.discriminatedUnion("availability", [availableSchema, unknownSchema, unavailableSchema]);
};

export type EvidenceEnvironment = z.infer<typeof EvidenceEnvironmentSchema>;
export type EvidenceAvailability = z.infer<typeof EvidenceAvailabilitySchema>;
export type EvidenceFreshness = z.infer<typeof EvidenceFreshnessSchema>;
export type MetricUnit = z.infer<typeof MetricUnitSchema>;
export type EvidenceSourceKind = z.infer<typeof EvidenceSourceKindSchema>;
export type EvidenceLocator = z.infer<typeof EvidenceLocatorSchema>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export type EvidenceProviderError = z.infer<typeof EvidenceProviderErrorSchema>;
export type EvidenceMethodology = z.infer<typeof EvidenceMethodologySchema>;

export type AvailableEvidence<T, U extends MetricUnit = MetricUnit> = {
  availability: "available";
  value: T;
  unit: U;
  source: EvidenceSource;
  observedAt: string;
  ingestedAt: string;
  methodology: EvidenceMethodology;
  freshness: "fresh" | "stale" | "expired";
  environment: EvidenceEnvironment;
  reason: null;
  expectedSource: null;
  attemptedAt: null;
  error: null;
  lastGood: null;
};

export type EvidenceMetric<T, U extends MetricUnit = MetricUnit> =
  | AvailableEvidence<T, U>
  | {
      availability: "unknown";
      value: null;
      unit: U;
      source: null;
      observedAt: null;
      ingestedAt: string;
      methodology: EvidenceMethodology;
      freshness: "unknown";
      environment: EvidenceEnvironment;
      reason: string;
      expectedSource: null;
      attemptedAt: null;
      error: null;
      lastGood: null;
    }
  | {
      availability: "unavailable";
      value: null;
      unit: U;
      source: null;
      observedAt: null;
      ingestedAt: string;
      methodology: EvidenceMethodology;
      freshness: "unknown";
      environment: EvidenceEnvironment;
      reason: string;
      expectedSource: EvidenceSource;
      attemptedAt: string;
      error: EvidenceProviderError;
      lastGood: AvailableEvidence<T, U> | null;
    };
