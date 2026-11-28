/**
 * Wave 128 — 한국어 웹툰 대사 운율·감정·호흡 분석 및 무중첩 연기 타임라인 컴파일러.
 *
 * - 6종 말풍선 유형 + 한국어 문장부호(`!`, `?!`, `...`, `~`, `—`) + 발화 음절 수로
 *   연기 톤, 발화 속도(SPS), 피치(반음), 에너지(dBFS), 전·후 호흡, 음향 리버브를 결정론적으로 산출한다.
 * - 일반 대사는 직렬 배치해 비의도적 겹침 0건을 보장하며, `overlapInterrupt: true`인 끼어들기 대사만
 *   직전 대사 말미(기본 15%)에 의도적으로 중첩 배치한다.
 */

import { computeVoiceManifestSha256Hex } from "./voice-script-sha256";
import type {
  AcousticReverbTag,
  CompiledDialogueLine,
  CompiledVoiceProsodyScript,
  DialogueBalloonStyle,
  DialogueProsodyCompileOptions,
  EpisodeDialogueCueInput,
  PunctuationCueProfile,
  ResolvedDialogueProsodyOptions,
  SceneDialogueSummary,
  VoiceDeliveryStyle,
} from "./voice-script-types";

export const DEFAULT_INTER_LINE_GAP_MS = 140;
export const DEFAULT_SCENE_TRANSITION_GAP_MS = 560;
export const DEFAULT_INTERRUPT_OVERLAP_RATIO = 0.15;
export const DEFAULT_MINIMUM_LINE_DURATION_MS = 440;

interface DeliveryProsodyBaseline {
  readonly rateSps: number;
  readonly pitchSt: number;
  readonly energyDb: number;
  readonly preBreathMs: number;
  readonly postHoldMs: number;
}

const DELIVERY_PROSODY_BASELINES: Readonly<Record<VoiceDeliveryStyle, DeliveryProsodyBaseline>> = {
  shout: { rateSps: 5.6, pitchSt: 3.2, energyDb: -3.0, preBreathMs: 260, postHoldMs: 240 },
  "urgent-dialogue": { rateSps: 5.4, pitchSt: 1.4, energyDb: -8.5, preBreathMs: 150, postHoldMs: 160 },
  "calm-dialogue": { rateSps: 4.4, pitchSt: 0.0, energyDb: -13.5, preBreathMs: 180, postHoldMs: 210 },
  narration: { rateSps: 4.1, pitchSt: -0.8, energyDb: -12.0, preBreathMs: 240, postHoldMs: 320 },
  "inner-monologue": { rateSps: 3.8, pitchSt: -1.2, energyDb: -16.5, preBreathMs: 250, postHoldMs: 360 },
  whisper: { rateSps: 3.4, pitchSt: -2.2, energyDb: -24.0, preBreathMs: 290, postHoldMs: 280 },
};

function sanitizeNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** 컴파일 옵션을 안전한 유한 경계값으로 정규화한다. */
export function resolveDialogueProsodyOptions(
  options?: DialogueProsodyCompileOptions,
): ResolvedDialogueProsodyOptions {
  return {
    defaultInterLineGapMs: Math.round(
      sanitizeNumber(options?.defaultInterLineGapMs, DEFAULT_INTER_LINE_GAP_MS, 0, 5000),
    ),
    sceneTransitionGapMs: Math.round(
      sanitizeNumber(options?.sceneTransitionGapMs, DEFAULT_SCENE_TRANSITION_GAP_MS, 0, 10000),
    ),
    interruptOverlapRatio: roundTo(
      sanitizeNumber(options?.interruptOverlapRatio, DEFAULT_INTERRUPT_OVERLAP_RATIO, 0.05, 0.45),
      4,
    ),
    minimumLineDurationMs: Math.round(
      sanitizeNumber(options?.minimumLineDurationMs, DEFAULT_MINIMUM_LINE_DURATION_MS, 200, 3000),
    ),
  };
}

/** 한국어 대사 텍스트의 문장부호·강세 패턴을 정량 분석한다. */
export function analyzeKoreanPunctuation(rawText: string): PunctuationCueProfile {
  const text = rawText.trim();
  if (text.length === 0) {
    return {
      exclamationCount: 0,
      questionCount: 0,
      interrobangCount: 0,
      ellipsisCount: 0,
      tildeCount: 0,
      emDashCount: 0,
    };
  }

  const interrobangMatches = text.match(/(?:\?!|!\?|？！|！？|‽)/g);
  const exclamationMatches = text.match(/[!！]/g);
  const questionMatches = text.match(/[?？]/g);
  const ellipsisMatches = text.match(/(?:\.{2,}|…+)/g);
  const tildeMatches = text.match(/[~～]/g);
  const emDashMatches = text.match(/(?:—|―|--+)/g);

  return {
    exclamationCount: exclamationMatches ? exclamationMatches.length : 0,
    questionCount: questionMatches ? questionMatches.length : 0,
    interrobangCount: interrobangMatches ? interrobangMatches.length : 0,
    ellipsisCount: ellipsisMatches ? ellipsisMatches.length : 0,
    tildeCount: tildeMatches ? tildeMatches.length : 0,
    emDashCount: emDashMatches ? emDashMatches.length : 0,
  };
}

/**
 * 한국어 대사의 실제 발화 음절 수를 계산한다.
 * - 완성형 한글 음절 1자 = 1음절
 * - 한글 자모(ㅋㅋ, ㅎㅎ 등) = 0.6음절 올림 추정
 * - 숫자 1자리 = 1음절, 영문 외래어 3글자당 약 1음절
 */
export function countKoreanSpeakableSyllables(rawText: string): number {
  const text = rawText.trim();
  if (text.length === 0) return 0;

  let hangulSyllables = 0;
  let jamoCount = 0;
  let digitCount = 0;

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      hangulSyllables += 1;
    } else if (code >= 0x3131 && code <= 0x318e) {
      jamoCount += 1;
    } else if (code >= 0x30 && code <= 0x39) {
      digitCount += 1;
    }
  }

  const latinWords = text.match(/[A-Za-z]+/g);
  let latinSyllables = 0;
  if (latinWords) {
    for (let i = 0; i < latinWords.length; i += 1) {
      const word = latinWords[i] ?? "";
      latinSyllables += Math.max(1, Math.ceil(word.length / 3));
    }
  }

  const jamoSyllables = jamoCount > 0 ? Math.max(1, Math.ceil(jamoCount * 0.6)) : 0;
  return hangulSyllables + jamoSyllables + digitCount + latinSyllables;
}

/** 말풍선 유형과 문장부호 조합으로 연기 전달 스타일을 결정한다. */
export function inferVoiceDeliveryStyle(
  balloonStyle: DialogueBalloonStyle,
  punctuation: PunctuationCueProfile,
): VoiceDeliveryStyle {
  if (balloonStyle === "shout-jagged") return "shout";
  if (balloonStyle === "whisper-dashed") return "whisper";
  if (balloonStyle === "thought-cloud") return "inner-monologue";
  if (balloonStyle === "narration-box") return "narration";

  if (
    punctuation.interrobangCount > 0 ||
    punctuation.exclamationCount > 0 ||
    punctuation.emDashCount > 0
  ) {
    return "urgent-dialogue";
  }
  return "calm-dialogue";
}

/** 말풍선 유형에 대응하는 표준 음향 공간·필터 태그를 결정한다. */
export function inferAcousticReverbTag(balloonStyle: DialogueBalloonStyle): AcousticReverbTag {
  if (balloonStyle === "thought-cloud") return "inner-monologue-hall";
  if (balloonStyle === "phone-radio") return "phone-bandpass";
  if (balloonStyle === "narration-box") return "studio-narrator";
  return "dry-close";
}

function buildEmotionAndBreathDirectionKo(
  deliveryStyle: VoiceDeliveryStyle,
  punctuation: PunctuationCueProfile,
  isEmptyCue: boolean,
  overlapInterrupt: boolean,
): { readonly emotionCueKo: string; readonly breathDirectionKo: string } {
  if (isEmptyCue) {
    return {
      emotionCueKo: "무음 여백 큐",
      breathDirectionKo: "발화 없이 짧은 숨 고르기와 컷 여백 유지",
    };
  }

  let emotionCueKo: string;
  if (deliveryStyle === "shout") {
    emotionCueKo = punctuation.interrobangCount > 0 ? "격앙된 반문 외침" : "고에너지 파열 외침";
  } else if (deliveryStyle === "whisper") {
    emotionCueKo = punctuation.ellipsisCount > 0 ? "숨죽인 망설임 속삭임" : "근접 저음 속삭임";
  } else if (deliveryStyle === "inner-monologue") {
    emotionCueKo = punctuation.questionCount > 0 ? "내면 의문 독백" : "가라앉은 내면 독백";
  } else if (deliveryStyle === "narration") {
    emotionCueKo = "안정적 해설 내레이션";
  } else if (deliveryStyle === "urgent-dialogue") {
    emotionCueKo = punctuation.emDashCount > 0 ? "말꼬리 끊긴 다급한 대사" : "긴장감 높은 빠른 응수";
  } else {
    emotionCueKo = punctuation.tildeCount > 0 ? "여유롭게 늘인 평서 대사" : "차분한 일상 대화";
  }

  const breathNotes: string[] = [];
  if (deliveryStyle === "shout") {
    breathNotes.push("복식 흡기 후 첫 음절 어택 강조");
  } else if (deliveryStyle === "whisper") {
    breathNotes.push("마이크 근접 호흡량 확보, 치찰음 억제");
  } else if (punctuation.ellipsisCount > 0) {
    breathNotes.push("말줄임표 구간 멈춤 호흡과 여운 확보");
  } else if (punctuation.emDashCount > 0) {
    breathNotes.push("종결 호흡 절단, 급정지 뉘앙스 유지");
  } else {
    breathNotes.push("자연스러운 흉식 흡기 후 일정 텐션 유지");
  }

  if (overlapInterrupt) {
    breathNotes.push("직전 화자 말미에 즉시 치고 들어감");
  }

  return {
    emotionCueKo,
    breathDirectionKo: breathNotes.join(" · "),
  };
}

function createZeroDeliveryBreakdown(): Record<VoiceDeliveryStyle, number> {
  return {
    shout: 0,
    whisper: 0,
    "inner-monologue": 0,
    narration: 0,
    "urgent-dialogue": 0,
    "calm-dialogue": 0,
  };
}

function createZeroReverbBreakdown(): Record<AcousticReverbTag, number> {
  return {
    "dry-close": 0,
    "inner-monologue-hall": 0,
    "phone-bandpass": 0,
    "studio-narrator": 0,
  };
}

/**
 * 전체 타임라인을 독립 검증해 의도적 끼어들기(`k === j + 1 && lines[k].overlapInterrupt`) 외의
 * 비의도적 대사 겹침 건수를 집계한다.
 */
export function countUnintendedDialogueOverlaps(lines: readonly CompiledDialogueLine[]): number {
  let unintended = 0;
  for (let j = 0; j < lines.length; j += 1) {
    const earlier = lines[j];
    if (!earlier) continue;
    for (let k = j + 1; k < lines.length; k += 1) {
      const later = lines[k];
      if (!later) continue;
      if (earlier.endMs > later.startMs) {
        const isIntendedImmediateInterrupt = k === j + 1 && later.overlapInterrupt;
        if (!isIntendedImmediateInterrupt) {
          unintended += 1;
        }
      }
    }
  }
  return unintended;
}

/**
 * 웹툰 대사 큐 배열을 결정론적 한국어 운율·감정·호흡 연기 대본 및 타임라인으로 컴파일한다.
 */
export function compileVoiceActingProsodyScript(
  cues: readonly EpisodeDialogueCueInput[],
  options?: DialogueProsodyCompileOptions,
): CompiledVoiceProsodyScript {
  const resolved = resolveDialogueProsodyOptions(options);
  const compiledLines: CompiledDialogueLine[] = [];
  const deliveryBreakdown = createZeroDeliveryBreakdown();
  const reverbBreakdown = createZeroReverbBreakdown();
  const emptyLineIds: string[] = [];
  const characterIdSet = new Set<string>();
  const orderedCharacterIds: string[] = [];

  let totalSyllables = 0;
  let intentionalInterruptCount = 0;
  let runningMaxEndMs = 0;
  const prefixMaxEndMs: number[] = [];

  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i];
    if (!cue) continue;

    const lineId = cue.lineId.trim() || `line-${i + 1}`;
    const sceneId = cue.sceneId.trim() || "scene-default";
    const cutId = cue.cutId.trim() || `cut-${i + 1}`;
    const characterId = cue.characterId.trim() || `char-${i + 1}`;
    const characterNameKo = (cue.characterNameKo ?? "").trim() || characterId;
    const normalizedTextKo = cue.textKo.replace(/\s+/g, " ").trim();
    const isEmptyCue = normalizedTextKo.length === 0;
    const punctuation = analyzeKoreanPunctuation(normalizedTextKo);
    const syllableCount = countKoreanSpeakableSyllables(normalizedTextKo);
    const deliveryStyle = inferVoiceDeliveryStyle(cue.balloonStyle, punctuation);
    const acousticReverbTag = inferAcousticReverbTag(cue.balloonStyle);
    const base = DELIVERY_PROSODY_BASELINES[deliveryStyle];

    const exclCap = Math.min(4, punctuation.exclamationCount);
    const interroCap = Math.min(3, punctuation.interrobangCount);
    const standaloneQuestionCount = Math.max(0, punctuation.questionCount - punctuation.interrobangCount);
    const questCap = Math.min(3, standaloneQuestionCount);
    const ellipCap = Math.min(4, punctuation.ellipsisCount);
    const tildeCap = Math.min(4, punctuation.tildeCount);
    const dashCap = Math.min(3, punctuation.emDashCount);

    let speakingRateSps =
      base.rateSps +
      exclCap * 0.16 +
      interroCap * 0.22 +
      dashCap * 0.24 -
      ellipCap * 0.36 -
      tildeCap * 0.26;

    let pitchShiftSemitones =
      base.pitchSt +
      exclCap * 0.45 +
      interroCap * 0.65 +
      questCap * 0.35 +
      tildeCap * 0.28;

    let energyDb =
      base.energyDb +
      exclCap * 0.72 +
      interroCap * 0.48 -
      ellipCap * 0.85 -
      (cue.balloonStyle === "phone-radio" ? 1.0 : 0);

    let preBreathMs =
      base.preBreathMs +
      exclCap * 16 +
      ellipCap * 55 -
      (cue.overlapInterrupt ? 45 : 0);

    let postHoldMs =
      base.postHoldMs +
      questCap * 45 +
      ellipCap * 130 +
      tildeCap * 95 -
      dashCap * 75;

    speakingRateSps = roundTo(Math.max(2.2, Math.min(7.5, speakingRateSps)), 2);
    pitchShiftSemitones = roundTo(Math.max(-6.0, Math.min(6.5, pitchShiftSemitones)), 2);
    energyDb = roundTo(Math.max(-32.0, Math.min(-0.5, energyDb)), 2);
    preBreathMs = Math.round(Math.max(60, Math.min(700, preBreathMs)));
    postHoldMs = Math.round(Math.max(40, Math.min(1200, postHoldMs)));

    let speechDurationMs: number;
    let estimatedDurationMs: number;
    if (isEmptyCue) {
      emptyLineIds.push(lineId);
      preBreathMs = 100;
      speechDurationMs = 0;
      postHoldMs = 150;
      estimatedDurationMs = 250;
    } else if (syllableCount === 0) {
      speechDurationMs = Math.max(
        180,
        punctuation.ellipsisCount * 220 +
          (punctuation.exclamationCount + punctuation.questionCount) * 140,
      );
      estimatedDurationMs = preBreathMs + speechDurationMs + postHoldMs;
    } else {
      speechDurationMs = Math.max(220, Math.round((syllableCount / speakingRateSps) * 1000));
      estimatedDurationMs = Math.max(
        resolved.minimumLineDurationMs,
        preBreathMs + speechDurationMs + postHoldMs,
      );
    }

    const overlapInterrupt = Boolean(cue.overlapInterrupt);
    const prevLine = compiledLines[compiledLines.length - 1];
    let startMs = 0;
    let intentionalOverlapMs = 0;

    if (prevLine) {
      if (overlapInterrupt) {
        const requestedOverlapMs = Math.max(
          1,
          Math.round(prevLine.estimatedDurationMs * resolved.interruptOverlapRatio),
        );
        const earliestNonPrePrevEndMs =
          compiledLines.length >= 2 ? (prefixMaxEndMs[compiledLines.length - 2] ?? 0) : 0;
        const desiredStartMs = prevLine.endMs - requestedOverlapMs;
        startMs = Math.max(earliestNonPrePrevEndMs, prevLine.startMs + 1, desiredStartMs);
        intentionalOverlapMs = Math.max(0, prevLine.endMs - startMs);
        if (intentionalOverlapMs > 0) {
          intentionalInterruptCount += 1;
        }
      } else {
        const gapMs =
          prevLine.sceneId !== sceneId
            ? resolved.sceneTransitionGapMs
            : resolved.defaultInterLineGapMs;
        startMs = runningMaxEndMs + gapMs;
      }
    }

    const endMs = startMs + estimatedDurationMs;
    runningMaxEndMs = Math.max(runningMaxEndMs, endMs);
    prefixMaxEndMs.push(runningMaxEndMs);

    const direction = buildEmotionAndBreathDirectionKo(
      deliveryStyle,
      punctuation,
      isEmptyCue,
      overlapInterrupt && intentionalOverlapMs > 0,
    );

    const compiled: CompiledDialogueLine = {
      lineIndex: compiledLines.length,
      lineId,
      sceneId,
      cutId,
      characterId,
      characterNameKo,
      textKo: cue.textKo,
      normalizedTextKo,
      isEmptyCue,
      balloonStyle: cue.balloonStyle,
      deliveryStyle,
      acousticReverbTag,
      syllableCount,
      punctuation,
      speakingRateSps,
      pitchShiftSemitones,
      energyDb,
      preBreathMs,
      postHoldMs,
      speechDurationMs,
      estimatedDurationMs,
      startMs,
      endMs,
      overlapInterrupt,
      intentionalOverlapMs,
      emotionCueKo: direction.emotionCueKo,
      breathDirectionKo: direction.breathDirectionKo,
    };

    compiledLines.push(compiled);
    deliveryBreakdown[deliveryStyle] += 1;
    reverbBreakdown[acousticReverbTag] += 1;
    totalSyllables += syllableCount;

    if (!characterIdSet.has(characterId)) {
      characterIdSet.add(characterId);
      orderedCharacterIds.push(characterId);
    }
  }

  const sceneMap = new Map<
    string,
    {
      startMs: number;
      endMs: number;
      lineCount: number;
      characterSet: Set<string>;
      characterOrder: string[];
      shoutLineCount: number;
    }
  >();
  const sceneOrder: string[] = [];

  for (let i = 0; i < compiledLines.length; i += 1) {
    const line = compiledLines[i];
    if (!line) continue;
    let entry = sceneMap.get(line.sceneId);
    if (!entry) {
      entry = {
        startMs: line.startMs,
        endMs: line.endMs,
        lineCount: 0,
        characterSet: new Set<string>(),
        characterOrder: [],
        shoutLineCount: 0,
      };
      sceneMap.set(line.sceneId, entry);
      sceneOrder.push(line.sceneId);
    }
    entry.startMs = Math.min(entry.startMs, line.startMs);
    entry.endMs = Math.max(entry.endMs, line.endMs);
    entry.lineCount += 1;
    if (!entry.characterSet.has(line.characterId)) {
      entry.characterSet.add(line.characterId);
      entry.characterOrder.push(line.characterId);
    }
    if (line.deliveryStyle === "shout") {
      entry.shoutLineCount += 1;
    }
  }

  const scenes: SceneDialogueSummary[] = [];
  for (let i = 0; i < sceneOrder.length; i += 1) {
    const sceneId = sceneOrder[i];
    if (!sceneId) continue;
    const entry = sceneMap.get(sceneId);
    if (!entry) continue;
    scenes.push({
      sceneId,
      startMs: entry.startMs,
      endMs: entry.endMs,
      lineCount: entry.lineCount,
      characterIds: entry.characterOrder,
      shoutLineCount: entry.shoutLineCount,
    });
  }

  const unintendedOverlapCount = countUnintendedDialogueOverlaps(compiledLines);
  const prosodyScriptSha256Hex = computeVoiceManifestSha256Hex({
    version: "wave128-prosody-v1",
    options: resolved,
    lines: compiledLines,
  });

  return {
    lines: compiledLines,
    scenes,
    characterIds: orderedCharacterIds,
    totalDurationMs: runningMaxEndMs,
    totalSyllables,
    unintendedOverlapCount,
    intentionalInterruptCount,
    deliveryBreakdown,
    reverbBreakdown,
    emptyLineIds,
    prosodyScriptSha256Hex,
  };
}
