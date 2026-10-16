import { describe, expect, it, vi } from "vitest";

import {
  INITIAL_PANEL_STATE,
  importReaderFeedbackSources,
  limitSources,
  panelReducer,
  pastedSource,
  type ImportOutcome,
  type ImportReport,
  type ImportSource,
  type PanelState,
} from "./reader-feedback-import";
import { createExampleReaderFeedback } from "./reader-feedback-example";
import { READER_FEEDBACK_LIMITS } from "./reader-feedback-schema";

const EXAMPLES = createExampleReaderFeedback();
const valid = (count: number, from = 0) => JSON.stringify({
  kind: "toonstudio-reader-feedback", version: 1, exportedAt: "2026-10-16T01:05:00.000Z", responses: EXAMPLES.slice(from, from + count),
});

function source(name: string, text: string | (() => Promise<string>), size = 10): ImportSource {
  return { name, source: "file", size, text: typeof text === "string" ? async () => text : text };
}

function report(id: number, overrides: Partial<ImportReport> = {}): ImportReport {
  return { id, name: `f${id}.json`, source: "file", status: "ok", code: null, path: null, accepted: 1, retryable: false, ...overrides };
}

describe("importReaderFeedbackSources", () => {
  it("파일 하나가 실패해도 나머지는 계속 읽고, 보고서 id 는 차례로 붙는다", async () => {
    const outcome = await importReaderFeedbackSources([
      source("a.json", valid(2)),
      source("broken.json", "{ 깨짐"),
      source("flaky.json", async () => { throw new Error("NotReadableError"); }),
      source("empty.json", "", 0),
      source("b.json", valid(3, 4)),
    ], 7);
    expect(outcome.reports.map((item) => [item.id, item.name, item.status, item.code, item.accepted, item.retryable])).toEqual([
      [7, "a.json", "ok", null, 2, false],
      [8, "broken.json", "failed", "not-json", 0, false],
      [9, "flaky.json", "failed", "read-failed", 0, true],
      [10, "empty.json", "failed", "empty", 0, false],
      [11, "b.json", "ok", null, 3, false],
    ]);
    expect(outcome.incoming).toHaveLength(5);
  });

  it("형식 오류는 첫 위치를 함께 남기고, 붙여넣은 내용은 다시 읽어도 같으므로 재시도 대상이 아니다", async () => {
    const bad = JSON.parse(valid(1));
    bad.responses[0].ratings.fun = 9;
    const outcome = await importReaderFeedbackSources([source("bad.json", JSON.stringify(bad)), { ...pastedSource("{ 깨짐", "붙여넣은 내용") }], 1);
    expect(outcome.reports[0]).toMatchObject({ status: "failed", code: "invalid", path: expect.stringMatching(/^responses\[0\]\.ratings/u) });
    expect(outcome.reports[1]).toMatchObject({ source: "paste", code: "not-json", retryable: false });
  });

  it("화면에 보일 이름은 제어 문자를 지우고 80자로 줄이며, 비면 빈 문자열이라 화면이 번역된 대체 이름을 쓴다", async () => {
    const outcome = await importReaderFeedbackSources([
      source(`가${String.fromCharCode(0)}나${String.fromCodePoint(0x202e)}다.json`, valid(1)),
      source("긴".repeat(200), valid(1, 1)),
      source("   ", valid(1, 2)),
    ], 1);
    expect(outcome.reports[0]!.name).toBe("가나다.json");
    expect(Array.from(outcome.reports[1]!.name)).toHaveLength(80);
    // 모듈은 번역을 모르므로 한국어 문구를 박아 두지 않고 빈 값을 돌려준다(화면이 현재 언어로 "(이름 없음)"을 보인다).
    expect(outcome.reports[2]!.name).toBe("");
    const invisible = await importReaderFeedbackSources([source(`${String.fromCodePoint(0x2800, 0x3164)}`, valid(1))], 1);
    expect(invisible.reports[0]!.name).toBe("");
  });

  it("너무 큰 소스는 내용을 읽지 않는다", async () => {
    const read = vi.fn(async () => valid(1));
    const outcome = await importReaderFeedbackSources([source("big.json", read, READER_FEEDBACK_LIMITS.maxFileBytes + 1)], 1);
    expect(outcome.reports[0]).toMatchObject({ code: "too-large", retryable: false });
    expect(read).not.toHaveBeenCalled();
  });

  it("붙여넣은 글의 크기는 UTF-8 바이트 수다", () => {
    expect(pastedSource("abc", "p").size).toBe(3);
    expect(pastedSource("가", "p").size).toBe(3);
  });

  it("한 번에 읽을 파일 수를 자르고 건너뛴 수를 알려 준다", () => {
    const items = Array.from({ length: 23 }, (_, index) => index);
    expect(limitSources(items)).toEqual({ kept: items.slice(0, READER_FEEDBACK_LIMITS.maxFiles), skipped: 3 });
    expect(limitSources([1, 2])).toEqual({ kept: [1, 2], skipped: 0 });
  });
});

describe("panelReducer", () => {
  const outcome = (reports: ImportReport[], from: number, count: number): ImportOutcome => ({ reports, incoming: EXAMPLES.slice(from, from + count) });

  it("가져오기가 시작되면 읽는 중 수가 늘고 끝나면 줄어 겹친 가져오기에도 맞는다", () => {
    let state: PanelState = panelReducer(INITIAL_PANEL_STATE, { type: "loading" });
    state = panelReducer(state, { type: "loading" });
    expect(state.pending).toBe(2);
    state = panelReducer(state, { type: "imported", generation: 0, outcome: outcome([report(1)], 0, 2), skippedFiles: 0 });
    expect(state.pending).toBe(1);
    state = panelReducer(state, { type: "imported", generation: 0, outcome: outcome([report(2)], 1, 2), skippedFiles: 0 });
    expect(state.pending).toBe(0);
    expect(state.responses).toHaveLength(3);
    expect(state.lastMerge).toEqual({ added: 1, updated: 0, duplicates: 1, overflow: 0 });
  });

  it("보고서는 최근 가져오기가 앞에 오고 같은 가져오기 안에서는 고른 순서를 지키며 30개까지만 남긴다", () => {
    let state = panelReducer(INITIAL_PANEL_STATE, { type: "imported", generation: 0, outcome: outcome([report(1), report(2)], 0, 1), skippedFiles: 0 });
    state = panelReducer(state, { type: "imported", generation: 0, outcome: outcome([report(3), report(4)], 0, 1), skippedFiles: 2 });
    expect(state.reports.map((item) => item.id)).toEqual([3, 4, 1, 2]);
    expect(state.skippedFiles).toBe(2);
    const many = Array.from({ length: 40 }, (_, index) => report(100 + index));
    state = panelReducer(state, { type: "imported", generation: 0, outcome: outcome(many, 0, 1), skippedFiles: 0 });
    expect(state.reports).toHaveLength(30);
    expect(state.reports[0]!.id).toBe(100);
  });

  it("다시 시도한 결과는 같은 id 의 보고서를 바꿔 끼우고 응답을 합친다", () => {
    let state = panelReducer(INITIAL_PANEL_STATE, {
      type: "imported",
      generation: 0,
      outcome: { reports: [report(1, { status: "failed", code: "read-failed", accepted: 0, retryable: true }), report(2)], incoming: [] },
      skippedFiles: 0,
    });
    state = panelReducer(state, { type: "loading" });
    state = panelReducer(state, { type: "retried", generation: 0, outcome: outcome([report(1, { accepted: 3 })], 0, 3) });
    expect(state.reports.map((item) => [item.id, item.status, item.accepted, item.retryable])).toEqual([[1, "ok", 3, false], [2, "ok", 1, false]]);
    expect(state.responses).toHaveLength(3);
    expect(state.pending).toBe(0);
  });

  it("선택·보고서 닫기·비우기는 서로 영향을 주지 않는 범위만 바꾼다", () => {
    let state = panelReducer(INITIAL_PANEL_STATE, { type: "imported", generation: 0, outcome: outcome([report(1)], 0, 2), skippedFiles: 1 });
    state = panelReducer(state, { type: "select", key: "k" });
    expect(state.selectedKey).toBe("k");
    state = panelReducer(state, { type: "dismiss-reports" });
    expect(state.reports).toEqual([]);
    expect(state.responses).toHaveLength(2);
    state = panelReducer(panelReducer(state, { type: "loading" }), { type: "clear" });
    // 비우면 읽고 있던 가져오기도 버린 것으로 본다: 읽는 중 수는 0 이고 세대만 하나 올라간다.
    expect(state).toEqual({ ...INITIAL_PANEL_STATE, generation: 1 });
  });

  it("비우기 전에 시작한 가져오기·다시 시도의 늦은 결과는 버리고, 비운 뒤에 시작한 것은 받는다", () => {
    let state = panelReducer(INITIAL_PANEL_STATE, { type: "imported", generation: 0, outcome: outcome([report(1, { status: "failed", code: "read-failed", accepted: 0, retryable: true })], 0, 0), skippedFiles: 0 });
    state = panelReducer(state, { type: "loading" });
    state = panelReducer(state, { type: "loading" });
    expect(state.pending).toBe(2);
    state = panelReducer(state, { type: "clear" });
    expect(state).toMatchObject({ pending: 0, generation: 1, responses: [], reports: [], lastMerge: null });

    // 세대 0 에서 시작한 두 가져오기가 뒤늦게 끝나도 아무것도 바뀌지 않는다(읽는 중 수도 그대로).
    state = panelReducer(state, { type: "loading" });
    const late = panelReducer(state, { type: "imported", generation: 0, outcome: outcome([report(2)], 0, 3), skippedFiles: 1 });
    expect(late).toBe(state);
    expect(panelReducer(state, { type: "retried", generation: 0, outcome: outcome([report(1, { accepted: 3 })], 0, 3) })).toBe(state);

    // 비운 뒤(세대 1)에 시작한 가져오기는 받는다.
    const fresh = panelReducer(state, { type: "imported", generation: 1, outcome: outcome([report(3)], 4, 2), skippedFiles: 0 });
    expect(fresh).toMatchObject({ pending: 0, generation: 1, lastMerge: { added: 2 } });
    expect(fresh.responses).toHaveLength(2);
  });

  it("상태를 직접 바꾸지 않는다", () => {
    const before = panelReducer(INITIAL_PANEL_STATE, { type: "imported", generation: 0, outcome: outcome([report(1)], 0, 2), skippedFiles: 0 });
    const snapshot = JSON.stringify(before);
    panelReducer(before, { type: "imported", generation: 0, outcome: outcome([report(2)], 2, 2), skippedFiles: 0 });
    panelReducer(before, { type: "clear" });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
