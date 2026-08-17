import { getAddress } from "ethers";

const EXPECTED_IMMUTABLE_REFERENCES = Object.freeze({
  22: Object.freeze([
    Object.freeze({ length: 32, start: 148 }),
    Object.freeze({ length: 32, start: 625 })
  ])
});

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function materializeRuntimeBytecode(artifact, identityRegistry) {
  if (
    typeof artifact?.deployedBytecode !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})+$/u.test(artifact.deployedBytecode) ||
    stableJson(artifact.immutableReferences) !== stableJson(EXPECTED_IMMUTABLE_REFERENCES)
  ) {
    throw new Error("HIRE_EXECUTION_IMMUTABLE_LAYOUT_INVALID");
  }
  const runtime = Buffer.from(artifact.deployedBytecode.slice(2), "hex");
  const encodedRegistry = Buffer.alloc(32);
  Buffer.from(getAddress(identityRegistry).slice(2), "hex").copy(encodedRegistry, 12);
  for (const reference of EXPECTED_IMMUTABLE_REFERENCES[22]) {
    if (reference.start + reference.length > runtime.length) {
      throw new Error("HIRE_EXECUTION_IMMUTABLE_LAYOUT_INVALID");
    }
    encodedRegistry.copy(runtime, reference.start);
  }
  return `0x${runtime.toString("hex")}`;
}
