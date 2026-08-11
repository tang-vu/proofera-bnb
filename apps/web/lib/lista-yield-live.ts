import "server-only";

import type { ListaYieldSourceResult } from "@proofera/integrations";

import { readListaYieldSources } from "./lista-yield-service";

/** Server-only binding; no API origin, credential, or request input comes from the browser. */
export function loadLiveListaYieldSources(): Promise<ListaYieldSourceResult> {
  return readListaYieldSources({
    fetch: globalThis.fetch,
    now: () => new Date()
  });
}
