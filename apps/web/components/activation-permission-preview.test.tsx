import {
  ACTIVATION_POLICY_VERSION,
  buildActivationPermissionPreview,
  type ActivationPolicy
} from "@proofera/domain";
import { renderToStaticMarkup } from "react-dom/server";
import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";

import { ActivationPermissionPreviewView } from "./activation-permission-preview";

const MAX_UINT256 = (2n ** 256n - 1n).toString(10);
const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";
const TOKEN_WITHOUT_METADATA = "0x6666666666666666666666666666666666666666";
const WALLET = "0x3333333333333333333333333333333333333333";
const MANAGER_A = "0x4444444444444444444444444444444444444444";
const MANAGER_B = "0x5555555555555555555555555555555555555555";
const CODE_HASH_A = `0x${"aa".repeat(32)}`;
const CODE_HASH_B = `0x${"bb".repeat(32)}`;
const SIGNATURE_A = "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))" as const;
const SIGNATURE_B = "collect((uint256,address,uint128,uint128))" as const;

function policyFixture(): ActivationPolicy {
  return {
    agentId: '<img src=x onerror="steal()">',
    calls: [
      {
        contractLabel: "<svg onload=steal()>",
        expectedIdentity: { codeHash: CODE_HASH_A, kind: "code_hash" },
        operationKind: "direct",
        selector: toFunctionSelector(SIGNATURE_A),
        signature: SIGNATURE_A,
        to: MANAGER_A
      },
      {
        contractLabel: "Position Manager B",
        expectedIdentity: {
          implementationAddress: MANAGER_B,
          implementationCodeHash: CODE_HASH_B,
          kind: "implementation"
        },
        operationKind: "dispatcher",
        selector: toFunctionSelector(SIGNATURE_B),
        signature: SIGNATURE_B,
        to: MANAGER_B
      }
    ],
    capital: [
      { address: TOKEN_A, amountRaw: MAX_UINT256, decimals: 18, symbol: "</script>" },
      { address: TOKEN_B, amountRaw: "900719925474099312345678", decimals: 6, symbol: "TKB" }
    ],
    category: "lp-rebalancing",
    chain: { chainId: 97, environment: "testnet", name: "BSC Testnet" },
    deadlineSeconds: 300,
    emergency: {
      onDeviation: "block-and-alert",
      onStaleQuote: "block",
      userCanRevoke: true
    },
    enforcement: {
      callPermissions: "altana_onchain",
      grantConfirmation: "wallet_confirmation",
      runtimeConstraints: "proofera_runtime",
      sessionExpiry: "altana_onchain",
      spendLimits: "altana_onchain"
    },
    expiry: Math.floor(Date.parse("2026-08-11T13:00:00.000Z") / 1_000),
    maxExecutionsPerDay: 4,
    minimumAmounts: [
      { amountRaw: MAX_UINT256, token: TOKEN_A },
      { amountRaw: "123456789012345678", token: TOKEN_B },
      { amountRaw: "1", token: TOKEN_WITHOUT_METADATA }
    ],
    quote: {
      observedAt: "2026-08-11T11:59:00.000Z",
      sourceUrl: `https://testnet.bscscan.com/address/${MANAGER_A}`,
      validUntil: "2026-08-11T12:05:00.000Z"
    },
    recipient: WALLET,
    registerInKeystore: true,
    slippageBps: 50,
    spend: [
      { limitRaw: MAX_UINT256, period: "day", token: TOKEN_A },
      { limitRaw: "900719925474099312345678", period: "week", token: TOKEN_B },
      { limitRaw: "1", period: "hour", token: TOKEN_WITHOUT_METADATA }
    ],
    tickRange: { lower: -600, upper: 600 },
    tokenId: MAX_UINT256,
    transactionDeadline: Math.floor(Date.parse("2026-08-11T12:04:00.000Z") / 1_000),
    version: ACTIVATION_POLICY_VERSION,
    wallet: WALLET
  };
}

function renderedPreview() {
  const preview = buildActivationPermissionPreview(policyFixture());
  return {
    html: renderToStaticMarkup(<ActivationPermissionPreviewView preview={preview} />),
    preview
  };
}

describe("ActivationPermissionPreviewView", () => {
  it("leads with the exact worst-case text and states that no activation occurred", () => {
    const { html, preview } = renderedPreview();

    expect(html).toContain(preview.worstCase);
    expect(html.indexOf(preview.worstCase)).toBeLessThan(html.indexOf("Identity and authority"));
    expect(html).toContain("Preview only. No activation or transaction has occurred.");
    expect(html).toContain(preview.scopeBoundary);
    expect(html).toContain("This preview is not an activation or transaction.");
  });

  it("renders hostile PlainText labels only as escaped text nodes", () => {
    const { html } = renderedPreview();

    expect(html).toContain("&lt;img src=x onerror=&quot;steal()&quot;&gt;");
    expect(html).toContain("&lt;svg onload=steal()&gt;");
    expect(html).toContain("&lt;/script&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("</script>");
  });

  it("renders every enforcement owner with its exact label", () => {
    const { html } = renderedPreview();

    for (const owner of ["Altana/onchain", "ProofEra runtime", "wallet confirmation"] as const) {
      expect(html).toContain(`data-enforcement-owner="${owner}"`);
      expect(html).toContain(`>${owner}</span>`);
    }
  });

  it("keeps each target, selector, signature, and expected identity in one call row", () => {
    const { html, preview } = renderedPreview();

    for (const row of preview.callRows) {
      const start = html.indexOf(`data-call-row="${row.rowId}"`);
      const end = html.indexOf("</tr>", start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      const callMarkup = html.slice(start, end);
      expect(callMarkup).toContain(row.contractAddress);
      expect(callMarkup).toContain(row.selector);
      expect(callMarkup).toContain(row.signature);
      if (row.expectedIdentity.kind === "code_hash") {
        expect(callMarkup).toContain(row.expectedIdentity.codeHash);
      } else {
        expect(callMarkup).toContain(row.expectedIdentity.implementationAddress);
        expect(callMarkup).toContain(row.expectedIdentity.implementationCodeHash);
      }
    }
  });

  it("preserves maximum uint256 strings and exposes missing token metadata", () => {
    const { html } = renderedPreview();

    expect(html.split(MAX_UINT256)).toHaveLength(5);
    expect(html).toContain(TOKEN_WITHOUT_METADATA);
    expect(html).toContain("Unknown — symbol not supplied (metadata status: missing)");
    expect(html).toContain("Unknown — decimals not supplied (metadata status: missing)");
    expect(html).toContain('data-metadata-status="missing"');
  });

  it("renders every frozen runtime constraint without inventing execution evidence", () => {
    const { html, preview } = renderedPreview();

    for (const row of preview.constraintRows) {
      expect(html).toContain(`data-constraint-kind="${row.kind}"`);
      expect(html).toContain(row.worstCase);
    }
    expect(html).toContain("Unknown — ProofEra runtime must recompute age");
    expect(html).toContain("Source URL / text only");
    expect(html).not.toContain(`<a href="${policyFixture().quote.sourceUrl}"`);
    expect(html).not.toContain("Estimated price");
    expect(html).not.toContain("Estimated fee");
    expect(html).not.toContain("Token approval granted");
    expect(html).not.toContain("Transaction hash");
    expect(html).not.toContain("Activation successful");
  });

  it("shows the network, wallet, expiry, and exact policy binding", () => {
    const { html, preview } = renderedPreview();

    expect(html).toContain("BSC Testnet · chain 97 · testnet");
    expect(html).toContain(WALLET);
    expect(html).toContain("2026-08-11T13:00:00.000Z");
    expect(html).toContain(preview.policyHash);
    expect(html).toContain(preview.policyVersion);
    expect(html).toContain(`>${preview.schemaVersion}</dd>`);
  });
});
