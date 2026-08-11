import { z } from "zod";

import type { LpActivationIntent } from "@proofera/domain/lp-activation-intent";

import {
  inspectLpConfiguration,
  type LpConfigurationIssue,
  type LpConfigurationReadiness
} from "./lp-activation-configuration";

export type LpActivationSearchParams = Record<string, string | string[] | undefined>;

export interface LpActivationFormValues {
  readonly schemaVersion: string;
  readonly chainId: string;
  readonly wallet: string;
  readonly recipient: string;
  readonly poolAddress: string;
  readonly positionTokenId: string;
  readonly tickLower: string;
  readonly tickUpper: string;
  readonly capitalToken0Raw: string;
  readonly capitalToken1Raw: string;
  readonly maxSlippageBps: string;
  readonly sessionDurationSeconds: string;
  readonly txDeadlineSeconds: string;
  readonly maxExecutionsPerDay: string;
}

export type LpActivationQueryField = keyof LpActivationFormValues | "query";

export interface LpActivationQueryIssue {
  readonly field: LpActivationQueryField;
  readonly message: string;
}

export type LpActivationQueryState =
  | {
      readonly status: "blank";
      readonly formValues: LpActivationFormValues;
    }
  | {
      readonly status: "invalid";
      readonly formValues: LpActivationFormValues;
      readonly issues: readonly LpActivationQueryIssue[];
    }
  | {
      readonly status: "configured";
      readonly formValues: LpActivationFormValues;
      readonly configuration: LpActivationIntent;
      readonly readiness: LpConfigurationReadiness;
    };

const fieldNames = [
  "schemaVersion",
  "chainId",
  "wallet",
  "recipient",
  "poolAddress",
  "positionTokenId",
  "tickLower",
  "tickUpper",
  "capitalToken0Raw",
  "capitalToken1Raw",
  "maxSlippageBps",
  "sessionDurationSeconds",
  "txDeadlineSeconds",
  "maxExecutionsPerDay"
] as const satisfies readonly (keyof LpActivationFormValues)[];

const fieldNameSet: ReadonlySet<string> = new Set(fieldNames);

const signedIntegerStringSchema = z
  .string()
  .max(16)
  .regex(/^(0|-?[1-9][0-9]*)$/, "Enter a canonical signed integer.")
  .transform((value) => Number(value))
  .refine(Number.isSafeInteger, "Enter a safe integer.");

const unsignedIntegerStringSchema = z
  .string()
  .max(16)
  .regex(/^(0|[1-9][0-9]*)$/, "Enter a canonical unsigned integer.")
  .transform((value) => Number(value))
  .refine(Number.isSafeInteger, "Enter a safe integer.");

const rawQuerySchema = z.strictObject({
  schemaVersion: z.literal("1", { error: "Configuration schema version must be 1." }),
  chainId: z.literal("97", { error: "Only BSC testnet chain 97 is accepted." }),
  wallet: z.string().min(1).max(100),
  recipient: z.string().min(1).max(100),
  poolAddress: z.string().min(1).max(100),
  positionTokenId: z.string().min(1).max(78),
  tickLower: signedIntegerStringSchema,
  tickUpper: signedIntegerStringSchema,
  capitalToken0Raw: z.string().min(1).max(78),
  capitalToken1Raw: z.string().min(1).max(78),
  maxSlippageBps: unsignedIntegerStringSchema,
  sessionDurationSeconds: unsignedIntegerStringSchema,
  txDeadlineSeconds: unsignedIntegerStringSchema,
  maxExecutionsPerDay: unsignedIntegerStringSchema
});

const defaultFormValues: LpActivationFormValues = Object.freeze({
  schemaVersion: "1",
  chainId: "97",
  wallet: "",
  recipient: "",
  poolAddress: "",
  positionTokenId: "",
  tickLower: "-120",
  tickUpper: "120",
  capitalToken0Raw: "",
  capitalToken1Raw: "",
  maxSlippageBps: "50",
  sessionDurationSeconds: "3600",
  txDeadlineSeconds: "180",
  maxExecutionsPerDay: "4"
});

function displayValue(
  params: LpActivationSearchParams,
  field: keyof LpActivationFormValues,
  fallback: string
): string {
  const value = params[field];
  return typeof value === "string" ? value.slice(0, 100) : fallback;
}

function formValues(params: LpActivationSearchParams): LpActivationFormValues {
  return {
    schemaVersion: displayValue(params, "schemaVersion", defaultFormValues.schemaVersion),
    chainId: displayValue(params, "chainId", defaultFormValues.chainId),
    wallet: displayValue(params, "wallet", defaultFormValues.wallet),
    recipient: displayValue(params, "recipient", defaultFormValues.recipient),
    poolAddress: displayValue(params, "poolAddress", defaultFormValues.poolAddress),
    positionTokenId: displayValue(params, "positionTokenId", defaultFormValues.positionTokenId),
    tickLower: displayValue(params, "tickLower", defaultFormValues.tickLower),
    tickUpper: displayValue(params, "tickUpper", defaultFormValues.tickUpper),
    capitalToken0Raw: displayValue(params, "capitalToken0Raw", defaultFormValues.capitalToken0Raw),
    capitalToken1Raw: displayValue(params, "capitalToken1Raw", defaultFormValues.capitalToken1Raw),
    maxSlippageBps: displayValue(params, "maxSlippageBps", defaultFormValues.maxSlippageBps),
    sessionDurationSeconds: displayValue(
      params,
      "sessionDurationSeconds",
      defaultFormValues.sessionDurationSeconds
    ),
    txDeadlineSeconds: displayValue(
      params,
      "txDeadlineSeconds",
      defaultFormValues.txDeadlineSeconds
    ),
    maxExecutionsPerDay: displayValue(
      params,
      "maxExecutionsPerDay",
      defaultFormValues.maxExecutionsPerDay
    )
  };
}

function queryField(value: PropertyKey | undefined): LpActivationQueryField {
  return typeof value === "string" && fieldNameSet.has(value)
    ? (value as keyof LpActivationFormValues)
    : "query";
}

function serviceField(path: string): LpActivationQueryField {
  const mapping: Readonly<Record<string, LpActivationQueryField>> = {
    "capital.token0Raw": "capitalToken0Raw",
    "capital.token1Raw": "capitalToken1Raw",
    desiredTick: "query",
    "desiredTick.lower": "tickLower",
    "desiredTick.upper": "tickUpper"
  };
  return mapping[path] ?? queryField(path);
}

function dedupeIssues(
  issues: readonly LpActivationQueryIssue[]
): readonly LpActivationQueryIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.field}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function structuralIssues(params: LpActivationSearchParams): readonly LpActivationQueryIssue[] {
  const issues: LpActivationQueryIssue[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (!fieldNameSet.has(key)) {
      issues.push({
        field: "query",
        message: "Only user-controlled LP configuration fields are accepted."
      });
    } else if (Array.isArray(value)) {
      issues.push({
        field: key as keyof LpActivationFormValues,
        message: "Each configuration field must appear exactly once."
      });
    }
  }
  return dedupeIssues(issues);
}

function rawSchemaIssues(error: z.ZodError): readonly LpActivationQueryIssue[] {
  return dedupeIssues(
    error.issues.map((issue) => ({
      field: queryField(issue.path[0]),
      message:
        issue.code === "unrecognized_keys"
          ? "Only user-controlled LP configuration fields are accepted."
          : issue.message
    }))
  );
}

function serviceIssues(issues: readonly LpConfigurationIssue[]): readonly LpActivationQueryIssue[] {
  return dedupeIssues(
    issues.map((issue) => ({ field: serviceField(issue.path), message: issue.message }))
  );
}

export function parseLpActivationQuery(params: LpActivationSearchParams): LpActivationQueryState {
  const values = formValues(params);
  if (Object.keys(params).length === 0) return { status: "blank", formValues: values };

  const structure = structuralIssues(params);
  if (structure.length > 0) {
    return { status: "invalid", formValues: values, issues: structure };
  }

  const parsed = rawQuerySchema.safeParse(params);
  if (!parsed.success) {
    return { status: "invalid", formValues: values, issues: rawSchemaIssues(parsed.error) };
  }

  const inspection = inspectLpConfiguration({
    schemaVersion: 1,
    chainId: 97,
    wallet: parsed.data.wallet,
    recipient: parsed.data.recipient,
    poolAddress: parsed.data.poolAddress,
    positionTokenId: parsed.data.positionTokenId,
    desiredTick: { lower: parsed.data.tickLower, upper: parsed.data.tickUpper },
    capital: {
      token0Raw: parsed.data.capitalToken0Raw,
      token1Raw: parsed.data.capitalToken1Raw
    },
    maxSlippageBps: parsed.data.maxSlippageBps,
    sessionDurationSeconds: parsed.data.sessionDurationSeconds,
    txDeadlineSeconds: parsed.data.txDeadlineSeconds,
    maxExecutionsPerDay: parsed.data.maxExecutionsPerDay
  });
  if (inspection.status === "invalid") {
    return {
      status: "invalid",
      formValues: values,
      issues: serviceIssues(inspection.issues)
    };
  }

  const configuration = inspection.readiness.configuration;
  return {
    status: "configured",
    formValues: {
      schemaVersion: configuration.schemaVersion.toString(10),
      chainId: configuration.chainId.toString(10),
      wallet: configuration.wallet,
      recipient: configuration.recipient,
      poolAddress: configuration.poolAddress,
      positionTokenId: configuration.positionTokenId,
      tickLower: configuration.desiredTick.lower.toString(10),
      tickUpper: configuration.desiredTick.upper.toString(10),
      capitalToken0Raw: configuration.capital.token0Raw,
      capitalToken1Raw: configuration.capital.token1Raw,
      maxSlippageBps: configuration.maxSlippageBps.toString(10),
      sessionDurationSeconds: configuration.sessionDurationSeconds.toString(10),
      txDeadlineSeconds: configuration.txDeadlineSeconds.toString(10),
      maxExecutionsPerDay: configuration.maxExecutionsPerDay.toString(10)
    },
    configuration,
    readiness: inspection.readiness
  };
}
