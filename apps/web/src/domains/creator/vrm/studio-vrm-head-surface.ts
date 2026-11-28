import * as THREE from "three";

import { isStudioAuthoredAttachment } from "./studio-vrm-authored-attachment";
import { getStudioVrmHeadSurfaceMembership } from "./studio-vrm-head-skin-vertices";
import { propDefById } from "./studio-vrm-props";

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

type FittedHat = "beret" | "beanie";

// atelier_beret.glb의 펠트 밴드와 atelier_beanie.glb의 접힌 니트 아랫단을 모델 원점 기준으로 잰다.
const HAT_RIMS = {
  beret: { radius: 0.096, depthRatio: 0.91, bottom: -0.026, maxLiftRatio: 0.105 },
  beanie: { radius: 0.098, depthRatio: 0.93, bottom: -0.015, maxLiftRatio: 0.12 },
} as const;
const MAX_BEANIE_DEPTH_RATIO = 0.04;
const RIM_SECTORS = 32;

function nativeBeanieDepth(hair: readonly THREE.Vector3[], crown: number, width: number): number {
  const depths = hair.filter((point) => point.y >= crown * 0.65 && point.y <= crown * 0.78 && Math.abs(point.x) < width * 0.28)
    .map((point) => point.z);
  if (depths.length < 12) return 0;
  const rear = quantile(depths, 0.02);
  const front = quantile(depths, 0.98);
  if (rear >= -width * 0.23 || front <= width * 0.23) return 0;
  return THREE.MathUtils.clamp((rear + front) / 2, -crown * MAX_BEANIE_DEPTH_RATIO, crown * MAX_BEANIE_DEPTH_RATIO);
}

function nativeHairRimLift(
  id: FittedHat, hair: readonly THREE.Vector3[], socket: VrmPropFaceSocket, width: number, worldScale: number,
): number {
  const def = propDefById(id);
  const seated = studioVrmHeadwearSurfaceSocket(id, "head", socket);
  const surfaceAnchor = def?.anchors.find((candidate) => candidate.role === "surface");
  if (!def || !surfaceAnchor || !seated || !socket.surfaceCrownHeight || !worldScale || hair.length < 8) return 0;
  const scale = (def.defaultScale ?? 1) * THREE.MathUtils.clamp(
    width * worldScale / def.fit.designReference, def.fit.minScale, def.fit.maxScale,
  ) / worldScale;
  const facingInverse = new THREE.Quaternion(...socket.rotationQuaternion).invert();
  const origin = new THREE.Vector3(...seated.position).applyQuaternion(facingInverse);
  const rotation = facingInverse.multiply(new THREE.Quaternion(...seated.rotationQuaternion));
  const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).y;
  const inverse = rotation.invert();
  const anchor = new THREE.Vector3(...surfaceAnchor.position);
  const rim = HAT_RIMS[id];
  const supportHeights: number[] = Array(RIM_SECTORS).fill(Number.NEGATIVE_INFINITY);
  const point = new THREE.Vector3();
  for (const vertex of hair) {
    point.copy(vertex).sub(origin).applyQuaternion(inverse).divideScalar(scale).add(anchor);
    const height = point.y - rim.bottom;
    const radius = Math.hypot(point.x, point.z / rim.depthRatio);
    // 밴드에 닿는 원래 머리 둘레만 쓴다. 멀리 늘어진 옆머리와 정수리 장식은 기준에서 뺀다.
    if (height > -0.045 && height < 0.050 && radius >= rim.radius - 0.001 && radius <= rim.radius + 0.024) {
      const angle = Math.atan2(point.z / rim.depthRatio, point.x) + Math.PI;
      const sector = Math.floor(angle * RIM_SECTORS / (2 * Math.PI)) % RIM_SECTORS;
      supportHeights[sector] = Math.max(supportHeights[sector], height * scale / localUp);
    }
  }
  // 쿼드가 조밀한 가닥 하나가 안착점의 대부분을 차지하지 않도록 방위마다 접촉점 하나만 반영한다.
  const supports = supportHeights.filter(Number.isFinite);
  if (supports.length < 4) return 0;
  return THREE.MathUtils.clamp(quantile(supports, 0.95), 0, socket.surfaceCrownHeight * rim.maxLiftRatio);
}

export function measuredHeadSocketFields(socket: VrmPropFaceSocket | undefined): Partial<VrmPropFaceSocket> {
  const crown = socket?.surfaceCrownHeight;
  if (!socket?.surfaceMeasured || !Number.isFinite(crown) || crown === undefined || crown <= 0 || crown >= 0.5) return {};
  const validLift = (id: FittedHat, value: number | undefined) =>
    value !== undefined && Number.isFinite(value) && value > 0 && value <= crown * HAT_RIMS[id].maxLiftRatio;
  return {
    surfaceMeasured: true, surfaceCrownHeight: crown,
    ...(validLift("beret", socket.beretRimLift) ? { beretRimLift: socket.beretRimLift } : {}),
    ...(validLift("beanie", socket.beanieRimLift) ? { beanieRimLift: socket.beanieRimLift } : {}),
    ...(socket.beanieRimDepth !== undefined && Number.isFinite(socket.beanieRimDepth)
      && Math.abs(socket.beanieRimDepth) <= crown * MAX_BEANIE_DEPTH_RATIO ? { beanieRimDepth: socket.beanieRimDepth } : {}),
    ...(socket.hairClearanceRequired ? { hairClearanceRequired: true } : {}),
  };
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
  const hairPoints: THREE.Vector3[] = [];
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
    const skin = getStudioVrmHeadSurfaceMembership(mesh, "skin");
    const hair = getStudioVrmHeadSurfaceMembership(mesh, "hair");
    const allSkin = skin.count === position.count;
    const allHair = hair.count === position.count;
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
      if (allSkin || skin.membership?.[index]) skinPoints.push(point);
      if (allHair || hair.membership?.[index]) hairPoints.push(point);
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
  const faceSocket: VrmPropFaceSocket = {
    position: local.toArray() as Vec3,
    rotationQuaternion: [facing.x, facing.y, facing.z, facing.w],
    rotationDeg: [0, vrm.meta?.metaVersion === "0" ? 180 : 0, 0],
    source: "measured", surfaceMeasured: true, surfaceCrownHeight: top,
    ...(points.some((point) => point.y > top + 0.015) ? { hairClearanceRequired: true } : {}),
  };
  const beretRimLift = nativeHairRimLift("beret", hairPoints, faceSocket, width, Math.abs(worldScale.x));
  const beanieRimLift = nativeHairRimLift("beanie", hairPoints, faceSocket, width, Math.abs(worldScale.x));
  const beanieRimDepth = nativeBeanieDepth(hairPoints, top, width);
  return {
    head: width * Math.abs(worldScale.x),
    eyeDistance: eyeDistance * Math.abs(worldScale.x),
    eyeDistanceSource,
    faceSocket: {
      ...faceSocket,
      ...(beretRimLift > 0 ? { beretRimLift } : {}),
      ...(beanieRimLift > 0 ? { beanieRimLift } : {}),
      ...(beanieRimDepth !== 0 ? { beanieRimDepth } : {}),
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
      // 카탈로그의 14° 기울기를 유지하고, 머리카락이 밴드에 닿는 경우에만 안착점을 올린다.
      position = [-Math.min(0.024, face.z * 0.2), crown * 0.74 + (socket.beretRimLift ?? 0), -Math.min(0.02, face.z * 0.16)];
      tiltDeg = [-5, 0, 14];
      break;
    case "glasses":
      // 콧등 표면 기준으로 앞쪽 부양을 줄이고 눈동자 중심보다 콧대 안착점에 정밀 밀착시킨다.
      position = [0, face.y - crown * 0.012, Math.max(0.01, face.z - 0.006)];
      break;
    case "beanie": position = [0, crown * 0.70 + (socket.beanieRimLift ?? 0), socket.beanieRimDepth ?? 0]; break;
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
