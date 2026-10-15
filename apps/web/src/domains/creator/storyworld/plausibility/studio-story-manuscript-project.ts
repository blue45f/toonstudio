/**
 * 원고 추출 제안 → 스토리월드 문서 초안.
 *
 * 사용자가 미리보기에서 장면 경계·인물을 고치고 확정했을 때만 호출한다. 여기서 만드는 것은
 * 장면 뼈대(제목·순서·참여자·장소·원고 출처)뿐이다. 사실·전제·지식·감정 같은 의미 필드는 비워 둔다.
 *
 * 두 가지 방식이 있다.
 * - replace: 장면·사실·복선·모티프를 새로 시작한다. 인물 목록은 이름·별칭을 잃지 않도록 남긴다.
 *   기존 장면이 사라지므로 화면이 덮어쓰기 경고를 먼저 보여 준다.
 * - append: 지금 설정은 그대로 두고 장면만 뒤에 덧붙인다.
 */
import {
  STORYWORLD_DEMO_PROJECT,
  STUDIO_STORYWORLD_SCHEMA_VERSION,
  fingerprintStoryworldValue,
  type StoryworldCharacter,
  type StoryworldProject,
  type StoryworldScene,
} from "../studio-storyworld-causality";
import { STORYWORLD_DOCUMENT_LIMITS, normalizeStoryworldProject } from "../studio-storyworld-document";
import type {
  ManuscriptNameEntry,
  ManuscriptSceneDraft,
} from "./studio-story-manuscript-extractor";

export interface ManuscriptRegisterSources {
  readonly project?: StoryworldProject | null;
  readonly bibleCharacters?: readonly { readonly id: string; readonly name: string; readonly aliases: readonly string[] }[];
  readonly bibleLocations?: readonly { readonly id: string; readonly name: string }[];
  readonly loreLocations?: readonly { readonly id: string; readonly name: string; readonly aliases: readonly string[] }[];
}

const CHARACTER_PREFIX = "character:";
const LOCATION_PREFIX = "location:";

function uniqueAliases(name: string, aliases: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const alias of aliases) {
    const cleaned = alias.trim();
    if (cleaned && cleaned !== name.trim()) seen.add(cleaned);
  }
  return [...seen];
}

/**
 * 원고에서 이름을 찾을 때 쓰는 등록부. 스토리월드 인물·장소를 먼저 두고, 바이블 인물·장소와
 * 세계관 설정의 장소를 더한다. 인물 id가 같으면 같은 사람으로 보고 별칭을 합친다.
 * 이름만 같고 id가 다르면 합치지 않는다(동명이인일 수 있어 사용자가 고르게 한다).
 */
export function buildManuscriptRegister(sources: ManuscriptRegisterSources): readonly ManuscriptNameEntry[] {
  const characters = new Map<string, ManuscriptNameEntry>();
  const locations = new Map<string, ManuscriptNameEntry>();
  const addCharacter = (id: string, name: string, aliases: readonly string[]) => {
    const key = `${CHARACTER_PREFIX}${id}`;
    const existing = characters.get(key);
    if (existing) {
      characters.set(key, { ...existing, aliases: uniqueAliases(existing.name, [...existing.aliases, name, ...aliases]) });
      return;
    }
    characters.set(key, { kind: "character", id: key, refId: id, name: name.trim() || id, aliases: uniqueAliases(name, aliases) });
  };
  const addLocation = (name: string, aliases: readonly string[]) => {
    const cleaned = name.trim();
    if (!cleaned) return;
    const key = `${LOCATION_PREFIX}${cleaned}`;
    const existing = locations.get(key);
    if (existing) {
      locations.set(key, { ...existing, aliases: uniqueAliases(cleaned, [...existing.aliases, ...aliases]) });
      return;
    }
    locations.set(key, { kind: "location", id: key, refId: cleaned, name: cleaned, aliases: uniqueAliases(cleaned, aliases) });
  };

  for (const character of sources.project?.characters ?? []) addCharacter(character.id, character.name, character.aliases ?? []);
  for (const character of sources.bibleCharacters ?? []) addCharacter(character.id, character.name, character.aliases);
  const projectLocationIds = new Set<string>();
  for (const scene of sources.project?.scenes ?? []) {
    const locationId = scene.locationId?.trim();
    if (locationId) projectLocationIds.add(locationId);
  }
  for (const locationId of [...projectLocationIds].sort()) addLocation(locationId, []);
  for (const location of sources.bibleLocations ?? []) addLocation(location.name, []);
  for (const location of sources.loreLocations ?? []) addLocation(location.name, location.aliases);
  return [...characters.values(), ...locations.values()];
}

/** 원고 사본의 id. 같은 글이면 항상 같은 값이다. */
export function manuscriptFingerprint(text: string): string {
  return fingerprintStoryworldValue([text.length, text]);
}

export interface ManuscriptDraftOverride {
  readonly title?: string;
  /** 사용자가 확정한 등장인물(등록부 refId). 정하면 자동 배정을 덮어쓴다. */
  readonly participantRefIds?: readonly string[];
  /** 사용자가 확정한 장소 이름. null이면 장소 없음. */
  readonly locationName?: string | null;
}

export type ManuscriptDraftOverrides = Readonly<Record<string, ManuscriptDraftOverride>>;

export interface BuildManuscriptProjectOptions {
  readonly mode: "replace" | "append";
  readonly projectTitle?: string;
  /** 가져올 첫 장면의 위치(0부터). 장면이 한도보다 많을 때 나눠 가져오는 데 쓴다. */
  readonly sliceStart?: number;
  /** 이 장면들의 위치가 가리키는 원고 사본 id. 각 장면의 출처에 적어 원문을 다시 열 수 있게 한다. */
  readonly copyId?: string;
}

export interface BuildManuscriptProjectResult {
  readonly project: StoryworldProject;
  readonly addedSceneIds: readonly string[];
  readonly addedCharacterIds: readonly string[];
  /** 한도 때문에 이번에 가져오지 못한 장면 수. */
  readonly skippedSceneCount: number;
  /** 동명이인 후보가 남아 사용자가 고르지 않은 장면 수. */
  readonly unresolvedCharacterScenes: number;
}

/** 인물에서 사실 참조(처음 아는 사실·비밀)를 뺀다. 사실을 모두 지우는 replace 방식에서 쓴다. */
function withoutFactReferences(character: StoryworldCharacter): StoryworldCharacter {
  return {
    id: character.id,
    name: character.name,
    ...(character.aliases ? { aliases: character.aliases } : {}),
    ...(character.description ? { description: character.description } : {}),
    ...(character.tags ? { tags: character.tags } : {}),
    ...(character.goal ? { goal: character.goal } : {}),
    ...(character.motion ? { motion: character.motion } : {}),
    ...(character.birthYear === undefined ? {} : { birthYear: character.birthYear }),
  };
}

function nextFreeId(prefix: string, taken: ReadonlySet<string>, from: number): { id: string; next: number } {
  let n = from;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return { id: `${prefix}${n}`, next: n + 1 };
}

export function buildProjectFromManuscript(
  base: StoryworldProject | null,
  scenes: readonly ManuscriptSceneDraft[],
  register: readonly ManuscriptNameEntry[],
  overrides: ManuscriptDraftOverrides,
  options: BuildManuscriptProjectOptions,
): BuildManuscriptProjectResult {
  const entryByRef = new Map(register.filter((entry) => entry.kind === "character").map((entry) => [entry.refId, entry]));
  const entryById = new Map(register.map((entry) => [entry.id, entry]));
  const title = options.projectTitle?.trim() || base?.title || "원고에서 만든 초안";
  const replace = options.mode === "replace";

  const characters: StoryworldCharacter[] = (base?.characters ?? []).map((character) =>
    replace ? withoutFactReferences(character) : character);
  const characterIds = new Set(characters.map((character) => character.id));
  const addedCharacterIds: string[] = [];

  const ensureCharacter = (refId: string): string => {
    if (characterIds.has(refId)) return refId;
    const entry = entryByRef.get(refId);
    const created: StoryworldCharacter = {
      id: refId,
      name: entry?.name ?? refId,
      ...(entry && entry.aliases.length > 0 ? { aliases: entry.aliases } : {}),
    };
    characters.push(created);
    characterIds.add(refId);
    addedCharacterIds.push(refId);
    return refId;
  };

  const baseScenes = replace ? [] : [...(base?.scenes ?? [])];
  const room = Math.max(0, STORYWORLD_DOCUMENT_LIMITS.scenes - baseScenes.length);
  const start = Math.max(0, options.sliceStart ?? 0);
  const selected = scenes.slice(start, start + room);
  const skippedSceneCount = scenes.length - selected.length;

  const takenSceneIds = new Set(baseScenes.map((scene) => scene.id));
  let idCursor = 1;
  const maxOrder = baseScenes.reduce((max, scene) => Math.max(max, scene.order), 0);
  const added: StoryworldScene[] = [];
  let unresolvedCharacterScenes = 0;

  selected.forEach((draft, position) => {
    const override = overrides[draft.key];
    const { id, next } = nextFreeId("ms-", takenSceneIds, idCursor);
    idCursor = next;
    takenSceneIds.add(id);

    let participantRefs: readonly string[];
    if (override?.participantRefIds) {
      participantRefs = override.participantRefIds;
    } else {
      const confirmed: string[] = [];
      let unresolved = false;
      for (const match of draft.characters) {
        if (match.candidateIds.length === 1) {
          const entry = entryById.get(match.candidateIds[0] ?? "");
          if (entry) confirmed.push(entry.refId);
        } else {
          unresolved = true;
        }
      }
      if (unresolved) unresolvedCharacterScenes += 1;
      participantRefs = confirmed;
    }
    const participantIds = [...new Set(participantRefs.map(ensureCharacter))];

    const locationName = override && "locationName" in override
      ? (override.locationName ?? undefined)
      : draft.locationEntryId
        ? entryById.get(draft.locationEntryId)?.refId
        : undefined;

    added.push({
      id,
      title: (override?.title?.trim() || draft.title).slice(0, 120),
      order: maxOrder + 10 * (position + 1),
      ...(participantIds.length > 0 ? { participantIds } : {}),
      ...(locationName ? { locationId: locationName } : {}),
      ...(draft.episodeNumber === undefined ? {} : { episodeNumber: draft.episodeNumber }),
      source: {
        excerpt: draft.excerpt,
        boundary: draft.boundary,
        ...(draft.marker ? { marker: draft.marker } : {}),
        ...(options.copyId ? { copy: options.copyId } : {}),
        start: draft.start,
        end: draft.end,
        ...(draft.timeCues.length > 0 ? { timeCues: draft.timeCues } : {}),
      },
    });
  });

  const baseMetadata = base?.metadata ? { ...base.metadata } : {};
  const candidate: StoryworldProject = {
    schemaVersion: STUDIO_STORYWORLD_SCHEMA_VERSION,
    id: base && base.id !== STORYWORLD_DEMO_PROJECT.id ? base.id : "manuscript-draft",
    title,
    characters,
    facts: replace ? [] : [...(base?.facts ?? [])],
    scenes: [...baseScenes, ...added],
    ...(replace || !base?.setupContracts ? {} : { setupContracts: base.setupContracts }),
    ...(replace || !base?.motifs ? {} : { motifs: base.motifs }),
    ...(base?.productionCapacityMinutes === undefined ? {} : { productionCapacityMinutes: base.productionCapacityMinutes }),
    metadata: baseMetadata,
  };
  // 저장·불러오기와 같은 검증을 거쳐, 한도를 넘거나 구조가 틀리면 여기서 알린다.
  const project = normalizeStoryworldProject(JSON.parse(JSON.stringify(candidate)));
  return {
    project,
    addedSceneIds: added.map((scene) => scene.id),
    addedCharacterIds,
    skippedSceneCount,
    unresolvedCharacterScenes,
  };
}
