/**
 * Wasm64 Wave 51 공개 진입점 (`wasm64-wave51-reactive-episode-dag`).
 *
 * - `episode-scene-dependency-dag`: 캐릭터 팔레트 토큰·씬 조명 프리셋·배경 3D 카메라/무드
 *   방향성 비순환 그래프(DAG), Kahn 위상 정렬·순환 차단, 씬 격리 및 작가 수동 핀 보호
 * - `cross-cut-palette-lighting-propagator`: 1컷 의상·조명·배경 3D 델타의 동일 씬 2~N컷
 *   비파괴 연쇄 전파 패치 플랜 산출기 및 피부 색상각·말풍선 WCAG 명암비 자동 보정기
 * - `reactive-propagation-preview-diff`: 컷별 영향 레이어·OKLCH ΔE·예상 렌더링 ms·잠금 충돌
 *   미리보기 요약기 및 선택적 부분 커밋·즉시 원복(Revert Token) 관리기
 */

export {
  EpisodeSceneDependencyDag,
  SCENE_LIGHTING_PRESETS,
  validateAcyclicDag,
  type Bg3dCameraMoodNode,
  type Bg3dCameraMoodParams,
  type Bg3dLayerLightingState,
  type CharacterPaletteTokenNode,
  type CutLayerKind,
  type CutLayerNode,
  type DagValidationResult,
  type DependencyEdge,
  type DependencyEdgeRelation,
  type DirtyClosureOptions,
  type DirtyClosureResult,
  type DirtyLayerEntry,
  type EdgeMutationResult,
  type EpisodeDagNode,
  type OklchColor,
  type PaletteTokenSlot,
  type PinnedLayerConflict,
  type SceneLightingParams,
  type SceneLightingPresetKind,
  type SceneLightingPresetNode,
  type SpeechBubbleToneState,
} from "./episode-scene-dependency-dag";

export {
  buildCrossCutPropagationPlan,
  computeOklchContrastRatio,
  computeOklchDeltaE,
  computeOklchRelativeLuminance,
  MAX_SKIN_HUE_SHIFT_DEG,
  MIN_CEL_SHADOW_LIGHTNESS_GAP,
  MIN_SPEECH_BUBBLE_CONTRAST_RATIO,
  normalizeHueDeg,
  shortestHueDeltaDeg,
  toggleCutSelectionInPlan,
  type Bg3dMoodDelta,
  type ContrastSafetyAdjustment,
  type CrossCutPropagationRequest,
  type CutPropagationPatch,
  type LayerStylePatch,
  type PaletteTokenDelta,
  type PropagationPatchPlan,
  type SceneLightingDelta,
} from "./cross-cut-palette-lighting-propagator";

export {
  buildPropagationPreviewSummary,
  previewPartialCutSelection,
  ReactivePropagationCommitManager,
  type CutPropagationDiffSummary,
  type LayerPreCommitSnapshot,
  type PartialCommitOptions,
  type PropagationCommitResult,
  type PropagationDeltaSeverity,
  type PropagationPreviewSummary,
  type PropagationRevertResult,
  type PropagationRevertToken,
} from "./reactive-propagation-preview-diff";
