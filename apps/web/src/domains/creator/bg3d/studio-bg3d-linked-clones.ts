import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document";

/**
 * 연결 복제(linked clone) 규칙 — 순수 함수 모듈.
 *
 * 연결 복제는 원본과 "외형"만 공유한다: 프리미티브는 color + materialOverride, 모델은
 * materialOverride가 동기화 대상이다. 위치·회전·크기(transform), 이름, 표시, 잠금, 계층은
 * 복제본마다 독립이다. 그림자 플래그는 런타임 타입이 들고 있지 않아(문서 층에서 상수 true로
 * 변환됨) 동기화 대상이 아니다.
 *
 * 링크는 항상 루트 원본을 가리킨다(체인 금지). 원본이 삭제되면 링크는 다음 동기화에서
 * 조용히 해제되고 복제본은 마지막 외형을 유지한 독립 객체가 된다.
 */

type LinkedEntity = BgPrimitive | BgCustomModelInstance;

function materialOverridesEqual(
  left: StudioBg3dMaterialOverride | undefined,
  right: StudioBg3dMaterialOverride | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.colorMode === right.colorMode
    && left.color === right.color
    && left.colorStrength === right.colorStrength
    && left.opacityMultiplier === right.opacityMultiplier
    && left.roughness === right.roughness
    && left.metalness === right.metalness
    && left.emissiveColor === right.emissiveColor
    && left.emissiveIntensity === right.emissiveIntensity
    && left.wireframe === right.wireframe
    && left.doubleSided === right.doubleSided
  );
}

/**
 * Resolve the root source id for a new linked clone of `entity`: an unlinked entity is its own
 * root; a linked clone's root is its (already root) linkedSourceId, so chains never form.
 * Returns null when the entity already links to itself or the id is empty (defensive).
 */
export function resolveLinkedCloneRootId(entity: LinkedEntity): string | null {
  const root = entity.linkedSourceId ?? entity.id;
  if (!root || root === "") return null;
  return root;
}

/**
 * Apply appearance sync from link roots to linked clones across both runtime arrays.
 * Returns the input arrays by identity when nothing changed (fast path the canonical fence
 * relies on to keep its no-op detection intact).
 */
export function syncLinkedCloneAppearance(input: {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
}): { primitives: BgPrimitive[]; customModels: BgCustomModelInstance[]; changed: boolean } {
  const unchanged = {
    primitives: input.primitives as BgPrimitive[],
    customModels: input.customModels as BgCustomModelInstance[],
    changed: false,
  };
  const hasLinks =
    input.primitives.some((primitive) => primitive.linkedSourceId)
    || input.customModels.some((model) => model.linkedSourceId);
  if (!hasLinks) return unchanged;

  const primitiveById = new Map(input.primitives.map((primitive) => [primitive.id, primitive]));
  const modelById = new Map(input.customModels.map((model) => [model.id, model]));

  let changed = false;

  const nextPrimitives = input.primitives.map((primitive) => {
    const sourceId = primitive.linkedSourceId;
    if (!sourceId) return primitive;
    const root = primitiveById.get(sourceId);
    if (!root || root.id === primitive.id) {
      // Dangling or self link: unlink, keep last appearance.
      changed = true;
      return { ...primitive, linkedSourceId: undefined };
    }
    if (
      root.color === primitive.color
      && materialOverridesEqual(root.materialOverride, primitive.materialOverride)
    ) {
      return primitive;
    }
    changed = true;
    return {
      ...primitive,
      color: root.color,
      materialOverride: root.materialOverride ? { ...root.materialOverride } : undefined,
    };
  });

  const nextModels = input.customModels.map((model) => {
    const sourceId = model.linkedSourceId;
    if (!sourceId) return model;
    const root = modelById.get(sourceId);
    if (!root || root.id === model.id) {
      changed = true;
      return { ...model, linkedSourceId: undefined };
    }
    if (materialOverridesEqual(root.materialOverride, model.materialOverride)) return model;
    changed = true;
    return {
      ...model,
      materialOverride: root.materialOverride ? { ...root.materialOverride } : undefined,
    };
  });

  if (!changed) return unchanged;
  return { primitives: nextPrimitives, customModels: nextModels, changed: true };
}
