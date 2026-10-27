import { Layers, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import {
  evaluateFormatCompatibility,
  type CutAspectRatio,
  type StoryboardCut,
} from "../scene-3d/studio-3d-dcc-suite";
import { StudioVirtualSpaceCollaborationHub } from "../virtual-space/StudioVirtualSpaceCollaborationHub";
import { StudioBg3dAtmospherePanel } from "./StudioBg3dAtmospherePanel";
import { StudioBg3dBlenderFantasyWebtoonPanel } from "./StudioBg3dBlenderFantasyWebtoonPanel";
import { StudioBg3dCharacterAnimatorPanel } from "./StudioBg3dCharacterAnimatorPanel";
import { StudioBg3dClonerPanel } from "./StudioBg3dClonerPanel";
import { StudioBg3dCutStripPanel } from "./StudioBg3dCutStripPanel";
import { StudioBg3dDccScenePipelinePanel } from "./StudioBg3dDccScenePipelinePanel";
import { StudioBg3dDeformersPanel } from "./StudioBg3dDeformersPanel";
import { StudioBg3dDynamicComponentsPanel } from "./StudioBg3dDynamicComponentsPanel";
import { StudioBg3dHalftoneScreentonePanel } from "./StudioBg3dHalftoneScreentonePanel";
import { StudioBg3dMatCapStudioPanel } from "./StudioBg3dMatCapStudioPanel";
import { StudioBg3dParticleVfxPanel } from "./StudioBg3dParticleVfxPanel";
import {
  StudioBg3dPlaceSetImpactBadge,
  StudioBg3dPlaceSetPackagePanel,
} from "./StudioBg3dPlaceSetPackagePanel";
import { StudioBg3dPostProcessVfxPanel } from "./StudioBg3dPostProcessVfxPanel";
import { StudioBg3dShaperTooningStudioPanel } from "./StudioBg3dShaperTooningStudioPanel";
import { StudioBg3dSketchUpWorkbenchPanel } from "./StudioBg3dSketchUpWorkbenchPanel";
import { StudioBg3dSpatialFxPanel } from "./StudioBg3dSpatialFxPanel";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import { StudioBg3dSpatialWebtoonPanel } from "./StudioBg3dSpatialWebtoonPanel";
import { StudioBg3dVrmHybridDccPanel } from "./StudioBg3dVrmHybridDccPanel";
import {
  acknowledgeAllStudioBg3dPlaceSetImpacts,
  acknowledgeStudioBg3dPlaceSetImpact,
  buildStudioBg3dPlaceSetImpactNotices,
  createStudioBg3dPlaceSetPackage,
  publishStudioBg3dPlaceSetVersion,
  type StudioBg3dPlaceSetPackage,
  type StudioBg3dPlaceSetState,
  type StudioBg3dPlaceSetUsageRef,
} from "./studio-bg3d-place-set-package";
import { useStudioBg3dProSuiteRuntime } from "./studio-bg3d-pro-suite-runtime-context";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";

export type StudioBg3dWorkbenchTabId =
  | "atmosphere"
  | "blender-fantasy-webtoon"
  | "character-animator"
  | "cloner"
  | "cut-strip"
  | "dcc-pipeline"
  | "deformers"
  | "dynamic-components"
  | "halftone-screentone"
  | "matcap-studio"
  | "particle-vfx"
  | "place-set-package"
  | "postprocess-vfx"
  | "shaper-tooning"
  | "sketchup-studio"
  | "spatial-fx"
  | "spatial-webtoon"
  | "virtual-space-collab"
  | "vrm-hybrid-dcc";

interface WorkbenchTabMeta {
  readonly id: StudioBg3dWorkbenchTabId;
  readonly labelKo: string;
  readonly groupKo: string;
}

const STUDIO_BG3D_WORKBENCH_TABS: readonly WorkbenchTabMeta[] = Object.freeze([
  { id: "atmosphere", labelKo: "기상·하늘 (12종)", groupKo: "환경·VFX" },
  { id: "particle-vfx", labelKo: "파티클 VFX", groupKo: "환경·VFX" },
  { id: "postprocess-vfx", labelKo: "렌즈·셀 필터", groupKo: "환경·VFX" },
  { id: "halftone-screentone", labelKo: "스크린톤·망점", groupKo: "셰이더·재질" },
  { id: "matcap-studio", labelKo: "MatCap·MToon", groupKo: "셰이더·재질" },
  { id: "blender-fantasy-webtoon", labelKo: "블렌더 판타지·NPR·군단", groupKo: "셰이더·재질" },
  { id: "spatial-fx", labelKo: "입체 효과음·말풍선", groupKo: "웹툰 연출" },
  { id: "cut-strip", labelKo: "컷 스트립·연속성", groupKo: "웹툰 연출" },
  { id: "shaper-tooning", labelKo: "셰이퍼·투닝 스튜디오", groupKo: "웹툰 연출" },
  { id: "character-animator", labelKo: "등신대·표정·모션", groupKo: "캐릭터·DCC" },
  { id: "cloner", labelKo: "절차적 클로너", groupKo: "캐릭터·DCC" },
  { id: "deformers", labelKo: "디포머·CSG 불리언", groupKo: "캐릭터·DCC" },
  { id: "dynamic-components", labelKo: "다이나믹 컴포넌트", groupKo: "캐릭터·DCC" },
  { id: "sketchup-studio", labelKo: "스케치업 마스터 스튜디오", groupKo: "캐릭터·DCC" },
  { id: "dcc-pipeline", labelKo: "DCC·도시·렌즈·품질", groupKo: "캐릭터·DCC" },
  { id: "vrm-hybrid-dcc", labelKo: "VRM·아바타·하이브리드 DCC", groupKo: "캐릭터·DCC" },
  { id: "place-set-package", labelKo: "장소 세트 정본", groupKo: "세트·XR" },
  { id: "spatial-webtoon", labelKo: "AR·VR 공간 웹툰", groupKo: "세트·XR" },
  { id: "virtual-space-collab", labelKo: "가상 공간 협업·소셜·미니앱", groupKo: "세트·XR" },
]);

const INITIAL_CUTS: readonly StoryboardCut[] = Object.freeze([
  {
    id: "cut-hub-1",
    cutNumber: 1,
    title: "1컷 — 학원 복도 롱샷",
    aspectRatio: "16:9-cinematic",
    cameraPosition: [0, 1.6, 6],
    cameraTarget: [0, 1.4, 0],
    cameraFovDeg: 45,
    cameraRollDeg: 0,
    characterIds: ["hero-a"],
  },
  {
    id: "cut-hub-2",
    cutNumber: 2,
    title: "2컷 — 주인공 감정 클로즈업",
    aspectRatio: "9:16-vertical-climax",
    cameraPosition: [0, 1.55, 2.4],
    cameraTarget: [0, 1.5, 0],
    cameraFovDeg: 35,
    cameraRollDeg: 0,
    characterIds: ["hero-a"],
  },
]);

const INITIAL_PLACE_SET_STATE: StudioBg3dPlaceSetState = {
  camera: {
    position: [0, 1.65, 5.2],
    target: [0, 1.2, 0],
    fovDegrees: 42,
  },
  lighting: {
    ambientIntensity: 0.65,
    ambientColor: "#fff8eb",
    key: {
      intensity: 1.15,
      color: "#fff1d6",
      direction: [0.45, 0.78, 0.42],
      castsShadow: true,
    },
    fill: {
      intensity: 0.4,
      color: "#cfe2ff",
      direction: [-0.5, 0.4, -0.3],
      castsShadow: false,
    },
  },
  environmentAssetId: "school-corridor-01",
  props: [
    {
      nodeId: "prop-desk-01",
      name: "교실 책상 세트",
      kind: "model",
      attachmentId: "att-desk-01",
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      visible: true,
    },
  ],
};

const SAMPLE_PLACE_SET_USAGES: readonly StudioBg3dPlaceSetUsageRef[] = Object.freeze([
  {
    episodeId: "ep-01",
    episodeLabel: "1화 등교길",
    shotId: "cut-03",
    shotLabel: "3컷 교실 창가",
    appliedVersion: 1,
  },
]);

export interface StudioBg3dAdvancedWorkbenchHubProps {
  readonly defaultTab?: StudioBg3dWorkbenchTabId;
  readonly disabled?: boolean;
  readonly onInsertScenePrimitives?: (primitives: readonly BgPrimitive[], labelKo: string) => void;
  readonly onApplySceneCamera?: (camera: StudioBg3dCameraSettings, labelKo: string) => void;
  readonly onSyncSceneLineArt?: (enabled: boolean, summaryKo: string) => void;
}

/**
 * 3D 배경·웹툰 연출·DCC 전문 도구 통합 워크벤치 허브.
 * 14종의 전문 3D 패널과 하이브리드 DCC 호환성 진단을 단일 탭 스위처로 연결합니다.
 */
export function StudioBg3dAdvancedWorkbenchHub({
  defaultTab = "atmosphere",
  disabled = false,
  onInsertScenePrimitives,
  onApplySceneCamera,
  onSyncSceneLineArt,
}: StudioBg3dAdvancedWorkbenchHubProps) {
  const proSuiteRuntime = useStudioBg3dProSuiteRuntime();
  const [activeTab, setActiveTab] = useState<StudioBg3dWorkbenchTabId>(defaultTab);
  const [lastActionSummary, setLastActionSummary] = useState<string>("준비 완료");
  const [stagedScenePrimitives, setStagedScenePrimitives] = useState<readonly BgPrimitive[]>([]);
  const [cuts, setCuts] = useState<readonly StoryboardCut[]>(INITIAL_CUTS);
  const [placeSet, setPlaceSet] = useState<StudioBg3dPlaceSetPackage>(() => {
    const v1 = createStudioBg3dPlaceSetPackage({
      placeId: "place-school-classroom",
      placeName: "2학년 3반 교실",
      state: INITIAL_PLACE_SET_STATE,
      createdAt: "2026-10-25T09:00:00Z",
      note: "초기 교실 정본 등록",
    });
    const v2 = publishStudioBg3dPlaceSetVersion(
      v1,
      {
        ...INITIAL_PLACE_SET_STATE,
        camera: {
          ...INITIAL_PLACE_SET_STATE.camera,
          fovDegrees: 38,
        },
      },
      {
        createdAt: "2026-10-25T10:30:00Z",
        note: "창가 역광 카메라 화각 38° 조정",
      },
    );
    return v2.placeSet;
  });
  const [acknowledgedNoticeIds, setAcknowledgedNoticeIds] = useState<readonly string[]>([]);

  const placeSetNotices = useMemo(
    () => buildStudioBg3dPlaceSetImpactNotices(placeSet, SAMPLE_PLACE_SET_USAGES),
    [placeSet],
  );

  const dccFormatReport = useMemo(
    () => evaluateFormatCompatibility("GLB"),
    [],
  );

  const handleInsertScenePrimitives = (primitives: readonly BgPrimitive[], labelKo: string) => {
    setStagedScenePrimitives((prev) => [...prev, ...primitives]);
    setLastActionSummary(labelKo);
    onInsertScenePrimitives?.(primitives, labelKo);
  };

  const handleApplySceneCamera = (camera: StudioBg3dCameraSettings, labelKo: string) => {
    proSuiteRuntime?.onApplyCameraView(camera);
    setLastActionSummary(labelKo);
    onApplySceneCamera?.(camera, labelKo);
  };

  const handleSyncSceneLineArt = (enabled: boolean, summaryKo: string) => {
    proSuiteRuntime?.onSetLineArtPreview?.(enabled);
    setLastActionSummary(summaryKo);
    onSyncSceneLineArt?.(enabled, summaryKo);
  };

  const handleAddCut = (cut: StoryboardCut) => {
    setCuts((prev) => [...prev, cut]);
    setLastActionSummary(`컷 추가: ${cut.title}`);
  };

  const handleRemoveCut = (cutId: string) => {
    setCuts((prev) =>
      prev
        .filter((c) => c.id !== cutId)
        .map((c, idx) => ({ ...c, cutNumber: idx + 1 })),
    );
    setLastActionSummary(`컷 삭제: ${cutId}`);
  };

  const handleMoveCut = (cutId: string, direction: "up" | "down") => {
    setCuts((prev) => {
      const idx = prev.findIndex((c) => c.id === cutId);
      if (idx < 0) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item!);
      return copy.map((c, i) => ({ ...c, cutNumber: i + 1 }));
    });
    setLastActionSummary(`컷 순서 이동: ${cutId} (${direction})`);
  };

  const handleUpdateCutAspect = (cutId: string, aspectRatio: CutAspectRatio) => {
    setCuts((prev) =>
      prev.map((c) => (c.id === cutId ? { ...c, aspectRatio } : c)),
    );
    setLastActionSummary(`컷 화면비 변경: ${aspectRatio}`);
  };

  const handlePublishPlaceSet = () => {
    const latest = placeSet.versions[placeSet.versions.length - 1];
    if (!latest) return;
    const nextFov = latest.state.camera.fovDegrees === 38 ? 35 : 38;
    const published = publishStudioBg3dPlaceSetVersion(
      placeSet,
      {
        ...latest.state,
        camera: {
          ...latest.state.camera,
          fovDegrees: nextFov,
        },
      },
      {
        createdAt: "2026-10-25T12:00:00Z",
        note: `정본 카메라 화각 ${nextFov}° 업데이트`,
      },
    );
    setPlaceSet(published.placeSet);
    setLastActionSummary(`세트 정본 v${published.publishedVersion?.version ?? latest.version} 발행`);
  };

  return (
    <section
      data-testid="bg3d-advanced-workbench-hub"
      aria-label="3D 웹툰·DCC 통합 워크벤치 허브"
      className="mt-3 flex flex-col gap-3 rounded-xl border border-line bg-panel/60 p-3 text-xs text-fg"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <Layers className="size-4 text-accent" aria-hidden />
          <span>3D 웹툰·DCC 스페셜리스트 워크벤치 (14종 도구)</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StudioBg3dPlaceSetImpactBadge
            notices={placeSetNotices}
            acknowledgedIds={acknowledgedNoticeIds}
            onClick={() => setActiveTab("place-set-package")}
          />
          <span
            data-testid="bg3d-workbench-dcc-compat-badge"
            className="rounded bg-raised px-2 py-0.5 font-mono text-[0.62rem] text-fg-2"
          >
            DCC 호환성 ({dccFormatReport.format}): {dccFormatReport.grade} · 3D 배치 {stagedScenePrimitives.length}개
          </span>
          <span
            data-testid="bg3d-workbench-last-action"
            className="inline-flex items-center gap-1 rounded bg-accent/15 px-2 py-0.5 text-[0.64rem] font-semibold text-accent"
          >
            <Sparkles className="size-3" aria-hidden />
            {lastActionSummary}
          </span>
        </div>
      </header>

      {/* 14 Specialist Tool Tabs */}
      <div
        role="tablist"
        aria-label="3D 스페셜리스트 도구 탭"
        className="grid grid-cols-2 gap-1 sm:grid-cols-4"
      >
        {STUDIO_BG3D_WORKBENCH_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={disabled}
              data-testid={`bg3d-workbench-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-start rounded-lg border px-2 py-1.5 text-left transition-colors ${
                selected
                  ? "border-accent bg-accent/15 font-bold text-accent shadow-xs"
                  : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              <span className="text-[0.58rem] text-fg-3">{tab.groupKo}</span>
              <span className="truncate text-[0.68rem]">{tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tool Surface */}
      <div
        role="tabpanel"
        data-testid={`bg3d-workbench-surface-${activeTab}`}
        className="rounded-xl border border-line bg-card"
      >
        {activeTab === "atmosphere" ? (
          <StudioBg3dAtmospherePanel
            disabled={disabled}
            onPresetChange={(preset) => setLastActionSummary(`기상 프리셋: ${preset.name}`)}
            onSunAngleChange={(az, el) => setLastActionSummary(`태양 각도: 방위 ${az}° / 고도 ${el}°`)}
          />
        ) : null}

        {activeTab === "particle-vfx" ? (
          <StudioBg3dParticleVfxPanel
            disabled={disabled}
            onSelectPreset={(preset) => setLastActionSummary(`파티클 프리셋: ${preset}`)}
          />
        ) : null}

        {activeTab === "postprocess-vfx" ? (
          <StudioBg3dPostProcessVfxPanel
            onApplyPostProcessConfig={(cfg) =>
              setLastActionSummary(`PostFX LUT: ${cfg.colorGrading}`)
            }
            onApplyWebtoonFilter={(preset) =>
              setLastActionSummary(`웹툰 필터: ${preset.name}`)
            }
          />
        ) : null}

        {activeTab === "halftone-screentone" ? (
          <StudioBg3dHalftoneScreentonePanel
            onApplyScreentoneConfig={(cfg) =>
              setLastActionSummary(`스크린톤: ${cfg.frequencyLpi}LPI / ${cfg.colorTemperatureKelvin}K`)
            }
          />
        ) : null}

        {activeTab === "matcap-studio" ? (
          <StudioBg3dMatCapStudioPanel
            disabled={disabled}
            onApplyShader={(preset) => setLastActionSummary(`셰이더: ${preset.name}`)}
            onApplyMtoonPreset={(preset) => setLastActionSummary(`MToon LT: ${preset.label}`)}
            onApplyCc0SurfaceMaterial={(entry) =>
              setLastActionSummary(`CC0 표면 재질: ${entry.labelKo}`)
            }
          />
        ) : null}

        {activeTab === "blender-fantasy-webtoon" ? (
          <StudioBg3dBlenderFantasyWebtoonPanel
            disabled={disabled}
            onApplyLightingRig={(rig, grade) =>
              setLastActionSummary(`블렌더 광원: ${rig.nameKo} (${grade})`)
            }
            onApplyNprShader={(preset, hex) =>
              setLastActionSummary(`블렌더 NPR: ${preset.nameKo} (${hex})`)
            }
            onApplyFreestyleInk={(preset, count) => {
              proSuiteRuntime?.onSetLineArtPreview?.(true);
              setLastActionSummary(`Freestyle 선화: ${preset.nameKo} (${count}선분)`);
            }}
            onApplyWeaponRig={(preset, blades) =>
              setLastActionSummary(`판타지 무기: ${preset.nameKo} (${blades}자루)`)
            }
            onApplyMonsterIk={(preset, pose) =>
              setLastActionSummary(`몬스터 iTaSC IK: ${preset.nameKo} (${pose})`)
            }
            onSimulateCrowd={(preset, agents) =>
              setLastActionSummary(`군단 Boid: ${preset.nameKo} (${agents}기)`)
            }
            onStatusChange={setLastActionSummary}
            onInsertScenePrimitives={handleInsertScenePrimitives}
            onApplySceneCamera={handleApplySceneCamera}
            onSyncSceneLineArt={handleSyncSceneLineArt}
          />
        ) : null}

        {activeTab === "spatial-fx" ? (
          <StudioBg3dSpatialFxPanel
            disabled={disabled}
            onInsertSfxTypography={(cfg) => setLastActionSummary(`입체 효과음 추가: ${cfg.text}`)}
            onInsertSpeedLines={(cfg) => setLastActionSummary(`집중선 배치: ${cfg.rayCount}가닥`)}
            onGenerateSpeedLineSet={(set) =>
              setLastActionSummary(`3D 집중선 세트: ${set.kind} (${set.totalLines}선분)`)
            }
            onInsertSpeechBubble={(bubble) => setLastActionSummary(`3D 말풍선: ${bubble.text}`)}
            onInsertEmoteSticker={(emote) => setLastActionSummary(`이모트 스티커: ${emote.kind}`)}
          />
        ) : null}

        {activeTab === "cut-strip" ? (
          <StudioBg3dCutStripPanel
            cuts={cuts}
            disabled={disabled}
            onAddCut={handleAddCut}
            onRemoveCut={handleRemoveCut}
            onMoveCut={handleMoveCut}
            onUpdateCutAspect={handleUpdateCutAspect}
            onExportPsdManifest={(manifest) =>
              setLastActionSummary(`PSD 내보내기: ${manifest.cuts.length}컷`)
            }
          />
        ) : null}

        {activeTab === "shaper-tooning" ? (
          <StudioBg3dShaperTooningStudioPanel
            disabled={disabled}
            onExportPsd={() => setLastActionSummary("셰이퍼·투닝 8레이어 PSD 내보내기 완료")}
          />
        ) : null}

        {activeTab === "character-animator" ? (
          <StudioBg3dCharacterAnimatorPanel
            onApplyProportions={(spec) =>
              setLastActionSummary(`등신대 비율: 머리 ${spec.headScale}x`)
            }
            onApplyFacialExpression={() => setLastActionSummary("애니 표정 프리셋 적용")}
            onPlayAnimationClip={(clipId) => setLastActionSummary(`모션 클립 재생: ${clipId}`)}
            onApplyHeadStyle={(style) => setLastActionSummary(`두상 스타일: ${style}`)}
            onApplyVrmMood={(mood) =>
              setLastActionSummary(`VRM 무드: ${mood.activePresetMood ?? "기본"}`)
            }
          />
        ) : null}

        {activeTab === "cloner" ? (
          <StudioBg3dClonerPanel
            disabled={disabled}
            onApplyCloner={(res) =>
              setLastActionSummary(`클로너 생성: ${res.clonerType} (${res.totalInstances}개)`)
            }
          />
        ) : null}

        {activeTab === "deformers" ? (
          <StudioBg3dDeformersPanel
            onApplyDeformer={(cfg) =>
              setLastActionSummary(`디포머 적용: ${cfg.kind} (${cfg.strength})`)
            }
            onApplyCsgBooleanPlan={(plan) =>
              setLastActionSummary(`CSG 연산: ${plan.operation} (${plan.estimatedTriangles}삼각형)`)
            }
          />
        ) : null}

        {activeTab === "dynamic-components" ? (
          <StudioBg3dDynamicComponentsPanel
            onApplyComponentTransform={(state) =>
              setLastActionSummary(`다이나믹 컴포넌트: ${state.kind} (${Math.round(state.value * 100)}%)`)
            }
            onApplyBatchComponentTransforms={(states, context) =>
              setLastActionSummary(
                context.preset
                  ? `컷 연출 프리셋 적용: ${context.preset.label} (${states.length}개 요소)`
                  : `아키타입 동적 구성 요소 동기화: ${context.archetypeId} (${states.length}개 요소)`,
              )
            }
          />
        ) : null}

        {activeTab === "sketchup-studio" ? (
          <StudioBg3dSketchUpWorkbenchPanel
            disabled={disabled}
            onApplyStyle={(style) => {
              if (style.faceStyle === "hidden-line") {
                proSuiteRuntime?.onSetLineArtPreview?.(true);
              }
              setLastActionSummary(`SketchUp 스타일: ${style.labelKo}`);
            }}
            onApplyShadowSolar={(az, alt, k) =>
              setLastActionSummary(`SketchUp 태양광: 방위 ${az.toFixed(1)}° / 고도 ${alt.toFixed(1)}° (${k}K)`)
            }
            onExecuteArray={(token, list) =>
              setLastActionSummary(`SketchUp VCB 배열 (${token}): ${list.length}개 배치`)
            }
            onRestoreSkpScenes={(shotCount, tagCount) =>
              setLastActionSummary(`SKP 장면 ${shotCount}개 · 태그 ${tagCount}개 복원`)
            }
            onExportCadFormat={(fmt, bytes) =>
              setLastActionSummary(`SketchUp 내보내기 (${fmt.toUpperCase()}): ${bytes}B`)
            }
            onInsertScenePrimitives={handleInsertScenePrimitives}
            onApplySceneCamera={handleApplySceneCamera}
          />
        ) : null}

        {activeTab === "place-set-package" ? (
          <div className="p-3">
            <StudioBg3dPlaceSetPackagePanel
              placeSet={placeSet}
              notices={placeSetNotices}
              acknowledgedIds={acknowledgedNoticeIds}
              onAcknowledge={(noticeId) => {
                setAcknowledgedNoticeIds((prev) =>
                  acknowledgeStudioBg3dPlaceSetImpact(prev, noticeId),
                );
                setLastActionSummary(`세트 변경 영향 확인: ${noticeId}`);
              }}
              onAcknowledgeAll={() => {
                setAcknowledgedNoticeIds(acknowledgeAllStudioBg3dPlaceSetImpacts(placeSetNotices));
                setLastActionSummary("세트 변경 영향 전체 확인");
              }}
              onPublishCurrent={handlePublishPlaceSet}
              onSelectUsage={(notice) =>
                setLastActionSummary(`사용처 이동: ${notice.usage.episodeLabel}`)
              }
            />
          </div>
        ) : null}

        {activeTab === "spatial-webtoon" ? (
          <StudioBg3dSpatialWebtoonPanel
            disabled={disabled}
            onModeChange={(mode) => setLastActionSummary(`공간 웹툰 모드: ${mode.toUpperCase()}`)}
          />
        ) : null}

        {activeTab === "dcc-pipeline" ? (
          <StudioBg3dDccScenePipelinePanel
            disabled={disabled}
            onApplyRealisticPreset={(presetId) =>
              setLastActionSummary(`실사 프리셋: ${presetId}`)
            }
            onGenerateCityscape={(theme, buildingCount) =>
              setLastActionSummary(`절차적 도시: ${theme} (${buildingCount}동)`)
            }
            onApplyLensPreset={(preset, focalLengthMm) =>
              setLastActionSummary(`원근 렌즈: ${preset} (${focalLengthMm}mm)`)
            }
            onApplyGripPose={(grip, indexAngleDeg) =>
              setLastActionSummary(`소품 그립: ${grip} (${indexAngleDeg}°)`)
            }
          />
        ) : null}

        {activeTab === "vrm-hybrid-dcc" ? (
          <StudioBg3dVrmHybridDccPanel
            disabled={disabled}
            onSelectApplyPurpose={(purpose, passCount) =>
              setLastActionSummary(`캐릭터 적용: ${purpose} (${passCount}패스)`)
            }
            onSelectAttachmentPreset={(presetId) =>
              setLastActionSummary(`VRM 소켓 그립: ${presetId}`)
            }
            onPlanExternalIntake={(prompt, maxTriangles) =>
              setLastActionSummary(`외부 인테이크: ${prompt} (${maxTriangles}삼각형)`)
            }
          />
        ) : null}

        {activeTab === "virtual-space-collab" ? (
          <StudioVirtualSpaceCollaborationHub />
        ) : null}
      </div>
    </section>
  );
}

export default StudioBg3dAdvancedWorkbenchHub;
