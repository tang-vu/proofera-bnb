import { runPancakeLpManualTermixMethod } from "../packages/benchmarks/src/index";
import { runTermixManualCli } from "./termix-manual-runner-support";

runTermixManualCli({
  executeFlag: "--execute-exact-pancake-lp-manual-run",
  inputArgument: "--input-bundle",
  inputPrefix: "evidence/termix/frozen/pancake-lp/",
  outputDirectory: "evidence/termix/runs/pancake-lp/manual",
  invocationDigestKey: "inputBundleSha256",
  errorPrefix: "TERMIX_PANCAKE_LP_MANUAL",
  releaseProtectedPaths: [
    "package.json",
    "pnpm-lock.yaml",
    "packages/benchmarks/src",
    "scripts/run-termix-pancake-lp-manual.ts",
    "scripts/termix-manual-runner-support.ts",
    "scripts/termix-release-state.mjs",
    "scripts/termix-typescript-loader.mjs"
  ],
  args: process.argv.slice(2),
  run: ({ request, inputCanonicalJson, inputSha256, events, clock }) =>
    runPancakeLpManualTermixMethod({
      request,
      inputBundleCanonicalJson: inputCanonicalJson,
      inputBundleSha256: inputSha256,
      events,
      clock
    })
})
  .then((outputPath) => process.stdout.write(`${outputPath}\n`))
  .catch((error: unknown) => {
    const message =
      error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
        ? error.message
        : error instanceof Error
          ? error.constructor.name
          : "Error";
    process.stderr.write(`TermiX Pancake LP manual runner failed: ${message}\n`);
    process.exitCode = 1;
  });
