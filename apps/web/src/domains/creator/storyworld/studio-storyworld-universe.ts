/**
 * 공유 세계관(유니버스) 데이터 모델과 편집 연산.
 *
 * 여러 작품(스토리월드 프로젝트)이 하나의 세계관 묶음에 속하고, 캐릭터·장소·사실·
 * 설정 항목(lore)을 작품 간 "공유 요소"로 명시 지정하는 층이다. 공유는 복사가 아니라 참조다:
 * 사용(usages)은 (작품 스코프 키, 로컬 요소 id, 지정 시점 라벨)만 기록하고,
 * 제목 유사 같은 자동 연결은 만들지 않는다 — 지정은 항상 사용자의 명시적 행동이다.
 *
 * 설정 항목(lore)의 로컬 요소 id는 세계관 설정 허브(planning/studio-world-lore)의
 * StudioLoreEntry.id 다. 로어 컬렉션은 기획 저장소(localStorage·작품 id 공간)에 살고
 * 이 레지스트리는 스토리월드 저장소(OPFS·스코프 키 공간)에 살아 id 공간이 다르므로,
 * 이 모듈은 로어 실물을 import 하지 않고 id·라벨 스냅샷 참조만 기록한다. 로어 항목의
 * 실재 판정은 다른 kind와 같은 방식(currentWorkSharedStatus에 현재 작품의 로어 id
 * 집합을 넘기는 방식)으로 하고, 격리·폐기된 로어를 지정 후보에서 빼는 일은 후보를
 * 공급하는 호스트의 몫이다.
 *
 * 저장 경계: 이 레지스트리는 작품 문서와 같은 로컬 DB(SQLite/OPFS)에 산다.
 * 서버 동기화·협업자 공유·다른 기기 전파는 서버 계약이 필요하며 이 모듈 범위 밖이다.
 * 다른 작품의 로컬 요소 실재 여부는 그 작품을 열기 전에는 확정할 수 없어,
 * 현재 작품에 대해서만 라이브로 검증하고 나머지는 지정 시점 스냅샷으로 표시한다.
 */

/** 공유 요소 종류의 단일 출처 — 파서·화면 라벨·행렬 필터가 전부 이 목록을 쓴다. */
export const STORYWORLD_SHARED_ELEMENT_KINDS = [
  "character",
  "location",
  "fact",
  "lore",
] as const;

export type StoryworldSharedElementKind = (typeof STORYWORLD_SHARED_ELEMENT_KINDS)[number];

export function isStoryworldSharedElementKind(value: unknown): value is StoryworldSharedElementKind {
  return typeof value === "string"
    && (STORYWORLD_SHARED_ELEMENT_KINDS as readonly string[]).includes(value);
}

export interface StoryworldUniverseMember {
  /** 스토리월드 저장 스코프 키 (projectStorageKey 결과). 작품 식별의 정본. */
  readonly scopeKey: string;
  /** StoryworldProject.id의 가입 시점 스냅샷. */
  readonly projectId: string;
  /** 작품 제목의 가입 시점 스냅샷. */
  readonly title: string;
  readonly joinedAtIso: string;
}

export interface StoryworldSharedElementUsage {
  readonly scopeKey: string;
  /** 그 작품 안에서의 로컬 요소 id. 장소는 scene.locationId, 설정 항목은 StudioLoreEntry.id 문자열이 식별자다. */
  readonly elementId: string;
  /** 지정 시점의 로컬 요소 표기 스냅샷. */
  readonly elementLabel: string;
  readonly designatedAtIso: string;
}

export interface StoryworldSharedElement {
  readonly id: string;
  readonly kind: StoryworldSharedElementKind;
  readonly name: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly usages: readonly StoryworldSharedElementUsage[];
}

export interface StoryworldUniverse {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly members: readonly StoryworldUniverseMember[];
  readonly sharedElements: readonly StoryworldSharedElement[];
  readonly updatedAtIso: string;
}

export interface StoryworldUniverseRegistry {
  readonly version: 1;
  readonly universes: readonly StoryworldUniverse[];
}

export const EMPTY_STORYWORLD_UNIVERSE_REGISTRY: StoryworldUniverseRegistry = {
  version: 1,
  universes: [],
};

function nextId(prefix: string, existing: ReadonlySet<string>): string {
  let index = 1;
  while (existing.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function mapUniverse(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  update: (universe: StoryworldUniverse) => StoryworldUniverse,
  nowIso: string,
): StoryworldUniverseRegistry {
  if (!registry.universes.some((universe) => universe.id === universeId)) return registry;
  return {
    ...registry,
    universes: registry.universes.map((universe) =>
      universe.id === universeId ? { ...update(universe), updatedAtIso: nowIso } : universe,
    ),
  };
}

export function createStoryworldUniverse(
  registry: StoryworldUniverseRegistry,
  name: string,
  nowIso: string,
): { readonly registry: StoryworldUniverseRegistry; readonly id: string } {
  const id = nextId("universe", new Set(registry.universes.map((universe) => universe.id)));
  const universe: StoryworldUniverse = {
    id,
    name: name.trim() || "새 공유 세계관",
    members: [],
    sharedElements: [],
    updatedAtIso: nowIso,
  };
  return { registry: { ...registry, universes: [...registry.universes, universe] }, id };
}

export function updateStoryworldUniverse(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  patch: { readonly name?: string; readonly description?: string },
  nowIso: string,
): StoryworldUniverseRegistry {
  return mapUniverse(registry, universeId, (universe) => ({
    ...universe,
    name: patch.name !== undefined ? patch.name.trim() || universe.name : universe.name,
    description: patch.description !== undefined
      ? (patch.description.trim() ? patch.description.trim() : undefined)
      : universe.description,
  }), nowIso);
}

export function deleteStoryworldUniverse(
  registry: StoryworldUniverseRegistry,
  universeId: string,
): StoryworldUniverseRegistry {
  return { ...registry, universes: registry.universes.filter((universe) => universe.id !== universeId) };
}

/** 작품을 멤버로 넣는다. 이미 멤버면 제목 스냅샷만 최신으로 갈아 끼운다. */
export function joinStoryworldUniverse(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  member: StoryworldUniverseMember,
  nowIso: string,
): StoryworldUniverseRegistry {
  return mapUniverse(registry, universeId, (universe) => {
    const existing = universe.members.find((item) => item.scopeKey === member.scopeKey);
    const members = existing
      ? universe.members.map((item) => item.scopeKey === member.scopeKey
        ? { ...item, projectId: member.projectId, title: member.title }
        : item)
      : [...universe.members, member];
    return { ...universe, members };
  }, nowIso);
}

/** 작품을 멤버에서 빼고, 그 작품이 남긴 사용 지정도 함께 거둔다. */
export function leaveStoryworldUniverse(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  scopeKey: string,
  nowIso: string,
): StoryworldUniverseRegistry {
  return mapUniverse(registry, universeId, (universe) => ({
    ...universe,
    members: universe.members.filter((member) => member.scopeKey !== scopeKey),
    sharedElements: universe.sharedElements.map((element) => ({
      ...element,
      usages: element.usages.filter((usage) => usage.scopeKey !== scopeKey),
    })),
  }), nowIso);
}

export function addStoryworldSharedElement(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  kind: StoryworldSharedElementKind,
  name: string,
  nowIso: string,
): { readonly registry: StoryworldUniverseRegistry; readonly id: string | null } {
  const universe = registry.universes.find((item) => item.id === universeId);
  if (!universe) return { registry, id: null };
  const id = nextId("shared", new Set(universe.sharedElements.map((element) => element.id)));
  const element: StoryworldSharedElement = {
    id,
    kind,
    name: name.trim() || "새 공유 요소",
    usages: [],
  };
  return {
    registry: mapUniverse(registry, universeId, (item) => ({
      ...item,
      sharedElements: [...item.sharedElements, element],
    }), nowIso),
    id,
  };
}

export function updateStoryworldSharedElement(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  elementId: string,
  patch: { readonly name?: string; readonly description?: string; readonly tags?: readonly string[] },
  nowIso: string,
): StoryworldUniverseRegistry {
  return mapUniverse(registry, universeId, (universe) => ({
    ...universe,
    sharedElements: universe.sharedElements.map((element) => {
      if (element.id !== elementId) return element;
      const cleanedTags = patch.tags === undefined
        ? undefined
        : [...new Set(patch.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
      return {
        ...element,
        name: patch.name !== undefined ? patch.name.trim() || element.name : element.name,
        description: patch.description !== undefined
          ? (patch.description.trim() ? patch.description.trim() : undefined)
          : element.description,
        tags: patch.tags === undefined
          ? element.tags
          : (cleanedTags && cleanedTags.length > 0 ? cleanedTags : undefined),
      };
    }),
  }), nowIso);
}

export function removeStoryworldSharedElement(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  elementId: string,
  nowIso: string,
): StoryworldUniverseRegistry {
  return mapUniverse(registry, universeId, (universe) => ({
    ...universe,
    sharedElements: universe.sharedElements.filter((element) => element.id !== elementId),
  }), nowIso);
}

/**
 * 공유 요소 사용을 명시 지정한다. 멤버 작품만 지정할 수 있고, 같은 작품·같은 로컬 요소의
 * 재지정은 기존 지정을 교체한다 (중복 행을 만들지 않는다).
 */
export function designateStoryworldSharedUsage(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  elementId: string,
  usage: StoryworldSharedElementUsage,
  nowIso: string,
): StoryworldUniverseRegistry {
  const universe = registry.universes.find((item) => item.id === universeId);
  if (!universe) return registry;
  if (!universe.members.some((member) => member.scopeKey === usage.scopeKey)) return registry;
  return mapUniverse(registry, universeId, (item) => ({
    ...item,
    sharedElements: item.sharedElements.map((element) => {
      if (element.id !== elementId) return element;
      const rest = element.usages.filter(
        (existing) => !(existing.scopeKey === usage.scopeKey && existing.elementId === usage.elementId),
      );
      return { ...element, usages: [...rest, usage] };
    }),
  }), nowIso);
}

export function revokeStoryworldSharedUsage(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  elementId: string,
  scopeKey: string,
  localElementId: string,
  nowIso: string,
): StoryworldUniverseRegistry {
  return mapUniverse(registry, universeId, (universe) => ({
    ...universe,
    sharedElements: universe.sharedElements.map((element) => element.id === elementId
      ? {
          ...element,
          usages: element.usages.filter(
            (usage) => !(usage.scopeKey === scopeKey && usage.elementId === localElementId),
          ),
        }
      : element),
  }), nowIso);
}

/**
 * 설정 항목(lore) 전용 지정 — 대상 공유 요소가 lore kind일 때만 일반 지정을 적용한다.
 * 캐릭터·장소·사실 요소에 로어 id가 잘못 붙는 종류 혼선을 타입 밖에서도 막는 가드다.
 * 멤버 검증·중복 교체 규칙은 일반 지정(designateStoryworldSharedUsage)과 동일하다.
 */
export function designateStoryworldLoreUsage(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  elementId: string,
  usage: StoryworldSharedElementUsage,
  nowIso: string,
): StoryworldUniverseRegistry {
  const universe = registry.universes.find((item) => item.id === universeId);
  const element = universe?.sharedElements.find((item) => item.id === elementId);
  if (!element || element.kind !== "lore") return registry;
  return designateStoryworldSharedUsage(registry, universeId, elementId, usage, nowIso);
}

/** 설정 항목(lore) 전용 지정 해제 — 대상이 lore kind가 아니면 아무것도 바꾸지 않는다. */
export function revokeStoryworldLoreUsage(
  registry: StoryworldUniverseRegistry,
  universeId: string,
  elementId: string,
  scopeKey: string,
  localElementId: string,
  nowIso: string,
): StoryworldUniverseRegistry {
  const universe = registry.universes.find((item) => item.id === universeId);
  const element = universe?.sharedElements.find((item) => item.id === elementId);
  if (!element || element.kind !== "lore") return registry;
  return revokeStoryworldSharedUsage(registry, universeId, elementId, scopeKey, localElementId, nowIso);
}

export interface StoryworldSharedUsageCell {
  readonly scopeKey: string;
  readonly memberTitle: string;
  readonly usage: StoryworldSharedElementUsage | null;
}

/** 공유 요소 × 멤버 작품 행렬. 어느 작품이 어떤 공유 요소를 쓰는지 한곳에서 보는 뷰 모델. */
export function buildStoryworldUniverseMatrix(
  universe: StoryworldUniverse,
): readonly { readonly element: StoryworldSharedElement; readonly cells: readonly StoryworldSharedUsageCell[] }[] {
  return universe.sharedElements.map((element) => ({
    element,
    cells: universe.members.map((member) => ({
      scopeKey: member.scopeKey,
      memberTitle: member.title,
      usage: element.usages.find((usage) => usage.scopeKey === member.scopeKey) ?? null,
    })),
  }));
}

/** 종류 하나로 좁힌 사용 행렬 — 설정 항목만 모아 보는 화면이 쓰는 뷰 모델. */
export function buildStoryworldUniverseMatrixByKind(
  universe: StoryworldUniverse,
  kind: StoryworldSharedElementKind,
): readonly { readonly element: StoryworldSharedElement; readonly cells: readonly StoryworldSharedUsageCell[] }[] {
  return buildStoryworldUniverseMatrix(universe).filter((row) => row.element.kind === kind);
}

/** 현재 작품 관점: 공유 요소별 내 사용 지정과, 지정한 로컬 요소가 아직 실재하는지. */
export function currentWorkSharedStatus(
  universe: StoryworldUniverse,
  scopeKey: string,
  localElementIds: ReadonlySet<string>,
  elementKind: StoryworldSharedElementKind,
): readonly { readonly element: StoryworldSharedElement; readonly usage: StoryworldSharedElementUsage | null; readonly localElementAlive: boolean | null }[] {
  return universe.sharedElements
    .filter((element) => element.kind === elementKind)
    .map((element) => {
      const usage = element.usages.find((item) => item.scopeKey === scopeKey) ?? null;
      return {
        element,
        usage,
        localElementAlive: usage === null ? null : localElementIds.has(usage.elementId),
      };
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path}는 비어 있지 않은 문자열이어야 합니다.`);
  }
}

function parseUsage(value: unknown, path: string): StoryworldSharedElementUsage {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  assertString(value.scopeKey, `${path}.scopeKey`);
  assertString(value.elementId, `${path}.elementId`);
  assertString(value.elementLabel, `${path}.elementLabel`);
  assertString(value.designatedAtIso, `${path}.designatedAtIso`);
  return value as unknown as StoryworldSharedElementUsage;
}

function parseSharedElement(value: unknown, path: string): StoryworldSharedElement {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  assertString(value.id, `${path}.id`);
  if (!isStoryworldSharedElementKind(value.kind)) {
    throw new Error(`${path}.kind가 지원되지 않습니다.`);
  }
  assertString(value.name, `${path}.name`);
  if (!Array.isArray(value.usages)) throw new Error(`${path}.usages는 배열이어야 합니다.`);
  value.usages.forEach((usage, index) => parseUsage(usage, `${path}.usages[${index}]`));
  return value as unknown as StoryworldSharedElement;
}

function parseUniverse(value: unknown, path: string): StoryworldUniverse {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  assertString(value.id, `${path}.id`);
  assertString(value.name, `${path}.name`);
  assertString(value.updatedAtIso, `${path}.updatedAtIso`);
  if (!Array.isArray(value.members)) throw new Error(`${path}.members는 배열이어야 합니다.`);
  value.members.forEach((member, index) => {
    const memberPath = `${path}.members[${index}]`;
    if (!isRecord(member)) throw new Error(`${memberPath}는 객체여야 합니다.`);
    assertString(member.scopeKey, `${memberPath}.scopeKey`);
    assertString(member.projectId, `${memberPath}.projectId`);
    assertString(member.title, `${memberPath}.title`);
    assertString(member.joinedAtIso, `${memberPath}.joinedAtIso`);
  });
  if (!Array.isArray(value.sharedElements)) throw new Error(`${path}.sharedElements는 배열이어야 합니다.`);
  value.sharedElements.forEach((element, index) => parseSharedElement(element, `${path}.sharedElements[${index}]`));
  return value as unknown as StoryworldUniverse;
}

/**
 * 저장소에서 읽은 레지스트리 JSON을 검증하며 복원한다. 형식이 깨지면 조용히 비우지 않고 던진다.
 * kind 확장은 추가형(additive)이라, lore가 생기기 전에 저장된 레지스트리(캐릭터·장소·사실만
 * 있는 version 1 문서)도 그대로 읽힌다 — 마이그레이션 없이 하위호환이 유지된다.
 */
export function parseStoryworldUniverseRegistry(text: string): StoryworldUniverseRegistry {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error("공유 세계관 레지스트리는 객체여야 합니다.");
  if (value.version !== 1) throw new Error("공유 세계관 레지스트리 버전이 지원되지 않습니다.");
  if (!Array.isArray(value.universes)) throw new Error("universes는 배열이어야 합니다.");
  value.universes.forEach((universe, index) => parseUniverse(universe, `universes[${index}]`));
  return value as unknown as StoryworldUniverseRegistry;
}
