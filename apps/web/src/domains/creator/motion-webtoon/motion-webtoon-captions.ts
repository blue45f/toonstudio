/**
 * 모션 웹툰 자동 자막 트랙.
 *
 * 회차의 대사 데이터를 컷 타이밍에 매핑해 자막 큐를 만든다.
 * 타이밍의 단일 진실은 컷 모델이다 — 컷 길이(`direction.durationSeconds`)와
 * 대사의 컷 시작 기준 오프셋(`startOffsetSeconds`)만으로 계산하고,
 * 없는 타이밍을 균등 배분 같은 임시 규칙으로 지어내지 않는다.
 *
 * 큐 종료 시점 규칙 (명시 규칙):
 * - 같은 컷 안 다음 대사의 시작 시점이 이 대사의 시작보다 뒤면 그 시점까지.
 * - 아니면 컷 종료 시점까지.
 * - 컷 길이를 벗어난 오프셋(>= 컷 길이)의 대사는 재생 타임라인(buildTimeline)과
 *   동일하게 자막에서 제외하고 `skippedDialogueCount`로 센다. 감정 마크업을
 *   벗겨낸 뒤 빈 문자열인 대사도 같은 방식으로 제외·계수한다.
 */

import { stripEmotionMarkup } from "@/shared/voice/voice-emotion-markup";

import {
  clampCutDuration,
  type MotionEpisode,
} from "./motion-webtoon-model";

/** 자막 언어 — 화자 이름 표기에만 쓰인다 (대사 원문은 단일 언어). */
export type CaptionLanguage = "ko" | "en";

/** 자막 표시 위치. */
export type CaptionPosition = "bottom" | "top";

/** 자막 글자 크기 단계. */
export type CaptionSize = "small" | "medium" | "large";

/** 자막 스타일 — 위치는 VTT 내보내기에 반영되고, 크기는 앱 미리보기 전용이다. */
export interface CaptionStyle {
  readonly position: CaptionPosition;
  readonly size: CaptionSize;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  position: "bottom",
  size: "medium",
};

/** 자막 큐 하나. */
export interface CaptionCue {
  /** `${cutId}:${dialogueId}` — 편집 시 원본 대사를 찾기 위한 안정 키. */
  readonly id: string;
  readonly cutIndex: number;
  readonly cutId: string;
  readonly dialogueId: string;
  /** 등록되지 않은 캐릭터면 빈 문자열. */
  readonly speakerNameKo: string;
  readonly speakerNameEn: string;
  /** 감정 마크업을 벗기고 앞뒤 공백을 정리한 표시 문구. */
  readonly text: string;
  /** 회차 시작 기준 초. */
  readonly startSeconds: number;
  readonly endSeconds: number;
}

/** 자막 트랙 전체. */
export interface CaptionTrack {
  readonly cues: readonly CaptionCue[];
  readonly totalDurationSeconds: number;
  /** 컷 범위를 벗어났거나 비어 있어 자막에서 제외된 대사 수. */
  readonly skippedDialogueCount: number;
}

/**
 * 회차에서 자막 트랙을 만든다.
 * 컷 순서는 회차 배열 순서, 컷 시작점은 앞 컷 길이(clamp 적용)의 누적합이다.
 */
export function buildCaptionTrack(episode: MotionEpisode): CaptionTrack {
  const charactersById = new Map(episode.characters.map((c) => [c.id, c]));
  const cues: CaptionCue[] = [];
  let skippedDialogueCount = 0;
  let cursor = 0;

  episode.cuts.forEach((cut, cutIndex) => {
    const duration = clampCutDuration(cut.direction.durationSeconds);
    const cutStart = cursor;
    const cutEnd = cursor + duration;
    cursor = cutEnd;

    const placed = cut.dialogues
      .map((dialogue) => ({
        dialogue,
        offset: Math.max(0, dialogue.startOffsetSeconds),
        text: stripEmotionMarkup(dialogue.text).trim(),
      }))
      .filter((entry) => {
        if (entry.offset >= duration || entry.text.length === 0) {
          skippedDialogueCount += 1;
          return false;
        }
        return true;
      })
      .sort((a, b) => a.offset - b.offset);

    placed.forEach((entry, index) => {
      const startSeconds = cutStart + entry.offset;
      const nextStart = placed[index + 1] ? cutStart + placed[index + 1].offset : null;
      const endSeconds =
        nextStart !== null && nextStart > startSeconds
          ? Math.min(nextStart, cutEnd)
          : cutEnd;
      const character = charactersById.get(entry.dialogue.characterId);
      cues.push({
        id: `${cut.id}:${entry.dialogue.id}`,
        cutIndex,
        cutId: cut.id,
        dialogueId: entry.dialogue.id,
        speakerNameKo: character?.nameKo ?? "",
        speakerNameEn: character?.nameEn ?? "",
        text: entry.text,
        startSeconds,
        endSeconds,
      });
    });
  });

  return { cues, totalDurationSeconds: cursor, skippedDialogueCount };
}

/**
 * 자막 편집 반영 — 큐에서 고친 문구를 원본 대사 텍스트에 그대로 쓴다.
 * 자막은 대사에서 파생되므로, 텍스트를 고치면 자막·재생 자막이 함께 바뀐다.
 * (감정 마크업이 있던 대사를 자막에서 고치면 마크업 없는 문구로 교체된다.)
 */
export function updateCaptionDialogueText(
  episode: MotionEpisode,
  cutId: string,
  dialogueId: string,
  text: string,
): MotionEpisode {
  return {
    ...episode,
    cuts: episode.cuts.map((cut) =>
      cut.id === cutId
        ? {
            ...cut,
            dialogues: cut.dialogues.map((dialogue) =>
              dialogue.id === dialogueId ? { ...dialogue, text } : dialogue,
            ),
          }
        : cut,
    ),
  };
}

/** 초 → `HH:MM:SS<구분자>mmm` (SRT는 쉼표, VTT는 마침표). */
export function formatCaptionTimestamp(seconds: number, separator: "," | "."): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  const pad = (value: number, length: number) => String(value).padStart(length, "0");
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${separator}${pad(ms, 3)}`;
}

function cueTextForFile(cue: CaptionCue, lang: CaptionLanguage): string {
  const speaker = lang === "ko" ? cue.speakerNameKo : cue.speakerNameEn;
  return speaker ? `${speaker}: ${cue.text}` : cue.text;
}

/** SRT 직렬화. */
export function serializeCaptionsSrt(track: CaptionTrack, lang: CaptionLanguage): string {
  const blocks = track.cues.map((cue, index) =>
    [
      String(index + 1),
      `${formatCaptionTimestamp(cue.startSeconds, ",")} --> ${formatCaptionTimestamp(cue.endSeconds, ",")}`,
      cueTextForFile(cue, lang),
    ].join("\n"),
  );
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
}

function escapeVttText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** VTT 직렬화. 화자는 voice span으로, 위치 스타일은 cue line 설정으로 반영한다. */
export function serializeCaptionsVtt(
  track: CaptionTrack,
  lang: CaptionLanguage,
  style: CaptionStyle = DEFAULT_CAPTION_STYLE,
): string {
  const lineSetting = style.position === "top" ? " line:10%" : " line:90%";
  const blocks = track.cues.map((cue) => {
    const speaker = lang === "ko" ? cue.speakerNameKo : cue.speakerNameEn;
    const escaped = escapeVttText(cue.text);
    const body = speaker ? `<v ${escapeVttText(speaker)}>${escaped}</v>` : escaped;
    return [
      `${formatCaptionTimestamp(cue.startSeconds, ".")} --> ${formatCaptionTimestamp(cue.endSeconds, ".")}${lineSetting}`,
      body,
    ].join("\n");
  });
  return blocks.length > 0 ? `WEBVTT\n\n${blocks.join("\n\n")}\n` : "WEBVTT\n";
}

/** 자막 파일 이름 — 회차 제목에서 파일명에 쓸 수 없는 문자를 정리한다. */
export function captionFileName(episode: MotionEpisode, format: "srt" | "vtt"): string {
  const base = episode.titleKo
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base.length > 0 ? base : "motion-webtoon"}-captions.${format}`;
}
