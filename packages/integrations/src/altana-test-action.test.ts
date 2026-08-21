import { readFileSync } from "node:fs";

import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import {
  ALTANA_TEST_ACTION_TARGET,
  altanaTestActionConfigSchema,
  altanaTestActionPublicStateSchema,
  createAltanaTestActionCall,
  createAltanaTestActionGrantIntent
} from "./altana-test-action";

const config = altanaTestActionConfigSchema.parse(
  JSON.parse(
    readFileSync(
      new URL("../../../deploy/windows/altana-test-action.v1.json", import.meta.url),
      "utf8"
    )
  )
);

describe("Altana bounded test action", () => {
  it("binds the tracked worker descriptor to one zero-value PTA approval", () => {
    const call = createAltanaTestActionCall(config);
    const decoded = decodeFunctionData({
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
      data: call.data
    });

    expect(call).toMatchObject({ to: ALTANA_TEST_ACTION_TARGET, value: 0n });
    expect(decoded.functionName).toBe("approve");
    expect(decoded.args).toEqual([config.sessionKey.address, 0n]);
  });

  it("creates a one-hour exact grant with a one-wei native spend cap", () => {
    const intent = createAltanaTestActionGrantIntent(config, config.walletAddress, 1_800_000_000);

    expect(intent).toEqual({
      schemaVersion: 1,
      chainId: 97,
      walletAddress: config.walletAddress,
      sessionKey: {
        schemaVersion: 1,
        custody: "worker-kms",
        curve: "secp256k1",
        publicKey: config.sessionKey.publicKey,
        address: config.sessionKey.address
      },
      permissions: {
        calls: [{ to: ALTANA_TEST_ACTION_TARGET, signature: "approve(address,uint256)" }],
        spend: [{ token: null, limit: "1", period: "day" }]
      },
      expiry: 1_800_003_600,
      registerInKeystore: true
    });
  });

  it("rejects wallet drift, expanded approval amount, and secret-looking public state", () => {
    expect(() =>
      createAltanaTestActionGrantIntent(
        config,
        "0x0000000000000000000000000000000000000001",
        1_800_000_000
      )
    ).toThrow("ALTANA_TEST_ACTION_WALLET_MISMATCH");
    expect(
      altanaTestActionConfigSchema.safeParse({
        ...config,
        action: { ...config.action, amount: "1" }
      }).success
    ).toBe(false);
    expect(
      altanaTestActionPublicStateSchema.safeParse({
        schemaVersion: 1,
        chainId: 97,
        configHash: `0x${"11".repeat(32)}`,
        walletAddress: config.walletAddress,
        sessionKeyAddress: config.sessionKey.address,
        status: "waiting_authority",
        authorityPresent: false,
        balanceWei: "0",
        sessionExpiry: null,
        execute: null,
        observedAt: "2026-08-21T00:00:00.000Z",
        privateKey: `0x${"22".repeat(32)}`
      }).success
    ).toBe(false);
  });
});
