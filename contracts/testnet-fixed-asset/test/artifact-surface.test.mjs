import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_PATH = resolve(
  PACKAGE_ROOT,
  "artifacts/src/ProofEraTestAsset.sol/ProofEraTestAsset.json",
);

const EXPECTED_ERC20_FUNCTIONS = [
  {
    signature: "allowance(address,address)",
    selector: "dd62ed3e",
    inputs: ["address", "address"],
    outputs: ["uint256"],
    stateMutability: "view",
  },
  {
    signature: "approve(address,uint256)",
    selector: "095ea7b3",
    inputs: ["address", "uint256"],
    outputs: ["bool"],
    stateMutability: "nonpayable",
  },
  {
    signature: "balanceOf(address)",
    selector: "70a08231",
    inputs: ["address"],
    outputs: ["uint256"],
    stateMutability: "view",
  },
  {
    signature: "decimals()",
    selector: "313ce567",
    inputs: [],
    outputs: ["uint8"],
    stateMutability: "view",
  },
  {
    signature: "name()",
    selector: "06fdde03",
    inputs: [],
    outputs: ["string"],
    stateMutability: "view",
  },
  {
    signature: "symbol()",
    selector: "95d89b41",
    inputs: [],
    outputs: ["string"],
    stateMutability: "view",
  },
  {
    signature: "totalSupply()",
    selector: "18160ddd",
    inputs: [],
    outputs: ["uint256"],
    stateMutability: "view",
  },
  {
    signature: "transfer(address,uint256)",
    selector: "a9059cbb",
    inputs: ["address", "uint256"],
    outputs: ["bool"],
    stateMutability: "nonpayable",
  },
  {
    signature: "transferFrom(address,address,uint256)",
    selector: "23b872dd",
    inputs: ["address", "address", "uint256"],
    outputs: ["bool"],
    stateMutability: "nonpayable",
  },
];

const FORBIDDEN_FUNCTION_NAMES = [
  "blacklist",
  "burn",
  "mint",
  "owner",
  "pause",
  "permit",
  "recover",
  "renounceOwnership",
  "setFee",
  "transferOwnership",
  "unpause",
  "upgradeTo",
  "upgradeToAndCall",
];

const FORBIDDEN_RUNTIME_OPCODES = new Map([
  [0xf0, "CREATE"],
  [0xf1, "CALL"],
  [0xf2, "CALLCODE"],
  [0xf4, "DELEGATECALL"],
  [0xf5, "CREATE2"],
  [0xfa, "STATICCALL"],
  [0xff, "SELFDESTRUCT"],
]);

function executableRuntimeBytes(deployedBytecode) {
  const bytes = Buffer.from(deployedBytecode.slice(2), "hex");
  assert.ok(bytes.length > 2, "runtime bytecode is unexpectedly short");

  const metadataLength = bytes.readUInt16BE(bytes.length - 2);
  const executableLength = bytes.length - metadataLength - 2;
  assert.ok(executableLength > 0, "invalid Solidity metadata length");

  return bytes.subarray(0, executableLength);
}

function executableOpcodes(bytes) {
  const opcodes = [];

  for (
    let programCounter = 0;
    programCounter < bytes.length;
    programCounter += 1
  ) {
    const opcode = bytes[programCounter];
    opcodes.push({ opcode, programCounter });

    if (opcode >= 0x60 && opcode <= 0x7f) {
      programCounter += opcode - 0x5f;
    }
  }

  return opcodes;
}

async function readArtifactAndCompilerOutput() {
  const artifact = JSON.parse(await readFile(ARTIFACT_PATH, "utf8"));
  const buildOutput = JSON.parse(
    await readFile(
      resolve(
        PACKAGE_ROOT,
        `artifacts/build-info/${artifact.buildInfoId}.output.json`,
      ),
      "utf8",
    ),
  );
  const compiledContract =
    buildOutput.output.contracts[artifact.inputSourceName][
      artifact.contractName
    ];

  return { artifact, compiledContract };
}

test("compiled ABI exposes exactly the base ERC-20 function surface", async () => {
  const { artifact, compiledContract } = await readArtifactAndCompilerOutput();
  const methodIdentifiers = compiledContract.evm.methodIdentifiers;
  const functions = artifact.abi
    .filter((entry) => entry.type === "function")
    .map((entry) => {
      const signature = `${entry.name}(${entry.inputs.map((input) => input.type).join(",")})`;
      return {
        signature,
        selector: methodIdentifiers[signature],
        inputs: entry.inputs.map((input) => input.type),
        outputs: entry.outputs.map((output) => output.type),
        stateMutability: entry.stateMutability,
      };
    })
    .sort((left, right) => left.signature.localeCompare(right.signature));

  assert.deepEqual(functions, EXPECTED_ERC20_FUNCTIONS);
  for (const forbidden of FORBIDDEN_FUNCTION_NAMES) {
    assert.ok(
      !functions.some(({ signature }) => signature.startsWith(`${forbidden}(`)),
      `forbidden external function exposed: ${forbidden}`,
    );
  }
  assert.deepEqual(
    methodIdentifiers,
    Object.fromEntries(
      EXPECTED_ERC20_FUNCTIONS.map(({ signature, selector }) => [
        signature,
        selector,
      ]),
    ),
  );
  const constructor = artifact.abi.find(
    (entry) => entry.type === "constructor",
  );
  assert.deepEqual(constructor, {
    inputs: [
      { internalType: "address", name: "deploymentRecipient", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  });
  assert.ok(
    artifact.abi.every(
      (entry) => entry.type !== "fallback" && entry.type !== "receive",
    ),
    "fallback or receive surface must not exist",
  );
  assert.ok(
    artifact.abi
      .filter((entry) => entry.type === "function")
      .every((entry) => entry.stateMutability !== "payable"),
    "payable function surface must not exist",
  );
  assert.equal(artifact.contractName, "ProofEraTestAsset");
  assert.equal(artifact.sourceName, "src/ProofEraTestAsset.sol");
  assert.match(artifact.bytecode, /^0x[0-9a-f]+$/i);
  assert.match(artifact.deployedBytecode, /^0x[0-9a-f]+$/i);
  assert.deepEqual(artifact.linkReferences, {});
  assert.deepEqual(artifact.deployedLinkReferences, {});
});

test("runtime control flow contains no external-call, creation, proxy, or destruction opcode", async () => {
  const { artifact } = await readArtifactAndCompilerOutput();
  const opcodes = executableOpcodes(
    executableRuntimeBytes(artifact.deployedBytecode),
  );

  for (const { opcode, programCounter } of opcodes) {
    const forbiddenName = FORBIDDEN_RUNTIME_OPCODES.get(opcode);
    assert.equal(
      forbiddenName,
      undefined,
      `${forbiddenName} opcode found at executable runtime PC ${programCounter}`,
    );
  }
});
