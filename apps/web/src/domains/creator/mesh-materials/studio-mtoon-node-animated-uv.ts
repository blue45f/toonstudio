/** SDK 3.5.5의 공개 UV 노드와 같은 식이며 VRMC_materials_mtoon의 linear B mask만 바로잡는다. */
import { MToonAnimatedUVNode } from "@pixiv/three-vrm/nodes";
import { cos, float, mat2, materialReference, sin, uv, vec2, vec4 } from "three/tsl";

import type { Material } from "three";

export class StudioMToonAnimatedUVNode extends MToonAnimatedUVNode {
  /** geometry pass는 원본 재질을 명시하고, 본체는 현재 builder 재질을 참조한다. */
  constructor(hasMaskTexture: boolean, private readonly referenceMaterial: Material | null = null) { super(hasMaskTexture); }

  override setup(): ReturnType<MToonAnimatedUVNode["setup"]> {
    const reference = (name: string, type: string) => materialReference(name, type, this.referenceMaterial);
    let mask = float(1);
    if (this.hasMaskTexture) mask = vec4(reference("uvAnimationMaskTexture", "texture")).context({ getUV: () => uv() }).b;
    const phase = reference("uvAnimationRotationPhase", "float").mul(mask), c = cos(phase), s = sin(phase);
    // SDK의 row-vector 회전, 중심 복귀, scroll 순서와 texture별 후속 UV transform을 유지한다.
    let animated = uv().sub(vec2(0.5, 0.5));
    animated = animated.mul(mat2(c, s, s.negate(), c));
    animated = animated.add(vec2(0.5, 0.5));
    const scroll = vec2(reference("uvAnimationScrollXOffset", "float"), reference("uvAnimationScrollYOffset", "float")).mul(mask);
    return animated.add(scroll).toVar("AnimatedUV");
  }
}

const ownedSetup = StudioMToonAnimatedUVNode.prototype.setup;
/** 공유 prototype 변경은 등록된 본체 재질에서도 즉시 미승인으로 처리한다. */
export function isStudioMToonAnimatedUvContractCurrent(): boolean {
  return StudioMToonAnimatedUVNode.prototype.setup === ownedSetup;
}
