#!/usr/bin/env node

import {
  buildDeploymentPreparation,
  parsePreparationArguments,
} from "./deployment-preparation.mjs";

try {
  const input = parsePreparationArguments(process.argv.slice(2));
  const preparation = await buildDeploymentPreparation(input);
  process.stdout.write(`${JSON.stringify(preparation, null, 2)}\n`);
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown deployment-preparation failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
