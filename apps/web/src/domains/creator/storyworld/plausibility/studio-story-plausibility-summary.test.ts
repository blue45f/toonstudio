import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE,
  STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT,
  acquireProductPlausibilitySummaryStore,
  describePlausibilitySummary,
  parsePlausibilitySummary,
  parsePlausibilitySummaryEvent,
  plausibilityHubHref,
  plausibilitySnapshotFromReport,
  plausibilitySummaryKey,
  readPlausibilitySummary,
  resetPlausibilitySummaryStoreForTests,
  writePlausibilitySummary,
  type PlausibilitySummarySnapshot,
} from "./studio-story-plausibility-summary";
import { GOLDEN_STORIES } from "./studio-story-plausibility-golden-fixtures";
import { memorySummaryStore } from "./studio-story-plausibility-hub.test-support";
import { applyPlausibilityDispositions, buildPlausibilityReport } from "./studio-story-plausibility-report";

const runtime = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock("../../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: runtime.acquire }));

const SNAPSHOT: PlausibilitySummarySnapshot = {
  version: 1,
  checkedAtIso: "2026-10-15T09:30:00.000Z",
  errorCount: 2,
  warningCount: 5,
  suggestionCount: 1,
  coveragePercent: 62,
  sceneCount: 12,
  partial: false,
};

const formatTime = (iso: string, locale: "ko" | "en") => `${locale}:${iso.slice(0, 16)}`;

afterEach(() => {
  resetPlausibilitySummaryStoreForTests();
  runtime.acquire.mockReset();
});

describe("요약 만들기", () => {
  it("처리 기록을 겹친 건수 기준으로 만든다", () => {
    const story = GOLDEN_STORIES.find((item) => item.id === "g-missing-precondition");
    if (!story) throw new Error("골든 이야기가 필요합니다.");
    const report = buildPlausibilityReport({ project: story.project, generatedAtIso: SNAPSHOT.checkedAtIso });
    const open = plausibilitySnapshotFromReport(report, applyPlausibilityDispositions(report, []));
    expect(open).toMatchObject({ version: 1, errorCount: 1, warningCount: 0, partial: false, sceneCount: 2 });
    const handled = plausibilitySnapshotFromReport(report, applyPlausibilityDispositions(report, [{ issueKey: report.findings[0]?.dispositionKey ?? "", status: "resolved" }]));
    expect(handled.errorCount).toBe(0);
  });

  it("일부 장면만 점검했으면 partial 표시가 붙는다", () => {
    const story = GOLDEN_STORIES.find((item) => item.id === "g-missing-precondition");
    if (!story) throw new Error("골든 이야기가 필요합니다.");
    const report = buildPlausibilityReport({ project: story.project, generatedAtIso: SNAPSHOT.checkedAtIso, scopeSceneIds: ["s2"] });
    expect(plausibilitySnapshotFromReport(report, applyPlausibilityDispositions(report, [])).partial).toBe(true);
  });
});

describe("저장과 읽기", () => {
  it("작품별 열쇠로 저장하고 다시 읽으며, 알림 이벤트를 보낸다", async () => {
    const { map, store } = memorySummaryStore();
    const events: Event[] = [];
    const target = { dispatchEvent: (event: Event) => { events.push(event); return true; } };
    expect(await writePlausibilitySummary(store, "작품 1", SNAPSHOT, target)).toBe(true);
    expect(map.has(plausibilitySummaryKey("작품 1"))).toBe(true);
    expect(plausibilitySummaryKey("작품 1")).toBe(encodeURIComponent("작품 1"));
    expect(await readPlausibilitySummary(store, "작품 1")).toEqual(SNAPSHOT);
    expect(await readPlausibilitySummary(store, "다른 작품")).toBeNull();
    const event = events[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event?.type).toBe(STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT);
    expect(event ? parsePlausibilitySummaryEvent(event) : null).toEqual({ projectId: "작품 1", snapshot: SNAPSHOT });
  });

  it("본문이나 근거는 저장하지 않는다(숫자와 시각만)", async () => {
    const { map, store } = memorySummaryStore();
    await writePlausibilitySummary(store, "p", SNAPSHOT);
    const parsed: unknown = JSON.parse(map.get(plausibilitySummaryKey("p")) ?? "null");
    expect(typeof parsed === "object" && parsed !== null ? Object.keys(parsed).sort() : []).toEqual([
      "checkedAtIso", "coveragePercent", "errorCount", "partial", "sceneCount", "suggestionCount", "version", "warningCount",
    ]);
  });

  it("저장소가 막혀 있어도 던지지 않고 false를 돌려주며 알리지 않는다", async () => {
    const events: Event[] = [];
    const target = { dispatchEvent: (event: Event) => { events.push(event); return true; } };
    const blocked = { set: () => Promise.reject(new Error("quota")) };
    expect(await writePlausibilitySummary(blocked, "p", SNAPSHOT, target)).toBe(false);
    expect(events).toEqual([]);
    expect(await writePlausibilitySummary(memorySummaryStore().store, "  ", SNAPSHOT)).toBe(false);
  });

  it.each([
    ["JSON이 아님", "{깨짐"],
    ["배열", "[]"],
    ["버전 다름", JSON.stringify({ ...SNAPSHOT, version: 2 })],
    ["시각 오류", JSON.stringify({ ...SNAPSHOT, checkedAtIso: "어제" })],
    ["음수 건수", JSON.stringify({ ...SNAPSHOT, errorCount: -1 })],
    ["소수 건수", JSON.stringify({ ...SNAPSHOT, warningCount: 1.5 })],
    ["범위 초과", JSON.stringify({ ...SNAPSHOT, coveragePercent: 101 })],
    ["partial 누락", JSON.stringify({ ...SNAPSHOT, partial: "예" })],
  ])("읽을 수 없는 값은 없는 것으로 본다: %s", async (_name, raw) => {
    const { store } = memorySummaryStore({ [plausibilitySummaryKey("p")]: raw });
    expect(await readPlausibilitySummary(store, "p")).toBeNull();
  });

  it("읽는 중 저장소가 실패하면 그대로 알려 '점검한 적 없음'과 구별하게 한다", async () => {
    await expect(readPlausibilitySummary({ get: () => Promise.reject(new Error("blocked")) }, "p")).rejects.toThrow("blocked");
    expect(parsePlausibilitySummary(null)).toBeNull();
    expect(await readPlausibilitySummary(memorySummaryStore().store, "")).toBeNull();
  });

  it("알림 이벤트는 모양이 맞는 것만 읽는다", () => {
    expect(parsePlausibilitySummaryEvent(new Event("x"))).toBeNull();
    expect(parsePlausibilitySummaryEvent(new CustomEvent("x", { detail: { projectId: 1, snapshot: SNAPSHOT } }))).toBeNull();
    expect(parsePlausibilitySummaryEvent(new CustomEvent("x", { detail: { projectId: "p", snapshot: { ...SNAPSHOT, version: 9 } } }))).toBeNull();
    expect(parsePlausibilitySummaryEvent(new CustomEvent("x", { detail: null }))).toBeNull();
  });
});

describe("제품 저장소", () => {
  it("공용 SQLite의 전용 이름 공간 저장소를 한 번만 얻는다(브라우저 KV는 쓰지 않는다)", async () => {
    const namespaces: string[] = [];
    const { store } = memorySummaryStore();
    runtime.acquire.mockResolvedValue({ asAsyncKeyValueStore: (namespace: string) => { namespaces.push(namespace); return store; } });
    const first = await acquireProductPlausibilitySummaryStore();
    const second = await acquireProductPlausibilitySummaryStore();
    expect(first).toBe(second);
    expect(namespaces).toEqual([STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE]);
    expect(runtime.acquire).toHaveBeenCalledTimes(1);
  });

  it("열지 못하면 실패를 기억하지 않아 다음에 다시 시도할 수 있다", async () => {
    const { store } = memorySummaryStore();
    runtime.acquire.mockRejectedValueOnce(new Error("OPFS 없음"));
    await expect(acquireProductPlausibilitySummaryStore()).rejects.toThrow("OPFS 없음");
    runtime.acquire.mockResolvedValue({ asAsyncKeyValueStore: () => store });
    await expect(acquireProductPlausibilitySummaryStore()).resolves.toBe(store);
  });
});

describe("준비도 한 줄", () => {
  it("점검한 적이 없으면 권장 안내이고 출시를 막지 않는다고 밝힌다", () => {
    const text = describePlausibilitySummary(null, formatTime);
    expect(text.ko).toContain("아직 점검하지 않았어요");
    expect(text.ko).toContain("출시를 막지 않아요");
    expect(text.en).toContain("never blocks publishing");
  });

  it("읽는 중이거나 읽지 못했으면 점검 여부를 단정하지 않는다", () => {
    const text = describePlausibilitySummary(undefined, formatTime);
    expect(text.ko).not.toContain("아직 점검하지 않았어요");
    expect(text.ko).toContain("출시를 막지 않아요");
    expect(text.en).not.toContain("not run yet");
  });

  it("마지막 점검 시각, 오류·경고 건수, 커버리지를 한 줄로 보여 준다", () => {
    const text = describePlausibilitySummary(SNAPSHOT, formatTime);
    expect(text.ko).toBe("개연성 점검 요약 · 마지막 점검 ko:2026-10-15T09:30 · 오류 2 · 경고 5 · 커버리지 62% (권장 · 출시를 막지 않아요)");
    expect(text.en).toContain("2 errors");
    expect(text.en).toContain("5 warnings");
    expect(text.en).toContain("62% coverage");
    expect(text.ko).not.toContain("\n");
  });

  it("일부 장면만 점검했다면 그렇게 밝힌다", () => {
    expect(describePlausibilitySummary({ ...SNAPSHOT, partial: true }, formatTime).ko).toContain("일부 장면만 점검");
  });

  it("허브로 가는 길은 작품 id를 인코딩한다", () => {
    expect(plausibilityHubHref("work-1")).toBe("/studio/work/work-1/storyworld?view=plausibility");
    expect(plausibilityHubHref("a/b 작품")).toBe(`/studio/work/${encodeURIComponent("a/b 작품")}/storyworld?view=plausibility`);
  });
});
