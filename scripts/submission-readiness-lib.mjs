import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const SUBMISSION_READINESS_SCHEMA_VERSION = "proofera-submission-readiness-v1.1.0";

const GATE_DEFINITIONS = Object.freeze([
  {
    gateId: "production-release",
    incompleteStates: ["deployed_unfrozen"],
    requiredKinds: ["public_probe", "release_manifest"]
  },
  {
    gateId: "agent-registration",
    incompleteStates: ["prepared_only"],
    requiredKinds: ["registration_receipts", "registry_reobservation"]
  },
  {
    gateId: "altana-lifecycle",
    incompleteStates: ["prepared_only"],
    requiredKinds: [
      "grant_receipt",
      "execute_receipt",
      "revoke_receipt",
      "negative_authority_probe"
    ]
  },
  {
    gateId: "pancake-benefit",
    incompleteStates: [
      "initializer_only",
      "controlled_lp_confirmed",
      "controlled_outcome_observed"
    ],
    requiredKinds: ["transaction_receipt", "before_after_metrics", "manual_baseline"]
  },
  {
    gateId: "termix-pairs",
    incompleteStates: ["preregistered_only"],
    requiredKinds: ["paired_report", "raw_runs", "adjudication"]
  },
  {
    gateId: "demo",
    incompleteStates: ["not_recorded", "recorded_pending_human_playback"],
    requiredKinds: ["video", "demo_check"]
  },
  {
    gateId: "submission",
    incompleteStates: ["draft"],
    requiredKinds: ["final_copy", "hackathon_entry"]
  }
]);

const SAFE_ID = /^[a-z][a-z0-9_-]{0,99}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_PATH = /^evidence\/[A-Za-z0-9._/-]+$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const MAXIMUM_GIT_OUTPUT_BYTES = 8_000_000;

export function validateSubmissionReadiness(value) {
  assertRecord(value, "SUBMISSION_READINESS_ROOT_INVALID");
  assertExactKeys(
    value,
    ["gates", "readyForSubmission", "schemaVersion", "updatedAtUtc"],
    "SUBMISSION_READINESS_ROOT_INVALID"
  );
  if (value.schemaVersion !== SUBMISSION_READINESS_SCHEMA_VERSION) {
    throw new Error("SUBMISSION_READINESS_SCHEMA_INVALID");
  }
  if (typeof value.updatedAtUtc !== "string" || !UTC.test(value.updatedAtUtc)) {
    throw new Error("SUBMISSION_READINESS_UPDATED_AT_INVALID");
  }
  if (typeof value.readyForSubmission !== "boolean" || !Array.isArray(value.gates)) {
    throw new Error("SUBMISSION_READINESS_ROOT_INVALID");
  }
  if (value.gates.length !== GATE_DEFINITIONS.length) {
    throw new Error("SUBMISSION_READINESS_GATE_SET_INVALID");
  }

  const gates = value.gates.map((gate, index) => validateGate(gate, GATE_DEFINITIONS[index]));
  const actuallyReady = gates.every((gate) => gate.state === "verified");
  if (value.readyForSubmission !== actuallyReady) {
    throw new Error("SUBMISSION_READINESS_BOOLEAN_MISMATCH");
  }
  return Object.freeze({
    gates: Object.freeze(gates),
    readyForSubmission: actuallyReady,
    schemaVersion: value.schemaVersion,
    updatedAtUtc: value.updatedAtUtc
  });
}

function validateGate(value, definition) {
  assertRecord(value, "SUBMISSION_READINESS_GATE_INVALID");
  assertExactKeys(
    value,
    ["artifacts", "blockers", "claim", "gateId", "state"],
    "SUBMISSION_READINESS_GATE_INVALID"
  );
  if (value.gateId !== definition.gateId) {
    throw new Error("SUBMISSION_READINESS_GATE_ORDER_INVALID");
  }
  if (value.state !== "verified" && !definition.incompleteStates.includes(value.state)) {
    throw new Error("SUBMISSION_READINESS_GATE_STATE_INVALID");
  }
  if (typeof value.claim !== "string" || value.claim.trim() !== value.claim || value.claim === "") {
    throw new Error("SUBMISSION_READINESS_GATE_CLAIM_INVALID");
  }
  if (!Array.isArray(value.blockers) || !Array.isArray(value.artifacts)) {
    throw new Error("SUBMISSION_READINESS_GATE_INVALID");
  }
  const blockers = value.blockers.map((blocker) => {
    if (typeof blocker !== "string" || blocker.trim() !== blocker || blocker === "") {
      throw new Error("SUBMISSION_READINESS_BLOCKER_INVALID");
    }
    return blocker;
  });
  if (new Set(blockers).size !== blockers.length) {
    throw new Error("SUBMISSION_READINESS_BLOCKER_DUPLICATE");
  }
  const artifacts = value.artifacts.map(validateArtifact);
  const artifactKeys = artifacts.map(({ kind, path }) => `${kind}:${path}`);
  if (new Set(artifactKeys).size !== artifactKeys.length) {
    throw new Error("SUBMISSION_READINESS_ARTIFACT_DUPLICATE");
  }

  if (value.state === "verified") {
    if (blockers.length !== 0) throw new Error("SUBMISSION_READINESS_VERIFIED_HAS_BLOCKER");
    const kinds = new Set(artifacts.map(({ kind }) => kind));
    if (!definition.requiredKinds.every((kind) => kinds.has(kind))) {
      throw new Error("SUBMISSION_READINESS_VERIFIED_EVIDENCE_INCOMPLETE");
    }
    if (!artifacts.every(({ path }) => path.startsWith("evidence/submission/final/"))) {
      throw new Error("SUBMISSION_READINESS_VERIFIED_PATH_INVALID");
    }
  } else if (blockers.length === 0) {
    throw new Error("SUBMISSION_READINESS_INCOMPLETE_BLOCKER_MISSING");
  }

  return Object.freeze({
    artifacts: Object.freeze(artifacts),
    blockers: Object.freeze(blockers),
    claim: value.claim,
    gateId: value.gateId,
    state: value.state
  });
}

function validateArtifact(value) {
  assertRecord(value, "SUBMISSION_READINESS_ARTIFACT_INVALID");
  assertExactKeys(value, ["kind", "path", "sha256"], "SUBMISSION_READINESS_ARTIFACT_INVALID");
  if (typeof value.kind !== "string" || !SAFE_ID.test(value.kind)) {
    throw new Error("SUBMISSION_READINESS_ARTIFACT_KIND_INVALID");
  }
  if (
    typeof value.path !== "string" ||
    !SAFE_PATH.test(value.path) ||
    value.path.includes("//") ||
    value.path.split("/").includes("..") ||
    isAbsolute(value.path)
  ) {
    throw new Error("SUBMISSION_READINESS_ARTIFACT_PATH_INVALID");
  }
  if (typeof value.sha256 !== "string" || !SHA256.test(value.sha256)) {
    throw new Error("SUBMISSION_READINESS_ARTIFACT_DIGEST_INVALID");
  }
  return Object.freeze({ kind: value.kind, path: value.path, sha256: value.sha256 });
}

export async function verifySubmissionArtifacts(readiness, repositoryRoot) {
  const root = await realpath(repositoryRoot);
  for (const gate of readiness.gates) {
    for (const artifact of gate.artifacts) {
      const absolutePath = resolve(root, ...artifact.path.split("/"));
      const canonicalPath = await realpath(absolutePath);
      const local = relative(root, canonicalPath);
      if (
        local === "" ||
        local === ".." ||
        local.startsWith(`..${sep}`) ||
        isAbsolute(local) ||
        resolve(absolutePath).toLowerCase() !== resolve(canonicalPath).toLowerCase() ||
        (await lstat(canonicalPath)).isSymbolicLink()
      ) {
        throw new Error("SUBMISSION_READINESS_ARTIFACT_UNTRUSTED");
      }
      const bytes = await readFile(canonicalPath);
      try {
        execFileSync("git", ["ls-files", "--error-unmatch", "--", artifact.path], {
          cwd: root,
          encoding: "buffer",
          maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
          windowsHide: true
        });
      } catch {
        throw new Error("SUBMISSION_READINESS_ARTIFACT_NOT_TRACKED");
      }
      const committedBytes = execFileSync("git", ["show", `HEAD:${artifact.path}`], {
        cwd: root,
        encoding: "buffer",
        maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
        windowsHide: true
      });
      if (!bytes.equals(committedBytes)) {
        throw new Error("SUBMISSION_READINESS_ARTIFACT_NOT_COMMITTED");
      }
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== artifact.sha256) {
        throw new Error("SUBMISSION_READINESS_ARTIFACT_DIGEST_MISMATCH");
      }
    }
  }
}

export function verifySubmissionReleaseState(repositoryRoot) {
  const gitText = (args) =>
    execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
      windowsHide: true
    }).trim();
  if (gitText(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("SUBMISSION_READINESS_REPOSITORY_DIRTY");
  }
  if (gitText(["rev-parse", "HEAD"]) !== gitText(["rev-parse", "origin/main"])) {
    throw new Error("SUBMISSION_READINESS_RELEASE_NOT_PUBLISHED");
  }
}

function assertRecord(value, code) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(code);
}

function assertExactKeys(value, keys, code) {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw new Error(code);
}
