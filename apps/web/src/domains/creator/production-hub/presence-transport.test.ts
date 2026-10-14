import { describe, expect, it } from "vitest";

import { derivePageEditLock } from "./page-edit-lock-model";
import {
  applyPresenceSnapshot,
  createPresenceTransport,
  mergeReviewSession,
  parsePresenceSyncSnapshot,
  presenceSyncPath,
  type PresenceSyncSnapshot,
} from "./presence-transport";
import type { ReviewSession } from "./review-session-model";

const T0 = new Date("2026-10-14T00:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const iso = (ms: number) => at(ms).toISOString();

const entry = (actorId: string, mode: "editing" | "viewing", ms: number) => ({
  pageId: "page-1", actorId, displayName: actorId, mode, heartbeatAt: iso(ms),
});

const view = (actorId: string, ms: number) => ({
  actorId, displayName: actorId, pageId: "page-1",
  cursor: { x: 0.5, y: 0.5 }, scrollX: 0, scrollY: 0, zoom: 1,
  updatedAt: iso(ms), interactedAt: iso(ms),
});

const session = (id: string, startedMs: number, decisions: number): ReviewSession => ({
  id, scopeId: "ep-1", hostActorId: "a-1", state: "live",
  startedAt: iso(startedMs), endedAt: null, participants: [],
  decisions: Array.from({ length: decisions }, (_, i) => ({
    id: `d-${i}`, actorId: "a-1", displayName: "A", kind: "note" as const, summary: "s", at: iso(startedMs),
  })),
});

describe("presence-transport — 전송 계약", () => {
  it("경로는 프로젝트를 인코딩해 만든다", () => {
    expect(presenceSyncPath("p 1")).toBe("/production/projects/p%201/presence/sync");
  });

  it("응답 검증: 깨진 항목은 버리고 전체가 깨지면 null", () => {
    const parsed = parsePresenceSyncSnapshot({
      presence: [entry("a-1", "editing", 0), { bad: true }],
      liveViews: [view("a-1", 0), null],
      session: session("s-1", 0, 0),
    });
    expect(parsed?.presence).toHaveLength(1);
    expect(parsed?.liveViews).toHaveLength(1);
    expect(parsed?.session?.id).toBe("s-1");
    expect(parsePresenceSyncSnapshot({ presence: "no" })).toBeNull();
    expect(parsePresenceSyncSnapshot(null)).toBeNull();
  });

  it("두 기기 시나리오: 서버 스냅샷을 각자 로컬 모델로 합치면 잠금 보유자가 하나로 모인다", async () => {
    // 기기 A가 먼저 편집 시작, 기기 B가 나중에 열람으로 합류한 서버 스냅샷.
    const snapshot: PresenceSyncSnapshot = {
      presence: [entry("a-1", "editing", 0), entry("b-1", "viewing", 1000)],
      liveViews: [view("a-1", 1000), view("b-1", 1000)],
      session: session("s-1", 0, 1),
    };
    const poster = async () => snapshot;
    const transport = createPresenceTransport("p-1", poster);
    const received = await transport.sync({
      episodeId: "ep-1", pageId: "page-1",
      presence: [entry("b-1", "viewing", 1000)], liveView: view("b-1", 1000), session: null, leaving: false,
    });
    // B의 로컬(자기 항목만 있던 상태)에 합치면 A가 잠금 보유자로 보인다.
    const merged = applyPresenceSnapshot({
      localPresence: [entry("b-1", "viewing", 1000)],
      localLiveViews: [],
      localSession: null,
      snapshot: received,
      pageId: "page-1",
      now: at(2000),
    });
    expect(derivePageEditLock(merged.presence, "page-1", at(2000)).holder?.actorId).toBe("a-1");
    expect(merged.liveViews.map((v) => v.actorId)).toEqual(["a-1", "b-1"]);
    expect(merged.session?.id).toBe("s-1");
  });

  it("만료된 원격 항목은 로컬 merge에서 정리돼 잠금이 풀린다", () => {
    const merged = applyPresenceSnapshot({
      localPresence: [entry("b-1", "viewing", 95_000)],
      localLiveViews: [],
      localSession: null,
      snapshot: { presence: [entry("a-1", "editing", 0)], liveViews: [], session: null },
      pageId: "page-1",
      now: at(95_000),
    });
    expect(derivePageEditLock(merged.presence, "page-1", at(95_000)).holder).toBeNull();
  });

  it("세션 병합: 먼저 시작된 세션·결정이 많은 쪽·종료가 이긴다", () => {
    expect(mergeReviewSession(session("s-2", 5000, 0), session("s-1", 1000, 0))?.id).toBe("s-1");
    expect(mergeReviewSession(session("s-1", 1000, 1), session("s-1", 1000, 3))?.decisions).toHaveLength(3);
    expect(mergeReviewSession(session("s-1", 1000, 0), null)?.id).toBe("s-1");
    expect(mergeReviewSession(null, session("s-1", 1000, 0))?.id).toBe("s-1");
  });

  it("전송 실패는 throw로 드러나 훅이 로컬 동작을 유지할 수 있다", async () => {
    const transport = createPresenceTransport("p-1", async () => { throw new Error("offline"); });
    await expect(transport.sync({
      episodeId: "ep-1", pageId: "page-1", presence: [], liveView: null, session: null, leaving: false,
    })).rejects.toThrow("offline");
    const badBody = createPresenceTransport("p-1", async () => ({ nope: true }));
    await expect(badBody.sync({
      episodeId: "ep-1", pageId: "page-1", presence: [], liveView: null, session: null, leaving: false,
    })).rejects.toThrow();
  });
});
