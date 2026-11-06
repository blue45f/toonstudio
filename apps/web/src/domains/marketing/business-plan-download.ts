import fontkit from "@pdf-lib/fontkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LineRuleType,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";

import { BUSINESS_PLAN_SECTIONS, type PlanSection, type PlanTable } from "./business-plan-data";

/**
 * 사업계획서 내려받기 (/business-plan).
 *
 * 페이지와 파일이 어긋나지 않도록 DOCX·PDF 모두 business-plan-data.ts의
 * BUSINESS_PLAN_SECTIONS를 유일한 본문 원본으로 쓴다. 브라우저에서
 * 클릭 시점에 생성하므로, 데이터가 바뀌면 파일도 같이 바뀐다.
 * HWP는 제공하지 않는다. 2026-11-06 확인: LibreOffice 24.2.7.2는
 * `--convert-to hwp`에 "no export filter"로 실패하고, "Hangul WP 97"
 * 필터를 직접 지정해도 한 줄짜리 문서조차 저장 단계(0x81a)에서
 * 실패한다. 레지스트리에도 HWP 가져오기 필터만 있고 내보내기 필터가
 * 없다. 브라우저에서 HWP를 만들 방법도 없어, HWP는 미제공으로 둔다.
 *
 * 제출 형식 목표: A4, 본문 맑은 고딕 12pt·줄 간격 160%, 표 10pt.
 * 본문 분량이 많아 8쪽 안에 들지 않을 수 있으며, 실제 쪽수는 검증에서
 * 측정한 값으로 보고한다. 이 파일은 제출용 문서가 아니라 페이지 기준
 * 정리본이며, 제출은 2026-12-01 13:00까지 플랫폼에서 별도로 한다.
 */

export const BUSINESS_PLAN_DOWNLOAD_FILE_BASE = "toonstudio-business-plan";
export const BUSINESS_PLAN_DOCX_FILENAME = `${BUSINESS_PLAN_DOWNLOAD_FILE_BASE}.docx`;
export const BUSINESS_PLAN_PDF_FILENAME = `${BUSINESS_PLAN_DOWNLOAD_FILE_BASE}.pdf`;

export const BUSINESS_PLAN_PDF_FONT_URLS = {
  regular: "/fonts/business-plan-noto-sans-kr-regular-subset.ttf",
  bold: "/fonts/business-plan-noto-sans-kr-bold-subset.ttf",
} as const;

export interface BusinessPlanPdfFontBytes {
  readonly regular: Uint8Array;
  readonly bold: Uint8Array;
}

const DOC_TITLE = "툰스튜디오 사업계획서";
const DOC_SUBTITLE = "웹툰 제작 전 과정의 협업 업무툴";
const DOC_AUTHOR_LINE = "작성자 김희준 (1인 예비창업자, 팀 없음)";
const DOC_MENTOR_LINE = "멘토기관 한국핀테크지원센터";
const DOC_BASIS_LINE = "작성 기준 2026-11-04 고도화 초안 v11";
const DOC_NOT_SUBMISSION =
  "제출용 문서가 아닙니다. 제출은 2026-12-01 13:00까지 모두의 창업 플랫폼(modoo.or.kr)을 통해 별도로 합니다.";

/** A4 (트윕, 1/1440인치) — DOCX용. */
const A4_TWIPS = { width: 11907, height: 16839 };
/** 여백 2cm. */
const MARGIN_TWIPS = 1134;
const BODY_FONT = "맑은 고딕";

/* ------------------------------------------------------------------ */
/* DOCX                                                                */
/* ------------------------------------------------------------------ */

function docxBodyRun(text: string): TextRun {
  return new TextRun({ text, font: BODY_FONT, size: 24 });
}

function docxParagraph(text: string): Paragraph {
  return new Paragraph({ children: [docxBodyRun(text)] });
}

function docxNoteParagraph(note: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "주의 · ", font: BODY_FONT, size: 20, bold: true }),
      new TextRun({ text: note, font: BODY_FONT, size: 20 }),
    ],
    spacing: { line: 320, lineRule: LineRuleType.AUTO },
  });
}

function docxTableCell(text: string, bold: boolean): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, font: BODY_FONT, size: 20, bold })],
        spacing: { line: 320, lineRule: LineRuleType.AUTO },
      }),
    ],
    shading: bold ? { type: ShadingType.CLEAR, fill: "EDEDED" } : undefined,
  });
}

function docxTable(table: PlanTable): (Paragraph | Table)[] {
  const columnCount = table.headers.length;
  const totalWidth = A4_TWIPS.width - MARGIN_TWIPS * 2;
  const columnWidth = Math.floor(totalWidth / columnCount);
  const widths = Array.from({ length: columnCount }, () => columnWidth);
  const headerRow = new TableRow({
    tableHeader: true,
    children: table.headers.map((header) => docxTableCell(header, true)),
  });
  const bodyRows = table.rows.map(
    (row) =>
      new TableRow({
        children: row.map((cell) => docxTableCell(cell, false)),
      }),
  );
  return [
    new Paragraph({
      children: [new TextRun({ text: table.caption, font: BODY_FONT, size: 24, bold: true })],
      spacing: { before: 240, after: 120 },
    }),
    new Table({
      rows: [headerRow, ...bodyRows],
      width: { size: totalWidth, type: WidthType.DXA },
      columnWidths: widths,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4 },
        left: { style: BorderStyle.SINGLE, size: 4 },
        bottom: { style: BorderStyle.SINGLE, size: 4 },
        right: { style: BorderStyle.SINGLE, size: 4 },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4 },
        insideVertical: { style: BorderStyle.SINGLE, size: 4 },
      },
    }),
  ];
}

function docxSectionChildren(section: PlanSection): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: section.eyebrow, font: BODY_FONT, size: 20, bold: true })],
      spacing: { before: 480, after: 120 },
    }),
    new Paragraph({
      text: section.title,
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: section.lead, font: BODY_FONT, size: 24, bold: true })],
      spacing: { after: 120 },
    }),
    ...section.paragraphs.map((paragraph) => docxParagraph(paragraph)),
  ];
  if (section.bullets.length > 0) {
    children.push(
      ...section.bullets.map(
        (bullet) =>
          new Paragraph({
            children: [docxBodyRun(`• ${bullet}`)],
            spacing: { before: 60 },
          }),
      ),
    );
  }
  for (const table of section.tables) {
    children.push(...docxTable(table));
  }
  if (section.note !== null) {
    children.push(docxNoteParagraph(section.note));
  }
  return children;
}

/** 사업계획서 DOCX를 브라우저 Blob으로 만든다. */
export async function buildBusinessPlanDocx(): Promise<Blob> {
  const cover: Paragraph[] = [
    new Paragraph({ text: DOC_TITLE, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: DOC_SUBTITLE, font: BODY_FONT, size: 28 })],
      spacing: { after: 480 },
    }),
    docxParagraph(DOC_AUTHOR_LINE),
    docxParagraph(DOC_MENTOR_LINE),
    docxParagraph(DOC_BASIS_LINE),
    new Paragraph({
      children: [new TextRun({ text: DOC_NOT_SUBMISSION, font: BODY_FONT, size: 20 })],
      spacing: { before: 240 },
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
  const body = BUSINESS_PLAN_SECTIONS.flatMap((section) => docxSectionChildren(section));
  const doc = new Document({
    creator: "김희준",
    title: DOC_TITLE,
    description: `${DOC_SUBTITLE} — ${DOC_BASIS_LINE}. ${DOC_NOT_SUBMISSION}`,
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: 24 },
          paragraph: { spacing: { line: 384, lineRule: LineRuleType.AUTO } },
        },
        heading1: {
          run: { font: BODY_FONT, size: 32, bold: true },
          paragraph: { spacing: { before: 240, after: 120, line: 384, lineRule: LineRuleType.AUTO } },
        },
        heading2: {
          run: { font: BODY_FONT, size: 28, bold: true },
          paragraph: { spacing: { before: 240, after: 120, line: 384, lineRule: LineRuleType.AUTO } },
        },
        title: {
          run: { font: BODY_FONT, size: 44, bold: true },
          paragraph: { spacing: { after: 240, line: 384, lineRule: LineRuleType.AUTO } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_TWIPS.width, height: A4_TWIPS.height },
            margin: {
              top: MARGIN_TWIPS,
              bottom: MARGIN_TWIPS,
              left: MARGIN_TWIPS,
              right: MARGIN_TWIPS,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "툰스튜디오 사업계획서 · ", font: BODY_FONT, size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT], font: BODY_FONT, size: 18 }),
                  new TextRun({ text: "쪽", font: BODY_FONT, size: 18 }),
                ],
              }),
            ],
          }),
        },
        children: [...cover, ...body],
      },
    ],
  });
  return Packer.toBlob(doc);
}

/* ------------------------------------------------------------------ */
/* PDF (pdf-lib + 부분집합 한글 폰트)                                    */
/* ------------------------------------------------------------------ */

/** A4 (pt) — PDF용. */
const A4_PT = { width: 595.28, height: 841.89 };
const MARGIN_PT = 56.7; // 2cm
const BODY_PT = 12;
const TABLE_PT = 10;
const LINE_SPACING = 1.6;
const FOOTER_PT = 9;

function wrapText(
  text: string,
  font: { widthOfTextAtSize(text: string, size: number): number },
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    let current = "";
    for (const word of rawLine.split(" ")) {
      const candidate = current === "" ? word : `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || current === "") {
        current = candidate;
        continue;
      }
      lines.push(current);
      current = word;
    }
    // 한 단어가 줄 너비를 넘으면 글자 단위로 나눈다 (한글은 음절 단위 나눔이 자연스럽다).
    while (font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
      let cut = current.length;
      while (cut > 1 && font.widthOfTextAtSize(current.slice(0, cut), size) > maxWidth) {
        cut -= 1;
      }
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
    lines.push(current);
  }
  return lines;
}

interface PdfLayout {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
}

class PdfWriter {
  private readonly doc: PDFDocument;
  private readonly fonts: PdfLayout;
  private page: ReturnType<PDFDocument["addPage"]>;
  private pageNumber = 1;
  private y = A4_PT.height - MARGIN_PT;

  constructor(doc: PDFDocument, fonts: PdfLayout) {
    this.doc = doc;
    this.fonts = fonts;
    this.page = this.doc.addPage([A4_PT.width, A4_PT.height]);
  }

  private get contentWidth(): number {
    return A4_PT.width - MARGIN_PT * 2;
  }

  private get bottom(): number {
    return MARGIN_PT;
  }

  private drawFooter(page: ReturnType<PDFDocument["addPage"]>, number: number): void {
    const text = `툰스튜디오 사업계획서 · ${number}쪽`;
    const width = this.fonts.regular.widthOfTextAtSize(text, FOOTER_PT);
    page.drawText(text, {
      x: (A4_PT.width - width) / 2,
      y: MARGIN_PT / 2,
      size: FOOTER_PT,
      font: this.fonts.regular,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  private newPage(): void {
    this.drawFooter(this.page, this.pageNumber);
    this.page = this.doc.addPage([A4_PT.width, A4_PT.height]);
    this.pageNumber += 1;
    this.y = A4_PT.height - MARGIN_PT;
  }

  private ensureSpace(height: number): void {
    if (this.y - height < this.bottom) {
      this.newPage();
    }
  }

  finish(): void {
    this.drawFooter(this.page, this.pageNumber);
  }

  get totalPages(): number {
    return this.pageNumber;
  }

  drawParagraph(
    text: string,
    options: { font?: "regular" | "bold"; size?: number; before?: number; after?: number } = {},
  ): void {
    const font = options.font === "bold" ? this.fonts.bold : this.fonts.regular;
    const size = options.size ?? BODY_PT;
    const lineHeight = size * LINE_SPACING;
    const lines = wrapText(text, font, size, this.contentWidth);
    this.y -= options.before ?? 0;
    this.ensureSpace(lineHeight);
    for (const line of lines) {
      if (this.y - lineHeight < this.bottom) {
        this.newPage();
      }
      this.page.drawText(line, { x: MARGIN_PT, y: this.y - size, size, font });
      this.y -= lineHeight;
    }
    this.y -= options.after ?? 0;
  }

  drawTable(table: PlanTable): void {
    const columnCount = table.headers.length;
    const columnWidth = this.contentWidth / columnCount;
    const cellPadding = 5;
    const lineHeight = TABLE_PT * LINE_SPACING;
    const headerLines = table.headers.map((header) =>
      wrapText(header, this.fonts.bold, TABLE_PT, columnWidth - cellPadding * 2),
    );
    const headerHeight =
      Math.max(...headerLines.map((lines) => lines.length)) * lineHeight + cellPadding * 2;

    const drawHeader = (): void => {
      this.ensureSpace(headerHeight);
      const top = this.y;
      this.page.drawRectangle({
        x: MARGIN_PT,
        y: top - headerHeight,
        width: this.contentWidth,
        height: headerHeight,
        color: rgb(0.93, 0.93, 0.93),
      });
      headerLines.forEach((lines, columnIndex) => {
        lines.forEach((line, lineIndex) => {
          this.page.drawText(line, {
            x: MARGIN_PT + columnIndex * columnWidth + cellPadding,
            y: top - cellPadding - TABLE_PT - lineIndex * lineHeight,
            size: TABLE_PT,
            font: this.fonts.bold,
          });
        });
      });
      this.drawTableBorders(top, headerHeight, columnCount, columnWidth);
      this.y = top - headerHeight;
    };

    const drawRowChunk = (
      rowLines: readonly (readonly string[])[],
      startLine: number,
      lineCount: number,
    ): number => {
      const height = lineCount * lineHeight + cellPadding * 2;
      const top = this.y;
      rowLines.forEach((lines, columnIndex) => {
        for (let i = 0; i < lineCount; i += 1) {
          const line = lines[startLine + i];
          if (line === undefined) {
            continue;
          }
          this.page.drawText(line, {
            x: MARGIN_PT + columnIndex * columnWidth + cellPadding,
            y: top - cellPadding - TABLE_PT - i * lineHeight,
            size: TABLE_PT,
            font: this.fonts.regular,
          });
        }
      });
      this.drawTableBorders(top, height, columnCount, columnWidth);
      this.y = top - height;
      return lineCount;
    };

    drawHeader();
    for (const row of table.rows) {
      const rowLines = row.map((cell) =>
        wrapText(cell, this.fonts.regular, TABLE_PT, columnWidth - cellPadding * 2),
      );
      const totalLines = Math.max(...rowLines.map((lines) => lines.length));
      let drawn = 0;
      while (drawn < totalLines) {
        const remainingHeight = this.y - this.bottom;
        const maxLines = Math.floor((remainingHeight - cellPadding * 2) / lineHeight);
        if (maxLines <= 0) {
          this.newPage();
          drawHeader();
          continue;
        }
        const chunk = Math.min(totalLines - drawn, maxLines);
        drawn += drawRowChunk(rowLines, drawn, chunk);
        if (drawn < totalLines) {
          this.newPage();
          drawHeader();
        }
      }
    }
  }

  private drawTableBorders(
    top: number,
    height: number,
    columnCount: number,
    columnWidth: number,
  ): void {
    const color = rgb(0.6, 0.6, 0.6);
    const thickness = 0.5;
    this.page.drawLine({ start: { x: MARGIN_PT, y: top }, end: { x: MARGIN_PT + this.contentWidth, y: top }, thickness, color });
    this.page.drawLine({
      start: { x: MARGIN_PT, y: top - height },
      end: { x: MARGIN_PT + this.contentWidth, y: top - height },
      thickness,
      color,
    });
    for (let i = 0; i <= columnCount; i += 1) {
      const x = MARGIN_PT + i * columnWidth;
      this.page.drawLine({ start: { x, y: top }, end: { x, y: top - height }, thickness, color });
    }
  }
}

/** 사업계획서 PDF를 만든다. 폰트 바이트는 호출자가 부분집합 TTF로 준비한다. */
export async function buildBusinessPlanPdf(fontBytes: BusinessPlanPdfFontBytes): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(DOC_TITLE);
  doc.setAuthor("김희준");
  doc.setSubject(`${DOC_SUBTITLE} — ${DOC_BASIS_LINE}`);
  const regular = await doc.embedFont(fontBytes.regular);
  const bold = await doc.embedFont(fontBytes.bold);
  const writer = new PdfWriter(doc, { regular, bold });

  writer.drawParagraph(DOC_TITLE, { font: "bold", size: 22, after: 6 });
  writer.drawParagraph(DOC_SUBTITLE, { size: 14, after: 12 });
  writer.drawParagraph(DOC_AUTHOR_LINE, { after: 2 });
  writer.drawParagraph(DOC_MENTOR_LINE, { after: 2 });
  writer.drawParagraph(DOC_BASIS_LINE, { after: 6 });
  writer.drawParagraph(DOC_NOT_SUBMISSION, { size: 10, after: 12 });

  for (const section of BUSINESS_PLAN_SECTIONS) {
    writer.drawParagraph(section.eyebrow, { font: "bold", size: 10, before: 14, after: 2 });
    writer.drawParagraph(section.title, { font: "bold", size: 15, after: 4 });
    writer.drawParagraph(section.lead, { font: "bold", after: 4 });
    for (const paragraph of section.paragraphs) {
      writer.drawParagraph(paragraph, { after: 2 });
    }
    for (const bullet of section.bullets) {
      writer.drawParagraph(`• ${bullet}`, { after: 2 });
    }
    for (const table of section.tables) {
      writer.drawParagraph(table.caption, { font: "bold", size: 11, before: 8, after: 4 });
      writer.drawTable(table);
    }
    if (section.note !== null) {
      writer.drawParagraph(`주의 · ${section.note}`, { size: 10, before: 6 });
    }
  }

  writer.finish();
  return doc.save();
}

/* ------------------------------------------------------------------ */
/* 브라우저 내려받기                                                     */
/* ------------------------------------------------------------------ */

/** 부분집합 한글 폰트 두 개를 정적 자산에서 가져온다 (PDF 생성용). */
export async function loadBusinessPlanPdfFonts(): Promise<BusinessPlanPdfFontBytes> {
  const [regularResponse, boldResponse] = await Promise.all([
    fetch(BUSINESS_PLAN_PDF_FONT_URLS.regular),
    fetch(BUSINESS_PLAN_PDF_FONT_URLS.bold),
  ]);
  if (!regularResponse.ok || !boldResponse.ok) {
    throw new Error("PDF용 한글 폰트를 불러오지 못했습니다.");
  }
  const [regular, bold] = await Promise.all([
    regularResponse.arrayBuffer(),
    boldResponse.arrayBuffer(),
  ]);
  return { regular: new Uint8Array(regular), bold: new Uint8Array(bold) };
}

export async function downloadBusinessPlanDocx(): Promise<string> {
  const blob = await buildBusinessPlanDocx();
  triggerBrowserDownload(blob, BUSINESS_PLAN_DOCX_FILENAME);
  return BUSINESS_PLAN_DOCX_FILENAME;
}

export async function downloadBusinessPlanPdf(): Promise<string> {
  const fontBytes = await loadBusinessPlanPdfFonts();
  const bytes = await buildBusinessPlanPdf(fontBytes);
  triggerBrowserDownload(
    new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
    BUSINESS_PLAN_PDF_FILENAME,
  );
  return BUSINESS_PLAN_PDF_FILENAME;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
