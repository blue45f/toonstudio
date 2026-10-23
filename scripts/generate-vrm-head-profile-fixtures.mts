/**
 * 번들 VRM 의 두상 실측 fixture 생성기(A-01 회귀 고정용).
 *
 * GLB 를 three.js 없이 직접 읽어 rest 포즈 스킨 정점을 계산하고, 런타임
 * `studio-vrm-head-measure.ts` 와 같은 규칙(스킨 메시만 · 지배 본이 정확히 head · 헤어 이름 제외 ·
 * 인덱스가 실제로 쓰는 정점만)으로 머리 본 로컬 점을 모아 `buildStudioVrmHeadProfile` 로 요약한다.
 * 두개골 윗부분 원본 점 일부를 함께 저장해 테스트가 프로필과 독립된 점으로 캡 덮임을 검사한다.
 *
 *   node_modules/.bin/tsx scripts/generate-vrm-head-profile-fixtures.mts
 *
 * 출력: apps/web/src/domains/creator/vrm/__fixtures__/studio-vrm-head-profiles.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildStudioVrmHeadProfile } from "../apps/web/src/domains/creator/vrm/studio-vrm-head-fit";

const ROOT = process.cwd();
const VRM_DIR = join(ROOT, "apps/web/public/vrm");
const OUT = join(ROOT, "apps/web/src/domains/creator/vrm/__fixtures__/studio-vrm-head-profiles.json");

/** 감사 A-01 의 5개 민머리 모델 + 대조군. 표시 이름은 셰이퍼 모델 목록 그대로다. */
const MODELS: readonly { readonly id: string; readonly label: string; readonly file: string }[] = [
  { id: "sample-vrm", label: "루미", file: "sample.vrm" },
  { id: "shion", label: "시온", file: "Sendagaya_Shibu.vrm" },
  { id: "vita", label: "비타", file: "Vita.vrm" },
  { id: "vivi", label: "비비", file: "Vivi.vrm" },
  { id: "quaternius-modular-female-casual", label: "쿼터니어스 캐주얼 (여성)", file: "quaternius-modular-v1/quaternius-modular-female-casual.vrm" },
  { id: "orion", label: "오리온 (로봇)", file: "Avatar_Orion.vrm" },
  { id: "seedsan", label: "시드상 (마스코트)", file: "Seed_san.vrm" },
  { id: "quaternius-modular-male-suit", label: "쿼터니어스 정장 (남성)", file: "quaternius-modular-v1/quaternius-modular-male-suit.vrm" },
  { id: "shino", label: "시노", file: "Sendagaya_Shino.vrm" },
  { id: "fumi", label: "후미", file: "Sakurada_Fumiriya.vrm" },
  { id: "alicia", label: "알리시아", file: "AliciaSolid.vrm" },
  { id: "anna", label: "안나", file: "Anna.vrm" },
];

type Mat4 = number[];
type Json = Record<string, unknown>;

function readGlb(file: string): { gltf: Json; bin: Buffer } {
  const buffer = readFileSync(file);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`GLB 가 아닙니다: ${file}`);
  let offset = 12;
  let gltf: Json | null = null;
  let bin: Buffer | null = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) gltf = JSON.parse(chunk.toString("utf8")) as Json;
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!gltf || !bin) throw new Error(`GLB 청크가 없습니다: ${file}`);
  return { gltf, bin };
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(gltf: Json, bin: Buffer, index: number): number[][] {
  const accessor = (gltf.accessors as Json[])[index];
  if (accessor.sparse) throw new Error("sparse accessor 는 지원하지 않습니다");
  const view = (gltf.bufferViews as Json[])[accessor.bufferView as number];
  const components = COMPONENTS[accessor.type as string];
  const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const elementBytes = sizes[accessor.componentType as number];
  const stride = (view.byteStride as number | undefined) ?? components * elementBytes;
  const base = ((view.byteOffset as number | undefined) ?? 0) + ((accessor.byteOffset as number | undefined) ?? 0);
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out: number[][] = [];
  for (let item = 0; item < (accessor.count as number); item += 1) {
    const row: number[] = [];
    for (let component = 0; component < components; component += 1) {
      const at = base + item * stride + component * elementBytes;
      let value: number;
      switch (accessor.componentType) {
        case 5126: value = data.getFloat32(at, true); break;
        case 5121: value = data.getUint8(at) / (accessor.normalized ? 255 : 1); break;
        case 5123: value = data.getUint16(at, true) / (accessor.normalized ? 65535 : 1); break;
        case 5125: value = data.getUint32(at, true); break;
        case 5120: value = data.getInt8(at); break;
        default: value = data.getInt16(at, true);
      }
      row.push(value);
    }
    out.push(row);
  }
  return out;
}

const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

function nodeMatrix(node: Json): Mat4 {
  if (Array.isArray(node.matrix)) return [...(node.matrix as number[])];
  const [tx, ty, tz] = (node.translation as number[] | undefined) ?? [0, 0, 0];
  const [qx, qy, qz, qw] = (node.rotation as number[] | undefined) ?? [0, 0, 0, 1];
  const [sx, sy, sz] = (node.scale as number[] | undefined) ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function transform(matrix: Mat4, v: readonly number[]): [number, number, number] {
  return [
    matrix[0] * v[0] + matrix[4] * v[1] + matrix[8] * v[2] + matrix[12],
    matrix[1] * v[0] + matrix[5] * v[1] + matrix[9] * v[2] + matrix[13],
    matrix[2] * v[0] + matrix[6] * v[1] + matrix[10] * v[2] + matrix[14],
  ];
}

function humanBones(gltf: Json): { version: "0" | "1"; map: Record<string, number> } | null {
  const extensions = gltf.extensions as Json | undefined;
  const v0 = ((extensions?.VRM as Json | undefined)?.humanoid as Json | undefined)?.humanBones;
  if (Array.isArray(v0)) {
    const map: Record<string, number> = {};
    for (const bone of v0 as Json[]) map[bone.bone as string] = bone.node as number;
    return { version: "0", map };
  }
  const v1 = ((extensions?.VRMC_vrm as Json | undefined)?.humanoid as Json | undefined)?.humanBones as Json | undefined;
  if (!v1) return null;
  const map: Record<string, number> = {};
  for (const [name, bone] of Object.entries(v1)) map[name] = (bone as Json).node as number;
  return { version: "1", map };
}

const HAIR = /hair|kami/iu;
const round = (value: number) => Math.round(value * 1e4) / 1e4;

function measure(file: string) {
  const { gltf, bin } = readGlb(file);
  const nodes = gltf.nodes as Json[];
  const world: Mat4[] = new Array(nodes.length);
  const visit = (index: number, parent: Mat4) => {
    world[index] = multiply(parent, nodeMatrix(nodes[index]));
    for (const child of (nodes[index].children as number[] | undefined) ?? []) visit(child, world[index]);
  };
  const scenes = gltf.scenes as Json[];
  for (const root of scenes[(gltf.scene as number | undefined) ?? 0].nodes as number[]) visit(root, identity());
  const bones = humanBones(gltf);
  if (!bones || bones.map.head === undefined) throw new Error(`head 본이 없습니다: ${file}`);
  const head = bones.map.head;
  const headWorld = transform(world[head], [0, 0, 0]);
  const toLocal = (p: readonly number[]) => [p[0] - headWorld[0], p[1] - headWorld[1], p[2] - headWorld[2]] as const;
  const bonePosition = (name: string) => (bones.map[name] === undefined ? null : toLocal(transform(world[bones.map[name]], [0, 0, 0])));
  const leftEye = bonePosition("leftEye");
  const rightEye = bonePosition("rightEye");
  const eyeDistance = leftEye && rightEye ? Math.hypot(leftEye[0] - rightEye[0], leftEye[1] - rightEye[1], leftEye[2] - rightEye[2]) : 0;
  const eyeCenter = leftEye && rightEye && eyeDistance > 1e-4
    ? [(leftEye[0] + rightEye[0]) / 2, (leftEye[1] + rightEye[1]) / 2, (leftEye[2] + rightEye[2]) / 2] as const
    : null;
  // VRM0 은 −z, VRM1 은 +z 를 본다(three-vrm 의 lookAt.faceFront 와 같은 규약).
  const frontSign: 1 | -1 = bones.version === "0" ? -1 : 1;

  const points: number[] = [];
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const accessorsDone = new Map<number, Set<number>>();
  const materials = (gltf.materials as Json[] | undefined) ?? [];
  const meshes = gltf.meshes as Json[];
  const skins = (gltf.skins as Json[] | undefined) ?? [];
  nodes.forEach((node, nodeIndex) => {
    if (node.mesh === undefined) return;
    const mesh = meshes[node.mesh as number];
    const skin = node.skin !== undefined ? skins[node.skin as number] : null;
    const inverseBind = skin?.inverseBindMatrices !== undefined
      ? readAccessor(gltf, bin, skin.inverseBindMatrices as number)
      : null;
    const jointMatrices = skin
      ? (skin.joints as number[]).map((joint, k) => multiply(world[joint], inverseBind?.[k] ?? identity()))
      : null;
    for (const primitive of mesh.primitives as Json[]) {
      const attributes = primitive.attributes as Record<string, number>;
      const positions = readAccessor(gltf, bin, attributes.POSITION);
      const materialName = primitive.material !== undefined ? String(materials[primitive.material as number]?.name ?? "") : "";
      const hair = HAIR.test(materialName) || HAIR.test(String(mesh.name ?? "")) || HAIR.test(String(node.name ?? ""));
      const joints = skin && attributes.JOINTS_0 !== undefined ? readAccessor(gltf, bin, attributes.JOINTS_0) : null;
      const weights = skin && attributes.WEIGHTS_0 !== undefined ? readAccessor(gltf, bin, attributes.WEIGHTS_0) : null;
      const used = primitive.indices !== undefined
        ? new Set(readAccessor(gltf, bin, primitive.indices as number).map((row) => row[0]))
        : new Set(positions.map((_, index) => index));
      let done = accessorsDone.get(attributes.POSITION);
      if (!done) accessorsDone.set(attributes.POSITION, (done = new Set()));
      for (const vertex of used) {
        let world3: [number, number, number];
        let dominant = -1;
        if (jointMatrices && joints && weights) {
          world3 = [0, 0, 0];
          let best = -1;
          for (let k = 0; k < 4; k += 1) {
            const weight = weights[vertex][k];
            if (weight <= 0) continue;
            const q = transform(jointMatrices[joints[vertex][k]], positions[vertex]);
            world3[0] += q[0] * weight; world3[1] += q[1] * weight; world3[2] += q[2] * weight;
            if (weight > best) { best = weight; dominant = (skin!.joints as number[])[joints[vertex][k]]; }
          }
        } else {
          world3 = transform(world[nodeIndex], positions[vertex]);
        }
        minY = Math.min(minY, world3[1]);
        maxY = Math.max(maxY, world3[1]);
        if (hair || dominant !== head || done.has(vertex)) continue;
        done.add(vertex);
        points.push(...toLocal(world3));
      }
    }
  });
  const profile = buildStudioVrmHeadProfile(points, frontSign);
  if (!profile) throw new Error(`두상 정점이 부족합니다: ${file}`);
  // 프로필과 독립된 검사점: 이마 위 두개골(눈 높이 + 남은 높이 30% 위) 원본 점을 고르게 64개 고른다.
  const count = points.length / 3;
  let topY = Number.NEGATIVE_INFINITY;
  let bottomY = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    topY = Math.max(topY, points[index * 3 + 1]);
    bottomY = Math.min(bottomY, points[index * 3 + 1]);
  }
  const eyeY = eyeCenter ? eyeCenter[1] : bottomY + (topY - bottomY) * 0.42;
  const floor = eyeY + (topY - eyeY) * 0.3;
  const crown: number[][] = [];
  for (let index = 0; index < count; index += 1) {
    if (points[index * 3 + 1] >= floor) crown.push([points[index * 3], points[index * 3 + 1], points[index * 3 + 2]]);
  }
  const stride = Math.max(1, Math.floor(crown.length / 64));
  const crownSamples = crown.filter((_, index) => index % stride === 0).slice(0, 64).map((p) => p.map(round));
  return {
    vrmVersion: bones.version,
    modelHeight: round(maxY - minY),
    eyeCenter: eyeCenter ? eyeCenter.map(round) : null,
    eyeDistance: round(eyeDistance),
    frontSign,
    profile: {
      ...profile,
      slabs: profile.slabs.map((slab) => ({
        y0: round(slab.y0), y1: round(slab.y1), count: slab.count,
        minX: round(slab.minX), maxX: round(slab.maxX), minD: round(slab.minD), maxD: round(slab.maxD),
        rim: slab.rim.map((point) => (point ? [round(point[0]), round(point[1])] : null)),
      })),
    },
    crownSamples,
  };
}

const fixtures = MODELS.map((model) => ({ ...model, ...measure(join(VRM_DIR, model.file)) }));
// 모델 하나를 한 줄로 써서 diff 가 모델 단위로 읽히게 한다.
const header = {
  version: 1,
  generatedBy: "scripts/generate-vrm-head-profile-fixtures.mts",
  note: "머리 본 로컬(m). profile.slabs 의 깊이는 얼굴 쪽이 + 인 d=frontSign·z. crownSamples 는 이마 위 두개골 원본 점.",
};
writeFileSync(OUT, `${JSON.stringify(header, null, 1).replace(/\n\}$/u, ",\n \"models\": [\n")}${
  fixtures.map((fixture) => `  ${JSON.stringify(fixture)}`).join(",\n")}\n ]\n}\n`);
for (const fixture of fixtures) {
  const widest = Math.max(...fixture.profile.slabs.map((slab) => Math.min(-slab.minX, slab.maxX)));
  console.log(`${fixture.label.padEnd(18)} samples=${String(fixture.profile.sampleCount).padStart(5)} crown=${fixture.crownSamples.length} widest=${widest.toFixed(4)} eye=${fixture.eyeDistance}`);
}
console.log(`wrote ${OUT}`);
