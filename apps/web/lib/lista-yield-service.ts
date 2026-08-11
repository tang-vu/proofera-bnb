import {
  LISTA_PRODUCTION_API_ORIGIN,
  createListaYieldSourceReader,
  type CreateListaYieldSourceReaderOptions,
  type ListaYieldSourceReader,
  type ListaYieldSourceRequest,
  type ListaYieldSourceResult
} from "@proofera/integrations";

export const LISTA_YIELD_PAGE_SIZE = 12 as const;
export const LISTA_YIELD_TIMEOUT_MS = 8_000 as const;

export const LISTA_YIELD_SOURCE_REQUEST = Object.freeze({
  chainId: 56,
  apiBaseUrl: LISTA_PRODUCTION_API_ORIGIN,
  pageSize: LISTA_YIELD_PAGE_SIZE,
  timeoutMs: LISTA_YIELD_TIMEOUT_MS
} as const satisfies ListaYieldSourceRequest);

export const LISTA_YIELD_SOURCE_URL =
  `${LISTA_PRODUCTION_API_ORIGIN}/api/moolah/vault/list?page=1&pageSize=${LISTA_YIELD_PAGE_SIZE}&chain=bsc&sort=apy&order=desc` as const;

export interface ListaYieldServiceDependencies {
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => Date;
  readonly createReader?: (options: CreateListaYieldSourceReaderOptions) => ListaYieldSourceReader;
}

/**
 * One bounded, read-only request. The request shape is not caller-configurable,
 * so this service cannot be repurposed as a server-side request proxy.
 */
export async function readListaYieldSources(
  dependencies: ListaYieldServiceDependencies
): Promise<ListaYieldSourceResult> {
  const createReader = dependencies.createReader ?? createListaYieldSourceReader;
  const reader = createReader({ fetch: dependencies.fetch, now: dependencies.now });
  return reader.getYieldSources(LISTA_YIELD_SOURCE_REQUEST);
}
