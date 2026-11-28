/**
 * Wasm64 Wave 93 공개 배럴 진입점 (`wasm64-wave93-federated-studio-style-delta`).
 *
 * - `local-style-delta-extractor`: 16차원 정규 화풍 벡터, L2 민감도 클리핑, 결정론적
 *   Mulberry32/Box-Muller 가우시안 DP 메커니즘, Fail-Closed 프라이버시 예산 원장,
 *   원본 원고·스트로크·미공개 대사 송출 차단 가드
 * - `federated-studio-aggregator-and-drift-guard`: 순수 ES2017 FIPS 180-4 SHA-256 해시 체인,
 *   비잔틴 내성 연합 집계기(`weighted-fedavg`, `coordinate-trimmed-mean`, `coordinate-median`),
 *   메인 작가 고정 앵커 드리프트 롤백 가드, 어시스턴트 화풍 정합도 조율 힌트
 * - `federated-privacy-audit-svg-and-report`: 인쇄 안전 고대비 수렴·예산 SVG 차트 및
 *   자연스러운 한국어 스튜디오 라운드 요약 리포트
 */

export {
  FederatedPrivacyError,
  PrivacyBudgetLedger,
  STYLE_ADAPTER_AXES,
  STYLE_ADAPTER_AXIS_SPECS,
  STYLE_ADAPTER_DIMENSION,
  addStyleVectors,
  assertFiniteStyleVector,
  assertZeroRawArtworkPayload,
  clampStyleVectorToBounds,
  clipStyleDeltaByL2Norm,
  computeGaussianDpSigma,
  computeL2Norm,
  createDefaultStyleAdapterVector,
  createMulberry32,
  createZeroStyleDeltaVector,
  extractLocalStyleDelta,
  sampleBoxMullerPair,
  scaleStyleVector,
  subtractStyleVectors,
  tupleToVector,
  validateZeroRawArtworkPayload,
  vectorToTuple,
  type ClipStyleDeltaResult,
  type DifferentialPrivacyConfig,
  type ExtractLocalStyleDeltaOptions,
  type FederatedPrivacyErrorCode,
  type FederatedStyleDeltaEnvelope,
  type LocalStyleDeltaExtractionResult,
  type LocalStyleSessionSample,
  type PrivacyBudgetCharge,
  type PrivacyBudgetLedgerOptions,
  type PrivacyBudgetSnapshot,
  type RawArtworkViolation,
  type StudioParticipantRole,
  type StyleAdapterAxisKey,
  type StyleAdapterAxisSpec,
  type StyleAdapterCategory,
  type StyleAdapterVector,
  type ZeroRawArtworkGuardResult,
} from "./local-style-delta-extractor";

export {
  aggregateFederatedStyleRound,
  canonicalSerializeFederated,
  computeAssistantStyleAlignment,
  computeFederatedGenesisHashHex,
  computeLeadArtistDriftMetrics,
  sha256FederatedHex,
  verifyFederatedAuditChain,
  type AssistantStyleAlignmentReport,
  type DivergingStyleAxisAdvice,
  type FederatedAggregationPolicy,
  type FederatedAggregatorKind,
  type FederatedAuditChainVerificationResult,
  type FederatedRoundAuditEntry,
  type FederatedRoundDecision,
  type FederatedStyleRoundResult,
  type LeadArtistDriftGuardPolicy,
  type LeadArtistDriftMetrics,
  type OutlierHandlingMode,
  type ParticipantDeltaAuditRecord,
  type ParticipantRejectionReason,
} from "./federated-studio-aggregator-and-drift-guard";

export {
  renderFederatedStyleConvergenceSvg,
  summarizeFederatedStyleRoundKo,
  type FederatedStyleRoundSummaryKo,
  type RenderConvergenceSvgOptions,
} from "./federated-privacy-audit-svg-and-report";
