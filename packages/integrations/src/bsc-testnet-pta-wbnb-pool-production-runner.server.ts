import "server-only";

import type { BscTestnetPtaWbnbPoolProductionRunResult } from "./bsc-testnet-pta-wbnb-pool-production-composition.server";
import { BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_COMPOSITION_BOUNDARY } from "./bsc-testnet-pta-wbnb-pool-production-composition.server";

/**
 * Fail-closed production boundary for this release.
 *
 * The reviewed protocol, journal, RPC normalization, authority parser, and composition are retained
 * as non-executable building blocks. They are intentionally not wired to native custody or the
 * broadcaster until a same-process two-phase owner challenge and a closure-private, one-consume
 * production execution capability have been implemented and independently reviewed.
 */
export async function runBscTestnetPtaWbnbPoolProductionOnceFromStdin(): Promise<BscTestnetPtaWbnbPoolProductionRunResult> {
  return Object.freeze({
    status: "blocked" as const,
    code: "PRODUCTION_AUTHORIZATION_UNAVAILABLE",
    message:
      "Production execution remains disabled: the two-phase exact owner challenge and private one-consume custody authority bridge are not available in this release.",
    transactionHash: null,
    boundary: BSC_TESTNET_PTA_WBNB_POOL_PRODUCTION_COMPOSITION_BOUNDARY
  });
}
