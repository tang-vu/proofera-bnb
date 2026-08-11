import { PANCAKE_V3_BSC_DEPLOYMENTS, type PancakeV3SupportedChainId } from "@proofera/integrations";
import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";

const UINT256_MAX = (1n << 256n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type PancakePositionSearchParams = Record<string, string | string[] | undefined>;

export interface PancakePositionInput {
  readonly chainId: PancakeV3SupportedChainId;
  readonly poolAddress: Address;
  readonly positionId: string;
}

export interface PancakePositionFormValues {
  readonly chainId: "56" | "97";
  readonly poolAddress: string;
  readonly positionId: string;
}

export interface PancakePositionQueryIssue {
  readonly field: "chainId" | "poolAddress" | "positionId" | "query";
  readonly message: string;
}

export type PancakePositionQueryState =
  | {
      readonly status: "blank";
      readonly formValues: PancakePositionFormValues;
    }
  | {
      readonly status: "invalid";
      readonly formValues: PancakePositionFormValues;
      readonly issues: readonly PancakePositionQueryIssue[];
    }
  | {
      readonly status: "ready";
      readonly formValues: PancakePositionFormValues;
      readonly input: PancakePositionInput;
    };

export type PancakePositionResolvedState<T> =
  | Exclude<PancakePositionQueryState, { readonly status: "ready" }>
  | {
      readonly status: "loaded";
      readonly formValues: PancakePositionFormValues;
      readonly input: PancakePositionInput;
      readonly result: T;
    };

const chainIdSchema = z
  .enum(["56", "97"], { error: "Choose BSC mainnet (56) or BSC testnet (97)." })
  .transform((value): PancakeV3SupportedChainId => (value === "56" ? 56 : 97));

const poolAddressSchema = z
  .string()
  .trim()
  .length(42, "Enter a 20-byte EVM pool address.")
  .refine((value) => isAddress(value, { strict: false }), "Enter a valid 20-byte EVM pool address.")
  .transform((value) => getAddress(value))
  .refine((value) => value !== ZERO_ADDRESS, "The pool cannot be the zero address.");

const positionIdSchema = z
  .string()
  .trim()
  .max(78, "The position NFT ID exceeds uint256.")
  .regex(/^(0|[1-9][0-9]*)$/, "Enter a canonical uint256 decimal position NFT ID.")
  .refine((value) => {
    try {
      return BigInt(value) <= UINT256_MAX;
    } catch {
      return false;
    }
  }, "The position NFT ID exceeds uint256.");

const querySchema = z
  .strictObject({
    chainId: chainIdSchema,
    poolAddress: poolAddressSchema,
    positionId: positionIdSchema
  })
  .superRefine((query, context) => {
    const deployment = PANCAKE_V3_BSC_DEPLOYMENTS[query.chainId];
    if (
      query.poolAddress === deployment.positionManager ||
      query.poolAddress === deployment.factory
    ) {
      context.addIssue({
        code: "custom",
        path: ["poolAddress"],
        message: "Enter a Pancake V3 pool, not the official manager or factory address."
      });
    }
  });

function singleDisplayValue(value: string | string[] | undefined, maximum: number): string {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function formValues(params: PancakePositionSearchParams): PancakePositionFormValues {
  return {
    chainId: params.chainId === "97" ? "97" : "56",
    poolAddress: singleDisplayValue(params.poolAddress, 100),
    positionId: singleDisplayValue(params.positionId, 100)
  };
}

function issueField(path: PropertyKey | undefined): PancakePositionQueryIssue["field"] {
  return path === "chainId" || path === "poolAddress" || path === "positionId" ? path : "query";
}

function issuesFrom(error: z.ZodError): readonly PancakePositionQueryIssue[] {
  const seen = new Set<string>();
  const issues: PancakePositionQueryIssue[] = [];
  for (const issue of error.issues) {
    const field = issueField(issue.path[0]);
    const message =
      issue.code === "unrecognized_keys"
        ? "Only chainId, poolAddress, and positionId query parameters are accepted."
        : issue.message;
    const key = `${field}:${message}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push({ field, message });
    }
  }
  return issues;
}

export function parsePancakePositionQuery(
  params: PancakePositionSearchParams
): PancakePositionQueryState {
  const values = formValues(params);
  if (Object.keys(params).length === 0) return { status: "blank", formValues: values };

  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return { status: "invalid", formValues: values, issues: issuesFrom(parsed.error) };
  }

  return {
    status: "ready",
    formValues: {
      chainId: parsed.data.chainId === 56 ? "56" : "97",
      poolAddress: parsed.data.poolAddress,
      positionId: parsed.data.positionId
    },
    input: parsed.data
  };
}

export async function resolvePancakePositionQuery<T>(
  params: PancakePositionSearchParams,
  load: (input: PancakePositionInput) => Promise<T>
): Promise<PancakePositionResolvedState<T>> {
  const parsed = parsePancakePositionQuery(params);
  if (parsed.status !== "ready") return parsed;

  return {
    status: "loaded",
    formValues: parsed.formValues,
    input: parsed.input,
    result: await load(parsed.input)
  };
}
