/**
 * C2 [P0] 비교 검수·승인 잠금·페이지 잠금 충돌·핀→할 일 — 과제 수준 통합 시나리오 (로컬 검증 전용 추가).
 *
 * 개별 모델 테스트가 이미 있는 항목을 "검수 한 사이클"로 이어서 고정한다:
 *   외부 이미지 비교 세션 구성 → (localStorage 직렬화 왕복) → 비교 핀+원고 핀 긴급
 *   → 승인 게이트 잠금 → 핀 해결 → 잠금 해제, 그리고 페이지 편집 잠금 충돌/만료,
 *   핀→할 일 자동 전환의 등록·완료·재개·멱등까지를 한 흐름으로 검증한다.
 * 승인 잠금 규칙은 회차 룸(ProductionEpisodeReviewRoom)이 실제로 쓰는 합산 규칙
 *   원고 긴급(countOpenUrgentPins) + 비교 긴급(summarizeComparePinGate) > 0 → 잠금
 * 을 모델 수준에서 재현한 것이다. 룸 마운트·서버 동기화는 라이브 잔여로 분리한다.
 */

import { describe, expect, it } from "vitest";

import {
  addStudioCommentThread,
  assignStudioCommentThread,
  createEmptyStudioCommentsDocument,
  reopenStudioCommentThread,
  resolveStudioCommentThread,
  type StudioCommentsDocument,
} from "../studio-comments";
import {
  createEmptyProductionWorkspace,
  parseProductionWorkspace,
  serializeProductionWorkspace,
} from "../studio-production/studio-production-workspace";
import {
  addComparePoolItems,
  applyComparePreset,
  commentsDocumentToComparePins,
  createCompareImageAnchor,
  createEmptyCompareSession,
  parseCompareSession,
  poolItemFromExternal,
  poolItemFromProcessCompareItem,
  serializeCompareSession,
  summarizeComparePinGate,
  type ComparePoolItem,
} from "./compare-review-model";
import { MANUSCRIPT_PIN_URGENT_PREFIX } from "./manuscript-pin-feedback-model";
import {
  acquirePageEditLock,
  canEditPage,
  derivePageEditLock,
  heartbeatPagePresence,
  mergePagePresence,
  releasePageEditLock,
  PAGE_PRESENCE_TTL_MS,
  type PagePresenceEntry,
} from "./page-edit-lock-model";
import {
  applyPinTaskSyncToWorkspace,
  collectOpenPinTasks,
  isPinTask,
  pinTaskSourcesFromDocument,
  summarizePinTasks,
} from "./pin-task-sync-model";
import { countOpenUrgentPins } from "./production-episode-room-model";

const NOW = "2026-10-22T00:00:00.000Z";
const ME = { id: "me", displayName: "나" };
const ARTIST = { id: "artist-1", displayName: "선화 작가" };
const PAGE_ID = "page-1";

function revisionItem(revisionId: string, label: string): ComparePoolItem {
  return poolItemFromProcessCompareItem(
    {
      id: `line::${revisionId}`,
      processId: "line",
      processLabel: label,
      kind: "image",
      revisionId,
      revisionLabel: "v1",
      revisionIndex: 1,
      createdAt: NOW,
      imageUrl: null,
      statusTone: "working",
      source: { kind: "revision", processId: "line", revisionId },
      sourceKind: "revision",
      originNote: null,
    },
    "me",
    NOW,
  );
}

describe("C2 시나리오 — 외부 이미지 비교 → 핀 → 승인 잠금/해제", () => {
  it("외부 시안 비교 세션이 직렬화 왕복을 견디고, 긴급 핀 2종이 합산 잠금을 만들었다가 해결로 풀린다", () => {
    // 1) 세션: 현재 선화 + 외부 시안(클라이언트 제공 이미지)으로 풀을 만든다.
    let session = createEmptyCompareSession("ep-1");
    const current = revisionItem("line-1", "선화");
    const external = poolItemFromExternal({
      assetId: "ext-1",
      label: "시안.png",
      imageUrl: "https://example.com/brief.png",
      addedBy: "me",
      addedAt: NOW,
    });
    session = addComparePoolItems(session, [current, external]);

    // 시안 비교 프리셋: 기준 페인은 현재 원고, 상대 페인은 외부 시안.
    const preset = applyComparePreset(session, "external-brief");
    expect(preset.ok).toBe(true);
    if (!preset.ok) return;
    session = preset.session;
    expect(session.panes).toHaveLength(2);
    expect(session.panes[1]?.kind).toBe("external");

    // 2) CompareReviewRoom이 localStorage(`toonstudio.compare-review.<episodeId>`)에
    //    쓰는 것과 같은 직렬화 왕복 — 기기가 바뀌지 않는 한 세션이 복원된다.
    const restored = parseCompareSession(serializeCompareSession(session), "ep-1");
    expect(restored).toEqual(session);
    expect(parseCompareSession(serializeCompareSession(session), "ep-other").pool).toHaveLength(0);

    // 3) 핀: 비교 이미지 위 긴급 핀 1개 + 원고 페이지 위 긴급 핀 1개.
    let doc: StudioCommentsDocument = createEmptyStudioCommentsDocument();
    doc = addStudioCommentThread(doc, {
      id: "cmp-urgent",
      anchor: createCompareImageAnchor(current.id, { x: 0.4, y: 0.5 }, external.id),
      author: ME,
      body: `${MANUSCRIPT_PIN_URGENT_PREFIX}선이 시안과 다릅니다.`,
    }, new Date("2026-10-22T01:00:00.000Z"));
    doc = assignStudioCommentThread(doc, "cmp-urgent", ARTIST, new Date("2026-10-22T01:05:00.000Z"));
    doc = addStudioCommentThread(doc, {
      id: "page-urgent",
      anchor: { type: "point", pageId: PAGE_ID, x: 0.25, y: 0.75 },
      author: ME,
      body: `${MANUSCRIPT_PIN_URGENT_PREFIX}말풍선이 잘려요`,
    }, new Date("2026-10-22T01:10:00.000Z"));

    const pins = commentsDocumentToComparePins(doc, session.pool);
    expect(pins).toHaveLength(1);
    expect(pins[0]?.pairedLabel).toBe("시안.png");

    // 4) 승인 잠금 (회차 룸 합산 규칙 재현): 원고 긴급 + 비교 긴급 > 0이면 잠금.
    const approvalLocked = (document: StudioCommentsDocument): boolean =>
      countOpenUrgentPins(document, PAGE_ID) + summarizeComparePinGate(document, session.pool).urgentOpenCount > 0;
    expect(countOpenUrgentPins(doc, PAGE_ID)).toBe(1);
    expect(summarizeComparePinGate(doc, session.pool).urgentOpenCount).toBe(1);
    expect(approvalLocked(doc)).toBe(true);

    // 비교 핀만 해결하면 원고 핀이 남아 여전히 잠겨 있다.
    doc = resolveStudioCommentThread(doc, "cmp-urgent", ARTIST, new Date("2026-10-22T02:00:00.000Z"));
    expect(summarizeComparePinGate(doc, session.pool).urgentOpenCount).toBe(0);
    expect(approvalLocked(doc)).toBe(true);

    // 원고 핀까지 해결하면 잠금이 풀린다.
    doc = resolveStudioCommentThread(doc, "page-urgent", ARTIST, new Date("2026-10-22T02:10:00.000Z"));
    expect(approvalLocked(doc)).toBe(false);
  });
});

describe("C2 시나리오 — 페이지 편집 잠금 충돌과 만료 인수", () => {
  it("두 편집자가 같은 페이지를 동시에 잡으면 한 명만 성공하고, 하트비트 중단 후 TTL이 지나면 인계된다", () => {
    const t0 = new Date("2026-10-22T03:00:00.000Z");
    const actorA = { pageId: PAGE_ID, actorId: "user-a", displayName: "A작가" };
    const actorB = { pageId: PAGE_ID, actorId: "user-b", displayName: "B작가" };

    // A가 먼저 잠금을 잡는다.
    const first = acquirePageEditLock([], actorA, t0);
    expect(first.acquired).toBe(true);
    let entries: readonly PagePresenceEntry[] = first.entries;

    // B의 동시 시도는 실패하고, 사유는 locked-by-other이며 잠금은 빼앗기지 않는다.
    const clash = acquirePageEditLock(entries, actorB, new Date(t0.getTime() + 1_000));
    expect(clash.acquired).toBe(false);
    expect(clash.holder?.actorId).toBe("user-a");
    const decisionB = canEditPage(entries, PAGE_ID, "user-b", new Date(t0.getTime() + 1_000));
    expect(decisionB).toMatchObject({ allowed: false, reason: "locked-by-other" });
    expect(canEditPage(entries, PAGE_ID, "user-a", t0).reason).toBe("self-holder");

    // 잠금은 페이지 단위다 — B는 다른 페이지를 편집할 수 있다.
    const otherPage = acquirePageEditLock(entries, { ...actorB, pageId: "page-2" }, t0);
    expect(otherPage.acquired).toBe(true);
    entries = otherPage.entries;

    // A가 하트비트를 이어 가면 TTL 안에서는 B가 여전히 못 들어온다.
    entries = heartbeatPagePresence(entries, actorA, new Date(t0.getTime() + 60_000));
    const stillLocked = acquirePageEditLock(entries, actorB, new Date(t0.getTime() + 61_000));
    expect(stillLocked.acquired).toBe(false);

    // A가 사라져 하트비트가 TTL을 넘기면 잠금이 만료로 풀려 B가 인계받는다.
    const afterExpiry = new Date(t0.getTime() + 60_000 + PAGE_PRESENCE_TTL_MS + 1_000);
    const takeover = acquirePageEditLock(entries, actorB, afterExpiry);
    expect(takeover.acquired).toBe(true);
    expect(derivePageEditLock(takeover.entries, PAGE_ID, afterExpiry).holder?.actorId).toBe("user-b");

    // B가 풀면 잠금은 비고 B는 "보는 중"으로 남는다.
    const released = releasePageEditLock(takeover.entries, PAGE_ID, "user-b", afterExpiry);
    const lock = derivePageEditLock(released, PAGE_ID, afterExpiry);
    expect(lock.holder).toBeNull();
    expect(lock.present.some((entry) => entry.actorId === "user-b" && entry.mode === "viewing")).toBe(true);

    // 두 탭이 각자 가진 프레즌스 목록을 합치면 사람별 최신 하트비트만 남고,
    // 만료된 A의 항목은 정리된다.
    const merged = mergePagePresence(entries, takeover.entries, afterExpiry);
    expect(merged.filter((entry) => entry.actorId === "user-a")).toHaveLength(0);
    const bOnPage = merged.filter((entry) => entry.actorId === "user-b" && entry.pageId === PAGE_ID);
    expect(bOnPage).toHaveLength(1);
    expect(bOnPage[0]?.heartbeatAt).toBe(afterExpiry.toISOString());
    expect(bOnPage[0]?.mode).toBe("editing");
  });
});

describe("C2 시나리오 — 핀 → 할 일 자동 전환 왕복", () => {
  it("긴급 핀이 할 일로 등록되고(멱등), 해결하면 완료·재열면 재개되며, 비교 핀은 할 일이 되지 않는다", () => {
    let doc: StudioCommentsDocument = createEmptyStudioCommentsDocument();
    doc = addStudioCommentThread(doc, {
      id: "pin-thread-1",
      anchor: { type: "point", pageId: PAGE_ID, x: 0.25, y: 0.75 },
      author: ME,
      body: `${MANUSCRIPT_PIN_URGENT_PREFIX}말풍선이 잘려요`,
    }, new Date("2026-10-22T01:10:00.000Z"));
    doc = assignStudioCommentThread(doc, "pin-thread-1", ARTIST, new Date("2026-10-22T01:15:00.000Z"));
    // 비교 핀은 point 앵커가 아니라 핀 할 일 소스에서 제외돼야 한다.
    doc = addStudioCommentThread(doc, {
      id: "cmp-thread-1",
      anchor: createCompareImageAnchor("pool-x", { x: 0.1, y: 0.2 }),
      author: ME,
      body: "비교 메모",
    }, new Date("2026-10-22T01:20:00.000Z"));
    expect(pinTaskSourcesFromDocument(doc).map((source) => source.threadId)).toEqual(["pin-thread-1"]);

    // 등록: 긴급 → priority urgent · stage review · 담당자 승계.
    // 담당자 변환은 호스트 계약이다: 핀 담당자(검수 배정 ID)를 워크스페이스 역할 배정 ID로
    // 바꾸는 훅을 실호스트(use-pin-task-workspace-sync)가 주입하며, 대응 배정이 없으면
    // null을 돌려준다. 이 시나리오의 빈 워크스페이스에는 역할 배정이 없어 null로 둔다.
    const syncContext = { episodeId: "ep-1", resolveAssigneeId: () => null } as const;
    const workspace = createEmptyProductionWorkspace("work:scenario");
    const first = applyPinTaskSyncToWorkspace(workspace, doc, syncContext);
    expect(first.result.addedTaskIds).toEqual(["pin-task:pin-thread-1"]);
    const task = first.workspace.tasks.find((entry) => entry.id === "pin-task:pin-thread-1");
    expect(task).toMatchObject({ status: "todo", priority: "urgent", stage: "review", progress: 0 });
    expect(task?.title).toContain("말풍선이 잘려요");
    expect(task?.title).not.toContain("[긴급]");
    // 대응 역할 배정이 없으면 ID 매칭은 비지만 표시용 담당 이름은 남는다(호스트 훅 주석 계약).
    expect(task?.assigneeIds).toEqual([]);
    expect(task?.owner).toBe("선화 작가");
    expect(isPinTask(task!)).toBe(true);
    expect(collectOpenPinTasks(first.workspace.tasks)).toHaveLength(1);
    expect(summarizePinTasks(first.workspace.tasks).urgentOpenCount).toBe(1);

    // 멱등: 같은 문서로 다시 동기화해도 중복 등록·변경이 없다.
    const again = applyPinTaskSyncToWorkspace(first.workspace, doc, syncContext);
    expect(again.result.changed).toBe(false);
    expect(again.workspace.tasks.filter((entry) => isPinTask(entry))).toHaveLength(1);

    // 저장 왕복: 직렬화→복원 후에도 핀 할 일이 그대로 남는다.
    const restored = parseProductionWorkspace(serializeProductionWorkspace(first.workspace), "work:scenario");
    expect(restored?.tasks.map((entry) => entry.id)).toContain("pin-task:pin-thread-1");

    // 해결 → 자동 완료.
    doc = resolveStudioCommentThread(doc, "pin-thread-1", ARTIST, new Date("2026-10-22T02:00:00.000Z"));
    const completed = applyPinTaskSyncToWorkspace(first.workspace, doc, syncContext);
    expect(completed.result.completedTaskIds).toEqual(["pin-task:pin-thread-1"]);
    expect(completed.workspace.tasks.find((entry) => entry.id === "pin-task:pin-thread-1"))
      .toMatchObject({ status: "done", progress: 100 });
    expect(collectOpenPinTasks(completed.workspace.tasks)).toHaveLength(0);

    // 재열기 → 재개.
    doc = reopenStudioCommentThread(doc, "pin-thread-1", new Date("2026-10-22T03:00:00.000Z"));
    const reopened = applyPinTaskSyncToWorkspace(completed.workspace, doc, syncContext);
    expect(reopened.result.reopenedTaskIds).toEqual(["pin-task:pin-thread-1"]);
    expect(reopened.workspace.tasks.find((entry) => entry.id === "pin-task:pin-thread-1")?.status).toBe("todo");
  });

  it("계약 주의(현행 동작 고정): 담당자 변환 훅 없이 동기화하면 워크스페이스 직렬화가 거부하는 담당자 ID가 들어간다", () => {
    // 실호스트는 resolveAssigneeId를 항상 주입하므로 운영 경로는 안전하다. 다만 모델 단독
    // 호출(훅 누락)에서는 핀 담당자 ID가 그대로 assigneeIds에 실리고, 그 워크스페이스는
    // serializeProductionWorkspace의 참조 검증(assigneeIds ⊆ 역할 배정)을 통과하지 못해
    // 저장 단계에서 throw한다 — 이 현행 동작을 사실로서 고정해 둔다.
    let doc: StudioCommentsDocument = createEmptyStudioCommentsDocument();
    doc = addStudioCommentThread(doc, {
      id: "pin-thread-x",
      anchor: { type: "point", pageId: PAGE_ID, x: 0.5, y: 0.5 },
      author: ME,
      body: "담당 지정 핀",
    }, new Date("2026-10-22T01:00:00.000Z"));
    doc = assignStudioCommentThread(doc, "pin-thread-x", ARTIST, new Date("2026-10-22T01:05:00.000Z"));

    const workspace = createEmptyProductionWorkspace("work:hazard");
    const synced = applyPinTaskSyncToWorkspace(workspace, doc, { episodeId: "ep-1" });
    const task = synced.workspace.tasks.find((entry) => entry.id === "pin-task:pin-thread-x");
    expect(task?.assigneeIds).toEqual(["artist-1"]);
    expect(() => serializeProductionWorkspace(synced.workspace)).toThrow();
  });
});
