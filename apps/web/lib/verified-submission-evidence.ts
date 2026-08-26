import { z } from "zod";

import altanaLifecycleArtifact from "../../../evidence/submission/final/altana-lifecycle.json";
import registrationArtifact from "../../../evidence/submission/final/agent-registration.json";
import hireArtifact from "../../../evidence/termix/hire-receipts/125715654-7fa5ad3e.json";
import termixArtifact from "../../../evidence/submission/final/termix/6d1adf3c948e49be7d9d42332df04904fdd43e3a/paired-report.json";

import type { ReferenceAnalyzerCategory } from "./reference-analyzer-passport";

const addressSchema = z.string().regex(/^0x[0-9a-f]{40}$/iu);
const hashSchema = z.string().regex(/^0x[0-9a-f]{64}$/iu);

const registration = z
  .object({
    classification: z.object({
      bscTestnetIdentityRegistrationVerified: z.literal(true),
      executionAuthority: z.literal(false),
      marketplaceEligibilityProven: z.literal(false),
      performanceEvidence: z.literal(false)
    }),
    network: z.object({ chainId: z.literal(97), observedAtUtc: z.iso.datetime() }),
    agents: z
      .array(
        z.object({
          key: z.enum(["lp-range", "grid-trading", "yield-optimisation", "health-factor"]),
          agentId: z.string().regex(/^(?:0|[1-9][0-9]*)$/u),
          owner: addressSchema,
          registrationTransactionHash: hashSchema
        })
      )
      .length(4)
  })
  .parse(registrationArtifact);

const hires = z
  .object({
    classification: z.object({
      artifact: z.literal("finalized_paid_testnet_hire_evidence"),
      taskCompletion: z.literal(false),
      agentPerformance: z.literal(false),
      executionAuthority: z.literal(false),
      mainnet: z.literal(false)
    }),
    chainId: z.literal(97),
    hires: z.array(
      z.object({
        slug: z.string().min(1),
        agentId: z.string().regex(/^(?:0|[1-9][0-9]*)$/u),
        termixHireReceipt: z.object({
          state: z.literal("verified"),
          transactionHash: hashSchema,
          explorerUrl: z.url(),
          observedAtUtc: z.iso.datetime(),
          verifiedAtUtc: z.iso.datetime()
        })
      })
    )
  })
  .parse(hireArtifact);

const altanaLifecycle = z
  .object({
    classification: z.object({
      authorityAbsentAfterRevoke: z.literal(true),
      authorityPresentForExecution: z.literal(true),
      executeReceiptVerified: z.literal(true),
      grantReceiptVerified: z.literal(true),
      revokeReceiptVerified: z.literal(true),
      ptaZeroApprovalEventVerified: z.literal(true),
      twoProviderFinalAuthorityAbsenceVerified: z.literal(true),
      twoProviderHistoricalAuthorityVerified: z.literal(false)
    }),
    intent: z.object({
      chainId: z.literal(97),
      expiry: z.number().int().positive(),
      walletAddress: addressSchema,
      sessionKey: z.object({ address: addressSchema }),
      permissions: z.object({
        calls: z.tuple([z.object({ signature: z.string().min(1), to: addressSchema })]),
        spend: z.tuple([
          z.object({
            limit: z.string().regex(/^(?:0|[1-9][0-9]*)$/u),
            period: z.string().min(1),
            token: z.null()
          })
        ])
      })
    }),
    operations: z.object({
      grant: z.object({ transactionHash: hashSchema }),
      execute: z.object({ transactionHash: hashSchema, callsId: hashSchema }),
      revoke: z.object({ transactionHash: hashSchema, callsId: hashSchema })
    }),
    applicationEvidence: z.object({
      amount: z.literal("0"),
      contractAddress: addressSchema,
      eventSignature: z.literal("Approval(address,address,uint256)"),
      owner: addressSchema,
      spender: addressSchema,
      transactionHash: hashSchema
    })
  })
  .parse(altanaLifecycleArtifact);

const termixReport = z
  .object({
    schemaVersion: z.literal("proofera-termix-final-bundle-v1.0.0"),
    pairs: z
      .array(
        z.object({
          taskId: z.enum([
            "pancake-lp-range-decision",
            "autonomous-session-permission-audit",
            "venus-health-factor-decision"
          ]),
          duration: z.object({
            agentNanoseconds: z.string().regex(/^(?:0|[1-9][0-9]*)$/u),
            manualNanoseconds: z.string().regex(/^(?:0|[1-9][0-9]*)$/u),
            manualMinusAgentNanoseconds: z.string().regex(/^-?(?:0|[1-9][0-9]*)$/u)
          }),
          costs: z.tuple([
            z.object({
              agentMinorUnits: z.literal("0"),
              manualMinorUnits: z.literal("0"),
              denomination: z.object({ symbol: z.enum(["BNB", "tBNB"]) })
            })
          ]),
          quality: z.object({
            agentPoints: z.literal(100),
            manualPoints: z.literal(100),
            maximumPoints: z.literal(100)
          })
        })
      )
      .length(3)
  })
  .parse(termixArtifact);

const categoryToAgentKey = Object.freeze({
  "lp-rebalancing": "lp-range",
  "grid-trading": "grid-trading",
  "yield-optimisation": "yield-optimisation",
  "health-factor-monitoring": "health-factor"
} as const satisfies Record<
  ReferenceAnalyzerCategory,
  (typeof registration.agents)[number]["key"]
>);

export interface VerifiedReferenceEvidence {
  readonly agentId: string;
  readonly category: ReferenceAnalyzerCategory;
  readonly owner: string;
  readonly registrationObservedAtUtc: string;
  readonly registrationTransactionHash: string;
  readonly paidHireReceipts: readonly Readonly<{
    explorerUrl: string;
    observedAtUtc: string;
    slug: string;
    transactionHash: string;
  }>[];
}

export const verifiedReferenceEvidence: readonly VerifiedReferenceEvidence[] = Object.freeze(
  (Object.keys(categoryToAgentKey) as ReferenceAnalyzerCategory[]).map((category) => {
    const key = categoryToAgentKey[category];
    const agent = registration.agents.find((candidate) => candidate.key === key);
    if (agent === undefined) throw new TypeError(`Missing finalized identity for ${category}.`);
    const paidHireReceipts = hires.hires
      .filter((hire) => hire.agentId === agent.agentId)
      .map((hire) =>
        Object.freeze({
          explorerUrl: hire.termixHireReceipt.explorerUrl,
          observedAtUtc: hire.termixHireReceipt.observedAtUtc,
          slug: hire.slug,
          transactionHash: hire.termixHireReceipt.transactionHash
        })
      );
    return Object.freeze({
      agentId: agent.agentId,
      category,
      owner: agent.owner,
      registrationObservedAtUtc: registration.network.observedAtUtc,
      registrationTransactionHash: agent.registrationTransactionHash,
      paidHireReceipts: Object.freeze(paidHireReceipts)
    });
  })
);

export function verifiedReferenceEvidenceForCategory(
  category: ReferenceAnalyzerCategory
): VerifiedReferenceEvidence {
  const evidence = verifiedReferenceEvidence.find((candidate) => candidate.category === category);
  if (evidence === undefined) throw new TypeError(`Missing verified evidence for ${category}.`);
  return evidence;
}

export const verifiedAltanaLifecycle = Object.freeze({
  chainId: altanaLifecycle.intent.chainId,
  walletAddress: altanaLifecycle.intent.walletAddress,
  sessionKeyAddress: altanaLifecycle.intent.sessionKey.address,
  expiresAtUnixSeconds: altanaLifecycle.intent.expiry,
  allowedCall: Object.freeze({
    signature: altanaLifecycle.intent.permissions.calls[0].signature,
    target: altanaLifecycle.intent.permissions.calls[0].to
  }),
  nativeSpendCap: Object.freeze({
    limitWei: altanaLifecycle.intent.permissions.spend[0].limit,
    period: altanaLifecycle.intent.permissions.spend[0].period
  }),
  grantTransactionHash: altanaLifecycle.operations.grant.transactionHash,
  executeTransactionHash: altanaLifecycle.operations.execute.transactionHash,
  revokeTransactionHash: altanaLifecycle.operations.revoke.transactionHash,
  executeCallsId: altanaLifecycle.operations.execute.callsId,
  revokeCallsId: altanaLifecycle.operations.revoke.callsId,
  applicationAmountRaw: altanaLifecycle.applicationEvidence.amount,
  applicationContract: altanaLifecycle.applicationEvidence.contractAddress,
  finalAuthorityAbsent: altanaLifecycle.classification.authorityAbsentAfterRevoke,
  finalAuthorityAbsenceProviderCount: 2,
  historicalAuthorityProviderCount: 1,
  taskEffect: "PTA Approval(owner, session, 0) only" as const
});

const termixTaskLabels = Object.freeze({
  "pancake-lp-range-decision": "Pancake LP boundary decision",
  "autonomous-session-permission-audit": "Altana permission-security audit",
  "venus-health-factor-decision": "Venus health-factor decision"
} as const);

export const verifiedTermixPairs = Object.freeze(
  termixReport.pairs.map((pair) =>
    Object.freeze({
      taskId: pair.taskId,
      label: termixTaskLabels[pair.taskId],
      agentNanoseconds: pair.duration.agentNanoseconds,
      manualNanoseconds: pair.duration.manualNanoseconds,
      timingWinner:
        BigInt(pair.duration.agentNanoseconds) < BigInt(pair.duration.manualNanoseconds)
          ? ("agent" as const)
          : ("manual" as const),
      agentQualityPoints: pair.quality.agentPoints,
      manualQualityPoints: pair.quality.manualPoints,
      maximumQualityPoints: pair.quality.maximumPoints,
      agentCostMinorUnits: pair.costs[0].agentMinorUnits,
      manualCostMinorUnits: pair.costs[0].manualMinorUnits,
      costSymbol: pair.costs[0].denomination.symbol
    })
  )
);
