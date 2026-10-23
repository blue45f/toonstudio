/**
 * 런타임 배열(BgPrimitive·BgCustomModelInstance)과 장면 문서 노드 사이에서 선택 필드를 옮기는 규칙.
 *
 * 연결 복제 원본(linkedSourceId)·태그·컴포넌트 참조는 모두 "없으면 키를 만들지 않는" 선택 필드라, 같은 규칙으로
 * 한곳에서 옮긴다. 태그는 편집 경계이므로 문서 규칙을 넘치게 받으면 앞쪽만 남기고(예산 오류로 저장 전체를 막지 않는다)
 * 올바르지 않은 항목은 버린다. 문서 쪽의 엄격한 판정은 장면 문서 정규화가 그대로 한다.
 *
 * 프리미티브만 가지는 두 필드 — 표면 직접 그리기 획(texturePaint)과 절차 재질 참조(surface) — 도 여기서 옮긴다.
 * 예전에는 이 규칙에 texturePaint 가 없어 런타임→문서 변환(저장·컷 기록 경로)과 문서→런타임 복원이 둘 다 획을
 * 버렸다(2026-10-23 확인). 모델은 이 두 필드를 갖지 않으므로 옮기지 않는다(모델 페인트는 modelTexturePaint 가 따로 있다).
 */

import {
  normalizeStudioBg3dComponentRef,
  normalizeStudioBg3dSurfaceRef,
  normalizeStudioBg3dTags,
} from "./studio-bg3d-hierarchy";
import { normalizeStudioBg3dTexturePaint } from "./studio-bg3d-texture-paint";

import type { StudioBg3dNodeOrganization, StudioBg3dTexturePaint } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dSurfaceRef } from "./studio-bg3d-scene-surface-types";

export interface StudioBg3dRuntimeNodeExtras extends StudioBg3dNodeOrganization {
  readonly linkedSourceId?: string;
  readonly texturePaint?: StudioBg3dTexturePaint;
}

/**
 * 런타임 항목에서 문서 노드로 옮길 선택 필드. 값이 없거나 올바르지 않으면 해당 키를 만들지 않는다.
 * 저장 모델 id(`modelId`)가 있는 항목은 모델이라 프리미티브 전용 필드를 옮기지 않는다.
 */
export function readStudioBg3dRuntimeNodeExtras(value: {
  readonly id: string;
  readonly linkedSourceId?: unknown;
  readonly tags?: unknown;
  readonly componentRef?: unknown;
  readonly modelId?: unknown;
  readonly surface?: unknown;
  readonly texturePaint?: unknown;
}): StudioBg3dRuntimeNodeExtras {
  const tags = normalizeStudioBg3dTags(value.tags, "node", "truncate");
  const componentRef = normalizeStudioBg3dComponentRef(value.componentRef);
  const primitive = typeof value.modelId !== "string";
  const surface = primitive ? normalizeStudioBg3dSurfaceRef(value.surface) : undefined;
  const texturePaint = primitive ? normalizeStudioBg3dTexturePaint(value.texturePaint) : null;
  return {
    // 노드는 자기 자신을 원본으로 삼을 수 없다.
    ...(typeof value.linkedSourceId === "string" && value.linkedSourceId !== value.id
      ? { linkedSourceId: value.linkedSourceId }
      : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(componentRef ? { componentRef } : {}),
    ...(surface ? { surface } : {}),
    ...(texturePaint ? { texturePaint } : {}),
  };
}

/** 문서 노드에서 런타임 항목으로 되돌릴 태그·컴포넌트 참조. 없으면 키를 만들지 않는다. */
export function studioBg3dNodeOrganizationToRuntime(node: StudioBg3dNodeOrganization): StudioBg3dNodeOrganization {
  return {
    ...(node.tags ? { tags: [...node.tags] } : {}),
    ...(node.componentRef ? { componentRef: { ...node.componentRef } } : {}),
  };
}

function copySurfaceRef(surface: StudioBg3dSurfaceRef): StudioBg3dSurfaceRef {
  return {
    ...surface,
    ...(surface.colors ? { colors: [...surface.colors] } : {}),
    ...(surface.overlay ? { overlay: { ...surface.overlay } } : {}),
    ...(surface.text ? { text: { ...surface.text } } : {}),
  };
}

function copyTexturePaint(paint: StudioBg3dTexturePaint): StudioBg3dTexturePaint {
  return {
    version: paint.version,
    strokes: paint.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => [point[0], point[1]] as const),
    })),
  };
}

/**
 * 문서 노드에서 런타임 항목으로 되돌릴 선택 필드 전체(연결 복제 원본 + 태그·컴포넌트 참조 + 프리미티브의 재질 참조·획).
 * 문서는 깊게 얼려 있으므로 런타임에는 사본을 넘긴다.
 */
export function studioBg3dNodeRuntimeExtras(
  node: StudioBg3dNodeOrganization & {
    readonly linkedSourceId?: string;
    readonly kind?: string;
    readonly texturePaint?: StudioBg3dTexturePaint;
  },
): StudioBg3dRuntimeNodeExtras {
  const primitive = node.kind === "primitive";
  return {
    linkedSourceId: node.linkedSourceId,
    ...studioBg3dNodeOrganizationToRuntime(node),
    ...(primitive && node.surface ? { surface: copySurfaceRef(node.surface) } : {}),
    ...(primitive && node.texturePaint ? { texturePaint: copyTexturePaint(node.texturePaint) } : {}),
  };
}
