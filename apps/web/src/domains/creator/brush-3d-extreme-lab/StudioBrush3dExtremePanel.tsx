/**
 * Wave 38F — 극한의 브러시 질감 6축 + 완벽 3D 6축 통합 스튜디오 패널.
 *
 * - Props 없이 단독 렌더링 가능, Calm Atelier 시맨틱 토큰 전용(원시 색상 0건 · Web Storage 비의존).
 * - 인터랙티브 `<canvas>` 2.5D 임파스토+3채널 종이결 프리뷰(직접 드로잉 지원) + 닙 갈라짐·브리슬·연필심 마모 제어.
 * - 인터랙티브 `<canvas>` Face Shadow SDF 광원 드래그 + 6패스 3D->2D 분리 레이어 토글 + Contact-Lock IK & PnP 역산.
 */

import {
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Layers,
  Paintbrush,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserCheck,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from "react";

import {
  renderImpastoBrushPreviewCanvas,
  renderSixPassFacePreviewCanvas,
} from "./brush-3d-preview-renderer";
import {
  DEFAULT_BRUSH_PIGMENT_OKLCH,
  DEFAULT_GPEN_NIB_CONFIG,
  DEFAULT_RAKING_LIGHT_CONFIG,
  PAPER_PRESETS,
  createDemoBrushStrokePoints,
  simulateExtremeBrushStroke,
  type BrushStrokeSamplePoint,
  type ExtremeBrushStrokeResult,
  type PaperPresetId,
  type RakingLightConfig,
} from "./extreme-brush-texture-engine";
import {
  ALL_SIX_PASS_IDS,
  CONTACT_LOCK_PRESETS,
  DEFAULT_SIX_PASS_VISIBILITY,
  PERSPECTIVE_CAMERA_PRESETS,
  bakeSixPass2dLayers,
  compositeSixPassLayers,
  projectPerspectiveGuideLines,
  solveContactLockIk,
  solvePerspectivePnPFromVanishingLines,
  type ContactLockPresetId,
  type FaceShadowTintMode,
  type PerspectivePreset,
  type SixPassLayerId,
  type SixPassVisibilityMap,
} from "./perfect-3d-npr-suite";

export interface StudioBrush3dExtremePanelProps {
  readonly initialPaperPreset?: PaperPresetId;
  readonly initialLightAzimuthDeg?: number;
  readonly initialLightElevationDeg?: number;
  readonly className?: string;
  readonly onSummaryChange?: (summary: {
    readonly peakThicknessMm: number;
    readonly peakTineSplitPx: number;
    readonly groundPenetrationMm: number;
    readonly focalLengthMm: number;
    readonly activePassCount: number;
  }) => void;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-card px-2.5 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_CHIP_ACTIVE = `inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-accent bg-accent-soft px-2.5 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const BRUSH_GRID_W = 72;
const BRUSH_GRID_H = 44;

interface RangeSliderProps {
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly valueText: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (next: number) => void;
}

function RangeSlider({
  id,
  testId,
  label,
  valueText,
  value,
  min,
  max,
  step,
  onChange,
}: RangeSliderProps): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-medium text-fg-2">
          {label}
        </label>
        <span className="font-semibold text-fg tabular-nums">{valueText}</span>
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

export function StudioBrush3dExtremePanel({
  initialPaperPreset = "cold-press-cotton",
  initialLightAzimuthDeg = 42,
  initialLightElevationDeg = 28,
  className,
  onSummaryChange,
}: StudioBrush3dExtremePanelProps): ReactElement {
  const uid = useId();

  // 1) 극한 브러시 6축 상태
  const [paperPresetId, setPaperPresetId] = useState<PaperPresetId>(initialPaperPreset);
  const [pressurePct, setPressurePct] = useState<number>(82);
  const [wetnessPct, setWetnessPct] = useState<number>(48);
  const [nibMaxSplitPx, setNibMaxSplitPx] = useState<number>(DEFAULT_GPEN_NIB_CONFIG.maxSplitPx);
  const [bristleCount, setBristleCount] = useState<number>(28);
  const [tipInitialWearMm, setTipInitialWearMm] = useState<number>(0.25);
  const [rakingElevationDeg, setRakingElevationDeg] = useState<number>(
    DEFAULT_RAKING_LIGHT_CONFIG.elevationDeg,
  );
  const [customStrokePoints, setCustomStrokePoints] = useState<readonly BrushStrokeSamplePoint[] | null>(
    null,
  );

  // 2) 완벽 3D 6축 상태
  const [faceAzimuthDeg, setFaceAzimuthDeg] = useState<number>(initialLightAzimuthDeg);
  const [faceElevationDeg, setFaceElevationDeg] = useState<number>(initialLightElevationDeg);
  const [tintMode, setTintMode] = useState<FaceShadowTintMode>("warm-subsurface");
  const [passVisibility, setPassVisibility] = useState<SixPassVisibilityMap>(
    DEFAULT_SIX_PASS_VISIBILITY,
  );
  const [ikPresetId, setIkPresetId] = useState<ContactLockPresetId>("standing-prop-reach");
  const [ikPelvisOffsetCm, setIkPelvisOffsetCm] = useState<number>(0);
  const [pnpPresetId, setPnpPresetId] = useState<PerspectivePreset["id"]>("standard-50mm");

  const brushCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingBrushRef = useRef<boolean>(false);
  const isDraggingFaceLightRef = useRef<boolean>(false);

  const activeRakingLight: RakingLightConfig = useMemo(
    () => ({
      ...DEFAULT_RAKING_LIGHT_CONFIG,
      elevationDeg: rakingElevationDeg,
    }),
    [rakingElevationDeg],
  );

  const activeBrushStrokePoints = useMemo(
    () =>
      customStrokePoints && customStrokePoints.length >= 2
        ? customStrokePoints
        : createDemoBrushStrokePoints(BRUSH_GRID_W, BRUSH_GRID_H, pressurePct / 100, 24),
    [customStrokePoints, pressurePct],
  );

  const brushResult: ExtremeBrushStrokeResult = useMemo(
    () =>
      simulateExtremeBrushStroke(activeBrushStrokePoints, {
        presetId: paperPresetId,
        width: BRUSH_GRID_W,
        height: BRUSH_GRID_H,
        wetness: wetnessPct / 100,
        bristleCount,
        brushRadiusPx: 5.2,
        impastoLoad: 1.45,
        nibConfig: {
          ...DEFAULT_GPEN_NIB_CONFIG,
          maxSplitPx: nibMaxSplitPx,
        },
        rakingLight: activeRakingLight,
        pigmentOklch: DEFAULT_BRUSH_PIGMENT_OKLCH,
        initialWearMm: tipInitialWearMm,
      }),
    [
      activeBrushStrokePoints,
      activeRakingLight,
      bristleCount,
      nibMaxSplitPx,
      paperPresetId,
      tipInitialWearMm,
      wetnessPct,
    ],
  );

  const sixPassManifest = useMemo(
    () =>
      bakeSixPass2dLayers({
        gridSize: 32,
        lightAzimuthDeg: faceAzimuthDeg,
        lightElevationDeg: faceElevationDeg,
        tintMode,
        fogDensity: 0.42,
        rimIntensity: 0.88,
      }),
    [faceAzimuthDeg, faceElevationDeg, tintMode],
  );

  const sixPassComposite = useMemo(
    () => compositeSixPassLayers(sixPassManifest, passVisibility),
    [passVisibility, sixPassManifest],
  );

  const activeIkPreset = useMemo(
    () => CONTACT_LOCK_PRESETS.find((p) => p.id === ikPresetId) ?? CONTACT_LOCK_PRESETS[0],
    [ikPresetId],
  );

  const ikResult = useMemo(() => {
    const baseReq = activeIkPreset?.request;
    const baseHandle = baseReq?.dragHandle;
    const adjustedDrag = baseHandle
      ? {
          joint: baseHandle.joint,
          targetPos: [
            baseHandle.targetPos[0],
            baseHandle.targetPos[1] + ikPelvisOffsetCm / 100,
            baseHandle.targetPos[2],
          ] as const,
        }
      : undefined;
    return solveContactLockIk({
      ...baseReq,
      dragHandle: adjustedDrag,
    });
  }, [activeIkPreset, ikPelvisOffsetCm]);

  const activePnpPreset = useMemo(
    () => PERSPECTIVE_CAMERA_PRESETS.find((p) => p.id === pnpPresetId) ?? PERSPECTIVE_CAMERA_PRESETS[1],
    [pnpPresetId],
  );

  const pnpResult = useMemo(() => {
    const preset = activePnpPreset ?? {
      id: "standard-50mm" as const,
      labelKo: "50mm 표준 웹툰",
      focalLengthMm: 50,
      pitchDeg: 4,
      yawDeg: 38,
    };
    const guides = projectPerspectiveGuideLines(
      {
        focalLengthMm: preset.focalLengthMm,
        pitchDeg: preset.pitchDeg,
        yawDeg: preset.yawDeg,
      },
      1280,
      720,
    );
    return solvePerspectivePnPFromVanishingLines(guides);
  }, [activePnpPreset]);

  // 캔버스 프리뷰 동기화
  useEffect(() => {
    const brushCanvas = brushCanvasRef.current;
    if (brushCanvas) {
      renderImpastoBrushPreviewCanvas(brushCanvas, brushResult, activeRakingLight);
    }
  }, [activeRakingLight, brushResult]);

  useEffect(() => {
    const faceCanvas = faceCanvasRef.current;
    if (faceCanvas) {
      renderSixPassFacePreviewCanvas(
        faceCanvas,
        sixPassComposite,
        sixPassManifest,
        ikResult,
        pnpResult,
      );
    }
  }, [ikResult, pnpResult, sixPassComposite, sixPassManifest]);

  useEffect(() => {
    onSummaryChange?.({
      peakThicknessMm: brushResult.impasto.peakThickness,
      peakTineSplitPx: brushResult.peakTineSplitPx,
      groundPenetrationMm: ikResult.groundPenetrationMm,
      focalLengthMm: pnpResult.focalLengthMm,
      activePassCount: sixPassComposite.activePassCount,
    });
  }, [
    brushResult.impasto.peakThickness,
    brushResult.peakTineSplitPx,
    ikResult.groundPenetrationMm,
    onSummaryChange,
    pnpResult.focalLengthMm,
    sixPassComposite.activePassCount,
  ]);

  const appendBrushPointerPoint = useCallback(
    (event: PointerEvent<HTMLCanvasElement>, startFresh: boolean): void => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const gx = ((event.clientX - rect.left) / rect.width) * BRUSH_GRID_W;
      const gy = ((event.clientY - rect.top) / rect.height) * BRUSH_GRID_H;
      const nextPt: BrushStrokeSamplePoint = {
        x: Math.min(BRUSH_GRID_W - 1, Math.max(1, gx)),
        y: Math.min(BRUSH_GRID_H - 1, Math.max(1, gy)),
        pressure: pressurePct / 100,
        tiltRad: 0.35,
        velocityPxPerSec: startFresh ? 120 : 240,
        timestampMs: Date.now(),
      };
      setCustomStrokePoints((prev) =>
        startFresh || !prev ? [nextPt] : [...prev.slice(-38), nextPt],
      );
    },
    [pressurePct],
  );

  const updateFaceLightFromPointer = useCallback((event: PointerEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setFaceAzimuthDeg(Math.round((nx - 0.5) * 320));
    setFaceElevationDeg(Math.round(75 - ny * 110));
  }, []);

  const toggleSixPass = (passId: SixPassLayerId): void => {
    setPassVisibility((prev) => ({
      ...prev,
      [passId]: !prev[passId],
    }));
  };

  const setLineartOnlyPasses = (): void => {
    setPassVisibility({
      "albedo-id": false,
      "cel-shade": false,
      "cast-shadow": false,
      "z-fog": false,
      "rim-light": false,
      lineart: true,
    });
  };

  const handleResetAll = (): void => {
    setPaperPresetId(initialPaperPreset);
    setPressurePct(82);
    setWetnessPct(48);
    setNibMaxSplitPx(DEFAULT_GPEN_NIB_CONFIG.maxSplitPx);
    setBristleCount(28);
    setTipInitialWearMm(0.25);
    setRakingElevationDeg(DEFAULT_RAKING_LIGHT_CONFIG.elevationDeg);
    setCustomStrokePoints(null);
    setFaceAzimuthDeg(initialLightAzimuthDeg);
    setFaceElevationDeg(initialLightElevationDeg);
    setTintMode("warm-subsurface");
    setPassVisibility(DEFAULT_SIX_PASS_VISIBILITY);
    setIkPresetId("standing-prop-reach");
    setIkPelvisOffsetCm(0);
    setPnpPresetId("standard-50mm");
  };

  const ikGroundedPass = ikResult.groundPenetrationMm === 0;
  const faceArtifactClean = sixPassManifest.faceSdf.noseCheekArtifactScore === 0;

  return (
    <section
      data-testid="studio-brush-3d-extreme-panel"
      aria-label="극한 브러시 2.5D 질감 및 완벽 3D NPR 6패스 스튜디오"
      className={`rounded-xl border border-line bg-raised p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <Paintbrush className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2>극한 브러시 6축 &amp; 완벽 3D NPR 6패스 실험실</h2>
          </div>
          <p className="text-xs text-fg-2">
            3채널 종이결·2.5D 임파스토·G펜 닙 갈라짐 물리와 얼굴 SDF·6패스 2D 분리 베이크·Contact-Lock IK를 한 화면에서 검증합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="ik-ground-penetration-badge"
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${
              ikGroundedPass
                ? "border-good/40 bg-good-soft text-good"
                : "border-bad/40 bg-bad-soft text-bad"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>지면 관통 {ikResult.groundPenetrationMm.toFixed(2)}mm</span>
          </span>
          <span
            data-testid="sixpass-active-count-badge"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent tabular-nums"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>6패스 {sixPassComposite.activePassCount}/6</span>
          </span>
          <button
            type="button"
            data-testid="btn-reset-brush-3d-lab"
            onClick={handleResetAll}
            className={BTN_OUTLINE}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>초기화</span>
          </button>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 좌측: 극한 브러시 6축 */}
        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>극한 브러시 6축 · 2.5D 임파스토 &amp; 종이결</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {PAPER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`paper-preset-${preset.id}`}
                  aria-pressed={paperPresetId === preset.id}
                  onClick={() => setPaperPresetId(preset.id)}
                  className={paperPresetId === preset.id ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
                >
                  {preset.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-line bg-panel">
            <canvas
              ref={brushCanvasRef}
              data-testid="impasto-brush-canvas"
              width={420}
              height={220}
              aria-label="2.5D 임파스토 및 3채널 종이결 실시간 프리뷰 캔버스"
              onPointerDown={(event) => {
                isDrawingBrushRef.current = true;
                appendBrushPointerPoint(event, true);
              }}
              onPointerMove={(event) => {
                if (!isDrawingBrushRef.current) return;
                appendBrushPointerPoint(event, false);
              }}
              onPointerUp={() => {
                isDrawingBrushRef.current = false;
              }}
              onPointerLeave={() => {
                isDrawingBrushRef.current = false;
              }}
              className="block h-48 w-full cursor-crosshair touch-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RangeSlider
              id={`${uid}-pressure`}
              testId="slider-brush-pressure"
              label="필압 (산마루→골짜기)"
              valueText={`${pressurePct}%`}
              value={pressurePct}
              min={15}
              max={100}
              step={1}
              onChange={setPressurePct}
            />
            <RangeSlider
              id={`${uid}-wetness`}
              testId="slider-brush-wetness"
              label="습도 (건식↔습식 모세관)"
              valueText={`${wetnessPct}%`}
              value={wetnessPct}
              min={0}
              max={100}
              step={1}
              onChange={setWetnessPct}
            />
            <RangeSlider
              id={`${uid}-nib-split`}
              testId="slider-nib-split"
              label="G펜 닙 최대 갈라짐"
              valueText={`${nibMaxSplitPx.toFixed(1)}px`}
              value={nibMaxSplitPx}
              min={1.0}
              max={12.0}
              step={0.2}
              onChange={setNibMaxSplitPx}
            />
            <RangeSlider
              id={`${uid}-bristles`}
              testId="slider-bristle-count"
              label="멀티 브리슬 가닥"
              valueText={`${bristleCount}가닥`}
              value={bristleCount}
              min={16}
              max={48}
              step={2}
              onChange={setBristleCount}
            />
            <RangeSlider
              id={`${uid}-tip-wear`}
              testId="slider-tip-wear"
              label="초기 연필심 마모폭"
              valueText={`${tipInitialWearMm.toFixed(2)}mm`}
              value={tipInitialWearMm}
              min={0.18}
              max={0.58}
              step={0.02}
              onChange={setTipInitialWearMm}
            />
            <RangeSlider
              id={`${uid}-raking-el`}
              testId="slider-raking-elevation"
              label="사선 광원 고도각"
              valueText={`${rakingElevationDeg}°`}
              value={rakingElevationDeg}
              min={8}
              max={75}
              step={1}
              onChange={setRakingElevationDeg}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs">
            <div data-testid="brush-physics-summary" className="flex flex-wrap gap-x-3 gap-y-1 text-fg-2 tabular-nums">
              <span>최대 닙 갈라짐 <strong className="text-fg">{brushResult.peakTineSplitPx.toFixed(2)}px</strong></span>
              <span>잔여 잉크 <strong className="text-fg">{Math.round(brushResult.endInkReserve * 100)}%</strong></span>
              <span>끝 고임 <strong className="text-fg">{Math.round(brushResult.endPoolingFactor * 100)}%</strong></span>
              <span>마모 후 심폭 <strong className="text-fg">{brushResult.finalTipWear.currentFlatWidthMm.toFixed(2)}mm</strong></span>
              <span>2.5D 휘도폭 <strong className="text-fg">{brushResult.shading.luminanceRange.toFixed(2)}</strong></span>
            </div>
            <button
              type="button"
              data-testid="btn-sharpen-tip"
              onClick={() => {
                setTipInitialWearMm(0.22);
                setCustomStrokePoints(null);
              }}
              className={BTN_OUTLINE}
            >
              심 깎기
            </button>
          </div>
        </div>

        {/* 우측: 완벽 3D 6축 */}
        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Sun className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>완벽 3D 6축 · Face Shadow SDF &amp; 6패스 베이크</span>
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="tint-mode-warm"
                aria-pressed={tintMode === "warm-subsurface"}
                onClick={() => setTintMode("warm-subsurface")}
                className={tintMode === "warm-subsurface" ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
              >
                OKLCH 난색 SSS
              </button>
              <button
                type="button"
                data-testid="tint-mode-cool"
                aria-pressed={tintMode === "complementary-cool"}
                onClick={() => setTintMode("complementary-cool")}
                className={tintMode === "complementary-cool" ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
              >
                보색 쿨 섀도우
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-line bg-panel">
            <canvas
              ref={faceCanvasRef}
              data-testid="face-sixpass-canvas"
              width={420}
              height={230}
              aria-label="얼굴 Face Shadow SDF 6패스 합성 및 Contact-Lock IK 프리뷰 캔버스"
              onPointerDown={(event) => {
                isDraggingFaceLightRef.current = true;
                updateFaceLightFromPointer(event);
              }}
              onPointerMove={(event) => {
                if (!isDraggingFaceLightRef.current) return;
                updateFaceLightFromPointer(event);
              }}
              onPointerUp={() => {
                isDraggingFaceLightRef.current = false;
              }}
              onPointerLeave={() => {
                isDraggingFaceLightRef.current = false;
              }}
              className="block h-48 w-full cursor-grab touch-none active:cursor-grabbing"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RangeSlider
              id={`${uid}-face-az`}
              testId="slider-face-azimuth"
              label="Face SDF 광원 방위각"
              valueText={`${faceAzimuthDeg}°`}
              value={faceAzimuthDeg}
              min={-180}
              max={180}
              step={2}
              onChange={setFaceAzimuthDeg}
            />
            <RangeSlider
              id={`${uid}-face-el`}
              testId="slider-face-elevation"
              label="Face SDF 광원 고도각"
              valueText={`${faceElevationDeg}°`}
              value={faceElevationDeg}
              min={-45}
              max={80}
              step={2}
              onChange={setFaceElevationDeg}
            />
          </div>

          {/* 6패스 3D -> 2D 분리 레이어 토글 */}
          <div className="space-y-2 rounded-lg border border-line bg-panel p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg">
                3D → 2D 6패스 분리 레이어 토글
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="btn-sixpass-all-on"
                  onClick={() => setPassVisibility(DEFAULT_SIX_PASS_VISIBILITY)}
                  className={BTN_PRIMARY}
                >
                  전체 켜기
                </button>
                <button
                  type="button"
                  data-testid="btn-sixpass-lineart-only"
                  onClick={setLineartOnlyPasses}
                  className={BTN_OUTLINE}
                >
                  선화만 보기
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ALL_SIX_PASS_IDS.map((passId) => {
                const entry = sixPassManifest.passes.find((p) => p.id === passId);
                const enabled = passVisibility[passId];
                return (
                  <button
                    key={passId}
                    type="button"
                    data-testid={`toggle-pass-${passId}`}
                    aria-pressed={enabled}
                    onClick={() => toggleSixPass(passId)}
                    className={enabled ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
                  >
                    {enabled ? (
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="truncate">{entry?.id ?? passId}</span>
                  </button>
                );
              })}
            </div>
            <div
              data-testid="face-sdf-summary"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2 tabular-nums"
            >
              <span className="inline-flex items-center gap-1 text-good">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>코/광대 잡음 {faceArtifactClean ? "0건" : `${sixPassManifest.faceSdf.noseCheekArtifactScore}건`}</span>
              </span>
              <span>좌/우 조명율 {Math.round(sixPassManifest.faceSdf.leftLitRatio * 100)}% / {Math.round(sixPassManifest.faceSdf.rightLitRatio * 100)}%</span>
              <span>체크섬 {sixPassComposite.compositeChecksum}</span>
            </div>
          </div>

          {/* Contact-Lock IK + Perspective PnP 컴팩트 검증 바 */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-line bg-panel p-2.5">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg">
                <UserCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>1드래그 Contact-Lock IK</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {CONTACT_LOCK_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`ik-preset-${preset.id}`}
                    aria-pressed={ikPresetId === preset.id}
                    onClick={() => setIkPresetId(preset.id)}
                    className={ikPresetId === preset.id ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
                  >
                    {preset.labelKo}
                  </button>
                ))}
              </div>
              <RangeSlider
                id={`${uid}-ik-pelvis`}
                testId="slider-ik-pelvis-offset"
                label="골반 1-드래그 높이"
                valueText={`${ikPelvisOffsetCm >= 0 ? "+" : ""}${ikPelvisOffsetCm}cm`}
                value={ikPelvisOffsetCm}
                min={-30}
                max={12}
                step={2}
                onChange={setIkPelvisOffsetCm}
              />
            </div>

            <div className="space-y-2 rounded-lg border border-line bg-panel p-2.5">
              <div className="flex items-center gap-1 text-xs font-semibold text-fg">
                <Camera className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>Perspective PnP 역산기</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {PERSPECTIVE_CAMERA_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`pnp-preset-${preset.id}`}
                    aria-pressed={pnpPresetId === preset.id}
                    onClick={() => setPnpPresetId(preset.id)}
                    className={pnpPresetId === preset.id ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
                  >
                    {preset.focalLengthMm}mm
                  </button>
                ))}
              </div>
              <div data-testid="pnp-readout" className="space-y-0.5 text-xs text-fg-2 tabular-nums">
                <div>
                  초점거리 <strong className="text-fg">{pnpResult.focalLengthMm.toFixed(1)}mm</strong> · 수평선{" "}
                  <strong className="text-fg">{Math.round(pnpResult.horizonYRatio * 100)}%</strong>
                </div>
                <div>
                  피치 <strong className="text-fg">{pnpResult.pitchDeg.toFixed(1)}°</strong> · 요{" "}
                  <strong className="text-fg">{pnpResult.yawDeg.toFixed(1)}°</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
