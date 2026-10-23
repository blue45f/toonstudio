/**
 * 생성 헤어용 두상 실측 — VRM 스킨 메시에서 머리 본이 지배하는 정점을 모은다(A-01).
 *
 * 규칙(실측 fixture 생성기 `scripts/generate-vrm-head-profile-fixtures.mts` 와 같다)
 *  - 스킨 메시만 본다. 헤어 카드·소품처럼 나중에 머리에 붙은 강체 오브젝트가 두상을 부풀리지 않게.
 *  - 정점의 **최대 가중치 본이 정확히 머리 본**일 때만 쓴다. 눈·턱·헤어 스프링 본이 주도하는 정점과
 *    머리 본 아래에 매달린 귀·리본 본의 정점은 빠진다.
 *  - 헤어로 분류되는 메시(이름·재질)와 생성 오브젝트(포지 헤어·워드로브 의상)는 뺀다.
 *  - 같은 정점 버퍼를 나눠 쓰는 프리미티브(VRoid baked)는 인덱스가 실제로 쓰는 정점만, 한 번씩.
 * 좌표는 현재 포즈의 스킨 위치를 정규화 머리 본 로컬로 옮긴 것이다. 머리 정점은 머리 본과 함께
 * 강체로 움직이므로 포즈가 바뀌어도 값이 거의 같다.
 */
import * as THREE from "three";

import { classifyMeshName } from "./studio-vrm-costume";
import {
  buildStudioVrmHeadProfile,
  resolveStudioVrmHeadFit,
  type StudioVrmHeadFit,
  type StudioVrmHeadProfile,
  type StudioVrmHeadVec3,
} from "./studio-vrm-head-fit";

import type { VRM } from "@pixiv/three-vrm";

export interface StudioVrmHeadMeasurement {
  readonly fit: StudioVrmHeadFit;
  readonly profile: StudioVrmHeadProfile | null;
  readonly sampleCount: number;
}

export interface StudioVrmHeadMeasureOptions {
  /** true 를 돌려주는 오브젝트(와 그 메시)는 두상에서 뺀다. 포지가 만든 헤어 등. */
  readonly skip?: (object: THREE.Object3D) => boolean;
}

/** 한 번에 모으는 머리 정점 상한. 초과분은 고르게 솎는다(측정은 리그 갱신 때만 돈다). */
const HEAD_POINT_BUDGET = 24_000;

function materialNames(mesh: THREE.Mesh): string[] {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.map((material) => material?.name ?? "").filter((name) => name.length > 0);
}

function isHairSurface(mesh: THREE.Mesh): boolean {
  if (classifyMeshName(mesh.name).protected === "hair") return true;
  return materialNames(mesh).some((name) => classifyMeshName(name).protected === "hair");
}

function skipped(object: THREE.Object3D, skip: StudioVrmHeadMeasureOptions["skip"]): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (skip?.(current)) return true;
    current = current.parent;
  }
  return false;
}

/** 정규화 머리 본 로컬의 머리 스킨 점(xyz 연속). 머리 본이 없거나 정점이 없으면 빈 배열. */
export function collectStudioVrmHeadSkinPoints(
  vrm: VRM,
  normalizedHead: THREE.Object3D,
  options: StudioVrmHeadMeasureOptions = {},
): Float32Array {
  const rawHead = vrm.humanoid?.getRawBoneNode("head") ?? null;
  if (!rawHead || !vrm.scene) return new Float32Array(0);
  vrm.scene.updateMatrixWorld(true);
  normalizedHead.updateWorldMatrix(true, false);
  const toHead = new THREE.Matrix4().copy(normalizedHead.matrixWorld).invert();
  const out: number[] = [];
  const visited = new Map<THREE.BufferAttribute | THREE.InterleavedBufferAttribute, Uint8Array>();
  const point = new THREE.Vector3();
  const toHeadFromMesh = new THREE.Matrix4();

  vrm.scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.visible || !mesh.skeleton) return;
    if (mesh.userData?.studioVrmSkinnedGarmentReceipt) return;
    if (skipped(mesh, options.skip) || isHairSurface(mesh)) return;
    const headIndex = mesh.skeleton.bones.indexOf(rawHead as THREE.Bone);
    if (headIndex < 0) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const skinIndex = geometry.getAttribute("skinIndex");
    const skinWeight = geometry.getAttribute("skinWeight");
    if (!position || !skinIndex || !skinWeight) return;
    let seen = visited.get(position);
    if (!seen) {
      seen = new Uint8Array(position.count);
      visited.set(position, seen);
    }
    toHeadFromMesh.multiplyMatrices(toHead, mesh.matrixWorld);
    const consider = (vertex: number) => {
      if (seen[vertex] === 1) return;
      seen[vertex] = 1;
      let bestBone = -1;
      let bestWeight = 0;
      for (let component = 0; component < 4; component += 1) {
        const weight = skinWeight.getComponent(vertex, component);
        if (weight > bestWeight) {
          bestWeight = weight;
          bestBone = skinIndex.getComponent(vertex, component);
        }
      }
      if (bestBone !== headIndex) return;
      mesh.getVertexPosition(vertex, point).applyMatrix4(toHeadFromMesh);
      if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) {
        out.push(point.x, point.y, point.z);
      }
    };
    const index = geometry.getIndex();
    if (index) {
      for (let item = 0; item < index.count; item += 1) consider(index.getX(item));
    } else {
      for (let vertex = 0; vertex < position.count; vertex += 1) consider(vertex);
    }
  });

  if (out.length / 3 <= HEAD_POINT_BUDGET) return Float32Array.from(out);
  const stride = Math.ceil(out.length / 3 / HEAD_POINT_BUDGET);
  const thinned: number[] = [];
  for (let vertex = 0; vertex < out.length / 3; vertex += stride) {
    thinned.push(out[vertex * 3], out[vertex * 3 + 1], out[vertex * 3 + 2]);
  }
  return Float32Array.from(thinned);
}

/**
 * VRM 규약상 VRM0 은 −z, VRM1 은 +z 를 본다(정규화 머리 본 로컬). 시선 설정이 있으면 그것이 우선이고,
 * 메타 버전도 없으면 눈 위치로 추정한다.
 */
export function resolveStudioVrmFrontSign(vrm: VRM, eyeCenter: StudioVrmHeadVec3 | null): 1 | -1 {
  const explicit = vrm.lookAt?.faceFront?.z;
  if (typeof explicit === "number" && Math.abs(explicit) > 0.5) return explicit < 0 ? -1 : 1;
  const version = vrm.meta?.metaVersion;
  if (version === "0") return -1;
  if (version === "1") return 1;
  if (eyeCenter && Math.abs(eyeCenter[2]) > 0.002) return eyeCenter[2] < 0 ? -1 : 1;
  return 1;
}

function localBonePosition(head: THREE.Object3D, bone: THREE.Object3D | null): THREE.Vector3 | null {
  if (!bone) return null;
  return head.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
}

/** 두상 실측 + 맞춤. 실측이 부족하면 눈 간격·키 대체로 떨어진다(`fit.source`). */
export function measureStudioVrmHeadFit(
  vrm: VRM,
  normalizedHead: THREE.Object3D,
  options: StudioVrmHeadMeasureOptions = {},
): StudioVrmHeadMeasurement {
  const points = collectStudioVrmHeadSkinPoints(vrm, normalizedHead, options);
  const leftEye = localBonePosition(normalizedHead, vrm.humanoid?.getNormalizedBoneNode("leftEye") ?? null);
  const rightEye = localBonePosition(normalizedHead, vrm.humanoid?.getNormalizedBoneNode("rightEye") ?? null);
  const eyeDistance = leftEye && rightEye ? leftEye.distanceTo(rightEye) : 0;
  const eyeCenter: StudioVrmHeadVec3 | null = leftEye && rightEye && eyeDistance > 1e-4
    ? [(leftEye.x + rightEye.x) / 2, (leftEye.y + rightEye.y) / 2, (leftEye.z + rightEye.z) / 2]
    : null;
  const frontSign = resolveStudioVrmFrontSign(vrm, eyeCenter);
  const profile = buildStudioVrmHeadProfile(points, frontSign);
  const sceneSize = new THREE.Box3().setFromObject(vrm.scene).getSize(new THREE.Vector3());
  const worldScale = normalizedHead.getWorldScale(new THREE.Vector3());
  const modelHeight = sceneSize.y / Math.max(0.001, Math.abs(worldScale.y));
  return {
    fit: resolveStudioVrmHeadFit({ profile, eyeCenter, eyeDistance, frontSign, modelHeight }),
    profile,
    sampleCount: points.length / 3,
  };
}
