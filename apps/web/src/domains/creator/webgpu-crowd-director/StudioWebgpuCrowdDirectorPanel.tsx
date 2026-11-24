/**
 * Wave 38D — WebGPU 인스턴싱 + 8종 원근 소실점 대규모 군중 생성기 스튜디오 패널.
 *
 * - Props 없이 단독 렌더링 가능, Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건 · Web Storage 0건).
 * - 8종 웹툰 빈출 군중 프리셋, 군중 수(20~1,000)·수평선 높이·주인공 시선 집중점 X/Y·원근 선두께 감쇄 제어.
 * - 실시간 `<canvas>` 군중 프리뷰(포인터 클릭/드래그로 주인공 시선점 이동) + SVG 레이어 크기·드로우콜 절감 지표 표시.
 */

import {
  CheckCircle2,
  Code2,
  Compass,
  Copy,
  Crosshair,
  Eye,
  Layers,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from "react";

import {
  CROWD_INSTANCING_WGSL,
  CROWD_MIN_COUNT,
  CROWD_PANEL_MAX_COUNT,
  CROWD_PRESETS,
  DEFAULT_CROWD_PRESET,
  generateProceduralCrowd,
  getCrowdPresetById,
  renderCrowdPreviewCanvas,
  renderCrowdSvgLayer,
  validateCrowdWgslShader,
  type CrowdPresetId,
  type CrowdPresetSpec,
  type CrowdSceneResult,
} from "./procedural-crowd-engine";

export interface StudioWebgpuCrowdDirectorPanelProps {
  readonly initialPresetId?: CrowdPresetId;
  readonly initialCount?: number;
  readonly className?: string;
  readonly onSceneChange?: (scene: CrowdSceneResult) => void;
}

const DEFAULT_SEED = 20260384;
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_CHIP_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

interface RangeControlProps {
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

function RangeControl({
  id,
  testId,
  label,
  valueText,
  value,
  min,
  max,
  step,
  onChange,
}: RangeControlProps): ReactElement {
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

function formatKilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function StudioWebgpuCrowdDirectorPanel({
  initialPresetId = DEFAULT_CROWD_PRESET.id,
  initialCount,
  className,
  onSceneChange,
}: StudioWebgpuCrowdDirectorPanelProps): ReactElement {
  const uid = useId();
  const initialPreset = getCrowdPresetById(initialPresetId);

  const [presetId, setPresetId] = useState<CrowdPresetId>(initialPreset.id);
  const [crowdCount, setCrowdCount] = useState<number>(
    Math.min(
      CROWD_PANEL_MAX_COUNT,
      Math.max(CROWD_MIN_COUNT, initialCount ?? initialPreset.defaultCount),
    ),
  );
  const [horizonPct, setHorizonPct] = useState<number>(
    Math.round(initialPreset.defaultHorizonRatio * 100),
  );
  const [focalXPct, setFocalXPct] = useState<number>(
    Math.round(initialPreset.defaultFocalX * 100),
  );
  const [focalYPct, setFocalYPct] = useState<number>(
    Math.round(initialPreset.defaultFocalY * 100),
  );
  const [strokeAttenuationPct, setStrokeAttenuationPct] = useState<number>(
    Math.round(initialPreset.defaultStrokeAttenuation * 100),
  );
  const [focalAttentionPct, setFocalAttentionPct] = useState<number>(
    Math.round(initialPreset.defaultFocalAttention * 100),
  );
  const [seed, setSeed] = useState<number>(DEFAULT_SEED);
  const [showPerspectiveGuides, setShowPerspectiveGuides] = useState<boolean>(true);
  const [showGazeVectors, setShowGazeVectors] = useState<boolean>(false);
  const [showInspector, setShowInspector] = useState<boolean>(false);
  const [copyStatusText, setCopyStatusText] = useState<string>("");

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingFocalRef = useRef<boolean>(false);

  const activePreset = useMemo(() => getCrowdPresetById(presetId), [presetId]);
  const wgslReport = useMemo(() => validateCrowdWgslShader(CROWD_INSTANCING_WGSL), []);

  const scene = useMemo(
    () =>
      generateProceduralCrowd({
        presetId,
        count: crowdCount,
        seed,
        canvasWidth: 960,
        canvasHeight: 540,
        horizonRatio: horizonPct / 100,
        vanishingX: activePreset.defaultVanishingX,
        focalPointX: focalXPct / 100,
        focalPointY: focalYPct / 100,
        focalAttention: focalAttentionPct / 100,
        strokeAttenuation: strokeAttenuationPct / 100,
      }),
    [
      activePreset.defaultVanishingX,
      crowdCount,
      focalAttentionPct,
      focalXPct,
      focalYPct,
      horizonPct,
      presetId,
      seed,
      strokeAttenuationPct,
    ],
  );

  const svgLayer = useMemo(
    () =>
      renderCrowdSvgLayer(scene, {
        includePerspectiveGuides: showPerspectiveGuides,
        includeFocalMarker: true,
        includeGazeVectors: showGazeVectors,
      }),
    [scene, showGazeVectors, showPerspectiveGuides],
  );

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    renderCrowdPreviewCanvas(canvas, scene, {
      showPerspectiveGuides,
      showGazeVectors,
      showFocalReticle: true,
    });
  }, [scene, showGazeVectors, showPerspectiveGuides]);

  useEffect(() => {
    onSceneChange?.(scene);
  }, [onSceneChange, scene]);

  const applyPreset = (preset: CrowdPresetSpec): void => {
    setPresetId(preset.id);
    setCrowdCount(Math.min(CROWD_PANEL_MAX_COUNT, Math.max(CROWD_MIN_COUNT, preset.defaultCount)));
    setHorizonPct(Math.round(preset.defaultHorizonRatio * 100));
    setFocalXPct(Math.round(preset.defaultFocalX * 100));
    setFocalYPct(Math.round(preset.defaultFocalY * 100));
    setStrokeAttenuationPct(Math.round(preset.defaultStrokeAttenuation * 100));
    setFocalAttentionPct(Math.round(preset.defaultFocalAttention * 100));
    setCopyStatusText("");
  };

  const handleReset = (): void => {
    setSeed(DEFAULT_SEED);
    setShowPerspectiveGuides(true);
    setShowGazeVectors(false);
    applyPreset(DEFAULT_CROWD_PRESET);
  };

  const updateFocalFromPointer = (event: PointerEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.min(0.95, Math.max(0.05, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(0.95, Math.max(0.15, (event.clientY - rect.top) / rect.height));
    setFocalXPct(Math.round(nx * 100));
    setFocalYPct(Math.round(ny * 100));
  };

  const handleCopySvg = (): void => {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.clipboard?.writeText) {
      void nav.clipboard.writeText(svgLayer.svgMarkup).then(
        () => setCopyStatusText(`SVG ${formatKilobytes(svgLayer.byteLength)} 복사됨`),
        () => setCopyStatusText("클립보드 권한 없음 · 아래 인스펙터에서 SVG 확인"),
      );
      return;
    }
    setCopyStatusText(`SVG ${formatKilobytes(svgLayer.byteLength)} 준비됨`);
  };

  const { metrics } = scene;
  const { drawCallMetrics } = metrics;
  const zeroOverlapPass = metrics.overlapViolations === 0;

  return (
    <section
      data-testid="studio-webgpu-crowd-director-panel"
      aria-label="WebGPU 인스턴싱 원근 군중 생성기"
      className={`rounded-xl border border-line bg-raised p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <Users className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2>WebGPU 인스턴싱 원근 군중 생성기</h2>
          </div>
          <p className="text-xs text-fg-2">
            Poisson-disk 비겹침 원근 배치와 단일 drawIndexedIndirect 인스턴싱으로 웹툰 대규모 군중 컷을 즉시 생성합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="crowd-overlap-badge"
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${
              zeroOverlapPass
                ? "border-good/40 bg-good-soft text-good"
                : "border-warn/40 bg-warning-soft text-warn"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>겹침 {metrics.overlapViolations}건</span>
          </span>

          <span
            data-testid="crowd-drawcall-badge"
            className="inline-flex items-center gap-1 rounded-full border border-good/40 bg-good-soft px-2.5 py-1 text-xs font-semibold text-good tabular-nums"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              드로우콜 {drawCallMetrics.instancedDrawCalls}회 ·{" "}
              {drawCallMetrics.drawCallReductionPct.toFixed(2)}% 절감
            </span>
          </span>
        </div>
      </header>

      {/* 8종 웹툰 빈출 군중 프리셋 선택 */}
      <div className="mt-3 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-fg">웹툰 군중 프리셋 8종</span>
          <span data-testid="crowd-active-preset-desc" className="text-fg-2">
            {activePreset.labelKo} — {activePreset.descriptionKo}
          </span>
        </div>

        <div
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
          role="group"
          aria-label="웹툰 군중 프리셋 선택"
        >
          {CROWD_PRESETS.map((preset) => {
            const active = preset.id === presetId;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`crowd-preset-${preset.id}`}
                aria-pressed={active}
                onClick={() => applyPreset(preset)}
                className={active ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
              >
                {preset.shortLabelKo}
              </button>
            );
          })}
        </div>
      </div>

      {/* 본문 2열: 좌측 프리뷰·지표 / 우측 파라미터 제어 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,1fr)]">
        {/* 좌측: 실시간 캔버스 + 지표 카드 */}
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-line bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
                <Crosshair className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                실시간 원근 프리뷰 (클릭·드래그로 주인공 시선점 이동)
              </span>
              <span
                data-testid="crowd-generation-timing"
                className="font-semibold text-fg-2 tabular-nums"
              >
                {metrics.placedCount}명 · {metrics.generationTimeMs.toFixed(2)}ms
              </span>
            </div>

            <canvas
              ref={previewCanvasRef}
              data-testid="crowd-preview-canvas"
              width={640}
              height={360}
              aria-label="원근 소실점 대규모 군중 실시간 프리뷰 캔버스"
              onPointerDown={(event) => {
                draggingFocalRef.current = true;
                updateFocalFromPointer(event);
              }}
              onPointerMove={(event) => {
                if (draggingFocalRef.current) {
                  updateFocalFromPointer(event);
                }
              }}
              onPointerUp={() => {
                draggingFocalRef.current = false;
              }}
              onPointerLeave={() => {
                draggingFocalRef.current = false;
              }}
              className="block aspect-video w-full cursor-crosshair bg-canvas"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-panel px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="crowd-toggle-guides"
                  aria-pressed={showPerspectiveGuides}
                  onClick={() => setShowPerspectiveGuides((prev) => !prev)}
                  className={showPerspectiveGuides ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
                >
                  <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                  소실점 가이드
                </button>
                <button
                  type="button"
                  data-testid="crowd-toggle-gaze"
                  aria-pressed={showGazeVectors}
                  onClick={() => setShowGazeVectors((prev) => !prev)}
                  className={showGazeVectors ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  시선 방향
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="crowd-reseed-btn"
                  onClick={() => setSeed((prev) => prev + 7919)}
                  className={BTN_OUTLINE}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  새 배치 시드
                </button>
                <button
                  type="button"
                  data-testid="crowd-reset-btn"
                  onClick={handleReset}
                  className={BTN_OUTLINE}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  초기화
                </button>
              </div>
            </div>
          </div>

          {/* 핵심 지표 요약(실측 데이터 기반) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div
              data-testid="crowd-metric-drawcalls"
              className="rounded-lg border border-line bg-card p-2.5"
            >
              <div className="text-[11px] font-medium text-fg-3">드로우콜 절감</div>
              <div className="mt-0.5 text-sm font-bold text-fg tabular-nums">
                {drawCallMetrics.naiveDrawCalls} → {drawCallMetrics.instancedDrawCalls}회
              </div>
              <div className="text-[11px] text-good tabular-nums">
                {drawCallMetrics.drawCallReductionPct.toFixed(2)}% 감축
              </div>
            </div>

            <div
              data-testid="crowd-metric-svg"
              className="rounded-lg border border-line bg-card p-2.5"
            >
              <div className="text-[11px] font-medium text-fg-3">SVG 군중 레이어</div>
              <div className="mt-0.5 text-sm font-bold text-fg tabular-nums">
                {formatKilobytes(svgLayer.byteLength)}
              </div>
              <div className="text-[11px] text-fg-2 tabular-nums">
                인물 {svgLayer.agentElementCount} · 경로 {svgLayer.pathCount}
              </div>
            </div>

            <div
              data-testid="crowd-metric-stroke"
              className="rounded-lg border border-line bg-card p-2.5"
            >
              <div className="text-[11px] font-medium text-fg-3">근경→원경 잉크선</div>
              <div className="mt-0.5 text-sm font-bold text-fg tabular-nums">
                {metrics.nearStrokeWidthPx.toFixed(2)} → {metrics.farStrokeWidthPx.toFixed(2)}px
              </div>
              <div className="text-[11px] text-fg-2 tabular-nums">
                시선 정렬 {(metrics.meanGazeAlignment * 100).toFixed(0)}%
              </div>
            </div>

            <div
              data-testid="crowd-metric-gpu-buffer"
              className="rounded-lg border border-line bg-card p-2.5"
            >
              <div className="text-[11px] font-medium text-fg-3">64B 인스턴스 버퍼</div>
              <div className="mt-0.5 text-sm font-bold text-fg tabular-nums">
                {formatKilobytes(drawCallMetrics.instanceBufferBytes)}
              </div>
              <div className="text-[11px] text-fg-2 tabular-nums">
                간접 인수 {drawCallMetrics.indirectArgsBytes}B
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 원근·시선·선두께 파라미터 슬라이더 및 출력 액션 */}
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-3.5">
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              원근 소실점 · 주인공 시선 · 잉크 감쇄 제어
            </div>

            <RangeControl
              id={`${uid}-crowd-count`}
              testId="slider-crowd-count"
              label="군중 수"
              valueText={`${crowdCount}명`}
              value={crowdCount}
              min={CROWD_MIN_COUNT}
              max={CROWD_PANEL_MAX_COUNT}
              step={10}
              onChange={setCrowdCount}
            />

            <RangeControl
              id={`${uid}-horizon-ratio`}
              testId="slider-horizon-ratio"
              label="수평선 높이"
              valueText={`${horizonPct}%`}
              value={horizonPct}
              min={15}
              max={70}
              step={1}
              onChange={setHorizonPct}
            />

            <RangeControl
              id={`${uid}-focal-x`}
              testId="slider-focal-x"
              label="주인공 시선 집중점 X"
              valueText={`${focalXPct}%`}
              value={focalXPct}
              min={5}
              max={95}
              step={1}
              onChange={setFocalXPct}
            />

            <RangeControl
              id={`${uid}-focal-y`}
              testId="slider-focal-y"
              label="주인공 시선 집중점 Y"
              valueText={`${focalYPct}%`}
              value={focalYPct}
              min={15}
              max={95}
              step={1}
              onChange={setFocalYPct}
            />

            <RangeControl
              id={`${uid}-stroke-attenuation`}
              testId="slider-stroke-attenuation"
              label="원근 선두께 감쇄"
              valueText={`${strokeAttenuationPct}%`}
              value={strokeAttenuationPct}
              min={0}
              max={100}
              step={2}
              onChange={setStrokeAttenuationPct}
            />

            <RangeControl
              id={`${uid}-focal-attention`}
              testId="slider-focal-attention"
              label="주인공 시선 집중도"
              valueText={`${focalAttentionPct}%`}
              value={focalAttentionPct}
              min={0}
              max={100}
              step={2}
              onChange={setFocalAttentionPct}
            />
          </div>

          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex items-center justify-between text-[11px] text-fg-2 tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                LOD 근경 {drawCallMetrics.lodDistribution.near} · 중경{" "}
                {drawCallMetrics.lodDistribution.mid} · 원경 {drawCallMetrics.lodDistribution.far}
              </span>
              <span>시드 #{seed}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="crowd-copy-svg-btn"
                onClick={handleCopySvg}
                className={`${BTN_PRIMARY} flex-1`}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                SVG 레이어 복사
              </button>
              <button
                type="button"
                data-testid="toggle-crowd-inspector"
                aria-expanded={showInspector}
                onClick={() => setShowInspector((prev) => !prev)}
                className={BTN_OUTLINE}
              >
                <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                WGSL·SVG 계약
              </button>
            </div>

            {copyStatusText.length > 0 ? (
              <p
                data-testid="crowd-copy-status"
                role="status"
                className="text-xs font-medium text-accent"
              >
                {copyStatusText}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* 확장 인스펙터: WGSL drawIndexedIndirect & SVG 요약 */}
      {showInspector ? (
        <div
          data-testid="crowd-wgsl-inspector"
          className="mt-3 grid gap-3 rounded-xl border border-line bg-card p-3 text-xs lg:grid-cols-2"
        >
          <div className="space-y-1.5">
            <div className="font-semibold text-fg">
              WebGPU drawIndexedIndirect WGSL 검증 ({wgslReport.valid ? "통과" : "오류"})
            </div>
            <p className="text-fg-2">
              진입점: {wgslReport.entryPoints.join(", ")} · 워크그룹:{" "}
              {wgslReport.workgroupSizes.join(", ")}
            </p>
            <p className="text-fg-2">
              바인딩({wgslReport.bindings.length}): {wgslReport.bindings.join(" · ")}
            </p>
            <p className="text-fg-2">
              구조체({wgslReport.structs.length}): {wgslReport.structs.join(", ")}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="font-semibold text-fg">
              2D 벡터 SVG 레이어 요약 ({svgLayer.viewBox})
            </div>
            <p className="text-fg-2 tabular-nums">
              크기 {formatKilobytes(svgLayer.byteLength)} · 최소/최대 선두께{" "}
              {svgLayer.minStrokeWidthPx.toFixed(2)}px ~ {svgLayer.maxStrokeWidthPx.toFixed(2)}px ·
              예상 수작업 절감 약 {drawCallMetrics.estimatedManualInkMinutesSaved}분(추정)
            </p>
            <pre className="max-h-24 overflow-auto rounded-lg border border-line bg-panel p-2 text-[11px] text-fg-2">
              {svgLayer.svgMarkup.slice(0, 420)}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}
