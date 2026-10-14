import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  addPdfSource,
  createPdfWorkbenchState,
  removePdfPage,
  type PdfOutputStep,
  type PdfWorkbenchSource,
} from "./pdf-workbench-model";
import { buildMergedPdfBytes, inspectPdfSource } from "./pdf-workbench-engine";
import {
  applyPdfOutline,
  buildPdfMergeOutline,
  countPdfOutlineEntries,
  pdfSourceBookmarkTitle,
  readPdfOutline,
  type PdfMergeOutlineEntry,
  type PdfSourceOutlineItem,
} from "./pdf-workbench-outline";

const sourceA: PdfWorkbenchSource = { id: "a", name: "단행본-1권.pdf", sizeBytes: 1, pageCount: 3 };
const sourceB: PdfWorkbenchSource = { id: "b", name: "외전.pdf", sizeBytes: 1, pageCount: 2 };

function stepsOf(sourceId: string, pageIndices: readonly number[]): PdfOutputStep[] {
  return pageIndices.map((sourcePageIndex) => ({ sourceId, sourcePageIndex, rotationDelta: 0 }));
}

describe("pdfSourceBookmarkTitle", () => {
  it("확장자를 떼고 빈 이름은 대체한다", () => {
    expect(pdfSourceBookmarkTitle("단행본-1권.pdf")).toBe("단행본-1권");
    expect(pdfSourceBookmarkTitle("외전.PDF")).toBe("외전");
    expect(pdfSourceBookmarkTitle("이름그대로")).toBe("이름그대로");
    expect(pdfSourceBookmarkTitle(".pdf")).toBe("이름 없는 PDF");
    expect(pdfSourceBookmarkTitle("  ")).toBe("이름 없는 PDF");
  });
});

describe("buildPdfMergeOutline (순수 계획)", () => {
  const outlineA: PdfSourceOutlineItem[] = [
    { title: "1화", depth: 0, sourcePageIndex: 0 },
    { title: "1화 후반", depth: 1, sourcePageIndex: 1 },
    { title: "2화", depth: 0, sourcePageIndex: 2 },
  ];

  it("파일 항목 아래 원본 아웃라인을 중첩하고 페이지를 출력 기준으로 바꾼다", () => {
    const entries = buildPdfMergeOutline({
      sources: [sourceA, sourceB],
      steps: [...stepsOf("a", [0, 1, 2]), ...stepsOf("b", [0, 1])],
      outlinesBySourceId: new Map([["a", outlineA]]),
    });
    expect(entries.map((entry) => entry.title)).toEqual(["단행본-1권", "외전"]);
    expect(entries[0]?.outputPageIndex).toBe(0);
    expect(entries[1]?.outputPageIndex).toBe(3);
    expect(entries[0]?.children.map((child) => [child.title, child.outputPageIndex])).toEqual([
      ["1화", 0],
      ["2화", 2],
    ]);
    expect(entries[0]?.children[0]?.children.map((child) => child.title)).toEqual(["1화 후반"]);
    // 아웃라인 없는 소스도 파일 항목 하나는 받는다.
    expect(entries[1]?.children).toEqual([]);
    expect(countPdfOutlineEntries(entries)).toBe(5);
  });

  it("출력에서 빠진 페이지를 가리키는 항목은 버리고 자식은 승격한다", () => {
    const entries = buildPdfMergeOutline({
      sources: [sourceA],
      // 0번 페이지가 출력에서 빠졌다 — "1화"(p0)는 사라지고 "1화 후반"(p1)이 승격.
      steps: stepsOf("a", [1, 2]),
      outlinesBySourceId: new Map([["a", outlineA]]),
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.outputPageIndex).toBe(0);
    expect(entries[0]?.children.map((child) => [child.title, child.outputPageIndex])).toEqual([
      ["1화 후반", 0],
      ["2화", 1],
    ]);
  });

  it("목적지를 해석할 수 없던 항목(sourcePageIndex null)은 중첩에서 제외한다", () => {
    const entries = buildPdfMergeOutline({
      sources: [sourceA],
      steps: stepsOf("a", [0]),
      outlinesBySourceId: new Map([
        [
          "a",
          [
            { title: "외부 링크", depth: 0, sourcePageIndex: null },
            { title: "시작", depth: 0, sourcePageIndex: 0 },
          ],
        ],
      ]),
    });
    expect(entries[0]?.children.map((child) => child.title)).toEqual(["시작"]);
  });
});

/** 너비가 다른 페이지 + 선택 아웃라인으로 실제 소스 PDF 바이트를 만든다. */
async function makeSourcePdf(
  widths: readonly number[],
  outline?: readonly PdfMergeOutlineEntry[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const width of widths) doc.addPage([width, 400]);
  if (outline) applyPdfOutline(doc, outline);
  return doc.save();
}

describe("applyPdfOutline + readPdfOutline (pdf-lib 왕복)", () => {
  it("쓴 아웃라인을 그대로 다시 읽는다 (한글 제목·깊이·페이지)", async () => {
    const bytes = await makeSourcePdf([100, 110, 120], [
      {
        title: "단행본-1권",
        outputPageIndex: 0,
        children: [
          { title: "1화", outputPageIndex: 0, children: [] },
          {
            title: "2화",
            outputPageIndex: 2,
            children: [{ title: "2화 클라이맥스", outputPageIndex: 2, children: [] }],
          },
        ],
      },
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(readPdfOutline(doc)).toEqual([
      { title: "단행본-1권", depth: 0, sourcePageIndex: 0 },
      { title: "1화", depth: 1, sourcePageIndex: 0 },
      { title: "2화", depth: 1, sourcePageIndex: 2 },
      { title: "2화 클라이맥스", depth: 2, sourcePageIndex: 2 },
    ]);
    expect(doc.catalog.get(PDFName.of("PageMode"))?.toString()).toBe("/UseOutlines");
  });

  it("아웃라인이 없는 문서는 빈 목록, 빈 계획은 카탈로그를 건드리지 않는다", async () => {
    const plain = await PDFDocument.create();
    plain.addPage([100, 400]);
    expect(readPdfOutline(plain)).toEqual([]);
    applyPdfOutline(plain, []);
    expect(plain.catalog.get(PDFName.of("Outlines"))).toBeUndefined();
  });

  it("이름 목적지(Dests 딕셔너리)도 페이지로 해석한다", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([100, 400]);
    doc.addPage([110, 400]);
    const context = doc.context;

    const destArray = PDFArray.withContext(context);
    destArray.push(page.ref);
    destArray.push(PDFName.of("Fit"));
    const dests = PDFDict.withContext(context);
    dests.set(PDFName.of("chapter-start"), destArray);
    doc.catalog.set(PDFName.of("Dests"), context.register(dests));

    const root = PDFDict.withContext(context);
    root.set(PDFName.of("Type"), PDFName.of("Outlines"));
    root.set(PDFName.of("Count"), PDFNumber.of(1));
    const rootRef = context.register(root);
    const item = PDFDict.withContext(context);
    item.set(PDFName.of("Title"), PDFHexString.fromText("이름 목적지 항목"));
    item.set(PDFName.of("Dest"), PDFString.of("chapter-start"));
    item.set(PDFName.of("Parent"), rootRef);
    const itemRef = context.register(item);
    root.set(PDFName.of("First"), itemRef);
    root.set(PDFName.of("Last"), itemRef);
    doc.catalog.set(PDFName.of("Outlines"), rootRef);

    const bytes = await doc.save();
    const loaded = await PDFDocument.load(bytes);
    expect(readPdfOutline(loaded)).toEqual([
      { title: "이름 목적지 항목", depth: 0, sourcePageIndex: 0 },
    ]);
  });

  it("깨진 아웃라인(First가 딕셔너리가 아님)은 예외 없이 빈 목록이다", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 400]);
    const context = doc.context;
    const root = PDFDict.withContext(context);
    root.set(PDFName.of("Type"), PDFName.of("Outlines"));
    root.set(PDFName.of("First"), PDFNumber.of(42));
    doc.catalog.set(PDFName.of("Outlines"), context.register(root));
    const loaded = await PDFDocument.load(await doc.save());
    expect(readPdfOutline(loaded)).toEqual([]);
  });
});

describe("buildMergedPdfBytes 아웃라인 (엔진 통합)", () => {
  async function fixture() {
    const bytesA = await makeSourcePdf([100, 110, 120], [
      {
        title: "원본 목차",
        outputPageIndex: 0,
        children: [
          { title: "1화", outputPageIndex: 0, children: [] },
          { title: "2화", outputPageIndex: 2, children: [] },
        ],
      },
    ]);
    const bytesB = await makeSourcePdf([300, 310]);
    const inspectedA = await inspectPdfSource({ id: "a", name: "단행본-1권.pdf", bytes: bytesA });
    const inspectedB = await inspectPdfSource({ id: "b", name: "외전.pdf", bytes: bytesB });
    const state = addPdfSource(
      addPdfSource(createPdfWorkbenchState(), inspectedA.source),
      inspectedB.source,
    );
    return { state, bytesBySourceId: new Map([["a", bytesA], ["b", bytesB]]) };
  }

  it("병합 결과에 파일별 책갈피 + 원본 목차 중첩이 표시된다", async () => {
    const { state, bytesBySourceId } = await fixture();
    const merged = await buildMergedPdfBytes({ state, bytesBySourceId });
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(5);
    expect(readPdfOutline(doc)).toEqual([
      { title: "단행본-1권", depth: 0, sourcePageIndex: 0 },
      // 소스 A의 원본 최상위 항목 "원본 목차"가 파일 항목 아래에 중첩된다.
      { title: "원본 목차", depth: 1, sourcePageIndex: 0 },
      { title: "1화", depth: 2, sourcePageIndex: 0 },
      { title: "2화", depth: 2, sourcePageIndex: 2 },
      // 아웃라인 없던 소스 B도 파일 책갈피를 받는다.
      { title: "외전", depth: 0, sourcePageIndex: 3 },
    ]);
  });

  it("페이지를 지우고 병합하면 책갈피 목적지도 함께 이동한다", async () => {
    const { state, bytesBySourceId } = await fixture();
    const trimmed = removePdfPage(state, "a#0");
    const merged = await buildMergedPdfBytes({ state: trimmed, bytesBySourceId });
    const doc = await PDFDocument.load(merged);
    const flat = readPdfOutline(doc);
    expect(flat.find((item) => item.title === "외전")?.sourcePageIndex).toBe(2);
    // 빠진 페이지를 가리키던 "1화"·"원본 목차"는 사라지고 "2화"는 1로 당겨진다.
    expect(flat.map((item) => item.title)).not.toContain("1화");
    expect(flat.find((item) => item.title === "2화")?.sourcePageIndex).toBe(1);
  });

  it("outline: false면 책갈피 없이 기존처럼 병합된다", async () => {
    const { state, bytesBySourceId } = await fixture();
    const merged = await buildMergedPdfBytes({ state, bytesBySourceId, outline: false });
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(5);
    expect(readPdfOutline(doc)).toEqual([]);
    expect(doc.catalog.get(PDFName.of("Outlines"))).toBeUndefined();
  });
});
