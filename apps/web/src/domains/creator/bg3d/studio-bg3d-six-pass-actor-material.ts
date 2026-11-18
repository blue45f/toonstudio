import * as THREE from "three";
import { studioSixPassActorForObject } from "./studio-bg3d-six-pass-cast";

export function studioSixPassPaintedOpacity(object: THREE.Object3D, material: THREE.Material): material is THREE.MeshStandardMaterial {
  return Boolean(studioSixPassActorForObject(object)) && material instanceof THREE.MeshStandardMaterial &&
    material.alphaMap instanceof THREE.Texture && material.blending === THREE.NormalBlending;
}

/** 같은 UV·스키닝·모프에서 alpha map을 표본화한다. 깊이/노멀/ID는 RGBA8에서 보이는 첫 표면을 기록한다. */
export function studioSixPassOpacityGeometry(object: THREE.Object3D, material: THREE.Material, kind: "depth" | "normal") {
  if (!studioSixPassPaintedOpacity(object, material)) return null;
  if (kind === "depth") return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: material.side, map: material.map,
    alphaMap: material.alphaMap, opacity: material.opacity, alphaTest: Math.max(material.alphaTest, 1 / 255), blending: THREE.NoBlending });
  const normal = new THREE.MeshLambertMaterial({ side: material.side, map: material.map, alphaMap: material.alphaMap,
    opacity: material.opacity, alphaTest: Math.max(material.alphaTest, 1 / 255), blending: THREE.NoBlending, toneMapped: false, fog: false });
  normal.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", "gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0);");
  };
  return normal;
}

/** 그림자량과 표면 피복을 서로 다른 채널에 담아 반투명 앞면에서도 뒷면 그림자를 올바르게 감쇠한다. */
export function studioSixPassCoverageShadow(source: THREE.Material, map: THREE.Texture | null) {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: source.side, map,
    alphaMap: "alphaMap" in source && source.alphaMap instanceof THREE.Texture ? source.alphaMap : null,
    opacity: source.opacity, alphaTest: source.alphaTest, transparent: source.transparent, toneMapped: false, fog: false });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <shadowmap_pars_fragment>", "#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>")
      .replace("#include <opaque_fragment>", "outgoingLight = vec3(1.0 - getShadowMask());\n#include <opaque_fragment>");
  };
  return material;
}

export function decodeStudioSixPassCoverageShadow(bytes: Uint8ClampedArray, output: string) {
  for (let i = 0; i < bytes.length; i += 4) {
    const encoded = bytes[i] / 255;
    const shade = output === THREE.SRGBColorSpace ? (encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4) : encoded;
    bytes[i + 3] = Math.round(bytes[i + 3] * shade);
    bytes[i] = bytes[i + 1] = bytes[i + 2] = 0;
  }
}
