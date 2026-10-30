// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionProjectAggregate, episodeScope, type ProductionTask } from "@toonstudio/core/production";
import { useTaskOutputAssignments } from "./use-task-output-assignments";

const NOW = "2026-10-29T12:00:00.000Z";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function fixture() {
  const aggregate = createProductionProjectAggregate({ projectId: "period-project", workId: "period-work", title: "배정 기간 경계",
    collaborationModel: "studio-production", ownerPartyId: "period-party", ownerUserId: "period-owner", ownerDisplayName: "담당자", at: NOW });
  const task: ProductionTask = { id: "period-task", projectId: aggregate.projectId, scope: episodeScope(aggregate.projectId, "period-episode"),
    processKey: "line-art", title: "선화", status: "in-progress", assignmentIds: [], reviewerAssignmentIds: [], inputRevisionRefs: [],
    outputDeliverableIds: [], dependencyTaskIds: [], dueAt: null, estimateHours: null, completionCriteria: [], sourceAgreementMilestoneId: null };
  const original = aggregate.assignments[0];
  if (!original) throw new Error("현재 계정의 역할 배정이 없습니다.");
  return { aggregate: { ...aggregate, tasks: [task] }, task, original };
}
describe("제출 역할의 현재 시각 표시", () => {
  it("화면을 다시 열지 않아도 시작·종료 경계에서 실제 역할 목록을 바꾼다", () => {
    const f = fixture(), start = Date.now() + 1000, end = start + 1000;
    const aggregate = { ...f.aggregate, assignments: [{ ...f.original, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() }] };
    const { result } = renderHook(() => useTaskOutputAssignments(aggregate, f.task, "period-owner"));
    expect(result.current).toEqual([]);
    act(() => { vi.advanceTimersByTime(1000); }); expect(result.current.map((item) => item.id)).toEqual([f.original.id]);
    act(() => { vi.advanceTimersByTime(1000); }); expect(result.current).toEqual([]);
  });
  it("시스템 시각이 바뀐 뒤 focus에서 고정된 최초 시각을 재사용하지 않는다", () => {
    const f = fixture(), aggregate = { ...f.aggregate, assignments: [{ ...f.original, endsAt: new Date(Date.now() + 1000).toISOString() }] };
    const { result } = renderHook(() => useTaskOutputAssignments(aggregate, f.task, "period-owner"));
    expect(result.current).toHaveLength(1);
    act(() => { vi.setSystemTime(new Date(Date.now() + 2000)); window.dispatchEvent(new Event("focus")); });
    expect(result.current).toEqual([]);
  });
  it("계정이 없는 기간 갱신은 타인의 역할을 빌리지 않는다", () => {
    const f = fixture();
    const { result } = renderHook(() => useTaskOutputAssignments(f.aggregate, f.task, null));
    act(() => { vi.advanceTimersByTime(10000); window.dispatchEvent(new Event("focus")); });
    expect(result.current).toEqual([]);
  });
});
