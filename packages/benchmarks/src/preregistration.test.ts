import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  benchmarkPreregisteredDefinitionSha256,
  BenchmarkPreregistrationSchema,
  type BenchmarkPreregistration
} from "./preregistration.js";

const preregistrationDirectory = fileURLToPath(
  new URL("../../../evidence/termix/preregistrations/", import.meta.url)
);
const supersededPreregistrationDirectory = fileURLToPath(
  new URL("../../../evidence/termix/superseded-preregistrations/", import.meta.url)
);
const expectedFiles = [
  "task-01-lp-range-v2.json",
  "task-02-permission-audit.json",
  "task-03-venus-health.json"
] as const;

function loadPreregistrations(): BenchmarkPreregistration[] {
  return expectedFiles.map((filename) =>
    BenchmarkPreregistrationSchema.parse(
      JSON.parse(readFileSync(`${preregistrationDirectory}${filename}`, "utf8")) as unknown
    )
  );
}

describe("TermiX preregistration evidence", () => {
  it("contains exactly the three predeclared ProofEra-versus-manual tasks", () => {
    const actualFiles = readdirSync(preregistrationDirectory)
      .filter((filename) => filename.endsWith(".json"))
      .sort();

    expect(actualFiles).toEqual(expectedFiles);
    expect(loadPreregistrations().map(({ definition }) => definition.task.taskId)).toEqual([
      "pancake-lp-range-decision",
      "autonomous-session-permission-audit",
      "venus-health-factor-decision"
    ]);
  });

  it("preserves the never-run LP v1 protocol while making v2 the sole active task 01", () => {
    expect(readdirSync(supersededPreregistrationDirectory).sort()).toEqual([
      "task-01-lp-range-v1.json"
    ]);
    const legacy = BenchmarkPreregistrationSchema.parse(
      JSON.parse(
        readFileSync(`${supersededPreregistrationDirectory}task-01-lp-range-v1.json`, "utf8")
      ) as unknown
    );
    const active = loadPreregistrations()[0];
    expect(legacy.preregistrationId).toBe("termix-task-01-lp-range-v1");
    expect(legacy.definitionSha256).toBe(
      "edc4ae168600c9de5008adb59bf6cd2b6bd85333713c9b17afc76116fc13239d"
    );
    expect(active?.preregistrationId).toBe("termix-task-01-lp-range-v2");
    expect(active?.definitionSha256).toBe(
      "9ac77645f2dd0ade20203b911cba18ce52b7b016fae8d9e73aa2919440b572ab"
    );
    expect(legacy.status).toBe("NOT RUN");
    expect(active?.status).toBe("NOT RUN");
    expect(active?.definition.environment).toMatchObject({ kind: "mainnet", chainId: 56 });
    expect(
      active?.definition.constraints.find(
        ({ constraintId }) => constraintId === "bsc-testnet-agent-commerce"
      )?.expected
    ).toEqual({ encoding: "decimal_integer", value: "97" });
  });

  it("keeps every input, environment parameter, final declaration and timed command unbound", () => {
    for (const registration of loadPreregistrations()) {
      expect(registration.status).toBe("NOT RUN");
      expect(registration.runStates).toEqual({ agent: "NOT RUN", manual: "NOT RUN" });
      expect(registration.publishable).toBe(false);
      expect(
        registration.definition.inputs.every(({ binding }) => binding.state === "UNBOUND")
      ).toBe(true);
      expect(registration.definition.inputs.every(({ binding }) => binding.value === null)).toBe(
        true
      );
      expect(
        registration.definition.environment.parameters.every(
          ({ binding }) => binding.state === "UNBOUND" && binding.value === null
        )
      ).toBe(true);
      expect(registration.definition.environment.softwareCommit.value).toBeNull();
      expect(registration.definition.pairProtocol.finalDeclarationSha256).toBeNull();
      expect(registration.definition.reproduction.timedRunnerCommand).toBeNull();
    }
  });

  it("binds the immutable task definitions to their canonical SHA-256 digests", () => {
    for (const registration of loadPreregistrations()) {
      expect(benchmarkPreregisteredDefinitionSha256(registration.definition)).toBe(
        registration.definitionSha256
      );
    }
  });

  it("requires exact paired parity before any future run", () => {
    for (const { definition } of loadPreregistrations()) {
      expect(definition.pairProtocol).toMatchObject({
        finalDeclarationBindingState: "UNBOUND",
        identicalConstraints: true,
        identicalEnvironment: true,
        identicalInputs: true,
        identicalQualityRubric: true,
        identicalSourceAccess: true,
        identicalTask: true,
        oneFinalDeclarationForBothRuns: true
      });
    }
  });

  it("contains requirements but no fabricated run evidence fields", () => {
    for (const registration of loadPreregistrations()) {
      const encoded = JSON.stringify(registration);
      expect(encoded).not.toMatch(/"(?:transactionHash|requestId|startedAtUtc|endedAtUtc)":/);
      expect(encoded).not.toMatch(/0x[0-9a-fA-F]{64}/);
      expect(registration.definition.artifactRequirements.length).toBeGreaterThan(0);
      expect(registration.definition.receiptRequirements.length).toBeGreaterThan(0);
    }
  });

  it("fails closed if a definition changes without a new digest", () => {
    const candidate = structuredClone(loadPreregistrations()[0]);
    if (candidate === undefined) throw new TypeError("Missing preregistration fixture");
    candidate.definition.task.exactDefinition = `${candidate.definition.task.exactDefinition} Tampered.`;

    expect(BenchmarkPreregistrationSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects any preregistration that claims a run or publication state", () => {
    const candidate = structuredClone(loadPreregistrations()[1]);
    if (candidate === undefined) throw new TypeError("Missing preregistration fixture");

    expect(
      BenchmarkPreregistrationSchema.safeParse({ ...candidate, status: "COMPLETE" }).success
    ).toBe(false);
    expect(
      BenchmarkPreregistrationSchema.safeParse({ ...candidate, publishable: true }).success
    ).toBe(false);
  });
});
