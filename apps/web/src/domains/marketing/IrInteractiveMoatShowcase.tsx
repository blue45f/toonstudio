import { useId, useMemo, useState } from "react";

import {
  CLEANROOM_EIGHT_ENGINES,
  INFRA_COST_COMPARISON,
  IR_SHARED_VERIFIED_DATE,
  UNIT_ECONOMICS_PRESETS,
} from "./ir-bizplan-shared-facts";
import {
  compareKm7AndRgbMix,
  computeUnitEconomics,
  KM7_DEMO_WAVELENGTHS_NM,
  PIGMENT_DEMO_PRESETS,
  type UnitEconomicsInput,
} from "./ir-bizplan-km7-math";

export type MoatShowcaseMode = "full" | "spectral" | "economics";
export type MoatSurface = "site" | "present";

export interface IrInteractiveMoatShowcaseProps {
  readonly mode?: MoatShowcaseMode;
  readonly surface?: MoatSurface;
  readonly lang?: "ko" | "en";
}

const STRIP_STOPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;

/** 7개 가시광선 밴드(420..670nm)의 물리적 파장 대표색(분광 그래프 표시 전용). */
const WAVELENGTH_BAND_FILLS = [
  "oklch(0.55 0.20 278)",
  "oklch(0.60 0.18 250)",
  "oklch(0.70 0.14 195)",
  "oklch(0.72 0.17 148)",
  "oklch(0.83 0.16 95)",
  "oklch(0.69 0.18 46)",
  "oklch(0.56 0.20 26)",
] as const;

function formatKrw(value: number, lang: "ko" | "en"): string {
  const formatted = Math.round(value).toLocaleString("en-US");
  return lang === "ko" ? `₩${formatted}` : `KRW ${formatted}`;
}

function SpectralPigmentLivePanel({
  surface,
  lang,
}: {
  readonly surface: MoatSurface;
  readonly lang: "ko" | "en";
}) {
  const [presetIndex, setPresetIndex] = useState(0);
  const [mixPct, setMixPct] = useState(50);
  const sliderId = useId();

  const preset = PIGMENT_DEMO_PRESETS[presetIndex] ?? PIGMENT_DEMO_PRESETS[0];
  const ratio = mixPct / 100;

  const comparison = useMemo(
    () => compareKm7AndRgbMix(preset.colorA, preset.colorB, ratio),
    [preset, ratio],
  );

  const stripStops = useMemo(
    () => STRIP_STOPS.map((step) => compareKm7AndRgbMix(preset.colorA, preset.colorB, step)),
    [preset],
  );

  const chromaGainPct =
    comparison.rgbChroma > 0.005
      ? Math.round(((comparison.km7Chroma - comparison.rgbChroma) / comparison.rgbChroma) * 100)
      : 0;

  const ko = lang === "ko";

  return (
    <article
      className="ir-moat-card grid gap-4"
      aria-labelledby={`${sliderId}-title`}
      data-ir-interactive-control="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ir-moat-pill" data-tone="current">
              {ko ? "현재 구현 · 실측 수학" : "Current · Live Math"}
            </span>
            <span className="ir-moat-pill">
              {ko ? "WebGPU 7밴드 KM · Mixbox 미사용 · ₩0 IP" : "WebGPU 7-Band KM · Zero Mixbox · KRW 0 IP"}
            </span>
          </div>
          <h3 id={`${sliderId}-title`} className="mt-1 break-keep text-lg font-bold">
            {ko
              ? "WebGPU 7밴드 분광 안료 vs 일반 RGB 혼색 라이브 비교"
              : "Live Comparison: WebGPU 7-Band Spectral Pigment vs Standard RGB"}
          </h3>
          <p className="break-keep text-sm leading-6" style={{ color: "var(--irm-fg-2)" }}>
            {ko
              ? "슬라이더를 움직여 파랑과 노랑을 섞어 보세요. 일반 RGB는 중간이 탁한 회색으로 무너지지만, ToonStudio 클린룸 7밴드 Kubelka-Munk 분광 엔진은 505·545nm 녹색 대역 반사율을 보존합니다."
              : "Move the slider to mix blue and yellow. Standard RGB collapses into muddy gray, whereas ToonStudio's cleanroom 7-band Kubelka-Munk engine preserves reflectance in the 505–545 nm green bands."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={ko ? "안료 조합 선택" : "Choose pigment pair"}>
        {PIGMENT_DEMO_PRESETS.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            className="ir-moat-btn"
            aria-pressed={idx === presetIndex}
            onClick={() => setPresetIndex(idx)}
          >
            {ko ? item.nameKo : item.nameEn}
          </button>
        ))}
      </div>

      <div className="ir-moat-subpanel grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
          <label htmlFor={sliderId}>
            {ko
              ? `혼색 비율 (${preset.leftLabelKo} ${100 - mixPct}% : ${preset.rightLabelKo} ${mixPct}%)`
              : `Mix ratio (${preset.leftLabelEn} ${100 - mixPct}% : ${preset.rightLabelEn} ${mixPct}%)`}
          </label>
          <span className="ir-moat-tabular text-xs font-bold" style={{ color: "var(--irm-accent)" }}>
            {ko ? `채도(Oklab C) 차이 ${chromaGainPct >= 0 ? `+${chromaGainPct}` : chromaGainPct}%` : `Oklab chroma delta ${chromaGainPct >= 0 ? `+${chromaGainPct}` : chromaGainPct}%`}
          </span>
        </div>

        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={mixPct}
          onChange={(event) => setMixPct(Number(event.target.value))}
          className="ir-moat-range ir-print-hide"
          aria-label={ko ? "안료 혼색 비율 조절" : "Adjust pigment mix ratio"}
        />

        <div className="grid gap-2">
          <div className="grid gap-1">
            <span className="text-xs font-bold" style={{ color: "var(--irm-good)" }}>
              {ko ? "ToonStudio 7밴드 KM 분광 감산 혼색 (클린룸 자체 IP)" : "ToonStudio 7-band KM subtractive mix (cleanroom IP)"}
            </span>
            <div className="grid h-7 grid-cols-11 overflow-hidden rounded-lg border" style={{ borderColor: "var(--irm-line-strong)" }}>
              {stripStops.map((stop) => (
                <span key={`km7-${stop.ratio}`} style={{ backgroundColor: stop.km7Hex }} aria-hidden="true" />
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--irm-fg-3)" }}>
              {ko ? "일반 sRGB 선형 혼색 (중간 채도 저하)" : "Standard sRGB linear mix (mid-tone muddiness)"}
            </span>
            <div className="grid h-7 grid-cols-11 overflow-hidden rounded-lg border" style={{ borderColor: "var(--irm-line)" }}>
              {stripStops.map((stop) => (
                <span key={`rgb-${stop.ratio}`} style={{ backgroundColor: stop.rgbHex }} aria-hidden="true" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.15fr]">
        <div className="ir-moat-subpanel grid gap-2">
          <div
            className="ir-moat-swatch"
            style={{ backgroundColor: comparison.km7Hex }}
            data-testid="km7-swatch"
            aria-label={ko ? `7밴드 KM 혼색 결과 ${comparison.km7Hex}` : `7-band KM mix result ${comparison.km7Hex}`}
          />
          <div className="flex items-baseline justify-between gap-2">
            <strong className="text-sm">{ko ? "7밴드 KM 분광" : "7-Band KM Spectral"}</strong>
            <code className="ir-moat-tabular text-xs font-bold" style={{ color: "var(--irm-good)" }}>
              {comparison.km7Hex}
            </code>
          </div>
          <p className="ir-moat-tabular text-xs" style={{ color: "var(--irm-fg-2)" }}>
            {ko
              ? `Oklab 채도 C = ${comparison.km7Chroma.toFixed(3)} · 색상각 ${Math.round(comparison.km7HueDeg)}°`
              : `Oklab C = ${comparison.km7Chroma.toFixed(3)} · Hue ${Math.round(comparison.km7HueDeg)}°`}
          </p>
        </div>

        <div className="ir-moat-subpanel grid gap-2">
          <div
            className="ir-moat-swatch"
            style={{ backgroundColor: comparison.rgbHex }}
            data-testid="rgb-swatch"
            aria-label={ko ? `일반 RGB 혼색 결과 ${comparison.rgbHex}` : `Standard RGB mix result ${comparison.rgbHex}`}
          />
          <div className="flex items-baseline justify-between gap-2">
            <strong className="text-sm">{ko ? "일반 RGB 혼색" : "Standard RGB Mix"}</strong>
            <code className="ir-moat-tabular text-xs font-semibold" style={{ color: "var(--irm-fg-3)" }}>
              {comparison.rgbHex}
            </code>
          </div>
          <p className="ir-moat-tabular text-xs" style={{ color: "var(--irm-fg-3)" }}>
            {ko
              ? `Oklab 채도 C = ${comparison.rgbChroma.toFixed(3)} · 색상각 ${Math.round(comparison.rgbHueDeg)}°`
              : `Oklab C = ${comparison.rgbChroma.toFixed(3)} · Hue ${Math.round(comparison.rgbHueDeg)}°`}
          </p>
        </div>

        <div className="ir-moat-subpanel grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-xs font-bold">{ko ? "7밴드 가시광선 반사율 R(λ)" : "7-Band Reflectance R(λ)"}</strong>
            <span className="ir-moat-tabular text-xs" style={{ color: "var(--irm-fg-3)" }}>
              420–670 nm
            </span>
          </div>
          <svg
            viewBox="0 0 280 96"
            className="h-24 w-full"
            role="img"
            aria-label={ko ? "7밴드 가시광선 파장별 반사율 그래프" : "7-band visible wavelength reflectance chart"}
          >
            {comparison.km7Bands.map((refl, idx) => {
              const barHeight = Math.max(4, Math.round(refl * 66));
              const x = 10 + idx * 38;
              const y = 74 - barHeight;
              return (
                <g key={KM7_DEMO_WAVELENGTHS_NM[idx]}>
                  <rect
                    x={x}
                    y={y}
                    width={26}
                    height={barHeight}
                    rx={4}
                    fill={WAVELENGTH_BAND_FILLS[idx]}
                  />
                  <text
                    x={x + 13}
                    y={90}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--irm-fg-3)"
                  >
                    {KM7_DEMO_WAVELENGTHS_NM[idx]}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="break-keep text-xs leading-5" style={{ color: "var(--irm-fg-2)" }}>
            {ko ? preset.insightKo : preset.insightEn}
          </p>
        </div>
      </div>

      {surface === "site" ? (
        <details className="ir-moat-subpanel">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">
            {ko
              ? `${IR_SHARED_VERIFIED_DATE} 기준 클린룸 자체 제작 엔진 8종 전체 목록`
              : `All 8 Cleanroom Engines Merged as of ${IR_SHARED_VERIFIED_DATE}`}
          </summary>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {CLEANROOM_EIGHT_ENGINES.map((engine) => (
              <li key={engine.id} className="border-t pt-2 text-xs leading-5" style={{ borderColor: "var(--irm-line)" }}>
                <strong className="block text-sm">{ko ? engine.nameKo : engine.nameEn}</strong>
                <span style={{ color: "var(--irm-fg-2)" }}>{ko ? engine.specKo : engine.specEn}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function InfraAndUnitEconomicsPanel({
  lang,
}: {
  readonly lang: "ko" | "en";
}) {
  const [presetId, setPresetId] = useState<string>(UNIT_ECONOMICS_PRESETS[0].id);
  const [input, setInput] = useState<UnitEconomicsInput>(UNIT_ECONOMICS_PRESETS[0].input);
  const baseId = useId();
  const ko = lang === "ko";

  const metrics = useMemo(() => computeUnitEconomics(input), [input]);
  const maxCost = Math.max(...INFRA_COST_COMPARISON.map((row) => row.monthlyCostKrw), 1);

  const applyPreset = (id: string) => {
    const found = UNIT_ECONOMICS_PRESETS.find((item) => item.id === id);
    if (!found) return;
    setPresetId(found.id);
    setInput(found.input);
  };

  const updateField = <K extends keyof UnitEconomicsInput>(key: K, value: number) => {
    setPresetId("custom");
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  const activePreset = UNIT_ECONOMICS_PRESETS.find((item) => item.id === presetId);

  return (
    <article
      className="ir-moat-card grid gap-5"
      aria-labelledby={`${baseId}-title`}
      data-ir-interactive-control="true"
    >
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ir-moat-pill" data-tone="current">
            {ko ? "인프라: 실측 ₩0 베타" : "Infra: Measured KRW 0 Beta"}
          </span>
          <span className="ir-moat-pill" data-tone="assumption">
            {ko ? "단위경제성: 가정 시뮬레이션 (미확정)" : "Unit Economics: Assumption Model"}
          </span>
        </div>
        <h3 id={`${baseId}-title`} className="mt-1 break-keep text-lg font-bold">
          {ko
            ? "1인 기업 ₩0 베타 인프라 구조 & 단위경제성(LTV:CAC · BEP) 시뮬레이터"
            : "Solo KRW 0 Beta Infra Comparison & Unit Economics Simulator"}
        </h3>
        <p className="break-keep text-sm leading-6" style={{ color: "var(--irm-fg-2)" }}>
          {ko
            ? "드로잉·7밴드 분광·Wasm64(1 GiB) 3D·OPFS 임시 보관을 사용자 브라우저로 분산해 GPU 서버비를 없앴습니다. 아래 상단은 실측 vs 일반 클라우드 추정 참고치, 하단은 입력 가정 기반 감도 분석입니다."
            : "Drawing, 7-band spectral mixing, Wasm64 (1 GiB) 3D, and OPFS run in the user's browser, eliminating GPU server burn. Above compares actual beta cost vs generic cloud estimates; below simulates assumptions."}
        </p>
      </div>

      {/* Part A: ₩0 인프라 비용 비교 SVG 차트 */}
      <div className="ir-moat-subpanel grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">
            {ko ? "월 고정 인프라 비용 구조 비교 (베타 단계)" : "Monthly Fixed Infrastructure Comparison (Beta Stage)"}
          </strong>
          <span className="text-xs" style={{ color: "var(--irm-fg-3)" }}>
            {ko ? "도메인 연간 갱신비 별도 · 유료 트래픽 확장 시 단계적 승급" : "Domain renewal separate · scales to paid tiers with traffic"}
          </span>
        </div>

        <svg
          viewBox="0 0 640 162"
          className="w-full"
          role="img"
          aria-label={ko ? "일반 클라우드 SaaS 추정치와 ToonStudio 베타 0원 실측 비교 막대 차트" : "Bar chart comparing generic cloud SaaS estimates against ToonStudio KRW 0 beta actual"}
        >
          {INFRA_COST_COMPARISON.map((row, idx) => {
            const y = 8 + idx * 52;
            const barMaxWidth = 360;
            const barWidth =
              row.monthlyCostKrw === 0
                ? 8
                : Math.max(24, Math.round((row.monthlyCostKrw / maxCost) * barMaxWidth));
            const isActual = row.tier === "current";
            return (
              <g key={row.id}>
                <text x={0} y={y + 13} fontSize="12" fontWeight="700" fill="var(--irm-fg)">
                  {ko ? row.labelKo : row.labelEn}
                </text>
                <rect
                  x={0}
                  y={y + 21}
                  width={barMaxWidth}
                  height={16}
                  rx={5}
                  fill="var(--irm-raised)"
                />
                <rect
                  x={0}
                  y={y + 21}
                  width={barWidth}
                  height={16}
                  rx={5}
                  fill={isActual ? "var(--irm-good)" : "var(--irm-warn)"}
                  opacity={isActual ? 1 : 0.72}
                />
                <text
                  x={barMaxWidth + 14}
                  y={y + 33}
                  fontSize="12"
                  fontWeight="700"
                  fill={isActual ? "var(--irm-good)" : "var(--irm-fg-2)"}
                >
                  {ko ? row.displayCostKo : row.displayCostEn}
                </text>
              </g>
            );
          })}
        </svg>

        <ul className="grid gap-1.5 text-xs leading-5" style={{ color: "var(--irm-fg-2)" }}>
          {INFRA_COST_COMPARISON.map((row) => (
            <li key={`${row.id}-note`} className="break-keep">
              <strong style={{ color: row.tier === "current" ? "var(--irm-good)" : "var(--irm-fg)" }}>
                [{row.tier === "current" ? (ko ? "실측" : "Actual") : ko ? "추정 참고치" : "Benchmark Est."}]
              </strong>{" "}
              {ko ? row.detailKo : row.detailEn}
            </li>
          ))}
        </ul>
      </div>

      {/* Part B: 단위경제성 시뮬레이터 */}
      <div className="ir-moat-subpanel grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">
            {ko ? "단위경제성(LTV:CAC · Payback · BEP) 감도 시뮬레이터" : "Unit Economics (LTV:CAC · Payback · BEP) Sensitivity Simulator"}
          </strong>
          <span className="ir-moat-pill" data-tone="assumption">
            {ko ? "가정값 · 확정 가격 아님" : "Assumptions · Unconfirmed Pricing"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={ko ? "시뮬레이션 가정 프리셋" : "Simulation scenario presets"}>
          {UNIT_ECONOMICS_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="ir-moat-btn"
              aria-pressed={presetId === preset.id}
              onClick={() => applyPreset(preset.id)}
            >
              {ko ? preset.labelKo : preset.labelEn}
            </button>
          ))}
        </div>

        {activePreset ? (
          <p className="break-keep text-xs leading-5" style={{ color: "var(--irm-fg-2)" }}>
            {ko ? activePreset.noteKo : activePreset.noteEn}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              {
                key: "monthlyArpuKrw",
                id: `${baseId}-arpu`,
                label: ko ? "월 예시 단가 (P)" : "Example monthly ARPU (P)",
                display: formatKrw(input.monthlyArpuKrw, lang),
                min: 9900,
                max: 49900,
                step: 1000,
                value: input.monthlyArpuKrw,
              },
              {
                key: "paidSubscribers",
                id: `${baseId}-users`,
                label: ko ? "유료 가입자 가정 (N)" : "Assumed paid users (N)",
                display: `${input.paidSubscribers.toLocaleString("en-US")}${ko ? "명" : ""}`,
                min: 10,
                max: 2000,
                step: 10,
                value: input.paidSubscribers,
              },
              {
                key: "monthlyChurnPct",
                id: `${baseId}-churn`,
                label: ko ? "월간 이탈률 가정" : "Assumed monthly churn",
                display: `${input.monthlyChurnPct}%`,
                min: 2,
                max: 15,
                step: 0.5,
                value: input.monthlyChurnPct,
              },
              {
                key: "cacKrw",
                id: `${baseId}-cac`,
                label: ko ? "1인당 획득비용 (CAC)" : "Acquisition cost (CAC)",
                display: formatKrw(input.cacKrw, lang),
                min: 10000,
                max: 120000,
                step: 5000,
                value: input.cacKrw,
              },
              {
                key: "variableCostPerUserKrw",
                id: `${baseId}-var`,
                label: ko ? "인당 AI·동기화 변동비" : "Variable AI/sync cost",
                display: formatKrw(input.variableCostPerUserKrw, lang),
                min: 0,
                max: 8000,
                step: 500,
                value: input.variableCostPerUserKrw,
              },
              {
                key: "fixedMonthlyInfraKrw",
                id: `${baseId}-fixed`,
                label: ko ? "월 고정 인프라비" : "Monthly fixed infra",
                display: formatKrw(input.fixedMonthlyInfraKrw, lang),
                min: 0,
                max: 3000000,
                step: 50000,
                value: input.fixedMonthlyInfraKrw,
              },
            ] as const
          ).map((field) => (
            <div key={field.key} className="grid gap-1 text-xs font-semibold">
              <div className="flex justify-between gap-2">
                <label htmlFor={field.id}>{field.label}</label>
                <span className="ir-moat-tabular font-bold">{field.display}</span>
              </div>
              <input
                id={field.id}
                type="range"
                className="ir-moat-range ir-print-hide"
                min={field.min}
                max={field.max}
                step={field.step}
                value={field.value}
                onChange={(e) => updateField(field.key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>

        <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5" data-testid="unit-economics-output">
          <div className="border-t pt-2.5" style={{ borderColor: "var(--irm-line)" }}>
            <dt className="text-xs" style={{ color: "var(--irm-fg-3)" }}>
              {ko ? "월 매출 (P × N · 차감 전)" : "Gross monthly rev (P × N)"}
            </dt>
            <dd className="ir-moat-tabular mt-1 text-base font-bold">
              {formatKrw(metrics.monthlyGrossRevenueKrw, lang)}
            </dd>
          </div>
          <div className="border-t pt-2.5" style={{ borderColor: "var(--irm-line)" }}>
            <dt className="text-xs" style={{ color: "var(--irm-fg-3)" }}>
              {ko ? "공헌이익률 (Gross Margin)" : "Contribution Margin"}
            </dt>
            <dd className="ir-moat-tabular mt-1 text-base font-bold" style={{ color: "var(--irm-good)" }}>
              {metrics.grossMarginPct.toFixed(1)}%
            </dd>
          </div>
          <div className="border-t pt-2.5" style={{ borderColor: "var(--irm-line)" }}>
            <dt className="text-xs" style={{ color: "var(--irm-fg-3)" }}>
              {ko ? "LTV : CAC 비율" : "LTV : CAC Ratio"}
            </dt>
            <dd
              className="ir-moat-tabular mt-1 text-base font-bold"
              style={{ color: metrics.ltvToCacRatio >= 3 ? "var(--irm-good)" : "var(--irm-warn)" }}
            >
              {metrics.ltvToCacRatio.toFixed(1)}x
              <span className="ml-1 text-xs font-normal" style={{ color: "var(--irm-fg-3)" }}>
                ({formatKrw(metrics.ltvKrw, lang)})
              </span>
            </dd>
          </div>
          <div className="border-t pt-2.5" style={{ borderColor: "var(--irm-line)" }}>
            <dt className="text-xs" style={{ color: "var(--irm-fg-3)" }}>
              {ko ? "CAC 회수 기간 (Payback)" : "CAC Payback"}
            </dt>
            <dd className="ir-moat-tabular mt-1 text-base font-bold">
              {metrics.paybackMonths !== null
                ? `${metrics.paybackMonths.toFixed(1)}${ko ? "개월" : " mo"}`
                : "—"}
            </dd>
          </div>
          <div className="border-t pt-2.5" style={{ borderColor: "var(--irm-line)" }}>
            <dt className="text-xs" style={{ color: "var(--irm-fg-3)" }}>
              {ko ? "손익분기 유료 가입자 (BEP)" : "Breakeven Paid Users (BEP)"}
            </dt>
            <dd className="ir-moat-tabular mt-1 text-base font-bold" style={{ color: "var(--irm-accent)" }}>
              {metrics.breakevenSubscribers !== null
                ? `${metrics.breakevenSubscribers.toLocaleString("en-US")}${ko ? "명" : " users"}`
                : ko
                  ? "역마진"
                  : "Negative"}
            </dd>
          </div>
        </dl>

        <p className="break-keep text-xs leading-5" style={{ color: "var(--irm-fg-3)" }}>
          {ko
            ? "산출식: LTV = (월 단가 − 변동비) ÷ 월 이탈률 · Payback = CAC ÷ 인당 공헌이익 · BEP = 고정비 ÷ 인당 공헌이익(고정비 ₩0 구간은 1명부터 공헌이익 흑자). 개인 Pro 월 19,900원은 미확정 예시 가격이며 팀 가격은 미결정입니다."
            : "Formulas: LTV = (ARPU − Variable Cost) ÷ Monthly Churn · Payback = CAC ÷ Unit Contribution · BEP = Fixed Cost ÷ Unit Contribution. KRW 19,900/mo is an unconfirmed example price; team pricing is undecided."}
        </p>
      </div>
    </article>
  );
}

/**
 * 투자자·심사위원 체감용 인터랙티브 라이브 컴포넌트 2종.
 * - `mode="full"`: 7밴드 KM 분광 안료 위젯 + ₩0 인프라·단위경제성 시뮬레이터 동시 표시
 * - `mode="spectral"` / `mode="economics"`: 섹션·발표 슬라이드 맥락에 맞춰 단독 표시
 */
export function IrInteractiveMoatShowcase({
  mode = "full",
  surface = "site",
  lang = "ko",
}: IrInteractiveMoatShowcaseProps) {
  return (
    <div className="ir-moat-scope grid gap-5" data-surface={surface}>
      {mode === "full" || mode === "spectral" ? (
        <SpectralPigmentLivePanel surface={surface} lang={lang} />
      ) : null}
      {mode === "full" || mode === "economics" ? (
        <InfraAndUnitEconomicsPanel lang={lang} />
      ) : null}
    </div>
  );
}
