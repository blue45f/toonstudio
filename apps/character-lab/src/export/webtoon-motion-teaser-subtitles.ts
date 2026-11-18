/** 모션 스케줄에 맞춘 다국어 WebVTT 자막과 타임코드를 생성한다. */
import {
  DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
  resolveSfxGlyphByLocale,
} from "./webtoon-strip-composer";

import type { MotionTeaserSchedule } from "./webtoon-motion-teaser-schedule";
import type {
  WebtoonDialogueLocale,
  WebtoonStripBubbleShapes,
  WebtoonStripDialogueLines,
  WebtoonStripSfxStamps,
  WebtoonStripSpeakerTarget,
  WebtoonStripSpeakerTargets,
} from "./webtoon-strip-composer";

export interface BuildMotionTeaserWebVttOptions {
  readonly episodeTitleKo?: string;
  readonly locale?: WebtoonDialogueLocale;
  readonly dialogueLines?: WebtoonStripDialogueLines;
  readonly bubbleShapes?: WebtoonStripBubbleShapes;
  readonly speakerTargets?: WebtoonStripSpeakerTargets;
  readonly sfxStamps?: WebtoonStripSfxStamps;
  readonly cueOffsetMs?: number;
  readonly cueIndexOffset?: number;
  readonly omitHeader?: boolean;
}

/**
 * 밀리초 타임스탬프를 표준 `WebVTT` 시각 문자열(`HH:MM:SS.mmm`)로 변환한다.
 */
export function formatWebVttTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1_000);
  const millis = clamped % 1_000;
  const pad2 = (n: number): string => String(n).padStart(2, "0");
  const pad3 = (n: number): string => String(n).padStart(3, "0");
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`;
}

function resolveVoiceLabelByLocale(
  cutIndex: number,
  speakerTarget: WebtoonStripSpeakerTarget,
  shape: WebtoonStripBubbleShapes[number],
  locale: WebtoonDialogueLocale,
): string {
  if (shape === "monologue-box") {
    return locale === "en" ? "Narration" : locale === "ja" ? "モノローグ" : "내레이션";
  }
  const effectivePartner =
    speakerTarget === "partner" || (speakerTarget === "auto" && cutIndex % 2 === 1);
  if (locale === "en") return effectivePartner ? "Partner" : "Lead";
  if (locale === "ja") return effectivePartner ? "相手役" : "主演";
  return effectivePartner ? "상대역" : "주연";
}

function sanitizeVttCueText(raw: string): string {
  return raw.replace(/-->/gu, "→").replace(/[\r\n]+/gu, " ").trim();
}

/**
 * 9:16 모션 코믹 스케줄(`dwellStartMs`..`dwellEndMs`)과 다국어 대사·발화자·효과음을 동기화한 `WebVTT (.vtt)` 자막 문자열을 생성한다.
 */
export function buildMotionTeaserWebVtt(
  schedule: MotionTeaserSchedule,
  options: BuildMotionTeaserWebVttOptions = {},
): string {
  const locale = options.locale ?? "ko";
  const lines = options.dialogueLines ?? DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES;
  const shapes = options.bubbleShapes ?? DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES;
  const speakers = options.speakerTargets ?? DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS;
  const sfxStamps = options.sfxStamps ?? DEFAULT_WEBTOON_STRIP_SFX_STAMPS;
  const speed = Math.max(0.25, schedule.speed);
  const offsetMs = Math.max(0, Math.round(options.cueOffsetMs ?? 0));
  const cueIdxOffset = Math.max(0, Math.floor(options.cueIndexOffset ?? 0));

  const outLines: string[] = [];
  if (!options.omitHeader) {
    outLines.push("WEBVTT");
    const titleNote = options.episodeTitleKo?.trim() ? ` — ${sanitizeVttCueText(options.episodeTitleKo)}` : "";
    outLines.push(`NOTE ToonStudio 9:16 Motion Comic Subtitles (${locale.toUpperCase()})${titleNote}`);
    outLines.push("");
  }

  let cueSeq = cueIdxOffset + 1;
  for (let i = 0; i < 4; i += 1) {
    const cutIdx = i as 0 | 1 | 2 | 3;
    const seg = schedule.timeline.segments[cutIdx]!;
    const startMs = offsetMs + Math.round(seg.dwellStartMs / speed);
    const endMs = Math.max(startMs + 250, offsetMs + Math.round(seg.dwellEndMs / speed));
    const shape = shapes[cutIdx];
    const dialogue = shape !== "none" ? sanitizeVttCueText(lines[cutIdx]) : "";
    const stamp = sfxStamps[cutIdx];
    const sfxTag =
      stamp !== "none"
        ? locale === "en"
          ? `[SFX: ${resolveSfxGlyphByLocale(stamp, "en")}]`
          : locale === "ja"
            ? `[効果音: ${resolveSfxGlyphByLocale(stamp, "ja")}]`
            : `[효과음: ${resolveSfxGlyphByLocale(stamp, "ko")}]`
        : "";

    if (!dialogue && !sfxTag) continue;
    const voice = resolveVoiceLabelByLocale(cutIdx, speakers[cutIdx], shape, locale);
    const payload = dialogue && sfxTag ? `${sfxTag} ${dialogue}` : dialogue || sfxTag;

    outLines.push(`cut-${cueSeq}`);
    outLines.push(`${formatWebVttTimestamp(startMs)} --> ${formatWebVttTimestamp(endMs)} line:86% align:center`);
    outLines.push(`<v ${voice}>${payload}`);
    outLines.push("");
    cueSeq += 1;
  }

  return `${outLines.join("\n").trimEnd()}\n`;
}
