import { describe, expect, it } from "vitest";

import {
  emptyWorldLore,
  upsertLoreEntry,
  type StudioLoreEntry,
} from "./studio-world-lore";
import {
  evaluateLoreClaim,
  findLoreClaimHolder,
  stakeLoreClaim,
} from "./studio-lore-consistency-gate";

function entry(partial: Partial<StudioLoreEntry> & { id: string }): StudioLoreEntry {
  return {
    kind: "place",
    name: partial.id,
    aliases: [],
    summary: "",
    details: "",
    eraLabel: "",
    timelineOrder: null,
    relatedEntryIds: [],
    characterIds: [],
    origin: "authored",
    status: "confirmed",
    version: 1,
    appliesToWorkIds: [],
    appliesToSeasonLabels: [],
    ...partial,
  };
}

function loreWith(...entries: StudioLoreEntry[]) {
  let lore = emptyWorldLore("project-1");
  for (const item of entries) lore = upsertLoreEntry(lore, item);
  return lore;
}

describe("lore consistency gate — status verdict branches", () => {
  it("blocks a claim that collides with a confirmed entry, by name or alias", () => {
    const lore = loreWith(
      entry({ id: "a", name: "침수된 옛 도서관", aliases: ["옛 도서관"], version: 3 }),
    );
    const byName = evaluateLoreClaim(lore, { kind: "place", name: "침수된 옛 도서관" });
    expect(byName.verdict).toBe("block");
    expect(byName.blocked).toBe(true);
    expect(byName.reasons[0]?.code).toBe("confirmed-conflict");
    expect(byName.reasons[0]?.entryVersion).toBe(3);
    const byAlias = evaluateLoreClaim(lore, { kind: "place", name: "옛 도서관" });
    expect(byAlias.blocked).toBe(true);
  });

  it("passes with a nudge over speculative entries and intentional gaps", () => {
    const lore = loreWith(
      entry({ id: "s", name: "물에 닿은 기억", status: "speculative" }),
      entry({ id: "g", name: "잠긴 층", status: "intentional-gap" }),
    );
    const spec = evaluateLoreClaim(lore, { kind: "rule", name: "물에 닿은 기억" });
    expect(spec.verdict).toBe("pass-with-nudge");
    expect(spec.reasons[0]?.code).toBe("speculative-overlap");
    const gap = evaluateLoreClaim(lore, { kind: "place", name: "잠긴 층" });
    expect(gap.verdict).toBe("pass-with-nudge");
    expect(gap.reasons[0]?.code).toBe("gap-fill");
  });

  it("passes a brand-new name with a register-first nudge", () => {
    const result = evaluateLoreClaim(emptyWorldLore("p"), { kind: "place", name: "새 항구" });
    expect(result.verdict).toBe("pass-with-nudge");
    expect(result.reasons[0]?.code).toBe("unregistered-name");
  });

  it("passes retired (deprecated/quarantined) name reuse without a nudge", () => {
    const lore = loreWith(
      entry({ id: "old", name: "옛 길드", status: "quarantined" }),
      entry({ id: "old2", name: "옛 규칙", status: "deprecated" }),
    );
    const result = evaluateLoreClaim(lore, { kind: "faction", name: "옛 길드" });
    expect(result.verdict).toBe("pass");
    expect(result.reasons[0]?.code).toBe("retired-name-reuse");
  });

  it("does not block when scopes are disjoint, blocks when they overlap", () => {
    const lore = loreWith(
      entry({ id: "s1", name: "계절 문", appliesToSeasonLabels: ["시즌 1"] }),
    );
    const disjoint = evaluateLoreClaim(lore, {
      kind: "place",
      name: "계절 문",
      appliesToSeasonLabels: ["시즌 2"],
    });
    expect(disjoint.blocked).toBe(false);
    const overlapping = evaluateLoreClaim(lore, {
      kind: "place",
      name: "계절 문",
      appliesToSeasonLabels: ["시즌 1", "시즌 2"],
    });
    expect(overlapping.blocked).toBe(true);
    // 범위를 생략한 제안은 전 범위로 보아 보수적으로 차단한다.
    const unspecified = evaluateLoreClaim(lore, { kind: "place", name: "계절 문" });
    expect(unspecified.blocked).toBe(true);
  });

  it("excludes the edited entry itself from its own verdict", () => {
    const lore = loreWith(entry({ id: "a", name: "서고" }));
    const result = evaluateLoreClaim(lore, { entryId: "a", kind: "place", name: "서고" });
    expect(result.blocked).toBe(false);
  });
});

describe("stake-a-claim registration", () => {
  it("saves nothing when the gate blocks", () => {
    const lore = loreWith(entry({ id: "a", name: "서고" }));
    const result = stakeLoreClaim(lore, { kind: "place", name: "서고" });
    expect(result.ok).toBe(false);
    expect(result.entry).toBeNull();
    expect(result.lore).toBe(lore);
  });

  it("pre-registers a new setting as speculative and becomes its claim holder", () => {
    const empty = emptyWorldLore("project-1");
    const result = stakeLoreClaim(empty, {
      kind: "faction",
      name: "등불지기 길드",
      summary: "책을 건지는 조직",
    });
    expect(result.ok).toBe(true);
    expect(result.entry?.status).toBe("speculative");
    expect(result.entry?.version).toBe(1);
    expect(findLoreClaimHolder(result.lore, "등불지기 길드")?.id).toBe(result.entry?.id);
    // 선등록 이후 같은 이름의 확정 충돌은 게이트가 막는다 — 선점 노출 확인.
    const promoted = upsertLoreEntry(
      result.lore,
      { ...result.entry!, status: "confirmed" },
    );
    expect(evaluateLoreClaim(promoted, { kind: "faction", name: "등불지기 길드" }).blocked).toBe(true);
  });

  it("registers as confirmed only when explicitly asked", () => {
    const result = stakeLoreClaim(emptyWorldLore("p"), {
      kind: "rule",
      name: "절대 규칙",
      status: "confirmed",
    });
    expect(result.entry?.status).toBe("confirmed");
  });

  it("a quarantined holder does not count as a claim holder", () => {
    const lore = loreWith(entry({ id: "old", name: "전설", status: "quarantined" }));
    expect(findLoreClaimHolder(lore, "전설")).toBeNull();
  });
});
