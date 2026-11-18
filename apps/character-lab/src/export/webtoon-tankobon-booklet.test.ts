import { describe, expect, it } from "vitest";

import { createMockEngine } from "../testing/mock-engine";

import { MAX_PNG_EXPORT_DIMENSION } from "./export-session";
import { isPng } from "./png-encoder";
import { DEFAULT_EPISODE_CUTSHEET_SNAPSHOT, createEpisodeCutsheetStore } from "./webtoon-episode-cutsheet";
import {
  buildTankobonChaptersFromBeats,
  composeTankobonCoverPage,
  composeTankobonFacingSpread,
  composeTankobonTocPage,
  exportWebtoonTankobonCoverPng,
  exportWebtoonTankobonSpreadPng,
  exportWebtoonTankobonTocPng,
} from "./webtoon-tankobon-booklet";
import { clampWebtoonTankobonPageLayout } from "./webtoon-tankobon-page";

function makeDummyPortrait(width: number, height: number): { readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray } {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 180;
    rgba[i + 1] = 120;
    rgba[i + 2] = 160;
    rgba[i + 3] = 255;
  }
  return { width, height, rgba };
}

describe("webtoon-tankobon-booklet", () => {
  it("표지(VOL.03)·목차(CONTENTS + 점선 리더 + P.02)·양면 펼침면을 결정적으로 합성한다", () => {
    const store = createEpisodeCutsheetStore({ episodeTitleKo: "특별단행본 성전 연대기" });
    store.addBeat("로판 대관식", { ...DEFAULT_EPISODE_CUTSHEET_SNAPSHOT, bakeStripFx: true });
    store.addBeat("대신전 신탁", { ...DEFAULT_EPISODE_CUTSHEET_SNAPSHOT, bakeStripFx: true });

    const chapters = buildTankobonChaptersFromBeats(store.getState().beats, "특별단행본 성전 연대기");
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.startPageNumber).toBe(3);
    expect(chapters[1]?.startPageNumber).toBe(4);

    const coverLayout = clampWebtoonTankobonPageLayout(160, false, "odd-recto", "rtl-tankobon");
    const tocLayout = clampWebtoonTankobonPageLayout(160, false, "even-verso", "rtl-tankobon");
    const portrait = makeDummyPortrait(48, 64);

    const coverA = composeTankobonCoverPage(portrait, coverLayout, {
      volumeNumber: 3,
      titleKo: "특별단행본 성전 연대기",
      authorKo: "툰스튜디오 아틀리에",
      manuscriptMood: "backlit-awakening",
      screentone: "rose-duotone-dots",
    });
    const coverB = composeTankobonCoverPage(portrait, coverLayout, {
      volumeNumber: 3,
      titleKo: "특별단행본 성전 연대기",
      authorKo: "툰스튜디오 아틀리에",
      manuscriptMood: "backlit-awakening",
      screentone: "rose-duotone-dots",
    });
    expect(coverA.width).toBe(coverLayout.pageWidth);
    expect(coverA.height).toBe(coverLayout.pageHeight);
    expect(Array.from(coverA.rgba.slice(0, 512))).toEqual(Array.from(coverB.rgba.slice(0, 512)));

    const toc = composeTankobonTocPage(portrait, tocLayout, chapters, {
      volumeNumber: 3,
      episodeTitleKo: "특별단행본 성전 연대기",
      readingOrder: "rtl-tankobon",
      pageNumber: 2,
    });
    expect(toc.width).toBe(tocLayout.pageWidth);
    expect(toc.height).toBe(tocLayout.pageHeight);

    const spreadRtl = composeTankobonFacingSpread(coverA, toc, "rtl-tankobon");
    const spreadLtr = composeTankobonFacingSpread(coverA, toc, "ltr-manhwa");
    expect(spreadRtl.width).toBeGreaterThan(coverA.width * 2);
    expect(spreadRtl.height).toBe(coverA.height);
    expect(spreadLtr.width).toBe(spreadRtl.width);
  });

  it("단행본 표지·목차·양면 펼침면 PNG 익스포터가 유효한 PNG 바이너리와 MAX_PNG_EXPORT_DIMENSION 자동 클램프를 보장한다", async () => {
    const engine = createMockEngine();
    const store = createEpisodeCutsheetStore({ episodeTitleKo: "신탁의 서" });
    store.addBeat("제1장", DEFAULT_EPISODE_CUTSHEET_SNAPSHOT);

    const coverOut = await exportWebtoonTankobonCoverPng(
      engine,
      {
        pageWidth: 96,
        volumeNumber: 3,
        titleKo: "신탁의 서",
        authorKo: "TOONSTUDIO",
        beats: store.getState().beats,
      },
      { now: () => 1_000 },
    );
    expect(coverOut.ok).toBe(true);
    if (!coverOut.ok) return;
    expect(isPng(coverOut.bytes)).toBe(true);
    expect(coverOut.receipt.fileName).toMatch(/-tankobon-vol03-cover\.png$/u);

    const tocOut = await exportWebtoonTankobonTocPng(
      engine,
      {
        pageWidth: 96,
        volumeNumber: 3,
        titleKo: "신탁의 서",
        beats: store.getState().beats,
      },
      { now: () => 2_000 },
    );
    expect(tocOut.ok).toBe(true);
    if (!tocOut.ok) return;
    expect(isPng(tocOut.bytes)).toBe(true);
    expect(tocOut.receipt.fileName).toMatch(/-tankobon-vol03-toc\.png$/u);

    const spreadOut = await exportWebtoonTankobonSpreadPng(
      engine,
      {
        pageWidth: 120,
        volumeNumber: 3,
        titleKo: "신탁의 서",
        readingOrder: "rtl-tankobon",
        beats: store.getState().beats,
      },
      { now: () => 3_000 },
    );
    expect(spreadOut.ok).toBe(true);
    if (!spreadOut.ok) return;
    expect(isPng(spreadOut.bytes)).toBe(true);
    expect(spreadOut.receipt.width).toBeLessThanOrEqual(MAX_PNG_EXPORT_DIMENSION);
    expect(spreadOut.receipt.height).toBeLessThanOrEqual(MAX_PNG_EXPORT_DIMENSION);
    expect(spreadOut.receipt.fileName).toMatch(/-tankobon-vol03-rtl-spread\.png$/u);
  });
});
