import { ENGINEERING_ATLAS_AI } from "./engineering-atlas-ai";
import { ENGINEERING_ATLAS_DRAWING } from "./engineering-atlas-drawing";
import { ENGINEERING_ATLAS_INTERACTION } from "./engineering-atlas-interaction";
import { ENGINEERING_ATLAS_LOCAL_FIRST } from "./engineering-atlas-local-first";
import { ENGINEERING_ATLAS_OPEN_DATA } from "./engineering-atlas-open-data";
import { ENGINEERING_ATLAS_PLATFORM_OPS } from "./engineering-atlas-platform-ops";
import { ENGINEERING_ATLAS_REALTIME } from "./engineering-atlas-realtime";
import { ENGINEERING_ATLAS_THREE_D } from "./engineering-atlas-three-d";
import { ENGINEERING_ATLAS_VIRTUAL_SPACE } from "./engineering-atlas-virtual-space";
import { ENGINEERING_ATLAS_WEB_PLATFORM } from "./engineering-atlas-web-platform";
import {
  ENGINEERING_ATLAS_CATEGORIES,
  type EngineeringAtlasCategoryId,
  type EngineeringAtlasEntry,
} from "./engineering-atlas-types";

/**
 * 기술 도감 전체 카드. 카테고리별 모듈을 한 곳에서 모으고, 카테고리 목록 순서대로 정렬한다.
 * 카드는 카테고리 파일에만 추가한다(이 집계 모듈에는 카드 내용을 두지 않는다).
 */
const UNSORTED_ENTRIES: readonly EngineeringAtlasEntry[] = [
  ...ENGINEERING_ATLAS_DRAWING,
  ...ENGINEERING_ATLAS_LOCAL_FIRST,
  ...ENGINEERING_ATLAS_REALTIME,
  ...ENGINEERING_ATLAS_VIRTUAL_SPACE,
  ...ENGINEERING_ATLAS_THREE_D,
  ...ENGINEERING_ATLAS_AI,
  ...ENGINEERING_ATLAS_INTERACTION,
  ...ENGINEERING_ATLAS_WEB_PLATFORM,
  ...ENGINEERING_ATLAS_OPEN_DATA,
  ...ENGINEERING_ATLAS_PLATFORM_OPS,
];

const CATEGORY_ORDER = new Map<EngineeringAtlasCategoryId, number>(
  ENGINEERING_ATLAS_CATEGORIES.map((category, index) => [category.id, index]),
);

export const ENGINEERING_ATLAS_ENTRIES: readonly EngineeringAtlasEntry[] = [...UNSORTED_ENTRIES].sort(
  (a, b) => (CATEGORY_ORDER.get(a.category) ?? 0) - (CATEGORY_ORDER.get(b.category) ?? 0),
);

const BY_ID = new Map(ENGINEERING_ATLAS_ENTRIES.map((entry) => [entry.id, entry]));

export function findAtlasEntry(id: string): EngineeringAtlasEntry | undefined {
  return BY_ID.get(id);
}

export function atlasEntriesForCategory(category: EngineeringAtlasCategoryId): readonly EngineeringAtlasEntry[] {
  return ENGINEERING_ATLAS_ENTRIES.filter((entry) => entry.category === category);
}

/** 제작 스토리 챕터가 참조하는 도감 카드. 챕터 데이터를 건드리지 않고 도감 쪽 `chapterIds`로 역참조한다. */
export function atlasEntriesForChapter(chapterId: string): readonly EngineeringAtlasEntry[] {
  return ENGINEERING_ATLAS_ENTRIES.filter((entry) => entry.chapterIds.includes(chapterId));
}
