import { CheckCircle2, Cpu, Gauge, Palette, PenTool } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import "./interactive-showcase.css";
import {
  BENCHMARK_RESOLUTIONS,
  DISPLAY_REFRESH_RATES,
  SPECTRAL_WAVELENGTHS_NM,
  computeKalmanScanoutMetrics,
  computePigmentMixComparison,
  computeWasmSimdBenchmarkBars,
  pickShowcaseText,
  showcaseBi,
  type CanvasBenchmarkResolution,
  type DisplayRefreshHz,
} from "./interactive-showcase-models";

import { cx } from "@/shared/lib/cx";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

type SandboxTabId = "pigment" | "kalman" | "wasm-simd";

const SANDBOX_TABS: ReadonlyArray<{
  readonly id: SandboxTabId;
  readonly icon: LucideIcon;
  readonly ko: string;
  readonly en: string;
}> = [
  {
    id: "pigment",
    icon: Palette,
    ko: "스펙트럼 물감 감산 혼색",
    en: "Spectral Subtractive Paint",
  },
  {
    id: "kalman",
    icon: PenTool,
    ko: "칼만 펜 궤적 선행 예측",
    en: "Kalman Stylus Lookahead",
  },
  {
    id: "wasm-simd",
    icon: Cpu,
    ko: "Rust WASM64 SIMD 가속 배율",
    en: "Rust WASM64 SIMD Speedup",
  },
];

const PIGMENT_PRESETS: ReadonlyArray<{
  readonly ratio: number;
  readonly ko: string;
  readonly en: string;
}> = [
  { ratio: 0, ko: "카드뮴 옐로 100%", en: "100% Cadmium Yellow" },
  { ratio: 35, ko: "봄 연두 (35%)", en: "Spring Leaf (35%)" },
  { ratio: 50, ko: "에메랄드 50:50", en: "50:50 Emerald" },
  { ratio: 75, ko: "청록 바다 (75%)", en: "Deep Teal (75%)" },
  { ratio: 100, ko: "프탈로 블루 100%", en: "100% Phthalo Blue" },
];

export interface InteractiveMathSandboxCardProps {
  readonly className?: string;
}

export function InteractiveMathSandboxCard({ className }: InteractiveMathSandboxCardProps) {
  useBilingualI18nRevision();
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [activeTab, setActiveTab] = useState<SandboxTabId>("pigment");
  const [blueRatio, setBlueRatio] = useState<number>(50);
  const [refreshHz, setRefreshHz] = useState<DisplayRefreshHz>(120);
  const [lookaheadMs, setLookaheadMs] = useState<number>(4);
  const [resolution, setResolution] = useState<CanvasBenchmarkResolution>("4k");

  const pigmentMix = computePigmentMixComparison(blueRatio);
  const kalmanMetrics = computeKalmanScanoutMetrics(refreshHz, lookaheadMs);
  const wasmBench = computeWasmSimdBenchmarkBars(resolution);

  const pigmentSliderId = `${baseId}-pigment-ratio`;
  const kalmanSliderId = `${baseId}-kalman-lookahead`;
  const headingId = `${baseId}-sandbox-heading`;

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const count = SANDBOX_TABS.length;
    let nextIndex = -1;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % count;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + count) % count;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = count - 1;

    if (nextIndex >= 0) {
      event.preventDefault();
      const targetTab = SANDBOX_TABS[nextIndex];
      if (targetTab) {
        setActiveTab(targetTab.id);
        tabRefs.current[nextIndex]?.focus();
      }
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      data-showcase-widget="math-sandbox"
      className={cx(
        "rounded-3xl border border-line/80 bg-panel/75 p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
            {showcaseBi("실시간 수학·커널 미니 실험실", "Live Client-Side Math & Kernel Lab")}
          </p>
          <h3
            id={headingId}
            className="mt-1.5 text-balance break-keep text-xl font-black tracking-tight text-fg sm:text-2xl"
          >
            {showcaseBi(
              "서버 호출 0회로 직접 만져 보는 드로잉 수식·SIMD 벤치마크",
              "Hands-On Drawing Math & SIMD Benchmarks with Zero Server Calls",
            )}
          </h3>
        </div>
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-good/35 bg-good-soft px-3 py-1 text-xs font-bold tabular-nums text-good">
          <Gauge size={14} aria-hidden="true" />
          {showcaseBi("네트워크 요청 0회 · 브라우저 즉시 계산", "0 Network Calls · Local Compute")}
        </span>
      </div>

      {/* 3개 탭 바 (>= 44px 터치 타깃 + 방향키 이동 지원) */}
      <div
        role="tablist"
        aria-label={showcaseBi("수학·커널 실험 탭", "Math and kernel lab tabs")}
        className="mt-5 grid gap-2 sm:grid-cols-3"
      >
        {SANDBOX_TABS.map((tab, index) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              tabIndex={selected ? 0 : -1}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={cx(
                "tech-showcase-node inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black break-keep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                selected
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card/75 text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              <Icon size={16} aria-hidden="true" className="shrink-0" />
              <span>{showcaseBi(tab.ko, tab.en)}</span>
            </button>
          );
        })}
      </div>

      {/* 탭 1: 스펙트럼 물감 감산 혼색 */}
      {activeTab === "pigment" ? (
        <div
          id={`${baseId}-panel-pigment`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-pigment`}
          className="mt-5 grid gap-5 rounded-2xl border border-line/70 bg-card/70 p-4 sm:p-5"
        >
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={pigmentSliderId} className="text-sm font-black break-keep text-fg">
                {showcaseBi(
                  "안료 배합 비율 (노랑 ↔ 파랑)",
                  "Pigment Mix Ratio (Yellow ↔ Blue)",
                )}
              </label>
              <span className="rounded-lg border border-line bg-panel px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-fg">
                {showcaseBi("노랑", "Yellow")} {pigmentMix.yellowRatioPercent}% ·{" "}
                {showcaseBi("파랑", "Blue")} {pigmentMix.blueRatioPercent}%
              </span>
            </div>

            <input
              id={pigmentSliderId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={blueRatio}
              aria-valuetext={`${showcaseBi("노랑", "Yellow")} ${pigmentMix.yellowRatioPercent}%, ${showcaseBi("파랑", "Blue")} ${pigmentMix.blueRatioPercent}%`}
              onChange={(event) => setBlueRatio(Number(event.currentTarget.value))}
              className="tech-showcase-range"
            />

            <div
              role="group"
              aria-label={showcaseBi("안료 배합 프리셋", "Pigment ratio presets")}
              className="flex flex-wrap gap-2"
            >
              {PIGMENT_PRESETS.map((preset) => {
                const active = blueRatio === preset.ratio;
                return (
                  <button
                    key={preset.ratio}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setBlueRatio(preset.ratio)}
                    className={cx(
                      "tech-showcase-node min-h-11 rounded-xl border px-3 py-2 text-xs font-bold tabular-nums break-keep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {showcaseBi(preset.ko, preset.en)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 두 방식의 OKLCH 스워치 + 7밴드 분광 반사율 SVG 비교 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2.5 rounded-2xl border border-line bg-panel/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-fg-2">
                  {showcaseBi("일반 RGB 선형 평균 (가산 혼색)", "Naive RGB Linear Average")}
                </span>
                <span className="font-mono text-xs tabular-nums text-fg-3">
                  C = {pigmentMix.rgbChroma.toFixed(3)}
                </span>
              </div>
              <svg
                role="img"
                aria-label={showcaseBi(
                  `RGB 선형 평균 견본 (${pigmentMix.rgbLinearOklch})`,
                  `RGB linear average swatch (${pigmentMix.rgbLinearOklch})`,
                )}
                viewBox="0 0 320 76"
                className="block h-20 w-full rounded-xl border border-line"
              >
                <rect x="0" y="0" width="320" height="76" fill={pigmentMix.rgbLinearOklch} />
              </svg>
              <p className="text-xs leading-6 break-keep text-fg-3">
                {showcaseBi(
                  "보색에 가까운 두 채널을 숫자로만 평균 내어 50:50 구간에서 채도가 죽고 탁한 회갈색·올리브색으로 바뀝니다.",
                  "Averaging opposing RGB channels collapses chroma near 50:50 into a muddy olive-gray.",
                )}
              </p>
            </div>

            <div className="grid gap-2.5 rounded-2xl border border-good/45 bg-panel/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-good">
                  {showcaseBi(
                    "ToonStudio 7밴드 Kubelka-Munk 감산 혼색",
                    "ToonStudio 7-Band Kubelka-Munk Subtractive",
                  )}
                </span>
                <span className="font-mono text-xs font-bold tabular-nums text-good">
                  C = {pigmentMix.kmChroma.toFixed(3)} ({pigmentMix.chromaGainRatio}×)
                </span>
              </div>
              <svg
                role="img"
                aria-label={showcaseBi(
                  `Kubelka-Munk 감산 혼색 견본 (${pigmentMix.kubelkaMunkOklch})`,
                  `Kubelka-Munk subtractive swatch (${pigmentMix.kubelkaMunkOklch})`,
                )}
                viewBox="0 0 320 76"
                className="block h-20 w-full rounded-xl border border-line-strong"
              >
                <rect x="0" y="0" width="320" height="76" fill={pigmentMix.kubelkaMunkOklch} />
              </svg>
              <p className="text-xs leading-6 break-keep text-fg-2">
                {showcaseBi(
                  `파장별 흡수·산란 비(평균 K/S ${pigmentMix.meanKmKsRatio})를 적분해 540nm 녹색 반사율(${pigmentMix.greenBandReflectancePercent}%)이 살아 있는 에메랄드빛을 재현합니다.`,
                  `Integrates per-band K/S (${pigmentMix.meanKmKsRatio}) so the 540nm green window (${pigmentMix.greenBandReflectancePercent}%) stays vivid.`,
                )}
              </p>
            </div>
          </div>

          {/* 7밴드 분광 반사율 미니 막대 */}
          <div className="rounded-2xl border border-line/70 bg-panel/60 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-fg-2">
                {showcaseBi(
                  "7개 가시광선 파장 대역(420~660nm) KM 반사율 분포",
                  "7-Band Visible Spectrum (420–660nm) KM Reflectance",
                )}
              </span>
              <span className="font-mono text-[0.7rem] tabular-nums text-fg-3">
                K/S = (1 - R)² / (2R)
              </span>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-2">
              {pigmentMix.bands.map((band, index) => (
                <div key={SPECTRAL_WAVELENGTHS_NM[index]} className="grid gap-1 text-center">
                  <div className="flex h-14 items-end justify-center rounded-lg border border-line/60 bg-card p-1">
                    <div
                      style={{ height: `${Math.max(8, Math.round(band.kmReflectance * 100))}%` }}
                      className="w-full rounded-sm bg-accent"
                    />
                  </div>
                  <span className="font-mono text-[0.68rem] font-bold tabular-nums text-fg-2">
                    {Math.round(band.kmReflectance * 100)}%
                  </span>
                  <span className="font-mono text-[0.62rem] tabular-nums text-fg-3">
                    {band.wavelengthNm}nm
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* 탭 2: 칼만 펜 궤적 선행 예측 */}
      {activeTab === "kalman" ? (
        <div
          id={`${baseId}-panel-kalman`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-kalman`}
          className="mt-5 grid gap-5 rounded-2xl border border-line/70 bg-card/70 p-4 sm:p-5"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2">
              <span className="text-sm font-black text-fg">
                {showcaseBi("디스플레이·디지타이저 주사율", "Display & Digitizer Refresh Rate")}
              </span>
              <div
                role="group"
                aria-label={showcaseBi("주사율 선택", "Select refresh rate")}
                className="grid grid-cols-3 gap-2"
              >
                {DISPLAY_REFRESH_RATES.map((hz) => {
                  const selected = refreshHz === hz;
                  return (
                    <button
                      key={hz}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setRefreshHz(hz)}
                      className={cx(
                        "tech-showcase-node min-h-11 rounded-xl border px-3 py-2 font-display text-sm font-black tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        selected
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
                      )}
                    >
                      {hz}Hz
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={kalmanSliderId} className="text-sm font-black break-keep text-fg">
                  {showcaseBi("칼만 선행 예측 시간 (0~8ms)", "Kalman Lookahead Horizon (0–8ms)")}
                </label>
                <span className="rounded-lg border border-line bg-panel px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-accent">
                  +{kalmanMetrics.lookaheadMs.toFixed(1)} ms
                </span>
              </div>
              <input
                id={kalmanSliderId}
                type="range"
                min={0}
                max={8}
                step={0.5}
                value={lookaheadMs}
                aria-valuetext={`${kalmanMetrics.lookaheadMs.toFixed(1)} ms`}
                onChange={(event) => setLookaheadMs(Number(event.currentTarget.value))}
                className="tech-showcase-range"
              />
            </div>
          </div>

          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-panel/80 p-3.5">
              <dt className="text-xs font-bold text-fg-3">
                {showcaseBi("보정 전 스캔아웃 지연", "Raw Pipeline Lag")}
              </dt>
              <dd className="mt-1 font-display text-2xl font-black tabular-nums text-fg-2">
                {kalmanMetrics.rawPipelineLagMs.toFixed(2)} ms
              </dd>
              <dd className="mt-1 font-mono text-[0.68rem] tabular-nums text-fg-3">
                1 frame = {kalmanMetrics.frameIntervalMs.toFixed(2)} ms
              </dd>
            </div>
            <div className="rounded-2xl border border-good/45 bg-panel/80 p-3.5">
              <dt className="text-xs font-bold text-good">
                {showcaseBi("칼만 예측 후 체감 지연", "Perceived Lag with Kalman")}
              </dt>
              <dd className="mt-1 font-display text-2xl font-black tabular-nums text-good">
                {kalmanMetrics.perceivedLagMs.toFixed(2)} ms
              </dd>
              <dd className="mt-1 font-mono text-[0.68rem] tabular-nums text-fg-2">
                -{kalmanMetrics.compensatedMs.toFixed(2)} ms{" "}
                {showcaseBi("선행 보정", "compensated")}
              </dd>
            </div>
            <div className="rounded-2xl border border-accent/40 bg-panel/80 p-3.5">
              <dt className="text-xs font-bold text-accent">
                {showcaseBi("체감 유격 감소율", "Perceived Gap Reduction")}
              </dt>
              <dd className="mt-1 font-display text-2xl font-black tabular-nums text-accent">
                {kalmanMetrics.reductionPercent}%
              </dd>
              <dd className="mt-1 text-[0.7rem] break-keep text-fg-3">
                {showcaseBi("오버슈트 방지 상한 82% 적용", "82% overshoot safety clamp")}
              </dd>
            </div>
          </dl>

          {/* 펜촉 vs 보정 전/후 획 거리 시각화 SVG + 반응형 범례 */}
          <figure className="m-0 space-y-2.5 rounded-2xl border border-line bg-panel p-3.5">
            <svg
              role="img"
              aria-label={showcaseBi(
                `${refreshHz}Hz 주사율과 ${kalmanMetrics.lookaheadMs}ms 선행 예측 시 펜촉 유격 비교 도식`,
                `Stylus nib gap diagram at ${refreshHz}Hz with ${kalmanMetrics.lookaheadMs}ms lookahead`,
              )}
              viewBox="0 0 360 88"
              className="block h-auto w-full max-w-full"
            >
              <line
                x1="28"
                y1="56"
                x2={kalmanMetrics.rawTrailEnd.x}
                y2={kalmanMetrics.rawTrailEnd.y - 8}
                stroke="var(--color-fg-3)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <line
                x1={kalmanMetrics.rawTrailEnd.x}
                y1={kalmanMetrics.rawTrailEnd.y - 8}
                x2={kalmanMetrics.kalmanTrailEnd.x}
                y2={kalmanMetrics.kalmanTrailEnd.y - 8}
                stroke="var(--color-good)"
                strokeWidth="4.5"
                strokeDasharray="6 4"
                strokeLinecap="round"
              />
              <circle
                cx={kalmanMetrics.rawTrailEnd.x}
                cy={kalmanMetrics.rawTrailEnd.y - 8}
                r="5.5"
                fill="var(--color-fg-3)"
              />
              <circle
                cx={kalmanMetrics.kalmanTrailEnd.x}
                cy={kalmanMetrics.kalmanTrailEnd.y - 8}
                r="6.5"
                fill="var(--color-good)"
              />
              <circle
                cx={kalmanMetrics.nibPoint.x}
                cy={kalmanMetrics.nibPoint.y - 8}
                r="7.5"
                fill="var(--color-accent)"
              />
              <text
                x={Math.min(348, kalmanMetrics.nibPoint.x)}
                y="20"
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--color-fg)"
                fontSize="11"
                fontWeight="800"
              >
                {showcaseBi("실제 펜촉 위치", "Physical Stylus Nib")}
              </text>
            </svg>
            <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line/60 pt-2.5 text-[11px] font-bold break-keep text-fg-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1 w-4 rounded-full bg-fg-3" aria-hidden="true" />
                {showcaseBi("회색 실선: 무보정 먹선", "Gray line: uncompensated ink")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1 w-4 rounded-full border-b-2 border-dashed border-good" aria-hidden="true" />
                {showcaseBi("초록 점선: 칼만 선행 예측 구간", "Green dashed: Kalman predicted lead")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full bg-accent" aria-hidden="true" />
                {showcaseBi("주홍 점: 실제 펜촉", "Accent dot: physical nib")}
              </span>
            </figcaption>
          </figure>
        </div>
      ) : null}

      {/* 탭 3: Rust WASM64 SIMD 가속 배율 */}
      {activeTab === "wasm-simd" ? (
        <div
          id={`${baseId}-panel-wasm-simd`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-wasm-simd`}
          className="mt-5 grid gap-5 rounded-2xl border border-line/70 bg-card/70 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label={showcaseBi("캔버스 해상도 선택", "Select canvas resolution")}
              className="flex flex-wrap gap-2"
            >
              {BENCHMARK_RESOLUTIONS.map((item) => {
                const selected = resolution === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setResolution(item.id)}
                    className={cx(
                      "tech-showcase-node min-h-11 rounded-xl border px-3.5 py-2 text-xs font-black tabular-nums break-keep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {pickShowcaseText(item.label)} ({item.dimensions})
                  </button>
                );
              })}
            </div>

            <span className="font-mono text-xs font-bold tabular-nums text-fg-2">
              {wasmBench.meta.megapixels} · {wasmBench.meta.tileCount64.toLocaleString()} tiles (64×64)
            </span>
          </div>

          <div className="grid gap-3">
            {wasmBench.rows.map((row) => (
              <div
                key={row.id}
                className="grid gap-2.5 rounded-2xl border border-line bg-panel/80 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black break-keep text-fg">
                      {pickShowcaseText(row.title)}
                    </p>
                    <code className="break-all font-mono text-[0.68rem] text-fg-3">{row.kernelSource}</code>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-accent/40 bg-accent-soft px-2.5 py-0.5 font-display text-xs font-black tabular-nums text-accent">
                      {row.speedupOverJs.toFixed(2)}× {showcaseBi("가속", "faster")}
                    </span>
                    {row.meets60FpsInWasm ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-good/35 bg-good-soft px-2.5 py-0.5 text-[0.68rem] font-bold text-good">
                        <CheckCircle2 size={12} aria-hidden="true" />
                        60fps (≤16.67ms)
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-1.5 text-xs tabular-nums">
                  <div className="grid grid-cols-[6.25rem_minmax(0,1fr)_4.5rem] items-center gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_4.8rem] sm:gap-2.5">
                    <span className="truncate font-bold text-fg-3">Pure JS (f64)</span>
                    <div className="h-3 overflow-hidden rounded-full bg-raised">
                      <div style={{ width: "100%" }} className="tech-showcase-bar-fill h-full bg-fg-3/70" />
                    </div>
                    <span className="text-right font-mono font-bold text-fg-2">
                      {row.jsMs.toFixed(2)} ms
                    </span>
                  </div>

                  <div className="grid grid-cols-[6.25rem_minmax(0,1fr)_4.5rem] items-center gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_4.8rem] sm:gap-2.5">
                    <span className="truncate font-black text-accent">WASM64 SIMD</span>
                    <div className="h-3 overflow-hidden rounded-full bg-raised">
                      <div
                        style={{ width: `${Math.max(2, Math.min(100, row.wasmBarPercent))}%` }}
                        className="tech-showcase-bar-fill h-full bg-accent"
                      />
                    </div>
                    <span className="text-right font-mono font-black text-accent">
                      {row.wasmSimdMs.toFixed(2)} ms
                    </span>
                  </div>

                  <div className="grid grid-cols-[6.25rem_minmax(0,1fr)_4.5rem] items-center gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_4.8rem] sm:gap-2.5">
                    <span className="truncate font-bold text-good">Native ARM64</span>
                    <div className="h-3 overflow-hidden rounded-full bg-raised">
                      <div
                        style={{ width: `${Math.max(2, Math.min(100, row.nativeBarPercent))}%` }}
                        className="tech-showcase-bar-fill h-full bg-good"
                      />
                    </div>
                    <span className="text-right font-mono font-bold text-good">
                      {row.nativeArm64Ms.toFixed(2)} ms
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/70 bg-panel px-3.5 py-2.5 text-xs tabular-nums text-fg-2">
            <span className="break-keep">
              {showcaseBi(
                "시간은 해상도에 따른 추정값입니다. 커널별 WASM 가속 배수는 M2 Max 기록(19.82× / 6.96× / 4.07×)을 사용합니다.",
                "Estimated times scale by resolution using recorded M2 Max WASM kernel ratios (19.82× / 6.96× / 4.07×).",
              )}
            </span>
            <strong className="font-mono text-fg">
              Σ JS {wasmBench.totalJsMs.toFixed(2)}ms → WASM64 {wasmBench.totalWasmSimdMs.toFixed(2)}ms
            </strong>
          </p>
        </div>
      ) : null}
    </section>
  );
}
