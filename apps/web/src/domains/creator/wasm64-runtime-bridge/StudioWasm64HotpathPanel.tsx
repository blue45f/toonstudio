/**
 * Rust `studio-wasm64-drawing-core.wasm` 런타임 핫패스 상태 · 실측 벤치마크 · 라우팅 제어 패널.
 *
 * - Calm Atelier 시맨틱 토큰 전용 (원시 색상 0건 · 브라우저 스토리지 미사용 · 명시적 전이 속성만 사용).
 * - props 없이 단독 렌더 가능하며, 로드된 `.wasm` 실제 바이트 크기 · 실측 Wasm vs JS 가속 배율 ·
 *   5대 핫패스 라우팅 토글을 한국어/영어(`useI18n`)로 제공한다.
 */

import { Activity, CheckCircle2, Cpu, Gauge, RefreshCw, SlidersHorizontal, Zap } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  benchmarkWasm64VsJsHotpaths,
  DEFAULT_WASM64_HOTPATH_ROUTING,
  loadStudioWasm64HotpathRuntime,
  type HotpathBenchmarkSuiteResult,
  type StudioWasm64HotpathMetadata,
  type StudioWasm64HotpathRuntime,
  type Wasm64CpuTier,
  type Wasm64HotpathRouteKey,
  type Wasm64HotpathRoutingConfig,
} from "./wasm64-hotpath-loader";

export interface StudioWasm64HotpathPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly wasmUrl?: string;
  readonly wasmBytes?: Uint8Array | ArrayBuffer;
  readonly preferMemory64?: boolean;
  readonly preloadedRuntime?: StudioWasm64HotpathRuntime;
  readonly initialRouting?: Partial<Wasm64HotpathRoutingConfig>;
  readonly benchmarkDimension?: number;
  readonly autoRunBenchmark?: boolean;
  readonly onRoutingChange?: (routing: Wasm64HotpathRoutingConfig) => void;
  readonly onBenchmarkComplete?: (result: HotpathBenchmarkSuiteResult) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const SWITCH_BASE = `flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const ROUTE_ITEMS: readonly {
  readonly key: Wasm64HotpathRouteKey;
  readonly ko: string;
  readonly en: string;
  readonly descKo: string;
  readonly descEn: string;
}[] = [
  {
    key: "unsharp512",
    ko: "512² 언샤프 마스크",
    en: "512² Unsharp Mask",
    descKo: "분리형 가우시안 + 임계값 선명화 제로카피",
    descEn: "Separable Gaussian + threshold sharpen zero-copy",
  },
  {
    key: "impasto25d",
    ko: "2.5D 임파스토 법선",
    en: "2.5D Impasto Sobel",
    descKo: "3×3 Sobel 높이장 Blinn-Phong 광원 셰이딩",
    descEn: "3×3 Sobel height-field Blinn-Phong lighting",
  },
  {
    key: "gaussianBlur",
    ko: "선택 경계 가우시안 블러",
    en: "Masked Gaussian Blur",
    descKo: "선택 마스크 외부 번짐 0% 분리형 블러",
    descEn: "Zero-bleed masked separable blur",
  },
  {
    key: "km16SpectralMix",
    ko: "KM 16파장 분광 혼색",
    en: "KM 16-Band Spectral Mix",
    descKo: "400~700nm 5안료 물리 감산 혼색 스트립",
    descEn: "400-700nm 5-pigment subtractive mix strip",
  },
  {
    key: "xorTileDelta",
    ko: "타일 XOR 델타 · FNV-1a",
    en: "Tile XOR Delta · FNV-1a",
    descKo: "증분 히스토리 XOR 차분 및 무결성 체크섬",
    descEn: "Incremental history XOR diff & integrity hash",
  },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  return `${bytes} B`;
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return `${ms.toFixed(2)} ms`;
}

function formatCpuTierLabel(tier: Wasm64CpuTier, isEn: boolean): string {
  switch (tier) {
    case "wasm-relaxed-simd":
      return "Relaxed-SIMD";
    case "wasm-simd128":
      return "SIMD128";
    case "wasm-scalar":
      return isEn ? "Scalar Wasm" : "스칼라 Wasm";
    case "js-fallback":
      return isEn ? "JS Fallback" : "JS 폴백";
  }
}

function formatAddressWidthBadge(meta: StudioWasm64HotpathMetadata, isEn: boolean): string {
  if (meta.memory64Active && meta.addressBits === 64) {
    return "WASM64 (memory64 · i64)";
  }
  if (meta.backendMode === "rust-wasm") {
    return isEn ? "WASM32 Fallback (i32)" : "WASM32 폴백 (i32)";
  }
  return isEn ? "JS Fallback (32-bit)" : "JS 폴백 (32비트)";
}

/** Rust `.wasm` 런타임 핫패스 상태 · 실측 속도 배율 · 라우팅 토글 패널. */
export function StudioWasm64HotpathPanel({
  locale,
  className,
  wasmUrl,
  wasmBytes,
  preferMemory64,
  preloadedRuntime,
  initialRouting,
  benchmarkDimension = 512,
  autoRunBenchmark = false,
  onRoutingChange,
  onBenchmarkComplete,
}: StudioWasm64HotpathPanelProps = {}): ReactElement {
  const headingId = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const ownedRuntimeRef = useRef<StudioWasm64HotpathRuntime | null>(null);
  const [runtime, setRuntime] = useState<StudioWasm64HotpathRuntime | null>(preloadedRuntime ?? null);
  const [metadata, setMetadata] = useState<StudioWasm64HotpathMetadata | null>(() =>
    preloadedRuntime ? preloadedRuntime.getMetadata() : null,
  );
  const [routing, setRouting] = useState<Wasm64HotpathRoutingConfig>(() => ({
    ...DEFAULT_WASM64_HOTPATH_ROUTING,
    ...(preloadedRuntime ? preloadedRuntime.getRouting() : initialRouting),
  }));
  const [loading, setLoading] = useState<boolean>(!preloadedRuntime);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);
  const [benchDim, setBenchDim] = useState<number>(benchmarkDimension);
  const [benchmark, setBenchmark] = useState<HotpathBenchmarkSuiteResult | null>(null);

  const runBenchmarkNow = useCallback(
    (targetRuntime: StudioWasm64HotpathRuntime, dim: number) => {
      const result = benchmarkWasm64VsJsHotpaths(targetRuntime, {
        dimension: dim,
        kmStripPixels: dim >= 512 ? 4096 : 1024,
      });
      setBenchmark(result);
      setMetadata(targetRuntime.getMetadata());
      onBenchmarkComplete?.(result);
    },
    [onBenchmarkComplete],
  );

  useEffect(() => {
    if (preloadedRuntime) {
      setRuntime(preloadedRuntime);
      setMetadata(preloadedRuntime.getMetadata());
      setRouting(preloadedRuntime.getRouting());
      setLoading(false);
      setLoadError(null);
      if (autoRunBenchmark) {
        runBenchmarkNow(preloadedRuntime, benchDim);
      }
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void loadStudioWasm64HotpathRuntime({
      wasmUrl,
      wasmBytes,
      preferMemory64,
      initialRouting,
    })
      .then((loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        ownedRuntimeRef.current?.dispose();
        ownedRuntimeRef.current = loaded;
        setRuntime(loaded);
        setMetadata(loaded.getMetadata());
        setRouting(loaded.getRouting());
        setLoading(false);
        if (autoRunBenchmark) {
          runBenchmarkNow(loaded, benchDim);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      if (ownedRuntimeRef.current) {
        ownedRuntimeRef.current.dispose();
        ownedRuntimeRef.current = null;
      }
    };
  }, [autoRunBenchmark, benchDim, initialRouting, preferMemory64, preloadedRuntime, reloadNonce, runBenchmarkNow, wasmBytes, wasmUrl]);

  const handleToggleRoute = useCallback(
    (key: Wasm64HotpathRouteKey) => {
      setRouting((prev) => {
        const next: Wasm64HotpathRoutingConfig = { ...prev, [key]: !prev[key] };
        runtime?.setRouting(next);
        onRoutingChange?.(next);
        return next;
      });
    },
    [onRoutingChange, runtime],
  );

  const handleSetAllRoutes = useCallback(
    (enabled: boolean) => {
      const next: Wasm64HotpathRoutingConfig = {
        unsharp512: enabled,
        impasto25d: enabled,
        gaussianBlur: enabled,
        km16SpectralMix: enabled,
        xorTileDelta: enabled,
      };
      runtime?.setRouting(next);
      setRouting(next);
      onRoutingChange?.(next);
    },
    [onRoutingChange, runtime],
  );

  const handleRunBenchmarkClick = useCallback(() => {
    if (!runtime) return;
    runBenchmarkNow(runtime, benchDim);
  }, [benchDim, runBenchmarkNow, runtime]);

  const handleReloadBinary = useCallback(() => {
    if (preloadedRuntime) {
      setMetadata(preloadedRuntime.getMetadata());
      return;
    }
    setReloadNonce((n) => n + 1);
  }, [preloadedRuntime]);

  const activeWasmRouteCount = ROUTE_ITEMS.filter((item) => routing[item.key]).length;
  const isWasmLoaded = metadata?.backendMode === "rust-wasm";

  return (
    <section
      aria-labelledby={headingId}
      className={`flex flex-col gap-4 rounded-xl border border-line bg-card p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-semibold text-fg">
              {pick("Rust Wasm64 런타임 핫패스 브리지", "Rust Wasm64 Runtime Hotpath Bridge")}
            </h2>
          </div>
          <p className="text-xs text-muted">
            {pick(
              "실물 studio-wasm64-drawing-core.wasm 선형 메모리 제로카피 커널 직결 상태와 실측 가속 배율",
              "Live studio-wasm64-drawing-core.wasm zero-copy linear memory kernels and measured speedup",
            )}
          </p>
        </div>
        <span
          data-testid="wasm64-hotpath-backend-badge"
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
            isWasmLoaded
              ? "border-accent bg-accent text-on-accent"
              : "border-line-strong bg-raised text-fg"
          }`}
        >
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          {loading
            ? pick("Wasm 로드 중…", "Loading Wasm…")
            : isWasmLoaded && metadata
              ? `${pick("Rust Wasm 활성", "Rust Wasm Active")} · ${formatAddressWidthBadge(metadata, isEn)} · ${formatCpuTierLabel(metadata.cpuTier, isEn)}`
              : pick("JS 동등 폴백", "JS Parity Fallback")}
        </span>
      </header>

      {loadError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-raised p-3 text-xs text-fg"
        >
          <span>{pick(`바이너리 초기화 오류: ${loadError}`, `Binary load error: ${loadError}`)}</span>
          <button type="button" onClick={handleReloadBinary} className={BTN_OUTLINE}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("다시 시도", "Retry")}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-lg border border-line bg-raised p-3">
          <div className="text-xs text-muted">{pick("로드된 .wasm 크기", "Loaded .wasm Size")}</div>
          <div
            data-testid="wasm64-hotpath-byte-size"
            className="mt-1 text-sm font-semibold tabular-nums text-fg"
          >
            {metadata
              ? metadata.wasmByteLength > 0
                ? `${formatBytes(metadata.wasmByteLength)} (${metadata.wasmByteLength.toLocaleString("en-US")} B)`
                : pick("0 B (JS 폴백)", "0 B (JS Fallback)")
              : "—"}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-raised p-3">
          <div className="text-xs text-muted">{pick("실측 Wasm vs JS 배율", "Measured Wasm vs JS")}</div>
          <div
            data-testid="wasm64-hotpath-speedup"
            className="mt-1 text-sm font-semibold tabular-nums text-fg"
          >
            {benchmark
              ? `${benchmark.overallSpeedupRatio.toFixed(2)}×`
              : pick("측정 대기", "Not Measured")}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-raised p-3">
          <div className="text-xs text-muted">{pick("선형 메모리 아레나", "Linear Memory Arena")}</div>
          <div
            data-testid="wasm64-hotpath-address-mode"
            className="mt-1 text-sm font-semibold tabular-nums text-fg"
          >
            {metadata && metadata.linearMemoryBytes > 0
              ? `${formatBytes(metadata.linearMemoryBytes)} · ${formatAddressWidthBadge(metadata, isEn)}`
              : pick("미할당", "Unallocated")}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-raised p-3">
          <div className="text-xs text-muted">{pick("Wasm 라우팅 활성", "Active Wasm Routes")}</div>
          <div
            data-testid="wasm64-hotpath-route-count"
            className="mt-1 text-sm font-semibold tabular-nums text-fg"
          >
            {`${activeWasmRouteCount} / ${ROUTE_ITEMS.length}`}
          </div>
        </div>
      </div>

      {metadata?.fallbackReason ? (
        <p className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-muted">
          {pick(`폴백 사유: ${metadata.fallbackReason}`, `Fallback reason: ${metadata.fallbackReason}`)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="wasm64-hotpath-run-benchmark"
            disabled={loading || !runtime}
            onClick={handleRunBenchmarkClick}
            className={BTN_PRIMARY}
          >
            <Gauge className="h-4 w-4" aria-hidden="true" />
            {pick(`Wasm vs JS 실측 (${benchDim}²)`, `Run Wasm vs JS (${benchDim}²)`)}
          </button>
          <button
            type="button"
            onClick={() => setBenchDim((d) => (d === 512 ? 256 : 512))}
            className={BTN_OUTLINE}
          >
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            {pick(`해상도 전환 (${benchDim === 512 ? "256²" : "512²"})`, `Switch Size (${benchDim === 512 ? "256²" : "512²"})`)}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => handleSetAllRoutes(true)} className={BTN_OUTLINE}>
            {pick("전체 Wasm", "All Wasm")}
          </button>
          <button type="button" onClick={() => handleSetAllRoutes(false)} className={BTN_OUTLINE}>
            {pick("전체 JS 비교", "All JS")}
          </button>
          <button type="button" onClick={handleReloadBinary} className={BTN_OUTLINE}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("재로드", "Reload")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
          <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("커널별 핫패스 라우팅 토글", "Per-Kernel Hotpath Routing")}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ROUTE_ITEMS.map((item) => {
            const enabled = routing[item.key];
            return (
              <button
                key={item.key}
                type="button"
                role="switch"
                aria-checked={enabled}
                data-testid={`wasm64-route-toggle-${item.key}`}
                onClick={() => handleToggleRoute(item.key)}
                className={`${SWITCH_BASE} ${
                  enabled
                    ? "border-accent bg-raised text-fg"
                    : "border-line bg-canvas text-muted hover:border-line-strong"
                }`}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-fg">{pick(item.ko, item.en)}</span>
                  <span className="text-xs text-muted">{pick(item.descKo, item.descEn)}</span>
                </span>
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                    enabled
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-muted"
                  }`}
                >
                  {enabled ? "Wasm" : "JS"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-fg">
          <span>{pick("실측 벤치마크 및 바이트 정합 결과", "Measured Benchmark & Byte Parity")}</span>
          {benchmark ? (
            <span
              data-testid="wasm64-hotpath-parity-badge"
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {benchmark.allByteExactMatch
                ? pick("전 커널 바이트 일치 (0 diff)", "All Kernels Byte-Exact (0 diff)")
                : pick("일부 채널 차이 감지", "Channel Delta Detected")}
            </span>
          ) : null}
        </div>

        {!benchmark ? (
          <p className="rounded-lg border border-line bg-canvas p-3 text-xs text-muted">
            {pick(
              "상단의 실측 버튼을 눌러 실제 컴파일된 Rust .wasm과 JS 폴백의 처리 시간 및 픽셀 일치 여부를 측정하세요.",
              "Run the benchmark above to measure actual Rust .wasm vs JS timings and byte-level pixel parity.",
            )}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-raised text-muted">
                  <th className="px-3 py-2 font-semibold">{pick("커널", "Kernel")}</th>
                  <th className="px-3 py-2 font-semibold">{pick("작업량", "Workload")}</th>
                  <th className="px-3 py-2 font-semibold">Wasm</th>
                  <th className="px-3 py-2 font-semibold">JS</th>
                  <th className="px-3 py-2 font-semibold">{pick("배율", "Speedup")}</th>
                  <th className="px-3 py-2 font-semibold">{pick("정합", "Parity")}</th>
                </tr>
              </thead>
              <tbody>
                {benchmark.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 font-medium text-fg">{pick(entry.labelKo, entry.labelEn)}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{entry.workloadSummary}</td>
                    <td className="px-3 py-2 tabular-nums text-fg">{formatMs(entry.wasmMs)}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{formatMs(entry.jsMs)}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums text-fg">
                      {`${entry.speedupRatio.toFixed(2)}×`}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-fg">
                      {entry.byteExactMatch
                        ? pick("0 diff", "0 diff")
                        : `Δ${entry.maxChannelDiff}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
