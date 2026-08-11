import {
  altanaBootstrapBrowserProjectionSchema,
  beginAltanaExecute,
  beginAltanaRevoke,
  createReadyAltanaExecute,
  createReadyAltanaRevoke,
  createSessionPublicGrantDescriptor,
  reconcileAltanaRevokeAuthority,
  settleAltanaExecuteSubmission,
  settleAltanaRevokeSubmission,
  type AltanaBootstrapBrowserProjection,
  type AltanaExecuteOperationState,
  type AltanaRevokeOperationState,
  type ExecuteAuthorization,
  type SessionAuthorityObservation
} from "@proofera/integrations";
import { renderToStaticMarkup } from "react-dom/server";
import { keccak256 } from "viem";
import { describe, expect, it } from "vitest";

import { MissionControlOperation } from "./mission-control-operation";

const GENERATOR_PUBLIC_KEY =
  "0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8" as const;
const SESSION_DESCRIPTOR = createSessionPublicGrantDescriptor(GENERATOR_PUBLIC_KEY);
const WALLET = "0x1111111111111111111111111111111111111111";
const TARGET = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x4444444444444444444444444444444444444444";
const POLICY_HASH = `0x${"aa".repeat(32)}`;
const BINDING_HASH = `0x${"bb".repeat(32)}`;
const NONCE = `0x${"cc".repeat(32)}`;
const CALLS_ID = `0x${"11".repeat(32)}` as `0x${string}`;
const TRANSACTION_HASH = `0x${"33".repeat(32)}` as `0x${string}`;
const CREATED_AT = "2026-08-11T12:00:00.000Z";
const AUTHORITY_AT = "2026-08-11T12:00:30.000Z";
const SUBMITTED_AT = "2026-08-11T12:01:00.000Z";
const SETTLED_AT = "2026-08-11T12:02:00.000Z";
const RECONCILED_AT = "2026-08-11T12:03:00.000Z";
const ISSUED_AT = Math.floor(Date.parse(CREATED_AT) / 1_000);
const SESSION_EXPIRY = Math.floor(Date.parse("2026-08-11T13:00:00.000Z") / 1_000);

type BootstrapStatus = AltanaBootstrapBrowserProjection["lifecycleStatus"];

function executeSpec(chainId: 56 | 97 = 97) {
  return {
    schemaVersion: 1 as const,
    kind: "execute" as const,
    chainId,
    walletAddress: WALLET,
    sessionKeyAddress: SESSION_DESCRIPTOR.address,
    sessionExpiry: SESSION_EXPIRY,
    policyHash: POLICY_HASH,
    operationId: "execute:lp-rebalance:0001",
    idempotencyKey: "execute:wallet-1:policy-a:0001",
    createdAt: CREATED_AT
  };
}

function revokeSpec(chainId: 56 | 97 = 97) {
  return {
    ...executeSpec(chainId),
    kind: "revoke" as const,
    operationId: "revoke:session-key:0001",
    idempotencyKey: "revoke:wallet-1:session-key:0001"
  };
}

function authority(
  status: SessionAuthorityObservation["status"] = "present_exact",
  observedAt = AUTHORITY_AT
): SessionAuthorityObservation {
  return {
    status,
    observedAt,
    walletAddress: WALLET,
    sessionKeyAddress: SESSION_DESCRIPTOR.address,
    policyHash: POLICY_HASH
  };
}

function authorization(): ExecuteAuthorization {
  return {
    asOf: SUBMITTED_AT,
    maximumAuthorityAgeSeconds: 300,
    revocationStatus: "active",
    authority: authority()
  };
}

function executeSubmitting(chainId: 56 | 97 = 97) {
  return beginAltanaExecute(createReadyAltanaExecute(executeSpec(chainId)), authorization());
}

function revokeSubmitting(chainId: 56 | 97 = 97) {
  return beginAltanaRevoke(createReadyAltanaRevoke(revokeSpec(chainId)), SUBMITTED_AT);
}

function relayConfirmedRevoke(chainId: 56 | 97 = 97) {
  return settleAltanaRevokeSubmission(
    revokeSubmitting(chainId),
    {
      kind: "returned",
      result: {
        callsId: CALLS_ID,
        status: "CONFIRMED",
        transactionHash: TRANSACTION_HASH
      }
    },
    SETTLED_AT
  );
}

function cleanupStatus(status: BootstrapStatus): AltanaBootstrapBrowserProjection["cleanupStatus"] {
  if (status === "cleanup_pending") return "pending";
  if (status === "cleanup_failed") return "failed";
  if (status === "cleaned") return "complete";
  if (
    status === "secret_outcome_unknown" ||
    status === "grant_outcome_unknown" ||
    status === "grant_rejected" ||
    status === "grant_failed" ||
    status === "grant_expired"
  ) {
    return "required";
  }
  return "not_required";
}

function hasSessionDescriptor(status: BootstrapStatus): boolean {
  return !["bootstrap_ready", "secret_provisioning", "secret_outcome_unknown"].includes(status);
}

function bootstrapProjection(
  status: BootstrapStatus = "execution_enabled",
  overrides: Partial<AltanaBootstrapBrowserProjection> = {}
): AltanaBootstrapBrowserProjection {
  const sessionKey = hasSessionDescriptor(status) ? SESSION_DESCRIPTOR : null;
  const executionEnabled = status === "execution_enabled";
  return altanaBootstrapBrowserProjectionSchema.parse({
    schemaVersion: 1,
    bootstrapId: "bootstrap:test:0001",
    userId: "user:proof-era:0001",
    chainId: 97,
    walletAddress: WALLET,
    policyHash: POLICY_HASH,
    nonce: NONCE,
    issuedAt: ISSUED_AT,
    bootstrapExpiresAt: ISSUED_AT + 300,
    sessionExpiry: SESSION_EXPIRY,
    bootstrapBindingHash: BINDING_HASH,
    lifecycleStatus: status,
    executionEnabled,
    grantRetryAllowed: false,
    cleanupStatus: cleanupStatus(status),
    sessionKey,
    grantIntent:
      sessionKey === null
        ? null
        : {
            schemaVersion: 1,
            chainId: 97,
            walletAddress: WALLET,
            sessionKey,
            permissions: {
              calls: [
                {
                  to: TARGET,
                  signature: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))"
                }
              ],
              spend: [{ token: TOKEN, limit: "1000000000000000000", period: "day" }]
            },
            expiry: SESSION_EXPIRY,
            registerInKeystore: true
          },
    ...overrides
  });
}

function markup(
  operation: AltanaExecuteOperationState | AltanaRevokeOperationState,
  bootstrap = bootstrapProjection()
): string {
  return renderToStaticMarkup(
    <MissionControlOperation operation={operation} bootstrap={bootstrap} />
  );
}

function operationPanel(html: string): string {
  const marker = html.indexOf("data-operation-kind=");
  const start = html.lastIndexOf("<article", marker);
  const end = html.indexOf("</article>", marker);
  if (start < 0 || end < 0) throw new Error("Operation panel was not rendered.");
  return html.slice(start, end);
}

const executeCases = [
  {
    status: "ready",
    state: () => createReadyAltanaExecute(executeSpec()),
    label: "Execution ready — not submitted",
    confirmed: false
  },
  {
    status: "submitting",
    state: () => executeSubmitting(),
    label: "Execution submitting — outcome pending",
    confirmed: false
  },
  {
    status: "pending",
    state: () =>
      settleAltanaExecuteSubmission(
        executeSubmitting(),
        { kind: "returned", result: { callsId: CALLS_ID, status: "PENDING" } },
        SETTLED_AT
      ),
    label: "Execution pending — not confirmed",
    confirmed: false
  },
  {
    status: "confirmed",
    state: () =>
      settleAltanaExecuteSubmission(
        executeSubmitting(),
        {
          kind: "returned",
          result: {
            callsId: CALLS_ID,
            status: "CONFIRMED",
            transactionHash: TRANSACTION_HASH
          }
        },
        SETTLED_AT
      ),
    label: "Execution confirmed",
    confirmed: true
  },
  {
    status: "failed",
    state: () =>
      settleAltanaExecuteSubmission(
        executeSubmitting(),
        { kind: "returned", result: { callsId: CALLS_ID, status: "FAILED" } },
        SETTLED_AT
      ),
    label: "Execution failed — not confirmed",
    confirmed: false
  },
  {
    status: "rejected",
    state: () =>
      settleAltanaExecuteSubmission(
        executeSubmitting(),
        { kind: "rejected", reason: "Wallet confirmation was rejected." },
        SETTLED_AT
      ),
    label: "Execution rejected — not confirmed",
    confirmed: false
  },
  {
    status: "outcome_unknown",
    state: () =>
      settleAltanaExecuteSubmission(
        executeSubmitting(),
        { kind: "threw", reason: "Relay disconnected after submission." },
        SETTLED_AT
      ),
    label: "Execution outcome unknown — do not retry",
    confirmed: false
  }
] as const;

const revokeCases = [
  {
    status: "ready",
    state: () => createReadyAltanaRevoke(revokeSpec()),
    label: "Revoke ready — not submitted",
    confirmed: false
  },
  {
    status: "submitting",
    state: () => revokeSubmitting(),
    label: "Revoke submitting — authority may still be active",
    confirmed: false
  },
  {
    status: "pending",
    state: () =>
      settleAltanaRevokeSubmission(
        revokeSubmitting(),
        { kind: "returned", result: { callsId: CALLS_ID, status: "PENDING" } },
        SETTLED_AT
      ),
    label: "Revoke pending — relay not confirmed",
    confirmed: false
  },
  {
    status: "confirmed",
    state: () =>
      reconcileAltanaRevokeAuthority(
        relayConfirmedRevoke(),
        authority("absent", "2026-08-11T12:02:30.000Z"),
        { asOf: RECONCILED_AT, maximumAuthorityAgeSeconds: 300 }
      ),
    label: "Revoked — fresh authority absence confirmed",
    confirmed: true
  },
  {
    status: "failed",
    state: () =>
      settleAltanaRevokeSubmission(
        revokeSubmitting(),
        { kind: "returned", result: { callsId: CALLS_ID, status: "FAILED" } },
        SETTLED_AT
      ),
    label: "Revoke failed — authority may still be active",
    confirmed: false
  },
  {
    status: "rejected",
    state: () =>
      settleAltanaRevokeSubmission(
        revokeSubmitting(),
        { kind: "rejected", reason: "Passkey request rejected." },
        SETTLED_AT
      ),
    label: "Revoke rejected — authority may still be active",
    confirmed: false
  },
  {
    status: "outcome_unknown",
    state: () =>
      settleAltanaRevokeSubmission(
        revokeSubmitting(),
        { kind: "threw", reason: "Relay disconnected after signing." },
        SETTLED_AT
      ),
    label: "Revoke outcome unknown — authority may still be active",
    confirmed: false
  }
] as const;

const bootstrapCases = [
  ["bootstrap_ready", "Bootstrap ready"],
  ["secret_provisioning", "Secret provisioning in progress"],
  ["secret_outcome_unknown", "Secret provisioning outcome unknown"],
  ["grant_ready", "Grant ready — not submitted"],
  ["grant_submitting", "Grant submitting — outcome pending"],
  ["grant_outcome_unknown", "Grant outcome unknown — no blind retry"],
  ["grant_rejected", "Grant rejected"],
  ["grant_failed", "Grant failed"],
  ["authority_pending", "Authority proof pending"],
  ["execution_enabled", "Authority verified for execution"],
  ["grant_expired", "Grant bootstrap expired"],
  ["cleanup_pending", "Secret cleanup pending"],
  ["cleanup_failed", "Secret cleanup failed"],
  ["cleaned", "Secret cleanup complete"]
] as const satisfies readonly (readonly [BootstrapStatus, string])[];

describe("MissionControlOperation", () => {
  it.each(executeCases)(
    "renders execute $status without optimistic confirmation",
    ({ state, status, label, confirmed }) => {
      const html = markup(state());
      const operation = operationPanel(html);

      expect(operation).toContain(`data-operation-status="${status}"`);
      expect(operation).toContain(
        `data-confirmation-state="${confirmed ? "confirmed" : "not-confirmed"}"`
      );
      expect(operation).toContain(label);
      if (confirmed) expect(operation).toContain("state-badge state-live");
      else expect(operation).not.toContain("state-badge state-live");
    }
  );

  it.each(revokeCases)(
    "renders revoke $status without optimistic confirmation",
    ({ state, status, label, confirmed }) => {
      const html = markup(state());
      const operation = operationPanel(html);

      expect(operation).toContain(`data-operation-status="${status}"`);
      expect(operation).toContain(
        `data-confirmation-state="${confirmed ? "confirmed" : "not-confirmed"}"`
      );
      expect(operation).toContain(label);
      if (confirmed) expect(operation).toContain("state-badge state-live");
      else expect(operation).not.toContain("state-badge state-live");
    }
  );

  it.each(bootstrapCases)(
    "renders bootstrap status %s from the typed projection",
    (status, label) => {
      const projection = bootstrapProjection(status);
      const html = markup(createReadyAltanaExecute(executeSpec()), projection);

      expect(html).toContain(`data-bootstrap-status="${status}"`);
      expect(html).toContain(label);
      expect(html).toContain(
        `data-execution-enabled="${status === "execution_enabled" ? "true" : "false"}"`
      );
      if (status === "execution_enabled") {
        expect(html).toContain("Execution is enabled by the typed browser projection");
      } else {
        expect(html).toContain("Execution is disabled by the typed browser projection");
      }
    }
  );

  it("does not infer bootstrap execution enablement from the lifecycle label", () => {
    const projection = bootstrapProjection("execution_enabled", { executionEnabled: false });
    const html = markup(createReadyAltanaExecute(executeSpec()), projection);

    expect(html).toContain('data-bootstrap-status="execution_enabled"');
    expect(html).toContain('data-execution-enabled="false"');
    expect(html).toContain("Execution is disabled by the typed browser projection");
  });

  it("keeps an SDK-confirmed revoke pending until fresh authority absence", () => {
    const html = markup(relayConfirmedRevoke());
    const operation = operationPanel(html);

    expect(operation).toContain('data-operation-status="pending"');
    expect(operation).toContain('data-confirmation-state="not-confirmed"');
    expect(operation).toContain("Revoke pending — fresh authority absence required");
    expect(operation).toContain(
      "Relay confirmed; revocation is still pending until a fresh authority probe shows the session absent."
    );
    expect(operation).not.toContain("state-badge state-live");
  });

  it("uses exact confirmed-revoke wording only after fresh authority absence", () => {
    const confirmed = reconcileAltanaRevokeAuthority(
      relayConfirmedRevoke(),
      authority("absent", "2026-08-11T12:02:30.000Z"),
      { asOf: RECONCILED_AT, maximumAuthorityAgeSeconds: 300 }
    );
    const operation = operationPanel(markup(confirmed));

    expect(operation).toContain("Revoked — fresh authority absence confirmed");
    expect(operation).toContain(
      "Revocation is final only because a fresh authority observation proved the session absent."
    );
    expect(operation).toContain("fresh authority absent at");
    expect(operation).toContain('data-confirmation-state="confirmed"');
  });

  it("renders calls and transaction identifiers only when the typed state contains them", () => {
    const readyHtml = markup(createReadyAltanaExecute(executeSpec()));
    expect(readyHtml).not.toContain("Calls ID");
    expect(readyHtml).not.toContain("Transaction hash");
    expect(readyHtml).not.toContain(CALLS_ID);
    expect(readyHtml).not.toContain(TRANSACTION_HASH);

    const pending = settleAltanaExecuteSubmission(
      executeSubmitting(),
      { kind: "returned", result: { callsId: CALLS_ID, status: "PENDING" } },
      SETTLED_AT
    );
    const pendingHtml = markup(pending);
    expect(pendingHtml).toContain("Calls ID");
    expect(pendingHtml).toContain(CALLS_ID);
    expect(pendingHtml).not.toContain("Transaction hash");
    expect(pendingHtml).not.toContain(TRANSACTION_HASH);

    const confirmed = executeCases[3].state();
    const confirmedHtml = markup(confirmed);
    expect(confirmedHtml).toContain(CALLS_ID);
    expect(confirmedHtml).toContain(TRANSACTION_HASH);
  });

  it("uses only fixed chain-specific explorer origins and separates mainnet from testnet", () => {
    const mainnetConfirmed = settleAltanaExecuteSubmission(
      executeSubmitting(56),
      {
        kind: "returned",
        result: {
          callsId: CALLS_ID,
          status: "CONFIRMED",
          transactionHash: TRANSACTION_HASH
        }
      },
      SETTLED_AT
    );
    const html = markup(mainnetConfirmed);

    expect(html).toContain('data-environment="mainnet"');
    expect(html).toContain("BSC mainnet · chain 56");
    expect(html).toContain('data-bootstrap-environment="testnet"');
    expect(html).toContain("BSC testnet · chain 97");
    expect(html).toContain(`href="https://bscscan.com/address/${WALLET}"`);
    expect(html).toContain(`href="https://bscscan.com/tx/${TRANSACTION_HASH}"`);
    expect(html).toContain(
      `href="https://testnet.altana.network/account/${bootstrapProjection().walletAddress}"`
    );
    expect(html).toContain("public binding does not match this operation");

    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    expect(
      hrefs.every(
        (href) =>
          href?.startsWith("https://bscscan.com/") === true ||
          href?.startsWith("https://testnet.altana.network/") === true
      )
    ).toBe(true);
  });

  it("links testnet wallet, session, transaction, and public-key evidence through fixed origins", () => {
    const confirmed = executeCases[3].state();
    const html = markup(confirmed);

    expect(html).toContain(`href="https://testnet.bscscan.com/address/${WALLET}"`);
    expect(html).toContain(
      `href="https://testnet.bscscan.com/address/${SESSION_DESCRIPTOR.address.toLowerCase()}"`
    );
    expect(html).toContain(`href="https://testnet.bscscan.com/tx/${TRANSACTION_HASH}"`);
    expect(html).toContain(
      `href="https://testnet.altana.network/key/${keccak256(SESSION_DESCRIPTOR.publicKey)}"`
    );
  });

  it("escapes hostile reason text and never turns it into markup or a link", () => {
    const hostile = '<img src=x onerror="steal()"><script>alert(1)</script>';
    const rejected = settleAltanaRevokeSubmission(
      revokeSubmitting(),
      { kind: "rejected", reason: hostile },
      SETTLED_AT
    );
    const html = markup(rejected);

    expect(html).toContain(
      "&lt;img src=x onerror=&quot;steal()&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain(`href="${hostile}"`);
  });

  it.each([
    () => executeCases[4].state(),
    () => executeCases[5].state(),
    () => executeCases[6].state(),
    () => revokeCases[4].state(),
    () => revokeCases[5].state(),
    () => revokeCases[6].state()
  ])("renders non-retryable terminal state text without any action control", (state) => {
    const html = markup(state());

    expect(html).toContain("Not allowed; no retry control is rendered.");
    expect(html).not.toMatch(/<(?:button|form|input|select|textarea)\b/);
    expect(html).not.toMatch(/onClick|signMessage|signTransaction|connectWallet/);
  });

  it("always renders public operation bindings and never private signer material", () => {
    const operation = executeCases[3].state();
    const html = markup(operation);

    for (const value of [
      operation.walletAddress,
      operation.sessionKeyAddress,
      operation.policyHash,
      operation.operationId,
      operation.idempotencyKey,
      bootstrapProjection().bootstrapId,
      bootstrapProjection().bootstrapBindingHash,
      SESSION_DESCRIPTOR.publicKey
    ]) {
      expect(html).toContain(value);
    }
    expect(html).not.toMatch(/private.?key|secretHandle|wallet signer/i);
  });

  it("preserves an extreme typed expiry without throwing or inventing a UTC date", () => {
    const operation = createReadyAltanaExecute({
      ...executeSpec(),
      sessionExpiry: Number.MAX_SAFE_INTEGER
    });

    expect(() => markup(operation)).not.toThrow();
    const html = markup(operation);
    expect(html).toContain(Number.MAX_SAFE_INTEGER.toString());
    expect(html).toContain("Unknown — expiry cannot be represented safely as UTC");
  });
});
