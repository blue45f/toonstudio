/**
 * 3D 실루엣·크리즈 → 크리에이터 개인 G펜 벡터 잉크 투영 패널.
 * Calm Atelier / Studio 시맨틱 토큰 전용 · props 없이 단독 렌더링 · KO/EN.
 */

import {
  Box,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Eye,
  Layers,
  PenTool,
  RotateCcw,
  Sliders,
  Sun,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import { useI18n } from "@/shared/lib/i18n";

import { createMeshPreset, MESH_PRESET_IDS } from "./mesh-presets";
import type {
  CreatorGpenProfile,
  GpenStyleId,
  IndexedTriangleMesh,
  MeshPresetId,
  VectorInkProjectionResult,
  VectorInkSvgExport,
} from "./types";
import {
  createKeyLightDirection,
  exportVectorInkSvg,
  getGpenStyleProfile,
  GPEN_STYLE_IDS,
  projectMeshToVectorInk,
} from "./vector-ink-projection-engine";
import { buildGpenNibPreviewPath, drawVectorInkViewport } from "./vector-ink-canvas-renderer";

export interface StudioVectorInkProjectionPanelProps {
  readonly initialMeshId?: MeshPresetId;
  readonly initialStyleId?: GpenStyleId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onExportVectorLayer?: (exported: VectorInkSvgExport) => void;
}

type ExportPreviewTab = "none" | "svg" | "json";

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 360;
const DEFAULT_CREASE_ANGLE_DEG = 32;
const DEFAULT_LIGHT_AZIMUTH_DEG = -42;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_CHOICE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const meshCache = new Map<MeshPresetId, IndexedTriangleMesh>();

function getCachedMesh(id: MeshPresetId): IndexedTriangleMesh {
  const existing = meshCache.get(id);
  if (existing) return existing;
  const built = createMeshPreset(id);
  meshCache.set(id, built);
  return built;
}

function formatSignedDeg(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}°` : `${rounded}°`;
}

function SliderControl({
  id,
  testId,
  label,
  valueDisplay,
  min,
  max,
  step,
  value,
  onChange,
}: {
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly valueDisplay: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onChange: (next: number) => void;
}): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-medium text-fg-2">
          {label}
        </label>
        <span className="font-semibold text-fg tabular-nums">{valueDisplay}</span>
      </div>
      <input
        id={id}
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

/** 3D 실루엣·크리즈 → 크리에이터 개인 G펜 벡터 잉크 투영 단독 패널. */
export function StudioVectorInkProjectionPanel({
  initialMeshId = "hero-bust",
  initialStyleId = "webtoon-gpen",
  locale,
  className,
  onExportVectorLayer,
}: StudioVectorInkProjectionPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const initialMesh = getCachedMesh(initialMeshId);
  const initialStyle = getGpenStyleProfile(initialStyleId);

  const [meshId, setMeshId] = useState<MeshPresetId>(initialMeshId);
  const [styleId, setStyleId] = useState<GpenStyleId>(initialStyleId);
  const [yawDeg, setYawDeg] = useState<number>(initialMesh.defaultCamera.yawDeg);
  const [pitchDeg, setPitchDeg] = useState<number>(initialMesh.defaultCamera.pitchDeg);
  const [creaseAngleDeg, setCreaseAngleDeg] = useState<number>(DEFAULT_CREASE_ANGLE_DEG);
  const [shadowWeightPct, setShadowWeightPct] = useState<number>(
    Math.round(initialStyle.shadowSideThickening * 100),
  );
  const [baseWidthPx, setBaseWidthPx] = useState<number>(initialStyle.baseWidthPx);
  const [lightAzimuthDeg, setLightAzimuthDeg] = useState<number>(DEFAULT_LIGHT_AZIMUTH_DEG);
  const [showBezierGuides, setShowBezierGuides] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<ExportPreviewTab>("none");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragOriginRef = useRef<{
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly startYaw: number;
    readonly startPitch: number;
  } | null>(null);

  const activeMesh = useMemo<IndexedTriangleMesh>(() => getCachedMesh(meshId), [meshId]);

  const effectiveProfile = useMemo<CreatorGpenProfile>(() => {
    const preset = getGpenStyleProfile(styleId);
    return {
      ...preset,
      baseWidthPx,
      shadowSideThickening: shadowWeightPct / 100,
    };
  }, [baseWidthPx, shadowWeightPct, styleId]);

  const projection = useMemo<VectorInkProjectionResult>(() => {
    const keyLightDirection = createKeyLightDirection(lightAzimuthDeg, 46);
    return projectMeshToVectorInk({
      mesh: activeMesh,
      camera: {
        yawDeg,
        pitchDeg,
        distance: activeMesh.defaultCamera.distance,
        fovDeg: activeMesh.defaultCamera.fovDeg,
        viewportWidth: CANVAS_WIDTH,
        viewportHeight: CANVAS_HEIGHT,
        target: activeMesh.defaultCamera.target,
      },
      keyLightDirection,
      creaseAngleDeg,
      gpenProfile: effectiveProfile,
    });
  }, [activeMesh, creaseAngleDeg, effectiveProfile, lightAzimuthDeg, pitchDeg, yawDeg]);

  const exportedVector = useMemo<VectorInkSvgExport>(
    () => exportVectorInkSvg(projection, { includeEditableBezierGuides: true }),
    [projection],
  );

  const nibPreviewPathD = useMemo<string>(
    () => buildGpenNibPreviewPath(effectiveProfile),
    [effectiveProfile],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawVectorInkViewport(canvas, projection, showBezierGuides);
  }, [projection, showBezierGuides]);

  const handleSelectMesh = useCallback(
    (nextId: MeshPresetId) => {
      const nextMesh = getCachedMesh(nextId);
      setMeshId(nextId);
      setYawDeg(nextMesh.defaultCamera.yawDeg);
      setPitchDeg(nextMesh.defaultCamera.pitchDeg);
      setStatusMessage(
        isEn
          ? `Switched 3D subject to "${nextMesh.labelEn}".`
          : `3D 대상을 "${nextMesh.labelKo}" 메시로 전환했습니다.`,
      );
    },
    [isEn],
  );

  const handleSelectStyle = useCallback(
    (nextStyleId: GpenStyleId) => {
      const nextStyle = getGpenStyleProfile(nextStyleId);
      setStyleId(nextStyleId);
      setBaseWidthPx(nextStyle.baseWidthPx);
      setShadowWeightPct(Math.round(nextStyle.shadowSideThickening * 100));
      setStatusMessage(
        isEn
          ? `Applied "${nextStyle.labelEn}" pressure-taper curve.`
          : `"${nextStyle.labelKo}" 필압·테이퍼 곡선을 적용했습니다.`,
      );
    },
    [isEn],
  );

  const handleReset = useCallback(() => {
    const baseMesh = getCachedMesh(initialMeshId);
    const baseStyle = getGpenStyleProfile(initialStyleId);
    setMeshId(initialMeshId);
    setStyleId(initialStyleId);
    setYawDeg(baseMesh.defaultCamera.yawDeg);
    setPitchDeg(baseMesh.defaultCamera.pitchDeg);
    setCreaseAngleDeg(DEFAULT_CREASE_ANGLE_DEG);
    setShadowWeightPct(Math.round(baseStyle.shadowSideThickening * 100));
    setBaseWidthPx(baseStyle.baseWidthPx);
    setLightAzimuthDeg(DEFAULT_LIGHT_AZIMUTH_DEG);
    setShowBezierGuides(false);
    setPreviewTab("none");
    setStatusMessage(
      isEn ? "Reset camera, crease, and G-Pen parameters." : "카메라·크리즈·G펜 설정을 기본값으로 되돌렸습니다.",
    );
  }, [initialMeshId, initialStyleId, isEn]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragOriginRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startYaw: yawDeg,
      startPitch: pitchDeg,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const dx = event.clientX - origin.startX;
    const dy = event.clientY - origin.startY;
    const nextYaw = Math.max(-180, Math.min(180, Math.round(origin.startYaw + dx * 0.45)));
    const nextPitch = Math.max(-60, Math.min(60, Math.round(origin.startPitch + dy * 0.35)));
    setYawDeg(nextYaw);
    setPitchDeg(nextPitch);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (dragOriginRef.current?.pointerId === event.pointerId) {
      dragOriginRef.current = null;
    }
  };

  const handleExportSvg = (): void => {
    onExportVectorLayer?.(exportedVector);
    setPreviewTab("svg");
    const isJsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
    if (!isJsdom && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      try {
        const blob = new Blob([exportedVector.svgMarkup], { type: "image/svg+xml;charset=utf-8" });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = `toonstudio-vector-ink-${meshId}-${styleId}.svg`;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
      } catch {
        // 헤드리스/테스트 환경에서는 인라인 SVG 미리보기와 콜백 전달로 대체
      }
    }
    setStatusMessage(
      isEn
        ? `Exported SVG vector layer (${exportedVector.pathCount} G-Pen paths, ${exportedVector.byteLength} B).`
        : `SVG 벡터 레이어(${exportedVector.pathCount}획 · ${exportedVector.byteLength} B)를 생성했습니다.`,
    );
  };

  const handleCopyPayload = (): void => {
    const text = previewTab === "json" ? exportedVector.layerJson : exportedVector.svgMarkup;
    const label = previewTab === "json" ? "JSON" : "SVG";
    if (globalThis.navigator?.clipboard?.writeText) {
      void globalThis.navigator.clipboard.writeText(text);
    }
    setStatusMessage(
      isEn
        ? `Copied ${label} vector layer payload to clipboard.`
        : `${label} 벡터 레이어 코드를 클립보드에 복사했습니다.`,
    );
  };

  return (
    <section
      data-testid="studio-vector-ink-projection-panel"
      aria-label={pick("3D 실루엣·크리즈 G펜 벡터 잉크 투영", "3D Silhouette & Crease G-Pen Vector Ink Projection")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <PenTool className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("3D 실루엣·크리즈 G펜 벡터 잉크 투영", "3D Silhouette & Crease → G-Pen Vector Ink")}
            </h2>
            <span
              data-testid="vector-ink-summary-badge"
              className="inline-flex items-center gap-1 rounded-full border border-good/40 bg-good-soft px-2.5 py-0.5 text-xs font-semibold text-good tabular-nums"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {pick(
                `${projection.stats.polylineCount}획 · 베지어 ${projection.stats.bezierSegmentCount}구간`,
                `${projection.stats.polylineCount} strokes · ${projection.stats.bezierSegmentCount} Bezier segs`,
              )}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "3D 메시 외곽선과 크리즈를 크리에이터 G펜 필압·그림자 강약이 실린 편집 가능한 큐빅 베지어 선화로 투영합니다.",
              "Projects 3D silhouettes and sharp creases into editable cubic Bezier vector strokes with G-Pen taper and shadow weight.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="vector-ink-reset-btn"
            onClick={handleReset}
            className={`${BTN_CHOICE} ${BTN_IDLE}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("초기화", "Reset")}</span>
          </button>
          <button
            type="button"
            data-testid="vector-ink-export-svg-btn"
            onClick={handleExportSvg}
            className={BTN_PRIMARY}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("SVG 내보내기", "Export SVG")}</span>
          </button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="space-y-3 rounded-lg border border-line bg-card p-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Box className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("실시간 3D → G펜 벡터 뷰포트", "Live 3D → G-Pen Vector Viewport")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-fg-2 tabular-nums">
                {pick(
                  `회전 ${formatSignedDeg(yawDeg)} · 상하 ${formatSignedDeg(pitchDeg)}`,
                  `Yaw ${formatSignedDeg(yawDeg)} · Pitch ${formatSignedDeg(pitchDeg)}`,
                )}
              </span>
              <button
                type="button"
                data-testid="vector-ink-toggle-bezier-guides"
                aria-pressed={showBezierGuides}
                onClick={() => setShowBezierGuides((prev) => !prev)}
                className={`${BTN_CHOICE} ${showBezierGuides ? BTN_ACTIVE : BTN_IDLE}`}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("베지어 제어점", "Bezier Handles")}</span>
              </button>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            data-testid="vector-ink-canvas"
            aria-label={pick(
              "3D 실루엣과 크리즈를 G펜 벡터 선화로 표시하는 실시간 캔버스. 드래그해 카메라 각도를 돌립니다.",
              "Interactive canvas rendering 3D silhouette and crease G-Pen vector ink. Drag to orbit camera.",
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            className="aspect-[14/9] w-full cursor-grab touch-none rounded-lg border border-line bg-canvas text-fg active:cursor-grabbing"
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="vector-ink-telemetry-grid">
            <div className="rounded-lg border border-line bg-canvas p-2">
              <div className="text-[11px] text-fg-3">{pick("실루엣 / 크리즈", "Silhouette / Crease")}</div>
              <div className="mt-0.5 text-xs font-semibold text-fg tabular-nums" data-testid="vector-ink-edge-counts">
                {projection.stats.silhouetteEdgeCount} / {projection.stats.creaseEdgeCount}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-2">
              <div className="text-[11px] text-fg-3">{pick("베지어 세그먼트", "Bezier Segments")}</div>
              <div className="mt-0.5 text-xs font-semibold text-fg tabular-nums" data-testid="vector-ink-bezier-count">
                {projection.stats.bezierSegmentCount}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-2">
              <div className="text-[11px] text-fg-3">{pick("평균 / 최대 선폭", "Avg / Max Width")}</div>
              <div className="mt-0.5 text-xs font-semibold text-fg tabular-nums" data-testid="vector-ink-width-stats">
                {projection.stats.avgLineWidthPx.toFixed(2)} / {projection.stats.maxLineWidthPx.toFixed(2)}px
              </div>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-2">
              <div className="text-[11px] text-fg-3">{pick("그림자 강약 획", "Shadow-Weighted")}</div>
              <div className="mt-0.5 text-xs font-semibold text-fg tabular-nums" data-testid="vector-ink-shadow-count">
                {projection.stats.shadowThickenedStrokeCount} / {projection.stats.polylineCount}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-line bg-card p-3 lg:col-span-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("3D 대상 프리셋", "3D Subject Preset")}</span>
            </div>
            <div
              className="grid grid-cols-3 gap-1.5"
              role="group"
              aria-label={pick("3D 대상 프리셋 선택", "Select 3D Subject Preset")}
            >
              {MESH_PRESET_IDS.map((id) => {
                const preset = getCachedMesh(id);
                const active = meshId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`vector-ink-mesh-${id}`}
                    aria-pressed={active}
                    onClick={() => handleSelectMesh(id)}
                    className={`${BTN_CHOICE} ${active ? BTN_ACTIVE : BTN_IDLE}`}
                  >
                    {pick(preset.labelKo, preset.labelEn)}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-fg-3">
              {pick(activeMesh.descriptionKo, activeMesh.descriptionEn)}
            </p>
          </div>

          <div className="space-y-1.5 border-t border-line pt-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <PenTool className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("G펜 필압 스타일", "G-Pen Style")}</span>
              </div>
              <svg
                viewBox="0 0 140 28"
                width={112}
                height={22}
                aria-hidden="true"
                className="shrink-0 text-fg"
              >
                <path d={nibPreviewPathD} fill="currentColor" />
              </svg>
            </div>
            <div
              className="grid grid-cols-3 gap-1.5"
              role="group"
              aria-label={pick("G펜 스타일 선택", "Select G-Pen Style")}
            >
              {GPEN_STYLE_IDS.map((id) => {
                const style = getGpenStyleProfile(id);
                const active = styleId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`vector-ink-style-${id}`}
                    aria-pressed={active}
                    onClick={() => handleSelectStyle(id)}
                    className={`${BTN_CHOICE} ${active ? BTN_ACTIVE : BTN_IDLE}`}
                  >
                    {pick(style.labelKo, style.labelEn)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5 border-t border-line pt-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Sliders className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("카메라 · 크리즈 · 그림자 필압", "Camera, Crease & Shadow Weight")}</span>
            </div>

            {(
              [
                {
                  key: "yaw",
                  label: pick("카메라 좌우 회전 (Yaw)", "Camera Yaw"),
                  valueDisplay: formatSignedDeg(yawDeg),
                  min: -180,
                  max: 180,
                  step: 2,
                  value: yawDeg,
                  onChange: setYawDeg,
                },
                {
                  key: "pitch",
                  label: pick("카메라 상하 각도 (Pitch)", "Camera Pitch"),
                  valueDisplay: formatSignedDeg(pitchDeg),
                  min: -60,
                  max: 60,
                  step: 2,
                  value: pitchDeg,
                  onChange: setPitchDeg,
                },
                {
                  key: "crease",
                  label: pick("크리즈 감지 각도", "Crease Angle"),
                  valueDisplay: `${creaseAngleDeg}°`,
                  min: 10,
                  max: 85,
                  step: 1,
                  value: creaseAngleDeg,
                  onChange: setCreaseAngleDeg,
                },
                {
                  key: "shadow",
                  label: pick("그림자 측 선폭 강조", "Shadow-Side Line Weight"),
                  valueDisplay: `${shadowWeightPct}%`,
                  min: 0,
                  max: 140,
                  step: 5,
                  value: shadowWeightPct,
                  onChange: setShadowWeightPct,
                },
                {
                  key: "width",
                  label: pick("기본 G펜 선폭", "Base G-Pen Width"),
                  valueDisplay: `${baseWidthPx.toFixed(1)}px`,
                  min: 1.0,
                  max: 5.0,
                  step: 0.1,
                  value: baseWidthPx,
                  onChange: setBaseWidthPx,
                },
                {
                  key: "light",
                  label: pick("주광 방위각", "Key Light Azimuth"),
                  valueDisplay: formatSignedDeg(lightAzimuthDeg),
                  min: -180,
                  max: 180,
                  step: 5,
                  value: lightAzimuthDeg,
                  onChange: setLightAzimuthDeg,
                },
              ] as const
            ).map((item) => (
              <SliderControl
                key={item.key}
                id={`${uid}-${item.key}`}
                testId={`vector-ink-slider-${item.key}`}
                label={item.label}
                valueDisplay={item.valueDisplay}
                min={item.min}
                max={item.max}
                step={item.step}
                value={item.value}
                onChange={item.onChange}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Sun className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
            <span>{pick("SVG · 편집 가능한 베지어 레이어 내보내기", "SVG & Editable Bezier Layer Export")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="vector-ink-preview-svg-btn"
              aria-pressed={previewTab === "svg"}
              onClick={() => setPreviewTab((prev) => (prev === "svg" ? "none" : "svg"))}
              className={`${BTN_CHOICE} ${previewTab === "svg" ? BTN_ACTIVE : BTN_IDLE}`}
            >
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("SVG 미리보기", "Preview SVG")}</span>
            </button>
            <button
              type="button"
              data-testid="vector-ink-preview-json-btn"
              aria-pressed={previewTab === "json"}
              onClick={() => setPreviewTab((prev) => (prev === "json" ? "none" : "json"))}
              className={`${BTN_CHOICE} ${previewTab === "json" ? BTN_ACTIVE : BTN_IDLE}`}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("JSON 레이어", "JSON Layer")}</span>
            </button>
            {previewTab !== "none" ? (
              <button
                type="button"
                data-testid="vector-ink-copy-btn"
                onClick={handleCopyPayload}
                className={`${BTN_CHOICE} ${BTN_IDLE}`}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("복사", "Copy")}</span>
              </button>
            ) : null}
          </div>
        </div>

        {previewTab !== "none" ? (
          <pre
            data-testid="vector-ink-export-code"
            className="max-h-44 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg-2"
          >
            {previewTab === "svg" ? exportedVector.svgMarkup : exportedVector.layerJson}
          </pre>
        ) : null}

        {statusMessage ? (
          <p role="status" data-testid="vector-ink-status" className="text-xs text-fg-2">
            {statusMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
