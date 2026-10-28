/** 안구 본 이름만으로 지원을 추정하지 않고, 현재 소스의 실제 스킨·부착 형상을 확인한다. */
import type { CharacterRig, RigBone } from "./character-rig";
import type { Bone } from "@babylonjs/core/Bones/bone.js";
import type { Geometry } from "@babylonjs/core/Meshes/geometry.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";

const SKIN_KINDS = ["matricesIndices", "matricesWeights", "matricesIndicesExtra", "matricesWeightsExtra"] as const;
interface SkinCache {
  readonly inputs: readonly unknown[];
  readonly joints: ReadonlySet<number>;
}
// 정적 로더 버퍼만 캐시한다. Geometry/전역 콜백은 변경하지 않으며 소스 해제 뒤 강한 참조를 남기지 않는다.
const skinCache = new WeakMap<Geometry, SkinCache>();

function positiveSkinJoints(mesh: Mesh): ReadonlySet<number> {
  const count = Math.min(8, Math.max(0, Math.floor(mesh.numBoneInfluencers)));
  const buffers = SKIN_KINDS.map((kind) => mesh.getVertexBuffer(kind));
  const inputs = [count, mesh.getTotalVertices(), ...buffers.flatMap((buffer) => [buffer, buffer?.getData(), buffer?.getBuffer()])];
  const geometry = mesh.geometry;
  const cacheable = buffers.every((buffer) => !buffer?.isUpdatable());
  const previous = geometry && cacheable ? skinCache.get(geometry) : undefined;
  if (previous && inputs.every((value, index) => previous.inputs[index] === value)) return previous.joints;
  const joints = new Set<number>();
  for (let group = 0; group < Math.ceil(count / 4); group += 1) {
    const indices = mesh.getVerticesData(SKIN_KINDS[group * 2] ?? "matricesIndices");
    const weights = mesh.getVerticesData(SKIN_KINDS[group * 2 + 1] ?? "matricesWeights");
    if (!indices || !weights) continue;
    const vertexCount = mesh.getTotalVertices();
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      for (let slot = 0; slot < Math.min(4, count - group * 4); slot += 1) {
        const offset = vertex * 4 + slot, joint = indices[offset], weight = weights[offset];
        if (joint !== undefined && Number.isInteger(joint) && joint >= 0 && weight !== undefined && Number.isFinite(weight) && weight > 0) joints.add(joint);
      }
    }
  }
  if (geometry && cacheable) skinCache.set(geometry, { inputs, joints });
  return joints;
}

function controlledBones(rig: CharacterRig, eye: RigBone): ReadonlySet<Bone> {
  // 로더가 본에 연결한 TransformNode와 실제 Bone 계층을 함께 본다. 보조 자식 본에만 가중치가 있을 수 있다.
  return new Set((rig.skeleton?.bones ?? []).filter((bone) => bone === eye.bone || bone.isDescendantOf(eye.bone) || bone.getTransformNode()?.isDescendantOf(eye.node)));
}

function eyeHasGeometry(rig: CharacterRig, eye: RigBone, skin: Map<Mesh, ReadonlySet<number>>): boolean {
  const bones = controlledBones(rig, eye);
  const indices = new Set([...bones].map((bone) => bone.getIndex()));
  for (const part of rig.parts) {
    if (part.forceHidden) continue;
    // 일시 숨김·슬롯 가시성은 소스의 지원 능력을 없애지 않는다. 외곽선 전용 복제 메시도 근거로 쓰지 않는다.
    for (const mesh of part.meshes) {
      if (mesh.isDisposed() || mesh.getTotalVertices() === 0) continue;
      if (mesh.isDescendantOf(eye.node) || [...bones].some((bone) => mesh.isDescendantOf(bone))) return true;
      if (mesh.skeleton !== rig.skeleton || !mesh.useBones) continue;
      const joints = skin.get(mesh) ?? positiveSkinJoints(mesh);
      skin.set(mesh, joints);
      if ([...joints].some((index) => indices.has(index))) return true;
    }
  }
  return false;
}

/** UI/F10이 읽을 때만 판정한다. 매 프레임 시선 적용 루프에서는 대형 버퍼를 스캔하지 않는다. */
export function eyeGeometryUnavailableReason(rig: CharacterRig | null): string | null {
  const left = rig?.humanoid.get("leftEye"), right = rig?.humanoid.get("rightEye");
  if (!rig || !left || !right) return "현재 소스에 매핑된 좌·우 안구 본이 모두 필요합니다.";
  const missing = [[left, "왼쪽"], [right, "오른쪽"]] as const;
  const skin = new Map<Mesh, ReadonlySet<number>>();
  const labels = missing.filter(([eye]) => !eyeHasGeometry(rig, eye, skin)).map(([, label]) => label);
  return labels.length > 0 ? `${labels.join("·")} 안구 본에 연결된 스킨 가중치 또는 부착 형상이 없습니다. 텍스처에만 그려진 눈은 이 본으로 시선을 바꿀 수 없습니다.` : null;
}
