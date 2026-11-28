"use no memo";
// 호스트 객체의 참조를 유지한 채 값이 바뀌면 도우미와 공용 뷰포트를 함께 갱신한다.

import {
  ArrowLeft, ArrowRight, Box, Camera, Check, CircleUserRound, Compass,
  Copy, Cuboid, Focus, ImagePlus, Layers3, Loader2, Maximize2, Move3d, Rotate3d,
  Scaling, ScanLine, SlidersHorizontal, Trash2, Upload, UserPlus,
} from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";

import type { ReactNode } from "react";

import { StudioScene3dBg3dCutPanel } from "../scene3d/StudioScene3dBg3dCutPanel";
import { StudioBg3dAssistantFinishStep } from "./StudioBg3dAssistantFinishStep";
import { StudioBg3dAssistantHostReadinessBanner, type StudioBg3dAssistantReadinessHostLike } from "./StudioBg3dAssistantReadinessBanner";
import { StudioBg3dAssistantScenePicker } from "./StudioBg3dAssistantScenePicker";
import { getStudioBg3dEnvironmentAsset } from "./studio-bg3d-environment-catalog";
import { studioBg3dAssistantLocationId, type StudioBg3dSceneChoice } from "./studio-bg3d-assistant-location";
import { StudioBg3dEditorViewport } from "./StudioBg3dEditorViewport";
import { AssetCard, AssistantStepper, GoalPicker, SceneAssistantTouchGuide, SheetHandle, type StudioBg3dAssistantAssetItem as AssistantAsset } from "./StudioBg3dSceneAssistantChrome";
import { frozenStatus5Text } from "../status-i18n/studio-frozen5-status-i18n";
import { STUDIO_BG3D_ASSISTANT_CAMERA_PRESETS, STUDIO_BG3D_ASSISTANT_STEPS, nextStudioBg3dAssistantStep, previousStudioBg3dAssistantStep, studioBg3dAssistantOutputSettings, studioBg3dAssistantStepIndex } from "./studio-bg3d-scene-assistant";
import type { StudioBg3dAssistantGoal, StudioBg3dAssistantOutputStyle, StudioBg3dAssistantSheetState, StudioBg3dAssistantStep } from "./studio-bg3d-scene-assistant";

import "./studio-bg3d-scene-assistant.css";
import "../studio-3d-ui/studio-3d-illustrated-chrome.css";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const LazyStudio3dWebtoonProPanel = lazy(() => import("../studio-3d-pro/Studio3dWebtoonProPanel"));

type AssistantSceneNode = { readonly id: string; readonly modelId?: string };
type AssistantBooleanSetter = (next: boolean | ((current: boolean) => boolean)) => void;

export interface StudioBg3dSceneAssistantHost extends StudioBg3dAssistantReadinessHostLike {
  readonly open: boolean;
  readonly operation?: "insert" | "update";
  readonly primitives?: readonly AssistantSceneNode[];
  readonly customModels?: readonly AssistantSceneNode[];
  readonly sharedCharacterCaptureElementIds?: readonly string[];
  readonly selectedIds?: ReadonlySet<string>;
  readonly setSelectedIds?: (ids: Set<string>) => void;
  readonly modelLibrary?: readonly AssistantAsset[];
  readonly genericModelClassifications?: ReadonlyMap<string, string>;
  readonly transformMode?: "translate" | "rotate" | "scale";
  readonly lineArtPreview?: boolean;
  readonly ltToneSettings?: { readonly mode?: string; readonly type?: string };
  readonly ltExportAspectRatio?: number | null;
  readonly updateLtExportAspectRatio?: (aspectRatio: number | null) => void;
  readonly placementActive?: boolean;
  readonly placementSession?: { readonly phase?: string };
  readonly isCapturing?: boolean;
  readonly isRestoringScene?: boolean;
  readonly isUploadingModel?: boolean;
  readonly isBatchRenderingShots?: boolean;
  readonly applyingTemplateId?: string | null;
  readonly deletingModelId?: string | null;
  readonly insertBlocked?: boolean;
  readonly immersiveSceneActive?: boolean;
  readonly sharedStageUpdateBlockedReason?: string | null;
  readonly groundSelectionDisabledReason?: string | null;
  readonly focusSelectionDisabledReason?: string | null;
  readonly error?: string | null; readonly sixPassLtInsertUnavailableReason?: string | null;
  readonly librarySaveNotice?: string | null;
  readonly addSceneTemplate: (templateId: string) => boolean;
  readonly addCustomModelToScene: (modelId: string) => Promise<boolean>;
  readonly addPrimitive: (kind: "box" | "cylinder" | "plane" | "sphere") => void;
  readonly applyCameraPreset: (presetId: string) => void;
  readonly zoomCameraBy: (factor: number) => void;
  readonly setTransformMode: (mode: "translate" | "rotate" | "scale") => void;
  readonly setLineArtPreview: AssistantBooleanSetter;
  readonly updateLtToneSettings: (settings: Record<string, unknown>) => void;
  readonly groundSelectedEntity: () => void;
  readonly focusSelectedEntity: () => void;
  readonly duplicateSelected: () => void;
  readonly deleteSelected: () => void;
  readonly handleSaveToLibrary: () => void;
  readonly handleInsert: () => void | Promise<void>;
  readonly setActivePanelTab: (tab: string) => void;
  readonly setModelsPanelActivated: (active: boolean) => void;
  readonly setViewEditorSection: (section: string) => void;
  readonly setLtEditorSection: (section: string) => void;
  readonly [key: string]: unknown;
}

interface StudioBg3dSceneAssistantWorkspaceProps {
  readonly h: StudioBg3dSceneAssistantHost;
  readonly onOpenProfessional: () => void;
  readonly viewport?: ReactNode;
  readonly onHostChange?: () => void;
}
const TRANSFORM_ACTIONS = Object.freeze([
  { id: "translate", label: "위치 옮기기", icon: Move3d },
  { id: "rotate", label: "방향 바꾸기", icon: Rotate3d },
  { id: "scale", label: "크게·작게", icon: Scaling },
] as const);

function readAssistantHostSnapshot(h: StudioBg3dSceneAssistantHost): string {
  return [
    h.open ? 1 : 0,
    h.isCapturing ? 1 : 0,
    h.isRestoringScene ? 1 : 0,
    h.isUploadingModel ? 1 : 0,
    h.isBatchRenderingShots ? 1 : 0,
    h.applyingTemplateId ?? "",
    h.deletingModelId ?? "",
    h.insertBlocked ? 1 : 0,
    h.immersiveSceneActive ? 1 : 0,
    h.sharedStageUpdateBlockedReason ?? "",
    h.primitives?.length ?? 0,
    (h.primitives ?? []).map((node) => node.id).join(","),
    h.customModels?.length ?? 0,
    (h.customModels ?? []).map((node) => node.id).join(","),
    h.sharedCharacterCaptureElementIds?.length ?? 0,
    h.selectedIds?.size ?? 0,
    [...(h.selectedIds ?? [])].sort().join(","),
    h.modelLibrary?.length ?? 0,
    h.genericModelClassifications?.size ?? 0,
    h.transformMode ?? "",
    h.lineArtPreview ? 1 : 0,
    h.ltExportAspectRatio ?? "",
    h.placementActive ? 1 : 0,
    h.placementSession?.phase ?? "",
    h.groundSelectionDisabledReason ?? "",
    h.focusSelectionDisabledReason ?? "",
    h.error ?? h.sixPassLtInsertUnavailableReason ?? "",
    h.readinessState?.phase ?? "",
    h.readinessState?.stage ?? "",
    h.readinessState?.selectedEngine ?? "",
  ].join("|");
}

function classifyAssistantAsset(
  entry: AssistantAsset,
  classifications: ReadonlyMap<string, string> | undefined,
): StudioBg3dAssistantGoal | null {
  const declared = classifications?.get(entry.id);
  if (declared === "character" || declared === "creature") return "character";
  if (declared === "environment") return "background";
  if (declared === "prop") return "props";
  if (getStudioBg3dEnvironmentAsset(entry.id)) return "background";
  const name = entry.name.toLocaleLowerCase();
  if (/character|avatar|girl|boy|woman|man|person|fairy|knight|witch|캐릭터|인물/u.test(name)) {
    return "character";
  }
  if (/background|environment|room|street|classroom|cafe|배경|공간/u.test(name)) return "background";
  return "props";
}

function assistantSceneHasContent(h: StudioBg3dSceneAssistantHost): boolean {
  return (h.primitives?.length ?? 0) > 0
    || (h.customModels?.length ?? 0) > 0
    || (h.sharedCharacterCaptureElementIds?.length ?? 0) > 0;
}

function studioAssistantSurfaceHref(surface: "poser" | "character"): string {
  if (typeof window === "undefined") return `/studio/${surface}`;
  const nextPathname = /\/bg3d$/u.test(window.location.pathname)
    ? window.location.pathname.replace(/\/bg3d$/u, `/${surface}`)
    : `/studio/${surface}`;
  return `${nextPathname}${window.location.search}`;
}

function stepActionLabel(step: StudioBg3dAssistantStep): string {
  if (step === "choose") return "다음: 배치하기";
  if (step === "arrange") return "다음: 구도 잡기";
  if (step === "frame") return "다음: 작화 스타일";
  return "현재 컷에 적용";
}
function ChooseStep({
  goal,
  selectedSceneId,
  assets,
  busy,
  hasScene,
  onGoalChange,
  onSceneSelect,
  onAssetAdd,
  onOpenProfessional,
}: {
  readonly goal: StudioBg3dAssistantGoal;
  readonly selectedSceneId: string | null;
  readonly assets: readonly AssistantAsset[];
  readonly busy: boolean;
  readonly hasScene: boolean;
  readonly onGoalChange: (goal: StudioBg3dAssistantGoal) => void;
  readonly onSceneSelect: (preset: StudioBg3dSceneChoice) => void;
  readonly onAssetAdd: (asset: AssistantAsset) => void;
  readonly onOpenProfessional: () => void;
}) {
  const bt = useBilingual("StudioBg3dSceneAssistantIllustration");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(8);
  const terms = query.trim().normalize("NFKC").toLowerCase().split(/\s+/u).filter(Boolean);
  const matches = goal === "background" && terms.length ? assets.filter(asset => {
    const entry = getStudioBg3dEnvironmentAsset(asset.id);
    const text = [asset.name, entry?.description, entry?.detailCamera?.subject.ko, entry?.detailCamera?.subject.en, ...(entry?.tags ?? [])]
      .join(" ").normalize("NFKC").toLowerCase();
    return terms.every(term => text.includes(term));
  }) : assets;
  return (
    <div className="scene-assistant__step-body" data-step="choose">
      <div className="scene-assistant__section-title compact">
        <h3>3D 장면 구성</h3>
        <span>{bt("배경·인물·소품 선택", "Select stage, cast, or props")}</span>
      </div>

      <GoalPicker goal={goal} onChange={onGoalChange} />

      {goal === "background" ? (
        <StudioBg3dAssistantScenePicker
          selectedTemplateId={selectedSceneId}
          busy={busy}
          hasScene={hasScene}
          onSelect={onSceneSelect}
        />
      ) : null}
      {goal === "background" && assets.length > 0 ? (
        <section aria-labelledby="scene-assistant-env-assets-title">
          <div className="scene-assistant__section-title">
            <h4 id="scene-assistant-env-assets-title">준비된 3D 환경 모델</h4>
          </div>
          <input type="search" aria-label={bt("배경 모델 검색", "Search environment models")}
            placeholder={bt("장소나 소품 검색", "Search by location or prop")} value={query}
            className="mb-2 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg"
            onChange={event => { setQuery(event.target.value); setVisibleCount(8); }} />
          <div className="scene-assistant__asset-grid" data-testid="scene-assistant-env-asset-grid">
            {matches.slice(0, visibleCount).map((asset) => (
              <AssetCard key={asset.id} asset={asset} disabled={busy} onAdd={onAssetAdd} />
            ))}
          </div>
          {matches.length === 0 && <p role="status">{bt("검색한 배경이 없습니다.", "No matching environments.")}</p>}
          {matches.length > visibleCount && <button type="button"
            className="mt-2 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg"
            onClick={() => setVisibleCount(count => count + 8)}>
            {bt(`배경 더 보기 (${visibleCount}/${matches.length})`, `More environments (${visibleCount}/${matches.length})`)}
          </button>}
        </section>
      ) : null}
      {goal !== "background" ? (
        <section aria-labelledby="scene-assistant-assets-title">
          <div className="scene-assistant__section-title">
            <h4 id="scene-assistant-assets-title">
              {goal === "character" ? "인물·포즈 소재" : "바로 놓는 소품"}
            </h4>
            <span>선택 후 화면에서 위치만 정하세요</span>
          </div>
          {goal === "character" ? (
            <div className="scene-assistant__tool-links" aria-label="인물 제작 도구">
              <a href={studioAssistantSurfaceHref("poser")}>
                <CircleUserRound size={18} aria-hidden />
                <span><strong>포즈 편집기</strong><small>프로젝트 캐릭터의 표정·포즈·의상 조정</small></span>
                <ArrowRight size={15} aria-hidden />
              </a>
              <a href={studioAssistantSurfaceHref("character")}>
                <UserPlus size={18} aria-hidden />
                <span><strong>새 캐릭터 만들기</strong><small>외형을 만들고 프로젝트 소재로 재사용</small></span>
                <ArrowRight size={15} aria-hidden />
              </a>
            </div>
          ) : null}
          {assets.length > 0 ? (
            <div className="scene-assistant__asset-grid">
              {assets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} disabled={busy} onAdd={onAssetAdd} />
              ))}
            </div>
          ) : (
            <div className="scene-assistant__empty-state">
              <Box size={24} aria-hidden />
              <strong>{frozenStatus5Text("studio.frozenStatus5.bg3dAssistant.assetsEmpty", "표시할 준비된 소재가 없습니다.")}</strong>
              <span>정밀 편집에서 모델을 가져오거나 전체 라이브러리를 확인할 수 있습니다.</span>
              <button type="button" onClick={onOpenProfessional}><SlidersHorizontal size={15} aria-hidden /> 전체 라이브러리 열기</button>
            </div>
          )}
        </section>
      ) : null}

      <section className="scene-assistant__handoff" aria-label="이미지에서 3D 만들기">
        <div><Upload size={18} aria-hidden /><span><strong>이미지에서 3D 만들기</strong><small>캐릭터·소품·배경 이미지를 입체 장면으로 변환</small></span></div>
        <a href="/studio/lift3d">이미지 선택</a>
      </section>
    </div>
  );
}
function ArrangeStep({
  h,
  selectedCount,
  objectCount,
  placementActive,
  busy,
  onReturnToChoose,
}: {
  readonly h: StudioBg3dSceneAssistantHost;
  readonly selectedCount: number;
  readonly objectCount: number;
  readonly placementActive: boolean;
  readonly busy: boolean;
  readonly onReturnToChoose: (goal: StudioBg3dAssistantGoal) => void;
}) {
  return (
    <div className="scene-assistant__step-body" data-step="arrange">
      <section className="scene-assistant__status-card" data-active={placementActive || undefined}>
        <span className="scene-assistant__status-icon">
          {placementActive ? <Move3d size={20} aria-hidden /> : <Layers3 size={20} aria-hidden />}
        </span>
        <div>
          <p>{placementActive ? "배치 위치를 정하는 중" : `${objectCount}개 항목으로 장면 구성됨`}</p>
          <strong>
            {placementActive
              ? "화면에서 원하는 바닥이나 표면을 누르세요."
              : selectedCount > 0
                ? `${selectedCount}개 항목을 선택했습니다.`
                : "화면의 물체를 눌러 바로 조정하세요."}
          </strong>
        </div>
      </section>

      {selectedCount > 0 ? (
        <section aria-labelledby="scene-assistant-transform-title">
          <div className="scene-assistant__section-title compact">
            <h4 id="scene-assistant-transform-title">선택 항목 조정</h4>
          </div>
          <div className="scene-assistant__action-grid three">
            {TRANSFORM_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  aria-pressed={h.transformMode === action.id}
                  disabled={busy}
                  onClick={() => h.setTransformMode(action.id)}
                >
                  <Icon size={18} aria-hidden /><span>{action.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      {selectedCount > 0 ? (
        <div className="scene-assistant__quick-actions">
          {!h.groundSelectionDisabledReason ? (
            <button type="button" disabled={busy} onClick={h.groundSelectedEntity}>
              <Maximize2 size={15} aria-hidden /> 바닥에 놓기
            </button>
          ) : null}
          {!h.focusSelectionDisabledReason ? (
            <button type="button" disabled={busy} onClick={h.focusSelectedEntity}>
              <Focus size={15} aria-hidden /> 선택 항목 보기
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={h.duplicateSelected}>
            <Copy size={15} aria-hidden /> 복제
          </button>
          <button className="danger" type="button" disabled={busy} onClick={h.deleteSelected}>
            <Trash2 size={15} aria-hidden /> 삭제
          </button>
        </div>
      ) : null}

      <section aria-labelledby="scene-assistant-add-title">
        <div className="scene-assistant__section-title compact">
          <h4 id="scene-assistant-add-title">장면에 더하기</h4>
          <span>필요한 것만 추가하세요</span>
        </div>
        <div className="scene-assistant__add-grid">
          <button type="button" onClick={() => onReturnToChoose("background")}>
            <Layers3 size={20} aria-hidden /><span><strong>배경 바꾸기</strong><small>장소 프리셋 선택</small></span>
          </button>
          <button type="button" onClick={() => onReturnToChoose("character")}>
            <CircleUserRound size={20} aria-hidden /><span><strong>인물·포즈</strong><small>캐릭터 소재 선택</small></span>
          </button>
          <button type="button" onClick={() => onReturnToChoose("props")}>
            <Cuboid size={20} aria-hidden /><span><strong>소품</strong><small>가구·물건 선택</small></span>
          </button>
        </div>
      </section>

      <details className="scene-assistant__details">
        <summary>간단한 도형 직접 추가</summary>
        <div className="scene-assistant__primitive-row">
          <button type="button" disabled={busy} onClick={() => h.addPrimitive("box")}>상자</button>
          <button type="button" disabled={busy} onClick={() => h.addPrimitive("cylinder")}>원기둥</button>
          <button type="button" disabled={busy} onClick={() => h.addPrimitive("plane")}>평면</button>
          <button type="button" disabled={busy} onClick={() => h.addPrimitive("sphere")}>구</button>
        </div>
      </details>
    </div>
  );
}
function FrameStep({
  h,
  activeCameraPreset,
  busy,
  onCameraPreset,
}: {
  readonly h: StudioBg3dSceneAssistantHost;
  readonly activeCameraPreset: string;
  readonly busy: boolean;
  readonly onCameraPreset: (presetId: string) => void;
}) {
  return (
    <div className="scene-assistant__step-body" data-step="frame">
      <section className="scene-assistant__status-card camera">
        <span className="scene-assistant__status-icon"><Camera size={20} aria-hidden /></span>
        <div>
          <p>카메라 프리셋</p>
          <strong>먼저 가까운 구도를 고른 뒤 화면에서 조금만 움직이세요.</strong>
        </div>
      </section>

      <section aria-labelledby="scene-assistant-camera-title">
        <div className="scene-assistant__section-title compact">
          <h4 id="scene-assistant-camera-title">추천 구도</h4>
          <span>언제든 다시 바꿀 수 있습니다</span>
        </div>
        <div className="scene-assistant__camera-grid">
          {STUDIO_BG3D_ASSISTANT_CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={activeCameraPreset === preset.id}
              disabled={busy}
              onClick={() => onCameraPreset(preset.id)}
            >
              <span className={`scene-assistant__camera-glyph is-${preset.id}`} aria-hidden>
                <span />
              </span>
              <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
              {activeCameraPreset === preset.id ? <Check size={15} aria-hidden /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="scene-assistant__camera-tune" aria-label="카메라 간단 조정">
        <div><strong>거리 미세 조정</strong><small>장면을 더 가깝게 또는 넓게 봅니다.</small></div>
        <div>
          <button type="button" disabled={busy} onClick={() => h.zoomCameraBy(1.18)}>더 멀리</button>
          <button type="button" disabled={busy} onClick={() => h.zoomCameraBy(0.84)}>더 가까이</button>
        </div>
      </section>

      <button
        type="button"
        className="scene-assistant__preview-toggle"
        aria-pressed={Boolean(h.lineArtPreview)}
        onClick={() => h.setLineArtPreview((current: boolean) => !current)}
      >
        <ScanLine size={18} aria-hidden />
        <span><strong>선화로 미리 보기</strong><small>배경선의 밀도와 인물 가독성을 미리 확인합니다.</small></span>
        <span className="scene-assistant__switch" aria-hidden><span /></span>
      </button>
    </div>
  );
}
export function StudioBg3dSceneAssistantWorkspace({
  h, onOpenProfessional, viewport, onHostChange,
}: StudioBg3dSceneAssistantWorkspaceProps) {
  const bt = useBilingual("StudioBg3dSceneAssistantWorkspace");
  const [preparingModel, setPreparingModel] = useState<string | null>(null);
  const [, refreshMutableHost] = useReducer((revision: number) => revision + 1, 0);
  const initialContent = assistantSceneHasContent(h);
  const [step, setStep] = useState<StudioBg3dAssistantStep>(initialContent ? "arrange" : "choose");
  const [goal, setGoal] = useState<StudioBg3dAssistantGoal>("background");
  const [sheetState, setSheetState] = useState<StudioBg3dAssistantSheetState>("half");
  const [activeCameraPreset, setActiveCameraPreset] = useState("threeQuarter");
  const [outputStyle, setOutputStyle] = useState<StudioBg3dAssistantOutputStyle>("color");
  const [proLabOpen, setProLabOpen] = useState(false);
  const [sceneFramingRequest, requestSceneFraming] = useReducer((revision: number) => revision + 1, 0);
  const hydratedRef = useRef(false);
  const completedSceneFramingRequestRef = useRef(0);
  const sheetHandleRef = useRef<HTMLButtonElement>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const aspectSelectRef = useRef<HTMLSelectElement>(null);
  const cropPreviewReturnRef = useRef<{ sheet: "half" | "full"; scrollTop: number } | null>(null);

  useEffect(() => {
    if (!h.open) return undefined;
    let previous = readAssistantHostSnapshot(h);
    const interval = window.setInterval(() => {
      const next = readAssistantHostSnapshot(h);
      if (next === previous) return;
      previous = next;
      (onHostChange ?? refreshMutableHost)();
    }, 180);
    return () => window.clearInterval(interval);
  }, [h, onHostChange]);

  const objectCount = (h.primitives?.length ?? 0)
    + (h.customModels?.length ?? 0)
    + (h.sharedCharacterCaptureElementIds?.length ?? 0);
  const hasScene = objectCount > 0;
  const modalOpen = h.open;
  useLayoutEffect(() => {
    const previous = cropPreviewReturnRef.current;
    if (!previous) return;
    if (!modalOpen || step !== "finish") {
      cropPreviewReturnRef.current = null;
    } else if (sheetState === "peek") {
      sheetHandleRef.current?.focus({ preventScroll: true });
    } else {
      cropPreviewReturnRef.current = null;
      const select = aspectSelectRef.current;
      if (select && !select.disabled) select.focus({ preventScroll: true });
      if (panelScrollRef.current) panelScrollRef.current.scrollTop = previous.scrollTop;
    }
  }, [modalOpen, sheetState, step]);
  const readinessPhase = h.readinessState?.phase ?? (h.isRestoringScene ? "initializing" : "ready");
  const restoringScene = Boolean(h.isRestoringScene) && readinessPhase !== "error";
  const selectedCount = h.selectedIds?.size ?? 0;
  const placementActive = h.placementSession?.phase === "preview" || Boolean(h.placementActive);
  const activeTaskBusy = Boolean(
    h.isCapturing
    || restoringScene
    || readinessPhase === "initializing"
    || h.isUploadingModel
    || h.isBatchRenderingShots
    || h.applyingTemplateId
    || h.deletingModelId,
  );
  const busy = activeTaskBusy || readinessPhase === "error" || preparingModel !== null;
  const insertDisabled = !hasScene
    || busy
    || placementActive
    || Boolean(h.insertBlocked)
    || Boolean(h.immersiveSceneActive)
    || Boolean(h.sharedStageUpdateBlockedReason) || Boolean(h.sixPassLtInsertUnavailableReason);
  const selectableSceneIds = [
    ...(h.primitives ?? []).map((node) => node.id),
    ...(h.customModels ?? []).map((node) => node.id),
  ];
  const selectableSceneIdSignature = [...selectableSceneIds].sort().join("|");
  const selectedSceneIdSignature = [...(h.selectedIds ?? [])].sort().join("|");

  useEffect(() => {
    if (
      sceneFramingRequest === 0
      || completedSceneFramingRequestRef.current === sceneFramingRequest
      || busy
      || h.focusSelectionDisabledReason
      || selectableSceneIdSignature.length === 0
    ) return undefined;
    if (h.setSelectedIds && selectedSceneIdSignature !== selectableSceneIdSignature) {
      h.setSelectedIds(new Set(selectableSceneIdSignature.split("|").filter(Boolean)));
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      completedSceneFramingRequestRef.current = sceneFramingRequest;
      h.focusSelectedEntity();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    busy,
    h,
    h.focusSelectionDisabledReason,
    sceneFramingRequest,
    selectableSceneIdSignature,
    selectedSceneIdSignature,
  ]);

  useEffect(() => {
    if (!modalOpen) {
      hydratedRef.current = false;
      setStep("choose");
      setSheetState("half");
      return;
    }
    if (restoringScene || readinessPhase !== "ready" || hydratedRef.current) return;
    hydratedRef.current = true;
    if (hasScene) setStep("arrange");
    if (h.lineArtPreview) {
      setOutputStyle(h.ltToneSettings?.mode === "none" ? "line" : "tone");
    }
  }, [h.lineArtPreview, h.ltToneSettings?.mode, hasScene, modalOpen, readinessPhase, restoringScene]);
  const assistantAssets = ((h.modelLibrary ?? []) as readonly AssistantAsset[])
    .filter((entry) => classifyAssistantAsset(entry, h.genericModelClassifications) === goal);

  const changeStep = (next: StudioBg3dAssistantStep) => {
    if (next === "finish" && placementActive) return;
    if (studioBg3dAssistantStepIndex(next) > 0 && !hasScene) {
      setStep("choose");
      setSheetState("full");
      return;
    }
    setStep(next);
    setSheetState(next === "choose" ? "full" : "half");
  };

  const frameWholeScene = () => {
    requestSceneFraming();
  };

  const replaceWithScene = (preset: StudioBg3dSceneChoice) => {
    if (busy) return;
    if (hasScene) {
      const accepted = window.confirm(
        `현재 배경을 “${preset.title}” 장면으로 바꿀까요? 배치한 인물과 소품은 유지됩니다.`,
      );
      if (!accepted) return;
    }
    const created = h.addSceneTemplate(preset.templateId);
    if (!created) return;
    if (preset.cameraPreset) {
      h.applyCameraPreset(preset.cameraPreset);
      setActiveCameraPreset(preset.cameraPreset);
    }
    frameWholeScene();
    setStep("arrange");
    setSheetState("half");
  };

  const addAsset = async (asset: AssistantAsset) => {
    if (busy || !asset.canUse) return;
    setPreparingModel(asset.name);
    try {
      if (await h.addCustomModelToScene(asset.id)) {
        setStep("arrange");
        setSheetState("peek");
      }
    } finally {
      setPreparingModel(null);
    }
  };

  const selectCameraPreset = (presetId: string) => {
    h.applyCameraPreset(presetId);
    frameWholeScene();
    setActiveCameraPreset(presetId);
  };

  const selectOutputStyle = (style: StudioBg3dAssistantOutputStyle) => {
    const settings = studioBg3dAssistantOutputSettings(style);
    setOutputStyle(style);
    h.setLineArtPreview(settings.lineArtPreview);
    h.updateLtToneSettings(settings.tone);
  };
  const selectAspectRatio = (aspectRatio: number | null) => {
    h.updateLtExportAspectRatio?.(aspectRatio);
    (onHostChange ?? refreshMutableHost)();
  };
  const viewCrop = () => {
    if (sheetState === "peek") return;
    cropPreviewReturnRef.current = { sheet: sheetState, scrollTop: panelScrollRef.current?.scrollTop ?? 0 };
    setSheetState("peek");
  };
  const openInsertSettings = () => setSheetState(cropPreviewReturnRef.current?.sheet ?? "half");
  const advance = () => {
    if (step === "finish") {
      if (!insertDisabled) void h.handleInsert();
      return;
    }
    const next = nextStudioBg3dAssistantStep(step);
    if (next) changeStep(next);
  };

  const goBack = () => {
    const previous = previousStudioBg3dAssistantStep(step);
    if (previous) changeStep(previous);
  };

  const returnToChoose = (nextGoal: StudioBg3dAssistantGoal) => {
    setGoal(nextGoal);
    setStep("choose");
    setSheetState("full");
  };

  let stepContent: ReactNode;
  if (step === "choose") {
    stepContent = (
      <ChooseStep
        goal={goal}
        selectedSceneId={studioBg3dAssistantLocationId(h.primitives ?? [])}
        assets={goal === "background" ? assistantAssets : assistantAssets.slice(0, 8)}
        busy={busy}
        hasScene={hasScene}
        onGoalChange={setGoal}
        onSceneSelect={replaceWithScene}
        onAssetAdd={addAsset}
        onOpenProfessional={() => {
          h.setActivePanelTab("models");
          h.setModelsPanelActivated(true);
          onOpenProfessional();
        }}
      />
    );
  } else if (step === "arrange") {
    stepContent = (
      <ArrangeStep
        h={h}
        selectedCount={selectedCount}
        objectCount={objectCount}
        placementActive={placementActive}
        busy={busy}
        onReturnToChoose={returnToChoose}
      />
    );
  } else if (step === "frame") {
    stepContent = (
      <FrameStep
        h={h}
        activeCameraPreset={activeCameraPreset}
        busy={busy}
        onCameraPreset={selectCameraPreset}
      />
    );
  } else {
    stepContent = (
      <StudioBg3dAssistantFinishStep
        outputStyle={outputStyle}
        busy={busy}
        hasScene={hasScene}
        onOutputStyle={selectOutputStyle}
        aspectRatio={h.ltExportAspectRatio ?? null}
        aspectRatioDisabled={insertDisabled}
        aspectSelectRef={aspectSelectRef}
        onAspectRatio={h.updateLtExportAspectRatio ? selectAspectRatio : undefined}
        onViewCrop={placementActive || sheetState === "peek" ? undefined : viewCrop}
        saveDisabled={placementActive}
        onSaveToLibrary={h.handleSaveToLibrary}
      />
    );
  }
  const detailTab = goal !== "background" ? "models" : step === "frame" ? "view" : step === "finish" ? "lt" : "templates";
  const detailLabel = {
    models: bt("모델 라이브러리", "Model library"), view: bt("카메라 세부 조정", "Camera settings"),
    lt: bt("선화 세부 조정", "Line settings"), templates: bt("장면 템플릿", "Scene templates"),
  }[detailTab];
  const openProfessionalForContext = () => {
    h.setActivePanelTab(detailTab);
    if (detailTab === "models") h.setModelsPanelActivated(true);
    if (detailTab === "view") h.setViewEditorSection("camera");
    if (detailTab === "lt") h.setLtEditorSection("line");
    onOpenProfessional();
  };

  const placementBlocksAdvance = placementActive && (step === "frame" || step === "finish");
  const primaryDisabled = busy || !hasScene || placementBlocksAdvance || (step === "finish" && insertDisabled);
  const primaryLabel = placementBlocksAdvance
    ? bt("배치를 먼저 확정하거나 취소하세요", "Confirm or cancel the placement first")
    : step === "finish" && h.operation === "update"
    ? "현재 컷에 다시 적용"
    : stepActionLabel(step);

  return (
    <div
      className="scene-assistant"
      data-sheet-state={sheetState}
      data-step={step}
      data-assistant-busy={busy || undefined}
      data-assistant-readiness={readinessPhase}
      data-assistant-has-scene={hasScene || undefined}
      data-assistant-primary-disabled={primaryDisabled || undefined}
      data-assistant-restoring={restoringScene || undefined}
      data-assistant-uploading={h.isUploadingModel || undefined}
      data-assistant-applying-template={h.applyingTemplateId || undefined}
      data-assistant-deleting={h.deletingModelId || undefined}
      data-testid="studio-bg3d-scene-assistant"
    >
      <div className="scene-assistant__viewport">
        {viewport ?? <StudioBg3dEditorViewport h={h} simplified />}
        <div className={placementActive ? "sr-only" : "scene-assistant__viewport-status"} aria-live="polite">
          {placementActive
            ? null
            : selectedCount > 0
              ? `${selectedCount}개 선택 · ${TRANSFORM_ACTIONS.find((item) => item.id === h.transformMode)?.label ?? "위치 조정"}`
              : hasScene
                ? "물체를 누르면 바로 조정할 수 있어요"
                : "시작점 선택에서 장면을 골라 주세요"}
        </div>
      </div>

      <aside className="scene-assistant__panel" aria-label="장면 도우미">
        <SheetHandle state={sheetState} onChange={setSheetState} buttonRef={sheetHandleRef} placementActive={placementActive}
          onOpenInsertSettings={step === "finish" && sheetState === "peek" ? openInsertSettings : undefined} />
        <div className="scene-assistant__panel-head">
          <div className="scene-assistant__panel-title">
            <span><Compass size={15} aria-hidden /></span>
            <div><h3>{STUDIO_BG3D_ASSISTANT_STEPS[studioBg3dAssistantStepIndex(step)]?.label}</h3></div>
          </div>
          <button type="button" className="scene-assistant__precision" onClick={openProfessionalForContext}>
            <SlidersHorizontal size={14} aria-hidden /> {detailLabel}
          </button>
        </div>

        <AssistantStepper step={step} onStepChange={changeStep} finishDisabled={placementActive} />
        <div className="scene-assistant__panel-scroll" ref={panelScrollRef}>
          <StudioBg3dAssistantHostReadinessBanner host={h} hasDraftScene={hasScene} />
          <StudioScene3dBg3dCutPanel host={h} preferredExpanded={false} />
          <SceneAssistantTouchGuide />
          {preparingModel && <p role="status" className="scene-assistant__notice">
            {bt(`${preparingModel} 배치 준비 중…`, `Preparing ${preparingModel} for placement…`)}
          </p>}
          {stepContent}
          <details className="mt-2 rounded-lg border border-line bg-card px-3 py-2" open={proLabOpen} onToggle={(e) => setProLabOpen(e.currentTarget.open)}>
            <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-fg">한국 웹툰 3D 프로 랩</summary>
            {proLabOpen ? (
              <Suspense fallback={<p role="status" className="py-2 text-xs">{frozenStatus5Text("studio.frozenStatus5.bg3dAssistant.proLabLoading", "3D 프로 랩 불러오는 중…")}</p>}>
                <LazyStudio3dWebtoonProPanel onApplyCelContract={(p) => { h.setLineArtPreview(true); h.updateLtToneSettings({ mode: "cel", toneBands: p.toneBandCount, inkPx: p.inkPx }); }} onPlaceHeroAsset={(a) => { void h.addCustomModelToScene(a.id); }} />
              </Suspense>
            ) : null}
          </details>
        </div>
        {h.librarySaveNotice ? (
          <div className="scene-assistant__notice scene-assistant__notice--success" role="status">
            {h.librarySaveNotice}
          </div>
        ) : null}
        {h.error || h.sharedStageUpdateBlockedReason || h.sixPassLtInsertUnavailableReason ? (
          <div className="scene-assistant__notice" role="alert">
            {h.error ?? h.sharedStageUpdateBlockedReason ?? h.sixPassLtInsertUnavailableReason}
          </div>
        ) : null}

        <footer className="scene-assistant__footer">
          <div className="scene-assistant__footer-secondary">
            {step !== "choose" && (
              <button type="button" onClick={goBack}>
                <ArrowLeft size={15} aria-hidden /> 이전
              </button>
            )}
          </div>
          <button
            type="button"
            className="scene-assistant__primary"
            disabled={primaryDisabled}
            onClick={advance}
          >
            {activeTaskBusy ? <Loader2 className="animate-spin motion-reduce:animate-none" size={17} aria-hidden /> : step === "finish" ? <ImagePlus size={17} aria-hidden /> : null}
            <span>{primaryLabel}</span>
            {!activeTaskBusy && step !== "finish" ? <ArrowRight size={16} aria-hidden /> : null}
          </button>
        </footer>
      </aside>
    </div>
  );
}
