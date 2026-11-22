/**
 * 9:16 숏폼·오디오 드라마 자막 큐 시트 생성기
 *
 * - 웹툰 컷의 대사·화자·감정·효과음 타임라인을 읽어 읽기 속도 기반 컷 지속시간을 자동 산출한다.
 * - 60초(기본값) 상한을 넘기지 않도록 릴스를 자동 분할하고, SRT/WebVTT/JSON 큐를 단조 증가 타임코드로 출력한다.
 * - 효과음 스템 합성은 같은 서브폴더의 `shorts-webaudio-sfx-scheduler.ts`와 연동한다.
 */

import {
  buildSfxEventsForSpan,
  inferLocalSfxPreset,
  LOCAL_WEBAUDIO_SFX_RECIPES,
  scheduleWebAudioSfxStems,
  type CutEmotionTone,
  type LocalSfxPresetId,
  type MinimalAudioBufferLike,
  type MinimalAudioNodeLike,
  type MinimalAudioParamLike,
  type MinimalBiquadFilterNodeLike,
  type MinimalBufferSourceNodeLike,
  type MinimalGainNodeLike,
  type MinimalOscillatorNodeLike,
  type MinimalWebAudioContextLike,
  type WebAudioFilterKind,
  type WebAudioOscillatorKind,
  type WebAudioSfxStemEvent,
  type WebAudioSynthRecipe,
  type WebtoonCutSfxTrigger,
} from "./shorts-webaudio-sfx-scheduler";

export {
  inferLocalSfxPreset,
  LOCAL_WEBAUDIO_SFX_RECIPES,
  scheduleWebAudioSfxStems,
};
export type {
  CutEmotionTone,
  LocalSfxPresetId,
  MinimalAudioBufferLike,
  MinimalAudioNodeLike,
  MinimalAudioParamLike,
  MinimalBiquadFilterNodeLike,
  MinimalBufferSourceNodeLike,
  MinimalGainNodeLike,
  MinimalOscillatorNodeLike,
  MinimalWebAudioContextLike,
  WebAudioFilterKind,
  WebAudioOscillatorKind,
  WebAudioSfxStemEvent,
  WebAudioSynthRecipe,
  WebtoonCutSfxTrigger,
};

export interface WebtoonCutDialogueLine {
  readonly id: string;
  readonly speaker?: string;
  readonly text: string;
  readonly emotion?: CutEmotionTone;
  readonly readingSpeedScale?: number;
}

export interface WebtoonCutTimelineItem {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly sceneLabel?: string;
  readonly dialogues: readonly WebtoonCutDialogueLine[];
  readonly sfx?: readonly WebtoonCutSfxTrigger[];
  readonly emotion?: CutEmotionTone;
  readonly minDurationMs?: number;
  readonly maxDurationMs?: number;
  readonly pauseAfterMs?: number;
  readonly focalPoint?: { readonly x: number; readonly y: number };
}

export interface ShortsCuePlannerOptions {
  readonly episodeTitle?: string;
  readonly maxReelDurationMs?: number;
  readonly charsPerSecond?: number;
  readonly minCueDurationMs?: number;
  readonly maxCueDurationMs?: number;
  readonly silentCutDurationMs?: number;
  readonly defaultGapMs?: number;
  readonly maxSubtitleLineChars?: number;
  readonly includeSpeakerPrefix?: boolean;
  readonly includeSfxCaptions?: boolean;
}

export interface ShortsViewportSpec {
  readonly aspectRatio: "9:16";
  readonly width: 1080;
  readonly height: 1920;
  readonly safeZoneTopPct: 14;
  readonly safeZoneBottomPct: 24;
}

export interface ShortsSubtitleCue {
  readonly index: number;
  readonly cueId: string;
  readonly cutId: string;
  readonly cutNumber: number;
  readonly speaker: string | null;
  readonly emotion: CutEmotionTone;
  readonly text: string;
  readonly formattedText: string;
  readonly isSfxCaption: boolean;
  readonly startMs: number;
  readonly endMs: number;
  readonly episodeStartMs: number;
  readonly episodeEndMs: number;
  readonly focalPoint: { readonly x: number; readonly y: number };
}

export interface ShortsCutTimingSpan {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly emotion: CutEmotionTone;
  readonly focalPoint: { readonly x: number; readonly y: number };
}

export interface ShortsReelPart {
  readonly partIndex: number;
  readonly partCount: number;
  readonly title: string;
  readonly viewport: ShortsViewportSpec;
  readonly totalDurationMs: number;
  readonly episodeStartMs: number;
  readonly episodeEndMs: number;
  readonly cutIds: readonly string[];
  readonly cutTimings: readonly ShortsCutTimingSpan[];
  readonly cues: readonly ShortsSubtitleCue[];
  readonly audioStems: readonly WebAudioSfxStemEvent[];
  readonly srt: string;
  readonly vtt: string;
  readonly json: string;
}

export interface ShortsAudioCuePlan {
  readonly episodeTitle: string;
  readonly maxReelDurationMs: number;
  readonly viewport: ShortsViewportSpec;
  readonly totalDurationMs: number;
  readonly totalCues: number;
  readonly totalAudioStems: number;
  readonly reels: readonly ShortsReelPart[];
  readonly warnings: readonly string[];
}

const DEFAULT_VIEWPORT: ShortsViewportSpec = Object.freeze({
  aspectRatio: "9:16",
  width: 1080,
  height: 1920,
  safeZoneTopPct: 14,
  safeZoneBottomPct: 24,
});

const EMOTION_TEMPO_SCALE: Readonly<Record<CutEmotionTone, number>> = Object.freeze({
  neutral: 1,
  tense: 0.94,
  joy: 0.96,
  sad: 1.22,
  shock: 0.88,
  whisper: 1.18,
  action: 0.84,
});

const EMOTION_DEFAULT_PAUSE_MS: Readonly<Record<CutEmotionTone, number>> = Object.freeze({
  neutral: 160,
  tense: 220,
  joy: 140,
  sad: 280,
  shock: 120,
  whisper: 260,
  action: 100,
});

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampFocalPoint(
  point?: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  if (!point) return { x: 0.5, y: 0.42 };
  return {
    x: Math.round(clampNumber(point.x, 0, 1) * 1000) / 1000,
    y: Math.round(clampNumber(point.y, 0, 1) * 1000) / 1000,
  };
}

/**
 * 9:16 세로 화면 가독성에 맞게 자막 문자열을 지정 글자 수 이내로 줄바꿈한다.
 */
export function wrapSubtitleLines(text: string, maxChars = 18): string {
  const safeMax = Math.max(8, Math.floor(maxChars));
  const paragraphs = text
    .replace(/\r\n/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const outputLines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/u);
    let current = "";

    for (const word of words) {
      if (word.length > safeMax) {
        if (current.length > 0) {
          outputLines.push(current);
          current = "";
        }
        for (let offset = 0; offset < word.length; offset += safeMax) {
          outputLines.push(word.slice(offset, offset + safeMax));
        }
        continue;
      }

      if (current.length === 0) {
        current = word;
      } else if (current.length + 1 + word.length <= safeMax) {
        current = `${current} ${word}`;
      } else {
        outputLines.push(current);
        current = word;
      }
    }

    if (current.length > 0) outputLines.push(current);
  }

  return outputLines.join("\n");
}

/**
 * 대사 글자 구성(한글/영문/문장부호)과 감정 템포를 반영해 자동 읽기 지속시간(ms)을 산출한다.
 */
export function estimateDialogueDurationMs(
  line: Pick<WebtoonCutDialogueLine, "text" | "emotion" | "readingSpeedScale">,
  options: Pick<
    ShortsCuePlannerOptions,
    "charsPerSecond" | "minCueDurationMs" | "maxCueDurationMs" | "maxReelDurationMs"
  > = {},
): number {
  const charsPerSecond = clampNumber(options.charsPerSecond ?? 5.5, 2.5, 14);
  const maxReelDurationMs = Math.max(5_000, Math.round(options.maxReelDurationMs ?? 60_000));
  const minCueDurationMs = Math.min(
    maxReelDurationMs,
    Math.max(400, Math.round(options.minCueDurationMs ?? 1_200)),
  );
  const maxCueDurationMs = Math.min(
    maxReelDurationMs,
    Math.max(minCueDurationMs, Math.round(options.maxCueDurationMs ?? 7_500)),
  );

  const trimmed = line.text.trim();
  if (trimmed.length === 0) return minCueDurationMs;

  let weightedChars = 0;
  let punctuationPauseMs = 0;

  for (const ch of trimmed) {
    if (/\s/u.test(ch)) {
      weightedChars += 0.15;
    } else if (/[.!?…]/u.test(ch)) {
      punctuationPauseMs += 140;
    } else if (/[,;:·]/u.test(ch)) {
      punctuationPauseMs += 70;
    } else if (/[\uAC00-\uD7A3\u3130-\u318F\u4E00-\u9FFF\u3040-\u30FF]/u.test(ch)) {
      weightedChars += 1.0;
    } else {
      weightedChars += 0.45;
    }
  }

  const emotion = line.emotion ?? "neutral";
  const tempoScale = EMOTION_TEMPO_SCALE[emotion];
  const speedScale = clampNumber(line.readingSpeedScale ?? 1, 0.5, 2.0);
  const rawMs =
    (((weightedChars / charsPerSecond) * 1000 + punctuationPauseMs + 420) * tempoScale) /
    speedScale;

  return Math.round(clampNumber(rawMs, minCueDurationMs, maxCueDurationMs));
}

function formatTimestamp(ms: number, decimalSeparator: "," | "."): string {
  const safeTotalMs = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
  const hours = String(Math.floor(safeTotalMs / 3_600_000)).padStart(2, "0");
  const minutes = String(Math.floor((safeTotalMs % 3_600_000) / 60_000)).padStart(2, "0");
  const seconds = String(Math.floor((safeTotalMs % 60_000) / 1_000)).padStart(2, "0");
  const millis = String(safeTotalMs % 1_000).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}${decimalSeparator}${millis}`;
}

/** SubRip(.srt) 표준 타임코드 (`HH:MM:SS,mmm`) 포맷터 */
export function formatSrtTimestamp(ms: number): string {
  return formatTimestamp(ms, ",");
}

/** WebVTT(.vtt) 표준 타임코드 (`HH:MM:SS.mmm`) 포맷터 */
export function formatVttTimestamp(ms: number): string {
  return formatTimestamp(ms, ".");
}

function serializeCuesToSrt(cues: readonly ShortsSubtitleCue[]): string {
  if (cues.length === 0) return "";
  return cues
    .map(
      (cue) =>
        `${cue.index}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}\n${cue.formattedText}`,
    )
    .join("\n\n");
}

function serializeCuesToVtt(cues: readonly ShortsSubtitleCue[]): string {
  const header = "WEBVTT\n\n";
  if (cues.length === 0) return header.trimEnd();
  const blocks = cues.map((cue) => {
    const body =
      cue.speaker && !cue.isSfxCaption
        ? `<v ${cue.speaker}>${cue.formattedText}</v>`
        : cue.formattedText;
    return `${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)} line:76% position:50% align:center\n${body}`;
  });
  return `${header}${blocks.join("\n\n")}`;
}

interface PreparedCueDraft {
  readonly cueId: string;
  readonly cutId: string;
  readonly cutNumber: number;
  readonly speaker: string | null;
  readonly emotion: CutEmotionTone;
  readonly text: string;
  readonly formattedText: string;
  readonly isSfxCaption: boolean;
  readonly durationMs: number;
  readonly focalPoint: { readonly x: number; readonly y: number };
}

interface PreparedCutBlock {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly emotion: CutEmotionTone;
  readonly focalPoint: { readonly x: number; readonly y: number };
  readonly cueDrafts: readonly PreparedCueDraft[];
  readonly totalDurationMs: number;
  readonly pauseAfterMs: number;
  readonly sfx: readonly WebtoonCutSfxTrigger[];
}

interface MutableReelAccumulator {
  cursorMs: number;
  episodeStartMs: number;
  cutIds: string[];
  cutTimings: ShortsCutTimingSpan[];
  cues: ShortsSubtitleCue[];
  audioStems: WebAudioSfxStemEvent[];
}

function createEmptyReelAccumulator(episodeStartMs: number): MutableReelAccumulator {
  return { cursorMs: 0, episodeStartMs, cutIds: [], cutTimings: [], cues: [], audioStems: [] };
}

function formatCueDisplayText(
  text: string,
  speaker: string | null,
  includeSpeakerPrefix: boolean,
  maxSubtitleLineChars: number,
  isSfxCaption: boolean,
): string {
  const wrapped = wrapSubtitleLines(text, maxSubtitleLineChars);
  if (isSfxCaption || !includeSpeakerPrefix || !speaker) return wrapped;
  return `${speaker}: ${wrapped}`;
}

function prepareCutBlock(
  cut: WebtoonCutTimelineItem,
  options: Required<ShortsCuePlannerOptions>,
): PreparedCutBlock {
  const cutEmotion: CutEmotionTone = cut.emotion ?? "neutral";
  const focalPoint = clampFocalPoint(cut.focalPoint);
  const pauseAfterMs = Math.max(
    options.defaultGapMs,
    Math.round(cut.pauseAfterMs ?? EMOTION_DEFAULT_PAUSE_MS[cutEmotion]),
  );

  const nonEmptyDialogues = cut.dialogues.filter((item) => item.text.trim().length > 0);
  let drafts: PreparedCueDraft[] = [];

  if (nonEmptyDialogues.length > 0) {
    drafts = nonEmptyDialogues.map((line) => {
      const speaker = line.speaker?.trim() || null;
      const emotion = line.emotion ?? cutEmotion;
      const durationMs = estimateDialogueDurationMs(
        { text: line.text, emotion, readingSpeedScale: line.readingSpeedScale },
        options,
      );
      return {
        cueId: line.id,
        cutId: cut.cutId,
        cutNumber: cut.cutNumber,
        speaker,
        emotion,
        text: line.text.trim(),
        formattedText: formatCueDisplayText(
          line.text.trim(),
          speaker,
          options.includeSpeakerPrefix,
          options.maxSubtitleLineChars,
          false,
        ),
        isSfxCaption: false,
        durationMs,
        focalPoint,
      };
    });
  } else {
    const sfxList = cut.sfx ?? [];
    const baseSilentMs = Math.round(
      clampNumber(
        cut.minDurationMs ?? options.silentCutDurationMs,
        500,
        Math.min(cut.maxDurationMs ?? options.maxReelDurationMs, options.maxReelDurationMs),
      ),
    );
    if (sfxList.length > 0 && options.includeSfxCaptions) {
      const caption = `[${sfxList.map((item) => item.label.trim()).filter(Boolean).join(" · ")}]`;
      drafts = [
        {
          cueId: `${cut.cutId}-sfx-caption`,
          cutId: cut.cutId,
          cutNumber: cut.cutNumber,
          speaker: null,
          emotion: cutEmotion,
          text: caption,
          formattedText: wrapSubtitleLines(caption, options.maxSubtitleLineChars),
          isSfxCaption: true,
          durationMs: baseSilentMs,
          focalPoint,
        },
      ];
    }
  }

  let totalDurationMs =
    drafts.length > 0
      ? drafts.reduce((sum, item) => sum + item.durationMs, 0) +
        Math.max(0, drafts.length - 1) * options.defaultGapMs
      : Math.round(
          clampNumber(
            cut.minDurationMs ?? options.silentCutDurationMs,
            500,
            Math.min(cut.maxDurationMs ?? options.maxReelDurationMs, options.maxReelDurationMs),
          ),
        );

  if (cut.minDurationMs !== undefined && totalDurationMs < cut.minDurationMs) {
    const boundedMin = Math.min(Math.round(cut.minDurationMs), options.maxReelDurationMs);
    const delta = boundedMin - totalDurationMs;
    if (drafts.length > 0 && delta > 0) {
      const last = drafts[drafts.length - 1];
      drafts = [
        ...drafts.slice(0, -1),
        { ...last, durationMs: Math.min(options.maxReelDurationMs, last.durationMs + delta) },
      ];
    }
    totalDurationMs = boundedMin;
  }

  if (cut.maxDurationMs !== undefined && totalDurationMs > cut.maxDurationMs && drafts.length > 0) {
    const boundedMax = Math.max(500, Math.min(Math.round(cut.maxDurationMs), options.maxReelDurationMs));
    const gapTotal = Math.max(0, drafts.length - 1) * options.defaultGapMs;
    const availableForText = Math.max(drafts.length * 350, boundedMax - gapTotal);
    const rawTextTotal = drafts.reduce((sum, item) => sum + item.durationMs, 0);
    const scale = rawTextTotal > 0 ? availableForText / rawTextTotal : 1;
    drafts = drafts.map((item) => ({
      ...item,
      durationMs: Math.max(350, Math.round(item.durationMs * scale)),
    }));
    totalDurationMs = drafts.reduce((sum, item) => sum + item.durationMs, 0) + gapTotal;
  }

  return {
    cutId: cut.cutId,
    cutNumber: cut.cutNumber,
    emotion: cutEmotion,
    focalPoint,
    cueDrafts: drafts,
    totalDurationMs,
    pauseAfterMs,
    sfx: cut.sfx ?? [],
  };
}

function appendCueToReel(
  acc: MutableReelAccumulator,
  draft: PreparedCueDraft,
  startMs: number,
  endMs: number,
): void {
  acc.cues.push({
    index: acc.cues.length + 1,
    cueId: draft.cueId,
    cutId: draft.cutId,
    cutNumber: draft.cutNumber,
    speaker: draft.speaker,
    emotion: draft.emotion,
    text: draft.text,
    formattedText: draft.formattedText,
    isSfxCaption: draft.isSfxCaption,
    startMs,
    endMs,
    episodeStartMs: acc.episodeStartMs + startMs,
    episodeEndMs: acc.episodeStartMs + endMs,
    focalPoint: draft.focalPoint,
  });
}

/**
 * 웹툰 컷 타임라인을 9:16 숏폼 자막 큐(SRT/WebVTT/JSON)와 ₩0 로컬 WebAudio 효과음 스템으로 변환한다.
 */
export function planShortsAudioCueSheet(
  cuts: readonly WebtoonCutTimelineItem[],
  rawOptions: ShortsCuePlannerOptions = {},
): ShortsAudioCuePlan {
  const maxReelDurationMs = Math.max(5_000, Math.round(rawOptions.maxReelDurationMs ?? 60_000));
  const options: Required<ShortsCuePlannerOptions> = {
    episodeTitle: rawOptions.episodeTitle?.trim() || "에피소드 숏폼",
    maxReelDurationMs,
    charsPerSecond: clampNumber(rawOptions.charsPerSecond ?? 5.5, 2.5, 14),
    minCueDurationMs: Math.min(maxReelDurationMs, Math.max(400, Math.round(rawOptions.minCueDurationMs ?? 1_200))),
    maxCueDurationMs: Math.min(maxReelDurationMs, Math.max(1_200, Math.round(rawOptions.maxCueDurationMs ?? 7_500))),
    silentCutDurationMs: Math.min(maxReelDurationMs, Math.max(500, Math.round(rawOptions.silentCutDurationMs ?? 1_800))),
    defaultGapMs: Math.max(40, Math.round(rawOptions.defaultGapMs ?? 120)),
    maxSubtitleLineChars: Math.max(8, Math.round(rawOptions.maxSubtitleLineChars ?? 18)),
    includeSpeakerPrefix: rawOptions.includeSpeakerPrefix ?? true,
    includeSfxCaptions: rawOptions.includeSfxCaptions ?? true,
  };

  if (cuts.length === 0) {
    return {
      episodeTitle: options.episodeTitle,
      maxReelDurationMs,
      viewport: DEFAULT_VIEWPORT,
      totalDurationMs: 0,
      totalCues: 0,
      totalAudioStems: 0,
      reels: [],
      warnings: ["입력된 컷이 없습니다. 최소 1개 이상의 웹툰 컷을 추가해 주세요."],
    };
  }

  const warnings: string[] = [];
  const preparedBlocks = cuts.map((cut) => prepareCutBlock(cut, options));
  const accumulators: MutableReelAccumulator[] = [];
  let current = createEmptyReelAccumulator(0);

  const commitCurrentReel = (): void => {
    if (current.cursorMs === 0 && current.cutIds.length === 0) return;
    accumulators.push(current);
    current = createEmptyReelAccumulator(current.episodeStartMs + current.cursorMs);
  };

  for (const block of preparedBlocks) {
    const leadingGap = current.cursorMs > 0 ? options.defaultGapMs : 0;

    if (block.totalDurationMs <= maxReelDurationMs) {
      if (current.cursorMs > 0 && current.cursorMs + leadingGap + block.totalDurationMs > maxReelDurationMs) {
        commitCurrentReel();
      }
      const cutStartMs = current.cursorMs > 0 ? current.cursorMs + options.defaultGapMs : 0;
      let localCursor = cutStartMs;

      for (let i = 0; i < block.cueDrafts.length; i += 1) {
        if (i > 0) localCursor += options.defaultGapMs;
        const draft = block.cueDrafts[i];
        const cueEndMs = Math.min(maxReelDurationMs, localCursor + draft.durationMs);
        const safeStartMs = Math.min(localCursor, Math.max(0, cueEndMs - 1));
        appendCueToReel(current, draft, safeStartMs, cueEndMs);
        localCursor = cueEndMs;
      }

      const cutEndMs =
        block.cueDrafts.length > 0
          ? localCursor
          : Math.min(maxReelDurationMs, cutStartMs + block.totalDurationMs);

      current.cutIds.push(block.cutId);
      current.cutTimings.push({
        cutId: block.cutId,
        cutNumber: block.cutNumber,
        startMs: cutStartMs,
        endMs: cutEndMs,
        emotion: block.emotion,
        focalPoint: block.focalPoint,
      });
      current.audioStems.push(
        ...buildSfxEventsForSpan(
          block.cutId,
          block.cutNumber,
          block.emotion,
          block.sfx,
          cutStartMs,
          Math.max(100, cutEndMs - cutStartMs),
          maxReelDurationMs,
        ),
      );
      current.cursorMs = Math.min(maxReelDurationMs, cutEndMs);
      continue;
    }

    warnings.push(
      `컷 #${block.cutNumber}(${block.cutId}) 분량이 ${Math.round(maxReelDurationMs / 1000)}초 상한을 넘어 대사 단위로 자동 분할했습니다.`,
    );
    commitCurrentReel();

    let sfxPlaced = false;
    for (const draft of block.cueDrafts) {
      const clampedDuration = Math.min(draft.durationMs, maxReelDurationMs);
      const nextGap = current.cursorMs > 0 ? options.defaultGapMs : 0;
      if (current.cursorMs > 0 && current.cursorMs + nextGap + clampedDuration > maxReelDurationMs) {
        commitCurrentReel();
      }
      const startMs = current.cursorMs > 0 ? current.cursorMs + options.defaultGapMs : 0;
      const endMs = Math.min(maxReelDurationMs, startMs + clampedDuration);
      appendCueToReel(current, draft, startMs, endMs);
      if (!current.cutIds.includes(block.cutId)) current.cutIds.push(block.cutId);
      current.cutTimings.push({
        cutId: block.cutId,
        cutNumber: block.cutNumber,
        startMs,
        endMs,
        emotion: block.emotion,
        focalPoint: block.focalPoint,
      });
      if (!sfxPlaced && block.sfx.length > 0) {
        current.audioStems.push(
          ...buildSfxEventsForSpan(
            block.cutId,
            block.cutNumber,
            block.emotion,
            block.sfx,
            startMs,
            Math.max(100, endMs - startMs),
            maxReelDurationMs,
          ),
        );
        sfxPlaced = true;
      }
      current.cursorMs = endMs;
    }
  }

  commitCurrentReel();

  const partCount = accumulators.length;
  const reels: ShortsReelPart[] = accumulators.map((acc, index) => {
    const partIndex = index + 1;
    const title =
      partCount > 1 ? `${options.episodeTitle} (${partIndex}/${partCount}편)` : options.episodeTitle;
    const sortedStems = [...acc.audioStems].sort((a, b) => a.startMs - b.startMs);
    const srt = serializeCuesToSrt(acc.cues);
    const vtt = serializeCuesToVtt(acc.cues);
    const jsonPayload = {
      episodeTitle: options.episodeTitle,
      title,
      partIndex,
      partCount,
      viewport: DEFAULT_VIEWPORT,
      totalDurationMs: acc.cursorMs,
      episodeStartMs: acc.episodeStartMs,
      episodeEndMs: acc.episodeStartMs + acc.cursorMs,
      cutIds: acc.cutIds,
      cues: acc.cues,
      audioStems: sortedStems,
    };

    return {
      partIndex,
      partCount,
      title,
      viewport: DEFAULT_VIEWPORT,
      totalDurationMs: acc.cursorMs,
      episodeStartMs: acc.episodeStartMs,
      episodeEndMs: acc.episodeStartMs + acc.cursorMs,
      cutIds: acc.cutIds,
      cutTimings: acc.cutTimings,
      cues: acc.cues,
      audioStems: sortedStems,
      srt,
      vtt,
      json: JSON.stringify(jsonPayload, null, 2),
    };
  });

  if (reels.length > 1) {
    warnings.push(
      `전체 분량이 ${Math.round(maxReelDurationMs / 1000)}초 상한을 초과해 ${reels.length}개 쇼츠 파트로 자동 분할했습니다.`,
    );
  }

  return {
    episodeTitle: options.episodeTitle,
    maxReelDurationMs,
    viewport: DEFAULT_VIEWPORT,
    totalDurationMs: reels.reduce((sum, reel) => sum + reel.totalDurationMs, 0),
    totalCues: reels.reduce((sum, reel) => sum + reel.cues.length, 0),
    totalAudioStems: reels.reduce((sum, reel) => sum + reel.audioStems.length, 0),
    reels,
    warnings,
  };
}
