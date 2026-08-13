import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BSC_TESTNET_CHAIN_ID,
  FIXED_SUPPLY_BASE_UNITS,
  assertBscTestnetChainId,
  assertDeploymentRecipient,
  assertNonemptyEvenHexBytecode,
  buildDeploymentPreparation,
  parsePreparationArguments,
  validateCompilationBinding,
} from "../scripts/deployment-preparation.mjs";

const RECIPIENT = "0x1111111111111111111111111111111111111111";
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readCompilationFixture() {
  const artifact = JSON.parse(
    await readFile(
      resolve(
        PACKAGE_ROOT,
        "artifacts/src/ProofEraTestAsset.sol/ProofEraTestAsset.json",
      ),
      "utf8",
    ),
  );
  const buildInfoDirectory = resolve(PACKAGE_ROOT, "artifacts/build-info");
  const [buildInfo, buildOutput, sourceText] = await Promise.all([
    readFile(
      resolve(buildInfoDirectory, `${artifact.buildInfoId}.json`),
      "utf8",
    ).then(JSON.parse),
    readFile(
      resolve(buildInfoDirectory, `${artifact.buildInfoId}.output.json`),
      "utf8",
    ).then(JSON.parse),
    readFile(resolve(PACKAGE_ROOT, "src/ProofEraTestAsset.sol"), "utf8"),
  ]);

  return { artifact, buildInfo, buildOutput, sourceText };
}

test("the chain gate accepts only decimal BSC testnet chain ID 97", () => {
  assert.equal(assertBscTestnetChainId("97"), BSC_TESTNET_CHAIN_ID);
  assert.equal(assertBscTestnetChainId(97), BSC_TESTNET_CHAIN_ID);

  for (const rejected of ["56", "1", "0x61", "097", 56, undefined, ""]) {
    assert.throws(
      () => assertBscTestnetChainId(rejected),
      /chain ID must be decimal 97/,
    );
  }
});

test("the recipient gate requires an explicit nonzero 20-byte address", () => {
  assert.equal(
    assertDeploymentRecipient(RECIPIENT.toUpperCase().replace("0X", "0x")),
    RECIPIENT,
  );
  assert.throws(
    () =>
      assertDeploymentRecipient("0x0000000000000000000000000000000000000000"),
    /zero address/,
  );

  for (const rejected of ["", "0x1", "not-an-address", undefined]) {
    assert.throws(
      () => assertDeploymentRecipient(rejected),
      /20-byte hexadecimal address/,
    );
  }
});

test("the CLI refuses signer, RPC, broadcast, unknown, duplicate, and incomplete arguments", () => {
  assert.deepEqual(
    parsePreparationArguments(["--chain-id", "97", "--recipient", RECIPIENT]),
    {
      chainId: 97,
      recipient: RECIPIENT,
    },
  );

  for (const rejected of [
    ["--chain-id", "97"],
    ["--recipient", RECIPIENT],
    [
      "--chain-id",
      "97",
      "--recipient",
      RECIPIENT,
      "--private-key",
      "forbidden",
    ],
    [
      "--chain-id",
      "97",
      "--recipient",
      RECIPIENT,
      "--rpc-url",
      "https://invalid.example",
    ],
    ["--chain-id", "97", "--recipient", RECIPIENT, "--broadcast", "true"],
    ["--chain-id", "97", "--chain-id", "97"],
  ]) {
    assert.throws(() => parsePreparationArguments(rejected));
  }
});

test("bytecode validation rejects empty, odd-length, unprefixed, and non-hex values", () => {
  assert.equal(assertNonemptyEvenHexBytecode("0x00", "Test"), "0x00");
  assert.equal(assertNonemptyEvenHexBytecode("0x6000", "Test"), "0x6000");

  for (const rejected of [
    undefined,
    null,
    "",
    "0x",
    "0x0",
    "0x001",
    "0xgg",
    "6000",
  ]) {
    assert.throws(
      () => assertNonemptyEvenHexBytecode(rejected, "Test"),
      /nonempty, 0x-prefixed, even-length hexadecimal bytecode/,
    );
  }
});

test("compilation binding rejects mixed, stale, source-divergent, and malformed artifacts", async () => {
  const fixture = await readCompilationFixture();
  assert.doesNotThrow(() => validateCompilationBinding(fixture));

  const cases = [
    {
      mutate: (value) => {
        value.artifact.buildInfoId = "solc-0_8_36-stale";
      },
      message: /build-info input IDs do not match/,
    },
    {
      mutate: (value) => {
        value.artifact.inputSourceName = "project/src/Other.sol";
      },
      message: /input source must be/,
    },
    {
      mutate: (value) => {
        value.buildInfo.id = "solc-0_8_36-other";
      },
      message: /build-info input IDs do not match/,
    },
    {
      mutate: (value) => {
        value.buildOutput.id = "solc-0_8_36-other";
      },
      message: /build-info output IDs do not match/,
    },
    {
      mutate: (value) => {
        value.buildInfo.input.sources[
          "project/src/ProofEraTestAsset.sol"
        ].content += "\n";
      },
      message: /embedded source does not match/,
    },
    {
      mutate: (value) => {
        value.artifact.bytecode = "0x0";
      },
      message: /Creation bytecode must be nonempty/,
    },
    {
      mutate: (value) => {
        value.artifact.deployedBytecode = "0xzz";
      },
      message: /Deployed bytecode must be nonempty/,
    },
    {
      mutate: (value) => {
        value.artifact.bytecode = "0x00";
      },
      message: /creation bytecode does not match/,
    },
  ];

  for (const { mutate, message } of cases) {
    const corrupted = structuredClone(fixture);
    mutate(corrupted);
    assert.throws(() => validateCompilationBinding(corrupted), message);
  }
});

test("offline preparation is deterministic and binds source, compiler, recipient, and chain", async () => {
  const first = await buildDeploymentPreparation({
    chainId: 97,
    recipient: RECIPIENT,
  });
  const second = await buildDeploymentPreparation({
    chainId: "97",
    recipient: RECIPIENT,
  });

  assert.deepEqual(first, second);
  assert.equal(first.status, "offline_unsigned_preparation_only");
  assert.equal(first.network.chainId, 97);
  assert.equal(first.contract.constructorEnforcedChainId, 97);
  assert.equal(first.contract.deploymentRecipient, RECIPIENT);
  assert.equal(
    first.contract.fixedSupplyBaseUnits,
    FIXED_SUPPLY_BASE_UNITS.toString(),
  );
  assert.equal(first.contract.abiEncodedConstructorArguments.length, 66);
  assert.ok(
    first.unsignedDeploymentData.endsWith(RECIPIENT.slice(2).padStart(64, "0")),
  );
  assert.equal(first.compiler.version, "0.8.36");
  assert.equal(first.compiler.settings.evmVersion, "paris");
  assert.deepEqual(first.compiler.settings.optimizer, {
    enabled: true,
    runs: 200,
  });
  assert.deepEqual(first.safety, {
    broadcasts: false,
    networkCalls: false,
    readsEnvironment: false,
    readsPrivateKey: false,
    signsTransactions: false,
  });

  for (const digest of Object.values(first.digests)) {
    assert.match(digest, /^[0-9a-f]{64}$/);
  }
});

test("retained local-build evidence matches a fresh clean-build preparation", async () => {
  const recorded = JSON.parse(
    await readFile(
      resolve(PACKAGE_ROOT, "evidence/local-build-2026-08-13.json"),
      "utf8",
    ),
  );
  const current = await buildDeploymentPreparation({
    chainId: 97,
    recipient: RECIPIENT,
  });

  assert.equal(
    recorded.status,
    "local_verification_only_not_transaction_evidence",
  );
  assert.equal(recorded.checkedDateUtc, "2026-08-13");
  assert.equal(recorded.results.nodeTestsPassed, 26);
  assert.equal(
    recorded.examplePreparation.recipientIsAuthorizedForDeployment,
    false,
  );
  assert.equal(
    recorded.toolchain.solidityLongVersion,
    current.compiler.longVersion,
  );
  assert.deepEqual(recorded.digests, current.digests);
  const poolGoldenRaw = await readFile(
    resolve(
      PACKAGE_ROOT,
      recorded.poolPreparationEvidence.fixtureOnlyGoldenEvidencePath,
    ),
  );
  assert.equal(
    createHash("sha256").update(poolGoldenRaw).digest("hex"),
    recorded.poolPreparationEvidence.fixtureOnlyGoldenEvidenceSha256,
  );
});
