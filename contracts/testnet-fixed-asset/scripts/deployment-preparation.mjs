import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BSC_TESTNET_CHAIN_ID = 97;
export const CONTRACT_NAME = "ProofEraTestAsset";
export const CONTRACT_SOURCE_NAME = "src/ProofEraTestAsset.sol";
export const FIXED_SUPPLY_BASE_UNITS = 1_000_000n * 10n ** 18n;
export const SOLIDITY_VERSION = "0.8.36";
export const SOLIDITY_LONG_VERSION = "0.8.36+commit.8a079791";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_PATH = join(
  PACKAGE_ROOT,
  "artifacts",
  "src",
  "ProofEraTestAsset.sol",
  "ProofEraTestAsset.json",
);
const BUILD_INFO_DIRECTORY = join(PACKAGE_ROOT, "artifacts", "build-info");
const EXPECTED_INPUT_SOURCE_NAME = `project/${CONTRACT_SOURCE_NAME}`;
const BUILD_INFO_ID_PATTERN = /^solc-[0-9A-Za-z_-]+$/;
const NONEMPTY_EVEN_HEX_PATTERN = /^0x(?:[0-9a-fA-F]{2})+$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function assertBscTestnetChainId(chainId) {
  const normalized = typeof chainId === "number" ? String(chainId) : chainId;

  if (normalized !== String(BSC_TESTNET_CHAIN_ID)) {
    throw new Error(
      `Refusing deployment preparation: chain ID must be decimal ${BSC_TESTNET_CHAIN_ID} (BSC testnet).`,
    );
  }

  return BSC_TESTNET_CHAIN_ID;
}

export function assertDeploymentRecipient(recipient) {
  if (typeof recipient !== "string" || !ADDRESS_PATTERN.test(recipient)) {
    throw new Error(
      "Deployment recipient must be an explicit 20-byte hexadecimal address.",
    );
  }

  const normalized = recipient.toLowerCase();
  if (normalized === ZERO_ADDRESS) {
    throw new Error("Deployment recipient must not be the zero address.");
  }

  return normalized;
}

export function parsePreparationArguments(arguments_) {
  const allowedKeys = new Set(["--chain-id", "--recipient"]);
  const parsed = new Map();

  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];

    if (
      !allowedKeys.has(key) ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new Error(
        "Usage: --chain-id 97 --recipient 0x...; RPC, signer, private-key, and broadcast arguments are unsupported.",
      );
    }
    if (parsed.has(key)) {
      throw new Error(`Duplicate argument: ${key}`);
    }

    parsed.set(key, value);
  }

  if (parsed.size !== allowedKeys.size) {
    throw new Error("Both --chain-id and --recipient are required.");
  }

  return {
    chainId: assertBscTestnetChainId(parsed.get("--chain-id")),
    recipient: assertDeploymentRecipient(parsed.get("--recipient")),
  };
}

export function assertNonemptyEvenHexBytecode(value, label) {
  if (typeof value !== "string" || !NONEMPTY_EVEN_HEX_PATTERN.test(value)) {
    throw new Error(
      `${label} must be nonempty, 0x-prefixed, even-length hexadecimal bytecode.`,
    );
  }

  return value;
}

function assertSameJson(label, actual, expected) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `Compiled artifact ${label} does not match its bound compiler output.`,
    );
  }
}

export function validateCompilationBinding({
  artifact,
  buildInfo,
  buildOutput,
  sourceText,
}) {
  if (
    artifact?._format !== "hh3-artifact-1" ||
    artifact.contractName !== CONTRACT_NAME ||
    artifact.sourceName !== CONTRACT_SOURCE_NAME
  ) {
    throw new Error(
      "Compiled artifact identity does not match the expected Hardhat 3 test asset.",
    );
  }
  if (artifact.inputSourceName !== EXPECTED_INPUT_SOURCE_NAME) {
    throw new Error(
      `Compiled artifact input source must be ${EXPECTED_INPUT_SOURCE_NAME}.`,
    );
  }
  if (
    typeof artifact.buildInfoId !== "string" ||
    !BUILD_INFO_ID_PATTERN.test(artifact.buildInfoId)
  ) {
    throw new Error("Compiled artifact has an invalid build-info ID.");
  }
  if (
    buildInfo?._format !== "hh3-sol-build-info-1" ||
    buildInfo.id !== artifact.buildInfoId
  ) {
    throw new Error("Compiled artifact and build-info input IDs do not match.");
  }
  if (
    buildInfo.solcVersion !== SOLIDITY_VERSION ||
    buildInfo.solcLongVersion !== SOLIDITY_LONG_VERSION
  ) {
    throw new Error(
      `Build info must use exact compiler ${SOLIDITY_LONG_VERSION}.`,
    );
  }
  if (
    buildOutput?._format !== "hh3-sol-build-info-output-1" ||
    buildOutput.id !== artifact.buildInfoId
  ) {
    throw new Error(
      "Compiled artifact and build-info output IDs do not match.",
    );
  }

  const embeddedSource =
    buildInfo.input?.sources?.[EXPECTED_INPUT_SOURCE_NAME]?.content;
  if (typeof embeddedSource !== "string" || embeddedSource !== sourceText) {
    throw new Error(
      "Build-info embedded source does not match the retained contract source bytes.",
    );
  }

  const settings = buildInfo.input?.settings;
  if (
    settings?.evmVersion !== "paris" ||
    settings.viaIR !== false ||
    settings.optimizer?.enabled !== true ||
    settings.optimizer.runs !== 200 ||
    settings.metadata?.bytecodeHash !== "ipfs"
  ) {
    throw new Error(
      "Build info does not match the exact reviewed compiler settings.",
    );
  }

  const compiledContract =
    buildOutput.output?.contracts?.[EXPECTED_INPUT_SOURCE_NAME]?.[
      CONTRACT_NAME
    ];
  if (compiledContract === undefined) {
    throw new Error(
      "Build-info output is missing the expected compiled contract.",
    );
  }

  assertNonemptyEvenHexBytecode(artifact.bytecode, "Creation bytecode");
  assertNonemptyEvenHexBytecode(artifact.deployedBytecode, "Deployed bytecode");
  const compiledCreationBytecode = `0x${compiledContract.evm?.bytecode?.object ?? ""}`;
  const compiledRuntimeBytecode = `0x${compiledContract.evm?.deployedBytecode?.object ?? ""}`;
  assertNonemptyEvenHexBytecode(
    compiledCreationBytecode,
    "Compiler-output creation bytecode",
  );
  assertNonemptyEvenHexBytecode(
    compiledRuntimeBytecode,
    "Compiler-output deployed bytecode",
  );

  if (artifact.bytecode !== compiledCreationBytecode) {
    throw new Error(
      "Compiled artifact creation bytecode does not match its bound compiler output.",
    );
  }
  if (artifact.deployedBytecode !== compiledRuntimeBytecode) {
    throw new Error(
      "Compiled artifact deployed bytecode does not match its bound compiler output.",
    );
  }

  assertSameJson("ABI", artifact.abi, compiledContract.abi);
  assertSameJson(
    "creation link references",
    artifact.linkReferences,
    compiledContract.evm.bytecode.linkReferences,
  );
  assertSameJson(
    "deployed link references",
    artifact.deployedLinkReferences,
    compiledContract.evm.deployedBytecode.linkReferences,
  );
  assertSameJson(
    "immutable references",
    artifact.immutableReferences,
    compiledContract.evm.deployedBytecode.immutableReferences,
  );

  return compiledContract;
}

async function readBuildInfo(buildInfoId) {
  if (
    typeof buildInfoId !== "string" ||
    !BUILD_INFO_ID_PATTERN.test(buildInfoId)
  ) {
    throw new Error("Refusing invalid build-info ID from compiled artifact.");
  }

  const inputPath = join(BUILD_INFO_DIRECTORY, `${buildInfoId}.json`);
  const outputPath = join(BUILD_INFO_DIRECTORY, `${buildInfoId}.output.json`);
  const [raw, outputRaw] = await Promise.all([
    readFile(inputPath),
    readFile(outputPath),
  ]);

  return {
    raw,
    value: JSON.parse(raw.toString("utf8")),
    outputRaw,
    outputValue: JSON.parse(outputRaw.toString("utf8")),
  };
}

function encodeAddressConstructorArgument(recipient) {
  return recipient.slice(2).padStart(64, "0");
}

export async function buildDeploymentPreparation({ chainId, recipient }) {
  const validatedChainId = assertBscTestnetChainId(chainId);
  const validatedRecipient = assertDeploymentRecipient(recipient);

  const [artifactRaw, sourceRaw, configRaw, packageManifestRaw, lockfileRaw] =
    await Promise.all([
      readFile(ARTIFACT_PATH),
      readFile(join(PACKAGE_ROOT, CONTRACT_SOURCE_NAME)),
      readFile(join(PACKAGE_ROOT, "hardhat.config.js")),
      readFile(join(PACKAGE_ROOT, "package.json")),
      readFile(join(PACKAGE_ROOT, "pnpm-lock.yaml")),
    ]);
  const artifact = JSON.parse(artifactRaw.toString("utf8"));
  const buildInfo = await readBuildInfo(artifact.buildInfoId);
  validateCompilationBinding({
    artifact,
    buildInfo: buildInfo.value,
    buildOutput: buildInfo.outputValue,
    sourceText: sourceRaw.toString("utf8"),
  });

  const encodedConstructorArguments = `0x${encodeAddressConstructorArgument(validatedRecipient)}`;
  const unsignedDeploymentData = `${artifact.bytecode}${encodedConstructorArguments.slice(2)}`;
  const compilerSettings = buildInfo.value.input?.settings;
  if (compilerSettings === undefined) {
    throw new Error("Build info is missing compiler settings.");
  }

  return {
    schemaVersion: 1,
    status: "offline_unsigned_preparation_only",
    network: {
      name: "BSC Testnet",
      chainId: validatedChainId,
    },
    contract: {
      name: CONTRACT_NAME,
      sourceName: CONTRACT_SOURCE_NAME,
      tokenName: "ProofEra Test Asset",
      symbol: "PTA",
      decimals: 18,
      fixedSupplyBaseUnits: FIXED_SUPPLY_BASE_UNITS.toString(),
      constructorEnforcedChainId: BSC_TESTNET_CHAIN_ID,
      deploymentRecipient: validatedRecipient,
      constructorTypes: ["address"],
      constructorArguments: [validatedRecipient],
      abiEncodedConstructorArguments: encodedConstructorArguments,
    },
    compiler: {
      version: buildInfo.value.solcVersion,
      longVersion: buildInfo.value.solcLongVersion,
      settings: compilerSettings,
    },
    digests: {
      sourceSha256: sha256(sourceRaw),
      hardhatConfigSha256: sha256(configRaw),
      packageManifestSha256: sha256(packageManifestRaw),
      lockfileSha256: sha256(lockfileRaw),
      artifactSha256: sha256(artifactRaw),
      buildInfoInputSha256: sha256(buildInfo.raw),
      buildInfoOutputSha256: sha256(buildInfo.outputRaw),
      compilerSettingsCanonicalSha256: sha256(stableJson(compilerSettings)),
      deploymentBytecodeSha256: sha256(
        Buffer.from(artifact.bytecode.slice(2), "hex"),
      ),
      runtimeBytecodeSha256: sha256(
        Buffer.from(artifact.deployedBytecode.slice(2), "hex"),
      ),
      unsignedDeploymentDataSha256: sha256(
        Buffer.from(unsignedDeploymentData.slice(2), "hex"),
      ),
    },
    unsignedDeploymentData,
    safety: {
      broadcasts: false,
      networkCalls: false,
      readsEnvironment: false,
      readsPrivateKey: false,
      signsTransactions: false,
    },
    disclosures: [
      "BSC testnet only",
      "No peg, redemption promise, market value, or economic rights",
      "Preparation is not a deployment or onchain evidence",
    ],
  };
}
