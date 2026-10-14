import { describe, expect, it } from "vitest";

import { buildRoleTodayQueue } from "./creator-role-today-queue";
import { createEmptyProductionWorkspace } from "./studio-production-workspace";

const NOW = new Date("2026-09-17T00:00:00.000Z");

function workspace() {
  return {
    ...createEmptyProductionWorkspace("work:today-queue"),
    roleAssignments: [{
      id: "assignment-me",
      memberId: "user-me",
      displayName: "나",
      roles: ["lineart" as const],
      hierarchyNodeId: null,
    }],
    tasks: [
      {
        id: "pred-story",
        title: "콘티 확정",
        owner: "콘티 작가",
        due: "2026-09-16T00:00:00.000Z",
        progress: 60,
        status: "doing" as const,
        role: "storyboard" as const,
        priority: "normal" as const,
        dependencyIds: [],
        assigneeIds: [],
      },
      {
        id: "pred-blocked",
        title: "배경 소재 승인",
        owner: "배경 작가",
        due: "2026-09-20T00:00:00.000Z",
        progress: 10,
        status: "blocked" as const,
        role: "background" as const,
        priority: "normal" as const,
        dependencyIds: [],
        assigneeIds: [],
        blockedReason: "외주 소재 승인 대기",
      },
      {
        id: "done-pred",
        title: "대사 확정",
        owner: "스토리 작가",
        due: "2026-09-15T00:00:00.000Z",
        progress: 100,
        status: "done" as const,
        role: "story" as const,
        priority: "normal" as const,
        dependencyIds: [],
        assigneeIds: ["assignment-me"],
      },
      {
        id: "my-waiting",
        title: "선화 42컷",
        owner: "나",
        due: "2026-09-17T00:00:00.000Z",
        progress: 0,
        status: "todo" as const,
        role: "lineart" as const,
        priority: "normal" as const,
        dependencyIds: ["pred-story"],
        assigneeIds: ["assignment-me"],
      },
      {
        id: "my-waiting-blocked",
        title: "배경 위 선화 정리",
        owner: "나",
        due: "2026-09-19T00:00:00.000Z",
        progress: 0,
        status: "todo" as const,
        role: "lineart" as const,
        priority: "normal" as const,
        dependencyIds: ["pred-blocked"],
        assigneeIds: ["assignment-me"],
      },
      {
        id: "my-today",
        title: "선화 수정 반영",
        owner: "나",
        due: "2026-09-17T00:00:00.000Z",
        progress: 30,
        status: "doing" as const,
        role: "lineart" as const,
        priority: "normal" as const,
        dependencyIds: ["done-pred"],
        assigneeIds: ["assignment-me"],
      },
      {
        id: "my-overdue",
        title: "지난 회차 선화 보정",
        owner: "나",
        due: "2026-09-15T00:00:00.000Z",
        progress: 80,
        status: "doing" as const,
        role: "lineart" as const,
        priority: "normal" as const,
        dependencyIds: [],
        assigneeIds: ["assignment-me"],
      },
      {
        id: "my-later",
        title: "다음 회차 선화",
        owner: "나",
        due: "2026-09-25T00:00:00.000Z",
        progress: 0,
        status: "todo" as const,
        role: "lineart" as const,
        priority: "normal" as const,
        dependencyIds: [],
        assigneeIds: ["assignment-me"],
      },
      {
        id: "unrelated-today",
        title: "대본 초안",
        owner: "글작가",
        due: "2026-09-17T00:00:00.000Z",
        progress: 0,
        status: "todo" as const,
        role: "story" as const,
        priority: "normal" as const,
        dependencyIds: [],
        assigneeIds: [],
      },
    ],
  };
}

describe("role today queue (T-4)", () => {
  it("splits my role work into due-today and waiting, excluding later and unrelated work", () => {
    const queue = buildRoleTodayQueue({
      workspace: workspace(),
      currentUserId: "user-me",
      activeRoles: ["lineart"],
      now: NOW,
    });

    expect(queue.today).toBe("2026-09-17");
    expect(queue.dueToday.map((item) => item.task.id)).toEqual(["my-overdue", "my-today"]);
    expect(queue.waiting.map((item) => item.task.id)).toEqual([
      "my-waiting",
      "my-waiting-blocked",
    ]);
    const all = [...queue.dueToday, ...queue.waiting].map((item) => item.task.id);
    expect(all).not.toContain("my-later");
    expect(all).not.toContain("unrelated-today");
    expect(all).not.toContain("done-pred");
  });

  it("shows the waiting reason for a task held by a delayed predecessor (판정)", () => {
    const queue = buildRoleTodayQueue({
      workspace: workspace(),
      currentUserId: "user-me",
      activeRoles: ["lineart"],
      now: NOW,
    });

    const waiting = queue.waiting.find((item) => item.task.id === "my-waiting");
    expect(waiting?.blockers).toHaveLength(1);
    expect(waiting?.blockers[0]).toMatchObject({
      taskId: "pred-story",
      title: "콘티 확정",
      status: "doing",
      kind: "in-progress",
      overdueDays: 1,
    });
    expect(waiting?.waitingSummary).toContain("콘티 확정");
    expect(waiting?.waitingSummary).toContain("진행 중");
    expect(waiting?.waitingSummary).toContain("마감 1일 지남");
  });

  it("carries the predecessor's own blocked reason into the waiting summary", () => {
    const queue = buildRoleTodayQueue({
      workspace: workspace(),
      currentUserId: "user-me",
      activeRoles: ["lineart"],
      now: NOW,
    });

    const waiting = queue.waiting.find((item) => item.task.id === "my-waiting-blocked");
    expect(waiting?.blockers[0]?.kind).toBe("blocked");
    expect(waiting?.waitingSummary).toContain("외주 소재 승인 대기");
  });

  it("treats a completed predecessor as ready, not waiting", () => {
    const queue = buildRoleTodayQueue({
      workspace: workspace(),
      currentUserId: "user-me",
      activeRoles: ["lineart"],
      now: NOW,
    });

    const today = queue.dueToday.find((item) => item.task.id === "my-today");
    expect(today?.blockers).toEqual([]);
    expect(today?.waitingSummary).toBeNull();
    expect(today?.dueKind).toBe("today");
    const overdue = queue.dueToday.find((item) => item.task.id === "my-overdue");
    expect(overdue?.dueKind).toBe("overdue");
    expect(overdue?.overdueDays).toBe(2);
  });

  it("marks a missing predecessor honestly instead of inventing a reason", () => {
    const source = workspace();
    const queue = buildRoleTodayQueue({
      workspace: {
        ...source,
        tasks: source.tasks.map((task) => task.id === "my-today"
          ? { ...task, dependencyIds: ["ghost-pred"] }
          : task),
      },
      currentUserId: "user-me",
      activeRoles: ["lineart"],
      now: NOW,
    });

    const waiting = queue.waiting.find((item) => item.task.id === "my-today");
    expect(waiting?.blockers[0]?.kind).toBe("missing");
    expect(waiting?.waitingSummary).toContain("찾을 수 없음");
    expect(queue.dueToday.map((item) => item.task.id)).not.toContain("my-today");
  });
});
