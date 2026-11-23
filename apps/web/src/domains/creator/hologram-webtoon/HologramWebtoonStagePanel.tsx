import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  Compass,
  Eye,
  Glasses,
  Grid3x3,
  Layers,
  PauseCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { HologramStageInspector } from "./HologramStageInspector";
import { HologramStageTheater } from "./HologramStageTheater";
import {
  HOLOGRAM_DEMO_SCENES,
  buildManifestFromScene,
  findHologramDemoScene,
  type HologramDemoSceneId,
} from "./hologram-demo-scenes";
import {
  DEFAULT_HOLOGRAM_PLANE_DEPTHS_MM,
  DEFAULT_HOLOGRAM_VIEWER_POSE,
  computeHologramLayerTransforms,
  computeStereoEyePoses,
  generateQuiltViewCameraArray,
  serializeHologramManifest,
  type HologramLayerSpec,
  type HologramPlaneRole,
  type HologramViewMode,
  type HologramViewerPose,
  type HologramWebtoonManifest,
} from "./hologram-spatial-projection";
import "./hologram-webtoon-stage.css";

interface NavigatorWithXr {
  readonly xr?: {
    readonly isSessionSupported?: (mode: string) => Promise<boolean>;
  };
}

export interface HologramWebtoonStagePanelProps {
  readonly initialSceneId?: HologramDemoSceneId;
  readonly initialViewMode?: HologramViewMode;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onExportManifest?: (json: string, manifest: HologramWebtoonManifest) => void;
}

const EYE_X_LIMIT_MM = 160;
const EYE_Y_LIMIT_MM = 110;
const KEYBOARD_STEP_X_MM = 16;
const KEYBOARD_STEP_Y_MM = 14;
const QUILT_COLS = 4;
const QUILT_ROWS = 8;
const QUILT_VIEW_CONE_DEG = 40;
const COMFORT_DISPARITY_LIMIT_DEG = 2.5;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return reduced;
}

function downloadManifestFile(filename: string, content: string): boolean {
  if (
    typeof document === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return false;
  }
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(objectUrl);
  }
  return true;
}

export function HologramWebtoonStagePanel({
  initialSceneId = "neon-rooftop-action",
  initialViewMode = "off-axis",
  locale: localeProp,
  className,
  onExportManifest,
}: HologramWebtoonStagePanelProps): React.JSX.Element {
  const instanceId = useId();
  const globalLang = useI18n((state) => state.lang);
  const tBilingual = useBilingual("hologram-webtoon-stage");
  const resolvedLocale: "ko" | "en" =
    localeProp ?? (globalLang.toLowerCase().startsWith("ko") ? "ko" : "en");

  const text = useCallback(
    (ko: string, en: string): string => {
      if (localeProp !== undefined) {
        return localeProp === "ko" ? ko : en;
      }
      return tBilingual(ko, en);
    },
    [localeProp, tBilingual],
  );

  const systemReducedMotion = useSystemReducedMotion();
  const [manualFlatMode, setManualFlatMode] = useState(false);
  const effectiveReducedMotion = systemReducedMotion || manualFlatMode;

  const [sceneId, setSceneId] = useState<HologramDemoSceneId>(initialSceneId);
  const [viewMode, setViewMode] = useState<HologramViewMode>(initialViewMode);
  const [depthsByRole, setDepthsByRole] = useState<Record<HologramPlaneRole, number>>({
    ...DEFAULT_HOLOGRAM_PLANE_DEPTHS_MM,
  });
  const [viewerPose, setViewerPose] = useState<HologramViewerPose>(DEFAULT_HOLOGRAM_VIEWER_POSE);
  const [ipdMm, setIpdMm] = useState(63);
  const [holofoilIntensity, setHolofoilIntensity] = useState(
    () => findHologramDemoScene(initialSceneId).defaultHolofoilIntensity,
  );
  const [depthOfFieldStrength, setDepthOfFieldStrength] = useState(
    () => findHologramDemoScene(initialSceneId).defaultDepthOfFieldStrength,
  );
  const [clampComfortZone, setClampComfortZone] = useState(true);
  const [gazeSimulationActive, setGazeSimulationActive] = useState(false);
  const [selectedQuiltIndex, setSelectedQuiltIndex] = useState(16);
  const [showManifestPreview, setShowManifestPreview] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [xrHardwareReady, setXrHardwareReady] = useState<boolean | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);

  const activeScene = useMemo(() => findHologramDemoScene(sceneId), [sceneId]);

  const activeLayers: readonly HologramLayerSpec[] = useMemo(
    () =>
      activeScene.layers.map((layer) => ({
        ...layer,
        zMm: depthsByRole[layer.role],
      })),
    [activeScene, depthsByRole],
  );

  useEffect(() => {
    let active = true;
    const nav = typeof navigator !== "undefined" ? (navigator as NavigatorWithXr) : undefined;
    const probe = nav?.xr?.isSessionSupported;
    if (typeof probe !== "function") {
      setXrHardwareReady(false);
      return;
    }
    void probe("immersive-vr")
      .then((supported) => {
        if (active) setXrHardwareReady(Boolean(supported));
      })
      .catch(() => {
        if (active) setXrHardwareReady(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!gazeSimulationActive || effectiveReducedMotion) return;
    if (typeof window === "undefined") return;

    let rafId = 0;
    const startMs = performance.now();

    const tick = (nowMs: number): void => {
      const elapsedSec = (nowMs - startMs) / 1000;
      setViewerPose((prev) => ({
        ...prev,
        eyeXMm: Math.round(Math.sin(elapsedSec * 1.05) * 118),
        eyeYMm: Math.round(Math.sin(elapsedSec * 1.65) * 56),
      }));
      rafId = window.requestAnimationFrame(tick);
    };

    const handleDeviceOrientation = (event: DeviceOrientationEvent): void => {
      if (typeof event.gamma !== "number" || typeof event.beta !== "number") return;
      const mappedX = clampNumber((event.gamma / 30) * EYE_X_LIMIT_MM, -EYE_X_LIMIT_MM, EYE_X_LIMIT_MM);
      const mappedY = clampNumber(((event.beta - 45) / 30) * EYE_Y_LIMIT_MM, -EYE_Y_LIMIT_MM, EYE_Y_LIMIT_MM);
      setViewerPose((prev) => ({
        ...prev,
        eyeXMm: Math.round(mappedX),
        eyeYMm: Math.round(mappedY),
      }));
    };

    rafId = window.requestAnimationFrame(tick);
    window.addEventListener("deviceorientation", handleDeviceOrientation);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("deviceorientation", handleDeviceOrientation);
    };
  }, [gazeSimulationActive, effectiveReducedMotion]);

  const effectivePose: HologramViewerPose = effectiveReducedMotion
    ? DEFAULT_HOLOGRAM_VIEWER_POSE
    : viewerPose;

  const projectionConfig = useMemo(
    () => ({
      ipdMm,
      maxComfortDisparityDeg: COMFORT_DISPARITY_LIMIT_DEG,
      holofoilIntensity,
      depthOfFieldStrength,
      reducedMotion: effectiveReducedMotion,
      clampComfortZone,
    }),
    [ipdMm, holofoilIntensity, depthOfFieldStrength, effectiveReducedMotion, clampComfortZone],
  );

  const mainProjection = useMemo(
    () => computeHologramLayerTransforms(activeLayers, effectivePose, projectionConfig),
    [activeLayers, effectivePose, projectionConfig],
  );

  const stereoPoses = useMemo(
    () =>
      computeStereoEyePoses(effectivePose, ipdMm, {
        maxComfortDisparityDeg: COMFORT_DISPARITY_LIMIT_DEG,
        layers: activeLayers,
      }),
    [effectivePose, ipdMm, activeLayers],
  );

  const leftEyeProjection = useMemo(
    () =>
      computeHologramLayerTransforms(activeLayers, stereoPoses.leftEye, {
        ...projectionConfig,
        viewportWidthPx: viewMode === "stereo-sbs" ? 320 : 640,
      }),
    [activeLayers, stereoPoses.leftEye, projectionConfig, viewMode],
  );

  const rightEyeProjection = useMemo(
    () =>
      computeHologramLayerTransforms(activeLayers, stereoPoses.rightEye, {
        ...projectionConfig,
        viewportWidthPx: viewMode === "stereo-sbs" ? 320 : 640,
      }),
    [activeLayers, stereoPoses.rightEye, projectionConfig, viewMode],
  );

  const quiltArray = useMemo(
    () =>
      generateQuiltViewCameraArray(QUILT_COLS, QUILT_ROWS, QUILT_VIEW_CONE_DEG, {
        cameraDistanceMm: effectivePose.eyeZMm,
      }),
    [effectivePose.eyeZMm],
  );

  const selectedQuiltView = quiltArray.views[selectedQuiltIndex] ?? quiltArray.views[0];

  const quiltSelectedProjection = useMemo(
    () =>
      computeHologramLayerTransforms(
        activeLayers,
        {
          eyeXMm: selectedQuiltView.cameraPositionMm.x,
          eyeYMm: 0,
          eyeZMm: selectedQuiltView.cameraPositionMm.z,
        },
        {
          ...projectionConfig,
          viewportWidthPx: 320,
          viewportHeightPx: 220,
        },
      ),
    [activeLayers, selectedQuiltView, projectionConfig],
  );

  const manifestObject = useMemo(
    () =>
      buildManifestFromScene({
        scene: activeScene,
        layers: activeLayers,
        eyeZMm: DEFAULT_HOLOGRAM_VIEWER_POSE.eyeZMm,
        ipdMm,
        maxComfortDisparityDeg: COMFORT_DISPARITY_LIMIT_DEG,
        holofoilIntensity,
        depthOfFieldStrength,
        quiltCols: QUILT_COLS,
        quiltRows: QUILT_ROWS,
        quiltViewConeDeg: QUILT_VIEW_CONE_DEG,
        createdAtIso: "2026-11-23T00:00:00.000Z",
      }),
    [activeScene, activeLayers, ipdMm, holofoilIntensity, depthOfFieldStrength],
  );

  const serializedManifest = useMemo(
    () => serializeHologramManifest(manifestObject),
    [manifestObject],
  );

  const handleSelectScene = useCallback((nextSceneId: HologramDemoSceneId) => {
    const preset = findHologramDemoScene(nextSceneId);
    setSceneId(nextSceneId);
    setHolofoilIntensity(preset.defaultHolofoilIntensity);
    setDepthOfFieldStrength(preset.defaultDepthOfFieldStrength);
    setDepthsByRole({ ...DEFAULT_HOLOGRAM_PLANE_DEPTHS_MM });
    setExportNotice(null);
  }, []);

  const updatePoseFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (effectiveReducedMotion || gazeSimulationActive) return;
      const stageEl = stageRef.current;
      if (!stageEl) return;
      const rect = stageEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const normX = clampNumber(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      const normY = clampNumber(((clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
      setViewerPose((prev) => ({
        ...prev,
        eyeXMm: Math.round(normX * EYE_X_LIMIT_MM),
        eyeYMm: Math.round(normY * EYE_Y_LIMIT_MM),
      }));
    },
    [effectiveReducedMotion, gazeSimulationActive],
  );

  const handleStagePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      updatePoseFromClientPoint(event.clientX, event.clientY);
    },
    [updatePoseFromClientPoint],
  );

  const handleStagePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      updatePoseFromClientPoint(event.clientX, event.clientY);
    },
    [updatePoseFromClientPoint],
  );

  const handleStageKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (effectiveReducedMotion) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setGazeSimulationActive(false);
        setViewerPose((prev) => ({
          ...prev,
          eyeXMm: clampNumber(prev.eyeXMm - KEYBOARD_STEP_X_MM, -EYE_X_LIMIT_MM, EYE_X_LIMIT_MM),
        }));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setGazeSimulationActive(false);
        setViewerPose((prev) => ({
          ...prev,
          eyeXMm: clampNumber(prev.eyeXMm + KEYBOARD_STEP_X_MM, -EYE_X_LIMIT_MM, EYE_X_LIMIT_MM),
        }));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setGazeSimulationActive(false);
        setViewerPose((prev) => ({
          ...prev,
          eyeYMm: clampNumber(prev.eyeYMm - KEYBOARD_STEP_Y_MM, -EYE_Y_LIMIT_MM, EYE_Y_LIMIT_MM),
        }));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setGazeSimulationActive(false);
        setViewerPose((prev) => ({
          ...prev,
          eyeYMm: clampNumber(prev.eyeYMm + KEYBOARD_STEP_Y_MM, -EYE_Y_LIMIT_MM, EYE_Y_LIMIT_MM),
        }));
      } else if (event.key === "Home" || event.key === "0") {
        event.preventDefault();
        setGazeSimulationActive(false);
        setViewerPose(DEFAULT_HOLOGRAM_VIEWER_POSE);
      }
    },
    [effectiveReducedMotion],
  );

  const handleRecenter = useCallback(() => {
    setGazeSimulationActive(false);
    setViewerPose(DEFAULT_HOLOGRAM_VIEWER_POSE);
  }, []);

  const handleToggleFlatMode = useCallback(() => {
    setManualFlatMode((prev) => {
      const next = !prev;
      if (next) setGazeSimulationActive(false);
      return next;
    });
  }, []);

  const handleDepthChange = useCallback((role: HologramPlaneRole, nextDepthMm: number) => {
    setDepthsByRole((prev) => ({
      ...prev,
      [role]: clampNumber(nextDepthMm, -180, 180),
    }));
  }, []);

  const handleResetDepths = useCallback(() => {
    setDepthsByRole({ ...DEFAULT_HOLOGRAM_PLANE_DEPTHS_MM });
  }, []);

  const handleExportManifest = useCallback(() => {
    const filename = `${activeScene.id}.toon-holo.json`;
    downloadManifestFile(filename, serializedManifest);
    onExportManifest?.(serializedManifest, manifestObject);
    setExportNotice(
      text(
        `${filename} 매니페스트를 내보냈습니다 (${activeLayers.length}개 평면 · 32-뷰 Quilt).`,
        `Exported ${filename} (${activeLayers.length} planes · 32-view Quilt).`,
      ),
    );
  }, [activeScene.id, serializedManifest, onExportManifest, manifestObject, text, activeLayers.length]);

  const viewModeTabs: readonly {
    readonly id: HologramViewMode;
    readonly ko: string;
    readonly en: string;
    readonly icon: React.JSX.Element;
  }[] = [
    {
      id: "off-axis",
      ko: "홀로그램 프리즘 (2.5D Off-Axis)",
      en: "Hologram Prism (2.5D Off-Axis)",
      icon: <Layers size={15} aria-hidden="true" />,
    },
    {
      id: "stereo-sbs",
      ko: "WebXR 좌·우안 스테레오 (SBS)",
      en: "WebXR Stereo (SBS)",
      icon: <Glasses size={15} aria-hidden="true" />,
    },
    {
      id: "anaglyph",
      ko: "애너글리프 입체 (3D)",
      en: "Anaglyph 3D",
      icon: <Eye size={15} aria-hidden="true" />,
    },
    {
      id: "quilt-32",
      ko: "라이트필드 Quilt 32-뷰 프리뷰",
      en: "Lightfield Quilt 32-View",
      icon: <Grid3x3 size={15} aria-hidden="true" />,
    },
  ];

  const comfortTone =
    mainProjection.comfortStatus === "clamped"
      ? "bad"
      : mainProjection.comfortStatus === "caution"
        ? "warn"
        : "good";

  const comfortLabel =
    mainProjection.comfortStatus === "clamped"
      ? text("자동 제한 적용", "Guard clamped")
      : mainProjection.comfortStatus === "caution"
        ? text("주의 구간", "Near limit")
        : text("안전 시차", "Comfort safe");

  return (
    <section
      className={className ? `holo-stage-root ${className}` : "holo-stage-root"}
      data-testid="hologram-webtoon-stage-panel"
      data-reduced-motion={effectiveReducedMotion ? "true" : "false"}
      data-view-mode={viewMode}
      data-scene-id={activeScene.id}
      aria-labelledby={`${instanceId}-heading`}
    >
      <header className="holo-stage-header">
        <div className="holo-stage-title-group">
          <span className="holo-stage-kicker">
            <Sparkles size={13} aria-hidden="true" />
            {text("ToonStudio 공간 웹툰 엔진", "ToonStudio Spatial Webtoon Engine")}
          </span>
          <h2 id={`${instanceId}-heading`} className="holo-stage-title">
            {text("홀로그램 5-평면 공간 웹툰 스테이지", "Holographic 5-Plane Spatial Webtoon Stage")}
          </h2>
          <p className="holo-stage-subtitle">
            {text(
              "배경·중경·캐릭터·이펙트·말풍선 5개 레이어를 오프액시스 투영, WebXR 양안 스테레오(IPD), Looking Glass Quilt 32-뷰로 실시간 검증합니다.",
              "Inspect background, midground, character, FX, and balloon planes with real-time off-axis projection, WebXR stereo IPD, and Looking Glass 32-view Quilt lightfield.",
            )}
          </p>
        </div>

        <div className="holo-status-row">
          <span className="holo-badge" data-tone={xrHardwareReady ? "good" : "accent"}>
            {xrHardwareReady
              ? text("WebXR 헤드셋 연결 가능", "WebXR headset ready")
              : text("2.5D 오프액시스 프리뷰", "2.5D off-axis preview")}
          </span>
          <span className="holo-badge" data-tone={comfortTone}>
            <ShieldCheck size={13} aria-hidden="true" />
            {comfortLabel} · {mainProjection.effectiveMaxDisparityDeg.toFixed(2)}°
          </span>
          {effectiveReducedMotion ? (
            <span className="holo-badge" data-tone="warn" data-testid="holo-reduced-motion-badge">
              <PauseCircle size={13} aria-hidden="true" />
              {text("모션 줄이기 평면 모드", "Reduced-motion flat mode")}
            </span>
          ) : null}
        </div>
      </header>

      <div className="holo-toolbar">
        <div
          className="holo-preset-group"
          role="group"
          aria-label={text("데모 씬 프리셋", "Demo scene presets")}
        >
          {HOLOGRAM_DEMO_SCENES.map((preset) => {
            const selected = preset.id === activeScene.id;
            return (
              <button
                key={preset.id}
                type="button"
                className="holo-pill-button"
                aria-pressed={selected}
                data-testid={`holo-scene-preset-${preset.id}`}
                onClick={() => handleSelectScene(preset.id)}
              >
                <span>{resolvedLocale === "ko" ? preset.titleKo : preset.titleEn}</span>
              </button>
            );
          })}
        </div>

        <div
          className="holo-mode-tablist"
          role="tablist"
          aria-label={text("홀로그램 뷰 모드", "Hologram view modes")}
        >
          {viewModeTabs.map((tab) => {
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                id={`${instanceId}-tab-${tab.id}`}
                type="button"
                role="tab"
                className="holo-pill-button"
                aria-selected={active}
                aria-controls={`${instanceId}-tabpanel`}
                data-testid={`holo-mode-tab-${tab.id}`}
                onClick={() => setViewMode(tab.id)}
              >
                {tab.icon}
                <span>{text(tab.ko, tab.en)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="holo-workspace-grid">
        <div className="holo-theater-column">
          <HologramStageTheater
            instanceId={instanceId}
            stageRef={stageRef}
            viewMode={viewMode}
            activeScene={activeScene}
            activeLayers={activeLayers}
            resolvedLocale={resolvedLocale}
            text={text}
            effectivePose={effectivePose}
            effectiveReducedMotion={effectiveReducedMotion}
            holofoilIntensity={holofoilIntensity}
            ipdMm={ipdMm}
            mainProjection={mainProjection}
            stereoPoses={stereoPoses}
            leftEyeProjection={leftEyeProjection}
            rightEyeProjection={rightEyeProjection}
            quiltArray={quiltArray}
            selectedQuiltView={selectedQuiltView}
            quiltSelectedProjection={quiltSelectedProjection}
            onSelectQuiltIndex={setSelectedQuiltIndex}
            onPointerMove={handleStagePointerMove}
            onPointerDown={handleStagePointerDown}
            onKeyDown={handleStageKeyDown}
          />

          <div className="holo-stage-controls-bar">
            <div className="holo-stage-controls-actions">
              <button
                type="button"
                className="holo-action-button"
                aria-pressed={gazeSimulationActive && !effectiveReducedMotion}
                disabled={effectiveReducedMotion}
                data-testid="holo-gaze-sim-toggle"
                onClick={() => setGazeSimulationActive((prev) => !prev)}
              >
                <Compass size={15} aria-hidden="true" />
                {gazeSimulationActive && !effectiveReducedMotion
                  ? text("자이로·시선 시뮬레이션 중지", "Stop gyro/gaze simulation")
                  : text("자이로·시선 시뮬레이션", "Gyro/gaze simulation")}
              </button>

              <button
                type="button"
                className="holo-action-button"
                data-testid="holo-recenter-btn"
                onClick={handleRecenter}
              >
                <RotateCcw size={15} aria-hidden="true" />
                {text("시점 중앙 정렬", "Recenter view")}
              </button>

              <button
                type="button"
                className="holo-action-button"
                aria-pressed={effectiveReducedMotion}
                data-testid="holo-flat-mode-toggle"
                onClick={handleToggleFlatMode}
              >
                <PauseCircle size={15} aria-hidden="true" />
                {effectiveReducedMotion
                  ? text("평면 안전 모드 켜짐", "Flat safe mode on")
                  : text("평면 안전 모드", "Flat safe mode")}
              </button>
            </div>

            <p className="holo-stage-hint">
              {effectiveReducedMotion
                ? text(
                    "모션 줄이기가 활성화되어 모든 평면을 2D 안전 평면으로 고정했습니다.",
                    "Reduced motion is active; all planes stay locked in flat safe mode.",
                  )
                : text(
                    "스테이지 위에서 포인터를 움직이거나 방향키(←↑↓→)·Home 키로 시차를 탐색하세요.",
                    "Move pointer over the stage or use arrow keys and Home to inspect parallax.",
                  )}
            </p>
          </div>
        </div>

        <HologramStageInspector
          instanceId={instanceId}
          resolvedLocale={resolvedLocale}
          text={text}
          activeLayers={activeLayers}
          mainProjection={mainProjection}
          holofoilIntensity={holofoilIntensity}
          depthOfFieldStrength={depthOfFieldStrength}
          ipdMm={ipdMm}
          clampComfortZone={clampComfortZone}
          comfortDisparityLimitDeg={COMFORT_DISPARITY_LIMIT_DEG}
          showManifestPreview={showManifestPreview}
          serializedManifest={serializedManifest}
          exportNotice={exportNotice}
          onDepthChange={handleDepthChange}
          onResetDepths={handleResetDepths}
          onHolofoilChange={setHolofoilIntensity}
          onDepthOfFieldChange={setDepthOfFieldStrength}
          onIpdChange={setIpdMm}
          onToggleComfortGuard={() => setClampComfortZone((prev) => !prev)}
          onExportManifest={handleExportManifest}
          onToggleManifestPreview={() => setShowManifestPreview((prev) => !prev)}
        />
      </div>
    </section>
  );
}

export default HologramWebtoonStagePanel;
