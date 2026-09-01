import "server-only";

import { loadLiveListaYieldSources } from "./lista-yield-live";
import { createListaYieldSourcesView } from "./lista-yield-view-model";
import {
  MARKETPLACE_PANCAKE_FIXTURE,
  MARKETPLACE_VENUS_REPLAY,
  createListaMarketplaceLiveEvidence,
  createPancakeMarketplaceLiveEvidence,
  createVenusMarketplaceLiveEvidence,
  type MarketplaceLiveEvidenceView
} from "./marketplace-live-evidence";
import type { MarketplaceCategory } from "./marketplace-query";
import { loadLivePancakePosition } from "./pancake-position-rpc";
import { loadLiveVenusHealth } from "./venus-health-rpc";

export async function loadMarketplaceLiveEvidence(
  category: MarketplaceCategory
): Promise<MarketplaceLiveEvidenceView> {
  switch (category) {
    case "lp-rebalancing":
    case "grid-trading":
      return createPancakeMarketplaceLiveEvidence(
        category,
        await loadLivePancakePosition(MARKETPLACE_PANCAKE_FIXTURE)
      );
    case "yield-optimisation":
      return createListaMarketplaceLiveEvidence(
        createListaYieldSourcesView(await loadLiveListaYieldSources())
      );
    case "health-factor-monitoring":
      return createVenusMarketplaceLiveEvidence(
        await loadLiveVenusHealth(MARKETPLACE_VENUS_REPLAY)
      );
  }
}
