import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { keccak256Bytes } from "../pancake-selector-review/review-lib.mjs";

const REVIEW_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(REVIEW_DIRECTORY, "../..");

export const REVIEW_CONSTANTS = Object.freeze({
  analyzedAt: "2026-08-13T04:07:11.940Z",
  artifactPath: "evidence/development/pancake-v3-initializer-selector-review-2026-08-13.json",
  chainId: 97,
  repository: "https://github.com/pancakeswap/pancake-v3-contracts.git",
  sourceCommit: "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57",
  sourceTreeSha256: "0xb3cd0b3fd4563287f587c2776eac78e5b5a4ad98f6c805a005df10727bee782d",
  signature: "createAndInitializePoolIfNecessary(address,address,uint24,uint160)",
  selector: "0x13ead562",
  managerAddress: "0x427bf5b37357632377ecbec9de3626c71a5396c1",
  factoryAddress: "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865",
  poolDeployerAddress: "0x41ff9aa7e16b8b1a8a8dc4f0efacd93d02d071c9",
  wrappedNativeAddress: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
  managerArtifactSha256: "0x9e5bca807e38e9e8acadd81c5dec6668f847a7e3397d91b3afed74b066cfbb2a",
  buildInfoSha256: "0xff2166c707d60e451ff80e6096d9b2e792eb23a27d27964299ec203fb8d763b7",
  compilerInputSha256: "0x086382b3301a745dae7d0b66878cd1c1a4433cf7b1d7725efc546511811b3c38",
  compilerSettingsSha256: "0xa1af16a691f74364a753be9855c4f0865f1fef27a515a65ee0a866c991a6c1a1",
  compilerLongVersion: "0.7.6+commit.7338295f",
  runtimeTemplateKeccak256: "0x91d390a2f85270716bdc52a7782842724fee537f3f8c4e282ce31b98eea7807b",
  linkedRuntimeKeccak256: "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7",
  runtimeByteLength: 24_466,
  selectorReviewDependencySha256:
    "0x9882a0adc797eddcb10376c1a0eed5418a1774a0f4762730052dda4d829d9e6c",
  managerSourcePath: "contracts/NonfungiblePositionManager.sol",
  initializerSourcePath: "contracts/base/PoolInitializer.sol",
  multicallSourcePath: "contracts/base/Multicall.sol",
  artifactRelativePath:
    "projects/v3-periphery/artifacts-proofera/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json",
  buildInfoRelativeDirectory: "projects/v3-periphery/artifacts-proofera/build-info"
});

const IMMUTABLE_VALUES = Object.freeze({
  _tokenDescriptor: "b099b459887bc759dbf0293e12d3dfcd0c456cff",
  nameHash: "c8147ae4d95e1ae5d91d5822a926bbc8b3167bc4efcba3aad25887e8d7e1ada0",
  versionHash: "c89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6",
  deployer: REVIEW_CONSTANTS.poolDeployerAddress.slice(2),
  factory: REVIEW_CONSTANTS.factoryAddress.slice(2),
  WETH9: REVIEW_CONSTANTS.wrappedNativeAddress.slice(2)
});

const RETAINED_PATHS = Object.freeze({
  readinessSummary: "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-2026-08-13.json",
  readinessTranscript:
    "evidence/development/bsc-testnet-pta-wbnb-pool-readiness-rpc-transcript-2026-08-13.json",
  sourceReproduction: "evidence/development/pancake-v3-source-reproduction-2026-08-11.json",
  sourceSupplement:
    "evidence/development/pancake-v3-source-reproduction-supplement-2026-08-11.json",
  coreVerification:
    "evidence/development/pancake-v3-testnet-cake-wbnb-verification-2026-08-11.json",
  selectorManifest: "evidence/development/pancake-v3-selector-paths/manifest.json",
  deniedMulticalls: "evidence/development/pancake-v3-selector-paths/denied-multicalls.json",
  selectorReviewLibrary: "scripts/pancake-selector-review/review-lib.mjs",
  initializerVendor:
    "contracts/testnet-fixed-asset/vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-periphery/contracts/base/PoolInitializer.sol",
  factoryVendor:
    "contracts/testnet-fixed-asset/vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/PancakeV3Factory.sol"
});

const CORE_SOURCE_SPECS = Object.freeze([
  Object.freeze({
    contract: "PancakeV3Factory",
    functionName: "createPool",
    anchor: "function createPool(",
    repositoryPath: "projects/v3-core/contracts/PancakeV3Factory.sol",
    requiredFragments: [
      "feeAmountTickSpacingExtraInfo[fee]",
      "IPancakeV3PoolDeployer(poolDeployer).deploy",
      "getPool[token0][token1][fee] = pool",
      "getPool[token1][token0][fee] = pool"
    ]
  }),
  Object.freeze({
    contract: "PancakeV3PoolDeployer",
    functionName: "deploy",
    anchor: "function deploy(",
    repositoryPath: "projects/v3-core/contracts/PancakeV3PoolDeployer.sol",
    requiredFragments: [
      "onlyFactory",
      "parameters = Parameters",
      "new PancakeV3Pool{salt: keccak256(abi.encode(token0, token1, fee))}",
      "delete parameters"
    ]
  }),
  Object.freeze({
    contract: "PancakeV3Pool",
    functionName: "initialize",
    anchor: "function initialize(uint160 sqrtPriceX96)",
    repositoryPath: "projects/v3-core/contracts/PancakeV3Pool.sol",
    requiredFragments: [
      "require(slot0.sqrtPriceX96 == 0",
      "observations.initialize(_blockTimestamp())",
      "slot0 = Slot0",
      "slot0.feeProtocol = 222825800"
    ]
  })
]);

const DENIED_MULTICALL_SELECTORS = Object.freeze([
  Object.freeze({ signature: "multicall(bytes[])", selector: "0xac9650d8" }),
  Object.freeze({ signature: "multicall(uint256,bytes[])", selector: "0x5ae401dc" }),
  Object.freeze({ signature: "multicall(bytes32,bytes[])", selector: "0x1f0464d1" })
]);

// These hashes pin complete canonical sections, not selected fields. They are
// deliberately independent of the artifact's own integrity seal: changing any
// nested value and recomputing canonicalBodySha256 still fails verification.
const PINNED_SECTION_SHA256 = Object.freeze({
  blockers: "0x76efcfd4a20f61a7264760a6ab49a8052edabb060bf8869b06e8f07b75dc413a",
  bytecodeAnalysis: "0xc7c9009b1cc3c046a51cc3028237d3a9bb47af7502557a051dc83a156d6f973a",
  callGraph: "0x83712783d781979b5bada60ee8af3ecceac13ce6df7ed45f6ed6f9cf65a4baa3",
  compilerBinding: "0xbd5259d3ab84227517b691f378348b8924af19dec5bd0a2552ff908e95fe0529",
  decision: "0x447119ad2a07cb7ed8d015facd87dca406c53572f79740bd7692f11e3746c9e7",
  directWriteScope: "0x57d60d569fed537d75e41b525ad83f69873346f156226a04075fdcff68bb1cef",
  historicalObservation: "0x05060dcc009b9fee2fd49adea1f74ae095bbcf0c9a3a7d118c6fc885d1b5ccac",
  limitations: "0x45c66cfa7abb57254882f53b263877e78f9834fe028decb393dc33e00a4c11a0",
  managerRuntime: "0xf5426f8df67d3b2c79fc940df5daeb0dfb801f58605429bef633b8a63fe11fa2",
  multicallAbsorptionBoundary: "0x7937ffdad7a0b066431cf8280a98376f804dd4a0f77bb24742fa5b4057095be0",
  mutableDependencies: "0x1ccc052e296fdafae168d0ff8c02bfda5184c1173b6a3661926b987c48192069",
  pathSemantics: "0x4f878fb4e51c034a831662e9d2d1768c51092a93c0a4e18c20d1822838e43092",
  protocolImmutables: "0x817a794871dae979420270b434829058c6dd772fc186690439889074a8374f21",
  publication: "0xf68b4629e9e6d5bbd8dd17259e8ec205610a3ae737b3d4d5c71bc79c5c0ee715",
  reproduction: "0x66dda8ee614fa0f5eb2a3446a28e58136523253f6dc6bd473ddad160f9a842be",
  retainedInputs: "0xddb84fa6a880d64458a0777405e2e20499d9293a96f4ba1d06a8cbbcc9b7b561",
  securityBoundary: "0xa314529bd12491751f18a201e26060e70b8eb0a8c71fba316b2e567b6d8f8b51",
  selectorAbi: "0xaa24f532622467541bbacd10f94f86942f375434825977115fec8d8ea7262c55",
  sourceAnalysis: "0x566335a23615596ea4425a6869d574bffd004e3aa28df902e6d5663c606839f5",
  sourceBinding: "0x20adcf2f469bbaa45152b637037278d1df87ae484cada8c18846b303980e5439",
  target: "0xb4f1a684aabafe423ae86be8dd90a39cd36b57634df61febada6c7b4af02648f"
});

const TOP_LEVEL_KEYS = Object.freeze([
  "activationEligible",
  "analyzedAt",
  "artifactType",
  "bindings",
  "blockers",
  "claimStatus",
  "decision",
  "directWriteScope",
  "integrity",
  "limitations",
  "multicallAbsorptionBoundary",
  "mutableDependencies",
  "publication",
  "reproduction",
  "schemaVersion",
  "securityBoundary",
  "selectorPath",
  "target",
  "tooling"
]);

const BINDING_KEYS = Object.freeze([
  "compiler",
  "historicalObservation",
  "managerRuntime",
  "protocolImmutables",
  "retainedInputs",
  "source"
]);

const SELECTOR_PATH_KEYS = Object.freeze([
  "abi",
  "bytecodeAnalysis",
  "callGraph",
  "pathSemantics",
  "sourceAnalysis"
]);

const OPCODE_NAMES = new Map([
  [0x00, "STOP"],
  [0x10, "LT"],
  [0x14, "EQ"],
  [0x15, "ISZERO"],
  [0x20, "SHA3"],
  [0x30, "ADDRESS"],
  [0x33, "CALLER"],
  [0x34, "CALLVALUE"],
  [0x35, "CALLDATALOAD"],
  [0x36, "CALLDATASIZE"],
  [0x37, "CALLDATACOPY"],
  [0x3b, "EXTCODESIZE"],
  [0x3d, "RETURNDATASIZE"],
  [0x3e, "RETURNDATACOPY"],
  [0x40, "BLOCKHASH"],
  [0x42, "TIMESTAMP"],
  [0x43, "NUMBER"],
  [0x50, "POP"],
  [0x51, "MLOAD"],
  [0x52, "MSTORE"],
  [0x53, "MSTORE8"],
  [0x54, "SLOAD"],
  [0x55, "SSTORE"],
  [0x56, "JUMP"],
  [0x57, "JUMPI"],
  [0x58, "PC"],
  [0x59, "MSIZE"],
  [0x5a, "GAS"],
  [0x5b, "JUMPDEST"],
  [0xf0, "CREATE"],
  [0xf1, "CALL"],
  [0xf2, "CALLCODE"],
  [0xf3, "RETURN"],
  [0xf4, "DELEGATECALL"],
  [0xf5, "CREATE2"],
  [0xfa, "STATICCALL"],
  [0xfd, "REVERT"],
  [0xfe, "INVALID"],
  [0xff, "SELFDESTRUCT"]
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])])
    );
  }
  return value;
}

export function canonicalCompact(value) {
  return JSON.stringify(sortJson(value));
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

export function sha256Bytes(value) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function sha256Canonical(value) {
  return sha256Bytes(Buffer.from(canonicalCompact(value), "utf8"));
}

function assertExactKeys(value, expectedKeys, label) {
  invariant(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} is not an object.`
  );
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  invariant(
    canonicalCompact(actual) === canonicalCompact(expected),
    `${label} key set drifted: ${actual.join(",")}.`
  );
}

function assertPinnedSection(name, value) {
  const expected = PINNED_SECTION_SHA256[name];
  invariant(expected !== undefined, `No pinned digest exists for section ${name}.`);
  const actual = sha256Canonical(value);
  invariant(
    actual === expected,
    `${name} canonical digest drifted: ${actual}; expected ${expected}.`
  );
}

function currentToolingBinding() {
  return {
    reviewLibrarySha256: sha256Bytes(
      readRepositoryFile("scripts/pancake-initializer-review/review-lib.mjs")
    ),
    generatorSha256: sha256Bytes(
      readRepositoryFile("scripts/pancake-initializer-review/generate.mjs")
    ),
    selectorReviewKeccakDependencySha256: REVIEW_CONSTANTS.selectorReviewDependencySha256
  };
}

function readRepositoryFile(relativePath) {
  return readFileSync(path.join(REPOSITORY_ROOT, relativePath));
}

function readRepositoryJson(relativePath) {
  return JSON.parse(readRepositoryFile(relativePath).toString("utf8"));
}

function parseSourceSpan(raw) {
  const [offset, length, sourceId] = raw.split(":").map(Number);
  invariant(
    Number.isInteger(offset) && Number.isInteger(length) && Number.isInteger(sourceId),
    `Invalid Solidity source span: ${raw}`
  );
  return { offset, length, sourceId };
}

function sourceSlice(source, span) {
  return Buffer.from(source, "utf8").subarray(span.offset, span.offset + span.length);
}

function lineNumber(source, byteOffset) {
  return Buffer.from(source, "utf8").subarray(0, byteOffset).toString("utf8").split("\n").length;
}

function walkAst(value, callback) {
  if (value === null || typeof value !== "object") return;
  callback(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) walkAst(item, callback);
    } else if (child !== null && typeof child === "object") {
      walkAst(child, callback);
    }
  }
}

function collectAstDefinitions(buildInfo) {
  const definitions = new Map();
  const variables = new Map();
  for (const [sourcePath, sourceOutput] of Object.entries(buildInfo.output.sources)) {
    walkAst(sourceOutput.ast, (node) => {
      if (
        (node.nodeType === "FunctionDefinition" || node.nodeType === "ModifierDefinition") &&
        Number.isInteger(node.id)
      ) {
        definitions.set(node.id, { node, sourcePath });
      }
      if (node.nodeType === "VariableDeclaration" && Number.isInteger(node.id)) {
        variables.set(node.id, { node, sourcePath });
      }
    });
  }
  return { definitions, variables };
}

function findInitializerDefinition(buildInfo) {
  const sourceOutput = buildInfo.output.sources[REVIEW_CONSTANTS.initializerSourcePath];
  invariant(sourceOutput !== undefined, "Build-info does not contain PoolInitializer.sol.");
  const matches = [];
  walkAst(sourceOutput.ast, (node) => {
    if (
      node.nodeType === "FunctionDefinition" &&
      node.name === "createAndInitializePoolIfNecessary" &&
      node.functionSelector === REVIEW_CONSTANTS.selector.slice(2)
    ) {
      matches.push(node);
    }
  });
  invariant(matches.length === 1, `Expected one initializer definition, found ${matches.length}.`);
  return matches[0];
}

function canonicalFunctionSignature(definition) {
  const types = definition.parameters.parameters.map(
    (parameter) => parameter.typeDescriptions.typeString
  );
  return `${definition.name}(${types.join(",")})`;
}

function analyzeInitializerSource(buildInfo, definition, definitions, variables) {
  const source = buildInfo.input.sources[REVIEW_CONSTANTS.initializerSourcePath].content;
  const definitionSpan = parseSourceSpan(definition.src);
  const calls = [];
  const guards = [];
  const branches = [];
  const stateWrites = [];
  const lowLevelCalls = [];
  const functionCallOptions = [];
  const timeReads = [];

  walkAst(definition.body, (node) => {
    if (node.nodeType === "IfStatement") {
      const conditionSpan = parseSourceSpan(node.condition.src);
      branches.push({
        conditionSha256: sha256Bytes(sourceSlice(source, conditionSpan)),
        line: lineNumber(source, conditionSpan.offset),
        nodeId: node.id,
        span: conditionSpan
      });
    }
    if (node.nodeType === "Assignment") {
      const referencedId = node.leftHandSide?.referencedDeclaration;
      const variable = Number.isInteger(referencedId) ? variables.get(referencedId) : undefined;
      if (variable?.node.stateVariable === true) {
        stateWrites.push({ nodeId: node.id, variable: variable.node.name });
      }
    }
    if (node.nodeType === "FunctionCallOptions") functionCallOptions.push(node.id);
    if (
      node.nodeType === "MemberAccess" &&
      ["timestamp", "number"].includes(node.memberName) &&
      node.expression?.name === "block"
    ) {
      timeReads.push({ memberName: node.memberName, nodeId: node.id });
    }
    if (node.nodeType !== "FunctionCall") return;

    const expression = node.expression;
    if (expression?.nodeType === "Identifier" && expression.name === "require") {
      const guardSpan = parseSourceSpan(node.arguments[0].src);
      guards.push({
        conditionSha256: sha256Bytes(sourceSlice(source, guardSpan)),
        line: lineNumber(source, guardSpan.offset),
        nodeId: node.id,
        span: guardSpan
      });
      return;
    }
    if (expression?.nodeType !== "MemberAccess") return;
    if (
      ["call", "callcode", "delegatecall", "staticcall", "send"].includes(expression.memberName)
    ) {
      lowLevelCalls.push({ memberName: expression.memberName, nodeId: node.id });
    }
    const referencedId = expression.referencedDeclaration;
    if (!Number.isInteger(referencedId) || !definitions.has(referencedId)) return;
    const target = definitions.get(referencedId);
    if (target.node.nodeType !== "FunctionDefinition" || target.node.visibility !== "external")
      return;
    const span = parseSourceSpan(node.src);
    calls.push({
      callSiteSha256: sha256Bytes(sourceSlice(source, span)),
      line: lineNumber(source, span.offset),
      memberName: expression.memberName,
      nodeId: node.id,
      receiverType: expression.expression.typeDescriptions.typeString,
      signature: canonicalFunctionSignature(target.node),
      span,
      stateMutability: target.node.stateMutability,
      targetDefinitionId: referencedId,
      targetSourcePath: target.sourcePath
    });
  });

  calls.sort((left, right) => left.span.offset - right.span.offset);
  const expectedCalls = ["getPool", "createPool", "initialize", "slot0", "initialize"];
  invariant(
    calls.map(({ memberName }) => memberName).join(",") === expectedCalls.join(","),
    `Initializer external call sequence drifted: ${calls.map(({ memberName }) => memberName).join(",")}.`
  );
  invariant(guards.length === 1, `Expected one require guard, found ${guards.length}.`);
  invariant(branches.length === 2, `Expected two initializer branches, found ${branches.length}.`);
  invariant(stateWrites.length === 0, "Initializer unexpectedly writes manager storage directly.");
  invariant(lowLevelCalls.length === 0, "Initializer unexpectedly contains a low-level call.");
  invariant(
    functionCallOptions.length === 0,
    "Initializer unexpectedly forwards explicit call options/value."
  );
  invariant(timeReads.length === 0, "Initializer unexpectedly reads block time/height.");

  return {
    branchConditions: branches,
    externalCalls: calls,
    function: {
      definitionId: definition.id,
      line: lineNumber(source, definitionSpan.offset),
      signature: canonicalFunctionSignature(definition),
      sourcePath: REVIEW_CONSTANTS.initializerSourcePath,
      sourceSliceSha256: sha256Bytes(sourceSlice(source, definitionSpan)),
      span: definitionSpan,
      stateMutability: definition.stateMutability,
      visibility: definition.visibility
    },
    guardConditions: guards,
    managerStateWriteNodes: stateWrites,
    lowLevelCallNodes: lowLevelCalls,
    explicitCallOptionNodes: functionCallOptions,
    blockTimeOrHeightReadNodes: timeReads
  };
}

function disassemble(hex) {
  invariant(/^[0-9a-f]+$/u.test(hex) && hex.length % 2 === 0, "Runtime is not plain hex.");
  const bytes = Buffer.from(hex, "hex");
  const instructions = [];
  for (let pc = 0; pc < bytes.length;) {
    const opcode = bytes[pc];
    const pushLength = opcode >= 0x60 && opcode <= 0x7f ? opcode - 0x5f : 0;
    invariant(pc + pushLength < bytes.length, `Truncated PUSH at PC ${pc}.`);
    const name =
      pushLength > 0
        ? `PUSH${pushLength}`
        : opcode >= 0x80 && opcode <= 0x8f
          ? `DUP${opcode - 0x7f}`
          : opcode >= 0x90 && opcode <= 0x9f
            ? `SWAP${opcode - 0x8f}`
            : opcode >= 0xa0 && opcode <= 0xa4
              ? `LOG${opcode - 0xa0}`
              : (OPCODE_NAMES.get(opcode) ?? `OP_${opcode.toString(16).padStart(2, "0")}`);
    instructions.push({
      data: pushLength === 0 ? null : bytes.subarray(pc + 1, pc + 1 + pushLength).toString("hex"),
      index: instructions.length,
      name,
      pc,
      pushLength
    });
    pc += 1 + pushLength;
  }
  return instructions;
}

function parseSourceMap(raw, instructionCount) {
  let previous = [0, 0, -1, "", 0];
  const entries = raw.split(";").map((entry) => {
    const fields = entry.split(":");
    const next = previous.map((value, index) => {
      const field = fields[index];
      if (field === undefined || field === "") return value;
      return index === 3 ? field : Number(field);
    });
    previous = next;
    return {
      jump: next[3],
      length: next[1],
      modifierDepth: next[4],
      offset: next[0],
      sourceId: next[2]
    };
  });
  invariant(entries.length > 0 && entries.length <= instructionCount, "Invalid source-map size.");
  return entries;
}

function dispatcherEntries(instructions) {
  const entries = [];
  for (let index = 0; index + 3 < instructions.length; index += 1) {
    const [selectorPush, eq, destinationPush, jumpi] = instructions.slice(index, index + 4);
    if (
      selectorPush.name === "PUSH4" &&
      eq.name === "EQ" &&
      destinationPush.name.startsWith("PUSH") &&
      jumpi.name === "JUMPI"
    ) {
      entries.push({
        comparePc: selectorPush.pc,
        destinationPc: Number.parseInt(destinationPush.data, 16),
        jumpiPc: jumpi.pc,
        selector: `0x${selectorPush.data}`
      });
    }
  }
  return entries;
}

function wrapperDetails(instructions, destinationPc) {
  const start = instructions.findIndex(({ pc }) => pc === destinationPc);
  invariant(start >= 0 && instructions[start].name === "JUMPDEST", "Missing ABI wrapper JUMPDEST.");
  const firstJumpRelative = instructions
    .slice(start + 1, start + 16)
    .findIndex(({ name }) => name === "JUMP");
  invariant(firstJumpRelative >= 0, "Missing wrapper decoder jump.");
  const firstJumpIndex = start + 1 + firstJumpRelative;
  const decoderPush = instructions[firstJumpIndex - 1];
  invariant(decoderPush.name.startsWith("PUSH"), "Missing ABI decoder destination.");
  const resumeIndex = firstJumpIndex + 1;
  invariant(instructions[resumeIndex].name === "JUMPDEST", "Missing ABI decoder return label.");
  const bodyPush = instructions[resumeIndex + 1];
  const bodyJump = instructions[resumeIndex + 2];
  invariant(bodyPush.name.startsWith("PUSH") && bodyJump.name === "JUMP", "Missing body jump.");
  return {
    abiDecoderPc: Number.parseInt(decoderPush.data, 16),
    bodyPc: Number.parseInt(bodyPush.data, 16),
    decoderReturnPc: instructions[resumeIndex].pc,
    wrapperPc: destinationPc
  };
}

function compressMappedInstructions(instructions, mappedIndexes) {
  const sorted = [...mappedIndexes].sort((left, right) => left - right);
  const ranges = [];
  let current = null;
  for (const index of sorted) {
    if (current === null || index !== current.lastIndex + 1) {
      if (current !== null) {
        ranges.push({
          endPc: instructions[current.lastIndex].pc,
          instructionCount: current.lastIndex - current.firstIndex + 1,
          startPc: instructions[current.firstIndex].pc
        });
      }
      current = { firstIndex: index, lastIndex: index };
    } else {
      current.lastIndex = index;
    }
  }
  if (current !== null) {
    ranges.push({
      endPc: instructions[current.lastIndex].pc,
      instructionCount: current.lastIndex - current.firstIndex + 1,
      startPc: instructions[current.firstIndex].pc
    });
  }
  return ranges;
}

function analyzeBytecodePath(contractOutput, definition) {
  const runtime = contractOutput.evm.deployedBytecode.object.toLowerCase();
  const instructions = disassemble(runtime);
  const sourceMap = parseSourceMap(
    contractOutput.evm.deployedBytecode.sourceMap,
    instructions.length
  );
  const span = parseSourceSpan(definition.src);
  const records = [];
  const mappedIndexes = new Set();
  for (let index = 0; index < sourceMap.length; index += 1) {
    const mapping = sourceMap[index];
    if (
      mapping.sourceId !== span.sourceId ||
      mapping.offset < span.offset ||
      mapping.offset >= span.offset + span.length
    ) {
      continue;
    }
    mappedIndexes.add(index);
    records.push({
      jump: mapping.jump,
      length: mapping.length,
      modifierDepth: mapping.modifierDepth,
      offset: mapping.offset,
      opcode: instructions[index].name,
      pc: instructions[index].pc,
      sourcePath: REVIEW_CONSTANTS.initializerSourcePath
    });
  }
  invariant(records.length > 0, "Initializer source map produced no runtime instructions.");
  const effectNames = new Set([
    "CALL",
    "CALLCODE",
    "DELEGATECALL",
    "STATICCALL",
    "CREATE",
    "CREATE2",
    "SELFDESTRUCT",
    "SSTORE"
  ]);
  const effects = records.filter(({ opcode }) => effectNames.has(opcode));
  invariant(
    effects.every(({ opcode }) => ["CALL", "STATICCALL"].includes(opcode)),
    `Unexpected initializer-mapped effect opcode: ${effects.map(({ opcode }) => opcode).join(",")}.`
  );
  const dispatcher = dispatcherEntries(instructions);
  const initializerEntries = dispatcher.filter(
    ({ selector }) => selector === REVIEW_CONSTANTS.selector
  );
  invariant(
    initializerEntries.length === 1,
    "Initializer selector is not unique in the dispatcher."
  );
  const runtimeDelegatecallPcs = instructions
    .filter(({ name }) => name === "DELEGATECALL")
    .map(({ pc }) => pc);
  invariant(
    runtimeDelegatecallPcs.length === 1 && runtimeDelegatecallPcs[0] === 10_522,
    `Manager DELEGATECALL inventory drifted: ${runtimeDelegatecallPcs.join(",")}.`
  );
  const initializerMappedDelegatecallPcs = effects
    .filter(({ opcode }) => opcode === "DELEGATECALL")
    .map(({ pc }) => pc);
  invariant(
    initializerMappedDelegatecallPcs.length === 0,
    "Initializer direct path maps to DELEGATECALL."
  );

  const lastMappedIndex = sourceMap.length - 1;
  return {
    dispatcherEntry: initializerEntries[0],
    initializerMappedEffectInstructions: effects,
    initializerMappedInstructionCount: records.length,
    initializerMappedInstructionSetSha256: sha256Canonical(records),
    initializerMappedPcRanges: compressMappedInstructions(instructions, mappedIndexes),
    runtimeWideCallcodePcs: instructions
      .filter(({ name }) => name === "CALLCODE")
      .map(({ pc }) => pc),
    runtimeWideDelegatecallPcs: runtimeDelegatecallPcs,
    runtimeWideSelfdestructPcs: instructions
      .filter(({ name }) => name === "SELFDESTRUCT")
      .map(({ pc }) => pc),
    sourceMapBoundary: {
      lastSourceMappedOpcode: instructions[lastMappedIndex].name,
      lastSourceMappedPc: instructions[lastMappedIndex].pc,
      sourceMappedInstructionCount: sourceMap.length,
      trailingCompilerDataByteLength:
        Buffer.from(runtime, "hex").length - instructions[lastMappedIndex].pc - 1
    },
    wrapper: wrapperDetails(instructions, initializerEntries[0].destinationPc)
  };
}

function immutableLinkedRuntime(contractOutput, variables) {
  let runtime = contractOutput.evm.deployedBytecode.object.toLowerCase();
  const linked = [];
  for (const [idText, locations] of Object.entries(
    contractOutput.evm.deployedBytecode.immutableReferences
  )) {
    const id = Number(idText);
    const variable = variables.get(id);
    invariant(variable !== undefined, `Unknown immutable AST id ${id}.`);
    const rawValue = IMMUTABLE_VALUES[variable.node.name];
    invariant(rawValue !== undefined, `No pinned value for immutable ${variable.node.name}.`);
    const value = rawValue.padStart(64, "0");
    invariant(value.length === 64 && /^[0-9a-f]+$/u.test(value), "Invalid immutable value.");
    for (const location of locations) {
      invariant(location.length === 32, `Unexpected immutable width for ${variable.node.name}.`);
      const start = location.start * 2;
      const end = start + location.length * 2;
      invariant(/^0+$/u.test(runtime.slice(start, end)), "Immutable template slot is not zero.");
      runtime = `${runtime.slice(0, start)}${value}${runtime.slice(end)}`;
      linked.push({
        astId: id,
        byteLength: location.length,
        byteOffset: location.start,
        name: variable.node.name,
        value: `0x${value}`
      });
    }
  }
  return { linked: linked.sort((left, right) => left.byteOffset - right.byteOffset), runtime };
}

function verifyGitSource(sourceRoot, buildInfo) {
  const commit = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true
  }).trim();
  invariant(commit === REVIEW_CONSTANTS.sourceCommit, `Unexpected source commit ${commit}.`);
  const trackedStatus = execFileSync(
    "git",
    ["-C", sourceRoot, "status", "--porcelain", "--untracked-files=no"],
    { encoding: "utf8", windowsHide: true }
  ).trim();
  invariant(trackedStatus === "", "Pinned source checkout contains tracked modifications.");
  const archive = execFileSync(
    "git",
    ["-C", sourceRoot, "archive", "--format=tar", REVIEW_CONSTANTS.sourceCommit],
    { encoding: null, maxBuffer: 32 * 1024 * 1024, windowsHide: true }
  );
  invariant(sha256Bytes(archive) === REVIEW_CONSTANTS.sourceTreeSha256, "Source archive drifted.");

  const mappings = [
    [
      REVIEW_CONSTANTS.managerSourcePath,
      "projects/v3-periphery/contracts/NonfungiblePositionManager.sol"
    ],
    [
      REVIEW_CONSTANTS.initializerSourcePath,
      "projects/v3-periphery/contracts/base/PoolInitializer.sol"
    ],
    [REVIEW_CONSTANTS.multicallSourcePath, "projects/v3-periphery/contracts/base/Multicall.sol"],
    [
      "contracts/interfaces/IPoolInitializer.sol",
      "projects/v3-periphery/contracts/interfaces/IPoolInitializer.sol"
    ],
    [
      "@pancakeswap/v3-core/contracts/interfaces/IPancakeV3Factory.sol",
      "projects/v3-core/contracts/interfaces/IPancakeV3Factory.sol"
    ],
    [
      "@pancakeswap/v3-core/contracts/interfaces/IPancakeV3Pool.sol",
      "projects/v3-core/contracts/interfaces/IPancakeV3Pool.sol"
    ],
    [
      "@pancakeswap/v3-core/contracts/interfaces/pool/IPancakeV3PoolActions.sol",
      "projects/v3-core/contracts/interfaces/pool/IPancakeV3PoolActions.sol"
    ],
    [
      "@pancakeswap/v3-core/contracts/interfaces/pool/IPancakeV3PoolState.sol",
      "projects/v3-core/contracts/interfaces/pool/IPancakeV3PoolState.sol"
    ]
  ];
  return mappings.map(([compilerPath, repositoryPath]) => {
    const committed = execFileSync(
      "git",
      ["-C", sourceRoot, "show", `${REVIEW_CONSTANTS.sourceCommit}:${repositoryPath}`],
      { encoding: null, maxBuffer: 4 * 1024 * 1024, windowsHide: true }
    );
    const compiled = buildInfo.input.sources[compilerPath]?.content;
    invariant(compiled !== undefined, `Compiler input lacks ${compilerPath}.`);
    invariant(
      committed.toString("utf8").replace(/\r\n/gu, "\n") === compiled.replace(/\r\n/gu, "\n"),
      `Compiled source differs from commit: ${compilerPath}.`
    );
    return {
      compilerPath,
      repositoryPath,
      sha256: sha256Bytes(committed)
    };
  });
}

function findClosingBrace(source, openingIndex) {
  let depth = 0;
  let state = "code";
  for (let index = openingIndex; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (state === "lineComment") {
      if (current === "\n") state = "code";
      continue;
    }
    if (state === "blockComment") {
      if (current === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state === "singleQuote" || state === "doubleQuote") {
      const delimiter = state === "singleQuote" ? "'" : '"';
      if (current === "\\") {
        index += 1;
      } else if (current === delimiter) {
        state = "code";
      }
      continue;
    }
    if (current === "/" && next === "/") {
      state = "lineComment";
      index += 1;
    } else if (current === "/" && next === "*") {
      state = "blockComment";
      index += 1;
    } else if (current === "'") {
      state = "singleQuote";
    } else if (current === '"') {
      state = "doubleQuote";
    } else if (current === "{") {
      depth += 1;
    } else if (current === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Unclosed Solidity function body.");
}

function inspectCoreWriteFunctions(sourceRoot) {
  return CORE_SOURCE_SPECS.map((spec) => {
    const source = execFileSync(
      "git",
      ["-C", sourceRoot, "show", `${REVIEW_CONSTANTS.sourceCommit}:${spec.repositoryPath}`],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, windowsHide: true }
    );
    const first = source.indexOf(spec.anchor);
    invariant(
      first >= 0 && source.indexOf(spec.anchor, first + 1) < 0,
      `Non-unique ${spec.anchor}.`
    );
    const opening = source.indexOf("{", first);
    invariant(opening > first, `Missing body for ${spec.contract}.${spec.functionName}.`);
    const closing = findClosingBrace(source, opening);
    const slice = source.slice(first, closing + 1);
    for (const fragment of spec.requiredFragments) {
      invariant(
        slice.includes(fragment),
        `${spec.contract}.${spec.functionName} lost ${fragment}.`
      );
    }
    return {
      contract: spec.contract,
      functionName: spec.functionName,
      functionSliceSha256: sha256Bytes(Buffer.from(slice, "utf8")),
      lineEnd: lineNumber(source, Buffer.byteLength(source.slice(0, closing + 1), "utf8")),
      lineStart: lineNumber(source, Buffer.byteLength(source.slice(0, first), "utf8")),
      repositoryPath: spec.repositoryPath,
      sourceSha256: sha256Bytes(Buffer.from(source, "utf8"))
    };
  });
}

function findBuildInfo(sourceRoot) {
  const directory = path.join(sourceRoot, REVIEW_CONSTANTS.buildInfoRelativeDirectory);
  const matches = [];
  for (const file of readdirSync(directory)) {
    if (!file.endsWith(".json")) continue;
    const absolute = path.join(directory, file);
    const bytes = readFileSync(absolute);
    if (sha256Bytes(bytes) !== REVIEW_CONSTANTS.buildInfoSha256) continue;
    matches.push({ absolute, bytes, buildInfo: JSON.parse(bytes.toString("utf8")) });
  }
  invariant(matches.length === 1, `Expected one pinned build-info, found ${matches.length}.`);
  return matches[0];
}

function validateBuild(sourceRoot) {
  const buildRecord = findBuildInfo(sourceRoot);
  const { buildInfo } = buildRecord;
  invariant(
    buildInfo.solcLongVersion === REVIEW_CONSTANTS.compilerLongVersion,
    "Compiler drifted."
  );
  invariant(
    sha256Canonical(buildInfo.input) === REVIEW_CONSTANTS.compilerInputSha256,
    "Compiler input drifted."
  );
  invariant(
    sha256Canonical(buildInfo.input.settings) === REVIEW_CONSTANTS.compilerSettingsSha256,
    "Compiler settings drifted."
  );
  const contractOutput =
    buildInfo.output.contracts[REVIEW_CONSTANTS.managerSourcePath]?.NonfungiblePositionManager;
  invariant(contractOutput !== undefined, "Manager compiler output missing.");
  const artifactBytes = readFileSync(path.join(sourceRoot, REVIEW_CONSTANTS.artifactRelativePath));
  invariant(
    sha256Bytes(artifactBytes) === REVIEW_CONSTANTS.managerArtifactSha256,
    "Manager artifact drifted."
  );
  const artifact = JSON.parse(artifactBytes.toString("utf8"));
  invariant(
    artifact.deployedBytecode === `0x${contractOutput.evm.deployedBytecode.object}`,
    "Artifact/runtime template differs from build-info."
  );
  invariant(
    artifact.bytecode === `0x${contractOutput.evm.bytecode.object}`,
    "Artifact creation code differs from build-info."
  );
  invariant(
    contractOutput.evm.methodIdentifiers[REVIEW_CONSTANTS.signature] ===
      REVIEW_CONSTANTS.selector.slice(2),
    "Compiler method identifier drifted."
  );
  const abiMatches = artifact.abi.filter(
    (entry) => entry.type === "function" && entry.name === "createAndInitializePoolIfNecessary"
  );
  invariant(abiMatches.length === 1, "Initializer ABI is not unique.");
  const initializerAbi = abiMatches[0];
  invariant(initializerAbi.stateMutability === "payable", "Initializer ABI is no longer payable.");
  invariant(
    initializerAbi.inputs.map(({ type }) => type).join(",") === "address,address,uint24,uint160",
    "Initializer ABI input types drifted."
  );
  invariant(
    initializerAbi.outputs.map(({ type }) => type).join(",") === "address",
    "Initializer ABI output type drifted."
  );
  return { artifact, artifactBytes, buildInfo, buildInfoBytes: buildRecord.bytes, contractOutput };
}

function verifyTranscriptIntegrity(transcript) {
  const { integrity, ...body } = transcript;
  invariant(
    integrity.canonicalBodySha256 === sha256Canonical(body).slice(2),
    "Readiness transcript canonical body digest drifted."
  );
}

function loadRetainedContext() {
  const summary = readRepositoryJson(RETAINED_PATHS.readinessSummary);
  const transcript = readRepositoryJson(RETAINED_PATHS.readinessTranscript);
  const sourceReproduction = readRepositoryJson(RETAINED_PATHS.sourceReproduction);
  const sourceSupplement = readRepositoryJson(RETAINED_PATHS.sourceSupplement);
  const coreVerification = readRepositoryJson(RETAINED_PATHS.coreVerification);
  const selectorManifest = readRepositoryJson(RETAINED_PATHS.selectorManifest);
  const deniedMulticalls = readRepositoryJson(RETAINED_PATHS.deniedMulticalls);
  verifyTranscriptIntegrity(transcript);
  invariant(
    summary.scope.rawTranscriptCanonicalBodySha256 === transcript.integrity.canonicalBodySha256,
    "Summary/transcript digest mismatch."
  );
  invariant(
    summary.checkpoint.blockHash === transcript.checkpoint.hash,
    "Checkpoint hash mismatch."
  );
  invariant(
    summary.checkpoint.blockNumber === transcript.checkpoint.number,
    "Checkpoint height mismatch."
  );
  invariant(summary.scope.chainId === REVIEW_CONSTANTS.chainId, "Readiness chain drifted.");
  invariant(summary.scope.onchainWritesPerformed === false, "Readiness evidence is not read-only.");
  invariant(
    summary.scope.signaturesRequested === false,
    "Readiness evidence requested a signature."
  );

  const managerRead = transcript.reads.find(({ label }) => label === "code.position_manager");
  invariant(managerRead !== undefined, "Retained manager runtime read missing.");
  invariant(managerRead.providerAgreementVerified === true, "Manager providers did not agree.");
  invariant(
    managerRead.result.normalizedResultsByProvider.length === 2 &&
      managerRead.result.normalizedResultsByProvider.every(
        ({ normalizedResult }) => normalizedResult === managerRead.result.normalizedResult
      ),
    "Retained manager runtime provider payloads disagree."
  );

  const deniedFileBytes = readRepositoryFile(RETAINED_PATHS.deniedMulticalls);
  const manifestRecord = selectorManifest.files.find(
    ({ file }) => file === "denied-multicalls.json"
  );
  invariant(manifestRecord !== undefined, "Denied-multicall manifest record missing.");
  invariant(
    manifestRecord.sha256 === sha256Bytes(deniedFileBytes),
    "Denied-multicall artifact/manifest digest mismatch."
  );
  invariant(
    deniedMulticalls.decision === "deny_all_multicall_selectors_and_nested_calldata",
    "Denied-multicall policy drifted."
  );
  invariant(
    deniedMulticalls.activationEligible === false,
    "Denied-multicall artifact became authorizing."
  );

  return {
    coreVerification,
    deniedMulticalls,
    managerRead,
    selectorManifest,
    sourceReproduction,
    sourceSupplement,
    summary,
    transcript
  };
}

function retainedInputDigests() {
  return Object.entries(RETAINED_PATHS)
    .map(([name, relativePath]) => ({
      name,
      path: relativePath,
      sha256: sha256Bytes(readRepositoryFile(relativePath))
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function verifyRetainedBindings(context, linkedRuntime) {
  const { coreVerification, managerRead, sourceReproduction, sourceSupplement, summary } = context;
  invariant(
    sourceSupplement.localReproduction.managerBuildInfoSha256 ===
      REVIEW_CONSTANTS.buildInfoSha256.slice(2),
    "Retained manager build-info binding drifted."
  );
  invariant(
    sourceSupplement.compilerInputDigests.compilerInputSha256 ===
      REVIEW_CONSTANTS.compilerInputSha256.slice(2),
    "Retained compiler input binding drifted."
  );
  invariant(
    sourceSupplement.compilerInputDigests.compilerSettingsSha256 ===
      REVIEW_CONSTANTS.compilerSettingsSha256.slice(2),
    "Retained compiler settings binding drifted."
  );
  invariant(
    sourceReproduction.managerBuild.immutableLinkedRuntimeKeccak256 ===
      REVIEW_CONSTANTS.linkedRuntimeKeccak256.slice(2),
    "Retained source reproduction runtime drifted."
  );
  invariant(
    managerRead.result.normalizedResult.toLowerCase() === `0x${linkedRuntime}`,
    "Linked manager runtime does not equal both retained provider payloads."
  );
  invariant(
    summary.contracts.positionManager.runtimeKeccak256 === REVIEW_CONSTANTS.linkedRuntimeKeccak256,
    "Readiness manager runtime digest drifted."
  );
  invariant(
    coreVerification.contracts.factory.observedRuntimeKeccak256 ===
      summary.contracts.factory.runtimeKeccak256,
    "Factory runtime evidence disagrees."
  );
  invariant(
    coreVerification.contracts.poolDeployer.observedRuntimeKeccak256 ===
      summary.contracts.poolDeployer.runtimeKeccak256,
    "Pool-deployer runtime evidence disagrees."
  );
}

function buildPublicationBoundary() {
  return {
    activationEligible: false,
    authenticatedIndependentReviewer: null,
    eligibleAsDomainEvidenceReference: false,
    independentRetrieval: null,
    publicContentAddressedLocator: null,
    status: "blocked_local_bytes_not_published_or_independently_refetched",
    unmetRequirements: [
      "Publish the exact canonical artifact bytes at a stable content-addressed HTTPS or IPFS locator.",
      "Independently re-fetch those public bytes without redirects and bind the whole-file SHA-256.",
      "Retain an authenticated independent reviewer identity and approval bound to this exact direct-only scope."
    ]
  };
}

export function buildEvidence(sourceRootInput) {
  const sourceRoot = path.resolve(sourceRootInput);
  const build = validateBuild(sourceRoot);
  const { definitions, variables } = collectAstDefinitions(build.buildInfo);
  const definition = findInitializerDefinition(build.buildInfo);
  const sourceAnalysis = analyzeInitializerSource(
    build.buildInfo,
    definition,
    definitions,
    variables
  );
  const bytecodeAnalysis = analyzeBytecodePath(build.contractOutput, definition);
  const linked = immutableLinkedRuntime(build.contractOutput, variables);
  const linkedRuntimeKeccak256 = keccak256Bytes(Buffer.from(linked.runtime, "hex"));
  invariant(
    linkedRuntimeKeccak256 === REVIEW_CONSTANTS.linkedRuntimeKeccak256,
    "Immutable-linked runtime digest drifted."
  );
  invariant(
    linked.runtime.length / 2 === REVIEW_CONSTANTS.runtimeByteLength,
    "Runtime size drifted."
  );
  invariant(
    keccak256Bytes(Buffer.from(build.contractOutput.evm.deployedBytecode.object, "hex")) ===
      REVIEW_CONSTANTS.runtimeTemplateKeccak256,
    "Runtime template digest drifted."
  );
  invariant(
    keccak256Bytes(Buffer.from(REVIEW_CONSTANTS.signature, "utf8")).slice(0, 10) ===
      REVIEW_CONSTANTS.selector,
    "Locally derived initializer selector drifted."
  );
  invariant(
    sha256Bytes(readRepositoryFile(RETAINED_PATHS.selectorReviewLibrary)) ===
      REVIEW_CONSTANTS.selectorReviewDependencySha256,
    "Pinned selector-review Keccak dependency drifted."
  );

  const compiledSourceBindings = verifyGitSource(sourceRoot, build.buildInfo);
  const coreWriteFunctions = inspectCoreWriteFunctions(sourceRoot);
  const retained = loadRetainedContext();
  verifyRetainedBindings(retained, linked.runtime);

  const evidence = {
    schemaVersion: 1,
    artifactType: "pancake_v3_initializer_direct_selector_local_review",
    analyzedAt: REVIEW_CONSTANTS.analyzedAt,
    claimStatus:
      "local_control_path_review_complete_public_attestation_and_fresh_preflight_missing",
    activationEligible: false,
    decision: {
      authorizesTransaction: false,
      authorizesSignature: false,
      authorizesWalletUse: false,
      authorizesMulticall: false,
      directSelectorLocallyReviewed: true,
      publicAttestationReady: false,
      executionReady: false,
      status: "blocked"
    },
    target: {
      chain: "BNB Smart Chain Testnet",
      chainId: REVIEW_CONSTANTS.chainId,
      address: REVIEW_CONSTANTS.managerAddress,
      contract: "NonfungiblePositionManager",
      signature: REVIEW_CONSTANTS.signature,
      selector: REVIEW_CONSTANTS.selector,
      requiredNativeValueBaseUnits: "0"
    },
    bindings: {
      source: {
        repository: REVIEW_CONSTANTS.repository,
        commit: REVIEW_CONSTANTS.sourceCommit,
        gitArchiveSha256: REVIEW_CONSTANTS.sourceTreeSha256,
        compiledSourceBindings,
        managerArtifactSha256: REVIEW_CONSTANTS.managerArtifactSha256,
        buildInfoSha256: REVIEW_CONSTANTS.buildInfoSha256
      },
      compiler: {
        name: "solc",
        longVersion: REVIEW_CONSTANTS.compilerLongVersion,
        compilerInputSha256: REVIEW_CONSTANTS.compilerInputSha256,
        compilerSettingsSha256: REVIEW_CONSTANTS.compilerSettingsSha256,
        evmVersion: build.buildInfo.input.settings.evmVersion,
        optimizer: build.buildInfo.input.settings.optimizer,
        metadata: build.buildInfo.input.settings.metadata
      },
      managerRuntime: {
        byteLength: REVIEW_CONSTANTS.runtimeByteLength,
        runtimeTemplateKeccak256: REVIEW_CONSTANTS.runtimeTemplateKeccak256,
        immutableLinkedRuntimeKeccak256: linkedRuntimeKeccak256,
        immutableReferences: linked.linked,
        exactRetainedRuntimeBytesEqual: true
      },
      historicalObservation: {
        source: RETAINED_PATHS.readinessTranscript,
        blockNumber: retained.summary.checkpoint.blockNumber,
        blockHash: retained.summary.checkpoint.blockHash,
        blockTimestampUtc: retained.summary.checkpoint.blockTimestampUtc,
        providerRoles: retained.managerRead.observedOnProviderRoles,
        providerAgreementVerified: retained.managerRead.providerAgreementVerified,
        freshness: "historical_snapshot_requires_complete_refresh_before_any_confirmation",
        managerProxySlotsZeroAtCheckpoint: Object.values(
          retained.summary.contracts.positionManager.proxySlotValues
        ).every((value) => /^0x0{64}$/u.test(value))
      },
      protocolImmutables: {
        factory: retained.summary.protocolBindings.positionManager.factory.toLowerCase(),
        poolDeployer: retained.summary.protocolBindings.positionManager.deployer.toLowerCase(),
        wrappedNative: retained.summary.protocolBindings.positionManager.wrappedNative.toLowerCase()
      },
      retainedInputs: retainedInputDigests()
    },
    selectorPath: {
      abi: {
        inputs: ["address", "address", "uint24", "uint160"],
        output: "address",
        payable: true,
        selectorDerivation: "first4(keccak256(utf8(canonical signature)))"
      },
      sourceAnalysis,
      bytecodeAnalysis,
      callGraph: {
        nodes: [
          "PositionManager.createAndInitializePoolIfNecessary",
          "Factory.getPool",
          "Factory.createPool",
          "PoolDeployer.deploy",
          "PancakeV3Pool.constructor",
          "Pool.slot0",
          "Pool.initialize"
        ],
        edges: [
          "PositionManager.createAndInitializePoolIfNecessary -> Factory.getPool",
          "PositionManager.createAndInitializePoolIfNecessary -> Factory.createPool [only when getPool is zero]",
          "Factory.createPool -> PoolDeployer.deploy [only when creation branch passes factory checks]",
          "PoolDeployer.deploy -> PancakeV3Pool.constructor [CREATE2]",
          "PositionManager.createAndInitializePoolIfNecessary -> Pool.initialize [new pool]",
          "PositionManager.createAndInitializePoolIfNecessary -> Pool.slot0 [existing pool]",
          "PositionManager.createAndInitializePoolIfNecessary -> Pool.initialize [existing but uninitialized pool]"
        ],
        coreWriteFunctions
      },
      pathSemantics: [
        "token0 must be strictly lower than token1 or the direct call reverts.",
        "The manager first reads factory.getPool(token0, token1, fee).",
        "If absent, the factory may create a CREATE2 pool through its pinned pool deployer, records both getPool directions, and the manager initializes the new pool.",
        "If a pool exists, the manager reads slot0 and initializes only when the existing sqrt price is zero.",
        "If an existing pool is already initialized, the requested sqrtPriceX96 is ignored and no re-price is enforced.",
        "The initializer has no deadline and no onchain block-time or block-height check."
      ]
    },
    directWriteScope: {
      targetChainId: REVIEW_CONSTANTS.chainId,
      targetAddress: REVIEW_CONSTANTS.managerAddress,
      allowedDirectSignatures: [REVIEW_CONSTANTS.signature],
      allowedDirectSelectors: [REVIEW_CONSTANTS.selector],
      exactNativeValueBaseUnits: "0",
      maxTopLevelCalls: 1,
      allUnlistedSelectorsDenied: true,
      nestedCalldataDenied: true,
      managerStorageWritesOnSourcePath: [],
      externalEffects: [
        {
          condition: "always",
          target: REVIEW_CONSTANTS.factoryAddress,
          signature: "getPool(address,address,uint24)",
          effect: "read_only"
        },
        {
          condition: "factory getPool returns zero",
          target: REVIEW_CONSTANTS.factoryAddress,
          signature: "createPool(address,address,uint24)",
          effect: "factory mappings plus CREATE2 deployment through the pinned pool deployer"
        },
        {
          condition: "factory returned or created pool",
          target: "dynamic_factory_authenticated_pool",
          signatures: ["slot0()", "initialize(uint160)"],
          effect:
            "read slot0; initialize pool slot0 and first oracle observation only when uninitialized"
        }
      ],
      requiredDynamicTargetValidation:
        "The pool address must equal the same-block factory getPool result and, on creation, the independently compiler-bound CREATE2 derivation before any receipt is accepted.",
      doesNotInclude: [
        "token approvals",
        "token transfers",
        "liquidity minting",
        "LP NFT creation",
        "position authority",
        "a market-price assertion",
        "a transaction envelope",
        "a signature or broadcast"
      ]
    },
    multicallAbsorptionBoundary: {
      decision: "deny_every_multicall_outer_selector_and_any_nested_initializer_calldata",
      reason:
        "The manager runtime contains the official self-DELEGATECALL multicall entrypoint; therefore an outer multicall could execute this initializer unless the outer selector and nested calldata are rejected before signing.",
      deniedOuterSelectors: DENIED_MULTICALL_SELECTORS,
      runtimeWideSelfDelegatecallPc: 10_522,
      initializerDirectSourceMappedDelegatecallPcs:
        bytecodeAnalysis.initializerMappedEffectInstructions
          .filter(({ opcode }) => opcode === "DELEGATECALL")
          .map(({ pc }) => pc),
      directOnlyPolicyAbsorbsNestedCall: false,
      retainedBoundaryArtifact: RETAINED_PATHS.deniedMulticalls,
      allUnlistedSelectorsDenied: true,
      nestedCalldataDenied: true
    },
    mutableDependencies: {
      observedAtHistoricalBlock: retained.summary.checkpoint.blockNumber,
      factory: {
        address: REVIEW_CONSTANTS.factoryAddress,
        runtimeKeccak256: retained.summary.contracts.factory.runtimeKeccak256,
        poolDeployer: retained.summary.protocolBindings.factory.poolDeployer.toLowerCase(),
        owner: retained.summary.protocolBindings.factory.owner.toLowerCase(),
        lmPoolDeployer: retained.summary.protocolBindings.factory.lmPoolDeployer.toLowerCase(),
        ownerCapabilities: retained.summary.mutableControls.factoryOwner.reviewedCapabilities,
        feeTierStateMutable: true
      },
      poolDeployer: {
        address: REVIEW_CONSTANTS.poolDeployerAddress,
        runtimeKeccak256: retained.summary.contracts.poolDeployer.runtimeKeccak256,
        factoryAddress: retained.summary.protocolBindings.poolDeployer.factoryAddress.toLowerCase(),
        deployCallerRestrictedToFactory: true,
        historicalSetterBoundary:
          "setFactoryAddress was unrestricted but one-shot; retained state shows it already bound to the expected factory. A fresh read is still required."
      },
      lmPoolDeployer: {
        address: retained.summary.mutableControls.lmPoolDeployer.address.toLowerCase(),
        sourceIdentityReviewedForThisArtifact: false,
        capability: retained.summary.mutableControls.lmPoolDeployer.reviewedCapability
      },
      candidatePool: {
        address: retained.summary.fee500Create2Candidate.candidateAddress.toLowerCase(),
        status: "historically_empty_counterfactual_address_not_a_reservation",
        runtimeSourceIdentityAvailableNow: false
      },
      risk: retained.summary.mutableControls.risk
    },
    publication: buildPublicationBoundary(),
    blockers: [
      {
        id: "public_content_addressed_initializer_attestation",
        status: "open",
        blocks: "pool_submission",
        resolution:
          "Publish and independently re-fetch these exact canonical bytes, then retain authenticated independent approval for this direct-only scope."
      },
      {
        id: "fresh_complete_exact_block_preflight",
        status: "open",
        blocks: "pool_submission",
        resolution:
          "Repeat the two-provider finalized manager/factory/deployer runtime, proxy, immutable, fee-tier, getPool, candidate-code, nonce, owner, LM and sender-state reads immediately before confirmation."
      },
      {
        id: "dynamic_pool_runtime_and_receipt_reconciliation",
        status: "open",
        blocks: "accepting_pool_creation",
        resolution:
          "After a separately approved transaction, require the exact PoolCreated log, factory getPool, CREATE2 address, deployed runtime/immutables, slot0, token ordering and receipt finality; reject any raced or differently initialized result."
      },
      {
        id: "bounded_execution_envelope_and_explicit_confirmation",
        status: "open",
        blocks: "pool_submission",
        resolution:
          "Separately bind sender, nonce, exact calldata, zero value, gas/fee/tBNB caps, short external broadcast window, one-shot state, replacement reconciliation and explicit user confirmation."
      }
    ],
    limitations: [
      "This is deterministic manual/static analysis support, not formal verification or exhaustive symbolic execution.",
      "Source-map intersection can include optimizer-shared instructions and does not alone prove every runtime transition.",
      "Core write effects are bounded to exact source-function hashes plus retained historical runtime evidence; this artifact does not claim a fresh deployed candidate pool.",
      "The retained exact-block observation is historical and cannot establish current state.",
      "A local repository artifact is not an eligible public HTTPS/IPFS attestation.",
      "No authenticated independent reviewer or public-byte retrieval is recorded."
    ],
    securityBoundary: {
      testnetOnly: true,
      networkReadPerformedByGenerator: false,
      environmentConfigurationRead: false,
      walletUsed: false,
      signerLoaded: false,
      privateKeyRead: false,
      signatureRequested: false,
      transactionConstructed: false,
      transactionBroadcast: false,
      onchainWritePerformed: false,
      secretIncluded: false
    },
    reproduction: {
      checkCommand:
        "node scripts/pancake-initializer-review/generate.mjs --source-root <clean-compiled-source-root> --check",
      writeCommand:
        "node scripts/pancake-initializer-review/generate.mjs --source-root <clean-compiled-source-root> --write",
      testCommand: "node --test scripts/pancake-initializer-review/review.test.mjs",
      prerequisites: [
        "Pinned PancakeSwap source checkout at ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57",
        "Existing compile-only Position Manager artifact and build-info matching the recorded digests",
        "Git and Node.js"
      ],
      writesOnlyFixedEvidencePath: REVIEW_CONSTANTS.artifactPath,
      acceptsCallerSelectedOutputPath: false,
      readsNetwork: false,
      readsEnvironmentConfiguration: false
    },
    tooling: currentToolingBinding()
  };
  return {
    ...evidence,
    integrity: {
      canonicalization: "recursive_lexicographic_object_keys_json_stringify_v1",
      canonicalBodySha256: sha256Canonical(evidence)
    }
  };
}

export function verifyEvidenceObject(evidence) {
  assertExactKeys(evidence, TOP_LEVEL_KEYS, "initializer review");
  invariant(evidence.schemaVersion === 1, "Unexpected initializer-review schema version.");
  invariant(
    evidence.artifactType === "pancake_v3_initializer_direct_selector_local_review",
    "Unexpected initializer-review artifact type."
  );
  invariant(evidence.analyzedAt === REVIEW_CONSTANTS.analyzedAt, "Analysis timestamp drifted.");
  invariant(
    evidence.claimStatus ===
      "local_control_path_review_complete_public_attestation_and_fresh_preflight_missing",
    "Initializer claim status drifted."
  );
  invariant(
    evidence.activationEligible === false,
    "Initializer review became activation eligible."
  );

  assertExactKeys(evidence.bindings, BINDING_KEYS, "bindings");
  assertExactKeys(evidence.selectorPath, SELECTOR_PATH_KEYS, "selectorPath");
  assertExactKeys(evidence.integrity, ["canonicalBodySha256", "canonicalization"], "integrity");

  const pinnedSections = [
    ["target", evidence.target],
    ["decision", evidence.decision],
    ["publication", evidence.publication],
    ["securityBoundary", evidence.securityBoundary],
    ["directWriteScope", evidence.directWriteScope],
    ["callGraph", evidence.selectorPath.callGraph],
    ["sourceBinding", evidence.bindings.source],
    ["compilerBinding", evidence.bindings.compiler],
    ["managerRuntime", evidence.bindings.managerRuntime],
    ["historicalObservation", evidence.bindings.historicalObservation],
    ["protocolImmutables", evidence.bindings.protocolImmutables],
    ["retainedInputs", evidence.bindings.retainedInputs],
    ["selectorAbi", evidence.selectorPath.abi],
    ["sourceAnalysis", evidence.selectorPath.sourceAnalysis],
    ["bytecodeAnalysis", evidence.selectorPath.bytecodeAnalysis],
    ["pathSemantics", evidence.selectorPath.pathSemantics],
    ["multicallAbsorptionBoundary", evidence.multicallAbsorptionBoundary],
    ["mutableDependencies", evidence.mutableDependencies],
    ["blockers", evidence.blockers],
    ["limitations", evidence.limitations],
    ["reproduction", evidence.reproduction]
  ];
  for (const [name, value] of pinnedSections) assertPinnedSection(name, value);

  invariant(
    canonicalCompact(evidence.tooling) === canonicalCompact(currentToolingBinding()),
    "Tooling provenance binding drifted."
  );
  invariant(
    evidence.integrity.canonicalization === "recursive_lexicographic_object_keys_json_stringify_v1",
    "Integrity canonicalization drifted."
  );
  const { integrity, ...body } = evidence;
  invariant(
    integrity.canonicalBodySha256 === sha256Canonical(body),
    "Initializer-review canonical body digest mismatch."
  );
  return true;
}

export function verifyCommittedEvidence() {
  const evidence = readRepositoryJson(REVIEW_CONSTANTS.artifactPath);
  verifyEvidenceObject(evidence);
  const currentInputs = retainedInputDigests();
  invariant(
    canonicalCompact(evidence.bindings.retainedInputs) === canonicalCompact(currentInputs),
    "Retained input digest inventory drifted."
  );
  invariant(
    evidence.tooling.reviewLibrarySha256 ===
      sha256Bytes(readRepositoryFile("scripts/pancake-initializer-review/review-lib.mjs")),
    "Initializer review library digest drifted."
  );
  invariant(
    evidence.tooling.generatorSha256 ===
      sha256Bytes(readRepositoryFile("scripts/pancake-initializer-review/generate.mjs")),
    "Initializer generator digest drifted."
  );
  const context = loadRetainedContext();
  invariant(
    evidence.bindings.historicalObservation.blockHash === context.summary.checkpoint.blockHash,
    "Committed checkpoint binding drifted."
  );
  invariant(
    evidence.bindings.historicalObservation.blockNumber === context.summary.checkpoint.blockNumber,
    "Committed checkpoint height drifted."
  );
  invariant(
    evidence.bindings.managerRuntime.immutableLinkedRuntimeKeccak256 ===
      context.managerRead.result.runtimeKeccak256,
    "Committed manager runtime no longer matches transcript."
  );
  const initializerBinding = evidence.bindings.source.compiledSourceBindings.find(
    ({ compilerPath }) => compilerPath === REVIEW_CONSTANTS.initializerSourcePath
  );
  invariant(initializerBinding !== undefined, "Committed initializer source binding missing.");
  invariant(
    initializerBinding.sha256 === sha256Bytes(readRepositoryFile(RETAINED_PATHS.initializerVendor)),
    "Vendored initializer source drifted."
  );
  const factoryWriteFunction = evidence.selectorPath.callGraph.coreWriteFunctions.find(
    ({ contract }) => contract === "PancakeV3Factory"
  );
  invariant(factoryWriteFunction !== undefined, "Committed factory write-scope binding missing.");
  invariant(
    factoryWriteFunction.sourceSha256 ===
      sha256Bytes(readRepositoryFile(RETAINED_PATHS.factoryVendor)),
    "Vendored factory source drifted."
  );
  return evidence;
}
