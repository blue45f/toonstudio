export type EdgeCacheStatus = "HIT" | "STALE" | "COALESCED" | "MISS" | "BYPASS";

export interface EdgeCacheStatusMap {
  readonly HIT: "HIT";
  readonly STALE: "STALE";
  readonly COALESCED: "COALESCED";
  readonly MISS: "MISS";
  readonly BYPASS: "BYPASS";
}

export interface EdgeCacheStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete?(request: Request): Promise<boolean>;
}

export type EdgeCacheInput = EdgeCacheStore | Map<string, Response> | null | undefined;

export interface EdgeExecutionContext {
  readonly waitUntil?: (promise: Promise<unknown>) => void;
}

export interface EdgeCacheCoalescerOptions {
  readonly cache?: EdgeCacheInput;
  readonly now?: () => number;
  readonly maxCacheableBytes?: number;
}

export interface EdgeCacheCoalescerStats {
  readonly inFlightMisses: number;
  readonly inFlightRevalidations: number;
}

export interface EdgeApiCacheCoalescer {
  handle(
    request: Request,
    originFetch: (request: Request) => Promise<Response>,
    ctx?: EdgeExecutionContext,
  ): Promise<Response>;
  getStats(): EdgeCacheCoalescerStats;
}

export interface MemoryEdgeCache extends EdgeCacheStore {
  readonly size: number;
  clear(): void;
}

export const EDGE_CACHE_STATUS: Readonly<EdgeCacheStatusMap>;
export const DEFAULT_MAX_CACHEABLE_BYTES: number;

export function createMemoryEdgeCache(options?: { readonly maxEntries?: number }): MemoryEdgeCache;
export function createEdgeApiCacheCoalescer(options?: EdgeCacheCoalescerOptions): EdgeApiCacheCoalescer;
