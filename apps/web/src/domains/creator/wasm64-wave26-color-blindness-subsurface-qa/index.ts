/**
 * Wasm64 Wave 26 Autonomous Cadence 공개 진입점 (`wasm64-wave26-color-blindness-subsurface-qa`).
 *
 * - `cvd-lms-palette-remapper`: Brettel-Viénot-Mollon 생리학적 LMS 색각 이상 시뮬레이터(`protan`/`deutan`/`tritan`),
 *   D65 무채색 회색축 불변 보존(`< 1e-4`), 웹툰 진영·말풍선 혼동 감사 및 최소 변위 OKLCH 달토나이제이션 솔버
 * - `impasto-raking-light-composer`: 2D 표지 일러스트 임파스토 강모 결·테두리 융기(edge bead) 높이장,
 *   Sobel 미세 법선, 다단계 지평선 자가 그림자 및 에너지 보존 유전체 GGX 사광 합성기
 * - `character-costume-continuity-ledger`: 전·후면 카메라 패리티 기반 비대칭 랜드마크 좌우 반전 실수 검출기 및
 *   다회차 복장·부상·소품 타임라인 연속성 원장 감사기
 *
 * 주의: 스튜디오 초기 엔트리 번들 영향 `0B` 및 서버 비용 `₩0` 유지를 위해 최상위 부작용 없이 순수 심볼만 내보낸다.
 */

export {
  auditPaletteCvdConfusions,
  computeDeltaEOklab,
  cvdSrgbToOklab,
  cvdSrgbToOklch,
  linearRgbToLms,
  linearRgbToSrgb,
  lmsToLinearRgb,
  oklchToGamutSrgb,
  projectLmsBrettelTwoWing,
  simulateCvdLinearRgbaBuffer,
  simulateCvdSrgb,
  solveOklchDaltonizedPalette,
  srgbToLinearRgb,
  type CvdAuditOptions,
  type CvdConfusionPair,
  type CvdOklabColor,
  type CvdOklchColor,
  type CvdPaletteAuditReport,
  type CvdSrgbColor,
  type CvdType,
  type LinearRgbColor,
  type LmsConeResponse,
  type OklchDaltonizeOptions,
  type OklchDaltonizeResult,
  type RemappedPaletteEntry,
  type WebtoonPaletteEntry,
  type WebtoonPaletteRole,
} from "./cvd-lms-palette-remapper";

export {
  accumulateImpastoDab,
  accumulateImpastoStroke,
  composeImpastoRakingLight,
  computeRakingHorizonShadows,
  createImpastoSurfaceCanvas,
  deriveImpastoMicroNormals,
  sampleCrossStrokeHeightProfile,
  type CrossStrokeHeightSample,
  type CrossStrokeProfileMetrics,
  type ImpastoBrushDab,
  type ImpastoDepositionMode,
  type ImpastoNormalOptions,
  type ImpastoRakingComposeResult,
  type ImpastoRakingLightOptions,
  type ImpastoStrokePoint,
  type ImpastoStrokeSpec,
  type ImpastoSurfaceCanvas,
  type LinearRgbaColor,
  type NormalGradientKernel,
} from "./impasto-raking-light-composer";

export {
  auditCharacterContinuityLedger,
  resolveExpectedScreenSide,
  validateLedgerTimelineIntervals,
  type AnatomicalSide,
  type AsymmetricLandmarkKey,
  type CameraFacingPose,
  type CharacterContinuitySheet,
  type CharacterLandmarkSpec,
  type CharacterStateIntervalRule,
  type ContinuityAuditReport,
  type ContinuityStateCategory,
  type CutCharacterObservation,
  type EpisodeCutContinuityInput,
  type FlipViolationKind,
  type LandmarkEntryInput,
  type LandmarkFlipFinding,
  type LedgerRuleOverlapIssue,
  type ObservedCharacterStateItem,
  type ScreenSide,
  type TimelineAnachronismFinding,
  type TimelineAnachronismKind,
} from "./character-costume-continuity-ledger";
