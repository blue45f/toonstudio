import { describe, expect, it } from "vitest";

import { createMockEngine } from "../testing/mock-engine";

import { isPng } from "./png-encoder";
import {
  clampWebtoonTankobonPageLayout,
  composeWebtoonTankobonPage,
  exportWebtoonTankobonPagePng,
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

  it("composeWebtoonTankobonPage는 우→좌 순서에 따라 1컷(우상)과 2컷(좌상) 픽셀을 정확한 셀에 배치하고 재단선을 그린다", () => {
    const layout = clampWebtoonTankobonPageLayout(160, true);
    const colors: ReadonlyArray<readonly [number, number, number]> = [
      [220, 40, 40],
      [40, 200, 80],
      [40, 80, 220],
      [210, 180, 40],
    ];
    const panels = colors.map(([r, g, b]) => {
      const rgba = new Uint8ClampedArray(layout.cutWidth * layout.cutHeight * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
      }
      return { width: layout.cutWidth, height: layout.cutHeight, rgba };
    });

    const rtlPage = composeWebtoonTankobonPage(panels, layout, {
      readingOrder: "rtl-tankobon",
      includeCropMarks: true,
    });
    const sampleY = layout.bleedMarginPx + layout.borderPx + layout.bubbleSafeTopPx + Math.floor(layout.cutHeight * 0.5);
    const leftCellX = layout.bleedMarginPx + layout.borderPx + Math.floor(layout.cutWidth * 0.5);
    const rightCellX =
      layout.bleedMarginPx + (layout.cutWidth + layout.borderPx * 2 + layout.gutterX) + layout.borderPx + Math.floor(layout.cutWidth * 0.5);

    const rightIdx = (sampleY * rtlPage.width + rightCellX) * 4;
    const leftIdx = (sampleY * rtlPage.width + leftCellX) * 4;
    // 우→좌 모드: 우상단 셀이 1컷(빨강 우세), 좌상단 셀이 2컷(초록 우세)
    expect(rtlPage.rgba[rightIdx]!).toBeGreaterThan(rtlPage.rgba[rightIdx + 1]!);
    expect(rtlPage.rgba[leftIdx + 1]!).toBeGreaterThan(rtlPage.rgba[leftIdx]!);
  });

  it("exportWebtoonTankobonPagePng는 일본어 세로쓰기·할프톤 스크린톤이 반영된 -tankobon-rtl-fx-tone-page.png를 출력한다", async () => {
    const engine = createMockEngine();
    const outcome = await exportWebtoonTankobonPagePng(
      engine,
      {
        pageWidth: 160,
        readingOrder: "rtl-tankobon",
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
    expect(outcome.receipt.fileName).toMatch(/-tankobon-rtl-fx-tone-page\.png$/u);
  });
});
