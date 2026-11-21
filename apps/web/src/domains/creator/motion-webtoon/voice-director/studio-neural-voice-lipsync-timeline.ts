/**
 * 한국어 감정 연기 성우 캐스팅 · 한글 Viseme 립싱크 · SFX 자동 큐 · 탄성 리플 타임라인 엔진.
 *
 * Typecast(7대 감정 + 0.0~2.0 감정 강도), Supertone Supertonic 3(온디바이스 ONNX 무비용 초안 +
 * 사전 발화 길이 예측), ElevenLabs v3(인라인 오디오 태그·SFX 다중 이벤트), Sync Labs(음소 립싱크),
 * Vrew(대사 수정·삭제 시 후속 클립 탄성 리플 동기화) 워크플로를 클린룸 순수 모듈로 통합한다.
 */

import {
  mapCutToSfxKinds,
  type StudioMotionSfxKind,
} from "../motion-webtoon-sfx-auto";

export const KOREAN_VOICE_EMOTIONS = [
  "neutral",
  "happy",
  "angry",
  "sad",
  "whisper",
  "excited",
  "fearful",
] as const;

export type KoreanVoiceEmotion = (typeof KOREAN_VOICE_EMOTIONS)[number];

export type VoiceSynthesisEngineKind =
  | "local-onnx"
  | "typecast-byok"
  | "elevenlabs-byok"
  | "webspeech-fallback";

export const KOREAN_VISEME_KINDS = [
  "closed",
  "aa",
  "ee",
  "ih",
  "oh",
  "ou",
  "fv",
] as const;

export type KoreanVisemeKind = (typeof KOREAN_VISEME_KINDS)[number];

export type InlineAudioTagKind =
  | "laugh"
  | "whisper"
  | "sigh"
  | "breath"
  | "emotion-shift";

export interface CharacterVoiceCast {
  readonly characterId: string;
  readonly characterName: string;
  readonly voiceId: string;
  readonly voiceLabelKo: string;
  readonly engineKind: VoiceSynthesisEngineKind;
  readonly defaultEmotion: KoreanVoiceEmotion;
  /** 감정 강도 (0.0..2.0, 기본 1.0). */
  readonly emotionIntensity: number;
  /** 말하기 속도 배율 (0.6..1.8, 기본 1.0). */
  readonly speakingRate: number;
  /** 음정 보정(반음, -6..+6). */
  readonly pitchSemitones: number;
  /** 상업용 보이스 라이선스 및 본인 동의 확인 여부(Rights BOM 게이트). */
  readonly rightsConsentVerified: boolean;
}

export interface DialogueScriptLineInput {
  readonly id: string;
  readonly cutId: string;
  readonly characterId: string;
  readonly rawText: string;
  readonly emotionOverride?: KoreanVoiceEmotion;
  readonly emotionIntensityOverride?: number;
  readonly moodHint?: string;
}

export interface ParsedInlineAudioTag {
  readonly kind: InlineAudioTagKind;
  readonly rawToken: string;
  /** 대사 내 상대 위치 (0..1). */
  readonly offsetRatio01: number;
  readonly emotionOverride?: KoreanVoiceEmotion;
  readonly intensityOverride?: number;
}

export interface ParsedDialogueMarkup {
  readonly cleanText: string;
  readonly inlineTags: readonly ParsedInlineAudioTag[];
  readonly resolvedEmotion: KoreanVoiceEmotion;
  readonly resolvedIntensity: number;
}

export interface DurationPredictionResult {
  readonly predictedDurationMs: number;
  readonly hangulSyllableCount: number;
  readonly latinWordCount: number;
  readonly pauseMs: number;
  readonly estimatedCredits: number;
  readonly engineKind: VoiceSynthesisEngineKind;
}

export interface VisemeKeyframe {
  readonly timeMs: number;
  readonly viseme: KoreanVisemeKind;
  readonly weight01: number;
}

export interface VoiceDirectorSfxTrackItem {
  readonly id: string;
  readonly clipId: string;
  readonly cutId: string;
  readonly kind: StudioMotionSfxKind;
  readonly startMs: number;
  readonly durationMs: number;
}

export interface VoiceDirectorDialogueClip {
  readonly id: string;
  readonly cutId: string;
  readonly characterId: string;
  readonly voiceId: string;
  readonly engineKind: VoiceSynthesisEngineKind;
  readonly rawText: string;
  readonly cleanText: string;
  readonly emotion: KoreanVoiceEmotion;
  readonly emotionIntensity: number;
  readonly inlineTags: readonly ParsedInlineAudioTag[];
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly estimatedCredits: number;
  readonly visemes: readonly VisemeKeyframe[];
}

export interface VoiceDirectorTimeline {
  readonly gapMs: number;
  readonly totalDurationMs: number;
  readonly totalEstimatedCredits: number;
  readonly clips: readonly VoiceDirectorDialogueClip[];
  readonly sfxTracks: readonly VoiceDirectorSfxTrackItem[];
}

export interface VoiceRightsAuditReport {
  readonly ok: boolean;
  readonly unverifiedCharacterIds: readonly string[];
  readonly warningKo: string | null;
}

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;

// 초성 19개 중 양순음(ㅁ,ㅂ,ㅃ,ㅍ) 인덱스: ㅁ=6, ㅂ=7, ㅃ=8, ㅍ=17
const LABIAL_CHOSEONG = new Set([6, 7, 8, 17]);
// 종성 28개 중 양순음(ㅁ=16, ㅂ=17, ㅄ=18, ㅍ=26)
const LABIAL_JONGSEONG = new Set([16, 17, 18, 26]);

// 중성 21개 인덱스 → 7종 Viseme 매핑
// 0:ㅏ 1:ㅐ 2:ㅑ 3:ㅒ 4:ㅓ 5:ㅔ 6:ㅕ 7:ㅖ 8:ㅗ 9:ㅘ 10:ㅙ 11:ㅚ
// 12:ㅛ 13:ㅜ 14:ㅝ 15:ㅞ 16:ㅟ 17:ㅠ 18:ㅡ 19:ㅢ 20:ㅣ
const JUNGSEONG_TO_VISEME: readonly KoreanVisemeKind[] = Object.freeze([
  "aa", "aa", "aa", "aa",
  "ee", "ee", "ee", "ee",
  "oh", "oh", "oh", "oh",
  "oh", "ou", "ou", "ou",
  "ou", "ou", "ee", "ih", "ih",
]);

const EMOTION_ALIAS_MAP: Readonly<Record<string, KoreanVoiceEmotion>> = Object.freeze({
  기본: "neutral",
  중립: "neutral",
  neutral: "neutral",
  기쁨: "happy",
  웃음: "happy",
  행복: "happy",
  happy: "happy",
  분노: "angry",
  화남: "angry",
  버럭: "angry",
  angry: "angry",
  슬픔: "sad",
  울음: "sad",
  sad: "sad",
  속삭임: "whisper",
  귓속말: "whisper",
  whisper: "whisper",
  whispers: "whisper",
  흥분: "excited",
  신남: "excited",
  excited: "excited",
  공포: "fearful",
  두려움: "fearful",
  불안: "fearful",
  fearful: "fearful",
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function defaultVoiceCastFor(characterId: string): CharacterVoiceCast {
  return {
    characterId,
    characterName: characterId,
    voiceId: "supertonic-ko-default",
    voiceLabelKo: "기본 한국어 내레이션",
    engineKind: "local-onnx",
    defaultEmotion: "neutral",
    emotionIntensity: 1,
    speakingRate: 1,
    pitchSemitones: 0,
    rightsConsentVerified: true,
  };
}

/**
 * 대사 내 인라인 오디오 태그(`[분노 1.5]`, `[속삭임]`, `[laughs]`, `<breath>`, `[한숨]`)를
 * 파싱해 순수 발화 텍스트와 감정 오버라이드를 추출한다.
 */
export function parseInlineVoiceTags(
  rawText: string,
  baseEmotion: KoreanVoiceEmotion = "neutral",
  baseIntensity = 1,
): ParsedDialogueMarkup {
  const tagPattern = /(?:\[([^\]]+)\]|<(laugh|breath|sigh)>)/giu;
  const inlineTags: ParsedInlineAudioTag[] = [];
  let resolvedEmotion: KoreanVoiceEmotion = baseEmotion;
  let resolvedIntensity = clamp(baseIntensity, 0, 2);

  const safeLen = Math.max(1, rawText.length);
  let match: RegExpExecArray | null = tagPattern.exec(rawText);
  while (match !== null) {
    const rawToken = match[0];
    const body = (match[1] ?? match[2] ?? "").trim();
    const offsetRatio01 = Math.round(clamp(match.index / safeLen, 0, 1) * 1000) / 1000;
    const parts = body.split(/\s+/u);
    const key = (parts[0] ?? "").toLowerCase();
    const numArg = parts[1] !== undefined ? Number(parts[1]) : NaN;

    if (key === "laugh" || key === "laughs" || key === "웃음") {
      inlineTags.push({ kind: "laugh", rawToken, offsetRatio01, emotionOverride: "happy" });
      if (resolvedEmotion === "neutral") resolvedEmotion = "happy";
    } else if (key === "sigh" || key === "sighs" || key === "한숨") {
      inlineTags.push({ kind: "sigh", rawToken, offsetRatio01 });
    } else if (key === "breath" || key === "숨소리") {
      inlineTags.push({ kind: "breath", rawToken, offsetRatio01 });
    } else if (key === "whisper" || key === "whispers" || key === "속삭임") {
      const intensityOverride = Number.isFinite(numArg) ? clamp(numArg, 0, 2) : undefined;
      inlineTags.push({
        kind: "whisper",
        rawToken,
        offsetRatio01,
        emotionOverride: "whisper",
        intensityOverride,
      });
      resolvedEmotion = "whisper";
      if (intensityOverride !== undefined) resolvedIntensity = intensityOverride;
    } else if (EMOTION_ALIAS_MAP[key]) {
      const mapped = EMOTION_ALIAS_MAP[key]!;
      const intensityOverride = Number.isFinite(numArg) ? clamp(numArg, 0, 2) : undefined;
      inlineTags.push({
        kind: "emotion-shift",
        rawToken,
        offsetRatio01,
        emotionOverride: mapped,
        intensityOverride,
      });
      resolvedEmotion = mapped;
      if (intensityOverride !== undefined) resolvedIntensity = intensityOverride;
    }

    match = tagPattern.exec(rawText);
  }

  const cleanText = rawText.replace(tagPattern, " ").replace(/\s+/gu, " ").trim();
  return {
    cleanText,
    inlineTags: Object.freeze(inlineTags),
    resolvedEmotion,
    resolvedIntensity: Math.round(resolvedIntensity * 100) / 100,
  };
}

/**
 * Supertone `/v1/predict-duration` 패턴의 무비용 사전 발화 길이·크레딧 예측기.
 * 한국어 음절(기본 ~155ms/음절), 영문 어절, 문장부호 휴지, 호흡 태그를 반영한다.
 */
export function predictKoreanDialogueDurationMs(
  cleanText: string,
  inlineTags: readonly ParsedInlineAudioTag[],
  cast: Pick<CharacterVoiceCast, "speakingRate" | "engineKind">,
): DurationPredictionResult {
  const rate = clamp(cast.speakingRate, 0.6, 1.8);
  let hangulSyllableCount = 0;
  let pauseMs = 0;

  for (let i = 0; i < cleanText.length; i += 1) {
    const code = cleanText.charCodeAt(i);
    if (code >= HANGUL_BASE && code <= HANGUL_END) {
      hangulSyllableCount += 1;
    } else if (cleanText[i] === "," || cleanText[i] === "·") {
      pauseMs += 140;
    } else if (cleanText[i] === "." || cleanText[i] === "!" || cleanText[i] === "?") {
      pauseMs += 220;
    }
  }

  const latinWords = cleanText.match(/[A-Za-z0-9]+/gu) ?? [];
  const latinWordCount = latinWords.length;

  let tagBonusMs = 0;
  for (const tag of inlineTags) {
    if (tag.kind === "laugh") tagBonusMs += 420;
    else if (tag.kind === "sigh") tagBonusMs += 360;
    else if (tag.kind === "breath") tagBonusMs += 200;
  }

  const rawSpeechMs =
    (hangulSyllableCount * 155 + latinWordCount * 320 + pauseMs + tagBonusMs) / rate;
  const predictedDurationMs = Math.max(350, Math.round(rawSpeechMs));

  // 온디바이스 ONNX와 브라우저 폴백은 크레딧 0, 외부 BYOK 엔진은 글자 수 비례 예측
  const charCount = cleanText.replace(/\s+/gu, "").length;
  const estimatedCredits =
    cast.engineKind === "local-onnx" || cast.engineKind === "webspeech-fallback"
      ? 0
      : Math.max(1, Math.ceil(charCount / 15));

  return {
    predictedDurationMs,
    hangulSyllableCount,
    latinWordCount,
    pauseMs,
    estimatedCredits,
    engineKind: cast.engineKind,
  };
}

/**
 * 한국어 한글 자모 분해(초·중·종성)로 7종 Viseme 립싱크 키프레임 트랙을 산출한다.
 */
export function extractKoreanVisemeTrack(
  cleanText: string,
  startMs: number,
  durationMs: number,
): readonly VisemeKeyframe[] {
  const safeDuration = Math.max(200, Math.round(durationMs));
  const chars = [...cleanText].filter((ch) => ch.trim().length > 0);
  if (chars.length === 0) {
    return Object.freeze([{ timeMs: startMs, viseme: "closed", weight01: 0 }]);
  }

  const stepMs = safeDuration / chars.length;
  const keyframes: VisemeKeyframe[] = [{ timeMs: startMs, viseme: "closed", weight01: 0 }];

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const code = ch.charCodeAt(0);
    const charStart = Math.round(startMs + i * stepMs);

    if (code >= HANGUL_BASE && code <= HANGUL_END) {
      const offset = code - HANGUL_BASE;
      const cho = Math.floor(offset / 588);
      const jung = Math.floor((offset % 588) / 28);
      const jong = offset % 28;

      if (LABIAL_CHOSEONG.has(cho)) {
        keyframes.push({ timeMs: charStart, viseme: "closed", weight01: 0.9 });
      }
      const vowelViseme = JUNGSEONG_TO_VISEME[jung] ?? "aa";
      const vowelTime = LABIAL_CHOSEONG.has(cho)
        ? Math.round(charStart + stepMs * 0.25)
        : charStart;
      keyframes.push({ timeMs: vowelTime, viseme: vowelViseme, weight01: 0.85 });

      if (LABIAL_JONGSEONG.has(jong)) {
        keyframes.push({
          timeMs: Math.round(charStart + stepMs * 0.78),
          viseme: "closed",
          weight01: 0.8,
        });
      }
    } else if (/[fv]/iu.test(ch)) {
      keyframes.push({ timeMs: charStart, viseme: "fv", weight01: 0.75 });
    } else if (/[aA]/u.test(ch)) {
      keyframes.push({ timeMs: charStart, viseme: "aa", weight01: 0.75 });
    } else if (/[eE]/u.test(ch)) {
      keyframes.push({ timeMs: charStart, viseme: "ee", weight01: 0.7 });
    } else if (/[iIyY]/u.test(ch)) {
      keyframes.push({ timeMs: charStart, viseme: "ih", weight01: 0.7 });
    } else if (/[oO]/u.test(ch)) {
      keyframes.push({ timeMs: charStart, viseme: "oh", weight01: 0.75 });
    } else if (/[uUwW]/u.test(ch)) {
      keyframes.push({ timeMs: charStart, viseme: "ou", weight01: 0.75 });
    } else if (/[.,!?…]/u.test(ch)) {
      keyframes.push({ timeMs: charStart, viseme: "closed", weight01: 0 });
    }
  }

  keyframes.push({ timeMs: startMs + safeDuration, viseme: "closed", weight01: 0 });
  return Object.freeze(keyframes);
}

function buildClipWithSfx(
  line: DialogueScriptLineInput,
  cast: CharacterVoiceCast,
  startMs: number,
): {
  readonly clip: VoiceDirectorDialogueClip;
  readonly sfxItems: readonly VoiceDirectorSfxTrackItem[];
} {
  const parsed = parseInlineVoiceTags(
    line.rawText,
    line.emotionOverride ?? cast.defaultEmotion,
    line.emotionIntensityOverride ?? cast.emotionIntensity,
  );
  const prediction = predictKoreanDialogueDurationMs(parsed.cleanText, parsed.inlineTags, cast);
  const durationMs = prediction.predictedDurationMs;
  const endMs = startMs + durationMs;
  const visemes = extractKoreanVisemeTrack(parsed.cleanText, startMs, durationMs);

  const clip: VoiceDirectorDialogueClip = {
    id: line.id,
    cutId: line.cutId,
    characterId: line.characterId,
    voiceId: cast.voiceId,
    engineKind: cast.engineKind,
    rawText: line.rawText,
    cleanText: parsed.cleanText,
    emotion: parsed.resolvedEmotion,
    emotionIntensity: parsed.resolvedIntensity,
    inlineTags: parsed.inlineTags,
    startMs,
    endMs,
    durationMs,
    estimatedCredits: prediction.estimatedCredits,
    visemes,
  };

  const sfxKinds = mapCutToSfxKinds({
    dialogues: [parsed.cleanText],
    moodHint: line.moodHint ?? "",
  });

  const sfxItems: VoiceDirectorSfxTrackItem[] = sfxKinds.map((kind, idx) => ({
    id: `sfx-${line.id}-${kind}`,
    clipId: line.id,
    cutId: line.cutId,
    kind,
    startMs: Math.round(startMs + Math.min(durationMs * 0.4, idx * 180)),
    durationMs: 650,
  }));

  return { clip, sfxItems };
}

/**
 * 말풍선 대사 목록과 성우 캐스팅 시트에서 음성·Viseme·SFX 다중 트랙 타임라인을 자동 구축한다.
 */
export function buildVoiceDirectorTimeline(
  lines: readonly DialogueScriptLineInput[],
  castingSheet: readonly CharacterVoiceCast[],
  options: { readonly gapMs?: number } = {},
): VoiceDirectorTimeline {
  const gapMs = Math.max(0, Math.round(options.gapMs ?? 280));
  const castMap = new Map(castingSheet.map((c) => [c.characterId, c]));

  const clips: VoiceDirectorDialogueClip[] = [];
  const sfxTracks: VoiceDirectorSfxTrackItem[] = [];
  let cursorMs = 0;
  let totalEstimatedCredits = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const cast = castMap.get(line.characterId) ?? defaultVoiceCastFor(line.characterId);
    const { clip, sfxItems } = buildClipWithSfx(line, cast, cursorMs);
    clips.push(clip);
    sfxTracks.push(...sfxItems);
    totalEstimatedCredits += clip.estimatedCredits;
    cursorMs = clip.endMs + (i < lines.length - 1 ? gapMs : 0);
  }

  return {
    gapMs,
    totalDurationMs: clips.length > 0 ? clips[clips.length - 1]!.endMs : 0,
    totalEstimatedCredits,
    clips: Object.freeze(clips),
    sfxTracks: Object.freeze(sfxTracks),
  };
}

function shiftClipByDelta(
  clip: VoiceDirectorDialogueClip,
  deltaMs: number,
): VoiceDirectorDialogueClip {
  if (deltaMs === 0) return clip;
  return {
    ...clip,
    startMs: clip.startMs + deltaMs,
    endMs: clip.endMs + deltaMs,
    visemes: Object.freeze(
      clip.visemes.map((kf) => ({ ...kf, timeMs: kf.timeMs + deltaMs })),
    ),
  };
}

/**
 * Vrew식 텍스트-타임라인 탄성 리플(Ripple) 수정:
 * 특정 대사 텍스트를 수정하면 해당 클립의 발화 길이·립싱크·SFX를 재계산하고,
 * 뒤따르는 모든 클립과 SFX 큐를 빈틈·겹침 없이 `deltaMs`만큼 자동 이동한다.
 */
export function rippleUpdateDialogueClipText(
  timeline: VoiceDirectorTimeline,
  clipId: string,
  nextRawText: string,
  castingSheet: readonly CharacterVoiceCast[],
): VoiceDirectorTimeline {
  const targetIdx = timeline.clips.findIndex((c) => c.id === clipId);
  if (targetIdx < 0) return timeline;

  const target = timeline.clips[targetIdx]!;
  const castMap = new Map(castingSheet.map((c) => [c.characterId, c]));
  const cast = castMap.get(target.characterId) ?? defaultVoiceCastFor(target.characterId);

  const { clip: rebuilt, sfxItems: rebuiltSfx } = buildClipWithSfx(
    {
      id: target.id,
      cutId: target.cutId,
      characterId: target.characterId,
      rawText: nextRawText,
    },
    cast,
    target.startMs,
  );

  const deltaMs = rebuilt.durationMs - target.durationMs;
  const downstreamIds = new Set(timeline.clips.slice(targetIdx + 1).map((c) => c.id));

  const nextClips = timeline.clips.map((clip, idx) => {
    if (idx < targetIdx) return clip;
    if (idx === targetIdx) return rebuilt;
    return shiftClipByDelta(clip, deltaMs);
  });

  const nextSfx: VoiceDirectorSfxTrackItem[] = [];
  for (const sfx of timeline.sfxTracks) {
    if (sfx.clipId === clipId) continue;
    nextSfx.push(
      downstreamIds.has(sfx.clipId)
        ? { ...sfx, startMs: Math.max(0, sfx.startMs + deltaMs) }
        : sfx,
    );
  }
  nextSfx.push(...rebuiltSfx);
  nextSfx.sort((a, b) => a.startMs - b.startMs);

  const totalEstimatedCredits = nextClips.reduce((acc, c) => acc + c.estimatedCredits, 0);
  return {
    ...timeline,
    totalDurationMs: nextClips.length > 0 ? nextClips[nextClips.length - 1]!.endMs : 0,
    totalEstimatedCredits,
    clips: Object.freeze(nextClips),
    sfxTracks: Object.freeze(nextSfx),
  };
}

/**
 * Vrew식 탄성 리플 삭제: 지정 대사 클립과 연계 SFX를 제거하고 후속 트랙을 앞으로 당긴다.
 */
export function rippleDeleteDialogueClip(
  timeline: VoiceDirectorTimeline,
  clipId: string,
): VoiceDirectorTimeline {
  const targetIdx = timeline.clips.findIndex((c) => c.id === clipId);
  if (targetIdx < 0) return timeline;

  const target = timeline.clips[targetIdx]!;
  const hasFollowing = targetIdx < timeline.clips.length - 1;
  const shiftBack = -(target.durationMs + (hasFollowing ? timeline.gapMs : 0));
  const downstreamIds = new Set(timeline.clips.slice(targetIdx + 1).map((c) => c.id));

  const nextClips: VoiceDirectorDialogueClip[] = [];
  for (let i = 0; i < timeline.clips.length; i += 1) {
    if (i === targetIdx) continue;
    const clip = timeline.clips[i]!;
    nextClips.push(i > targetIdx ? shiftClipByDelta(clip, shiftBack) : clip);
  }

  const nextSfx = timeline.sfxTracks
    .filter((s) => s.clipId !== clipId)
    .map((s) =>
      downstreamIds.has(s.clipId)
        ? { ...s, startMs: Math.max(0, s.startMs + shiftBack) }
        : s,
    );

  const totalEstimatedCredits = nextClips.reduce((acc, c) => acc + c.estimatedCredits, 0);
  return {
    ...timeline,
    totalDurationMs: nextClips.length > 0 ? nextClips[nextClips.length - 1]!.endMs : 0,
    totalEstimatedCredits,
    clips: Object.freeze(nextClips),
    sfxTracks: Object.freeze(nextSfx),
  };
}

/**
 * 출고 전 Rights BOM 보이스 라이선스·동의 증빙을 점검한다.
 */
export function auditVoiceCastingRights(
  castingSheet: readonly CharacterVoiceCast[],
): VoiceRightsAuditReport {
  const unverified = castingSheet
    .filter((c) => !c.rightsConsentVerified)
    .map((c) => c.characterId);
  return {
    ok: unverified.length === 0,
    unverifiedCharacterIds: Object.freeze(unverified),
    warningKo:
      unverified.length > 0
        ? `성우 라이선스·동의 확인이 필요한 캐릭터가 ${unverified.length}명 있습니다.`
        : null,
  };
}
