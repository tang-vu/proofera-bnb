import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";

export type VenusHealthSearchParams = Record<string, string | string[] | undefined>;

export interface VenusHealthInput {
  readonly chainId: 56 | 97;
  readonly account: Address;
}

export interface VenusHealthFormValues {
  readonly chainId: "56" | "97";
  readonly account: string;
}

export interface VenusHealthQueryIssue {
  readonly field: "chainId" | "account" | "query";
  readonly message: string;
}

export type VenusHealthQueryState =
  | {
      readonly status: "blank";
      readonly formValues: VenusHealthFormValues;
    }
  | {
      readonly status: "invalid";
      readonly formValues: VenusHealthFormValues;
      readonly issues: readonly VenusHealthQueryIssue[];
    }
  | {
      readonly status: "ready";
      readonly formValues: VenusHealthFormValues;
      readonly input: VenusHealthInput;
    };

export type VenusHealthResolvedState<T> =
  | Exclude<VenusHealthQueryState, { readonly status: "ready" }>
  | {
      readonly status: "loaded";
      readonly formValues: VenusHealthFormValues;
      readonly input: VenusHealthInput;
      readonly result: T;
    };

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const chainIdSchema = z
  .enum(["56", "97"], { error: "Choose BSC mainnet (56) or BSC testnet (97)." })
  .transform((value): 56 | 97 => (value === "56" ? 56 : 97));

const accountSchema = z
  .string()
  .trim()
  .length(42, "Enter a 20-byte EVM account address.")
  .refine(
    (value) => isAddress(value, { strict: false }),
    "Enter a valid 20-byte EVM account address."
  )
  .transform((value) => getAddress(value.toLowerCase()))
  .refine((value) => value !== ZERO_ADDRESS, "The account cannot be the zero address.");

const querySchema = z.strictObject({
  chainId: chainIdSchema,
  account: accountSchema
});

function singleDisplayValue(value: string | string[] | undefined, maximum: number): string {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function formValues(params: VenusHealthSearchParams): VenusHealthFormValues {
  return {
    chainId: params.chainId === "97" ? "97" : "56",
    account: singleDisplayValue(params.account, 100)
  };
}

function issueField(path: PropertyKey | undefined): VenusHealthQueryIssue["field"] {
  return path === "chainId" || path === "account" ? path : "query";
}

function issuesFrom(error: z.ZodError): readonly VenusHealthQueryIssue[] {
  const seen = new Set<string>();
  const issues: VenusHealthQueryIssue[] = [];

  for (const issue of error.issues) {
    const field = issueField(issue.path[0]);
    const message =
      issue.code === "unrecognized_keys"
        ? "Only chainId and account query parameters are accepted."
        : issue.message;
    const key = `${field}:${message}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push({ field, message });
    }
  }

  return issues;
}

export function parseVenusHealthQuery(params: VenusHealthSearchParams): VenusHealthQueryState {
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
      account: parsed.data.account
    },
    input: parsed.data
  };
}

export async function resolveVenusHealthQuery<T>(
  params: VenusHealthSearchParams,
  load: (input: VenusHealthInput) => Promise<T>
): Promise<VenusHealthResolvedState<T>> {
  const parsed = parseVenusHealthQuery(params);
  if (parsed.status !== "ready") return parsed;

  return {
    status: "loaded",
    formValues: parsed.formValues,
    input: parsed.input,
    result: await load(parsed.input)
  };
}
