/**
 * 외부 뉴럴 보이스(Deepgram Flux/Aura-2, Gemini Live, ElevenLabs BYOK) 어댑터 계약 및
 * 어쿠스틱 이어콘 + 실시간 자막(CC) + Web Speech 운율 싱크 재생 컨트롤러.
 *
 * - API 키/토큰 하드코딩 금지: 자격증명이 없으면 네트워크 호출 없이 로컬 운율 엔진으로 안전 폴백한다.
 */

import {
  playCoachAcousticEarcon,
  type EarconPlaybackHandle,
} from "./acoustic-earcon-synth";
import {
  NEURAL_VOICE_PROVIDER_CATALOG,
  VOICE_COACH_PERSONA_PROFILES,
  type ExpressiveProsodyClause,
  type ExpressiveUtterancePlan,
  type NeuralVoiceAdapter,
  type NeuralVoiceAvailability,
  type NeuralVoiceProviderConfig,
  type NeuralVoiceProviderId,
  type NeuralVoiceSynthesisRequest,
  type NeuralVoiceSynthesisResult,
  type VoiceCoachLocale,
  type VoiceCoachOutputMode,
  type VoiceCoachPersona,
} from "./voice-coach-types";

export type NeuralVoiceTransport = (
  request: NeuralVoiceSynthesisRequest,
  plan: ExpressiveUtterancePlan,
  config: NeuralVoiceProviderConfig,
) => Promise<ArrayBuffer | null>;

export type UtterancePlannerFn = (
  text: string,
  persona: VoiceCoachPersona,
  tone: NeuralVoiceSynthesisRequest["tone"],
  options?: { readonly locale?: VoiceCoachLocale; readonly userRate?: number },
) => ExpressiveUtterancePlan;

function isSafeSecureEndpoint(url: string | null): boolean {
  if (!url) return false;
  return url.startsWith("https://") || url.startsWith("wss://");
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function checkNeuralProviderAvailability(
  config: NeuralVoiceProviderConfig,
): NeuralVoiceAvailability {
  if (config.provider === "local-expressive") {
    return Object.freeze({
      provider: "local-expressive",
      status: "ready-local",
      usingLocalFallback: false,
      reasonCode: "local-built-in",
      statusLabelKo: "로컬 운율 엔진 활성 (즉시 사용)",
      statusLabelEn: "Local prosody engine active (ready)",
    });
  }

  if (config.endpointUrl !== null && !isSafeSecureEndpoint(config.endpointUrl)) {
    return Object.freeze({
      provider: config.provider,
      status: config.fallbackToLocal ? "fallback-local" : "misconfigured",
      usingLocalFallback: config.fallbackToLocal,
      reasonCode: "invalid-endpoint",
      statusLabelKo: "보안 엔드포인트 미확인 · 로컬 안전 폴백",
      statusLabelEn: "Unverified endpoint · Local safe fallback",
    });
  }

  if (!config.hasCredential || config.credentialSource === "none") {
    return Object.freeze({
      provider: config.provider,
      status: config.fallbackToLocal ? "fallback-local" : "misconfigured",
      usingLocalFallback: config.fallbackToLocal,
      reasonCode: "missing-credential",
      statusLabelKo: "미연결 · 로컬 운율 엔진 안전 폴백",
      statusLabelEn: "Not connected · Safe local prosody fallback",
    });
  }

  const catalog = NEURAL_VOICE_PROVIDER_CATALOG[config.provider];
  return Object.freeze({
    provider: config.provider,
    status: "ready-neural",
    usingLocalFallback: false,
    reasonCode: "credential-ready",
    statusLabelKo: `${catalog.labelKo} 연동 준비됨`,
    statusLabelEn: `${catalog.labelEn} ready`,
  });
}

export function buildNeuralVoiceAdapter(
  provider: NeuralVoiceProviderId,
  planUtterance: UtterancePlannerFn,
  transport?: NeuralVoiceTransport,
): NeuralVoiceAdapter {
  return {
    id: provider,
    checkAvailability(config: NeuralVoiceProviderConfig): NeuralVoiceAvailability {
      return checkNeuralProviderAvailability({ ...config, provider });
    },
    async synthesize(
      request: NeuralVoiceSynthesisRequest,
      config: NeuralVoiceProviderConfig,
    ): Promise<NeuralVoiceSynthesisResult> {
      const effectiveConfig: NeuralVoiceProviderConfig = { ...config, provider };
      const availability = checkNeuralProviderAvailability(effectiveConfig);
      const plan = planUtterance(request.text, request.persona, request.tone, {
        locale: request.locale,
        userRate: request.userRate,
      });

      if (provider === "local-expressive" || availability.usingLocalFallback || !transport) {
        return Object.freeze({
          resolvedProvider: "local-expressive",
          requestedProvider: provider,
          usedFallback: provider !== "local-expressive",
          availability,
          plan,
          audioBuffer: null,
        });
      }

      try {
        const audioBuffer = await transport(request, plan, effectiveConfig);
        if (audioBuffer) {
          return Object.freeze({
            resolvedProvider: provider,
            requestedProvider: provider,
            usedFallback: false,
            availability,
            plan,
            audioBuffer,
          });
        }
      } catch {
        // 외부 뉴럴 연결 실패 시 사용자 경험을 끊지 않고 로컬 운율 엔진으로 폴백한다.
      }

      return Object.freeze({
        resolvedProvider: "local-expressive",
        requestedProvider: provider,
        usedFallback: true,
        availability: Object.freeze({
          ...availability,
          status: "fallback-local",
          usingLocalFallback: true,
        }),
        plan,
        audioBuffer: null,
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 실시간 자막(CC) + 이어콘 + Web Speech 운율 싱크 오케스트레이터                */
/* -------------------------------------------------------------------------- */

export interface SpeechUtteranceLike {
  text: string;
  lang: string;
  pitch: number;
  rate: number;
  volume: number;
  voice: SpeechSynthesisVoice | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export interface SpeechSynthesisLike {
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
  getVoices?(): readonly SpeechSynthesisVoice[];
}

export interface PlaybackRunOptions {
  readonly outputMode: VoiceCoachOutputMode;
  readonly volume: number;
  readonly earconEnabled: boolean;
  readonly audioContext?: AudioContext | null;
  readonly speechSynthesis?: SpeechSynthesisLike | null;
  readonly createUtterance?: (text: string) => SpeechUtteranceLike;
  readonly onClauseChange?: (clause: ExpressiveProsodyClause, index: number) => void;
  readonly onComplete?: (cancelled: boolean) => void;
}

export interface VoiceCoachPlaybackController {
  readonly playPlan: (
    plan: ExpressiveUtterancePlan,
    options: PlaybackRunOptions,
  ) => { readonly earconHandle: EarconPlaybackHandle; readonly generation: number };
  readonly cancelAll: () => void;
  readonly isPlaying: () => boolean;
}

function resolveBrowserSpeechSynthesis(): SpeechSynthesisLike | null {
  if (typeof globalThis === "undefined") return null;
  const candidate = (globalThis as unknown as { readonly speechSynthesis?: SpeechSynthesisLike })
    .speechSynthesis;
  if (!candidate || typeof candidate.speak !== "function" || typeof candidate.cancel !== "function") {
    return null;
  }
  return candidate;
}

function defaultCreateUtterance(text: string): SpeechUtteranceLike | null {
  if (typeof globalThis === "undefined") return null;
  const Ctor = (
    globalThis as unknown as {
      readonly SpeechSynthesisUtterance?: new (value: string) => SpeechUtteranceLike;
    }
  ).SpeechSynthesisUtterance;
  if (!Ctor) return null;
  try {
    return new Ctor(text);
  } catch {
    return null;
  }
}

function pickPersonaSpeechVoice(
  synthesis: SpeechSynthesisLike,
  persona: VoiceCoachPersona,
  locale: VoiceCoachLocale,
): SpeechSynthesisVoice | null {
  if (typeof synthesis.getVoices !== "function") return null;
  const voices = synthesis.getVoices();
  if (!voices || voices.length === 0) return null;
  const langPrefix = locale === "ko" ? "ko" : "en";
  const localeVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(langPrefix));
  if (localeVoices.length === 0) return null;

  const profile = VOICE_COACH_PERSONA_PROFILES[persona];
  const hints = locale === "ko" ? profile.voiceNameHintsKo : profile.voiceNameHintsEn;
  for (const hint of hints) {
    const matched = localeVoices.find((voice) =>
      voice.name.toLowerCase().includes(hint.toLowerCase()),
    );
    if (matched) return matched;
  }
  return localeVoices[0] ?? null;
}

/**
 * 어쿠스틱 이어콘 프리큐 → 절별 운율 발화(Web Speech) → 실시간 자막(CC) 스텝을 동기화한다.
 * `cancelAll()` 호출 시 모든 타이머·이어콘 오디오 노드·SpeechSynthesis를 즉시 정리한다.
 */
export function createVoiceCoachPlaybackController(): VoiceCoachPlaybackController {
  let generation = 0;
  let playing = false;
  let activeEarcon: EarconPlaybackHandle | null = null;
  let activeSpeech: SpeechSynthesisLike | null = null;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  const clearPendingTimers = (): void => {
    for (const timer of pendingTimers) {
      clearTimeout(timer);
    }
    pendingTimers.clear();
  };

  const cancelAll = (): void => {
    generation += 1;
    playing = false;
    clearPendingTimers();
    if (activeEarcon) {
      activeEarcon.stop();
      activeEarcon = null;
    }
    if (activeSpeech) {
      try {
        activeSpeech.cancel();
      } catch {
        // 무시
      }
      activeSpeech = null;
    }
  };

  const scheduleStep = (delayMs: number, runToken: number, task: () => void): void => {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      if (runToken !== generation) return;
      task();
    }, delayMs);
    pendingTimers.add(timer);
  };

  const playPlan = (
    plan: ExpressiveUtterancePlan,
    options: PlaybackRunOptions,
  ): { readonly earconHandle: EarconPlaybackHandle; readonly generation: number } => {
    cancelAll();
    const runToken = generation;

    const earconHandle = playCoachAcousticEarcon(plan.tone, {
      audioContext: options.audioContext,
      volume: options.volume,
      muted: !options.earconEnabled || options.outputMode === "off",
    });
    activeEarcon = earconHandle;

    if (plan.clauses.length === 0) {
      playing = false;
      options.onComplete?.(false);
      return { earconHandle, generation: runToken };
    }

    playing = true;
    const synthesis =
      options.outputMode === "full-voice"
        ? (options.speechSynthesis !== undefined
            ? options.speechSynthesis
            : resolveBrowserSpeechSynthesis())
        : null;
    activeSpeech = synthesis;

    const preferredVoice = synthesis
      ? pickPersonaSpeechVoice(synthesis, plan.persona, plan.locale)
      : null;

    const stepClause = (clauseIndex: number): void => {
      if (runToken !== generation) return;
      const clause = plan.clauses[clauseIndex];
      if (!clause) {
        playing = false;
        options.onComplete?.(false);
        return;
      }

      options.onClauseChange?.(clause, clauseIndex);

      const proceedNext = (): void => {
        if (runToken !== generation) return;
        const nextIndex = clauseIndex + 1;
        if (nextIndex >= plan.clauses.length) {
          playing = false;
          options.onComplete?.(false);
          return;
        }
        scheduleStep(clause.pauseMs, runToken, () => stepClause(nextIndex));
      };

      if (synthesis) {
        const utterance = options.createUtterance
          ? options.createUtterance(clause.text)
          : defaultCreateUtterance(clause.text);
        if (utterance) {
          utterance.lang = plan.locale === "ko" ? "ko-KR" : "en-US";
          utterance.pitch = clause.pitch;
          utterance.rate = clause.rate;
          utterance.volume = clampUnit(options.volume * clause.gainScale);
          utterance.voice = preferredVoice;
          let finished = false;
          const onFinish = (): void => {
            if (finished) return;
            finished = true;
            utterance.onend = null;
            utterance.onerror = null;
            proceedNext();
          };
          utterance.onend = onFinish;
          utterance.onerror = onFinish;
          try {
            synthesis.speak(utterance);
            return;
          } catch {
            // Web Speech 예외 시 실시간 자막 타이머로 안전 폴백
          }
        }
      }

      scheduleStep(clause.estimatedDurationMs, runToken, proceedNext);
    };

    const earconPreLeadMs = earconHandle.played ? Math.min(260, earconHandle.durationMs) : 0;
    if (earconPreLeadMs > 0) {
      options.onClauseChange?.(plan.clauses[0], 0);
      scheduleStep(earconPreLeadMs, runToken, () => stepClause(0));
    } else {
      stepClause(0);
    }

    return { earconHandle, generation: runToken };
  };

  return {
    playPlan,
    cancelAll,
    isPlaying: () => playing,
  };
}
