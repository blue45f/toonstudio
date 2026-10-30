/** ShaderMaterial의 uniform 복제가 공유 TextureSource의 갱신 세대를 올리지 않게 한다. */
import type { MToonMaterial } from "@pixiv/three-vrm";
import { Texture } from "three";

import { shieldStudioMToonTextureSnapshotClone } from "./studio-mtoon-texture-snapshot";

/** SDK의 공개 map getter는 원본 receiver로 읽어 최종 sampler 참조를 그대로 유지한다. */
export function studioMToonWebGlCopySource<Source extends MToonMaterial>(source: Source): Source {
  const uniforms = Object.fromEntries(Object.entries(source.uniforms).map(([name, uniform]) => {
    const value: unknown = uniform.value;
    return [name, value instanceof Texture ? { ...uniform, value: shieldStudioMToonTextureSnapshotClone(value) } : uniform];
  }));
  return new Proxy(source, { get: (target, property) => property === "uniforms" ? uniforms : Reflect.get(target, property, target) });
}
