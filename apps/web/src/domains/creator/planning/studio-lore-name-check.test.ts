import { describe, expect, it } from "vitest";

import type { StudioStoryBible } from "../studio-story-bible";
import { createWorldLoreExamples, emptyWorldLore, upsertLoreEntry, type StudioLoreEntry } from "./studio-world-lore";
import {
  buildLoreNameDictionary,
  checkLoreNames,
  loreDictionarySurfaces,
  summarizeLoreNameCheck,
} from "./studio-lore-name-check";

const BIBLE: StudioStoryBible = {
  projectId: "project-1",
  characters: [
    { id: "char-1", name: "아르카디아", aliases: ["카디아"], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "char-2", name: "모아", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [{ id: "loc-1", name: "침수된 옛 도서관" }],
  facts: [],
};

function dictionary() {
  return buildLoreNameDictionary(BIBLE, createWorldLoreExamples("project-1"));
}

describe("buildLoreNameDictionary", () => {
  it("merges characters, locations and lore entries with aliases", () => {
    const dict = dictionary();
    const kinds = dict.map((entry) => entry.sourceKind);
    expect(kinds).toContain("character");
    expect(kinds).toContain("location");
    expect(kinds).toContain("lore");
    const surfaces = loreDictionarySurfaces(dict);
    expect(surfaces.has("아르카디아")).toBe(true);
    expect(surfaces.has("카디아")).toBe(true);
    expect(surfaces.has("침수된 옛 도서관")).toBe(true);
    expect(surfaces.has("등불지기 길드")).toBe(true);
  });

  it("is empty without sources", () => {
    expect(buildLoreNameDictionary(null, null)).toEqual([]);
    expect(checkLoreNames("아무 글이나", [])).toEqual([]);
  });
});

describe("checkLoreNames", () => {
  it("flags a one-syllable-off variant and suggests the canonical with its particle", () => {
    const findings = checkLoreNames("아르카디야에서 모아가 나타났다.", dictionary());
    const variant = findings.find((finding) => finding.code === "name-variant");
    expect(variant).toBeDefined();
    expect(variant?.found).toBe("아르카디야에서");
    expect(variant?.suggestion).toBe("아르카디아에서");
    expect(variant?.sourceId).toBe("char-1");
  });

  it("does not flag exact canonical or alias-only usage", () => {
    expect(checkLoreNames("아르카디아는 카디아라고도 불린다.", dictionary())
      .filter((finding) => finding.code === "name-variant")).toEqual([]);
    // 별칭만 쓴 글은 혼용이 아니다.
    expect(checkLoreNames("카디아가 문을 열었다.", dictionary())
      .filter((finding) => finding.code === "name-alias-mix")).toEqual([]);
  });

  it("flags canonical+alias mixing in one text", () => {
    const findings = checkLoreNames(
      "아르카디아는 떠났다. 카디아는 돌아오지 않았다.",
      dictionary(),
    );
    const mix = findings.filter((finding) => finding.code === "name-alias-mix");
    expect(mix).toHaveLength(1);
    expect(mix[0]?.found).toBe("카디아");
    expect(mix[0]?.suggestion).toBe("아르카디아");
  });

  it("does not treat an alias inside the canonical surface as mixing", () => {
    // 정본 "침수된 옛 도서관" 안에 별칭 "옛 도서관"이 포함돼 있어도 별칭 사용이 아니다.
    const findings = checkLoreNames("침수된 옛 도서관에 갔다.", dictionary());
    expect(findings.filter((finding) => finding.code === "name-alias-mix")).toEqual([]);
  });

  it("suggests repeated unknown stems as unregistered candidates, once each", () => {
    const text = "젤라토가 나타났다. 젤라토는 웃었다. 바람이 불었다.";
    const findings = checkLoreNames(text, dictionary());
    const unregistered = findings.filter((finding) => finding.code === "unregistered-name");
    expect(unregistered).toHaveLength(1);
    expect(unregistered[0]?.found).toBe("젤라토");
    expect(unregistered[0]?.suggestion).toBeNull();
  });

  it("respects disabled codes and summary counts", () => {
    const text = "아르카디야에서 젤라토가 젤라토를 봤다.";
    const all = checkLoreNames(text, dictionary());
    const summary = summarizeLoreNameCheck(all);
    expect(summary.findingCount).toBe(all.length);
    expect(summary.variantCount).toBe(1);
    const withoutVariants = checkLoreNames(text, dictionary(), { disabledCodes: ["name-variant"] });
    expect(withoutVariants.some((finding) => finding.code === "name-variant")).toBe(false);
  });

  it("does not flag common words or two-letter names as variants", () => {
    const findings = checkLoreNames("모두가 갑자기 조용히 사라졌다.", dictionary());
    expect(findings.filter((finding) => finding.code === "name-variant")).toEqual([]);
  });

  it("keeps lore entries built from the hub usable as dictionary sources", () => {
    let lore = emptyWorldLore("project-1");
    const entry: StudioLoreEntry = {
      id: "lore-place-1", kind: "place", name: "성좌의 탑", aliases: ["별의 탑"],
      summary: "", details: "", eraLabel: "", timelineOrder: null,
      relatedEntryIds: [], characterIds: [], origin: "authored",
      status: "confirmed", version: 1, appliesToWorkIds: [], appliesToSeasonLabels: [],
    };
    lore = upsertLoreEntry(lore, entry);
    const dict = buildLoreNameDictionary(null, lore);
    const findings = checkLoreNames("성좌의 탑에서 별의 탑이 보였다.", dict);
    expect(findings.some((finding) => finding.code === "name-alias-mix")).toBe(true);
  });
});
