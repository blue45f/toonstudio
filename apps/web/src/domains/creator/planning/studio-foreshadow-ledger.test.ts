import { describe, expect, it } from "vitest";

import {
  changeForeshadowStatus,
  createForeshadowSeed,
  deriveEpisodeForeshadowLinks,
  deriveForeshadowDigest,
  deriveForeshadowOverdueNotice,
  ensureStudioForeshadowLedger,
  parseStudioForeshadowLedger,
  saveStudioForeshadowSeed,
  saveStudioForeshadowStatus,
  suggestForeshadowMentions,
  type ForeshadowSeed,
} from "./studio-foreshadow-ledger";

const NOW = "2026-10-14T00:00:00.000Z";
const ORDER = ["ep-1", "ep-2", "ep-3", "ep-4", "ep-5"];

function seed(overrides: Partial<ForeshadowSeed> = {}): ForeshadowSeed {
  return {
    id: "seed-1",
    projectId: "project-1",
    title: "숨긴 편지",
    note: "",
    plantedIn: { episodeId: "ep-1" },
    status: "planted",
    linkedFactIds: [],
    linkedCharacterIds: [],
    visibility: "author",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

describe("deriveForeshadowDigest", () => {
  it("marks a seed overdue only after its payoff window has passed", () => {
    const target = seed({
      expectedPayoff: { fromEpisodeId: "ep-2", toEpisodeId: "ep-3" },
    });
    const digestAt = (currentEpisodeId: string) => deriveForeshadowDigest({
      seeds: [target],
      episodeOrder: ORDER,
      currentEpisodeId,
    });
    expect(digestAt("ep-2").dueSoon.map((s) => s.id)).toEqual(["seed-1"]);
    expect(digestAt("ep-3").overdue).toEqual([]);
    expect(digestAt("ep-4").overdue.map((s) => s.id)).toEqual(["seed-1"]);
    expect(digestAt("ep-4").dueSoon).toEqual([]);
  });

  it("never judges seeds whose window or current episode is unknown", () => {
    const target = seed({
      expectedPayoff: { fromEpisodeId: "ep-2", toEpisodeId: "ep-9" },
    });
    const digest = deriveForeshadowDigest({
      seeds: [target],
      episodeOrder: ORDER,
      currentEpisodeId: "ep-5",
    });
    expect(digest.overdue).toEqual([]);
    expect(digest.dueSoon).toEqual([]);
    const unknownCurrent = deriveForeshadowDigest({
      seeds: [seed({ expectedPayoff: { fromEpisodeId: "ep-1", toEpisodeId: "ep-2" } })],
      episodeOrder: ORDER,
      currentEpisodeId: "ep-unknown",
    });
    expect(unknownCurrent.overdue).toEqual([]);
  });

  it("treats an open-ended window as due but never overdue, and no window as long-running", () => {
    const open = seed({
      id: "open",
      expectedPayoff: { fromEpisodeId: "ep-2", toEpisodeId: null },
    });
    const long = seed({ id: "long" });
    const digest = deriveForeshadowDigest({
      seeds: [open, long],
      episodeOrder: ORDER,
      currentEpisodeId: "ep-5",
    });
    expect(digest.dueSoon.map((s) => s.id)).toEqual(["open"]);
    expect(digest.overdue).toEqual([]);
    expect(digest.longRunning.map((s) => s.id)).toEqual(["long"]);
  });

  it("excludes paid-off and dropped seeds from every derived bucket but keeps counts", () => {
    const paid = seed({
      id: "paid",
      status: "paidOff",
      expectedPayoff: { fromEpisodeId: "ep-1", toEpisodeId: "ep-2" },
    });
    const dropped = seed({ id: "dropped", status: "dropped" });
    const digest = deriveForeshadowDigest({
      seeds: [paid, dropped],
      episodeOrder: ORDER,
      currentEpisodeId: "ep-5",
    });
    expect(digest.overdue).toEqual([]);
    expect(digest.longRunning).toEqual([]);
    expect(digest.counts).toEqual({ planted: 0, growing: 0, paidOff: 1, dropped: 1 });
  });

  it("derives the overview notice only when something is overdue", () => {
    const overdueDigest = deriveForeshadowDigest({
      seeds: [seed({ expectedPayoff: { fromEpisodeId: "ep-1", toEpisodeId: "ep-2" } })],
      episodeOrder: ORDER,
      currentEpisodeId: "ep-3",
    });
    expect(deriveForeshadowOverdueNotice(overdueDigest)).toEqual({
      overdueCount: 1,
      firstTitle: "숨긴 편지",
    });
    const calmDigest = deriveForeshadowDigest({
      seeds: [seed()],
      episodeOrder: ORDER,
      currentEpisodeId: "ep-3",
    });
    expect(deriveForeshadowOverdueNotice(calmDigest)).toBeNull();
  });
});

describe("episode links and mention suggestions", () => {
  it("links a seed to both its planted episode and its payoff window episodes", () => {
    const target = seed({
      expectedPayoff: { fromEpisodeId: "ep-3", toEpisodeId: "ep-4" },
    });
    expect(deriveEpisodeForeshadowLinks([target], "ep-1", ORDER).plantedHere)
      .toEqual([target]);
    expect(deriveEpisodeForeshadowLinks([target], "ep-4", ORDER).payoffPlannedHere)
      .toEqual([target]);
    expect(deriveEpisodeForeshadowLinks([target], "ep-5", ORDER).payoffPlannedHere)
      .toEqual([]);
  });

  it("suggests mentions quietly without touching paid-off seeds or the planting episode", () => {
    const active = seed();
    const paid = seed({ id: "paid", status: "paidOff", title: "낡은 검" });
    const text = "주인공이 숨긴 편지를 꺼낸다. 낡은 검도 보인다.";
    expect(suggestForeshadowMentions([active, paid], "ep-3", text)).toEqual([active]);
    expect(suggestForeshadowMentions([active], "ep-1", text)).toEqual([]);
  });
});

describe("manual status changes only", () => {
  it("changes status through changeForeshadowStatus and nothing else", () => {
    const created = createForeshadowSeed({
      id: "seed-9",
      projectId: "project-1",
      title: "  숨긴 편지  ",
      plantedIn: { episodeId: "ep-1" },
      now: NOW,
    });
    expect(created.status).toBe("planted");
    expect(created.title).toBe("숨긴 편지");
    const changed = changeForeshadowStatus([created], "seed-9", "paidOff", NOW);
    expect(changed[0]?.status).toBe("paidOff");
    // 도출은 상태를 바꾸지 않는다 — 경과 판정 뒤에도 원본은 그대로다.
    deriveForeshadowDigest({
      seeds: [created],
      episodeOrder: ORDER,
      currentEpisodeId: "ep-5",
    });
    expect(created.status).toBe("planted");
  });
});

describe("ledger store", () => {
  it("round-trips seeds and status changes through storage", () => {
    const storage = memoryStorage();
    const initial = ensureStudioForeshadowLedger(storage, "project-1");
    expect(initial.seeds).toEqual([]);
    const created = createForeshadowSeed({
      id: "seed-1",
      projectId: "project-1",
      title: "숨긴 편지",
      plantedIn: { episodeId: "ep-1" },
      expectedPayoff: { fromEpisodeId: "ep-2", toEpisodeId: "ep-3" },
      now: NOW,
    });
    saveStudioForeshadowSeed(storage, "project-1", created);
    const afterStatus = saveStudioForeshadowStatus(
      storage,
      "project-1",
      "seed-1",
      "growing",
      undefined,
      NOW,
    );
    expect(afterStatus.seeds[0]?.status).toBe("growing");
    expect(ensureStudioForeshadowLedger(storage, "project-1").seeds).toHaveLength(1);
    expect(ensureStudioForeshadowLedger(storage, "project-2").seeds).toEqual([]);
  });

  it("rejects malformed snapshots and seeds from another project", () => {
    expect(parseStudioForeshadowLedger({ schemaVersion: 1, projectId: "p", seeds: [{}] })).toBeNull();
    expect(parseStudioForeshadowLedger(null)).toBeNull();
    const storage = memoryStorage();
    expect(() => saveStudioForeshadowSeed(storage, "project-1", seed({ projectId: "other" })))
      .toThrow();
  });
});
