import { describe, expect, it } from "vitest";

import {
  STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT,
  describePlausibilitySummary,
  parsePlausibilitySummary,
  plausibilityHubHref,
  plausibilitySnapshotFromReport,
  plausibilitySummaryStorageKey,
  readPlausibilitySummary,
  writePlausibilitySummary,
  type PlausibilitySummarySnapshot,
} from "./studio-story-plausibility-summary";
import { GOLDEN_STORIES } from "./studio-story-plausibility-golden-fixtures";
import { applyPlausibilityDispositions, buildPlausibilityReport } from "./studio-story-plausibility-report";

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

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

const formatTime = (iso: string, locale: "ko" | "en") => `${locale}:${iso.slice(0, 16)}`;

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
  it("작품별 열쇠로 저장하고 다시 읽으며, 알림 이벤트를 보낸다", () => {
    const storage = memoryStorage();
    const events: Event[] = [];
    const target = { dispatchEvent: (event: Event) => { events.push(event); return true; } };
    expect(writePlausibilitySummary(storage, "작품 1", SNAPSHOT, target)).toBe(true);
    expect(storage.map.has(plausibilitySummaryStorageKey("작품 1"))).toBe(true);
    expect(plausibilitySummaryStorageKey("작품 1")).toContain(encodeURIComponent("작품 1"));
    expect(readPlausibilitySummary(storage, "작품 1")).toEqual(SNAPSHOT);
    expect(readPlausibilitySummary(storage, "다른 작품")).toBeNull();
    const event = events[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event?.type).toBe(STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT);
    if (event instanceof CustomEvent) expect(event.detail).toEqual({ projectId: "작품 1", snapshot: SNAPSHOT });
  });

  it("본문이나 근거는 저장하지 않는다(숫자와 시각만)", () => {
    const storage = memoryStorage();
    writePlausibilitySummary(storage, "p", SNAPSHOT);
    const raw = storage.map.get(plausibilitySummaryStorageKey("p")) ?? "";
    expect(Object.keys(JSON.parse(raw) as object).sort()).toEqual([
      "checkedAtIso", "coveragePercent", "errorCount", "partial", "sceneCount", "suggestionCount", "version", "warningCount",
    ]);
  });

  it("저장소가 막혀 있어도 던지지 않고 false를 돌려준다", () => {
    const blocked = { setItem: () => { throw new Error("quota"); } };
    expect(writePlausibilitySummary(blocked, "p", SNAPSHOT)).toBe(false);
    expect(writePlausibilitySummary(memoryStorage(), "  ", SNAPSHOT)).toBe(false);
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
  ])("읽을 수 없는 값은 없는 것으로 본다: %s", (_name, raw) => {
    expect(readPlausibilitySummary(memoryStorage({ [plausibilitySummaryStorageKey("p")]: raw }), "p")).toBeNull();
  });

  it("읽기 중 저장소가 던져도 null", () => {
    expect(readPlausibilitySummary({ getItem: () => { throw new Error("blocked"); } }, "p")).toBeNull();
    expect(parsePlausibilitySummary(null)).toBeNull();
  });
});

describe("준비도 한 줄", () => {
  it("점검한 적이 없으면 권장 안내이고 출시를 막지 않는다고 밝힌다", () => {
    const text = describePlausibilitySummary(null, formatTime);
    expect(text.ko).toContain("아직 점검하지 않았어요");
    expect(text.ko).toContain("출시를 막지 않아요");
    expect(text.en).toContain("never blocks publishing");
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
