/**
 * studio-animatic-subtitles.ts — 애니매틱 자막 트랙 (순수 모델)
 *
 * 애니매틱 타임라인(studio-animatic-timeline)의 컷별 대사 cue는 이미 있으나
 * 자막으로 다루는 층이 없었다. 이 모듈은 회차 대사를 절대 시간 자막 큐로
 * 변환하고, 타이밍 편집(시작·끝 이동), SRT·WebVTT 내보내기와 SRT·WebVTT
 * 가져오기(왕복)를 제공한다. FilmCraft식 자막 트랙·형식 입출력의 ToonStudio 판.
 *
 * 경계:
 * - 시작 시각은 타임라인 cue의 offsetMs가 정본이다. 편집한 시작 시각은
 *   applyStudioAnimaticSubtitleTiming으로 문서 cue에 되돌릴 수 있다.
 * - 끝 시각(표시 길이)은 타임라인 cue에 저장 필드가 없어 자막 트랙 층에서만
 *   유지한다. 기본값은 읽기 속도 기반 추정이며 컷 경계를 넘지 않는다.
 * - 효과음(sfx) cue는 기본 제외하고, 옵션을 켜면 함께 변환한다.
 */
import {
  patchStudioAnimaticCue,
  planStudioAnimaticPreview,
  type StudioAnimaticCueKind,
  type StudioAnimaticDocument,
  type StudioAnimaticFailure,
} from "../studio-animatic-timeline";

export type StudioAnimaticSubtitleFormat = "srt" | "vtt";

/** 편집으로 허용하는 최소 표시 길이. 이보다 짧으면 읽을 수 없다. */
export const STUDIO_ANIMATIC_SUBTITLE_MIN_DURATION_MS = 400;
/** 자동 변환 시 기본 최소 표시 길이. */
export const STUDIO_ANIMATIC_SUBTITLE_DEFAULT_MIN_DURATION_MS = 1_200;
/** 읽기 속도 기본값 (초당 글자 수, 공백 포함). */
export const STUDIO_ANIMATIC_SUBTITLE_DEFAULT_CHARS_PER_SECOND = 12;

export interface StudioAnimaticSubtitleCue {
  /** `${segmentId}:${cueId}` — 트랙 안에서 유일한 편집 식별자. */
  readonly id: string;
  readonly segmentId: string;
  readonly cueId: string;
  readonly segmentIndex: number;
  readonly kind: StudioAnimaticCueKind;
  readonly speaker?: string;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface StudioAnimaticSubtitleBuildOptions {
  /** true면 효과음 cue도 자막으로 포함한다. 기본 false (대사만). */
  readonly includeSfx?: boolean;
  readonly minDurationMs?: number;
  readonly charsPerSecond?: number;
}

export interface StudioAnimaticSubtitleFile {
  readonly ok: true;
  readonly format: StudioAnimaticSubtitleFormat;
  readonly content: string;
  readonly bytes: number;
  readonly cues: readonly StudioAnimaticSubtitleCue[];
}

export interface StudioAnimaticSubtitleDraft {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly speaker?: string;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function utf8Bytes(value: string): number {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(value).byteLength;
  }
  return value.length * 3;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * 큐 목록을 자막 트랙 규칙으로 정규화한다: 시작 순 정렬, 음수 제거,
 * 최소 길이 보장, 겹침은 다음 큐 시작에서 잘라 해결한다.
 */
export function normalizeStudioAnimaticSubtitleTrack(
  cues: readonly StudioAnimaticSubtitleCue[]
): StudioAnimaticSubtitleCue[] {
  const sorted = cues
    .filter((cue) => cue.text.trim().length > 0 && Number.isFinite(cue.startMs))
    .map((cue) => {
      const startMs = Math.max(0, Math.round(cue.startMs));
      const endMs = Math.max(
        startMs + STUDIO_ANIMATIC_SUBTITLE_MIN_DURATION_MS,
        Math.round(Number.isFinite(cue.endMs) ? cue.endMs : startMs)
      );
      return { ...cue, startMs, endMs };
    })
    .sort(
      (left, right) =>
        left.startMs - right.startMs
        || left.segmentIndex - right.segmentIndex
        || compareCodeUnits(left.id, right.id)
    );
  return sorted.map((cue, index) => {
    const next = sorted[index + 1];
    if (!next || cue.endMs <= next.startMs) return cue;
    const endMs = Math.max(
      cue.startMs + STUDIO_ANIMATIC_SUBTITLE_MIN_DURATION_MS,
      next.startMs
    );
    return { ...cue, endMs: Math.max(endMs, cue.startMs + 1) };
  });
}

/**
 * 애니매틱 문서의 대사 cue를 절대 시간 자막 큐로 변환한다.
 * 컷 경계는 미리보기 계획(plan)이 정본이며, 자막은 자기 컷을 벗어나지 않는다.
 */
export function buildStudioAnimaticSubtitleTrack(
  document: StudioAnimaticDocument,
  options: StudioAnimaticSubtitleBuildOptions = {}
): { readonly ok: true; readonly cues: readonly StudioAnimaticSubtitleCue[] } | StudioAnimaticFailure {
  const planned = planStudioAnimaticPreview(document);
  if (!planned.ok) return planned;
  const minDurationMs = Math.max(
    STUDIO_ANIMATIC_SUBTITLE_MIN_DURATION_MS,
    Math.round(options.minDurationMs ?? STUDIO_ANIMATIC_SUBTITLE_DEFAULT_MIN_DURATION_MS)
  );
  const charsPerSecond = clamp(
    options.charsPerSecond ?? STUDIO_ANIMATIC_SUBTITLE_DEFAULT_CHARS_PER_SECOND,
    1,
    60
  );
  const cues: StudioAnimaticSubtitleCue[] = [];
  for (const segment of document.segments) {
    const window = planned.plan.segments.find((item) => item.segmentId === segment.id);
    if (!window) continue;
    const ordered = [...segment.cues].sort(
      (left, right) => left.offsetMs - right.offsetMs || compareCodeUnits(left.id, right.id)
    );
    for (const cue of ordered) {
      if (cue.kind === "sfx" && !options.includeSfx) continue;
      const startMs = clamp(window.startMs + cue.offsetMs, window.startMs, window.endMs);
      const readingMs = Math.ceil((cue.text.length / charsPerSecond) * 1_000);
      const endMs = Math.min(window.endMs, startMs + Math.max(minDurationMs, readingMs));
      cues.push({
        id: `${segment.id}:${cue.id}`,
        segmentId: segment.id,
        cueId: cue.id,
        segmentIndex: window.index,
        kind: cue.kind,
        speaker: cue.speaker,
        text: cue.text,
        startMs: Math.round(startMs),
        endMs: Math.round(Math.max(startMs + 1, endMs)),
      });
    }
  }
  return { ok: true, cues: normalizeStudioAnimaticSubtitleTrack(cues) };
}

/** 자막 큐 하나의 타이밍·문구를 고친 새 트랙. 없는 id면 원래 트랙을 돌려준다. */
export function retimeStudioAnimaticSubtitleCue(
  cues: readonly StudioAnimaticSubtitleCue[],
  id: string,
  patch: Partial<Pick<StudioAnimaticSubtitleCue, "startMs" | "endMs" | "text" | "speaker">>
): StudioAnimaticSubtitleCue[] {
  if (!cues.some((cue) => cue.id === id)) return [...cues];
  return normalizeStudioAnimaticSubtitleTrack(
    cues.map((cue) => {
      if (cue.id !== id) return cue;
      const text = (patch.text ?? cue.text).replace(/\s+/gu, " ").trim();
      return {
        ...cue,
        startMs: patch.startMs ?? cue.startMs,
        endMs: patch.endMs ?? cue.endMs,
        text: text || cue.text,
        speaker:
          patch.speaker === undefined
            ? cue.speaker
            : patch.speaker.replace(/\s+/gu, " ").trim() || undefined,
      };
    })
  );
}

/** 트랙 전체를 deltaMs만큼 이동한 새 트랙 (0 아래로는 가지 않는다). */
export function shiftStudioAnimaticSubtitleTrack(
  cues: readonly StudioAnimaticSubtitleCue[],
  deltaMs: number
): StudioAnimaticSubtitleCue[] {
  const delta = Math.round(Number.isFinite(deltaMs) ? deltaMs : 0);
  if (delta === 0) return [...cues];
  return normalizeStudioAnimaticSubtitleTrack(
    cues.map((cue) => ({ ...cue, startMs: cue.startMs + delta, endMs: cue.endMs + delta }))
  );
}

/**
 * 편집한 자막 시작 시각을 애니매틱 문서 cue의 offsetMs에 되돌린다.
 * 끝 시각은 문서 cue에 저장 필드가 없어 반영되지 않는다(모듈 머리말 참조).
 */
export function applyStudioAnimaticSubtitleTiming(
  document: StudioAnimaticDocument,
  cues: readonly StudioAnimaticSubtitleCue[]
): StudioAnimaticDocument {
  const planned = planStudioAnimaticPreview(document);
  if (!planned.ok) return document;
  const startBySegment = new Map(planned.plan.segments.map((item) => [item.segmentId, item.startMs]));
  let next = document;
  for (const cue of cues) {
    const segmentStart = startBySegment.get(cue.segmentId);
    if (segmentStart === undefined) continue;
    next = patchStudioAnimaticCue(next, cue.segmentId, cue.cueId, {
      offsetMs: Math.max(0, Math.round(cue.startMs - segmentStart)),
    });
  }
  return next;
}

/** SRT는 쉼표, WebVTT는 마침표로 밀리초를 구분한다. 시간은 2자리 이상. */
export function formatStudioAnimaticSubtitleTimestamp(ms: number, format: StudioAnimaticSubtitleFormat): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const millis = total % 1_000;
  const separator = format === "srt" ? "," : ".";
  const pad = (value: number, length: number) => String(value).padStart(length, "0");
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}${separator}${pad(millis, 3)}`;
}

function srtText(cue: StudioAnimaticSubtitleCue): string {
  const body = cue.text.replace(/\r\n?/gu, "\n");
  return cue.speaker ? `${cue.speaker}: ${body}` : body;
}

function escapeVttText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/-->/gu, "--&gt;");
}

function vttText(cue: StudioAnimaticSubtitleCue): string {
  const body = escapeVttText(cue.text.replace(/\r\n?/gu, "\n"));
  if (!cue.speaker) return body;
  const speaker = escapeVttText(cue.speaker);
  return `<v ${speaker}>${body}</v>`;
}

export function exportStudioAnimaticSubtitlesToSrt(cues: readonly StudioAnimaticSubtitleCue[]): string {
  const normalized = normalizeStudioAnimaticSubtitleTrack(cues);
  if (normalized.length === 0) return "";
  const blocks = normalized.map(
    (cue, index) =>
      `${index + 1}\n${formatStudioAnimaticSubtitleTimestamp(cue.startMs, "srt")} --> ${formatStudioAnimaticSubtitleTimestamp(cue.endMs, "srt")}\n${srtText(cue)}`
  );
  return `${blocks.join("\n\n")}\n`;
}

export function exportStudioAnimaticSubtitlesToVtt(cues: readonly StudioAnimaticSubtitleCue[]): string {
  const normalized = normalizeStudioAnimaticSubtitleTrack(cues);
  const blocks = normalized.map(
    (cue, index) =>
      `${index + 1}\n${formatStudioAnimaticSubtitleTimestamp(cue.startMs, "vtt")} --> ${formatStudioAnimaticSubtitleTimestamp(cue.endMs, "vtt")}\n${vttText(cue)}`
  );
  return blocks.length === 0 ? "WEBVTT\n" : `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

/** 문서에서 바로 자막 파일 내용을 만든다. 대사 큐가 없으면 실패가 아니라 빈 파일이다. */
export function buildStudioAnimaticSubtitleFile(
  document: StudioAnimaticDocument,
  format: StudioAnimaticSubtitleFormat,
  options: StudioAnimaticSubtitleBuildOptions = {}
): StudioAnimaticSubtitleFile | StudioAnimaticFailure {
  const track = buildStudioAnimaticSubtitleTrack(document, options);
  if (!track.ok) return track;
  return buildStudioAnimaticSubtitleFileFromTrack(track.cues, format);
}

/** 편집된 트랙(타이밍 수정 포함)에서 자막 파일 내용을 만든다. */
export function buildStudioAnimaticSubtitleFileFromTrack(
  cues: readonly StudioAnimaticSubtitleCue[],
  format: StudioAnimaticSubtitleFormat
): StudioAnimaticSubtitleFile {
  const normalized = normalizeStudioAnimaticSubtitleTrack(cues);
  const content =
    format === "srt"
      ? exportStudioAnimaticSubtitlesToSrt(normalized)
      : exportStudioAnimaticSubtitlesToVtt(normalized);
  return { ok: true, format, content, bytes: utf8Bytes(content), cues: normalized };
}

const TIMESTAMP_PATTERN =
  /(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/u;

function parseTimestamp(value: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(value.trim());
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number((match[4] ?? "0").padEnd(3, "0"));
  if (minutes > 59 || seconds > 59) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1_000 + millis;
}

/**
 * WebVTT 큐 본문의 태그(`<b>`, `<c.yellow>`, `<00:00:01.500>` 등)를 지운다. `/<[^>]+>/g` 와 같은 결과다.
 * 그 식은 닫는 `>` 가 없이 `<` 만 길게 이어진 큐에서 시작점마다 큐 끝까지 다시 읽어 입력 길이의 제곱 시간이 된다
 * (CodeQL js/polynomial-redos). 자막 파일은 번역가·협업자에게서 받는 바깥 파일이라 큐 하나의 크기를 통제하지 못한다.
 * 뒤에 `>` 가 더 없으면 남은 `<` 는 모두 짝이 없으므로 바로 끝낸다.
 */
function stripCueTags(value: string): string {
  let out = "";
  let cursor = 0;
  for (let open = value.indexOf("<"); open >= 0; open = value.indexOf("<", cursor)) {
    const close = value.indexOf(">", open + 1);
    if (close < 0) break;
    if (close === open + 1) {
      // `<>` 는 태그가 아니다(태그 이름이 한 글자 이상 있어야 한다). 여는 꺾쇠만 넘기고 이어서 본다.
      out += value.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }
    out += value.slice(cursor, open);
    cursor = close + 1;
  }
  return out + value.slice(cursor);
}

function parseCueText(lines: readonly string[], format: StudioAnimaticSubtitleFormat): { text: string; speaker?: string } {
  const joined = lines.join("\n").trim();
  if (format === "vtt") {
    const voice = /^<v\s+([^>]+)>([\s\S]*?)<\/v>$/u.exec(joined);
    if (voice) {
      return {
        speaker: voice[1]!.replace(/&amp;/gu, "&").trim() || undefined,
        text: voice[2]!
          .replace(/&lt;/gu, "<")
          .replace(/&gt;/gu, ">")
          .replace(/&amp;/gu, "&")
          .trim(),
      };
    }
    return {
      text: stripCueTags(joined)
        .replace(/&lt;/gu, "<")
        .replace(/&gt;/gu, ">")
        .replace(/&amp;/gu, "&")
        .trim(),
    };
  }
  const speakerMatch = /^([^:\n]{1,40}):\s+([\s\S]+)$/u.exec(joined);
  if (speakerMatch) return { speaker: speakerMatch[1]!.trim(), text: speakerMatch[2]!.trim() };
  return { text: joined };
}

/**
 * SRT·WebVTT 자막 파일을 자막 초안 목록으로 읽는다 (내보내기의 역방향).
 * 형식을 명시하지 않으면 WEBVTT 머리말·마침표 타임스탬프로 판별한다.
 */
export function parseStudioAnimaticSubtitles(
  raw: string,
  format?: StudioAnimaticSubtitleFormat
): { readonly ok: true; readonly format: StudioAnimaticSubtitleFormat; readonly cues: readonly StudioAnimaticSubtitleDraft[] } | StudioAnimaticFailure {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "자막 파일 내용이 비어 있습니다." };
  }
  const resolved: StudioAnimaticSubtitleFormat =
    format ?? (/^\uFEFF?WEBVTT/iu.test(raw.trimStart()) ? "vtt" : "srt");
  const lines = raw.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").split("\n");
  const drafts: StudioAnimaticSubtitleDraft[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.includes("-->")) {
      index += 1;
      continue;
    }
    const [startRaw, endRaw] = line.split("-->");
    const startMs = startRaw !== undefined ? parseTimestamp(startRaw) : null;
    // WebVTT는 끝 시각 뒤에 cue settings(align: 등)가 붙을 수 있다.
    const endMs = endRaw !== undefined ? parseTimestamp(endRaw.trim().split(/\s+/u)[0] ?? "") : null;
    index += 1;
    const textLines: string[] = [];
    while (index < lines.length && lines[index]!.trim().length > 0) {
      textLines.push(lines[index]!);
      index += 1;
    }
    if (startMs === null || endMs === null || endMs <= startMs) continue;
    const { text, speaker } = parseCueText(textLines, resolved);
    if (!text) continue;
    drafts.push({ startMs, endMs, text, speaker });
  }
  if (drafts.length === 0) {
    return { ok: false, error: "자막 파일에서 읽을 수 있는 큐가 없습니다." };
  }
  return { ok: true, format: resolved, cues: drafts.sort((a, b) => a.startMs - b.startMs) };
}
