/**
 * Studio BG3D GLB 텍스처 페인트 — 호스트 연결 순수 로직 (D4 호스트 마운트, 2026-10-22).
 *
 * 뷰포트 포인터 이벤트(R3F ThreeEvent)를 페인트 세션의 대상 키로 바꾸는 판정과,
 * 확정 획을 인스턴스 페인트에 덧붙이는 병합을 순수 함수로 둔다. Three 객체는
 * 구조적 최소 계약(parent/children/userData/isMesh/material)으로만 읽어
 * 실제 Three 없이 단위 테스트할 수 있게 했다.
 *
 * 대상 키의 순서 규칙은 Three 어댑터(collectStudioBg3dGlbTexturePaintTargets)와
 * 같아야 한다: 편집 클론 루트를 깊이 우선으로 순회한 메시 순서(ordinal).
 * 호스트에서는 교차 객체에서 가장 가까운 엔티티 그룹(userData.studioBg3dEntityId)을
 * 루트로 삼되, 그 안에 중첩된 다른 엔티티의 서브트리는 세지 않는다 — 자식 엔티티는
 * 자기 BgCustomModelMesh 그룹 아래에 있어 부모 클론 순회에 포함되지 않기 때문이다.
 */

import {
  appendStudioBg3dTexturePaintStroke,
  type StudioBg3dTexturePaintStroke,
} from "./studio-bg3d-texture-paint";
import {
  createStudioBg3dModelTexturePaintTargetKey,
  getStudioBg3dModelTexturePaintForTarget,
  upsertStudioBg3dModelTexturePaintTarget,
  type StudioBg3dModelTexturePaint,
} from "./studio-bg3d-glb-texture-paint";

export interface StudioBg3dGlbPaintHitObjectLike {
  readonly isMesh?: boolean;
  readonly parent?: StudioBg3dGlbPaintHitObjectLike | null;
  readonly children?: readonly StudioBg3dGlbPaintHitObjectLike[];
  readonly material?: unknown;
  readonly userData?: { readonly studioBg3dEntityId?: unknown };
}

export interface StudioBg3dGlbPaintHitCandidate {
  readonly object?: StudioBg3dGlbPaintHitObjectLike | null;
  readonly face?: { readonly materialIndex?: unknown } | null;
}

/** R3F ThreeEvent의 구조적 부분집합 — 교차 객체와 교차 목록만 읽는다. */
export interface StudioBg3dGlbPaintEventLike extends StudioBg3dGlbPaintHitCandidate {
  readonly intersections?: readonly StudioBg3dGlbPaintHitCandidate[];
}

function entityIdOf(object: StudioBg3dGlbPaintHitObjectLike): string | null {
  const id = object.userData?.studioBg3dEntityId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** 교차 객체에서 가장 가까운 엔티티 그룹(루트)과 그 엔티티 id를 찾는다. */
export function findStudioBg3dGlbPaintEntityRoot(
  object: StudioBg3dGlbPaintHitObjectLike | null | undefined,
): { readonly root: StudioBg3dGlbPaintHitObjectLike; readonly entityId: string } | null {
  let current: StudioBg3dGlbPaintHitObjectLike | null | undefined = object;
  while (current) {
    const entityId = entityIdOf(current);
    if (entityId) return { root: current, entityId };
    current = current.parent;
  }
  return null;
}

/**
 * 엔티티 루트 순회에서 대상 메시의 ordinal을 센다. 중첩 엔티티 서브트리는
 * 건너뛴다(그 메시들은 자식 엔티티 자신의 클론 순회 몫이다).
 * 대상이 메시가 아니거나 순회 범위 밖에 있으면 null.
 */
export function countStudioBg3dGlbPaintMeshOrdinal(
  root: StudioBg3dGlbPaintHitObjectLike,
  target: StudioBg3dGlbPaintHitObjectLike,
): number | null {
  let ordinal = 0;
  let found: number | null = null;
  const visit = (node: StudioBg3dGlbPaintHitObjectLike, isRoot: boolean): void => {
    if (found !== null) return;
    if (!isRoot && entityIdOf(node)) return; // 중첩 엔티티 — 서브트리 전체를 건너뜀
    if (node.isMesh) {
      if (node === target) {
        found = ordinal;
        return;
      }
      ordinal += 1;
    }
    for (const child of node.children ?? []) {
      visit(child, false);
      if (found !== null) return;
    }
  };
  visit(root, true);
  return found;
}

function slotOf(candidate: StudioBg3dGlbPaintHitCandidate): number {
  const object = candidate.object;
  if (!object || !Array.isArray(object.material)) return 0;
  const materialIndex = candidate.face?.materialIndex;
  return Number.isSafeInteger(materialIndex) && (materialIndex as number) > 0
    ? (materialIndex as number)
    : 0;
}

/**
 * 포인터 이벤트에서 해당 엔티티의 페인트 대상 키를 정한다.
 * 이벤트 자체의 교차(첫 교차와 같은 경우가 많다)와 교차 목록을 순서대로 시도해,
 * 요청 엔티티에 속한 첫 교차로 판정한다 — 앞에 다른 엔티티가 가린 교차는 건너뛴다.
 */
export function resolveStudioBg3dGlbPaintTargetKey(
  event: StudioBg3dGlbPaintEventLike | null | undefined,
  entityId: string,
): string | null {
  if (!event || !entityId) return null;
  const candidates: StudioBg3dGlbPaintHitCandidate[] = [];
  const seen = new Set<StudioBg3dGlbPaintHitObjectLike>();
  const push = (candidate: StudioBg3dGlbPaintHitCandidate | null | undefined) => {
    if (!candidate?.object || seen.has(candidate.object)) return;
    seen.add(candidate.object);
    candidates.push(candidate);
  };
  push(event);
  for (const intersection of event.intersections ?? []) push(intersection);
  for (const candidate of candidates) {
    const found = findStudioBg3dGlbPaintEntityRoot(candidate.object);
    if (!found || found.entityId !== entityId) continue;
    const ordinal = countStudioBg3dGlbPaintMeshOrdinal(found.root, candidate.object!);
    if (ordinal === null) continue;
    return createStudioBg3dModelTexturePaintTargetKey(ordinal, slotOf(candidate));
  }
  return null;
}

/**
 * 확정 획 1개를 인스턴스 페인트의 대상에 덧붙인다. 획 한도·대상 한도에 닿으면
 * null — 호출자(호스트)는 기존 페인트를 그대로 유지해 부분 적용을 막는다.
 */
export function appendStudioBg3dGlbPaintStroke(
  paint: StudioBg3dModelTexturePaint | null | undefined,
  targetKey: string,
  stroke: StudioBg3dTexturePaintStroke,
): StudioBg3dModelTexturePaint | null {
  const current = getStudioBg3dModelTexturePaintForTarget(paint, targetKey);
  const appended = appendStudioBg3dTexturePaintStroke(current, stroke);
  if (!appended) return null;
  return upsertStudioBg3dModelTexturePaintTarget(paint, targetKey, appended);
}
