/**
 * 24종 `ui-ready` 확장 전문 도구 인터랙티브 마운트 스테이지.
 *
 * 동적 로드된 `loadedModule[primaryExportName]` 컴포넌트를 실스토어 라이브 어댑터
 * (`localStorage` + `toonstudio:expanded-tool-commit` + `studio-planning-store`)와
 * 양방향 동기화해 마운트한다(`import type` 전용으로 정적 번들 영향 0바이트).
 */
import { ArrowRightLeft, Layers, Lock, Sparkles } from "lucide-react";
import { createElement, useEffect, useState, type ComponentType, type ReactElement } from "react";

import { cn } from "@/shared/lib/utils";
import type { StudioAnimCanvasOverlayProps } from "../animation/StudioAnimCanvasOverlay";
import type { StudioBg3dWallCutawayToggleProps } from "../bg3d/StudioBg3dWallCutawayToggle";
import type { Studio3dHeadMixerPanelProps } from "../character-shaper/Studio3dHeadMixerPanel";
import type { StudioBodyRatioMatrixPadProps } from "../character-shaper/StudioBodyRatioMatrixPad";
import type { StudioCharacterInlineQuickBarProps } from "../comic/StudioCharacterInlineQuickBar";
import type { StudioPanelKnifeControlSectionProps } from "../comic/StudioPanelKnifeControlSection";
import type { StudioUnderpaintingPanelProps } from "../fill/StudioUnderpaintingPanel";
import type { StudioAdjustmentLayerInspectorProps } from "../layer/StudioAdjustmentLayerInspector";
import type { StudioBlendIfPanelProps } from "../layer/StudioBlendIfPanel";
import type { StudioParametricEmotionBubblePanelProps } from "../lettering/StudioParametricEmotionBubblePanel";
import type { StudioStoryEditorFindReplaceProps } from "../lettering/StudioStoryEditorFindReplace";
import type { StudioAiProposalDiffGateProps } from "../planning/StudioAiProposalDiffGate";
import type { StudioSixPerspectiveReviewDrawerProps } from "../planning/StudioSixPerspectiveReviewDrawer";
import type { StudioStoryThreeViewWorkspaceProps } from "../planning/StudioStoryThreeViewWorkspace";
import type { StudioWebtoonViewAreaOverlayProps } from "../reader-preview/StudioWebtoonViewAreaOverlay";
import type { StudioShadingAssistWiredPanelProps } from "../shading/StudioShadingAssistWiredPanel";
import type { StudioShadingLightBallOverlayProps } from "../shading/StudioShadingLightBallOverlay";
import type { Studio3dRadialPieMenuProps } from "../studio-3d-ui/Studio3dRadialPieMenu";
import type { StudioUnified3dStageShellProps } from "../studio-3d-ui/StudioUnified3dStageShell";
import type { StudioOnCanvasMeshWarpOverlayProps } from "../transform/StudioOnCanvasMeshWarpOverlay";
import type { StudioHandPoseTrianglePadProps } from "../vrm/StudioHandPoseTrianglePad";
import type { StudioSurfaceBoundStrokeControlsProps } from "../vrm/StudioSurfaceBoundStrokeControls";
import type { StudioConsistencyAssetStripProps } from "./StudioConsistencyAssetStrip";
import type { StudioSelectionContextPromptBarProps } from "./StudioSelectionContextPromptBar";
import type { StudioEcosystemLoaderId } from "./studio-ecosystem-lazy-registry";
import {
  STUDIO_CANVAS_ZONES,
  STUDIO_STORY_LIVING_SPEC_UPDATED_EVENT,
  commitDialoguePagesToLivePlanning,
  commitExpandedLiveWorkspace,
  commitUnderpaintingJob,
  dispatchCanvasZoneDragTransfer,
  enterUnderpaintingMarkingWorkflow,
  readDialoguePagesFromLivePlanning,
  readExpandedLiveWorkspace,
  readProjectStoryLivingSpecRecord,
  resolveActiveExpandedProjectId,
  subscribeExpandedToolCommits,
  updateUnderpaintingBatchCuts,
  writeProjectStoryLivingSpecRecord,
  type StudioCanvasZoneId,
  type StudioExpandedLiveWorkspaceState,
} from "./studio-expanded-tool-live-adapters";
import {
  createSampleAnimCamera,
  createSampleBodyAndHairState,
  createSampleCharacterInlineState,
  createSampleCornerQuad,
  createSampleHandFingerLocks,
  createSampleHeadMixerState,
  createSampleKnifeFrame,
  createSampleLightBallState,
  createSampleLightTableState,
  createSampleMeshLattice,
  createSampleSelectionPromptItems,
  createSampleShadingImageEl,
  createSampleSurfaceStrokeConfig,
  createSampleSurfaceStrokes,
  createSampleWallCutawayConfig,
  decodeSampleShadingImage,
  encodeSampleWorkbenchPng,
} from "./studio-expanded-tool-ui-samples";

function renderModuleComponent<P extends object>(mod: Record<string, unknown>, exportName: string, props: P): ReactElement | null {
  const candidate = mod[exportName];
  if (typeof candidate !== "function") return null;
  return createElement(candidate as ComponentType<P>, props);
}

export interface StudioExpandedToolUiStageProps {
  readonly loaderId: StudioEcosystemLoaderId;
  readonly primaryExportName: string;
  readonly loadedModule: Record<string, unknown>;
  readonly projectId?: string;
  readonly onBack: () => void;
  readonly onActivity: (message: string) => void;
}

const UNDERPAINTING_BATCH_PRESETS: readonly { readonly labelKo: string; readonly cutIds: readonly string[] }[] = Object.freeze([
  { labelKo: "단일 컷 (1장)", cutIds: ["cut-01"] },
  { labelKo: "연속 배치 (2장)", cutIds: ["cut-01", "cut-02"] },
  { labelKo: "연속 배치 (3장)", cutIds: ["cut-01", "cut-02", "cut-03"] },
]);

const CHIP_BTN = "min-h-11 rounded-lg border px-2.5 text-xs font-medium transition-colors";
const CHIP_IDLE = "border-line bg-card text-fg-2 hover:bg-raised";
const CHIP_ACTIVE = "border-accent bg-accent/10 text-accent";

export function StudioExpandedToolUiStage({
  loaderId,
  primaryExportName,
  loadedModule,
  projectId,
  onBack,
  onActivity,
}: StudioExpandedToolUiStageProps): ReactElement | null {
  const resolvedProjectId = resolveActiveExpandedProjectId(projectId);
  const [workspace, setWorkspace] = useState<StudioExpandedLiveWorkspaceState>(() => readExpandedLiveWorkspace(resolvedProjectId));
  const [dialoguePages, setDialoguePages] = useState(() => readDialoguePagesFromLivePlanning(resolvedProjectId));
  const [storyRecord, setStoryRecord] = useState(() => readProjectStoryLivingSpecRecord(resolvedProjectId));

  const [lightBall, setLightBall] = useState(createSampleLightBallState);
  const [knifeFrame, setKnifeFrame] = useState(createSampleKnifeFrame);
  const [headMixer, setHeadMixer] = useState(createSampleHeadMixerState);
  const [bodyHair, setBodyHair] = useState(createSampleBodyAndHairState);
  const [handSide, setHandSide] = useState<"left" | "right">("right");
  const [handPoint, setHandPoint] = useState({ x: 0.5, y: 0.25 });
  const [handLocks, setHandLocks] = useState(createSampleHandFingerLocks);
  const [strokeConfig, setStrokeConfig] = useState(createSampleSurfaceStrokeConfig);
  const [strokes, setStrokes] = useState(createSampleSurfaceStrokes);
  const [cutawayConfig, setCutawayConfig] = useState(createSampleWallCutawayConfig);
  const [pieMenuId, setPieMenuId] = useState<"mode" | "shading" | "snap" | "favorites">("mode");
  const [pieOpen, setPieOpen] = useState(true);
  const [stage3dId, setStage3dId] = useState<"build" | "pose" | "shot" | "live-ink">("build");
  const [animFrame, setAnimFrame] = useState(1);
  const [lightTable, setLightTable] = useState(createSampleLightTableState);
  const [animCamera, setAnimCamera] = useState(createSampleAnimCamera);
  const [showSafeZones, setShowSafeZones] = useState(true);

  useEffect(() => {
    setWorkspace(readExpandedLiveWorkspace(resolvedProjectId));
    setDialoguePages(readDialoguePagesFromLivePlanning(resolvedProjectId));
    setStoryRecord(readProjectStoryLivingSpecRecord(resolvedProjectId));
    const unsubscribeCommits = subscribeExpandedToolCommits((envelope) => {
      if (envelope.projectId !== resolvedProjectId) return;
      setWorkspace(readExpandedLiveWorkspace(resolvedProjectId));
      setDialoguePages(readDialoguePagesFromLivePlanning(resolvedProjectId));
    });
    const onStoryUpdated = () => setStoryRecord(readProjectStoryLivingSpecRecord(resolvedProjectId));
    window.addEventListener(STUDIO_STORY_LIVING_SPEC_UPDATED_EVENT, onStoryUpdated);
    return () => {
      unsubscribeCommits();
      window.removeEventListener(STUDIO_STORY_LIVING_SPEC_UPDATED_EVENT, onStoryUpdated);
    };
  }, [resolvedProjectId]);

  const commitWorkspace = (
    targetLoader: StudioEcosystemLoaderId,
    summaryKo: string,
    updater: (prev: StudioExpandedLiveWorkspaceState, now: string) => StudioExpandedLiveWorkspaceState,
    payload?: Readonly<Record<string, unknown>>,
  ) => {
    const { state } = commitExpandedLiveWorkspace(resolvedProjectId, targetLoader, summaryKo, updater, { payload });
    setWorkspace(state);
    onActivity(summaryKo);
  };

  const commitStorySpec = (summaryKo: string, updater: (prev: StorySpecState) => StorySpecState) => {
    setStoryRecord(writeProjectStoryLivingSpecRecord(resolvedProjectId, { ...storyRecord, state: updater(storyRecord.state) }));
    onActivity(summaryKo);
  };

  const handleZoneTransfer = (
    fromZone: StudioCanvasZoneId,
    toZone: StudioCanvasZoneId,
    item: { readonly itemId: string; readonly label: string; readonly kind: "layer" | "cut" | "character" | "background" | "prop" },
  ) => {
    setWorkspace(dispatchCanvasZoneDragTransfer(resolvedProjectId, { ...item, fromZone, toZone }));
    onActivity(`${item.label} 항목을 4구역 드래그 브리지로 전송했습니다.`);
  };

  switch (loaderId) {
    case "shading-assist-panel":
      return renderModuleComponent<StudioShadingAssistWiredPanelProps>(loadedModule, primaryExportName, {
        selected: createSampleShadingImageEl(), readableImageSrc: "workbench://sample-character",
        decodeSource: decodeSampleShadingImage, encodePng: encodeSampleWorkbenchPng,
        onPatch: () => onActivity("현재 레이어 음영 설정을 반영했습니다."),
        onCreateShadingLayer: (payload) => { onActivity(`${payload.name} 음영 레이어를 생성했습니다.`); return true; },
      });
    case "shading-light-ball-overlay":
      return renderModuleComponent<StudioShadingLightBallOverlayProps>(loadedModule, primaryExportName, {
        variant: "embedded", value: lightBall,
        onChange: (patch) => { setLightBall((prev) => ({ ...prev, ...patch })); onActivity("광원 볼 각도와 림라이트 강도를 조정했습니다."); },
      });
    case "panel-knife-section":
      return renderModuleComponent<StudioPanelKnifeControlSectionProps>(loadedModule, primaryExportName, {
        frame: knifeFrame, panelGutter: 32, panelSplitRatio: 50,
        onReplaceSplitFrames: ([first]) => { setKnifeFrame(first); onActivity("컷 프레임을 사선으로 분할했습니다."); },
        onCommitKnifeSplit: (result) => { setKnifeFrame(result.frames[0]); onActivity(`컷 분할을 확정했습니다 (결과 ${result.frames.length}컷).`); },
      });
    case "parametric-emotion-bubble-panel":
      return renderModuleComponent<StudioParametricEmotionBubblePanelProps>(loadedModule, primaryExportName, {
        onInsertBubble: (variant) => onActivity(`감정 말풍선(${variant})을 삽입했습니다.`),
      });
    case "head-mixer-3d-panel":
      return renderModuleComponent<Studio3dHeadMixerPanelProps>(loadedModule, primaryExportName, {
        state: headMixer, onChange: (next) => { setHeadMixer(next); onActivity("3D 두상 스타일 혼합 비율을 조정했습니다."); },
      });
    case "body-ratio-matrix-pad":
      return renderModuleComponent<StudioBodyRatioMatrixPadProps>(loadedModule, primaryExportName, {
        state: bodyHair, onChange: (next) => { setBodyHair(next); onActivity("체형 비율과 헤어 구성을 변경했습니다."); },
      });
    case "hand-pose-triangle-pad":
      return renderModuleComponent<StudioHandPoseTrianglePadProps>(loadedModule, primaryExportName, {
        side: handSide, point: handPoint, lockedFingers: handLocks,
        onChangeSide: (nextSide) => { setHandSide(nextSide); onActivity(nextSide === "left" ? "왼손 포즈로 전환했습니다." : "오른손 포즈로 전환했습니다."); },
        onChangePoint: (pt) => { setHandPoint(pt); onActivity("손 포즈 삼각형 좌표를 조정했습니다."); },
        onToggleFingerLock: (finger) => { setHandLocks((prev) => ({ ...prev, [finger]: !prev[finger] })); onActivity("손가락 개별 잠금을 전환했습니다."); },
      });
    case "surface-bound-stroke-controls":
      return renderModuleComponent<StudioSurfaceBoundStrokeControlsProps>(loadedModule, primaryExportName, {
        config: strokeConfig, strokes, lastBuildTimeMs: 1.4,
        onChangeConfig: (next) => { setStrokeConfig(next); onActivity("3D 표면 직드로잉 설정을 변경했습니다."); },
        onUndoStroke: () => { setStrokes((prev) => prev.slice(0, -1)); onActivity("마지막 표면 획을 되돌렸습니다."); },
        onClearStrokes: () => { setStrokes([]); onActivity("표면 획 목록을 비웠습니다."); },
      });
    case "bg3d-wall-cutaway-toggle":
      return renderModuleComponent<StudioBg3dWallCutawayToggleProps>(loadedModule, primaryExportName, {
        config: cutawayConfig,
        onChange: (next) => { setCutawayConfig(next); onActivity(next.enabled ? "앞벽 자동 숨김을 켰습니다." : "모든 벽을 고정 표시합니다."); },
        onResetOverrides: () => { setCutawayConfig(createSampleWallCutawayConfig()); onActivity("벽 표시 설정을 초기화했습니다."); },
      });
    case "radial-pie-3d-menu": {
      const menuTabs = [["mode", "모드"], ["shading", "음영"], ["snap", "스냅"], ["favorites", "즐겨찾기"]] as const;
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {menuTabs.map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setPieMenuId(id); setPieOpen(true); }} className={cn(CHIP_BTN, pieMenuId === id ? CHIP_ACTIVE : CHIP_IDLE)}>
                {label}
              </button>
            ))}
          </div>
          <div className="relative mx-auto h-[300px] w-full max-w-[320px] overflow-hidden rounded-xl border border-line bg-panel">
            {pieOpen ? (
              renderModuleComponent<Studio3dRadialPieMenuProps>(loadedModule, primaryExportName, {
                open: true, menuId: pieMenuId, origin: { x: 150, y: 150 }, radiusPx: 82, className: "!absolute",
                onSelectAction: (item) => onActivity(`파이 메뉴 동작 선택: ${item.labelKo}`),
                onClose: () => { setPieOpen(false); onActivity("파이 메뉴를 닫았습니다."); },
              })
            ) : (
              <div className="flex h-full items-center justify-center">
                <button type="button" onClick={() => setPieOpen(true)} className="min-h-11 rounded-lg border border-accent bg-accent/10 px-4 text-xs font-semibold text-accent hover:bg-raised">
                  파이 메뉴 다시 열기
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }
    case "unified-3d-stage-shell":
      return renderModuleComponent<StudioUnified3dStageShellProps>(loadedModule, primaryExportName, {
        activeStage: stage3dId,
        onStageChange: (nextStage) => { setStage3dId(nextStage); onActivity(`3D 작업 단계를 전환했습니다 (${nextStage}).`); },
        onBakeToCut: () => onActivity("현재 3D 구도를 2D 컷에 반영했습니다."),
        onReturnTo2d: onBack,
        viewport: (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-panel p-4 text-center">
            <Layers className="h-5 w-5 text-accent" aria-hidden />
            <p className="text-xs font-semibold text-fg">통합 3D 스테이지 미리보기 ({stage3dId})</p>
            <p className="text-xs text-fg-2">상단 단계 탭을 눌러 4단계 작업 흐름을 바로 전환할 수 있습니다.</p>
          </div>
        ),
      });
    case "selection-context-prompt-bar":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => commitWorkspace("selection-context-prompt-bar", "선택 대상을 비워 새로 생성 모드로 전환했습니다.", (prev) => ({ ...prev, selectionItems: [] }))} className={cn(CHIP_BTN, CHIP_IDLE)}>
              0개 선택(생성)
            </button>
            <button type="button" onClick={() => commitWorkspace("selection-context-prompt-bar", "단일 캐릭터 레이어를 선택해 수정 모드로 전환했습니다.", (prev) => ({ ...prev, selectionItems: createSampleSelectionPromptItems() }))} className={cn(CHIP_BTN, CHIP_IDLE)}>
              1개 선택(수정)
            </button>
            <button type="button" onClick={() => commitWorkspace("selection-context-prompt-bar", "2개 항목을 선택해 번호순 합성 모드로 전환했습니다.", (prev) => ({ ...prev, selectionItems: [{ id: "sel-char-1", label: "주인공 서연 레이어", kind: "character" }, { id: "sel-bg-1", label: "옥상 노을 배경", kind: "background" }] }))} className={cn(CHIP_BTN, CHIP_IDLE)}>
              2개 선택(합성)
            </button>
            <button
              type="button" data-testid="zone-drag-to-consistency-btn"
              onClick={() => handleZoneTransfer("canvas-stage", "consistency-strip", { itemId: workspace.selectionItems[0]?.id ?? "sel-char-1", label: workspace.selectionItems[0]?.label ?? "주인공 서연 레이어", kind: workspace.selectionItems[0]?.kind ?? "character" })}
              className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/50 bg-accent-soft px-3 text-xs font-semibold text-accent hover:bg-raised"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
              소재 스트립으로 보내기
            </button>
          </div>
          {renderModuleComponent<StudioSelectionContextPromptBarProps>(loadedModule, primaryExportName, {
            selectedItems: workspace.selectionItems,
            activeRefinementTool: workspace.activeRefinementTool,
            onSubmitCreate: (p) => commitWorkspace("selection-context-prompt-bar", `새 생성 요청을 작업공간에 기록했습니다: ${p.prompt || "기본 스타일"}`, (prev, now) => ({ ...prev, lastPromptSubmission: { mode: "create", prompt: p.prompt, targetIds: [], at: now } }), { mode: "create", prompt: p.prompt }),
            onSubmitEdit: (p) => commitWorkspace("selection-context-prompt-bar", `선택 대상 수정 요청을 작업공간에 반영했습니다: ${p.prompt || p.subMode}`, (prev, now) => ({ ...prev, lastPromptSubmission: { mode: "edit", prompt: p.prompt || p.subMode, targetIds: [p.targetId], at: now } }), { mode: "edit", targetId: p.targetId }),
            onSubmitComposite: (p) => commitWorkspace("selection-context-prompt-bar", `${p.orderedTargetIds.length}개 항목 참조 합성 요청을 기록했습니다.`, (prev, now) => ({ ...prev, lastPromptSubmission: { mode: "composite", prompt: p.prompt, targetIds: p.orderedTargetIds, at: now } }), { mode: "composite", targetCount: p.orderedTargetIds.length }),
            onSelectRefinementTool: (tool) => commitWorkspace("selection-context-prompt-bar", `세부 보정 도구를 실스토어에 선택했습니다: ${tool}`, (prev) => ({ ...prev, activeRefinementTool: tool }), { tool }),
            onRemoveFromSelection: (id) => commitWorkspace("selection-context-prompt-bar", "선택 항목을 해제했습니다.", (prev) => ({ ...prev, selectionItems: prev.selectionItems.filter((item) => item.id !== id) })),
            onClearSelection: () => commitWorkspace("selection-context-prompt-bar", "선택 항목을 모두 비웠습니다.", (prev) => ({ ...prev, selectionItems: [] })),
          })}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2">
            <span className="font-semibold text-fg">4구역 양방향 동기화:</span>
            {STUDIO_CANVAS_ZONES.map((zone) => (
              <span key={zone.id} className="rounded border border-line bg-panel px-2 py-0.5 tabular-nums">
                {zone.labelKo} ({workspace.canvasZoneDrag.zoneItemIds[zone.id].length})
              </span>
            ))}
          </div>
        </div>
      );
    case "consistency-asset-strip":
      return renderModuleComponent<StudioConsistencyAssetStripProps>(loadedModule, primaryExportName, {
        slots: workspace.consistencySlots,
        activeCutId: workspace.activeCutId,
        onChangeSlots: (next) => commitWorkspace("consistency-asset-strip", `참고 소재 슬롯 ${next.length}건을 실스토어에 저장했습니다.`, (prev) => ({ ...prev, consistencySlots: next }), { slotCount: next.length, activeCutId: workspace.activeCutId }),
      });
    case "underpainting-panel": {
      const up = workspace.underpainting;
      const stageText = up.batchWorkflowStage === "marking" ? "마킹 진행 중" : up.batchWorkflowStage === "ready-to-mark" ? "마킹 대기 (2장 이상)" : up.batchWorkflowStage === "completed" ? `3층 출력 저장됨 (${up.outputLayers.length}층)` : "단일 컷 대기";
      return (
        <div className="space-y-3">
          <div data-testid="underpainting-live-workflow-bar" className="space-y-2 rounded-xl border border-line bg-card p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
                <Lock className="h-3.5 w-3.5 text-accent" aria-hidden />
                선화 Multiply 잠금 활성 · 배치 {up.batchCutIds.length}장
              </span>
              <span data-testid="underpainting-workflow-stage" className="rounded border border-accent/40 bg-accent-soft px-2 py-0.5 font-semibold text-accent">
                {stageText}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {UNDERPAINTING_BATCH_PRESETS.map((preset) => (
                <button
                  key={preset.labelKo} type="button" data-testid={`underpainting-batch-${preset.cutIds.length}`}
                  onClick={() => { setWorkspace(updateUnderpaintingBatchCuts(resolvedProjectId, preset.cutIds)); onActivity(`${preset.labelKo} 구성을 작업공간에 저장했습니다.`); }}
                  className={cn(CHIP_BTN, up.batchCutIds.length === preset.cutIds.length ? "border-accent bg-accent text-on-accent" : "border-line bg-panel text-fg-2 hover:bg-raised")}
                >
                  {preset.labelKo}
                </button>
              ))}
              {up.batchCutIds.length >= 2 ? (
                <button
                  type="button" data-testid="underpainting-go-marking-btn"
                  onClick={() => { setWorkspace(enterUnderpaintingMarkingWorkflow(resolvedProjectId)); onActivity(`연속 ${up.batchCutIds.length}컷 마킹하러 가기를 시작했습니다.`); }}
                  className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-xs font-bold text-on-accent hover:opacity-95"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  마킹하러 가기
                </button>
              ) : null}
            </div>
            {up.outputLayers.length > 0 ? (
              <div data-testid="underpainting-persisted-layers" className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                {up.outputLayers.map((layer) => (
                  <span key={layer.id} className="rounded border border-line bg-panel px-2 py-0.5 text-[11px] text-fg-2">{layer.labelKo}</span>
                ))}
              </div>
            ) : null}
          </div>
          {renderModuleComponent<StudioUnderpaintingPanelProps>(loadedModule, primaryExportName, {
            cutId: up.cutId, lineartLayerId: up.lineartLayerId, lineartLayerName: up.lineartLayerName,
            canvasWidth: 800, canvasHeight: 1920, activeMarkLabel: up.activeMarkLabel, markingStrokes: up.markingStrokes,
            onChangeActiveMarkLabel: (next) => commitWorkspace("underpainting-panel", `캐릭터 마킹 펜 ${next} 선택 및 컷 마킹을 추가했습니다.`, (prev) => ({
              ...prev, underpainting: { ...prev.underpainting, activeMarkLabel: next, markingStrokes: [...prev.underpainting.markingStrokes, { cutId: prev.underpainting.cutId, label: next, normalizedXY: [0.5, 0.45] }] },
            }), { activeMarkLabel: next }),
            onClearMarkings: () => commitWorkspace("underpainting-panel", "A~F 마킹 기록을 초기화했습니다.", (prev) => ({ ...prev, underpainting: { ...prev.underpainting, markingStrokes: [] } })),
            onRunUnderpainting: (job) => { setWorkspace(commitUnderpaintingJob(resolvedProjectId, job)); onActivity(`3층 자동채색(${job.outputMode}) 결과를 선화 Multiply 잠금 아래 영속 반영했습니다.`); },
          })}
        </div>
      );
    }
    case "story-find-replace-panel":
      return renderModuleComponent<StudioStoryEditorFindReplaceProps>(loadedModule, primaryExportName, {
        pages: dialoguePages,
        currentPageId: dialoguePages[0]?.id ?? "page-1",
        onApplyPages: (nextPages, summary) => {
          setWorkspace(commitDialoguePagesToLivePlanning(resolvedProjectId, nextPages, summary.replacedCount));
          setDialoguePages(nextPages);
          onActivity(`대사 ${summary.replacedCount}건을 에피소드 기획·대사 실스토어에 반영했습니다.`);
        },
      });
    case "story-three-view-workspace":
      return renderModuleComponent<StudioStoryThreeViewWorkspaceProps>(loadedModule, primaryExportName, {
        state: storyRecord.state,
        onChangeView: (nextView) => commitStorySpec(`스토리 화면을 전환했습니다 (${nextView}).`, (prev) => ({ ...prev, activeView: nextView })),
        onSelectNode: (nodeKey) => commitStorySpec(`${nodeKey} 노드를 선택했습니다.`, (prev) => ({ ...prev, selectedNodeKey: nodeKey })),
        onUpdateCutSlot: (nodeKey, slotKey, value) => commitStorySpec(`${nodeKey} 연출 슬롯을 실스토어에 저장했습니다.`, (prev) => ({
          ...prev,
          nodes: prev.nodes.map((node) => {
            if (node.key !== nodeKey || !node.cutSlots) return node;
            const nextSlots = slotKey === "actors" ? { ...node.cutSlots, actors: value.split(",").map((s) => s.trim()).filter(Boolean) } : { ...node.cutSlots, [slotKey]: value };
            return { ...node, cutSlots: nextSlots };
          }),
        })),
      });
    case "ai-proposal-diff-gate":
      return renderModuleComponent<StudioAiProposalDiffGateProps>(loadedModule, primaryExportName, {
        state: storyRecord.state,
        onApprove: (proposalId) => commitStorySpec("AI 변경 제안을 승인해 프로젝트 스펙에 저장했습니다.", (prev) => ({ ...prev, proposals: prev.proposals.map((p) => (p.id === proposalId ? { ...p, status: "approved" } : p)) })),
        onEditAndApprove: (proposalId, edited) => commitStorySpec("내용을 직접 다듬어 승인하고 저장했습니다.", (prev) => ({ ...prev, proposals: prev.proposals.map((p) => (p.id === proposalId ? { ...p, status: "approved", userEdited: true, userEditedSnapshot: edited } : p)) })),
        onReject: (proposalId) => commitStorySpec("AI 변경 제안을 거절하고 기록했습니다.", (prev) => ({ ...prev, proposals: prev.proposals.map((p) => (p.id === proposalId ? { ...p, status: "rejected" } : p)) })),
      });
    case "six-perspective-review-drawer":
      return renderModuleComponent<StudioSixPerspectiveReviewDrawerProps>(loadedModule, primaryExportName, {
        state: storyRecord.state,
        onRunIncrementalReview: () => onActivity("6관점 증분 원고 검수를 다시 확인했습니다."),
        onTriageFinding: (findingId, status) => commitStorySpec(`검수 항목 상태를 실스토어에 저장했습니다 (${status}).`, (prev) => ({ ...prev, reviewFindings: prev.reviewFindings.map((f) => (f.id === findingId ? { ...f, status } : f)) })),
      });
    case "webtoon-view-area-overlay":
      return (
        <div className="space-y-3">
          <label className="block rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between text-xs text-fg-2">
              <span className="font-medium text-fg">세로 스크롤 위치 미리보기</span>
              <span className="tabular-nums">{workspace.webtoonViewArea.scrollTop}px</span>
            </div>
            <input
              type="range" aria-label="세로 스크롤 위치" min={0} max={240} value={workspace.webtoonViewArea.scrollTop}
              onChange={(event) => {
                const scrollTop = event.currentTarget.valueAsNumber;
                commitWorkspace("webtoon-view-area-overlay", `세로 시야 스크롤 위치를 ${scrollTop}px로 저장했습니다.`, (prev) => ({ ...prev, webtoonViewArea: { ...prev.webtoonViewArea, scrollTop } }));
              }}
              className="mt-2 h-7 w-full cursor-pointer accent-accent"
            />
          </label>
          <div className="flex justify-center overflow-hidden rounded-xl border border-line bg-panel p-2">
            {renderModuleComponent<StudioWebtoonViewAreaOverlayProps>(loadedModule, primaryExportName, {
              canvasWidth: 240, canvasHeight: 480, scrollTop: workspace.webtoonViewArea.scrollTop, scale: 1,
              visible: workspace.webtoonViewArea.visible, aspectRatio: workspace.webtoonViewArea.aspectRatio, maskOpacity: workspace.webtoonViewArea.maskOpacity,
              panels: [{ id: "p1", y: 20, height: 180 }, { id: "p2", y: 220, height: 220 }],
              onChangeAspectRatio: (aspectRatio) => commitWorkspace("webtoon-view-area-overlay", `스마트폰 시야 화면비(${aspectRatio})를 저장했습니다.`, (prev) => ({ ...prev, webtoonViewArea: { ...prev.webtoonViewArea, aspectRatio } })),
              onToggleVisible: (visible) => commitWorkspace("webtoon-view-area-overlay", visible ? "스마트폰 시야 마스크를 켰습니다." : "스마트폰 시야 마스크를 껐습니다.", (prev) => ({ ...prev, webtoonViewArea: { ...prev.webtoonViewArea, visible } })),
              onChangeMaskOpacity: (maskOpacity) => commitWorkspace("webtoon-view-area-overlay", `시야 마스크 농도를 ${Math.round(maskOpacity * 100)}%로 저장했습니다.`, (prev) => ({ ...prev, webtoonViewArea: { ...prev.webtoonViewArea, maskOpacity } })),
            })}
          </div>
        </div>
      );
    case "mesh-warp-overlay":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => commitWorkspace("mesh-warp-overlay", "메쉬 격자 변형 모드로 전환했습니다.", (prev) => ({ ...prev, meshWarp: { ...prev.meshWarp, mode: "mesh" } }))} className={cn(CHIP_BTN, workspace.meshWarp.mode === "mesh" ? CHIP_ACTIVE : CHIP_IDLE)}>
              메쉬 격자 변형
            </button>
            <button type="button" onClick={() => commitWorkspace("mesh-warp-overlay", "4점 원근 변형 모드로 전환했습니다.", (prev) => ({ ...prev, meshWarp: { ...prev.meshWarp, mode: "corner-pin" } }))} className={cn(CHIP_BTN, workspace.meshWarp.mode === "corner-pin" ? CHIP_ACTIVE : CHIP_IDLE)}>
              4점 원근 변형
            </button>
            <span className="ml-auto rounded border border-line bg-card px-2 py-1 text-xs tabular-nums text-fg-2">확정 {workspace.meshWarp.appliedCount}회</span>
          </div>
          <div className="relative h-[320px] w-full overflow-hidden rounded-xl border border-line bg-panel">
            {renderModuleComponent<StudioOnCanvasMeshWarpOverlayProps>(loadedModule, primaryExportName, {
              mode: workspace.meshWarp.mode, frame: { leftPx: 20, topPx: 120, widthPx: 240, heightPx: 160, zoomScale: 1 },
              targetLayerCount: workspace.meshWarp.targetLayerCount, lattice: workspace.meshWarp.lattice, cornerQuad: workspace.meshWarp.cornerQuad, className: "!absolute",
              onLatticeChange: (lattice) => commitWorkspace("mesh-warp-overlay", "메쉬 변형 격자 좌표를 저장했습니다.", (prev) => ({ ...prev, meshWarp: { ...prev.meshWarp, lattice } })),
              onCornerQuadChange: (cornerQuad) => commitWorkspace("mesh-warp-overlay", "4점 원근 모서리 좌표를 저장했습니다.", (prev) => ({ ...prev, meshWarp: { ...prev.meshWarp, cornerQuad } })),
              onReset: () => commitWorkspace("mesh-warp-overlay", "다중 레이어 변형 격자를 초기화했습니다.", (prev) => ({ ...prev, meshWarp: { ...prev.meshWarp, lattice: createSampleMeshLattice(240, 160, 3, 3), cornerQuad: createSampleCornerQuad(240, 160) } })),
              onApply: () => commitWorkspace("mesh-warp-overlay", `${workspace.meshWarp.targetLayerCount}개 레이어 변형 패치를 실스토어에 확정했습니다.`, (prev, now) => ({ ...prev, meshWarp: { ...prev.meshWarp, appliedCount: prev.meshWarp.appliedCount + 1, lastAppliedAt: now } }), { mode: workspace.meshWarp.mode, targetLayerCount: workspace.meshWarp.targetLayerCount }),
              onCancel: onBack,
            })}
          </div>
        </div>
      );
    case "adjustment-layer-inspector":
      return renderModuleComponent<StudioAdjustmentLayerInspectorProps>(loadedModule, primaryExportName, {
        layers: workspace.adjustmentLayers.layers, selectedLayerId: workspace.adjustmentLayers.selectedLayerId,
        onSelectLayer: (selectedLayerId) => commitWorkspace("adjustment-layer-inspector", "보정 레이어를 선택했습니다.", (prev) => ({ ...prev, adjustmentLayers: { ...prev.adjustmentLayers, selectedLayerId } })),
        onAddLayer: (layer) => commitWorkspace("adjustment-layer-inspector", `${layer.name} 보정 레이어를 실스토어에 추가했습니다.`, (prev) => ({ ...prev, adjustmentLayers: { layers: [...prev.adjustmentLayers.layers, layer], selectedLayerId: layer.id } }), { layerId: layer.id, kind: layer.adjustment }),
        onUpdateLayer: (layerId, next) => commitWorkspace("adjustment-layer-inspector", `${next.name} 비파괴 보정 값을 저장했습니다.`, (prev) => ({ ...prev, adjustmentLayers: { ...prev.adjustmentLayers, layers: prev.adjustmentLayers.layers.map((item) => (item.id === layerId ? next : item)) } }), { layerId }),
        onRemoveLayer: (layerId) => commitWorkspace("adjustment-layer-inspector", "보정 레이어를 제거했습니다.", (prev) => ({ ...prev, adjustmentLayers: { ...prev.adjustmentLayers, layers: prev.adjustmentLayers.layers.filter((item) => item.id !== layerId) } })),
      });
    case "blend-if-panel":
      return renderModuleComponent<StudioBlendIfPanelProps>(loadedModule, primaryExportName, {
        config: workspace.blendIf,
        onChange: (next) => commitWorkspace("blend-if-panel", `휘도·채널 Blend-If(${next.activeChannel}) 설정을 실스토어에 반영했습니다.`, (prev) => ({ ...prev, blendIf: next }), { activeChannel: next.activeChannel, enabled: next.enabled }),
      });
    case "character-inline-quick-bar":
      return (
        <div className="space-y-3">
          {renderModuleComponent<StudioCharacterInlineQuickBarProps>(loadedModule, primaryExportName, {
            state: workspace.characterInline, anchor: null,
            onChangeExpression: (expressionId) => commitWorkspace("character-inline-quick-bar", `캐릭터 표정을 실스토어에 저장했습니다 (${expressionId}).`, (prev) => ({ ...prev, characterInline: { ...prev.characterInline, expressionId } })),
            onChangePose: (poseId) => commitWorkspace("character-inline-quick-bar", `캐릭터 포즈를 실스토어에 저장했습니다 (${poseId}).`, (prev) => ({ ...prev, characterInline: { ...prev.characterInline, poseId } })),
            onChangeOutfit: (outfitId) => commitWorkspace("character-inline-quick-bar", `캐릭터 의상을 실스토어에 저장했습니다 (${outfitId}).`, (prev) => ({ ...prev, characterInline: { ...prev.characterInline, outfitId } })),
            onToggleFlipX: (flipX) => commitWorkspace("character-inline-quick-bar", flipX ? "캐릭터를 좌우 반전해 저장했습니다." : "좌우 반전을 해제했습니다.", (prev) => ({ ...prev, characterInline: { ...prev.characterInline, flipX } })),
            onReset: () => commitWorkspace("character-inline-quick-bar", "캐릭터 빠른 편집 상태를 초기화했습니다.", (prev) => ({ ...prev, characterInline: createSampleCharacterInlineState() })),
          })}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-card p-2.5 text-xs">
            <span className="font-semibold text-fg">4구역 양방향 전송:</span>
            <button type="button" data-testid="char-zone-drag-to-canvas" onClick={() => handleZoneTransfer("character-dock", "canvas-stage", { itemId: workspace.characterInline.characterId, label: `${workspace.characterInline.characterName} (${workspace.characterInline.expressionId})`, kind: "character" })} className="min-h-11 rounded-lg border border-accent/50 bg-accent-soft px-3 font-semibold text-accent hover:bg-raised">
              캔버스 선택으로 배치
            </button>
            <button type="button" data-testid="char-zone-drag-to-strip" onClick={() => handleZoneTransfer("character-dock", "consistency-strip", { itemId: workspace.characterInline.characterId, label: workspace.characterInline.characterName, kind: "character" })} className="min-h-11 rounded-lg border border-line bg-panel px-3 font-semibold text-fg-2 hover:bg-raised hover:text-fg">
              일관성 소재 스트립 등록
            </button>
          </div>
        </div>
      );
    case "anim-canvas-overlay":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
            <span className="text-xs font-medium text-fg tabular-nums">현재 프레임 {animFrame} / 12</span>
            <input type="range" aria-label="애니메이션 프레임 선택" min={1} max={12} value={animFrame} onChange={(event) => setAnimFrame(event.currentTarget.valueAsNumber)} className="h-7 w-40 cursor-pointer accent-accent" />
          </div>
          <div className="flex justify-center overflow-hidden rounded-xl border border-line bg-panel p-2">
            {renderModuleComponent<StudioAnimCanvasOverlayProps>(loadedModule, primaryExportName, {
              viewport: { width: 280, height: 180, zoomScale: 1 }, currentFrame: animFrame, totalFrames: 12, activeCelId: "cel-1",
              lightTable, camera: animCamera, showSafeZones,
              onToggleLightTable: (enabled) => setLightTable((prev) => ({ ...prev, enabled })),
              onToggleCameraLocus: (showLocus) => setAnimCamera((prev) => ({ ...prev, showLocus })),
              onToggleSafeZones: setShowSafeZones, onSelectFrame: setAnimFrame,
            })}
          </div>
        </div>
      );
    default:
      return null;
  }
}

type StorySpecState = StudioStoryThreeViewWorkspaceProps["state"];
