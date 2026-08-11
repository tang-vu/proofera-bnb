import type { z } from "zod";

import {
  lpActivationIntentSchema,
  type LpActivationIntent
} from "@proofera/domain/lp-activation-intent";

const UINT256_MAX = (1n << 256n) - 1n;
const PANCAKE_V3_MIN_TICK = -887_272;
const PANCAKE_V3_MAX_TICK = 887_272;

export const LP_CONFIGURATION_LIMITS = Object.freeze({
  maxExecutionsPerDay: 144,
  maxSessionDurationSeconds: 86_400,
  maxSlippageBps: 100,
  maxTxDeadlineSeconds: 1_800,
  minSessionDurationSeconds: 300,
  minTxDeadlineSeconds: 30
});

export type LpConfigurationIssueCode =
  | "INVALID_CONFIGURATION"
  | "WALLET_RECIPIENT_MISMATCH"
  | "POSITION_TOKEN_ID_INVALID"
  | "CAPITAL_AMOUNT_INVALID"
  | "TICK_OUT_OF_BOUNDS"
  | "TICK_ORDER_INVALID"
  | "SLIPPAGE_OUT_OF_BOUNDS"
  | "SESSION_DURATION_OUT_OF_BOUNDS"
  | "TX_DEADLINE_OUT_OF_BOUNDS"
  | "TX_DEADLINE_EXCEEDS_SESSION"
  | "EXECUTION_LIMIT_OUT_OF_BOUNDS";

export interface LpConfigurationIssue {
  readonly code: LpConfigurationIssueCode;
  readonly message: string;
  readonly path: string;
}

export interface LpReadinessBlocker {
  readonly code:
    | "WALLET_CONNECTION_ABSENT"
    | "TRUSTED_CONTRACT_EVIDENCE_ABSENT"
    | "OWNERSHIP_EVIDENCE_ABSENT"
    | "QUOTE_EVIDENCE_ABSENT"
    | "PERMISSION_POLICY_ABSENT"
    | "ALTANA_AUTHORITY_ABSENT"
    | "TRANSACTION_ABSENT";
  readonly message: string;
}

export interface LpConfigurationReadiness {
  readonly status: "configuration_only";
  readonly configuration: Readonly<LpActivationIntent>;
  readonly blockers: readonly LpReadinessBlocker[];
  readonly artifacts: {
    readonly walletConnection: null;
    readonly trustedContext: null;
    readonly permissionPolicy: null;
    readonly permissionPreview: null;
    readonly altanaAuthority: null;
    readonly transaction: null;
  };
  readonly readyForPermissionPreview: false;
  readonly readyForWalletConfirmation: false;
  readonly readyForExecution: false;
  readonly scopeBoundary: "Configuration only. No wallet connection, trusted server evidence, permission policy, Altana authority, or transaction exists.";
}

export type InspectLpConfigurationResult =
  | {
      readonly status: "invalid";
      readonly configuration: null;
      readonly issues: readonly LpConfigurationIssue[];
    }
  | {
      readonly status: "configuration_only";
      readonly readiness: LpConfigurationReadiness;
      readonly issues: readonly [];
    };

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function zodPath(path: readonly PropertyKey[]): string {
  return path
    .map((segment) => (typeof segment === "symbol" ? (segment.description ?? "symbol") : segment))
    .join(".");
}

function schemaIssues(error: z.ZodError): LpConfigurationIssue[] {
  return error.issues.map((issue) => ({
    code: "INVALID_CONFIGURATION",
    message: issue.message,
    path: zodPath(issue.path) || "configuration"
  }));
}

function canonicalUint256(value: string, allowZero: boolean): bigint | null {
  const pattern = allowZero ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/;
  if (!pattern.test(value) || value.length > 78) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= UINT256_MAX ? parsed : null;
  } catch {
    return null;
  }
}

function createReadiness(configuration: LpActivationIntent): LpConfigurationReadiness {
  return deepFreeze({
    status: "configuration_only" as const,
    configuration,
    blockers: [
      {
        code: "WALLET_CONNECTION_ABSENT" as const,
        message: "No wallet connection has been established."
      },
      {
        code: "TRUSTED_CONTRACT_EVIDENCE_ABSENT" as const,
        message:
          "Server-owned manager, factory, pool, deployed-code identity, token metadata, tick spacing, and pinned-block evidence are absent."
      },
      {
        code: "OWNERSHIP_EVIDENCE_ABSENT" as const,
        message: "Position ownership and controller authorization evidence are absent."
      },
      {
        code: "QUOTE_EVIDENCE_ABSENT" as const,
        message: "A fresh block-pinned quote and minimum-output provenance are absent."
      },
      {
        code: "PERMISSION_POLICY_ABSENT" as const,
        message: "No permission policy or permission preview has been created."
      },
      {
        code: "ALTANA_AUTHORITY_ABSENT" as const,
        message: "No Altana session authority has been requested or created."
      },
      {
        code: "TRANSACTION_ABSENT" as const,
        message: "No transaction has been prepared, signed, submitted, or recorded."
      }
    ],
    artifacts: {
      walletConnection: null,
      trustedContext: null,
      permissionPolicy: null,
      permissionPreview: null,
      altanaAuthority: null,
      transaction: null
    },
    readyForPermissionPreview: false as const,
    readyForWalletConfirmation: false as const,
    readyForExecution: false as const,
    scopeBoundary:
      "Configuration only. No wallet connection, trusted server evidence, permission policy, Altana authority, or transaction exists." as const
  });
}

export function inspectLpConfiguration(unparsed: unknown): InspectLpConfigurationResult {
  const parsed = lpActivationIntentSchema.safeParse(unparsed);
  if (!parsed.success) {
    return deepFreeze({
      status: "invalid" as const,
      configuration: null,
      issues: schemaIssues(parsed.error)
    });
  }

  const configuration = parsed.data;
  const issues: LpConfigurationIssue[] = [];
  const addIssue = (code: LpConfigurationIssueCode, path: string, message: string): void => {
    issues.push({ code, path, message });
  };

  if (configuration.wallet !== configuration.recipient) {
    addIssue(
      "WALLET_RECIPIENT_MISMATCH",
      "recipient",
      "Recipient must exactly match the intended execution wallet address."
    );
  }
  if (canonicalUint256(configuration.positionTokenId, true) === null) {
    addIssue(
      "POSITION_TOKEN_ID_INVALID",
      "positionTokenId",
      "Position token ID must be a canonical uint256 decimal string."
    );
  }
  if (canonicalUint256(configuration.capital.token0Raw, false) === null) {
    addIssue(
      "CAPITAL_AMOUNT_INVALID",
      "capital.token0Raw",
      "Token 0 capital must be a positive canonical uint256 decimal string."
    );
  }
  if (canonicalUint256(configuration.capital.token1Raw, false) === null) {
    addIssue(
      "CAPITAL_AMOUNT_INVALID",
      "capital.token1Raw",
      "Token 1 capital must be a positive canonical uint256 decimal string."
    );
  }

  const { lower, upper } = configuration.desiredTick;
  if (
    lower < PANCAKE_V3_MIN_TICK ||
    lower > PANCAKE_V3_MAX_TICK ||
    upper < PANCAKE_V3_MIN_TICK ||
    upper > PANCAKE_V3_MAX_TICK
  ) {
    addIssue(
      "TICK_OUT_OF_BOUNDS",
      "desiredTick",
      `Ticks must stay within ${PANCAKE_V3_MIN_TICK} and ${PANCAKE_V3_MAX_TICK}.`
    );
  }
  if (lower >= upper) {
    addIssue(
      "TICK_ORDER_INVALID",
      "desiredTick",
      "Desired lower tick must be strictly below desired upper tick."
    );
  }
  if (
    configuration.maxSlippageBps < 1 ||
    configuration.maxSlippageBps > LP_CONFIGURATION_LIMITS.maxSlippageBps
  ) {
    addIssue(
      "SLIPPAGE_OUT_OF_BOUNDS",
      "maxSlippageBps",
      `Maximum slippage must be between 1 and ${LP_CONFIGURATION_LIMITS.maxSlippageBps} basis points.`
    );
  }
  if (
    configuration.sessionDurationSeconds < LP_CONFIGURATION_LIMITS.minSessionDurationSeconds ||
    configuration.sessionDurationSeconds > LP_CONFIGURATION_LIMITS.maxSessionDurationSeconds
  ) {
    addIssue(
      "SESSION_DURATION_OUT_OF_BOUNDS",
      "sessionDurationSeconds",
      `Session duration must be between ${LP_CONFIGURATION_LIMITS.minSessionDurationSeconds} and ${LP_CONFIGURATION_LIMITS.maxSessionDurationSeconds} seconds.`
    );
  }
  if (
    configuration.txDeadlineSeconds < LP_CONFIGURATION_LIMITS.minTxDeadlineSeconds ||
    configuration.txDeadlineSeconds > LP_CONFIGURATION_LIMITS.maxTxDeadlineSeconds
  ) {
    addIssue(
      "TX_DEADLINE_OUT_OF_BOUNDS",
      "txDeadlineSeconds",
      `Deadline must be between ${LP_CONFIGURATION_LIMITS.minTxDeadlineSeconds} and ${LP_CONFIGURATION_LIMITS.maxTxDeadlineSeconds} seconds.`
    );
  }
  if (configuration.txDeadlineSeconds > configuration.sessionDurationSeconds) {
    addIssue(
      "TX_DEADLINE_EXCEEDS_SESSION",
      "txDeadlineSeconds",
      "The deadline cannot outlast the configured session."
    );
  }
  if (
    configuration.maxExecutionsPerDay < 1 ||
    configuration.maxExecutionsPerDay > LP_CONFIGURATION_LIMITS.maxExecutionsPerDay
  ) {
    addIssue(
      "EXECUTION_LIMIT_OUT_OF_BOUNDS",
      "maxExecutionsPerDay",
      `Maximum executions per day must be between 1 and ${LP_CONFIGURATION_LIMITS.maxExecutionsPerDay}.`
    );
  }

  if (issues.length > 0) {
    return deepFreeze({ status: "invalid" as const, configuration: null, issues });
  }

  return deepFreeze({
    status: "configuration_only" as const,
    readiness: createReadiness(configuration),
    issues: [] as const
  });
}
