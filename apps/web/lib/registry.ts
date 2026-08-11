import {
  create8004ScanClient,
  type Scan8004GetAgentResult,
  type Scan8004ListAgentsResult
} from "@proofera/integrations";
import { unstable_cache } from "next/cache";
import "server-only";

import type { MarketplaceCategory } from "./marketplace-query";
import { marketplaceCategories } from "./marketplace-query";
import { readDataRuntimeConfig } from "./runtime-config";

const loadRegistryCandidatesUncached = async (
  category: MarketplaceCategory
): Promise<Scan8004ListAgentsResult> => {
  const runtime = readDataRuntimeConfig();
  if (!runtime.permitsLivePublication) {
    throw new Error("Live registry publication is disabled outside strict data mode");
  }

  const apiKey = process.env.PROOFERA_8004SCAN_API_KEY?.trim();
  const client = create8004ScanClient({
    ...(apiKey === undefined || apiKey.length === 0 ? {} : { apiKey })
  });

  return client.listAgents({
    chainId: 56,
    isTestnet: false,
    limit: 12,
    search: marketplaceCategories[category].registrySearch,
    sortBy: "total_score",
    sortOrder: "desc"
  });
};

const loadRegistryAgentUncached = async (
  chainId: 56 | 97,
  tokenId: string
): Promise<Scan8004GetAgentResult> => {
  const runtime = readDataRuntimeConfig();
  if (!runtime.permitsLivePublication) {
    throw new Error("Live registry publication is disabled outside strict data mode");
  }

  const apiKey = process.env.PROOFERA_8004SCAN_API_KEY?.trim();
  const client = create8004ScanClient({
    ...(apiKey === undefined || apiKey.length === 0 ? {} : { apiKey })
  });

  return client.getAgent({ chainId, tokenId });
};

export const loadRegistryCandidates = unstable_cache(
  loadRegistryCandidatesUncached,
  ["8004scan-marketplace-candidates-v1"],
  { revalidate: 300 }
);

export const loadRegistryAgent = unstable_cache(
  loadRegistryAgentUncached,
  ["8004scan-agent-detail-v1"],
  { revalidate: 300 }
);
