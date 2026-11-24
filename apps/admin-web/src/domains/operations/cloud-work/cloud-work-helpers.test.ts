import { blankCheck, blankTask, emptyBoard } from "@toonstudio/contracts/admin-cloud-workboard";
import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS, filterWorkTasks, mergeWorkImport, parseWorkImport } from "./cloud-work-helpers";

describe("클라우드 작업 JSON 병합과 필터", () => {
  it("처음 가져올 때 빈 스냅샷 대신 실제 관측 시각을 보존하고 원본 감사 이력을 신뢰하지 않는다", () => {
    const incoming = { ...emptyBoard(), snapshotAt: "2026-11-18T00:00:00.000Z", tasks: [{ ...blankTask(), id: "TS-TEST", title: "검토 자료" }], audit: [{ id: "external-history", at: "2026-11-18T00:00:00.000Z", taskId: "TS-TEST", title: "원본 이력", detail: "원본 파일에만 보존" }] };
    const merged = mergeWorkImport(emptyBoard(), incoming);
    expect(merged.snapshotAt).toBe(incoming.snapshotAt);
    expect(merged.audit).toEqual([]);
    expect(merged.sourceHistory).toEqual(incoming.audit);
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
  it("해당 SHA의 최신 증빙이 있는 신호만 검색·필터에서 감지로 취급한다", () => {
    const now = Date.parse("2026-11-24T00:00:00Z");
    const sha = "a".repeat(40);
    const evidence = { id: "risk", title: "직접 확인한 실패", url: "https://github.com/example/project/actions/runs/1", kind: "GitHub" as const, summary: "같은 SHA의 실패 로그 확인", observedAt: "2026-11-23T23:00:00Z", occurredAt: "", subjectSha: sha };
    const first = { ...blankTask(), id: "TS-ONE", title: "회귀 확인", remoteBranch: "fix/test", remoteSha: sha, evidence: [evidence], risks: { ...blankTask().risks, regression: "감지" as const }, riskEvidenceIds: { ...blankTask().riskEvidenceIds, regression: [evidence.id] } };
    const second = { ...blankTask(), id: "TS-TWO", title: "CI 확인", remoteSha: sha, evidence: [evidence], risks: { ...blankTask().risks, ciFailure: "감지" as const }, riskEvidenceIds: { ...blankTask().riskEvidenceIds, ciFailure: [evidence.id] } };
    const unproven = { ...blankTask(), id: "TS-OLD", title: "근거 없는 위험 기록", risks: { ...blankTask().risks, regression: "감지" as const } };
    expect(filterWorkTasks([first, second, unproven], { ...DEFAULT_FILTERS, risk: "회귀 감지", query: "FIX/TEST" }, now)).toEqual([first]);
    expect(filterWorkTasks([first, second, unproven], { ...DEFAULT_FILTERS, risk: "CI 실패" }, now)).toEqual([second]);
    expect(filterWorkTasks([first, second, unproven], { ...DEFAULT_FILTERS, risk: "위험 감지" }, now + 48 * 60 * 60 * 1000)).toEqual([]);
    expect(filterWorkTasks([unproven], { ...DEFAULT_FILTERS, risk: "증빙 미확인·오래됨" }, now)).toEqual([unproven]);
  });

  it("Sites 검증·보존 필드와 보드 전체 출처 이력을 손실 없이 왕복하고 재가져오기를 중복 기록하지 않는다", () => {
    const task = { ...blankTask(), id: "IMPORT-1", title: "정리 승인", action: "브랜치 삭제" as const, stage: "승인 대기" as const,
      baseBranch: "integration", prDraft: true, deployConfigKey: "web-config-v2", migrationTarget: "test", migrationIds: ["0125"],
      verificationChecks: [{ ...blankCheck("cleanup"), id: "check-1", reason: "원본 변경 보존을 먼저 확인" }],
      worktreeCount: 2, unmergedBranchCount: 3, stashCount: 1, preservationNote: "검토 중인 변경 유지", preservationLink: "https://example.com/evidence",
    };
    const source = { ...emptyBoard(), tasks: [task], audit: [{ id: "source-1", taskId: "", at: "2026-11-18T00:00:00Z", title: "원본 스냅샷", detail: "이전 시스템의 기록" }] };
    const imported = parseWorkImport(JSON.stringify(source));
    expect(imported.tasks).toEqual([task]);
    expect(imported.audit).toEqual([]);
    expect(imported.sourceHistory).toEqual(source.audit);
    const merged = mergeWorkImport(emptyBoard(), imported);
    expect(mergeWorkImport(merged, parseWorkImport(JSON.stringify(merged)))).toEqual(merged);
    expect(merged.tasks[0].verifiedAt).toBe("");
  });

  it("증빙이 없는 과거 완료를 현재 검증 완료 필터에 포함하지 않는다", () => {
    const task = { ...blankTask(), title: "이전 완료 기록", stage: "검증 완료" as const };
    expect(filterWorkTasks([task], { ...DEFAULT_FILTERS, stage: "검증 완료" }, Date.now())).toEqual([]);
    expect(filterWorkTasks([task], { ...DEFAULT_FILTERS, stage: "미확인" }, Date.now())).toEqual([task]);
  });
});
