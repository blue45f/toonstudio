import { describe, expect, it } from "vitest";

import {
  acquirePageEditLock,
  canEditPage,
  derivePageEditLock,
  heartbeatPagePresence,
  leavePagePresence,
  mergePagePresence,
  PAGE_PRESENCE_TTL_MS,
  prunePagePresence,
  releasePageEditLock,
  summarizePagePresence,
  type PagePresenceEntry,
} from "./page-edit-lock-model";

const PAGE = "episode-12-page-03";
const NOW = new Date("2026-10-14T00:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function entry(overrides: Partial<PagePresenceEntry> = {}): PagePresenceEntry {
  return {
    pageId: PAGE,
    actorId: "assignment-art",
    displayName: "그림 작가",
    mode: "viewing",
    heartbeatAt: ago(1_000),
    ...overrides,
  };
}

const ART = { pageId: PAGE, actorId: "assignment-art", displayName: "그림 작가" };
const STORY = { pageId: PAGE, actorId: "assignment-story", displayName: "스토리 작가" };

describe("page edit lock", () => {
  it("reports a free page when nobody is present", () => {
    const lock = derivePageEditLock([], PAGE, NOW);
    expect(lock.holder).toBeNull();
    expect(lock.present).toEqual([]);
    expect(canEditPage([], PAGE, ART.actorId, NOW)).toEqual({ allowed: true, reason: "free", holder: null });
  });

  it("gives the lock to the first editor and blocks everyone else", () => {
    const acquired = acquirePageEditLock([entry()], ART, NOW);
    expect(acquired.acquired).toBe(true);
    expect(acquired.holder?.actorId).toBe(ART.actorId);

    const blocked = acquirePageEditLock(acquired.entries, STORY, NOW);
    expect(blocked.acquired).toBe(false);
    expect(blocked.holder?.actorId).toBe(ART.actorId);
    expect(blocked.entries).toEqual(acquired.entries);

    expect(canEditPage(acquired.entries, PAGE, ART.actorId, NOW).reason).toBe("self-holder");
    const decision = canEditPage(acquired.entries, PAGE, STORY.actorId, NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("locked-by-other");
    expect(decision.holder?.displayName).toBe("그림 작가");
  });

  it("frees the lock on release but keeps the editor present as a viewer", () => {
    const acquired = acquirePageEditLock([], ART, NOW);
    const released = releasePageEditLock(acquired.entries, PAGE, ART.actorId, NOW);
    const lock = derivePageEditLock(released, PAGE, NOW);
    expect(lock.holder).toBeNull();
    expect(lock.viewers.map((viewer) => viewer.actorId)).toEqual([ART.actorId]);
    expect(acquirePageEditLock(released, STORY, NOW).acquired).toBe(true);
  });

  it("expires a stale lock after the TTL so a closed browser cannot lock a page forever", () => {
    const stale = entry({ mode: "editing", heartbeatAt: ago(PAGE_PRESENCE_TTL_MS + 1_000) });
    expect(derivePageEditLock([stale], PAGE, NOW).holder).toBeNull();
    expect(prunePagePresence([stale], NOW)).toEqual([]);
    expect(acquirePageEditLock([stale], STORY, NOW).acquired).toBe(true);
  });

  it("resolves a simultaneous-start race to the earliest heartbeat, deterministically", () => {
    const later = entry({ actorId: STORY.actorId, displayName: "스토리 작가", mode: "editing", heartbeatAt: ago(500) });
    const earlier = entry({ mode: "editing", heartbeatAt: ago(2_000) });
    for (const order of [[later, earlier], [earlier, later]]) {
      expect(derivePageEditLock(order, PAGE, NOW).holder?.actorId).toBe(ART.actorId);
      expect(canEditPage(order, PAGE, STORY.actorId, NOW).allowed).toBe(false);
    }
  });

  it("keeps locks page-scoped: an editor on another page does not block this one", () => {
    const otherPage = entry({ pageId: "episode-12-page-04", mode: "editing" });
    expect(derivePageEditLock([otherPage], PAGE, NOW).holder).toBeNull();
    expect(canEditPage([otherPage], PAGE, STORY.actorId, NOW).allowed).toBe(true);
  });
});

describe("page presence", () => {
  it("lists the holder first and everyone else as viewers", () => {
    const entries = [
      entry({ actorId: "assignment-producer", displayName: "프로듀서" }),
      entry({ mode: "editing" }),
      entry({ actorId: STORY.actorId, displayName: "스토리 작가" }),
    ];
    const lock = derivePageEditLock(entries, PAGE, NOW);
    expect(lock.present.map((person) => person.actorId)).toEqual([
      "assignment-art",
      "assignment-producer",
      "assignment-story",
    ]);
    expect(lock.viewers.map((person) => person.actorId)).toEqual(["assignment-producer", "assignment-story"]);
  });

  it("heartbeat refreshes the timestamp and preserves the editing mode", () => {
    const acquired = acquirePageEditLock([], ART, NOW);
    const later = new Date(NOW.getTime() + 60_000);
    const beaten = heartbeatPagePresence(acquired.entries, ART, later);
    const mine = beaten.find((person) => person.actorId === ART.actorId);
    expect(mine?.mode).toBe("editing");
    expect(mine?.heartbeatAt).toBe(later.toISOString());
    expect(derivePageEditLock(beaten, PAGE, later).holder?.actorId).toBe(ART.actorId);
  });

  it("heartbeat does not resurrect an expired editing lock; it rejoins as viewing", () => {
    const stale = entry({ mode: "editing", heartbeatAt: ago(PAGE_PRESENCE_TTL_MS + 1_000) });
    const beaten = heartbeatPagePresence([stale], ART, NOW);
    expect(beaten.find((person) => person.actorId === ART.actorId)?.mode).toBe("viewing");
    expect(derivePageEditLock(beaten, PAGE, NOW).holder).toBeNull();
  });

  it("merge keeps the freshest heartbeat per person and drops stale entries", () => {
    const oldMine = entry({ heartbeatAt: ago(10_000) });
    const freshMine = entry({ heartbeatAt: ago(1_000), mode: "editing" });
    const staleOther = entry({ actorId: STORY.actorId, displayName: "스토리 작가", heartbeatAt: ago(PAGE_PRESENCE_TTL_MS + 5_000) });
    const merged = mergePagePresence([oldMine, staleOther], [freshMine], NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ actorId: ART.actorId, mode: "editing", heartbeatAt: ago(1_000) });
  });

  it("summary spans pages, puts editors first, and drops stale entries", () => {
    const summary = summarizePagePresence([
      entry({ pageId: "episode-12-page-04" }),
      entry({ actorId: STORY.actorId, displayName: "스토리 작가", mode: "editing" }),
      entry({ actorId: "assignment-producer", displayName: "프로듀서", heartbeatAt: ago(PAGE_PRESENCE_TTL_MS + 1_000) }),
      entry({ mode: "editing", heartbeatAt: ago(2_000) }),
    ], NOW);
    expect(summary.map((person) => `${person.pageId}:${person.actorId}:${person.mode}`)).toEqual([
      "episode-12-page-03:assignment-art:editing",
      "episode-12-page-03:assignment-story:editing",
      "episode-12-page-04:assignment-art:viewing",
    ]);
  });

  it("leave removes only that person's entry on that page", () => {
    const entries = [entry(), entry({ actorId: STORY.actorId, displayName: "스토리 작가" })];
    const left = leavePagePresence(entries, PAGE, ART.actorId);
    expect(left.map((person) => person.actorId)).toEqual([STORY.actorId]);
  });
});

describe("프레즌스 위치(공정) 보존", () => {
  it("하트비트는 행위자가 공정을 생략하면 기존 공정을 유지하고, 넘기면 교체한다", () => {
    const started = heartbeatPagePresence([], { ...ART, stageId: "color" }, NOW);
    expect(started[0]?.stageId).toBe("color");
    const kept = heartbeatPagePresence(started, ART, NOW);
    expect(kept[0]?.stageId).toBe("color");
    const changed = heartbeatPagePresence(kept, { ...ART, stageId: "lettering" }, NOW);
    expect(changed[0]?.stageId).toBe("lettering");
    const cleared = heartbeatPagePresence(changed, { ...ART, stageId: null }, NOW);
    expect(cleared[0]?.stageId).toBeNull();
  });

  it("잠금을 잡으면 행위자의 공정이 항목에 실리고, 풀어도 위치는 남는다", () => {
    const acquired = acquirePageEditLock([], { ...ART, stageId: "review" }, NOW);
    expect(acquired.holder?.stageId).toBe("review");
    const released = releasePageEditLock(acquired.entries, PAGE, ART.actorId, NOW);
    expect(released[0]?.mode).toBe("viewing");
    expect(released[0]?.stageId).toBe("review");
  });

  it("공정이 없는 예전 항목도 그대로 동작한다 (잠금 판정에 영향 없음)", () => {
    const legacy = entry();
    expect(legacy.stageId).toBeUndefined();
    const lock = derivePageEditLock([legacy], PAGE, NOW);
    expect(lock.present).toHaveLength(1);
    expect(canEditPage([legacy], PAGE, ART.actorId, NOW).allowed).toBe(true);
  });
});
