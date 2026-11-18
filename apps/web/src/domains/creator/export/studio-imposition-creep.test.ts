import { describe, expect, it } from "vitest";

import {
  computeSaddleStitchSheetCreepMm,
  joinPagesIntoSpreads,
  planMangaBookletImposition,
  planRunningMarginStamps,
  splitSpreadIntoReadingOrderRects,
} from "./studio-imposition-creep";
import { buildPrintPdfFromPages } from "./studio-pdf-print-export";

import type { PrintPdfPage } from "./studio-pdf-print-export";

describe("studio-imposition-creep", () => {
  it("중철 밀림 보정(viewsaddlestitching)이 겉장 0mm에서 가운데장 최대치로 척추 쪽에 수렴한다", () => {
    expect(
      computeSaddleStitchSheetCreepMm({ sheetIndex: 0, sheetCount: 4, maxCreepMm: 1.8 }),
    ).toBe(0);
    expect(
      computeSaddleStitchSheetCreepMm({ sheetIndex: 3, sheetCount: 4, maxCreepMm: 1.8 }),
    ).toBeCloseTo(1.8, 3);

    const sheets = planMangaBookletImposition({
      pageCount: 16,
      bindingDirection: "ltr",
      maxCreepMm: 1.5,
    });
    expect(sheets).toHaveLength(4);
    // 겉장(시트 0)은 밀림 0
    expect(sheets[0]!.front[0].shiftXMm).toBe(0);
    expect(sheets[0]!.front[1].shiftXMm).toBe(0);

    // 가운데장(시트 3)은 왼쪽 면이 +1.5mm(오른쪽 척추 방향), 오른쪽 면이 -1.5mm(왼쪽 척추 방향) 이동
    expect(sheets[3]!.front[0].shiftXMm).toBeCloseTo(1.5, 3);
    expect(sheets[3]!.front[1].shiftXMm).toBeCloseTo(-1.5, 3);
  });

  it("좌철(ltr)과 우철(rtl) 제본 시트의 앞·뒷면 물리 배치가 정확히 대응한다", () => {
    const ltr = planMangaBookletImposition({ pageCount: 8, bindingDirection: "ltr" });
    expect(ltr[0]!.front.map((s) => s.pageIndex)).toEqual([7, 0]);
    expect(ltr[0]!.back.map((s) => s.pageIndex)).toEqual([1, 6]);

    // 우철(rtl): 앞면 왼쪽(0쪽)의 뒷면 오른쪽에 1쪽이 찍히고, 앞면 오른쪽(7쪽)의 뒷면 왼쪽에 6쪽이 찍힌다.
    const rtl = planMangaBookletImposition({ pageCount: 8, bindingDirection: "rtl" });
    expect(rtl[0]!.front.map((s) => s.pageIndex)).toEqual([0, 7]);
    expect(rtl[0]!.back.map((s) => s.pageIndex)).toEqual([6, 1]);
    expect(rtl[1]!.front.map((s) => s.pageIndex)).toEqual([2, 5]);
    expect(rtl[1]!.back.map((s) => s.pageIndex)).toEqual([4, 3]);
  });

  it("양면 펼침면 결합·분할과 판면 바깥 여백 스탬프가 ltr/rtl 읽기 순서를 준수한다", () => {
    const pages = [0, 1, 2, 3].map((idx) => ({
      pageId: `p-${idx + 1}`,
      pageIndex: idx,
      widthPx: 800,
      heightPx: 1200,
    }));

    const rtlSpreads = joinPagesIntoSpreads(pages, { bindingDirection: "rtl" });
    expect(rtlSpreads).toHaveLength(2);
    // 우철 펼침면에서는 첫 페이지(p-1)가 오른쪽, 다음 페이지(p-2)가 왼쪽에 놓인다.
    expect(rtlSpreads[0]!.rightPage?.pageId).toBe("p-1");
    expect(rtlSpreads[0]!.leftPage?.pageId).toBe("p-2");

    const splitRtl = splitSpreadIntoReadingOrderRects(1600, 1200, "rtl");
    expect(splitRtl.firstReadingPageRect.x).toBe(800);
    expect(splitRtl.secondReadingPageRect.x).toBe(0);

    const stamps = planRunningMarginStamps({
      pageCount: 4,
      trimWidthMm: 148,
      trimHeightMm: 210,
      bindingDirection: "rtl",
      storyTitle: "달빛 검객",
      episodeLabel: "제3화",
      skipLeadingPages: 1,
    });
    expect(stamps).toHaveLength(3);
    expect(stamps[0]!.folioNumber).toBe(2);
    expect(stamps[0]!.text).toContain("달빛 검객 · 제3화");
    expect(stamps[0]!.align).not.toBe(stamps[1]!.align);
  });

  it("buildPrintPdfFromPages에서 우철(rtl) 및 중철 밀림(creepMm) 배치가 PDF 콘텐츠 좌표에 반영된다", () => {
    const fakeJpeg = (seed: number): PrintPdfPage => ({
      kind: "jpeg",
      jpegBytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, seed, 0xff, 0xd9]),
      width: 100,
      height: 200,
    });
    const pages = Array.from({ length: 8 }, (_, idx) => fakeJpeg(idx + 1));
    const pdf = buildPrintPdfFromPages(pages, {
      print: {
        imposition: "booklet",
        bindingDirection: "rtl",
        creepMm: 2.54, // 2.54mm = 정확히 7.2pt
      },
    });
    const text = Array.from(pdf, (b) => String.fromCharCode(b)).join("");
    // 8페이지 -> 중철 시트 2장 × 앞뒤 = 4 펼침면
    expect(text).toContain("/Count 4");
    // 안쪽 시트(시트 1) 왼쪽 슬롯이 +7.2pt 이동한 변환 행렬이 기록된다.
    expect(text).toContain("75 0 0 150 7.2 0 cm");
  });
});
