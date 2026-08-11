import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REVIEW_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

export const REVIEW_CONSTANTS = Object.freeze({
  analyzedAt: "2026-08-11T15:55:00.907Z",
  repository: "https://github.com/pancakeswap/pancake-v3-contracts.git",
  sourceCommit: "ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57",
  // This exact lowercase spelling is part of the canonical domain/integration
  // write-scope serialization. Address case drift changes its SHA-256.
  managerAddress: "0x427bf5b37357632377ecbec9de3626c71a5396c1",
  chainId: 97,
  sourceTreeSha256: "0xb3cd0b3fd4563287f587c2776eac78e5b5a4ad98f6c805a005df10727bee782d",
  managerArtifactSha256: "0x9e5bca807e38e9e8acadd81c5dec6668f847a7e3397d91b3afed74b066cfbb2a",
  compileOnlyConfigSha256: "0xceeccf77dc8340ca344ad99bf12f710cf864c02f99400beb88e247d4191c1f5b",
  localBuildInfoSha256: "0xff2166c707d60e451ff80e6096d9b2e792eb23a27d27964299ec203fb8d763b7",
  priorRetainedBuildInfoSha256:
    "0x72adeccd4f25257a89d95d3e0f1d8b9b0e5ab8400b2b828bab236b786ae2c7aa",
  compilerInputSha256: "0x086382b3301a745dae7d0b66878cd1c1a4433cf7b1d7725efc546511811b3c38",
  compilerSettingsSha256: "0xa1af16a691f74364a753be9855c4f0865f1fef27a515a65ee0a866c991a6c1a1",
  compilerLongVersion: "0.7.6+commit.7338295f",
  runtimeTemplateKeccak256: "0x91d390a2f85270716bdc52a7782842724fee537f3f8c4e282ce31b98eea7807b",
  linkedRuntimeKeccak256: "0xd86730989544d7a3ea034c8a322733683137cf70b0f49231fd88405eac6098d7",
  runtimeByteLength: 24_466,
  writeScopeSha256: "0x3a80eb853ccea37b7a1d04430a015d22941fd7a7cd2d8ab9d31b896fc74d5218",
  managerSourcePath: "contracts/NonfungiblePositionManager.sol",
  multicallSourcePath: "contracts/base/Multicall.sol",
  artifactRelativePath:
    "projects/v3-periphery/artifacts-proofera/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json",
  debugRelativePath:
    "projects/v3-periphery/artifacts-proofera/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.dbg.json"
});

export const DIRECT_CALLS = Object.freeze([
  Object.freeze({
    operation: "mint",
    signature:
      "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))",
    selector: "0x88316456"
  }),
  Object.freeze({
    operation: "increaseLiquidity",
    signature: "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))",
    selector: "0x219f5d17"
  }),
  Object.freeze({
    operation: "decreaseLiquidity",
    signature: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))",
    selector: "0x0c49ccbe"
  }),
  Object.freeze({
    operation: "collect",
    signature: "collect((uint256,address,uint128,uint128))",
    selector: "0xfc6f7865"
  })
]);

export const DENIED_MULTICALLS = Object.freeze([
  Object.freeze({
    signature: "multicall(bytes[])",
    selector: "0xac9650d8",
    classification: "observed_self_delegatecall_entrypoint"
  }),
  Object.freeze({
    signature: "multicall(uint256,bytes[])",
    selector: "0x5ae401dc",
    classification: "known_multicall_signature_defense_in_depth"
  }),
  Object.freeze({
    signature: "multicall(bytes32,bytes[])",
    selector: "0x1f0464d1",
    classification: "known_multicall_signature_defense_in_depth"
  })
]);

const DIRECT_WRITE_SCOPE = Object.freeze({
  schemaVersion: 1,
  targetChainId: 97,
  targetAddress: REVIEW_CONSTANTS.managerAddress,
  allowedDirectSignatures: [
    "collect((uint256,address,uint128,uint128))",
    "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))",
    "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))",
    "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))"
  ],
  deniedDispatcherSignatures: [
    "multicall(bytes[])",
    "multicall(bytes32,bytes[])",
    "multicall(uint256,bytes[])"
  ],
  allUnlistedSelectorsDenied: true,
  nestedCalldataDenied: true
});

const IMMUTABLE_VALUES = Object.freeze({
  _tokenDescriptor: "b099b459887bc759dbf0293e12d3dfcd0c456cff",
  nameHash: "c8147ae4d95e1ae5d91d5822a926bbc8b3167bc4efcba3aad25887e8d7e1ada0",
  versionHash: "c89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6",
  deployer: "41ff9aa7e16b8b1a8a8dc4f0efacd93d02d071c9",
  factory: "0bfbcf9fa4f9c56b0f40a671ad40e0805a091865",
  WETH9: "ae13d989dac2f0debff460ac112a837c89baa7cd"
});

const OP_NAMES = new Map([
  [0x00, "STOP"],
  [0x01, "ADD"],
  [0x02, "MUL"],
  [0x03, "SUB"],
  [0x04, "DIV"],
  [0x05, "SDIV"],
  [0x06, "MOD"],
  [0x07, "SMOD"],
  [0x08, "ADDMOD"],
  [0x09, "MULMOD"],
  [0x0a, "EXP"],
  [0x0b, "SIGNEXTEND"],
  [0x10, "LT"],
  [0x11, "GT"],
  [0x12, "SLT"],
  [0x13, "SGT"],
  [0x14, "EQ"],
  [0x15, "ISZERO"],
  [0x16, "AND"],
  [0x17, "OR"],
  [0x18, "XOR"],
  [0x19, "NOT"],
  [0x1a, "BYTE"],
  [0x1b, "SHL"],
  [0x1c, "SHR"],
  [0x1d, "SAR"],
  [0x20, "SHA3"],
  [0x30, "ADDRESS"],
  [0x31, "BALANCE"],
  [0x32, "ORIGIN"],
  [0x33, "CALLER"],
  [0x34, "CALLVALUE"],
  [0x35, "CALLDATALOAD"],
  [0x36, "CALLDATASIZE"],
  [0x37, "CALLDATACOPY"],
  [0x38, "CODESIZE"],
  [0x39, "CODECOPY"],
  [0x3a, "GASPRICE"],
  [0x3b, "EXTCODESIZE"],
  [0x3c, "EXTCODECOPY"],
  [0x3d, "RETURNDATASIZE"],
  [0x3e, "RETURNDATACOPY"],
  [0x3f, "EXTCODEHASH"],
  [0x40, "BLOCKHASH"],
  [0x41, "COINBASE"],
  [0x42, "TIMESTAMP"],
  [0x43, "NUMBER"],
  [0x44, "DIFFICULTY"],
  [0x45, "GASLIMIT"],
  [0x46, "CHAINID"],
  [0x47, "SELFBALANCE"],
  [0x48, "BASEFEE"],
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

const EFFECT_OPS = new Set([
  "CALL",
  "CALLCODE",
  "DELEGATECALL",
  "STATICCALL",
  "CREATE",
  "CREATE2",
  "SELFDESTRUCT"
]);
const CONTROL_OPS = new Set(["JUMP", "JUMPI", ...EFFECT_OPS]);
const BRANCH_NODE_TYPES = new Set([
  "IfStatement",
  "ForStatement",
  "WhileStatement",
  "DoWhileStatement",
  "Conditional"
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

export function sha256Canonical(value) {
  return sha256Bytes(Buffer.from(canonicalCompact(value), "utf8"));
}

const MASK_64 = (1n << 64n) - 1n;
const KECCAK_ROTATIONS = Object.freeze([
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14
]);
const KECCAK_ROUND_CONSTANTS = Object.freeze([
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n
]);

function rotateLeft64(value, amount) {
  if (amount === 0) return value & MASK_64;
  const shift = BigInt(amount);
  return ((value << shift) | (value >> (64n - shift))) & MASK_64;
}

function keccakPermutation(state) {
  for (const roundConstant of KECCAK_ROUND_CONSTANTS) {
    const column = Array.from({ length: 5 }, (_, x) =>
      [0, 1, 2, 3, 4].reduce((value, y) => value ^ state[x + 5 * y], 0n)
    );
    const delta = Array.from(
      { length: 5 },
      (_, x) => column[(x + 4) % 5] ^ rotateLeft64(column[(x + 1) % 5], 1)
    );
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) state[x + 5 * y] ^= delta[x];
    }

    const moved = Array(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        moved[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLeft64(
          state[x + 5 * y],
          KECCAK_ROTATIONS[x + 5 * y]
        );
      }
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] =
          moved[x + 5 * y] ^ (~moved[((x + 1) % 5) + 5 * y] & moved[((x + 2) % 5) + 5 * y]);
      }
    }
    state[0] ^= roundConstant;
  }
}

export function keccak256Bytes(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const rate = 136;
  const paddingLength = rate - (bytes.length % rate);
  const padded = Buffer.concat([bytes, Buffer.alloc(paddingLength)]);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  const state = Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let lane = 0; lane < rate / 8; lane += 1) {
      let value = 0n;
      for (let byte = 0; byte < 8; byte += 1) {
        value |= BigInt(padded[offset + lane * 8 + byte]) << BigInt(byte * 8);
      }
      state[lane] ^= value;
    }
    keccakPermutation(state);
  }
  const output = Buffer.alloc(32);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number((state[Math.floor(index / 8)] >> BigInt((index % 8) * 8)) & 0xffn);
  }
  return `0x${output.toString("hex")}`;
}

function parseSourceSpan(raw) {
  const [offset, length, sourceId] = raw.split(":").map(Number);
  invariant(
    Number.isInteger(offset) && Number.isInteger(length) && Number.isInteger(sourceId),
    `Invalid Solidity source span: ${raw}`
  );
  return { offset, length, sourceId };
}

function lineNumber(source, byteOffset) {
  return Buffer.from(source, "utf8").subarray(0, byteOffset).toString("utf8").split("\n").length;
}

function sourceSlice(source, span) {
  return Buffer.from(source, "utf8").subarray(span.offset, span.offset + span.length);
}

function walkAst(value, callback, context = {}) {
  if (value === null || typeof value !== "object") return;
  const nextContext =
    value.nodeType === "ContractDefinition"
      ? { ...context, contractName: value.name, contractKind: value.contractKind }
      : context;
  callback(value, nextContext);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) walkAst(item, callback, nextContext);
    } else if (child !== null && typeof child === "object") {
      walkAst(child, callback, nextContext);
    }
  }
}

function collectDefinitions(buildInfo) {
  const definitions = new Map();
  const variables = new Map();
  for (const [sourcePath, sourceOutput] of Object.entries(buildInfo.output.sources)) {
    walkAst(sourceOutput.ast, (node, context) => {
      if (
        (node.nodeType === "FunctionDefinition" || node.nodeType === "ModifierDefinition") &&
        Number.isInteger(node.id)
      ) {
        definitions.set(node.id, {
          contractKind: context.contractKind ?? null,
          contractName: context.contractName ?? null,
          id: node.id,
          kind: node.nodeType,
          name: node.name,
          node,
          sourcePath,
          span: parseSourceSpan(node.src),
          visibility: node.visibility ?? null
        });
      }
      if (node.nodeType === "VariableDeclaration" && Number.isInteger(node.id)) {
        variables.set(node.id, {
          id: node.id,
          name: node.name,
          sourcePath,
          span: parseSourceSpan(node.src)
        });
      }
    });
  }
  return { definitions, variables };
}

function classifyCall(call, target) {
  if (call.nodeType === "ModifierInvocation") return "modifier";
  const expression = call.expression;
  if (expression?.nodeType === "MemberAccess") {
    const receiverType = expression.expression?.typeDescriptions?.typeIdentifier ?? "";
    if (
      receiverType.startsWith("t_contract") &&
      (target.visibility === "external" || target.visibility === "public")
    ) {
      return "external_contract_call";
    }
    if (target.contractKind === "library") return "internal_library_call";
  }
  return "internal_definition_call";
}

function scanDefinition(definition, definitions, inputSources) {
  const calls = [];
  const branches = [];
  const lowLevelCalls = [];
  const source = inputSources[definition.sourcePath].content;
  const roots = [definition.node.body, ...(definition.node.modifiers ?? [])];
  for (const root of roots) {
    walkAst(root, (node) => {
      if (BRANCH_NODE_TYPES.has(node.nodeType)) {
        const span = parseSourceSpan(node.src);
        branches.push({
          kind: node.nodeType,
          line: lineNumber(source, span.offset),
          nodeId: node.id,
          sourcePath: definition.sourcePath,
          span,
          sourceSliceSha256: sha256Bytes(sourceSlice(source, span))
        });
      }
      if (node.nodeType === "FunctionCall") {
        const expression = node.expression;
        const memberName = expression?.nodeType === "MemberAccess" ? expression.memberName : null;
        if (["call", "callcode", "delegatecall", "send", "staticcall"].includes(memberName)) {
          const span = parseSourceSpan(node.src);
          lowLevelCalls.push({
            callKind: memberName,
            line: lineNumber(source, span.offset),
            nodeId: node.id,
            sourcePath: definition.sourcePath,
            span,
            sourceSliceSha256: sha256Bytes(sourceSlice(source, span))
          });
        }
        const referencedId = expression?.referencedDeclaration;
        if (Number.isInteger(referencedId) && definitions.has(referencedId)) {
          const target = definitions.get(referencedId);
          const span = parseSourceSpan(node.src);
          calls.push({
            callKind: classifyCall(node, target),
            callSite: {
              line: lineNumber(source, span.offset),
              sourcePath: definition.sourcePath,
              span
            },
            fromDefinitionId: definition.id,
            toDefinitionId: referencedId
          });
        }
      }
      if (node.nodeType === "ModifierInvocation") {
        const referencedId = node.modifierName?.referencedDeclaration;
        if (Number.isInteger(referencedId) && definitions.has(referencedId)) {
          const span = parseSourceSpan(node.src);
          calls.push({
            callKind: "modifier",
            callSite: {
              line: lineNumber(source, span.offset),
              sourcePath: definition.sourcePath,
              span
            },
            fromDefinitionId: definition.id,
            toDefinitionId: referencedId
          });
        }
      }
    });
  }
  return { branches, calls, lowLevelCalls };
}

function definitionLabel(definition) {
  return `${definition.sourcePath}:${definition.contractName}.${definition.name}#${definition.id}`;
}

function collectSourcePath(rootDefinitions, definitions, inputSources) {
  const reachable = new Map();
  const queue = [...rootDefinitions];
  const calls = [];
  const branches = [];
  const lowLevelCalls = [];
  while (queue.length > 0) {
    const definition = queue.shift();
    if (reachable.has(definition.id)) continue;
    reachable.set(definition.id, definition);
    const scanned = scanDefinition(definition, definitions, inputSources);
    calls.push(...scanned.calls);
    branches.push(...scanned.branches);
    lowLevelCalls.push(...scanned.lowLevelCalls);
    for (const call of scanned.calls) {
      if (call.callKind !== "external_contract_call")
        queue.push(definitions.get(call.toDefinitionId));
    }
  }

  const publicDefinitions = [...reachable.values()]
    .map((definition) => {
      const source = inputSources[definition.sourcePath].content;
      return {
        contract: definition.contractName,
        definitionId: definition.id,
        kind: definition.kind,
        line: lineNumber(source, definition.span.offset),
        name: definition.name,
        sourcePath: definition.sourcePath,
        sourceSliceSha256: sha256Bytes(sourceSlice(source, definition.span)),
        span: definition.span,
        visibility: definition.visibility
      };
    })
    .sort((left, right) => left.definitionId - right.definitionId);

  const publicCalls = calls
    .map((call) => ({
      callKind: call.callKind,
      callSite: call.callSite,
      from: definitionLabel(definitions.get(call.fromDefinitionId)),
      to: definitionLabel(definitions.get(call.toDefinitionId))
    }))
    .sort((left, right) =>
      `${left.callSite.sourcePath}:${left.callSite.span.offset}:${left.to}`.localeCompare(
        `${right.callSite.sourcePath}:${right.callSite.span.offset}:${right.to}`
      )
    );

  const reviewedPaths = [...new Set(publicDefinitions.map(({ sourcePath }) => sourcePath))].sort();
  const reviewedSourceFiles = reviewedPaths.map((sourcePath) => ({
    byteLength: Buffer.byteLength(inputSources[sourcePath].content, "utf8"),
    contentSha256: sha256Bytes(Buffer.from(inputSources[sourcePath].content, "utf8")),
    sourcePath
  }));

  return {
    branchNodes: branches.sort((left, right) =>
      `${left.sourcePath}:${left.span.offset}:${left.nodeId}`.localeCompare(
        `${right.sourcePath}:${right.span.offset}:${right.nodeId}`
      )
    ),
    callEdges: publicCalls,
    lowLevelCallSites: lowLevelCalls.sort((left, right) =>
      `${left.sourcePath}:${left.span.offset}:${left.nodeId}`.localeCompare(
        `${right.sourcePath}:${right.span.offset}:${right.nodeId}`
      )
    ),
    reachableDefinitions: publicDefinitions,
    reachableIds: new Set(reachable.keys()),
    reviewedSourceFiles
  };
}

function disassemble(hex) {
  invariant(
    /^[0-9a-f]+$/iu.test(hex) && hex.length % 2 === 0,
    "Runtime bytecode is not plain hex."
  );
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
              : (OP_NAMES.get(opcode) ?? `OP_${opcode.toString(16).padStart(2, "0")}`);
    instructions.push({
      data: pushLength === 0 ? null : bytes.subarray(pc + 1, pc + 1 + pushLength).toString("hex"),
      index: instructions.length,
      name,
      opcode,
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
      const rawField = fields[index];
      if (rawField === undefined || rawField === "") return value;
      return index === 3 ? rawField : Number(rawField);
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
  invariant(
    entries.length > 0 && entries.length <= instructionCount,
    `Invalid source-map/instruction counts: ${entries.length} versus ${instructionCount}.`
  );
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
  invariant(
    start >= 0 && instructions[start].name === "JUMPDEST",
    `No wrapper JUMPDEST at ${destinationPc}.`
  );
  const firstJumpRelative = instructions
    .slice(start + 1, start + 16)
    .findIndex(({ name }) => name === "JUMP");
  invariant(firstJumpRelative >= 0, `No ABI-decoder jump from wrapper ${destinationPc}.`);
  const firstJumpIndex = start + 1 + firstJumpRelative;
  const decoderPush = instructions[firstJumpIndex - 1];
  invariant(
    decoderPush.name.startsWith("PUSH"),
    `No decoder destination before wrapper jump ${destinationPc}.`
  );
  const resumeIndex = firstJumpIndex + 1;
  invariant(
    instructions[resumeIndex].name === "JUMPDEST",
    `No decoder return label for wrapper ${destinationPc}.`
  );
  const bodyPush = instructions[resumeIndex + 1];
  const bodyJump = instructions[resumeIndex + 2];
  invariant(
    bodyPush.name.startsWith("PUSH") && bodyJump.name === "JUMP",
    `No body jump for wrapper ${destinationPc}.`
  );
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

function mappedBytecodePath(instructions, sourceMap, reachableDefinitions, sourcePathById) {
  const rangesBySource = new Map();
  for (const definition of reachableDefinitions) {
    if (!rangesBySource.has(definition.sourcePath)) rangesBySource.set(definition.sourcePath, []);
    rangesBySource.get(definition.sourcePath).push(definition.span);
  }
  const mappedIndexes = new Set();
  const records = [];
  for (let index = 0; index < sourceMap.length; index += 1) {
    const mapping = sourceMap[index];
    const sourcePath = sourcePathById.get(mapping.sourceId);
    if (sourcePath === undefined || !rangesBySource.has(sourcePath)) continue;
    const inside = rangesBySource
      .get(sourcePath)
      .some((span) => mapping.offset >= span.offset && mapping.offset < span.offset + span.length);
    if (!inside) continue;
    mappedIndexes.add(index);
    records.push({
      jump: mapping.jump,
      length: mapping.length,
      modifierDepth: mapping.modifierDepth,
      offset: mapping.offset,
      opcode: instructions[index].name,
      pc: instructions[index].pc,
      sourcePath
    });
  }
  const controls = records.filter(({ opcode }) => CONTROL_OPS.has(opcode));
  return {
    controlFlowInstructions: controls,
    effectInstructions: controls.filter(({ opcode }) => EFFECT_OPS.has(opcode)),
    mappedInstructionCount: records.length,
    mappedInstructionSetSha256: sha256Canonical(records),
    mappedPcRanges: compressMappedInstructions(instructions, mappedIndexes),
    records
  };
}

function findRoot(definitions, sourcePath, name, kind = "FunctionDefinition") {
  const matches = [...definitions.values()].filter(
    (definition) =>
      definition.sourcePath === sourcePath && definition.name === name && definition.kind === kind
  );
  invariant(
    matches.length === 1,
    `Expected exactly one ${sourcePath}:${name}, found ${matches.length}.`
  );
  return matches[0];
}

function immutableLinkedRuntime(buildInfo, contractOutput, variables) {
  let runtime = contractOutput.evm.deployedBytecode.object.toLowerCase();
  const references = contractOutput.evm.deployedBytecode.immutableReferences;
  const linked = [];
  for (const [idText, locations] of Object.entries(references)) {
    const id = Number(idText);
    const variable = variables.get(id);
    invariant(variable !== undefined, `Unknown immutable AST id ${id}.`);
    const rawValue = IMMUTABLE_VALUES[variable.name];
    invariant(rawValue !== undefined, `No pinned value for immutable ${variable.name}.`);
    const value = rawValue.padStart(64, "0");
    invariant(
      value.length === 64 && /^[0-9a-f]+$/u.test(value),
      `Invalid immutable ${variable.name}.`
    );
    for (const location of locations) {
      invariant(location.length === 32, `Unexpected immutable width for ${variable.name}.`);
      const start = location.start * 2;
      const end = start + location.length * 2;
      invariant(
        /^0+$/u.test(runtime.slice(start, end)),
        `Immutable template slot ${variable.name} is not zero.`
      );
      runtime = `${runtime.slice(0, start)}${value}${runtime.slice(end)}`;
      linked.push({
        astId: id,
        byteLength: location.length,
        byteOffset: location.start,
        name: variable.name,
        value: `0x${value}`
      });
    }
  }
  return { linked: linked.sort((left, right) => left.byteOffset - right.byteOffset), runtime };
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/gu, "\n");
}

function verifyGitSource(sourceRoot, sourcePaths, inputSources) {
  const commit = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true
  }).trim();
  invariant(
    commit === REVIEW_CONSTANTS.sourceCommit,
    `Source checkout is ${commit}; expected ${REVIEW_CONSTANTS.sourceCommit}.`
  );
  const archive = execFileSync(
    "git",
    ["-C", sourceRoot, "archive", "--format=tar", REVIEW_CONSTANTS.sourceCommit],
    { encoding: null, maxBuffer: 32 * 1024 * 1024, windowsHide: true }
  );
  invariant(
    sha256Bytes(archive) === REVIEW_CONSTANTS.sourceTreeSha256,
    "git archive source-tree digest drifted."
  );
  for (const sourcePath of sourcePaths) {
    const repositoryPath = `projects/v3-periphery/${sourcePath}`;
    const committed = execFileSync(
      "git",
      ["-C", sourceRoot, "show", `${REVIEW_CONSTANTS.sourceCommit}:${repositoryPath}`],
      { encoding: null, maxBuffer: 4 * 1024 * 1024, windowsHide: true }
    );
    const working = readFileSync(path.join(sourceRoot, repositoryPath));
    const committedText = normalizeLineEndings(committed.toString("utf8"));
    invariant(
      committedText === normalizeLineEndings(working.toString("utf8")),
      `Reviewed source differs from the pinned commit beyond line endings: ${repositoryPath}.`
    );
    invariant(
      committedText === normalizeLineEndings(inputSources[sourcePath].content),
      `Compiled source differs from the pinned commit beyond line endings: ${sourcePath}.`
    );
  }
}

function publicationBoundary(localPath) {
  return {
    eligibleAsDomainEvidenceReference: false,
    localRepositoryPath: localPath,
    publicContentAddressedLocator: null,
    status: "local_artifact_not_published_or_independently_refetched",
    unmetRequirements: [
      "publish these exact canonical bytes at a stable HTTPS or IPFS content-addressed locator",
      "re-fetch the public bytes independently and verify the whole-file SHA-256",
      "obtain authenticated independent reviewer approval bound to the exact write scope"
    ]
  };
}

function commonBindings() {
  return {
    chainId: REVIEW_CONSTANTS.chainId,
    compileOnlyConfigSha256: REVIEW_CONSTANTS.compileOnlyConfigSha256,
    compilerInputSha256: REVIEW_CONSTANTS.compilerInputSha256,
    compilerLongVersion: REVIEW_CONSTANTS.compilerLongVersion,
    compilerOutputArtifactSha256: REVIEW_CONSTANTS.managerArtifactSha256,
    compilerSettingsSha256: REVIEW_CONSTANTS.compilerSettingsSha256,
    localBuildInfoSha256: REVIEW_CONSTANTS.localBuildInfoSha256,
    managerAddress: REVIEW_CONSTANTS.managerAddress,
    managerRuntimeCodeHash: REVIEW_CONSTANTS.linkedRuntimeKeccak256,
    managerRuntimeLength: REVIEW_CONSTANTS.runtimeByteLength,
    sourceCommit: REVIEW_CONSTANTS.sourceCommit,
    sourceTreeSha256: REVIEW_CONSTANTS.sourceTreeSha256,
    writeScopeSha256: REVIEW_CONSTANTS.writeScopeSha256
  };
}

function operationFindings(operation) {
  const common = {
    arbitraryCalldataDispatcher: "not_referenced_by_manager_local_source_path",
    delegatecall: "not_mapped_to_manager_local_source_path",
    externalContractCode: "separate_pool_and_token_review_required",
    formalProof: false
  };
  if (operation === "mint") {
    return {
      ...common,
      authorization: "no_existing_position_authorization_required_new_nft_recipient_is_calldata",
      callbackContinuation:
        "canonical_pool_mint_calls_pancakeV3MintCallback_then_token_transferFrom",
      decisionCriticalParameters: [
        "token0",
        "token1",
        "fee",
        "tickLower",
        "tickUpper",
        "amount0Desired",
        "amount1Desired",
        "amount0Min",
        "amount1Min",
        "recipient",
        "deadline"
      ]
    };
  }
  if (operation === "increaseLiquidity") {
    return {
      ...common,
      authorization: "no_position_owner_modifier_funder_is_callback_payer",
      callbackContinuation:
        "canonical_pool_mint_calls_pancakeV3MintCallback_then_token_transferFrom",
      decisionCriticalParameters: [
        "tokenId",
        "amount0Desired",
        "amount1Desired",
        "amount0Min",
        "amount1Min",
        "deadline"
      ]
    };
  }
  if (operation === "decreaseLiquidity") {
    return {
      ...common,
      authorization: "isAuthorizedForToken_modifier_and_deadline_check",
      callbackContinuation: "none",
      decisionCriticalParameters: ["tokenId", "liquidity", "amount0Min", "amount1Min", "deadline"]
    };
  }
  return {
    ...common,
    authorization: "isAuthorizedForToken_modifier",
    callbackContinuation: "none",
    decisionCriticalParameters: ["tokenId", "recipient", "amount0Max", "amount1Max"]
  };
}

function makeDirectArtifact(call, context) {
  const callback = ["mint", "increaseLiquidity"].includes(call.operation)
    ? findRoot(
        context.definitions,
        "contracts/base/LiquidityManagement.sol",
        "pancakeV3MintCallback"
      )
    : null;
  const directRoot = findRoot(
    context.definitions,
    REVIEW_CONSTANTS.managerSourcePath,
    call.operation
  );
  const roots = callback === null ? [directRoot] : [directRoot, callback];
  const source = collectSourcePath(roots, context.definitions, context.inputSources);
  const bytecode = mappedBytecodePath(
    context.instructions,
    context.sourceMap,
    source.reachableDefinitions,
    context.sourcePathById
  );
  const dispatcher = context.dispatcher.find(({ selector }) => selector === call.selector);
  invariant(dispatcher !== undefined, `Compiled dispatcher has no ${call.selector}.`);
  const wrapper = wrapperDetails(context.instructions, dispatcher.destinationPc);
  const delegatecallPcs = bytecode.effectInstructions
    .filter(({ opcode }) => opcode === "DELEGATECALL")
    .map(({ pc }) => pc);
  invariant(delegatecallPcs.length === 0, `${call.operation} unexpectedly maps to DELEGATECALL.`);
  invariant(
    !source.reachableDefinitions.some(
      ({ sourcePath, name }) =>
        sourcePath === REVIEW_CONSTANTS.multicallSourcePath && name === "multicall"
    ),
    `${call.operation} unexpectedly reaches Multicall.multicall.`
  );

  const sourcePath = {
    analysisBoundary: "manager_source_plus_synchronous_manager_callback_continuation_only",
    branchInventory: {
      count: source.branchNodes.length,
      nodes: source.branchNodes,
      status: "manager_local_nodes_enumerated_external_contract_branches_out_of_scope"
    },
    callEdges: source.callEdges,
    callbackContinuation:
      callback === null
        ? null
        : {
            entryDefinition: definitionLabel(callback),
            reason: "IPancakeV3Pool.mint synchronously invokes pancakeV3MintCallback",
            separatelyReviewedExternalHopRequired: true
          },
    delegatecallSites: source.lowLevelCallSites.filter(
      ({ callKind }) => callKind === "delegatecall"
    ),
    directEntryDefinition: definitionLabel(directRoot),
    lowLevelCallSites: source.lowLevelCallSites,
    multicallDefinitionReachable: false,
    reachableDefinitions: source.reachableDefinitions,
    reviewedSourceFiles: source.reviewedSourceFiles
  };
  const bytecodePath = {
    analysisMethod:
      "solc_ast_reference_closure_plus_deployed_source_map_opcode_intersection_and_dispatcher_decode",
    dispatcher: {
      abiDecoderPc: wrapper.abiDecoderPc,
      bodyPc: wrapper.bodyPc,
      comparePc: dispatcher.comparePc,
      decoderReturnPc: wrapper.decoderReturnPc,
      jumpiPc: dispatcher.jumpiPc,
      selector: dispatcher.selector,
      wrapperPc: wrapper.wrapperPc
    },
    effectInstructions: bytecode.effectInstructions,
    forbiddenOpcodeFindings: {
      callcodePcsOnMappedPath: bytecode.effectInstructions
        .filter(({ opcode }) => opcode === "CALLCODE")
        .map(({ pc }) => pc),
      delegatecallPcsOnMappedPath: delegatecallPcs,
      selfdestructPcsOnMappedPath: bytecode.effectInstructions
        .filter(({ opcode }) => opcode === "SELFDESTRUCT")
        .map(({ pc }) => pc)
    },
    mappedControlFlowInstructions: bytecode.controlFlowInstructions,
    mappedInstructionCount: bytecode.mappedInstructionCount,
    mappedInstructionSetSha256: bytecode.mappedInstructionSetSha256,
    mappedPcRanges: bytecode.mappedPcRanges,
    sourceMapBoundary: context.sourceMapBoundary,
    runtimeWideDelegatecallPcs: context.runtimeWideDelegatecallPcs
  };
  const localPath = `evidence/development/pancake-v3-selector-paths/${call.operation}.json`;
  return {
    activationEligible: false,
    analyzedAt: REVIEW_CONSTANTS.analyzedAt,
    artifactType: "pancake_v3_direct_selector_path_local_review",
    bindings: commonBindings(),
    bytecodePath,
    claimStatus: "local_static_analysis_not_formal_proof_not_activation_ready",
    decision: "local_path_review_complete_public_evidence_and_external_dependencies_missing",
    digests: {
      bytecodePathSha256: sha256Canonical(bytecodePath),
      sourcePathSha256: sha256Canonical(sourcePath)
    },
    findings: operationFindings(call.operation),
    limitations: [
      "This is manual/static review automation, not formal verification or exhaustive symbolic execution.",
      "Source-map intersection can include optimizer-shared instructions and does not prove every runtime state transition.",
      "Pool and token implementations, callback-time token behavior, oracle state, position authority, and session-policy enforcement require separate exact evidence.",
      "The manager runtime binding is a locally reconstructed immutable-linked build; a fresh exact-block observation is still required.",
      "An earlier retained build-info SHA-256 differs from this local build-info container; its raw bytes are unavailable, so no byte-level cause or equality claim is invented.",
      "A local repository artifact is not an allowed public HTTPS/IPFS evidence locator."
    ],
    method: {
      assurance: "manual_static_analysis_not_formal_proof",
      name: "manual_static_source_and_bytecode_control_flow_review",
      version: "proofera-pancake-v3-selector-path-v1"
    },
    operation: call.operation,
    publication: publicationBoundary(localPath),
    schemaVersion: 1,
    selector: call.selector,
    signature: call.signature,
    sourcePath
  };
}

function makeMulticallArtifact(context) {
  const root = findRoot(context.definitions, REVIEW_CONSTANTS.multicallSourcePath, "multicall");
  const source = collectSourcePath([root], context.definitions, context.inputSources);
  const bytecode = mappedBytecodePath(
    context.instructions,
    context.sourceMap,
    source.reachableDefinitions,
    context.sourcePathById
  );
  const observed = DENIED_MULTICALLS[0];
  const entry = context.dispatcher.find(({ selector }) => selector === observed.selector);
  invariant(entry !== undefined, "Compiled dispatcher does not expose multicall(bytes[]). ");
  const wrapper = wrapperDetails(context.instructions, entry.destinationPc);
  const mappedDelegatecalls = bytecode.effectInstructions
    .filter(({ opcode }) => opcode === "DELEGATECALL")
    .map(({ pc, sourcePath, offset, length }) => ({ length, offset, pc, sourcePath }));
  invariant(
    mappedDelegatecalls.length === 1 && mappedDelegatecalls[0].pc === 10_522,
    `Expected only DELEGATECALL PC 10522, found ${JSON.stringify(mappedDelegatecalls)}.`
  );
  const denied = DENIED_MULTICALLS.map((definition) => {
    const dispatcher = context.dispatcher.find(({ selector }) => selector === definition.selector);
    const compilerSelector = context.methodIdentifiers[definition.signature];
    return {
      ...definition,
      currentRuntimeDispatcherEntry:
        dispatcher === undefined
          ? null
          : {
              comparePc: dispatcher.comparePc,
              destinationPc: dispatcher.destinationPc,
              jumpiPc: dispatcher.jumpiPc
            },
      currentRuntimeMethodIdentifierPresent: compilerSelector !== undefined,
      decision: "denied",
      rationale:
        definition.classification === "observed_self_delegatecall_entrypoint"
          ? "Observed entry reaches address(this).delegatecall over caller-supplied nested calldata."
          : "Absent from this runtime, but denied against overload/future-target drift and selector-policy widening."
    };
  });
  const sourcePath = {
    branchInventory: {
      count: source.branchNodes.length,
      nodes: source.branchNodes,
      status: "manager_local_nodes_enumerated"
    },
    callEdges: source.callEdges,
    delegatecallSites: source.lowLevelCallSites.filter(
      ({ callKind }) => callKind === "delegatecall"
    ),
    directEntryDefinition: definitionLabel(root),
    lowLevelCallSites: source.lowLevelCallSites,
    reachableDefinitions: source.reachableDefinitions,
    reviewedSourceFiles: source.reviewedSourceFiles
  };
  const bytecodePath = {
    analysisMethod:
      "solc_ast_reference_closure_plus_deployed_source_map_opcode_intersection_and_dispatcher_decode",
    dispatcher: {
      abiDecoderPc: wrapper.abiDecoderPc,
      bodyPc: wrapper.bodyPc,
      comparePc: entry.comparePc,
      decoderReturnPc: wrapper.decoderReturnPc,
      jumpiPc: entry.jumpiPc,
      selector: entry.selector,
      wrapperPc: wrapper.wrapperPc
    },
    effectInstructions: bytecode.effectInstructions,
    mappedControlFlowInstructions: bytecode.controlFlowInstructions,
    mappedDelegatecalls,
    mappedInstructionCount: bytecode.mappedInstructionCount,
    mappedInstructionSetSha256: bytecode.mappedInstructionSetSha256,
    mappedPcRanges: bytecode.mappedPcRanges,
    sourceMapBoundary: context.sourceMapBoundary,
    runtimeWideDelegatecallPcs: context.runtimeWideDelegatecallPcs
  };
  return {
    activationEligible: false,
    analyzedAt: REVIEW_CONSTANTS.analyzedAt,
    artifactType: "pancake_v3_denied_multicall_boundary_local_review",
    bindings: commonBindings(),
    bytecodePath,
    claimStatus: "local_static_analysis_not_formal_proof_not_activation_ready",
    decision: "deny_all_multicall_selectors_and_nested_calldata",
    deniedMulticalls: denied,
    digests: {
      bytecodePathSha256: sha256Canonical(bytecodePath),
      sourcePathSha256: sha256Canonical(sourcePath)
    },
    findings: {
      arbitraryCalldataDispatcher: "observed",
      delegatecallProgramCounter: 10_522,
      delegatecallSemantics: "address_this_delegatecall_of_each_caller_supplied_bytes_element",
      observedOverloadCount: 1,
      otherDeniedOverloadsPresentInCurrentRuntime: false,
      unlistedSelectors: "deny",
      nestedCalldata: "deny"
    },
    limitations: [
      "This is manual/static review automation, not formal verification or exhaustive symbolic execution.",
      "Only multicall(bytes[]) is compiled into the pinned runtime; the other two selector denials are defense in depth.",
      "A fresh exact-block runtime observation and authenticated independent review remain required.",
      "An earlier retained build-info SHA-256 differs from this local build-info container; its raw bytes are unavailable, so no byte-level cause or equality claim is invented.",
      "A local repository artifact is not an allowed public HTTPS/IPFS evidence locator."
    ],
    method: {
      assurance: "manual_static_analysis_not_formal_proof",
      name: "manual_static_source_and_bytecode_control_flow_review",
      version: "proofera-pancake-v3-selector-path-v1"
    },
    publication: publicationBoundary(
      "evidence/development/pancake-v3-selector-paths/denied-multicalls.json"
    ),
    schemaVersion: 1,
    sourcePath
  };
}

export function buildEvidence(sourceRoot) {
  const absoluteRoot = path.resolve(sourceRoot);
  invariant(
    sha256Bytes(readFileSync(path.join(REVIEW_DIRECTORY, "hardhat.proofera.config.cjs"))) ===
      REVIEW_CONSTANTS.compileOnlyConfigSha256,
    "Committed compile-only configuration SHA-256 drifted."
  );
  const artifactPath = path.join(absoluteRoot, REVIEW_CONSTANTS.artifactRelativePath);
  const debugPath = path.join(absoluteRoot, REVIEW_CONSTANTS.debugRelativePath);
  const artifactBytes = readFileSync(artifactPath);
  invariant(
    sha256Bytes(artifactBytes) === REVIEW_CONSTANTS.managerArtifactSha256,
    "Manager artifact SHA-256 drifted."
  );
  const artifact = JSON.parse(artifactBytes.toString("utf8"));
  const debug = JSON.parse(readFileSync(debugPath, "utf8"));
  const buildInfoPath = path.resolve(path.dirname(debugPath), debug.buildInfo);
  const buildInfoRoot = path.resolve(
    absoluteRoot,
    "projects/v3-periphery/artifacts-proofera/build-info"
  );
  invariant(
    buildInfoPath.startsWith(`${buildInfoRoot}${path.sep}`),
    "Debug record escaped the expected local build-info directory."
  );
  const buildInfoBytes = readFileSync(buildInfoPath);
  invariant(
    sha256Bytes(buildInfoBytes) === REVIEW_CONSTANTS.localBuildInfoSha256,
    "Local build-info SHA-256 drifted."
  );
  const buildInfo = JSON.parse(buildInfoBytes.toString("utf8"));
  invariant(
    buildInfo.solcLongVersion === REVIEW_CONSTANTS.compilerLongVersion,
    "Compiler version drifted."
  );
  invariant(
    sha256Canonical(buildInfo.input) === REVIEW_CONSTANTS.compilerInputSha256,
    "Compiler input digest drifted."
  );
  invariant(
    sha256Canonical(buildInfo.input.settings) === REVIEW_CONSTANTS.compilerSettingsSha256,
    "Compiler settings digest drifted."
  );
  invariant(
    sha256Bytes(Buffer.from(JSON.stringify(DIRECT_WRITE_SCOPE), "utf8")) ===
      REVIEW_CONSTANTS.writeScopeSha256,
    "Direct write-scope digest drifted."
  );

  const contractOutput =
    buildInfo.output.contracts[REVIEW_CONSTANTS.managerSourcePath].NonfungiblePositionManager;
  invariant(contractOutput !== undefined, "Manager compiler output is missing.");
  invariant(
    artifact.deployedBytecode.slice(2).toLowerCase() ===
      contractOutput.evm.deployedBytecode.object.toLowerCase(),
    "Artifact and build-info runtime templates differ."
  );
  const { definitions, variables } = collectDefinitions(buildInfo);
  const linked = immutableLinkedRuntime(buildInfo, contractOutput, variables);
  const runtimeTemplate = Buffer.from(contractOutput.evm.deployedBytecode.object, "hex");
  const linkedRuntime = Buffer.from(linked.runtime, "hex");
  invariant(
    runtimeTemplate.length === REVIEW_CONSTANTS.runtimeByteLength,
    "Runtime template length drifted."
  );
  invariant(
    linkedRuntime.length === REVIEW_CONSTANTS.runtimeByteLength,
    "Linked runtime length drifted."
  );
  invariant(
    keccak256Bytes(runtimeTemplate) === REVIEW_CONSTANTS.runtimeTemplateKeccak256,
    "Runtime-template Keccak-256 drifted."
  );
  invariant(
    keccak256Bytes(linkedRuntime) === REVIEW_CONSTANTS.linkedRuntimeKeccak256,
    "Immutable-linked runtime Keccak-256 drifted."
  );

  for (const definition of [...DIRECT_CALLS, ...DENIED_MULTICALLS]) {
    invariant(
      keccak256Bytes(Buffer.from(definition.signature, "utf8")).slice(0, 10) ===
        definition.selector,
      `Selector/signature mismatch for ${definition.signature}.`
    );
  }
  for (const call of DIRECT_CALLS) {
    invariant(
      contractOutput.evm.methodIdentifiers[call.signature] === call.selector.slice(2),
      `Compiler method identifier drift for ${call.signature}.`
    );
  }

  const inputSources = buildInfo.input.sources;
  const sourcePathById = new Map(
    Object.entries(buildInfo.output.sources).map(([sourcePath, output]) => [output.id, sourcePath])
  );
  verifyGitSource(
    absoluteRoot,
    Object.keys(inputSources).filter((sourcePath) => sourcePath.startsWith("contracts/")),
    inputSources
  );
  const instructions = disassemble(contractOutput.evm.deployedBytecode.object.toLowerCase());
  const sourceMap = parseSourceMap(
    contractOutput.evm.deployedBytecode.sourceMap,
    instructions.length
  );
  invariant(
    instructions[sourceMap.length - 1].name === "REVERT",
    "Expected the source-mapped executable region to terminate at REVERT before trailing compiler data."
  );
  const sourceMapBoundary = {
    lastSourceMappedOpcode: instructions[sourceMap.length - 1].name,
    lastSourceMappedPc: instructions[sourceMap.length - 1].pc,
    sourceMappedInstructionCount: sourceMap.length,
    trailingCompilerDataByteLength:
      REVIEW_CONSTANTS.runtimeByteLength - instructions[sourceMap.length - 1].pc - 1
  };
  const dispatcher = dispatcherEntries(instructions);
  const sourceMappedInstructions = instructions.slice(0, sourceMap.length);
  const runtimeWideDelegatecallPcs = sourceMappedInstructions
    .filter(({ name }) => name === "DELEGATECALL")
    .map(({ pc }) => pc);
  invariant(
    runtimeWideDelegatecallPcs.length === 1 && runtimeWideDelegatecallPcs[0] === 10_522,
    `Unexpected runtime-wide DELEGATECALL set: ${runtimeWideDelegatecallPcs.join(",")}.`
  );
  invariant(
    !sourceMappedInstructions.some(({ name }) => name === "CALLCODE"),
    "Source-mapped runtime unexpectedly contains CALLCODE."
  );
  invariant(
    !sourceMappedInstructions.some(({ name }) => name === "SELFDESTRUCT"),
    "Source-mapped runtime unexpectedly contains SELFDESTRUCT."
  );

  const context = {
    definitions,
    dispatcher,
    inputSources,
    instructions,
    linkedImmutables: linked.linked,
    methodIdentifiers: contractOutput.evm.methodIdentifiers,
    runtimeWideDelegatecallPcs,
    sourceMapBoundary,
    sourceMap,
    sourcePathById
  };
  const artifacts = new Map();
  for (const call of DIRECT_CALLS)
    artifacts.set(`${call.operation}.json`, makeDirectArtifact(call, context));
  artifacts.set("denied-multicalls.json", makeMulticallArtifact(context));

  const files = [...artifacts.entries()].map(([file, value]) => {
    const bytes = Buffer.from(canonicalJson(value), "utf8");
    return {
      artifactType: value.artifactType,
      byteLength: bytes.length,
      bytecodePathSha256: value.digests.bytecodePathSha256,
      file,
      operation: value.operation ?? null,
      sha256: sha256Bytes(bytes),
      sourcePathSha256: value.digests.sourcePathSha256
    };
  });
  invariant(
    new Set(files.map(({ sha256 }) => sha256)).size === files.length,
    "Whole-file artifact SHA-256 values are not distinct."
  );
  invariant(
    new Set(files.map(({ sourcePathSha256 }) => sourcePathSha256)).size === files.length,
    "Source-path SHA-256 values are not distinct."
  );
  invariant(
    new Set(files.map(({ bytecodePathSha256 }) => bytecodePathSha256)).size === files.length,
    "Bytecode-path SHA-256 values are not distinct."
  );
  const manifest = {
    activationEligible: false,
    analyzedAt: REVIEW_CONSTANTS.analyzedAt,
    bindings: commonBindings(),
    canonicalization: "recursive_lexicographic_object_keys_json_utf8_lf_v1",
    claimStatus: "local_static_analysis_not_formal_proof_not_activation_ready",
    buildInfoProvenance: {
      currentLocalSelectorReviewBuildInfoSha256: REVIEW_CONSTANTS.localBuildInfoSha256,
      earlierRetainedBuildInfoBytesAvailableForComparison: false,
      earlierRetainedBuildInfoSha256: REVIEW_CONSTANTS.priorRetainedBuildInfoSha256,
      explanation:
        "Raw Hardhat build-info is a larger compiler input/output container. The earlier raw bytes were not retained, so the byte-level cause of the different container hash is unknown and is not asserted. The earlier hash is provenance only and is not substituted for this reproduction's exact local build-info binding.",
      independentlyMatchingOutputs: {
        compilerLongVersion: REVIEW_CONSTANTS.compilerLongVersion,
        compilerOutputArtifactSha256: REVIEW_CONSTANTS.managerArtifactSha256,
        linkedRuntimeKeccak256: REVIEW_CONSTANTS.linkedRuntimeKeccak256,
        runtimeTemplateKeccak256: REVIEW_CONSTANTS.runtimeTemplateKeccak256
      },
      locallyVerifiedInputs: {
        compilerInputSha256: REVIEW_CONSTANTS.compilerInputSha256,
        compilerSettingsSha256: REVIEW_CONSTANTS.compilerSettingsSha256
      }
    },
    files,
    immutableLinking: {
      linkedReferences: linked.linked,
      linkedRuntimeKeccak256: REVIEW_CONSTANTS.linkedRuntimeKeccak256,
      runtimeTemplateKeccak256: REVIEW_CONSTANTS.runtimeTemplateKeccak256
    },
    publicationBoundary:
      "No artifact in this directory satisfies the required public content-addressed HTTPS/IPFS locator until exact bytes are published and independently re-fetched.",
    reproduction: {
      checkCommand:
        "node scripts/pancake-selector-review/generate.mjs --source-root <clean-source-root> --check",
      cleanCompileCommandsPowerShell: [
        `git clone --no-checkout ${REVIEW_CONSTANTS.repository} <clean-source-root>`,
        `git -C <clean-source-root> checkout --detach ${REVIEW_CONSTANTS.sourceCommit}`,
        "Push-Location <clean-source-root>",
        "corepack yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive",
        "Pop-Location",
        "Copy-Item -LiteralPath <proofera-root>/scripts/pancake-selector-review/hardhat.proofera.config.cjs -Destination <clean-source-root>/projects/v3-periphery/hardhat.proofera.config.js",
        "Push-Location <clean-source-root>/projects/v3-periphery",
        "corepack yarn@1.22.22 hardhat compile --config hardhat.proofera.config.js",
        "Pop-Location",
        "node <proofera-root>/scripts/pancake-selector-review/generate.mjs --source-root <clean-source-root> --check"
      ],
      compileOnlyConfigPath: "scripts/pancake-selector-review/hardhat.proofera.config.cjs",
      compileOnlyConfigSha256: REVIEW_CONSTANTS.compileOnlyConfigSha256,
      prerequisites: [
        "Git",
        "Node.js 16.19.1 (official repository pin)",
        "Corepack Yarn 1.22.22",
        "access to the official Solidity compiler distribution on the first uncached compile"
      ],
      testCommand: "node --test scripts/pancake-selector-review/review.test.mjs",
      writeCommand:
        "node scripts/pancake-selector-review/generate.mjs --source-root <clean-source-root> --write"
    },
    schemaVersion: 1
  };
  artifacts.set("manifest.json", manifest);
  return artifacts;
}

export function verifyCommittedEvidence(evidenceDirectory) {
  const manifestPath = path.join(evidenceDirectory, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  invariant(manifest.activationEligible === false, "Manifest must remain non-eligible.");
  invariant(manifest.files.length === 5, "Manifest must bind four selectors and one boundary.");
  for (const file of manifest.files) {
    const bytes = readFileSync(path.join(evidenceDirectory, file.file));
    invariant(sha256Bytes(bytes) === file.sha256, `Artifact digest drifted: ${file.file}.`);
    const artifact = JSON.parse(bytes.toString("utf8"));
    invariant(
      canonicalJson(artifact) === bytes.toString("utf8"),
      `${file.file} is not canonical JSON.`
    );
    invariant(artifact.activationEligible === false, `${file.file} must remain non-eligible.`);
    invariant(
      artifact.publication.eligibleAsDomainEvidenceReference === false,
      `${file.file} must not claim public locator eligibility.`
    );
    invariant(
      sha256Canonical(artifact.sourcePath) === file.sourcePathSha256,
      `${file.file} source-path digest drifted.`
    );
    invariant(
      sha256Canonical(artifact.bytecodePath) === file.bytecodePathSha256,
      `${file.file} bytecode-path digest drifted.`
    );
  }
  invariant(
    new Set(manifest.files.map(({ sha256 }) => sha256)).size === manifest.files.length,
    "Whole-file digests must remain distinct."
  );
  invariant(
    new Set(manifest.files.map(({ sourcePathSha256 }) => sourcePathSha256)).size ===
      manifest.files.length,
    "Source-path digests must remain distinct."
  );
  invariant(
    new Set(manifest.files.map(({ bytecodePathSha256 }) => bytecodePathSha256)).size ===
      manifest.files.length,
    "Bytecode-path digests must remain distinct."
  );
  return manifest;
}
