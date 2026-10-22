import { describe, expect, it } from "vitest";

import { prepareStudioDocumentInterchangeCommit } from "./studio-document-interchange-commit";
import { buildPsdAdjustmentImportReport } from "./studio-psd-adjustment-report";

import type { PageState } from "./studio-page-state";

function ids(): () => string {
  let value = 0;
  return () => `new-${++value}`;
}

function page(id: string): PageState {
  return { id, elements: [], bg: "#fff", bgGrad: null, canvasH: 1_080 };
}

function blankPage(createId: () => string, canvasH: number): PageState {
  return { id: createId(), elements: [], bg: "#fff", bgGrad: null, canvasH };
}

const baseOptions = {
  anchorPageId: "anchor",
  canvasWidth: 720,
  createId: ids(),
  createBlankPage: blankPage,
  maxEmbeddedBytes: 1_000_000,
} as const;

function psdResult(over: Record<string, unknown> = {}) {
  return {
    elements: [
      { id: "img-bottom", type: "image", stackIndex: 0 } as never,
      { id: "img-top", type: "image", stackIndex: 2 } as never,
    ],
    sourceWidth: 720,
    sourceHeight: 1_000,
    scale: 1,
    skipped: [],
    ...over,
  };
}

const levelsAdjustment = {
  id: "adj-1",
  name: "레벨1",
  kind: "levels" as const,
  parameters: { rgbShadowInput: 10 },
  notes: [],
  stackIndex: 1,
  opacity: 0.5,
  blendMode: "multiply",
  clipBelow: true as const,
};

describe("PSD 조정 레이어 문서 적용", () => {
  it("레이어 방식: 조정 레이어가 원래 스택 순서 위치에 AdjustmentEl로 삽입된다", async () => {
    const result = await prepareStudioDocumentInterchangeCommit({
      kind: "psd",
      fileName: "episode.psd",
      preview: {} as never,
      result: psdResult({
        adjustmentLayers: [levelsAdjustment],
        adjustmentReport: buildPsdAdjustmentImportReport([levelsAdjustment], []),
      }) as never,
    }, { ...baseOptions, pages: [page("anchor")], choice: "new-page" });

    const inserted = result.pages[1]!;
    expect(inserted.elements.map((el) => el.id)).toEqual(["img-bottom", "adj-1", "img-top"]);
    const adjustment = inserted.elements[1] as unknown as Record<string, unknown>;
    expect(adjustment).toMatchObject({
      type: "adjustment",
      adjustment: "levels",
      parameters: { rgbShadowInput: 10 },
      name: "레벨1",
      x: 0,
      y: 0,
      width: 720,
      height: 1_000,
      opacity: 0.5,
      blendMode: "multiply",
      clipToBelow: true,
      clipBelow: true,
    });
    expect(result.status.text).toContain("조정 레이어 1개도 함께 복원했어요");
  });

  it("마스크가 있는 조정 명세는 maskSrc·maskEnabled가 AdjustmentEl까지 그대로 실린다", async () => {
    const masked = {
      ...levelsAdjustment,
      maskSrc: "data:image/png;base64,ADJMASK",
      maskEnabled: false as const,
    };
    const result = await prepareStudioDocumentInterchangeCommit({
      kind: "psd",
      fileName: "episode.psd",
      preview: {} as never,
      result: psdResult({
        adjustmentLayers: [masked],
        adjustmentReport: buildPsdAdjustmentImportReport([masked], []),
      }) as never,
    }, { ...baseOptions, pages: [page("anchor")], choice: "new-page" });

    const adjustment = result.pages[1]!.elements[1] as unknown as Record<string, unknown>;
    expect(adjustment).toMatchObject({
      type: "adjustment",
      maskSrc: "data:image/png;base64,ADJMASK",
      maskEnabled: false,
    });
  });

  it("현재 페이지 방식: 기존 요소 뒤에 래스터·조정 상대 순서를 유지해 붙는다", async () => {
    const anchor = page("anchor");
    anchor.elements = [{ id: "existing", type: "image" } as never];
    const result = await prepareStudioDocumentInterchangeCommit({
      kind: "psd",
      fileName: "episode.psd",
      preview: {} as never,
      result: psdResult({
        adjustmentLayers: [levelsAdjustment],
        adjustmentReport: buildPsdAdjustmentImportReport([levelsAdjustment], []),
      }) as never,
    }, { ...baseOptions, pages: [anchor], choice: "current-page" });

    expect(result.pages[0]!.elements.map((el) => el.id)).toEqual([
      "existing", "img-bottom", "adj-1", "img-top",
    ]);
  });

  it("근사·파라미터만 보존 건수는 적용 완료 문구에도 정직하게 남는다", async () => {
    const selective = {
      id: "adj-2",
      name: "선택1",
      kind: "selective-color" as const,
      parameters: {},
      notes: ["선택 색상은 색상 섹터 분류 기준 CMYK 근사로 적용됩니다(파라미터는 무손실 보존)."],
      stackIndex: 1,
    };
    const lookup = {
      id: "adj-3",
      name: "룩업1",
      kind: "color-lookup" as const,
      parameters: {},
      notes: ["LUT 데이터가 PSD에 내장돼 있지 않아 파라미터만 보존했습니다 — 픽셀에는 적용되지 않습니다."],
      stackIndex: 3,
    };
    const layers = [selective, lookup];
    const result = await prepareStudioDocumentInterchangeCommit({
      kind: "psd",
      fileName: "episode.psd",
      preview: {} as never,
      result: psdResult({
        adjustmentLayers: layers,
        adjustmentReport: buildPsdAdjustmentImportReport(layers, []),
      }) as never,
    }, { ...baseOptions, pages: [page("anchor")], choice: "new-page" });

    expect(result.pages[1]!.elements.map((el) => el.id)).toEqual([
      "img-bottom", "adj-2", "img-top", "adj-3",
    ]);
    expect(result.status.text).toContain("근사 1개는 픽셀 결과가 원본과 다를 수 있어요");
    expect(result.status.text).toContain("파라미터만 보존 1개는 픽셀에 적용되지 않아요");
  });

  it("합성본 방식: 조정 레이어를 별도 레이어로 넣지 않고 그 사실을 문구로 고지한다", async () => {
    const result = await prepareStudioDocumentInterchangeCommit({
      kind: "psd",
      fileName: "episode.psd",
      preview: {} as never,
      result: psdResult({
        compositeElement: { id: "composite", type: "image" } as never,
        adjustmentLayers: [levelsAdjustment],
        adjustmentReport: buildPsdAdjustmentImportReport([levelsAdjustment], []),
      }) as never,
    }, {
      ...baseOptions,
      pages: [page("anchor")],
      choice: "new-page",
      psdRepresentation: "composite",
    });

    expect(result.pages[1]!.elements.map((el) => el.id)).toEqual(["composite"]);
    expect(result.status.text).toContain("편집 가능한 조정 레이어로는 복원되지 않아요");
  });

  it("구형 결과(래스터 stackIndex 없음): 조정은 래스터 뒤에 붙는다 — 순서를 지어내지 않는다", async () => {
    const result = await prepareStudioDocumentInterchangeCommit({
      kind: "psd",
      fileName: "episode.psd",
      preview: {} as never,
      result: psdResult({
        elements: [
          { id: "img-a", type: "image" } as never,
          { id: "img-b", type: "image" } as never,
        ],
        adjustmentLayers: [{ ...levelsAdjustment, stackIndex: 0 }],
      }) as never,
    }, { ...baseOptions, pages: [page("anchor")], choice: "new-page" });

    expect(result.pages[1]!.elements.map((el) => el.id)).toEqual(["img-a", "img-b", "adj-1"]);
  });
});
