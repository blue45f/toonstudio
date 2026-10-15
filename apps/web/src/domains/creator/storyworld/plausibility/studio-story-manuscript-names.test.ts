import { describe, expect, it } from "vitest";

import { emptyWorldLore, upsertLoreEntry, withLoreEntryDefaults, type StudioLoreEntryDraft } from "../../planning/studio-world-lore";
import { writeStudioWorldLore } from "../../planning/studio-world-lore-store";
import {
  writeStudioProjectDiagnosticSource,
  type StudioProjectDiagnosticSourceStorage,
} from "../../studio-project-diagnostic-source-store";
import {
  EMPTY_MANUSCRIPT_NAME_SOURCES,
  MANUSCRIPT_NAME_SOURCE_LIMITS,
  loadManuscriptNameSources,
} from "./studio-story-manuscript-names";
import { buildManuscriptRegister } from "./studio-story-manuscript-project";
import { extractManuscript } from "./studio-story-manuscript-extractor";
import { bibleCharacter, diagnosticSourceWithBible } from "./studio-story-plausibility-hub.test-support";

function memoryStorage(): StudioProjectDiagnosticSourceStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

function loreDraft(id: string, kind: StudioLoreEntryDraft["kind"], name: string, extra: Partial<StudioLoreEntryDraft> = {}): StudioLoreEntryDraft {
  return {
    id, kind, name, aliases: [], summary: "", details: "", eraLabel: "", timelineOrder: null,
    relatedEntryIds: [], characterIds: [], origin: "authored", ...extra,
  };
}

function storeLore(storage: StudioProjectDiagnosticSourceStorage, drafts: readonly StudioLoreEntryDraft[]): void {
  let lore = emptyWorldLore("work-1");
  for (const draft of drafts) lore = upsertLoreEntry(lore, withLoreEntryDefaults(draft));
  writeStudioWorldLore(storage, lore);
}

describe("원고에서 찾을 등록 이름 읽기", () => {
  it("작품 id나 저장소가 없으면 아무것도 읽지 않는다", () => {
    expect(loadManuscriptNameSources({ workId: null, storage: memoryStorage() })).toEqual({ sources: EMPTY_MANUSCRIPT_NAME_SOURCES, notices: [] });
    expect(loadManuscriptNameSources({ workId: "  ", storage: memoryStorage() }).sources).toEqual({});
    expect(loadManuscriptNameSources({ workId: "work-1", storage: null }).sources).toEqual({});
  });

  it("등록된 것이 없는 작품은 빈 목록을 돌려주고 알릴 것이 없다", () => {
    const loaded = loadManuscriptNameSources({ workId: "work-1", storage: memoryStorage() });
    expect(loaded.sources).toEqual({ bibleCharacters: [], bibleLocations: [], loreLocations: [] });
    expect(loaded.notices).toEqual([]);
  });

  it("스토리 바이블의 인물(별칭 포함)과 장소를 그대로 읽는다", () => {
    const storage = memoryStorage();
    writeStudioProjectDiagnosticSource(storage, diagnosticSourceWithBible(
      [bibleCharacter("c-1", "하은", ["은이"]), bibleCharacter("c-2", "도진")],
      [{ id: "l-1", name: "기억 시장" }],
    ));
    const { sources } = loadManuscriptNameSources({ workId: "work-1", storage });
    expect(sources.bibleCharacters).toEqual([
      { id: "c-1", name: "하은", aliases: ["은이"] },
      { id: "c-2", name: "도진", aliases: [] },
    ]);
    expect(sources.bibleLocations).toEqual([{ id: "l-1", name: "기억 시장" }]);
    expect(sources.loreLocations).toEqual([]);
  });

  it("세계관 설정에서는 장소만, 예시·폐기·격리 항목을 빼고 읽는다", () => {
    const storage = memoryStorage();
    storeLore(storage, [
      loreDraft("p-1", "place", "별빛 거리", { aliases: ["별길"] }),
      loreDraft("p-2", "place", "추측 장소", { status: "speculative" }),
      loreDraft("p-3", "place", "의도적 빈칸", { status: "intentional-gap" }),
      loreDraft("p-4", "place", "폐기된 장소", { status: "deprecated" }),
      loreDraft("p-5", "place", "격리된 장소", { status: "quarantined" }),
      loreDraft("p-6", "place", "예시 장소", { origin: "example" }),
      loreDraft("f-1", "faction", "별빛 길드"),
    ]);
    const { sources } = loadManuscriptNameSources({ workId: "work-1", storage });
    expect(sources.loreLocations?.map((entry) => entry.name)).toEqual(["별빛 거리", "추측 장소", "의도적 빈칸"]);
    expect(sources.loreLocations?.[0]).toEqual({ id: "p-1", name: "별빛 거리", aliases: ["별길"] });
  });

  it("저장소를 읽다가 예외가 나도 나머지를 읽고, 읽지 못한 곳을 작가의 말로 알린다", () => {
    const inner = memoryStorage();
    storeLore(inner, [loreDraft("p-1", "place", "별빛 거리")]);
    const storage: StudioProjectDiagnosticSourceStorage = {
      getItem: (key) => {
        if (key.includes("project-diagnostic-source")) throw new Error("차단됨");
        return inner.getItem(key);
      },
      setItem: inner.setItem,
      removeItem: inner.removeItem,
    };
    const loaded = loadManuscriptNameSources({ workId: "work-1", storage });
    expect(loaded.notices).toEqual(["스토리 바이블을 읽지 못해서 바이블에 등록된 인물·장소 이름은 쓰지 않았어요."]);
    expect(loaded.sources.bibleCharacters).toEqual([]);
    expect(loaded.sources.loreLocations?.map((entry) => entry.name)).toEqual(["별빛 거리"]);
  });

  it("세계관 설정 쪽이 막혀도 바이블 이름은 읽는다", () => {
    const inner = memoryStorage();
    writeStudioProjectDiagnosticSource(inner, diagnosticSourceWithBible([bibleCharacter("c-1", "하은")], []));
    const storage: StudioProjectDiagnosticSourceStorage = {
      getItem: (key) => {
        if (key.includes("world-lore")) throw new Error("차단됨");
        return inner.getItem(key);
      },
      setItem: inner.setItem,
      removeItem: inner.removeItem,
    };
    const loaded = loadManuscriptNameSources({ workId: "work-1", storage });
    expect(loaded.notices).toEqual(["세계관 설정을 읽지 못해서 설정에 등록된 장소 이름은 쓰지 않았어요."]);
    expect(loaded.sources.bibleCharacters?.map((entry) => entry.name)).toEqual(["하은"]);
  });

  it("너무 많이 등록된 이름은 상한까지만 쓴다", () => {
    const storage = memoryStorage();
    const characters = Array.from({ length: MANUSCRIPT_NAME_SOURCE_LIMITS.characters + 20 }, (_, index) => bibleCharacter(`c-${index}`, `인물${index}번`));
    const locations = Array.from({ length: MANUSCRIPT_NAME_SOURCE_LIMITS.locations + 20 }, (_, index) => ({ id: `l-${index}`, name: `장소${index}번` }));
    writeStudioProjectDiagnosticSource(storage, diagnosticSourceWithBible(characters, locations));
    const { sources } = loadManuscriptNameSources({ workId: "work-1", storage });
    expect(sources.bibleCharacters).toHaveLength(MANUSCRIPT_NAME_SOURCE_LIMITS.characters);
    expect(sources.bibleLocations).toHaveLength(MANUSCRIPT_NAME_SOURCE_LIMITS.locations);
  });

  it("읽어 온 이름으로 빈 문서의 원고에서도 인물과 장소를 글자 일치로 찾는다", () => {
    const storage = memoryStorage();
    writeStudioProjectDiagnosticSource(storage, diagnosticSourceWithBible(
      [bibleCharacter("c-1", "하은", ["은이"]), bibleCharacter("c-2", "도진")],
      [{ id: "l-1", name: "기억 시장" }],
    ));
    storeLore(storage, [loreDraft("p-1", "place", "별빛 거리", { aliases: ["별길"] })]);
    const { sources } = loadManuscriptNameSources({ workId: "work-1", storage });
    const register = buildManuscriptRegister({ project: null, ...sources });
    const extraction = extractManuscript(
      ["장면 1", "은이가 기억 시장을 걸었다. 도진이 불렀다.", "", "* * *", "", "장면 2", "하은은 별길로 접어들었다."].join("\n"),
      register,
    );
    expect(extraction.scenes).toHaveLength(2);
    expect(extraction.scenes[0]?.characters.map((match) => match.surface)).toEqual(["은이", "도진"]);
    expect(extraction.scenes[0]?.locations.map((match) => match.surface)).toEqual(["기억 시장"]);
    expect(extraction.scenes[1]?.characters.map((match) => match.surface)).toEqual(["하은"]);
    // 별칭으로 적힌 장소도 정본 장소 하나로 모인다.
    expect(extraction.scenes[1]?.locationEntryId).toBe("location:별빛 거리");
  });

  it("같은 입력이면 항상 같은 결과를 돌려준다", () => {
    const storage = memoryStorage();
    writeStudioProjectDiagnosticSource(storage, diagnosticSourceWithBible([bibleCharacter("c-1", "하은")], [{ id: "l-1", name: "기억 시장" }]));
    expect(loadManuscriptNameSources({ workId: "work-1", storage })).toEqual(loadManuscriptNameSources({ workId: "work-1", storage }));
  });
});
