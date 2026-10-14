import { describe, expect, it } from "vitest";

import {
  buildPublicWiki,
  emptyWikiSettings,
  isWikiEntryPublic,
  setWikiEntryRevealEpisode,
  setWikiEntryVisibility,
  setWikiSpoilerBoundary,
  validateWikiSettings,
  wikiSourcesFromProductionBible,
  type StudioWikiSettings,
  type StudioWikiSourceEntry,
} from "./studio-world-wiki";
import {
  ensureStudioWorldWikiSettings,
  parseStudioWorldWikiSettings,
  readStudioWorldWikiSettings,
  writeStudioWorldWikiSettings,
  type StudioWorldWikiStorage,
} from "./studio-world-wiki-store";

function source(
  partial: Partial<StudioWikiSourceEntry> & { id: string },
): StudioWikiSourceEntry {
  return {
    kind: "location",
    name: partial.id,
    aliases: [],
    summary: "",
    details: "",
    relatedIds: [],
    ...partial,
  };
}

function memoryStorage(): StudioWorldWikiStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

const SOURCES: readonly StudioWikiSourceEntry[] = [
  source({
    id: "loc-harbor",
    name: "새벽항",
    summary: "1화부터 나오는 항구 도시",
    relatedIds: ["prop-seal", "loc-sunken"],
  }),
  source({
    id: "prop-seal",
    kind: "prop",
    name: "왕의 인장",
    details: "12화에서 진짜 주인이 밝혀진다",
    relatedIds: ["loc-harbor"],
  }),
  source({
    id: "loc-sunken",
    name: "침수 지구",
    aliases: ["물밑 마을"],
    details: "30화에 처음 등장하는 스포일러 지역",
  }),
  source({ id: "char-secret", kind: "character", name: "비밀 캐릭터" }),
];

function settingsAt(boundary: number): StudioWikiSettings {
  let settings = emptyWikiSettings("work-1");
  settings = setWikiSpoilerBoundary(settings, boundary);
  settings = setWikiEntryVisibility(settings, "loc-harbor", "public");
  settings = setWikiEntryRevealEpisode(settings, "loc-harbor", 1);
  settings = setWikiEntryVisibility(settings, "prop-seal", "public");
  settings = setWikiEntryRevealEpisode(settings, "prop-seal", 12);
  settings = setWikiEntryVisibility(settings, "loc-sunken", "public");
  settings = setWikiEntryRevealEpisode(settings, "loc-sunken", 30);
  // char-secret 은 일부러 설정을 만들지 않는다 — 기본 비공개여야 한다.
  return settings;
}

describe("세계관 위키 공개 경계", () => {
  it("경계 회차 이후 설정은 공개 뷰 어디에도 나타나지 않는다 (이름·별칭·상세·링크)", () => {
    const wiki = buildPublicWiki(SOURCES, settingsAt(10));
    expect(wiki.entries.map((entry) => entry.id)).toEqual(["loc-harbor"]);
    const serialized = JSON.stringify(wiki);
    // 12화·30화 설정과 미설정 캐릭터의 어떤 문자열도 새지 않는다.
    expect(serialized).not.toContain("왕의 인장");
    expect(serialized).not.toContain("진짜 주인");
    expect(serialized).not.toContain("침수 지구");
    expect(serialized).not.toContain("물밑 마을");
    expect(serialized).not.toContain("비밀 캐릭터");
    // 공개 항목의 관련 링크에서도 경계 뒤 항목이 걷어진다.
    expect(wiki.entries[0]?.related).toEqual([]);
    expect(wiki.spoilerHiddenCount).toBe(2);
    expect(wiki.unconfiguredHiddenCount).toBe(1);
  });

  it("경계를 올리면 그 회차 설정이 링크와 함께 나타난다", () => {
    const wiki = buildPublicWiki(SOURCES, settingsAt(12));
    const ids = wiki.entries.map((entry) => entry.id);
    expect(ids).toContain("prop-seal");
    expect(ids).not.toContain("loc-sunken");
    const harbor = wiki.entries.find((entry) => entry.id === "loc-harbor");
    expect(harbor?.related.map((target) => target.id)).toEqual(["prop-seal"]);
    expect(JSON.stringify(wiki)).not.toContain("침수 지구");
  });

  it("공개 판정은 경계와 같으면 공개, 크면 숨김이다", () => {
    const setting = { sourceId: "x", visibility: "public" as const, revealEpisode: 5 };
    expect(isWikiEntryPublic(setting, 5)).toBe(true);
    expect(isWikiEntryPublic(setting, 4)).toBe(false);
    expect(isWikiEntryPublic(undefined, 99)).toBe(false);
    expect(
      isWikiEntryPublic({ sourceId: "x", visibility: "private", revealEpisode: 1 }, 99),
    ).toBe(false);
    // 회차 무관(null) 항목은 경계 0에서도 공개 지정만으로 나간다.
    expect(
      isWikiEntryPublic({ sourceId: "x", visibility: "public", revealEpisode: null }, 0),
    ).toBe(true);
  });

  it("비공개 지정은 경계와 무관하게 숨긴다", () => {
    let settings = settingsAt(99);
    settings = setWikiEntryVisibility(settings, "loc-harbor", "private");
    const wiki = buildPublicWiki(SOURCES, settings);
    expect(wiki.entries.map((entry) => entry.id)).not.toContain("loc-harbor");
    expect(wiki.privateHiddenCount).toBe(1);
  });

  it("검증: 경계·회차·중복·없는 원본을 잡는다", () => {
    const bad: StudioWikiSettings = {
      projectId: "work-1",
      spoilerThroughEpisode: -1,
      entries: [
        { sourceId: "loc-harbor", visibility: "public", revealEpisode: 0 },
        { sourceId: "loc-harbor", visibility: "public", revealEpisode: 2 },
        { sourceId: "ghost", visibility: "public", revealEpisode: null },
      ],
    };
    const codes = validateWikiSettings(bad, SOURCES).map((issue) => issue.code);
    expect(codes).toContain("boundary-invalid");
    expect(codes).toContain("reveal-invalid");
    expect(codes).toContain("setting-duplicate");
    expect(codes).toContain("setting-unknown-source");
    expect(validateWikiSettings(settingsAt(3), SOURCES)).toEqual([]);
  });

  it("프로덕션 바이블 어댑터: 설명 첫 문장이 요약, 연결이 관련 링크가 된다", () => {
    const sources = wikiSourcesFromProductionBible({
      version: 1,
      entries: [
        {
          id: "loc-1",
          kind: "location",
          name: "본진",
          aliases: ["기지"],
          description: "언덕 위의 본진이다. 밤에는 등대가 켜진다.",
          visualKeywords: [],
          colors: [],
          timeOfDay: "",
          linkedCharacterIds: [],
          linkedLocationIds: [],
          linkedPropIds: ["prop-1"],
          referenceAssetIds: [],
        },
        {
          id: "prop-1",
          kind: "prop",
          name: "등대 열쇠",
          aliases: [],
          description: "",
          visualKeywords: [],
          colors: [],
          timeOfDay: "",
          linkedCharacterIds: [],
          linkedLocationIds: ["loc-1"],
          linkedPropIds: [],
          referenceAssetIds: [],
        },
      ],
    });
    expect(sources[0]?.summary).toBe("언덕 위의 본진이다.");
    expect(sources[0]?.relatedIds).toEqual(["prop-1"]);
    expect(sources[1]?.kind).toBe("prop");
  });

  it("스토어: 왕복·타 프로젝트 거부·깨진 값 null", () => {
    const storage = memoryStorage();
    const written = writeStudioWorldWikiSettings(storage, settingsAt(7));
    expect(written.spoilerThroughEpisode).toBe(7);
    const read = readStudioWorldWikiSettings(storage, "work-1");
    expect(read?.entries.length).toBe(3);
    expect(readStudioWorldWikiSettings(storage, "other")).toBeNull();
    expect(parseStudioWorldWikiSettings({ schemaVersion: 2 }, "work-1")).toBeNull();
    expect(
      parseStudioWorldWikiSettings(
        {
          schemaVersion: 1,
          projectId: "work-1",
          spoilerThroughEpisode: 3,
          entries: [{ sourceId: "a", visibility: "maybe", revealEpisode: null }],
        },
        "work-1",
      ),
    ).toBeNull();
    const ensured = ensureStudioWorldWikiSettings(storage, "fresh");
    expect(ensured.entries).toEqual([]);
    expect(ensured.spoilerThroughEpisode).toBe(0);
  });
});
