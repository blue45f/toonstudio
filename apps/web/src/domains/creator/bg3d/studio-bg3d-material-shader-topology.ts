import {
  ColorManagement,
  NormalBlending,
  RED_GREEN_RGTC2_Format,
  RG11_EAC_Format,
  RGFormat,
  SRGBTransfer,
  TangentSpaceNormalMap,
} from "three";
import type { MeshStandardMaterial, Texture } from "three";

const shaderTopologies = new WeakMap<MeshStandardMaterial, string>();

function textureChannel(texture: Texture | null): number | string {
  return texture === null ? "none" : texture.channel;
}

function usesPackedNormalMap(material: MeshStandardMaterial): boolean {
  const normal = material.normalMap;
  return normal !== null && material.normalMapType === TangentSpaceNormalMap && (
    normal.format === RGFormat
    || normal.format === RG11_EAC_Format
    || normal.format === RED_GREEN_RGTC2_Format
  );
}

function decodesSrgbVideoMap(texture: Texture | null): boolean {
  return texture !== null && "isVideoTexture" in texture && texture.isVideoTexture === true
    && ColorManagement.getTransfer(texture.colorSpace) === SRGBTransfer;
}

/** R3F가 적용한 맵의 shader 구성이 바뀔 때만 기존 표준 재질을 재컴파일한다. */
export function updateStudioBg3dStandardMaterialShaderTopology(material: MeshStandardMaterial): void {
  // Three 프로그램 키의 채널·불투명·면 방향만 기록하고 Texture identity와 uniform 값은 제외한다.
  const topology = [
    textureChannel(material.map),
    textureChannel(material.roughnessMap),
    textureChannel(material.metalnessMap),
    textureChannel(material.normalMap),
    textureChannel(material.aoMap),
    material.normalMap === null ? "none" : material.normalMapType,
    usesPackedNormalMap(material),
    decodesSrgbVideoMap(material.map),
    material.transparent === false && material.blending === NormalBlending && material.alphaToCoverage === false,
    material.side,
    material.alphaToCoverage,
  ].join("|");
  const previous = shaderTopologies.get(material);
  shaderTopologies.set(material, topology);
  // 최초 onUpdate는 첫 렌더 전 초기 props 적용에서도 호출되므로 기준만 저장한다.
  if (previous !== undefined && previous !== topology) material.needsUpdate = true;
}
