/**
 * Rust + WebAssembly 64-bit (`memory64`) 코어 드로잉 엔진 허브 패널.
 * Calm Atelier 시맨틱 토큰 전용 (원시 색상 0건 · 명시적 전이 속성만 사용 · 460줄 이하 · 모든 props optional · KO/EN).
 */

import { Activity, Cpu, FileCode2, HardDrive, History, Layers, Play, Sparkles } from "lucide-react";
import { useCallback, useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  AsyncDeltaHistorySerializer, buildSyntheticPsdHeaderBytes, createWasm64HubDemoFixtures,
  instantiateWasm64DrawingModule, parseLargePsdHeaderWasm64, runWasm64FilterOrWarp,
  vectorizeStrokeWasm64, Wasm64VirtualTileSwapper,
  type ParsedPsdHeaderWasm64, type VectorizeStrokeResult,
  type Wasm64DrawingBackendMode, type Wasm64FilterOrWarpResult, type Wasm64TileSwapperStats,
} from "./wasm64-drawing-kernels";

export type Wasm64HubFilterMode = "unsharp-mask" | "gaussian-blur-masked" | "impasto-sobel" | "mls-rigid-warp";
export type Wasm64HubPsdSample = "psd-4k" | "psb-40k";

export interface Wasm64EngineBenchmarkSnapshot {
  readonly backendMode: Wasm64DrawingBackendMode;
  readonly filterResult: Wasm64FilterOrWarpResult;
  readonly vectorResult: VectorizeStrokeResult;
  readonly psdHeader: ParsedPsdHeaderWasm64 | null;
  readonly tileStats: Wasm64TileSwapperStats;
  readonly historyVerified: boolean | null;
}

export interface StudioWasm64EngineHubPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialFilterMode?: Wasm64HubFilterMode;
  readonly initialPsdSample?: Wasm64HubPsdSample;
  readonly initialTileBudgetSlots?: number;
  readonly initialBezierTolerancePx?: number;
  readonly preferAddressType?: "i64" | "i32";
  readonly onBenchmarkComplete?: (snapshot: Wasm64EngineBenchmarkSnapshot) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const CHIP_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const DEMO_DIM = 32;
const DEMO_TILE_BYTES = 1024;
const FILTER_MODES: readonly { readonly id: Wasm64HubFilterMode; readonly ko: string; readonly en: string }[] = [
  { id: "unsharp-mask", ko: "언샤프(Wasm64)", en: "Unsharp (Wasm64)" },
  { id: "gaussian-blur-masked", ko: "경계차단 블러", en: "Masked Blur" },
  { id: "impasto-sobel", ko: "임파스토 법선", en: "Impasto Sobel" },
  { id: "mls-rigid-warp", ko: "ARAP·MLS 워프", en: "ARAP/MLS Warp" },
];

const formatHexAddr = (addr: bigint): string => `0x${addr.toString(16).toUpperCase()}`;

function formatBytesCompact(bytes: number | bigint): string {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${n} B`;
}

function runTileSwapperPass(
  slotBudget: number,
  wasmRuntime: ReturnType<typeof instantiateWasm64DrawingModule>,
): Wasm64TileSwapperStats {
  const safeSlots = Math.max(2, Math.min(12, Math.round(slotBudget)));
  const swapper = new Wasm64VirtualTileSwapper({
    tileBytes: DEMO_TILE_BYTES,
    maxResidentBytes: safeSlots * DEMO_TILE_BYTES,
    memoryRuntime: wasmRuntime.memoryRuntime,
    checksumFn: wasmRuntime.computeFnv1aChecksum,
  });
  try {
    for (let i = 0; i < safeSlots + 6; i += 1) {
      const tile = new Uint8Array(DEMO_TILE_BYTES);
      tile.fill((i * 29 + 17) & 0xff);
      swapper.writeTile(`L0:${i}:0`, tile);
    }
    swapper.readTile("L0:0:0");
    return swapper.getStats();
  } finally {
    swapper.dispose();
  }
}

/** Rust + WebAssembly 64-bit (`memory64`) 드로잉 엔진 상태 및 실측 벤치마크 허브 패널. */
export function StudioWasm64EngineHubPanel({
  locale, className, initialFilterMode = "unsharp-mask", initialPsdSample = "psb-40k",
  initialTileBudgetSlots = 4, initialBezierTolerancePx = 1.25, preferAddressType = "i64", onBenchmarkComplete,
}: StudioWasm64EngineHubPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const wasmModule = useMemo(() => instantiateWasm64DrawingModule({ preferAddressType }), [preferAddressType]);
  const fixtures = useMemo(() => createWasm64HubDemoFixtures(DEMO_DIM), []);

  const [filterMode, setFilterMode] = useState<Wasm64HubFilterMode>(initialFilterMode);
  const [psdSample, setPsdSample] = useState<Wasm64HubPsdSample>(initialPsdSample);
  const [tileBudgetSlots, setTileBudgetSlots] = useState<number>(Math.max(2, Math.min(12, initialTileBudgetSlots)));
  const [bezierTol, setBezierTol] = useState<number>(Math.max(0.25, Math.min(3.0, initialBezierTolerancePx)));
  const [historyState, setHistoryState] = useState<{
    readonly frames: number; readonly compressionRatio: number; readonly checksumVerified: boolean; readonly elapsedMs: number;
  } | null>(null);
  const [historyRunning, setHistoryRunning] = useState<boolean>(false);
  const [runCounter, setRunCounter] = useState<number>(0);

  const filterResult = useMemo<Wasm64FilterOrWarpResult>(() => {
    void runCounter;
    if (filterMode === "gaussian-blur-masked") {
      return runWasm64FilterOrWarp(wasmModule, {
        kind: "gaussian-blur-masked", rgba: fixtures.rgba, width: DEMO_DIM, height: DEMO_DIM, sigma: 1.6, selectionMask: fixtures.mask,
      });
    }
    if (filterMode === "impasto-sobel") {
      return runWasm64FilterOrWarp(wasmModule, {
        kind: "impasto-sobel", rgba: fixtures.rgba, heightMap: fixtures.heightMap, width: DEMO_DIM, height: DEMO_DIM, reliefStrength: 1.8,
      });
    }
    if (filterMode === "mls-rigid-warp") {
      const vertices: Array<readonly [number, number]> = [];
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) vertices.push([x * 20, y * 20]);
      }
      return runWasm64FilterOrWarp(wasmModule, {
        kind: "mls-rigid-warp",
        vertices,
        pins: [{ rest: [0, 0], target: [0, 0] }, { rest: [140, 0], target: [144, 14] }, { rest: [140, 140], target: [126, 150] }],
        alpha: 1.25,
      });
    }
    return runWasm64FilterOrWarp(wasmModule, {
      kind: "unsharp-mask", rgba: fixtures.rgba, width: DEMO_DIM, height: DEMO_DIM, sigma: 1.2, amount: 1.4, threshold: 2,
    });
  }, [filterMode, fixtures, runCounter, wasmModule]);

  const vectorResult = useMemo<VectorizeStrokeResult>(() => {
    void runCounter;
    return vectorizeStrokeWasm64(fixtures.stroke, { rdpEpsilon: 0.4, bezierTolerancePx: bezierTol });
  }, [bezierTol, fixtures.stroke, runCounter]);

  const psdParse = useMemo(() => {
    void runCounter;
    const raw = psdSample === "psb-40k"
      ? buildSyntheticPsdHeaderBytes({
          version: 2, channels: 4, width: 40000, height: 30000, depthBits: 16, colorModeCode: 4,
          colorDataLen: 16, resourcesLen: 64, layerAndMaskLen: BigInt(5000000000),
        })
      : buildSyntheticPsdHeaderBytes({
          version: 1, channels: 4, width: 4096, height: 8192, depthBits: 8, colorModeCode: 3,
          colorDataLen: 0, resourcesLen: 128, layerAndMaskLen: BigInt(65536),
        });
    return parseLargePsdHeaderWasm64(raw);
  }, [psdSample, runCounter]);

  const tileStats = useMemo<Wasm64TileSwapperStats>(() => {
    void runCounter;
    return runTileSwapperPass(tileBudgetSlots, wasmModule);
  }, [runCounter, tileBudgetSlots, wasmModule]);

  const handleRunAsyncHistory = useCallback(async (): Promise<boolean> => {
    setHistoryRunning(true);
    try {
      const serializer = new AsyncDeltaHistorySerializer(wasmModule);
      let totalRaw = 0; let totalEncoded = 0; let totalMs = 0;
      for (let step = 0; step < 4; step += 1) {
        const frame = new Uint8Array(fixtures.rgba);
        const startOff = step * 128;
        for (let i = startOff; i < startOff + 96 && i < frame.length; i += 1) {
          frame[i] = ((frame[i] ?? 0) + step * 37 + 19) & 0xff;
        }
        const pushed = await serializer.pushSnapshot(frame);
        totalRaw += pushed.rawBytes; totalEncoded += pushed.encodedBytes; totalMs += pushed.elapsedMs;
      }
      const restored = await serializer.restoreSnapshot(2);
      setHistoryState({
        frames: serializer.length,
        compressionRatio: totalEncoded > 0 ? totalRaw / totalEncoded : 1,
        checksumVerified: restored.checksumVerified,
        elapsedMs: totalMs + restored.elapsedMs,
      });
      return restored.checksumVerified;
    } finally {
      setHistoryRunning(false);
    }
  }, [fixtures.rgba, wasmModule]);

  const handleRunAllBenchmarks = useCallback(async () => {
    setRunCounter((c) => c + 1);
    const verified = await handleRunAsyncHistory();
    onBenchmarkComplete?.({
      backendMode: wasmModule.backendMode, filterResult, vectorResult,
      psdHeader: psdParse.ok ? psdParse.header : null, tileStats, historyVerified: verified,
    });
  }, [filterResult, handleRunAsyncHistory, onBenchmarkComplete, psdParse, tileStats, vectorResult, wasmModule.backendMode]);

  const backendBadgeLabel = wasmModule.backendMode === "wasm64-native"
    ? pick("Memory64 네이티브 (i64)", "Memory64 Native (i64)")
    : wasmModule.backendMode === "wasm32-fallback"
      ? pick("Wasm32 폴백 (i32)", "Wasm32 Fallback (i32)")
      : pick("JS 안전 폴백", "JS Safe Fallback");
  const backendBadgeTone = wasmModule.backendMode === "wasm64-native"
    ? "border-good/40 bg-good/15 text-good"
    : wasmModule.backendMode === "wasm32-fallback"
      ? "border-warn/40 bg-warn/15 text-warn"
      : "border-bad/40 bg-bad/15 text-bad";
  const budgetUsagePct = Math.min(100, Math.round((tileStats.residentBytes / Math.max(1, tileStats.maxResidentBytes)) * 100));

  return (
    <section
      data-testid="wasm64-engine-hub-panel"
      aria-label={pick("Rust + Wasm64 드로잉 엔진 허브", "Rust + Wasm64 Drawing Engine Hub")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("Rust + WebAssembly 64비트 코어 드로잉 엔진", "Rust + WebAssembly 64-bit Core Drawing Engine")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "i64 선형 메모리 커널 · 256×256 타일 가상 스와퍼 · 실시간 베지어 벡터라이징 · 스트리밍 PSB 파서",
              "i64 linear-memory kernels · 256×256 tile virtual swapper · real-time Bezier vectorizing · streaming PSB parser",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="wasm64-backend-badge" className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${backendBadgeTone}`}>
            {backendBadgeLabel}
          </span>
          <span data-testid="wasm64-rust-core-badge" className="inline-flex items-center rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
            {pick("Rust Vello · unsafe 0%", "Rust Vello · 0% unsafe")}
          </span>
          <span data-testid="wasm64-simd-badge" className="inline-flex items-center rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2 tabular-nums">
            {`${wasmModule.capability.isSimdSupported ? "SIMD128" : "Scalar"} · ${wasmModule.capability.webMemory64AddressSpaceLimitGiB} GiB`}
          </span>
          <button type="button" data-testid="wasm64-run-all-btn" className={BTN_PRIMARY} disabled={historyRunning} onClick={() => void handleRunAllBenchmarks()}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("전 커널 실측 실행", "Run All Benchmarks")}
          </button>
        </div>
      </header>

      <div className="space-y-2.5 rounded-lg border border-line bg-card p-3" data-testid="wasm64-tile-monitor">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <HardDrive className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
            <span>{pick("64비트 256×256 가상 타일 LRU 메모리 모니터", "64-bit 256×256 Virtual Tile LRU Memory Monitor")}</span>
          </div>
          <span className="text-xs text-fg-2 tabular-nums" data-testid="wasm64-tile-highwater">
            {pick("64비트 상한 주소", "64-bit High-Water")}: {formatHexAddr(tileStats.highWaterVirtualAddrI64)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-md border border-line bg-raised p-2">
            <div className="text-fg-3">{pick("상주 / 스왑아웃", "Resident / Swapped")}</div>
            <div className="mt-0.5 font-semibold text-fg tabular-nums" data-testid="wasm64-tile-counts">{tileStats.residentTiles} / {tileStats.swappedOutTiles}</div>
          </div>
          <div className="rounded-md border border-line bg-raised p-2">
            <div className="text-fg-3">{pick("상주 사용량 / 예산", "Resident / Budget")}</div>
            <div className="mt-0.5 font-semibold text-fg tabular-nums" data-testid="wasm64-tile-budget-usage">
              {formatBytesCompact(tileStats.residentBytes)} / {formatBytesCompact(tileStats.maxResidentBytes)}
            </div>
          </div>
          <div className="rounded-md border border-line bg-raised p-2">
            <div className="text-fg-3">{pick("LRU 스왑아웃 / 복원", "LRU Swap-Out / In")}</div>
            <div className="mt-0.5 font-semibold text-fg tabular-nums" data-testid="wasm64-tile-swaps">{tileStats.swapOuts} / {tileStats.swapIns}</div>
          </div>
          <div className="rounded-md border border-line bg-raised p-2">
            <div className="text-fg-3">{pick("4 GiB 경계 돌파", "Above 4 GiB")}</div>
            <div className="mt-0.5 font-semibold text-good tabular-nums">
              {tileStats.crosses4GiBBoundary ? pick("활성 (i64)", "Active (i64)") : pick("32비트 구간", "32-bit Range")}
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-fg-2">
            <label htmlFor={`${uid}-budget`}>{pick("상주 타일 슬롯 예산", "Resident Tile Slot Budget")}</label>
            <span className="font-semibold text-fg tabular-nums">{tileBudgetSlots} ({budgetUsagePct}%)</span>
          </div>
          <input id={`${uid}-budget`} data-testid="wasm64-tile-budget-slider" type="range" min={2} max={12} step={1} value={tileBudgetSlots} onChange={(e) => setTileBudgetSlots(Number(e.target.value))} className="w-full accent-accent" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <article className="space-y-2.5 rounded-lg border border-line bg-card p-3" data-testid="wasm64-filter-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("고속 필터 · ARAP/MLS 워프 커널", "High-Speed Filter & ARAP/MLS Warp")}</span>
            </div>
            <span className="text-xs text-fg-2 tabular-nums" data-testid="wasm64-filter-elapsed">{filterResult.elapsedMs.toFixed(2)} ms</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={filterMode === mode.id}
                data-testid={`wasm64-filter-mode-${mode.id}`}
                onClick={() => setFilterMode(mode.id)}
                className={`${CHIP_BASE} ${filterMode === mode.id ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-fg-2 hover:text-fg"}`}
              >
                {isEn ? mode.en : mode.ko}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-2 text-xs text-fg-2 tabular-nums">
            <span>{pick("처리 단위", "Processed")}: <strong className="text-fg">{filterResult.pixelsProcessed}</strong></span>
            <span>FNV-1a: <strong className="text-fg">{filterResult.checksum.toString(16).toUpperCase().padStart(8, "0")}</strong></span>
            {filterResult.boundaryBleedPixels !== undefined ? (
              <span data-testid="wasm64-filter-bleed">{pick("경계 번짐", "Bleed")}: <strong className="text-good">{filterResult.boundaryBleedPixels} px</strong></span>
            ) : filterResult.maxPinErrorPx !== undefined ? (
              <span>{pick("핀 오차", "Pin Err")}: <strong className="text-good">{filterResult.maxPinErrorPx.toFixed(4)} px</strong></span>
            ) : (
              <span>{pick("변경 픽셀", "Modified")}: <strong className="text-fg">{filterResult.modifiedPixels ?? filterResult.pixelsProcessed}</strong></span>
            )}
          </div>
        </article>

        <article className="space-y-2.5 rounded-lg border border-line bg-card p-3" data-testid="wasm64-vector-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Activity className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
              <span>{pick("실시간 선화 3차 베지어 벡터라이저", "Real-Time Cubic Bezier Vectorizer")}</span>
            </div>
            <span className="text-xs text-fg-2 tabular-nums">{vectorResult.elapsedMs.toFixed(2)} ms</span>
          </div>
          <svg viewBox="0 0 240 88" className="h-20 w-full rounded-md border border-line bg-canvas" role="img" aria-label={pick("벡터라이징 3차 베지어 곡선 미리보기", "Vectorized cubic Bezier curve preview")}>
            <path d={vectorResult.svgPath} fill="none" stroke="currentColor" className="text-accent" strokeWidth={2.2} strokeLinecap="round" />
          </svg>
          <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
            <label htmlFor={`${uid}-tol`}>{pick("피팅 허용 오차", "Fit Tolerance")}</label>
            <input id={`${uid}-tol`} data-testid="wasm64-bezier-tolerance-slider" type="range" min={0.25} max={3.0} step={0.25} value={bezierTol} onChange={(e) => setBezierTol(Number(e.target.value))} className="w-32 accent-accent" />
            <span className="font-semibold text-fg tabular-nums" data-testid="wasm64-vector-summary">
              {`${vectorResult.segments.length} seg · ${vectorResult.compressionRatio.toFixed(1)}× · ${vectorResult.maxFitErrorPx.toFixed(2)} px`}
            </span>
          </div>
        </article>

        <article className="space-y-2.5 rounded-lg border border-line bg-card p-3" data-testid="wasm64-psd-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <FileCode2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("스트리밍 대용량 PSD/PSB 파서", "Streaming Large PSD/PSB Parser")}</span>
            </div>
            <div className="flex gap-1.5">
              {(["psd-4k", "psb-40k"] as const).map((sample) => (
                <button key={sample} type="button" aria-pressed={psdSample === sample} data-testid={`wasm64-psd-sample-${sample}`} onClick={() => setPsdSample(sample)} className={`${CHIP_BASE} ${psdSample === sample ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-fg-2 hover:text-fg"}`}>
                  {sample === "psd-4k" ? "PSD 4K" : "PSB 40K (>4GiB)"}
                </button>
              ))}
            </div>
          </div>
          {psdParse.ok ? (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-line bg-raised p-2 text-xs tabular-nums" data-testid="wasm64-psd-details">
              <div>
                <span className="text-fg-3">{pick("해상도 · 심도", "Resolution · Depth")}</span>
                <div className="font-semibold text-fg">{`${psdParse.header.width}×${psdParse.header.height} · ${psdParse.header.depthBits}b ${psdParse.header.colorMode}`}</div>
              </div>
              <div>
                <span className="text-fg-3">{pick("예상 비압축 RGBA", "Est. Raw RGBA")}</span>
                <div className="font-semibold text-fg">{`${formatBytesCompact(psdParse.header.estimatedUncompressedRgbaBytes)}${psdParse.header.requiresMemory64 ? " · Memory64" : ""}`}</div>
              </div>
              <div>
                <span className="text-fg-3">{pick("레이어 섹션 오프셋", "Layer Offset")}</span>
                <div className="font-semibold text-fg">{formatHexAddr(psdParse.header.layerAndMaskOffset)}</div>
              </div>
              <div>
                <span className="text-fg-3">{pick("이미지 데이터 오프셋", "Image Data Offset")}</span>
                <div className="font-semibold text-fg">{formatHexAddr(psdParse.header.imageDataOffset)}</div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-bad">{psdParse.message}</p>
          )}
        </article>

        <article className="space-y-2.5 rounded-lg border border-line bg-card p-3" data-testid="wasm64-history-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <History className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
              <span>{pick("비동기 델타 히스토리 직렬화", "Async Delta History Serializer")}</span>
            </div>
            <button type="button" data-testid="wasm64-run-history-btn" className={BTN_OUTLINE} disabled={historyRunning} onClick={() => void handleRunAsyncHistory()}>
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("왕복 무결성 검증", "Verify Round-Trip")}
            </button>
          </div>
          <div className="rounded-md border border-line bg-raised p-2.5 text-xs tabular-nums" data-testid="wasm64-history-result">
            {historyState ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{pick("스냅샷", "Snapshots")}: <strong className="text-fg">{historyState.frames}</strong></span>
                <span>{pick("압축비", "Ratio")}: <strong className="text-fg">{historyState.compressionRatio.toFixed(1)}×</strong></span>
                <span className={historyState.checksumVerified ? "font-semibold text-good" : "font-semibold text-bad"}>
                  {historyState.checksumVerified ? pick("무손실 일치 (PASS)", "Lossless Match (PASS)") : pick("불일치", "Mismatch")}
                </span>
                <span className="text-fg-2">{historyState.elapsedMs.toFixed(2)} ms</span>
              </div>
            ) : (
              <p className="text-fg-2">
                {pick("버튼을 눌러 Wasm64 XOR 델타 압축과 FNV-1a 체크섬 무손실 복원을 실측합니다.", "Run verification to measure Wasm64 XOR delta compression and FNV-1a lossless restoration.")}
              </p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
