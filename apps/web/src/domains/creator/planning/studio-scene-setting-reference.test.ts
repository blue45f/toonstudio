import { describe, expect, it } from "vitest";

import type { StudioStoryBible } from "../studio-story-bible";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import {
  SCENE_SETTING_REFERENCE_ENTRY_LIMIT,
  deriveSceneSettingReference,
  sceneReferenceInputFromBeats,
  type SceneSettingReferenceInput,
} from "./studio-scene-setting-reference";
import type { StudioLoreEntry, StudioWorldLore } from "./studio-world-lore";

function loreEntry(partial: Partial<StudioLoreEntry> & { id: string }): StudioLoreEntry {
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
    ...partial,
    status: partial.status ?? "confirmed",
    version: partial.version ?? 1,
    appliesToWorkIds: partial.appliesToWorkIds ?? [],
    appliesToSeasonLabels: partial.appliesToSeasonLabels ?? [],
  };
}

const BIBLE: StudioStoryBible = {
  projectId: "project-1",
  characters: [
    { id: "char-1", name: "모아", aliases: ["물지킴이"], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "char-2", name: "하준", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [
    { id: "loc-1", name: "침수된 옛 도서관" },
    { id: "loc-2", name: "항구" },
  ],
  facts: [
    { id: "fact-1", label: "도서관에서는 장갑이 필수다", characterIds: [], locationId: "loc-1" },
    { id: "fact-2", label: "모아는 수영을 못한다", characterIds: ["char-1"], locationId: null },
    { id: "fact-3", label: "항구 시장은 밤에만 열린다", characterIds: [], locationId: "loc-2" },
  ],
};

const LORE: StudioWorldLore = {
  projectId: "project-1",
  entries: [
    loreEntry({
      id: "lore-place-1",
      kind: "place",
      name: "침수된 옛 도서관",
      aliases: ["옛 도서관"],
      relatedEntryIds: ["lore-rule-1"],
    }),
    loreEntry({
      id: "lore-rule-1",
      kind: "rule",
      name: "물에 닿은 기억은 사라진다",
      relatedEntryIds: ["lore-place-1"],
    }),
    loreEntry({
      id: "lore-faction-1",
      kind: "faction",
      name: "등불지기 길드",
      characterIds: ["char-1"],
      relatedEntryIds: ["lore-artifact-1"],
    }),
    loreEntry({
      id: "lore-artifact-1",
      kind: "artifact",
      name: "꺼지지 않는 등불",
    }),
    loreEntry({
      id: "lore-species-1",
      kind: "species",
      name: "심해인",
      summary: "물속에서 기억을 태워 버티는 사람들",
    }),
  ],
};

const SCENE: SceneSettingReferenceInput = {
  sceneId: "scene-1",
  locationId: "loc-1",
  characterIds: ["char-1"],
  texts: ["심해인 잠수부가 등불을 든다"],
};

describe("deriveSceneSettingReference", () => {
  it("resolves the scene location and its lore place entry first", () => {
    const ref = deriveSceneSettingReference(SCENE, BIBLE, LORE);
    expect(ref.location?.name).toBe("침수된 옛 도서관");
    expect(ref.locationEntry?.id).toBe("lore-place-1");
    expect(ref.entries[0]?.entry.id).toBe("lore-place-1");
    expect(ref.entries[0]?.reasons).toContain("scene-location");
    expect(ref.entries[0]?.direct).toBe(true);
    expect(ref.isEmpty).toBe(false);
  });

  it("links entries through scene characters and expands one related hop", () => {
    const ref = deriveSceneSettingReference(SCENE, BIBLE, LORE);
    const byId = new Map(ref.entries.map((item) => [item.entry.id, item]));
    expect(byId.get("lore-faction-1")?.reasons).toContain("scene-character");
    expect(byId.get("lore-faction-1")?.direct).toBe(true);
    // 장소 항목의 연결(규칙)과 세력 항목의 연결(아이템)은 1단계 확장으로 온다.
    expect(byId.get("lore-rule-1")?.direct).toBe(false);
    expect(byId.get("lore-rule-1")?.reasons).toEqual(["related-entry"]);
    expect(byId.get("lore-artifact-1")?.direct).toBe(false);
    expect(ref.characters).toHaveLength(1);
    expect(ref.characters[0]?.linkedEntryCount).toBe(1);
  });

  it("matches entries mentioned by name or alias in scene text", () => {
    const ref = deriveSceneSettingReference(SCENE, BIBLE, LORE);
    const species = ref.entries.find((item) => item.entry.id === "lore-species-1");
    expect(species?.direct).toBe(true);
    expect(species?.reasons).toContain("mentioned-in-scene");
  });

  it("collects bible facts touching the scene location or its characters only", () => {
    const ref = deriveSceneSettingReference(SCENE, BIBLE, LORE);
    expect(ref.facts.map((fact) => fact.id)).toEqual(["fact-1", "fact-2"]);
  });

  it("surfaces unknown character and location ids instead of dropping them", () => {
    const ref = deriveSceneSettingReference(
      { sceneId: "scene-x", locationId: "loc-gone", characterIds: ["char-gone"] },
      BIBLE,
      LORE,
    );
    expect(ref.location).toBeNull();
    expect(ref.unknownLocationId).toBe("loc-gone");
    expect(ref.unknownCharacterIds).toEqual(["char-gone"]);
    expect(ref.isEmpty).toBe(false);
  });

  it("reports empty when the scene has no meta and nothing matches", () => {
    const ref = deriveSceneSettingReference(
      { sceneId: "scene-blank", locationId: null, characterIds: [], texts: [] },
      BIBLE,
      LORE,
    );
    expect(ref.isEmpty).toBe(true);
    expect(ref.entries).toEqual([]);
    expect(ref.facts).toEqual([]);
  });

  it("caps entries at the limit and reports the truncated count", () => {
    const many: StudioWorldLore = {
      projectId: "project-1",
      entries: Array.from({ length: SCENE_SETTING_REFERENCE_ENTRY_LIMIT + 5 }, (_, i) =>
        loreEntry({ id: `lore-x-${i}`, kind: "rule", name: `규칙 ${i}`, characterIds: ["char-1"] }),
      ),
    };
    const ref = deriveSceneSettingReference(SCENE, BIBLE, many);
    expect(ref.entries).toHaveLength(SCENE_SETTING_REFERENCE_ENTRY_LIMIT);
    expect(ref.truncatedEntryCount).toBe(5);
  });

  it("ignores dangling related ids without inventing entries", () => {
    const lore: StudioWorldLore = {
      projectId: "project-1",
      entries: [
        loreEntry({ id: "lore-a", kind: "rule", name: "규칙 A", characterIds: ["char-1"], relatedEntryIds: ["lore-missing"] }),
      ],
    };
    const ref = deriveSceneSettingReference(SCENE, BIBLE, lore);
    expect(ref.entries.map((item) => item.entry.id)).toEqual(["lore-a"]);
  });
});

describe("sceneReferenceInputFromBeats", () => {
  const beat = (partial: Partial<StudioStoryBeat> & { id: string }): StudioStoryBeat => ({
    sceneId: "scene-1",
    order: 0,
    kind: "dialogue",
    summary: "",
    dialogue: "",
    characterIds: [],
    locationId: null,
    ...partial,
  });

  it("merges one scene's beats: character union, first location, texts", () => {
    const input = sceneReferenceInputFromBeats([
      beat({ id: "b1", order: 0, characterIds: ["char-1"], summary: "도서관에 들어선다" }),
      beat({ id: "b2", order: 1, characterIds: ["char-1", "char-2"], locationId: "loc-1", dialogue: "조심해" }),
      beat({ id: "b3", order: 2, sceneId: "scene-2", characterIds: ["char-2"], locationId: "loc-2" }),
    ]);
    expect(input?.sceneId).toBe("scene-1");
    expect(input?.characterIds).toEqual(["char-1", "char-2"]);
    expect(input?.locationId).toBe("loc-1");
    expect(input?.texts).toEqual(["도서관에 들어선다", "조심해"]);
  });

  it("returns null for no beats", () => {
    expect(sceneReferenceInputFromBeats([])).toBeNull();
  });
});
