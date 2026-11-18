import { blankTask, emptyBoard } from "@toonstudio/contracts/admin-cloud-workboard";
import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS, filterWorkTasks, mergeWorkImport, parseWorkImport } from "./cloud-work-helpers";

describe("클라우드 작업 JSON 병합과 필터", () => {
  it("처음 가져올 때 빈 스냅샷 대신 실제 관측 시각을 보존하고 원본 감사 이력을 신뢰하지 않는다", () => {
    const incoming = { ...emptyBoard(), snapshotAt: "2026-11-18T00:00:00.000Z", tasks: [{ ...blankTask(), id: "TS-TEST", title: "검토 자료" }], audit: [{ id: "external-history", at: "2026-11-18T00:00:00.000Z", taskId: "TS-TEST", title: "원본 이력", detail: "원본 파일에만 보존" }] };
    const merged = mergeWorkImport(emptyBoard(), incoming);
    expect(merged.snapshotAt).toBe(incoming.snapshotAt);
    expect(merged.audit).toEqual([]);
    expect(merged.tasks[0].title).toBe("검토 자료");
  });
  it("동일 ID만 교체하고 기존 서버 이력과 더 최근의 관측 시각은 유지한다", () => {
    const task = { ...blankTask(), id: "TS-TEST", title: "현재 작업" };
    const untouched = { ...blankTask(), id: "TS-KEEP", title: "유지 작업" };
    const current = { ...emptyBoard(), snapshotAt: "2026-11-18T00:00:00.000Z", tasks: [task, untouched], audit: [{ id: "server-history", at: "2026-11-18T00:00:00.000Z", taskId: "TS-TEST", title: "서버 이력", detail: "보존 대상" }] };
    const incoming = { ...emptyBoard(), tasks: [{ ...task, title: "가져온 작업" }] };
    const merged = mergeWorkImport(current, incoming);
    expect(merged.tasks.map(item => item.title)).toEqual(["가져온 작업", "유지 작업"]);
    expect(merged.audit).toEqual(current.audit);
    expect(merged.snapshotAt).toBe(current.snapshotAt);
    expect(current.tasks[0].title).toBe("현재 작업");
  });
  it("실행 조치의 완료 위조와 유효하지 않은 링크를 가져오지 않는다", () => {
    const task = { ...blankTask(), title: "승인이 필요한 배포", action: "외부 배포", stage: "검증 완료" };
    expect(() => parseWorkImport(JSON.stringify({ ...emptyBoard(), tasks: [task] }))).toThrow(/승인 대기/u);
    expect(() => parseWorkImport(JSON.stringify({ ...emptyBoard(), tasks: [{ ...blankTask(), title: "외부 링크", repo: "javascript:alert(1)" }] }))).toThrow();
    expect(() => parseWorkImport(" ".repeat(1_500_001))).toThrow(/1.5MB/u);
  });
  it("확인되지 않은 증빙과 별도 위험 신호를 검색·필터로 구분한다", () => {
    const first = { ...blankTask(), id: "TS-ONE", title: "회귀 확인", remoteBranch: "fix/test", risks: { ...blankTask().risks, regression: "감지" as const } };
    const second = { ...blankTask(), id: "TS-TWO", title: "CI 확인", risks: { ...blankTask().risks, ciFailure: "감지" as const } };
    expect(filterWorkTasks([first, second], { ...DEFAULT_FILTERS, risk: "회귀 감지", query: "FIX/TEST" }, Date.now())).toEqual([first]);
    expect(filterWorkTasks([first, second], { ...DEFAULT_FILTERS, risk: "CI 실패" }, Date.now())).toEqual([second]);
    expect(filterWorkTasks([first, second], { ...DEFAULT_FILTERS, risk: "증빙 미확인·오래됨" }, Date.now())).toHaveLength(2);
  });
});
