import * as THREE from "three";

import { isStudioAuthoredAttachment } from "./studio-vrm-authored-attachment";
import { getStudioVrmHeadSkinVertices } from "./studio-vrm-head-skin-vertices";

import type { VrmPropFaceSocket } from "./studio-vrm-prop-rig";
import type { PropAttachBone, Vec3 } from "./studio-vrm-props";
import type { VRM } from "@pixiv/three-vrm";

function isCustomAttachmentMesh(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (
      current.userData.toonSpectrumAvatarForge === true
      || current.userData.studioVrmCustomPartOutline === true
      || typeof current.userData.characterAuthoringDerivative === "string"
      || current.userData.characterCanonicalPart === true
      || current.name.startsWith("wardrobe:")
      || current.name.startsWith("prop:")
    ) {
      return true;
    }
    current = current.parent;
  }
  return isStudioAuthoredAttachment(object);
}

export interface StudioVrmHeadSurface {
  head: number;
  eyeDistance: number;
  eyeDistanceSource: "measured" | "derived";
  faceSocket: VrmPropFaceSocket;
}

const SAMPLE_BUDGET = 24_000;
const MIN_SAMPLES = 80;

function quantile(values: number[], fraction: number): number {
  values.sort((a, b) => a - b);
  return values[Math.floor((values.length - 1) * fraction)]!;
}

/** Bounded, pose-aware surface measurement. Bone pivots are not skull dimensions. */
export function measureStudioVrmHeadSurface(vrm: VRM): StudioVrmHeadSurface | null {
  const head = vrm.humanoid?.getNormalizedBoneNode("head");
  const rawHead = vrm.humanoid?.getRawBoneNode?.("head");
  if (!head || !rawHead || !vrm.scene?.traverse) return null;
  vrm.scene.updateMatrixWorld(true);
  head.updateWorldMatrix(true, false);
  const facing = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0), vrm.meta?.metaVersion === "0" ? Math.PI : 0,
  );
  const inverseFacing = facing.clone().invert();
  const inverseHead = head.matrixWorld.clone().invert();
  const headDescendants = new Set<THREE.Object3D>();
  rawHead.traverse((object) => { headDescendants.add(object); });
  const meshes: THREE.SkinnedMesh[] = [];
  let vertexCount = 0;
  vrm.scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.visible || isCustomAttachmentMesh(mesh)) return;
    const geometry = mesh.geometry;
    if (!geometry.getAttribute("position") || !geometry.getAttribute("skinIndex") || !geometry.getAttribute("skinWeight")) return;
    meshes.push(mesh);
    vertexCount += geometry.getAttribute("position").count;
  });
  const stride = Math.max(1, Math.ceil(vertexCount / SAMPLE_BUDGET));
  const points: THREE.Vector3[] = [];
  const skinPoints: THREE.Vector3[] = [];
  let visited = 0;
  for (const mesh of meshes) {
    if (visited >= SAMPLE_BUDGET) break;
    mesh.skeleton.update();
    const eligible = mesh.skeleton.bones.map((bone) => headDescendants.has(bone));
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const indices = geometry.getAttribute("skinIndex");
    const weights = geometry.getAttribute("skinWeight");
    if (!eligible.some(Boolean)) continue;
    const skin = getStudioVrmHeadSkinVertices(mesh);
    const allSkin = skin.count === position.count;
    const skinIndices = !allSkin && skin.indices ? new Set(skin.indices) : null;
    const toHead = inverseHead.clone().multiply(mesh.matrixWorld);
    for (let index = 0; index < position.count && visited < SAMPLE_BUDGET; index += stride) {
      visited++;
      let influence = 0;
      for (let component = 0; component < 4; component++) {
        if (eligible[indices.getComponent(index, component)]) influence += weights.getComponent(index, component);
      }
      if (influence < 0.5) continue;
      const point = mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(toHead).applyQuaternion(inverseFacing);
      if (![point.x, point.y, point.z].every(Number.isFinite)) continue;
      // Discard neck, hanging hair and remote head-weighted decorations.
      if (point.y <= 0.004 || point.y > 0.48 || Math.abs(point.x) > 0.30 || Math.abs(point.z) > 0.30) continue;
      points.push(point);
      // 모자 여유 높이에는 헤어를 포함하고, 안경이 닿는 콧등 깊이는 얼굴 표면에서만 잰다.
      if (allSkin || skinIndices?.has(index)) skinPoints.push(point);
    }
  }
  if (points.length < MIN_SAMPLES) return null;
  const top = quantile(points.map((point) => point.y), 0.98);
  const width = quantile(points.map((point) => point.x), 0.975) - quantile(points.map((point) => point.x), 0.025);
  if (top < 0.06 || top > 0.45 || width < 0.07 || width > 0.42) return null;
  let eyeY = top * 0.56;
  let eyeDistance = width * 0.35;
  let eyeDistanceSource: "measured" | "derived" = "derived";
  const eyes = ["leftEye", "rightEye"] as const;
  const eyeNodes = eyes.map((name) => vrm.humanoid.getNormalizedBoneNode(name));
  if (eyeNodes[0] && eyeNodes[1]) {
    const positions = eyeNodes.map((node) => node!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseHead).applyQuaternion(inverseFacing));
    const pivotY = (positions[0]!.y + positions[1]!.y) / 2;
    const span = Math.abs(positions[0]!.x - positions[1]!.x);
    // Some imported eye pivots are deep inside the skull; reject that as a fitting landmark.
    if (pivotY >= top * 0.20 && pivotY <= top * 0.80) eyeY = pivotY;
    if (span >= width * 0.25 && span <= width * 0.60) {
      eyeDistance = span;
      eyeDistanceSource = "measured";
    }
  }
  const faceBand = skinPoints.filter((point) => Math.abs(point.y - eyeY) < top * 0.16 && Math.abs(point.x) < width * 0.28);
  if (faceBand.length < 16) return null;
  const front = quantile(faceBand.map((point) => point.z), 0.96) + 0.004;
  if (front < 0.01 || front > 0.25) return null;
  const worldScale = head.getWorldScale(new THREE.Vector3());
  const local = new THREE.Vector3(0, eyeY, front).applyQuaternion(facing);
  return {
    head: width * Math.abs(worldScale.x),
    eyeDistance: eyeDistance * Math.abs(worldScale.x),
    eyeDistanceSource,
    faceSocket: {
      position: local.toArray() as Vec3,
      rotationQuaternion: [facing.x, facing.y, facing.z, facing.w],
      rotationDeg: [0, vrm.meta?.metaVersion === "0" ? 180 : 0, 0],
      source: "measured",
      surfaceMeasured: true,
      surfaceCrownHeight: top,
      ...(points.some((point) => point.y > top + 0.015) ? { hairClearanceRequired: true } : {}),
    },
  };
}

/** Only the reviewed v5 headwear uses these authored contact profiles. */
export function studioVrmHeadwearSurfaceSocket(
  id: string, bone: PropAttachBone, socket: VrmPropFaceSocket,
): VrmPropFaceSocket | null {
  if (bone !== "head" || !socket.surfaceMeasured || !Number.isFinite(socket.surfaceCrownHeight)) return null;
  const crown = socket.surfaceCrownHeight!;
  const facing = new THREE.Quaternion(...socket.rotationQuaternion);
  const face = new THREE.Vector3(...socket.position).applyQuaternion(facing.clone().invert());
  let position: Vec3;
  let tiltDeg: Vec3 | null = null;
  switch (id) {
    case "cap": position = [0, crown * 0.437, 0]; break;
    case "beret":
      // 정수리 중앙 수직 부양(0.84)을 방지하고 두상 곡면(0.74) 우측·후면에 14° 비스듬히 밀착 앉힌다.
      position = [-Math.min(0.024, face.z * 0.2), crown * 0.74, -Math.min(0.02, face.z * 0.16)];
      tiltDeg = [-5, 0, 14];
      break;
    case "glasses":
      // 콧등 표면 기준으로 앞쪽 부양을 줄이고 눈동자 중심보다 콧대 안착점에 정밀 밀착시킨다.
      position = [0, face.y - crown * 0.012, Math.max(0.01, face.z - 0.006)];
      break;
    case "beanie": position = [0, crown * 0.70, 0]; break;
    case "blender_wizard_hat": position = [0, crown * 0.784, 0]; break;
    case "headphones": position = [0, face.y + 0.012, 0]; break;
    case "earmuffs": position = [0, face.y + 0.008, 0]; break;
    case "elfEars": position = [0, face.y - 0.008, 0]; break;
    case "ribbon": position = [-face.z * 1.2, crown * 0.812, 0]; break;
    case "hairpin": position = [face.z * 0.75, crown * 0.72, face.z * 0.32]; break;
    case "crown": position = [0, crown * 0.72, 0]; break;
    case "surgicalCap": position = [0, crown * 0.56, 0]; break;
    case "headband": position = [0, crown * 0.62, 0]; break;
    case "flowerCrown": position = [0, crown * 0.76, 0]; break;
    case "catEars": position = [0, crown * 0.78, 0]; break;
    case "horns": position = [0, crown * 0.78, 0]; break;
    case "halo": position = [0, crown + 0.015, 0]; break;
    case "blender_tactical_helmet": position = [0, crown * 0.48, 0.01]; break;
    default: return null;
  }
  const point = new THREE.Vector3(...position).applyQuaternion(facing);
  if (!tiltDeg) return { ...socket, position: point.toArray() as Vec3 };
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(tiltDeg[0]),
    THREE.MathUtils.degToRad(tiltDeg[1]),
    THREE.MathUtils.degToRad(tiltDeg[2]),
    "XYZ",
  ));
  const orientation = facing.clone().multiply(tilt).normalize();
  const euler = new THREE.Euler().setFromQuaternion(orientation, "XYZ");
  return {
    ...socket,
    position: point.toArray() as Vec3,
    rotationQuaternion: [orientation.x, orientation.y, orientation.z, orientation.w],
    rotationDeg: [
      THREE.MathUtils.radToDeg(euler.x),
      THREE.MathUtils.radToDeg(euler.y),
      THREE.MathUtils.radToDeg(euler.z),
    ],
  };
}
