#!/usr/bin/env node

import {
  buildPoolPreparation,
  parsePoolPreparationArguments,
  serializePoolPreparation,
} from "./pool-preparation.mjs";

try {
  const input = parsePoolPreparationArguments(process.argv.slice(2));
  const preparation = buildPoolPreparation(input);
  process.stdout.write(serializePoolPreparation(preparation));
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown offline pool-preparation failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
