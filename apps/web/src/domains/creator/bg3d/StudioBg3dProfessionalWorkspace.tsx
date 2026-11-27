import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import { useMediaQuery } from "@/shared/hooks/use-media-query";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { StudioScene3dBg3dCutPanel } from "../scene3d/StudioScene3dBg3dCutPanel";

import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import type { Axis180ShotSpec, AxisHalfPlaneSide } from "./studio-bg3d-180-axis-constraint";
import {
  computeGroundSnapTransform,
  resolveBg3dStagingShortcut,
  type GroundSnapResult,
  type TemplateTransferResult,
} from "./studio-bg3d-ground-snap-and-template-transfer";
import {
  buildBakedManuscriptCutLayer,
  clampSplitWipeRatio,
  type BakedManuscriptCutLayer,
  type LiveInkPreviewMode,
  type Scene3DCaptureSnapshot,
  type Stage3DMode,
} from "./studio-bg3d-live-ink-bake-bridge";
import type {
  StudioBg3dWebtoonAtmospherePreset,
  StudioBg3dWebtoonAtmospherePresetId,
} from "./studio-bg3d-lighting-studio";
import { StudioBg3dLiveInkStagePane } from "./StudioBg3dLiveInkStagePane";
import { StudioBg3dStageStepperBar } from "./StudioBg3dStageStepperBar";
import type { StudioBg3dSectionCapSummary } from "./studio-bg3d-section-cap-coordination";
import { StudioBg3dWebtoonAtmosphereStrip } from "./StudioBg3dWebtoonAtmosphereStrip";
import {
  DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT,
  STUDIO_BG3D_INSPECTOR_WIDTH_MAX,
  STUDIO_BG3D_INSPECTOR_WIDTH_MIN,
  STUDIO_BG3D_OUTLINER_WIDTH_MAX,
  STUDIO_BG3D_OUTLINER_WIDTH_MIN,
  applyStudioBg3dWorkspacePreset,
  readStudioBg3dProfessionalWorkspaceLayout,
  setStudioBg3dWorkspacePanelVisible,
  setStudioBg3dWorkspacePanelWidth,
  studioBg3dProfessionalWorkspaceStorageKey,
  swapStudioBg3dWorkspaceDockOrder,
  writeStudioBg3dProfessionalWorkspaceLayout,
  type StudioBg3dWorkspacePanel,
  type StudioBg3dWorkspacePresetId,
} from "./studio-bg3d-professional-workspace-layout";
import {
  StudioBg3dAssetShelf,
  type AssetShelfEntry,
  type Bg3dShelfStageId,
} from "./StudioBg3dAssetShelf";
import {
  StudioBg3dHeroCutawaySection,
  type StudioBg3dWallCutawayChangeEvent,
} from "./StudioBg3dHeroCutawaySection";
import type { HeroBg3dDeliveryResolution } from "./studio-bg3d-hero-tier-selector";
import {
  DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
  type Bg3dCutawayCameraInput,
  type Bg3dWallCutawayConfig,
} from "./studio-bg3d-wall-cutaway-runtime";

const LazyStudioSplitWipeOverlay = lazy(() =>
  import("../studio-cuttoon-editor/StudioSplitWipeOverlay").then((m) => ({
    default: m.StudioSplitWipeOverlay,
  })),
);
const LazyStudio3dRadialPieMenu = lazy(() =>
  import("../studio-3d-ui/Studio3dRadialPieMenu").then((m) => ({
    default: m.Studio3dRadialPieMenu,
  })),
);
const LazyStudioBg3dProStagingDrawer = lazy(() =>
  import("./StudioBg3dProStagingDrawer").then((m) => ({
    default: m.StudioBg3dProStagingDrawer,
  })),
);

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioBg3dProfessionalWorkspace", ko, en);

interface StudioBg3dProfessionalWorkspaceProps {
  readonly outliner: ReactNode;
  readonly viewport: ReactNode;
  readonly cutHost?: unknown;
  readonly inspector: ReactNode;
  readonly scopeKey?: string | null;
  readonly defaultLiveInkMode?: LiveInkPreviewMode;
  readonly captureSnapshot?: Scene3DCaptureSnapshot | null;
  readonly targetDocumentId?: string | null;
  readonly targetCutIndex?: number;
  readonly activeHeroAssetId?: string | null;
  readonly heroCamera?: Bg3dCutawayCameraInput | null;
  readonly heroViewportWidthPx?: number;
  readonly heroDeviceMemoryGb?: number;
  readonly onSelectHeroAsset?: (resolution: HeroBg3dDeliveryResolution) => void;
  readonly onWallCutawayChange?: (event: StudioBg3dWallCutawayChangeEvent) => void;
  readonly wallCutawayConfig?: Bg3dWallCutawayConfig;
  readonly onWallCutawayConfigChange?: (config: Bg3dWallCutawayConfig) => void;
  readonly sectionCapSummary?: StudioBg3dSectionCapSummary | null;
  readonly activeWebtoonAtmosphereId?: StudioBg3dWebtoonAtmospherePresetId | null;
  readonly onApplyWebtoonAtmosphere?: (preset: StudioBg3dWebtoonAtmospherePreset) => void;
  readonly isLiveCapturing?: boolean;
  readonly onRequestLiveCapture?: (
    stage: Stage3DMode,
  ) => Promise<Scene3DCaptureSnapshot | null> | Scene3DCaptureSnapshot | null;
  readonly lastBakedLayer?: BakedManuscriptCutLayer | null;
  readonly onRestoreReshootFromBakedLayer?: (layer: BakedManuscriptCutLayer) => void;
  readonly onBakeToManuscriptCut?: (layer: BakedManuscriptCutLayer) => void;
  readonly onInsertShelfAsset?: (entry: AssetShelfEntry) => void;
  readonly onGroundSnap?: (result: GroundSnapResult) => void;
  readonly onSelectReverseShot?: (shot: Axis180ShotSpec) => void;
  readonly onTransferTemplatePose?: (result: TemplateTransferResult) => void;
}

interface ResizeGesture {
  readonly panel: StudioBg3dWorkspacePanel;
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
}

const PRESET_ENTRIES: ReadonlyArray<{ readonly id: Exclude<StudioBg3dWorkspacePresetId, "custom">; readonly ko: string; readonly en: string }> = [
  { id: "scene", ko: "장면", en: "Scene" },
  { id: "character", ko: "캐릭터", en: "Character" },
  { id: "output", ko: "출력", en: "Output" },
  { id: "focus", ko: "집중", en: "Focus" },
];

const LIVE_INK_MODE_ENTRIES: ReadonlyArray<{ readonly id: LiveInkPreviewMode; readonly ko: string; readonly en: string }> = [
  { id: "shaded-3d", ko: "3D 음영", en: "3D shaded" },
  { id: "split-wipe", ko: "선화 분할 비교", en: "Split-wipe" },
  { id: "live-ink-only", ko: "선화 전용", en: "Live ink only" },
];

const shelfStageToStage3DMode = (stage: Bg3dShelfStageId): Stage3DMode => (stage === "ink" ? "live-ink" : stage);
const stage3DModeToShelfStage = (stage: Stage3DMode): Bg3dShelfStageId => (stage === "live-ink" ? "ink" : stage);

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function panelBounds(panel: StudioBg3dWorkspacePanel): { readonly min: number; readonly max: number } {
  return panel === "outliner"
    ? { min: STUDIO_BG3D_OUTLINER_WIDTH_MIN, max: STUDIO_BG3D_OUTLINER_WIDTH_MAX }
    : { min: STUDIO_BG3D_INSPECTOR_WIDTH_MIN, max: STUDIO_BG3D_INSPECTOR_WIDTH_MAX };
}

function readCutHostAddModel(
  host: unknown,
): ((modelId: string) => Promise<boolean> | boolean) | null {
  if (typeof host !== "object" || host === null) return null;
  const candidate = (host as { readonly addCustomModelToScene?: unknown }).addCustomModelToScene;
  return typeof candidate === "function"
    ? (candidate as (modelId: string) => Promise<boolean> | boolean)
    : null;
}

function readCutHostApplyAtmosphere(
  host: unknown,
): ((preset: StudioBg3dWebtoonAtmospherePreset) => void) | null {
  if (typeof host !== "object" || host === null) return null;
  const candidate = (host as { readonly applyWebtoonAtmospherePreset?: unknown }).applyWebtoonAtmospherePreset;
  return typeof candidate === "function"
    ? (candidate as (preset: StudioBg3dWebtoonAtmospherePreset) => void)
    : null;
}

export function StudioBg3dProfessionalWorkspace({
  outliner,
  viewport,
  cutHost,
  inspector,
  scopeKey = null,
  defaultLiveInkMode = "shaded-3d",
  captureSnapshot = null,
  targetDocumentId = null,
  targetCutIndex = 0,
  activeHeroAssetId = null,
  heroCamera = null,
  heroViewportWidthPx,
  heroDeviceMemoryGb,
  onSelectHeroAsset,
  onWallCutawayChange,
  wallCutawayConfig: controlledWallCutawayConfig,
  onWallCutawayConfigChange,
  sectionCapSummary = null,
  activeWebtoonAtmosphereId: controlledAtmosphereId = null,
  onApplyWebtoonAtmosphere,
  isLiveCapturing = false,
  onRequestLiveCapture,
  lastBakedLayer: externalLastBakedLayer = null,
  onRestoreReshootFromBakedLayer,
  onBakeToManuscriptCut,
  onInsertShelfAsset,
  onGroundSnap,
  onSelectReverseShot,
  onTransferTemplatePose,
}: StudioBg3dProfessionalWorkspaceProps) {
  useBilingualI18nRevision();
  const compactCutPanel = useMediaQuery("(max-width: 1279px), (max-height: 800px)");
  const canonicalStorageKey = studioBg3dProfessionalWorkspaceStorageKey(scopeKey);
  const [layout, setLayout] = useState(() =>
    readStudioBg3dProfessionalWorkspaceLayout(browserStorage(), scopeKey));
  const [assetShelfOpen, setAssetShelfOpen] = useState(false);
  const [proStagingOpen, setProStagingOpen] = useState(false);
  const [axis180Locked, setAxis180Locked] = useState(true);
  const [axisSide, setAxisSide] = useState<AxisHalfPlaneSide>(1);
  const [radialPieOpen, setRadialPieOpen] = useState(false);
  const [activeStage, setActiveStage] = useState<Bg3dShelfStageId>("build");
  const [placedShelfAssetIds, setPlacedShelfAssetIds] = useState<readonly string[]>([]);
  const [liveInkMode, setLiveInkMode] = useState<LiveInkPreviewMode>(defaultLiveInkMode);
  const [splitWipeRatio, setSplitWipeRatio] = useState<number>(0.5);
  const [bakeStatusMessage, setBakeStatusMessage] = useState<string | null>(null);
  const [localAtmosphereId, setLocalAtmosphereId] = useState<StudioBg3dWebtoonAtmospherePresetId | null>(null);
  const [localWallCutawayConfig, setLocalWallCutawayConfig] = useState<Bg3dWallCutawayConfig>(
    DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
  );
  const [localBakedLayer, setLocalBakedLayer] = useState<BakedManuscriptCutLayer | null>(null);
  const [bakeFlashActive, setBakeFlashActive] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const hydratedStorageKeyRef = useRef(canonicalStorageKey);
  const resizeGestureRef = useRef<ResizeGesture | null>(null);
  const bakeFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAtmosphereId = controlledAtmosphereId ?? localAtmosphereId;
  const effectiveWallCutawayConfig = controlledWallCutawayConfig ?? localWallCutawayConfig;
  const effectiveLastBakedLayer = externalLastBakedLayer ?? localBakedLayer;

  useEffect(() => () => {
    if (bakeFlashTimerRef.current !== null) clearTimeout(bakeFlashTimerRef.current);
  }, []);

  const handleTriggerGroundSnap = useCallback(() => {
    const snap = computeGroundSnapTransform({
      currentPosition: heroCamera ? [heroCamera.target[0], 0.12, heroCamera.target[2]] : [0, 0.12, 0],
      raycastGroundY: () => 0,
      defaultGroundY: 0,
    });
    onGroundSnap?.(snap);
    setBakeStatusMessage(
      bi(
        `지면 접지(X) 완료 — Y ${snap.deltaY}m 보정으로 바닥 0mm 밀착`,
        `Ground snap (X) applied — deltaY ${snap.deltaY}m`,
      ),
    );
  }, [heroCamera, onGroundSnap]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget = Boolean(
        target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable),
      );
      if (isEditableTarget || event.ctrlKey || event.metaKey || event.altKey) return;
      const shortcut = resolveBg3dStagingShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        isEditableTarget,
      });
      if (shortcut === "ground-snap") {
        event.preventDefault();
        handleTriggerGroundSnap();
        return;
      }
      if (event.key.toLowerCase() === "q" && !event.shiftKey) {
        event.preventDefault();
        setRadialPieOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [handleTriggerGroundSnap]);

  const triggerLiveCaptureIfNeeded = useCallback(
    (stage: Stage3DMode) => {
      if (!onRequestLiveCapture) return;
      void Promise.resolve(onRequestLiveCapture(stage)).catch(() => {
        setBakeStatusMessage(
          bi("3D 라이브 선화 캡처에 실패했습니다. 뷰포트를 확인한 뒤 다시 시도해 주세요.", "Live ink capture failed."),
        );
      });
    },
    [onRequestLiveCapture],
  );

  const handleSelectShelfStage = (stage: Bg3dShelfStageId) => {
    setActiveStage(stage);
    if (stage === "build") {
      setLayout(applyStudioBg3dWorkspacePreset("scene"));
    } else if (stage === "pose") {
      setLayout(applyStudioBg3dWorkspacePreset("character"));
    } else if (stage === "shot") {
      setLayout(applyStudioBg3dWorkspacePreset("focus"));
    } else {
      setLayout(applyStudioBg3dWorkspacePreset("output"));
      setLiveInkMode("split-wipe");
      triggerLiveCaptureIfNeeded("live-ink");
    }
  };

  const handleSelectLiveInkMode = (mode: LiveInkPreviewMode) => {
    setLiveInkMode(mode);
    if (mode !== "shaded-3d") {
      setActiveStage("ink");
      if (!captureSnapshot) triggerLiveCaptureIfNeeded("live-ink");
    }
  };

  const handleApplyWebtoonAtmosphere = (preset: StudioBg3dWebtoonAtmospherePreset) => {
    setLocalAtmosphereId(preset.id);
    if (onApplyWebtoonAtmosphere) onApplyWebtoonAtmosphere(preset);
    else readCutHostApplyAtmosphere(cutHost)?.(preset);
    setBakeStatusMessage(
      bi(
        `“${preset.labelKo}” 분위기 적용 — 안개 ${Math.round(preset.fog.density * 100)}% · 외곽선 ${preset.inkLineWeightPx.toFixed(1)}px`,
        `Applied "${preset.labelEn}" — fog ${Math.round(preset.fog.density * 100)}% · ink ${preset.inkLineWeightPx.toFixed(1)}px`,
      ),
    );
  };

  const handleWallCutawayConfigChange = (next: Bg3dWallCutawayConfig) => {
    setLocalWallCutawayConfig(next);
    onWallCutawayConfigChange?.(next);
  };

  const handleToggleWallCutaway = () => {
    const next: Bg3dWallCutawayConfig = {
      ...effectiveWallCutawayConfig,
      enabled: !effectiveWallCutawayConfig.enabled,
    };
    handleWallCutawayConfigChange(next);
    setBakeStatusMessage(
      next.enabled
        ? bi("가림 벽 자동 숨김을 켰습니다. 카메라 앞 벽을 자동으로 투명화합니다.", "Auto-hide occluding walls enabled.")
        : bi("가림 벽 자동 숨김을 껐습니다. 모든 벽을 원래대로 표시합니다.", "Auto-hide occluding walls disabled."),
    );
  };

  const handleSelectHeroAsset = (resolution: HeroBg3dDeliveryResolution) => {
    onSelectHeroAsset?.(resolution);
    const resolvedAsset = resolution.asset;
    if (!resolvedAsset) return;
    const addModel = readCutHostAddModel(cutHost);
    if (addModel) {
      void Promise.resolve(addModel(resolvedAsset.id)).catch(() => {
        setBakeStatusMessage(
          bi("선택한 3D 배경을 불러오지 못했습니다. 다시 시도해 주세요.", "Could not load the selected 3D background."),
        );
      });
    }
    setBakeStatusMessage(
      resolution.tier === "mobile"
        ? bi(
          `“${resolvedAsset.name}” 경량본(-${resolution.savedPercent.toFixed(1)}%)을 선택했습니다.`,
          `Selected lightweight "${resolvedAsset.name}" (-${resolution.savedPercent.toFixed(1)}%).`,
        )
        : bi(`“${resolvedAsset.name}” 배경을 선택했습니다.`, `Selected "${resolvedAsset.name}".`),
    );
  };

  const handleInsertShelfAsset = (entry: AssetShelfEntry) => {
    setPlacedShelfAssetIds((prev) => (prev.includes(entry.id) ? prev : [...prev, entry.id]));
    onInsertShelfAsset?.(entry);
    const title = bi(entry.titleKo, entry.titleEn);
    setBakeStatusMessage(
      bi(`“${title}” 항목을 현재 3D 장면에 배치했습니다.`, `Placed "${title}" into the active 3D scene.`),
    );
  };

  const triggerBakeFlash = () => {
    setBakeFlashActive(true);
    if (bakeFlashTimerRef.current !== null) clearTimeout(bakeFlashTimerRef.current);
    bakeFlashTimerRef.current = setTimeout(() => setBakeFlashActive(false), 620);
  };

  const handleBakeToManuscriptCut = async () => {
    let resolvedCapture = captureSnapshot;
    if (!resolvedCapture && onRequestLiveCapture) {
      try {
        resolvedCapture = await Promise.resolve(onRequestLiveCapture(shelfStageToStage3DMode(activeStage)));
      } catch {
        setBakeStatusMessage(bi("3D 뷰포트 실캡처 중 오류가 발생했습니다. 다시 시도해 주세요.", "Live viewport capture failed."));
        return;
      }
    }
    if (!resolvedCapture) {
      setBakeStatusMessage(bi("3D 뷰포트 캡처 스냅샷을 먼저 준비해 주세요.", "Prepare a 3D viewport capture snapshot first."));
      return;
    }
    const result = buildBakedManuscriptCutLayer({
      capture: resolvedCapture,
      targetDocumentId: targetDocumentId ?? "",
      targetCutIndex,
      previewMode: liveInkMode,
      splitWipeRatio,
    });
    if (!result.ok) {
      setBakeStatusMessage(result.messageKo);
      return;
    }
    setLocalBakedLayer(result.layer);
    onBakeToManuscriptCut?.(result.layer);
    triggerBakeFlash();
    setBakeStatusMessage(
      bi(
        `컷 #${result.layer.targetCutIndex + 1}에 비파괴 3D 레이어(출처 소재 ${result.layer.rightsBomAssetIds.length}건)를 반영했습니다.`,
        `Baked non-destructive 3D layer (${result.layer.rightsBomAssetIds.length} Rights BOM assets) to cut #${result.layer.targetCutIndex + 1}.`,
      ),
    );
  };

  useEffect(() => {
    if (hydratedStorageKeyRef.current === canonicalStorageKey) return;
    hydratedStorageKeyRef.current = canonicalStorageKey;
    setLayout(readStudioBg3dProfessionalWorkspaceLayout(browserStorage(), scopeKey));
  }, [canonicalStorageKey, scopeKey]);

  useEffect(() => {
    if (hydratedStorageKeyRef.current !== canonicalStorageKey) return;
    writeStudioBg3dProfessionalWorkspaceLayout(browserStorage(), layout, scopeKey);
  }, [canonicalStorageKey, layout, scopeKey]);

  const beginResize = (
    panel: StudioBg3dWorkspacePanel,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeGestureRef.current = {
      panel,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panel === "outliner" ? layout.outlinerWidth : layout.inspectorWidth,
    };
  };

  const continueResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const rawDelta = event.clientX - gesture.startX;
    const panelIsLeft = layout.dockOrder === "outliner-viewport-inspector"
      ? gesture.panel === "outliner"
      : gesture.panel === "inspector";
    const widthDelta = panelIsLeft ? rawDelta : -rawDelta;
    setLayout((current) => setStudioBg3dWorkspacePanelWidth(
      current,
      gesture.panel,
      gesture.startWidth + widthDelta,
    ));
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    resizeGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleSeparatorKeyDown = (
    panel: StudioBg3dWorkspacePanel,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const bounds = panelBounds(panel);
    const currentWidth = panel === "outliner" ? layout.outlinerWidth : layout.inspectorWidth;
    const panelIsLeft = layout.dockOrder === "outliner-viewport-inspector"
      ? panel === "outliner"
      : panel === "inspector";
    let nextWidth: number | null = null;
    const step = event.shiftKey ? 32 : 16;
    if (event.key === "Home") nextWidth = bounds.min;
    else if (event.key === "End") nextWidth = bounds.max;
    else if (event.key === "ArrowLeft") nextWidth = currentWidth + (panelIsLeft ? -step : step);
    else if (event.key === "ArrowRight") nextWidth = currentWidth + (panelIsLeft ? step : -step);
    if (nextWidth === null) return;
    event.preventDefault();
    setLayout((current) => setStudioBg3dWorkspacePanelWidth(current, panel, nextWidth));
  };

  const resetPanelWidth = (panel: StudioBg3dWorkspacePanel) => {
    const defaultWidth = panel === "outliner"
      ? DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT.outlinerWidth
      : DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT.inspectorWidth;
    setLayout((current) => setStudioBg3dWorkspacePanelWidth(current, panel, defaultWidth));
  };

  const togglePanel = (panel: StudioBg3dWorkspacePanel) => {
    const visible = panel === "outliner" ? layout.outlinerVisible : layout.inspectorVisible;
    setLayout((current) => setStudioBg3dWorkspacePanelVisible(current, panel, !visible));
  };

  const reversed = layout.dockOrder === "inspector-viewport-outliner";
  const workspaceStyle = {
    "--studio-bg3d-outliner-width": `${layout.outlinerWidth}px`,
    "--studio-bg3d-inspector-width": `${layout.inspectorWidth}px`,
    "--studio-bg3d-outliner-order": reversed ? 4 : 0,
    "--studio-bg3d-outliner-resizer-order": reversed ? 3 : 1,
    "--studio-bg3d-viewport-order": 2,
    "--studio-bg3d-inspector-resizer-order": reversed ? 1 : 3,
    "--studio-bg3d-inspector-order": reversed ? 0 : 4,
  } as CSSProperties;

  const renderSeparator = (panel: StudioBg3dWorkspacePanel) => {
    const bounds = panelBounds(panel);
    const value = panel === "outliner" ? layout.outlinerWidth : layout.inspectorWidth;
    const label = panel === "outliner"
      ? bi("장면 계층 패널 너비", "Scene hierarchy panel width")
      : bi("속성 패널 너비", "Inspector panel width");
    const orderVariable = panel === "outliner"
      ? "var(--studio-bg3d-outliner-resizer-order)"
      : "var(--studio-bg3d-inspector-resizer-order)";
    return (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- A focusable WAI-ARIA separator is the prescribed interaction model for resizing adjacent panes.
      <div
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={value}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A focusable WAI-ARIA separator is the prescribed interaction model for resizing adjacent panes.
        tabIndex={0}
        data-testid={`studio-bg3d-${panel}-resizer`}
        className="group hidden min-h-0 w-1.5 shrink-0 touch-none cursor-col-resize items-stretch justify-center bg-panel/70 outline-none hover:bg-accent-soft focus-visible:bg-accent-soft xl:flex"
        style={{ order: orderVariable }}
        onDoubleClick={() => resetPanelWidth(panel)}
        onKeyDown={(event) => handleSeparatorKeyDown(panel, event)}
        onPointerDown={(event) => beginResize(panel, event)}
        onPointerMove={continueResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={endResize}
      >
        <span className="w-px bg-line transition-colors group-hover:bg-accent group-focus-visible:bg-accent" aria-hidden />
      </div>
    );
  };

  return (
    <div data-bg3d-professional-workspace="true" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {cutHost != null && <StudioScene3dBg3dCutPanel host={cutHost} preferredExpanded={!compactCutPanel} />}
      <div
        data-bg3d-stage-header="true"
        className="flex min-h-12 shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-panel px-2.5 py-1.5"
        role="toolbar"
        aria-label={bi("3D 전문가 작업공간", "3D professional workspace")}
      >
        {PRESET_ENTRIES.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={layout.preset === preset.id}
            className={`${mobileToolsOpen ? "inline-flex" : "hidden md:inline-flex"} min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/60 hover:text-fg aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent aria-pressed:shadow-[inset_2px_0_0_var(--color-accent)] motion-reduce:transition-none`}
            onClick={() => setLayout(applyStudioBg3dWorkspacePreset(preset.id))}
          >
            {bi(preset.ko, preset.en)}
          </button>
        ))}
        <span className="mx-0.5 hidden h-5 w-px bg-line xl:inline-block" aria-hidden />
        <button type="button" aria-pressed={layout.outlinerVisible} className="hidden min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/60 aria-pressed:border-accent aria-pressed:bg-accent-soft/50 aria-pressed:text-accent motion-reduce:transition-none xl:inline-flex" onClick={() => togglePanel("outliner")}>{bi("계층", "Hierarchy")}</button>
        <button type="button" aria-pressed={layout.inspectorVisible} className="hidden min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/60 aria-pressed:border-accent aria-pressed:bg-accent-soft/50 aria-pressed:text-accent motion-reduce:transition-none xl:inline-flex" onClick={() => togglePanel("inspector")}>{bi("속성", "Inspector")}</button>
        <button type="button" className="hidden min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/60 hover:text-accent motion-reduce:transition-none xl:inline-flex" onClick={() => setLayout((current) => swapStudioBg3dWorkspaceDockOrder(current))}>{bi("좌우 바꾸기", "Swap sides")}</button>
        <button type="button" aria-pressed={assetShelfOpen} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/60 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent aria-pressed:shadow-[inset_2px_0_0_var(--color-accent)] motion-reduce:transition-none" onClick={() => setAssetShelfOpen((current) => !current)}>{bi("에셋 쉘프", "Asset shelf")}</button>
        <button type="button" aria-expanded={mobileToolsOpen} data-testid="studio-bg3d-mobile-more-tools-btn" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 [word-break:keep-all] md:hidden" onClick={() => setMobileToolsOpen((prev) => !prev)}>{mobileToolsOpen ? bi("도구 접기", "Less tools") : bi("도구 더 보기", "More tools")}</button>
        <button type="button" aria-pressed={axis180Locked} data-testid="studio-bg3d-axis180-lock-btn" className={`${mobileToolsOpen ? "inline-flex" : "hidden md:inline-flex"} min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/60 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent motion-reduce:transition-none`} onClick={() => { const next = !axis180Locked; setAxis180Locked(next); setBakeStatusMessage(next ? bi("180° 리버스샷 축 잠금을 켰습니다.", "180° reverse-shot axis locked.") : bi("180° 리버스샷 축 잠금을 풀었습니다.", "180° reverse-shot axis unlocked.")); }}>{bi("180° 잠금", "180° lock")}</button>
        <button type="button" data-testid="studio-bg3d-ground-snap-btn" className={`${mobileToolsOpen ? "inline-flex" : "hidden md:inline-flex"} min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/60 hover:text-fg motion-reduce:transition-none`} onClick={handleTriggerGroundSnap}>{bi("지면 접지 (X)", "Ground snap (X)")}</button>
        <button type="button" aria-pressed={radialPieOpen} data-testid="studio-bg3d-radial-pie-btn" className={`${mobileToolsOpen ? "inline-flex" : "hidden md:inline-flex"} min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/60 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent motion-reduce:transition-none`} onClick={() => setRadialPieOpen((prev) => !prev)}>{bi("3D 파이 메뉴 (Q)", "3D pie menu (Q)")}</button>
        <button type="button" aria-pressed={proStagingOpen} data-testid="studio-bg3d-pro-staging-btn" className={`${mobileToolsOpen ? "inline-flex" : "hidden md:inline-flex"} min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/60 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent motion-reduce:transition-none`} onClick={() => setProStagingOpen((prev) => !prev)}>{bi("연출·조명 도구", "Staging & lights")}</button>
        <div role="group" aria-label={bi("라이브 선화 미리보기 모드", "Live ink preview mode")} className={`${mobileToolsOpen ? "inline-flex" : "hidden md:inline-flex"} flex-wrap items-center gap-1`}>
          {LIVE_INK_MODE_ENTRIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={liveInkMode === entry.id}
              data-bg3d-live-ink-btn={entry.id}
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/60 hover:text-fg aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent aria-pressed:shadow-[inset_2px_0_0_var(--color-accent)] motion-reduce:transition-none"
              onClick={() => handleSelectLiveInkMode(entry.id)}
            >
              {bi(entry.ko, entry.en)}
            </button>
          ))}
          {liveInkMode === "split-wipe" ? (
            <label className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2">
              <span data-testid="studio-bg3d-split-wipe-readout" className="tabular-nums">{`${Math.round(splitWipeRatio * 100)}%`}</span>
              <input type="range" min={0} max={100} step={5} value={Math.round(splitWipeRatio * 100)} aria-label={bi("선화 분할 비교 비율", "Live ink split-wipe ratio")} onChange={(event) => setSplitWipeRatio(clampSplitWipeRatio(Number(event.currentTarget.value) / 100))} className="w-20 accent-accent" />
            </label>
          ) : null}
        </div>
        {onBakeToManuscriptCut || captureSnapshot || onRequestLiveCapture ? (
          <button
            type="button"
            disabled={isLiveCapturing}
            title={isLiveCapturing ? bi("현재 3D 멀티패스 캡처가 끝난 뒤 원고 컷에 구울 수 있습니다.", "Wait for capture to finish before baking.") : bi("현재 3D 장면을 비파괴 레이어로 원고 컷에 바로 굽습니다.", "Bake current 3D view into manuscript cut.")}
            data-testid="studio-bg3d-bake-to-cut"
            onClick={() => void handleBakeToManuscriptCut()}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-accent bg-accent-soft px-3.5 text-xs font-bold text-accent transition-[transform,background-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-accent hover:text-on-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:transform-none"
          >
            {isLiveCapturing ? bi("실캡처 중…", "Capturing…") : bi("원고 컷에 굽기", "Bake to manuscript cut")}
          </button>
        ) : null}
        {bakeStatusMessage ? (
          <span role="status" data-testid="studio-bg3d-bake-status" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2">{bakeStatusMessage}</span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/studio/new?template=webtoon&from=bg3d-cut" className="hidden min-h-11 items-center rounded-lg bg-accent px-3.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2 motion-reduce:transition-none md:inline-flex">{bi("새 웹툰 시작하기", "Start a new webtoon")}</Link>
          <button type="button" className={`${mobileToolsOpen ? "inline-flex" : "hidden md:inline-flex"} min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/60 hover:text-accent motion-reduce:transition-none`} onClick={() => setLayout(DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT)}>{bi("기본 배치", "Reset layout")}</button>
        </div>
      </div>

      <StudioBg3dStageStepperBar
        activeStage={shelfStageToStage3DMode(activeStage)}
        onSelectStage={(stage) => handleSelectShelfStage(stage3DModeToShelfStage(stage))}
        wallCutawayConfig={effectiveWallCutawayConfig}
        onToggleWallCutaway={handleToggleWallCutaway}
        onChangeWallCutawayConfig={handleWallCutawayConfigChange}
        heroCamera={heroCamera}
        sectionCapSummary={sectionCapSummary}
        lastBakedLayer={effectiveLastBakedLayer}
        bakeFlashActive={bakeFlashActive}
        onRestoreReshoot={onRestoreReshootFromBakedLayer}
      />

      <StudioBg3dWebtoonAtmosphereStrip
        variant="toolbar"
        activePresetId={activeAtmosphereId}
        disabled={isLiveCapturing}
        onSelectPreset={handleApplyWebtoonAtmosphere}
      />

      <StudioBg3dHeroCutawaySection
        activeAssetId={activeHeroAssetId}
        camera={heroCamera}
        viewportWidthPx={heroViewportWidthPx}
        deviceMemoryGb={heroDeviceMemoryGb}
        cutawayConfig={effectiveWallCutawayConfig}
        onCutawayConfigChange={handleWallCutawayConfigChange}
        onSelectHeroAsset={handleSelectHeroAsset}
        onWallCutawayChange={onWallCutawayChange}
      />

      {proStagingOpen ? (
        <Suspense fallback={null}>
          <LazyStudioBg3dProStagingDrawer
            axis180Locked={axis180Locked}
            axisSide={axisSide}
            onToggleAxis180Lock={setAxis180Locked}
            onChangeAxisSide={setAxisSide}
            onSelectShotSpec={onSelectReverseShot}
            onGroundSnap={onGroundSnap}
            onTransferPose={onTransferTemplatePose}
            activeAtmosphereId={activeAtmosphereId} targetDocumentId={targetDocumentId} targetCutIndex={targetCutIndex} onBakeToManuscriptCut={onBakeToManuscriptCut}
            onStatusMessage={setBakeStatusMessage}
            onClose={() => setProStagingOpen(false)}
          />
        </Suspense>
      ) : null}

      <div
        data-studio-bg3d-workspace-layout="dockable-v2"
        className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,44dvh)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1 xl:flex xl:flex-row"
        style={workspaceStyle}
      >
        <aside
          className={`${layout.outlinerVisible ? "hidden xl:flex" : "hidden"} min-h-0 shrink-0 flex-col overflow-hidden border-r border-line bg-panel/70 xl:w-[var(--studio-bg3d-outliner-width)]`}
          style={{ order: "var(--studio-bg3d-outliner-order)" }}
        >
          {outliner}
        </aside>
        {layout.outlinerVisible ? renderSeparator("outliner") : null}
        <div
          data-bg3d-professional-viewport="true"
          data-bg3d-live-ink-mode={liveInkMode}
          data-bg3d-split-wipe-ratio={splitWipeRatio}
          data-bg3d-axis180-locked={axis180Locked ? "true" : "false"}
          className="contents xl:relative xl:flex xl:min-h-0 xl:min-w-0 xl:flex-1"
          style={{ order: "var(--studio-bg3d-viewport-order)" }}
        >
          {liveInkMode === "split-wipe" ? (
            <Suspense fallback={viewport}>
              <LazyStudioSplitWipeOverlay
                ratio={splitWipeRatio}
                onRatioChange={(next) => setSplitWipeRatio(clampSplitWipeRatio(next))}
                leftLabel={bi("3D 음영", "3D shaded")}
                rightLabel={bi("라이브 선화", "Live ink")}
                leftContent={
                  captureSnapshot?.shadedPassRef ? (
                    <div className="relative h-full w-full">
                      {viewport}
                      <img
                        src={captureSnapshot.shadedPassRef}
                        alt={bi("캡처된 3D 음영 프레임", "Captured 3D shaded frame")}
                        data-testid="studio-bg3d-shaded-pass-image"
                        className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-95 select-none"
                        draggable={false}
                      />
                    </div>
                  ) : (
                    viewport
                  )
                }
                rightContent={
                  <StudioBg3dLiveInkStagePane
                    mode="split-wipe"
                    captureSnapshot={captureSnapshot}
                    isCapturing={isLiveCapturing}
                    onRequestCapture={onRequestLiveCapture ? () => triggerLiveCaptureIfNeeded("live-ink") : undefined}
                  />
                }
                className="h-full min-h-0 w-full flex-1"
              />
            </Suspense>
          ) : liveInkMode === "live-ink-only" ? (
            <div className="relative flex h-full min-h-0 w-full flex-1">
              <div className="pointer-events-none absolute inset-0 opacity-0" aria-hidden>{viewport}</div>
              <StudioBg3dLiveInkStagePane
                mode="live-ink-only"
                captureSnapshot={captureSnapshot}
                isCapturing={isLiveCapturing}
                onRequestCapture={onRequestLiveCapture ? () => triggerLiveCaptureIfNeeded("live-ink") : undefined}
              />
            </div>
          ) : (
            viewport
          )}
          {bakeFlashActive ? (
            <div
              aria-hidden
              data-testid="studio-bg3d-bake-shutter-flash"
              className="pointer-events-none absolute inset-0 z-30 opacity-85 transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:hidden"
              style={{
                background:
                  "radial-gradient(circle at center, color-mix(in oklch, var(--color-accent) 26%, transparent), color-mix(in oklch, var(--color-cool) 16%, transparent) 55%, transparent 80%)",
              }}
            />
          ) : null}
        </div>
        {layout.inspectorVisible ? renderSeparator("inspector") : null}
        <div
          data-bg3d-professional-inspector="true"
          className={`${layout.inspectorVisible ? "contents xl:flex" : "contents xl:hidden"} xl:min-h-0 xl:shrink-0 xl:overflow-hidden xl:w-[var(--studio-bg3d-inspector-width)]`}
          style={{ order: "var(--studio-bg3d-inspector-order)" }}
        >
          {inspector}
        </div>
      </div>

      {radialPieOpen ? (
        <Suspense fallback={null}>
          <LazyStudio3dRadialPieMenu
            open={radialPieOpen}
            menuId="mode"
            origin={{ x: 280, y: 260 }}
            onSelectAction={(item) => {
              setBakeStatusMessage(bi(`3D 파이 메뉴 실행: ${item.labelKo}`, `3D pie action: ${item.labelKo}`));
            }}
            onClose={() => setRadialPieOpen(false)}
          />
        </Suspense>
      ) : null}

      {assetShelfOpen ? (
        <StudioBg3dAssetShelf
          activeStage={activeStage}
          onSelectStage={handleSelectShelfStage}
          placedAssetIds={placedShelfAssetIds}
          onInsertAsset={handleInsertShelfAsset}
          onBakeToManuscriptCut={() => void handleBakeToManuscriptCut()}
          onClose={() => setAssetShelfOpen(false)}
        />
      ) : null}
    </div>
  );
}
