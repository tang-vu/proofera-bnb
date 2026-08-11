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
const expectedFiles = [
  "task-01-lp-range.json",
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
