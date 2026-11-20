/**
 * 확장 생태계 UI 패널·오버레이·엔진 지연 로드 레지스트리.
 *
 * Wave 1~8 경쟁 5종 및 확장 생태계(32개 제품군) 신규 UI 패널·엔진을 모두
 * `() => import(...)` 동적 로더로만 등록해 초기 정적 그래프(`studio-eager-graph`)를
 * 0바이트도 늘리지 않는다. 정적 `import`는 경량 계약(`studio-intent-lazy-loader`)만 허용한다.
 */
import { createStudioIntentLazyLoader, type StudioIntentLazyLoader } from "../studio-intent-lazy-loader";

export type StudioEcosystemSurfaceKind = "panel" | "overlay" | "drawer" | "engine";
export type StudioEcosystemAvailabilityStatus = "ui-ready" | "engine-ready" | "planned";

export interface StudioEcosystemDeferredModule {
  readonly kind: "deferred";
  readonly loaderId: string;
  readonly modulePath: string;
  readonly status: "planned";
  readonly unavailableReason: string;
}

export type StudioEcosystemLoadedModule = Record<string, unknown> | StudioEcosystemDeferredModule;

export function isDeferredEcosystemModule(
  mod: StudioEcosystemLoadedModule,
): mod is StudioEcosystemDeferredModule {
  return (
    typeof mod === "object"
    && mod !== null
    && "kind" in mod
    && (mod as { readonly kind?: unknown }).kind === "deferred"
    && "status" in mod
    && (mod as { readonly status?: unknown }).status === "planned"
  );
}

export interface StudioEcosystemLazyEntry {
  readonly id: StudioEcosystemLoaderId;
  readonly labelKo: string;
  readonly surfaceKind: StudioEcosystemSurfaceKind;
  readonly status: StudioEcosystemAvailabilityStatus;
  readonly modulePath: string;
  readonly primaryExportName: string;
  readonly statusBadgeKo: string;
  readonly loader: StudioIntentLazyLoader<StudioEcosystemLoadedModule>;
}

/** 등록된 모든 확장 생태계 지연 로더 ID의 단일 진실 원천. */
export type StudioEcosystemLoaderId =
  | "shading-assist-panel" | "shading-light-ball-overlay" | "colorize-mask-engine"
  | "underpainting-panel" | "vector-surgery-engine" | "panel-knife-section"
  | "parametric-emotion-bubble-panel" | "story-find-replace-panel" | "camera-perspective-ruler-engine"
  | "head-mixer-3d-panel" | "body-ratio-matrix-pad" | "hand-pose-triangle-pad"
  | "surface-bound-stroke-controls" | "twist-swing-ik-engine" | "bg3d-wall-cutaway-toggle"
  | "bg3d-180-axis-engine" | "bg3d-ground-snap-engine" | "bg3d-spatial-grease-loft-engine"
  | "bg3d-light-switchboard-engine" | "lt-vector-brush-engine" | "lt-style-builder-edge-engine"
  | "radial-pie-3d-menu" | "unified-3d-stage-shell" | "false-perspective-3d-engine"
  | "shot-grammar-floorplan-engine" | "multi-actor-ensemble-engine" | "mannequin-screen-pose-engine"
  | "selection-context-prompt-bar" | "consistency-asset-strip" | "story-three-view-workspace"
  | "ai-proposal-diff-gate" | "six-perspective-review-drawer" | "spatial-moodboard-dna-engine"
  | "webtoon-view-area-overlay" | "mesh-warp-overlay" | "vanishing-point-planes-engine"
  | "adjustment-layer-inspector" | "blend-if-panel" | "vector-mask-engine"
  | "smart-object-runtime-engine" | "screentone-live-mask-engine" | "anim-canvas-overlay"
  | "timelapse-export-engine" | "character-inline-quick-bar" | "custom-pattern-tip-engine"
  | "remote-companion-pairing-engine" | "reference-pro-overlay-engine" | "live-performing-recorder-engine"
  | "neural-voice-lipsync-engine" | "viewport-wrap-around-engine" | "auto-layout-grid-engine"
  | "regional-control-stack-engine" | "pochade-blockin-engine" | "patchmatch-inpaint-engine"
  | "planar-shape-builder-engine" | "variable-width-tool-engine" | "vector-network-graph-engine"
  | "live-component-token-engine" | "recolor-artwork-engine" | "hybrid-cad-gestures-engine"
  | "asset-color-smart-folder-engine" | "animatic-pacing-shotlist-engine" | "anchor-3d-auto-capture-engine"
  | "dynamic-snippets-engine" | "keyboard-triage-cycle-engine" | "slash-script-director-engine"
  | "groom-guide-cage-engine" | "autophysics-trajectory-engine" | "vrm-video-mocap-engine"
  | "vrm-garment-conform-engine" | "vrm-pattern-sewing-drape-engine" | "hybrid-sdf-clay-engine"
  | "smart-mask-triplanar-engine" | "dip-pen-impasto-package" | "shaper-15-slot-package"
  | "clip-vector-sut-package" | "planned-live2d-artmesh-rig" | "planned-rive-state-machine"
  | "planned-multiplane-z-camera" | "planned-ai-node-graph";

const STATUS_BADGE_BY_STATUS: Readonly<Record<StudioEcosystemAvailabilityStatus, string>> = Object.freeze({
  "ui-ready": "패널 준비됨",
  "engine-ready": "엔진 준비됨",
  planned: "준비 예정",
});

type ModuleImporter = () => Promise<StudioEcosystemLoadedModule>;
const runtimeLoaderOverrides = new Map<StudioEcosystemLoaderId, StudioIntentLazyLoader<StudioEcosystemLoadedModule>>();

function liveEntry(
  id: StudioEcosystemLoaderId,
  labelKo: string,
  surfaceKind: StudioEcosystemSurfaceKind,
  status: "ui-ready" | "engine-ready",
  modulePath: string,
  primaryExportName: string,
  importer: ModuleImporter,
): StudioEcosystemLazyEntry {
  return Object.freeze({
    id, labelKo, surfaceKind, status, modulePath, primaryExportName,
    statusBadgeKo: STATUS_BADGE_BY_STATUS[status],
    loader: createStudioIntentLazyLoader(importer),
  });
}

/** 전체 확장 생태계 지연 로더 정본 목록(정적 import 0, 100% 동적 청크 경계). */
export const STUDIO_ECOSYSTEM_LAZY_ENTRIES: readonly StudioEcosystemLazyEntry[] = Object.freeze([
  // ── Wave 1: P0 단절 해소 UI & 엔진 ────────────────────────────────────
  liveEntry("shading-assist-panel", "자동 음영 보조 패널", "panel", "ui-ready",
    "../shading/StudioShadingAssistWiredPanel", "StudioShadingAssistWiredPanel",
    () => import("../shading/StudioShadingAssistWiredPanel")),
  liveEntry("shading-light-ball-overlay", "온캔버스 광원 볼 오버레이", "overlay", "ui-ready",
    "../shading/StudioShadingLightBallOverlay", "StudioShadingLightBallOverlay",
    () => import("../shading/StudioShadingLightBallOverlay")),
  liveEntry("colorize-mask-engine", "힌트 채색 마스크 엔진", "engine", "engine-ready",
    "../fill/studio-colorize-mask-host", "createColorizeMaskHost",
    () => import("../fill/studio-colorize-mask-host")),
  liveEntry("vector-surgery-engine", "벡터 선 수술 포인터 세션", "engine", "engine-ready",
    "../vector/studio-vector-surgery-pointer-session", "createVectorSurgeryPointerSession",
    () => import("../vector/studio-vector-surgery-pointer-session")),
  liveEntry("panel-knife-section", "사선·다각형 컷 분할 나이프", "panel", "ui-ready",
    "../comic/StudioPanelKnifeControlSection", "StudioPanelKnifeControlSection",
    () => import("../comic/StudioPanelKnifeControlSection")),
  liveEntry("parametric-emotion-bubble-panel", "8파라미터 감정 말풍선 패널", "panel", "ui-ready",
    "../lettering/StudioParametricEmotionBubblePanel", "StudioParametricEmotionBubblePanel",
    () => import("../lettering/StudioParametricEmotionBubblePanel")),
  liveEntry("camera-perspective-ruler-engine", "3D 카메라→원근 자 실시간 브리지", "engine", "engine-ready",
    "../ruler/studio-3d-camera-perspective-bridge", "projectCameraToPerspectiveRuler",
    () => import("../ruler/studio-3d-camera-perspective-bridge")),

  // ── Wave 3 & 4 RT: 경쟁 5종 초격차 UI & 3D 브리지 ──────────────────────
  liveEntry("head-mixer-3d-panel", "3D 두상 믹서 패널", "panel", "ui-ready",
    "../character-shaper/Studio3dHeadMixerPanel", "Studio3dHeadMixerPanel",
    () => import("../character-shaper/Studio3dHeadMixerPanel")),
  liveEntry("body-ratio-matrix-pad", "2D 체형 비율 매트릭스 패드", "panel", "ui-ready",
    "../character-shaper/StudioBodyRatioMatrixPad", "StudioBodyRatioMatrixPad",
    () => import("../character-shaper/StudioBodyRatioMatrixPad")),
  liveEntry("hand-pose-triangle-pad", "4영역 손 포즈 삼각형 패드", "panel", "ui-ready",
    "../vrm/StudioHandPoseTrianglePad", "StudioHandPoseTrianglePad",
    () => import("../vrm/StudioHandPoseTrianglePad")),
  liveEntry("surface-bound-stroke-controls", "3D 표면 구속 직드로잉 컨트롤", "panel", "ui-ready",
    "../vrm/StudioSurfaceBoundStrokeControls", "StudioSurfaceBoundStrokeControls",
    () => import("../vrm/StudioSurfaceBoundStrokeControls")),
  liveEntry("twist-swing-ik-engine", "관절 트위스트-스윙 IK 솔버", "engine", "engine-ready",
    "../vrm/studio-analytical-twist-swing-ik", "solveTwoBoneAnalyticalIk",
    () => import("../vrm/studio-analytical-twist-swing-ik")),
  liveEntry("bg3d-wall-cutaway-toggle", "그림자 보존 벽 숨김 토글", "overlay", "ui-ready",
    "../bg3d/StudioBg3dWallCutawayToggle", "StudioBg3dWallCutawayToggle",
    () => import("../bg3d/StudioBg3dWallCutawayToggle")),
  liveEntry("bg3d-180-axis-engine", "180도 리버스샷 축 잠금 엔진", "engine", "engine-ready",
    "../bg3d/studio-bg3d-180-axis-constraint", "evaluateReverseShotAxis",
    () => import("../bg3d/studio-bg3d-180-axis-constraint")),
  liveEntry("bg3d-ground-snap-engine", "바닥 접지·템플릿 포즈 전이 엔진", "engine", "engine-ready",
    "../bg3d/studio-bg3d-ground-snap-and-template-transfer", "snapActorToGroundPlane",
    () => import("../bg3d/studio-bg3d-ground-snap-and-template-transfer")),
  liveEntry("lt-vector-brush-engine", "3D 선화 추출 벡터 브러시 스타일", "engine", "engine-ready",
    "../lt-convert/studio-lt-vector-brush-style", "applyLtVectorBrushStyle",
    () => import("../lt-convert/studio-lt-vector-brush-style")),
  liveEntry("radial-pie-3d-menu", "3D 방사형 파이 메뉴", "overlay", "ui-ready",
    "../studio-3d-ui/Studio3dRadialPieMenu", "Studio3dRadialPieMenu",
    () => import("../studio-3d-ui/Studio3dRadialPieMenu")),
  liveEntry("unified-3d-stage-shell", "통합 4단계 3D 스테이지 셸", "panel", "ui-ready",
    "../studio-3d-ui/StudioUnified3dStageShell", "StudioUnified3dStageShell",
    () => import("../studio-3d-ui/StudioUnified3dStageShell")),
  liveEntry("false-perspective-3d-engine", "3D 과장 원근·부위 강조 셰이더", "engine", "engine-ready",
    "../scene-3d/studio-3d-false-perspective-shader", "evaluateFalsePerspectiveVertex",
    () => import("../scene-3d/studio-3d-false-perspective-shader")),
  liveEntry("selection-context-prompt-bar", "선택 대상 반응형 작업 바", "overlay", "ui-ready",
    "./StudioSelectionContextPromptBar", "StudioSelectionContextPromptBar",
    () => import("./StudioSelectionContextPromptBar")),
  liveEntry("consistency-asset-strip", "일관성 참고 소재 스트립", "panel", "ui-ready",
    "./StudioConsistencyAssetStrip", "StudioConsistencyAssetStrip",
    () => import("./StudioConsistencyAssetStrip")),
  liveEntry("underpainting-panel", "3층 언더페인팅 채색 패널", "panel", "ui-ready",
    "../fill/StudioUnderpaintingPanel", "StudioUnderpaintingPanel",
    () => import("../fill/StudioUnderpaintingPanel")),
  liveEntry("story-find-replace-panel", "회차 대사 일괄 찾기·바꾸기", "panel", "ui-ready",
    "../lettering/StudioStoryEditorFindReplace", "StudioStoryEditorFindReplace",
    () => import("../lettering/StudioStoryEditorFindReplace")),
  liveEntry("story-three-view-workspace", "스토리 3-뷰 동기화 워크스페이스", "panel", "ui-ready",
    "../planning/StudioStoryThreeViewWorkspace", "StudioStoryThreeViewWorkspace",
    () => import("../planning/StudioStoryThreeViewWorkspace")),
  liveEntry("ai-proposal-diff-gate", "AI 제안 비교·승인 게이트", "drawer", "ui-ready",
    "../planning/StudioAiProposalDiffGate", "StudioAiProposalDiffGate",
    () => import("../planning/StudioAiProposalDiffGate")),
  liveEntry("six-perspective-review-drawer", "6관점 원고 증분 검수 서랍", "drawer", "ui-ready",
    "../planning/StudioSixPerspectiveReviewDrawer", "StudioSixPerspectiveReviewDrawer",
    () => import("../planning/StudioSixPerspectiveReviewDrawer")),
  liveEntry("webtoon-view-area-overlay", "스마트폰 세로 시야 미리보기", "overlay", "ui-ready",
    "../reader-preview/StudioWebtoonViewAreaOverlay", "StudioWebtoonViewAreaOverlay",
    () => import("../reader-preview/StudioWebtoonViewAreaOverlay")),
  liveEntry("mesh-warp-overlay", "온캔버스 다중 레이어 메쉬 워프", "overlay", "ui-ready",
    "../transform/StudioOnCanvasMeshWarpOverlay", "StudioOnCanvasMeshWarpOverlay",
    () => import("../transform/StudioOnCanvasMeshWarpOverlay")),
  liveEntry("adjustment-layer-inspector", "비파괴 보정 레이어 인스펙터", "panel", "ui-ready",
    "../layer/StudioAdjustmentLayerInspector", "StudioAdjustmentLayerInspector",
    () => import("../layer/StudioAdjustmentLayerInspector")),
  liveEntry("blend-if-panel", "휘도·채널 블렌드-이프 패널", "panel", "ui-ready",
    "../layer/StudioBlendIfPanel", "StudioBlendIfPanel",
    () => import("../layer/StudioBlendIfPanel")),
  liveEntry("screentone-live-mask-engine", "라이브 스크린톤·케즈리 깎기 엔진", "engine", "engine-ready",
    "../screentone/studio-screentone-live-mask", "createScreentoneLiveMask",
    () => import("../screentone/studio-screentone-live-mask")),
  liveEntry("character-inline-quick-bar", "캐릭터 인라인 빠른 편집 바", "overlay", "ui-ready",
    "../comic/StudioCharacterInlineQuickBar", "StudioCharacterInlineQuickBar",
    () => import("../comic/StudioCharacterInlineQuickBar")),
  liveEntry("anim-canvas-overlay", "프레임 셀 애니메이션 오버레이", "overlay", "ui-ready",
    "../animation/StudioAnimCanvasOverlay", "StudioAnimCanvasOverlay",
    () => import("../animation/StudioAnimCanvasOverlay")),
  liveEntry("timelapse-export-engine", "작업 과정 타임랩스 내보내기", "engine", "engine-ready",
    "../timelapse-share/studio-timelapse-export-pipeline", "buildTimelapseExportPlan",
    () => import("../timelapse-share/studio-timelapse-export-pipeline")),

  // ── Wave 5 & 7A: 승격 패키지 & 프로 핵심 엔진 ──────────────────────────
  liveEntry("custom-pattern-tip-engine", "커스텀 도장·리본 브러시 팁 등록기", "engine", "engine-ready",
    "../brush/studio-custom-pattern-tip-registrar", "registerCustomPatternTipFromPixels",
    () => import("../brush/studio-custom-pattern-tip-registrar")),
  liveEntry("remote-companion-pairing-engine", "모바일 QR 컴패니언 페어링 호스트", "engine", "engine-ready",
    "../companion/studio-remote-companion-pairing", "StudioCompanionPairingHost",
    () => import("../companion/studio-remote-companion-pairing")),
  liveEntry("smart-object-runtime-engine", "스마트 오브젝트·라이브 워프 런타임", "engine", "engine-ready",
    "../layer/studio-smart-object-runtime", "StudioSmartObjectRuntime",
    () => import("../layer/studio-smart-object-runtime")),
  liveEntry("vanishing-point-planes-engine", "3D 연결 소실점 평면 케이지", "engine", "engine-ready",
    "../transform/studio-vanishing-point-planes", "solveHomography3x3",
    () => import("../transform/studio-vanishing-point-planes")),
  liveEntry("live-performing-recorder-engine", "60Hz 라이브 퍼포밍 키프레임 녹화기", "engine", "engine-ready",
    "../motion-webtoon/studio-live-performing-recorder", "StudioLivePerformingRecorder",
    () => import("../motion-webtoon/studio-live-performing-recorder")),
  liveEntry("dip-pen-impasto-package", "만화 딥펜 레일로딩·유화 임파스토 물리", "engine", "engine-ready",
    "@toonstudio/studio-brush-platform", "simulateDipPenStroke",
    () => import("@toonstudio/studio-brush-platform")),
  liveEntry("shaper-15-slot-package", "캐릭터 15슬롯·94프리셋 호환성 계약", "engine", "engine-ready",
    "@toonstudio/studio-project-model", "validateShaperSlotAssignment",
    () => import("@toonstudio/studio-project-model")),
  liveEntry("clip-vector-sut-package", "외부 원고 벡터·스크린톤·브러시 소재 파서", "engine", "engine-ready",
    "@toonstudio/studio-format-gateway", "parseClipVectorStrokeBlob",
    () => import("@toonstudio/studio-format-gateway")),

  // ── Wave 6 & 7: 확장 생태계 6대 클러스터 엔진 ──────────────────────────
  liveEntry("vector-mask-engine", "비파괴 불리언 벡터 마스크", "engine", "engine-ready",
    "../layer/studio-vector-mask-engine", "evaluateVectorMask",
    () => import("../layer/studio-vector-mask-engine")),
  liveEntry("viewport-wrap-around-engine", "무한 랩어라운드 타일 캔버스", "engine", "engine-ready",
    "../canvas/studio-viewport-wrap-around", "createWrapAroundSession",
    () => import("../canvas/studio-viewport-wrap-around")),
  liveEntry("pochade-blockin-engine", "포샤드 팬·올가미 색면 블록인", "engine", "engine-ready",
    "../drawing/studio-pochade-blockin-session", "createPochadeBlockinSession",
    () => import("../drawing/studio-pochade-blockin-session")),
  liveEntry("patchmatch-inpaint-engine", "로컬 내용 인식 채우기 워커", "engine", "engine-ready",
    "../filter/studio-patchmatch-inpaint-worker", "runPatchMatchInpaint",
    () => import("../filter/studio-patchmatch-inpaint-worker")),
  liveEntry("planar-shape-builder-engine", "평면 도형 빌더·라이브 페인트", "engine", "engine-ready",
    "../vector/studio-planar-shape-builder", "buildPlanarArrangement",
    () => import("../vector/studio-planar-shape-builder")),
  liveEntry("variable-width-tool-engine", "비대칭 가변 선폭 툴", "engine", "engine-ready",
    "../vector/studio-variable-width-tool", "evaluateVariableWidthStroke",
    () => import("../vector/studio-variable-width-tool")),
  liveEntry("vector-network-graph-engine", "평면 벡터 네트워크 그래프", "engine", "engine-ready",
    "../vector/studio-vector-network-graph", "createVectorNetworkGraph",
    () => import("../vector/studio-vector-network-graph")),
  liveEntry("auto-layout-grid-engine", "오토 레이아웃 1D·2D 그리드", "engine", "engine-ready",
    "../canvas/studio-auto-layout-grid-engine", "computeAutoLayoutGrid",
    () => import("../canvas/studio-auto-layout-grid-engine")),
  liveEntry("live-component-token-engine", "라이브 컴포넌트·디자인 토큰 브리지", "engine", "engine-ready",
    "../design-platform/studio-live-component-token-bridge", "createLiveComponentTokenBridge",
    () => import("../design-platform/studio-live-component-token-bridge")),
  liveEntry("recolor-artwork-engine", "조화 색상 휠 일괄 재배색", "engine", "engine-ready",
    "../color/studio-recolor-artwork-engine", "recolorArtworkPalette",
    () => import("../color/studio-recolor-artwork-engine")),
  liveEntry("bg3d-spatial-grease-loft-engine", "3D 공간 벡터 작화·가이드 로프트", "engine", "engine-ready",
    "../bg3d/studio-bg3d-spatial-grease-loft", "buildSpatialGreaseLoft",
    () => import("../bg3d/studio-bg3d-spatial-grease-loft")),
  liveEntry("bg3d-light-switchboard-engine", "실내 광원 스위치보드·툰 수면", "engine", "engine-ready",
    "../bg3d/studio-bg3d-light-switchboard-water", "createLightSwitchboardState",
    () => import("../bg3d/studio-bg3d-light-switchboard-water")),
  liveEntry("lt-style-builder-edge-engine", "작가 펜촉 스캔 손그림 3D 외곽선", "engine", "engine-ready",
    "../lt-convert/studio-lt-style-builder-edge-atlas", "buildHandDrawnEdgeAtlas",
    () => import("../lt-convert/studio-lt-style-builder-edge-atlas")),
  liveEntry("hybrid-cad-gestures-engine", "직접 드래그 필렛·챔퍼·불리언 CAD", "engine", "engine-ready",
    "../hybrid-dcc/studio-hybrid-cad-direct-gestures", "evaluateCadDirectGesture",
    () => import("../hybrid-dcc/studio-hybrid-cad-direct-gestures")),
  liveEntry("shot-grammar-floorplan-engine", "텍스트→3D 샷 그래머·평면 블로킹", "engine", "engine-ready",
    "../scene-3d/studio-3d-shot-grammar-floorplan", "compileShotGrammarToFloorplan",
    () => import("../scene-3d/studio-3d-shot-grammar-floorplan")),
  liveEntry("multi-actor-ensemble-engine", "최대 6인 다인물 앙상블·접촉 IK", "engine", "engine-ready",
    "../scene-3d/studio-3d-multi-actor-ensemble", "createMultiActorEnsemble",
    () => import("../scene-3d/studio-3d-multi-actor-ensemble")),
  liveEntry("mannequin-screen-pose-engine", "화면 공간 직관 포징·2D→3D 소품", "engine", "engine-ready",
    "../scene-3d/studio-mannequin-screen-space-pose", "solveScreenSpaceJointDrag",
    () => import("../scene-3d/studio-mannequin-screen-space-pose")),
  liveEntry("reference-pro-overlay-engine", "클릭-스루 트레이싱 레퍼런스 오버레이", "overlay", "engine-ready",
    "../companion/studio-reference-pro-overlay", "createReferenceProOverlayState",
    () => import("../companion/studio-reference-pro-overlay")),
  liveEntry("asset-color-smart-folder-engine", "지각 색 유사도 검색·스마트 폴더", "engine", "engine-ready",
    "../asset-workspace/studio-asset-color-smart-folder-index", "searchAssetsByPerceptualColor",
    () => import("../asset-workspace/studio-asset-color-smart-folder-index")),
  liveEntry("animatic-pacing-shotlist-engine", "대사 읽기 속도 컷 타이밍·샷 리스트", "engine", "engine-ready",
    "../animatic/studio-animatic-pacing-shotlist", "computeAnimaticPacingTimeline",
    () => import("../animatic/studio-animatic-pacing-shotlist")),
  liveEntry("anchor-3d-auto-capture-engine", "4뷰 턴테이블 캐릭터 앵커 자동 캡처", "engine", "engine-ready",
    "../anchor-consistency/anchor-3d-auto-capture", "buildTurntableAnchorCapturePlan",
    () => import("../anchor-consistency/anchor-3d-auto-capture")),
  liveEntry("regional-control-stack-engine", "영역별 AI 프롬프트·컨트롤 스택", "engine", "engine-ready",
    "../canvas/ai-control-layers/studio-regional-control-stack", "compileRegionalControlStack",
    () => import("../canvas/ai-control-layers/studio-regional-control-stack")),
  liveEntry("spatial-moodboard-dna-engine", "무한 공간 무드보드·스타일 DNA 락", "engine", "engine-ready",
    "../planning/spatial-moodboard/studio-spatial-moodboard-dna", "createSpatialMoodboardDna",
    () => import("../planning/spatial-moodboard/studio-spatial-moodboard-dna")),
  liveEntry("neural-voice-lipsync-engine", "감정 성우 캐스팅·립싱크 타임라인", "engine", "engine-ready",
    "../motion-webtoon/voice-director/studio-neural-voice-lipsync-timeline", "buildNeuralVoiceLipsyncTimeline",
    () => import("../motion-webtoon/voice-director/studio-neural-voice-lipsync-timeline")),
  liveEntry("dynamic-snippets-engine", "동적 스니펫·퀵링크·매크로 실행기", "engine", "engine-ready",
    "../shortcuts/command-automation/studio-dynamic-snippets-quicklinks", "expandDynamicSnippet",
    () => import("../shortcuts/command-automation/studio-dynamic-snippets-quicklinks")),
  liveEntry("keyboard-triage-cycle-engine", "단일키 검수 트리아지·마감 사이클", "engine", "engine-ready",
    "../production-hub/triage-cycles/studio-keyboard-triage-cycle-engine", "applyKeyboardTriageAction",
    () => import("../production-hub/triage-cycles/studio-keyboard-triage-cycle-engine")),
  liveEntry("slash-script-director-engine", "슬래시(/) 연출·@스토리바이블 대본", "engine", "engine-ready",
    "../writer-room/slash-director/studio-slash-script-director", "parseSlashScriptCommand",
    () => import("../writer-room/slash-director/studio-slash-script-director")),
  liveEntry("groom-guide-cage-engine", "절차적 3D 헤어 가이드 케이지", "engine", "engine-ready",
    "../character-platform/groom/character-groom-guide-cage-mesh", "buildHairGuideCageMesh",
    () => import("../character-platform/groom/character-groom-guide-cage-mesh")),
  liveEntry("autophysics-trajectory-engine", "다중 프레임 물리 무게중심·궤적 솔버", "engine", "engine-ready",
    "../character-platform/pose-v3/character-autophysics-trajectory-solver", "solveAutoPhysicsTrajectory",
    () => import("../character-platform/pose-v3/character-autophysics-trajectory-solver")),
  liveEntry("vrm-video-mocap-engine", "로컬 단안 영상 3D 모캡·발 고정", "engine", "engine-ready",
    "../vrm/studio-vrm-video-mocap-pipeline", "retargetVideoMocapFrames",
    () => import("../vrm/studio-vrm-video-mocap-pipeline")),
  liveEntry("vrm-garment-conform-engine", "3D 의상 버텍스 자동 맞춤·충돌 제거", "engine", "engine-ready",
    "../vrm/studio-vrm-garment-vertex-conform", "conformGarmentToBodyMesh",
    () => import("../vrm/studio-vrm-garment-vertex-conform")),
  liveEntry("vrm-pattern-sewing-drape-engine", "2D 패턴 봉제·다층 의상 드레이핑", "engine", "engine-ready",
    "../vrm/studio-vrm-pattern-sewing-drape", "solvePatternSewingDrape",
    () => import("../vrm/studio-vrm-pattern-sewing-drape")),
  liveEntry("hybrid-sdf-clay-engine", "실시간 SDF 클레이 블렌드 조형", "engine", "engine-ready",
    "../hybrid-dcc/studio-hybrid-sdf-clay-engine", "evaluateSdfClayMesh",
    () => import("../hybrid-dcc/studio-hybrid-sdf-clay-engine")),
  liveEntry("smart-mask-triplanar-engine", "곡률·AO 스마트 마스크·트라이플래너", "engine", "engine-ready",
    "../mesh-materials/studio-mesh-smart-mask-triplanar", "buildSmartMaskTriplanarParams",
    () => import("../mesh-materials/studio-mesh-smart-mask-triplanar")),

  // ── Wave 7/8 프런티어 엔진 (80/80 100% 라이브 동적 청크 연결) ──────────
  liveEntry("planned-live2d-artmesh-rig", "2D 아트메쉬 리깅·진자 물리 모션", "engine", "engine-ready",
    "../motion-webtoon/motion-webtoon-2d-mesh-rig-engine", "createGridArtMesh",
    () => import("../motion-webtoon/motion-webtoon-2d-mesh-rig-engine")),
  liveEntry("planned-rive-state-machine", "스크롤·음성 반응형 상태머신 리깅", "engine", "engine-ready",
    "../motion-webtoon/studio-rive-state-machine-rig", "RiveStateMachineRuntime",
    () => import("../motion-webtoon/studio-rive-state-machine-rig")),
  liveEntry("planned-multiplane-z-camera", "2.5D 멀티플레인 Z-카메라·페그 계층", "engine", "engine-ready",
    "../animation/studio-multiplane-z-camera", "createMultiplaneCameraDoc",
    () => import("../animation/studio-multiplane-z-camera")),
  liveEntry("planned-ai-node-graph", "비파괴 멀티모달 AI 노드 파이프라인", "engine", "engine-ready",
    "../ai/node-pipeline/studio-ai-node-graph-engine", "createAiNodeGraph",
    () => import("../ai/node-pipeline/studio-ai-node-graph-engine")),
]);

const LAZY_ENTRY_BY_ID = new Map<StudioEcosystemLoaderId, StudioEcosystemLazyEntry>(
  STUDIO_ECOSYSTEM_LAZY_ENTRIES.map((entry) => [entry.id, entry] as const),
);

/** 기능 ID로 지연 로더 엔트리를 조회한다. */
export function getEcosystemLazyEntry(loaderId: StudioEcosystemLoaderId): StudioEcosystemLazyEntry | undefined {
  return LAZY_ENTRY_BY_ID.get(loaderId);
}

/** 기능 ID의 현재 상태 배지(`패널 준비됨` / `엔진 준비됨` / `준비 예정`)를 반환한다. */
export function getEcosystemLoaderStatusBadge(
  loaderId: StudioEcosystemLoaderId,
): { readonly status: StudioEcosystemAvailabilityStatus; readonly badgeKo: string } | null {
  const entry = LAZY_ENTRY_BY_ID.get(loaderId);
  if (!entry) return null;
  if (runtimeLoaderOverrides.has(loaderId)) {
    return { status: "engine-ready", badgeKo: STATUS_BADGE_BY_STATUS["engine-ready"] };
  }
  return { status: entry.status, badgeKo: entry.statusBadgeKo };
}

/** 호버·포커스 의도 시 동적 청크를 백그라운드 예열한다. */
export function preloadEcosystemLoader(loaderId: StudioEcosystemLoaderId): void {
  const override = runtimeLoaderOverrides.get(loaderId);
  if (override) {
    override.preload();
    return;
  }
  LAZY_ENTRY_BY_ID.get(loaderId)?.loader.preload();
}

/** 기능 ID에 연결된 동적 청크를 실행 로드한다. */
export async function loadEcosystemModule(loaderId: StudioEcosystemLoaderId): Promise<StudioEcosystemLoadedModule> {
  const override = runtimeLoaderOverrides.get(loaderId);
  if (override) return override.load();
  const entry = LAZY_ENTRY_BY_ID.get(loaderId);
  if (!entry) throw new Error(`등록되지 않은 확장 생태계 로더 ID입니다: ${loaderId}`);
  return entry.loader.load();
}

/** 후속 마일스톤 모듈이 도착했을 때 planned 엔트리를 런타임에 동적 연결한다. */
export function registerEcosystemLazyLoaderOverride(loaderId: StudioEcosystemLoaderId, importer: ModuleImporter): void {
  runtimeLoaderOverrides.set(loaderId, createStudioIntentLazyLoader(importer));
}

/** 테스트 격리용 런타임 오버라이드 초기화. */
export function clearEcosystemLazyLoaderOverrides(): void {
  runtimeLoaderOverrides.clear();
}

/** 등록된 모든 지연 로더 ID 집합을 반환한다(커맨드 카탈로그 교차 정합 검사용). */
export function listRegisteredEcosystemLoaderIds(): ReadonlySet<StudioEcosystemLoaderId> {
  return new Set(STUDIO_ECOSYSTEM_LAZY_ENTRIES.map((e) => e.id));
}
