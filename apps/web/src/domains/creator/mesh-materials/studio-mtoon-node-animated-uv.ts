/** SDK 3.5.5의 공개 UV 노드와 같은 식이며 VRMC_materials_mtoon의 linear B mask만 바로잡는다. */
import { MToonAnimatedUVNode } from "@pixiv/three-vrm/nodes";
import { cos, float, mat2, materialReference, nodeObject, sin, uv, vec2 } from "three/tsl";
import { ConvertNode, type Node } from "three/webgpu";

import type { Material } from "three";

export class StudioMToonAnimatedUVNode extends MToonAnimatedUVNode {
  /** geometry pass는 원본 재질을 명시하고, 본체는 현재 builder 재질을 참조한다. */
  constructor(hasMaskTexture: boolean, private readonly referenceMaterial: Material | null = null) { super(hasMaskTexture); }

  override setup(): ReturnType<MToonAnimatedUVNode["setup"]> {
    // 공개 변환 노드로 출력형을 명시한다. null일 때 builder material을 읽는 참조 계약은 유지한다.
    const scalar = (name: string) => nodeObject(new ConvertNode<"float">(materialReference(name, "float", this.referenceMaterial), "float"));
    let mask: Node<"float"> = float(1);
    if (this.hasMaskTexture) {
      const texture = nodeObject(new ConvertNode<"vec4">(materialReference("uvAnimationMaskTexture", "texture", this.referenceMaterial), "vec4"));
      mask = texture.context({ getUV: () => uv() }).b;
    }
    const phase = scalar("uvAnimationRotationPhase").mul(mask), c = cos(phase), s = sin(phase);
    // SDK의 row-vector 회전, 중심 복귀, scroll 순서와 texture별 후속 UV transform을 유지한다.
    let animated = uv().sub(vec2(0.5, 0.5));
    animated = animated.mul(mat2(c, s, s.negate(), c));
    animated = animated.add(vec2(0.5, 0.5));
    const scroll = vec2(scalar("uvAnimationScrollXOffset"), scalar("uvAnimationScrollYOffset")).mul(mask);
    return animated.add(scroll).toVar("AnimatedUV");
  }
}

const ownedSetup = StudioMToonAnimatedUVNode.prototype.setup;
/** 공유 prototype 변경은 등록된 본체 재질에서도 즉시 미승인으로 처리한다. */
export function isStudioMToonAnimatedUvContractCurrent(): boolean {
  return StudioMToonAnimatedUVNode.prototype.setup === ownedSetup;
}
