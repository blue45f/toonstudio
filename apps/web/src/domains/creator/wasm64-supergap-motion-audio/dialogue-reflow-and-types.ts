/**
 * #11 양방향 대사 스프레드시트 ↔ 캔버스 바인더용 타입 계약 · KO/EN/JA/ZH 리플로우 엔진 · Diff/체크섬 유틸리티.
 */

export type SupportedDialogueLocale = "ko" | "en" | "ja" | "zh";

export type BalloonWritingDirection = "horizontal" | "vertical";

export type VoiceEmotionTag =
  | "neutral"
  | "whisper"
  | "shout"
  | "sad"
  | "angry"
  | "excited"
  | "narration";

export interface ReflowSizingOptions {
  readonly fontSizePx?: number;
  readonly lineHeightRatio?: number;
  readonly minWidthPx?: number;
  readonly maxWidthPx?: number;
  readonly maxHeightPx?: number;
  readonly paddingXPx?: number;
  readonly paddingYPx?: number;
  readonly writingDirection?: BalloonWritingDirection;
}

export interface BalloonReflowBox {
  readonly locale: SupportedDialogueLocale;
  readonly writingDirection: BalloonWritingDirection;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly fontSizePx: number;
  readonly lineHeightPx: number;
  readonly lineCount: number;
  readonly lines: readonly string[];
  readonly overflowClamped: boolean;
  readonly estimatedSpeechDurationMs: number;
}

export interface VoiceTimingCue {
  readonly balloonId: string;
  readonly cutId: string;
  readonly speakerId: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly endMs: number;
  readonly emotionTag: VoiceEmotionTag;
  readonly locale: SupportedDialogueLocale;
  readonly text: string;
}

export interface VoiceCueOverlap {
  readonly firstBalloonId: string;
  readonly secondBalloonId: string;
  readonly cutId: string;
  readonly overlapMs: number;
}

export type LocalizedTextMap = Readonly<Partial<Record<SupportedDialogueLocale, string>>>;

export interface DialogueRowInit {
  readonly balloonId: string;
  readonly cutId: string;
  readonly cutOrder: number;
  readonly orderInCut: number;
  readonly speakerId: string;
  readonly speakerName?: string;
  readonly activeLocale?: SupportedDialogueLocale;
  readonly localeTexts: LocalizedTextMap;
  readonly x: number;
  readonly y: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly fontSizePx?: number;
  readonly maxWidthPx?: number;
  readonly writingDirection?: BalloonWritingDirection;
  readonly emotionTag?: VoiceEmotionTag;
  readonly voiceStartMs?: number;
  readonly voiceDurationMs?: number;
}

export interface DialogueSpreadsheetRow {
  readonly balloonId: string;
  readonly cutId: string;
  readonly cutOrder: number;
  readonly orderInCut: number;
  readonly speakerId: string;
  readonly speakerName: string;
  readonly activeLocale: SupportedDialogueLocale;
  readonly text: string;
  readonly localeTexts: Readonly<Record<SupportedDialogueLocale, string>>;
  readonly emotionTag: VoiceEmotionTag;
  readonly voiceCue: VoiceTimingCue;
  readonly reflowBox: BalloonReflowBox;
  readonly manualSizeOverride: boolean;
}

export interface CanvasBalloonNode {
  readonly balloonId: string;
  readonly cutId: string;
  readonly speakerId: string;
  readonly activeLocale: SupportedDialogueLocale;
  readonly text: string;
  readonly lines: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly fontSizePx: number;
  readonly writingDirection: BalloonWritingDirection;
  readonly overflowClamped: boolean;
  readonly voiceStartMs: number;
  readonly voiceDurationMs: number;
}

export interface DialogueCellPatch {
  readonly balloonId: string;
  readonly text?: string;
  readonly locale?: SupportedDialogueLocale;
  readonly localeTexts?: LocalizedTextMap;
  readonly speakerId?: string;
  readonly speakerName?: string;
  readonly emotionTag?: VoiceEmotionTag;
  readonly voiceStartMs?: number;
  readonly voiceDurationMs?: number;
  readonly maxWidthPx?: number;
  readonly fontSizePx?: number;
  readonly writingDirection?: BalloonWritingDirection;
  readonly autoReflow?: boolean;
}

export interface CanvasBalloonMutation {
  readonly balloonId: string;
  readonly text?: string;
  readonly x?: number;
  readonly y?: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly speakerId?: string;
  readonly voiceStartMs?: number;
  readonly voiceDurationMs?: number;
}

export interface BoundBalloonStateSnapshot {
  readonly row: DialogueSpreadsheetRow;
  readonly canvas: CanvasBalloonNode;
}

export interface BatchDiffEntry {
  readonly balloonId: string;
  readonly cutId: string;
  readonly changedFields: readonly string[];
  readonly before: BoundBalloonStateSnapshot;
  readonly after: BoundBalloonStateSnapshot;
}

export interface BatchDiffRecord {
  readonly txId: string;
  readonly revision: number;
  readonly source: "spreadsheet" | "canvas" | "locale-switch" | "tsv-import" | "undo" | "redo";
  readonly reason: string;
  readonly timestampMs: number;
  readonly checksum: string;
  readonly entries: readonly BatchDiffEntry[];
}

export interface DialogueSyncEvent {
  readonly record: BatchDiffRecord;
  readonly affectedBalloonIds: readonly string[];
  readonly affectedCutIds: readonly string[];
}

export type DialogueSyncListener = (event: DialogueSyncEvent) => void;

export interface DialogueBinderOptions {
  readonly defaultLocale?: SupportedDialogueLocale;
  readonly autoCascadeTiming?: boolean;
  readonly interLineGapMs?: number;
  readonly maxUndoHistory?: number;
}

export interface LocaleTypographyProfile {
  readonly wordWrap: boolean;
  readonly charsPerSec: number;
  readonly lineHeightRatio: number;
  readonly defaultMaxWidthPx: number;
  readonly minWidthPx: number;
}

export const ALL_DIALOGUE_LOCALES: readonly SupportedDialogueLocale[] = ["ko", "en", "ja", "zh"];

export const LOCALE_TYPOGRAPHY_PROFILES: Readonly<
  Record<SupportedDialogueLocale, LocaleTypographyProfile>
> = {
  ko: { wordWrap: false, charsPerSec: 5.4, lineHeightRatio: 1.42, defaultMaxWidthPx: 230, minWidthPx: 92 },
  en: { wordWrap: true, charsPerSec: 14.2, lineHeightRatio: 1.32, defaultMaxWidthPx: 268, minWidthPx: 108 },
  ja: { wordWrap: false, charsPerSec: 5.8, lineHeightRatio: 1.45, defaultMaxWidthPx: 224, minWidthPx: 92 },
  zh: { wordWrap: false, charsPerSec: 4.6, lineHeightRatio: 1.44, defaultMaxWidthPx: 216, minWidthPx: 88 },
};

function measureGlyphAdvanceEm(charCode: number): number {
  if (charCode <= 0x20) return 0.3;
  if (
    (charCode >= 0xac00 && charCode <= 0xd7a3) ||
    (charCode >= 0x3000 && charCode <= 0x30ff) ||
    (charCode >= 0x4e00 && charCode <= 0x9fff) ||
    (charCode >= 0xff01 && charCode <= 0xff60)
  ) {
    return 1.0;
  }
  if (
    charCode === 0x2e ||
    charCode === 0x2c ||
    charCode === 0x21 ||
    charCode === 0x3a ||
    charCode === 0x3b ||
    charCode === 0x69 ||
    charCode === 0x6c
  ) {
    return 0.36;
  }
  if (charCode >= 0x41 && charCode <= 0x5a) {
    return 0.68;
  }
  return 0.56;
}

function measureStringWidthPx(text: string, fontSizePx: number): number {
  let em = 0;
  for (let i = 0; i < text.length; i += 1) {
    em += measureGlyphAdvanceEm(text.charCodeAt(i));
  }
  return em * fontSizePx;
}

function estimateSpeechDurationMs(text: string, locale: SupportedDialogueLocale): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 450;
  const profile = LOCALE_TYPOGRAPHY_PROFILES[locale];
  let pauseBonusMs = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "。" || ch === "！" || ch === "？") {
      pauseBonusMs += 140;
    } else if (ch === "," || ch === "、" || ch === "…") {
      pauseBonusMs += 80;
    }
  }
  const baseMs = (trimmed.length / profile.charsPerSec) * 1000 + pauseBonusMs + 260;
  return Math.round(Math.max(450, Math.min(18_000, baseMs)));
}

function wrapParagraph(
  paragraph: string,
  maxContentWidthPx: number,
  fontSizePx: number,
  wordWrap: boolean,
): readonly string[] {
  if (paragraph.length === 0) return [""];
  const lines: string[] = [];

  if (wordWrap) {
    const words = paragraph.split(/\s+/);
    let current = "";
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      if (word.length === 0) continue;
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (measureStringWidthPx(candidate, fontSizePx) <= maxContentWidthPx || current.length === 0) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current.length > 0) lines.push(current);
    return lines.length > 0 ? lines : [""];
  }

  let current = "";
  let currentWidth = 0;
  for (let i = 0; i < paragraph.length; i += 1) {
    const ch = paragraph[i];
    const chWidth = measureGlyphAdvanceEm(ch.charCodeAt(0)) * fontSizePx;
    if (current.length > 0 && currentWidth + chWidth > maxContentWidthPx) {
      lines.push(current);
      current = ch;
      currentWidth = chWidth;
    } else {
      current += ch;
      currentWidth += chWidth;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/**
 * KO/EN/JA/ZH 글자폭·단어 줄바꿈·세로쓰기(JA/ZH) 규칙을 반영해 말풍선 리플로우 박스를 계산한다.
 */
export function computeLocalizedBalloonReflow(
  text: string,
  locale: SupportedDialogueLocale,
  options: ReflowSizingOptions = {},
): BalloonReflowBox {
  const profile = LOCALE_TYPOGRAPHY_PROFILES[locale];
  const fontSizePx = Math.max(10, Math.min(48, options.fontSizePx ?? 16));
  const lineHeightRatio = options.lineHeightRatio ?? profile.lineHeightRatio;
  const lineHeightPx = Math.round(fontSizePx * lineHeightRatio);
  const paddingX = Math.max(8, options.paddingXPx ?? Math.round(fontSizePx * 1.1));
  const paddingY = Math.max(8, options.paddingYPx ?? Math.round(fontSizePx * 0.95));
  const minWidthPx = Math.max(64, options.minWidthPx ?? profile.minWidthPx);
  const maxWidthPx = Math.max(minWidthPx, options.maxWidthPx ?? profile.defaultMaxWidthPx);
  const maxHeightPx = Math.max(lineHeightPx + paddingY * 2, options.maxHeightPx ?? 420);
  const writingDirection: BalloonWritingDirection = options.writingDirection ?? "horizontal";

  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const maxContentSpan =
    writingDirection === "vertical"
      ? Math.max(fontSizePx * 2, maxHeightPx - paddingY * 2)
      : Math.max(fontSizePx * 2, maxWidthPx - paddingX * 2);

  const lines: string[] = [];
  for (let p = 0; p < paragraphs.length; p += 1) {
    const wrapped = wrapParagraph(
      paragraphs[p],
      maxContentSpan,
      fontSizePx,
      writingDirection === "horizontal" && profile.wordWrap,
    );
    for (let w = 0; w < wrapped.length; w += 1) {
      lines.push(wrapped[w]);
    }
  }

  let widestLinePx = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const w = measureStringWidthPx(lines[i], fontSizePx);
    if (w > widestLinePx) widestLinePx = w;
  }

  let widthPx: number;
  let heightPx: number;
  let overflowClamped: boolean;

  if (writingDirection === "vertical") {
    const rawWidth = lines.length * lineHeightPx + paddingX * 2;
    const rawHeight = Math.max(fontSizePx * 2, widestLinePx) + paddingY * 2;
    overflowClamped = rawWidth > maxWidthPx || rawHeight > maxHeightPx;
    widthPx = Math.round(Math.max(minWidthPx, Math.min(maxWidthPx, rawWidth)));
    heightPx = Math.round(Math.max(minWidthPx, Math.min(maxHeightPx, rawHeight)));
  } else {
    const rawWidth = widestLinePx + paddingX * 2;
    const rawHeight = lines.length * lineHeightPx + paddingY * 2;
    overflowClamped = rawWidth > maxWidthPx || rawHeight > maxHeightPx;
    widthPx = Math.round(Math.max(minWidthPx, Math.min(maxWidthPx, rawWidth)));
    heightPx = Math.round(Math.max(lineHeightPx + paddingY * 2, Math.min(maxHeightPx, rawHeight)));
  }

  return {
    locale,
    writingDirection,
    widthPx,
    heightPx,
    fontSizePx,
    lineHeightPx,
    lineCount: lines.length,
    lines,
    overflowClamped,
    estimatedSpeechDurationMs: estimateSpeechDurationMs(text, locale),
  };
}

export function computeFnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function normalizeLocaleTexts(
  initMap: LocalizedTextMap,
  fallbackText: string,
): Readonly<Record<SupportedDialogueLocale, string>> {
  return {
    ko: initMap.ko ?? fallbackText,
    en: initMap.en ?? "",
    ja: initMap.ja ?? "",
    zh: initMap.zh ?? "",
  };
}

export function resolveLocaleText(
  localeTexts: Readonly<Record<SupportedDialogueLocale, string>>,
  locale: SupportedDialogueLocale,
): string {
  const direct = localeTexts[locale];
  if (direct.length > 0) return direct;
  if (localeTexts.ko.length > 0) return localeTexts.ko;
  if (localeTexts.en.length > 0) return localeTexts.en;
  if (localeTexts.ja.length > 0) return localeTexts.ja;
  return localeTexts.zh;
}

export function cloneBalloonSnapshot(snap: BoundBalloonStateSnapshot): BoundBalloonStateSnapshot {
  return {
    row: {
      ...snap.row,
      localeTexts: { ...snap.row.localeTexts },
      voiceCue: { ...snap.row.voiceCue },
      reflowBox: {
        ...snap.row.reflowBox,
        lines: snap.row.reflowBox.lines.slice(),
      },
    },
    canvas: {
      ...snap.canvas,
      lines: snap.canvas.lines.slice(),
    },
  };
}

export function diffChangedBalloonFields(
  before: BoundBalloonStateSnapshot,
  after: BoundBalloonStateSnapshot,
): readonly string[] {
  const fields: string[] = [];
  if (before.row.text !== after.row.text) fields.push("text");
  if (before.row.activeLocale !== after.row.activeLocale) fields.push("activeLocale");
  if (before.row.speakerId !== after.row.speakerId) fields.push("speakerId");
  if (before.row.speakerName !== after.row.speakerName) fields.push("speakerName");
  if (before.row.emotionTag !== after.row.emotionTag) fields.push("emotionTag");
  if (before.row.voiceCue.startMs !== after.row.voiceCue.startMs) fields.push("voiceStartMs");
  if (before.row.voiceCue.durationMs !== after.row.voiceCue.durationMs) fields.push("voiceDurationMs");
  if (before.canvas.x !== after.canvas.x || before.canvas.y !== after.canvas.y) fields.push("position");
  if (before.canvas.widthPx !== after.canvas.widthPx || before.canvas.heightPx !== after.canvas.heightPx) {
    fields.push("size");
  }
  for (let i = 0; i < ALL_DIALOGUE_LOCALES.length; i += 1) {
    const loc = ALL_DIALOGUE_LOCALES[i];
    if (before.row.localeTexts[loc] !== after.row.localeTexts[loc]) {
      fields.push(`localeTexts.${loc}`);
    }
  }
  return fields;
}
