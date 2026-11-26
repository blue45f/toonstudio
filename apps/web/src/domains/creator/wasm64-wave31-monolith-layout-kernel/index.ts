/**
 * Wasm64 Wave 31 Autonomous Cadence 공개 진입점 (`wasm64-wave31-monolith-layout-kernel`).
 *
 * - `sacred-canvas-viewport-solver`: ToonStudio `PRODUCT.md` 성역 `>= 82%` 캔버스 점유율 보장(`contextBarHeightPx === 44`,
 *   `visibleTopMenuCount <= 7`, 초과 메뉴 `"더보기"` 배지 수납, 양측 도크 점진 시트 폴딩) 및 최소 `8px` 이격 무충돌 HUD 솔버
 * - `perspective-curvilinear-ruler-snap`: `parallel`·`vanishing-radial`·`concentric-ellipse`·`radial-symmetry`(`N = 2..12`)
 *   정밀 직교 투영, 진입·이탈 히스테리시스(`snapEngagePx` / `snapReleasePx`), 펜촉 접선 각도 및 `N`중 회전·거울 복제 다양체
 * - `inertial-pan-zoom-physics`: 무드리프트 커서·핀치 초점 고정 줌(`0.05x..64x`), 지수 감쇠 관성 패닝(`prefersReducedMotion` 즉시 정지),
 *   정수 배율(`1x`, `2x`, `4x`, `8x`) 디바이스 픽셀 그리드 선명 스냅 물리 엔진
 *
 * 주의: 스튜디오 초기 번들 영향 `0B` 및 서버 비용 `₩0` 유지를 위해 최상위 부작용 없이 순수 심볼만 내보낸다.
 */

export {
  MAX_VISIBLE_TOP_MENUS,
  MIN_HUD_SEPARATION_PX,
  MIN_TOUCH_HIT_SIZE_PX,
  SACRED_CONTEXT_BAR_HEIGHT_PX,
  SACRED_MIN_CANVAS_RATIO,
  computeAabbSeparationPx,
  solveCanonicalViewportPresets,
  solveSacredCanvasViewportLayout,
  type CanonicalHudKind,
  type HudAnchorCorner,
  type HudOverlayInput,
  type LayoutRect,
  type OverflowMenuDisclosure,
  type ResolvedHudOverlay,
  type ResolvedSideDockLayout,
  type ResolvedTopMenuSlot,
  type SacredCanvasViewportInput,
  type SacredCanvasViewportSolution,
  type SacredViewportPresetName,
  type SideDockFoldStage,
  type SideDockSide,
  type SideDockSpec,
  type TopMenuActionInput,
} from "./sacred-canvas-viewport-solver";

export {
  DEFAULT_SNAP_ENGAGE_PX,
  DEFAULT_SNAP_RELEASE_PX,
  MAX_SYMMETRY_ORDER,
  MIN_SYMMETRY_ORDER,
  createInitialRulerSnapState,
  projectOrthogonalOntoEllipse,
  projectOrthogonalOntoLine,
  replicateSymmetricStrokePoint,
  snapStylusPointToRuler,
  snapStylusStrokePolyline,
  type ComicRulerKind,
  type ComicRulerSpec,
  type ConcentricEllipseRulerSpec,
  type OrthogonalProjectionSample,
  type ParallelRulerSpec,
  type RadialSymmetryReplicationMode,
  type RadialSymmetryRulerSpec,
  type ReplicatedStrokeSample,
  type RulerHysteresisOptions,
  type RulerPoint2D,
  type RulerSnapSessionState,
  type RulerSnapStepResult,
  type VanishingRadialRulerSpec,
} from "./perspective-curvilinear-ruler-snap";

export {
  CRISP_INTEGER_ZOOMS,
  DEFAULT_FLING_FRICTION_PER_SEC,
  DEFAULT_MAX_FLING_SPEED_PX_PER_SEC,
  DEFAULT_REST_SPEED_PX_PER_SEC,
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  applyAnchorLockedZoom,
  applyAnchorLockedZoomByFactor,
  clampCameraZoom,
  createInitialCameraPhysicsState,
  launchInertialPanFling,
  matchCrispIntegerZoom,
  resolvePixelGridCrispTransform,
  screenToWorldPoint,
  snapCameraPanToDevicePixelGrid,
  stepInertialPanPhysics,
  worldToScreenPoint,
  type AnchorLockedZoomOptions,
  type AnchorLockedZoomResult,
  type CanvasCameraPhysicsState,
  type CanvasCameraTransform,
  type CrispIntegerZoom,
  type InertialFlingOptions,
  type InertialPanStepResult,
  type PixelGridAlignedRenderTransform,
  type ViewportPoint2D,
} from "./inertial-pan-zoom-physics";
