/**
 * 키트 프리뷰 테스트 전용 GLB 빌더(프로덕션 코드·브라우저 페이지는 import하지 않는다).
 * 메시마다 삼각형 1개(프리미티브 수만큼)를 가진 **스킨 GLB**를 만든다: Armature 노드 + 관절 노드 + `skin`(IBM 포함) +
 * JOINTS_0/WEIGHTS_0 + 선택 morph·UV·법선·접선·COLOR_0/1·텍스처. `testing/minimal-glb`는 스킨이 없어서 병합 테스트에 쓸 수 없다.
 */
import { writeGlb } from "./glb-io";

import type { JsonObject, JsonValue } from "./glb-io";

export interface FixtureMeshSpec {
  /** 메시 노드 이름 */
  readonly node: string;
  /** 프리미티브 수(기본 1). 둘 이상이면 Babylon이 `<node>_primitive<i>`로 나눈다. */
  readonly primitives?: number;
  /** 프리미티브별 재질 이름(기본 `mat_<node>`; 길이가 모자라면 마지막 값을 반복) */
  readonly materials?: readonly string[];
  /** 스킨을 거는지(기본: 옵션에 joints가 있으면 true) */
  readonly skinned?: boolean;
  /** 정점 3개가 주 영향을 받는 관절 인덱스(이 GLB의 skin.joints 기준, 기본 [0,0,0]) */
  readonly jointIndices?: readonly [number, number, number];
  readonly morphTargets?: readonly string[];
  readonly attributes?: { readonly uv?: boolean; readonly normal?: boolean; readonly tangent?: boolean; readonly color0?: boolean; readonly color0Gray?: boolean; readonly color1?: boolean };
  readonly baseColorFactor?: readonly [number, number, number, number];
  /** baseColorTexture(PNG)를 단다 */
  readonly texture?: { readonly width: number; readonly height: number; readonly alpha?: boolean };
  readonly doubleSided?: boolean;
  /** 메시 노드의 부모: 기본은 스킨이면 armature, 아니면 scene */
  readonly parent?: "armature" | "scene";
  readonly translation?: readonly [number, number, number];
}

export interface FixtureOptions {
  /** skin.joints 이름(순서 = JOINTS_0 인덱스). 생략하면 스켈레톤·스킨이 없다. */
  readonly joints?: readonly string[];
  /** 관절 i의 부모 관절 인덱스(−1 = Armature 자식). 기본: 0번이 루트, 나머지는 0번의 자식 */
  readonly parents?: readonly number[];
  /** 모든 IBM의 x 이동에 더한다(레스트 포즈 불일치 테스트) */
  readonly ibmShift?: number;
  /** IBM accessor를 만들지 않는다 */
  readonly omitIbm?: boolean;
  readonly meshes: readonly FixtureMeshSpec[];
  readonly extensionsUsed?: readonly string[];
  readonly armatureScale?: number;
  readonly generator?: string;
}

/** 헤더만 있는 PNG(검사기가 IHDR만 읽는다). colorType 6 = RGBA, 2 = RGB */
export function fixturePng(width: number, height: number, alpha: boolean): Uint8Array {
  const out = new Uint8Array(8 + 25 + 12);
  out.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(out.buffer);
  view.setUint32(8, 13);
  out.set([73, 72, 68, 82], 12); // IHDR
  view.setUint32(16, width);
  view.setUint32(20, height);
  out[24] = 8;
  out[25] = alpha ? 6 : 2;
  out.set([73, 69, 78, 68], 8 + 25 + 4); // IEND (CRC 생략)
  return out;
}

/** SOF0 마커만 있는 JPEG(검사기가 크기를 읽는다) */
export function fixtureJpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
}

class BinBuilder {
  readonly chunks: Uint8Array[] = [];
  readonly bufferViews: JsonObject[] = [];
  readonly accessors: JsonObject[] = [];
  private length = 0;

  /** 데이터를 덧붙이고 bufferView 인덱스를 돌려준다(4바이트 정렬). */
  addView(bytes: Uint8Array, target?: number): number {
    const padded = (bytes.byteLength + 3) & ~3;
    const chunk = new Uint8Array(padded);
    chunk.set(bytes);
    this.chunks.push(chunk);
    const view: JsonObject = { buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength };
    if (target !== undefined) view.target = target;
    this.bufferViews.push(view);
    this.length += padded;
    return this.bufferViews.length - 1;
  }

  addAccessor(bytes: Uint8Array, accessor: JsonObject, target?: number): number {
    const bufferView = this.addView(bytes, target);
    this.accessors.push({ bufferView, ...accessor });
    return this.accessors.length - 1;
  }

  toBin(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }
}

function floats(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer);
}

const IDENTITY_MAT4: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function buildFixtureGlb(options: FixtureOptions): Uint8Array {
  const bin = new BinBuilder();
  const nodes: JsonObject[] = [];
  const meshes: JsonObject[] = [];
  const materials: JsonObject[] = [];
  const textures: JsonObject[] = [];
  const images: JsonObject[] = [];
  const materialIndexByName = new Map<string, number>();
  const jointNames = options.joints ?? null;

  // 0: Armature(스켈레톤이 있을 때) 또는 없음
  const armatureChildren: number[] = [];
  const sceneRoots: number[] = [];
  let armatureIndex = -1;
  if (jointNames) {
    const armature: JsonObject = { name: "Armature", children: armatureChildren };
    if (options.armatureScale !== undefined) armature.scale = [options.armatureScale, options.armatureScale, options.armatureScale];
    nodes.push(armature);
    armatureIndex = 0;
    sceneRoots.push(0);
  }

  // 관절 노드
  const jointNodeIndex: number[] = [];
  const jointParents = jointNames ? jointNames.map((_name, index) => options.parents?.[index] ?? (index === 0 ? -1 : 0)) : [];
  if (jointNames) {
    for (const name of jointNames) {
      jointNodeIndex.push(nodes.length);
      nodes.push({ name });
    }
    const worldX: number[] = jointNames.map(() => 0);
    jointNames.forEach((_name, index) => {
      const parent = jointParents[index] ?? -1;
      const node = nodes[jointNodeIndex[index] ?? 0];
      if (!node) return;
      if (parent < 0) {
        armatureChildren.push(jointNodeIndex[index] ?? 0);
        node.translation = [0, 0, 0];
      } else {
        const parentNode = nodes[jointNodeIndex[parent] ?? 0];
        if (parentNode) {
          const children = Array.isArray(parentNode.children) ? parentNode.children : [];
          children.push(jointNodeIndex[index] ?? 0);
          parentNode.children = children;
        }
        node.translation = [0.1, 0, 0];
      }
    });
    // 월드 x(깊이 × 0.1)
    for (let index = 0; index < jointNames.length; index += 1) {
      let depth = 0;
      let cursor = index;
      while ((jointParents[cursor] ?? -1) >= 0) {
        depth += 1;
        cursor = jointParents[cursor] ?? -1;
      }
      worldX[index] = depth * 0.1;
    }
    // skin은 아래에서 만든다(IBM)
    const ibm: number[] = [];
    for (let index = 0; index < jointNames.length; index += 1) {
      const matrix = [...IDENTITY_MAT4];
      matrix[12] = -(worldX[index] ?? 0) + (options.ibmShift ?? 0);
      ibm.push(...matrix);
    }
    if (!options.omitIbm) bin.addAccessor(floats(ibm), { componentType: 5126, count: jointNames.length, type: "MAT4" });
  }
  const ibmAccessor = jointNames && !options.omitIbm ? bin.accessors.length - 1 : null;

  // 공유 샘플러
  const samplers: JsonObject[] = [{ magFilter: 9729, minFilter: 9987 }];

  for (const spec of options.meshes) {
    const skinned = spec.skinned ?? jointNames !== null;
    const primitiveCount = spec.primitives ?? 1;
    const primitives: JsonObject[] = [];
    for (let primitiveIndex = 0; primitiveIndex < primitiveCount; primitiveIndex += 1) {
      const attributes: JsonObject = {};
      attributes.POSITION = bin.addAccessor(floats([0, 0, 0, 1, 0, 0, 0, 1, 0]), { componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }, 34962);
      if (spec.attributes?.normal ?? true) attributes.NORMAL = bin.addAccessor(floats([0, 0, 1, 0, 0, 1, 0, 0, 1]), { componentType: 5126, count: 3, type: "VEC3" }, 34962);
      if (spec.attributes?.uv ?? true) attributes.TEXCOORD_0 = bin.addAccessor(floats([0, 0, 1, 0, 0, 1]), { componentType: 5126, count: 3, type: "VEC2" }, 34962);
      if (spec.attributes?.tangent) attributes.TANGENT = bin.addAccessor(floats([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]), { componentType: 5126, count: 3, type: "VEC4" }, 34962);
      if (spec.attributes?.color0) {
        const gray = spec.attributes.color0Gray ?? true;
        const colors = new Uint8Array(gray ? [200, 200, 200, 255, 180, 180, 180, 255, 255, 255, 255, 255] : [200, 100, 50, 255, 180, 90, 40, 255, 255, 255, 255, 255]);
        attributes.COLOR_0 = bin.addAccessor(colors, { componentType: 5121, normalized: true, count: 3, type: "VEC4" }, 34962);
      }
      if (spec.attributes?.color1) attributes.COLOR_1 = bin.addAccessor(new Uint8Array(12).fill(255), { componentType: 5121, normalized: true, count: 3, type: "VEC4" }, 34962);
      if (skinned && jointNames) {
        const [a, b, c] = spec.jointIndices ?? [0, 0, 0];
        attributes.JOINTS_0 = bin.addAccessor(new Uint8Array([a, 0, 0, 0, b, 0, 0, 0, c, 0, 0, 0]), { componentType: 5121, count: 3, type: "VEC4" }, 34962);
        attributes.WEIGHTS_0 = bin.addAccessor(floats([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), { componentType: 5126, count: 3, type: "VEC4" }, 34962);
      }
      const materialName = spec.materials ? (spec.materials[primitiveIndex] ?? spec.materials[spec.materials.length - 1] ?? `mat_${spec.node}`) : `mat_${spec.node}`;
      let materialIndex = materialIndexByName.get(materialName);
      if (materialIndex === undefined) {
        const pbr: JsonObject = {};
        if (spec.baseColorFactor) pbr.baseColorFactor = [...spec.baseColorFactor];
        if (spec.texture) {
          const png = fixturePng(spec.texture.width, spec.texture.height, spec.texture.alpha ?? false);
          const bufferView = bin.addView(png);
          images.push({ bufferView, mimeType: "image/png", name: `${materialName}_base` });
          textures.push({ sampler: 0, source: images.length - 1 });
          pbr.baseColorTexture = { index: textures.length - 1 };
        }
        const material: JsonObject = { name: materialName, pbrMetallicRoughness: pbr };
        if (spec.doubleSided) material.doubleSided = true;
        materials.push(material);
        materialIndex = materials.length - 1;
        materialIndexByName.set(materialName, materialIndex);
      }
      const indices = bin.addAccessor(new Uint8Array(new Uint16Array([0, 1, 2]).buffer), { componentType: 5123, count: 3, type: "SCALAR" }, 34963);
      const primitive: JsonObject = { attributes, indices, material: materialIndex };
      if (spec.morphTargets && spec.morphTargets.length > 0) {
        primitive.targets = spec.morphTargets.map((): JsonValue => ({ POSITION: bin.addAccessor(floats([0, 0.1, 0, 0, 0.1, 0, 0, 0.1, 0]), { componentType: 5126, count: 3, type: "VEC3", min: [0, 0.1, 0], max: [0, 0.1, 0] }, 34962) }));
      }
      primitives.push(primitive);
    }
    const mesh: JsonObject = { name: `${spec.node}Mesh`, primitives };
    if (spec.morphTargets && spec.morphTargets.length > 0) {
      mesh.extras = { targetNames: [...spec.morphTargets] };
      mesh.weights = spec.morphTargets.map(() => 0);
    }
    meshes.push(mesh);
    const node: JsonObject = { name: spec.node, mesh: meshes.length - 1 };
    if (skinned && jointNames) node.skin = 0;
    if (spec.translation) node.translation = [...spec.translation];
    const nodeIndex = nodes.length;
    nodes.push(node);
    const parent = spec.parent ?? (skinned && jointNames ? "armature" : "scene");
    if (parent === "armature" && armatureIndex >= 0) armatureChildren.push(nodeIndex);
    else sceneRoots.push(nodeIndex);
  }

  const json: JsonObject = {
    asset: { version: "2.0", generator: options.generator ?? "kit-preview fixture" },
    scene: 0,
    scenes: [{ nodes: sceneRoots }],
    nodes,
    meshes,
    accessors: bin.accessors,
    bufferViews: bin.bufferViews,
  };
  if (jointNames) {
    const skin: JsonObject = { name: "Armature", joints: jointNodeIndex };
    if (ibmAccessor !== null) skin.inverseBindMatrices = ibmAccessor;
    json.skins = [skin];
  }
  if (materials.length > 0) json.materials = materials;
  if (textures.length > 0) {
    json.textures = textures;
    json.images = images;
    json.samplers = samplers;
  }
  if (options.extensionsUsed && options.extensionsUsed.length > 0) json.extensionsUsed = [...options.extensionsUsed];
  const binBytes = bin.toBin();
  json.buffers = [{ byteLength: binBytes.byteLength }];
  // 자식이 없는 관절 노드·Armature의 빈 children 배열은 glTF 규약상 비어 있으면 안 되므로 제거한다.
  for (const node of nodes) if (Array.isArray(node.children) && node.children.length === 0) delete node.children;
  return writeGlb({ json, bin: binBytes });
}

/** 테스트용 관절 이름 목록(`j0`, `j1`, …) */
export function fixtureJointNames(count: number, prefix = "j"): string[] {
  return Array.from({ length: count }, (_value, index) => `${prefix}${index}`);
}
