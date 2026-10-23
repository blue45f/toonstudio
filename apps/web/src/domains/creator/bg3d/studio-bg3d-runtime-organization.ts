/**
 * 런타임 배열(BgPrimitive·BgCustomModelInstance)과 장면 문서 노드 사이에서 선택 필드를 옮기는 규칙.
 *
 * 연결 복제 원본(linkedSourceId)·태그·컴포넌트 참조는 모두 "없으면 키를 만들지 않는" 선택 필드라, 같은 규칙으로
 * 한곳에서 옮긴다. 태그는 편집 경계이므로 문서 규칙을 넘치게 받으면 앞쪽만 남기고(예산 오류로 저장 전체를 막지 않는다)
 * 올바르지 않은 항목은 버린다. 문서 쪽의 엄격한 판정은 장면 문서 정규화가 그대로 한다.
 */

import {
  normalizeStudioBg3dComponentRef,
  normalizeStudioBg3dTags,
} from "./studio-bg3d-hierarchy";

import type { StudioBg3dNodeOrganization } from "./studio-bg3d-scene-document-types";

export interface StudioBg3dRuntimeNodeExtras extends StudioBg3dNodeOrganization {
  readonly linkedSourceId?: string;
}

/** 런타임 항목에서 문서 노드로 옮길 선택 필드. 값이 없거나 올바르지 않으면 해당 키를 만들지 않는다. */
export function readStudioBg3dRuntimeNodeExtras(value: {
  readonly id: string;
  readonly linkedSourceId?: unknown;
  readonly tags?: unknown;
  readonly componentRef?: unknown;
}): StudioBg3dRuntimeNodeExtras {
  const tags = normalizeStudioBg3dTags(value.tags, "node", "truncate");
  const componentRef = normalizeStudioBg3dComponentRef(value.componentRef);
  return {
    // 노드는 자기 자신을 원본으로 삼을 수 없다.
    ...(typeof value.linkedSourceId === "string" && value.linkedSourceId !== value.id
      ? { linkedSourceId: value.linkedSourceId }
      : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(componentRef ? { componentRef } : {}),
  };
}

/** 문서 노드에서 런타임 항목으로 되돌릴 태그·컴포넌트 참조. 없으면 키를 만들지 않는다. */
export function studioBg3dNodeOrganizationToRuntime(node: StudioBg3dNodeOrganization): StudioBg3dNodeOrganization {
  return {
    ...(node.tags ? { tags: [...node.tags] } : {}),
    ...(node.componentRef ? { componentRef: { ...node.componentRef } } : {}),
  };
}

/** 문서 노드에서 런타임 항목으로 되돌릴 선택 필드 전체(연결 복제 원본 + 태그·컴포넌트 참조). */
export function studioBg3dNodeRuntimeExtras(
  node: StudioBg3dNodeOrganization & { readonly linkedSourceId?: string },
): StudioBg3dRuntimeNodeExtras {
  return { linkedSourceId: node.linkedSourceId, ...studioBg3dNodeOrganizationToRuntime(node) };
}
