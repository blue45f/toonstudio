import {
  BellOff,
  Cpu,
  Gauge,
  Music2,
  PauseCircle,
  RotateCcw,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { checkNeuralProviderAvailability } from "./expressive-prosody-engine";
import {
  NEURAL_VOICE_PROVIDER_CATALOG,
  NEURAL_VOICE_PROVIDER_IDS,
  VOICE_COACH_MOMENT_CATALOG,
  VOICE_COACH_MOMENT_IDS,
  VOICE_COACH_PERSONA_PROFILES,
  VOICE_COACH_TONE_PROFILES,
  createDefaultNeuralProviderConfig,
  type ExpressiveProsodyClause,
  type ExpressiveUtterancePlan,
  type NeuralVoiceAvailability,
  type NeuralVoiceProviderConfig,
  type NeuralVoiceProviderId,
  type VoiceCoachEmotionTone,
  type VoiceCoachLocale,
  type VoiceCoachMomentId,
  type VoiceCoachPersona,
} from "./voice-coach-types";

export interface VoiceCoachLiveCaptionBarProps {
  readonly locale: VoiceCoachLocale;
  readonly playing: boolean;
  readonly persona: VoiceCoachPersona;
  readonly tone: VoiceCoachEmotionTone;
  readonly clauseIndex: number;
  readonly earconPlayed: boolean;
  readonly activePlan: ExpressiveUtterancePlan;
  readonly currentClause: ExpressiveProsodyClause | null;
  readonly feedbackMessage: string;
}

/**
 * 실시간 접근성 자막(CC) 바 (`role="status" aria-live="polite"`).
 * 현재 발화 중인 호흡 절(Clause)을 강조하고 피치·속도·호흡 휴지를 함께 표시한다.
 */
export function VoiceCoachLiveCaptionBar({
  locale,
  playing,
  persona,
  tone,
  clauseIndex,
  earconPlayed,
  activePlan,
  currentClause,
  feedbackMessage,
}: VoiceCoachLiveCaptionBarProps) {
  const bt = useBilingual("StudioVoiceCoachPanel");
  const personaProfile = VOICE_COACH_PERSONA_PROFILES[persona];
  const toneProfile = VOICE_COACH_TONE_PROFILES[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="vc-caption-bar"
      data-active={playing ? "true" : "false"}
      data-tone={toneProfile.semanticTone}
      data-testid="vc-live-caption-bar"
    >
      <div className="vc-caption-head">
        <div className="vc-caption-tags">
          <span className="vc-badge" data-tone={toneProfile.semanticTone}>
            <span
              className="vc-wave-bars"
              data-playing={playing ? "true" : "false"}
              aria-hidden="true"
            >
              <span className="vc-wave-bar" />
              <span className="vc-wave-bar" />
              <span className="vc-wave-bar" />
            </span>
            <span>{locale === "ko" ? personaProfile.labelKo : personaProfile.labelEn}</span>
          </span>
          <span className="vc-badge" data-tone={toneProfile.semanticTone}>
            {locale === "ko" ? toneProfile.labelKo : toneProfile.labelEn}
          </span>
          {earconPlayed ? (
            <span className="vc-badge" data-tone="cool">
              <Music2 size={12} aria-hidden="true" />
              {locale === "ko" ? toneProfile.earconLabelKo : toneProfile.earconLabelEn}
            </span>
          ) : null}
        </div>
        <span className="vc-card-meta vc-num">
          {playing
            ? bt(
                `호흡 절 ${clauseIndex + 1} / ${activePlan.clauses.length}`,
                `Clause ${clauseIndex + 1} / ${activePlan.clauses.length}`,
              )
            : bt("실시간 자막 (CC)", "Live Captions (CC)")}
        </span>
      </div>

      <p className="vc-caption-text" data-testid="vc-caption-text">
        {activePlan.clauses.map((clause, index) => (
          <span key={clause.index}>
            <span
              className="vc-caption-clause"
              data-current={playing && index === clauseIndex ? "true" : "false"}
              data-spoken={playing && index < clauseIndex ? "true" : "false"}
            >
              {clause.text}
            </span>
            {index < activePlan.clauses.length - 1 ? " " : ""}
          </span>
        ))}
      </p>

      <div className="vc-caption-telemetry">
        <span>{feedbackMessage}</span>
        {currentClause ? (
          <span className="vc-num">
            {locale === "ko"
              ? `피치 ${currentClause.pitch.toFixed(2)} · 속도 ${currentClause.rate.toFixed(2)}x · 호흡 ${currentClause.pauseMs}ms`
              : `Pitch ${currentClause.pitch.toFixed(2)} · Rate ${currentClause.rate.toFixed(2)}x · Breath ${currentClause.pauseMs}ms`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export interface VoiceCoachEngineSectionProps {
  readonly locale: VoiceCoachLocale;
  readonly speedInputId: string;
  readonly volumeInputId: string;
  readonly speedRate: number;
  readonly volumePercent: number;
  readonly provider: NeuralVoiceProviderId;
  readonly neuralConfig: NeuralVoiceProviderConfig;
  readonly neuralAvailability: NeuralVoiceAvailability;
  readonly onSpeedChange: (nextSpeed: number) => void;
  readonly onVolumeChange: (nextVolumePercent: number) => void;
  readonly onProviderSelect: (nextProvider: NeuralVoiceProviderId) => void;
}

/**
 * 속도/볼륨 슬라이더와 로컬 운율 엔진 · 외부 뉴럴 보이스(Deepgram Flux/Aura-2, Gemini Live,
 * ElevenLabs BYOK) 연동 슬롯 섹션.
 */
export function VoiceCoachEngineSection({
  locale,
  speedInputId,
  volumeInputId,
  speedRate,
  volumePercent,
  provider,
  neuralConfig,
  neuralAvailability,
  onSpeedChange,
  onVolumeChange,
  onProviderSelect,
}: VoiceCoachEngineSectionProps) {
  const bt = useBilingual("StudioVoiceCoachPanel");

  return (
    <div className="vc-section">
      <div className="vc-section-head">
        <h3 className="vc-section-title">
          <Gauge size={16} aria-hidden="true" />
          {bt("속도 · 볼륨 및 뉴럴 보이스 엔진", "Speed, Volume & Neural Voice Engine")}
        </h3>
        <span
          className="vc-badge"
          data-tone={neuralAvailability.usingLocalFallback ? "warn" : "good"}
          data-testid="vc-neural-status-badge"
        >
          <Cpu size={12} aria-hidden="true" />
          {locale === "ko"
            ? neuralAvailability.statusLabelKo
            : neuralAvailability.statusLabelEn}
        </span>
      </div>

      <div className="vc-controls-grid">
        <div className="vc-slider-field">
          <div className="vc-slider-label-row">
            <label htmlFor={speedInputId}>{bt("말하기 속도 배율", "Speaking Speed")}</label>
            <span className="vc-num">{speedRate.toFixed(2)}x</span>
          </div>
          <input
            id={speedInputId}
            type="range"
            min={0.75}
            max={1.3}
            step={0.05}
            value={speedRate}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
            className="vc-slider"
            aria-valuetext={`${speedRate.toFixed(2)}x`}
            data-testid="vc-speed-slider"
          />
        </div>

        <div className="vc-slider-field">
          <div className="vc-slider-label-row">
            <label htmlFor={volumeInputId}>
              {volumePercent === 0 ? (
                <VolumeX size={14} aria-hidden="true" />
              ) : (
                <Volume2 size={14} aria-hidden="true" />
              )}{" "}
              {bt("마스터 볼륨", "Master Volume")}
            </label>
            <span className="vc-num">{volumePercent}%</span>
          </div>
          <input
            id={volumeInputId}
            type="range"
            min={0}
            max={100}
            step={5}
            value={volumePercent}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            className="vc-slider"
            aria-valuetext={`${volumePercent}%`}
            data-testid="vc-volume-slider"
          />
        </div>
      </div>

      <div
        className="vc-provider-grid"
        role="group"
        aria-label={bt("음성 엔진 공급자 선택", "Voice engine provider selection")}
      >
        {NEURAL_VOICE_PROVIDER_IDS.map((providerId) => {
          const entry = NEURAL_VOICE_PROVIDER_CATALOG[providerId];
          const providerAvail = checkNeuralProviderAvailability(
            providerId === provider
              ? neuralConfig
              : createDefaultNeuralProviderConfig(providerId),
          );
          return (
            <button
              key={providerId}
              type="button"
              className="vc-provider-btn"
              aria-pressed={provider === providerId}
              onClick={() => onProviderSelect(providerId)}
              data-testid={`vc-provider-${providerId}`}
            >
              <div className="vc-provider-head">
                <span className="vc-card-title">
                  {locale === "ko" ? entry.labelKo : entry.labelEn}
                </span>
                <span
                  className="vc-badge"
                  data-tone={providerAvail.usingLocalFallback ? "warn" : "good"}
                >
                  {locale === "ko" ? entry.badgeKo : entry.badgeEn}
                </span>
              </div>
              <span className="vc-card-meta">
                {locale === "ko" ? entry.summaryKo : entry.summaryEn}
              </span>
            </button>
          );
        })}
      </div>

      <p className="vc-section-note">
        <BellOff size={13} aria-hidden="true" />{" "}
        {bt(
          "API 키는 코드에 저장하지 않습니다. 외부 뉴럴 슬롯이 미연결 상태여도 로컬 운율 엔진과 어쿠스틱 이어콘으로 끊김 없이 안전하게 폴백합니다.",
          "No API keys are ever stored in client code. Unconfigured neural slots fall back seamlessly to the local prosody engine and acoustic earcons.",
        )}
      </p>
    </div>
  );
}

export interface VoiceCoachMomentsSectionProps {
  readonly locale: VoiceCoachLocale;
  readonly drawingActive: boolean;
  readonly deferredCount: number;
  readonly isExternalDrawingControlled: boolean;
  readonly simulatedDrawing: boolean;
  readonly selectedMoment: VoiceCoachMomentId;
  readonly onToggleSimulatedDrawing: () => void;
  readonly onResetCooldowns: () => void;
  readonly onTriggerMoment: (momentId: VoiceCoachMomentId) => void;
}

/** 10종 스튜디오 상황별 트리거 & 90초 Anti-Nag 쿨다운 · 드로잉 중 연기(Defer) 섹션. */
export function VoiceCoachMomentsSection({
  locale,
  drawingActive,
  deferredCount,
  isExternalDrawingControlled,
  simulatedDrawing,
  selectedMoment,
  onToggleSimulatedDrawing,
  onResetCooldowns,
  onTriggerMoment,
}: VoiceCoachMomentsSectionProps) {
  const bt = useBilingual("StudioVoiceCoachPanel");

  return (
    <div className="vc-section">
      <div className="vc-section-head">
        <h3 className="vc-section-title">
          <ShieldCheck size={16} aria-hidden="true" />
          {bt("상황별 트리거 (10종) · 방해 금지 가드", "10 Studio Moments · Anti-Nag Guard")}
        </h3>
        <span className="vc-badge" data-tone={drawingActive ? "warn" : "good"}>
          {drawingActive
            ? bt(
                `드로잉 중 연기 활성 (대기 ${deferredCount}건)`,
                `Drawing-active defer on (${deferredCount} queued)`,
              )
            : bt("동일 안내 90초 쿨다운 활성", "90s per-moment cooldown active")}
        </span>
      </div>

      <div className="vc-antinag-bar">
        <span>
          {bt(
            "드로잉 액티브 상태에서는 안내를 끊지 않고 큐에 보류한 뒤 획이 끝나면 최우선 1건만 전합니다.",
            "While drawing is active, cues defer cleanly and deliver only the top cue once your stroke finishes.",
          )}
        </span>
        <div className="vc-optin-cluster">
          {!isExternalDrawingControlled ? (
            <button
              type="button"
              className="vc-btn"
              aria-pressed={simulatedDrawing}
              onClick={onToggleSimulatedDrawing}
              data-testid="vc-drawing-defer-toggle"
            >
              <PauseCircle size={14} aria-hidden="true" />
              <span>
                {simulatedDrawing
                  ? bt("드로잉 중 상태 해제", "End Simulated Stroke")
                  : bt("드로잉 중 상태 시뮬레이션", "Simulate Active Drawing")}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className="vc-btn"
            onClick={onResetCooldowns}
            data-testid="vc-reset-cooldown-btn"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{bt("쿨다운 초기화", "Reset Cooldown")}</span>
          </button>
        </div>
      </div>

      <div
        className="vc-moment-grid"
        role="group"
        aria-label={bt("스튜디오 상황별 안내 트리거", "Studio contextual moment triggers")}
      >
        {VOICE_COACH_MOMENT_IDS.map((momentId) => {
          const spec = VOICE_COACH_MOMENT_CATALOG[momentId];
          return (
            <button
              key={momentId}
              type="button"
              className="vc-moment-btn"
              data-active={selectedMoment === momentId ? "true" : "false"}
              onClick={() => onTriggerMoment(momentId)}
              data-testid={`vc-moment-${momentId}`}
            >
              {locale === "ko" ? spec.labelKo : spec.labelEn}
            </button>
          );
        })}
      </div>
    </div>
  );
}
