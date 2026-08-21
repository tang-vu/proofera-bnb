import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAltanaWorkerPublicState } from "./altana-worker-public-state.server";

const state = {
  schemaVersion: 1,
  chainId: 97,
  configHash: `0x${"11".repeat(32)}`,
  walletAddress: "0x91Aa0E6627bFF6C911B38CEd5F7885E063b7C27a",
  sessionKeyAddress: "0xb5F0658E3bc0c3495729b87DE32f568Bdc995a11",
  status: "waiting_authority",
  authorityPresent: false,
  balanceWei: "0",
  sessionExpiry: null,
  execute: null,
  observedAt: "2026-08-21T00:00:00.000Z"
} as const;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "proofera-altana-public-"));
  const directory = join(root, "ProofEra", "altana-test-action-v1");
  await mkdir(directory, { recursive: true });
  return { root, directory, path: join(directory, "public-state.json") };
}

describe("Altana worker public state reader", () => {
  it("returns only a strictly parsed public projection", async () => {
    const files = await fixture();
    await writeFile(files.path, JSON.stringify(state), "utf8");

    await expect(readAltanaWorkerPublicState({ LOCALAPPDATA: files.root })).resolves.toEqual({
      availability: "available",
      state
    });
  });

  it("keeps absent, malformed, and secret-bearing states unavailable", async () => {
    const absent = await fixture();
    await expect(readAltanaWorkerPublicState({ LOCALAPPDATA: absent.root })).resolves.toEqual({
      availability: "unavailable",
      reason: "worker_not_started"
    });

    const malformed = await fixture();
    await writeFile(malformed.path, JSON.stringify({ ...state, privateKey: "secret" }), "utf8");
    await expect(readAltanaWorkerPublicState({ LOCALAPPDATA: malformed.root })).resolves.toEqual({
      availability: "unavailable",
      reason: "invalid_public_state"
    });
  });

  it.skipIf(process.platform === "win32")("rejects a symlink public projection", async () => {
    const linked = await fixture();
    const target = join(linked.root, "target.json");
    await writeFile(target, JSON.stringify(state), "utf8");
    await symlink(target, linked.path, "file");
    await expect(readAltanaWorkerPublicState({ LOCALAPPDATA: linked.root })).resolves.toEqual({
      availability: "unavailable",
      reason: "invalid_public_state"
    });
  });
});
