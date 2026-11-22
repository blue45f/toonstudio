// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCreativeHoursCard } from "../StudioCreativeHoursCard";
import { createCreativeWorkTimeTracker } from "../studio-creative-work-time-tracker";
import {
  addDaysToIsoDate,
  buildBeforeAfterEmbedSnippets,
  clampComparisonPct,
  computePointerComparisonPct,
  DEFAULT_BEFORE_AFTER_SHOWCASE_PRESETS,
  estimateDialogueDurationMs,
  formatSrtTimestamp,
  formatVttTimestamp,
  inferLocalSfxPreset,
  planSerializationBuffer,
  planShortsAudioCueSheet,
  sanitizeEmbedUrl,
  scheduleWebAudioSfxStems,
  stepComparisonPctForKey,
  StudioBeforeAfterShowcaseCard,
  wrapSubtitleLines,
  type MinimalAudioBufferLike,
  type MinimalAudioNodeLike,
  type MinimalAudioParamLike,
  type MinimalWebAudioContextLike,
  type WebtoonCutTimelineItem,
} from "./index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function parseSrtTimeToMs(code: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/u.exec(code.trim());
  if (!match) throw new Error(`Invalid SRT timestamp: ${code}`);
  return (
    Number(match[1]) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1_000 +
    Number(match[4])
  );
}

function parseVttTimeToMs(code: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/u.exec(code.trim());
  if (!match) throw new Error(`Invalid VTT timestamp: ${code}`);
  return (
    Number(match[1]) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1_000 +
    Number(match[4])
  );
}

function createMockAudioContext(): {
  readonly ctx: MinimalWebAudioContextLike;
  readonly oscillatorStarts: number[];
  readonly noiseStarts: number[];
  readonly filterTypes: string[];
} {
  const oscillatorStarts: number[] = [];
  const noiseStarts: number[] = [];
  const filterTypes: string[] = [];

  const makeParam = (): MinimalAudioParamLike => ({
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const destination: MinimalAudioNodeLike = { connect: vi.fn() };

  const ctx: MinimalWebAudioContextLike = {
    currentTime: 0,
    sampleRate: 44_100,
    destination,
    createOscillator: () => ({
      type: "sine",
      frequency: makeParam(),
      connect: vi.fn(),
      start: (when = 0) => {
        oscillatorStarts.push(when);
      },
      stop: vi.fn(),
    }),
    createBiquadFilter: () => {
      const node = {
        type: "lowpass",
        frequency: makeParam(),
        connect: vi.fn(),
      };
      return new Proxy(node, {
        set(target, prop, value) {
          if (prop === "type" && typeof value === "string") {
            filterTypes.push(value);
          }
          return Reflect.set(target, prop, value);
        },
      });
    },
    createGain: () => ({
      gain: makeParam(),
      connect: vi.fn(),
    }),
    createBuffer: (_channels: number, length: number): MinimalAudioBufferLike => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      start: (when = 0) => {
        noiseStarts.push(when);
      },
      stop: vi.fn(),
    }),
  };

  return { ctx, oscillatorStarts, noiseStarts, filterTypes };
}

describe("9:16 숏폼·오디오 드라마 큐 시트 생성기 (shorts-audio-cue-planner)", () => {
  it("SRT/VTT 타임코드 포맷 경계값과 줄바꿈을 안전하게 처리한다", () => {
    expect(formatSrtTimestamp(-250)).toBe("00:00:00,000");
    expect(formatSrtTimestamp(999.7)).toBe("00:00:01,000");
    expect(formatSrtTimestamp(3_661_045)).toBe("01:01:01,045");
    expect(formatVttTimestamp(65_432)).toBe("00:01:05.432");
    expect(wrapSubtitleLines("이것은 구대십육 세로 화면에 맞춘 자막 줄바꿈 테스트 문장입니다", 14)).toContain("\n");
  });

  it("읽기 속도·감정 템포에 따라 대사 지속시간을 자동 산출한다", () => {
    const shortAction = estimateDialogueDurationMs({ text: "피해!", emotion: "action" });
    const longSad = estimateDialogueDurationMs({
      text: "그날 밤 골목 끝에서 우리가 나눴던 약속을 아직도 잊지 못했어...",
      emotion: "sad",
    });

    expect(shortAction).toBeGreaterThanOrEqual(1_200);
    expect(longSad).toBeGreaterThan(shortAction);
    expect(longSad).toBeLessThanOrEqual(7_500);
  });

  it("60초 상한을 초과하는 웹툰 컷 타임라인을 자동 분할하고 SRT/VTT 타임코드 단조성을 보장한다", () => {
    const cuts: WebtoonCutTimelineItem[] = Array.from({ length: 24 }, (_, idx) => ({
      cutId: `cut-${idx + 1}`,
      cutNumber: idx + 1,
      emotion: idx % 3 === 0 ? "tense" : idx % 3 === 1 ? "action" : "sad",
      dialogues: [
        {
          id: `dlg-${idx + 1}-a`,
          speaker: idx % 2 === 0 ? "서연" : "민재",
          text: `컷 ${idx + 1}의 핵심 대사입니다. 지금 바로 다음 장면으로 넘어갑니다!`,
        },
        {
          id: `dlg-${idx + 1}-b`,
          speaker: "나레이션",
          text: "긴장감이 감도는 골목 끝에서 그림자가 천천히 움직였다.",
        },
      ],
      sfx: [
        {
          id: `sfx-${idx + 1}`,
          label: idx % 2 === 0 ? "쿵!" : "스윽",
        },
      ],
    }));

    const plan = planShortsAudioCueSheet(cuts, {
      episodeTitle: "골목의 그림자 12화",
      maxReelDurationMs: 60_000,
    });

    expect(plan.reels.length).toBeGreaterThanOrEqual(2);
    expect(plan.totalCues).toBe(48);
    expect(plan.totalAudioStems).toBe(24);
    expect(plan.viewport.aspectRatio).toBe("9:16");

    let prevEpisodeEnd = 0;
    for (const reel of plan.reels) {
      expect(reel.totalDurationMs).toBeLessThanOrEqual(60_000);
      expect(reel.episodeStartMs).toBe(prevEpisodeEnd);
      prevEpisodeEnd = reel.episodeEndMs;

      // SRT 타임코드 단조 증가 검증
      const srtBlocks = reel.srt.split("\n\n").filter(Boolean);
      expect(srtBlocks.length).toBe(reel.cues.length);
      let prevSrtEnd = 0;
      for (const block of srtBlocks) {
        const lines = block.split("\n");
        const [startStr, endStr] = lines[1].split(" --> ");
        const startMs = parseSrtTimeToMs(startStr);
        const endMs = parseSrtTimeToMs(endStr);
        expect(startMs).toBeGreaterThanOrEqual(prevSrtEnd);
        expect(endMs).toBeGreaterThan(startMs);
        expect(endMs).toBeLessThanOrEqual(60_000);
        prevSrtEnd = endMs;
      }

      // WebVTT 헤더·세이프존 설정·타임코드 단조 증가 검증
      expect(reel.vtt.startsWith("WEBVTT\n\n")).toBe(true);
      const vttBlocks = reel.vtt.replace(/^WEBVTT\n\n/u, "").split("\n\n").filter(Boolean);
      expect(vttBlocks.length).toBe(reel.cues.length);
      let prevVttEnd = 0;
      for (const block of vttBlocks) {
        const headerLine = block.split("\n")[0];
        expect(headerLine).toContain("line:76% position:50% align:center");
        const [startStr, endRest] = headerLine.split(" --> ");
        const endStr = endRest.split(" ")[0];
        const startMs = parseVttTimeToMs(startStr);
        const endMs = parseVttTimeToMs(endStr);
        expect(startMs).toBeGreaterThanOrEqual(prevVttEnd);
        expect(endMs).toBeGreaterThan(startMs);
        expect(endMs).toBeLessThanOrEqual(60_000);
        prevVttEnd = endMs;
      }

      // JSON 내보내기 파싱 일관성 검증
      const parsedJson = JSON.parse(reel.json) as {
        partIndex: number;
        totalDurationMs: number;
        cues: unknown[];
        audioStems: unknown[];
      };
      expect(parsedJson.partIndex).toBe(reel.partIndex);
      expect(parsedJson.totalDurationMs).toBe(reel.totalDurationMs);
      expect(parsedJson.cues.length).toBe(reel.cues.length);
      expect(parsedJson.audioStems.length).toBe(reel.audioStems.length);
    }
  });

  it("단일 컷 대사가 60초 상한을 넘어도 대사 단위로 안전 분할하고 로컬 WebAudio 스템을 스케줄한다", () => {
    const monologueCut: WebtoonCutTimelineItem = {
      cutId: "cut-monologue",
      cutNumber: 1,
      emotion: "sad",
      dialogues: Array.from({ length: 16 }, (_, idx) => ({
        id: `mono-${idx + 1}`,
        speaker: "주인공",
        text: `독백 문장 ${idx + 1}번입니다. 천천히 감정을 담아 읽어야 하는 긴 회상 장면입니다.`,
      })),
      sfx: [
        { id: "rain-1", label: "빗소리" },
        { id: "thud-1", label: "쿵!" },
      ],
    };

    const plan = planShortsAudioCueSheet([monologueCut], { maxReelDurationMs: 25_000 });
    expect(plan.reels.length).toBeGreaterThan(1);
    for (const reel of plan.reels) {
      expect(reel.totalDurationMs).toBeLessThanOrEqual(25_000);
    }

    expect(inferLocalSfxPreset("빗소리")).toBe("rain-ambient");
    expect(inferLocalSfxPreset("쿵!")).toBe("impact-thud");
    expect(inferLocalSfxPreset("두근두근")).toBe("heartbeat-pulse");
    expect(inferLocalSfxPreset("반짝")).toBe("sparkle-chime");

    const mock = createMockAudioContext();
    const allStems = plan.reels.flatMap((reel) => reel.audioStems);
    const scheduledCount = scheduleWebAudioSfxStems(mock.ctx, allStems, 1.5);
    expect(scheduledCount).toBe(allStems.length);
    expect(mock.noiseStarts.length).toBeGreaterThanOrEqual(1);
    expect(mock.oscillatorStarts.length).toBeGreaterThanOrEqual(1);
    expect(mock.filterTypes.length).toBe(allStems.length);
  });

  it("빈 컷 목록 입력 시 안전한 빈 계획과 안내 경고를 반환한다", () => {
    const emptyPlan = planShortsAudioCueSheet([]);
    expect(emptyPlan.reels).toHaveLength(0);
    expect(emptyPlan.totalDurationMs).toBe(0);
    expect(emptyPlan.warnings.length).toBeGreaterThan(0);
  });
});

describe("연재 체력·마감 버퍼 플래너 (serialization-buffer-planner)", () => {
  it("2주 이상 비축 버퍼와 안정적 컷 속도·분업 진행 시 green 판정과 정상 연재 안내를 반환한다", () => {
    const plan = planSerializationBuffer({
      seriesTitle: "달빛 공방",
      nextEpisodeNumber: 28,
      cutsPerEpisode: 70,
      currentEpisodeCompletedCuts: 45,
      daysUntilDeadline: 5,
      publishCadenceDays: 7,
      stockpiledCompletedEpisodes: 2.5,
      recentVelocity: [
        { dateIso: "2026-11-18", completedCuts: 16, workHours: 7.5 },
        { dateIso: "2026-11-19", completedCuts: 18, workHours: 8 },
        { dateIso: "2026-11-20", completedCuts: 17, workHours: 7.5 },
      ],
      assistantTasks: [
        {
          id: "a-1",
          memberName: "지은",
          role: "base-color",
          assignedCuts: 70,
          completedCuts: 55,
          expectedFinishDays: 2,
        },
        {
          id: "a-2",
          memberName: "도윤",
          role: "background",
          assignedCuts: 40,
          completedCuts: 32,
          expectedFinishDays: 2.5,
        },
      ],
      referenceDateIso: "2026-11-22",
    });

    expect(plan.alertLevel).toBe("green");
    expect(plan.buffer.stockpiledBufferDays).toBe(17.5);
    expect(plan.buffer.twoWeekHorizonDeficitCuts).toBe(0);
    expect(plan.assistantBottlenecks).toHaveLength(0);
    expect(plan.velocity.fatigueWarning).toBe(false);
    expect(plan.noticeDraft.kind).toBe("none");
    expect(plan.noticeDraft.suggestedResumeDateIso).toBe("2026-11-27");
  });

  it("예비 원고 2주 미달 또는 어시스턴트 병목·과로 징후 시 2주 전 amber 조기 경보와 완충 공지 초안을 생성한다", () => {
    const plan = planSerializationBuffer({
      seriesTitle: "달빛 공방",
      nextEpisodeNumber: 29,
      cutsPerEpisode: 70,
      currentEpisodeCompletedCuts: 30,
      daysUntilDeadline: 6,
      publishCadenceDays: 7,
      stockpiledCompletedEpisodes: 1.2,
      recentVelocity: [
        { dateIso: "2026-11-18", completedCuts: 13, workHours: 10.5 },
        { dateIso: "2026-11-19", completedCuts: 12, workHours: 11 },
        { dateIso: "2026-11-20", completedCuts: 12, workHours: 10.5 },
      ],
      assistantTasks: [
        {
          id: "a-bg",
          memberName: "현우",
          role: "background",
          assignedCuts: 50,
          completedCuts: 18,
          expectedFinishDays: 6.5,
        },
      ],
      referenceDateIso: "2026-11-22",
    });

    expect(plan.alertLevel).toBe("amber");
    expect(plan.buffer.stockpiledBufferDays).toBe(8.4);
    expect(plan.velocity.fatigueWarning).toBe(true);
    expect(plan.assistantBottlenecks.length).toBe(1);
    expect(plan.assistantBottlenecks[0].role).toBe("background");
    expect(plan.noticeDraft.kind).toBe("buffer-pacing");
    expect(plan.noticeDraft.body).toContain("달빛 공방");
    expect(plan.recommendation.recommendedWorkDaysPerWeek).toBe(6);
    expect(plan.recommendation.stageAllocations.length).toBe(6);
  });

  it("마감 지연·예비 비축 고갈·어시스턴트 차단 시 red 경보와 복귀일 포함 1주 휴재 공지 초안을 생성한다", () => {
    const plan = planSerializationBuffer({
      seriesTitle: "별빛 기록관",
      nextEpisodeNumber: 42,
      cutsPerEpisode: 75,
      currentEpisodeCompletedCuts: 15,
      daysUntilDeadline: 3,
      publishCadenceDays: 7,
      stockpiledCompletedEpisodes: 0.2,
      recentVelocity: [
        { dateIso: "2026-11-19", completedCuts: 6, workHours: 11 },
        { dateIso: "2026-11-20", completedCuts: 5, workHours: 12 },
      ],
      assistantTasks: [
        {
          id: "a-line",
          memberName: "서하",
          role: "lineart",
          assignedCuts: 60,
          completedCuts: 12,
          expectedFinishDays: 4,
          blocked: true,
        },
      ],
      referenceDateIso: "2026-11-22",
    });

    expect(plan.alertLevel).toBe("red");
    expect(plan.buffer.stockpiledBufferDays).toBe(1.4);
    expect(plan.buffer.netBufferDaysAfterDeadline).toBeLessThan(3);
    expect(plan.noticeDraft.kind).toBe("short-hiatus");
    expect(plan.noticeDraft.suggestedResumeDateIso).toBe("2026-12-02");
    expect(plan.noticeDraft.title).toContain("42화");
    expect(plan.noticeDraft.body).toContain("2026-12-02");
    expect(plan.recommendation.suggestedEpisodeCutCap).not.toBeNull();
    expect(addDaysToIsoDate("2026-11-22", 10)).toBe("2026-12-02");
    expect(addDaysToIsoDate("invalid-date", 5)).toBeNull();
  });
});

describe("브러시·3D 마켓 인터랙티브 Before/After 시연 카드", () => {
  it("모델 순수 함수(클램핑·포인터·키보드·URL 위생·임베드 코드)가 안전하게 동작한다", () => {
    expect(clampComparisonPct(-10)).toBe(0);
    expect(clampComparisonPct(140)).toBe(100);
    expect(clampComparisonPct(Number.NaN)).toBe(50);

    expect(computePointerComparisonPct(200, 100, 400)).toBe(25);
    expect(computePointerComparisonPct(999, 100, 400)).toBe(100);
    expect(computePointerComparisonPct(100, 100, 0)).toBe(50);

    expect(stepComparisonPctForKey(50, "ArrowLeft")).toBe(45);
    expect(stepComparisonPctForKey(50, "ArrowRight")).toBe(55);
    expect(stepComparisonPctForKey(50, "ArrowRight", true)).toBe(60);
    expect(stepComparisonPctForKey(50, "Home")).toBe(0);
    expect(stepComparisonPctForKey(50, "End")).toBe(100);
    expect(stepComparisonPctForKey(50, "PageUp")).toBe(65);
    expect(stepComparisonPctForKey(50, "PageDown")).toBe(35);
    expect(stepComparisonPctForKey(50, "Tab")).toBeNull();

    expect(
      sanitizeEmbedUrl("javascript:alert(1)", "https://www.toonstudio.cloud/safe"),
    ).toBe("https://www.toonstudio.cloud/safe");

    const snippets = buildBeforeAfterEmbedSnippets(
      {
        ...DEFAULT_BEFORE_AFTER_SHOWCASE_PRESETS[0],
        title: '수묵 "테스트" <브러시>',
        marketUrl: "javascript:evil()",
      },
      68,
    );

    expect(snippets.shareUrl).toContain("https://www.toonstudio.cloud/market/assets/");
    expect(snippets.shareUrl).toContain("compare=68");
    expect(snippets.iframeHtml).toContain("&quot;테스트&quot;");
    expect(snippets.iframeHtml).not.toContain("<브러시>");
    expect(snippets.webComponentSnippet).toContain('initial-pct="68"');
    expect(snippets.markdownBadge).toContain("68%");
  });

  it("키보드(ArrowLeft/ArrowRight/Home/End)와 포인터 드래그로 슬라이더를 조작한다", () => {
    const onPositionChange = vi.fn();
    render(
      <StudioBeforeAfterShowcaseCard
        asset={DEFAULT_BEFORE_AFTER_SHOWCASE_PRESETS[1]}
        onPositionChange={onPositionChange}
      />,
    );

    const card = screen.getByRole("article");
    expect(card.className).toContain("[word-break:keep-all]");

    const slider = screen.getByRole("slider", {
      name: `${DEFAULT_BEFORE_AFTER_SHOWCASE_PRESETS[1].title} 전후 비교 슬라이더`,
    });
    expect(slider.className).toContain("min-h-11");
    expect(slider.className).toContain("min-w-11");
    expect(slider.getAttribute("aria-valuenow")).toBe("50");

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider.getAttribute("aria-valuenow")).toBe("55");

    fireEvent.keyDown(slider, { key: "ArrowLeft", shiftKey: true });
    expect(slider.getAttribute("aria-valuenow")).toBe("45");

    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider.getAttribute("aria-valuenow")).toBe("0");

    fireEvent.keyDown(slider, { key: "End" });
    expect(slider.getAttribute("aria-valuenow")).toBe("100");
    expect(onPositionChange).toHaveBeenLastCalledWith(100);

    // 포인터 드래그 상호작용 검증
    const stage = card.querySelector("[data-compare-stage='true']") as HTMLElement;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 0,
      left: 100,
      top: 0,
      right: 500,
      bottom: 200,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(stage, { clientX: 200, button: 0, pointerId: 1, pointerType: "mouse" });
    expect(slider.getAttribute("aria-valuenow")).toBe("25");

    fireEvent.pointerMove(stage, { clientX: 400, pointerId: 1, pointerType: "mouse" });
    expect(slider.getAttribute("aria-valuenow")).toBe("75");

    fireEvent.pointerUp(stage, { clientX: 400, pointerId: 1, pointerType: "mouse" });
    fireEvent.pointerMove(stage, { clientX: 140, pointerId: 1, pointerType: "mouse" });
    // pointerUp 이후 드래그가 종료되어 값이 유지돼야 한다.
    expect(slider.getAttribute("aria-valuenow")).toBe("75");
  });

  it("prefers-reduced-motion 감지 및 임베드 스니펫 전환·복사를 지원한다", async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
      writable: true,
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const onCopySnippet = vi.fn();
    try {
      render(
        <StudioBeforeAfterShowcaseCard
          asset={DEFAULT_BEFORE_AFTER_SHOWCASE_PRESETS[0]}
          onCopySnippet={onCopySnippet}
        />,
      );

      const card = screen.getByRole("article");
      expect(card.getAttribute("data-reduced-motion")).toBe("true");

      fireEvent.click(screen.getByRole("button", { name: "임베드 코드 보기" }));
      const codeEl = card.querySelector("[data-embed-code='true']") as HTMLElement;
      expect(codeEl.textContent).toContain("<iframe");
      expect(codeEl.textContent).toContain("compare=52");

      fireEvent.click(screen.getByRole("button", { name: "웹 컴포넌트" }));
      expect(codeEl.textContent).toContain("<toonstudio-compare");

      fireEvent.click(screen.getByRole("button", { name: "SNS 링크" }));
      expect(codeEl.textContent).toContain("https://www.toonstudio.cloud/market/assets/");

      fireEvent.click(screen.getByRole("button", { name: "스니펫 복사" }));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(onCopySnippet).toHaveBeenCalledWith("markdown", expect.stringContaining("compare=52"));
        expect(screen.getByText("복사됨")).toBeTruthy();
      });
    } finally {
      Object.defineProperty(window, "matchMedia", {
        value: originalMatchMedia,
        configurable: true,
        writable: true,
      });
    }
  });

  it("StudioCreativeHoursCard 연결 진입점에서 접기/펼치기 및 시연 카드를 정상 마운트한다", () => {
    const tracker = createCreativeWorkTimeTracker("webtoon-ep-12", 3600, 420, 0);
    render(<StudioCreativeHoursCard tracker={tracker} />);

    // 기본 닫힘 상태에서는 기존 웰니스 테스트와 충돌하지 않도록 패널이 숨겨져 있다.
    expect(screen.queryByRole("slider")).toBeNull();

    const toggleButton = screen.getByRole("button", {
      name: /연재 마감 버퍼 · 숏폼 큐 · 시연 카드/u,
    });
    expect(toggleButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggleButton);
    expect(toggleButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("2주 전 마감 버퍼")).toBeTruthy();
    expect(screen.getByText("9:16 숏폼 · 로컬 오디오 큐")).toBeTruthy();
    expect(screen.getByRole("slider")).toBeTruthy();
  });
});
