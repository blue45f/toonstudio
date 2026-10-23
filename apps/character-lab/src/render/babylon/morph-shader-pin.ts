/**
 * morph 셰이더 변종 고정. Babylon 텍스처 모드 morph 셰이더는 define `NUM_MORPH_INFLUENCERS`를 **활성 타깃 수**(influence > 0)로 잡는다
 * (`numMaxInfluencers`가 0일 때). 그래서 슬라이더를 0에서 움직이거나 프리셋이 활성 morph 수를 바꿀 때마다 그 메시를 쓰는 모든 재질의 셰이더를
 * 새로 만든다 — 실측(2026-10-23, M2 Max WebGL2 개발 서버): 슬라이더 1회 뒤 셰이더 처리(ProcessIncludes·createEffect)만 약 1초.
 * `numMaxInfluencers`를 그 매니저의 타깃 수로 고정하면 셰이더는 한 번만 컴파일되고 실제 활성 수는 uniform(`morphTargetCount`)으로 넘어간다
 * (Babylon 문서 권장, 상한을 넘는 타깃이 잘리지 않도록 전체 타깃 수로 둔다).
 * 텍스처 모드가 아닌 엔진(정점 속성 모드, 최대 8개)에서는 손대지 않는다 — 속성 수가 넘쳐 셰이더 컴파일이 실패한다.
 */
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";

/**
 * 텍스처 모드 매니저의 morph 셰이더 define을 전체 타깃 수로 고정한다. 이미 같으면 아무것도 하지 않는다(매 플랜 호출해도 싸다).
 * `targetCount`는 갱신을 얼린 채 타깃을 더하는 중이면 더할 타깃 수를 준다(얼린 동안 `numTargets`는 아직 0일 수 있다).
 */
export function pinMorphInfluencerCount(manager: MorphTargetManager | null | undefined, engine: AbstractEngine, targetCount: number = manager?.numTargets ?? 0): void {
  if (!manager || targetCount <= 0 || !manager.isUsingTextureForTargets) return;
  // Babylon은 타깃 수가 텍스처 배열 층 한도를 넘으면 정점 속성 모드로 내려간다(그때는 고정하지 않는다).
  const layerLimit = engine.getCaps().texture2DArrayMaxLayerCount;
  if (!(layerLimit > 1) || targetCount > layerLimit) return;
  if (manager.numMaxInfluencers === targetCount) return;
  manager.numMaxInfluencers = targetCount;
}
