import { Euler, MathUtils, Matrix4, Mesh, Quaternion, Vector3 } from "three";

import { bookCoverDistance } from "./studio-vrm-book-cover-grip";
import {
  planStudioVrmContactReplay,
  releaseStudioVrmContactReplay,
  type StudioVrmContactReplay,
} from "./studio-vrm-contact-refinement";
import { getStudioVrmJointLimit } from "./studio-vrm-joint-limits";
import { createStudioVrmVirtualFingertipProbe } from "./studio-vrm-virtual-fingertip";

import type { ResolvedPropAttachment } from "./studio-vrm-prop-rig";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D, SkinnedMesh } from "three";

type Digit = "Thumb" | "Index" | "Middle" | "Ring" | "Little";
type Influence = { frame: number; local: Vector3; weight: number };
type SkinPoint = { influences: Influence[]; pad: boolean; radius: number };
type ContactPass = { run(): void; release(): boolean };

const THUMB_JOINTS = ["Metacarpal", "Proximal", "Distal"] as const;
const FINGER_JOINTS = ["Proximal", "Intermediate", "Distal"] as const;
const AXES = ["x", "y", "z"] as const;
const MAX_POINTS = 192;
// Handle axial position and radius (metres) in the authored atelier_microphone GLB.
const SHAFT = [[-0.091, 0.008], [-0.087, 0.0105], [-0.06, 0.0117], [-0.025, 0.012],
  [0.03, 0.0128], [0.045, 0.014], [0.053, 0.013]] as const;

function shaftDistance(point: Vector3, scale: number, anchorY: number) {
  const y = point.y / scale + anchorY;
  let i = 1;
  while (i < SHAFT.length - 1 && y > SHAFT[i]![0]) i++;
  const [y0, r0] = SHAFT[i - 1]!;
  const [y1, r1] = SHAFT[i]!;
  const radius = r0 + (r1 - r0) * MathUtils.clamp((y - y0) / (y1 - y0), 0, 1);
  const radial = Math.hypot(point.x, point.z) - radius * scale;
  const cap = Math.max(SHAFT[0][0] - y, y - SHAFT[SHAFT.length - 1]![0]) * scale;
  return Math.hypot(Math.max(0, radial), Math.max(0, cap)) + Math.min(0, Math.max(radial, cap));
}

/** 해당 손가락에 가중된 실제 표시 피부만 선택한다. 각 가중치는 자기 마디를 따라간다. */
const drawnDigitIndices = new WeakMap<SkinnedMesh, WeakMap<Object3D, {
  geometry: SkinnedMesh["geometry"]; skeleton: SkinnedMesh["skeleton"]; drawKey: string; vertices: number[];
  skinIndex: object; skinWeight: object; order: object | null;
}>>();

function digitSkin(vrm: VRM, names: VRMHumanBoneName[], frames: Object3D[], firstFrame: number): SkinPoint[] {
  const raw = names.map(name => vrm.humanoid.getRawBoneNode(name));
  if (raw.some(bone => !bone)) return [];
  const side = names[0]?.startsWith("right") ? "right" : "left";
  // 책의 다섯 손가락을 한 번의 메시 순회로 색인한다.
  const families = firstFrame === 1 ? (["Thumb", "Index", "Middle", "Ring", "Little"] as const).map(digit =>
    (digit === "Thumb" ? THUMB_JOINTS : FINGER_JOINTS).map(joint =>
      vrm.humanoid.getRawBoneNode(`${side}${digit}${joint}` as VRMHumanBoneName),
    ),
  ) : [raw];
  const digitByBone = new Map<Object3D, number>();
  families.forEach((bones, digit) => bones.slice(firstFrame - 1).forEach(bone => {
    if (bone) digitByBone.set(bone, digit);
  }));
  const selected: { mesh: SkinnedMesh; vertex: number; frameIndices: number[] }[] = [];
  vrm.humanoid.update();
  vrm.scene.updateMatrixWorld(true);
  vrm.scene.traverseVisible(object => {
    const mesh = object as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const frameIndices = mesh.skeleton.bones.map(bone => raw.findIndex(node => node === bone) + 1);
    if (!frameIndices.some(index => index >= firstFrame)) return;
    const geometry = mesh.geometry;
    const indices = geometry.getAttribute("skinIndex");
    const weights = geometry.getAttribute("skinWeight");
    if (!indices || !weights) return;
    const order = geometry.index;
    const material = mesh.material;
    const groups = Array.isArray(material)
      ? geometry.groups.filter(group => material[group.materialIndex ?? 0]?.visible)
      : material.visible ? [{ start: 0, count: order?.count ?? indices.count }] : [];
    // Position/rotation sliders rebuild contact passes, but do not change the rig's skin membership.
    const version = (attribute: typeof indices) => "version" in attribute ? attribute.version : attribute.data.version;
    const drawKey = [firstFrame, geometry.drawRange.start, geometry.drawRange.count, order?.version, version(indices), version(weights),
      ...groups.flatMap(group => [group.start, group.count])].join("/");
    let byDigit = drawnDigitIndices.get(mesh);
    if (!byDigit) { byDigit = new WeakMap(); drawnDigitIndices.set(mesh, byDigit); }
    const previous = byDigit.get(raw[1]!);
    if (previous?.geometry === geometry && previous.skeleton === mesh.skeleton && previous.drawKey === drawKey
      && previous.skinIndex === indices && previous.skinWeight === weights && previous.order === order) {
      previous.vertices.forEach(vertex => selected.push({ mesh, vertex, frameIndices }));
      return;
    }
    const vertexLists = families.map(() => [] as number[]);
    const digitByIndex = mesh.skeleton.bones.map(bone => digitByBone.get(bone) ?? -1);
    const digitWeights = new Float64Array(families.length);
    const seen = new Uint8Array(indices.count);
    for (const group of groups) {
      const end = Math.min(group.start + group.count, geometry.drawRange.start + geometry.drawRange.count, order?.count ?? indices.count);
      for (let n = Math.max(group.start, geometry.drawRange.start); n < end; n++) {
        const vertex = order ? order.getX(n) : n;
        if (seen[vertex]) continue;
        seen[vertex] = 1;
        let hasFingerWeight = false;
        for (let j = 0; j < 4; j++) {
          const digit = digitByIndex[indices.getComponent(vertex, j)];
          if (digit === undefined || digit < 0) continue;
          digitWeights[digit]! += weights.getComponent(vertex, j);
          hasFingerWeight = true;
        }
        if (!hasFingerWeight) continue;
        for (let digit = 0; digit < digitWeights.length; digit++) {
          if (digitWeights[digit]! >= 0.5) vertexLists[digit]!.push(vertex);
          digitWeights[digit] = 0;
        }
      }
    }
    for (const [digit, bones] of families.entries()) {
      if (!bones[1]) continue;
      const vertices = vertexLists[digit]!;
      byDigit.set(bones[1], { geometry, skeleton: mesh.skeleton, skinIndex: indices, skinWeight: weights, order, drawKey, vertices });
      if (bones[1] === raw[1]) vertices.forEach(vertex => selected.push({ mesh, vertex, frameIndices }));
    }
  });

  const cloud: SkinPoint[] = [];
  const count = Math.min(selected.length, MAX_POINTS);
  const base = new Vector3();
  for (let n = 0; n < count; n++) {
    const { mesh, vertex, frameIndices } = selected[Math.floor(n * selected.length / count)]!;
    const indices = mesh.geometry.getAttribute("skinIndex");
    const weights = mesh.geometry.getAttribute("skinWeight");
    // Mesh.getVertexPosition samples the morph target before SkinnedMesh applies bind weights.
    Mesh.prototype.getVertexPosition.call(mesh, vertex, base).applyMatrix4(mesh.bindMatrix);
    const influences: Influence[] = [];
    let terminalWeight = 0;
    for (let j = 0; j < 4; j++) {
      const weight = weights.getComponent(vertex, j);
      if (!(weight > 0)) continue;
      const index = indices.getComponent(vertex, j);
      const frame = frameIndices[index]!;
      const local = base.clone().applyMatrix4(mesh.skeleton.boneInverses[index]!)
        .applyMatrix4(mesh.skeleton.bones[index]!.matrixWorld).applyMatrix4(mesh.bindMatrixInverse)
        .applyMatrix4(mesh.matrixWorld);
      frames[frame]!.worldToLocal(local);
      influences.push({ frame, weight, local });
      if (frame === 3) terminalWeight += weight;
    }
    cloud.push({ influences, pad: terminalWeight >= 0.5, radius: 0 });
  }
  return cloud;
}

function phalanxCapsules(frames: Object3D[], handSize: number): SkinPoint[] {
  const proximal = frames[2]!;
  const distal = frames[3]!;
  const tip = createStudioVrmVirtualFingertipProbe({ distal, previousJoint: proximal, handSize, lengthRatio: 0.82 });
  if (!tip) return [];
  const end = proximal.worldToLocal(distal.getWorldPosition(new Vector3()));
  const radius = MathUtils.clamp(tip.sourceSegmentWorldLength * 0.29, handSize * 0.055, handSize * 0.14);
  const cloud: SkinPoint[] = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    cloud.push({ influences: [{ frame: 2, local: end.clone().multiplyScalar(t), weight: 1 }], pad: false, radius });
    cloud.push({ influences: [{ frame: 3, local: new Vector3(...tip.localTip).multiplyScalar(t), weight: 1 }], pad: true, radius: radius * (1 - 0.4 * t) });
  }
  return cloud;
}

/** 자동 장착에서 손가락 피부와 소품 겉면 사이의 거리를 맞춘다. */
export function createFittedDigitContactPass(
  vrm: VRM,
  side: "left" | "right",
  resolved: ResolvedPropAttachment,
  handSize: number,
  locked: readonly string[],
  digit: Digit = "Thumb",
): ContactPass | null {
  const handName = `${side}Hand` as const;
  const jointsForDigit = digit === "Thumb" ? THUMB_JOINTS : FINGER_JOINTS;
  const names = jointsForDigit.map(joint => `${side}${digit}${joint}` as VRMHumanBoneName);
  const mug = resolved.anchor.id === "handle-grip";
  const book = resolved.anchor.id === "cover-grip";
  if (resolved.bone !== handName || (!book && (digit !== "Thumb" || (!mug && resolved.anchor.id !== "palm-grip"))) || !resolved.usesSmartRig
    || !Number.isFinite(handSize) || handSize <= 0 || !Number.isFinite(resolved.scale) || resolved.scale <= 0
    || locked.includes(handName) || names.some(name => locked.includes(name))) return null;
  const hand = vrm.humanoid?.getNormalizedBoneNode(handName);
  const bones = names.map(name => vrm.humanoid?.getNormalizedBoneNode(name));
  if (!hand || bones.some(bone => !bone)) return null;
  const joints = bones as Object3D[];
  const frames = [hand, ...joints];
  const limits = names.flatMap(name => AXES.map(axis => getStudioVrmJointLimit(name)[axis]));
  const localRotation = new Quaternion().setFromEuler(new Euler(
    MathUtils.degToRad(resolved.rotationDeg[0]), MathUtils.degToRad(resolved.rotationDeg[1]), MathUtils.degToRad(resolved.rotationDeg[2]),
  ));
  // 손잡이의 고리 중심·중심선 반경·도자기 두께는 everyday_mug 메시의 로컬 미터 값이다.
  const scale = resolved.scale;
  const ringCenterOffset = (resolved.anchor.position[0] - 0.045) * scale;
  const surfaceDistance = mug
    ? (p: Vector3) => Math.hypot(Math.hypot(p.x + ringCenterOffset, p.y) - 0.026 * scale, p.z) - 0.0065 * scale
    : book ? (p: Vector3) => bookCoverDistance(p, resolved.anchor.position[0], resolved.anchor.position[1], scale)
      : (p: Vector3) => shaftDistance(p, scale, resolved.anchor.position[1]);
  const inverseGrip = new Matrix4();
  const worldScale = new Vector3(1, 1, 1);
  const rotation = new Quaternion();
  const center = new Vector3();
  const affine = frames.map(() => new Matrix4());
  const point = new Vector3(), sample = new Vector3();
  let cloud: SkinPoint[] | null = null;
  let cache: StudioVrmContactReplay | null = null;
  let invalid = false;

  const read = () => joints.flatMap(bone => [bone.rotation.x, bone.rotation.y, bone.rotation.z]);
  const shape = () => joints.flatMap(bone => [...bone.position.toArray(), ...bone.scale.toArray()]);
  const apply = (values: readonly number[]) => {
    joints.forEach((bone, i) => bone.rotation.set(values[3 * i]!, values[3 * i + 1]!, values[3 * i + 2]!));
    joints[0]!.updateWorldMatrix(true, true);
  };
  const release = () => {
    const previous = cache;
    cache = null;
    const original = releaseStudioVrmContactReplay(previous, read(), shape());
    if (!original) return false;
    apply(original);
    return true;
  };

  function score(input: readonly number[], trial: readonly number[]) {
    frames.forEach((bone, i) => affine[i]!.multiplyMatrices(inverseGrip, bone.matrixWorld));
    let penetration = 0, nearest = Infinity, terminal = Infinity;
    for (const skin of cloud!) {
      point.set(0, 0, 0);
      for (const { frame, local, weight } of skin.influences) {
        point.addScaledVector(sample.copy(local).applyMatrix4(affine[frame]!), weight);
      }
      const distance = surfaceDistance(point) - skin.radius;
      penetration = Math.max(penetration, -distance);
      nearest = Math.min(nearest, Math.abs(distance));
      if (skin.pad) {
        // 엄지 끝은 앞표지, 받치는 손가락은 뒤표지에 닿게 한다.
        const faceGap = book ? Math.max(0, 0.019 * scale - (digit === "Thumb" ? point.z : -point.z))
          : mug ? Math.max(0, 0.012 * scale - point.y) : 0;
        terminal = Math.min(terminal, Math.hypot(distance, faceGap));
      }
    }
    // A single grazing vertex must not hide a deeply intersecting phalanx.
    const angularCost = trial.reduce((sum, value, i) => sum + (value - input[i]!) ** 2, 0);
    const pad = Number.isFinite(terminal) ? terminal : nearest;
    return 25 * penetration ** 2 + Math.max(0, nearest - 0.0005) ** 2
      + 0.6 * Math.max(0, pad - 0.001) ** 2 + angularCost * (handSize * 0.009) ** 2;
  }

  return {
    release,
    run() {
      if (invalid) return;
      if (frames.some((bone, idx) => bone !== vrm.humanoid.getNormalizedBoneNode(idx ? names[idx - 1]! : handName))) { release(); return; }
      hand.updateWorldMatrix(true, false);
      const det = hand.matrixWorld.determinant();
      if (!Number.isFinite(det) || Math.abs(det) < 1e-12) { release(); return; }
      hand.localToWorld(center.set(...resolved.socketPosition));
      if (center.distanceTo(hand.getWorldPosition(sample)) > handSize * 1.8) { release(); return; }
      hand.getWorldQuaternion(rotation).multiply(localRotation).normalize();
      inverseGrip.compose(center, rotation, worldScale).invert();
      const context = affine[0]!.multiplyMatrices(inverseGrip, hand.matrixWorld).elements;
      const current = read(), structure = shape();
      if (![...current, ...structure, ...context].every(Number.isFinite)) { release(); return; }
      const plan = planStudioVrmContactReplay(cache, current, structure, context);
      if (plan.kind === "unchanged") return;
      if (plan.kind === "replay") { apply(plan.angles); return; }
      const input = [...plan.angles];
      apply(input);
      try {
        if (!cloud) {
          cloud = typeof vrm.humanoid.getRawBoneNode === "function" ? digitSkin(vrm, names, frames, book ? 1 : 2) : [];
          if (!cloud.length) cloud = phalanxCapsules(frames, handSize);
        }
        if (!cloud.length) return;
        let best = [...input], bestScore = score(input, input);
        if (!Number.isFinite(bestScore)) return;
        // Search opposition at CMC/MCP as well as flexion. Fixed budget, no per-frame skin scan.
        const keys = digit === "Thumb" ? [1, 2, 0, 4, 5, 8] : [2, 5, 8, 1, 0];
        const maxDelta = MathUtils.degToRad(48);
        for (const stepDeg of [24, 12, 6, 3, 1.5]) {
          if (bestScore < 1e-8) break;
          const step = MathUtils.degToRad(stepDeg);
          for (const key of keys) {
            const pivot = best[key]!, limit = limits[key]!;
            for (const sign of [-1, 1]) {
              const lo = Math.max(input[key]! - maxDelta, Math.min(input[key]!, limit.hardMin));
              const hi = Math.min(input[key]! + maxDelta, Math.max(input[key]!, limit.hardMax));
              const value = MathUtils.clamp(pivot + sign * step, lo, hi);
              if (Math.abs(value - pivot) < 1e-7) continue;
              const angles = [...best];
              angles[key] = value;
              apply(angles);
              const loss = score(input, angles);
              if (loss < bestScore) { best = angles; bestScore = loss; }
            }
          }
        }
        apply(best);
        cache = { input, output: best, shape: structure, context: [...context] };
      } catch {
        invalid = true;
        cache = null;
      } finally {
        if (!cache || cache.input !== input) apply(input);
      }
    },
  };
}

export const createFittedThumbContactPass = createFittedDigitContactPass;
