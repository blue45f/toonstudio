/**
 * Wave 52C — 4대 실리콘(Apple·Intel·AMD·Samsung Galaxy) 이기종 WebNN NPU · WebGPU f16 · CPU SIMD 제어판.
 *
 * - 5대 실리콘 카드(Apple M-Series · Intel Core Ultra · AMD Ryzen AI · Galaxy Snapdragon · Galaxy Exynos)
 * - WebNN / WebGPU / WebGPU f16 / Subgroups / WASM Relaxed-SIMD / 배터리 절전 실시간 토글
 * - 순수 시맨틱 SVG 3레인 이기종 분산 파이프라인 도해(oklch/currentColor 전용, 바이올렛 휴 270~320° 0%)
 * - 열·배터리 경합 회피 계획 점수(아키텍처 분산 계획 모델 명시) · ONNX Runtime Web EP 미리보기 · JSON 복사
 */

import {
  AlertTriangle, BatteryCharging, CheckCircle2, Copy, Cpu, Eye, FileJson,
  Layers, RotateCcw, ShieldAlert, ShieldCheck, SlidersHorizontal, Thermometer, Zap,
} from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactElement } from "react";

import { copyText } from "@/shared/lib/copy-text";

import {
  FALLBACK_TIER_ORDER, SILICON_DEVICE_PROFILES, TOONSTUDIO_HETEROGENEOUS_WORKLOADS,
  exportHeterogeneousManifestJson, getSiliconDeviceProfile, scheduleHeterogeneousWorkloads,
  type AcceleratorLaneSummary, type AvoidanceGrade, type ExecutionTierId, type GuardSeverity,
  type HeterogeneousRuntimeManifest, type HeterogeneousWorkloadSchedule,
  type RuntimeCapabilityFlags, type SiliconDeviceId, type WorkloadId,
} from "./heterogeneous-npu-engine";

export interface StudioHeterogeneousSiliconPanelProps {
  readonly initialSiliconId?: SiliconDeviceId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onScheduleChange?: (schedule: HeterogeneousWorkloadSchedule) => void;
  readonly onExportJson?: (json: string, manifest: HeterogeneousRuntimeManifest) => void;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트(NPU 155°, WebGPU 215°, WASM SIMD 72°, 경보 25°, 절전 190°)
const SVG_INK_NPU = "oklch(0.55 0.14 155)";
const SVG_INK_WEBGPU = "oklch(0.56 0.12 215)";
const SVG_INK_WASM = "oklch(0.66 0.14 72)";
const SVG_INK_ALERT = "oklch(0.57 0.20 25)";
const SVG_INK_TEAL = "oklch(0.54 0.11 190)";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

type ToggleFlagKey =
  | "webnnAvailable" | "webgpuAvailable" | "webgpuF16Available"
  | "webgpuSubgroupsAvailable" | "wasmRelaxedSimdAvailable" | "batterySaverMode";

const RUNTIME_FLAG_TOGGLES: readonly {
  readonly key: ToggleFlagKey; readonly labelKo: string; readonly labelEn: string; readonly hintKo: string; readonly hintEn: string;
}[] = [
  { key: "webnnAvailable", labelKo: "WebNN NPU", labelEn: "WebNN NPU", hintKo: "CoreML · DirectML · NNAPI", hintEn: "CoreML / DirectML / NNAPI" },
  { key: "webgpuAvailable", labelKo: "WebGPU 런타임", labelEn: "WebGPU Runtime", hintKo: "Metal · Arc · RDNA · Adreno", hintEn: "Metal / Arc / RDNA / Adreno" },
  { key: "webgpuF16Available", labelKo: "WebGPU f16", labelEn: "WebGPU f16", hintKo: "shader-f16 반정밀도 대역폭 절감", hintEn: "shader-f16 half-precision path" },
  { key: "webgpuSubgroupsAvailable", labelKo: "WebGPU Subgroups", labelEn: "WebGPU Subgroups", hintKo: "BVH · 임파스토 서브그룹 셔플", hintEn: "BVH & impasto subgroup shuffles" },
  { key: "wasmRelaxedSimdAvailable", labelKo: "WASM Relaxed-SIMD", labelEn: "WASM Relaxed-SIMD", hintKo: "NEON·AMX·AVX-512·SVE2 로워링", hintEn: "NEON / AMX / AVX-512 / SVE2" },
  { key: "batterySaverMode", labelKo: "배터리 절전 모드", labelEn: "Battery Saver Mode", hintKo: "저전력 NPU · 60컷 배치 완화", hintEn: "Low-power NPU & paced batch" },
];

const TIER_LABELS: Readonly<Record<ExecutionTierId, { readonly ko: string; readonly en: string }>> = {
  "webnn-npu": { ko: "1단 WebNN NPU", en: "T1 WebNN NPU" },
  "webgpu-f16": { ko: "2단 WebGPU f16", en: "T2 WebGPU f16" },
  "wasm-relaxed-simd128": { ko: "3단 WASM SIMD128", en: "T3 WASM SIMD128" },
  "wasm-scalar": { ko: "4단 WASM Scalar", en: "T4 WASM Scalar" },
};

function gradeToneClass(grade: AvoidanceGrade): string {
  if (grade === "optimal") return "border-good bg-good-soft text-good";
  return grade === "balanced" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
}

function severityToneClass(severity: GuardSeverity): string {
  if (severity === "critical") return "border-bad bg-bad-soft text-bad";
  return severity === "warn" ? "border-warn bg-warning-soft text-warn" : "border-line bg-raised text-fg-2";
}

function HeterogeneousThreeLaneSvg(props: {
  readonly schedule: HeterogeneousWorkloadSchedule;
  readonly isEn: boolean;
}): ReactElement {
  const { schedule, isEn } = props;
  const { siliconProfile, lanes, contentionScore, activeFallbackLadder, flags } = schedule;
  const laneRows: readonly { readonly summary: AcceleratorLaneSummary; readonly y: number; readonly ink: string }[] = [
    { summary: lanes.npu, y: 42, ink: SVG_INK_NPU },
    { summary: lanes.webgpu, y: 126, ink: SVG_INK_WEBGPU },
    { summary: lanes["wasm-simd"], y: 210, ink: SVG_INK_WASM },
  ];
  const gradeInk =
    contentionScore.avoidanceGrade === "optimal"
      ? SVG_INK_NPU
      : contentionScore.avoidanceGrade === "balanced" ? SVG_INK_WASM : SVG_INK_ALERT;

  return (
    <svg
      data-testid="heterogeneous-three-lane-svg"
      data-silicon-id={siliconProfile.id}
      data-npu-count={lanes.npu.workloads.length}
      data-webgpu-count={lanes.webgpu.workloads.length}
      data-wasm-count={lanes["wasm-simd"].workloads.length}
      data-avoidance-grade={contentionScore.avoidanceGrade}
      viewBox="0 0 720 356"
      role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={
        isEn
          ? `3-lane heterogeneous pipeline diagram for ${siliconProfile.shortLabelEn}: NPU ${lanes.npu.workloads.length}, WebGPU ${lanes.webgpu.workloads.length}, WASM/CPU ${lanes["wasm-simd"].workloads.length}`
          : `${siliconProfile.shortLabelKo} 3레인 이기종 가속 파이프라인 도해: NPU ${lanes.npu.workloads.length}건, WebGPU ${lanes.webgpu.workloads.length}건, WASM/CPU ${lanes["wasm-simd"].workloads.length}건`
      }
    >
      <rect x="8" y="8" width="704" height="340" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="22" y="28" fill="currentColor" fillOpacity={0.82} fontSize="11" fontWeight="700">
        {isEn
          ? `3-LANE HETEROGENEOUS PIPELINE · ${siliconProfile.shortLabelEn.toUpperCase()}`
          : `3레인 이기종 분산 파이프라인 · ${siliconProfile.shortLabelKo}`}
      </text>
      <text x="698" y="28" textAnchor="end" fill={gradeInk} fontSize="10" fontWeight="700">
        {isEn
          ? `PLAN SCORE ${contentionScore.overallAvoidanceScore}/100 · ${contentionScore.activeLaneCount}/3 LANES`
          : `분산 계획 점수 ${contentionScore.overallAvoidanceScore}/100 · 활성 ${contentionScore.activeLaneCount}/3레인`}
      </text>

      {laneRows.map(({ summary, y, ink }) => {
        const strokeInk = summary.isContended ? SVG_INK_ALERT : summary.isActive ? ink : "currentColor";
        const count = summary.workloads.length;
        const barW = Math.round((Math.min(100, summary.loadSharePct) / 100) * 140);
        const chipCols = count <= 3 ? Math.max(1, count) : 3;
        const chipW = Math.floor((480 - (chipCols - 1) * 6) / chipCols);

        return (
          <g key={summary.laneId}>
            <rect
              x="20" y={y} width="680" height="74" rx="8"
              fill={summary.isActive ? ink : "currentColor"}
              fillOpacity={summary.isActive ? 0.07 : 0.03}
              stroke={strokeInk} strokeOpacity={summary.isActive ? 0.72 : 0.25}
              strokeWidth={summary.isContended ? 2 : 1.4}
              strokeDasharray={summary.isActive ? undefined : "4 3"}
            />
            <text x="32" y={y + 19} fill={summary.isActive ? ink : "currentColor"} fillOpacity={summary.isActive ? 1 : 0.55} fontSize="10" fontWeight="700">
              {isEn ? summary.titleEn : summary.titleKo}
            </text>
            <text x="32" y={y + 34} fill="currentColor" fillOpacity={0.68} fontSize="8.8">
              {(isEn ? summary.backendNameEn : summary.backendNameKo).slice(0, 32)}
            </text>
            <rect x="32" y={y + 44} width="140" height="8" rx="4" fill="currentColor" fillOpacity={0.12} />
            {barW > 0 && <rect x="32" y={y + 44} width={barW} height="8" rx="4" fill={summary.isContended ? SVG_INK_ALERT : ink} fillOpacity={0.86} />}
            <text x="32" y={y + 65} fill={summary.isContended ? SVG_INK_ALERT : "currentColor"} fillOpacity={summary.isContended ? 1 : 0.65} fontSize="8.5" fontWeight="600">
              {isEn
                ? `Load ${summary.loadSharePct}% · ${count} task${count === 1 ? "" : "s"}${summary.isContended ? " · CONTENDED" : ""}`
                : `부하 비중 ${summary.loadSharePct}% · ${count}개 작업${summary.isContended ? " · 경합" : ""}`}
            </text>

            {count === 0 ? (
              <g>
                <rect x="204" y={y + 18} width="482" height="38" rx="6" fill="none" stroke="currentColor" strokeOpacity={0.22} strokeDasharray="4 3" />
                <text x="445" y={y + 41} textAnchor="middle" fill="currentColor" fillOpacity={0.55} fontSize="9.5">
                  {isEn ? "Lane idle / bypassed — workloads auto-rerouted down fallback ladder" : "레인 유휴/비활성 — 하위 폴백 레인으로 자동 우회 배치됨"}
                </text>
              </g>
            ) : (
              summary.workloads.map((item, idx) => {
                const col = idx % chipCols;
                const row = Math.floor(idx / chipCols);
                const chipH = count > 3 ? 27 : 52;
                const cx = 204 + col * (chipW + 6);
                const cy = y + (count > 3 ? 9 + row * 31 : 11);
                const chipInk = item.isFallback ? SVG_INK_ALERT : item.batchPacingMode === "throttled-batch" ? SVG_INK_TEAL : ink;
                return (
                  <g key={item.workloadId}>
                    <rect
                      x={cx} y={cy} width={chipW} height={chipH} rx="6"
                      fill={chipInk} fillOpacity={0.12}
                      stroke={chipInk} strokeWidth={item.isFallback ? 1.6 : 1.2}
                      strokeDasharray={item.isFallback ? "3 2" : undefined}
                    />
                    <text x={cx + 8} y={cy + (count > 3 ? 12 : 20)} fill="currentColor" fontSize="9.2" fontWeight="700">
                      {isEn ? item.shortLabelEn : item.shortLabelKo}
                    </text>
                    <text x={cx + 8} y={cy + (count > 3 ? 23 : 36)} fill={chipInk} fontSize="8.2" fontWeight="600">
                      {`${item.effectivePrecision.toUpperCase()} · ${item.ortProvider}${item.isFallback ? (isEn ? " ↘ fallback" : " ↘ 폴백") : ""}`}
                    </text>
                  </g>
                );
              })
            )}
          </g>
        );
      })}

      {/* 하단 4단 무중단 폴백 사다리 + 정직성 라벨 */}
      <rect x="20" y="294" width="680" height="44" rx="8" fill="currentColor" fillOpacity={0.04} stroke="currentColor" strokeOpacity={0.14} />
      <text x="32" y="311" fill="currentColor" fillOpacity={0.76} fontSize="9" fontWeight="700">
        {isEn ? "4-TIER ZERO-DOWNTIME FALLBACK LADDER" : "4단 무중단 폴백 체인"}
      </text>
      {FALLBACK_TIER_ORDER.map((tier, idx) => {
        const active = activeFallbackLadder.includes(tier);
        const bx = 216 + idx * 119;
        const badgeInk = tier === "webnn-npu" ? SVG_INK_NPU : tier === "webgpu-f16" ? SVG_INK_WEBGPU : tier === "wasm-relaxed-simd128" ? SVG_INK_WASM : SVG_INK_TEAL;
        return (
          <g key={tier}>
            <rect x={bx} y="299" width="110" height="18" rx="4" fill={active ? badgeInk : "currentColor"} fillOpacity={active ? 0.16 : 0.05} stroke={active ? badgeInk : "currentColor"} strokeOpacity={active ? 0.8 : 0.22} />
            <text x={bx + 55} y="311" textAnchor="middle" fill={active ? badgeInk : "currentColor"} fillOpacity={active ? 1 : 0.45} fontSize="8.2" fontWeight="700">
              {isEn ? TIER_LABELS[tier].en : TIER_LABELS[tier].ko}
            </text>
          </g>
        );
      })}
      <text x="32" y="331" fill="currentColor" fillOpacity={0.62} fontSize="8.5">
        {isEn
          ? `Architecture Distribution Plan Model (not measured TOPS/W) · Battery Saver: ${flags.batterySaverMode ? "ON" : "OFF"}`
          : `아키텍처 분산 계획 모델 (실측 TOPS·소비전력 아님) · 배터리 절전: ${flags.batterySaverMode ? "활성" : "비활성"}`}
      </text>
    </svg>
  );
}

/** 4대 실리콘(Apple·Intel·AMD·Samsung Galaxy) 이기종 WebNN NPU · WebGPU f16 · CPU SIMD 스튜디오 제어판. */
export function StudioHeterogeneousSiliconPanel(props: StudioHeterogeneousSiliconPanelProps): ReactElement {
  const { initialSiliconId = "apple-m-series", locale = "ko", className, onScheduleChange, onExportJson } = props;
  const headingId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [siliconId, setSiliconId] = useState<SiliconDeviceId>(initialSiliconId);
  const [flags, setFlags] = useState<RuntimeCapabilityFlags>(() => getSiliconDeviceProfile(initialSiliconId).defaultFlags);
  const [selectedOrtWorkloadId, setSelectedOrtWorkloadId] = useState<WorkloadId>("face-eye-protection");
  const [showManifestPreview, setShowManifestPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const copyRequest = useRef(0);

  const schedule = useMemo(() => scheduleHeterogeneousWorkloads({ siliconId, flags }), [siliconId, flags]);
  const { json: manifestJson, manifest } = useMemo(() => exportHeterogeneousManifestJson(schedule), [schedule]);
  const selectedOrtConfig = schedule.ortSessionOptionsByWorkload[selectedOrtWorkloadId];
  const selectedOrtJson = useMemo(() => JSON.stringify(selectedOrtConfig, null, 2), [selectedOrtConfig]);

  const applyScheduleState = (nextSiliconId: SiliconDeviceId, nextFlags: RuntimeCapabilityFlags, msgKo: string, msgEn: string): void => {
    copyRequest.current += 1;
    setSiliconId(nextSiliconId);
    setFlags(nextFlags);
    onScheduleChange?.(scheduleHeterogeneousWorkloads({ siliconId: nextSiliconId, flags: nextFlags }));
    setStatusMessage(pick(msgKo, msgEn));
  };

  const handleSelectSilicon = (nextId: SiliconDeviceId): void => {
    const profile = getSiliconDeviceProfile(nextId);
    applyScheduleState(
      nextId, profile.defaultFlags,
      `실리콘 프로파일을 '${profile.shortLabelKo}'로 전환해 3레인 스케줄과 ORT EP를 재계산했다.`,
      `Switched silicon profile to '${profile.shortLabelEn}' and recomputed 3-lane schedule and ORT EP options.`,
    );
  };

  const handleToggleFlag = (key: ToggleFlagKey): void => {
    const nextVal = !flags[key];
    const nextFlags: RuntimeCapabilityFlags = { ...flags, [key]: nextVal };
    applyScheduleState(
      siliconId, nextFlags,
      `${key} 플래그를 ${nextVal ? "활성" : "비활성"}으로 전환해 4단 폴백과 경합 점수를 갱신했다.`,
      `Toggled ${key} ${nextVal ? "ON" : "OFF"} and updated 4-tier fallback and contention plan.`,
    );
  };

  const handleReset = (): void => {
    const base = getSiliconDeviceProfile(initialSiliconId);
    applyScheduleState(
      initialSiliconId, base.defaultFlags,
      `초기 실리콘 프로파일('${base.shortLabelKo}') 기본값으로 복원했다.`,
      `Reset to initial silicon profile ('${base.shortLabelEn}').`,
    );
  };

  const copyJson = async (text: string): Promise<void> => {
    const request = ++copyRequest.current;
    setStatusMessage("");
    const copied = await copyText(text);
    if (request !== copyRequest.current) return;
    setStatusMessage(copied
      ? pick("JSON을 복사했습니다.", "Copied JSON to the clipboard.")
      : pick("복사할 수 없습니다. 화면에 표시된 JSON을 직접 복사해 주세요.", "Could not copy. Copy the displayed JSON manually."));
  };

  const handleExportManifest = (): void => {
    setShowManifestPreview(true);
    onExportJson?.(manifestJson, manifest);
    void copyJson(manifestJson);
  };

  const handleCopyOrtConfig = (): void => {
    void copyJson(selectedOrtJson);
  };

  const { siliconProfile, contentionScore } = schedule;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="studio-heterogeneous-silicon-panel"
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-bold text-fg [word-break:keep-all]">
              {pick("4대 실리콘 이기종 WebNN NPU · WebGPU f16 · CPU SIMD 오케스트레이터", "4-Silicon Heterogeneous WebNN NPU · WebGPU f16 · CPU SIMD Orchestrator")}
            </h2>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "기기 예제와 기능 옵션을 바꿔 ToonStudio 작업 6개의 NPU·WebGPU·Rust WASM 배치 계획을 비교합니다.",
              "Compare NPU, WebGPU, and Rust WASM plans for six ToonStudio workloads using example devices and feature settings.",
            )}
          </p>
        </div>
        <button type="button" data-testid="reset-silicon-router-btn" onClick={handleReset} className={BTN_OUTLINE}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("초기값 복원", "Reset")}</span>
        </button>
      </header>

      {/* 5대 대표 실리콘 카드 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
          <Zap className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("5대 실리콘 프로파일 (Apple · Intel · AMD · Samsung Galaxy)", "5 Silicon Profiles (Apple · Intel · AMD · Samsung Galaxy)")}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {SILICON_DEVICE_PROFILES.map((item) => {
            const isSelected = item.id === siliconId;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`silicon-card-${item.id}`}
                aria-pressed={isSelected}
                onClick={() => handleSelectSilicon(item.id)}
                className={`${isSelected ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-start p-3 text-left`}
              >
                <span className="text-xs font-bold">{isEn ? item.shortLabelEn : item.shortLabelKo}</span>
                <span className="text-[10px] font-normal text-fg-2 [word-break:keep-all]">
                  {isEn ? item.npuBackendEn : item.npuBackendKo}
                </span>
                <span className="text-[10px] font-normal text-fg-3 [word-break:keep-all]">
                  {isEn ? item.osPlatformEn : item.osPlatformKo}
                </span>
              </button>
            );
          })}
        </div>
        <div data-testid="active-silicon-note" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          <span className="font-semibold text-fg">{isEn ? siliconProfile.nameEn : siliconProfile.nameKo}: </span>
          {isEn ? siliconProfile.platformNoteEn : siliconProfile.platformNoteKo}
        </div>
      </div>

      {/* 런타임 기능 토글 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
          <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("런타임 가속 기능 · 배터리 절전 토글", "Runtime Accelerator & Battery Saver Toggles")}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {RUNTIME_FLAG_TOGGLES.map((item) => {
            const checked = flags[item.key];
            return (
              <button
                key={item.key}
                type="button"
                role="switch"
                aria-checked={checked}
                data-testid={`toggle-${item.key}`}
                onClick={() => handleToggleFlag(item.key)}
                className={`${checked ? BTN_ACTIVE : BTN_OUTLINE} justify-between px-3 py-2 text-left`}
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

      {/* 열·배터리 경합 회피 계획 지표 4카드 */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`rounded-xl border p-3 ${gradeToneClass(contentionScore.avoidanceGrade)}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            {contentionScore.avoidanceGrade === "contended" ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{pick("종합 경합 회피 계획 점수", "Overall Avoidance Plan")}</span>
          </div>
          <div data-testid="overall-avoidance-score" className="mt-1 font-mono text-base font-bold tabular-nums">
            {contentionScore.overallAvoidanceScore} / 100
          </div>
          <div className="mt-0.5 text-[10px] tabular-nums">
            {pick(`등급: ${contentionScore.avoidanceGrade} · 활성 ${contentionScore.activeLaneCount}/3레인`, `Grade: ${contentionScore.avoidanceGrade} · ${contentionScore.activeLaneCount}/3 lanes`)}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("3레인 워크로드 분리도", "3-Lane Separation")}</span>
          </div>
          <div data-testid="lane-separation-score" className="mt-1 font-mono text-base font-bold text-fg tabular-nums">
            {contentionScore.laneSeparationScore} / 100
          </div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">
            {pick(`GPU 폴백 ${contentionScore.spilledToGpuCount} · CPU 폴백 ${contentionScore.spilledToCpuCount}`, `GPU spill ${contentionScore.spilledToGpuCount} · CPU spill ${contentionScore.spilledToCpuCount}`)}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
            <Thermometer className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("열 경합 회피 계획", "Thermal Contention Plan")}</span>
          </div>
          <div data-testid="thermal-avoidance-score" className="mt-1 font-mono text-base font-bold text-fg tabular-nums">
            {contentionScore.thermalAvoidanceScore} / 100
          </div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">
            {pick(`최대 단일 레인 집중도 ${contentionScore.peakLaneSharePct}%`, `Peak single-lane share ${contentionScore.peakLaneSharePct}%`)}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
            <BatteryCharging className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("배터리 효율 분산 계획", "Battery Efficiency Plan")}</span>
          </div>
          <div data-testid="battery-avoidance-score" className="mt-1 font-mono text-base font-bold text-fg tabular-nums">
            {contentionScore.batteryAvoidanceScore} / 100
          </div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">
            {pick(`절전 모드 ${flags.batterySaverMode ? "ON" : "OFF"} · 스칼라 ${contentionScore.scalarFallbackCount}건`, `Battery saver ${flags.batterySaverMode ? "ON" : "OFF"} · Scalar ${contentionScore.scalarFallbackCount}`)}
          </div>
        </div>
      </div>

      {/* 순수 시맨틱 SVG 3레인 도해 + 아키텍처 계획 모델 정직성 고지 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <HeterogeneousThreeLaneSvg schedule={schedule} isEn={isEn} />
        <p data-testid="architecture-plan-disclosure" className="rounded-lg border border-line bg-raised px-3 py-2 text-[11px] text-fg-2 [word-break:keep-all]">
          {isEn ? contentionScore.honestyDisclosureEn : contentionScore.honestyDisclosureKo}
        </p>
      </div>

      {/* 6대 워크로드 라우팅 상세표 + 런타임 가드 경보 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5 lg:col-span-8">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">
            {pick("ToonStudio 6대 워크로드 4단 폴백 라우팅표", "ToonStudio 6-Workload 4-Tier Fallback Routing Table")}
          </div>
          <div className="overflow-x-auto">
            <table data-testid="workload-routing-table" className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[11px] text-fg-3">
                  <th scope="col" className="px-2 py-2 font-semibold">{pick("워크로드", "Workload")}</th>
                  <th scope="col" className="px-2 py-2 font-semibold">{pick("실행 티어 · 레인", "Tier & Lane")}</th>
                  <th scope="col" className="px-2 py-2 font-semibold">{pick("정밀도 · ORT EP", "Precision · EP")}</th>
                  <th scope="col" className="px-2 py-2 font-semibold">{pick("배치 상세 · 폴백 사유", "Backend & Fallback Reason")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {schedule.assignments.map((row) => (
                  <tr key={row.workloadId} data-testid={`workload-row-${row.workloadId}`} data-resolved-tier={row.resolvedTier} className="align-top">
                    <td className="px-2 py-2 font-semibold text-fg [word-break:keep-all]">{isEn ? row.nameEn : row.nameKo}</td>
                    <td className="px-2 py-2 font-mono text-[11px] tabular-nums">
                      <span className={`inline-block rounded border px-1.5 py-0.5 ${row.isFallback ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good"}`}>
                        {isEn ? TIER_LABELS[row.resolvedTier].en : TIER_LABELS[row.resolvedTier].ko}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px] text-fg-2 tabular-nums">
                      {row.effectivePrecision.toUpperCase()} · {row.ortProvider}
                    </td>
                    <td className="space-y-0.5 px-2 py-2 text-[11px] text-fg-2 [word-break:keep-all]">
                      <div>{isEn ? row.executionDetailEn : row.executionDetailKo}</div>
                      <div className="text-fg-3">{isEn ? row.fallbackReasonEn : row.fallbackReasonKo}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-card p-3.5 lg:col-span-4">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">
            {pick("폴백 · 경합 경보 목록", "Fallback & Contention Advisories")}
          </div>
          {schedule.warnings.length === 0 ? (
            <div data-testid="heterogeneous-warnings-empty" className="flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs text-good [word-break:keep-all]">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{pick("3레인 이기종 가속(NPU·WebGPU f16·SIMD)이 경합 없이 분리 배치됐다.", "All 3 heterogeneous lanes are separated without contention.")}</span>
            </div>
          ) : (
            <ul data-testid="heterogeneous-warnings-list" className="space-y-1.5">
              {schedule.warnings.map((warning) => (
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

      {/* ONNX Runtime Web EP 설정 미리보기 & JSON 매니페스트 내보내기 */}
      <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">
            {pick("ONNX Runtime Web EP 설정 미리보기 (buildOrtWebSessionOptions)", "ONNX Runtime Web EP Config Preview (buildOrtWebSessionOptions)")}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="copy-ort-ep-btn" onClick={handleCopyOrtConfig} className={BTN_OUTLINE}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("ORT EP 복사", "Copy ORT EP")}</span>
            </button>
            <button type="button" data-testid="toggle-manifest-preview-btn" onClick={() => setShowManifestPreview((prev) => !prev)} className={BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showManifestPreview ? pick("매니페스트 닫기", "Hide Manifest") : pick("매니페스트 보기", "Preview Manifest")}</span>
            </button>
            <button type="button" data-testid="export-manifest-json-btn" onClick={handleExportManifest} className={BTN_SOLID}>
              <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("JSON 매니페스트 복사", "Copy Manifest JSON")}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TOONSTUDIO_HETEROGENEOUS_WORKLOADS.map((item) => {
            const active = item.id === selectedOrtWorkloadId;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`ort-workload-btn-${item.id}`}
                aria-pressed={active}
                onClick={() => {
                  copyRequest.current += 1;
                  setStatusMessage("");
                  setSelectedOrtWorkloadId(item.id);
                }}
                className={active ? BTN_ACTIVE : BTN_OUTLINE}
              >
                <span>{isEn ? item.shortLabelEn : item.shortLabelKo}</span>
              </button>
            );
          })}
        </div>

        <p data-testid="ort-ep-notes" className="text-[11px] text-fg-2 [word-break:keep-all]">
          {isEn ? selectedOrtConfig.notesEn : selectedOrtConfig.notesKo}
        </p>
        <pre data-testid="ort-ep-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
          {selectedOrtJson}
        </pre>

        {showManifestPreview && (
          <pre data-testid="manifest-json-preview" className="max-h-64 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
            {manifestJson}
          </pre>
        )}

        {statusMessage && (
          <p role="status" aria-live="polite" data-testid="router-status-message" className="text-xs font-medium text-accent [word-break:keep-all]">
            {statusMessage}
          </p>
        )}
      </div>
    </section>
  );
}
