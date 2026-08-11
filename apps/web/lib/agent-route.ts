import { z } from "zod";

const MAX_UINT256 = (1n << 256n) - 1n;

const tokenIdSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9]\d*)$/)
  .refine((value) => {
    try {
      return BigInt(value) <= MAX_UINT256;
    } catch {
      return false;
    }
  }, "Token ID exceeds uint256");

const agentRouteIdentitySchema = z.strictObject({
  chainId: z.enum(["56", "97"]).transform((value) => Number(value)),
  tokenId: tokenIdSchema
});

export interface AgentRouteIdentity {
  readonly chainId: 56 | 97;
  readonly tokenId: string;
}

export function parseAgentRouteIdentity(input: {
  readonly chainId: string;
  readonly tokenId: string;
}): AgentRouteIdentity | null {
  const result = agentRouteIdentitySchema.safeParse(input);
  return result.success ? (result.data as AgentRouteIdentity) : null;
}
