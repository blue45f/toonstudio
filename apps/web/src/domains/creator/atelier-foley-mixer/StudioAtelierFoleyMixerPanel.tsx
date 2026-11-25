/**
 * 화실 물리 사운드(Foley) & 공간 음향 마스터 믹서 콘솔 UI (Wave 43F).
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 0건) · 전역 전환 금지 · 빈 객체 기본 Props 금지 ·
 * min-h-11(44px) 터치 타겟 · tabular-nums · [word-break:keep-all] · 단독 렌더링 지원.
 */

import {
  AlertTriangle, CheckCircle2, Download, Feather, Headphones, Moon, Play,
  Radio, RotateCcw, ShieldAlert, ShieldCheck, Sliders, Upload, Volume2, VolumeX, Waves,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement, type ReactNode } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  applyAmbiencePresetToConfig, ATELIER_AMBIENCE_IDS, ATELIER_AMBIENCE_PROFILES,
  computeFoleyDspGraph, createDefaultFoleyMixerConfig, DRAWING_TOOL_FOLEY_IDS,
  DRAWING_TOOL_FOLEY_PROFILES, PAPER_RESONANCE_IDS, PAPER_RESONANCE_PROFILES,
  parseFoleyMixerPreset, previewFoleySound, serializeFoleyMixerPreset, SILENCE_FLOOR_DB,
  TACTILE_UI_PRESET_IDS, TACTILE_UI_PRESETS,
  type AtelierAmbienceId, type DrawingToolFoleyId, type FoleyDspGraph, type FoleyMixerConfig,
  type FoleyPreviewKind, type FoleyPreviewResult, type PaperResonanceId,
  type PreviewAudioContextLike, type TactileUiPresetId,
} from "./atelier-foley-mixer-engine";

export interface StudioAtelierFoleyMixerPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialConfig?: FoleyMixerConfig;
  readonly initialPressure01?: number;
  readonly initialVelocity01?: number;
  readonly audioContextFactory?: () => PreviewAudioContextLike | null;
  readonly onConfigChange?: (config: FoleyMixerConfig, graph: FoleyDspGraph) => void;
  readonly onPreviewResult?: (result: FoleyPreviewResult) => void;
  readonly onExportJson?: (json: string) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const PRIMARY_TONE = "border-accent bg-accent text-on-accent hover:bg-accent-2";
const WARN_TONE = "border-warn bg-warning-soft text-warn";
const BAD_TONE = "border-bad bg-bad-soft text-bad";
const GOOD_TONE = "border-good bg-good-soft text-good";

function formatDbValue(db: number, silentLabel: string): string {
  return db <= SILENCE_FLOOR_DB ? silentLabel : `${db.toFixed(1)} dBFS`;
}

function formatLufsValue(lufs: number, silentLabel: string): string {
  return lufs <= SILENCE_FLOOR_DB ? silentLabel : `${lufs.toFixed(1)} LUFS`;
}

function formatPercent(unit01: number): string {
  return `${Math.round(unit01 * 100)}%`;
}

function DspReadoutCard(cardProps: {
  readonly label: string;
  readonly value: ReactNode;
  readonly sub: ReactNode;
  readonly testId: string;
  readonly toneClass?: string;
}): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="text-xs text-fg-3 [word-break:keep-all]">{cardProps.label}</div>
      <div
        data-testid={cardProps.testId}
        className={`mt-1 text-base font-bold tabular-nums ${cardProps.toneClass ?? "text-fg"}`}
      >
        {cardProps.value}
      </div>
      <div className="mt-1 text-xs text-fg-2 tabular-nums [word-break:keep-all]">{cardProps.sub}</div>
    </div>
  );
}

function MixerSliderRow(sliderProps: {
  readonly id: string;
  readonly label: string;
  readonly valueLabel: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly testId: string;
  readonly hint?: string;
  readonly onChange: (next: number) => void;
}): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={sliderProps.id} className="font-medium text-fg [word-break:keep-all]">
          {sliderProps.label}
        </label>
        <span className="font-mono font-semibold text-fg-2 tabular-nums">{sliderProps.valueLabel}</span>
      </div>
      <input
        id={sliderProps.id}
        data-testid={sliderProps.testId}
        type="range"
        min={sliderProps.min}
        max={sliderProps.max}
        step={sliderProps.step}
        value={sliderProps.value}
        onChange={(event) => sliderProps.onChange(Number(event.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
      {sliderProps.hint ? <p className="text-[11px] text-fg-3 [word-break:keep-all]">{sliderProps.hint}</p> : null}
    </div>
  );
}

/** 화실 물리 사운드(Foley) & 공간 음향 마스터 믹서 콘솔 패널. */
export function StudioAtelierFoleyMixerPanel(props: StudioAtelierFoleyMixerPanelProps): ReactElement {
  const {
    locale, className, initialConfig, initialPressure01 = 0.68, initialVelocity01 = 0.56,
    audioContextFactory, onConfigChange, onPreviewResult, onExportJson,
  } = props;

  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [config, setConfig] = useState<FoleyMixerConfig>(() => initialConfig ?? createDefaultFoleyMixerConfig());
  const [pressure01, setPressure01] = useState<number>(initialPressure01);
  const [velocity01, setVelocity01] = useState<number>(initialVelocity01);
  const [presetJson, setPresetJson] = useState<string>("");
  const [notice, setNotice] = useState<{ readonly tone: "good" | "warn" | "bad"; readonly text: string } | null>(null);

  const dspGraph = useMemo<FoleyDspGraph>(
    () => computeFoleyDspGraph(config, { pressure01, velocity01 }),
    [config, pressure01, velocity01],
  );

  const commitConfig = (next: FoleyMixerConfig): void => {
    setConfig(next);
    onConfigChange?.(next, computeFoleyDspGraph(next, { pressure01, velocity01 }));
  };

  const handleSelectTool = (toolId: DrawingToolFoleyId): void => {
    commitConfig({ ...config, toolId });
  };

  const handleSelectPaper = (paperId: PaperResonanceId): void => {
    commitConfig({ ...config, paperId });
  };

  const handleSelectAmbiencePreset = (ambienceId: AtelierAmbienceId): void => {
    commitConfig(applyAmbiencePresetToConfig(config, ambienceId));
  };

  const handleAmbienceLevelChange = (ambienceId: AtelierAmbienceId, nextVal: number): void => {
    commitConfig({
      ...config,
      ambienceLevels: { ...config.ambienceLevels, [ambienceId]: nextVal },
    });
  };

  const handleSelectTactile = (tactilePresetId: TactileUiPresetId): void => {
    commitConfig({ ...config, tactilePresetId });
  };

  const handlePreview = (kind: FoleyPreviewKind): void => {
    const result = previewFoleySound(dspGraph, { kind, audioContextFactory });
    onPreviewResult?.(result);
    const kindLabel =
      kind === "stroke"
        ? pick("화구 마찰음", "Tool friction")
        : kind === "ambience"
          ? pick("화실 앰비언스", "Atelier ambience")
          : pick("촉각 UI 피드백", "Tactile UI click");

    if (result.status === "played") {
      setNotice({
        tone: "good",
        text: pick(
          `${kindLabel} 시연 재생 완료 (${result.durationMs}ms · ${result.peakDb.toFixed(1)} dBFS)`,
          `Played ${kindLabel} preview (${result.durationMs}ms · ${result.peakDb.toFixed(1)} dBFS)`,
        ),
      });
    } else if (result.status === "muted-noop") {
      setNotice({
        tone: "warn",
        text: pick(
          `${kindLabel} 시연이 음소거 또는 안전장치(${result.reason})로 차단되었습니다.`,
          `${kindLabel} preview suppressed by mute/safety guard (${result.reason}).`,
        ),
      });
    } else {
      setNotice({
        tone: "warn",
        text: pick(
          `현재 환경에서 Web Audio 출력을 사용할 수 없어 무해 대기(${result.status})로 처리했습니다.`,
          `Web Audio output unavailable in this environment (${result.status}).`,
        ),
      });
    }
  };

  const handleExportPreset = (): void => {
    const toolLabel = DRAWING_TOOL_FOLEY_PROFILES[config.toolId].labelEn;
    const paperLabel = PAPER_RESONANCE_PROFILES[config.paperId].labelEn;
    const serialized = serializeFoleyMixerPreset(config, `${toolLabel} on ${paperLabel}`);
    setPresetJson(serialized);
    onExportJson?.(serialized);
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(serialized).catch(() => undefined);
    }
    setNotice({
      tone: "good",
      text: pick("현재 화실 사운드 믹서 프리셋을 v1 JSON으로 내보냈습니다.", "Exported atelier foley preset as v1 JSON."),
    });
  };

  const handleImportPreset = (): void => {
    const parsed = parseFoleyMixerPreset(presetJson);
    if (!parsed.ok) {
      setNotice({ tone: "bad", text: isKo ? parsed.messageKo : parsed.messageEn });
      return;
    }
    commitConfig(parsed.preset.config);
    setNotice({
      tone: "good",
      text: pick(
        `프리셋 "${parsed.preset.name}" 적용 완료${parsed.warnings.length > 0 ? ` (보정 ${parsed.warnings.length}건)` : ""}`,
        `Applied preset "${parsed.preset.name}"${parsed.warnings.length > 0 ? ` (${parsed.warnings.length} clamped)` : ""}`,
      ),
    });
  };

  const handleReset = (): void => {
    const fresh = createDefaultFoleyMixerConfig();
    setPressure01(0.68);
    setVelocity01(0.56);
    setPresetJson("");
    commitConfig(fresh);
    setNotice({ tone: "good", text: pick("화실 사운드 마스터 믹서를 기본값으로 되돌렸습니다.", "Reset atelier foley mixer to defaults.") });
  };

  const activeTool = DRAWING_TOOL_FOLEY_PROFILES[config.toolId];
  const activePaper = PAPER_RESONANCE_PROFILES[config.paperId];
  const silentWord = pick("무음 (-96 dB)", "Silent (-96 dB)");
  const safetyBadgeClass = dspGraph.safety.isAudible ? GOOD_TONE : dspGraph.safety.isMutedBySafety ? WARN_TONE : BAD_TONE;
  const safetyBadgeText = dspGraph.safety.isAudible
    ? pick(`출력 활성 · ${dspGraph.master.peakDb.toFixed(1)} dBFS`, `Live · ${dspGraph.master.peakDb.toFixed(1)} dBFS`)
    : dspGraph.safety.isQuietHoursActive
      ? pick("정숙 시간 자동 음소거", "Quiet Hours Auto-Mute")
      : config.prefersReducedMotion
        ? pick("모션 축소 자동 음소거", "Reduced-Motion Auto-Mute")
        : pick("마스터 음소거", "Master Muted");

  return (
    <section
      data-testid="atelier-foley-mixer-panel"
      aria-label={pick("화실 물리 사운드 및 공간 음향 마스터 믹서 콘솔", "Atelier Physical Foley & Spatial Ambience Master Mixer Console")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("화실 물리 사운드(Foley) · 공간 음향 마스터 믹서 콘솔", "Atelier Physical Foley & Spatial Ambience Master Mixer")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "5종 화구 마찰음과 4종 종이 지질 공명, -24 LUFS 화실 앰비언스, 촉각 UI 및 안전 음소거 가드를 한 화면에서 조율합니다.",
              "Tune 5 tool friction models, 4 paper resonance filters, -24 LUFS studio soundscapes, tactile UI cues, and safety mute guards.",
            )}
          </p>
        </div>
        <span
          data-testid="mixer-safety-badge"
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${safetyBadgeClass}`}
        >
          {dspGraph.safety.isAudible ? (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{safetyBadgeText}</span>
        </span>
      </header>

      {/* 마스터 볼륨 · 음소거 · 접근성/정숙시간 안전장치 */}
      <div className="grid gap-3 rounded-lg border border-line bg-card p-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-2.5">
          <MixerSliderRow
            id={`${uid}-master-volume`}
            testId="slider-master-volume"
            label={pick("마스터 출력 볼륨", "Master Output Volume")}
            valueLabel={formatPercent(config.masterVolume01)}
            min={0} max={1} step={0.01}
            value={config.masterVolume01}
            onChange={(val) => commitConfig({ ...config, masterVolume01: val })}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="btn-master-mute"
              aria-pressed={config.muted}
              onClick={() => commitConfig({ ...config, muted: !config.muted })}
              className={`${BTN_BASE} ${config.muted ? BAD_TONE : IDLE_TONE}`}
            >
              {config.muted ? <VolumeX className="h-3.5 w-3.5" aria-hidden="true" /> : <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{config.muted ? pick("음소거 해제", "Unmute Master") : pick("즉시 음소거", "Mute Master")}</span>
            </button>
            <button
              type="button"
              data-testid="btn-toggle-reduced-motion"
              aria-pressed={config.prefersReducedMotion}
              onClick={() => commitConfig({ ...config, prefersReducedMotion: !config.prefersReducedMotion })}
              className={`${BTN_BASE} ${config.prefersReducedMotion ? WARN_TONE : IDLE_TONE}`}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("모션 축소 자동 음소거", "Reduced-Motion Mute")}</span>
            </button>
            <button
              type="button"
              data-testid="btn-toggle-quiet-hours"
              aria-pressed={config.quietHours.enabled}
              onClick={() =>
                commitConfig({ ...config, quietHours: { ...config.quietHours, enabled: !config.quietHours.enabled } })
              }
              className={`${BTN_BASE} ${config.quietHours.enabled ? ACTIVE_TONE : IDLE_TONE}`}
            >
              <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="tabular-nums">
                {pick(`야간 정숙 (${config.quietHours.startHour}시~${config.quietHours.endHour}시)`, `Quiet (${config.quietHours.startHour}:00-${config.quietHours.endHour}:00)`)}
              </span>
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-line bg-panel p-2.5">
          <MixerSliderRow
            id={`${uid}-current-hour`}
            testId="slider-current-hour"
            label={pick("정숙 시간대 검증 시각", "Quiet-Hours Clock Check")}
            valueLabel={`${String(config.currentHour).padStart(2, "0")}:00`}
            min={0} max={23} step={1}
            value={config.currentHour}
            hint={
              dspGraph.safety.isQuietHoursActive
                ? pick("현재 시각이 야간 정숙 구간에 해당해 모든 음향을 자동 음소거합니다.", "Current hour falls inside quiet hours; audio auto-muted.")
                : pick("정숙 구간 밖이거나 야간 정숙 가드가 비활성 상태입니다.", "Outside quiet hours or quiet-hours guard disabled.")
            }
            onChange={(val) => commitConfig({ ...config, currentHour: val })}
          />
        </div>
      </div>

      {/* 실시간 DSP 파라미터 리드아웃 4종 */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-label={pick("실시간 DSP 파라미터 리드아웃", "Real-time DSP Parameter Readouts")}>
        <DspReadoutCard
          label={pick("화구 중심 주파수 · Q", "Tool Center Freq · Q")}
          testId="readout-center-freq"
          value={`${dspGraph.friction.centerFrequencyHz} Hz`}
          sub={`Q ${dspGraph.friction.qFactor.toFixed(2)} · Stick-Slip ${dspGraph.friction.stickSlipRateHz.toFixed(0)} Hz`}
        />
        <DspReadoutCard
          label={pick("종이 고역 감쇠 LPF", "Paper LPF Cutoff")}
          testId="readout-lpf-cutoff"
          value={`${dspGraph.friction.lpfCutoffHz} Hz`}
          sub={pick(
            `섬유 밀도 ${formatPercent(dspGraph.friction.fiberGrainDensity01)} · 촉각 진동 ${formatPercent(dspGraph.friction.tactileVibration01)}`,
            `Grain ${formatPercent(dspGraph.friction.fiberGrainDensity01)} · Vibe ${formatPercent(dspGraph.friction.tactileVibration01)}`,
          )}
        />
        <DspReadoutCard
          label={pick("마스터 실효 출력 dB", "Effective Master Output")}
          testId="readout-effective-db"
          toneClass={dspGraph.safety.isAudible ? "text-accent" : "text-fg-3"}
          value={formatDbValue(dspGraph.master.peakDb, silentWord)}
          sub={pick(
            `헤드룸 ${dspGraph.master.headroomDb.toFixed(1)} dB · ${dspGraph.master.clippingPrevented ? "리미터 클리핑 보호 활성" : "클리핑 없음"}`,
            `Headroom ${dspGraph.master.headroomDb.toFixed(1)} dB · ${dspGraph.master.clippingPrevented ? "Limiter Active" : "Clean"}`,
          )}
        />
        <DspReadoutCard
          label={pick("공간 앰비언스 음압", "Ambience Loudness")}
          testId="readout-ambience-lufs"
          toneClass={dspGraph.ambience.meetsNonIntrusiveTarget ? "text-good" : "text-warn"}
          value={formatLufsValue(dspGraph.ambience.estimatedLufs, silentWord)}
          sub={pick(
            `목표 ${dspGraph.ambience.targetLufs} LUFS 비방해 기준 준수`,
            `Meets ${dspGraph.ambience.targetLufs} LUFS non-intrusive target`,
          )}
        />
      </div>

      {/* 화구 × 종이 지질 조합 선택기 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Feather className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("5종 화구 마찰음 프로필", "5 Drawing Tool Friction Profiles")}</span>
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">
              γ {activeTool.pressureGainGamma.toFixed(2)} · Δv {activeTool.velocityPitchShiftCoeff.toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="group" aria-label={pick("화구 선택", "Select drawing tool")}>
            {DRAWING_TOOL_FOLEY_IDS.map((id) => {
              const profile = DRAWING_TOOL_FOLEY_PROFILES[id];
              const active = config.toolId === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`tool-btn-${id}`}
                  aria-pressed={active}
                  onClick={() => handleSelectTool(id)}
                  className={`${BTN_BASE} justify-between ${active ? ACTIVE_TONE : IDLE_TONE}`}
                >
                  <span>{isKo ? profile.labelKo : profile.labelEn}</span>
                  <span className="font-mono text-[11px] opacity-80 tabular-nums">{profile.centerFrequencyHz}Hz</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-fg-2">{isKo ? activeTool.summaryKo : activeTool.summaryEn}</p>
        </div>

        <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Waves className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("4종 종이 지질 공명 & 스트로크 감도", "4 Paper Resonance Profiles & Stroke Probe")}</span>
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">LPF {activePaper.lpfCutoffHz} Hz</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={pick("종이 지질 선택", "Select paper resonance")}>
            {PAPER_RESONANCE_IDS.map((id) => {
              const profile = PAPER_RESONANCE_PROFILES[id];
              const active = config.paperId === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`paper-btn-${id}`}
                  aria-pressed={active}
                  onClick={() => handleSelectPaper(id)}
                  className={`${BTN_BASE} justify-between ${active ? ACTIVE_TONE : IDLE_TONE}`}
                >
                  <span>{isKo ? profile.labelKo : profile.labelEn}</span>
                  <span className="font-mono text-[11px] opacity-80 tabular-nums">{profile.lpfCutoffHz}Hz</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-fg-2">{isKo ? activePaper.summaryKo : activePaper.summaryEn}</p>
          <div className="grid gap-2.5 border-t border-line pt-2.5 sm:grid-cols-2">
            <MixerSliderRow
              id={`${uid}-stroke-pressure`}
              testId="slider-stroke-pressure"
              label={pick("시연 필압", "Probe Pressure")}
              valueLabel={`${formatPercent(pressure01)} (γ→${formatPercent(dspGraph.stroke.pressureCurveGain01)})`}
              min={0} max={1} step={0.01}
              value={pressure01}
              onChange={setPressure01}
            />
            <MixerSliderRow
              id={`${uid}-stroke-velocity`}
              testId="slider-stroke-velocity"
              label={pick("시연 드로잉 속도", "Probe Velocity")}
              valueLabel={formatPercent(velocity01)}
              min={0} max={1} step={0.01}
              value={velocity01}
              onChange={setVelocity01}
            />
          </div>
        </div>
      </div>

      {/* 4종 화실 앰비언스 믹서 슬라이더 & 3종 촉각 UI 피드백 프리셋 */}
      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Sliders className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("4종 화실 앰비언스 사운드스케이프 믹서", "4 Atelier Ambience Soundscape Mixer")}</span>
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">
              {dspGraph.ambience.clippingPrevented
                ? pick(`자동 정규화 ×${dspGraph.ambience.antiClipScale.toFixed(2)}`, `Auto-Norm ×${dspGraph.ambience.antiClipScale.toFixed(2)}`)
                : pick("타겟 -24 LUFS", "Target -24 LUFS")}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("화실 앰비언스 프리셋", "Atelier ambience presets")}>
            {ATELIER_AMBIENCE_IDS.map((id) => {
              const profile = ATELIER_AMBIENCE_PROFILES[id];
              const active = config.ambienceId === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`ambience-preset-${id}`}
                  aria-pressed={active}
                  onClick={() => handleSelectAmbiencePreset(id)}
                  className={`${BTN_BASE} ${active ? ACTIVE_TONE : IDLE_TONE}`}
                >
                  <span>{isKo ? profile.labelKo : profile.labelEn}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {ATELIER_AMBIENCE_IDS.map((id) => {
              const profile = ATELIER_AMBIENCE_PROFILES[id];
              const level = config.ambienceLevels[id];
              return (
                <MixerSliderRow
                  key={id}
                  id={`${uid}-amb-${id}`}
                  testId={`slider-ambience-${id}`}
                  label={
                    id === "silent-focus"
                      ? pick("무음 집중 정숙 감쇠", "Silent Focus Attenuation")
                      : isKo ? profile.labelKo : profile.labelEn
                  }
                  valueLabel={formatPercent(level)}
                  min={0} max={1} step={0.01}
                  value={level}
                  onChange={(val) => handleAmbienceLevelChange(id, val)}
                />
              );
            })}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-line bg-card p-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Radio className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("3종 촉각 UI 피드백 & 1클릭 사운드 시연", "3 Tactile UI Presets & One-Click Preview")}</span>
          </h3>
          <div className="flex flex-col gap-1.5" role="group" aria-label={pick("촉각 UI 프리셋 선택", "Select tactile UI preset")}>
            {TACTILE_UI_PRESET_IDS.map((id) => {
              const preset = TACTILE_UI_PRESETS[id];
              const active = config.tactilePresetId === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`tactile-preset-${id}`}
                  aria-pressed={active}
                  onClick={() => handleSelectTactile(id)}
                  className={`${BTN_BASE} justify-between ${active ? ACTIVE_TONE : IDLE_TONE}`}
                >
                  <span>{isKo ? preset.labelKo : preset.labelEn}</span>
                  <span className="font-mono text-[11px] opacity-80 tabular-nums">
                    {preset.clickFrequencyHz > 0 ? `${preset.clickFrequencyHz}Hz · ${preset.hapticPulseMs}ms` : pick("꺼짐", "Off")}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-2.5">
            <button
              type="button"
              data-testid="btn-preview-stroke"
              onClick={() => handlePreview("stroke")}
              className={`${BTN_BASE} flex-1 ${PRIMARY_TONE}`}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("화구 마찰음 시연", "Preview Stroke")}</span>
            </button>
            <button
              type="button"
              data-testid="btn-preview-ambience"
              onClick={() => handlePreview("ambience")}
              className={`${BTN_BASE} ${IDLE_TONE}`}
            >
              <Waves className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("공간음 시연", "Ambience")}</span>
            </button>
            <button
              type="button"
              data-testid="btn-preview-tactile"
              onClick={() => handlePreview("tactile-ui")}
              className={`${BTN_BASE} ${IDLE_TONE}`}
            >
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("촉각음 시연", "Tactile")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 프리셋 JSON 내보내기 / 불러오기 / 초기화 */}
      <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${uid}-preset-json`} className="text-xs font-semibold text-fg">
            {pick("믹서 프리셋 JSON 내보내기 · 불러오기", "Mixer Preset JSON Export & Import")}
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="btn-export-preset" onClick={handleExportPreset} className={`${BTN_BASE} ${IDLE_TONE}`}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("프리셋 JSON 내보내기", "Export Preset JSON")}</span>
            </button>
            <button type="button" data-testid="btn-import-preset" onClick={handleImportPreset} className={`${BTN_BASE} ${IDLE_TONE}`}>
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("JSON 불러오기", "Import JSON")}</span>
            </button>
            <button type="button" data-testid="btn-reset-mixer" onClick={handleReset} className={`${BTN_BASE} ${IDLE_TONE}`}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("초기화", "Reset")}</span>
            </button>
          </div>
        </div>
        <textarea
          id={`${uid}-preset-json`}
          data-testid="textarea-preset-json"
          rows={4}
          value={presetJson}
          onChange={(event) => setPresetJson(event.target.value)}
          placeholder={pick("내보내기 버튼을 누르거나 저장된 v1 프리셋 JSON을 붙여넣으세요.", "Click Export or paste a saved v1 preset JSON here.")}
          className={`w-full rounded-lg border border-line bg-panel p-2.5 font-mono text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
        />
      </div>

      {notice ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="mixer-notice-banner"
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
            notice.tone === "bad" ? BAD_TONE : notice.tone === "warn" ? WARN_TONE : "border-line bg-card text-fg-2"
          }`}
        >
          {notice.tone === "bad" ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </div>
      ) : null}
    </section>
  );
}
