import { describe, expect, it } from "vitest";

import { createMockEngine } from "../testing/mock-engine";

import { isPng } from "./png-encoder";
import {
  clampWebtoonTankobonPageLayout,
  composeWebtoonTankobonPage,
  exportWebtoonTankobonPagePng,
  formatTankobonFolioLabel,
  resolveTankobonCellGridCoord,
} from "./webtoon-tankobon-page";

describe("webtoon-tankobon-page", () => {
  it("resolveTankobonCellGridCoord는 우→좌 단행본(1우상·2좌상·3우하·4좌하)과 좌→우 출판 순서를 정확히 매핑한다", () => {
    expect([0, 1, 2, 3].map((i) => resolveTankobonCellGridCoord(i, "rtl-tankobon"))).toEqual([
      { col: 1, row: 0 },
      { col: 0, row: 0 },
      { col: 1, row: 1 },
      { col: 0, row: 1 },
    ]);
    expect([0, 1, 2, 3].map((i) => resolveTankobonCellGridCoord(i, "ltr-manhwa"))).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ]);
  });

  it("홀수/짝수 책등 제본 여백(bindingSide) 대칭과 하단 트림 쪽번호(Folio P.07) 스탬핑을 정확히 합성한다", () => {
    expect(formatTankobonFolioLabel(7)).toBe("P.07");
    const sym = clampWebtoonTankobonPageLayout(200, true, "none", "rtl-tankobon");
    const oddRtl = clampWebtoonTankobonPageLayout(200, true, "odd-recto", "rtl-tankobon");
    const evenRtl = clampWebtoonTankobonPageLayout(200, true, "even-verso", "rtl-tankobon");
    // 우→좌 단행본 홀수 쪽은 우측이 책등이므로 rightMarginPx > leftMarginPx, 짝수 쪽은 좌측이 책등
    expect(oddRtl.rightMarginPx).toBeGreaterThan(oddRtl.leftMarginPx);
    expect(evenRtl.leftMarginPx).toBeGreaterThan(evenRtl.rightMarginPx);
    expect(oddRtl.leftMarginPx + oddRtl.rightMarginPx).toBe(sym.leftMarginPx + sym.rightMarginPx);

    const colors: ReadonlyArray<readonly [number, number, number]> = [
      [220, 40, 40],
      [40, 200, 80],
      [40, 80, 220],
      [210, 180, 40],
    ];
    const panels = colors.map(([r, g, b]) => {
      const rgba = new Uint8ClampedArray(sym.cutWidth * sym.cutHeight * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
      }
      return { width: sym.cutWidth, height: sym.cutHeight, rgba };
    });

    const withoutFolio = composeWebtoonTankobonPage(panels, sym, { readingOrder: "rtl-tankobon", includeCropMarks: true });
    const withFolio = composeWebtoonTankobonPage(panels, sym, {
      readingOrder: "rtl-tankobon",
      includeCropMarks: true,
      pageNumber: 7,
    });

    const sampleY = sym.bleedMarginPx + sym.borderPx + sym.bubbleSafeTopPx + Math.floor(sym.cutHeight * 0.5);
    const leftCellX = sym.leftMarginPx + sym.borderPx + Math.floor(sym.cutWidth * 0.5);
    const rightCellX =
      sym.leftMarginPx + (sym.cutWidth + sym.borderPx * 2 + sym.gutterX) + sym.borderPx + Math.floor(sym.cutWidth * 0.5);

    const rightIdx = (sampleY * withFolio.width + rightCellX) * 4;
    const leftIdx = (sampleY * withFolio.width + leftCellX) * 4;
    expect(withFolio.rgba[rightIdx]!).toBeGreaterThan(withFolio.rgba[rightIdx + 1]!);
    expect(withFolio.rgba[leftIdx + 1]!).toBeGreaterThan(withFolio.rgba[leftIdx]!);

    // 하단 트림 여백에 P.07 잉크 픽셀이 찍혀 withoutFolio와 차이가 발생한다
    let footerDiffPixels = 0;
    const footerStart = (sym.pageHeight - sym.bleedMarginPx) * sym.pageWidth * 4;
    for (let i = footerStart; i < withFolio.rgba.length; i += 4) {
      if (withFolio.rgba[i] !== withoutFolio.rgba[i]) footerDiffPixels += 1;
    }
    expect(footerDiffPixels).toBeGreaterThan(10);
  });

  it("exportWebtoonTankobonPagePng는 일본어 세로쓰기·할프톤 스크린톤·쪽번호(-p07)가 반영된 PNG를 출력한다", async () => {
    const engine = createMockEngine();
    const outcome = await exportWebtoonTankobonPagePng(
      engine,
      {
        pageWidth: 180,
        readingOrder: "rtl-tankobon",
        pageNumber: 7,
        bindingSide: "odd-recto",
        screentones: ["classic-ink-45", "none", "rose-duotone-dots", "none"],
        mangaFx: {
          enabled: true,
          locale: "ja",
          jaWritingMode: "vertical-tategaki",
          dialogueLines: ["第一幕。", "反撃開始。", "真実を語れ。", "決着だ。"],
          sfxStamps: ["seureung", "none", "kugugung", "none"],
        },
      },
      { now: () => 500 },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(isPng(outcome.bytes)).toBe(true);
    expect(outcome.receipt.fileName).toMatch(/-tankobon-rtl-fx-tone-p07-page\.png$/u);
  });
});
