import { describe, expect, it } from "vitest";

import type { StudioStoryBible } from "../studio-story-bible";
import {
  buildFactConcordance,
  factCheckRejectionReason,
  factTermsFromBible,
  factTermsFromLore,
  parseFactConcordanceSideData,
  proposeManuscriptFix,
  recordFactCheck,
  reviseLoreEntryWithHistory,
  type PublishedFactEpisode,
} from "./studio-fact-concordance";
import {
  emptyWorldLore,
  upsertLoreEntry,
  withLoreEntryDefaults,
  type StudioWorldLore,
} from "./studio-world-lore";

const bible: StudioStoryBible = {
  projectId: "p1",
  characters: [
    { id: "c1", name: "서연", aliases: ["연이"], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "c2", name: "도현", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [{ id: "l1", name: "북문 시장" }],
  facts: [{ id: "f1", label: "은인장 반지", characterIds: ["c1"], locationId: null }],
};

function loreWith(): StudioWorldLore {
  let lore = emptyWorldLore("p1");
  lore = upsertLoreEntry(
    lore,
    withLoreEntryDefaults({
      id: "lore-place-1", kind: "place", name: "침수 도서관", aliases: [],
      summary: "물에 잠긴 도서관", details: "", eraLabel: "", timelineOrder: null,
      relatedEntryIds: [], characterIds: [], origin: "authored",
      status: "confirmed",
    }),
  );
  lore = upsertLoreEntry(
    lore,
    withLoreEntryDefaults({
      id: "lore-rule-1", kind: "rule", name: "거울 금기", aliases: [],
      summary: "자정 뒤 거울을 보지 않는다", details: "", eraLabel: "", timelineOrder: null,
      relatedEntryIds: [], characterIds: [], origin: "authored",
      status: "speculative",
    }),
  );
  lore = upsertLoreEntry(
    lore,
    withLoreEntryDefaults({
      id: "lore-place-2", kind: "place", name: "옛 성벽", aliases: [],
      summary: "격리된 옛 설정", details: "", eraLabel: "", timelineOrder: null,
      relatedEntryIds: [], characterIds: [], origin: "authored",
      status: "quarantined",
    }),
  );
  return lore;
}

const episodes: readonly PublishedFactEpisode[] = [
  {
    id: "ep2", label: "2화", order: 2, authorId: "author-a",
    segments: [
      { id: "s3", kind: "narration", speakerId: null, text: "서연은 「유리 탑」의 전설을 떠올렸다." },
    ],
  },
  {
    id: "ep1", label: "1화", order: 1, authorId: "author-a",
    segments: [
      { id: "s1", kind: "narration", speakerId: null, text: "연이는 북문 시장을 지나 침수 도서관 앞에 섰다." },
      { id: "s2", kind: "dialogue", speakerId: "c1", text: "은인장 반지를 잃어버리면 안 돼." },
    ],
  },
];

function build() {
  return buildFactConcordance(episodes, [
    ...factTermsFromBible(bible),
    ...factTermsFromLore(loreWith()),
  ]);
}

describe("fact concordance reverse extraction", () => {
  it("matches registered names and aliases in published text", () => {
    const concordance = build();
    const seoyeon = concordance.entries.find((entry) => entry.key === "c1");
    expect(seoyeon?.classification).toBe("used");
    expect(seoyeon?.mentions.map((mention) => mention.surface)).toContain("연이");
    expect(seoyeon?.firstEpisodeId).toBe("ep1");
    const library = concordance.entries.find((entry) => entry.key === "lore-place-1");
    expect(library?.classification).toBe("used");
    expect(library?.loreStatus).toBe("confirmed");
    expect(library?.loreVersion).toBe(1);
  });

  it("separates never-defined candidates from defined-but-forgotten terms", () => {
    const concordance = build();
    const candidate = concordance.entries.find((entry) => entry.classification === "unregistered");
    expect(candidate?.displayName).toBe("유리 탑");
    expect(candidate?.termId).toBeNull();
    const forgotten = concordance.entries
      .filter((entry) => entry.classification === "forgotten")
      .map((entry) => entry.displayName);
    expect(forgotten).toContain("도현");
    expect(forgotten).toContain("거울 금기");
    expect(concordance.digest.unregisteredNames).toEqual(["유리 탑"]);
  });

  it("does not count quarantined lore as registered", () => {
    const names = factTermsFromLore(loreWith()).map((term) => term.name);
    expect(names).not.toContain("옛 성벽");
    expect(names).toContain("침수 도서관");
  });

  it("does not invent candidates from unquoted unknown words", () => {
    const concordance = buildFactConcordance(
      [{
        id: "ep9", label: "9화", order: 9, authorId: "author-a",
        segments: [{ id: "s1", kind: "narration", speakerId: null, text: "낯선 유리 탑이 보였다." }],
      }],
      factTermsFromBible(bible),
    );
    expect(concordance.entries.some((entry) => entry.classification === "unregistered")).toBe(false);
  });

  it("rejects self-check by the episode author and accepts a third checker", () => {
    const concordance = build();
    expect(factCheckRejectionReason(concordance, episodes, "c1", "author-a")).toContain("스스로");
    expect(factCheckRejectionReason(concordance, episodes, "c1", "editor-b")).toBeNull();
    const rejected = recordFactCheck([], concordance, episodes, {
      id: "chk1", entryKey: "c1", checkerId: "author-a", verdict: "ok", note: "", checkedAt: "2026-10-14",
    });
    expect(rejected.error).not.toBeNull();
    expect(rejected.records).toHaveLength(0);
    const accepted = recordFactCheck([], concordance, episodes, {
      id: "chk2", entryKey: "c1", checkerId: "editor-b", verdict: "mismatch", note: "별칭 표기 확인", checkedAt: "2026-10-14",
    });
    expect(accepted.error).toBeNull();
    expect(accepted.records).toHaveLength(1);
  });

  it("fixes target the manuscript only; lore targeting is rejected", () => {
    const ok = proposeManuscriptFix([], {
      id: "fix1", entryKey: "c1", episodeId: "ep1", segmentId: "s1",
      before: "연이는", after: "서연은", reason: "본명 표기 통일", actorId: "editor-b", at: "2026-10-14",
    });
    expect(ok.error).toBeNull();
    expect(ok.records[0]?.target).toBe("manuscript");
    const bad = proposeManuscriptFix([], {
      id: "fix2", entryKey: "c1", episodeId: "ep1", segmentId: "s1",
      before: "x", after: "y", reason: "", actorId: "editor-b", at: "2026-10-14",
      target: "lore",
    });
    expect(bad.error).toContain("원고 쪽");
    expect(bad.records).toHaveLength(0);
  });

  it("lore revision bumps the version and appends field-level history", () => {
    const lore = loreWith();
    const result = reviseLoreEntryWithHistory(lore, [], {
      entryId: "lore-rule-1",
      summary: "자정 뒤 거울을 보면 그림자가 먼저 웃는다",
      reason: "3화 원고와 맞추기 위해",
      actorId: "author-a",
      at: "2026-10-14",
      idPrefix: "rev1",
    });
    expect(result.error).toBeNull();
    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0]).toMatchObject({
      field: "summary", beforeVersion: 1, afterVersion: 2,
      before: "자정 뒤 거울을 보지 않는다",
    });
    expect(result.lore.entries.find((entry) => entry.id === "lore-rule-1")?.version).toBe(2);
    const noop = reviseLoreEntryWithHistory(result.lore, result.history, {
      entryId: "lore-rule-1", summary: "자정 뒤 거울을 보면 그림자가 먼저 웃는다",
      reason: "같은 내용", actorId: "author-a", at: "2026-10-14", idPrefix: "rev2",
    });
    expect(noop.error).not.toBeNull();
    expect(noop.history).toHaveLength(1);
  });

  it("round-trips side data and drops broken records", () => {
    const parsed = parseFactConcordanceSideData(JSON.stringify({
      checks: [
        { id: "c", entryKey: "c1", checkerId: "editor-b", verdict: "ok", note: "", checkedAt: "2026-10-14" },
        { id: "bad", entryKey: "c1", checkerId: "editor-b", verdict: "maybe", note: "", checkedAt: "2026-10-14" },
      ],
      fixes: [{
        id: "f", entryKey: "c1", episodeId: "ep1", segmentId: "s1",
        before: "연이는", after: "서연은", reason: "", actorId: "editor-b", at: "2026-10-14",
      }],
      loreRevisions: [{
        id: "r", entryId: "lore-rule-1", entryName: "거울 금기", field: "summary",
        before: "a", after: "b", beforeVersion: 1, afterVersion: 2,
        reason: "", actorId: "author-a", at: "2026-10-14",
      }],
    }));
    expect(parsed.checks).toHaveLength(1);
    expect(parsed.fixes[0]?.target).toBe("manuscript");
    expect(parsed.loreRevisions).toHaveLength(1);
    expect(parseFactConcordanceSideData("{broken").checks).toHaveLength(0);
  });
});
