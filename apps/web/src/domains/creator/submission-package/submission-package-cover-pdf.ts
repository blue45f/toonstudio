/**
 * 투고 패키지 — 표지 요약 PDF.
 *
 * `studio-review-pdf` 와 같은 방식을 쓴다: 글자는 PDF 문자열 오브젝트가 아니라 캔버스에 그린 그림(JPEG)으로만
 * 넣어 한글 폰트 임베드나 PDF 인젝션 문제를 만들지 않고, 쪽 조립은 기존 `buildPdfFromJpegPages`(순수·결정적)를
 * 그대로 쓴다. 그 대가로 이 PDF 의 글자는 선택·검색이 되지 않는다 — 글로 읽는 정본은 `cover.md` 다.
 *
 * 조판(줄바꿈·쪽 나누기)은 글자 폭을 재는 함수를 주입받는 순수 함수라 캔버스 없이 시험하고, 실제 그리기와
 * 인코딩만 브라우저 캔버스를 만진다(의존성 주입 가능).
 */
import { formatStudioByteSize } from "../export/studio-episode-byte-budget";
import { buildPdfFromJpegPages, canvasToJpegBytes, type PdfJpegPage } from "../export/studio-pdf-export";

import {
  missingSubmissionParts,
  submissionCoverDate,
  submissionCoverLabels,
  submissionWidthCheckText,
  type SubmissionCoverInput,
} from "./submission-package-cover";
import { describeSubmissionIssue } from "./submission-package-messages";
import { normalizeSingleLine, normalizeUserText } from "./submission-package-text";
import { SUBMISSION_PACKAGE_COVER_PATH } from "./submission-package-layout";

/** A4 를 96dpi 로 본 픽셀 크기. `buildPdfFromJpegPages` 가 1px = 0.75pt 로 옮겨 A4 에 맞는다. */
export const COVER_PDF_PAGE = Object.freeze({ width: 794, height: 1123, margin: 64 });
export const COVER_PDF_MAX_PAGES = 12;
const JPEG_QUALITY = 0.9;

export type CoverPdfBlockKind = "title" | "heading" | "body" | "bullet" | "muted" | "accent" | "spacer";

export interface CoverPdfBlock {
  readonly kind: CoverPdfBlockKind;
  readonly text: string;
}

const STYLE: Readonly<Record<Exclude<CoverPdfBlockKind, "spacer">, { fontPx: number; weight: 400 | 700; color: CoverPdfColor; indent: number; before: number; after: number }>> =
  Object.freeze({
    title: { fontPx: 34, weight: 700, color: "ink", indent: 0, before: 0, after: 10 },
    heading: { fontPx: 20, weight: 700, color: "ink", indent: 0, before: 22, after: 8 },
    body: { fontPx: 15, weight: 400, color: "ink", indent: 0, before: 0, after: 6 },
    bullet: { fontPx: 15, weight: 400, color: "ink", indent: 18, before: 0, after: 4 },
    muted: { fontPx: 13, weight: 400, color: "muted", indent: 0, before: 0, after: 4 },
    accent: { fontPx: 15, weight: 700, color: "accent", indent: 0, before: 8, after: 6 },
  });

export type CoverPdfColor = "ink" | "muted" | "accent" | "line";

/** 검토 PDF(`studio-review-pdf`)와 같은 따뜻한 잉크 계열. 문서 출력용이라 테마를 따르지 않는다. */
const COLORS: Readonly<Record<CoverPdfColor, string>> = Object.freeze({
  ink: "#282622",
  muted: "#66615a",
  accent: "#d75b30",
  line: "#d9d3c8",
});

const LINE_HEIGHT = 1.55;

export interface CoverPdfLine {
  readonly text: string;
  readonly kind: Exclude<CoverPdfBlockKind, "spacer">;
  readonly x: number;
  /** 글자 기준선 y. */
  readonly y: number;
  readonly fontPx: number;
  readonly weight: 400 | 700;
  readonly color: CoverPdfColor;
}

export interface CoverPdfPage {
  readonly lines: readonly CoverPdfLine[];
}

export type MeasureText = (text: string, fontPx: number, weight: number) => number;

/** 폭을 넘으면 공백에서, 공백이 없으면(한글 등) 글자에서 줄을 바꾼다. */
export function wrapCoverPdfText(measure: MeasureText, value: string, fontPx: number, weight: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    let lastSpace = -1;
    for (const character of Array.from(paragraph)) {
      const candidate = line + character;
      if (line && measure(candidate, fontPx, weight) > maxWidth) {
        if (lastSpace > 0 && character !== " ") {
          lines.push(line.slice(0, lastSpace).trimEnd());
          line = (line.slice(lastSpace) + character).trimStart();
        } else {
          lines.push(line.trimEnd());
          line = character === " " ? "" : character;
        }
        lastSpace = -1;
        for (let index = 0; index < line.length; index += 1) if (line[index] === " ") lastSpace = index;
      } else {
        if (character === " ") lastSpace = candidate.length - 1;
        line = candidate;
      }
    }
    if (line) lines.push(line.trimEnd());
  }
  return lines;
}

function firstLine(value: string): string {
  const text = normalizeUserText(value);
  const line = text.split("\n")[0] ?? "";
  return line.length > 90 ? `${Array.from(line).slice(0, 90).join("")}…` : line;
}

export function buildCoverPdfBlocks(input: SubmissionCoverInput): CoverPdfBlock[] {
  const labels = submissionCoverLabels(input.locale);
  const { draft, report, layout } = input;
  const blocks: CoverPdfBlock[] = [];
  const author = normalizeSingleLine(draft.authorName);
  blocks.push({ kind: "title", text: normalizeSingleLine(draft.title) });
  blocks.push({ kind: "muted", text: `${author ? `${labels.author}: ${author} · ` : ""}${labels.madeOn}: ${submissionCoverDate(input.generatedAt)}` });
  blocks.push({
    kind: "muted",
    text: labels.episodeSummary(layout.episodes.length, layout.pageCount, formatStudioByteSize(report.totalBytes), draft.characters.length),
  });
  blocks.push({ kind: "muted", text: `${labels.widthCheck}: ${submissionWidthCheckText(input, labels)}` });
  const missing = missingSubmissionParts(input);
  if (missing.length > 0) blocks.push({ kind: "accent", text: `${labels.missingTitle}: ${missing.join(", ")}` });

  const prose = (heading: string, value: string): void => {
    blocks.push({ kind: "heading", text: heading });
    const text = normalizeUserText(value);
    blocks.push({ kind: text ? "body" : "muted", text: text || labels.notWritten });
  };
  prose(labels.logline, draft.logline);
  prose(labels.synopsis, draft.synopsis);

  blocks.push({ kind: "heading", text: labels.episodes });
  if (layout.episodes.length === 0) blocks.push({ kind: "muted", text: labels.noEpisodes });
  for (const planned of layout.episodes) {
    const stats = report.episodeStats.find((entry) => entry.episodeId === planned.episodeId);
    const episode = draft.episodes.find((entry) => entry.id === planned.episodeId);
    const title = normalizeSingleLine(episode?.title ?? "");
    const note = normalizeSingleLine(episode?.note ?? "");
    const widths = stats && stats.widths.length > 0 ? `${stats.widths.join(", ")}px` : "—";
    const head = `${labels.episodeLabel(planned.number)}${title ? ` · ${title}` : ""}`;
    blocks.push({
      kind: "bullet",
      text: `${head} (${planned.pages.length}, ${widths}, ${formatStudioByteSize(stats?.totalBytes ?? 0)})${note ? ` — ${note}` : ""}`,
    });
  }

  blocks.push({ kind: "heading", text: labels.characters });
  if (draft.characters.length === 0) blocks.push({ kind: "muted", text: labels.noCharacters });
  for (const sheet of draft.characters) {
    const gist = firstLine(sheet.personality);
    blocks.push({ kind: "bullet", text: `${sheet.name}${gist ? ` — ${gist}` : ""}` });
  }
  if (draft.characters.length > 0) blocks.push({ kind: "muted", text: labels.charactersDetail.replaceAll("`", "") });

  blocks.push({ kind: "heading", text: labels.checks });
  const notable = report.issues.filter((issue) => issue.severity !== "error");
  if (notable.length === 0) blocks.push({ kind: "body", text: labels.checksClean });
  else {
    blocks.push({ kind: "body", text: labels.checksSome(notable.length) });
    for (const issue of notable) blocks.push({ kind: "bullet", text: describeSubmissionIssue(issue, input.locale).title });
  }

  blocks.push({ kind: "spacer", text: "" });
  for (const line of labels.closing) if (line !== "---") blocks.push({ kind: "muted", text: line });
  return blocks;
}

/** 블록들을 쪽으로 나눈다. 쪽 수가 `maxPages` 를 넘으면 남은 내용은 `cover.md` 를 보라는 안내로 대신한다. */
export function paginateCoverPdf(
  blocks: readonly CoverPdfBlock[],
  measure: MeasureText,
  maxPages = COVER_PDF_MAX_PAGES,
  overflowNote = `…(${SUBMISSION_PACKAGE_COVER_PATH})`,
): CoverPdfPage[] {
  const { width, height, margin } = COVER_PDF_PAGE;
  const bottom = height - margin - 24;
  const pages: CoverPdfLine[][] = [[]];
  let y = margin;
  let truncated = false;

  const startPage = (): boolean => {
    if (pages.length >= maxPages) return false;
    pages.push([]);
    y = margin;
    return true;
  };

  outer: for (const block of blocks) {
    if (block.kind === "spacer") {
      y += 14;
      continue;
    }
    const style = STYLE[block.kind];
    const leading = style.fontPx * LINE_HEIGHT;
    const contentWidth = width - margin * 2 - style.indent;
    const wrapped = wrapCoverPdfText(measure, block.text, style.fontPx, style.weight, contentWidth);
    y += (pages.at(-1)?.length ?? 0) > 0 ? style.before : 0;
    for (const [index, text] of wrapped.entries()) {
      if (y + leading > bottom && !startPage()) {
        truncated = true;
        break outer;
      }
      const bullet = block.kind === "bullet" && index === 0 ? "• " : "";
      const current = pages.at(-1);
      if (!current) break outer;
      if (text) {
        current.push({
          text: `${bullet}${text}`,
          kind: block.kind,
          x: margin + (block.kind === "bullet" && index > 0 ? style.indent : 0),
          y: y + style.fontPx,
          fontPx: style.fontPx,
          weight: style.weight,
          color: style.color,
        });
      }
      y += leading;
    }
    y += style.after;
  }

  if (truncated) {
    const last = pages.at(-1);
    if (last) {
      last.push({
        text: overflowNote,
        kind: "muted",
        x: margin,
        y: height - margin - 4,
        fontPx: STYLE.muted.fontPx,
        weight: 400,
        color: "muted",
      });
    }
  }
  return pages.map((lines) => ({ lines }));
}

export interface CoverPdfDeps {
  readonly createCanvas?: (width: number, height: number) => HTMLCanvasElement;
  readonly toJpegBytes?: (canvas: HTMLCanvasElement, quality: number) => Promise<Uint8Array>;
  readonly signal?: AbortSignal;
}

function defaultCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function fontFor(fontPx: number, weight: number): string {
  return `${weight} ${fontPx}px Pretendard, system-ui, sans-serif`;
}

function paintPage(context: CanvasRenderingContext2D, page: CoverPdfPage, pageNumber: number, pageCount: number): void {
  const { width, height, margin } = COVER_PDF_PAGE;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  for (const line of page.lines) {
    context.font = fontFor(line.fontPx, line.weight);
    context.fillStyle = COLORS[line.color];
    context.fillText(line.text, line.x, line.y);
  }
  context.fillStyle = COLORS.line;
  context.fillRect(margin, height - margin + 6, width - margin * 2, 1);
  context.font = fontFor(12, 400);
  context.fillStyle = COLORS.muted;
  context.textAlign = "right";
  context.fillText(`${pageNumber} / ${pageCount}`, width - margin, height - margin + 26);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("표지 PDF 만들기를 취소했어요.", "AbortError");
}

/**
 * 표지 요약 PDF 바이트를 만든다. 캔버스를 쓸 수 없거나 인코딩이 실패하면 예외를 던지고, 호출자는 PDF 없이
 * 패키지를 계속 만들 수 있다(표지 `cover.md` 가 정본이다).
 */
export async function renderSubmissionCoverPdf(input: SubmissionCoverInput, deps: CoverPdfDeps = {}): Promise<Uint8Array> {
  const createCanvas = deps.createCanvas ?? defaultCanvas;
  const toJpegBytes = deps.toJpegBytes ?? ((canvas, quality) => canvasToJpegBytes(canvas, quality));
  const { width, height } = COVER_PDF_PAGE;
  throwIfAborted(deps.signal);

  const measureCanvas = createCanvas(width, height);
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("이 브라우저에서는 표지 PDF 를 그릴 수 없어요.");
  const measure: MeasureText = (text, fontPx, weight) => {
    measureContext.font = fontFor(fontPx, weight);
    return measureContext.measureText(text).width;
  };
  const pages = paginateCoverPdf(buildCoverPdfBlocks(input), measure);
  measureCanvas.width = 0;
  measureCanvas.height = 0;

  const jpegPages: PdfJpegPage[] = [];
  for (const [index, page] of pages.entries()) {
    throwIfAborted(deps.signal);
    const canvas = createCanvas(width, height);
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이 브라우저에서는 표지 PDF 를 그릴 수 없어요.");
      paintPage(context, page, index + 1, pages.length);
      jpegPages.push({ jpegBytes: await toJpegBytes(canvas, JPEG_QUALITY), width, height });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  return buildPdfFromJpegPages(jpegPages, { title: normalizeSingleLine(input.draft.title) });
}
