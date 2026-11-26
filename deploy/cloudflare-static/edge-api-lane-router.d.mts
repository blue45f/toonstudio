export type ApiLane =
  | "edge-public-read"
  | "edge-ai-assist"
  | "realtime-do"
  | "core-stateful-onpod";

export interface ApiLaneMap {
  readonly EDGE_PUBLIC_READ: "edge-public-read";
  readonly EDGE_AI_ASSIST: "edge-ai-assist";
  readonly REALTIME_DO: "realtime-do";
  readonly CORE_STATEFUL_ONPOD: "core-stateful-onpod";
}

export interface PublicReadRoutePolicy {
  readonly routeKey: string;
  readonly matchType: "exact" | "prefix";
  readonly path: string;
  readonly ttlSeconds: number;
  readonly swrSeconds: number;
}

export interface ApiLaneClassification {
  readonly lane: ApiLane;
  readonly cacheable: boolean;
  readonly routeKey: string;
  readonly ttlSeconds: number;
  readonly swrSeconds: number;
  readonly cacheControl: string;
  readonly reason: string;
}

export const API_LANES: Readonly<ApiLaneMap>;
export const API_LANE_HEADER: "X-ToonStudio-Api-Lane";
export const EDGE_CACHE_HEADER: "X-ToonStudio-Edge-Cache";
export const CORE_BYPASS_CACHE_CONTROL: "private, no-store";
export const PUBLIC_READ_ROUTE_POLICIES: readonly PublicReadRoutePolicy[];

export function hasAuthOrSessionHeaders(request: Request): boolean;
export function buildPublicCacheControl(ttlSeconds: number, swrSeconds: number): string;
export function buildCanonicalEdgeCacheKey(request: Request): string;
export function classifyApiLane(request: Request): ApiLaneClassification;
export function isEdgeCacheablePublicReadRequest(request: Request): boolean;
export function hasSetCookieHeader(headers: Headers): boolean;
export function hasPrivateOrAuthResponseHeaders(response: Response): boolean;
export function isEdgeCacheablePublicRead(request: Request, response: Response | null | undefined): boolean;
