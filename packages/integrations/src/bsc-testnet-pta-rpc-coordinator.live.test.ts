import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prepareBscTestnetPtaDeploymentObservation } from "./bsc-testnet-pta-deployment-observation.server";

const runLive = process.env.PROOFERA_RUN_BSC_TESTNET_RPC === "1";
const evidenceOutput = process.env.PROOFERA_BSC_TESTNET_RPC_EVIDENCE_OUTPUT;

function reviewedDeploymentData(): string {
  const source = readFileSync(
    new URL("./bsc-testnet-pta-deployment-envelope.test.ts", import.meta.url),
    "utf8"
  );
  const matched = /const DEPLOYMENT_DATA =\s+"(0x[0-9a-f]+)";/u.exec(source)?.[1];
  if (matched === undefined) throw new Error("The reviewed deployment fixture is unavailable.");
  return matched;
}

describe("BSC testnet PTA official-RPC observation", () => {
  it.runIf(runLive)(
    "corroborates the reviewed payload without authorizing a signature or write",
    async () => {
      const result = await prepareBscTestnetPtaDeploymentObservation(reviewedDeploymentData());

      expect(result.status).not.toBe("unavailable");
      expect(result.signingReady).toBe(false);
      expect(result.boundary).toMatchObject({
        rpcReadPerformed: true,
        providerAgreementVerified: true,
        signingAuthorized: false,
        transactionSubmitted: false,
        blockchainWritePerformed: false
      });
      if (result.status === "observed") {
        expect(result.envelopeValid).toBe(true);
      } else {
        expect(result.issues.length).toBeGreaterThan(0);
      }
      if (evidenceOutput !== undefined) {
        const publicRecord = {
          schemaVersion: 1,
          recordType: "bsc_testnet_pta_read_only_deployment_observation",
          status: result.status,
          attemptedAt: result.attemptedAt,
          address: "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49",
          chainId: 97,
          observation: result.observation,
          finances: result.finances,
          predictedContractAddress: result.predictedContractAddress,
          issues: result.issues.map(({ code, path }) => ({ code, path })),
          envelopeHash: result.status === "observed" ? result.envelope.envelopeHash : null,
          boundaries: {
            ...result.boundary,
            funded: result.finances === null ? null : result.finances.balanceWei !== "0",
            privateKeyIncluded: false,
            walletPasswordIncluded: false,
            signedTransactionIncluded: false,
            transactionHashIncluded: false,
            deploymentReceiptIncluded: false
          },
          sourceUrls: [
            "https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/",
            "https://bsc-testnet-dataseed.bnbchain.org",
            "https://bsc-testnet.bnbchain.org"
          ],
          limitations: [
            "This is a read-only two-provider observation, not authenticated provider provenance or signing authority.",
            "The gas estimate uses each provider's latest state because the public endpoint does not retain the pinned finalized state trie.",
            "Every signer must recollect and revalidate fresh state; the envelope and observation digest are not capabilities.",
            "No secret, signature, transaction submission, blockchain write, deployment, or explorer receipt exists."
          ]
        };
        await writeFile(evidenceOutput, `${JSON.stringify(publicRecord, null, 2)}\n`, {
          encoding: "utf8",
          flag: "wx"
        });
      }
    },
    60_000
  );
});
