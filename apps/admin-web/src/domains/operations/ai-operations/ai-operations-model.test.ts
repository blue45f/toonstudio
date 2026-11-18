import { describe, expect, it } from "vitest";

import { aiFixture } from "./ai-operations-fixture.test-support";
import { aiCsv, aiDate, aiFreshness, aiKstInput, aiKstIso, newAiItem, preserveAiApprovals } from "./ai-operations-model";

describe("AI 운영 보드 이동과 표시", () => {
  it("브라우저 시간대에 관계없이 KST 입력을 UTC로 왕복한다", () => {
    expect(aiKstInput("2026-11-17T20:15:16Z")).toBe("2026-11-18T05:15:16");
    expect(aiKstIso("2026-11-18T05:15:16")).toBe("2026-11-17T20:15:16.000Z");
    expect(aiDate(null)).toBe("미확인"); expect(aiDate("not-a-date")).toBe("미확인");
  });
  it("불명한 관측 시각을 0 또는 최신으로 만들지 않는다", () => {
    const snapshot = aiFixture(); snapshot.meta.snapshotAt = "";
    expect(aiFreshness(snapshot)).toBe("관측 시각 미확인");
    expect(aiFreshness(aiFixture(), Date.parse("2026-01-03T00:00:00Z"))).toMatch(/24시간 경과/u);
  });
  it("CSV의 수식과 개행·따옴표를 안전하게 내보낸다", () => {
    const item = newAiItem("model"); item.title = '=HYPERLINK("https://example.com")'; item.notes = "\n";
    expect(aiCsv([item])).toContain('"\'=HYPERLINK(""https://example.com"")"');
  });
  it("신규 운영 변경은 승인 대기로 만들며 대응 수치는 미확인으로 남긴다", () => {
    const task = newAiItem("task"); expect(task.approvalRequired).toBe(true); expect(task.status).toBe("승인 대기");
    expect(newAiItem("alert").fields.every((field) => field.value === "미확인")).toBe(true);
  });
  it("가져오기에서 기존 승인 항목과 필요한 근거를 보존한다", () => {
    const current = aiFixture(); const task = { ...newAiItem("task"), id: "approval", sourceIds: [current.sources[0].id] }; current.items.push(task);
    const incoming = aiFixture(); incoming.items[0].sourceIds = []; incoming.sources = [];
    const result = preserveAiApprovals(incoming, current); expect(result.preserved).toBe(1); expect(result.snapshot.items).toContainEqual(task); expect(result.snapshot.sources).toEqual(current.sources);
  });
  it("보존할 승인 항목의 출처 ID가 다른 내용에 재사용되면 가져오기를 거부한다", () => {
    const current = aiFixture(); current.items.push({ ...newAiItem("task"), id: "approval", sourceIds: [current.sources[0].id] });
    const incoming = aiFixture(); incoming.sources[0].url = "https://example.com/different";
    expect(() => preserveAiApprovals(incoming, current)).toThrow(/출처 ID/u);
  });
});
