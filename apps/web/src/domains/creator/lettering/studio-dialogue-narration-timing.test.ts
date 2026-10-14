import { describe, expect, it } from "vitest";

import type { DialoguePageLike } from "./studio-dialogue-batch";
import {
  compareEpisodeNarrationTimings,
  countNarrationChars,
  estimateDialogueSpeechMs,
  estimateEpisodeNarrationTiming,
  formatNarrationDelta,
  formatNarrationDeltaPercent,
  formatNarrationDuration,
  normalizeNarrationCharsPerSecond,
  NARRATION_TIMING_DEFAULT_CHARS_PER_SECOND,
} from "./studio-dialogue-narration-timing";

// 기대값은 상수(12자/초, 호흡 350ms, 기본 체류 900ms, 크기 가산 상한 1500ms,
// 기준 면적 480,000, 무대사 가산 600ms)로 손계산해 고정한 값이다.
const PAGE_WITH_BIG_FRAME: DialoguePageLike = {
  id: "page-1",
  elements: [
    { id: "frame-1", type: "frame", x: 0, y: 0, width: 800, height: 600 },
    // 중심점이 frame 안 → 공간 배정. 10자.
    { id: "bubble-1", type: "bubble", text: "가나다라마바사아자차", x: 10, y: 10, width: 100, height: 50 },
    // 명시 frameId 배정. 18자.
    {
      id: "bubble-2",
      type: "bubble",
      text: "가나다라마바사아자차카타파하거너더러",
      frameId: "frame-1",
    },
  ],
};

const PAGE_WITHOUT_FRAME: DialoguePageLike = {
  id: "page-2",
  elements: [{ id: "text-1", type: "text", text: "가나다라", x: 0, y: 0 }],
};

const SILENT_PAGE: DialoguePageLike = {
  id: "page-3",
  elements: [{ id: "frame-2", type: "frame", x: 0, y: 0, width: 400, height: 300 }],
};

describe("countNarrationChars / estimateDialogueSpeechMs", () => {
  it("공백·줄바꿈을 빼고 글자수를 센다", () => {
    expect(countNarrationChars("가 나\n다  라")).toBe(4);
    expect(countNarrationChars("   ")).toBe(0);
  });

  it("낭독 시간 = ceil(글자수/속도) + 호흡 350ms, 공백뿐이면 0", () => {
    // 10자 / 12자초 = 834ms + 350 = 1184
    expect(estimateDialogueSpeechMs("가나다라마바사아자차")).toBe(1_184);
    expect(estimateDialogueSpeechMs("   ")).toBe(0);
  });

  it("읽기 속도를 [4, 30]으로 클램프하고 비유한 값은 기본값으로 돌린다", () => {
    expect(normalizeNarrationCharsPerSecond(undefined)).toBe(
      NARRATION_TIMING_DEFAULT_CHARS_PER_SECOND
    );
    expect(normalizeNarrationCharsPerSecond(Number.NaN)).toBe(12);
    expect(normalizeNarrationCharsPerSecond(100)).toBe(30);
    expect(normalizeNarrationCharsPerSecond(1)).toBe(4);
  });
});

describe("estimateEpisodeNarrationTiming", () => {
  it("대사 낭독 + 컷 체류를 합산하고 컷별로 배정한다", () => {
    const timing = estimateEpisodeNarrationTiming([
      PAGE_WITH_BIG_FRAME,
      PAGE_WITHOUT_FRAME,
      SILENT_PAGE,
    ]);
    // page-1: speech 1184+1850=3034, dwell 900+1500(기준 면적)=2400
    // page-2: speech 334+350=684, dwell 900(페이지-컷)
    // page-3: speech 0, dwell 900+375(면적 1/4)+600(무대사)=1875
    expect(timing.dialogueCount).toBe(3);
    expect(timing.charCount).toBe(32);
    expect(timing.cutCount).toBe(3);
    expect(timing.pageCount).toBe(3);
    expect(timing.speechMs).toBe(3_718);
    expect(timing.dwellMs).toBe(5_175);
    expect(timing.totalMs).toBe(8_893);
    expect(timing.totalMs).toBe(timing.speechMs + timing.dwellMs);

    const bigCut = timing.pages[0]!.cuts[0]!;
    expect(bigCut.frameId).toBe("frame-1");
    expect(bigCut.dialogueCount).toBe(2);
    expect(bigCut.silent).toBe(false);
    expect(bigCut.dwellMs).toBe(2_400);

    const silentCut = timing.pages[2]!.cuts[0]!;
    expect(silentCut.silent).toBe(true);
    expect(silentCut.dwellMs).toBe(1_875);
  });

  it("frame 없는 페이지는 페이지-컷 1개로 보고 크기 가산은 없다", () => {
    const timing = estimateEpisodeNarrationTiming([PAGE_WITHOUT_FRAME]);
    expect(timing.cutCount).toBe(1);
    expect(timing.pages[0]!.cuts[0]!.frameId).toBeNull();
    expect(timing.dwellMs).toBe(900);
  });

  it("숨김 대사는 기본 제외, includeHidden 으로 포함한다", () => {
    const pages: DialoguePageLike[] = [
      {
        id: "page-h",
        elements: [
          { id: "visible", type: "bubble", text: "가나다라", x: 0, y: 0 },
          { id: "hidden", type: "bubble", text: "가나다라", x: 0, y: 100, hidden: true },
        ],
      },
    ];
    expect(estimateEpisodeNarrationTiming(pages).dialogueCount).toBe(1);
    expect(estimateEpisodeNarrationTiming(pages, { includeHidden: true }).dialogueCount).toBe(2);
  });

  it("공백뿐인 대사는 대사 수·시간에 넣지 않는다", () => {
    const pages: DialoguePageLike[] = [
      { id: "page-w", elements: [{ id: "blank", type: "bubble", text: "  \n " }] },
    ];
    const timing = estimateEpisodeNarrationTiming(pages);
    expect(timing.dialogueCount).toBe(0);
    expect(timing.speechMs).toBe(0);
  });

  it("어느 컷에도 속하지 않는 대사는 낭독 시간만 합계에 더하고 컷은 무대사로 남는다", () => {
    const pages: DialoguePageLike[] = [
      {
        id: "page-o",
        elements: [
          { id: "frame-s", type: "frame", x: 0, y: 0, width: 100, height: 100 },
          { id: "outside", type: "bubble", text: "가나다라", x: 5_000, y: 5_000 },
        ],
      },
    ];
    const timing = estimateEpisodeNarrationTiming(pages);
    expect(timing.dialogueCount).toBe(1);
    expect(timing.speechMs).toBe(684);
    // 컷 면적 10,000/480,000 → 가산 round(1500*0.0208)=31, 무대사 +600
    expect(timing.pages[0]!.cuts[0]!.silent).toBe(true);
    expect(timing.dwellMs).toBe(900 + 31 + 600);
  });

  it("빈 회차는 전부 0이다", () => {
    const timing = estimateEpisodeNarrationTiming([]);
    expect(timing.totalMs).toBe(0);
    expect(timing.cutCount).toBe(0);
    expect(timing.pages).toEqual([]);
  });

  it("입력을 변형하지 않는다", () => {
    const pages: DialoguePageLike[] = [PAGE_WITH_BIG_FRAME];
    const snapshot = JSON.stringify(pages);
    estimateEpisodeNarrationTiming(pages);
    expect(JSON.stringify(pages)).toBe(snapshot);
  });
});

describe("compareEpisodeNarrationTimings", () => {
  const episodes = [
    { id: "ep-1", label: "1화", pages: [SILENT_PAGE] }, // 1875
    { id: "ep-2", label: "2화", pages: [PAGE_WITHOUT_FRAME] }, // 1584
    { id: "ep-3", label: "3화", pages: [PAGE_WITH_BIG_FRAME] }, // 5434
  ];

  it("회차별 예상 시간과 직전·평균 대비 증감을 계산한다", () => {
    const comparison = compareEpisodeNarrationTimings(episodes);
    expect(comparison.rows.map((row) => row.timing.totalMs)).toEqual([1_875, 1_584, 5_434]);

    const [first, second, third] = comparison.rows;
    expect(first!.deltaFromPreviousMs).toBeNull();
    expect(first!.deltaFromPreviousAverageMs).toBeNull();

    expect(second!.deltaFromPreviousMs).toBe(-291);
    expect(second!.deltaFromPreviousPercent).toBe(-15.5);
    expect(second!.deltaFromPreviousAveragePercent).toBe(-15.5);

    expect(third!.deltaFromPreviousMs).toBe(3_850);
    expect(third!.deltaFromPreviousPercent).toBe(243.1);
    // 지난 평균 (1875+1584)/2 = 1729.5 → 증감 round(5434-1729.5)=3705
    expect(third!.deltaFromPreviousAverageMs).toBe(3_705);
    expect(third!.deltaFromPreviousAveragePercent).toBe(214.2);
    expect(comparison.previousAverageMs).toBe(1_730);
  });

  it("회차가 하나뿐이면 비교 지표는 전부 null이다", () => {
    const comparison = compareEpisodeNarrationTimings([episodes[0]!]);
    expect(comparison.previousAverageMs).toBeNull();
    expect(comparison.rows[0]!.deltaFromPreviousMs).toBeNull();
  });
});

describe("format helpers", () => {
  it("예상 시간을 한국어로 표시한다", () => {
    expect(formatNarrationDuration(0)).toBe("약 0초");
    expect(formatNarrationDuration(45_000)).toBe("약 45초");
    expect(formatNarrationDuration(200_000)).toBe("약 3분 20초");
    expect(formatNarrationDuration(3_660_000)).toBe("약 1시간 1분");
    expect(formatNarrationDuration(Number.NaN)).toBe("약 0초");
  });

  it("증감은 부호와 함께, 0이면 ±0초로 표시한다", () => {
    expect(formatNarrationDelta(25_000)).toBe("+25초");
    expect(formatNarrationDelta(-65_000)).toBe("-1분 5초");
    expect(formatNarrationDelta(0)).toBe("±0초");
    expect(formatNarrationDelta(400)).toBe("±0초");
    expect(formatNarrationDelta(null)).toBe("—");
    expect(formatNarrationDeltaPercent(12.5)).toBe("+12.5%");
    expect(formatNarrationDeltaPercent(-3)).toBe("-3.0%");
    expect(formatNarrationDeltaPercent(0)).toBe("0%");
    expect(formatNarrationDeltaPercent(null)).toBe("—");
  });
});
