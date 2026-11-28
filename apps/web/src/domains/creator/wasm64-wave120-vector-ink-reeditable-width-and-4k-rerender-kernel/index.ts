/**
 * Wasm64 Wave 120 공개 배럴 진입점 (`wasm64-wave120-vector-ink-reeditable-width-and-4k-rerender-kernel`).
 *
 * - `vector-ink-stroke-and-width-sculpt`: 가변 필압 벡터 먹선 모델, 가우시안 감쇠 비파괴 선폭 조각,
 *   FIPS 180-4 SHA-256 레이어 지문, 가역 Undo/Redo 스택
 * - `vector-intersection-eraser`: 만화 벡터 교차점 정밀 지우개(끝단 자투리 절단, 중간 구간 2분할,
 *   T-교차·X-교차·자기 교차·닫힌 외곽선 개방, 단독 획 제거)
 * - `vector-ink-sdf-rerender-and-wgsl`: 가변 폭 캡슐 SDF 해상도 독립 1x/2x/4K/600DPI 재래스터화,
 *   래스터 바이리니어 확대 대비 선명도 정량 비교, WebGPU WGSL 생성·검증
 * - `vector-ink-svg-and-report`: 인쇄 안전 순수 OKLCH 비교 검수 SVG 및 한국어 선화 감독 QA 브리프
 */

export {
  clampFinite,
  computeStrokeCumulativeArcLengths,
  computeStrokeTotalLength,
  computeVectorInkLayerSha256Hex,
  computeVectorInkStrokeSha256Hex,
  createVectorInkHistory,
  evaluateEffectiveStrokeWidth,
  extractStrokeSegments,
  getCurrentHistoryLayer,
  projectPointOntoStroke,
  pushVectorInkEdit,
  redoVectorInkEdit,
  sampleStrokeAtArcLength,
  sculptVectorInkLayerStrokeWidth,
  sculptVectorInkStrokeWidth,
  sha256VectorInkHex,
  undoVectorInkEdit,
  verifyVectorInkUndoParity,
  type StrokeProjectionResult,
  type VectorInkHistoryEntry,
  type VectorInkHistoryStack,
  type VectorInkLayer,
  type VectorInkPoint,
  type VectorInkSample,
  type VectorInkStroke,
  type VectorInkUndoParityReport,
  type VectorStrokeSegment,
  type WidthSculptMode,
  type WidthSculptOptions,
  type WidthSculptResult,
} from "./vector-ink-stroke-and-width-sculpt";

export {
  eraseVectorStrokeToIntersections,
  findStrokeIntersections,
  type ClickPoint2D,
  type IntersectionEraserOptions,
  type VectorIntersectionEraseResult,
  type VectorIntersectionEraseStatus,
  type VectorIntersectionKind,
  type VectorStrokeIntersectionHit,
} from "./vector-intersection-eraser";

export {
  buildVectorInkSdfWgsl,
  compareVectorRerenderVsRasterUpscale,
  measureAlphaEdgeSharpness,
  rerenderVectorInkToAlphaTile,
  signedDistanceToVariableWidthCapsule,
  upscaleAlphaTileBilinear,
  validateVectorInkSdfWgsl,
  type AlphaEdgeSharpnessMetrics,
  type BuildVectorInkSdfWgslOptions,
  type PreparedInkCapsule,
  type VectorInkAlphaTile,
  type VectorInkSdfWgslArtifact,
  type VectorInkWgslValidationResult,
  type VectorVsRasterUpscaleComparison,
} from "./vector-ink-sdf-rerender-and-wgsl";

export {
  escapeVectorInkXml,
  renderVectorInkReeditAuditSvg,
  summarizeVectorInkKernelKo,
  type VectorInkAuditSvgOptions,
  type VectorInkKoreanSummaryOptions,
} from "./vector-ink-svg-and-report";
