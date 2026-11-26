/**
 * 무료 AI 엣지 최적화 및 온디바이스 0-토큰 라우터 공개 진입점.
 *
 * 주의: Studio 초기 진입 그래프(`main.tsx`, `studio-legacy-editor-adapter.tsx`)에서
 * 정적으로 import하지 않고, AI 보조 패널·검색 기능 활성화 시점에 지연 로드한다.
 */

export {
  cosineSimilarity256,
  DEFAULT_ONDEVICE_INVOKE_TIMEOUT_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_SEMANTIC_HIT_MIN_SCORE,
  DEFAULT_SEMANTIC_INDEX_FILENAME,
  dotProduct256,
  l2NormalizeVector256,
  OfflineSemanticCatalogIndex,
  OnDeviceZeroTokenRouter,
  probeOnDeviceAiCapabilities,
  SEMANTIC_VECTOR_DIM,
  SERVER_FREE_9POOL_DAILY_CAPACITY,
  type BrowserBuiltInAiGlobal,
  type BrowserLanguageModelApi,
  type BrowserLanguageModelSession,
  type BrowserTranslatorApi,
  type BrowserTranslatorInstance,
  type CatalogSemanticIndex256d,
  type CatalogSemanticIndexEntry,
  type OnDeviceAiCapabilities,
  type OnDeviceApiStatus,
  type OnDeviceZeroTokenRouterOptions,
  type OnDeviceZeroTokenTelemetry,
  type PromptApiSurface,
  type RemoteTierAdapter,
  type RemoteTierAdapterResponse,
  type SemanticCatalogMatch,
  type SemanticSearchOptions,
  type TranslatorApiSurface,
  type ZeroTokenExecutionTier,
  type ZeroTokenRouteAttempt,
  type ZeroTokenRouteRequest,
  type ZeroTokenRouteResult,
} from "./ondevice-zero-token-router";
