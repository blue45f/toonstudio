/**
 * WebGPU Compute 자동 플랫팅 · Jump-Flooding(JFA) · 0~16px 틈새 닫기 워크벤치 패널.
 *
 * - 열린 선화 틈새가 포함된 웹툰 캐릭터 선화 버퍼에 `gapClosePx (0~16px)` 슬라이더를 실시간 적용한다.
 * - 머리·피부·의상 3영역 자동 밑색 플랫팅 및 누수 차단율·영역별 바운딩 박스를 캔버스에 즉시 렌더링한다.
 * - WebGPU Compute / Subgroups 가용 프로브, WGSL 3종 파이프라인 단계·처리 시간(ms), 512/1024 벤치마크를 제공한다.
 */

import "./webgpu-flatting-workbench.css";

import { Cpu, Gauge, Layers, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  benchmarkAutoFlattingThroughput,
  executeAutoFlattingSync,
  executeAutoFlattingWithGapClose,
  type AutoFlattingBenchmarkResult,
  type AutoFlattingResult,
} from "./webgpu-auto-flatting-engine";
import {
  buildDemoCharacterLineartScene,
  compositeFlattingPreview,
  type DemoCharacterPresetId,
} from "./webgpu-flatting-demo-scene";
import {
  MAX_WEBGPU_GAP_CLOSE_PX,
  probeWebGpuComputeCapabilities,
  WGSL_FLATTING_SHADER_SPECS,
  WGSL_WORKGROUP_SIZE,
  type WebGpuCapabilityReasonCode,
  type WebGpuComputeCapabilities,
} from "./webgpu-flatting-wgsl-shaders";

export interface WebGpuFlattingWorkbenchPanelProps {
  readonly initialGapClosePx?: number;
  readonly initialPresetId?: DemoCharacterPresetId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
}

const GAP_QUICK_STEPS = Object.freeze([0, 4, 6, 12] as const);

function formatBytesMiB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MiB";
  return `${Math.round(bytes / (1024 * 1024))} MiB`;
}

function resolveReasonText(
  code: WebGpuCapabilityReasonCode,
  tx: (ko: string, en: string) => string,
): string {
  switch (code) {
    case "ready":
      return tx("WebGPU Compute 디스패치 가능", "WebGPU Compute ready");
    case "navigator_gpu_missing":
      return tx("navigator.gpu 미제공 — TypedArray 동치 폴백", "navigator.gpu absent — TypedArray fallback");
    case "adapter_unavailable":
      return tx("GPU 어댑터 미할당 — TypedArray 동치 폴백", "No GPU adapter — TypedArray fallback");
    case "workgroup_limit_too_small":
      return tx("워크그룹 한계 미만 — TypedArray 동치 폴백", "Workgroup limits too low — TypedArray fallback");
    case "probe_error":
      return tx("어댑터 프로브 오류 — TypedArray 동치 폴백", "Adapter probe error — TypedArray fallback");
  }
}

function resolveRegionDisplayName(
  label: string,
  tx: (ko: string, en: string) => string,
): string {
  if (label === "hair") return tx("머리", "Hair");
  if (label === "skin") return tx("피부", "Skin");
  if (label === "outfit") return tx("의상", "Outfit");
  return label;
}

function resolveSwatchClass(label: string): string {
  if (label === "hair") return "wgf-swatch wgf-swatch--hair";
  if (label === "skin") return "wgf-swatch wgf-swatch--skin";
  return "wgf-swatch wgf-swatch--outfit";
}

export function WebGpuFlattingWorkbenchPanel({
  initialGapClosePx = 6,
  initialPresetId = "portrait-open-gaps",
  locale,
  className,
}: WebGpuFlattingWorkbenchPanelProps): ReactElement {
  const globalLang = useI18n((state) => state.lang);
  const bi = useBilingual("webgpu-flatting");
  const isEn = locale ? locale === "en" : !globalLang.toLowerCase().startsWith("ko");
  const tx = (ko: string, en: string): string => (locale ? (isEn ? en : ko) : bi(ko, en));

  const sliderId = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [presetId, setPresetId] = useState<DemoCharacterPresetId>(initialPresetId);
  const [gapClosePx, setGapClosePx] = useState<number>(
    Math.max(0, Math.min(MAX_WEBGPU_GAP_CLOSE_PX, Math.round(initialGapClosePx))),
  );
  const [underStrokeTrap, setUnderStrokeTrap] = useState<boolean>(true);
  const [showGapBridges, setShowGapBridges] = useState<boolean>(true);
  const [capabilities, setCapabilities] = useState<WebGpuComputeCapabilities | null>(null);
  const [gpuRunEntry, setGpuRunEntry] = useState<{
    readonly key: string;
    readonly result: AutoFlattingResult;
  } | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<AutoFlattingBenchmarkResult | null>(null);

  const scene = useMemo(() => buildDemoCharacterLineartScene(presetId, 224), [presetId]);

  const activeRunKey = `${presetId}:${gapClosePx}:${underStrokeTrap ? 1 : 0}`;

  const syncResult = useMemo<AutoFlattingResult>(
    () =>
      executeAutoFlattingSync({
        lineartRgba: scene.lineartRgba,
        width: scene.width,
        height: scene.height,
        gapClosePx,
        seeds: scene.seeds,
        underStrokeTrapPx: underStrokeTrap ? 1 : 0,
      }),
    [scene, gapClosePx, underStrokeTrap],
  );

  const result =
    gpuRunEntry && gpuRunEntry.key === activeRunKey ? gpuRunEntry.result : syncResult;

  useEffect(() => {
    let cancelled = false;
    void probeWebGpuComputeCapabilities().then((caps) => {
      if (!cancelled) setCapabilities(caps);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!capabilities?.available) return;
    let cancelled = false;
    void executeAutoFlattingWithGapClose({
      lineartRgba: scene.lineartRgba,
      width: scene.width,
      height: scene.height,
      gapClosePx,
      seeds: scene.seeds,
      underStrokeTrapPx: underStrokeTrap ? 1 : 0,
      preferWebGpu: true,
    }).then((nextResult) => {
      if (!cancelled && nextResult.backend === "webgpu-compute") {
        setGpuRunEntry({ key: activeRunKey, result: nextResult });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [capabilities?.available, scene, gapClosePx, underStrokeTrap, activeRunKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    const previewRgba = compositeFlattingPreview({
      width: scene.width,
      height: scene.height,
      flattingRgba: result.flattingRgba,
      lineartRgba: scene.lineartRgba,
      originalInkBarrier: result.originalInkBarrier,
      closedBarrier: result.closedBarrier,
      showGapBridges,
    });

    if (typeof ctx.createImageData === "function" && typeof ctx.putImageData === "function") {
      const imgData = ctx.createImageData(scene.width, scene.height);
      imgData.data.set(previewRgba);
      ctx.putImageData(imgData, 0, 0);
    }
  }, [scene, result, showGapBridges]);

  const dispatchGroupsX = Math.ceil(scene.width / WGSL_WORKGROUP_SIZE);
  const dispatchGroupsY = Math.ceil(scene.height / WGSL_WORKGROUP_SIZE);
  const isSealed = !result.leakedToBorder && result.leakedPixelCount === 0;

  const stageTimings: readonly number[] = [
    result.timingsMs.gapCloseMorphMs,
    result.timingsMs.jumpFloodMs,
    result.timingsMs.regionFlattingMs,
  ];

  const handleRunBenchmark = (sizePx: 512 | 1024): void => {
    const measured = benchmarkAutoFlattingThroughput(sizePx, Math.max(4, gapClosePx));
    setBenchmarkResult(measured);
  };

  return (
    <section
      className={className ? `wgf-shell ${className}` : "wgf-shell"}
      data-testid="wgf-workbench-panel"
      aria-label={tx("WebGPU 자동 플랫팅 워크벤치", "WebGPU Auto-Flatting Workbench")}
    >
      <header className="wgf-header">
        <div>
          <p className="wgf-kicker">WebGPU Compute · Jump-Flooding (JFA)</p>
          <h2 className="wgf-title">
            {tx(
              "WebGPU 자동 플랫팅 · 1~16px 선화 틈새 닫기 엔진",
              "WebGPU Auto-Flatting & 1–16px Lineart Gap-Closing Engine",
            )}
          </h2>
          <p className="wgf-subtitle">
            {tx(
              "WGSL Compute 셰이더 3종(팽창·침식, JFA, 1px 언더스트로크 트랩)과 완전 동치 TypedArray 폴백으로 열린 선화 틈새의 외부 누수를 실시간 차단합니다.",
              "Blocks flatting leaks through open lineart gaps using 3 WGSL compute passes (morph close, JFA, 1px under-stroke trap) with a bit-equivalent TypedArray fallback.",
            )}
          </p>
        </div>

        <div className="wgf-badge-row">
          <span
            className={
              result.backend === "webgpu-compute"
                ? "wgf-badge wgf-badge--good"
                : "wgf-badge wgf-badge--cool"
            }
            data-testid="wgf-backend-badge"
          >
            <Cpu size={14} aria-hidden="true" />
            {result.backend === "webgpu-compute"
              ? "WebGPU Compute"
              : tx("TypedArray 동치 폴백", "TypedArray Fallback")}
          </span>

          <span
            className={
              capabilities?.supportsSubgroups
                ? "wgf-badge wgf-badge--good"
                : "wgf-badge"
            }
            data-testid="wgf-subgroups-badge"
          >
            <Sparkles size={14} aria-hidden="true" />
            {capabilities?.supportsSubgroups
              ? tx("Subgroups 지원", "Subgroups Ready")
              : tx("Subgroups 미지원", "Subgroups Unavailable")}
          </span>

          <span className="wgf-badge wgf-num" data-testid="wgf-timing-badge">
            <Gauge size={14} aria-hidden="true" />
            {result.processingTimeMs.toFixed(2)} ms
          </span>
        </div>
      </header>

      <div className="wgf-grid">
        <div className="wgf-column">
          <div className="wgf-card">
            <div className="wgf-card-head">
              <h3 className="wgf-card-title">
                {isSealed ? (
                  <ShieldCheck size={16} aria-hidden="true" />
                ) : (
                  <ShieldAlert size={16} aria-hidden="true" />
                )}
                {tx("실시간 캐릭터 선화 플랫팅 캔버스", "Live Character Lineart Flatting Stage")}
              </h3>
              <span className="wgf-card-meta wgf-num">
                {scene.width}×{scene.height} px
              </span>
            </div>

            <div className="wgf-stage-frame">
              <canvas
                ref={canvasRef}
                width={scene.width}
                height={scene.height}
                className="wgf-canvas"
                data-testid="wgf-preview-canvas"
                aria-label={tx(
                  "열린 틈새 선화 자동 플랫팅 미리보기 캔버스",
                  "Open-gap lineart auto-flatting preview canvas",
                )}
              />

              <div className="wgf-metrics-grid" aria-live="polite">
                <div className="wgf-metric-cell">
                  <span className="wgf-metric-label">
                    {tx("누수 차단율", "Leak Block Rate")}
                  </span>
                  <span
                    className={
                      isSealed
                        ? "wgf-metric-value wgf-metric-value--good wgf-num"
                        : "wgf-metric-value wgf-metric-value--bad wgf-num"
                    }
                    data-testid="wgf-leak-block-rate"
                  >
                    {result.leakBlockRatePct}%
                  </span>
                </div>

                <div className="wgf-metric-cell">
                  <span className="wgf-metric-label">
                    {tx("외부 누수", "Exterior Leak")}
                  </span>
                  <span
                    className={
                      result.leakedPixelCount === 0
                        ? "wgf-metric-value wgf-metric-value--good wgf-num"
                        : "wgf-metric-value wgf-metric-value--bad wgf-num"
                    }
                    data-testid="wgf-leaked-pixels"
                  >
                    {result.leakedPixelCount.toLocaleString()} px
                  </span>
                </div>

                <div className="wgf-metric-cell">
                  <span className="wgf-metric-label">
                    {tx("채색 픽셀", "Filled Pixels")}
                  </span>
                  <span className="wgf-metric-value wgf-num" data-testid="wgf-filled-pixels">
                    {result.filledPixelCount.toLocaleString()}
                  </span>
                </div>

                <div className="wgf-metric-cell">
                  <span className="wgf-metric-label">
                    {tx("틈새 브리지 / 트랩", "Bridges / Trap")}
                  </span>
                  <span className="wgf-metric-value wgf-num" data-testid="wgf-bridge-trap-count">
                    {result.bridgedPixelCount} / {result.underStrokeTrappedPixelCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="wgf-region-list" data-testid="wgf-region-list">
              {result.regions.map((region) => (
                <div
                  key={region.id}
                  className="wgf-region-item"
                  data-testid={`wgf-region-${region.label}`}
                >
                  <div className="wgf-region-top">
                    <span className="wgf-region-name">
                      <span className={resolveSwatchClass(region.label)} aria-hidden="true" />
                      {resolveRegionDisplayName(region.label, tx)}
                    </span>
                    <span
                      className={
                        region.leakedToBorder
                          ? "wgf-region-status wgf-region-status--bad"
                          : "wgf-region-status wgf-region-status--good"
                      }
                    >
                      {region.leakedToBorder
                        ? tx("누수", "Leaked")
                        : tx("봉합", "Sealed")}
                    </span>
                  </div>
                  <span className="wgf-region-meta wgf-num">
                    {region.filledPixelCount.toLocaleString()} px ·{" "}
                    {region.boundingBox
                      ? `${region.boundingBox.width}×${region.boundingBox.height}`
                      : "0×0"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="wgf-column">
          <div className="wgf-card">
            <div className="wgf-card-head">
              <h3 className="wgf-card-title">
                <Layers size={16} aria-hidden="true" />
                {tx("틈새 봉합 제어 (0~16px)", "Gap-Closing Controls (0–16px)")}
              </h3>
              <span className="wgf-card-meta wgf-num">
                JFA {result.jfaPassCount} {tx("패스", "passes")}
              </span>
            </div>

            <div className="wgf-btn-row" role="group" aria-label={tx("데모 선화 프리셋", "Demo lineart presets")}>
              <button
                type="button"
                className="wgf-btn"
                aria-pressed={presetId === "portrait-open-gaps"}
                data-testid="wgf-preset-portrait"
                onClick={() => setPresetId("portrait-open-gaps")}
              >
                {tx("캐릭터 기본 틈새 (4·6·8px)", "Portrait Gaps (4/6/8px)")}
              </button>
              <button
                type="button"
                className="wgf-btn"
                aria-pressed={presetId === "wide-gap-sketch"}
                data-testid="wgf-preset-wide"
                onClick={() => setPresetId("wide-gap-sketch")}
              >
                {tx("러프 광폭 틈새 (6·10·12px)", "Wide Sketch Gaps (6/10/12px)")}
              </button>
            </div>

            <div className="wgf-slider-block">
              <div className="wgf-slider-header">
                <label htmlFor={sliderId} className="wgf-slider-label">
                  {tx("선화 틈새 닫기 반경 (gapClosePx)", "Lineart Gap-Close Radius (gapClosePx)")}
                </label>
                <span className="wgf-slider-value wgf-num" data-testid="wgf-gap-value">
                  {gapClosePx} px
                </span>
              </div>
              <input
                id={sliderId}
                type="range"
                min={0}
                max={MAX_WEBGPU_GAP_CLOSE_PX}
                step={1}
                value={gapClosePx}
                className="wgf-range"
                data-testid="wgf-gap-slider"
                onChange={(event) => setGapClosePx(Number(event.target.value))}
              />
            </div>

            <div className="wgf-btn-row">
              {GAP_QUICK_STEPS.map((stepPx) => (
                <button
                  key={stepPx}
                  type="button"
                  className="wgf-btn wgf-num"
                  aria-pressed={gapClosePx === stepPx}
                  data-testid={`wgf-gap-preset-${stepPx}`}
                  onClick={() => setGapClosePx(stepPx)}
                >
                  {stepPx}px
                </button>
              ))}
              <button
                type="button"
                className="wgf-btn"
                aria-pressed={underStrokeTrap}
                data-testid="wgf-toggle-trap"
                onClick={() => setUnderStrokeTrap((prev) => !prev)}
              >
                {tx("1px 선화 트랩", "1px Under-Stroke Trap")}
              </button>
              <button
                type="button"
                className="wgf-btn"
                aria-pressed={showGapBridges}
                data-testid="wgf-toggle-bridges"
                onClick={() => setShowGapBridges((prev) => !prev)}
              >
                {tx("봉합선 강조", "Highlight Bridges")}
              </button>
            </div>
          </div>

          <div className="wgf-card">
            <div className="wgf-card-head">
              <h3 className="wgf-card-title">
                <Cpu size={16} aria-hidden="true" />
                {tx("WGSL Compute 3단계 파이프라인", "WGSL 3-Stage Compute Pipeline")}
              </h3>
              <span className="wgf-card-meta wgf-num">
                {dispatchGroupsX}×{dispatchGroupsY} @workgroup_size(16, 16)
              </span>
            </div>

            <ol className="wgf-pipeline-list" data-testid="wgf-pipeline-list">
              {WGSL_FLATTING_SHADER_SPECS.map((spec, idx) => (
                <li key={spec.id} className="wgf-pipeline-item">
                  <div className="wgf-pipeline-row">
                    <span className="wgf-pipeline-name">
                      {tx(spec.titleKo, spec.titleEn)}
                    </span>
                    <span className="wgf-pipeline-code wgf-num">
                      {spec.entryPoints.join(" / ")} · {(stageTimings[idx] ?? 0).toFixed(2)} ms
                    </span>
                  </div>
                  <p className="wgf-pipeline-desc">{tx(spec.summaryKo, spec.summaryEn)}</p>
                </li>
              ))}
            </ol>

            <dl className="wgf-cap-list" data-testid="wgf-capabilities-list">
              <div className="wgf-cap-pair">
                <dt>{tx("어댑터 상태", "Adapter Status")}</dt>
                <dd>
                  {capabilities
                    ? resolveReasonText(capabilities.reasonCode, tx)
                    : tx("프로브 대기 중", "Probing adapter")}
                </dd>
              </div>
              <div className="wgf-cap-pair">
                <dt>maxComputeWorkgroupSizeX</dt>
                <dd className="wgf-num">
                  {capabilities ? capabilities.maxComputeWorkgroupSizeX : 0}
                </dd>
              </div>
              <div className="wgf-cap-pair">
                <dt>maxStorageBufferBindingSize</dt>
                <dd className="wgf-num">
                  {capabilities ? formatBytesMiB(capabilities.maxStorageBufferBindingSize) : "0 MiB"}
                </dd>
              </div>
              <div className="wgf-cap-pair">
                <dt>{tx("어댑터 식별자", "Adapter Identity")}</dt>
                <dd>{capabilities ? capabilities.adapterName : "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="wgf-card">
            <div className="wgf-card-head">
              <h3 className="wgf-card-title">
                <Gauge size={16} aria-hidden="true" />
                {tx("실시간 처리량 벤치마크", "Live Throughput Benchmark")}
              </h3>
              <span className="wgf-card-meta">512² / 1024²</span>
            </div>

            <div className="wgf-btn-row">
              <button
                type="button"
                className="wgf-btn wgf-btn--primary"
                data-testid="wgf-bench-512"
                onClick={() => handleRunBenchmark(512)}
              >
                {tx("512×512 실측", "Benchmark 512×512")}
              </button>
              <button
                type="button"
                className="wgf-btn wgf-btn--primary"
                data-testid="wgf-bench-1024"
                onClick={() => handleRunBenchmark(1024)}
              >
                {tx("1024×1024 실측", "Benchmark 1024×1024")}
              </button>
            </div>

            {benchmarkResult && (
              <div className="wgf-bench-result" data-testid="wgf-bench-output" aria-live="polite">
                <div className="wgf-bench-stat">
                  <span className="wgf-bench-label">{tx("해상도", "Resolution")}</span>
                  <span className="wgf-bench-val wgf-num">
                    {benchmarkResult.sizePx}×{benchmarkResult.sizePx}
                  </span>
                </div>
                <div className="wgf-bench-stat">
                  <span className="wgf-bench-label">{tx("처리 시간", "Duration")}</span>
                  <span className="wgf-bench-val wgf-num">
                    {benchmarkResult.durationMs.toFixed(2)} ms
                  </span>
                </div>
                <div className="wgf-bench-stat">
                  <span className="wgf-bench-label">{tx("처리량", "Throughput")}</span>
                  <span className="wgf-bench-val wgf-num">
                    {benchmarkResult.megapixelsPerSec.toFixed(2)} MP/s
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default WebGpuFlattingWorkbenchPanel;
