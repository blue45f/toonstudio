/**
 * 원고에서 이름을 찾을 때 쓸 등록 이름을 작품의 다른 저장소에서 읽는다.
 *
 * 스토리월드 문서가 아직 비어 있는 새 작품에서도 원고의 등장인물과 장소를 찾을 수 있도록, 같은 기기에
 * 저장된 스토리 바이블(인물·별칭·장소)과 세계관 설정의 장소 항목을 읽는다. 읽기만 하고 쓰지 않으며,
 * 읽지 못한 저장소는 건너뛰고 알린다. 이름을 지어내거나 비슷한 이름을 추측해 합치지 않는다: 여기서 돌려주는
 * 것은 작가가 이미 등록해 둔 이름 그대로다.
 *
 * 세계관 설정에서는 장소(place) 종류만 쓰고, 예시로 넣어 둔 항목(origin=example)과 폐기·격리된 항목은 뺀다.
 * 폐기·격리 항목은 정본 이름 공간을 차지하지 않기 때문이다.
 */
import { isLoreEntryActive } from "../../planning/studio-world-lore";
import { readStudioWorldLore } from "../../planning/studio-world-lore-store";
import {
  readStudioProjectDiagnosticSource,
  type StudioProjectDiagnosticSourceStorage,
} from "../../studio-project-diagnostic-source-store";
import type { ManuscriptRegisterSources } from "./studio-story-manuscript-project";

export type ManuscriptNameSources = Pick<ManuscriptRegisterSources, "bibleCharacters" | "bibleLocations" | "loreLocations">;

export interface ManuscriptNameSourceLoad {
  readonly sources: ManuscriptNameSources;
  /** 읽으면서 알게 된 점(읽지 못한 저장소). 작가의 말로 적는다. */
  readonly notices: readonly string[];
}

/** 등록 이름이 이보다 많으면 앞에서부터 쓴다(추출기의 이름 개수 상한과 같은 규모를 지킨다). */
export const MANUSCRIPT_NAME_SOURCE_LIMITS = Object.freeze({ characters: 200, locations: 400 });

export const EMPTY_MANUSCRIPT_NAME_SOURCES: ManuscriptNameSources = Object.freeze({});

export function loadManuscriptNameSources(input: {
  readonly workId: string | null;
  readonly storage: StudioProjectDiagnosticSourceStorage | null;
}): ManuscriptNameSourceLoad {
  const workId = input.workId?.trim() ?? "";
  if (!workId || !input.storage) return { sources: EMPTY_MANUSCRIPT_NAME_SOURCES, notices: [] };
  const notices: string[] = [];
  let bibleCharacters: NonNullable<ManuscriptNameSources["bibleCharacters"]> = [];
  let bibleLocations: NonNullable<ManuscriptNameSources["bibleLocations"]> = [];
  let loreLocations: NonNullable<ManuscriptNameSources["loreLocations"]> = [];

  try {
    const bible = readStudioProjectDiagnosticSource(input.storage, workId)?.story.bible;
    if (bible) {
      bibleCharacters = bible.characters
        .slice(0, MANUSCRIPT_NAME_SOURCE_LIMITS.characters)
        .map((character) => ({ id: character.id, name: character.name, aliases: character.aliases }));
      bibleLocations = bible.locations
        .slice(0, MANUSCRIPT_NAME_SOURCE_LIMITS.locations)
        .map((location) => ({ id: location.id, name: location.name }));
    }
  } catch {
    notices.push("스토리 바이블을 읽지 못해서 바이블에 등록된 인물·장소 이름은 쓰지 않았어요.");
  }

  try {
    const lore = readStudioWorldLore(input.storage, workId);
    if (lore) {
      loreLocations = lore.entries
        .filter((entry) => entry.kind === "place" && entry.origin === "authored" && isLoreEntryActive(entry))
        .slice(0, MANUSCRIPT_NAME_SOURCE_LIMITS.locations)
        .map((entry) => ({ id: entry.id, name: entry.name, aliases: entry.aliases }));
    }
  } catch {
    notices.push("세계관 설정을 읽지 못해서 설정에 등록된 장소 이름은 쓰지 않았어요.");
  }

  return { sources: { bibleCharacters, bibleLocations, loreLocations }, notices };
}
