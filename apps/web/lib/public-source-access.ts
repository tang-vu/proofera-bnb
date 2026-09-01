import { z } from "zod";

import sourceAccessArtifact from "../../../evidence/submission/public-source-access-2026-09-01.json";

const sourceObservationSchema = z.strictObject({
  name: z.string().min(1),
  url: z.url(),
  httpStatus: z.literal(200),
  contentType: z.string().min(1)
});

const publicSourceAccessSchema = z.strictObject({
  schemaVersion: z.literal("proofera-public-source-access-v1.0.0"),
  observedAtUtc: z.iso.datetime(),
  classification: z.strictObject({
    boundedObservationOnly: z.literal(true),
    organizerReceipt: z.literal(false),
    submissionCompleted: z.literal(false),
    freshRevalidationRequired: z.literal(true)
  }),
  repository: z.strictObject({
    url: z.literal("https://github.com/tang-vu/proofera-bnb"),
    visibility: z.literal("PUBLIC"),
    defaultBranch: z.literal("main"),
    observedCommit: z.string().regex(/^[0-9a-f]{40}$/u)
  }),
  anonymousHeadObservations: z
    .array(sourceObservationSchema)
    .length(6)
    .refine(
      (observations) => new Set(observations.map(({ name }) => name)).size === observations.length,
      "Public source observations must have unique names."
    ),
  rawFinalDemo: z.strictObject({
    contentLengthBytes: z.literal(37_636_488),
    etag: z.string().regex(/^[0-9a-f]{64}$/u)
  }),
  limitations: z.array(z.string().min(1)).length(3)
});

export const publicSourceAccess = Object.freeze(
  publicSourceAccessSchema.parse(sourceAccessArtifact)
);
