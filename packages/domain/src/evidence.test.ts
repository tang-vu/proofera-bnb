import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  EvidenceSourceSchema,
  HttpUrlSchema,
  IpfsUriSchema,
  createEvidenceMetricSchema
} from "./evidence.js";

const observedAt = "2026-08-11T08:00:00.000Z";
const ingestedAt = "2026-08-11T08:00:03.000Z";

const methodology = {
  summary: "Read the finalized execution count from the indexed registry events.",
  version: "1.0.0",
  observationWindow: {
    start: "2026-08-01T00:00:00.000Z",
    end: observedAt
  },
  limitations: ["The indexer can lag the chain tip by one block."]
} as const;

const source = {
  kind: "api",
  label: "ProofEra test indexer",
  locator: {
    type: "http",
    url: "https://example.com/evidence/executions"
  }
} as const;

const availableMetric = {
  availability: "available",
  value: 42,
  unit: "count",
  source,
  observedAt,
  ingestedAt,
  methodology,
  freshness: "fresh",
  environment: "testnet",
  reason: null,
  expectedSource: null,
  attemptedAt: null,
  error: null,
  lastGood: null
} as const;

const metricSchema = createEvidenceMetricSchema(z.number().int().nonnegative(), "count");

describe("safe evidence locators", () => {
  it.each(["https://example.com/evidence", "http://localhost:3000/api/evidence"])(
    "accepts an HTTP(S) URL: %s",
    (url) => {
      expect(HttpUrlSchema.safeParse(url).success).toBe(true);
    }
  );

  it.each([
    "not a URL",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,<script>alert(1)</script>",
    "https://user:password@example.com/private"
  ])("rejects unsafe URL: %s", (url) => {
    expect(HttpUrlSchema.safeParse(url).success).toBe(false);
  });

  it("accepts IPFS only through its separately validated URI schema", () => {
    const uri = `ipfs://Qm${"a".repeat(44)}/agent.json`;

    expect(IpfsUriSchema.safeParse(uri).success).toBe(true);
    expect(HttpUrlSchema.safeParse(uri).success).toBe(false);
  });

  it.each(["ipfs://", "ipfs://not-a-cid/agent.json", "IPFS://Qmshort"])(
    "rejects malformed IPFS locator: %s",
    (uri) => {
      expect(IpfsUriSchema.safeParse(uri).success).toBe(false);
    }
  );

  it("rejects a source kind paired with the wrong typed locator", () => {
    const result = EvidenceSourceSchema.safeParse({
      kind: "transaction",
      label: "Transaction receipt",
      locator: { type: "http", url: "https://example.com/not-a-transaction-locator" }
    });

    expect(result.success).toBe(false);
  });
});

describe("createEvidenceMetricSchema", () => {
  it("accepts provenance-rich available evidence with an explicit unit", () => {
    expect(metricSchema.parse(availableMetric)).toEqual(availableMetric);
  });

  it("preserves failed-attempt provenance and nested last-good evidence", () => {
    const lastGood = {
      ...availableMetric,
      observedAt: "2026-08-11T07:00:00.000Z",
      ingestedAt: "2026-08-11T07:00:03.000Z",
      freshness: "stale" as const
    };
    const unavailableMetric = {
      availability: "unavailable",
      value: null,
      unit: "count",
      source: null,
      observedAt: null,
      ingestedAt,
      methodology,
      freshness: "unknown",
      environment: "testnet",
      reason: "The expected indexer timed out.",
      expectedSource: source,
      attemptedAt: "2026-08-11T08:00:01.000Z",
      error: {
        provider: "ProofEra test indexer",
        code: "FETCH_TIMEOUT",
        message: "The read exceeded its bounded timeout.",
        retryable: true
      },
      lastGood
    } as const;

    const parsed = metricSchema.parse(unavailableMetric);
    expect(parsed.value).toBeNull();
    expect(parsed.observedAt).toBeNull();
    expect(parsed.lastGood?.value).toBe(42);
    expect(parsed.error?.code).toBe("FETCH_TIMEOUT");
  });

  it("accepts unavailable evidence with no last-good observation", () => {
    const result = metricSchema.safeParse({
      availability: "unavailable",
      value: null,
      unit: "count",
      source: null,
      observedAt: null,
      ingestedAt,
      methodology,
      freshness: "unknown",
      environment: "mainnet",
      reason: "The provider returned HTTP 503 before any successful read.",
      expectedSource: source,
      attemptedAt: "2026-08-11T08:00:01.000Z",
      error: {
        provider: "ProofEra test indexer",
        code: "HTTP_503",
        message: "Service unavailable.",
        retryable: true
      },
      lastGood: null
    });

    expect(result.success).toBe(true);
  });

  it("accepts unknown only as a source-less, never-observed state", () => {
    const unknownMetric = {
      availability: "unknown",
      value: null,
      unit: "count",
      source: null,
      observedAt: null,
      ingestedAt,
      methodology,
      freshness: "unknown",
      environment: "fixture",
      reason: "No trustworthy execution-count source is known.",
      expectedSource: null,
      attemptedAt: null,
      error: null,
      lastGood: null
    } as const;

    expect(metricSchema.parse(unknownMetric)).toEqual(unknownMetric);
  });

  it("rejects a bare metric value", () => {
    expect(metricSchema.safeParse(42).success).toBe(false);
  });

  it("rejects an available value carrying the wrong unit", () => {
    expect(metricSchema.safeParse({ ...availableMetric, unit: "percent" }).success).toBe(false);
  });

  it("rejects available evidence without a source or observation time", () => {
    expect(
      metricSchema.safeParse({ ...availableMetric, source: null, observedAt: null }).success
    ).toBe(false);
  });

  it("rejects unavailable evidence that omits its failed-attempt details", () => {
    const result = metricSchema.safeParse({
      availability: "unavailable",
      value: null,
      unit: "count",
      source: null,
      observedAt: null,
      ingestedAt,
      methodology,
      freshness: "unknown",
      environment: "testnet",
      reason: "Provider failed.",
      expectedSource: null,
      attemptedAt: null,
      error: null,
      lastGood: null
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown evidence disguised with unavailable-provider details", () => {
    const result = metricSchema.safeParse({
      availability: "unknown",
      value: null,
      unit: "count",
      source: null,
      observedAt: null,
      ingestedAt,
      methodology,
      freshness: "unknown",
      environment: "testnet",
      reason: "Contradictory state.",
      expectedSource: source,
      attemptedAt: "2026-08-11T08:00:01.000Z",
      error: {
        provider: "Indexer",
        code: "TIMEOUT",
        message: "Timed out.",
        retryable: true
      },
      lastGood: null
    });

    expect(result.success).toBe(false);
  });

  it("rejects unavailable evidence with a fabricated current value", () => {
    const result = metricSchema.safeParse({
      availability: "unavailable",
      value: 42,
      unit: "count",
      source,
      observedAt,
      ingestedAt,
      methodology,
      freshness: "unknown",
      environment: "testnet",
      reason: "Contradictory state.",
      expectedSource: source,
      attemptedAt: "2026-08-11T08:00:01.000Z",
      error: {
        provider: "Indexer",
        code: "TIMEOUT",
        message: "Timed out.",
        retryable: true
      },
      lastGood: null
    });

    expect(result.success).toBe(false);
  });

  it("rejects last-good evidence that postdates the failed attempt", () => {
    const result = metricSchema.safeParse({
      availability: "unavailable",
      value: null,
      unit: "count",
      source: null,
      observedAt: null,
      ingestedAt: "2026-08-11T09:00:00.000Z",
      methodology,
      freshness: "unknown",
      environment: "testnet",
      reason: "Provider failed.",
      expectedSource: source,
      attemptedAt: "2026-08-11T07:59:59.000Z",
      error: {
        provider: "Indexer",
        code: "TIMEOUT",
        message: "Timed out.",
        retryable: true
      },
      lastGood: availableMetric
    });

    expect(result.success).toBe(false);
  });

  it("rejects ingestion timestamps earlier than the observation", () => {
    expect(
      metricSchema.safeParse({
        ...availableMetric,
        ingestedAt: "2026-08-11T07:59:59.000Z"
      }).success
    ).toBe(false);
  });

  it("supports raw base-unit metrics without numeric coercion", () => {
    const baseUnitsSchema = createEvidenceMetricSchema(z.string().regex(/^\d+$/), "base_units");
    const result = baseUnitsSchema.safeParse({
      ...availableMetric,
      value: "900719925474099300000000000000000000",
      unit: "base_units"
    });

    expect(result.success).toBe(true);
  });
});
