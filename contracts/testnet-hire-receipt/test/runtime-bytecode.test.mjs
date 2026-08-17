import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { materializeRuntimeBytecode } from "../scripts/hire-runtime-bytecode.mjs";

const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const artifact = JSON.parse(
  readFileSync(
    "artifacts/src/ProofEraTestnetHireReceipt.sol/ProofEraTestnetHireReceipt.json",
    "utf8"
  )
);

test("materializes both reviewed identity-registry immutable references", () => {
  const materialized = materializeRuntimeBytecode(artifact, REGISTRY);
  const encoded = REGISTRY.toLowerCase().slice(2).padStart(64, "0");
  assert.equal(materialized.length, artifact.deployedBytecode.length);
  for (const start of [148, 625]) {
    assert.equal(materialized.slice(2 + start * 2, 2 + (start + 32) * 2), encoded);
  }
  const restored = Buffer.from(materialized.slice(2), "hex");
  const original = Buffer.from(artifact.deployedBytecode.slice(2), "hex");
  for (const start of [148, 625]) original.copy(restored, start, start, start + 32);
  assert.deepEqual(restored, original);
});

test("rejects immutable layout drift", () => {
  assert.throws(
    () => materializeRuntimeBytecode({ ...artifact, immutableReferences: {} }, REGISTRY),
    /HIRE_EXECUTION_IMMUTABLE_LAYOUT_INVALID/u
  );
});
