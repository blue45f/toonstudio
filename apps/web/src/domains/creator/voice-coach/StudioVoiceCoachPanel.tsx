import "./studio-voice-coach.css";

import { Music2, Play, Sparkles, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  VoiceCoachEngineSection,
  VoiceCoachLiveCaptionBar,
  VoiceCoachMomentsSection,
} from "./StudioVoiceCoachSubsections";
import {
  VoiceCoachCooldownGuard,
  checkNeuralProviderAvailability,
  createVoiceCoachPlaybackController,
  planExpressiveUtterance,
  type CoachTriggerDecisionKind,
  type VoiceCoachPlaybackController,
} from "./expressive-prosody-engine";
import {
  DEFAULT_VOICE_COACH_COOLDOWN_MS,
  VOICE_COACH_EMOTION_TONES,
  VOICE_COACH_MOMENT_CATALOG,
  VOICE_COACH_PERSONAS,
  VOICE_COACH_PERSONA_PROFILES,
  VOICE_COACH_TONE_PROFILES,
  createDefaultNeuralProviderConfig,
  getTonePreviewMomentId,
  getVoiceCoachMomentScript,
  type ExpressiveUtterancePlan,
  type NeuralVoiceProviderConfig,
  type NeuralVoiceProviderId,
  type VoiceCoachEmotionTone,
  type VoiceCoachLocale,
  type VoiceCoachMomentId,
  type VoiceCoachOutputMode,
  type VoiceCoachPersona,
  type VoiceCoachSettings,
} from "./voice-coach-types";

export interface StudioVoiceCoachPanelProps {
  readonly defaultOutputMode?: VoiceCoachOutputMode;
  readonly defaultPersona?: VoiceCoachPersona;
  readonly isCanvasDrawingActive?: boolean;
  readonly externalNeuralConfig?: Partial<NeuralVoiceProviderConfig>;
  readonly audioContext?: AudioContext | null;
  readonly onSettingsChange?: (settings: VoiceCoachSettings) => void;
  readonly className?: string;
}

interface ActiveCaptionSession {
  readonly playing: boolean;
  readonly persona: VoiceCoachPersona;
  readonly tone: VoiceCoachEmotionTone;
  readonly momentId: VoiceCoachMomentId;
  readonly clauseIndex: number;
  readonly earconPlayed: boolean;
  readonly stoppedByUser: boolean;
  readonly isPreview: boolean;
}

interface AntiNagFeedback {
  readonly kind:
    | "idle"
    | "played"
    | "deferred-drawing"
    | "flushed-deferred"
    | "suppressed-cooldown"
    | "suppressed-global-gap"
    | "muted-opt-out"
    | "stopped-by-user"
    | "cooldown-reset";
  readonly momentId?: VoiceCoachMomentId;
  readonly remainingSec?: number;
}

/**
 * 감정·상황 적응형 인터랙티브 스튜디오 음성 코치 패널.
 *
 * - 100% 옵트인(기본 꺼짐 / 이어콘+자막 / 감정 음성+이어콘+자막)
 * - 3종 페르소나 · 5종 감정 톤 미리듣기(마림바/셀레스타 어쿠스틱 이어콘 + 호흡 운율 자막)
 * - 10종 스튜디오 상황 모멘트 · 90초 Anti-Nag 쿨다운 · 드로잉 중 연기(Queue & Defer)
 * - 로컬 운율 엔진 및 외부 뉴럴 보이스(Deepgram Flux/Aura-2, Gemini Live, ElevenLabs) 슬롯 상태
 * - 실시간 접근성 자막(CC) 바(`role="status" aria-live="polite"`) · 속도/볼륨 · `Esc` 즉시 멈춤
 */
export function StudioVoiceCoachPanel({
  defaultOutputMode = "off",
  defaultPersona = "warm-mentor",
  isCanvasDrawingActive,
  externalNeuralConfig,
  audioContext,
  onSettingsChange,
  className,
}: StudioVoiceCoachPanelProps) {
  const lang = useI18n((state) => state.lang);
  const bt = useBilingual("StudioVoiceCoachPanel");
  const locale: VoiceCoachLocale = lang.toLowerCase().startsWith("ko") ? "ko" : "en";

  const speedInputId = useId();
  const volumeInputId = useId();
  const panelTitleId = useId();

  const [outputMode, setOutputMode] = useState<VoiceCoachOutputMode>(defaultOutputMode);
  const [lastActiveMode, setLastActiveMode] = useState<Exclude<VoiceCoachOutputMode, "off">>(
    defaultOutputMode === "full-voice" ? "full-voice" : "earcon-captions",
  );
  const [persona, setPersona] = useState<VoiceCoachPersona>(defaultPersona);
  const [selectedTone, setSelectedTone] = useState<VoiceCoachEmotionTone>("warm-guide");
  const [selectedMoment, setSelectedMoment] = useState<VoiceCoachMomentId>("canvas-welcome");
  const [provider, setProvider] = useState<NeuralVoiceProviderId>(
    externalNeuralConfig?.provider ?? "local-expressive",
  );
  const [speedRate, setSpeedRate] = useState<number>(1.0);
  const [volumePercent, setVolumePercent] = useState<number>(70);
  const [earconEnabled, setEarconEnabled] = useState<boolean>(true);
  const [simulatedDrawing, setSimulatedDrawing] = useState<boolean>(false);
  const [deferredCount, setDeferredCount] = useState<number>(0);
  const [feedback, setFeedback] = useState<AntiNagFeedback>({ kind: "idle" });
  const [captionSession, setCaptionSession] = useState<ActiveCaptionSession>({
    playing: false,
    persona: defaultPersona,
    tone: "warm-guide",
    momentId: "canvas-welcome",
    clauseIndex: 0,
    earconPlayed: false,
    stoppedByUser: false,
    isPreview: false,
  });

  const drawingActive = isCanvasDrawingActive ?? simulatedDrawing;
  const volume = volumePercent / 100;

  const cooldownGuardRef = useRef<VoiceCoachCooldownGuard | null>(null);
  const playbackRef = useRef<VoiceCoachPlaybackController | null>(null);

  const getCooldownGuard = useCallback((): VoiceCoachCooldownGuard => {
    if (!cooldownGuardRef.current) {
      cooldownGuardRef.current = new VoiceCoachCooldownGuard({
        defaultCooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
      });
    }
    return cooldownGuardRef.current;
  }, []);

  const getPlaybackController = useCallback((): VoiceCoachPlaybackController => {
    if (!playbackRef.current) {
      playbackRef.current = createVoiceCoachPlaybackController();
    }
    return playbackRef.current;
  }, []);

  const neuralConfig: NeuralVoiceProviderConfig = useMemo(() => {
    const base = createDefaultNeuralProviderConfig(provider);
    if (externalNeuralConfig && externalNeuralConfig.provider === provider) {
      return { ...base, ...externalNeuralConfig, provider };
    }
    return base;
  }, [provider, externalNeuralConfig]);

  const neuralAvailability = useMemo(
    () => checkNeuralProviderAvailability(neuralConfig),
    [neuralConfig],
  );

  const activePlan: ExpressiveUtterancePlan = useMemo(() => {
    const script = getVoiceCoachMomentScript(
      captionSession.momentId,
      captionSession.persona,
      locale,
    );
    return planExpressiveUtterance(script, captionSession.persona, captionSession.tone, {
      locale,
      userRate: speedRate,
    });
  }, [captionSession.momentId, captionSession.persona, captionSession.tone, locale, speedRate]);

  const currentClause =
    activePlan.clauses[captionSession.clauseIndex] ?? activePlan.clauses[0] ?? null;

  const stopAllPlayback = useCallback(
    (announceStop: boolean) => {
      getCooldownGuard().cancelAll();
      getPlaybackController().cancelAll();
      setDeferredCount(0);
      setCaptionSession((prev) => ({
        ...prev,
        playing: false,
        stoppedByUser: announceStop,
      }));
      if (announceStop) {
        setFeedback({ kind: "stopped-by-user" });
      }
    },
    [getCooldownGuard, getPlaybackController],
  );

  const runUtterance = useCallback(
    (
      momentId: VoiceCoachMomentId,
      tone: VoiceCoachEmotionTone,
      targetPersona: VoiceCoachPersona,
      runMode: VoiceCoachOutputMode,
      isPreview: boolean,
    ) => {
      const script = getVoiceCoachMomentScript(momentId, targetPersona, locale);
      const plan = planExpressiveUtterance(script, targetPersona, tone, {
        locale,
        userRate: speedRate,
      });

      const { earconHandle } = getPlaybackController().playPlan(plan, {
        outputMode: runMode,
        volume,
        earconEnabled,
        audioContext,
        onClauseChange: (_clause, clauseIndex) => {
          setCaptionSession((prev) => ({
            ...prev,
            playing: true,
            clauseIndex,
          }));
        },
        onComplete: () => {
          setCaptionSession((prev) => ({
            ...prev,
            playing: false,
          }));
        },
      });

      setSelectedTone(tone);
      setSelectedMoment(momentId);
      setCaptionSession({
        playing: plan.clauses.length > 0,
        persona: targetPersona,
        tone,
        momentId,
        clauseIndex: 0,
        earconPlayed: earconHandle.played,
        stoppedByUser: false,
        isPreview,
      });
    },
    [audioContext, earconEnabled, getPlaybackController, locale, speedRate, volume],
  );

  // 쿨다운 가드 취소 훅 등록 및 언마운트 시 오디오·타이머 누수 0건 정리
  useEffect(() => {
    const guard = getCooldownGuard();
    const playback = getPlaybackController();
    const unregister = guard.registerCancelHook(() => {
      playback.cancelAll();
    });
    return () => {
      unregister();
      playback.cancelAll();
      guard.cancelAll();
    };
  }, [getCooldownGuard, getPlaybackController]);

  // 드로잉 액티브 상태 동기화 → 획 종료 시 연기 큐 최우선 1건 자동 전달
  useEffect(() => {
    const guard = getCooldownGuard();
    guard.setDrawingActive(drawingActive);
    if (!drawingActive && outputMode !== "off") {
      const nextDeferred = guard.flushNextDeferred();
      setDeferredCount(guard.peekDeferred().length);
      if (nextDeferred) {
        runUtterance(nextDeferred.momentId, nextDeferred.tone, persona, outputMode, false);
        setFeedback({ kind: "flushed-deferred", momentId: nextDeferred.momentId });
      }
    }
  }, [drawingActive, getCooldownGuard, outputMode, persona, runUtterance]);

  // Esc 키 즉시 멈춤 지원
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!captionSession.playing && deferredCount === 0) return;
      stopAllPlayback(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [captionSession.playing, deferredCount, stopAllPlayback]);

  // 호스트 설정 콜백 동기화
  useEffect(() => {
    onSettingsChange?.({
      outputMode,
      persona,
      provider,
      speedRate,
      volume,
      earconEnabled,
      cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    });
  }, [earconEnabled, onSettingsChange, outputMode, persona, provider, speedRate, volume]);

  const handleToggleMasterOptIn = () => {
    if (outputMode === "off") {
      setOutputMode(lastActiveMode);
      setFeedback({ kind: "idle" });
    } else {
      setOutputMode("off");
      stopAllPlayback(false);
    }
  };

  const handleSelectOutputMode = (nextMode: VoiceCoachOutputMode) => {
    setOutputMode(nextMode);
    if (nextMode === "off") {
      stopAllPlayback(false);
    } else {
      setLastActiveMode(nextMode);
      setFeedback({ kind: "idle" });
    }
  };

  const handleSelectPersona = (nextPersona: VoiceCoachPersona) => {
    setPersona(nextPersona);
    setCaptionSession((prev) => ({ ...prev, persona: nextPersona }));
  };

  const handlePreviewTone = (tone: VoiceCoachEmotionTone) => {
    const previewMoment = getTonePreviewMomentId(tone);
    const previewMode: VoiceCoachOutputMode =
      outputMode === "full-voice" ? "full-voice" : "earcon-captions";
    runUtterance(previewMoment, tone, persona, previewMode, true);
    setFeedback({ kind: "played", momentId: previewMoment });
  };

  const handleTriggerMoment = (momentId: VoiceCoachMomentId) => {
    const guard = getCooldownGuard();
    const spec = VOICE_COACH_MOMENT_CATALOG[momentId];
    const result = guard.requestMoment(momentId, {
      outputMode,
      tone: spec.defaultTone,
    });
    setDeferredCount(result.deferredQueueLength);

    const applyDecision = (decision: CoachTriggerDecisionKind) => {
      if (decision === "allow") {
        runUtterance(momentId, result.tone, persona, outputMode, false);
        setFeedback({ kind: "played", momentId });
      } else if (decision === "deferred-drawing") {
        setFeedback({ kind: "deferred-drawing", momentId });
      } else if (decision === "suppressed-cooldown") {
        setFeedback({
          kind: "suppressed-cooldown",
          momentId,
          remainingSec: Math.max(1, Math.ceil(result.remainingCooldownMs / 1000)),
        });
      } else if (decision === "suppressed-global-gap") {
        setFeedback({
          kind: "suppressed-global-gap",
          momentId,
          remainingSec: Math.max(1, Math.ceil(result.remainingCooldownMs / 1000)),
        });
      } else {
        setFeedback({ kind: "muted-opt-out", momentId });
      }
    };

    applyDecision(result.decision);
  };

  const handleResetCooldowns = () => {
    getCooldownGuard().resetCooldowns();
    setDeferredCount(0);
    setFeedback({ kind: "cooldown-reset" });
  };

  const isOptedIn = outputMode !== "off";

  const feedbackMessage = useMemo((): string => {
    const momentLabel = feedback.momentId
      ? locale === "ko"
        ? VOICE_COACH_MOMENT_CATALOG[feedback.momentId].labelKo
        : VOICE_COACH_MOMENT_CATALOG[feedback.momentId].labelEn
      : "";

    switch (feedback.kind) {
      case "played":
        return locale === "ko"
          ? `'${momentLabel}' 감정 운율 가이드를 재생 중입니다.`
          : `Playing expressive guide for "${momentLabel}".`;
      case "deferred-drawing":
        return locale === "ko"
          ? `드로잉 집중 중이라 '${momentLabel}' 안내를 연기했습니다. 획이 끝나면 조용히 전합니다.`
          : `Deferred "${momentLabel}" while drawing is active. It will play gently after your stroke.`;
      case "flushed-deferred":
        return locale === "ko"
          ? `드로잉이 끝나 대기 중이던 '${momentLabel}' 안내를 전달했습니다.`
          : `Stroke finished—delivered deferred cue "${momentLabel}".`;
      case "suppressed-cooldown":
        return locale === "ko"
          ? `방해 금지 쿨다운 적용 중('${momentLabel}' 약 ${feedback.remainingSec ?? 1}초 남음).`
          : `Anti-nag cooldown active for "${momentLabel}" (${feedback.remainingSec ?? 1}s left).`;
      case "suppressed-global-gap":
        return locale === "ko"
          ? `연속 발화 억제 간격(${feedback.remainingSec ?? 1}초)으로 잠시 건너뛰었습니다.`
          : `Skipped briefly to keep calm spacing (${feedback.remainingSec ?? 1}s gap).`;
      case "muted-opt-out":
        return locale === "ko"
          ? "현재 코치가 꺼져 있습니다. 상단 옵트인 스위치를 켜거나 아래 감정 톤 미리듣기를 눌러 보세요."
          : "Voice coach is opted out. Turn on the opt-in switch above or audition an emotion tone below.";
      case "stopped-by-user":
        return locale === "ko"
          ? "모든 음성과 어쿠스틱 이어콘을 즉시 멈췄습니다."
          : "Stopped all voice playback and acoustic earcons immediately.";
      case "cooldown-reset":
        return locale === "ko"
          ? "방해 금지 쿨다운 기록을 초기화했습니다."
          : "Reset anti-nag cooldown history.";
      case "idle":
      default:
        return locale === "ko"
          ? "필요한 순간에만 부드럽게 안내합니다. 아래 감정 톤을 눌러 운율과 이어콘을 미리 들어 보세요."
          : "Guides only when helpful. Tap an emotion tone below to audition acoustic earcons and prosody.";
    }
  }, [feedback, locale]);

  return (
    <section
      className={className ? `vc-shell ${className}` : "vc-shell"}
      aria-labelledby={panelTitleId}
      data-testid="studio-voice-coach-panel"
    >
      <div className="vc-body">
        <header className="vc-header">
          <div className="vc-header-copy">
            <span className="vc-kicker">
              <Sparkles size={14} aria-hidden="true" />
              {bt("아틀리에 감정 음성 코치", "Atelier Expressive Voice Coach")}
            </span>
            <h2 id={panelTitleId} className="vc-title">
              {bt(
                "호흡과 감정선을 담은 적응형 스튜디오 가이드",
                "Emotion-Aware Adaptive Studio Guide",
              )}
            </h2>
            <p className="vc-subtitle">
              {bt(
                "딱딱한 기계 음성 대신 호흡 절 분할 운율, 마림바·셀레스타 어쿠스틱 이어콘, 실시간 자막으로 필요한 순간만 조용히 함께합니다.",
                "Replaces flat mechanical TTS with breathing-clause prosody, marimba & celesta earcons, and live captions—100% opt-in.",
              )}
            </p>
          </div>

          <div className="vc-optin-cluster">
            <button
              type="button"
              role="switch"
              aria-checked={isOptedIn}
              className="vc-switch-btn"
              onClick={handleToggleMasterOptIn}
              data-testid="vc-optin-switch"
            >
              <span className="vc-switch-track" aria-hidden="true">
                <span className="vc-switch-thumb" />
              </span>
              <span>
                {isOptedIn
                  ? bt("음성 코치 켜짐", "Voice Coach On")
                  : bt("음성 코치 꺼짐 (옵트인)", "Voice Coach Off (Opt-in)")}
              </span>
            </button>

            <button
              type="button"
              className="vc-btn vc-stop-btn"
              onClick={() => stopAllPlayback(true)}
              disabled={!captionSession.playing && deferredCount === 0}
              aria-label={bt("즉시 멈춤 (Esc)", "Stop immediately (Esc)")}
              data-testid="vc-stop-btn"
            >
              <Square size={14} aria-hidden="true" />
              <span>{bt("즉시 멈춤 (Esc)", "Stop (Esc)")}</span>
            </button>
          </div>
        </header>

        <VoiceCoachLiveCaptionBar
          locale={locale}
          playing={captionSession.playing}
          persona={captionSession.persona}
          tone={captionSession.tone}
          clauseIndex={captionSession.clauseIndex}
          earconPlayed={captionSession.earconPlayed}
          activePlan={activePlan}
          currentClause={currentClause}
          feedbackMessage={feedbackMessage}
        />

        <div className="vc-section">
          <div className="vc-section-head">
            <h3 className="vc-section-title">
              <Volume2 size={16} aria-hidden="true" />
              {bt("출력 모드 선택 (100% 옵트인)", "Output Mode (100% Opt-in)")}
            </h3>
            <button
              type="button"
              className="vc-btn"
              aria-pressed={earconEnabled}
              onClick={() => setEarconEnabled((prev) => !prev)}
            >
              <Music2 size={14} aria-hidden="true" />
              <span>
                {earconEnabled
                  ? bt("어쿠스틱 이어콘 켜짐", "Acoustic Earcon On")
                  : bt("어쿠스틱 이어콘 꺼짐", "Acoustic Earcon Off")}
              </span>
            </button>
          </div>

          <div className="vc-mode-grid" role="group" aria-label={bt("출력 모드", "Output mode")}>
            <button
              type="button"
              className="vc-mode-btn"
              aria-pressed={outputMode === "off"}
              onClick={() => handleSelectOutputMode("off")}
              data-testid="vc-mode-off"
            >
              <span className="vc-card-title">{bt("꺼짐 (무음 작업)", "Off (Silent)")}</span>
              <span className="vc-card-meta">
                {bt(
                  "자동 안내와 효과음을 완전히 끕니다.",
                  "All automatic cues and chimes stay off.",
                )}
              </span>
            </button>

            <button
              type="button"
              className="vc-mode-btn"
              aria-pressed={outputMode === "earcon-captions"}
              onClick={() => handleSelectOutputMode("earcon-captions")}
              data-testid="vc-mode-earcon-captions"
            >
              <span className="vc-card-title">{bt("이어콘 + 자막", "Earcon + Captions")}</span>
              <span className="vc-card-meta">
                {bt(
                  "부드러운 마림바/셀레스타 화음과 실시간 자막만 조용히 표시합니다.",
                  "Gentle marimba/celesta chimes paired with live CC, without spoken audio.",
                )}
              </span>
            </button>

            <button
              type="button"
              className="vc-mode-btn"
              aria-pressed={outputMode === "full-voice"}
              onClick={() => handleSelectOutputMode("full-voice")}
              data-testid="vc-mode-full-voice"
            >
              <span className="vc-card-title">
                {bt("감정 음성 + 이어콘 + 자막", "Expressive Voice + Earcon + CC")}
              </span>
              <span className="vc-card-meta">
                {bt(
                  "어쿠스틱 이어콘 프리큐 뒤 호흡 운율 음성과 자막을 함께 재생합니다.",
                  "Plays an acoustic earcon pre-cue followed by expressive prosody speech and live CC.",
                )}
              </span>
            </button>
          </div>
        </div>

        <div className="vc-section">
          <div className="vc-section-head">
            <h3 className="vc-section-title">
              <Sparkles size={16} aria-hidden="true" />
              {bt("코치 페르소나 (3종)", "Coach Persona (3 Styles)")}
            </h3>
            <span className="vc-badge" data-tone="cool">
              {locale === "ko"
                ? VOICE_COACH_PERSONA_PROFILES[persona].cadenceHintKo
                : VOICE_COACH_PERSONA_PROFILES[persona].cadenceHintEn}
            </span>
          </div>

          <div
            className="vc-persona-grid"
            role="group"
            aria-label={bt("코치 페르소나 선택", "Select coach persona")}
          >
            {VOICE_COACH_PERSONAS.map((personaId) => {
              const profile = VOICE_COACH_PERSONA_PROFILES[personaId];
              return (
                <button
                  key={personaId}
                  type="button"
                  className="vc-persona-btn"
                  aria-pressed={persona === personaId}
                  onClick={() => handleSelectPersona(personaId)}
                  data-testid={`vc-persona-${personaId}`}
                >
                  <span className="vc-card-title">
                    {locale === "ko" ? profile.labelKo : profile.labelEn}
                  </span>
                  <span className="vc-badge" data-tone="good">
                    {locale === "ko" ? profile.roleTagKo : profile.roleTagEn}
                  </span>
                  <span className="vc-card-meta">
                    {locale === "ko" ? profile.descriptionKo : profile.descriptionEn}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="vc-section">
          <div className="vc-section-head">
            <h3 className="vc-section-title">
              <Play size={16} aria-hidden="true" />
              {bt(
                "5종 감정 톤 미리듣기 (이어콘 + 운율 자막)",
                "5 Emotion Tone Previews (Earcon + Prosody CC)",
              )}
            </h3>
            <span className="vc-card-meta vc-num">
              {locale === "ko"
                ? `총 호흡 휴지 ${activePlan.totalPauseMs}ms · 평균 피치 ${activePlan.averagePitch.toFixed(2)}`
                : `Total breath ${activePlan.totalPauseMs}ms · Avg pitch ${activePlan.averagePitch.toFixed(2)}`}
            </span>
          </div>

          <div
            className="vc-tone-grid"
            role="group"
            aria-label={bt("감정 톤 미리듣기", "Emotion tone previews")}
          >
            {VOICE_COACH_EMOTION_TONES.map((toneId) => {
              const toneProfile = VOICE_COACH_TONE_PROFILES[toneId];
              return (
                <button
                  key={toneId}
                  type="button"
                  className="vc-tone-btn"
                  data-tone={toneProfile.semanticTone}
                  data-active={selectedTone === toneId ? "true" : "false"}
                  onClick={() => handlePreviewTone(toneId)}
                  data-testid={`vc-tone-${toneId}`}
                >
                  <span className="vc-card-title">
                    {locale === "ko" ? toneProfile.labelKo : toneProfile.labelEn}
                  </span>
                  <span className="vc-card-meta">
                    {locale === "ko" ? toneProfile.feelingKo : toneProfile.feelingEn}
                  </span>
                  <span className="vc-badge" data-tone={toneProfile.semanticTone}>
                    <Music2 size={12} aria-hidden="true" />
                    {locale === "ko" ? toneProfile.earconLabelKo : toneProfile.earconLabelEn}
                  </span>
                </button>
              );
            })}
          </div>

          <ul
            className="vc-prosody-list"
            aria-label={bt("호흡 절 운율 분할 미리보기", "Breathing clause prosody breakdown")}
          >
            {activePlan.clauses.map((clause) => (
              <li
                key={clause.index}
                className="vc-prosody-item"
                data-current={
                  captionSession.playing && clause.index === captionSession.clauseIndex
                    ? "true"
                    : "false"
                }
              >
                <span>{clause.text}</span>
                <span className="vc-card-meta vc-num">
                  {locale === "ko"
                    ? `피치 ${clause.pitch.toFixed(2)} · 속도 ${clause.rate.toFixed(2)}x · 휴지 ${clause.pauseMs}ms`
                    : `Pitch ${clause.pitch.toFixed(2)} · Rate ${clause.rate.toFixed(2)}x · Pause ${clause.pauseMs}ms`}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <VoiceCoachMomentsSection
          locale={locale}
          drawingActive={drawingActive}
          deferredCount={deferredCount}
          isExternalDrawingControlled={isCanvasDrawingActive !== undefined}
          simulatedDrawing={simulatedDrawing}
          selectedMoment={selectedMoment}
          onToggleSimulatedDrawing={() => setSimulatedDrawing((prev) => !prev)}
          onResetCooldowns={handleResetCooldowns}
          onTriggerMoment={handleTriggerMoment}
        />

        <VoiceCoachEngineSection
          locale={locale}
          speedInputId={speedInputId}
          volumeInputId={volumeInputId}
          speedRate={speedRate}
          volumePercent={volumePercent}
          provider={provider}
          neuralConfig={neuralConfig}
          neuralAvailability={neuralAvailability}
          onSpeedChange={setSpeedRate}
          onVolumeChange={setVolumePercent}
          onProviderSelect={setProvider}
        />
      </div>
    </section>
  );
}
