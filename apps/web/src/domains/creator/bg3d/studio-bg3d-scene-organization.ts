/**
 * 장면 구성 정보(태그·컴포넌트 묶음·장면 메타)의 읽기 모델과 렌더 투영.
 *
 * 순수 모듈이다. 편집기가 쥔 런타임 배열(BgPrimitive·BgCustomModelInstance)과 정본 문서만 읽어
 * 아웃라이너가 그릴 값을 만들고, 숨긴 태그를 렌더용 가시성으로 바꾼다. 문서 쪽의 정규화 규칙은
 * studio-bg3d-hierarchy 가 갖고(Studio 진입 그래프에 이미 닿아 있다), 이 모듈은 지연 로드되는 편집 경계에서만 쓴다.
 *
 * 태그 숨김은 오브젝트 가시성과 따로 움직인다: 숨긴 태그가 붙은 오브젝트는 `visible` 값을 바꾸지 않은 채 렌더에서만 빠진다.
 * 그래서 태그를 다시 보이게 해도 사용자가 따로 숨겨 둔 오브젝트는 숨겨진 채로 남는다.
 */

import { isStudioBg3dTagHidden } from "./studio-bg3d-hierarchy";

import type { StudioBg3dComponentRef, StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";

/** 구성 정보를 읽을 최소 엔티티(런타임 배열의 두 종류 모두 만족한다). */
export interface StudioBg3dOrganizationEntitySource {
  readonly id: string;
  readonly tags?: readonly string[];
  readonly componentRef?: StudioBg3dComponentRef;
  readonly visible?: boolean;
}

export interface StudioBg3dOrganizationTagSummary {
  readonly tag: string;
  /** 이 태그가 붙은 오브젝트 수. */
  readonly count: number;
  /** 숨긴 태그인가(오브젝트 `visible` 과 별개). */
  readonly hidden: boolean;
  readonly memberIds: readonly string[];
}

export interface StudioBg3dOrganizationComponentGroup {
  readonly id: string;
  /** 구성원이 가진 이름 중 첫 번째. 이름 바꾸기는 모든 구성원을 함께 바꾼다. */
  readonly name: string;
  readonly memberIds: readonly string[];
}

export interface StudioBg3dOrganizationView {
  readonly tags: readonly StudioBg3dOrganizationTagSummary[];
  readonly tagsByEntityId: ReadonlyMap<string, readonly string[]>;
  readonly hiddenTags: ReadonlySet<string>;
  /** 숨긴 태그 때문에 렌더에서 빠지는 오브젝트(자기 자신의 태그만 본다). */
  readonly tagHiddenIds: ReadonlySet<string>;
  readonly componentGroups: readonly StudioBg3dOrganizationComponentGroup[];
  readonly componentIdByEntityId: ReadonlyMap<string, string>;
  readonly meta: { readonly name: string; readonly memo: string };
}

const NO_TAGS: readonly string[] = Object.freeze([]);

/** 아웃라이너가 그릴 구성 정보 읽기 모델을 만든다. 엔티티 순서(프리미티브 → 모델)를 첫 등장 순서로 쓴다. */
export function buildStudioBg3dOrganizationView(input: {
  readonly entities: readonly StudioBg3dOrganizationEntitySource[];
  readonly document: Pick<StudioBg3dSceneDocument, "meta">;
}): StudioBg3dOrganizationView {
  const hiddenTags = new Set(input.document.meta?.hiddenTags ?? []);
  const membersByTag = new Map<string, string[]>();
  const tagsByEntityId = new Map<string, readonly string[]>();
  const groups = new Map<string, { name: string; memberIds: string[] }>();
  const componentIdByEntityId = new Map<string, string>();
  const tagHiddenIds = new Set<string>();

  for (const entity of input.entities) {
    const tags = entity.tags ?? NO_TAGS;
    if (tags.length > 0) {
      tagsByEntityId.set(entity.id, tags);
      for (const tag of tags) {
        const members = membersByTag.get(tag) ?? [];
        members.push(entity.id);
        membersByTag.set(tag, members);
      }
    }
    if (isStudioBg3dTagHidden(entity, hiddenTags)) tagHiddenIds.add(entity.id);
    const ref = entity.componentRef;
    if (ref) {
      const group = groups.get(ref.id) ?? { name: ref.name, memberIds: [] };
      group.memberIds.push(entity.id);
      groups.set(ref.id, group);
      componentIdByEntityId.set(entity.id, ref.id);
    }
  }

  const tags = [...membersByTag.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([tag, memberIds]) =>
      Object.freeze({ tag, count: memberIds.length, hidden: hiddenTags.has(tag), memberIds: Object.freeze(memberIds) }),
    );
  const componentGroups = [...groups.entries()].map(([id, group]) =>
    Object.freeze({ id, name: group.name, memberIds: Object.freeze(group.memberIds) }),
  );
  return Object.freeze({
    tags: Object.freeze(tags),
    tagsByEntityId,
    hiddenTags,
    tagHiddenIds,
    componentGroups: Object.freeze(componentGroups),
    componentIdByEntityId,
    meta: Object.freeze({
      name: input.document.meta?.name ?? "",
      memo: input.document.meta?.memo ?? "",
    }),
  });
}

/**
 * 숨긴 태그가 붙은 오브젝트를 렌더용으로 `visible: false` 로 바꾼 배열. 숨길 것이 없으면 입력 배열을 그대로 돌려줘
 * 참조가 바뀌지 않는다(불필요한 다시 그리기를 막는다). 저장되는 `visible` 은 이 투영과 무관하게 그대로다.
 */
export function projectStudioBg3dTagVisibility<T extends StudioBg3dOrganizationEntitySource>(
  entities: readonly T[],
  hiddenTags: ReadonlySet<string> | undefined,
): readonly T[] {
  if (hiddenTags === undefined || hiddenTags.size === 0) return entities;
  let changed = false;
  const projected = entities.map((entity) => {
    if (entity.visible === false || !isStudioBg3dTagHidden(entity, hiddenTags)) return entity;
    changed = true;
    return { ...entity, visible: false };
  });
  return changed ? projected : entities;
}

/** 문서의 숨긴 태그를 렌더용 집합으로 읽는다. 없으면 undefined. */
export function readStudioBg3dHiddenTagSet(
  document: Pick<StudioBg3dSceneDocument, "meta"> | undefined,
): ReadonlySet<string> | undefined {
  const hidden = document?.meta?.hiddenTags;
  return hidden && hidden.length > 0 ? new Set(hidden) : undefined;
}

/**
 * 숨긴 태그를 문서 노드의 `visible` 에 굽는다 — 문서를 렌더 전용 사본으로 쓰는 경로(특화 런타임 스냅샷)에서만 쓴다.
 * 저장하는 문서에는 쓰지 않는다. 숨길 노드가 없으면 같은 문서를 돌려준다.
 */
export function bakeStudioBg3dTagVisibilityIntoDocument(document: StudioBg3dSceneDocument): StudioBg3dSceneDocument {
  const hidden = readStudioBg3dHiddenTagSet(document);
  if (!hidden) return document;
  const nodes = projectStudioBg3dTagVisibility(document.nodes, hidden);
  return nodes === document.nodes ? document : { ...document, nodes };
}
