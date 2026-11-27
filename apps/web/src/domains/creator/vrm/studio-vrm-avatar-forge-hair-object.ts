/**
 * 포지 헤어 오브젝트(병합 메시 + 외곽선)를 두상 맞춤 위에 짓는다.
 *
 * 셰이퍼 뷰포트(`StudioVrmAvatarForge.tsx`)와 헤어 카드 썸네일 렌더러가 **같은 함수**로 헤어를 만든다.
 * 그래서 카드에 보이는 머리와 실제 3D 에 씌워지는 머리가 갈라질 수 없다(A-07).
 */
import * as THREE from "three";

import {
  mergeStudioVrmAuthoredHairGeometry,
  studioVrmAuthoredCapHairlineHeight,
  type StudioVrmAuthoredHairInstance,
  type StudioVrmAuthoredHairSpine,
} from "./studio-vrm-authored-hair-geometry";
import {
  buildAvatarForgeHairParts,
  type AvatarForgeHairParams,
  type AvatarForgeHairPart,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
  STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY,
  createStudioVrmHairMToonMaterials,
  createStudioVrmSmoothOutlineGeometry,
  type StudioVrmBodyMtoonProfile,
} from "./studio-vrm-custom-part-material";
import { cropPixieHairPart, FLOWING_BACK_SHELL_IDS, refineBasePartForRender, UNIT_CAP_RADIUS } from "./studio-vrm-avatar-forge-hair-layers";
import { fitStudioVrmHairLockSpine, fitStudioVrmTwinTailSpine } from "./studio-vrm-hair-lock-spine";
import { fitStudioVrmBraidLinks } from "./studio-vrm-hair-braid";
import type { StudioVrmHeadFit } from "./studio-vrm-head-fit";

/** 헤어 단위 공간에서 두상(캡) 중심과 반경. 파츠 계획(studio-vrm-avatar-forge.ts)이 이 공간으로 쓰여 있다. */
const UNIT_CAP_CENTER = [0, 0.18, 0.015] as const;

/** 생성 헤어가 소유한 텍스처 목록(userData 키). 폐기 때 함께 버린다. */
export const AVATAR_FORGE_OWNED_TEXTURES = "toonSpectrumAvatarForgeOwnedTextures";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 캡 껍질의 최소 두께(두개골 반경 대비). 생성 캐릭터 파이프라인(`studio-vrm-humanoid-mesh.ts` 의
 * `fitHairCapToSkull`)과 같은 규칙이다 — 볼륨 1 이하는 이 안에서만 얇아지고 살갗 밑으로는 못 간다.
 * 실측 VRM 12종(쿼터니어스 포함)의 기본/최소 피복 게이트를 모두 통과하는 최소 안전치(0.045)로 두고,
 * 실제 렌더 전개(`refineBasePartForRender`)에서는 기본 볼륨의 껍질 두께를 약 3.0~3.5%로 밀착한다.
 */
export const AVATAR_FORGE_CAP_MIN_SHELL = 0.045;

const FACE_MINUS_Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export interface AvatarForgeHairPlacement {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
}

/** 가닥 뿌리를 덮는 캡 껍질의 보수적 반경 배율(밀착 렌더 캡 바로 아래에 뿌리를 숨긴다). */
const TUCK_CAP_SHELL = 1.026;

/**
 * 얼굴이 +z 인 정준 좌표의 두상. 배치 규칙은 전부 이 좌표에서 계산하고, VRM0(−z 얼굴)은 마지막에
 * 머리 축으로 180° 돌린다.
 */
interface CanonicalHead {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly eyeY: number;
  readonly faceFront: number;
}

function canonicalHead(fit: StudioVrmHeadFit): CanonicalHead {
  return {
    cx: fit.center[0],
    cy: fit.center[1],
    cz: fit.frontSign * fit.center[2],
    rx: fit.radiusX,
    ry: fit.radiusY,
    rz: fit.radiusZ,
    eyeY: fit.eyeCenter[1],
    faceFront: fit.faceFront,
  };
}

/**
 * 가닥 뿌리의 천장 = 가닥의 **바깥 모서리**가 놓이는 가로 위치에서의 캡 표면 높이.
 *
 * 생성 캐릭터 파이프라인은 가닥 중심 위치의 두개골 표면 + 12% 를 천장으로 쓴다. VRM 부착
 * 경로에서 그대로 쓰면 납작한 옆머리 가닥의 바깥 모서리가 캡 위로 1~2 cm 솟아 정수리 양옆에
 * 뿔처럼 보였다(2026-10-23 접촉 시트). 가닥 폭만큼 바깥 지점에서 캡이 아직 덮는 높이로 낮춘다.
 */
function skullTuckCeiling(position: THREE.Vector3, halfWidth: number, head: CanonicalHead): number {
  const dx = (Math.abs(position.x - head.cx) + halfWidth) / head.rx;
  const dz = (position.z - head.cz) / head.rz;
  const outer = Math.hypot(dx, dz) / TUCK_CAP_SHELL;
  return head.cy + head.ry * TUCK_CAP_SHELL * Math.sqrt(Math.max(0, 1 - Math.min(1, outer) ** 2));
}

/**
 * 옆·뒷머리를 두개골 표면 근처(가로 정규화 거리 ≥ 0.9)로 민다. 계획의 가로 오프셋은 두개골보다
 * 안쪽이라 그대로 두면 머리 속에 묻히고 턱 옆으로만 삐져나와 "얼굴 옆 판자 두 장"(A-01 증상)이 된다.
 */
function pushOutsideSkull(position: THREE.Vector3, head: CanonicalHead, minNormalized = 0.9): void {
  const dx = position.x - head.cx;
  const dz = position.z - head.cz;
  const normalized = Math.hypot(dx / head.rx, dz / head.rz);
  // 정수리 한가운데 파츠는 밀 방향이 없다.
  if (normalized >= minNormalized || normalized < 0.05) return;
  const gain = minNormalized / normalized;
  position.x = head.cx + dx * gain;
  position.z = head.cz + dz * gain;
}

/** 번·매듭은 중심을 두피 표면까지 내밀어 반쯤 얹는다(머리 속에 묻히지 않게). */
function seatOnSkull(position: THREE.Vector3, head: CanonicalHead): void {
  const dx = (position.x - head.cx) / head.rx;
  const dy = (position.y - head.cy) / head.ry;
  const dz = (position.z - head.cz) / head.rz;
  const normalized = Math.hypot(dx, dy, dz);
  if (normalized >= 1 || normalized < 0.05) return;
  const gain = 1 / normalized;
  position.set(head.cx + dx * gain * head.rx, head.cy + dy * gain * head.ry, head.cz + dz * gain * head.rz);
}

/** 높이 y·가로 x 에서 두상 타원체(배율 `shell`) 앞면의 깊이(정준 d). */
function skullFrontDepth(x: number, y: number, head: CanonicalHead, shell = 1): number {
  const nx = (x - head.cx) / (head.rx * shell);
  const ny = (y - head.cy) / (head.ry * shell);
  return head.cz + head.rz * shell * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
}

/**
 * 이마 피부 앞면의 보수적 깊이(정준 d) = 얼굴 앞면(눈썹 띠 최대 깊이)과 두상 타원체 앞면 중 안쪽.
 * 둘 다 실측 피부의 위쪽 경계라 최솟값도 경계다. 실측 이마는 눈썹부터 헤어라인까지 거의 수직이라
 * (루미: 눈썹 0.095 → 이마 0.102 → 정수리 쪽 0.07) 타원으로 눕히면 가운데가 피부 속에 묻힌다.
 */
function foreheadDepth(x: number, y: number, head: CanonicalHead): number {
  const lateral = (x - head.cx) / head.rx;
  const across = Math.sqrt(Math.max(0.15, 1 - 0.85 * lateral * lateral));
  return Math.min(head.cz + (head.faceFront - head.cz) * across, skullFrontDepth(x, y, head));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 앞머리 중심선 표본 수(뿌리→끝). */
const BANG_SPINE_SAMPLES = 13;
/** 캡 껍질 배율(두상 대비). 가장 얇은 캡(볼륨 최소, +2.5%)보다 살짝 바깥이다. */
const BANG_CAP_SHELL = 1.03;

interface CanonicalBang {
  readonly points: THREE.Vector3[];
  readonly normals: THREE.Vector3[];
}

/**
 * 앞머리 한 갈래의 굽은 중심선(정준 좌표).
 *
 * - 뿌리는 캡 헤어라인(`createCapGeometry`)보다 위, 캡 껍질 밑에 숨는다.
 * - 헤어라인 아래로는 이마 앞면 + 단면 뒤 두께 + 틈(끝으로 갈수록 살짝 들림)을 따라 내려온다.
 * - 끝 높이는 눈 높이 기준이다. 계획 길이(`scale.y`)가 앞머리 길이(`fringe`)와 갈래별 비율을 이미
 *   담고 있으므로 v1 가운데 갈래(0.35·fringe)로 나눈 배율을 쓴다: 0.7 이면 눈썹, 1.2 면 눈 아래다.
 * - 계획 회전의 z 스윙은 아래로 내려갈수록 가로로 흐르는 비율로 옮긴다(옆으로 쓸린 앞머리).
 */
function layoutBang(part: AvatarForgeHairPart, x0: number, head: CanonicalHead): CanonicalBang {
  const halfWidth = Math.abs(part.scale[0]) * head.rx / UNIT_CAP_RADIUS[0];
  const thickness = Math.abs(part.scale[2]) * head.rz / UNIT_CAP_RADIUS[2];
  const down = new THREE.Vector3(0, -1, 0).applyEuler(
    new THREE.Euler(part.rotation[0], part.rotation[1], part.rotation[2], "XYZ"),
  );
  const drift = clamp(down.x / Math.max(0.2, -down.y), -1.2, 1.2);
  const lengthScale = Math.abs(part.scale[1]) / 0.35;
  const hairlineAt = (x: number) => head.cy + head.ry * 1.05
    * studioVrmAuthoredCapHairlineHeight((x - head.cx) / (head.rx * 1.05));
  const hairline = Math.max(
    hairlineAt(x0),
    hairlineAt(x0 - Math.sign(x0 - head.cx || 1) * 0.5 * halfWidth),
  );
  const rootY = Math.min(head.cy + 0.62 * head.ry, hairline + 0.25 * head.ry);
  // 길이 배율 0.7(레시피 기본 근처)이면 눈썹(눈 + 0.18·ry), 1 을 넘으면 눈 아래까지 내려온다.
  const tipY = Math.min(rootY - 0.2 * head.ry, head.eyeY + head.ry * (0.18 + 0.75 * (0.7 - lengthScale)));
  const visibleMid = (Math.min(rootY, hairline) + tipY) / 2;
  // 짧은 앞머리(tipY >= hairline)에서도 flare 방향이 뒤집히지 않도록 항상 위(rootY 쪽)→아래(tipY)로 단조 증가한다.
  const flareStart = Math.min(rootY, Math.max(hairline, tipY + 0.12 * head.ry));
  // 계획 깊이(z)가 앞쪽인 갈래일수록 살짝 앞 겹에 둔다(겹친 갈래끼리 면이 겹쳐 깜박이지 않게).
  const layer = clamp((part.position[2] - 0.32) / 0.12, 0, 1) * 0.018 * head.rz;
  const front = 0.32 * thickness;
  const back = 0.14 * thickness;
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  for (let index = 0; index < BANG_SPINE_SAMPLES; index += 1) {
    const t = index / (BANG_SPINE_SAMPLES - 1);
    const y = rootY + (tipY - rootY) * t;
    const x = x0 + drift * (visibleMid - y);
    const flare = smoothstep(flareStart, tipY, y);
    const skinDepth = foreheadDepth(x, y, head);
    // 앞머리 전 구간(뿌리~끝)은 이마 피부(foreheadDepth) 바깥을 따라 연속 곡면으로 흐른다.
    // 예전에는 헤어라인 위에서 Math.min(inside, outside)로 두개골 안쪽으로 밀어 이마 상단이 뚫고 나왔다.
    const outside = skinDepth + back + (0.012 + 0.032 * flare) * head.rz + layer;
    const rootFloor = skinDepth + back + 0.005 * head.rz;
    const capCeiling = Math.max(rootFloor, skullFrontDepth(x, y, head, BANG_CAP_SHELL) - front * 0.35);
    const underCap = smoothstep(hairline, rootY, y);
    // 캡 가장자리에서 갈래가 두피 아래로 사라졌다가 다시 나오는 단차를 막는다.
    // 뿌리와 끝의 위치를 보존하고, 헤어라인을 통과하는 동안에만 두상 표면을 따른다.
    const atHairline = (1 - underCap) * (1 - smoothstep(hairline, tipY, y));
    const scalpDepth = skullFrontDepth(x, y, head, BANG_CAP_SHELL);
    const depth = outside + (Math.min(capCeiling, outside) - outside) * underCap
      + Math.max(0, scalpDepth - outside) * atHairline;
    points.push(new THREE.Vector3(x, y, depth));
    normals.push(new THREE.Vector3(
      (x - head.cx) / (head.rx * head.rx),
      (y - head.cy) / (head.ry * head.ry),
      (depth - head.cz) / (head.rz * head.rz),
    ).normalize());
  }
  return { points, normals };
}

interface AvatarForgeHairLayout extends AvatarForgeHairPlacement {
  readonly spine?: StudioVrmAuthoredHairSpine;
}

/**
 * 헤어 단위 공간(+z 가 얼굴) 파츠를 머리 본 로컬로 옮기고 두개골에 맞춘다.
 *
 * - 규칙은 얼굴이 +z 인 정준 좌표에서 계산한다. 얼굴이 −z 인 VRM0 은 마지막에 배치 전체를 머리 축으로
 *   180° **회전**한다. 예전처럼 z 만 뒤집으면(거울상) 캡의 이마 구멍과 가닥 앞면이 뒤통수 쪽에 생기고
 *   비대칭 앞머리의 좌우가 VRM1 과 반대가 된다.
 * - 캡은 두개골 바깥 껍질, 매달린 가닥은 두개골 밖으로 밀고 뿌리를 캡 밑으로 넣는다(생성 캐릭터
 *   파이프라인 규칙 + VRM 보정). 뒷머리 껍질(ellipsoid)은 밀지 않는다 — 밀면 캡 뒤로 주머니처럼 불거진다.
 * - 앞머리는 곧은 행렬 대신 굽은 중심선(`layoutBang`)을 따라 깐다. 배치(위치·회전·크기)는 그 중심선의
 *   뿌리→끝 현이다.
 */
function layoutAvatarForgeHairPart(part: AvatarForgeHairPart, fit: StudioVrmHeadFit): AvatarForgeHairLayout {
  const head = canonicalHead(fit);
  const scaleX = head.rx / UNIT_CAP_RADIUS[0];
  const scaleY = head.ry / UNIT_CAP_RADIUS[1];
  const scaleZ = head.rz / UNIT_CAP_RADIUS[2];
  const position = new THREE.Vector3(
    head.cx + (part.position[0] - UNIT_CAP_CENTER[0]) * scaleX,
    head.cy + (part.position[1] - UNIT_CAP_CENTER[1]) * scaleY,
    head.cz + (part.position[2] - UNIT_CAP_CENTER[2]) * scaleZ,
  );
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(part.rotation[0], part.rotation[1], part.rotation[2], "XYZ"),
  );
  const scale = new THREE.Vector3(part.scale[0] * scaleX, part.scale[1] * scaleY, part.scale[2] * scaleZ);
  const radii = [head.rx, head.ry, head.rz] as const;
  const center = [head.cx, head.cy, head.cz] as const;
  let bang: CanonicalBang | null = null;

  if (part.role === "cap") {
    const fitted = [0, 1, 2].map((axis) => {
      const planned = Math.abs(scale.getComponent(axis)) / radii[axis];
      const shell = planned >= 1
        ? AVATAR_FORGE_CAP_MIN_SHELL + (planned - 1)
        : AVATAR_FORGE_CAP_MIN_SHELL * clamp(planned, 0.5, 1);
      return radii[axis] * (1 + shell) + Math.abs(position.getComponent(axis) - center[axis]);
    });
    scale.set(fitted[0], fitted[1], fitted[2]);
  } else if (part.role === "bang") {
    bang = layoutBang(part, position.x, head);
    const root = bang.points[0]!;
    const tip = bang.points[bang.points.length - 1]!;
    const chord = root.clone().sub(tip);
    position.copy(root).add(tip).multiplyScalar(0.5);
    scale.y = Math.max(1e-6, chord.length() / 2);
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), chord.normalize());
  } else if (part.role === "bun") {
    seatOnSkull(position, head);
  } else if (part.role !== "ahoge") {
    if (!(part.role === "back" && part.primitive === "ellipsoid")) pushOutsideSkull(position, head);
    // 회전이 작은 파츠라 |scale.y| 를 세로 반경, |scale.x| 를 가로 반폭으로 본다.
    const topY = position.y + Math.abs(scale.y);
    const ceiling = skullTuckCeiling(position, Math.abs(scale.x), head);
    if (topY > ceiling) position.y -= topY - ceiling;
    if (part.role === "side" && part.primitive === "tapered-capsule" && position.y < head.cy) {
      // 얼굴 옆에 매달린 가닥은 면을 바깥(두상 법선)쪽으로 60% 돌린다. 계획대로 정면만 보면
      // 앞에선 판자, 옆에선 막대처럼 보였다(A-01 "얼굴 옆 판자 두 장").
      const outward = Math.atan2((position.x - head.cx) / head.rx, (position.z - head.cz) / head.rz);
      quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6 * outward));
    }
  }

  const pivot = new THREE.Vector3(head.cx, head.cy, head.cz);
  const toHead = (point: THREE.Vector3) => fit.frontSign < 0
    ? point.sub(pivot).applyQuaternion(FACE_MINUS_Z).add(new THREE.Vector3(fit.center[0], fit.center[1], fit.center[2]))
    : point;
  toHead(position);
  if (fit.frontSign < 0) quaternion.premultiply(FACE_MINUS_Z);
  if (!bang) return { position, quaternion, scale };
  return {
    position,
    quaternion,
    scale,
    spine: Object.freeze({
      points: bang.points.map((point) => toHead(point)),
      normals: bang.normals.map((normal) => (fit.frontSign < 0 ? normal.applyQuaternion(FACE_MINUS_Z) : normal)),
      halfWidth: Math.abs(scale.x),
      thickness: Math.abs(scale.z),
    }),
  };
}

/** 파츠의 배치(위치·회전·크기). 앞머리는 굽은 중심선의 뿌리→끝 현이다. */
export function transformAvatarForgeHairPart(part: AvatarForgeHairPart, fit: StudioVrmHeadFit): AvatarForgeHairPlacement {
  const { position, quaternion, scale } = layoutAvatarForgeHairPart(part, fit);
  return { position, quaternion, scale };
}

export function avatarForgeHairInstance(part: AvatarForgeHairPart, fit: StudioVrmHeadFit): StudioVrmAuthoredHairInstance {
  if (part.role === "back" && part.primitive === "ellipsoid" && (FLOWING_BACK_SHELL_IDS.has(part.id) || part.id === "wolf-layer")) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...fit.center),
      fit.frontSign < 0 ? FACE_MINUS_Z : new THREE.Quaternion(),
      new THREE.Vector3(fit.radiusX, fit.radiusY, fit.radiusZ),
    );
    return { part, matrix, drapeLength: (0.18 - part.position[1] + Math.abs(part.scale[1])) / UNIT_CAP_RADIUS[1] };
  }
  const layout = layoutAvatarForgeHairPart(part, fit);
  const matrix = new THREE.Matrix4().compose(layout.position, layout.quaternion, layout.scale);
  if (part.id === "twin-left" || part.id === "twin-right") {
    return { part, matrix, spine: fitStudioVrmTwinTailSpine(part, fit), rootGirthScale: 0.44 };
  }
  const flowingLock = part.primitive === "tapered-capsule"
    && (part.role === "back" || part.id.startsWith("wolf-nape-") || (part.role === "side" && part.position[1] < 0.18));
  const spine = flowingLock ? fitStudioVrmHairLockSpine(part, fit, layout) : layout.spine;
  // 정면과 측후면 모두에서 넓고 각진 가닥의 시작 단면을 숨긴다.
  return Object.freeze(spine ? { part, matrix, spine, rootGirthScale: 0.035 } : { part, matrix });
}

/** 매듭과 꼬리를 한 두상 좌표계에서 맞춘 뒤 병합한다. */
export function fitAvatarForgeHairParts(
  parts: readonly AvatarForgeHairPart[],
  fit: StudioVrmHeadFit,
): StudioVrmAuthoredHairInstance[] {
  const instances = parts.map((part) => avatarForgeHairInstance(part, fit));
  fitStudioVrmBraidLinks(instances, fit);
  const knot = instances.find(({ part }) => part.id === "pony-root");
  const tailIndex = instances.findIndex(({ part }) => part.id === "pony-tail");
  const tail = instances[tailIndex];
  if (!knot || !tail) return instances;

  // 매듭 뒤쪽 안에 가닥의 뿌리(local y = 1)를 심는다. 두상 피팅 뒤의 매듭을 써야
  // 묶음 높이·모델 정면 축이 바뀌어도 머리카락이 매듭에서 떨어지지 않는다.
  const root = new THREE.Vector3(0, 0, -0.35).applyMatrix4(knot.matrix);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  tail.matrix.decompose(position, rotation, scale);
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(rotation);
  const forward = new THREE.Vector3(0, 0, 1).transformDirection(knot.matrix);
  const towardFace = down.dot(forward);
  if (towardFace > 0) {
    // 같은 기울기와 길이를 유지하며 목 안쪽으로 향하던 꼬리를 뒤로 내린다.
    const outward = down.clone().addScaledVector(forward, -2 * towardFace);
    rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(down, outward));
    down.copy(outward);
  }
  position.copy(root).addScaledVector(down, scale.y);
  const knotScale = new THREE.Vector3().setFromMatrixScale(knot.matrix);
  instances[tailIndex] = {
    part: tail.part,
    matrix: tail.matrix.compose(position, rotation, scale),
    rootGirthScale: Math.min(1, knotScale.x / scale.x, knotScale.y / scale.z, knotScale.z / scale.z),
  };
  return instances;
}

function deriveRenderHairStrand(
  template: AvatarForgeHairPart,
  patch: Pick<AvatarForgeHairPart, "id" | "role" | "position" | "rotation" | "scale" | "taper">
    & Partial<Pick<AvatarForgeHairPart, "curl" | "wave" | "waveFrequency">>,
): AvatarForgeHairPart {
  return {
    ...template,
    ...patch,
    primitive: "tapered-capsule",
  };
}

/**
 * v1 파츠 계획의 하위호환(JSON 바이트 고정)을 깨지 않으면서 실제 3D 렌더 메시의 앞머리 밀도·
 * 비대칭 깃털 잔머리·볼선 C-컬 잔머리·다층 사이드 커튼·뒷머리 드레이프 리본을 전개한다.
 */
export function expandAvatarForgeHairPartsForRender(
  parts: readonly AvatarForgeHairPart[],
  hair: Pick<AvatarForgeHairParams, "bangStyle" | "strandWidth" | "fringe" | "length">
    & Partial<Pick<AvatarForgeHairParams, "style" | "wave" | "curl">>,
): AvatarForgeHairPart[] {
  if (parts.length === 0) return [];
  const expanded: AvatarForgeHairPart[] = parts.map(refineBasePartForRender);
  const w = hair.strandWidth;
  const f = hair.fringe;
  const l = hair.length;

  const baseBang = parts.find((part) => part.role === "bang");
  if (baseBang && hair.bangStyle !== "none") {
    const bangTemplate: AvatarForgeHairPart = {
      ...baseBang,
      accentMode: baseBang.accentMode === "inner" ? "inner" : undefined,
      accentColor: baseBang.accentMode === "inner" ? baseBang.accentColor : undefined,
    };
    const pushBang = (
      id: string,
      position: readonly [number, number, number],
      rotation: readonly [number, number, number],
      scale: readonly [number, number, number],
      taper: number,
    ) => {
      expanded.push(deriveRenderHairStrand(bangTemplate, { id, role: "bang", position, rotation, scale, taper }));
    };

    if (hair.bangStyle === "full") {
      pushBang("bang-full-fill-left", [-0.105, 0.04, 0.39], [0.05, 0, -0.04], [0.145 * w, 0.36 * f, 0.076 * w], 0.46);
      pushBang("bang-full-fill-right", [0.105, 0.04, 0.39], [0.05, 0, 0.04], [0.145 * w, 0.36 * f, 0.076 * w], 0.46);
      pushBang("bang-full-temple-left", [-0.31, 0.01, 0.34], [0.04, 0, -0.06], [0.135 * w, 0.4 * f, 0.074 * w], 0.48);
      pushBang("bang-full-temple-right", [0.31, 0.01, 0.34], [0.04, 0, 0.06], [0.135 * w, 0.4 * f, 0.074 * w], 0.48);
    } else if (hair.bangStyle === "curtain") {
      pushBang("bang-curtain-crown-left", [-0.048, 0.03, 0.395], [0.03, 0, -0.24], [0.14 * w, 0.34 * f, 0.078 * w], 0.52);
      pushBang("bang-curtain-crown-right", [0.048, 0.03, 0.395], [0.03, 0, 0.24], [0.14 * w, 0.34 * f, 0.078 * w], 0.52);
      pushBang("bang-curtain-temple-left", [-0.35, -0.04, 0.335], [0.02, 0, -0.05], [0.125 * w, 0.5 * f, 0.076 * w], 0.46);
      pushBang("bang-curtain-temple-right", [0.35, -0.04, 0.335], [0.02, 0, 0.05], [0.125 * w, 0.5 * f, 0.076 * w], 0.46);
    } else if (hair.bangStyle === "split") {
      pushBang("bang-split-crown-left", [-0.045, 0.05, 0.395], [0.04, 0, -0.28], [0.125 * w, 0.31 * f, 0.076 * w], 0.58);
      pushBang("bang-split-crown-right", [0.045, 0.05, 0.395], [0.04, 0, 0.28], [0.125 * w, 0.31 * f, 0.076 * w], 0.58);
      pushBang("bang-split-temple-left", [-0.34, 0, 0.335], [0.04, 0, -0.06], [0.12 * w, 0.43 * f, 0.075 * w], 0.52);
      pushBang("bang-split-temple-right", [0.34, 0, 0.335], [0.04, 0, 0.06], [0.12 * w, 0.43 * f, 0.075 * w], 0.52);
    } else if (hair.bangStyle === "blunt") {
      pushBang("bang-blunt-under-left", [-0.18, 0.05, 0.385], [0.03, 0, 0], [0.115 * w, 0.295 * f, 0.072 * w], 0.14);
      pushBang("bang-blunt-under-right", [0.18, 0.05, 0.385], [0.03, 0, 0], [0.115 * w, 0.295 * f, 0.072 * w], 0.14);
      pushBang("bang-blunt-temple-left", [-0.33, 0.02, 0.34], [0.03, 0, -0.06], [0.12 * w, 0.38 * f, 0.076 * w], 0.36);
      pushBang("bang-blunt-temple-right", [0.33, 0.02, 0.34], [0.03, 0, 0.06], [0.12 * w, 0.38 * f, 0.076 * w], 0.36);
    } else if (hair.bangStyle === "side-swept") {
      pushBang("bang-sweep-fill-center", [0.09, 0.04, 0.395], [0.05, 0, 0.24], [0.145 * w, 0.35 * f, 0.078 * w], 0.58);
      pushBang("bang-sweep-temple-left", [-0.34, 0.01, 0.34], [0.05, 0, 0.08], [0.12 * w, 0.35 * f, 0.074 * w], 0.56);
      pushBang("bang-sweep-temple-right", [0.33, 0.01, 0.34], [0.05, 0, -0.06], [0.12 * w, 0.38 * f, 0.074 * w], 0.54);
    }

    // 비대칭 깃털 잔머리 서브 가닥(layoutBang 중심선 경로를 타므로 VRM 12종 전체에서 0관통 보장)
    const isBlunt = hair.bangStyle === "blunt";
    const innerLeftLen = isBlunt ? 0.305 * f : 0.365 * f;
    const innerRightLen = isBlunt ? 0.308 * f : 0.405 * f;
    const innerTaper = isBlunt ? 0.58 : 0.82;
    pushBang("bang-feather-inner-left", [-0.068, 0.04, 0.412], [0.04, 0, isBlunt ? -0.02 : -0.09], [0.072 * w, innerLeftLen, 0.056 * w], innerTaper);
    pushBang("bang-feather-inner-right", [0.134, 0.035, 0.416], [0.04, 0, isBlunt ? 0.03 : 0.12], [0.068 * w, innerRightLen, 0.054 * w], innerTaper);
    pushBang("bang-feather-outer-left", [-0.255, 0.01, 0.372], [0.03, 0, -0.11], [0.078 * w, (isBlunt ? 0.37 : 0.44) * f, 0.058 * w], 0.8);
    pushBang("bang-feather-outer-right", [0.268, 0.005, 0.376], [0.03, 0, 0.13], [0.074 * w, (isBlunt ? 0.39 : 0.46) * f, 0.056 * w], 0.8);
  }

  // 관자놀이~볼선 연결 브리지 + 안쪽 턱선 C-컬 잔머리(`cheek-wisp-left/right`)
  const leftSide = parts.find((part) => part.role === "side" && part.position[0] < 0);
  const rightSide = parts.find((part) => part.role === "side" && part.position[0] > 0);
  const cheekWispLength = clamp(0.32 * l, 0.22, 0.44);
  if (leftSide && rightSide) {
    const bridgeY = Math.min(-0.06, leftSide.position[1] * 0.72);
    const bridgeWidth = Math.max(0.125 * w, leftSide.scale[0] * 0.82);
    const bridgeLength = Math.max(0.28 * l, leftSide.scale[1] * 0.76);
    const bridgeDepth = Math.max(0.085 * w, leftSide.scale[2] * 0.72);
    const bridgeTaper = clamp(leftSide.taper + 0.14, 0.44, 0.7);
    const cheekY = Math.min(-0.11, leftSide.position[1] * 0.54);
    const cheekCurl = Math.max(leftSide.curl, 0.26);
    const cheekWave = Math.max(leftSide.wave ?? 0, 0.18);
    expanded.push(
      deriveRenderHairStrand(leftSide, {
        id: "temple-bridge-left",
        role: "side",
        position: [-0.41, bridgeY, 0.145],
        rotation: [0.03, 0, 0.04],
        scale: [bridgeWidth, bridgeLength, bridgeDepth],
        taper: bridgeTaper,
        curl: Math.max(leftSide.curl, 0.2),
        wave: Math.max(leftSide.wave ?? 0, 0.18),
        waveFrequency: 2.4,
      }),
      deriveRenderHairStrand(rightSide, {
        id: "temple-bridge-right",
        role: "side",
        position: [0.41, bridgeY, 0.145],
        rotation: [0.03, 0, -0.04],
        scale: [bridgeWidth, bridgeLength, bridgeDepth],
        taper: bridgeTaper,
        curl: Math.max(rightSide.curl, 0.2),
        wave: Math.max(rightSide.wave ?? 0, 0.18),
        waveFrequency: 2.4,
      }),
      deriveRenderHairStrand(leftSide, {
        id: "cheek-wisp-left",
        role: "side",
        position: [-0.365, cheekY, 0.225],
        rotation: [0.04, 0, -0.09],
        scale: [0.086 * w, cheekWispLength, 0.064 * w],
        taper: 0.78,
        curl: cheekCurl,
        wave: cheekWave,
        waveFrequency: 2.2,
      }),
      deriveRenderHairStrand(rightSide, {
        id: "cheek-wisp-right",
        role: "side",
        position: [0.365, cheekY, 0.225],
        rotation: [0.04, 0, 0.09],
        scale: [0.086 * w, cheekWispLength, 0.064 * w],
        taper: 0.78,
        curl: cheekCurl,
        wave: cheekWave,
        waveFrequency: 2.2,
      }),
    );
  } else if (baseBang && hair.bangStyle !== "none") {
    const wispLength = 0.26 * Math.min(1.1, l);
    expanded.push(
      deriveRenderHairStrand(baseBang, {
        id: "temple-wisp-left",
        role: "side",
        position: [-0.41, -0.06, 0.18],
        rotation: [0.03, 0, 0.05],
        scale: [0.105 * w, wispLength, 0.075 * w],
        taper: 0.68,
        curl: Math.max(baseBang.curl, 0.22),
      }),
      deriveRenderHairStrand(baseBang, {
        id: "temple-wisp-right",
        role: "side",
        position: [0.41, -0.06, 0.18],
        rotation: [0.03, 0, -0.05],
        scale: [0.105 * w, wispLength, 0.075 * w],
        taper: 0.68,
        curl: Math.max(baseBang.curl, 0.22),
      }),
      deriveRenderHairStrand(baseBang, {
        id: "cheek-wisp-left",
        role: "side",
        position: [-0.365, -0.1, 0.225],
        rotation: [0.04, 0, -0.09],
        scale: [0.082 * w, cheekWispLength * 0.85, 0.06 * w],
        taper: 0.78,
        curl: Math.max(baseBang.curl, 0.26),
        wave: 0.16,
        waveFrequency: 2.2,
      }),
      deriveRenderHairStrand(baseBang, {
        id: "cheek-wisp-right",
        role: "side",
        position: [0.365, -0.1, 0.225],
        rotation: [0.04, 0, 0.09],
        scale: [0.082 * w, cheekWispLength * 0.85, 0.06 * w],
        taper: 0.78,
        curl: Math.max(baseBang.curl, 0.26),
        wave: 0.16,
        waveFrequency: 2.2,
      }),
    );
  }

  // 흐르는 스타일(웨이브·롱·보브·히메컷·반묶음): 외곽 S-웨이브 사이드 커튼 + 다층 뒷머리 드레이프 리본 전개
  const backShell = parts.find(
    (part) => part.role === "back" && part.primitive === "ellipsoid" && FLOWING_BACK_SHELL_IDS.has(part.id),
  );
  const inferredStyle = hair.style
    ?? (backShell?.id === "wavy-back"
      ? "wavy"
      : backShell?.id === "hime-back"
        ? "hime"
        : backShell?.id === "halfup-back"
          ? "half-up"
          : backShell
            ? (backShell.scale[1] > 0.65 * l ? "long" : "bob")
            : undefined);
  const isFlowingStyle = inferredStyle === "wavy"
    || inferredStyle === "long"
    || inferredStyle === "bob"
    || inferredStyle === "hime"
    || inferredStyle === "half-up";

  if (isFlowingStyle && leftSide && rightSide) {
    const isWavy = inferredStyle === "wavy";
    const isBob = inferredStyle === "bob";
    const isHime = inferredStyle === "hime";
    const isHalfUp = inferredStyle === "half-up";
    const flowLength = (isBob ? 0.54 : isHalfUp ? 0.72 : isWavy ? 0.92 : 0.88) * l;
    const flowWave = isWavy
      ? Math.max(leftSide.wave ?? 0, 0.62)
      : isHime
        ? Math.max(leftSide.wave ?? 0, 0.14)
        : Math.max(leftSide.wave ?? 0, 0.28);
    const flowFreq = isWavy ? 2.85 : 2.3;
    const flowCurl = isWavy
      ? Math.max(leftSide.curl, 0.34)
      : isHime
        ? Math.max(leftSide.curl, 0.14)
        : Math.max(leftSide.curl, 0.24);
    expanded.push(
      deriveRenderHairStrand(leftSide, {
        id: "side-flow-left",
        role: "side",
        position: [-0.465, -0.25 * l, -0.065],
        rotation: [0.02, 0, 0.06],
        scale: [0.132 * w, flowLength, 0.098 * w],
        taper: 0.66,
        curl: flowCurl,
        wave: flowWave,
        waveFrequency: flowFreq,
      }),
      deriveRenderHairStrand(rightSide, {
        id: "side-flow-right",
        role: "side",
        position: [0.465, -0.25 * l, -0.065],
        rotation: [0.02, 0, -0.06],
        scale: [0.132 * w, flowLength, 0.098 * w],
        taper: 0.66,
        curl: flowCurl,
        wave: flowWave,
        waveFrequency: flowFreq,
      }),
      deriveRenderHairStrand(leftSide, {
        id: "side-layer-left",
        role: "side",
        position: [-0.435, -0.17 * l, -0.185],
        rotation: [0.03, 0, 0.08],
        scale: [0.118 * w, flowLength * 0.78, 0.09 * w],
        taper: 0.74,
        curl: flowCurl * 0.92,
        wave: flowWave * 0.9,
        waveFrequency: flowFreq,
      }),
      deriveRenderHairStrand(rightSide, {
        id: "side-layer-right",
        role: "side",
        position: [0.435, -0.17 * l, -0.185],
        rotation: [0.03, 0, -0.08],
        scale: [0.118 * w, flowLength * 0.78, 0.09 * w],
        taper: 0.74,
        curl: flowCurl * 0.92,
        wave: flowWave * 0.9,
        waveFrequency: flowFreq,
      }),
    );
  }

  if (isFlowingStyle && backShell) {
    const isWavy = inferredStyle === "wavy";
    const isBob = inferredStyle === "bob";
    const isHime = inferredStyle === "hime";
    const isHalfUp = inferredStyle === "half-up";
    const drapeLength = Math.max(backShell.scale[1] * 1.08, (isBob ? 0.56 : isHalfUp ? 0.86 : 0.96) * l);
    const drapeWave = isWavy
      ? Math.max(hair.wave ?? 0, 0.56)
      : isHime
        ? Math.max(hair.wave ?? 0, 0.12)
        : Math.max(hair.wave ?? 0, 0.22);
    const drapeFreq = isWavy ? 2.7 : 2.2;
    const drapeCurl = isWavy ? Math.max(backShell.curl, 0.28) : Math.max(backShell.curl, 0.16);
    // 뒷머리 드레이프 리본은 Y축 180° 회전해 볼록한 앞면 광택이 뒤통수 바깥쪽(-z)을 향하게 한다.
    const pushBackDrape = (
      id: string,
      position: readonly [number, number, number],
      rotation: readonly [number, number, number],
      scale: readonly [number, number, number],
      taper: number,
    ) => {
      expanded.push(deriveRenderHairStrand(backShell, {
        id,
        role: "back",
        position,
        rotation,
        scale,
        taper,
        curl: drapeCurl,
        wave: drapeWave,
        waveFrequency: drapeFreq,
      }));
    };
    pushBackDrape("back-drape-center", [0, -0.34 * l, -0.44], [-0.06, Math.PI, 0], [0.195 * w, drapeLength * 1.03, 0.112 * w], 0.62);
    pushBackDrape("back-drape-left", [-0.215, -0.32 * l, -0.415], [-0.05, Math.PI + 0.3, -0.04], [0.178 * w, drapeLength * 0.98, 0.106 * w], 0.66);
    pushBackDrape("back-drape-right", [0.215, -0.32 * l, -0.415], [-0.05, Math.PI - 0.3, 0.04], [0.178 * w, drapeLength * 0.98, 0.106 * w], 0.66);
    pushBackDrape("back-drape-outer-left", [-0.375, -0.28 * l, -0.295], [-0.04, Math.PI + 0.72, -0.05], [0.158 * w, drapeLength * 0.92, 0.098 * w], 0.7);
    pushBackDrape("back-drape-outer-right", [0.375, -0.28 * l, -0.295], [-0.04, Math.PI - 0.72, 0.05], [0.158 * w, drapeLength * 0.92, 0.098 * w], 0.7);
  }

  if (inferredStyle === "pixie") return expanded.map((part) => cropPixieHairPart(part, hair.bangStyle === "side-swept"));
  if (inferredStyle !== "bob") return expanded;
  // 단발은 목 뒤로 모이고 턱 옆이 살짝 길다. 어깨 아래까지 뻗는 롱 드레이프와 길이를 구분한다.
  return expanded.map((part) => {
    if (part.role !== "back" && part.role !== "side") return part;
    const hemScale = part.role === "back" ? 0.65 : 0.72;
    const [x, y, z] = part.position;
    const [width, length, thickness] = part.scale;
    return { ...part, position: [x, 0.18 + (y - 0.18) * hemScale, z], scale: [width, length * hemScale, thickness] };
  });
}

/**
 * 계획된 헤어 파츠를 두상 맞춤으로 옮겨 그룹에 붙인다. 파츠가 없으면(헤어 없음) 아무것도 붙이지 않는다.
 * 본체 VRM과 동일한 MToon 셰이딩·엔젤링 하이라이트·용접 법선 역면 외곽선을 적용해 이질감과 알파 정렬 깨짐을 막는다.
 * 그룹 userData 의 소유 텍스처는 호출자가 폐기 때 함께 정리한다.
 */
export function addAvatarForgeHairParts(
  group: THREE.Group,
  state: AvatarForgeState,
  fit: StudioVrmHeadFit,
  profile?: StudioVrmBodyMtoonProfile,
): void {
  const parts = buildAvatarForgeHairParts(state, expandAvatarForgeHairPartsForRender);
  const merged = mergeStudioVrmAuthoredHairGeometry(
    fitAvatarForgeHairParts(parts, fit),
    { minScalpMargin: 0.004, crownCompression: 0.24, crownLatitudeMin: 0.36, earArchRelief: 0.25 },
  );
  if (!merged) return;

  const { main, outline: outlineMaterial, ownedTextures } = createStudioVrmHairMToonMaterials(
    state.hair,
    profile,
  );
  const mesh = new THREE.Mesh(merged, main);
  mesh.name = "ToonStudioAvatarForgeHair_AuthoredMerged";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.partCount = parts.length;
  mesh.userData.toonstudioComponent = "hair";

  const outline = new THREE.Mesh(createStudioVrmSmoothOutlineGeometry(merged), outlineMaterial);
  outline.name = "ToonStudioAvatarForgeHairOutline_AuthoredMerged";
  outline.userData.partCount = parts.length;
  outline.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] = true;
  outline.userData.toonstudioComponent = "hair";
  outline.raycast = () => undefined;
  outline.castShadow = false;
  outline.receiveShadow = false;

  const existing = Array.isArray(group.userData[AVATAR_FORGE_OWNED_TEXTURES])
    ? (group.userData[AVATAR_FORGE_OWNED_TEXTURES] as THREE.Texture[])
    : [];
  group.userData[AVATAR_FORGE_OWNED_TEXTURES] = [...existing, ...ownedTextures];
  group.add(outline, mesh);
}

/** 그룹이 소유한 지오메트리·재질·텍스처를 정확히 한 번씩 버린다. */
export function disposeAvatarForgeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    const childMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    childMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  const textures = object.userData[AVATAR_FORGE_OWNED_TEXTURES];
  if (Array.isArray(textures)) {
    for (const texture of textures) {
      if (texture instanceof THREE.Texture) texture.dispose();
    }
  }
}
