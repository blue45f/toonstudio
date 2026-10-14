import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  addPdfSource,
  createPdfWorkbenchState,
  parsePdfPageRanges,
  type PdfWorkbenchState,
} from "./pdf-workbench-model";
import { buildMergedPdfBytes, buildSplitPdfFiles, inspectPdfSource } from "./pdf-workbench-engine";
import {
  EMPTY_PDF_METADATA_FORM,
  applyPdfMetadata,
  describePdfMetadataRows,
  formValueFromMetadata,
  hasPdfMetadata,
  metadataFromFormValue,
  normalizePdfMetadata,
  parsePdfKeywordsInput,
  readPdfMetadata,
} from "./pdf-workbench-metadata";

async function makePdf(widths: readonly number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const width of widths) doc.addPage([width, 400]);
  return doc.save();
}

const FULL = {
  title: "단행본 1권 합본",
  author: "홍길동",
  subject: "1~10화 합본",
  keywords: ["웹툰", "단행본", "합본"],
} as const;

describe("normalizePdfMetadata", () => {
  it("공백을 정리하고 전부 비면 null을 돌려준다", () => {
    expect(normalizePdfMetadata({ title: "  제목  ", author: " " })).toEqual({ title: "제목" });
    expect(normalizePdfMetadata({ title: " ", keywords: [" ", ""] })).toBeNull();
    expect(normalizePdfMetadata({})).toBeNull();
  });

  it("키워드는 중복을 제거하고 순서를 유지한다", () => {
    expect(normalizePdfMetadata({ keywords: [" 웹툰 ", "웹툰", "단행본"] })?.keywords).toEqual(["웹툰", "단행본"]);
  });
});

describe("키워드 입력 파싱·폼 변환", () => {
  it("쉼표·줄바꿈으로 나누고 빈 조각과 중복을 버린다", () => {
    expect(parsePdfKeywordsInput("웹툰, 단행본,, 웹툰\n합본")).toEqual(["웹툰", "단행본", "합본"]);
    expect(parsePdfKeywordsInput("  ")).toEqual([]);
  });

  it("폼 ↔ 속성 왕복이 값을 보존하고, 빈 폼은 null이다", () => {
    const form = { title: "제목", author: "저자", subject: "주제", keywordsText: "웹툰, 단행본" };
    expect(metadataFromFormValue(form)).toEqual({
      title: "제목",
      author: "저자",
      subject: "주제",
      keywords: ["웹툰", "단행본"],
    });
    expect(formValueFromMetadata(FULL)).toEqual({
      title: FULL.title,
      author: FULL.author,
      subject: FULL.subject,
      keywordsText: "웹툰, 단행본, 합본",
    });
    expect(metadataFromFormValue(EMPTY_PDF_METADATA_FORM)).toBeNull();
  });
});

describe("describePdfMetadataRows / hasPdfMetadata", () => {
  it("채워진 속성만 제목·저자·주제·키워드 순서로 행을 만든다", () => {
    const rows = describePdfMetadataRows({ author: "저자", keywords: ["웹툰"] });
    expect(rows.map((row) => row.key)).toEqual(["author", "keywords"]);
    expect(rows[1]?.value).toBe("웹툰");
    expect(describePdfMetadataRows(undefined)).toEqual([]);
    expect(describePdfMetadataRows({})).toEqual([]);
  });

  it("hasPdfMetadata는 키워드만 있어도 true다", () => {
    expect(hasPdfMetadata({ keywords: ["웹툰"] })).toBe(true);
    expect(hasPdfMetadata({})).toBe(false);
    expect(hasPdfMetadata(undefined)).toBe(false);
  });
});

describe("applyPdfMetadata + readPdfMetadata (실제 PDF 바이트 왕복)", () => {
  it("제목·저자·주제·키워드가 결과 PDF에 실제로 기록되고 다시 읽힌다", async () => {
    const stamped = await applyPdfMetadata(await makePdf([100]), FULL);
    const read = await readPdfMetadata(stamped);
    expect(read.title).toBe(FULL.title);
    expect(read.author).toBe(FULL.author);
    expect(read.subject).toBe(FULL.subject);
    expect(read.keywords).toEqual([...FULL.keywords]);
    expect(read.producer).toBe("ToonStudio");
  });

  it("빈 속성은 바이트를 그대로 돌려준다 (기존 동작 무변경)", async () => {
    const bytes = await makePdf([100]);
    await expect(applyPdfMetadata(bytes, {})).resolves.toBe(bytes);
  });

  it("속성이 없는 PDF는 빈 속성과 '속성 없음' 행을 돌려준다", async () => {
    const read = await readPdfMetadata(await makePdf([100]));
    expect(hasPdfMetadata(read)).toBe(false);
    expect(describePdfMetadataRows(read)).toEqual([]);
  });
});

describe("엔진 연결 (병합·분할·소스 검사)", () => {
  async function fixture(): Promise<{ state: PdfWorkbenchState; bytesBySourceId: Map<string, Uint8Array> }> {
    const bytesA = await applyPdfMetadata(await makePdf([100, 110]), FULL);
    const bytesB = await makePdf([300]);
    const inspectedA = await inspectPdfSource({ id: "a", name: "a.pdf", bytes: bytesA });
    const inspectedB = await inspectPdfSource({ id: "b", name: "b.pdf", bytes: bytesB });
    const state = addPdfSource(addPdfSource(createPdfWorkbenchState(), inspectedA.source), inspectedB.source);
    return { state, bytesBySourceId: new Map([["a", bytesA], ["b", bytesB]]) };
  }

  it("inspectPdfSource가 소스 속성을 함께 돌려준다", async () => {
    const bytes = await applyPdfMetadata(await makePdf([100]), FULL);
    const inspected = await inspectPdfSource({ id: "x", name: "x.pdf", bytes });
    expect(inspected.metadata.title).toBe(FULL.title);
    expect(inspected.metadata.author).toBe(FULL.author);
    expect(inspected.metadata.keywords).toEqual([...FULL.keywords]);
  });

  it("병합 결과에 입력한 속성이 기록된다", async () => {
    const { state, bytesBySourceId } = await fixture();
    const merged = await buildMergedPdfBytes({ state, bytesBySourceId, metadata: FULL });
    const read = await readPdfMetadata(merged);
    expect(read).toMatchObject({ title: FULL.title, author: FULL.author, subject: FULL.subject });
    expect(read.keywords).toEqual([...FULL.keywords]);
  });

  it("분할 파일 전부에도 같은 속성이 기록된다", async () => {
    const { state, bytesBySourceId } = await fixture();
    const parsed = parsePdfPageRanges("1-2, 3", state.pages.length);
    if (!parsed.ok) throw new Error("파싱 실패");
    const files = await buildSplitPdfFiles({ state, bytesBySourceId, ranges: parsed.ranges, baseName: "합본.pdf", metadata: FULL });
    expect(files).toHaveLength(2);
    for (const file of files) {
      const read = await readPdfMetadata(file.bytes);
      expect(read.title).toBe(FULL.title);
      expect(read.author).toBe(FULL.author);
    }
  });

  it("기존 title 단독 호출은 그대로 제목만 기록하고, metadata.title이 우선한다", async () => {
    const { state, bytesBySourceId } = await fixture();
    const legacy = await readPdfMetadata(await buildMergedPdfBytes({ state, bytesBySourceId, title: "옛 제목" }));
    expect(legacy.title).toBe("옛 제목");
    expect(legacy.author).toBeUndefined();
    const both = await readPdfMetadata(
      await buildMergedPdfBytes({ state, bytesBySourceId, title: "옛 제목", metadata: { title: "새 제목" } }),
    );
    expect(both.title).toBe("새 제목");
  });
});
