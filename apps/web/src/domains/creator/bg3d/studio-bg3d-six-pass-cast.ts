import type { Object3D } from "three";

import type { StudioBg3dSixPassActorPixels } from "../studio-shared-3d-insert-contract";

export type { StudioBg3dSixPassActorPixels } from "../studio-shared-3d-insert-contract";
type Source = Omit<StudioBg3dSixPassActorPixels, "pixels">;
const mounted = new WeakMap<Object3D, Source>();

/** 파일의 userData와 분리해 편집 세션이 실제로 마운트한 배우만 식별한다. */
export function registerStudioSixPassActor(object: Object3D | null, actor: Source) {
  if (!object) return;
  mounted.set(object, { elementId: actor.elementId, sourceHash: actor.sourceHash, placementHash: actor.placementHash });
  return () => { mounted.delete(object); };
}
export function studioSixPassActorForObject(object: Object3D): Source | undefined {
  for (let entry: Object3D | null = object; entry; entry = entry.parent) {
    const actor = mounted.get(entry);
    if (actor) return actor;
  }
  return undefined;
}

export function assertStudioSixPassActorCoverage(expected: readonly Source[], actual: readonly StudioBg3dSixPassActorPixels[] | undefined, area: number) {
  if (!expected.length || expected.length > 12 || !actual || actual.length !== expected.length
    || new Set(expected.map(actor => actor.elementId)).size !== expected.length || new Set(actual.map(actor => actor.elementId)).size !== actual.length
    || actual.reduce((total, actor) => total + actor.pixels, 0) > area) throw new Error("고정 컷과 렌더된 배우 목록이 다릅니다.");
  for (const actor of expected) {
    const matched = actual.find(entry => entry.elementId === actor.elementId);
    if (!matched || matched.sourceHash !== actor.sourceHash || matched.placementHash !== actor.placementHash
      || !Number.isSafeInteger(matched.pixels) || matched.pixels <= 0) throw new Error("화면에 보이지 않거나 원본·배치가 달라진 배우가 있습니다. 컷 카메라와 모델을 확인해 주세요.");
  }
}
