import { Cpu, Gauge, Layers, Play, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import {
  detectChromeNextGenCapabilities,
  probeChromeNextGenCapabilitiesAsync,
  type ChromeNextGenCapabilitiesReport,
  type ChromeNextGenCapabilityStatus,
  type ChromeNextGenProbeEnv,
  type ChromeNextGenTurboTier,
} from "./chrome-nextgen-platform-accelerator";
import {
  createWasm64RasterEngine,
  type Wasm64RasterBenchmarkReport,
  type Wasm64RasterEngineOptions,
} from "./wasm64-raster-kernel";

import "./chrome-nextgen-wasm64-panel.css";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("ChromeWasm64PerformancePanel", ko, en);

export interface ChromeWasm64PerformancePanelProps {
  /** 테스트·진단 주입용 피처 프로브 환경. 생략하면 현재 브라우저 런타임을 실측한다. */
  readonly probeEnv?: ChromeNextGenProbeEnv;
  /** 테스트·진단 주입용 Wasm64 엔진 옵션. */
  readonly engineOptions?: Wasm64RasterEngineOptions;
}

function formatByteScale(bytes: bigint): string {
  const gib = BigInt(1024) * BigInt(1024) * BigInt(1024);
  const mib = BigInt(1024) * BigInt(1024);
  if (bytes >= gib) {
    const value = Number(bytes) / Number(gib);
    return `${value.toFixed(1)} GiB`;
  }
  const value = Number(bytes) / Number(mib);
  return `${value.toFixed(1)} MiB`;
}

function tierBadgeLabel(tier: ChromeNextGenTurboTier): string {
  switch (tier) {
    case "chrome-max-turbo":
      return bi("Chrome 최대 가속", "Chrome Max Turbo");
    case "chrome-accelerated":
      return bi("고속 가속 활성", "Accelerated");
    case "standard-compatible":
      return bi("표준 호환 모드", "Standard Compatible");
  }
}

function statusPillLabel(status: ChromeNextGenCapabilityStatus): string {
  switch (status) {
    case "active":
      return bi("활성", "Active");
    case "partial":
      return bi("부분 지원", "Partial");
    case "unsupported":
      return bi("미지원", "Unsupported");
  }
}

function statusPillClass(status: ChromeNextGenCapabilityStatus): string {
  switch (status) {
    case "active":
      return "wasm64-pill wasm64-pill--active";
    case "partial":
      return "wasm64-pill wasm64-pill--partial";
    case "unsupported":
      return "wasm64-pill wasm64-pill--unsupported";
  }
}

function backendDisplayLabel(backend: Wasm64RasterBenchmarkReport["backend"]): string {
  return backend === "wasm64-native"
    ? bi("Memory64 (i64 네이티브)", "Memory64 (i64 Native)")
    : bi("안전 폴백 (JS TypedArray)", "Safe Fallback (JS TypedArray)");
}

/**
 * 초고속 엔진 · 메모리64 부스트 라이브 패널.
 *
 * - 현재 브라우저의 Chrome 차세대 웹 신기술 8종을 UA 스니핑 없이 실측한다.
 * - "성능 지금 측정해 보기" 클릭 시 실제 Wasm64 래스터 커널이 512×512(262,144픽셀)
 *   버퍼에 브러시 스탬핑·Source-Over·Multiply·256×3 LUT를 실행해 실측 ms와 MPix/s를 표시한다.
 */
export function ChromeWasm64PerformancePanel({
  probeEnv,
  engineOptions,
}: ChromeWasm64PerformancePanelProps = {}) {
  useBilingualI18nRevision();

  const [report, setReport] = useState<ChromeNextGenCapabilitiesReport>(() =>
    detectChromeNextGenCapabilities(probeEnv),
  );
  const [benchmark, setBenchmark] = useState<Wasm64RasterBenchmarkReport | null>(null);
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void probeChromeNextGenCapabilitiesAsync(probeEnv).then((resolved) => {
      if (!cancelled) setReport(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [probeEnv]);

  const handleRunBenchmark = useCallback(() => {
    setRunning(true);
    setErrorMessage(null);
    let engine: ReturnType<typeof createWasm64RasterEngine> | null = null;
    try {
      engine = createWasm64RasterEngine(engineOptions);
      const measured = engine.runBenchmark({
        width: 512,
        height: 512,
        brushDabs: 12,
      });
      setBenchmark(measured);
    } catch (caught) {
      setErrorMessage(
        caught instanceof Error
          ? caught.message
          : bi(
              "연산 벤치마크를 실행하지 못했습니다. 다시 시도해 주세요.",
              "Could not run the compute benchmark. Please retry.",
            ),
      );
    } finally {
      engine?.dispose();
      setRunning(false);
    }
  }, [engineOptions]);

  const { profile, capabilities } = report;
  const maxStageMs = benchmark
    ? Math.max(0.001, ...benchmark.stages.map((stage) => stage.elapsedMs))
    : 1;

  return (
    <section
      className="wasm64-turbo-panel p-5"
      aria-labelledby="wasm64-turbo-heading"
      data-testid="chrome-wasm64-performance-panel"
    >
      <div className="wasm64-turbo-panel__ribbon" aria-hidden />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Zap size={18} aria-hidden />
            </span>
            <h2
              id="wasm64-turbo-heading"
              className="text-base font-bold text-fg [word-break:keep-all]"
            >
              {bi("초고속 엔진 · 메모리64 부스트", "Turbo Engine · Memory64 Boost")}
            </h2>
            <span className="wasm64-pill wasm64-pill--turbo">
              <Sparkles size={12} aria-hidden />
              {tierBadgeLabel(profile.tier)}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            {bi(
              "WebAssembly Memory64(i64) 64비트 래스터 커널과 Chrome 차세대 웹 신기술 8종을 이 기기에서 직접 점검하고, 512×512(262,144픽셀) 실제 버퍼로 연산 속도를 바로 측정합니다.",
              "Inspects WebAssembly Memory64 (i64) and 8 next-gen Chrome web capabilities on this device, and benchmarks live 512×512 (262,144-pixel) raster compute directly.",
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunBenchmark}
          disabled={running}
          aria-busy={running}
          className="wasm64-turbo-cta shrink-0"
          data-testid="wasm64-run-benchmark-btn"
        >
          <Play size={15} aria-hidden />
          {running
            ? bi("실측 실행 중…", "Measuring…")
            : bi("성능 지금 측정해 보기", "Run Live Benchmark")}
        </button>
      </div>

      {/* 상단 실측 런타임 프로필 요약 스트립 */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <div className="wasm64-metric-card">
          <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-fg-3">
            <Cpu size={13} aria-hidden />
            {bi("활성 주소 모드", "Active Address Mode")}
          </p>
          <p
            className="mt-1 text-sm font-bold text-fg tabular-nums"
            data-testid="wasm64-address-mode"
          >
            {profile.memory64Supported
              ? bi(
                  `i64 64비트 (최대 ${profile.maxMemory64AddressLimitGiB} GiB 정책)`,
                  `i64 64-bit (up to ${profile.maxMemory64AddressLimitGiB} GiB cap)`,
                )
              : bi("표준 폴백 (구형 런타임)", "Standard Fallback")}
          </p>
        </div>

        <div className="wasm64-metric-card">
          <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-fg-3">
            <Layers size={13} aria-hidden />
            {bi("권장 타일 · 워커 구성", "Recommended Tile & Workers")}
          </p>
          <p className="mt-1 text-sm font-bold text-fg tabular-nums">
            {`${profile.recommendedTileSizePx}px · ${profile.recommendedWorkerCount}${bi("워커", " workers")}`}
          </p>
        </div>

        <div className="wasm64-metric-card">
          <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-fg-3">
            <Gauge size={13} aria-hidden />
            {bi("크롬 신기술 활성도", "Chrome Next-Gen Ready")}
          </p>
          <p
            className="mt-1 text-sm font-bold text-fg tabular-nums"
            data-testid="chrome-nextgen-active-count"
          >
            {`${profile.activeCount} / ${profile.totalCount}`}
            <span className="ml-1.5 text-xs font-medium text-fg-3">
              {profile.preferredColorSpace === "display-p3" ? "Display-P3" : "sRGB"}
            </span>
          </p>
        </div>
      </div>

      {/* 오류 안내 */}
      {errorMessage ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-bad/40 bg-bad-soft px-4 py-3 text-xs font-medium text-bad"
        >
          {errorMessage}
        </div>
      ) : null}

      {/* 실측 벤치마크 결과 영역 (가짜 초기 수치 없음!) */}
      <div
        className="mt-4 rounded-xl border border-line bg-card/70 p-4"
        aria-live="polite"
        data-testid="wasm64-benchmark-results"
      >
        {benchmark ? (
          <>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="wasm64-metric-card wasm64-metric-card--highlight">
                <p className="text-[0.72rem] font-semibold text-fg-3">
                  {bi("512×512 전체 소요 시간", "Total 512×512 Elapsed")}
                </p>
                <p
                  className="mt-1 text-xl font-extrabold text-fg tabular-nums"
                  data-testid="wasm64-total-ms"
                >
                  {`${benchmark.totalElapsedMs.toFixed(2)} ms`}
                </p>
              </div>

              <div className="wasm64-metric-card wasm64-metric-card--highlight">
                <p className="text-[0.72rem] font-semibold text-fg-3">
                  {bi("실측 픽셀 처리량", "Measured Pixel Throughput")}
                </p>
                <p
                  className="mt-1 text-xl font-extrabold text-good tabular-nums"
                  data-testid="wasm64-throughput-mpix"
                >
                  {`${benchmark.throughputMegaPixelsPerSec.toFixed(1)} MPix/s`}
                </p>
              </div>

              <div className="wasm64-metric-card">
                <p className="text-[0.72rem] font-semibold text-fg-3">
                  {bi("실행 커널 모드", "Execution Kernel Mode")}
                </p>
                <p
                  className="mt-1 text-sm font-bold text-fg"
                  data-testid="wasm64-measured-backend"
                >
                  {backendDisplayLabel(benchmark.backend)}
                </p>
                <p className="mt-0.5 text-[0.7rem] text-fg-3 tabular-nums">
                  {`${bi("주소 예약", "Reserved")} ${formatByteScale(benchmark.reservedAddressSpaceBytes)} · ${bi("사용", "Committed")} ${formatByteScale(benchmark.committedBytes)}`}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {benchmark.stages.map((stage) => {
                const ratio = Math.max(0.06, Math.min(1, stage.elapsedMs / maxStageMs));
                return (
                  <div key={stage.id} className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-fg [word-break:keep-all]">
                        {stage.label}
                      </span>
                      <span className="text-fg-2 tabular-nums">
                        {`${stage.elapsedMs.toFixed(2)} ms · ${stage.megaPixelsPerSec.toFixed(1)} MPix/s`}
                      </span>
                    </div>
                    <div className="wasm64-stage-track" aria-hidden>
                      <span
                        className="wasm64-stage-bar"
                        style={{ transform: `scaleX(${ratio})` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/70 pt-2.5 text-[0.72rem] text-fg-3 tabular-nums">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck size={13} aria-hidden className="text-good" />
                {bi("임시 스크래치 아레나 전용 · 원본 원고 무변경", "Disposable scratch arena only · canonical work untouched")}
              </span>
              <span>
                {`${benchmark.pixelCount.toLocaleString("en-US")} px · ${bi("브러시 댑", "dabs")} ${benchmark.brushDabCount}회 · 체크섬 0x${benchmark.outputChecksum32.toString(16).padStart(8, "0")}`}
              </span>
            </p>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            {bi(
              "아직 측정 전입니다. 위 버튼을 누르면 실제 512×512(262,144픽셀) 버퍼에서 브러시 스탬핑·Source-Over 합성·곱하기 그림자 합성·256×3 톤 LUT 변환을 바로 돌려 실측 ms와 초당 백만 픽셀(MPix/s)을 보여 줍니다.",
              "Not measured yet. Click the button above to run brush stamping, Source-Over, Multiply shadow compositing, and 256×3 tonal LUT on a live 512×512 (262,144-pixel) buffer.",
            )}
          </p>
        )}
      </div>

      {/* Chrome 차세대 웹 신기술 8종 실측 매트릭스 */}
      <div className="mt-4">
        <h3 className="text-xs font-bold tracking-wide text-fg-2">
          {bi("크롬 차세대 웹 가속 기술 점검 (8종)", "Chrome Next-Gen Web Accelerators (8)")}
        </h3>
        <ul
          className="mt-2.5 grid gap-2 sm:grid-cols-2"
          aria-label={bi("크롬 차세대 웹 가속 기술 목록", "Chrome next-gen web capabilities")}
        >
          {capabilities.map((cap) => (
            <li
              key={cap.id}
              className={`wasm64-cap-card ${
                cap.status === "active"
                  ? "wasm64-cap-card--active"
                  : cap.status === "partial"
                    ? "wasm64-cap-card--partial"
                    : ""
              }`}
              data-capability-id={cap.id}
              data-capability-status={cap.status}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold text-fg [word-break:keep-all]">{cap.title}</p>
                <span className={statusPillClass(cap.status)}>
                  {statusPillLabel(cap.status)}
                </span>
              </div>
              <p className="mt-1 text-[0.72rem] leading-relaxed text-fg-2 [word-break:keep-all]">
                {cap.summary}
              </p>
              <p className="mt-1 text-[0.7rem] text-fg-3 tabular-nums [word-break:keep-all]">
                {cap.detail}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default ChromeWasm64PerformancePanel;
