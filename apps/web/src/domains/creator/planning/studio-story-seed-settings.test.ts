import { describe, expect, it } from "vitest";

import type { StudioStoryBible } from "../studio-story-bible";

import type { StudioStoryCharacterProfile } from "./studio-character-profile";
import {
  buildStorySeedSettingRefs,
  resolveStorySeedReferencedSettings,
} from "./studio-story-seed-settings";
import type { StudioWorldLore } from "./studio-world-lore";

const bible = {
  projectId: "p1",
  characters: [
    { id: "char-1", name: "서연", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "char-2", name: "민준", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [{ id: "loc-1", name: "연남동 카페 거리" }],
  facts: [],
} as unknown as StudioStoryBible;

const profiles: readonly StudioStoryCharacterProfile[] = [
  {
    characterId: "char-1",
    personality: "겁이 많지만 책임감 하나로 버틴다",
    speechStyle: "",
    background: "인용에 끌어오지 않는 배경",
    motivation: "",
    signatureLines: [],
    appearanceNotes: "",
  },
];

const lore = {
  projectId: "p1",
  entries: [
    {
      id: "lore-place-1", kind: "place", name: "침수된 옛 도서관", aliases: [],
      summary: "간조 때만 드러나는 서고", details: "", eraLabel: "",
      timelineOrder: null, relatedEntryIds: [], characterIds: [], origin: "authored",
    },
    {
      id: "lore-faction-1", kind: "faction", name: "등불지기 길드", aliases: [],
      summary: "책을 건져 올리는 잠수부 조직", details: "", eraLabel: "",
      timelineOrder: null, relatedEntryIds: [], characterIds: [], origin: "authored",
    },
    {
      id: "lore-rule-1", kind: "rule", name: "물에 닿은 기억은 사라진다", aliases: [],
      summary: "", details: "", eraLabel: "",
      timelineOrder: null, relatedEntryIds: [], characterIds: [], origin: "authored",
    },
  ],
} as unknown as StudioWorldLore;

describe("buildStorySeedSettingRefs", () => {
  it("바이블 캐릭터·장소 + 허브 항목 전 종류를 한 목록으로 공급한다", () => {
    const refs = buildStorySeedSettingRefs({ bible, profiles, lore });
    expect(refs.map((ref) => ref.id)).toEqual([
      "char-1",
      "char-2",
      "loc-1",
      "lore-place-1",
      "lore-faction-1",
      "lore-rule-1",
    ]);
  });

  it("캐릭터 시트의 특징이 detail 로 붙고, 시트 없는 캐릭터와 구분된다", () => {
    const refs = buildStorySeedSettingRefs({ bible, profiles, lore });
    const withSheet = refs.find((ref) => ref.id === "char-1")!;
    expect(withSheet.detail).toBe("겁이 많지만 책임감 하나로 버틴다");
    expect(withSheet.sourceLabel).toBe("캐릭터 시트");
    const withoutSheet = refs.find((ref) => ref.id === "char-2")!;
    expect(withoutSheet.detail).toBeUndefined();
    // 배경 서사는 인용 detail 로 끌어오지 않는다 (인계 카드와 같은 규칙).
    expect(refs.every((ref) => ref.detail !== "인용에 끌어오지 않는 배경")).toBe(true);
  });

  it("허브 place 항목은 무대 슬롯용 location 으로, 나머지는 lore 로 온다", () => {
    const refs = buildStorySeedSettingRefs({ bible: null, lore });
    expect(refs.find((ref) => ref.id === "lore-place-1")?.kind).toBe("location");
    expect(refs.find((ref) => ref.id === "lore-faction-1")?.kind).toBe("lore");
    expect(refs.find((ref) => ref.id === "lore-faction-1")?.detail).toBe(
      "책을 건져 올리는 잠수부 조직",
    );
    expect(refs.find((ref) => ref.id === "lore-rule-1")?.sourceLabel).toBe(
      "세계관 허브 · 규칙·법칙",
    );
  });

  it("소스가 없어도 안전하게 빈 목록·부분 목록을 돌려준다", () => {
    expect(buildStorySeedSettingRefs({ bible: null })).toEqual([]);
    expect(buildStorySeedSettingRefs({ bible, lore: null })).toHaveLength(3);
  });

  it("같은 id 는 먼저 온 소스만 남기고, 이름 빈 항목은 뺀다", () => {
    const dupLore = {
      projectId: "p1",
      entries: [
        {
          id: "loc-1", kind: "place", name: "다른 이름의 장소", aliases: [],
          summary: "", details: "", eraLabel: "", timelineOrder: null,
          relatedEntryIds: [], characterIds: [], origin: "authored",
        },
        {
          id: "lore-x", kind: "rule", name: "  ", aliases: [],
          summary: "", details: "", eraLabel: "", timelineOrder: null,
          relatedEntryIds: [], characterIds: [], origin: "authored",
        },
      ],
    } as unknown as StudioWorldLore;
    const refs = buildStorySeedSettingRefs({ bible, lore: dupLore });
    expect(refs.filter((ref) => ref.id === "loc-1")).toHaveLength(1);
    expect(refs.find((ref) => ref.id === "loc-1")?.name).toBe("연남동 카페 거리");
    expect(refs.some((ref) => ref.id === "lore-x")).toBe(false);
  });
});

describe("resolveStorySeedReferencedSettings", () => {
  it("referencedSettingIds 순서대로 이름 있는 항목으로 되돌린다", () => {
    const refs = buildStorySeedSettingRefs({ bible, profiles, lore });
    const resolved = resolveStorySeedReferencedSettings(refs, [
      "lore-rule-1",
      "char-1",
      "lore-rule-1",
    ]);
    expect(resolved.map((ref) => ref.id)).toEqual(["lore-rule-1", "char-1"]);
    expect(resolved[1]?.name).toBe("서연");
  });

  it("목록에서 사라진 id 도 이름 없이 남겨 출처가 조용히 지워지지 않는다", () => {
    const resolved = resolveStorySeedReferencedSettings([], ["gone-1"]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.id).toBe("gone-1");
    expect(resolved[0]?.name).toBe("");
  });
});
