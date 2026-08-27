import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as publicSurface from "@proofera/integrations";
import { describe, expect, it, vi } from "vitest";
import { keccak256, sha256, stringToHex, type Hex } from "viem";

import {
  BscTestnetPtaWbnbLpExecutionFailure,
  confirmBscTestnetPtaWbnbLpOwnerChallengeForInternalUse,
  createBscTestnetPtaWbnbLpOwnerChallengeForInternalUse,
  parseBscTestnetPtaWbnbLpExactExecutionPlanForInternalUse,
  signBscTestnetPtaWbnbLpExactTransactionForInternalUse
} from "./bsc-testnet-pta-wbnb-lp-execution.server";
import {
  deriveBscTestnetPtaWbnbLpExactScopeSha256ForInternalUse,
  BSC_TESTNET_PTA_WBNB_LP_OWNER,
  stableBscTestnetPtaWbnbLpJsonForInternalUse
} from "./bsc-testnet-pta-wbnb-lp-exact-scope";
import {
  BscTestnetPtaWbnbLpJournalFailure,
  deriveBscTestnetPtaWbnbLpJournalRecordSha256ForInternalUse,
  parseBscTestnetPtaWbnbLpJournalRecordsForInternalUse
} from "./bsc-testnet-pta-wbnb-lp-journal.server";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCOPE_PATH = resolve(
  ROOT,
  "evidence/development/bsc-testnet-pta-wbnb-lp-exact-scope-127358821.json"
);
const RUNNER_PATH = resolve(ROOT, "scripts/run-bsc-testnet-pta-wbnb-first-lp.ts");
const EXECUTION_PATH = resolve(
  ROOT,
  "packages/integrations/src/bsc-testnet-pta-wbnb-lp-execution.server.ts"
);
const JOURNAL_PATH = resolve(
  ROOT,
  "packages/integrations/src/bsc-testnet-pta-wbnb-lp-journal.server.ts"
);
const HEX_A = `0x${"11".repeat(32)}` as Hex;
const HEX_B = `0x${"22".repeat(32)}` as Hex;
const HEX_C = `0x${"33".repeat(32)}` as Hex;
const ZERO_SHA = `0x${"00".repeat(32)}` as Hex;

vi.mock("server-only", () => ({}));

function retainedScope(): Record<string, unknown> {
  const scope = JSON.parse(readFileSync(SCOPE_PATH, "utf8")) as Record<string, unknown>;
  scope.scopeExpiresAt = new Date(Date.parse(scope.preparedAt as string) + 300_000).toISOString();
  return reseal(scope);
}

function reseal(scope: Record<string, unknown>): Record<string, unknown> {
  const body = Object.fromEntries(
    Object.entries(scope).filter(([key]) => key !== "exactScopeSha256")
  );
  return {
    ...body,
    exactScopeSha256: deriveBscTestnetPtaWbnbLpExactScopeSha256ForInternalUse(body)
  };
}

function requiredAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing test value at index ${index}.`);
  return value;
}

function validPlan() {
  const scope = retainedScope();
  return parseBscTestnetPtaWbnbLpExactExecutionPlanForInternalUse(
    scope,
    Date.parse(scope.preparedAt as string) + 1_000
  );
}

describe("BSC-testnet first-LP exact execution", () => {
  it("parses only the retained two-transaction exact scope", () => {
    const plan = validPlan();
    expect(plan.sourceCommit).toBe("c1df68635f1f7b83acc49bc2dad9a32187c050bd");
    expect(
      plan.transactions.map(({ order, nonce, to, valueWei }) => ({
        order,
        nonce,
        to,
        valueWei
      }))
    ).toEqual([
      {
        order: 1,
        nonce: 10n,
        to: "0x4ed64525d6fB06b7dA926C683CBD809632C9B4Cc",
        valueWei: 0n
      },
      {
        order: 2,
        nonce: 11n,
        to: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
        valueWei: 1_000_000_000_000_000n
      }
    ]);
    expect(plan.maximumNativeOutflowWei).toBe(1_080_596_200_000_000n);
  });

  it.each([
    [
      "mainnet authority",
      (scope: Record<string, unknown>) => {
        (scope.chain as Record<string, unknown>).mainnetWritePossible = true;
      }
    ],
    [
      "approval target",
      (scope: Record<string, unknown>) => {
        requiredAt(scope.exactTransactions as Record<string, unknown>[], 0).to =
          "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
      }
    ],
    [
      "sequential nonce",
      (scope: Record<string, unknown>) => {
        requiredAt(scope.exactTransactions as Record<string, unknown>[], 1).nonce = "12";
      }
    ],
    [
      "custody authority",
      (scope: Record<string, unknown>) => {
        (scope.authorization as Record<string, unknown>).custodyUnlockAuthorized = true;
      }
    ],
    [
      "amount cap",
      (scope: Record<string, unknown>) => {
        (scope.caps as Record<string, unknown>).ptaSpendRaw = "1000000000000000000001";
      }
    ]
  ])("rejects resealed semantic drift: %s", (_label, mutate) => {
    const scope = retainedScope();
    mutate(scope);
    const resealed = reseal(scope);
    expect(() =>
      parseBscTestnetPtaWbnbLpExactExecutionPlanForInternalUse(
        resealed,
        Date.parse(resealed.preparedAt as string) + 1_000
      )
    ).toThrow(BscTestnetPtaWbnbLpExecutionFailure);
  });

  it("keeps simple owner presence separate from the complete scope/runtime/nonce binding", () => {
    const plan = validPlan();
    const challenge = createBscTestnetPtaWbnbLpOwnerChallengeForInternalUse({
      plan,
      ceremonyNonce: HEX_A,
      runtimeManifestSha256: HEX_B
    });
    const changedNonce = createBscTestnetPtaWbnbLpOwnerChallengeForInternalUse({
      plan,
      ceremonyNonce: HEX_C,
      runtimeManifestSha256: HEX_B
    });
    const changedRuntime = createBscTestnetPtaWbnbLpOwnerChallengeForInternalUse({
      plan,
      ceremonyNonce: HEX_A,
      runtimeManifestSha256: HEX_C
    });
    expect(challenge.confirmationLine).toBe("CONFIRM");
    expect(challenge.challengeBindingSha256).not.toBe(changedNonce.challengeBindingSha256);
    expect(challenge.challengeBindingSha256).not.toBe(changedRuntime.challengeBindingSha256);
    expect(changedNonce.confirmationLine).toBe("CONFIRM");
    expect(changedRuntime.confirmationLine).toBe("CONFIRM");
    const confirmed = confirmBscTestnetPtaWbnbLpOwnerChallengeForInternalUse(
      challenge,
      challenge.confirmationLine,
      plan.preparedAtMilliseconds + 2_000
    );
    expect(confirmed.ownerConfirmationSha256).toBe(challenge.confirmationLineSha256);
    expect(confirmed.ownerChallengeBindingSha256).toBe(challenge.challengeBindingSha256);
    expect(() =>
      confirmBscTestnetPtaWbnbLpOwnerChallengeForInternalUse(
        challenge,
        challenge.confirmationLine,
        plan.preparedAtMilliseconds + 2_000
      )
    ).toThrow(BscTestnetPtaWbnbLpExecutionFailure);
  });

  it("cannot mint a signing capability from a caller-created plain object", async () => {
    await expect(
      signBscTestnetPtaWbnbLpExactTransactionForInternalUse(
        {
          confirmedAtMilliseconds: 0,
          executionExpiresAtMilliseconds: Number.MAX_SAFE_INTEGER,
          plan: validPlan()
        } as never,
        1,
        1
      )
    ).rejects.toMatchObject({ code: "CONFIRMATION_EXPIRED" });
  });

  it("keeps execution, custody and journal machinery outside the browser package surface", () => {
    expect("signBscTestnetPtaWbnbLpExactTransactionForInternalUse" in publicSurface).toBe(false);
    expect("createWindowsBscTestnetPtaWbnbLpJournalForInternalUse" in publicSurface).toBe(false);
  });
});

type TestRecord = Record<string, unknown>;

function journalRecord(
  index: number,
  previousRecordSha256: Hex,
  fields: Record<string, unknown>
): TestRecord {
  return {
    schema: "bsc_testnet_pta_wbnb_first_lp_journal_v3",
    operationKey: keccak256(
      new TextEncoder().encode("ProofEra:bsc-testnet-pta-wbnb-first-lp-durable-operation:v3")
    ),
    sequence: index,
    kind: fields.kind,
    previousRecordSha256,
    scopeSha256: HEX_A,
    sourceCommit: "087485f4cf1a3f2255bd375e4535b48cbb3eede9",
    runtimeManifestSha256: HEX_B,
    ownerConfirmationSha256: HEX_C,
    ownerChallengeBindingSha256: HEX_A,
    owner: BSC_TESTNET_PTA_WBNB_LP_OWNER,
    recordedAt: "2026-08-27T00:00:00.000Z",
    ...fields
  };
}

function finalityFields(blockNumber: string, blockHash: Hex): Record<string, unknown> {
  const finality = {
    receiptBlockNumber: blockNumber,
    receiptBlockHash: blockHash,
    primaryFinalizedBlockNumber: "10",
    primaryFinalizedBlockHash: HEX_B,
    corroboratorFinalizedBlockNumber: "11",
    corroboratorFinalizedBlockHash: HEX_C,
    canonicalReceiptBlockAgreementVerified: true
  };
  return {
    finalitySha256: sha256(stringToHex(stableBscTestnetPtaWbnbLpJsonForInternalUse(finality))),
    primaryFinalizedBlockNumber: finality.primaryFinalizedBlockNumber,
    primaryFinalizedBlockHash: finality.primaryFinalizedBlockHash,
    corroboratorFinalizedBlockNumber: finality.corroboratorFinalizedBlockNumber,
    corroboratorFinalizedBlockHash: finality.corroboratorFinalizedBlockHash
  };
}

function completeJournal(outcome: "confirmed" | "reverted" = "confirmed"): TestRecord[] {
  const rawApproval = "0x01" as Hex;
  const rawMint = "0x02" as Hex;
  const approvalHash = keccak256(rawApproval);
  const mintHash = keccak256(rawMint);
  const fields: Record<string, unknown>[] = [
    {
      kind: "owner_confirmed",
      confirmedAt: "2026-08-27T00:00:00.000Z",
      executionExpiresAt: "2026-08-27T00:02:00.000Z",
      approvalNonce: "10",
      mintNonce: "11",
      maximumNativeOutflowWei: "1080596200000000"
    },
    { kind: "signing_started", step: "approval" },
    {
      kind: "signed",
      step: "approval",
      rawTransaction: rawApproval,
      rawTransactionKeccak256: approvalHash,
      signingHash: HEX_A,
      transactionHash: approvalHash,
      recoveredSigner: BSC_TESTNET_PTA_WBNB_LP_OWNER
    },
    { kind: "submission_started", step: "approval" },
    {
      kind: "terminal",
      step: "approval",
      outcome,
      transactionHash: approvalHash,
      receiptSha256: HEX_A,
      blockNumber: "1",
      blockHash: HEX_B,
      ...finalityFields("1", HEX_B)
    },
    { kind: "signing_started", step: "mint" },
    {
      kind: "signed",
      step: "mint",
      rawTransaction: rawMint,
      rawTransactionKeccak256: mintHash,
      signingHash: HEX_B,
      transactionHash: mintHash,
      recoveredSigner: BSC_TESTNET_PTA_WBNB_LP_OWNER
    },
    { kind: "submission_started", step: "mint" },
    {
      kind: "terminal",
      step: "mint",
      outcome: "confirmed",
      transactionHash: mintHash,
      receiptSha256: HEX_C,
      blockNumber: "2",
      blockHash: HEX_C,
      ...finalityFields("2", HEX_C)
    }
  ];
  const records: TestRecord[] = [];
  let previous = ZERO_SHA;
  for (const [index, entry] of fields.entries()) {
    const next = journalRecord(index, previous, entry);
    records.push(next);
    previous = deriveBscTestnetPtaWbnbLpJournalRecordSha256ForInternalUse(next);
  }
  return records;
}

describe("first-LP append-only journal parser", () => {
  it("accepts every exact lifecycle prefix and exposes no retry state", () => {
    const records = completeJournal();
    const expected = [
      "empty",
      "owner_confirmed",
      "approval_signing_started",
      "approval_signed",
      "approval_submission_started",
      "approval_confirmed",
      "mint_signing_started",
      "mint_signed",
      "mint_submission_started",
      "mint_confirmed"
    ];
    for (let length = 0; length <= records.length; length += 1) {
      const slots = Array.from({ length: 9 }, (_, index) => records[index] ?? null);
      for (let index = length; index < slots.length; index += 1) slots[index] = null;
      expect(parseBscTestnetPtaWbnbLpJournalRecordsForInternalUse(slots).status).toBe(
        expected[length]
      );
    }
  });

  it.each([
    [
      "gap",
      (records: TestRecord[]) => {
        records[2] = null as never;
      }
    ],
    [
      "hash chain",
      (records: TestRecord[]) => {
        requiredAt(records, 3).previousRecordSha256 = HEX_A;
      }
    ],
    [
      "scope binding",
      (records: TestRecord[]) => {
        requiredAt(records, 6).scopeSha256 = HEX_C;
      }
    ],
    [
      "kind order",
      (records: TestRecord[]) => {
        requiredAt(records, 1).kind = "signed";
      }
    ],
    [
      "finality commitment",
      (records: TestRecord[]) => {
        requiredAt(records, 4).primaryFinalizedBlockNumber = "12";
      }
    ]
  ])("rejects journal mutation: %s", (_label, mutate) => {
    const records = completeJournal();
    mutate(records);
    expect(() => parseBscTestnetPtaWbnbLpJournalRecordsForInternalUse(records)).toThrow(
      BscTestnetPtaWbnbLpJournalFailure
    );
  });

  it("never admits mint records after a reverted approval", () => {
    expect(() =>
      parseBscTestnetPtaWbnbLpJournalRecordsForInternalUse(completeJournal("reverted"))
    ).toThrow(BscTestnetPtaWbnbLpJournalFailure);
  });
});

describe("first-LP runner source boundary", () => {
  it("orders durable transitions before custody and each single send", () => {
    const source = readFileSync(RUNNER_PATH, "utf8");
    const signingStarted = source.indexOf("await journal.commitSigningStarted");
    const custody = source.indexOf("await signBscTestnetPtaWbnbLpExactTransactionForInternalUse");
    const signedCommit = source.indexOf("await journal.commitSigned");
    const submissionStarted = source.indexOf("await journal.commitSubmissionStarted");
    const send = source.indexOf("await primary.sendRawOnce");
    expect(signingStarted).toBeGreaterThan(0);
    expect(signingStarted).toBeLessThan(custody);
    expect(custody).toBeLessThan(signedCommit);
    expect(signedCommit).toBeLessThan(submissionStarted);
    expect(submissionStarted).toBeLessThan(send);
    expect(source).toContain("retryBroadcastAllowed: false");
    expect(source).toContain('["finalized", false]');
    expect(source).toContain("canonicalReceiptBlockAgreementVerified: true");
    expect(source).toContain("response.url !== new URL(this.origin).href");
    expect(source).toContain('redirect: "error"');
    expect(source).toContain("const requestId = (this.#requestId += 1)");
    expect(source).toContain("id: requestId, method, params");
    expect(source).toContain("parsed.id !== requestId");
    expect(source).not.toContain("parsed.id !== this.#requestId");
    expect(source).toContain(
      "await assertRetiredWindowsBscTestnetPtaWbnbLpV1V2OwnerOnlyForInternalUse()"
    );
    expect(source).toContain("approvalTransactionHash = state?.approvalSigned?.transactionHash");
    expect(source).not.toMatch(/chainId=1(?:\D|$)|bsc-dataseed\.binance\.org/u);
  });

  it("requires exact owner-only v1/v2 predecessors before opening journal v3", () => {
    const runner = readFileSync(RUNNER_PATH, "utf8");
    const journal = readFileSync(JOURNAL_PATH, "utf8");
    const predecessorAudit = runner.indexOf(
      "await assertRetiredWindowsBscTestnetPtaWbnbLpV1V2OwnerOnlyForInternalUse()"
    );
    const currentJournal = runner.indexOf(
      "await createWindowsBscTestnetPtaWbnbLpJournalForInternalUse()"
    );
    expect(predecessorAudit).toBeGreaterThan(0);
    expect(predecessorAudit).toBeLessThan(currentJournal);
    expect(journal).toContain("bsc-testnet-pta-wbnb-lp-v1");
    expect(journal).toContain("bsc-testnet-pta-wbnb-lp-v2");
    expect(journal).toContain("bsc-testnet-pta-wbnb-lp-v3");
    expect(journal).toContain("0x3c862be1cff75b04bb1b02cb0b62142452bdc0065a8af43451634b18738e292b");
    expect(journal).toContain("0xe6b16d01826b8a28ddf392834d1f1c5117ef84df536021c67a88a61c2e042d3c");
    expect(journal).toContain("$entries.Count -ne 1");
    expect(journal).toContain("sha256(bytes) !== expectedSha256");
  });

  it("keeps the three-pass rehearsal before journal v3 and custody", () => {
    const source = readFileSync(RUNNER_PATH, "utf8");
    const rehearsal = source.indexOf("if (mode === READ_ONLY_REHEARSAL_FLAG)");
    const currentJournal = source.indexOf(
      "await createWindowsBscTestnetPtaWbnbLpJournalForInternalUse()"
    );
    const custody = source.indexOf(
      "await assertFixedBscTestnetPtaWbnbLpCustodyMetadataForInternalUse"
    );
    expect(rehearsal).toBeGreaterThan(0);
    expect(rehearsal).toBeLessThan(currentJournal);
    expect(currentJournal).toBeLessThan(custody);
    expect(source).toContain('status: "read_only_rehearsal_passed"');
    expect(source).toContain("preSubmissionPasses: 3");
    expect(source).toContain("journalV3Created: false");
    expect(source).toContain("custodyAccessed: false");
  });

  it("keeps private bytes out of output and package exports", () => {
    const source = [
      readFileSync(RUNNER_PATH, "utf8"),
      readFileSync(EXECUTION_PATH, "utf8"),
      readFileSync(JOURNAL_PATH, "utf8")
    ].join("\n");
    expect(source).not.toMatch(/console\.log\([^)]*(?:rawTransaction|passwordBytes|secretScalar)/u);
    expect(source).not.toMatch(/process\.env\[/u);
    expect(source).toContain("mainnetWritePossible: false");
    expect(source).toContain("CONFIRMED_EXECUTION_SIGNED_ORDERS");
  });
});
