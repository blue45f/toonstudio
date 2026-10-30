import { Matrix3, MeshStandardMaterial, type Material, type Texture } from "three";
import { StudioBg3dSceneGlbGraphError } from "./studio-bg3d-scene-glb-errors";

function close(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 128 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}
function fail(nodeId: string, reason: string): never {
  throw new StudioBg3dSceneGlbGraphError("unsupported-feature", [nodeId], reason);
}

export type StudioBg3dSceneGlbMetalRoughPacking = "shared-only" | "deferred-owned";
/** 기본은 공유 ORM만 허용한다. artifact만 후속 개인 packing을 책임지고 선차단을 유예한다. */
export function assertStudioBg3dSceneGlbPackedMapCompatibility(material: Material, nodeId: string,
  packing: StudioBg3dSceneGlbMetalRoughPacking = "shared-only"): void {
  if (packing !== "deferred-owned" && material instanceof MeshStandardMaterial && material.metalnessMap && material.roughnessMap
    && material.metalnessMap !== material.roughnessMap) fail(nodeId, "separate-metal-rough-textures-require-owned-packing");
}

/** 자기 소유 texture만 받는다. exporter가 무시하는 center/manual matrix를 동등한 KHR 파라미터로 바꾼다. */
export function normalizeStudioBg3dSceneGlbTextureTransform(texture: Texture, nodeId: string): void {
  if (texture.matrixAutoUpdate) texture.updateMatrix();
  const expected = texture.matrix.clone(), e = expected.elements;
  if (!e.every(Number.isFinite)) fail(nodeId, "texture-uv-matrix-not-finite");
  if (e[2] !== 0 || e[5] !== 0 || e[8] !== 1) fail(nodeId, "texture-uv-projective-matrix");
  // 실제 GLTFLoader KHR 경로는 R(-rotation) × diag(scale)다. Three.setUvTransform의 S×R와 다르다.
  const sx = Math.hypot(e[0], e[1]); let sy: number, rotation: number;
  if (sx > 0) {
    rotation = Math.atan2(-e[1], e[0]);
    sy = e[3] * Math.sin(rotation) + e[4] * Math.cos(rotation);
  } else {
    sy = Math.hypot(e[3], e[4]); rotation = sy > 0 ? Math.atan2(e[3], e[4]) : 0;
  }
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const recomposed = new Matrix3().set(sx * c, sy * s, e[6], -sx * s, sy * c, e[7], 0, 0, 1);
  if (!recomposed.elements.every((value, index) => close(value, e[index]))) fail(nodeId, "texture-uv-shear-or-decomposition");
  texture.offset.set(e[6], e[7]); texture.repeat.set(sx, sy); texture.rotation = rotation;
  // 자동 S×R 갱신은 다시 순서를 바꾸므로 실제 행렬을 유지한다. exporter는 동등 KHR params를 읽는다.
  texture.center.set(0, 0); texture.matrixAutoUpdate = false; texture.matrix.copy(recomposed);
}
