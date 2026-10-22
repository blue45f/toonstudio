import { describe, expect, it } from "vitest";

import type { StudioCommentsDocument, StudioCommentThread } from "../studio-comments";
import {
  createEmptyProductionWorkspace,
  parseProductionWorkspace,
  serializeProductionWorkspace,
  type ProductionTask,
} from "../studio-production/studio-production-workspace";
import { MANUSCRIPT_PIN_URGENT_PREFIX } from "./manuscript-pin-feedback-model";
import {
  applyPinTaskSyncToWorkspace,
  buildPinTask,
  collectOpenPinTasks,
  isPinTask,
  pinTaskIdForThread,
  pinTaskSourcesFromDocument,
  summarizePinTasks,
  syncPinTasks,
  threadIdFromPinTaskId,
  type PinTaskSource,
} from "./pin-task-sync-model";

function makeThread(overrides: Partial<StudioCommentThread> = {}): StudioCommentThread {
  return {
    id: "thread-1",
    author: { id: "user-1", displayName: "김작가" },
    body: "이 부분 선이 어색해요",
    mentions: [],
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    anchor: { type: "point", pageId: "page-1", x: 0.25, y: 0.75 },
    replies: [],
    resolved: false,
    ...overrides,
  } as StudioCommentThread;
}

function makeDocument(threads: StudioCommentThread[]): StudioCommentsDocument {
  return { version: 1, threads } as StudioCommentsDocument;
}

function makeSource(overrides: Partial<PinTaskSource> = {}): PinTaskSource {
  return {
    threadId: "thread-1",
    pageId: "page-1",
    pinNumber: 1,
    title: "이 부분 선이 어색해요",
    status: "open",
    assigneeId: null,
    assigneeName: null,
    authorName: "김작가",
    createdAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("pin task identity", () => {
  it("스레드 ID와 핀 할 일 ID를 서로 변환한다", () => {
    expect(pinTaskIdForThread("comment-abc")).toBe("pin-task:comment-abc");
    expect(threadIdFromPinTaskId("pin-task:comment-abc")).toBe("comment-abc");
    expect(threadIdFromPinTaskId("plain-task")).toBeNull();
    expect(threadIdFromPinTaskId("pin-task:")).toBeNull();
    expect(isPinTask({ id: "pin-task:comment-abc" })).toBe(true);
    expect(isPinTask({ id: "task-1" })).toBe(false);
  });
});

describe("pinTaskSourcesFromDocument", () => {
  it("point 앵커 핀만 뽑고 긴급 접두사를 제목에서 제거한다", () => {
    const document = makeDocument([
      makeThread({ id: "thread-1", body: `${MANUSCRIPT_PIN_URGENT_PREFIX}말풍선이 잘려요` }),
      makeThread({
        id: "thread-2",
        body: "페이지 전체 의견",
        anchor: { type: "page", pageId: "page-1" } as StudioCommentThread["anchor"],
      }),
      makeThread({
        id: "thread-3",
        body: "두 번째 페이지 핀",
        anchor: { type: "point", pageId: "page-2", x: 0.1, y: 0.2 },
        createdAt: "2026-09-30T01:00:00.000Z",
      }),
    ]);

    const sources = pinTaskSourcesFromDocument(document);
    expect(sources.map((source) => source.threadId)).toEqual(["thread-1", "thread-3"]);
    expect(sources[0]).toMatchObject({ status: "urgent", title: "말풍선이 잘려요", pinNumber: 1 });
    expect(sources[1]).toMatchObject({ pageId: "page-2", pinNumber: 1 });
  });

  it("해결된 핀과 담당자를 그대로 반영한다", () => {
    const document = makeDocument([
      makeThread({
        resolved: true,
        resolvedAt: "2026-10-01T00:00:00.000Z",
        assignee: { id: "assignment-9", displayName: "이작가" },
      }),
    ]);
    const [source] = pinTaskSourcesFromDocument(document);
    expect(source).toMatchObject({
      status: "resolved",
      assigneeId: "assignment-9",
      assigneeName: "이작가",
    });
  });
});

describe("buildPinTask", () => {
  it("워크스페이스 정규화를 통과하는 값으로 핀 할 일을 만든다", () => {
    const task = buildPinTask(makeSource({ status: "urgent", assigneeId: "a-1", assigneeName: "이작가" }));
    expect(task).toMatchObject({
      id: "pin-task:thread-1",
      title: "핀 1 · 이 부분 선이 어색해요",
      owner: "이작가",
      due: "2026-09-30",
      progress: 0,
      status: "todo",
      stage: "review",
      priority: "urgent",
      assigneeIds: ["a-1"],
    });
  });

  it("이미 해결된 핀은 완료 상태로 등록된다", () => {
    const task = buildPinTask(makeSource({ status: "resolved" }));
    expect(task.status).toBe("done");
    expect(task.progress).toBe(100);
  });

  it("생성 시각을 날짜로 못 읽으면 형식이 맞는 fallback을, 그것도 없으면 기본 날짜를 쓴다", () => {
    expect(buildPinTask(makeSource({ createdAt: "not-a-date" }), { fallbackDue: "2026-10-14" }).due)
      .toBe("2026-10-14");
    expect(buildPinTask(makeSource({ createdAt: "not-a-date" }), { fallbackDue: "어제" }).due)
      .toBe("1970-01-01");
    expect(buildPinTask(makeSource({ createdAt: "not-a-date" })).due).toBe("1970-01-01");
  });
});

describe("syncPinTasks", () => {
  it("핀이 생기면 할 일을 등록하고, 다시 동기화해도 중복되지 않는다", () => {
    const first = syncPinTasks([], [makeSource()]);
    expect(first.addedTaskIds).toEqual(["pin-task:thread-1"]);
    expect(first.tasks).toHaveLength(1);

    const second = syncPinTasks(first.tasks, [makeSource()]);
    expect(second.changed).toBe(false);
    expect(second.tasks).toBe(first.tasks);
  });

  it("핀이 해결되면 자동 완료되고, 다시 열리면 재개된다", () => {
    const created = syncPinTasks([], [makeSource()]);
    const completed = syncPinTasks(created.tasks, [makeSource({ status: "resolved" })]);
    expect(completed.completedTaskIds).toEqual(["pin-task:thread-1"]);
    expect(completed.tasks[0]).toMatchObject({ status: "done", progress: 100 });

    const reopened = syncPinTasks(completed.tasks, [makeSource({ status: "open" })]);
    expect(reopened.reopenedTaskIds).toEqual(["pin-task:thread-1"]);
    expect(reopened.tasks[0]).toMatchObject({ status: "todo", progress: 0 });
  });

  it("진행 중인 핀 할 일은 핀이 열려 있는 동안 상태를 유지하고, 담당·긴급 변경만 따라간다", () => {
    const created = syncPinTasks([], [makeSource()]);
    const doing: ProductionTask = { ...created.tasks[0]!, status: "doing", progress: 40, due: "2026-10-05" };
    const synced = syncPinTasks([doing], [
      makeSource({ status: "urgent", assigneeId: "a-2", assigneeName: "박작가" }),
    ]);
    expect(synced.tasks[0]).toMatchObject({
      status: "doing",
      progress: 40,
      due: "2026-10-05",
      priority: "urgent",
      owner: "박작가",
      assigneeIds: ["a-2"],
    });
  });

  it("핀이 지워지면 시작 전 핀 할 일만 정리하고, 손이 간 할 일과 일반 할 일은 남긴다", () => {
    const pinTask = buildPinTask(makeSource());
    const touchedPinTask: ProductionTask = { ...buildPinTask(makeSource({ threadId: "thread-2" })), status: "doing", progress: 10 };
    const manualTask: ProductionTask = {
      id: "manual-1",
      title: "수동 할 일",
      owner: "김작가",
      due: "2026-10-01",
      progress: 0,
      status: "todo",
    };
    const result = syncPinTasks([pinTask, touchedPinTask, manualTask], []);
    expect(result.removedTaskIds).toEqual(["pin-task:thread-1"]);
    expect(result.tasks.map((task) => task.id)).toEqual(["pin-task:thread-2", "manual-1"]);
  });

  it("담당자 ID 변환 훅을 적용한다", () => {
    const result = syncPinTasks([], [makeSource({ assigneeId: "aggregate-assignment-1" })], {
      resolveAssigneeId: (source) => (source.assigneeId ? `workspace-${source.assigneeId}` : null),
    });
    expect(result.tasks[0]?.assigneeIds).toEqual(["workspace-aggregate-assignment-1"]);
  });
});

describe("applyPinTaskSyncToWorkspace", () => {
  it("동기화된 워크스페이스가 저장·복원 왕복을 통과한다", () => {
    const workspace = createEmptyProductionWorkspace("work:test");
    const document = makeDocument([
      makeThread({ id: "thread-1", body: `${MANUSCRIPT_PIN_URGENT_PREFIX}말풍선이 잘려요` }),
      makeThread({ id: "thread-2", body: "배경 톤 정리", createdAt: "2026-09-30T02:00:00.000Z" }),
    ]);
    const { workspace: synced, result } = applyPinTaskSyncToWorkspace(workspace, document);
    expect(result.addedTaskIds).toHaveLength(2);

    const restored = parseProductionWorkspace(serializeProductionWorkspace(synced), "work:test");
    expect(restored?.tasks.map((task) => task.id)).toEqual(["pin-task:thread-1", "pin-task:thread-2"]);
    expect(restored?.tasks[0]).toMatchObject({ priority: "urgent", due: "2026-09-30", stage: "review" });

    const again = applyPinTaskSyncToWorkspace(restored!, document);
    expect(again.result.changed).toBe(false);
    expect(again.workspace).toBe(restored);
  });

  it("변환 훅 없이 담당 있는 핀을 동기화해도 직렬화가 깨지지 않고, 버린 ID를 결과로 보고한다", () => {
    // 핀 담당자 ID는 검수 aggregate 배정 ID 공간이라, 역할 배정이 없는 워크스페이스에서는
    // 해석할 수 없다. 예전에는 이 ID가 assigneeIds에 그대로 실려 직렬화(참조 검증)에서
    // throw했다. 이제 경계에서 걸러 assigneeIds는 비우고, 버린 ID는 droppedAssigneeIds로
    // 명시한다. 표시용 담당 이름(owner)은 남아 누가 담당이었는지는 사라지지 않는다.
    const workspace = createEmptyProductionWorkspace("work:no-hook");
    const document = makeDocument([
      makeThread({ assignee: { id: "assignment-9", displayName: "이작가" } }),
    ]);
    const { workspace: synced, result } = applyPinTaskSyncToWorkspace(workspace, document);
    expect(result.addedTaskIds).toEqual(["pin-task:thread-1"]);
    expect(result.droppedAssigneeIds).toEqual(["assignment-9"]);
    const task = synced.tasks.find((entry) => entry.id === "pin-task:thread-1");
    expect(task?.assigneeIds).toEqual([]);
    expect(task?.owner).toBe("이작가");

    const restored = parseProductionWorkspace(serializeProductionWorkspace(synced), "work:no-hook");
    expect(restored?.tasks.map((entry) => entry.id)).toEqual(["pin-task:thread-1"]);

    // 재동기화는 멱등하게 유지되고, 버려지는 ID는 매 호출마다 다시 보고된다.
    const again = applyPinTaskSyncToWorkspace(restored!, document);
    expect(again.result.changed).toBe(false);
    expect(again.result.droppedAssigneeIds).toEqual(["assignment-9"]);
  });

  it("훅이 없어도 역할 배정에서 해석되는 담당자 ID(배정 id·memberId)는 그대로 유지한다", () => {
    const workspace = {
      ...createEmptyProductionWorkspace("work:resolvable"),
      roleAssignments: [
        { id: "role-art", memberId: "member-art", displayName: "작화", roles: ["reviewer"] as const, hierarchyNodeId: null },
      ],
    };
    const byAssignmentId = applyPinTaskSyncToWorkspace(workspace, makeDocument([
      makeThread({ id: "thread-1", assignee: { id: "role-art", displayName: "작화" } }),
    ]));
    expect(byAssignmentId.result.droppedAssigneeIds).toEqual([]);
    expect(byAssignmentId.workspace.tasks[0]?.assigneeIds).toEqual(["role-art"]);
    expect(() => serializeProductionWorkspace(byAssignmentId.workspace)).not.toThrow();

    const byMemberId = applyPinTaskSyncToWorkspace(workspace, makeDocument([
      makeThread({ id: "thread-1", assignee: { id: "member-art", displayName: "작화" } }),
    ]));
    expect(byMemberId.result.droppedAssigneeIds).toEqual([]);
    expect(byMemberId.workspace.tasks[0]?.assigneeIds).toEqual(["member-art"]);
    expect(() => serializeProductionWorkspace(byMemberId.workspace)).not.toThrow();
  });

  it("이미 워크스페이스에 들어간 해석 불가능한 핀 담당자 ID도 다음 동기화에서 정리된다", () => {
    const staleTask = buildPinTask(makeSource({ assigneeId: "assignment-9", assigneeName: "이작가" }));
    const workspace = { ...createEmptyProductionWorkspace("work:stale"), tasks: [staleTask] };
    const document = makeDocument([
      makeThread({ assignee: { id: "assignment-9", displayName: "이작가" } }),
    ]);
    const { workspace: synced, result } = applyPinTaskSyncToWorkspace(workspace, document);
    expect(result.changed).toBe(true);
    expect(result.droppedAssigneeIds).toEqual(["assignment-9"]);
    expect(synced.tasks[0]?.assigneeIds).toEqual([]);
    expect(() => serializeProductionWorkspace(synced)).not.toThrow();
  });

  it("변환 훅이 주입된 경우에는 가드를 걸지 않아 훅 결과가 그대로 실린다", () => {
    const workspace = createEmptyProductionWorkspace("work:with-hook");
    const document = makeDocument([
      makeThread({ assignee: { id: "assignment-9", displayName: "이작가" } }),
    ]);
    const { workspace: synced, result } = applyPinTaskSyncToWorkspace(workspace, document, {
      resolveAssigneeId: (source) => (source.assigneeId ? `workspace-${source.assigneeId}` : null),
    });
    expect(result.droppedAssigneeIds).toEqual([]);
    expect(synced.tasks[0]?.assigneeIds).toEqual(["workspace-assignment-9"]);
  });
});

describe("summarizePinTasks / collectOpenPinTasks", () => {
  it("미해결 핀 할 일을 담당자별로 모으고 긴급을 센다", () => {
    const tasks: ProductionTask[] = [
      buildPinTask(makeSource({ threadId: "t-1", status: "urgent", assigneeId: "a-1", assigneeName: "이작가" })),
      buildPinTask(makeSource({ threadId: "t-2", assigneeId: "a-1", assigneeName: "이작가", title: "톤 정리" })),
      buildPinTask(makeSource({ threadId: "t-3", status: "resolved", assigneeId: "a-2", assigneeName: "박작가" })),
      buildPinTask(makeSource({ threadId: "t-4", title: "담당 없는 핀" })),
      { id: "manual-1", title: "수동", owner: "김작가", due: "2026-10-01", progress: 0, status: "todo" },
    ];
    const summary = summarizePinTasks(tasks);
    expect(summary.openCount).toBe(3);
    expect(summary.urgentOpenCount).toBe(1);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.groups.map((group) => group.key)).toEqual(["a-1", "unassigned"]);
    expect(summary.groups[0]?.urgentCount).toBe(1);

    const open = collectOpenPinTasks(tasks);
    expect(open[0]?.id).toBe("pin-task:t-1");
    expect(open.every((task) => task.status !== "done")).toBe(true);
  });
});
