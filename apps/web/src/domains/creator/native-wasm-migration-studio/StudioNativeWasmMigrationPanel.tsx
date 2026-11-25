/**
 * Wave 51C — Konva 탈피 · Rust WASM32/64 듀얼 타깃 + WebGPU 네이티브 전환 제어판.
 *
 * - 4종 작업 환경 프리셋(웹툰 800×24,000px 60L · 일러스트 8K 120L · iPad Safari 4K · 보급형 모바일 4GB)
 * - WebGPU / WASM64 / SIMD128 / SAB / WebKit 가드 / 픽셀 포맷(RGBA8·RGBA16F) 실시간 토글
 * - 순수 시맨틱 SVG 3단 네이티브 파이프라인 아키텍처 & 메모리 아레나 게이지(oklch/currentColor 전용, 바이올렛 휴 0%)
 * - Konva 4계층 분리 상태표 · 제로카피 링버퍼 & OPFS LRU 스필 설계 · 아키텍처 매니페스트 JSON 내보내기
 */

import {
  AlertTriangle, CheckCircle2, Cpu, Eye, FileJson, Gauge, HardDrive,
  Layers, RotateCcw, ShieldAlert, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  KONVA_MIGRATION_LAYERS, NATIVE_MIGRATION_SCENARIOS, WASM64_OFFSET_THRESHOLD_MB,
  evaluateRuntimeNativeCapability, exportNativeMigrationManifestJson, getMigrationScenarioPreset,
  planZeroCopyTileArena, summarizeKonvaMigrationRoadmap,
  type GuardSeverity, type NativeMigrationManifest, type NativeMigrationScenarioId,
  type NormalizedRuntimeCapabilityInput, type RuntimeNativeCapabilityEvaluation,
  type TilePixelFormat, type ZeroCopyTileArenaPlan,
} from "./native-wasm-migration-engine";

export interface StudioNativeWasmMigrationPanelProps {
  readonly initialPresetId?: NativeMigrationScenarioId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onSelectTier?: (evaluation: RuntimeNativeCapabilityEvaluation) => void;
  readonly onExportJson?: (json: string, manifest: NativeMigrationManifest) => void;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트(블루프린트 215°, 네이티브 155°, 어댑터 72°, 경보 25°, OPFS 190°)
const SVG_INK_GPU = "oklch(0.56 0.12 215)";
const SVG_INK_NATIVE = "oklch(0.55 0.14 155)";
const SVG_INK_ADAPTER = "oklch(0.67 0.14 72)";
const SVG_INK_ALERT = "oklch(0.57 0.21 25)";
const SVG_INK_OPFS = "oklch(0.55 0.11 190)";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

type FeatureFlagKey = "webgpuAvailable" | "wasmMemory64Available" | "wasmSimd128Available" | "sharedArrayBufferAvailable" | "isIosSafariWebKit";

const FEATURE_TOGGLES: readonly {
  readonly key: FeatureFlagKey; readonly labelKo: string; readonly labelEn: string; readonly hintKo: string; readonly hintEn: string;
}[] = [
  { key: "webgpuAvailable", labelKo: "WebGPU WGSL", labelEn: "WebGPU WGSL", hintKo: "브러시·타일 Compute 가속", hintEn: "Brush & tile compute shaders" },
  { key: "wasmMemory64Available", labelKo: "WASM64 (memory64)", labelEn: "WASM64 (memory64)", hintKo: "4GB+ 64비트 선형 오프셋", hintEn: "4GB+ 64-bit linear arena" },
  { key: "wasmSimd128Available", labelKo: "WASM SIMD128", labelEn: "WASM SIMD128", hintKo: "128비트 벡터 기본 고속", hintEn: "128-bit SIMD default fast path" },
  { key: "sharedArrayBufferAvailable", labelKo: "SharedArrayBuffer", labelEn: "SharedArrayBuffer", hintKo: "COOP/COEP 제로카피 링", hintEn: "COOP/COEP zero-copy ring" },
  { key: "isIosSafariWebKit", labelKo: "iOS Safari / WebKit 가드", labelEn: "iOS Safari / WebKit Guard", hintKo: "Jetsam 1GB 상주 상한", hintEn: "Jetsam 1GB resident cap" },
];

function formatMb(mb: number): string {
  return `${mb.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

function severityToneClass(severity: GuardSeverity): string {
  if (severity === "critical") return "border-bad bg-bad-soft text-bad";
  return severity === "warn" ? "border-warn bg-warning-soft text-warn" : "border-line bg-raised text-fg-2";
}

function alertToneClass(level: ZeroCopyTileArenaPlan["thresholdAlertLevel"]): string {
  if (level === "exceeded") return "border-bad bg-bad-soft text-bad";
  return level === "approaching" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function NativePipelineAndArenaSvg(props: {
  readonly evaluation: RuntimeNativeCapabilityEvaluation; readonly arena: ZeroCopyTileArenaPlan; readonly isEn: boolean;
}): ReactElement {
  const { evaluation, arena, isEn } = props;
  const isWasm64 = evaluation.selectedWasmTarget === "wasm64-memory64";
  const isWebGpu = evaluation.gpuPath === "webgpu-wgsl";
  const isSab = evaluation.ringTransferMode === "sab-zero-copy-ring";
  const hasSpill = evaluation.opfsSpillRequiredMb > 0;

  const wasmInk = isWasm64 ? SVG_INK_GPU : SVG_INK_NATIVE;
  const gpuInk = isWebGpu ? SVG_INK_GPU : SVG_INK_ADAPTER;
  const alertInk = arena.thresholdAlertLevel === "exceeded" ? SVG_INK_ALERT : arena.thresholdAlertLevel === "approaching" ? SVG_INK_ADAPTER : SVG_INK_NATIVE;

  const gaugeX = 24;
  const gaugeY = 238;
  const gaugeW = 632;
  const gaugeH = 26;
  const scaleMaxMb = Math.max(WASM64_OFFSET_THRESHOLD_MB * 1.25, evaluation.estimatedTileRamMb * 1.08, evaluation.safeRamBudgetMb * 1.15);
  const toGaugePx = (mb: number): number => Math.round(Math.min(gaugeW, Math.max(0, (mb / scaleMaxMb) * gaugeW)) * 10) / 10;

  const residentSeg = arena.segments[0]?.mb ?? 0;
  const ringSeg = arena.segments[1]?.mb ?? 0;
  const undoSeg = arena.segments[2]?.mb ?? 0;
  const spillSeg = arena.segments[3]?.mb ?? 0;

  const wResident = toGaugePx(residentSeg);
  const wRing = toGaugePx(ringSeg);
  const wUndo = toGaugePx(undoSeg);
  const wSpill = Math.min(Math.max(0, gaugeW - wResident - wRing - wUndo), toGaugePx(spillSeg));
  const safeMarkerX = gaugeX + toGaugePx(evaluation.safeRamBudgetMb);
  const threshold4096X = gaugeX + toGaugePx(WASM64_OFFSET_THRESHOLD_MB);

  return (
    <svg
      data-testid="native-pipeline-arena-svg" data-selected-tier={evaluation.selectedTier}
      data-wasm-target={evaluation.selectedWasmTarget} data-gpu-path={evaluation.gpuPath}
      data-threshold-alert={arena.thresholdAlertLevel} data-opfs-spill-mb={evaluation.opfsSpillRequiredMb.toFixed(1)}
      viewBox="0 0 680 326" role="img" className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn ? `3-stage native pipeline (${evaluation.tierLabelEn}) and 256px tile memory arena gauge` : `3단 네이티브 파이프라인(${evaluation.tierLabelKo}) 및 256px 타일 메모리 아레나 게이지`}
    >
      <rect x="10" y="10" width="660" height="164" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="24" y="30" fill="currentColor" fillOpacity={0.76} fontSize="11" fontWeight="700">
        {isEn ? "3-STAGE KONVA-DECOUPLED NATIVE PIPELINE" : "3단 Konva 탈피 네이티브 실행 파이프라인"}
      </text>
      <text x="656" y="30" textAnchor="end" fill={alertInk} fontSize="10" fontWeight="700">
        {isEn ? `TARGET: ${evaluation.selectedWasmTarget.toUpperCase()}` : `활성 타깃: ${evaluation.selectedWasmTarget}`}
      </text>

      {/* Stage 1: React/TS 경량 어댑터 */}
      <rect x="24" y="44" width="178" height="92" rx="8" fill={SVG_INK_ADAPTER} fillOpacity={0.08} stroke={SVG_INK_ADAPTER} strokeWidth="1.8" />
      <text x="36" y="63" fill={SVG_INK_ADAPTER} fontSize="10" fontWeight="700">{isEn ? "STAGE 1 · TS ADAPTER (~18%)" : "1단 · TS 경량 어댑터 (18%)"}</text>
      <text x="36" y="81" fill="currentColor" fontSize="11" fontWeight="700">{isEn ? "React A11y · IME · Gizmo" : "React UI · 한글 IME · 기즈모"}</text>
      <text x="36" y="99" fill="currentColor" fillOpacity={0.68} fontSize="9.5">{isEn ? "Coalesced Pointer Capture" : "포인터 배치 수집 · WCAG 포커스"}</text>
      <text x="36" y="122" fill={SVG_INK_ADAPTER} fontSize="9.5" fontWeight="600">{isSab ? "→ SAB 3-Slot Ring" : "→ Transferable Ring"}</text>

      <line x1="202" y1="90" x2="240" y2="90" stroke={isSab ? SVG_INK_NATIVE : SVG_INK_ADAPTER} strokeWidth="2.2" strokeDasharray={isSab ? undefined : "4 3"} />
      <polygon points="244,90 236,85 236,95" fill={isSab ? SVG_INK_NATIVE : SVG_INK_ADAPTER} />
      <text x="222" y="79" textAnchor="middle" fill="currentColor" fillOpacity={0.65} fontSize="8.5">{isSab ? "0-Copy" : "Xfer"}</text>

      {/* Stage 2: Rust WASM32/64 듀얼 코어 */}
      <rect x="246" y="44" width="194" height="92" rx="8" fill={wasmInk} fillOpacity={0.1} stroke={wasmInk} strokeWidth="2" />
      <text x="258" y="63" fill={wasmInk} fontSize="10" fontWeight="700">
        {isWasm64 ? (isEn ? "STAGE 2 · RUST WASM64 (u64)" : "2단 · RUST WASM64 (64비트)") : (isEn ? "STAGE 2 · RUST WASM32" : "2단 · RUST WASM32 코어")}
      </text>
      <text x="258" y="81" fill="currentColor" fontSize="11" fontWeight="700">{isEn ? "256px Sparse Tile Arena" : "256px 희소 타일 · 코덱 · 워프"}</text>
      <text x="258" y="99" fill="currentColor" fillOpacity={0.68} fontSize="9.5">
        {isEn ? `${evaluation.sparseActiveTiles.toLocaleString("en-US")} active tiles (${arena.tileSizeKb}KB)` : `활성 ${evaluation.sparseActiveTiles.toLocaleString("en-US")}타일 (${arena.tileSizeKb}KB/타일)`}
      </text>
      <text x="258" y="122" fill={hasSpill ? SVG_INK_OPFS : SVG_INK_NATIVE} fontSize="9.5" fontWeight="600">
        {hasSpill ? (isEn ? `OPFS LRU Spill: ${evaluation.opfsSpillRequiredMb}MB` : `OPFS LRU 스필: ${evaluation.opfsSpillRequiredMb}MB`) : (isEn ? "All Active Tiles in Safe RAM" : "활성 타일 전원 RAM 상주")}
      </text>

      <line x1="440" y1="90" x2="478" y2="90" stroke={gpuInk} strokeWidth="2.2" strokeDasharray={isWebGpu ? undefined : "4 3"} />
      <polygon points="482,90 474,85 474,95" fill={gpuInk} />
      <text x="460" y="79" textAnchor="middle" fill="currentColor" fillOpacity={0.65} fontSize="8.5">{isWebGpu ? "WGSL" : "CPU"}</text>

      {/* Stage 3: WebGPU WGSL / CPU 폴백 */}
      <rect x="484" y="44" width="172" height="92" rx="8" fill={gpuInk} fillOpacity={0.1} stroke={gpuInk} strokeWidth="2" />
      <text x="496" y="63" fill={gpuInk} fontSize="10" fontWeight="700">{isWebGpu ? (isEn ? "STAGE 3 · WEBGPU WGSL" : "3단 · WEBGPU WGSL") : (isEn ? "STAGE 3 · WASM CPU" : "3단 · WASM CPU 폴백")}</text>
      <text x="496" y="81" fill="currentColor" fontSize="11" fontWeight="700">{isEn ? "Brush · Relief · Blend" : "브러시 · 요철 · 타일 합성"}</text>
      <text x="496" y="99" fill="currentColor" fillOpacity={0.68} fontSize="9.5">{isWebGpu ? (isEn ? "256B Aligned Compute Pass" : "256B 정렬 Compute 패스") : (isEn ? "Byte-Exact Scalar/SIMD" : "바이트 동등 CPU 커널")}</text>
      <text x="496" y="122" fill={gpuInk} fontSize="9.5" fontWeight="600">{isEn ? "Konva Hotpath: 0%" : "Konva 핫패스 의존: 0%"}</text>

      <text x="24" y="160" fill="currentColor" fillOpacity={0.65} fontSize="9.5">
        {isEn
          ? `Ring: ${arena.ringBuffer.slotCount}×${arena.ringBuffer.viewportTileWindow} tiles (${arena.ringBuffer.totalRingMb}MB, ${arena.ringBuffer.backingMemoryKind}) · WebKit Guard: ${evaluation.iosSafariWebKitGuard.status}`
          : `링버퍼: ${arena.ringBuffer.slotCount}슬롯×${arena.ringBuffer.viewportTileWindow}타일(${arena.ringBuffer.totalRingMb}MB, ${arena.ringBuffer.backingMemoryKind}) · WebKit 가드: ${evaluation.iosSafariWebKitGuard.status}`}
      </text>

      {/* 하단: 256px 타일 메모리 아레나 게이지 */}
      <rect x="10" y="184" width="660" height="132" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="24" y="204" fill="currentColor" fillOpacity={0.76} fontSize="11" fontWeight="700">
        {isEn ? "256×256 TILE MEMORY ARENA & 4,096MB 64-BIT OFFSET GAUGE" : "256×256 타일 메모리 아레나 및 4,096MB 64비트 임계 게이지"}
      </text>
      <text x="656" y="204" textAnchor="end" fill={alertInk} fontSize="10" fontWeight="700">
        {isEn ? `WORKING SET ${formatMb(evaluation.estimatedTileRamMb)}` : `예상 워킹셋 ${formatMb(evaluation.estimatedTileRamMb)}`}
      </text>

      <rect x={gaugeX} y={gaugeY} width={gaugeW} height={gaugeH} rx="6" fill="currentColor" fillOpacity={0.08} />
      {wResident > 0 && <rect x={gaugeX} y={gaugeY} width={wResident} height={gaugeH} rx="4" fill={SVG_INK_NATIVE} fillOpacity={0.85} />}
      {wRing > 0 && <rect x={gaugeX + wResident} y={gaugeY} width={wRing} height={gaugeH} fill={SVG_INK_GPU} fillOpacity={0.9} />}
      {wUndo > 0 && <rect x={gaugeX + wResident + wRing} y={gaugeY} width={wUndo} height={gaugeH} fill={SVG_INK_ADAPTER} fillOpacity={0.9} />}
      {wSpill > 0 && <rect x={gaugeX + wResident + wRing + wUndo} y={gaugeY} width={wSpill} height={gaugeH} rx="4" fill={SVG_INK_OPFS} fillOpacity={0.82} />}

      <line x1={safeMarkerX} y1={gaugeY - 12} x2={safeMarkerX} y2={gaugeY + gaugeH + 10} stroke={SVG_INK_GPU} strokeWidth="1.8" strokeDasharray="3 2" />
      <text x={Math.min(gaugeX + gaugeW - 68, Math.max(gaugeX + 4, safeMarkerX + 4))} y={gaugeY - 14} fill={SVG_INK_GPU} fontSize="9" fontWeight="700">
        {isEn ? `Safe ${evaluation.safeRamBudgetMb}MB` : `안전상한 ${evaluation.safeRamBudgetMb}MB`}
      </text>

      <line x1={threshold4096X} y1={gaugeY - 6} x2={threshold4096X} y2={gaugeY + gaugeH + 14} stroke={SVG_INK_ALERT} strokeWidth="2" strokeDasharray="4 2" />
      <text x={Math.min(gaugeX + gaugeW - 86, Math.max(gaugeX + 4, threshold4096X - 42))} y={gaugeY + gaugeH + 24} fill={SVG_INK_ALERT} fontSize="9" fontWeight="700">
        {isEn ? "4,096MB u64 Limit" : "4,096MB 64비트 경계"}
      </text>

      <g fontSize="9.5" fill="currentColor" fillOpacity={0.78}>
        <rect x="24" y="294" width="10" height="10" rx="2" fill={SVG_INK_NATIVE} />
        <text x="38" y="303">{isEn ? `RAM Tiles ${formatMb(residentSeg)}` : `RAM 타일 ${formatMb(residentSeg)}`}</text>
        <rect x="192" y="294" width="10" height="10" rx="2" fill={SVG_INK_GPU} />
        <text x="206" y="303">{isEn ? `Ring ${formatMb(ringSeg)}` : `링버퍼 ${formatMb(ringSeg)}`}</text>
        <rect x="336" y="294" width="10" height="10" rx="2" fill={SVG_INK_ADAPTER} />
        <text x="350" y="303">{isEn ? `XOR Undo ${formatMb(undoSeg)}` : `XOR 델타 ${formatMb(undoSeg)}`}</text>
        <rect x="494" y="294" width="10" height="10" rx="2" fill={SVG_INK_OPFS} />
        <text x="508" y="303">{isEn ? `OPFS Spill ${formatMb(spillSeg)}` : `OPFS 스필 ${formatMb(spillSeg)}`}</text>
      </g>
    </svg>
  );
}

/** Konva 탈피 · Rust WASM32/64 듀얼 타깃 + WebGPU 네이티브 전환 스튜디오 제어판. */
export function StudioNativeWasmMigrationPanel(props: StudioNativeWasmMigrationPanelProps): ReactElement {
  const { initialPresetId = "webtoon-long-strip", locale = "ko", className, onSelectTier, onExportJson } = props;
  const headingId = useId();
  const layerSliderId = useId();
  const ramSliderId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [selectedPresetId, setSelectedPresetId] = useState<NativeMigrationScenarioId | "custom">(initialPresetId);
  const [runtimeInput, setRuntimeInput] = useState<NormalizedRuntimeCapabilityInput>(() => getMigrationScenarioPreset(initialPresetId).input);
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const activePreset = useMemo(() => (selectedPresetId === "custom" ? null : getMigrationScenarioPreset(selectedPresetId)), [selectedPresetId]);
  const evaluation = useMemo(() => evaluateRuntimeNativeCapability(runtimeInput), [runtimeInput]);
  const arenaPlan = useMemo(() => planZeroCopyTileArena(evaluation), [evaluation]);
  const roadmapSummary = useMemo(() => summarizeKonvaMigrationRoadmap(KONVA_MIGRATION_LAYERS), []);

  const { json: manifestJson, manifest } = useMemo(
    () => exportNativeMigrationManifestJson({
      scenarioId: selectedPresetId,
      ...(activePreset ? { scenarioNameKo: activePreset.nameKo, scenarioNameEn: activePreset.nameEn } : {}),
      input: runtimeInput,
    }),
    [selectedPresetId, activePreset, runtimeInput],
  );

  const commitRuntimeUpdate = (
    nextInput: NormalizedRuntimeCapabilityInput, nextPreset: NativeMigrationScenarioId | "custom", noticeKo: string, noticeEn: string,
  ): void => {
    setSelectedPresetId(nextPreset);
    setRuntimeInput(nextInput);
    onSelectTier?.(evaluateRuntimeNativeCapability(nextInput));
    setStatusMessage(pick(noticeKo, noticeEn));
  };

  const handleSelectPreset = (presetId: NativeMigrationScenarioId): void => {
    const preset = getMigrationScenarioPreset(presetId);
    commitRuntimeUpdate(preset.input, presetId, `시나리오를 '${preset.nameKo}'로 전환해 티어와 타일 예산을 다시 계산했다.`, `Switched scenario to '${preset.nameEn}' and recomputed runtime tier and arena budget.`);
  };

  const handleToggleFlag = (flagKey: FeatureFlagKey): void => {
    const nextVal = !runtimeInput[flagKey];
    commitRuntimeUpdate({ ...runtimeInput, [flagKey]: nextVal }, "custom", `${flagKey} 플래그를 ${nextVal ? "활성" : "비활성"}으로 바꿔 티어를 재평가했다.`, `Toggled ${flagKey} ${nextVal ? "ON" : "OFF"} and re-evaluated tier.`);
  };

  const handleSelectPixelFormat = (pixelFormat: TilePixelFormat): void => {
    if (pixelFormat === runtimeInput.pixelFormat) return;
    commitRuntimeUpdate({ ...runtimeInput, pixelFormat }, "custom", `타일 포맷을 ${pixelFormat === "rgba16f" ? "RGBA16F(512KB)" : "RGBA8(256KB)"}로 전환했다.`, `Switched tile format to ${pixelFormat === "rgba16f" ? "RGBA16F (512KB)" : "RGBA8 (256KB)"}.`);
  };

  const handleReset = (): void => {
    const base = getMigrationScenarioPreset(initialPresetId);
    commitRuntimeUpdate(base.input, initialPresetId, `초기 시나리오('${base.nameKo}')로 복원했다.`, `Reset to initial scenario ('${base.nameEn}').`);
  };

  const handleExportManifest = (): void => {
    setShowJsonPreview(true);
    onExportJson?.(manifestJson, manifest);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(manifestJson).catch(() => undefined);
    }
    setStatusMessage(pick("Konva 탈피 · WASM32/64 · WebGPU 아키텍처 매니페스트 JSON을 생성했다.", "Generated Native WASM/WebGPU migration manifest JSON."));
  };

  return (
    <section aria-labelledby={headingId} data-testid="studio-native-wasm-migration-panel" className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-bold text-fg [word-break:keep-all]">
              {pick("Konva 탈피 · Rust WASM32/64 듀얼 타깃 + WebGPU 네이티브 전환 제어판", "Konva Decoupling · Rust WASM32/64 Dual-Target + WebGPU Migration Studio")}
            </h2>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              `핵심 3계층(${roadmapSummary.nativeCoreSharePct}%)은 Rust WASM + WebGPU로 승격하고, React 접근성·한글 IME·기즈모(${roadmapSummary.tsAdapterSharePct}%)만 경량 TypeScript 어댑터로 유지한다.`,
              `Promotes 3 core layers (${roadmapSummary.nativeCoreSharePct}%) to Rust WASM + WebGPU while keeping React a11y, Korean IME & gizmo (${roadmapSummary.tsAdapterSharePct}%) in a thin TS adapter.`,
            )}
          </p>
        </div>
        <button type="button" data-testid="reset-migration-preset-btn" onClick={handleReset} className={BTN_OUTLINE}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("초기값 복원", "Reset")}</span>
        </button>
      </header>

      {/* 4종 작업 환경 시나리오 프리셋 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
          <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("작업 환경 시나리오 프리셋", "Workload Scenario Presets")}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {NATIVE_MIGRATION_SCENARIOS.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id} type="button" data-testid={`scenario-preset-${preset.id}`} aria-pressed={isSelected}
                onClick={() => handleSelectPreset(preset.id)}
                className={`${isSelected ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-start p-3 text-left`}
              >
                <span className="text-xs font-bold">{isEn ? preset.badgeEn : preset.badgeKo}</span>
                <span className="text-[11px] font-normal text-fg-2 tabular-nums">
                  {preset.input.canvasWidthPx.toLocaleString("en-US")}×{preset.input.canvasHeightPx.toLocaleString("en-US")} · {preset.input.layerCount}L · {preset.input.deviceMemoryGb}GB
                </span>
              </button>
            );
          })}
        </div>
        {activePreset && (
          <p data-testid="active-scenario-summary" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
            {isEn ? activePreset.summaryEn : activePreset.summaryKo}
          </p>
        )}
      </div>

      {/* 런타임 기능 토글 + 타일 포맷/규모 제어 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5 lg:col-span-7">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("브라우저 런타임 기능 토글", "Runtime Capability Toggles")}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FEATURE_TOGGLES.map((item) => {
              const checked = runtimeInput[item.key];
              return (
                <button
                  key={item.key} type="button" role="switch" aria-checked={checked} data-testid={`toggle-${item.key}`}
                  onClick={() => handleToggleFlag(item.key)} className={`${checked ? BTN_ACTIVE : BTN_OUTLINE} justify-between px-3 py-2 text-left`}
                >
                  <span className="flex flex-col items-start">
                    <span className="text-xs font-semibold">{isEn ? item.labelEn : item.labelKo}</span>
                    <span className="text-[10px] font-normal text-fg-3">{isEn ? item.hintEn : item.hintKo}</span>
                  </span>
                  <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[10px] tabular-nums">{checked ? "ON" : "OFF"}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-5">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("256px 타일 포맷 · 규모 시뮬레이션", "256px Tile Format & Scale Controls")}</div>
          <div className="flex flex-wrap gap-2">
            {(["rgba8", "rgba16f"] as const).map((fmt) => (
              <button
                key={fmt} type="button" data-testid={`pixel-format-${fmt}`} aria-pressed={runtimeInput.pixelFormat === fmt}
                onClick={() => handleSelectPixelFormat(fmt)} className={runtimeInput.pixelFormat === fmt ? BTN_ACTIVE : BTN_OUTLINE}
              >
                <span className="tabular-nums">{fmt === "rgba8" ? "RGBA8 (256KB)" : "RGBA16F (512KB)"}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2 text-xs">
            <label htmlFor={layerSliderId} className="flex items-center justify-between text-fg-2">
              <span>{pick("레이어 수", "Layer Count")}</span>
              <span data-testid="layer-count-value" className="font-mono font-bold text-fg tabular-nums">{runtimeInput.layerCount}L</span>
            </label>
            <input
              id={layerSliderId} data-testid="layer-count-slider" type="range" min={4} max={200} step={4} value={runtimeInput.layerCount}
              onChange={(event) => {
                const layerCount = Number(event.target.value);
                commitRuntimeUpdate({ ...runtimeInput, layerCount }, "custom", `레이어 수를 ${layerCount}개로 조정했다.`, `Adjusted layer count to ${layerCount}.`);
              }}
              className="w-full accent-accent"
            />
            <label htmlFor={ramSliderId} className="flex items-center justify-between text-fg-2">
              <span>{pick("단말 메모리 (RAM)", "Device Memory (RAM)")}</span>
              <span data-testid="device-memory-value" className="font-mono font-bold text-fg tabular-nums">{runtimeInput.deviceMemoryGb} GB</span>
            </label>
            <input
              id={ramSliderId} data-testid="device-memory-slider" type="range" min={4} max={64} step={4} value={runtimeInput.deviceMemoryGb}
              onChange={(event) => {
                const deviceMemoryGb = Number(event.target.value);
                commitRuntimeUpdate({ ...runtimeInput, deviceMemoryGb }, "custom", `단말 RAM 기준을 ${deviceMemoryGb}GB로 조정했다.`, `Adjusted device RAM to ${deviceMemoryGb}GB.`);
              }}
              className="w-full accent-accent"
            />
          </div>
        </div>
      </div>

      {/* 자동 선택 티어 & 핵심 4대 지표 카드 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
            <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("자동 선택 실행 티어", "Auto-Selected Tier")}</span>
          </div>
          <div data-testid="selected-tier-label" className="mt-1 text-xs font-bold text-fg [word-break:keep-all]">{isEn ? evaluation.tierLabelEn : evaluation.tierLabelKo}</div>
          <div data-testid="selected-tier-id" className="mt-0.5 font-mono text-[10px] text-accent">{evaluation.selectedTier}</div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-semibold text-fg-3">{pick("예상 활성 타일 RAM", "Est. Active Tile RAM")}</div>
          <div data-testid="estimated-tile-ram-mb" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{formatMb(evaluation.estimatedTileRamMb)}</div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">{pick(`밀집 상한 ${formatMb(evaluation.denseTileRamMb)}`, `Dense peak ${formatMb(evaluation.denseTileRamMb)}`)}</div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
            <HardDrive className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("OPFS 디스크 스필 필요량", "OPFS Spill Required")}</span>
          </div>
          <div data-testid="opfs-spill-required-mb" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{formatMb(evaluation.opfsSpillRequiredMb)}</div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">{pick(`안전 상주 예산 ${evaluation.safeRamBudgetMb} MB`, `Safe RAM cap ${evaluation.safeRamBudgetMb} MB`)}</div>
        </div>

        <div className={`rounded-xl border p-3 ${alertToneClass(arenaPlan.thresholdAlertLevel)}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            {arenaPlan.exceeds4096MbThreshold ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{pick("64비트 오프셋 · WebKit 가드", "64-Bit Offset & WebKit Guard")}</span>
          </div>
          <div data-testid="offset-address-mode" className="mt-1 font-mono text-xs font-bold">{arenaPlan.offsetAddressMode}</div>
          <div data-testid="webkit-guard-status" className="mt-0.5 text-[10px] tabular-nums">WebKit: {evaluation.iosSafariWebKitGuard.status} ({evaluation.iosSafariWebKitGuard.enforcedMaxResidentMb}MB)</div>
        </div>
      </div>

      {/* 순수 시맨틱 SVG 3단 파이프라인 & 메모리 아레나 게이지 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <NativePipelineAndArenaSvg evaluation={evaluation} arena={arenaPlan} isEn={isEn} />
        <p data-testid="arena-alert-banner" className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${alertToneClass(arenaPlan.thresholdAlertLevel)}`}>
          {isEn ? arenaPlan.alertMessageEn : arenaPlan.alertMessageKo}
        </p>
        <p data-testid="formula-disclosure" className="text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">
          {isEn ? evaluation.formulaDisclosureEn : evaluation.formulaDisclosureKo}
        </p>
      </div>

      {/* Zero-Copy 링버퍼 · OPFS LRU 정책 & 런타임 경보 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("제로카피 링버퍼 & OPFS LRU 스필 정책", "Zero-Copy Ring Buffer & OPFS LRU Policy")}</div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-raised p-2">
              <dt className="text-[10px] text-fg-3">{pick("링 백킹 메모리", "Ring Backing")}</dt>
              <dd data-testid="ring-backing-kind" className="font-mono font-bold text-fg">{arenaPlan.ringBuffer.backingMemoryKind}</dd>
            </div>
            <div className="rounded-lg bg-raised p-2">
              <dt className="text-[10px] text-fg-3">{pick("정렬 · 슬롯 크기", "Align & Slot Size")}</dt>
              <dd className="font-mono font-bold text-fg tabular-nums">{arenaPlan.ringBuffer.storageAlignmentBytes}B · {arenaPlan.ringBuffer.slotCount}×{arenaPlan.ringBuffer.viewportTileWindow}T</dd>
            </div>
          </dl>
          <p data-testid="opfs-policy-summary" className="text-xs text-fg-2 tabular-nums [word-break:keep-all]">
            {isEn ? arenaPlan.opfsLruPolicy.policySummaryEn : arenaPlan.opfsLruPolicy.policySummaryKo}
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("런타임 안전 가드 & 경보 목록", "Runtime Safety Guards & Alerts")}</div>
          {evaluation.warnings.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs text-good">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{pick("모든 네이티브 기능(WebGPU·WASM64·SIMD·SAB)이 경보 없이 가동 가능하다.", "All native paths active with zero warnings.")}</span>
            </div>
          ) : (
            <ul data-testid="runtime-warnings-list" className="space-y-1.5">
              {evaluation.warnings.map((warning) => (
                <li key={warning.code} className={`rounded-lg border px-2.5 py-2 text-xs [word-break:keep-all] ${severityToneClass(warning.severity)}`}>
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{isEn ? warning.titleEn : warning.titleKo}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] opacity-90">{isEn ? warning.detailEn : warning.detailKo}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 4계층 Konva 분리 상태표 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Konva 4계층 분리 로드맵 상태표 (현재 vs 목표)", "4-Layer Konva Decoupling Status Table (Current vs Target)")}</span>
          </div>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {pick(`네이티브 ${roadmapSummary.nativeCoreSharePct}% · TS 어댑터 ${roadmapSummary.tsAdapterSharePct}%`, `Native ${roadmapSummary.nativeCoreSharePct}% · TS Adapter ${roadmapSummary.tsAdapterSharePct}%`)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table data-testid="konva-migration-layers-table" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] text-fg-3">
                <th scope="col" className="px-2.5 py-2 font-semibold">{pick("계층 · 영역", "Layer")}</th>
                <th scope="col" className="px-2.5 py-2 font-semibold">{pick("목표 런타임", "Target Runtime")}</th>
                <th scope="col" className="px-2.5 py-2 font-semibold">{pick("네이티브 비중", "Native Share")}</th>
                <th scope="col" className="px-2.5 py-2 font-semibold">{pick("현재 구현 / 전환 목표", "Current vs Target")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {KONVA_MIGRATION_LAYERS.map((layer) => (
                <tr key={layer.id} data-testid={`konva-layer-row-${layer.id}`} className="align-top">
                  <td className="px-2.5 py-2.5 font-semibold text-fg [word-break:keep-all]">
                    <div>{isEn ? layer.titleEn : layer.titleKo}</div>
                    <div className="mt-0.5 text-[11px] font-normal text-fg-3">{isEn ? layer.legacyKonvaSurfaceEn : layer.legacyKonvaSurfaceKo}</div>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <span className="inline-block rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[11px] text-fg">
                      {isEn ? layer.targetRuntimeLabelEn : layer.targetRuntimeLabelKo}
                    </span>
                  </td>
                  <td className="px-2.5 py-2.5 font-mono font-bold tabular-nums">
                    {layer.nativePromotionPct === 100 ? <span className="text-good">100%</span> : <span className="text-warn">TS {layer.tsAdapterSharePct}%</span>}
                  </td>
                  <td className="space-y-1 px-2.5 py-2.5 text-[11px] text-fg-2 [word-break:keep-all]">
                    <div>{isEn ? layer.currentStateEn : layer.currentStateKo}</div>
                    <div className="text-fg-3">{isEn ? layer.targetStateEn : layer.targetStateKo}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON 매니페스트 내보내기 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("아키텍처 전환 매니페스트 내보내기", "Architecture Migration Manifest Export")}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="export-manifest-json-btn" onClick={handleExportManifest} className={BTN_SOLID}>
              <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("JSON 매니페스트 내보내기", "Export Manifest JSON")}</span>
            </button>
            <button type="button" data-testid="toggle-manifest-preview-btn" onClick={() => setShowJsonPreview((prev) => !prev)} className={BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showJsonPreview ? pick("미리보기 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}</span>
            </button>
          </div>
        </div>
        {showJsonPreview && (
          <pre data-testid="manifest-json-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {manifestJson}
          </pre>
        )}
      </div>

      {statusMessage && (
        <div role="status" aria-live="polite" data-testid="migration-panel-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          {statusMessage}
        </div>
      )}
    </section>
  );
}
