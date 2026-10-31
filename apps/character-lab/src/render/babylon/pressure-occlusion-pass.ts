/** 몸통 필압 윤곽선의 의상 stencil은 실제 주 카메라와 등록한 lit 캡처에만 쓴다. */
import type { Scene } from "@babylonjs/core/scene.js";

const litPasses = new WeakMap<Scene, Map<number, number>>();

/** 같은 타깃의 중첩 소유를 구분하며, 타깃 해제 시 돌려주는 등록만 제거한다. */
export function registerPressureOcclusionRenderPass(scene: Scene, renderPassId: number): () => void {
  if (!Number.isSafeInteger(renderPassId) || renderPassId < 0) throw new RangeError("의상 가림 렌더 패스 ID가 올바르지 않습니다.");
  if (scene.isDisposed) throw new Error("해제된 장면에는 의상 가림 렌더 패스를 등록할 수 없습니다.");
  let passes = litPasses.get(scene);
  if (!passes) {
    const created = new Map<number, number>();
    passes = created;
    litPasses.set(scene, created);
    scene.onDisposeObservable.addOnce(() => {
      created.clear();
      litPasses.delete(scene);
    });
  }
  const owned = passes;
  owned.set(renderPassId, (owned.get(renderPassId) ?? 0) + 1);
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    const count = owned.get(renderPassId) ?? 0;
    if (count > 1) owned.set(renderPassId, count - 1);
    else owned.delete(renderPassId);
  };
}

/** 타깃 이름이나 카메라 이름을 권한으로 쓰지 않는다. shadow·비 lit RTT는 등록하지 않는다. */
export function isPressureOcclusionRenderPass(scene: Scene): boolean {
  if (scene.isDisposed || !scene.activeCamera) return false;
  const pass = scene.getEngine().currentRenderPassId;
  return pass === scene.activeCamera.renderPassId || (litPasses.get(scene)?.get(pass) ?? 0) > 0;
}
