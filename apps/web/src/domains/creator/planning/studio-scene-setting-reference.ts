/**
 * 장면 → 관련 설정 도출 모델 — 작업 화면 설정 참조 패널의 순수 로직.
 *
 * 왜 필요한가 (현재 상태 실측, 2026-10-14):
 * - 설정 정본은 세계관 허브(studio-world-lore)에 모여 있지만, 에디터·콘티
 *   작업 화면에서는 그 설정을 곁에 띄우는 표면이 없었다. 작가는 장면을
 *   그리면서 "이 장소 규칙이 뭐였지, 이 캐릭터와 이어진 설정이 뭐였지"를
 *   확인하려고 기획 화면으로 오가야 했다.
 * - 장면 메타의 정본은 이미 있다: 콘티 비트(StudioStoryBeat)의
 *   sceneId·characterIds·locationId, 연속성 상태의 sceneId·locationId.
 *   이 모델은 그 메타를 입력으로 받아 관련 설정만 추린다. 새 저장은 없다.
 *
 * 도출 규칙 (전부 명시 연결·정본 이름 기준 — 추측 연결 금지):
 * 1. 장소: 장면 locationId → 바이블 장소. 이름(또는 별칭)이 같은 로어
 *    "장소" 항목이 있으면 그 항목이 이 장소의 상세 설정으로 붙는다.
 * 2. 캐릭터: 장면 characterIds → 바이블 캐릭터. characterIds에 그 캐릭터가
 *    명시된 로어 항목이 직접 연결로 붙는다.
 * 3. 본문 언급: 장면 요약·대사에 로어 항목 이름/별칭이 그대로 나오면 붙는다.
 * 4. 1단계 확장: 직접 연결된 항목의 relatedEntryIds(나가는 연결 + 들어오는
 *    연결)를 한 단계만 더 편다. 그 이상은 패널이 사전이 되므로 펼치지 않는다.
 * 5. 사실: 장소나 등장 캐릭터에 닿은 바이블 사실(StudioStoryFact)을 붙인다.
 *
 * 모르는 id(삭제된 캐릭터 등)는 조용히 버리지 않고 unknown* 로 돌려줘서
 * 패널이 "끊긴 참조"를 알릴 수 있게 한다. 상한을 넘는 항목은 자르고
 * 잘린 개수를 돌려준다 — 패널이 전부 펼친 척하지 않기 위해서다.
 */
import type {
  StudioStoryBible,
  StudioStoryCharacter,
  StudioStoryFact,
  StudioStoryLocation,
} from "../studio-story-bible";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import type { StudioLoreEntry, StudioWorldLore } from "./studio-world-lore";

/** 패널에 한 번에 보여줄 관련 설정 상한. 나머지는 잘린 개수로만 알린다. */
export const SCENE_SETTING_REFERENCE_ENTRY_LIMIT = 12;

/**
 * 장면 메타 입력 — 비트·연속성 상태·에디터 장면 선택이 공통으로 채울 수 있는
 * 최소 모양. texts는 언급 매칭용 자유 텍스트(장면 요약·대사)다.
 */
export interface SceneSettingReferenceInput {
  readonly sceneId: string;
  readonly locationId: string | null;
  readonly characterIds: readonly string[];
  readonly texts?: readonly string[];
}

/** 콘티 비트 묶음(한 장면분) → 장면 메타 입력. 비트 순서는 등장 순서를 정한다. */
export function sceneReferenceInputFromBeats(
  beats: readonly StudioStoryBeat[],
): SceneSettingReferenceInput | null {
  if (beats.length === 0) return null;
  const sceneId = beats[0]?.sceneId ?? "";
  const characterIds: string[] = [];
  const seenCharacters = new Set<string>();
  let locationId: string | null = null;
  const texts: string[] = [];
  for (const beat of beats) {
    if (beat.sceneId !== sceneId) continue;
    for (const id of beat.characterIds) {
      if (seenCharacters.has(id)) continue;
      seenCharacters.add(id);
      characterIds.push(id);
    }
    if (locationId === null && beat.locationId !== null) locationId = beat.locationId;
    if (beat.summary.trim()) texts.push(beat.summary);
    if (beat.dialogue.trim()) texts.push(beat.dialogue);
  }
  return Object.freeze({
    sceneId,
    locationId,
    characterIds: Object.freeze(characterIds),
    texts: Object.freeze(texts),
  });
}

export type SceneSettingReferenceReason =
  | "scene-location"
  | "scene-character"
  | "mentioned-in-scene"
  | "related-entry";

/** 화면 문구의 단일 출처 — 왜 이 설정이 떴는지 패널이 그대로 보여준다. */
export const SCENE_SETTING_REFERENCE_REASON_LABELS: Readonly<
  Record<SceneSettingReferenceReason, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  "scene-location": Object.freeze({ ko: "이 장면의 장소", en: "Scene location" }),
  "scene-character": Object.freeze({ ko: "등장 캐릭터와 연결", en: "Linked to a character here" }),
  "mentioned-in-scene": Object.freeze({ ko: "장면 본문에 등장", en: "Mentioned in this scene" }),
  "related-entry": Object.freeze({ ko: "연결된 설정", en: "Related entry" }),
});

export interface SceneReferenceEntry {
  readonly entry: StudioLoreEntry;
  readonly reasons: readonly SceneSettingReferenceReason[];
  /** true면 장면과 직접 닿은 항목, false면 1단계 확장으로 딸려 온 항목. */
  readonly direct: boolean;
}

export interface SceneReferenceCharacter {
  readonly character: StudioStoryCharacter;
  /** 이 캐릭터를 명시 연결한 로어 항목 수 — 패널의 개수 표기용. */
  readonly linkedEntryCount: number;
}

export interface SceneSettingReference {
  readonly sceneId: string;
  /** 장면 장소 (바이블 정본). 메타가 없거나 모르는 id면 null. */
  readonly location: StudioStoryLocation | null;
  /** 장소에 붙은 로어 상세 항목. 장소는 알지만 상세 설정이 없으면 null. */
  readonly locationEntry: StudioLoreEntry | null;
  readonly characters: readonly SceneReferenceCharacter[];
  readonly entries: readonly SceneReferenceEntry[];
  readonly facts: readonly StudioStoryFact[];
  /** 상한 때문에 잘린 관련 설정 개수. */
  readonly truncatedEntryCount: number;
  /** 장면 메타가 가리키지만 바이블에 없는 캐릭터 id — 끊긴 참조. */
  readonly unknownCharacterIds: readonly string[];
  /** 장면 메타의 locationId가 바이블에 없으면 그 id, 아니면 null. */
  readonly unknownLocationId: string | null;
  /** 보여줄 게 하나도 없으면 true — 패널 빈 상태 판정. */
  readonly isEmpty: boolean;
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

const REASON_ORDER: readonly SceneSettingReferenceReason[] = [
  "scene-location",
  "scene-character",
  "mentioned-in-scene",
  "related-entry",
];

function sortReasons(
  reasons: ReadonlySet<SceneSettingReferenceReason>,
): readonly SceneSettingReferenceReason[] {
  return Object.freeze(REASON_ORDER.filter((reason) => reasons.has(reason)));
}

export function deriveSceneSettingReference(
  input: SceneSettingReferenceInput,
  bible: StudioStoryBible | null,
  lore: StudioWorldLore,
): SceneSettingReference {
  const charactersById = new Map(
    (bible?.characters ?? []).map((character) => [character.id, character]),
  );
  const locationsById = new Map(
    (bible?.locations ?? []).map((location) => [location.id, location]),
  );
  const entriesById = new Map(lore.entries.map((entry) => [entry.id, entry]));

  const sceneCharacterIds = [...new Set(input.characterIds)];
  const knownCharacterIds = sceneCharacterIds.filter((id) => charactersById.has(id));
  const unknownCharacterIds = sceneCharacterIds.filter((id) => !charactersById.has(id));
  const sceneCharacterIdSet = new Set(knownCharacterIds);

  const location =
    input.locationId !== null ? (locationsById.get(input.locationId) ?? null) : null;
  const unknownLocationId =
    input.locationId !== null && location === null ? input.locationId : null;

  // 장소 상세: 이름/별칭이 바이블 장소 이름과 같은 place 항목 (정본 이름 일치만).
  let locationEntry: StudioLoreEntry | null = null;
  if (location !== null) {
    const locationKey = normalizeName(location.name);
    locationEntry =
      lore.entries.find(
        (entry) =>
          entry.kind === "place" &&
          (normalizeName(entry.name) === locationKey ||
            entry.aliases.some((alias) => normalizeName(alias) === locationKey)),
      ) ?? null;
  }

  const haystack = (input.texts ?? []).join("\n").toLocaleLowerCase();
  const mentioned = (entry: StudioLoreEntry): boolean => {
    if (!haystack) return false;
    return [entry.name, ...entry.aliases].some((surface) => {
      const needle = surface.trim().toLocaleLowerCase();
      return needle.length >= 2 && haystack.includes(needle);
    });
  };

  // 직접 연결 수집.
  const directReasons = new Map<string, Set<SceneSettingReferenceReason>>();
  const addReason = (entryId: string, reason: SceneSettingReferenceReason) => {
    if (!entriesById.has(entryId)) return;
    const set = directReasons.get(entryId) ?? new Set<SceneSettingReferenceReason>();
    set.add(reason);
    directReasons.set(entryId, set);
  };
  if (locationEntry !== null) addReason(locationEntry.id, "scene-location");
  for (const entry of lore.entries) {
    if (entry.characterIds.some((id) => sceneCharacterIdSet.has(id))) {
      addReason(entry.id, "scene-character");
    }
    if (mentioned(entry)) addReason(entry.id, "mentioned-in-scene");
  }

  // 1단계 확장: 직접 항목과 relatedEntryIds 로 이어진 항목 (양방향).
  const relatedReasons = new Map<string, Set<SceneSettingReferenceReason>>();
  for (const entry of lore.entries) {
    const touchesDirect =
      directReasons.has(entry.id) ||
      entry.relatedEntryIds.some((id) => directReasons.has(id));
    if (!touchesDirect || directReasons.has(entry.id)) continue;
    relatedReasons.set(entry.id, new Set<SceneSettingReferenceReason>(["related-entry"]));
  }
  for (const id of directReasons.keys()) {
    const entry = entriesById.get(id);
    if (!entry) continue;
    for (const relatedId of entry.relatedEntryIds) {
      if (directReasons.has(relatedId) || !entriesById.has(relatedId)) continue;
      const set = relatedReasons.get(relatedId) ?? new Set<SceneSettingReferenceReason>();
      set.add("related-entry");
      relatedReasons.set(relatedId, set);
    }
  }

  const toReferenceEntry = (
    [entryId, reasons]: readonly [string, ReadonlySet<SceneSettingReferenceReason>],
    direct: boolean,
  ): SceneReferenceEntry | null => {
    const entry = entriesById.get(entryId);
    if (!entry) return null;
    return Object.freeze({ entry, reasons: sortReasons(reasons), direct });
  };
  const byName = (a: SceneReferenceEntry, b: SceneReferenceEntry): number =>
    a.entry.name.localeCompare(b.entry.name);
  const directEntries = [...directReasons.entries()]
    .map((pair) => toReferenceEntry(pair, true))
    .filter((item): item is SceneReferenceEntry => item !== null)
    .sort((a, b) => {
      // 장소 항목을 맨 앞에 — 작업 중 가장 먼저 확인하는 설정이라서.
      const aLoc = a.reasons.includes("scene-location") ? 0 : 1;
      const bLoc = b.reasons.includes("scene-location") ? 0 : 1;
      return aLoc - bLoc || byName(a, b);
    });
  const relatedEntries = [...relatedReasons.entries()]
    .map((pair) => toReferenceEntry(pair, false))
    .filter((item): item is SceneReferenceEntry => item !== null)
    .sort(byName);

  const allEntries = [...directEntries, ...relatedEntries];
  const entries = Object.freeze(allEntries.slice(0, SCENE_SETTING_REFERENCE_ENTRY_LIMIT));
  const truncatedEntryCount = Math.max(
    0,
    allEntries.length - SCENE_SETTING_REFERENCE_ENTRY_LIMIT,
  );

  const characters = Object.freeze(
    knownCharacterIds
      .map((id) => charactersById.get(id))
      .filter((character): character is StudioStoryCharacter => character !== undefined)
      .map((character) =>
        Object.freeze({
          character,
          linkedEntryCount: lore.entries.filter((entry) =>
            entry.characterIds.includes(character.id),
          ).length,
        }),
      ),
  );

  const facts = Object.freeze(
    (bible?.facts ?? []).filter(
      (fact) =>
        (input.locationId !== null && fact.locationId === input.locationId) ||
        fact.characterIds.some((id) => sceneCharacterIdSet.has(id)),
    ),
  );

  const isEmpty =
    location === null &&
    locationEntry === null &&
    characters.length === 0 &&
    entries.length === 0 &&
    facts.length === 0 &&
    unknownCharacterIds.length === 0 &&
    unknownLocationId === null;

  return Object.freeze({
    sceneId: input.sceneId,
    location,
    locationEntry,
    characters,
    entries,
    facts,
    truncatedEntryCount,
    unknownCharacterIds: Object.freeze(unknownCharacterIds),
    unknownLocationId,
    isEmpty,
  });
}
