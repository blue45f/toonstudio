/**
 * 24종 `ui-ready` 확장 전문 도구 인터랙티브 마운트 스테이지.
 *
 * 동적 로드된 `loadedModule[primaryExportName]` 컴포넌트를 실동작 로컬 상태와 함께
 * 타입 안전하게 마운트한다(`import type` 전용으로 정적 번들 영향 0바이트).
 */
import { Layers } from "lucide-react";
import { createElement, useState, type ComponentType, type ReactElement } from "react";

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
  createSampleAdjustmentLayers,
  createSampleAnimCamera,
  createSampleBlendIfConfig,
  createSampleBodyAndHairState,
  createSampleCharacterInlineState,
  createSampleConsistencySlots,
  createSampleCornerQuad,
  createSampleDialoguePages,
  createSampleHandFingerLocks,
  createSampleHeadMixerState,
  createSampleKnifeFrame,
  createSampleLightBallState,
  createSampleLightTableState,
  createSampleMeshLattice,
  createSampleSelectionPromptItems,
  createSampleShadingImageEl,
  createSampleStoryLivingSpecState,
  createSampleSurfaceStrokeConfig,
  createSampleSurfaceStrokes,
  createSampleWallCutawayConfig,
  decodeSampleShadingImage,
  encodeSampleWorkbenchPng,
} from "./studio-expanded-tool-ui-samples";

function renderModuleComponent<P extends object>(
  mod: Record<string, unknown>,
  exportName: string,
  props: P,
): ReactElement | null {
  const candidate = mod[exportName];
  if (typeof candidate !== "function") return null;
  return createElement(candidate as ComponentType<P>, props);
}

export interface StudioExpandedToolUiStageProps {
  readonly loaderId: StudioEcosystemLoaderId;
  readonly primaryExportName: string;
  readonly loadedModule: Record<string, unknown>;
  readonly onBack: () => void;
  readonly onActivity: (message: string) => void;
}

export function StudioExpandedToolUiStage({
  loaderId,
  primaryExportName,
  loadedModule,
  onBack,
  onActivity,
}: StudioExpandedToolUiStageProps): ReactElement | null {
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
  const [selectionItems, setSelectionItems] = useState(createSampleSelectionPromptItems);
  const [consistencySlots, setConsistencySlots] = useState(createSampleConsistencySlots);
  const [markLabel, setMarkLabel] = useState<"A" | "B" | "C" | "D" | "E" | "F">("A");
  const [dialoguePages, setDialoguePages] = useState(createSampleDialoguePages);
  const [storyState, setStoryState] = useState(createSampleStoryLivingSpecState);
  const [webtoonScrollTop, setWebtoonScrollTop] = useState(60);
  const [warpMode, setWarpMode] = useState<"mesh" | "corner-pin">("mesh");
  const [meshLattice, setMeshLattice] = useState(() => createSampleMeshLattice(240, 160, 3, 3));
  const [cornerQuad, setCornerQuad] = useState(() => createSampleCornerQuad(240, 160));
  const [adjLayers, setAdjLayers] = useState(createSampleAdjustmentLayers);
  const [selectedAdjId, setSelectedAdjId] = useState<string | null>("adj-sample-curves");
  const [blendIfConfig, setBlendIfConfig] = useState(createSampleBlendIfConfig);
  const [charQuickState, setCharQuickState] = useState(createSampleCharacterInlineState);
  const [animFrame, setAnimFrame] = useState(1);
  const [lightTable, setLightTable] = useState(createSampleLightTableState);
  const [animCamera, setAnimCamera] = useState(createSampleAnimCamera);
  const [showSafeZones, setShowSafeZones] = useState(true);

  switch (loaderId) {
    case "shading-assist-panel":
      return renderModuleComponent<StudioShadingAssistWiredPanelProps>(loadedModule, primaryExportName, {
        selected: createSampleShadingImageEl(),
        readableImageSrc: "workbench://sample-character",
        decodeSource: decodeSampleShadingImage,
        encodePng: encodeSampleWorkbenchPng,
        onPatch: () => onActivity("현재 레이어 음영 설정을 반영했습니다."),
        onCreateShadingLayer: (payload) => {
          onActivity(`${payload.name} 음영 레이어를 생성했습니다.`);
          return true;
        },
      });
    case "shading-light-ball-overlay":
      return renderModuleComponent<StudioShadingLightBallOverlayProps>(loadedModule, primaryExportName, {
        variant: "embedded",
        value: lightBall,
        onChange: (patch) => {
          setLightBall((prev) => ({ ...prev, ...patch }));
          onActivity("광원 볼 각도와 림라이트 강도를 조정했습니다.");
        },
      });
    case "panel-knife-section":
      return renderModuleComponent<StudioPanelKnifeControlSectionProps>(loadedModule, primaryExportName, {
        frame: knifeFrame,
        panelGutter: 32,
        panelSplitRatio: 50,
        onReplaceSplitFrames: ([first]) => {
          setKnifeFrame(first);
          onActivity("컷 프레임을 사선으로 분할했습니다.");
        },
        onCommitKnifeSplit: (result) => {
          setKnifeFrame(result.frames[0]);
          onActivity(`컷 분할을 확정했습니다 (결과 ${result.frames.length}컷).`);
        },
      });
    case "parametric-emotion-bubble-panel":
      return renderModuleComponent<StudioParametricEmotionBubblePanelProps>(loadedModule, primaryExportName, {
        onInsertBubble: (variant) => onActivity(`감정 말풍선(${variant})을 삽입했습니다.`),
      });
    case "head-mixer-3d-panel":
      return renderModuleComponent<Studio3dHeadMixerPanelProps>(loadedModule, primaryExportName, {
        state: headMixer,
        onChange: (next) => {
          setHeadMixer(next);
          onActivity("3D 두상 스타일 혼합 비율을 조정했습니다.");
        },
      });
    case "body-ratio-matrix-pad":
      return renderModuleComponent<StudioBodyRatioMatrixPadProps>(loadedModule, primaryExportName, {
        state: bodyHair,
        onChange: (next) => {
          setBodyHair(next);
          onActivity("체형 비율과 헤어 구성을 변경했습니다.");
        },
      });
    case "hand-pose-triangle-pad":
      return renderModuleComponent<StudioHandPoseTrianglePadProps>(loadedModule, primaryExportName, {
        side: handSide,
        point: handPoint,
        lockedFingers: handLocks,
        onChangeSide: (nextSide) => {
          setHandSide(nextSide);
          onActivity(nextSide === "left" ? "왼손 포즈로 전환했습니다." : "오른손 포즈로 전환했습니다.");
        },
        onChangePoint: (pt) => {
          setHandPoint(pt);
          onActivity("손 포즈 삼각형 좌표를 조정했습니다.");
        },
        onToggleFingerLock: (finger) => {
          setHandLocks((prev) => ({ ...prev, [finger]: !prev[finger] }));
          onActivity("손가락 개별 잠금을 전환했습니다.");
        },
      });
    case "surface-bound-stroke-controls":
      return renderModuleComponent<StudioSurfaceBoundStrokeControlsProps>(loadedModule, primaryExportName, {
        config: strokeConfig,
        strokes,
        lastBuildTimeMs: 1.4,
        onChangeConfig: (next) => {
          setStrokeConfig(next);
          onActivity("3D 표면 직드로잉 설정을 변경했습니다.");
        },
        onUndoStroke: () => {
          setStrokes((prev) => prev.slice(0, -1));
          onActivity("마지막 표면 획을 되돌렸습니다.");
        },
        onClearStrokes: () => {
          setStrokes([]);
          onActivity("표면 획 목록을 비웠습니다.");
        },
      });
    case "bg3d-wall-cutaway-toggle":
      return renderModuleComponent<StudioBg3dWallCutawayToggleProps>(loadedModule, primaryExportName, {
        config: cutawayConfig,
        onChange: (next) => {
          setCutawayConfig(next);
          onActivity(next.enabled ? "앞벽 자동 숨김을 켰습니다." : "모든 벽을 고정 표시합니다.");
        },
        onResetOverrides: () => {
          setCutawayConfig(createSampleWallCutawayConfig());
          onActivity("벽 표시 설정을 초기화했습니다.");
        },
      });
    case "radial-pie-3d-menu": {
      const menuTabs: readonly { readonly id: "mode" | "shading" | "snap" | "favorites"; readonly label: string }[] = [
        { id: "mode", label: "모드" },
        { id: "shading", label: "음영" },
        { id: "snap", label: "스냅" },
        { id: "favorites", label: "즐겨찾기" },
      ];
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {menuTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setPieMenuId(tab.id);
                  setPieOpen(true);
                }}
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-xs font-medium transition-colors",
                  pieMenuId === tab.id ? "border-accent bg-accent/10 text-accent" : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative mx-auto h-[300px] w-full max-w-[320px] overflow-hidden rounded-xl border border-line bg-panel">
            {pieOpen ? (
              renderModuleComponent<Studio3dRadialPieMenuProps>(loadedModule, primaryExportName, {
                open: true,
                menuId: pieMenuId,
                origin: { x: 150, y: 150 },
                radiusPx: 82,
                className: "!absolute",
                onSelectAction: (item) => onActivity(`파이 메뉴 동작 선택: ${item.labelKo}`),
                onClose: () => {
                  setPieOpen(false);
                  onActivity("파이 메뉴를 닫았습니다.");
                },
              })
            ) : (
              <div className="flex h-full items-center justify-center">
                <button
                  type="button"
                  onClick={() => setPieOpen(true)}
                  className="min-h-11 rounded-lg border border-accent bg-accent/10 px-4 text-xs font-semibold text-accent hover:bg-raised"
                >
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
        onStageChange: (nextStage) => {
          setStage3dId(nextStage);
          onActivity(`3D 작업 단계를 전환했습니다 (${nextStage}).`);
        },
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
            <button type="button" onClick={() => setSelectionItems([])} className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs font-medium text-fg-2 hover:bg-raised">
              0개 선택(생성)
            </button>
            <button type="button" onClick={() => setSelectionItems(createSampleSelectionPromptItems())} className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs font-medium text-fg-2 hover:bg-raised">
              1개 선택(수정)
            </button>
            <button
              type="button"
              onClick={() => setSelectionItems([
                { id: "sel-char-1", label: "주인공 서연 레이어", kind: "character" },
                { id: "sel-bg-1", label: "옥상 노을 배경", kind: "background" },
              ])}
              className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs font-medium text-fg-2 hover:bg-raised"
            >
              2개 선택(합성)
            </button>
          </div>
          {renderModuleComponent<StudioSelectionContextPromptBarProps>(loadedModule, primaryExportName, {
            selectedItems: selectionItems,
            onSubmitCreate: (p) => onActivity(`새 생성 요청: ${p.prompt || "기본 스타일"}`),
            onSubmitEdit: (p) => onActivity(`선택 대상 수정 요청: ${p.prompt || p.subMode}`),
            onSubmitComposite: (p) => onActivity(`${p.orderedTargetIds.length}개 항목 합성 요청`),
            onSelectRefinementTool: (tool) => onActivity(`세부 보정 도구 선택: ${tool}`),
            onRemoveFromSelection: (id) => setSelectionItems((prev) => prev.filter((item) => item.id !== id)),
            onClearSelection: () => setSelectionItems([]),
          })}
        </div>
      );
    case "consistency-asset-strip":
      return renderModuleComponent<StudioConsistencyAssetStripProps>(loadedModule, primaryExportName, {
        slots: consistencySlots,
        activeCutId: "cut-01",
        onChangeSlots: (next) => {
          setConsistencySlots(next);
          onActivity(`참고 소재 슬롯 ${next.length}건으로 갱신했습니다.`);
        },
      });
    case "underpainting-panel":
      return renderModuleComponent<StudioUnderpaintingPanelProps>(loadedModule, primaryExportName, {
        cutId: "cut-01",
        lineartLayerId: "layer-lineart",
        lineartLayerName: "원본 선화",
        canvasWidth: 800,
        canvasHeight: 1920,
        activeMarkLabel: markLabel,
        onChangeActiveMarkLabel: (next) => {
          setMarkLabel(next);
          onActivity(`캐릭터 마킹 펜 ${next} 선택`);
        },
        onRunUnderpainting: (job) => onActivity(`3층 자동채색 작업을 예약했습니다 (${job.outputMode}).`),
      });
    case "story-find-replace-panel":
      return renderModuleComponent<StudioStoryEditorFindReplaceProps>(loadedModule, primaryExportName, {
        pages: dialoguePages,
        currentPageId: "page-1",
        onApplyPages: (nextPages, summary) => {
          setDialoguePages(nextPages);
          onActivity(`대사 ${summary.replacedCount}건을 반영했습니다.`);
        },
      });
    case "story-three-view-workspace":
      return renderModuleComponent<StudioStoryThreeViewWorkspaceProps>(loadedModule, primaryExportName, {
        state: storyState,
        onChangeView: (nextView) => {
          setStoryState((prev) => ({ ...prev, activeView: nextView }));
          onActivity(`스토리 화면을 전환했습니다 (${nextView}).`);
        },
        onSelectNode: (nodeKey) => {
          setStoryState((prev) => ({ ...prev, selectedNodeKey: nodeKey }));
          onActivity(`${nodeKey} 노드를 선택했습니다.`);
        },
        onUpdateCutSlot: (nodeKey, slotKey, value) => {
          setStoryState((prev) => ({
            ...prev,
            nodes: prev.nodes.map((node) => {
              if (node.key !== nodeKey || !node.cutSlots) return node;
              const nextSlots = slotKey === "actors"
                ? { ...node.cutSlots, actors: value.split(",").map((s) => s.trim()).filter(Boolean) }
                : { ...node.cutSlots, [slotKey]: value };
              return { ...node, cutSlots: nextSlots };
            }),
          }));
          onActivity(`${nodeKey} 연출 슬롯을 수정했습니다.`);
        },
      });
    case "ai-proposal-diff-gate":
      return renderModuleComponent<StudioAiProposalDiffGateProps>(loadedModule, primaryExportName, {
        state: storyState,
        onApprove: (proposalId) => {
          setStoryState((prev) => ({
            ...prev,
            proposals: prev.proposals.map((p) => (p.id === proposalId ? { ...p, status: "approved" } : p)),
          }));
          onActivity("AI 변경 제안을 승인했습니다.");
        },
        onEditAndApprove: (proposalId, edited) => {
          setStoryState((prev) => ({
            ...prev,
            proposals: prev.proposals.map((p) =>
              p.id === proposalId ? { ...p, status: "approved", userEdited: true, userEditedSnapshot: edited } : p,
            ),
          }));
          onActivity("내용을 직접 다듬어 승인했습니다.");
        },
        onReject: (proposalId) => {
          setStoryState((prev) => ({
            ...prev,
            proposals: prev.proposals.map((p) => (p.id === proposalId ? { ...p, status: "rejected" } : p)),
          }));
          onActivity("AI 변경 제안을 거절했습니다.");
        },
      });
    case "six-perspective-review-drawer":
      return renderModuleComponent<StudioSixPerspectiveReviewDrawerProps>(loadedModule, primaryExportName, {
        state: storyState,
        onRunIncrementalReview: () => onActivity("6관점 증분 원고 검수를 다시 확인했습니다."),
        onTriageFinding: (findingId, status) => {
          setStoryState((prev) => ({
            ...prev,
            reviewFindings: prev.reviewFindings.map((f) => (f.id === findingId ? { ...f, status } : f)),
          }));
          onActivity(`검수 항목 상태를 변경했습니다 (${status}).`);
        },
      });
    case "webtoon-view-area-overlay":
      return (
        <div className="space-y-3">
          <label className="block rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between text-xs text-fg-2">
              <span className="font-medium text-fg">세로 스크롤 위치 미리보기</span>
              <span className="tabular-nums">{webtoonScrollTop}px</span>
            </div>
            <input
              type="range"
              aria-label="세로 스크롤 위치"
              min={0}
              max={240}
              value={webtoonScrollTop}
              onChange={(event) => setWebtoonScrollTop(event.currentTarget.valueAsNumber)}
              className="mt-2 h-7 w-full cursor-pointer accent-accent"
            />
          </label>
          <div className="flex justify-center overflow-hidden rounded-xl border border-line bg-panel p-2">
            {renderModuleComponent<StudioWebtoonViewAreaOverlayProps>(loadedModule, primaryExportName, {
              canvasWidth: 240,
              canvasHeight: 480,
              scrollTop: webtoonScrollTop,
              scale: 1,
              panels: [{ id: "p1", y: 20, height: 180 }, { id: "p2", y: 220, height: 220 }],
            })}
          </div>
        </div>
      );
    case "mesh-warp-overlay":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setWarpMode("mesh")} className={cn("min-h-11 rounded-lg border px-3 text-xs font-medium", warpMode === "mesh" ? "border-accent bg-accent/10 text-accent" : "border-line bg-card text-fg-2")}>
              메쉬 격자 변형
            </button>
            <button type="button" onClick={() => setWarpMode("corner-pin")} className={cn("min-h-11 rounded-lg border px-3 text-xs font-medium", warpMode === "corner-pin" ? "border-accent bg-accent/10 text-accent" : "border-line bg-card text-fg-2")}>
              4점 원근 변형
            </button>
          </div>
          <div className="relative h-[320px] w-full overflow-hidden rounded-xl border border-line bg-panel">
            {renderModuleComponent<StudioOnCanvasMeshWarpOverlayProps>(loadedModule, primaryExportName, {
              mode: warpMode,
              frame: { leftPx: 20, topPx: 120, widthPx: 240, heightPx: 160, zoomScale: 1 },
              targetLayerCount: 2,
              lattice: meshLattice,
              cornerQuad,
              className: "!absolute",
              onLatticeChange: (next) => {
                setMeshLattice(next);
                onActivity("메쉬 변형 격자를 조정했습니다.");
              },
              onCornerQuadChange: (next) => {
                setCornerQuad(next);
                onActivity("4점 원근 모서리를 조정했습니다.");
              },
              onReset: () => {
                setMeshLattice(createSampleMeshLattice(240, 160, 3, 3));
                setCornerQuad(createSampleCornerQuad(240, 160));
                onActivity("변형 격자를 초기화했습니다.");
              },
              onApply: () => onActivity("다중 레이어 변형을 확정했습니다."),
              onCancel: onBack,
            })}
          </div>
        </div>
      );
    case "adjustment-layer-inspector":
      return renderModuleComponent<StudioAdjustmentLayerInspectorProps>(loadedModule, primaryExportName, {
        layers: adjLayers,
        selectedLayerId: selectedAdjId,
        onSelectLayer: setSelectedAdjId,
        onAddLayer: (layer) => {
          setAdjLayers((prev) => [...prev, layer]);
          setSelectedAdjId(layer.id);
          onActivity(`${layer.name} 보정 레이어를 추가했습니다.`);
        },
        onUpdateLayer: (layerId, next) => {
          setAdjLayers((prev) => prev.map((item) => (item.id === layerId ? next : item)));
          onActivity(`${next.name} 보정 값을 조정했습니다.`);
        },
        onRemoveLayer: (layerId) => {
          setAdjLayers((prev) => prev.filter((item) => item.id !== layerId));
          onActivity("보정 레이어를 제거했습니다.");
        },
      });
    case "blend-if-panel":
      return renderModuleComponent<StudioBlendIfPanelProps>(loadedModule, primaryExportName, {
        config: blendIfConfig,
        onChange: (next) => {
          setBlendIfConfig(next);
          onActivity("휘도 혼합 범위를 조정했습니다.");
        },
      });
    case "character-inline-quick-bar":
      return renderModuleComponent<StudioCharacterInlineQuickBarProps>(loadedModule, primaryExportName, {
        state: charQuickState,
        anchor: null,
        onChangeExpression: (expressionId) => {
          setCharQuickState((prev) => ({ ...prev, expressionId }));
          onActivity(`캐릭터 표정을 변경했습니다 (${expressionId}).`);
        },
        onChangePose: (poseId) => {
          setCharQuickState((prev) => ({ ...prev, poseId }));
          onActivity(`캐릭터 포즈를 변경했습니다 (${poseId}).`);
        },
        onChangeOutfit: (outfitId) => {
          setCharQuickState((prev) => ({ ...prev, outfitId }));
          onActivity(`캐릭터 의상을 교체했습니다 (${outfitId}).`);
        },
        onToggleFlipX: (flipX) => {
          setCharQuickState((prev) => ({ ...prev, flipX }));
          onActivity(flipX ? "캐릭터를 좌우 반전했습니다." : "좌우 반전을 해제했습니다.");
        },
        onReset: () => {
          setCharQuickState(createSampleCharacterInlineState());
          onActivity("캐릭터 빠른 편집 상태를 초기화했습니다.");
        },
      });
    case "anim-canvas-overlay":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
            <span className="text-xs font-medium text-fg tabular-nums">현재 프레임 {animFrame} / 12</span>
            <input
              type="range"
              aria-label="애니메이션 프레임 선택"
              min={1}
              max={12}
              value={animFrame}
              onChange={(event) => setAnimFrame(event.currentTarget.valueAsNumber)}
              className="h-7 w-40 cursor-pointer accent-accent"
            />
          </div>
          <div className="flex justify-center overflow-hidden rounded-xl border border-line bg-panel p-2">
            {renderModuleComponent<StudioAnimCanvasOverlayProps>(loadedModule, primaryExportName, {
              viewport: { width: 280, height: 180, zoomScale: 1 },
              currentFrame: animFrame,
              totalFrames: 12,
              activeCelId: "cel-1",
              lightTable,
              camera: animCamera,
              showSafeZones,
              onToggleLightTable: (enabled) => setLightTable((prev) => ({ ...prev, enabled })),
              onToggleCameraLocus: (showLocus) => setAnimCamera((prev) => ({ ...prev, showLocus })),
              onToggleSafeZones: setShowSafeZones,
              onSelectFrame: setAnimFrame,
            })}
          </div>
        </div>
      );
    default:
      return null;
  }
}
