import * as THREE from "three";

// glTF stores transforms as float32, so an exact uniform scale can arrive 1-2 ULPs apart
// (1 / 1.00000012 / 1). Admit that noise; keep materially non-uniform hierarchies fail-closed.
// Non-neutral writes collapse the admitted noise back to one scalar so it is never amplified.
const SCALE_EPSILON = 1e-6;
export const TRANSFORM_EPSILON = 1e-12;
const QUATERNION_UNIT_EPSILON = 1e-6;

export function allFinite(values: readonly number[]) {
  return values.every(Number.isFinite);
}

export function isUniformPositiveScale(scale: THREE.Vector3) {
  if (!allFinite(scale.toArray()) || scale.x <= 0 || scale.y <= 0 || scale.z <= 0) return false;
  const magnitude = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
  const spread = Math.max(scale.x, scale.y, scale.z) - Math.min(scale.x, scale.y, scale.z);
  return spread <= SCALE_EPSILON * magnitude;
}

function isUnitQuaternion(quaternion: THREE.Quaternion) {
  if (!allFinite(quaternion.toArray())) return false;
  return Math.abs(quaternion.lengthSq() - 1) <= QUATERNION_UNIT_EPSILON;
}

export function isFiniteInvertibleMatrix(matrix: THREE.Matrix4) {
  const determinant = matrix.determinant();
  return (
    allFinite(matrix.elements) &&
    Number.isFinite(determinant) &&
    Math.abs(determinant) > TRANSFORM_EPSILON
  );
}

function hasAutoUpdatedInvertibleLocalMatrix(node: THREE.Object3D) {
  if (node.matrixAutoUpdate !== true || node.matrixWorldAutoUpdate !== true) return false;
  return isFiniteInvertibleMatrix(
    new THREE.Matrix4().compose(node.position, node.quaternion, node.scale)
  );
}

function hasSafeTransform(node: THREE.Object3D) {
  return (
    allFinite(node.position.toArray()) &&
    isUnitQuaternion(node.quaternion) &&
    isUniformPositiveScale(node.scale) &&
    hasAutoUpdatedInvertibleLocalMatrix(node)
  );
}

/**
 * True when a non-uniform scale on `node` cannot reach anything rotatable below it. Humanoid
 * membership is not the test (an accessory/spring hierarchy below a head would still inherit
 * shear from a rotation). Safety means every immediate child cancels the non-uniform part
 * **without rotating** -- what the generated avatar's inverse-scale `HairRoot` pivot does.
 * A node with no children passes vacuously.
 */
export function containsNonUniformScale(node: THREE.Object3D) {
  if (isUniformPositiveScale(node.scale)) return true;
  return node.children.every((child) => {
    // The cancelling child must not rotate. `S . R . S^-1` is orthogonal only when `R` commutes with
    // `S`, so a rotation that mixes differently scaled axes still hands shear to everything below.
    if (!isUnitQuaternion(child.quaternion)) return false;
    if (Math.abs(child.quaternion.w) < 1 - QUATERNION_UNIT_EPSILON) return false;
    return isUniformPositiveScale(
      new THREE.Vector3(
        node.scale.x * child.scale.x,
        node.scale.y * child.scale.y,
        node.scale.z * child.scale.z,
      ),
    );
  });
}

/**
 * A leaf bone (no humanoid bone beneath it) may carry a non-uniform rest scale -- the sculpting
 * convention (`studio-vrm-humanoid-rig.ts`): shape lives on leaves so no rotated child inherits
 * shear. Everything else must still be finite, positive and invertible.
 */
function hasSafeLeafTransform(node: THREE.Object3D) {
  return (
    allFinite(node.position.toArray()) &&
    isUnitQuaternion(node.quaternion) &&
    allFinite(node.scale.toArray()) &&
    node.scale.x > 0 &&
    node.scale.y > 0 &&
    node.scale.z > 0 &&
    hasAutoUpdatedInvertibleLocalMatrix(node)
  );
}

export function classifyProportionFrame(node: THREE.Object3D, root: THREE.Object3D, carriesBones: boolean, allowUnmodifiedSourceRig: boolean) {
  if (node === root) return hasSafeLeafTransform(node) ? "editable" : "invalid";
  if (!carriesBones) return hasSafeLeafTransform(node) && containsNonUniformScale(node) ? "editable" : "invalid";
  if (hasSafeTransform(node)) return "editable";
  if (allowUnmodifiedSourceRig && hasSafeLeafTransform(node)) {
    // 오리온 양쪽 대퇴의 축별 차이는 최대 0.0031%다. 원본 재생에만 0.01%까지 허용한다.
    const { x, y, z } = node.scale;
    const max = Math.max(x, y, z);
    if (max - Math.min(x, y, z) <= max * 0.0001) return "original";
  }
  return "invalid";
}
