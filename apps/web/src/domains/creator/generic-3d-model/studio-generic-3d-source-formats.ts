/**
 * Renderer-neutral product boundary for imported models which are not VRM avatars.
 *
 * VRM has a separate license, expression, humanoid-bone, and runtime contract. Keeping `vrm` out
 * of this union prevents an ordinary prop/character workflow from silently depending on VRM APIs.
 */
export const STUDIO_GENERIC_3D_SOURCE_FORMATS = [
  "glb",
  "gltf",
  "obj",
  "obj-mtl",
  // 임포트 변환기(studio-bg3d-model-import.ts)의 1차 포맷 9종과 정합시킨 확장분.
  // 이 열거에 없어서 임포트 결과가 "glb"로 뭉개지던 포맷들이다 (설계 §5-4).
  // canonicalFormat은 여전히 "glb" — 원본 포맷 표기만 보존하고 저장은 GLB가 정본이다.
  "fbx",
  "dae",
  "stl",
  "ply",
  "3ds",
  "skp",
] as const;

export type StudioGeneric3dSourceFormat =
  (typeof STUDIO_GENERIC_3D_SOURCE_FORMATS)[number];
