/**
 * 감정·상황 적응형 인터랙티브 스튜디오 음성 코치 핵심 엔진.
 *
 * - 운율/호흡 분할 플래너 (`planExpressiveUtterance`):
 *   한국어/영어 문장을 자연스러운 호흡 절(Clause)로 나누고 절별 미세 휴지(`pauseMs`)·
 *   피치 곡선(`pitch`)·속도(`rate`)·감정 억양을 산출한다.
 * - 방해 금지(Anti-Nag) 쿨다운 & 드로잉 액티브 연기 스케줄러 (`VoiceCoachCooldownGuard`):
 *   동일 상황 재안내를 기본 90초 억제하고, 드로잉 중 도착한 안내는 큐에 연기했다가 획 종료 후
 *   최우선 1건만 차분히 전달한다. `cancelAll()` 호출 시 모든 예약과 재생을 즉시 중단한다.
 * - 어쿠스틱 이어콘(`acoustic-earcon-synth.ts`) 및 외부 뉴럴 어댑터(`neural-voice-adapters.ts`)를
 *   단일 진입점으로 재노출한다.
 */

import {
  buildNeuralVoiceAdapter,
  type NeuralVoiceTransport,
} from "./neural-voice-adapters";
import {
  DEFAULT_MIN_GLOBAL_INTERVAL_MS,
  DEFAULT_VOICE_COACH_COOLDOWN_MS,
  VOICE_COACH_MOMENT_CATALOG,
  VOICE_COACH_PERSONA_PROFILES,
  VOICE_COACH_TONE_PROFILES,
  type ExpressiveProsodyClause,
  type ExpressiveUtterancePlan,
  type NeuralVoiceAdapter,
  type NeuralVoiceProviderConfig,
  type NeuralVoiceProviderId,
  type NeuralVoiceSynthesisRequest,
  type NeuralVoiceSynthesisResult,
  type ProsodyClauseEmphasis,
  type ProsodyClausePunctuation,
  type VoiceCoachEmotionTone,
  type VoiceCoachLocale,
  type VoiceCoachMomentId,
  type VoiceCoachMomentPriority,
  type VoiceCoachOutputMode,
  type VoiceCoachPersona,
} from "./voice-coach-types";

export {
  EARCON_CHORD_PROFILES,
  playCoachAcousticEarcon,
  type AcousticEarconNote,
  type AcousticEarconRecipe,
  type EarconPlayReason,
  type EarconPlaybackHandle,
  type PlayEarconOptions,
} from "./acoustic-earcon-synth";

export {
  checkNeuralProviderAvailability,
  createVoiceCoachPlaybackController,
  type NeuralVoiceTransport,
  type PlaybackRunOptions,
  type SpeechSynthesisLike,
  type SpeechUtteranceLike,
  type VoiceCoachPlaybackController,
} from "./neural-voice-adapters";

/* -------------------------------------------------------------------------- */
/* 1. 감정·호흡 운율 분할 엔진 (Expressive Prosody Planner)                     */
/* -------------------------------------------------------------------------- */

export interface PlanUtteranceOptions {
  readonly locale?: VoiceCoachLocale;
  readonly userRate?: number;
}

const HANGUL_DETECT_REGEX = /[가-힣ㄱ-ㅎㅏ-ㅣ]/u;
const PUNCTUATION_SPLIT_REGEX = /([^.!?…,;:—·]+[.!?…,;:—·]*)/gu;
const KO_BREATH_CONNECTIVES = [
  "그리고 ",
  "하지만 ",
  "그래서 ",
  "그런데 ",
  "고 ",
  "면 ",
  "지만 ",
  "니까 ",
  "으니 ",
  "서 ",
] as const;
const EN_BREATH_CONNECTIVES = [
  " and ",
  " but ",
  " while ",
  " so ",
  " because ",
  " when ",
  " before ",
] as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function detectUtteranceLocale(text: string, explicit?: VoiceCoachLocale): VoiceCoachLocale {
  if (explicit) return explicit;
  return HANGUL_DETECT_REGEX.test(text) ? "ko" : "en";
}

function classifyPunctuation(segment: string): ProsodyClausePunctuation {
  const trimmed = segment.trimEnd();
  if (trimmed.endsWith("...") || trimmed.endsWith("…")) return "ellipsis";
  if (trimmed.endsWith("?")) return "question";
  if (trimmed.endsWith("!")) return "exclamation";
  if (trimmed.endsWith(".")) return "period";
  if (
    trimmed.endsWith(",") ||
    trimmed.endsWith(";") ||
    trimmed.endsWith(":") ||
    trimmed.endsWith("—") ||
    trimmed.endsWith("·")
  ) {
    return "comma";
  }
  return "none";
}

function splitLongClauseAtBreath(
  segment: string,
  locale: VoiceCoachLocale,
): readonly { readonly text: string; readonly syntheticBreath: boolean }[] {
  const maxSpan = locale === "ko" ? 34 : 58;
  const trimmed = segment.trim();
  if (trimmed.length <= maxSpan) {
    return [{ text: trimmed, syntheticBreath: false }];
  }

  const connectives = locale === "ko" ? KO_BREATH_CONNECTIVES : EN_BREATH_CONNECTIVES;
  const midpoint = Math.floor(trimmed.length * 0.5);
  let bestSplitIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const token of connectives) {
    let searchFrom = Math.max(6, Math.floor(trimmed.length * 0.25));
    const upperBound = Math.floor(trimmed.length * 0.78);
    while (searchFrom < upperBound) {
      const idx = trimmed.indexOf(token, searchFrom);
      if (idx === -1 || idx >= upperBound) break;
      const splitAt = locale === "ko" ? idx + token.length : idx;
      const dist = Math.abs(splitAt - midpoint);
      if (dist < bestDistance && splitAt >= 8 && trimmed.length - splitAt >= 8) {
        bestDistance = dist;
        bestSplitIndex = splitAt;
      }
      searchFrom = idx + token.length;
    }
  }

  if (bestSplitIndex === -1) {
    return [{ text: trimmed, syntheticBreath: false }];
  }

  const left = trimmed.slice(0, bestSplitIndex).trim();
  const right = trimmed.slice(bestSplitIndex).trim();
  if (!left || !right) {
    return [{ text: trimmed, syntheticBreath: false }];
  }
  return [
    { text: left, syntheticBreath: true },
    { text: right, syntheticBreath: false },
  ];
}

function splitIntoBreathClauses(
  rawText: string,
  locale: VoiceCoachLocale,
): readonly { readonly text: string; readonly punctuation: ProsodyClausePunctuation }[] {
  const normalized = rawText.replace(/\s+/gu, " ").trim();
  if (!normalized) return [];

  const initialMatches = normalized.match(PUNCTUATION_SPLIT_REGEX) ?? [normalized];
  const expanded: { text: string; punctuation: ProsodyClausePunctuation }[] = [];

  for (const match of initialMatches) {
    const trimmed = match.trim();
    if (!trimmed) continue;
    const pieces = splitLongClauseAtBreath(trimmed, locale);
    for (const piece of pieces) {
      const punctuation = piece.syntheticBreath ? "breath" : classifyPunctuation(piece.text);
      expanded.push({ text: piece.text, punctuation });
    }
  }

  // 지나치게 짧은 파편 절은 인접 절과 합쳐 어색한 끊김을 방지한다.
  const minFragmentChars = locale === "ko" ? 4 : 7;
  const merged: { text: string; punctuation: ProsodyClausePunctuation }[] = [];
  for (const item of expanded) {
    const bareLength = item.text.replace(/[.!?…,;:—·\s]/gu, "").length;
    const prev = merged.at(-1);
    const prevTerminal =
      prev !== undefined &&
      (prev.punctuation === "period" ||
        prev.punctuation === "exclamation" ||
        prev.punctuation === "question");

    if (prev && !prevTerminal && bareLength < minFragmentChars) {
      merged[merged.length - 1] = {
        text: `${prev.text} ${item.text}`.trim(),
        punctuation: item.punctuation,
      };
    } else {
      merged.push(item);
    }
  }

  return merged;
}

function computeContourOffset(
  tone: VoiceCoachEmotionTone,
  progress: number,
  totalClauses: number,
): number {
  const contour = VOICE_COACH_TONE_PROFILES[tone].contourType;
  if (totalClauses <= 1) {
    switch (contour) {
      case "bright-lift":
        return 0.035;
      case "curious-rise":
        return 0.025;
      case "level-settle":
        return -0.015;
      case "soft-dip":
        return -0.02;
      case "warm-arch":
        return 0.01;
    }
  }

  switch (contour) {
    case "warm-arch":
      return Math.sin(progress * Math.PI) * 0.055 - progress * 0.022;
    case "level-settle":
      return 0.008 - progress * 0.036;
    case "bright-lift":
      return 0.018 + Math.sin(progress * Math.PI * 0.85) * 0.052;
    case "soft-dip":
      return 0.012 - progress * 0.044;
    case "curious-rise":
      return -0.01 + progress * 0.064;
  }
}

function computePunctuationPauseBaseMs(punctuation: ProsodyClausePunctuation): number {
  switch (punctuation) {
    case "ellipsis":
      return 360;
    case "period":
      return 310;
    case "question":
      return 290;
    case "exclamation":
      return 270;
    case "comma":
      return 185;
    case "breath":
      return 140;
    case "none":
      return 110;
  }
}

function computeClauseEmphasis(
  tone: VoiceCoachEmotionTone,
  punctuation: ProsodyClausePunctuation,
  isLast: boolean,
): ProsodyClauseEmphasis {
  if (punctuation === "exclamation") return "bright";
  if (punctuation === "question" || tone === "creative-spark") return "warm-lift";
  if (tone === "celebrate") return isLast ? "warm-lift" : "bright";
  if (tone === "calm-focus" || tone === "gentle-alert" || punctuation === "ellipsis") {
    return "soft";
  }
  return isLast ? "soft" : "normal";
}

function normalizePlainTextForFlux(text: string): string {
  return text
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * 한국어/영어 텍스트를 감정·페르소나·호흡이 살아 있는 절(Clause) 단위 운율 계획으로 변환한다.
 */
export function planExpressiveUtterance(
  text: string,
  persona: VoiceCoachPersona,
  tone: VoiceCoachEmotionTone,
  options: PlanUtteranceOptions = {},
): ExpressiveUtterancePlan {
  const locale = detectUtteranceLocale(text, options.locale);
  const userRate = clamp(options.userRate ?? 1.0, 0.7, 1.35);
  const personaProfile = VOICE_COACH_PERSONA_PROFILES[persona];
  const toneProfile = VOICE_COACH_TONE_PROFILES[tone];
  const plainTextForFlux = normalizePlainTextForFlux(text);
  const rawClauses = splitIntoBreathClauses(text, locale);

  if (rawClauses.length === 0) {
    return Object.freeze({
      rawText: text,
      persona,
      tone,
      locale,
      clauses: Object.freeze([]),
      totalEstimatedDurationMs: 0,
      totalPauseMs: 0,
      averagePitch: personaProfile.basePitch,
      averageRate: roundTo(
        clamp(personaProfile.baseRate * toneProfile.rateMultiplier * userRate, 0.65, 1.45),
        3,
      ),
      emotionDirective: `${personaProfile.labelEn}: ${toneProfile.emotionDirectiveEn}`,
      plainTextForFlux,
    });
  }

  const totalClauses = rawClauses.length;
  const clauses: ExpressiveProsodyClause[] = [];
  let cursorMs = 0;
  let pitchSum = 0;
  let rateSum = 0;
  let totalPauseMs = 0;

  for (let index = 0; index < totalClauses; index += 1) {
    const item = rawClauses[index];
    const isLast = index === totalClauses - 1;
    const progress = totalClauses === 1 ? 0.5 : index / (totalClauses - 1);

    const contourDelta =
      computeContourOffset(tone, progress, totalClauses) * personaProfile.pitchRangeScale;
    let punctuationPitchDelta = 0;
    if (item.punctuation === "question") punctuationPitchDelta = 0.075;
    else if (item.punctuation === "exclamation") punctuationPitchDelta = 0.045;
    else if (item.punctuation === "ellipsis") punctuationPitchDelta = -0.02;
    else if (isLast && item.punctuation === "period") punctuationPitchDelta = -0.03;

    const pitch = roundTo(
      clamp(
        personaProfile.basePitch + toneProfile.pitchShift + contourDelta + punctuationPitchDelta,
        0.72,
        1.38,
      ),
      3,
    );

    let positionalRateFactor = 1.0;
    if (index === 0 && totalClauses > 1) positionalRateFactor = 0.99;
    else if (isLast && totalClauses > 1) positionalRateFactor = 0.95;
    else if (index > 0 && !isLast) positionalRateFactor = 1.02;

    if (item.punctuation === "exclamation") positionalRateFactor *= 1.03;
    else if (item.punctuation === "ellipsis") positionalRateFactor *= 0.92;

    const rate = roundTo(
      clamp(
        personaProfile.baseRate * toneProfile.rateMultiplier * userRate * positionalRateFactor,
        0.65,
        1.45,
      ),
      3,
    );

    const rawPause = isLast
      ? 0
      : computePunctuationPauseBaseMs(item.punctuation) *
        personaProfile.pauseScale *
        toneProfile.pauseMultiplier;
    const pauseMs = isLast ? 0 : Math.round(clamp(rawPause, 80, 560) / 5) * 5;

    const emphasis = computeClauseEmphasis(tone, item.punctuation, isLast);
    const emphasisGainDelta =
      emphasis === "bright"
        ? 0.06
        : emphasis === "warm-lift"
          ? 0.03
          : emphasis === "soft"
            ? -0.06
            : 0;
    const gainScale = roundTo(clamp(toneProfile.energyGain + emphasisGainDelta, 0.78, 1.12), 3);

    const msPerChar = locale === "ko" ? 96 : 54;
    const contentChars = Math.max(4, item.text.replace(/\s+/gu, "").length);
    const estimatedDurationMs = Math.max(420, Math.round((contentChars * msPerChar) / rate));

    clauses.push(
      Object.freeze({
        index,
        text: item.text,
        punctuation: item.punctuation,
        pitch,
        rate,
        pauseMs,
        emphasis,
        gainScale,
        estimatedDurationMs,
        startOffsetMs: cursorMs,
      }),
    );

    cursorMs += estimatedDurationMs + pauseMs;
    pitchSum += pitch;
    rateSum += rate;
    totalPauseMs += pauseMs;
  }

  return Object.freeze({
    rawText: text,
    persona,
    tone,
    locale,
    clauses: Object.freeze(clauses),
    totalEstimatedDurationMs: cursorMs,
    totalPauseMs,
    averagePitch: roundTo(pitchSum / totalClauses, 3),
    averageRate: roundTo(rateSum / totalClauses, 3),
    emotionDirective: `${personaProfile.labelEn} (${tone}): ${toneProfile.emotionDirectiveEn}`,
    plainTextForFlux,
  });
}

/* -------------------------------------------------------------------------- */
/* 2. 방해 금지(Anti-Nag) 쿨다운 & 드로잉 중 연기 스케줄러                      */
/* -------------------------------------------------------------------------- */

export interface VoiceCoachCooldownGuardOptions {
  readonly defaultCooldownMs?: number;
  readonly minGlobalGapMs?: number;
  readonly maxDeferredQueue?: number;
  readonly nowMs?: () => number;
}

export interface CoachMomentTriggerOptions {
  readonly tone?: VoiceCoachEmotionTone;
  readonly outputMode?: VoiceCoachOutputMode;
  readonly cooldownMs?: number;
  readonly bypassGlobalGap?: boolean;
  readonly nowMs?: number;
}

export interface DeferredCoachMoment {
  readonly momentId: VoiceCoachMomentId;
  readonly tone: VoiceCoachEmotionTone;
  readonly priority: VoiceCoachMomentPriority;
  readonly queuedAtMs: number;
}

export type CoachTriggerDecisionKind =
  | "allow"
  | "suppressed-cooldown"
  | "suppressed-global-gap"
  | "deferred-drawing"
  | "muted-opt-out";

export interface CoachTriggerDecision {
  readonly decision: CoachTriggerDecisionKind;
  readonly momentId: VoiceCoachMomentId;
  readonly tone: VoiceCoachEmotionTone;
  readonly remainingCooldownMs: number;
  readonly deferredQueueLength: number;
}

const PRIORITY_WEIGHT: Readonly<Record<VoiceCoachMomentPriority, number>> = Object.freeze({
  important: 3,
  helpful: 2,
  ambient: 1,
});

/**
 * 동일 상황 90초 쿨다운, 전역 연속 발화 억제, 드로잉 중 안내 연기(Queue & Defer),
 * 즉시 음소거/취소(`cancelAll`)를 관리한다.
 */
export class VoiceCoachCooldownGuard {
  private readonly defaultCooldownMs: number;
  private readonly minGlobalGapMs: number;
  private readonly maxDeferredQueue: number;
  private readonly nowClock: () => number;
  private readonly lastPlayedByMoment = new Map<VoiceCoachMomentId, number>();
  private readonly deferredByMoment = new Map<VoiceCoachMomentId, DeferredCoachMoment>();
  private readonly cancelHooks = new Set<() => void>();
  private lastAnyPlayedAtMs = Number.NEGATIVE_INFINITY;
  private drawingActive = false;
  private cancelGeneration = 0;

  constructor(options: VoiceCoachCooldownGuardOptions = {}) {
    this.defaultCooldownMs = Math.max(
      0,
      options.defaultCooldownMs ?? DEFAULT_VOICE_COACH_COOLDOWN_MS,
    );
    this.minGlobalGapMs = Math.max(0, options.minGlobalGapMs ?? DEFAULT_MIN_GLOBAL_INTERVAL_MS);
    this.maxDeferredQueue = Math.max(1, options.maxDeferredQueue ?? 3);
    this.nowClock = options.nowMs ?? (() => Date.now());
  }

  isDrawingActive(): boolean {
    return this.drawingActive;
  }

  setDrawingActive(active: boolean): readonly DeferredCoachMoment[] {
    this.drawingActive = active;
    return this.peekDeferred();
  }

  getRemainingCooldownMs(momentId: VoiceCoachMomentId, nowMs?: number): number {
    const now = nowMs ?? this.nowClock();
    const lastPlayed = this.lastPlayedByMoment.get(momentId);
    if (lastPlayed === undefined) return 0;
    const specCooldown = VOICE_COACH_MOMENT_CATALOG[momentId].cooldownMs || this.defaultCooldownMs;
    const effectiveCooldown = Math.max(this.defaultCooldownMs, specCooldown);
    return Math.max(0, effectiveCooldown - (now - lastPlayed));
  }

  requestMoment(
    momentId: VoiceCoachMomentId,
    options: CoachMomentTriggerOptions = {},
  ): CoachTriggerDecision {
    const spec = VOICE_COACH_MOMENT_CATALOG[momentId];
    const tone = options.tone ?? spec.defaultTone;
    const now = options.nowMs ?? this.nowClock();

    if (options.outputMode === "off") {
      return Object.freeze({
        decision: "muted-opt-out",
        momentId,
        tone,
        remainingCooldownMs: 0,
        deferredQueueLength: this.deferredByMoment.size,
      });
    }

    const effectiveCooldown = options.cooldownMs ?? this.defaultCooldownMs;
    const lastPlayed = this.lastPlayedByMoment.get(momentId);
    if (lastPlayed !== undefined) {
      const elapsed = now - lastPlayed;
      if (elapsed < effectiveCooldown) {
        return Object.freeze({
          decision: "suppressed-cooldown",
          momentId,
          tone,
          remainingCooldownMs: Math.max(0, effectiveCooldown - elapsed),
          deferredQueueLength: this.deferredByMoment.size,
        });
      }
    }

    if (this.drawingActive) {
      this.enqueueDeferred({
        momentId,
        tone,
        priority: spec.priority,
        queuedAtMs: now,
      });
      return Object.freeze({
        decision: "deferred-drawing",
        momentId,
        tone,
        remainingCooldownMs: 0,
        deferredQueueLength: this.deferredByMoment.size,
      });
    }

    const globalElapsed = now - this.lastAnyPlayedAtMs;
    if (!options.bypassGlobalGap && globalElapsed < this.minGlobalGapMs) {
      return Object.freeze({
        decision: "suppressed-global-gap",
        momentId,
        tone,
        remainingCooldownMs: Math.max(0, this.minGlobalGapMs - globalElapsed),
        deferredQueueLength: this.deferredByMoment.size,
      });
    }

    this.lastPlayedByMoment.set(momentId, now);
    this.lastAnyPlayedAtMs = now;
    this.deferredByMoment.delete(momentId);

    return Object.freeze({
      decision: "allow",
      momentId,
      tone,
      remainingCooldownMs: 0,
      deferredQueueLength: this.deferredByMoment.size,
    });
  }

  flushNextDeferred(nowMs?: number): DeferredCoachMoment | null {
    if (this.drawingActive || this.deferredByMoment.size === 0) return null;
    const now = nowMs ?? this.nowClock();
    const sorted = this.peekDeferred();

    for (const candidate of sorted) {
      this.deferredByMoment.delete(candidate.momentId);
      const lastPlayed = this.lastPlayedByMoment.get(candidate.momentId);
      if (lastPlayed !== undefined && now - lastPlayed < this.defaultCooldownMs) {
        continue;
      }
      this.lastPlayedByMoment.set(candidate.momentId, now);
      this.lastAnyPlayedAtMs = now;
      return candidate;
    }

    return null;
  }

  peekDeferred(): readonly DeferredCoachMoment[] {
    return Object.freeze(
      [...this.deferredByMoment.values()].sort((a, b) => {
        const weightDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        if (weightDiff !== 0) return weightDiff;
        return b.queuedAtMs - a.queuedAtMs;
      }),
    );
  }

  registerCancelHook(hook: () => void): () => void {
    this.cancelHooks.add(hook);
    return () => {
      this.cancelHooks.delete(hook);
    };
  }

  cancelAll(): { readonly cancelledGeneration: number; readonly clearedDeferredCount: number } {
    this.cancelGeneration += 1;
    const clearedDeferredCount = this.deferredByMoment.size;
    this.deferredByMoment.clear();
    for (const hook of [...this.cancelHooks]) {
      try {
        hook();
      } catch {
        // 개별 취소 훅 실패가 전체 중단을 막지 않도록 방어
      }
    }
    return Object.freeze({
      cancelledGeneration: this.cancelGeneration,
      clearedDeferredCount,
    });
  }

  getCancelGeneration(): number {
    return this.cancelGeneration;
  }

  resetCooldowns(): void {
    this.lastPlayedByMoment.clear();
    this.lastAnyPlayedAtMs = Number.NEGATIVE_INFINITY;
    this.deferredByMoment.clear();
  }

  private enqueueDeferred(entry: DeferredCoachMoment): void {
    this.deferredByMoment.set(entry.momentId, entry);
    if (this.deferredByMoment.size <= this.maxDeferredQueue) return;

    const sorted = this.peekDeferred();
    const lowest = sorted.at(-1);
    if (lowest) {
      this.deferredByMoment.delete(lowest.momentId);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 3. 외부 뉴럴 보이스 어댑터 팩토리 (로컬 운율 엔진 연동)                        */
/* -------------------------------------------------------------------------- */

export function createNeuralVoiceAdapter(
  provider: NeuralVoiceProviderId,
  transport?: NeuralVoiceTransport,
): NeuralVoiceAdapter {
  return buildNeuralVoiceAdapter(provider, planExpressiveUtterance, transport);
}

export function synthesizeWithNeuralFallback(
  request: NeuralVoiceSynthesisRequest,
  config: NeuralVoiceProviderConfig,
  transport?: NeuralVoiceTransport,
): Promise<NeuralVoiceSynthesisResult> {
  return createNeuralVoiceAdapter(config.provider, transport).synthesize(request, config);
}
