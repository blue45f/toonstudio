import { describe, expect, it } from "vitest";

import { createMockEngine } from "../testing/mock-engine";

import { MAX_PNG_EXPORT_DIMENSION } from "./export-session";
import { isPng } from "./png-encoder";
import {
  buildEpisodeCutsheetWebVtt,
  buildEpisodeStoryboardMarkdown,
  exportEpisodeCutsheetAudioWav,
  exportEpisodeCutsheetLongStripPng,
  exportEpisodeCutsheetMotionWebm,
  exportEpisodeCutsheetWebVtt,
  exportEpisodeStoryboardMarkdown,
  resolveSafeEpisodeBatchStripWidth,
} from "./webtoon-episode-batch";
import { DEFAULT_EPISODE_CUTSHEET_SNAPSHOT, createEpisodeCutsheetStore } from "./webtoon-episode-cutsheet";
import { isWavRiff } from "./webtoon-motion-teaser";

const FAKE_WEBM_EBML = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

describe("webtoon-episode-batch", () => {
  it("회차·비트 제목과 컷 범위의 줄바꿈·시간축·음성 태그가 NOTE 밖에 추가 자막을 만들지 않는다", () => {
    const store = createEpisodeCutsheetStore({ episodeTitleKo: "정상 회차" });
    store.addBeat("정상 비트", {
      ...DEFAULT_EPISODE_CUTSHEET_SNAPSHOT,
      dialogueLines: ["첫 대사", "두 번째 대사", "세 번째 대사", "마지막 대사"],
      bubbleShapes: ["oval", "oval", "oval", "oval"],
      speakerTargets: ["protagonist", "protagonist", "protagonist", "protagonist"],
      sfxStamps: ["none", "none", "none", "none"],
    });
    const beats = store.getState().beats;
    const injectedTitle = [
      "첫 줄 & <b>제목</b> --!>",
      "",
      "cut-99",
      "00:00:00.000 --> 00:00:01.000",
      "<v 침입자>주입",
    ].join("\r\n");
    const encodedTitle = "첫 줄 &amp; &lt;b&gt;제목&lt;/b&gt; --!&gt; cut-99 " +
      "00:00:00.000 → 00:00:01.000 &lt;v 침입자&gt;주입";
    const injectedBeats = beats.map((beat) => ({
      ...beat,
      titleKo: injectedTitle,
      cutRangeLabel: injectedTitle,
    }));
    const baseline = buildEpisodeCutsheetWebVtt("정상 회차", beats, { requestedStripWidth: 320 });
    const vtt = buildEpisodeCutsheetWebVtt(injectedTitle, injectedBeats, { requestedStripWidth: 320 });
    const lines = vtt.split("\n");

    expect(lines.filter((line) => line.startsWith("NOTE "))).toEqual([
      `NOTE ToonStudio Episode Cutsheet Subtitles — ${encodedTitle} (4컷)`,
      `NOTE ${encodedTitle} · ${encodedTitle}`,
    ]);
    expect(lines.filter((line) => !line.startsWith("NOTE "))).toEqual(
      baseline.split("\n").filter((line) => !line.startsWith("NOTE ")),
    );
    expect(vtt.match(/^cut-\d+$/gmu)).toEqual(["cut-1", "cut-2", "cut-3", "cut-4"]);
    expect(vtt.match(/<[^>]*>/gu)).toEqual(["<v 주연>", "<v 주연>", "<v 주연>", "<v 주연>"]);
    expect(vtt).not.toContain("\r");
  });

  it("다중 4컷 큐시트를 장편 세로 스트립 PNG(MAX_PNG_EXPORT_DIMENSION 이하 자동 배율)·연속 9:16 WebM·통합 WAV·통합 WebVTT·스토리보드 MD로 일괄 출고한다", async () => {
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

    const wavOut = exportEpisodeCutsheetAudioWav(
      "20화 성전 결전",
      beats,
      { requestedStripWidth: 320, includeAmbientBgm: true },
      { now: () => 2_500 },
    );
    expect(wavOut.ok).toBe(true);
    if (!wavOut.ok) return;
    expect(isWavRiff(wavOut.bytes)).toBe(true);
    expect(wavOut.receipt.motion?.beatCount).toBe(2);
    expect(wavOut.receipt.motion?.audioEvents).toBe(5);
    expect(wavOut.receipt.fileName).toBe("20화-성전-결전-8cuts-bgm-episode-audio.wav");

    const vttOut = exportEpisodeCutsheetWebVtt("20화 성전 결전", beats, { requestedStripWidth: 320 }, { now: () => 3_000 });
    expect(vttOut.ok).toBe(true);
    if (!vttOut.ok) return;
    const vttText = new TextDecoder().decode(vttOut.bytes);
    expect(vttText).toContain("NOTE 1~4컷 · 성역 진입");
    expect(vttText).toContain("NOTE 5~8컷 · 신탁 각성");
    expect(vttText).toContain("cut-5");
    expect(vttOut.receipt.fileName).toBe("20화-성전-결전-8cuts-subtitles.vtt");

    const mdOut = exportEpisodeStoryboardMarkdown("20화 성전 결전", beats, { now: () => 4_000 });
    expect(mdOut.ok).toBe(true);
    if (!mdOut.ok) return;
    const mdText = new TextDecoder().decode(mdOut.bytes);
    expect(mdText).toContain("| 8컷 | 신탁 각성 |");
    expect(mdOut.receipt.fileName).toBe("20화-성전-결전-8cuts.storyboard.md");
  });

  it("스토리보드 마크다운 표에서 역슬래시와 파이프·줄바꿈을 완전 이스케이프해 셀 경계를 보존한다", () => {
    const store = createEpisodeCutsheetStore({ episodeTitleKo: "이스케이프 회차" });
    store.addBeat("비트\\|제목\n줄바꿈", {
      ...DEFAULT_EPISODE_CUTSHEET_SNAPSHOT,
      dialogueLines: ["경로\\|대사", "단독\\역슬래시", "파이프|대사\r\n둘째줄", "정상 대사"],
      sfxStamps: ["none", "none", "none", "none"],
    });
    const md = buildEpisodeStoryboardMarkdown("이스케이프 회차", store.getState().beats, 4_000);
    const tableRows = md.split("\n").filter((line) => line.startsWith("| ") && line.includes("컷 |"));
    expect(tableRows).toHaveLength(4);
    expect(tableRows[0]).toContain("| 비트\\\\\\|제목 줄바꿈 |");
    expect(tableRows[0]).toContain("| 경로\\\\\\|대사 |");
    expect(tableRows[1]).toContain("| 단독\\\\역슬래시 |");
    expect(tableRows[2]).toContain("| 파이프\\|대사 둘째줄 |");
  });
});
