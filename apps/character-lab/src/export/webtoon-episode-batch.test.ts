import { describe, expect, it } from "vitest";

import { createMockEngine } from "../testing/mock-engine";

import { MAX_PNG_EXPORT_DIMENSION } from "./export-session";
import { isPng } from "./png-encoder";
import {
  exportEpisodeCutsheetLongStripPng,
  exportEpisodeCutsheetMotionWebm,
  exportEpisodeCutsheetWebVtt,
  exportEpisodeStoryboardMarkdown,
  resolveSafeEpisodeBatchStripWidth,
} from "./webtoon-episode-batch";
import { DEFAULT_EPISODE_CUTSHEET_SNAPSHOT, createEpisodeCutsheetStore } from "./webtoon-episode-cutsheet";

const FAKE_WEBM_EBML = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

describe("webtoon-episode-batch", () => {
  it("다중 4컷 큐시트를 장편 세로 스트립 PNG(MAX_PNG_EXPORT_DIMENSION 이하 자동 배율)·연속 9:16 WebM·통합 WebVTT·스토리보드 MD로 일괄 출고한다", async () => {
    const store = createEpisodeCutsheetStore({ episodeTitleKo: "20화 성전 결전" });
    store.addBeat("성역 진입", {
      ...DEFAULT_EPISODE_CUTSHEET_SNAPSHOT,
      bakeStripFx: true,
      manuscriptMood: "daylight-paper",
      dialogueLines: ["제단이 보인다.", "경계를 늦추지 마.", "성광이 반응해!", "문을 열어라."],
      sfxStamps: ["pat", "none", "beonjjeok", "none"],
    });
    store.addBeat("신탁 각성", {
      ...DEFAULT_EPISODE_CUTSHEET_SNAPSHOT,
      bakeStripFx: true,
      manuscriptMood: "backlit-awakening",
      screentones: ["rose-duotone-dots", "none", "cyan-noir-dots", "none"],
      dialogueLines: ["백 년 만의 신탁이다.", "말도 안 돼…", "성좌가 응답했다.", "끝내자."],
      sfxStamps: ["dugeun", "none", "kugugung", "seureung"],
    });

    const beats = store.getState().beats;
    const clamped = resolveSafeEpisodeBatchStripWidth(900, beats);
    expect(clamped.totalHeight).toBeLessThanOrEqual(MAX_PNG_EXPORT_DIMENSION);

    const engine = createMockEngine();
    const stripOut = await exportEpisodeCutsheetLongStripPng(
      engine,
      beats,
      { episodeTitleKo: "20화 성전 결전", requestedStripWidth: 64 },
      { now: () => 1_000 },
    );
    expect(stripOut.ok).toBe(true);
    if (!stripOut.ok) return;
    expect(isPng(stripOut.bytes)).toBe(true);
    expect(stripOut.receipt.fileName).toMatch(/^20화-성전-결전-8cuts-\d+x\d+-long-strip\.png$/u);

    let encodedFrames = 0;
    let encodedEvents = 0;
    const webmOut = await exportEpisodeCutsheetMotionWebm(
      engine,
      beats,
      {
        episodeTitleKo: "20화 성전 결전",
        requestedStripWidth: 64,
        includeAmbientBgm: true,
      },
      async (req) => {
        encodedFrames = req.schedule.frameCount;
        encodedEvents = req.audioPcm?.eventCount ?? 0;
        return FAKE_WEBM_EBML;
      },
      { now: () => 2_000 },
    );
    expect(webmOut.ok).toBe(true);
    if (!webmOut.ok) return;
    expect(encodedFrames).toBeGreaterThan(16);
    expect(encodedEvents).toBe(5);
    expect(webmOut.receipt.motion?.beatCount).toBe(2);
    expect(webmOut.receipt.motion?.ambientBgm).toBe(true);
    expect(webmOut.receipt.fileName).toMatch(/^20화-성전-결전-8cuts-540x960-bgm-episode-teaser\.webm$/u);

    const vttOut = exportEpisodeCutsheetWebVtt("20화 성전 결전", beats, { requestedStripWidth: 320 }, { now: () => 3_000 });
    expect(vttOut.ok).toBe(true);
    if (!vttOut.ok) return;
    const vttText = new TextDecoder().decode(vttOut.bytes);
    expect(vttText).toContain("NOTE 1~4컷 · 성역 진입");
    expect(vttText).toContain("NOTE 5~8컷 · 신탁 각성");
    expect(vttText).toContain("cut-5");

    const mdOut = exportEpisodeStoryboardMarkdown("20화 성전 결전", beats, { now: () => 4_000 });
    expect(mdOut.ok).toBe(true);
    if (!mdOut.ok) return;
    const mdText = new TextDecoder().decode(mdOut.bytes);
    expect(mdText).toContain("| 8컷 | 신탁 각성 |");
    expect(mdOut.receipt.fileName).toBe("20화-성전-결전-8cuts.storyboard.md");
  });
});
