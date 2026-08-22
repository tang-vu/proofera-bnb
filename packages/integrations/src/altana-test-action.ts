import { encodeFunctionData, getAddress, isAddress, type Address, type Hex } from "viem";
import { publicKeyToAddress } from "viem/accounts";
import { z } from "zod";

import {
  createSessionPublicGrantDescriptor,
  serializeSessionGrantIntent,
  type SerializedSessionGrantIntent
} from "./altana-session";

export const ALTANA_TEST_ACTION_CHAIN_ID = 97 as const;
export const ALTANA_TEST_ACTION_TARGET =
  "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc" as const satisfies Address;
export const ALTANA_TEST_ACTION_SIGNATURE = "approve(address,uint256)" as const;
export const ALTANA_TEST_ACTION_AMOUNT = 0n;
export const ALTANA_TEST_ACTION_VALUE = 0n;
export const ALTANA_TEST_ACTION_NATIVE_SPEND_LIMIT = 500_000_000_000_000n;

const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Invalid EVM address")
  .transform((value) => getAddress(value) as Address);
const hashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid 32-byte hash")
  .transform((value) => value.toLowerCase() as Hex);
const publicKeySchema = z
  .string()
  .regex(/^0x04[0-9a-fA-F]{128}$/, "Invalid uncompressed secp256k1 public key")
  .transform((value) => value.toLowerCase() as Hex);
const decimalSchema = z.string().regex(/^(?:0|[1-9][0-9]*)$/, "Invalid decimal integer");
const utcSchema = z.iso.datetime().refine((value) => value.endsWith("Z"));

export const altanaTestActionConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    chainId: z.literal(ALTANA_TEST_ACTION_CHAIN_ID),
    walletAddress: addressSchema,
    sessionKey: z.strictObject({
      schemaVersion: z.literal(1),
      custody: z.literal("worker-dpapi-current-user"),
      curve: z.literal("secp256k1"),
      publicKey: publicKeySchema,
      address: addressSchema
    }),
    action: z.strictObject({
      target: z.literal(ALTANA_TEST_ACTION_TARGET),
      functionSignature: z.literal(ALTANA_TEST_ACTION_SIGNATURE),
      spender: addressSchema,
      amount: z.literal("0"),
      valueWei: z.literal("0")
    }),
    permissions: z.strictObject({
      calls: z.tuple([
        z.strictObject({
          to: z.literal(ALTANA_TEST_ACTION_TARGET),
          signature: z.literal(ALTANA_TEST_ACTION_SIGNATURE)
        })
      ]),
      spend: z.tuple([
        z.strictObject({
          token: z.null(),
          limit: z.literal(ALTANA_TEST_ACTION_NATIVE_SPEND_LIMIT.toString()),
          period: z.literal("day")
        })
      ])
    }),
    sessionLifetimeSeconds: z.literal(3_600),
    minimumNativeBalanceWei: z.literal("5000000000000000")
  })
  .superRefine((config, context) => {
    if (
      publicKeyToAddress(config.sessionKey.publicKey) !== config.sessionKey.address ||
      config.action.spender !== config.sessionKey.address
    ) {
      context.addIssue({
        code: "custom",
        path: ["sessionKey"],
        message: "Session address must match the public key and action spender"
      });
    }
  });

export type AltanaTestActionConfig = z.infer<typeof altanaTestActionConfigSchema>;

const executeSummarySchema = z
  .strictObject({
    callsId: z
      .string()
      .regex(/^0x(?:[0-9a-fA-F]{2})+$/)
      .max(514),
    transactionHash: hashSchema.nullable().optional(),
    relayStatusCode: z
      .union([z.number().int().min(100).max(699), z.enum(["PENDING", "CONFIRMED", "FAILED"])])
      .optional(),
    schemaVersion: z.literal(1).optional(),
    blockHash: hashSchema.optional(),
    blockNumber: decimalSchema.optional(),
    submittedAt: utcSchema.optional(),
    confirmedAt: utcSchema.optional()
  })
  .superRefine((execute, context) => {
    const receiptFields = [execute.blockHash, execute.blockNumber, execute.confirmedAt];
    const receiptCount = receiptFields.filter((value) => value !== undefined).length;
    if (receiptCount !== 0 && receiptCount !== receiptFields.length) {
      context.addIssue({
        code: "custom",
        message: "Execute receipt fields must be complete"
      });
    }
  });

export const altanaTestActionPublicStateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    chainId: z.literal(ALTANA_TEST_ACTION_CHAIN_ID),
    configHash: hashSchema,
    walletAddress: addressSchema,
    sessionKeyAddress: addressSchema,
    status: z.enum([
      "waiting_authority",
      "submitting_execute",
      "execute_pending",
      "execute_confirmed",
      "execute_failed",
      "execute_outcome_unknown",
      "lifecycle_complete",
      "worker_blocked"
    ]),
    authorityPresent: z.boolean().nullable(),
    balanceWei: decimalSchema.nullable(),
    sessionExpiry: z.number().int().positive().nullable(),
    execute: executeSummarySchema.nullable(),
    error: z
      .string()
      .regex(/^ALTANA_TEST_ACTION_[A-Z0-9_]+$/)
      .optional(),
    observedAt: utcSchema
  })
  .superRefine((state, context) => {
    const hasCallsId = state.execute?.callsId !== undefined;
    const hasReceipt =
      state.execute?.transactionHash !== undefined &&
      state.execute.transactionHash !== null &&
      state.execute.blockHash !== undefined &&
      state.execute.blockNumber !== undefined &&
      state.execute.confirmedAt !== undefined;
    if (
      (state.status === "waiting_authority" &&
        (state.authorityPresent !== false || state.execute !== null)) ||
      (state.status === "submitting_execute" && state.authorityPresent !== true) ||
      (state.status === "execute_pending" && !hasCallsId) ||
      (state.status === "execute_confirmed" && (state.authorityPresent !== true || !hasReceipt)) ||
      (state.status === "lifecycle_complete" &&
        (state.authorityPresent !== false || !hasReceipt)) ||
      (state.status === "worker_blocked" && state.error === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Worker public state fields do not match its status"
      });
    }
  });

export type AltanaTestActionPublicState = z.infer<typeof altanaTestActionPublicStateSchema>;

export function createAltanaTestActionGrantIntent(
  unparsedConfig: unknown,
  walletAddressInput: unknown,
  nowSeconds: number
): SerializedSessionGrantIntent {
  const config = altanaTestActionConfigSchema.parse(unparsedConfig);
  const walletAddress = addressSchema.parse(walletAddressInput);
  if (walletAddress !== config.walletAddress) {
    throw new Error("ALTANA_TEST_ACTION_WALLET_MISMATCH");
  }
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    throw new Error("ALTANA_TEST_ACTION_CLOCK_INVALID");
  }
  return serializeSessionGrantIntent({
    schemaVersion: 1,
    chainId: ALTANA_TEST_ACTION_CHAIN_ID,
    walletAddress,
    sessionKey: createSessionPublicGrantDescriptor(config.sessionKey.publicKey),
    permissions: {
      calls: config.permissions.calls,
      spend: [{ token: null, limit: ALTANA_TEST_ACTION_NATIVE_SPEND_LIMIT, period: "day" }]
    },
    expiry: nowSeconds + config.sessionLifetimeSeconds,
    registerInKeystore: true
  });
}

export function createAltanaTestActionCall(unparsedConfig: unknown): {
  readonly to: Address;
  readonly value: 0n;
  readonly data: Hex;
} {
  const config = altanaTestActionConfigSchema.parse(unparsedConfig);
  return Object.freeze({
    to: config.action.target,
    value: ALTANA_TEST_ACTION_VALUE,
    data: encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" }
          ],
          outputs: [{ type: "bool" }]
        }
      ],
      functionName: "approve",
      args: [config.action.spender, ALTANA_TEST_ACTION_AMOUNT]
    })
  });
}
