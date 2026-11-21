/**
 * VRoid Studio 클린룸 프로시저럴 헤어 그룹 & Catmull-Rom 3D 리본 메시 생성기.
 *
 * 6개 헤어 그룹(앞머리·옆머리·뒷머리·바보털·트윈테일·포니테일)의 용접 법선 + 엔젤링 UV +
 * SpringBone 물리 파라미터 + MToon 본체 프로파일 동기화 + 이중 헤어 제거 + GPU 폐기를 담당한다.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import {
  STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY,
  createStudioVrmHairMToonMaterials,
  createStudioVrmSmoothOutlineGeometry,
  sampleStudioVrmBodyMtoonProfile,
  smoothStudioVrmCoincidentNormals,
  syncStudioVrmCustomPartToActiveVrm,
  type StudioVrmBodyMtoonProfile,
} from "./studio-vrm-custom-part-material";
import {
  VROID_HAIR_GROUP_SPECS,
  VROID_HAIR_PALETTE_PRESETS,
  oklchToHexColorString,
  oklchToSrgb,
  type VroidHairGroupKind,
  type VroidHairGroupMeta,
  type VroidHairPalettePreset,
} from "./studio-vroid-atelier-presets";

import type { VRM } from "@pixiv/three-vrm";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export interface VroidHairSpringBoneSpec {
  readonly group: VroidHairGroupKind;
  readonly stiffness: number;
  readonly gravityPower: number;
  readonly gravityDir: readonly [number, number, number];
  readonly dragForce: number;
  readonly hitRadius: number;
  readonly jointChainCount: number;
  readonly colliderGroupIds: readonly string[];
}

export interface VroidHairStrandGroupOptions {
  readonly group: VroidHairGroupKind;
  readonly strandCount?: number;
  readonly lengthMeters?: number;
  readonly widthMeters?: number;
  readonly thicknessMeters?: number;
  readonly lengthSegments?: number;
  readonly curl?: number;
  readonly spread?: number;
  readonly gravitySag?: number;
  readonly twistRad?: number;
  readonly headRadius?: number;
  readonly palette?: Pick<VroidHairPalettePreset, "base" | "tip" | "shadow" | "shine">;
  readonly springBoneOverride?: Partial<Pick<VroidHairSpringBoneSpec, "stiffness" | "gravityPower" | "dragForce">>;
}

export interface VroidHairStrandGroupResult {
  readonly group: VroidHairGroupKind;
  readonly geometry: THREE.BufferGeometry;
  readonly outlineGeometry: THREE.BufferGeometry;
  readonly strandCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly angelRingBandV: readonly [number, number];
  readonly springBone: VroidHairSpringBoneSpec;
  readonly dispose: () => void;
}

export interface VroidHairMeshBundle {
  readonly groupObject: THREE.Group;
  readonly mainMesh: THREE.Mesh;
  readonly outlineMesh: THREE.Mesh;
  readonly springBone: VroidHairSpringBoneSpec;
  readonly mtoonProfile: StudioVrmBodyMtoonProfile;
  readonly hiddenOriginalHairCount: number;
  readonly dispose: () => void;
}

const DEFAULT_HAIR_PALETTE = VROID_HAIR_PALETTE_PRESETS[0]!;
const ORIGINAL_HAIR_MESH_PATTERN = /(?:hair|bang|ponytail|twintail|braid|ahoge|머리|헤어)/iu;

function findHairGroupMeta(group: VroidHairGroupKind): VroidHairGroupMeta {
  return VROID_HAIR_GROUP_SPECS.find((spec) => spec.kind === group) ?? VROID_HAIR_GROUP_SPECS[0]!;
}

/**
 * 헤어 그룹별 두개골 부착 기준점과 Catmull-Rom 제어점을 생성한다.
 * 좌표계: 머리 본 로컬 (+Z 정면, +Y 정수리, +X 캐릭터 왼쪽).
 */
function buildStrandControlPoints(
  group: VroidHairGroupKind,
  strandIndex: number,
  strandCount: number,
  lengthMeters: number,
  spread: number,
  curl: number,
  gravitySag: number,
  headRadius: number,
): readonly THREE.Vector3[] {
  const ratio = strandCount <= 1 ? 0 : (strandIndex / (strandCount - 1)) * 2 - 1;
  const r = clamp(headRadius, 0.06, 0.25);

  if (group === "front") {
    const angle = ratio * 0.68 * spread;
    const root = new THREE.Vector3(Math.sin(angle) * r * 0.86, r * 0.72, Math.cos(angle) * r * 0.92);
    const mid1 = new THREE.Vector3(
      root.x + ratio * 0.008 * spread,
      root.y - lengthMeters * 0.36,
      root.z + 0.018 + Math.abs(curl) * 0.01,
    );
    const mid2 = new THREE.Vector3(
      mid1.x + Math.sin(ratio * Math.PI) * curl * 0.018,
      root.y - lengthMeters * 0.72,
      root.z + 0.014 - gravitySag * 0.006,
    );
    const tip = new THREE.Vector3(
      mid2.x + ratio * 0.01 + curl * 0.012,
      root.y - lengthMeters,
      root.z + 0.008 + curl * 0.008,
    );
    return [root, mid1, mid2, tip];
  }

  if (group === "side") {
    const sideSign = strandIndex % 2 === 0 ? -1 : 1;
    const rank = Math.floor(strandIndex / 2);
    const pairCount = Math.max(1, Math.ceil(strandCount / 2));
    const localT = pairCount <= 1 ? 0 : rank / (pairCount - 1);
    const zOffset = (0.35 - localT * 0.52) * r;
    const root = new THREE.Vector3(sideSign * r * 0.96, r * (0.48 - localT * 0.14), zOffset);
    const mid1 = new THREE.Vector3(
      sideSign * (r * 1.06 + spread * 0.012),
      root.y - lengthMeters * 0.38,
      zOffset + 0.016,
    );
    const mid2 = new THREE.Vector3(
      sideSign * (r * 0.98 + curl * 0.016),
      root.y - lengthMeters * 0.74,
      zOffset + 0.022 - gravitySag * 0.008,
    );
    const tip = new THREE.Vector3(
      sideSign * (r * 0.86 - curl * 0.012),
      root.y - lengthMeters,
      zOffset + 0.018,
    );
    return [root, mid1, mid2, tip];
  }

  if (group === "ahoge") {
    const sign = strandIndex % 2 === 0 ? 1 : -1;
    const root = new THREE.Vector3(sign * 0.008 * strandIndex, r * 0.98, 0.012);
    const mid1 = new THREE.Vector3(sign * 0.024 * spread, r + lengthMeters * 0.62, 0.018);
    const mid2 = new THREE.Vector3(sign * (0.048 + curl * 0.022), r + lengthMeters * 0.86, 0.004);
    const tip = new THREE.Vector3(sign * (0.068 + curl * 0.028), r + lengthMeters * (0.45 - gravitySag * 0.25), -0.012);
    return [root, mid1, mid2, tip];
  }

  if (group === "twintail") {
    const sideSign = strandIndex % 2 === 0 ? -1 : 1;
    const localIndex = Math.floor(strandIndex / 2);
    const perSide = Math.max(1, Math.ceil(strandCount / 2));
    const fan = perSide <= 1 ? 0 : (localIndex / (perSide - 1)) * 2 - 1;
    const tie = new THREE.Vector3(sideSign * r * 0.92, r * 0.44, -r * 0.42);
    const arch = new THREE.Vector3(
      tie.x + sideSign * (0.06 + spread * 0.022),
      tie.y + 0.032 - gravitySag * 0.02,
      tie.z - 0.025 + fan * 0.022,
    );
    const mid = new THREE.Vector3(
      arch.x + sideSign * (0.03 + Math.sin(fan * Math.PI) * curl * 0.025),
      tie.y - lengthMeters * 0.52,
      tie.z - 0.03 + fan * 0.032,
    );
    const tip = new THREE.Vector3(
      mid.x + sideSign * (0.022 + curl * 0.032),
      tie.y - lengthMeters,
      tie.z - 0.022 + fan * 0.028,
    );
    return [tie, arch, mid, tip];
  }

  if (group === "ponytail") {
    const fanAngle = ratio * 0.65 * spread;
    const tie = new THREE.Vector3(0, r * 0.5, -r * 0.94);
    const arch = new THREE.Vector3(
      Math.sin(fanAngle) * 0.04,
      tie.y + 0.026 - gravitySag * 0.018,
      tie.z - 0.075,
    );
    const mid = new THREE.Vector3(
      Math.sin(fanAngle) * (0.075 + Math.abs(curl) * 0.015),
      tie.y - lengthMeters * 0.5,
      tie.z - 0.1 - Math.cos(fanAngle) * 0.02,
    );
    const tip = new THREE.Vector3(
      Math.sin(fanAngle) * (0.095 + curl * 0.024),
      tie.y - lengthMeters,
      tie.z - 0.085 + curl * 0.025,
    );
    return [tie, arch, mid, tip];
  }

  // "back" — 후두부 커튼 레이어
  const backAngle = Math.PI + ratio * 1.15 * spread;
  const root = new THREE.Vector3(Math.sin(backAngle) * r * 0.94, r * 0.56, Math.cos(backAngle) * r * 0.95);
  const mid1 = new THREE.Vector3(
    root.x * (1.06 + spread * 0.04),
    root.y - lengthMeters * 0.35,
    root.z - 0.026,
  );
  const mid2 = new THREE.Vector3(
    mid1.x + Math.sin(ratio * Math.PI) * curl * 0.02,
    root.y - lengthMeters * 0.7,
    root.z - 0.032 - gravitySag * 0.012,
  );
  const tip = new THREE.Vector3(
    mid2.x * 0.96 + curl * 0.014,
    root.y - lengthMeters,
    root.z - 0.024 + curl * 0.018,
  );
  return [root, mid1, mid2, tip];
}

/**
 * 단일 Catmull-Rom 3D 리본 스트랜드 지오메트리를 생성한다.
 * 단면 6정점(앞 능선·좌/우 날개·뒤 쉘) 폐곡면 + 평행이동 프레임 + 정점색 + 엔젤링 UV.
 */
function buildSingleStrandRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  lengthSegments: number,
  halfWidth: number,
  thickness: number,
  twistRad: number,
  palette: Pick<VroidHairPalettePreset, "base" | "tip" | "shadow" | "shine">,
): THREE.BufferGeometry {
  const baseSrgb = oklchToSrgb(palette.base);
  const tipSrgb = oklchToSrgb(palette.tip);
  const shadowSrgb = oklchToSrgb(palette.shadow);
  const baseColor = new THREE.Color().setRGB(baseSrgb.r, baseSrgb.g, baseSrgb.b, THREE.SRGBColorSpace);
  const tipColor = new THREE.Color().setRGB(tipSrgb.r, tipSrgb.g, tipSrgb.b, THREE.SRGBColorSpace);
  const shadowColor = new THREE.Color().setRGB(shadowSrgb.r, shadowSrgb.g, shadowSrgb.b, THREE.SRGBColorSpace);
  const highlightColor = tipColor.clone().lerp(new THREE.Color(1, 0.98, 0.95), 0.25 + clamp(palette.shine, 0, 1) * 0.3);

  const profile: readonly (readonly [number, number, number, boolean])[] = [
    [-1, 0.0, 0.0, false],
    [0, 1.0, 0.5, false],
    [1, 0.0, 1.0, false],
    [1, -0.35, 1.0, true],
    [0, -0.45, 0.5, true],
    [-1, -0.35, 0.0, true],
  ];
  const ringVerts = profile.length;
  const rows = lengthSegments + 1;

  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const uv1s: number[] = [];
  const indices: number[] = [];

  const prevTangent = curve.getTangent(0).normalize();
  const refUp = Math.abs(prevTangent.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  let normal = new THREE.Vector3().crossVectors(refUp, prevTangent).normalize();
  if (normal.lengthSq() < 1e-6) normal.set(1, 0, 0);
  let binormal = new THREE.Vector3().crossVectors(prevTangent, normal).normalize();

  const tempColor = new THREE.Color();
  const tempPos = new THREE.Vector3();

  for (let row = 0; row < rows; row += 1) {
    const v = row / lengthSegments;
    const point = curve.getPoint(v);
    const tangent = curve.getTangent(v).normalize();
    if (row > 0) {
      const rotAxis = new THREE.Vector3().crossVectors(prevTangent, tangent);
      const rotSin = rotAxis.length();
      if (rotSin > 1e-6) {
        rotAxis.divideScalar(rotSin);
        const angle = Math.atan2(rotSin, clamp(prevTangent.dot(tangent), -1, 1));
        const q = new THREE.Quaternion().setFromAxisAngle(rotAxis, angle);
        normal = normal.clone().applyQuaternion(q).normalize();
        binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      }
      prevTangent.copy(tangent);
    }

    const rowTwist = twistRad * v;
    const cosTw = Math.cos(rowTwist);
    const sinTw = Math.sin(rowTwist);
    const sideDir = normal.clone().multiplyScalar(cosTw).addScaledVector(binormal, sinTw).normalize();
    const depthDir = new THREE.Vector3().crossVectors(tangent, sideDir).normalize();

    const widthScale = Math.max(0.04, (0.85 + 0.15 * Math.sin(Math.min(1, v * 2.1) * Math.PI * 0.5)) * Math.pow(1 - v, 0.65));
    const depthScale = Math.max(0.08, 1 - v * 0.82);
    const angelRingV = clamp((v - 0.18) / 0.24, 0, 1);

    for (let col = 0; col < ringVerts; col += 1) {
      const [px, pz, uCoord, isBack] = profile[col]!;
      tempPos
        .copy(point)
        .addScaledVector(sideDir, px * halfWidth * widthScale)
        .addScaledVector(depthDir, pz * thickness * depthScale);
      positions.push(tempPos.x, tempPos.y, tempPos.z);
      uvs.push(uCoord, v);
      uv1s.push(uCoord, angelRingV);

      const ridge = !isBack && px === 0 ? 1 : 0;
      const edge = Math.abs(px);
      tempColor.copy(baseColor).lerp(tipColor, Math.pow(v, 1.15) * 0.72);
      tempColor.lerp(shadowColor, clamp(edge * 0.34 + (isBack ? 0.28 : 0), 0, 0.75));
      if (ridge > 0) {
        const ringGlow = Math.exp(-Math.pow((v - 0.3) / 0.14, 2));
        tempColor.lerp(highlightColor, clamp(0.14 + ringGlow * 0.28 * palette.shine, 0, 0.55));
      }
      colors.push(tempColor.r, tempColor.g, tempColor.b);
    }
  }

  for (let row = 0; row < lengthSegments; row += 1) {
    for (let col = 0; col < ringVerts; col += 1) {
      const nextCol = (col + 1) % ringVerts;
      const a = row * ringVerts + col;
      const b = row * ringVerts + nextCol;
      const c = (row + 1) * ringVerts + col;
      const d = (row + 1) * ringVerts + nextCol;
      indices.push(a, c, b, b, c, d);
    }
  }

  const rootStart = 0;
  indices.push(rootStart + 0, rootStart + 1, rootStart + 5);
  indices.push(rootStart + 1, rootStart + 2, rootStart + 4);
  indices.push(rootStart + 1, rootStart + 4, rootStart + 5);
  indices.push(rootStart + 2, rootStart + 3, rootStart + 4);

  const tipStart = lengthSegments * ringVerts;
  indices.push(tipStart + 0, tipStart + 5, tipStart + 1);
  indices.push(tipStart + 1, tipStart + 4, tipStart + 2);
  indices.push(tipStart + 1, tipStart + 5, tipStart + 4);
  indices.push(tipStart + 2, tipStart + 4, tipStart + 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(uv1s, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  smoothStudioVrmCoincidentNormals(geometry, { creaseAngleDeg: 180 });
  return geometry;
}

/**
 * VRoid Studio 스타일 프로시저럴 헤어 그룹 & 스트랜드 커브 생성기.
 *
 * 6개 헤어 그룹(앞머리·옆머리·뒷머리·바보털·트윈테일·포니테일)을 Catmull-Rom 3D 리본 메시로
 * 생성하고, 용접 법선 + 엔젤링 UV 매핑 + 역면 외곽선 지오메트리 + SpringBone 물리 파라미터를 반환한다.
 */
export function buildVroidHairStrandGroupGeometry(
  options: VroidHairStrandGroupOptions,
): VroidHairStrandGroupResult {
  const meta = findHairGroupMeta(options.group);
  const strandCount = Math.round(clamp(options.strandCount ?? meta.defaultStrandCount, 1, 24));
  const lengthMeters = clamp(options.lengthMeters ?? meta.defaultLengthMeters, 0.05, 1.1);
  const widthMeters = clamp(options.widthMeters ?? meta.defaultWidthMeters, 0.006, 0.08);
  const thicknessMeters = clamp(options.thicknessMeters ?? meta.defaultThicknessMeters, 0.003, 0.04);
  const lengthSegments = Math.round(clamp(options.lengthSegments ?? 14, 6, 32));
  const curl = clamp(options.curl ?? 0.2, -1, 1);
  const spread = clamp(options.spread ?? 1.0, 0.4, 1.6);
  const gravitySag = clamp(options.gravitySag ?? 0.35, 0, 1);
  const twistRad = clamp(options.twistRad ?? 0.12, -1.5, 1.5);
  const headRadius = clamp(options.headRadius ?? 0.105, 0.06, 0.25);
  const palette = options.palette ?? DEFAULT_HAIR_PALETTE;

  const strandGeometries: THREE.BufferGeometry[] = [];
  for (let i = 0; i < strandCount; i += 1) {
    const controlPoints = buildStrandControlPoints(
      options.group,
      i,
      strandCount,
      lengthMeters,
      spread,
      curl,
      gravitySag,
      headRadius,
    );
    const curve = new THREE.CatmullRomCurve3([...controlPoints], false, "centripetal", 0.5);
    strandGeometries.push(
      buildSingleStrandRibbonGeometry(curve, lengthSegments, widthMeters * 0.5, thicknessMeters, twistRad, palette),
    );
  }

  const merged = mergeGeometries(strandGeometries, false);
  for (const geo of strandGeometries) geo.dispose();
  if (!merged) {
    throw new Error(`VRoid 헤어 스트랜드 병합에 실패했습니다: ${options.group}`);
  }
  smoothStudioVrmCoincidentNormals(merged, { creaseAngleDeg: 180 });
  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  const outlineGeometry = createStudioVrmSmoothOutlineGeometry(merged);

  const lengthRatio = clamp(lengthMeters / meta.defaultLengthMeters, 0.5, 2.2);
  const springBone: VroidHairSpringBoneSpec = Object.freeze({
    group: options.group,
    stiffness: round4(clamp(options.springBoneOverride?.stiffness ?? (meta.defaultStiffness / Math.sqrt(lengthRatio)), 0.15, 4.0)),
    gravityPower: round4(clamp(options.springBoneOverride?.gravityPower ?? (meta.defaultGravity * lengthRatio), 0.02, 1.5)),
    gravityDir: Object.freeze([0, -1, 0] as const),
    dragForce: round4(clamp(options.springBoneOverride?.dragForce ?? meta.defaultDrag, 0.08, 1.0)),
    hitRadius: round4(Math.max(0.015, thicknessMeters * 1.45)),
    jointChainCount: Math.min(strandCount, options.group === "ahoge" ? 2 : 6),
    colliderGroupIds: Object.freeze(["head-skull", "neck-collar", "upper-chest"]),
  });

  const posAttr = merged.getAttribute("position");
  const indexAttr = merged.getIndex();
  const vertexCount = posAttr ? posAttr.count : 0;
  const triangleCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(vertexCount / 3);

  return Object.freeze({
    group: options.group,
    geometry: merged,
    outlineGeometry,
    strandCount,
    vertexCount,
    triangleCount,
    angelRingBandV: Object.freeze([0.18, 0.42] as const),
    springBone,
    dispose: () => {
      merged.dispose();
      outlineGeometry.dispose();
    },
  });
}

/**
 * 프로시저럴 헤어 그룹을 MToon 본체 프로파일 동기화 · 이중 헤어 제거 · GPU 완전 폐기 계약으로 조립한다.
 */
export function buildVroidHairGroupMeshBundle(
  options: VroidHairStrandGroupOptions & { readonly replaceOriginalHair?: boolean },
  vrm?: VRM | null,
): VroidHairMeshBundle {
  const built = buildVroidHairStrandGroupGeometry(options);
  const palette = options.palette ?? DEFAULT_HAIR_PALETTE;
  const profile = sampleStudioVrmBodyMtoonProfile(vrm);

  const materials = createStudioVrmHairMToonMaterials(
    {
      baseColor: oklchToHexColorString(palette.base),
      shadowColor: oklchToHexColorString(palette.shadow),
      tipColor: oklchToHexColorString(palette.tip),
      shine: palette.shine,
    },
    profile,
  );

  const groupObject = new THREE.Group();
  groupObject.name = `vroid-hair-group:${options.group}`;
  groupObject.userData.vroidHairGroup = options.group;
  groupObject.userData.vroidSpringBone = built.springBone;

  const mainMesh = new THREE.Mesh(built.geometry, materials.main);
  mainMesh.name = `vroid-hair-mesh:${options.group}`;
  mainMesh.castShadow = true;
  mainMesh.receiveShadow = true;
  mainMesh.userData.toonstudioComponent = "hair";

  const outlineMesh = new THREE.Mesh(built.outlineGeometry, materials.outline);
  outlineMesh.name = `vroid-hair-outline:${options.group}`;
  outlineMesh.userData[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] = true;
  outlineMesh.userData.toonstudioComponent = "hair";
  outlineMesh.raycast = () => undefined;
  outlineMesh.castShadow = false;
  outlineMesh.receiveShadow = false;

  groupObject.add(outlineMesh, mainMesh);
  syncStudioVrmCustomPartToActiveVrm(groupObject, vrm);

  const hiddenOriginals: { readonly mesh: THREE.Object3D; readonly prevVisible: boolean }[] = [];
  if (options.replaceOriginalHair !== false && vrm?.scene?.traverse) {
    vrm.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.vroidHairGroup || node.name.startsWith("vroid-hair")) return;
      if (!ORIGINAL_HAIR_MESH_PATTERN.test(mesh.name)) return;
      if (mesh.visible) {
        hiddenOriginals.push({ mesh, prevVisible: mesh.visible });
        mesh.visible = false;
      }
    });
  }

  let disposed = false;
  return Object.freeze({
    groupObject,
    mainMesh,
    outlineMesh,
    springBone: built.springBone,
    mtoonProfile: profile,
    hiddenOriginalHairCount: hiddenOriginals.length,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      groupObject.removeFromParent();
      built.dispose();
      materials.main.dispose();
      materials.outline.dispose();
      for (const tex of materials.ownedTextures) tex.dispose();
      for (const entry of hiddenOriginals) {
        entry.mesh.visible = entry.prevVisible;
      }
    },
  });
}
