import * as THREE from "three";

import type { AvatarForgeHairPart } from "./studio-vrm-avatar-forge";
import type { StudioVrmAuthoredHairSpine } from "./studio-vrm-authored-hair-geometry";
import type { StudioVrmHeadFit } from "./studio-vrm-head-fit";

/**
 * 옆·뒷머리는 둥근 두피에서 자라다가 귀 아래에서 수직으로 떨어진다.
 * 행렬 하나로 곧게 세우면 옆과 뒤에서 넓은 직사각형 뿌리와 캡 사이의 틈이 드러난다.
 * 원본 파츠의 끝 위치와 길이를 살리고, 두상 로컬 타원체를 따라 뿌리에서 끝까지 단면을 돌린다.
 */
export function fitStudioVrmHairLockSpine(
  part: AvatarForgeHairPart,
  fit: StudioVrmHeadFit,
  placement: { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 },
): StudioVrmAuthoredHairSpine {
  const { position, quaternion, scale } = placement;
  const { center: [cx, cy, cz], radiusX, radiusY, radiusZ, frontSign } = fit;
  const tip = new THREE.Vector3(0, -Math.abs(scale.y), 0).applyQuaternion(quaternion).add(position);
  const dx = (position.x - cx) / radiusX;
  const dz = (position.z - cz) / radiusZ;
  const azimuth = Math.atan2(dx, dz);
  const rootHeight = (part.role === "back" ? 0.83 : 0.79) + 0.05 * Math.cos(4 * azimuth);
  // 긴 옆머리의 끝이 두 번이나 아래로 밀리지 않도록, 실제 두상 비례로 저작된 길이를 사용한다.
  const designedTipY = cy + (part.position[1] - 0.18 - Math.abs(part.scale[1])) * radiusY / 0.46;
  const tipHeight = Math.min(-0.32, (Math.max(tip.y, designedTipY) - cy) / radiusY);
  const sweep = Math.sign(dx * frontSign || 1) * (part.role === "side" ? 0.43 : 0.22);
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  for (let index = 0; index <= 20; index += 1) {
    const t = index / 20;
    const h = THREE.MathUtils.lerp(rootHeight, tipHeight, t);
    // 적도 아래의 가닥은 두개골을 따라 안으로 파고들지 않고 귀·목을 타고 흘러내린다.
    const radial = Math.sqrt(1 - Math.max(h, 0) ** 2);
    const emerge = THREE.MathUtils.smoothstep(t, 0, Math.min(0.48, 0.62 / (rootHeight - tipHeight)));
    const lower = THREE.MathUtils.smoothstep(-h, 0.25, Math.max(1, -tipHeight));
    const distance = radial * (0.9 + emerge * 0.12) + lower * (part.role === "back" ? 0.015 : -0.11);
    const angle = azimuth - sweep * (1 - t) ** 2;
    const nx = Math.sin(angle);
    const nz = Math.cos(angle);
    points.push(new THREE.Vector3(cx + radiusX * nx * distance, cy + radiusY * h, cz + radiusZ * (nz * distance - frontSign * lower * (part.role === "back" ? 0.15 : 0.06))));
    normals.push(new THREE.Vector3(nx * radial / radiusX, Math.max(0, h) / radiusY, nz * radial / radiusZ).normalize());
  }
  return { points, normals, halfWidth: Math.abs(scale.x), thickness: Math.abs(scale.z) };
}

/**
 * 캡과 만나는 가닥의 조명 법선과 바탕색을 같은 두피 표면에서 가져온다.
 * 불투명 셀 재질에서도 뿌리마다 하얀 테두리·어두운 반달이 생기지 않는다.
 */
export function blendStudioVrmHairRoots(
  locks: THREE.BufferGeometry,
  cap: THREE.BufferGeometry,
  capMatrix: THREE.Matrix4,
  columns: number,
  rows: number,
  thetaAt: (facing: number) => number,
  matchColor: boolean,
): void {
  const inverse = capMatrix.clone().invert();
  const position = locks.getAttribute("position");
  const normals = locks.getAttribute("normal");
  const colors = locks.getAttribute("color");
  const capNormals = cap.getAttribute("normal");
  const capColors = cap.getAttribute("color");
  const p = new THREE.Vector3();
  const value = new THREE.Vector3();
  const capNormal = new THREE.Vector3();
  const capColor = new THREE.Vector3();
  const sample = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).applyMatrix4(inverse);
    const r = p.length();
    if (r < 0.78 || r > 1.19) continue;
    const phi = THREE.MathUtils.euclideanModulo(Math.atan2(p.z, -p.x) - Math.PI / 2, 2 * Math.PI);
    const theta = Math.acos(THREE.MathUtils.clamp(p.y / r, -1, 1));
    const edge = thetaAt(Math.cos(phi));
    const nearSurface = 1 - THREE.MathUtils.smoothstep(Math.abs(r - 1), 0.07, 0.19);
    const blend = nearSurface * (1 - THREE.MathUtils.smoothstep(theta - edge, -0.04, 0.26));
    if (blend <= 0) continue;
    const col = columns * phi / (2 * Math.PI);
    const row = Math.min(rows, rows * theta / edge);
    const x = Math.min(columns - 1, Math.floor(col)), y = Math.min(rows - 1, Math.floor(row));
    capNormal.set(0, 0, 0);
    capColor.set(0, 0, 0);
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const j = (y + dy) * (columns + 1) + x + dx;
        const w = (dx ? col - x : 1 - col + x) * (dy ? row - y : 1 - row + y);
        capNormal.addScaledVector(sample.fromBufferAttribute(capNormals, j), w);
        if (matchColor) capColor.addScaledVector(sample.fromBufferAttribute(capColors, j), w);
      }
    }
    value.fromBufferAttribute(normals, i).lerp(capNormal.normalize(), blend).normalize();
    normals.setXYZ(i, value.x, value.y, value.z);
    if (matchColor) {
      value.fromBufferAttribute(colors, i).lerp(capColor, blend);
      colors.setXYZ(i, value.x, value.y, value.z);
    }
  }
}

/** 양갈래는 귀 뒤에 묶고 목 높이부터 어깨 뒤로 흘린다. 몸을 통과해 끝만 다시 보이는 것을 막는다. */
export function fitStudioVrmTwinTailSpine(part: AvatarForgeHairPart, fit: StudioVrmHeadFit): StudioVrmAuthoredHairSpine {
  const { center: [cx, cy, cz], radiusX, radiusY, radiusZ, frontSign } = fit;
  const side = Math.sign(part.position[0]) * frontSign;
  const height = (part.position[1] - 0.18) / 0.46;
  const halfLength = Math.abs(part.scale[1]) / 0.46;
  const root = THREE.MathUtils.clamp(height + halfLength, -0.54, 0.76);
  const tip = height - halfLength;
  const rootRadius = Math.sqrt(1 - root * root);
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = THREE.MathUtils.lerp(root, tip, t);
    const lift = Math.sin(t * Math.PI);
    const clearShoulder = THREE.MathUtils.smoothstep(root - y, 0, Math.max(0.45, root + 1.22));
    const x = THREE.MathUtils.lerp(rootRadius * 0.89, 1.08, t) + lift * (0.26 + 0.16 * Math.abs(part.curl));
    const depth = THREE.MathUtils.lerp(rootRadius * 0.38, 1.46, clearShoulder) + lift * 0.08;
    points.push(new THREE.Vector3(cx + side * radiusX * x, cy + radiusY * y, cz - frontSign * radiusZ * depth));
    normals.push(new THREE.Vector3(side * 0.66, 0, -frontSign).normalize());
  }
  return { points, normals, halfWidth: Math.abs(part.scale[0]) * radiusX / 0.56, thickness: Math.abs(part.scale[2]) * radiusZ / 0.54 };
}
