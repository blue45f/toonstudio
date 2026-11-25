/**
 * Wave 61C — ToonSilicon 8대 모던 실리콘 · Google Tensor TPU · WASM64 제어판.
 *
 * - Android 4종(Google Tensor TPU · Snapdragon Hexagon · Dimensity APU · Exynos Xclipse)
 *   + Desktop/Apple 4종(Apple Silicon ANE · Intel Core Ultra · AMD Ryzen AI XDNA2 · NVIDIA RTX/Grace)
 * - 브라우저 표준 API(WASM64·WebGPU·WebNN/LiteRT-Web) vs 데스크톱·모바일 네이티브 FFI 브리지 정직 구분
 * - 순수 시맨틱 OKLCH SVG 3유닛(CPU SIMD · WebGPU · NPU/Google TPU) 이기종 부하 분산 & 정적 텐서/워프 배정 도해
 * - 6대 ToonStudio 워크로드 최적 경로표 + JSON 매니페스트 복사·미리보기 (Calm Atelier 토큰 전용)
 */

import {
  Activity, CheckCircle2, Code2, Copy, Cpu, HardDrive, Layers,
  Monitor, RotateCcw, ShieldAlert, ShieldCheck, Smartphone, Zap,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  DEFAULT_EXECUTION_ENVIRONMENT, DEFAULT_FOCUS_WORKLOAD_ID, DEFAULT_MEMORY_ADDRESS_MODE,
  DEFAULT_MODERN_SILICON_ID, EXECUTION_ENVIRONMENTS, MEMORY_ADDRESS_MODES, MODERN_SILICON_PROFILES,
  exportToonSiliconPlanJson, formatOklch,
  type ComputeUnitKind, type ExecutionEnvironmentMode, type MemoryAddressMode,
  type ModernSiliconId, type ModernSiliconProfile, type ToonSiliconFullPowerPlan, type ToonStudioWorkloadId,
} from "./toon-silicon-engine";

export interface StudioToonSiliconPanelProps {
  readonly initialSiliconId?: ModernSiliconId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPlanChange?: (plan: ToonSiliconFullPowerPlan) => void | Promise<void>;
  readonly onExportJson?: (json: string, plan: ToonSiliconFullPowerPlan) => void | Promise<void>;
}

interface PanelState {
  readonly siliconId: ModernSiliconId;
  readonly environment: ExecutionEnvironmentMode;
  readonly memoryMode: MemoryAddressMode;
  readonly focusWorkloadId: ToonStudioWorkloadId;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트 (휴 28·72·152·185·228·240도 — 270~320도 완전 배제)
const SVG_BG = formatOklch({ l: 0.98, c: 0.005, h: 240 }, 0.04);
const SVG_FRAME = formatOklch({ l: 0.62, c: 0.014, h: 240 }, 0.28);
const SVG_CPU_INK = formatOklch({ l: 0.58, c: 0.14, h: 72 });
const SVG_CPU_FILL = formatOklch({ l: 0.58, c: 0.14, h: 72 }, 0.12);
const SVG_GPU_INK = formatOklch({ l: 0.54, c: 0.13, h: 228 });
const SVG_GPU_FILL = formatOklch({ l: 0.54, c: 0.13, h: 228 }, 0.12);
const SVG_NPU_INK = formatOklch({ l: 0.54, c: 0.13, h: 185 });
const SVG_NPU_FILL = formatOklch({ l: 0.54, c: 0.13, h: 185 }, 0.12);
const SVG_GOOD_INK = formatOklch({ l: 0.52, c: 0.14, h: 152 });
const SVG_WARN_INK = formatOklch({ l: 0.56, c: 0.17, h: 28 });
const SVG_HUD_BG = formatOklch({ l: 0.2, c: 0.014, h: 240 }, 0.9);
const SVG_HUD_FG = formatOklch({ l: 0.97, c: 0.005, h: 85 });

const ENV_LABELS: Readonly<Record<ExecutionEnvironmentMode, { readonly ko: string; readonly en: string }>> = {
  "browser-web-standard": { ko: "브라우저 표준 (WebGPU·WebNN·WASM)", en: "Browser Standard (WebGPU/WebNN/WASM)" },
  "desktop-native-bridge": { ko: "데스크톱·모바일 네이티브 브리지 (FFI)", en: "Native Shell Bridge (Tauri/Electron/NNAPI)" },
  "mobile-pwa-android-ios": { ko: "모바일 PWA (Android · iOS)", en: "Mobile PWA (Android / iOS)" },
};
const MEMORY_LABELS: Readonly<Record<MemoryAddressMode, { readonly ko: string; readonly en: string }>> = {
  "wasm64-memory64": { ko: "WASM64 (memory64 · i64)", en: "WASM64 (memory64 · i64)" },
  "wasm32-simd-safe": { ko: "WASM32 안전 모드 (SIMD128 · i32)", en: "WASM32 Safe (SIMD128 · i32)" },
};
const UNIT_BADGE_LABELS: Readonly<Record<ComputeUnitKind, { readonly ko: string; readonly en: string }>> = {
  cpu: { ko: "CPU SIMD", en: "CPU SIMD" },
  gpu: { ko: "WebGPU", en: "WebGPU" },
  "npu-tpu": { ko: "NPU / TPU", en: "NPU / TPU" },
};

const ANDROID_PROFILES = MODERN_SILICON_PROFILES.filter((item) => item.platformGroup === "android-mobile");
const DESKTOP_APPLE_PROFILES = MODERN_SILICON_PROFILES.filter((item) => item.platformGroup === "desktop-apple");

function unitPillClass(unit: ComputeUnitKind): string {
  if (unit === "npu-tpu") return "border-good bg-good-soft text-good";
  if (unit === "gpu") return "border-accent bg-accent-soft text-accent";
  return "border-warn bg-warning-soft text-warn";
}

function SiliconProfileGrid(props: {
  readonly profiles: readonly ModernSiliconProfile[];
  readonly selectedId: ModernSiliconId;
  readonly onSelect: (profile: ModernSiliconProfile) => void;
}): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {props.profiles.map((item) => {
        const active = item.id === props.selectedId;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`toon-silicon-card-${item.id}`}
            aria-pressed={active}
            onClick={() => props.onSelect(item)}
            className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
              active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
            }`}
          >
            <div className="flex w-full items-center justify-between gap-1">
              <span className="text-xs font-bold">{item.shortLabel}</span>
              <span className="rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-fg-2">
                {item.gpu.graphicsBackend}
              </span>
            </div>
            <span className="text-[11px] font-medium text-fg-2">{item.npuTpu.acceleratorLabel}</span>
            <span className="font-mono text-[10px] text-fg-3">{`${item.npuTpu.precisionLabel} · Wave ${item.gpu.subgroupSize}`}</span>
          </button>
        );
      })}
    </div>
  );
}

function ToonSiliconHeterogeneousSvg(props: {
  readonly plan: ToonSiliconFullPowerPlan;
  readonly isEn: boolean;
}): ReactElement {
  const { plan, isEn } = props;
  const { computeUnits, siliconProfile: silicon, runtimeBoundary, activeWorkloadRoute } = plan;
  const { cpu, gpu, npuTpu } = computeUnits;
  const siliconInk = formatOklch(silicon.accentOklch);
  const siliconFill = formatOklch(silicon.accentOklch, 0.12);
  const zeroCopyInk = npuTpu.zeroCopyMlTensorActive ? SVG_GOOD_INK : SVG_WARN_INK;

  const barMaxWidth = 132;
  const cpuBarW = Math.max(10, Math.round((cpu.loadSharePct / 100) * barMaxWidth));
  const gpuBarW = Math.max(10, Math.round((gpu.loadSharePct / 100) * barMaxWidth));
  const npuBarW = Math.max(10, Math.round((npuTpu.loadSharePct / 100) * barMaxWidth));
  const paddedShapeLabel = `[${npuTpu.paddedFocusShape.join("×")}]`;

  return (
    <svg
      data-testid="toon-silicon-architecture-svg"
      data-silicon-id={silicon.id}
      data-environment={plan.environment}
      data-memory-mode={plan.memoryMode}
      data-focus-workload={plan.focusWorkloadId}
      data-zero-copy={npuTpu.zeroCopyMlTensorActive ? "true" : "false"}
      data-subgroup-size={gpu.subgroupSize}
      data-violet-free="true"
      viewBox="0 0 720 316"
      role="img"
      aria-label={
        isEn
          ? `${silicon.nameEn} three-unit CPU, WebGPU, and NPU/TPU dispatch diagram`
          : `${silicon.nameKo} 3대 연산 유닛(CPU SIMD · WebGPU · NPU/TPU) 이기종 부하 분산 및 정적 텐서 배정 도해`
      }
      className="h-auto w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="720" height="316" fill={SVG_BG} />

      <text x="16" y="22" fill="currentColor" fontSize="11" fontWeight="700">
        {isEn ? `ToonSilicon 3-Unit Heterogeneous Dispatch · ${silicon.shortLabel}` : `ToonSilicon 3유닛 이기종 부하 분산 · ${silicon.shortLabel}`}
      </text>
      <text x="704" y="22" textAnchor="end" fill={zeroCopyInk} fontSize="9.5" fontWeight="700">
        {npuTpu.zeroCopyMlTensorActive
          ? isEn ? "ZERO-COPY MLTENSOR · 0 READBACKS" : "ZERO-COPY MLTENSOR · Readback 0회"
          : isEn ? "STAGED COPY FALLBACK · 2 READBACKS" : "스테이징 복사 폴백 · Readback 2회"}
      </text>

      {/* 좌측: ToonCore / SpectrumCompute 오케스트레이터 허브 */}
      <rect x="16" y="42" width="154" height="196" rx="10" fill={siliconFill} stroke={siliconInk} strokeWidth="1.5" />
      <text x="93" y="64" textAnchor="middle" fill={siliconInk} fontSize="10" fontWeight="700">ToonSilicon Hub</text>
      <text x="93" y="81" textAnchor="middle" fill="currentColor" fontSize="8.8" fontWeight="600">ToonCore · SpectrumCompute</text>
      <rect x="28" y="92" width="130" height="24" rx="5" fill={siliconInk} fillOpacity={0.18} />
      <text x="93" y="107" textAnchor="middle" fill="currentColor" fontFamily="monospace" fontSize="8.6" fontWeight="700">
        {cpu.memory64Active ? "WASM64 memory64 (i64)" : "WASM32 SIMD128 (i32)"}
      </text>
      <text x="93" y="135" textAnchor="middle" fill="currentColor" fontSize="8.6" fontWeight="700">
        {isEn ? activeWorkloadRoute.nameEn : activeWorkloadRoute.nameKo}
      </text>
      <text x="93" y="151" textAnchor="middle" fill="currentColor" fillOpacity={0.78} fontFamily="monospace" fontSize="8.4">{paddedShapeLabel}</text>
      <rect x="28" y="164" width="130" height="28" rx="5" fill={SVG_BG} stroke={SVG_FRAME} strokeWidth="1" />
      <text x="93" y="176" textAnchor="middle" fill="currentColor" fontSize="8.1" fontWeight="700">
        {runtimeBoundary.sandboxedBrowserTab
          ? isEn ? "Browser Sandbox Standard" : "브라우저 샌드박스 표준"
          : isEn ? "Native Shell FFI Bridge" : "네이티브 셸 FFI 브리지"}
      </text>
      <text x="93" y="188" textAnchor="middle" fill={runtimeBoundary.directNativeDriverBlocked ? SVG_WARN_INK : SVG_GOOD_INK} fontSize="7.8" fontWeight="700">
        {runtimeBoundary.directNativeDriverBlocked
          ? isEn ? "Direct CUDA/Metal/NNAPI Blocked" : "CUDA·Metal·ROCm·NNAPI 직접 차단"
          : isEn ? "Platform Native Delegate Active" : "플랫폼 네이티브 브리지 활성"}
      </text>
      <text x="93" y="218" textAnchor="middle" fill={siliconInk} fontFamily="monospace" fontSize="8.5" fontWeight="700">
        {`${cpu.loadSharePct}% / ${gpu.loadSharePct}% / ${npuTpu.loadSharePct}%`}
      </text>

      <path d="M 170 84 L 208 72" stroke={SVG_CPU_INK} strokeWidth="2" fill="none" />
      <path d="M 170 140 L 208 140" stroke={SVG_GPU_INK} strokeWidth="2" fill="none" />
      <path d="M 170 196 L 208 208" stroke={SVG_NPU_INK} strokeWidth="2" fill="none" />

      {/* 1. CPU SIMD 레인 */}
      <rect x="208" y="42" width="496" height="58" rx="9" fill={SVG_CPU_FILL} stroke={SVG_CPU_INK} strokeWidth="1.3" />
      <text x="222" y="61" fill={SVG_CPU_INK} fontSize="9.8" fontWeight="700">{`CPU SIMD · ${cpu.architectureLabel}`}</text>
      <text x="222" y="77" fill="currentColor" fontSize="8.5">
        {isEn
          ? `Workers ${cpu.totalWorkers} (P:${cpu.performanceWorkers} / E:${cpu.efficiencyWorkers}) · ${cpu.simdWidthBits}-bit SIMD · SharedArrayBuffer`
          : `워커 ${cpu.totalWorkers}개 (P:${cpu.performanceWorkers} / E:${cpu.efficiencyWorkers}) · ${cpu.simdWidthBits}-bit SIMD · SharedArrayBuffer`}
      </text>
      <text x="222" y="92" fill="currentColor" fillOpacity={0.78} fontSize="8.1">{isEn ? cpu.tileSwapStrategyEn : cpu.tileSwapStrategyKo}</text>
      <rect x="556" y="55" width={barMaxWidth} height="12" rx="4" fill={SVG_FRAME} />
      <rect x="556" y="55" width={cpuBarW} height="12" rx="4" fill={SVG_CPU_INK} />
      <text x="688" y="84" textAnchor="end" fill={SVG_CPU_INK} fontFamily="monospace" fontSize="10" fontWeight="700">{`${cpu.loadSharePct}%`}</text>

      {/* 2. WebGPU 레인 */}
      <rect x="208" y="111" width="496" height="58" rx="9" fill={SVG_GPU_FILL} stroke={SVG_GPU_INK} strokeWidth="1.3" />
      <text x="222" y="130" fill={SVG_GPU_INK} fontSize="9.8" fontWeight="700">{`WebGPU · ${gpu.gpuFamilyLabel} (${gpu.graphicsBackend})`}</text>
      <text x="222" y="146" fill="currentColor" fontSize="8.5">
        {isEn
          ? `Subgroup/Wave ${gpu.subgroupSize} · f16 ${gpu.f16ShaderEnabled ? "ON" : "OFF"} · Atlas ${gpu.atlasBudgetMb} MiB`
          : `Subgroup/Wave ${gpu.subgroupSize} · f16 ${gpu.f16ShaderEnabled ? "활성" : "비활성"} · 아틀라스 ${gpu.atlasBudgetMb} MiB`}
      </text>
      <text x="222" y="161" fill="currentColor" fillOpacity={0.78} fontSize="8.1">
        {gpu.unifiedMemoryZeroCopy
          ? isEn ? "Unified / Shared Memory Zero-Copy Atlas Path" : "통합·공유 메모리 Zero-Copy 아틀라스 경로"
          : isEn ? "Discrete / Staged Upload Texture Atlas Path" : "분리·스테이징 업로드 텍스처 아틀라스 경로"}
      </text>
      <rect x="556" y="124" width={barMaxWidth} height="12" rx="4" fill={SVG_FRAME} />
      <rect x="556" y="124" width={gpuBarW} height="12" rx="4" fill={SVG_GPU_INK} />
      <text x="688" y="153" textAnchor="end" fill={SVG_GPU_INK} fontFamily="monospace" fontSize="10" fontWeight="700">{`${gpu.loadSharePct}%`}</text>

      {/* 3. NPU / Google Tensor TPU 레인 */}
      <rect x="208" y="180" width="496" height="58" rx="9" fill={SVG_NPU_FILL} stroke={SVG_NPU_INK} strokeWidth="1.4" />
      <text x="222" y="199" fill={SVG_NPU_INK} fontSize="9.8" fontWeight="700">{`NPU / TPU · ${npuTpu.acceleratorLabel}`}</text>
      <text x="222" y="215" fill="currentColor" fontSize="8.5">
        {isEn
          ? `${npuTpu.precisionMode} · Static Pad ${npuTpu.staticShapeCompileRequired ? `${npuTpu.staticTensorPaddingAlign}-align` : "Dynamic"} · ${npuTpu.delegateLayer}`
          : `${npuTpu.precisionMode} · 정적 패딩 ${npuTpu.staticShapeCompileRequired ? `${npuTpu.staticTensorPaddingAlign}-정렬` : "동적 허용"} · ${npuTpu.delegateLayer}`}
      </text>
      <text x="222" y="230" fill="currentColor" fillOpacity={0.78} fontSize="8.1">{npuTpu.systolicOrTileLayout}</text>
      <rect x="556" y="193" width={barMaxWidth} height="12" rx="4" fill={SVG_FRAME} />
      <rect x="556" y="193" width={npuBarW} height="12" rx="4" fill={SVG_NPU_INK} />
      <text x="688" y="222" textAnchor="end" fill={SVG_NPU_INK} fontFamily="monospace" fontSize="10" fontWeight="700">{`${npuTpu.loadSharePct}%`}</text>

      {/* 하단 HUD */}
      <rect x="16" y="252" width="688" height="50" rx="8" fill={SVG_HUD_BG} />
      <text x="28" y="272" fill={SVG_HUD_FG} fontFamily="monospace" fontSize="9" fontWeight="700">
        {`${activeWorkloadRoute.subsystem} → ${activeWorkloadRoute.memoryPathLabel}`}
      </text>
      <text x="28" y="290" fill={SVG_HUD_FG} fillOpacity={0.85} fontSize="8.5">
        {isEn ? activeWorkloadRoute.kernelStrategyEn : activeWorkloadRoute.kernelStrategyKo}
      </text>
      <text x="692" y="272" textAnchor="end" fill={SVG_HUD_FG} fillOpacity={0.8} fontFamily="monospace" fontSize="8.2">
        {plan.modelKind}
      </text>
    </svg>
  );
}

/** ToonSilicon 8대 모던 실리콘 · Google Tensor TPU · WASM64 풀파워 제어판. */
export function StudioToonSiliconPanel(props: StudioToonSiliconPanelProps): ReactElement {
  const initialSiliconId = props.initialSiliconId ?? DEFAULT_MODERN_SILICON_ID;
  const isEn = (props.locale ?? "ko") === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const headingId = useId();

  const [state, setState] = useState<PanelState>({
    siliconId: initialSiliconId,
    environment: DEFAULT_EXECUTION_ENVIRONMENT,
    memoryMode: DEFAULT_MEMORY_ADDRESS_MODE,
    focusWorkloadId: DEFAULT_FOCUS_WORKLOAD_ID,
  });
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const { plan, json: planJson } = useMemo(() => exportToonSiliconPlanJson(state), [state]);

  const notifyPlanChange = (nextPlan: ToonSiliconFullPowerPlan): void => {
    if (!props.onPlanChange) return;
    try {
      const maybePromise = props.onPlanChange(nextPlan);
      if (maybePromise && typeof maybePromise.catch === "function") {
        void maybePromise.catch(() => {
          setStatusMessage(pick("상위 상태 동기화 콜백에서 오류가 발생했습니다.", "Plan change callback reported an error."));
        });
      }
    } catch {
      setStatusMessage(pick("상위 상태 동기화 콜백에서 오류가 발생했습니다.", "Plan change callback reported an error."));
    }
  };

  const applyPatch = (patch: Partial<PanelState>, noticeKo: string, noticeEn: string): void => {
    const next: PanelState = { ...state, ...patch };
    setState(next);
    const { plan: nextPlan } = exportToonSiliconPlanJson(next);
    notifyPlanChange(nextPlan);
    setStatusMessage(pick(noticeKo, noticeEn));
  };

  const handleSelectSilicon = (item: ModernSiliconProfile): void => {
    applyPatch(
      { siliconId: item.id },
      `${item.nameKo} 기준으로 CPU·WebGPU·NPU/TPU 배정표를 갱신했습니다.`,
      `Updated 3-unit dispatch plan for ${item.nameEn}.`,
    );
  };

  const handleCopyJson = async (): Promise<void> => {
    setShowJsonPreview(true);
    let clipboardCopied = false;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
        await navigator.clipboard.writeText(planJson);
        clipboardCopied = true;
      }
    } catch {
      clipboardCopied = false;
    }

    if (props.onExportJson) {
      try {
        await props.onExportJson(planJson, plan);
      } catch {
        setStatusMessage(pick("JSON 내보내기 콜백 처리 중 오류가 발생했습니다.", "Export callback failed."));
        return;
      }
    }

    setStatusMessage(
      clipboardCopied
        ? pick(`${plan.siliconProfile.shortLabel} ToonSilicon 배정 매니페스트 JSON을 복사했습니다.`, `Copied ${plan.siliconProfile.shortLabel} ToonSilicon dispatch manifest JSON.`)
        : pick("클립보드 접근이 제한되어 아래 JSON 미리보기를 열었습니다.", "Clipboard unavailable; opened the JSON manifest preview below."),
    );
  };

  const handleReset = (): void => {
    const defaults: PanelState = {
      siliconId: initialSiliconId,
      environment: DEFAULT_EXECUTION_ENVIRONMENT,
      memoryMode: DEFAULT_MEMORY_ADDRESS_MODE,
      focusWorkloadId: DEFAULT_FOCUS_WORKLOAD_ID,
    };
    setState(defaults);
    setShowJsonPreview(false);
    const { plan: nextPlan } = exportToonSiliconPlanJson(defaults);
    notifyPlanChange(nextPlan);
    setStatusMessage(pick("ToonSilicon 8대 실리콘 배정 설정을 초기값으로 되돌렸습니다.", "Reset ToonSilicon dispatch settings to defaults."));
  };

  const { computeUnits, runtimeBoundary, siliconProfile } = plan;

  return (
    <section
      data-testid="toon-silicon-panel"
      aria-labelledby={headingId}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {plan.brandStack}
            </span>
            <span
              data-testid="toon-silicon-boundary-badge"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${
                runtimeBoundary.sandboxedBrowserTab ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good"
              }`}
            >
              {runtimeBoundary.sandboxedBrowserTab ? (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {runtimeBoundary.sandboxedBrowserTab
                ? pick("브라우저 샌드박스 표준 API", "Browser Sandbox Standard API")
                : pick("네이티브 셸 FFI 브리지 활성", "Native Shell FFI Bridge Active")}
            </span>
            <span
              data-testid="toon-silicon-memory-badge"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-0.5 font-mono text-[11px] font-semibold text-fg-2 tabular-nums"
            >
              <HardDrive className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              {computeUnits.cpu.memory64Active ? "WASM64 · i64" : "WASM32 · i32"}
            </span>
          </div>
          <h2 id={headingId} className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("ToonSilicon 8대 모던 실리콘 · Google Tensor TPU · WASM64 오케스트레이터", "ToonSilicon 8 Modern Silicon & Google Tensor TPU WASM64 Orchestrator")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "8대 모던 실리콘의 CPU SIMD · WebGPU · NPU/TPU 3대 연산 유닛 배정과 6대 ToonStudio 워크로드 실행 경로를 설계합니다.",
              "Plans 3-unit CPU SIMD, WebGPU, and NPU/TPU dispatch and 6 ToonStudio workload routes across 8 modern silicon targets.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="toon-silicon-copy-json-btn" onClick={() => { void handleCopyJson(); }} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("매니페스트 JSON 복사", "Copy Manifest JSON")}
          </button>
          <button type="button" data-testid="toon-silicon-toggle-json-btn" onClick={() => setShowJsonPreview((prev) => !prev)} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showJsonPreview ? pick("JSON 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}
          </button>
          <button type="button" data-testid="toon-silicon-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {/* 8대 모던 실리콘 카드 (Android 4종 + Desktop/Apple 4종) */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-2 [word-break:keep-all]">
            <Smartphone className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("Android 모바일 실리콘 (4종 · Google Tensor TPU 포함)", "Android Mobile Silicon (4 · incl. Google Tensor TPU)")}
          </div>
          <SiliconProfileGrid profiles={ANDROID_PROFILES} selectedId={state.siliconId} onSelect={handleSelectSilicon} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-2 [word-break:keep-all]">
            <Monitor className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("Desktop & Apple 실리콘 (4종)", "Desktop & Apple Silicon (4)")}
          </div>
          <SiliconProfileGrid profiles={DESKTOP_APPLE_PROFILES} selectedId={state.siliconId} onSelect={handleSelectSilicon} />
        </div>
      </div>

      {/* 실행 환경 & WASM64/WASM32 토글 + 런타임 경계 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Zap className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("실행 환경 & 메모리 주소 모드", "Execution Environment & Memory Mode")}
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {EXECUTION_ENVIRONMENTS.map((env) => (
              <button
                key={env}
                type="button"
                data-testid={`toon-silicon-env-${env}`}
                aria-pressed={state.environment === env}
                onClick={() => applyPatch({ environment: env }, `실행 환경을 '${ENV_LABELS[env].ko}'로 전환했습니다.`, `Switched environment to '${ENV_LABELS[env].en}'.`)}
                className={`${state.environment === env ? BTN_ACTIVE : BTN_OUTLINE} justify-start text-left`}
              >
                {isEn ? ENV_LABELS[env].en : ENV_LABELS[env].ko}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
            {MEMORY_ADDRESS_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                data-testid={`toon-silicon-memory-${mode}`}
                aria-pressed={state.memoryMode === mode}
                onClick={() => applyPatch({ memoryMode: mode }, `메모리 주소 모드를 '${MEMORY_LABELS[mode].ko}'로 전환했습니다.`, `Switched memory address mode to '${MEMORY_LABELS[mode].en}'.`)}
                className={state.memoryMode === mode ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {isEn ? MEMORY_LABELS[mode].en : MEMORY_LABELS[mode].ko}
              </button>
            ))}
          </div>
        </div>

        <div data-testid="toon-silicon-boundary-panel" className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              {runtimeBoundary.directNativeDriverBlocked ? (
                <ShieldAlert className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden="true" />
              )}
              {pick("브라우저 표준 API vs 네이티브 FFI 경계", "Browser Standard API vs Native FFI Boundary")}
            </span>
            <span className="font-mono text-[10px] text-fg-3">{siliconProfile.platformLabel}</span>
          </div>
          <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            {isEn ? runtimeBoundary.boundarySummaryEn : runtimeBoundary.boundarySummaryKo}
          </p>
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-fg-2">{pick("활성 표준 계층", "Active Standard Layers")}</div>
            <div className="flex flex-wrap gap-1.5">
              {runtimeBoundary.activeStandardLayers.map((layer) => (
                <span key={layer} className="rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[10px] text-fg">{layer}</span>
              ))}
            </div>
          </div>
          {runtimeBoundary.directNativeDriverBlocked ? (
            <div className="rounded-lg border border-warn bg-warning-soft px-2.5 py-2 text-[11px] text-warn [word-break:keep-all]">
              <span className="font-semibold">{pick("직접 호출 차단: ", "Blocked Direct APIs: ")}</span>
              <span className="font-mono">{runtimeBoundary.blockedDirectApis.join(" · ")}</span>
            </div>
          ) : (
            <div className="rounded-lg border border-good bg-good-soft px-2.5 py-2 text-[11px] text-good [word-break:keep-all]">
              <span className="font-semibold">{pick("네이티브 FFI 확장: ", "Native FFI Bridge: ")}</span>
              <span>{runtimeBoundary.nativeFfiBridgeLayers.join(" · ")}</span>
            </div>
          )}
        </div>
      </div>

      {/* 순수 시맨틱 SVG 3유닛 이기종 부하 분산 도해 */}
      <ToonSiliconHeterogeneousSvg plan={plan} isEn={isEn} />

      {/* 3대 연산 유닛 요약 KPI */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
        <div data-testid="toon-silicon-unit-cpu" className="space-y-1 rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between text-xs font-bold text-fg">
            <span>{pick("CPU SIMD 워커", "CPU SIMD Workers")}</span>
            <span className="font-mono text-accent tabular-nums">{`${computeUnits.cpu.loadSharePct}%`}</span>
          </div>
          <p className="font-mono text-xs font-semibold text-fg tabular-nums">
            {`${computeUnits.cpu.totalWorkers} workers (P:${computeUnits.cpu.performanceWorkers} / E:${computeUnits.cpu.efficiencyWorkers}) · ${computeUnits.cpu.simdWidthBits}-bit`}
          </p>
          <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? computeUnits.cpu.clusterTopologyEn : computeUnits.cpu.clusterTopologyKo}</p>
          <p className="font-mono text-[10px] text-fg-3">{computeUnits.cpu.linearAddressCeilingLabel}</p>
        </div>

        <div data-testid="toon-silicon-unit-gpu" className="space-y-1 rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between text-xs font-bold text-fg">
            <span>{pick("WebGPU 연산 유닛", "WebGPU Compute Unit")}</span>
            <span className="font-mono text-accent tabular-nums">{`${computeUnits.gpu.loadSharePct}%`}</span>
          </div>
          <p className="font-mono text-xs font-semibold text-fg tabular-nums">
            {`Wave ${computeUnits.gpu.subgroupSize} · f16 · ${computeUnits.gpu.atlasBudgetMb} MiB`}
          </p>
          <p className="text-[11px] text-fg-2 [word-break:keep-all]">{computeUnits.gpu.gpuFamilyLabel}</p>
          <p className="font-mono text-[10px] text-fg-3">{computeUnits.gpu.graphicsBackend}</p>
        </div>

        <div data-testid="toon-silicon-unit-npu" className="space-y-1 rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between text-xs font-bold text-fg">
            <span>{pick("NPU / Google TPU", "NPU / Google TPU")}</span>
            <span className="font-mono text-accent tabular-nums">{`${computeUnits.npuTpu.loadSharePct}%`}</span>
          </div>
          <p className="font-mono text-xs font-semibold text-fg tabular-nums">
            {`${computeUnits.npuTpu.precisionMode} · ${computeUnits.npuTpu.zeroCopyMlTensorActive ? "Zero-Copy MLTensor" : "Staging Copy"}`}
          </p>
          <p className="text-[11px] text-fg-2 [word-break:keep-all]">{computeUnits.npuTpu.acceleratorLabel}</p>
          <p className="font-mono text-[10px] text-fg-3">{computeUnits.npuTpu.delegateLayer}</p>
        </div>
      </div>

      {/* 6대 ToonStudio 워크로드 최적 경로표 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("6대 ToonStudio 워크로드 최적 디스패치 경로표", "6 ToonStudio Workload Optimal Dispatch Routes")}
          </div>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">
            {pick("워크로드를 선택하면 상단 3유닛 도해가 즉시 갱신됩니다.", "Select a workload to inspect its 3-unit balance above.")}
          </span>
        </div>

        <div className="space-y-1.5">
          {plan.workloadRoutes.map((route) => {
            const focused = route.workloadId === state.focusWorkloadId;
            return (
              <button
                key={route.workloadId}
                type="button"
                data-testid={`toon-silicon-workload-${route.workloadId}`}
                aria-pressed={focused}
                onClick={() =>
                  applyPatch(
                    { focusWorkloadId: route.workloadId },
                    `'${route.nameKo}' 워크로드의 3유닛 부하 분산과 텐서 정렬 경로를 표시합니다.`,
                    `Focused 3-unit balance and tensor route for '${route.nameEn}'.`,
                  )
                }
                className={`flex min-h-11 w-full cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                  focused ? "border-accent bg-accent-soft text-fg" : "border-line bg-panel text-fg hover:border-line-strong hover:bg-raised"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-fg-3">{`0${route.order}`}</span>
                    <span className="text-xs font-bold">{isEn ? route.nameEn : route.nameKo}</span>
                    <span className="rounded-md border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-fg-2">{route.subsystem}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${unitPillClass(route.primaryUnit)}`}>
                      {isEn ? UNIT_BADGE_LABELS[route.primaryUnit].en : UNIT_BADGE_LABELS[route.primaryUnit].ko}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-fg tabular-nums">
                    {`CPU ${route.cpuSharePct}% · GPU ${route.gpuSharePct}% · NPU/TPU ${route.npuTpuSharePct}%`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-2">
                  <span>{isEn ? route.kernelStrategyEn : route.kernelStrategyKo}</span>
                  <span className="font-mono text-[10px] text-fg-3">{`${route.staticTensorShapeLabel} · ${route.memoryPathLabel}`}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 정직성 고지 & 상태 알림 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5 text-[11px] text-fg-2 [word-break:keep-all]">
        <span data-testid="toon-silicon-honesty-notice" className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          {isEn ? plan.honestyNoticeEn : plan.honestyNoticeKo}
        </span>
        {statusMessage ? (
          <span role="status" data-testid="toon-silicon-status-message" className="font-semibold text-accent">{statusMessage}</span>
        ) : null}
      </div>

      {showJsonPreview ? (
        <pre
          data-testid="toon-silicon-json-preview"
          className="max-h-72 overflow-auto rounded-xl border border-line-strong bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg tabular-nums"
        >
          {planJson}
        </pre>
      ) : null}
    </section>
  );
}
