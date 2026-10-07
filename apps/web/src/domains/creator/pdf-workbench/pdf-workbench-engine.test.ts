import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  addPdfSource,
  createPdfWorkbenchState,
  movePdfPageTo,
  parsePdfPageRanges,
  rotatePdfPage,
  type PdfWorkbenchState,
} from "./pdf-workbench-model";
import {
  PdfWorkbenchLoadError,
  buildMergedPdfBytes,
  buildSplitPdfFiles,
  fingerprintPdfBytes,
  inspectPdfSource,
} from "./pdf-workbench-engine";

/** 페이지마다 너비가 달라서 출력 순서를 크기만으로 검증할 수 있는 픽스처를 만든다. */
async function makePdf(widths: readonly number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const width of widths) doc.addPage([width, 400]);
  return doc.save();
}

async function pageWidths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => page.getSize().width);
}

const widthsA = [100, 110, 120];
const widthsB = [300, 310];

async function fixture(): Promise<{
  state: PdfWorkbenchState;
  bytesBySourceId: Map<string, Uint8Array>;
}> {
  const bytesA = await makePdf(widthsA);
  const bytesB = await makePdf(widthsB);
  const inspectedA = await inspectPdfSource({ id: "a", name: "a.pdf", bytes: bytesA });
  const inspectedB = await inspectPdfSource({ id: "b", name: "b.pdf", bytes: bytesB });
  const state = addPdfSource(
    addPdfSource(createPdfWorkbenchState(), inspectedA.source),
    inspectedB.source,
  );
  return { state, bytesBySourceId: new Map([["a", bytesA], ["b", bytesB]]) };
}

describe("inspectPdfSource", () => {
  it("페이지 수·크기를 읽고 지문을 만든다", async () => {
    const bytes = await makePdf(widthsA);
    const inspected = await inspectPdfSource({ id: "x", name: "x.pdf", bytes });
    expect(inspected.source.pageCount).toBe(3);
    expect(inspected.source.sizeBytes).toBe(bytes.byteLength);
    expect(inspected.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("같은 바이트는 같은 지문, 다른 바이트는 다른 지문", async () => {
    const a1 = await fingerprintPdfBytes(await makePdf([100]));
    const a2 = await fingerprintPdfBytes(await makePdf([100]));
    const b = await fingerprintPdfBytes(await makePdf([101]));
    // pdf-lib 저장 바이트는 메타데이터 때문에 실행마다 다를 수 있어 지문 동일성은
    // "같은 바이트 입력"으로만 판정한다.
    const same = await makePdf([100]);
    expect(await fingerprintPdfBytes(same)).toBe(await fingerprintPdfBytes(same));
    expect(a1).not.toBe(b);
    expect(a2).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("PDF가 아닌 바이트는 invalid 오류로 구분한다", async () => {
    const error = await inspectPdfSource({
      id: "bad",
      name: "bad.pdf",
      bytes: new TextEncoder().encode("이것은 PDF가 아닙니다"),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PdfWorkbenchLoadError);
    if (error instanceof PdfWorkbenchLoadError) expect(error.kind).toBe("invalid");
  });
});

describe("buildMergedPdfBytes (병합·재배열)", () => {
  it("두 소스를 붙이면 소스 순서대로 이어진다", async () => {
    const { state, bytesBySourceId } = await fixture();
    const merged = await buildMergedPdfBytes({ state, bytesBySourceId });
    expect(await pageWidths(merged)).toEqual([...widthsA, ...widthsB]);
  });

  it("소스를 가로질러 재배열한 순서가 출력에 그대로 반영된다", async () => {
    const { state, bytesBySourceId } = await fixture();
    const reordered = movePdfPageTo(state, "b#1", 0);
    const merged = await buildMergedPdfBytes({ state: reordered, bytesBySourceId });
    expect(await pageWidths(merged)).toEqual([310, 100, 110, 120, 300]);
  });

  it("회전 델타가 원본 회전 위에 더해진다", async () => {
    const { state, bytesBySourceId } = await fixture();
    const rotated = rotatePdfPage(state, "a#0", 1);
    const merged = await buildMergedPdfBytes({ state: rotated, bytesBySourceId });
    const doc = await PDFDocument.load(merged);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(0);
  });

  it("빈 목록은 오류를 던진다", async () => {
    await expect(
      buildMergedPdfBytes({ state: createPdfWorkbenchState(), bytesBySourceId: new Map() }),
    ).rejects.toThrow("내려받을 페이지가 없어요");
  });
});

describe("buildSplitPdfFiles (범위 분할)", () => {
  it("범위마다 파일이 하나씩 나오고 페이지가 정확히 갈린다", async () => {
    const { state, bytesBySourceId } = await fixture();
    const parsed = parsePdfPageRanges("1-2, 4-5", state.pages.length);
    if (!parsed.ok) throw new Error("파싱 실패");
    const files = await buildSplitPdfFiles({
      state,
      bytesBySourceId,
      ranges: parsed.ranges,
      baseName: "합본.pdf",
    });
    expect(files.map((file) => file.name)).toEqual(["합본-1-2.pdf", "합본-4-5.pdf"]);
    expect(await pageWidths(files[0]?.bytes ?? new Uint8Array())).toEqual([100, 110]);
    expect(await pageWidths(files[1]?.bytes ?? new Uint8Array())).toEqual([300, 310]);
  });
});
