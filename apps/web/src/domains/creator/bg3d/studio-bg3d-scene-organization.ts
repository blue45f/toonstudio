/**
 * 장면 구성 정보(태그·컴포넌트 묶음·장면 메타)의 읽기 모델.
 *
 * 순수 모듈이다. 편집기가 쥔 런타임 배열(BgPrimitive·BgCustomModelInstance)과 정본 문서만 읽어
 * 아웃라이너가 그릴 값을 만든다. 문서 쪽의 정규화 규칙과 태그 숨김의 렌더 투영(projectStudioBg3dTagVisibility)은
 * studio-bg3d-hierarchy 가 갖고(Studio 진입 그래프에 이미 닿아 있다), 이 모듈은 지연 로드되는 편집 경계에서만 쓴다.
 *
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
