/**
 * Wasm64 Wave 36 공개 배럴 진입점 (`wasm64-wave36-parallax-sfx-storyboard-sync`).
 *
 * - `affective-sfx-vector-ribbon-generator`: 감정 프로파일 기반 한국어 의성어·의태어 3차 베지어 리본 워퍼 및
 *   인물 얼굴·말풍선 회전 타원 안전 영역을 해석적으로 클리핑하는 결정론적 집중선·속도선 합성기
 * - `live-storyboard-manuscript-bidirectional-sync`: 한국어 `keep-all` 말풍선 박스 추정 및 작가 수동 배치·스타일을
 *   보존하는 스토리보드 ↔ 고해상도 원고 3-Way 양방향 앵커 동기화 엔진
 * - `parallax-25d-cut-depth-decomposer`: 4단계 깊이 평면 컷 분해, 투명 빈틈 방지 스커트 여백 산출,
 *   얇은 렌즈 착란원(DoF) 블러 및 `prefersReducedMotion` 무변위 접근성 패럴랙스 해석기
 */

export {
  SFX_EMOTION_PROFILES,
  evaluateCubicBezierPoint,
  evaluateCubicBezierTangent,
  generateProceduralActionLines,
  isPointInsideSafeEllipse,
  warpSfxGlyphFramesAlongSpine,
  type ClippedActionLineSegment,
  type CubicBezierSpine2D,
  type ProceduralActionLineInput,
  type ProceduralActionLineKind,
  type ProceduralActionLineResult,
  type SafeZoneEllipse,
  type SfxAxisAlignedBounds2D,
  type SfxEmotionEnvelopeSpec,
  type SfxEmotionProfileId,
  type SfxGlyphFrameInput,
  type SfxPoint2D,
  type SfxRect2D,
  type SfxRibbonWarpInput,
  type SfxRibbonWarpResult,
  type WarpedSfxGlyphQuad,
} from "./affective-sfx-vector-ribbon-generator";

export {
  estimateKoreanBalloonBox,
  syncStoryboardWithManuscript,
  type AnchorSyncStatus,
  type ArtistBalloonStyleOverrides,
  type BalloonShapeKind,
  type BaseSyncedDialogueAnchor,
  type KoreanBalloonBoxEstimate,
  type KoreanBalloonBoxInput,
  type ManuscriptBalloonNode,
  type StoryboardDialogueAnchor,
  type StoryboardManuscriptSyncInput,
  type StoryboardManuscriptSyncResult,
  type StoryboardManuscriptSyncSummary,
  type SyncConflictKind,
  type SyncConflictRecord,
  type SyncConflictResolutionPolicy,
  type SyncPoint2D,
  type SyncSize2D,
  type SyncedDialogueAnchorResult,
} from "./live-storyboard-manuscript-bidirectional-sync";

export {
  DEFAULT_PARALLAX_CAMERA_OPTICS,
  DEFAULT_PARALLAX_PLANE_PROFILES,
  PARALLAX_PLANE_PAINTER_ORDER,
  classifyCutLayerDepthPlane,
  computeThinLensCocRadiusPx,
  decomposeCutIntoParallaxPlanes,
  evaluateParallaxPlaneTransform,
  type CutLayerInput,
  type CutLayerSemanticRole,
  type CutParallaxDecompositionResult,
  type DecomposedParallaxPlane,
  type ParallaxCameraOpticsSpec,
  type ParallaxDecompositionOptions,
  type ParallaxDepthPlaneId,
  type ParallaxPlaneCalibrationProfile,
  type ParallaxPlaneTransformResult,
  type ParallaxRect2D,
  type ParallaxScrollEvaluationInput,
  type SkirtMarginBoxPx,
} from "./parallax-25d-cut-depth-decomposer";
