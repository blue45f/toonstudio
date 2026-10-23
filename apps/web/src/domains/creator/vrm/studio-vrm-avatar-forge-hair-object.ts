/**
 * 포지 헤어 오브젝트(병합 메시 + 외곽선)를 두상 맞춤 위에 짓는다.
 *
 * 셰이퍼 뷰포트(`StudioVrmAvatarForge.tsx`)와 헤어 카드 썸네일 렌더러가 **같은 함수**로 헤어를 만든다.
 * 그래서 카드에 보이는 머리와 실제 3D 에 씌워지는 머리가 갈라질 수 없다(A-07).
 */
import * as THREE from "three";

import {
  createStudioVrmAuthoredHairGradientTexture,
  mergeStudioVrmAuthoredHairGeometry,
  studioVrmAuthoredCapHairlineHeight,
  type StudioVrmAuthoredHairInstance,
  type StudioVrmAuthoredHairSpine,
} from "./studio-vrm-authored-hair-geometry";
import {
  buildAvatarForgeHairParts,
  type AvatarForgeHairPart,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import type { StudioVrmHeadFit } from "./studio-vrm-head-fit";

/** 헤어 단위 공간에서 두상(캡) 중심과 반경. 파츠 계획(studio-vrm-avatar-forge.ts)이 이 공간으로 쓰여 있다. */
const UNIT_CAP_CENTER = [0, 0.18, 0.015] as const;
const UNIT_CAP_RADIUS = [0.56, 0.46, 0.54] as const;

/** 생성 헤어가 소유한 텍스처 목록(userData 키). 폐기 때 함께 버린다. */
export const AVATAR_FORGE_OWNED_TEXTURES = "toonSpectrumAvatarForgeOwnedTextures";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 캡 껍질의 최소 두께(두개골 반경 대비). 생성 캐릭터 파이프라인(`studio-vrm-humanoid-mesh.ts` 의
 * `fitHairCapToSkull`)과 같은 규칙이다 — 볼륨 1 이하는 이 안에서만 얇아지고 살갗 밑으로는 못 간다.
 * 예전 VRM 부착 경로는 이 규칙이 없어 픽시·번 레시피(볼륨 0.86~0.96)에서 캡이 두피 안으로 들어갔다.
 */
export const AVATAR_FORGE_CAP_MIN_SHELL = 0.05;

const FACE_MINUS_Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export interface AvatarForgeHairPlacement {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
}

/** 가닥 뿌리를 덮는 캡 껍질의 보수적 반경 배율(가장 얇은 캡 +2.5% 와 기본 캡 +5% 사이). */
const TUCK_CAP_SHELL = 1.035;

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
  const hairline = hairlineAt(x0 - Math.sign(x0 - head.cx || 1) * 0.5 * halfWidth);
  const rootY = Math.min(head.cy + 0.8 * head.ry, hairline + 0.16 * head.ry);
  // 길이 배율 0.7(레시피 기본 근처)이면 눈썹(눈 + 0.18·ry), 1 을 넘으면 눈 아래까지 내려온다.
  const tipY = Math.min(rootY - 0.2 * head.ry, head.eyeY + head.ry * (0.18 + 0.75 * (0.7 - lengthScale)));
  const visibleMid = (Math.min(rootY, hairline) + tipY) / 2;
  // 계획 깊이(z)가 앞쪽인 갈래일수록 살짝 앞 겹에 둔다(겹친 갈래끼리 면이 겹쳐 깜박이지 않게).
  const layer = clamp((part.position[2] - 0.33) / 0.1, 0, 1) * 0.02 * head.rz;
  const front = 0.32 * thickness;
  const back = 0.14 * thickness;
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  for (let index = 0; index < BANG_SPINE_SAMPLES; index += 1) {
    const t = index / (BANG_SPINE_SAMPLES - 1);
    const y = rootY + (tipY - rootY) * t;
    const x = x0 + drift * (visibleMid - y);
    const flare = smoothstep(hairline, tipY, y);
    const outside = foreheadDepth(x, y, head) + back + (0.012 + 0.04 * flare) * head.rz + layer;
    const inside = skullFrontDepth(x, y, head, BANG_CAP_SHELL) - front - 0.004 * head.rz;
    const underCap = smoothstep(hairline - 0.04 * head.ry, hairline + 0.1 * head.ry, y);
    const depth = outside + (Math.min(inside, outside) - outside) * underCap;
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
  const layout = layoutAvatarForgeHairPart(part, fit);
  const matrix = new THREE.Matrix4().compose(layout.position, layout.quaternion, layout.scale);
  return Object.freeze(layout.spine ? { part, matrix, spine: layout.spine } : { part, matrix });
}

function createExpandedOutlineGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const outline = source.clone();
  const position = outline.getAttribute("position");
  const normal = outline.getAttribute("normal");
  if (!position || !normal) return outline;
  outline.computeBoundingSphere();
  const thickness = Math.max(0.00045, (outline.boundingSphere?.radius ?? 0.08) * 0.0085);
  const values = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    values[index * 3] = position.getX(index) + normal.getX(index) * thickness;
    values[index * 3 + 1] = position.getY(index) + normal.getY(index) * thickness;
    values[index * 3 + 2] = position.getZ(index) + normal.getZ(index) * thickness;
  }
  outline.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
  outline.computeBoundingBox();
  outline.computeBoundingSphere();
  return outline;
}

function createHairMaterial(state: AvatarForgeState, gradientMap: THREE.DataTexture) {
  const material = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    gradientMap,
    side: THREE.DoubleSide,
  });
  material.emissive.set(state.hair.baseColor);
  material.emissiveIntensity = clamp(0.012 + state.hair.shine * 0.045, 0.012, 0.057);
  return material;
}

function createHairOutlineMaterial(state: AvatarForgeState) {
  const outline = new THREE.Color(state.hair.shadowColor ?? state.hair.baseColor)
    .lerp(new THREE.Color("#090708"), 0.62);
  return new THREE.MeshBasicMaterial({
    color: outline,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * 계획된 헤어 파츠를 두상 맞춤으로 옮겨 그룹에 붙인다. 파츠가 없으면(헤어 없음) 아무것도 붙이지 않는다.
 * 그룹 userData 의 소유 텍스처는 호출자가 폐기 때 함께 정리한다.
 */
export function addAvatarForgeHairParts(group: THREE.Group, state: AvatarForgeState, fit: StudioVrmHeadFit): void {
  const parts = buildAvatarForgeHairParts(state);
  const merged = mergeStudioVrmAuthoredHairGeometry(
    parts.map((part) => avatarForgeHairInstance(part, fit)),
  );
  if (!merged) return;

  const gradientMap = createStudioVrmAuthoredHairGradientTexture();
  const mesh = new THREE.Mesh(merged, createHairMaterial(state, gradientMap));
  const outline = new THREE.Mesh(createExpandedOutlineGeometry(merged), createHairOutlineMaterial(state));
  mesh.name = "ToonStudioAvatarForgeHair_AuthoredMerged";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 6;
  mesh.userData.partCount = parts.length;
  outline.name = "ToonStudioAvatarForgeHairOutline_AuthoredMerged";
  outline.renderOrder = 5;
  outline.userData.partCount = parts.length;
  group.userData[AVATAR_FORGE_OWNED_TEXTURES] = [gradientMap];
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
