import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateSubmissionReadiness,
  verifySubmissionArtifacts,
  verifySubmissionReleaseState
} from "./submission-readiness-lib.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argumentsList = process.argv.slice(2);
if (argumentsList.some((argument) => argument !== "--require-ready")) {
  process.stderr.write("SUBMISSION_READINESS_ARGUMENTS_INVALID\n");
  process.exit(2);
}

try {
  const manifest = JSON.parse(
    await readFile(resolve(repositoryRoot, "evidence/submission/readiness.json"), "utf8")
  );
  const readiness = validateSubmissionReadiness(manifest);
  await verifySubmissionArtifacts(readiness, repositoryRoot);
  for (const gate of readiness.gates) {
    process.stdout.write(`${gate.gateId}: ${gate.state}\n`);
  }
  process.stdout.write(`ready-for-submission: ${readiness.readyForSubmission}\n`);
  if (readiness.readyForSubmission) verifySubmissionReleaseState(repositoryRoot);
  if (argumentsList.includes("--require-ready") && !readiness.readyForSubmission) {
    process.stderr.write("SUBMISSION_NOT_READY\n");
    process.exitCode = 1;
  }
} catch (error) {
  const message =
    error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : error instanceof SyntaxError
        ? "SUBMISSION_READINESS_JSON_INVALID"
        : "SUBMISSION_READINESS_CHECK_FAILED";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
