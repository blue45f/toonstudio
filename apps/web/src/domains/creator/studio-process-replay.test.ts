import { describe, expect, it } from "vitest";

import {
  createStudioHistoryJournal,
  recordStudioHistoryJournalPagesSteps,
  type StudioHistoryJournal,
} from "./studio-history-journal";
import {
  advanceProcessReplay,
  buildProcessReplayTimeline,
  createProcessReplayState,
  filterProcessReplayEvents,
  formatProcessReplayClock,
  playProcessReplay,
  processReplayIntervalMs,
  processReplayProgress,
  seekProcessReplay,
  setProcessReplaySegment,
  setProcessReplaySpeed,
  PROCESS_REPLAY_BASE_INTERVAL_MS,
  PROCESS_REPLAY_MAX_EVENTS_PER_TICK,
  type ProcessReplaySnapshot,
} from "./studio-process-replay";

type Bible = { readonly label: string };
type Writer = { readonly logline: string };

function page(id: string, elementCount: number, canvasH = 800) {
  return { id, elements: Array.from({ length: elementCount }, (_, i) => `${id}:${i}`), canvasH };
}

/** 스냅샷 4칸: p1 편집 → p2 추가 → p1 재편집. 참조 공유(불변) 계약을 흉내 낸다. */
function sampleHistory(): ProcessReplaySnapshot[] {
  const p1v1 = page("p1", 2);
  const p1v2 = page("p1", 3);
  const p2 = page("p2", 1);
  const p1v3 = page("p1", 5);
  return [
    [p1v1],
    [p1v2],
    [p1v2, p2],
    [p1v3, p2],
  ];
}

describe("타임라인 구축 — 스냅샷이 시간순 이벤트가 된다", () => {
  it("인접 스냅샷 diff 로 바뀐/추가된 페이지와 요소 증감을 채운다", () => {
    const timeline = buildProcessReplayTimeline(sampleHistory(), {
      labels: ["처음 상태", "요소 추가", "페이지 추가", "요소 추가"],
    });
    expect(timeline.truncatedCount).toBe(0);
    expect(timeline.pageIds).toEqual(["p1", "p2"]);
    expect(timeline.events.map((e) => e.historyIndex)).toEqual([0, 1, 2, 3]);
    expect(timeline.events[0].label).toBe("처음 상태");
    expect(timeline.events[1].changedPageIds).toEqual(["p1"]);
    expect(timeline.events[1].elementDelta).toBe(1);
    expect(timeline.events[2].addedPageIds).toEqual(["p2"]);
    expect(timeline.events[2].changedPageIds).toEqual([]);
    expect(timeline.events[3].changedPageIds).toEqual(["p1"]);
    expect(timeline.events[3].elementDelta).toBe(2);
  });

  it("저널 메타가 있으면 바뀐 페이지와 기록 시각은 메타가 진실이다", () => {
    const timeline = buildProcessReplayTimeline(sampleHistory(), {
      stepMeta: [undefined, { at: 1_000, changedPageIds: ["p9"] }, { at: 2_500 }, undefined],
    });
    expect(timeline.events[1].changedPageIds).toEqual(["p9"]);
    expect(timeline.events[1].at).toBe(1_000);
    expect(timeline.events[2].at).toBe(2_500);
    expect(timeline.events[3].at).toBeNull();
  });

  it("상한을 넘으면 오래된 쪽부터 버리고 historyIndex 좌표는 보존한다", () => {
    const history = Array.from({ length: 10 }, (_, i) => [page("p1", i)]);
    const timeline = buildProcessReplayTimeline(history, { maxEvents: 4 });
    expect(timeline.truncatedCount).toBe(6);
    expect(timeline.events.map((e) => e.historyIndex)).toEqual([6, 7, 8, 9]);
    expect(timeline.events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });

  it("페이지별 필터는 처음 상태 + 그 페이지를 건드린 단계만 남긴다", () => {
    const timeline = buildProcessReplayTimeline(sampleHistory());
    const p2Only = filterProcessReplayEvents(timeline, "p2");
    expect(p2Only.map((e) => e.historyIndex)).toEqual([0, 2]);
    expect(filterProcessReplayEvents(timeline, null)).toHaveLength(4);
    expect(filterProcessReplayEvents(timeline, "p1").map((e) => e.historyIndex)).toEqual([0, 1, 3]);
  });
});

describe("저널 계약 확장 — pages 항목 메타는 선택이고 기본 형태는 불변", () => {
  it("메타 없이 기록하면 종전과 같은 { kind: 'pages' } 항목만 쌓인다", () => {
    let journal: StudioHistoryJournal<Bible, Writer> = createStudioHistoryJournal();
    journal = recordStudioHistoryJournalPagesSteps(journal, { addedSteps: 1, nextUndoDepth: 1 });
    expect(journal.entries).toEqual([{ kind: "pages" }]);
  });

  it("메타를 주면 마지막 단계에만 붙고, changedPageIds 는 복사돼 원본 변경에 영향받지 않는다", () => {
    const changed = ["p1"];
    let journal: StudioHistoryJournal<Bible, Writer> = createStudioHistoryJournal();
    journal = recordStudioHistoryJournalPagesSteps(journal, {
      addedSteps: 2,
      nextUndoDepth: 2,
      at: 42_000,
      changedPageIds: changed,
    });
    changed.push("p2");
    expect(journal.entries[0]).toEqual({ kind: "pages" });
    expect(journal.entries[1]).toEqual({ kind: "pages", at: 42_000, changedPageIds: ["p1"] });
  });
});

describe("재생 상태 기계 — 속도·구간·전진", () => {
  const timeline = buildProcessReplayTimeline(sampleHistory(), {
    stepMeta: [undefined, { at: 0 }, { at: 10_000 }, { at: 10_100 }],
  });
  const events = timeline.events;

  it("간격은 실제 기록 간격을 클램프하고 속도로 나눈다", () => {
    // 10초 간격 → 상한 4_000ms, 2배속이면 2_000ms
    expect(processReplayIntervalMs(events, 1, 2)).toBe(2_000);
    // 100ms 간격 → 하한 150ms, 1배속
    expect(processReplayIntervalMs(events, 2, 1)).toBe(150);
    // 시각 미기록 구간 → 기본 간격
    expect(processReplayIntervalMs(events, 0, 1)).toBe(PROCESS_REPLAY_BASE_INTERVAL_MS);
  });

  it("재생하면 경과 시간만큼 전진하고 끝에 닿으면 멈춘다", () => {
    let state = playProcessReplay(createProcessReplayState(events.length), events.length);
    expect(state.playing).toBe(true);
    state = advanceProcessReplay(state, events, PROCESS_REPLAY_BASE_INTERVAL_MS);
    expect(state.pos).toBe(1);
    // 남은 전 구간을 한 번에 소비 — 틱당 상한 안이면 끝까지 가고 멈춘다.
    state = advanceProcessReplay(state, events, 60_000);
    expect(state.pos).toBe(events.length - 1);
    expect(state.playing).toBe(false);
    expect(state.ended).toBe(true);
    // 끝에서 재생을 다시 누르면 처음부터.
    state = playProcessReplay(state, events.length);
    expect(state.pos).toBe(0);
    expect(state.playing).toBe(true);
  });

  it("틱당 전진 상한을 넘지 않는다 — 남은 경과 시간은 버려진다", () => {
    const many = buildProcessReplayTimeline(
      Array.from({ length: 100 }, (_, i) => [page("p1", i)])
    ).events;
    let state = playProcessReplay(createProcessReplayState(many.length), many.length);
    state = advanceProcessReplay(state, many, 10_000_000);
    expect(state.pos).toBe(PROCESS_REPLAY_MAX_EVENTS_PER_TICK);
    expect(state.playing).toBe(true);
  });

  it("속도는 지원 목록만 허용하고 구간 안에서는 구간 끝에서 멈춘다", () => {
    let state = createProcessReplayState(events.length);
    expect(setProcessReplaySpeed(state, 3)).toBe(state);
    expect(setProcessReplaySpeed(state, 4).speed).toBe(4);

    state = setProcessReplaySegment(state, events.length, { startPos: 3, endPos: 1 });
    expect(state.segment).toEqual({ startPos: 1, endPos: 3 });
    expect(state.pos).toBe(1); // 구간 밖 위치는 구간 시작으로 이동
    state = playProcessReplay(state, events.length);
    state = advanceProcessReplay(state, events, 60_000);
    expect(state.pos).toBe(3);
    expect(state.ended).toBe(true);
    // 구간 안 seek 는 구간으로 클램프된다.
    expect(seekProcessReplay(state, events.length, 0).pos).toBe(1);
    expect(seekProcessReplay(state, events.length, 99).pos).toBe(3);
  });

  it("진행 요약과 시계 표기가 표시 계약을 지킨다", () => {
    const state = seekProcessReplay(createProcessReplayState(events.length), events.length, 2);
    const progress = processReplayProgress(state, events);
    expect(progress.current?.historyIndex).toBe(2);
    expect(progress.ratio).toBeCloseTo(2 / 3);
    expect(formatProcessReplayClock(65_000, 0)).toBe("1:05");
    expect(formatProcessReplayClock(3_661_000, 0)).toBe("1:01:01");
    expect(formatProcessReplayClock(null, 0)).toBe("시각 미기록");
  });
});
