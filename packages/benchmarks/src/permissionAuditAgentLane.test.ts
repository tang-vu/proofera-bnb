import { describe, expect, it, vi } from "vitest";

import { canonicalJson, sha256Bytes } from "./canonical.js";
import { auditPermissionBundle } from "./permissionAudit.js";
import {
  PERMISSION_AUDIT_AGENT_ENDPOINT,
  PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256,
  runPermissionAuditAgentTermixMethod,
  type PermissionAuditAgentFetch,
  type PermissionAuditAgentHttpResponse
} from "./permissionAuditAgentLane.js";
import {
  PERMISSION_AUDIT_RPC_ENDPOINT,
  buildPermissionAuditRpcPlan,
  permissionAuditRpcIdPrefix
} from "./permissionAuditRpc.js";
import {
  PERMISSION_AUDIT_FIXTURE_RUN_ID,
  permissionAuditFixtureAgentRequest,
  permissionAuditFixtureBundle,
  permissionAuditFixtureRpcResponses
} from "./permissionAuditTestFixture.js";
import { type TermixRunnerClock } from "./runner.js";

function clock(): TermixRunnerClock {
  const utc = [0, 1, 2, 3, 4, 5, 6].map((seconds) => new Date(`2026-08-17T01:00:0${seconds}.000Z`));
  const monotonic = [100n, 200n, 300n, 400n, 500n, 600n, 700n, 800n, 900n, 1_000n, 1_100n, 1_200n];
  return {
    monotonicClockLabel: "Injected monotonic fixture",
    monotonicNowNanoseconds: () => required(monotonic.shift()),
    utcNow: () => required(utc.shift())
  };
}

function response(body: string, status = 200): PermissionAuditAgentHttpResponse {
  return {
    headers: {
      get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : null)
    },
    status,
    text: async () => body
  };
}

function fetchFixture(
  outputOverride: Readonly<Record<string, unknown>> = {}
): PermissionAuditAgentFetch {
  const bundle = permissionAuditFixtureBundle();
  const plan = buildPermissionAuditRpcPlan(
    bundle,
    permissionAuditRpcIdPrefix(PERMISSION_AUDIT_FIXTURE_RUN_ID)
  );
  const rpcResponses = permissionAuditFixtureRpcResponses(plan.map(({ exchangeId }) => exchangeId));
  const responseById = new Map(plan.map((entry, index) => [entry.exchangeId, rpcResponses[index]]));
  return async (url, init) => {
    const request = JSON.parse(init.body) as { id: string };
    if (url === PERMISSION_AUDIT_RPC_ENDPOINT) {
      return response(required(responseById.get(request.id)));
    }
    const output = { ...auditPermissionBundle(bundle), ...outputOverride };
    return response(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: {
          kind: "message",
          messageId: "permission-audit-result",
          parts: [{ data: output, kind: "data" }],
          role: "agent"
        }
      })
    );
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
}

describe("permission audit agent TermiX lane", () => {
  it("captures the fixed RPC plan before the digest-bound public A2A output", async () => {
    const bundle = permissionAuditFixtureBundle();
    const canonicalBundle = canonicalJson(bundle);
    const capture = await runPermissionAuditAgentTermixMethod({
      bundleCanonicalJson: canonicalBundle,
      bundleSha256: sha256Bytes(canonicalBundle),
      clock: clock(),
      fetch: fetchFixture(),
      request: permissionAuditFixtureAgentRequest(
        PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256,
        PERMISSION_AUDIT_AGENT_ENDPOINT,
        PERMISSION_AUDIT_RPC_ENDPOINT
      )
    });
    expect(capture.methodKind).toBe("agent");
    expect(capture.apiResponses).toHaveLength(5);
    expect(
      capture.apiResponses
        .slice(0, 4)
        .every(({ endpointUrl }) => endpointUrl === PERMISSION_AUDIT_RPC_ENDPOINT)
    ).toBe(true);
    expect(capture.apiResponses[4]?.endpointUrl).toBe(PERMISSION_AUDIT_AGENT_ENDPOINT);
    expect(capture.timing.activeSegments).toHaveLength(5);
    expect(capture.boundaries.agentWasRegisteredBeforeStart).toBe(true);
    expect(capture.boundaries.hireReceiptWasVerifiedBeforeStart).toBe(true);
  });

  it("rejects an output bound to a different bundle", async () => {
    const bundle = permissionAuditFixtureBundle();
    const canonicalBundle = canonicalJson(bundle);
    await expect(
      runPermissionAuditAgentTermixMethod({
        bundleCanonicalJson: canonicalBundle,
        bundleSha256: sha256Bytes(canonicalBundle),
        clock: clock(),
        fetch: fetchFixture({ bundleSha256: "f".repeat(64) }),
        request: permissionAuditFixtureAgentRequest(
          PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256,
          PERMISSION_AUDIT_AGENT_ENDPOINT,
          PERMISSION_AUDIT_RPC_ENDPOINT
        )
      })
    ).rejects.toThrow("TERMIX_PERMISSION_AUDIT_AGENT_OUTPUT_BINDING_MISMATCH");
  });

  it("rejects a declaration endpoint drift before network access", async () => {
    const bundle = permissionAuditFixtureBundle();
    const canonicalBundle = canonicalJson(bundle);
    const fetchRequest = vi.fn(fetchFixture());
    await expect(
      runPermissionAuditAgentTermixMethod({
        bundleCanonicalJson: canonicalBundle,
        bundleSha256: sha256Bytes(canonicalBundle),
        clock: clock(),
        fetch: fetchRequest,
        request: permissionAuditFixtureAgentRequest(
          PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256,
          "https://example.com/",
          PERMISSION_AUDIT_RPC_ENDPOINT
        )
      })
    ).rejects.toThrow("TERMIX_PERMISSION_AUDIT_AGENT_ENDPOINT_BINDING_MISMATCH");
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("rejects an unregistered agent through the outer gate before network access", async () => {
    const bundle = permissionAuditFixtureBundle();
    const canonicalBundle = canonicalJson(bundle);
    const candidate = permissionAuditFixtureAgentRequest(
      PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256,
      PERMISSION_AUDIT_AGENT_ENDPOINT,
      PERMISSION_AUDIT_RPC_ENDPOINT
    );
    candidate.method = {
      agentReference: { reason: "No live identity", state: "unregistered" },
      configurationSha256: PERMISSION_AUDIT_AGENT_LANE_CONFIGURATION_SHA256,
      kind: "agent",
      label: "Unregistered fixture",
      marketplace: "ProofEra",
      runtime: "fixture"
    };
    const fetchRequest = vi.fn(fetchFixture());
    await expect(
      runPermissionAuditAgentTermixMethod({
        bundleCanonicalJson: canonicalBundle,
        bundleSha256: sha256Bytes(canonicalBundle),
        clock: clock(),
        fetch: fetchRequest,
        request: candidate
      })
    ).rejects.toThrow();
    expect(fetchRequest).not.toHaveBeenCalled();
  });
});
