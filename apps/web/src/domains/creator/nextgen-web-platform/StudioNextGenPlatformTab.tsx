import { Cpu, ExternalLink, Gauge, Pipette, Type, Volume2 } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  COMPUTE_PRESSURE_POLICIES,
  STUDIO_FALLBACK_COLOR_SWATCHES,
  type CanvasHdrDisplayP3Probe,
  type ChromeNextGenCapabilities,
  type ComputePressureState,
  type ComputePressureThrottlePolicy,
  type LocalFontCatalogEntry,
  type WebNnProbeResult,
  type WebtoonFontCategory,
} from "./chrome-nextgen-apis";

const PRESSURE_STATES: readonly ComputePressureState[] = ["nominal", "fair", "serious", "critical"];
const TONE_CLASSES = [
  "nextgen-chip--tone-1",
  "nextgen-chip--tone-2",
  "nextgen-chip--tone-3",
  "nextgen-chip--tone-4",
  "nextgen-chip--tone-5",
] as const;

export interface StudioNextGenPlatformTabProps {
  readonly capabilities: ChromeNextGenCapabilities;
  readonly hdrInfo: CanvasHdrDisplayP3Probe;
  readonly pressureState: ComputePressureState;
  readonly pressurePolicy: ComputePressureThrottlePolicy;
  readonly livePressureActive: boolean;
  readonly sampledColor: string;
  readonly fonts: readonly LocalFontCatalogEntry[];
  readonly fontSource: "local-font-access" | "fallback-presets" | null;
  readonly webNnResult: WebNnProbeResult | null;
  readonly speculationApplied: boolean;
  readonly pipNote: string;
  readonly audioNote: string;
  readonly onToggleLivePressure: () => void;
  readonly onSelectPressure: (state: ComputePressureState) => void;
  readonly onPickScreenColor: () => void;
  readonly onSelectFallbackSwatch: (oklch: string) => void;
  readonly onLoadFonts: (category: WebtoonFontCategory | "all") => void;
  readonly onOpenPip: () => void;
  readonly onTestAudio: () => void;
  readonly onCheckWebNn: () => void;
}

export function StudioNextGenPlatformTab({
  capabilities,
  hdrInfo,
  pressureState,
  pressurePolicy,
  livePressureActive,
  sampledColor,
  fonts,
  fontSource,
  webNnResult,
  speculationApplied,
  pipNote,
  audioNote,
  onToggleLivePressure,
  onSelectPressure,
  onPickScreenColor,
  onSelectFallbackSwatch,
  onLoadFonts,
  onOpenPip,
  onTestAudio,
  onCheckWebNn,
}: StudioNextGenPlatformTabProps) {
  const bt = useBilingual("StudioNextGenPlatformTab");

  return (
    <section
      id="nextgen-panel-platform"
      role="tabpanel"
      aria-labelledby="nextgen-tab-platform"
      data-testid="nextgen-panel-platform"
      className="nextgen-hub__panel space-y-4"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.features.map((feature, index) => (
          <div
            key={feature.id}
            data-testid={`nextgen-feature-${feature.id}`}
            className={cn(
              "nextgen-hub__card nextgen-hub__scroll-card flex items-start justify-between gap-2 p-3",
              TONE_CLASSES[index % TONE_CLASSES.length],
            )}
          >
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-fg">
                {bt(feature.labelKo, feature.labelEn)}
              </p>
              <p className="mt-0.5 text-[0.7rem] text-fg-2">
                {feature.supported
                  ? bt("브라우저 기본 지원", "Native browser support")
                  : bt(feature.fallbackLabelKo, feature.fallbackLabelEn)}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-bold",
                feature.supported
                  ? "border-good/45 bg-good/15 text-good"
                  : "border-line bg-card text-fg-2",
              )}
            >
              {feature.supported ? bt("바로 사용", "Active") : bt("자동 대체", "Fallback")}
            </span>
          </div>
        ))}
      </div>

      {/* 기기 발열·성능 보호 (Compute Pressure + scheduler.yield) */}
      <div className="nextgen-hub__card space-y-3 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge size={16} className="text-accent" aria-hidden="true" />
            <span className="text-xs font-extrabold text-fg">
              {bt("기기 발열·성능 자동 조절", "Thermal & Load Protection")}
            </span>
          </div>
          <button
            type="button"
            aria-pressed={livePressureActive}
            onClick={onToggleLivePressure}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg transition-colors hover:border-accent/50"
          >
            {livePressureActive
              ? bt("실시간 감지 켜짐", "Live monitor ON")
              : bt("실시간 감지 켜기", "Enable live monitor")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESSURE_STATES.map((state) => {
            const policy = COMPUTE_PRESSURE_POLICIES[state];
            const active = pressureState === state;
            return (
              <button
                key={state}
                type="button"
                aria-pressed={active}
                data-testid={`nextgen-pressure-${state}`}
                onClick={() => onSelectPressure(state)}
                className={cn(
                  "min-h-11 rounded-xl border px-2.5 py-2 text-left text-xs font-bold transition-colors",
                  active
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                <span className="block">{bt(policy.labelKo, policy.labelEn)}</span>
                <span className="mt-0.5 block text-[0.68rem] text-fg-3 tabular-nums">
                  {`${policy.targetFps}fps · 작업 ${policy.maxConcurrentWorkers}개`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-fg-2 tabular-nums">
          {bt(pressurePolicy.guidanceKo, pressurePolicy.guidanceEn)}{" "}
          {bt(
            `(매 ${pressurePolicy.yieldEveryNFrames}프레임마다 화면 숨 고르기 · 색 영역 ${hdrInfo.recommendedColorSpace.toUpperCase()})`,
            `(Yield every ${pressurePolicy.yieldEveryNFrames} frame(s) · Gamut ${hdrInfo.recommendedColorSpace.toUpperCase()})`,
          )}
        </p>
      </div>

      {/* 5대 차세대 크리에이터 즉석 도구 */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="nextgen-hub__card space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-fg">
              <Pipette size={14} className="text-accent" aria-hidden="true" />
              {bt("화면 전체 색 뽑기", "Screen Color Picker")}
            </span>
            <span
              data-testid="nextgen-sampled-color-swatch"
              className="inline-block size-5 rounded-full border border-line-strong"
              style={{ background: sampledColor }}
              aria-label={sampledColor}
            />
          </div>
          <button
            type="button"
            data-testid="nextgen-eyedropper-btn"
            onClick={onPickScreenColor}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-accent/45 bg-accent-soft/50 px-3 text-xs font-bold text-fg transition-colors hover:bg-accent-soft"
          >
            <Pipette size={14} aria-hidden="true" />
            {bt("색상 바로 뽑기", "Pick screen color")}
          </button>
          <div className="flex flex-wrap gap-1.5">
            {STUDIO_FALLBACK_COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                onClick={() => onSelectFallbackSwatch(swatch.oklch)}
                aria-label={bt(swatch.labelKo, swatch.labelEn)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-card px-2 text-[0.68rem] font-semibold text-fg-2"
              >
                <span
                  className="mr-1 inline-block size-3 rounded-full border border-line-strong"
                  style={{ background: swatch.oklch }}
                  aria-hidden="true"
                />
                {bt(swatch.labelKo, swatch.labelEn)}
              </button>
            ))}
          </div>
        </div>

        <div className="nextgen-hub__card space-y-2 p-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-fg">
            <Type size={14} className="text-accent" aria-hidden="true" />
            {bt("웹툰 식자 글꼴 찾기", "Webtoon Font Finder")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="nextgen-load-fonts-btn"
              onClick={() => onLoadFonts("all")}
              className="inline-flex min-h-11 items-center rounded-xl border border-accent/45 bg-accent-soft/50 px-3 text-xs font-bold text-fg"
            >
              {bt("전체 불러오기", "Load all")}
            </button>
            <button
              type="button"
              onClick={() => onLoadFonts("korean-dialogue")}
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-2.5 text-xs font-semibold text-fg-2"
            >
              {bt("대사 글꼴", "Dialogue")}
            </button>
            <button
              type="button"
              onClick={() => onLoadFonts("webtoon-sfx")}
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-2.5 text-xs font-semibold text-fg-2"
            >
              {bt("효과음 글꼴", "SFX")}
            </button>
          </div>
          {fonts.length > 0 ? (
            <ul data-testid="nextgen-font-list" className="space-y-1 text-[0.72rem] text-fg-2">
              {fonts.slice(0, 4).map((font) => (
                <li key={`${font.family}-${font.style}`} className="flex justify-between gap-2">
                  <span className="font-bold text-fg">{font.family}</span>
                  <span>{font.category}</span>
                </li>
              ))}
              {fontSource ? (
                <li className="text-[0.68rem] text-fg-3">
                  {fontSource === "local-font-access"
                    ? bt("내 기기 설치 글꼴", "Installed local fonts")
                    : bt("스튜디오 추천 프리셋", "Studio preset fonts")}
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <div className="nextgen-hub__card space-y-2 p-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-fg">
            <ExternalLink size={14} className="text-accent" aria-hidden="true" />
            {bt("보조창 · 사운드 · 빠른 이동", "Floating Window · Audio · Preload")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="nextgen-pip-btn"
              onClick={onOpenPip}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg hover:border-accent/50"
            >
              <ExternalLink size={13} aria-hidden="true" />
              {bt("떠다니는 참고창", "Floating Ref")}
            </button>
            <button
              type="button"
              data-testid="nextgen-audio-btn"
              onClick={onTestAudio}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg hover:border-accent/50"
            >
              <Volume2 size={13} aria-hidden="true" />
              {bt("효과음 지연 점검", "Test SFX")}
            </button>
            <button
              type="button"
              data-testid="nextgen-webnn-btn"
              onClick={onCheckWebNn}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg hover:border-accent/50"
            >
              <Cpu size={13} aria-hidden="true" />
              {bt("AI·빠른 이동 점검", "Check AI & Preload")}
            </button>
          </div>
          {pipNote ? <p className="text-[0.7rem] text-fg-2">{pipNote}</p> : null}
          {audioNote ? <p className="text-[0.7rem] text-fg-2">{audioNote}</p> : null}
          {webNnResult ? (
            <p className="text-[0.7rem] text-fg-2">
              {bt(
                `AI 엔진: ${webNnResult.supported ? webNnResult.preferredDevice.toUpperCase() : webNnResult.fallbackBackend.toUpperCase()} · 화면 미리 준비: ${speculationApplied ? "적용됨" : "표준 모드"}`,
                `AI Engine: ${webNnResult.supported ? webNnResult.preferredDevice.toUpperCase() : webNnResult.fallbackBackend.toUpperCase()} · Preload: ${speculationApplied ? "Active" : "Standard"}`,
              )}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
