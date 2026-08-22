import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Bytes } from "./canonical.js";
import {
  buildPancakeLpPair,
  buildVenusHealthPair,
  type BuildObservationalPairInput
} from "./observationalPair.js";

const ROOT = new URL("../../../", import.meta.url);
const REVIEWED_AT_UTC = "2026-08-22T15:00:00.000Z";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(path, ROOT), "utf8")) as unknown;
}

const lpSources = {
  agentCapturePath: "evidence/termix/runs/pancake-lp/pancake-lp-agent-20260818-v4.json",
  agentInvocationPath: "evidence/termix/invocations/pancake-lp-agent-20260818-v4.canonical-json",
  declarationPath: "evidence/termix/declarations/pancake-lp/f8b57f2b1842-125735511.json",
  inputPath: "evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json",
  manualCapturePath: "evidence/termix/runs/pancake-lp/manual/pancake-lp-manual-20260818-v1.json",
  operatorProcedurePath: "scripts/operator-ceremony-server.mjs",
  runOrderPath: "evidence/termix/declarations/pancake-lp/f8b57f2b1842-125735511.run-order.json"
} as const;

const venusSources = {
  agentCapturePath: "evidence/termix/runs/venus-health/venus-health-agent-20260818-v2.json",
  agentInvocationPath: "evidence/termix/invocations/venus-health-agent-20260818-v2.canonical-json",
  declarationPath: "evidence/termix/declarations/venus-health/402edbeae429-125808800.json",
  inputPath: "evidence/termix/frozen/venus-health/402edbeae429-125563831-125564152.canonical-json",
  manualCapturePath:
    "evidence/termix/runs/venus-health/manual/venus-health-manual-20260818-v2.json",
  operatorProcedurePath: "scripts/operator-ceremony-server.mjs",
  runOrderPath: "evidence/termix/declarations/venus-health/402edbeae429-125808800.run-order.json"
} as const;

async function loadInput(
  sources: typeof lpSources | typeof venusSources
): Promise<BuildObservationalPairInput> {
  const [agentCapture, manualCapture, agentInvocation, declarationEnvelope, frozenInput, runOrder] =
    await Promise.all([
      readJson(sources.agentCapturePath),
      readJson(sources.manualCapturePath),
      readJson(sources.agentInvocationPath),
      readJson(sources.declarationPath),
      readJson(sources.inputPath),
      readJson(sources.runOrderPath)
    ]);
  return {
    agentCapture,
    manualCapture,
    agentInvocation,
    declarationEnvelope,
    frozenInput,
    runOrder,
    reviewedAtUtc: REVIEWED_AT_UTC,
    sources
  };
}

describe("observational pair compiler", () => {
  it("recomputes the LP core but preserves the independent-review boundary", async () => {
    const result = buildPancakeLpPair(await loadInput(lpSources));

    expect(result.summary).toMatchObject({
      claimState: "unverified",
      publishableClaim: false,
      quality: { maximumPoints: 100, agentPoints: 100, manualPoints: 100 }
    });
    expect(result.pair.agentRun.evidenceState.state).toBe("unverified");
    expect(result.pair.manualRun.evidenceState.state).toBe("unverified");
    expect(result.selfReview.checks.secondReviewerIndependent).toBe(false);
  });

  it("recomputes all three Venus integer observations without claiming protection", async () => {
    const result = buildVenusHealthPair(await loadInput(venusSources));

    expect(result.summary).toMatchObject({
      claimState: "unverified",
      publishableClaim: false,
      quality: { maximumPoints: 100, agentPoints: 100, manualPoints: 100 }
    });
    expect(result.pair.agentRun.costs.lineItems[0]?.amountMinorUnits).toBe("0");
    expect(result.pair.manualRun.costs.lineItems[0]?.amountMinorUnits).toBe("0");
  });

  it("rejects a digest-consistent mutation of the LP worksheet core", async () => {
    const input = await loadInput(lpSources);
    const capture = structuredClone(input.manualCapture) as {
      output: { body: string; bytes: number; sha256: string };
    };
    const envelope = JSON.parse(capture.output.body) as {
      result: { currentTick: number };
    };
    envelope.result.currentTick += 1;
    capture.output.body = canonicalJson(envelope);
    capture.output.bytes = Buffer.byteLength(capture.output.body);
    capture.output.sha256 = sha256Bytes(capture.output.body);

    expect(() => buildPancakeLpPair({ ...input, manualCapture: capture })).toThrow(
      "TERMIX_OBSERVATIONAL_LP_CORE_MISMATCH"
    );
  });
});
