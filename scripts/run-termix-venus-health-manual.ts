import { runVenusHealthManualTermixMethod } from "../packages/benchmarks/src/index";
import { runTermixManualCli } from "./termix-manual-runner-support";

runTermixManualCli({
  executeFlag: "--execute-exact-venus-health-manual-run",
  inputArgument: "--request-input",
  inputPrefix: "evidence/termix/frozen/venus-health/",
  outputDirectory: "evidence/termix/runs/venus-health/manual",
  invocationDigestKey: "requestInputSha256",
  errorPrefix: "TERMIX_VENUS_MANUAL",
  args: process.argv.slice(2),
  run: ({ request, inputSha256, events, clock }) =>
    runVenusHealthManualTermixMethod({
      request,
      requestInputSha256: inputSha256,
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
    process.stderr.write(`TermiX Venus Health manual runner failed: ${message}\n`);
    process.exitCode = 1;
  });
