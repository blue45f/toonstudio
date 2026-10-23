/**
 * 캐릭터 키트 검증기 — GLB 컨테이너·모델 읽기와 공간 해시. `scripts/verify-character-kit.mjs`에서 옮겼다(2026-10-23, 파일 크기 래칫 헤드룸 확보).
 *
 * `primsOf`는 프리미티브를 배열로 읽어 메시 노드에 캐시하고, `viewOf`는 프리미티브를 이어 붙인 메시 단위 뷰를 만든다.
 * 키트 v2 검사(UV1 흐름·밀도)를 위해 `uvs1`(TEXCOORD_1)을 함께 읽는다 — v1 검사는 이 값을 쓰지 않는다.
 */
import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { KIT_ALLOWED_EXTENSIONS, KIT_FORBIDDEN_EXTENSIONS } from "../../apps/character-lab/src/contracts/index.ts";
import { stableStringify } from "../../apps/character-lab/src/shared/stable-json.ts";

// ---------------------------------------------------------------- GLB 읽기

let sharedIo = null;

function gltfIo() {
  if (sharedIo === null) {
    sharedIo = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    sharedIo.setLogger(new Logger(Logger.Verbosity.SILENCE));
  }
  return sharedIo;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

/** GLB 헤더·청크를 읽어 JSON 청크를 돌려준다. 문제는 한글 문장 배열로 돌려준다. */
export function parseGlbContainer(bytes) {
  const problems = [];
  if (bytes.length < 20) return { json: null, problems: ["GLB 헤더(20바이트)보다 짧습니다."] };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return { json: null, problems: ["GLB 매직('glTF')이 아닙니다."] };
  if (view.getUint32(4, true) !== 2) problems.push(`GLB 컨테이너 버전이 2가 아닙니다(${view.getUint32(4, true)}).`);
  if (view.getUint32(8, true) !== bytes.length) problems.push(`GLB 헤더 길이(${view.getUint32(8, true)})가 파일 크기(${bytes.length})와 다릅니다.`);
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLength > bytes.length) {
    problems.push("첫 청크가 JSON이 아니거나 길이가 파일을 넘습니다.");
    return { json: null, problems };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(20, 20 + jsonLength));
    return { json: JSON.parse(text), problems };
  } catch (error) {
    problems.push(`GLB JSON 청크를 해석하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    return { json: null, problems };
  }
}

/**
 * V5: glTF 2.0, 허용 확장만, 임베드 이미지·버퍼만.
 * @returns {boolean} 더 읽을 수 없는 치명 오류가 있으면 true
 */
export function checkContainerJson(json, report, where) {
  let fatal = false;
  const asset = json.asset;
  if (asset === null || typeof asset !== "object" || asset.version !== "2.0") {
    report.error("V5", where, `asset.version이 "2.0"이 아닙니다(${stableStringify(asset?.version)}).`);
    fatal = true;
  }
  const allowed = new Set(KIT_ALLOWED_EXTENSIONS);
  const forbidden = new Set(KIT_FORBIDDEN_EXTENSIONS);
  const required = Array.isArray(json.extensionsRequired) ? json.extensionsRequired : [];
  const used = Array.isArray(json.extensionsUsed) ? json.extensionsUsed : [];
  for (const name of required) {
    if (!allowed.has(name)) {
      report.error("V5", where, `extensionsRequired의 ${String(name)}는 허용 목록 밖입니다${forbidden.has(name) ? "(압축/외부 디코더 의존으로 금지, kit-unsupported-extension)" : ""}.`);
      fatal = true;
    }
  }
  for (const name of used) {
    if (forbidden.has(name)) {
      report.error("V5", where, `금지 확장 ${String(name)}을 사용합니다(외부 디코더/CDN 의존, kit-unsupported-extension).`);
      fatal = true;
    } else if (!allowed.has(name)) {
      report.warn("V5", where, `허용 목록에 없는 확장 ${String(name)}을 사용합니다(런타임이 무시할 수 있음).`);
    }
  }
  const buffers = Array.isArray(json.buffers) ? json.buffers : [];
  buffers.forEach((buffer, index) => {
    if (typeof buffer?.uri === "string" && !buffer.uri.startsWith("data:")) report.error("V5", where, `buffers[${index}]가 외부 URI(${buffer.uri})를 가리킵니다. GLB에 임베드해야 합니다.`);
  });
  const images = Array.isArray(json.images) ? json.images : [];
  images.forEach((image, index) => {
    if (typeof image?.uri === "string" && !image.uri.startsWith("data:")) {
      report.error("V5", where, `images[${index}]가 외부 URI(${image.uri})를 가리킵니다. 텍스처는 GLB에 임베드해야 합니다.`);
    } else if (typeof image?.uri === "string") {
      report.warn("V5", where, `images[${index}]가 data URI입니다. bufferView 임베드를 권장합니다.`);
    }
    if (image?.mimeType !== undefined && image.mimeType !== "image/jpeg" && image.mimeType !== "image/png") {
      report.error("V5", where, `images[${index}] 형식 ${String(image.mimeType)}는 허용되지 않습니다(JPEG/PNG만).`);
    }
  });
  return fatal;
}

export function floatsOf(accessor) {
  const array = accessor.getArray();
  if (array instanceof Float32Array) return array;
  const out = new Float32Array(array.length);
  if (accessor.getNormalized()) {
    let divisor = 1;
    if (array instanceof Uint8Array) divisor = 255;
    else if (array instanceof Uint16Array) divisor = 65535;
    else if (array instanceof Int8Array) divisor = 127;
    else if (array instanceof Int16Array) divisor = 32767;
    for (let i = 0; i < array.length; i += 1) out[i] = Math.max(array[i] / divisor, -1);
  } else {
    out.set(array);
  }
  return out;
}

export function targetNamesOf(mesh) {
  const extras = mesh.getExtras();
  const names = extras?.targetNames;
  return Array.isArray(names) && names.every((name) => typeof name === "string") ? names : null;
}

/** 메시 노드의 프리미티브를 배열로 읽는다(결과는 메시 노드에 캐시). */
export function primsOf(meshNode) {
  if (meshNode.prims !== undefined) return meshNode.prims;
  meshNode.prims = meshNode.mesh.listPrimitives().map((prim, index) => {
    const positionAccessor = prim.getAttribute("POSITION");
    const indexAccessor = prim.getIndices();
    const joints = prim.getAttribute("JOINTS_0");
    const weights = prim.getAttribute("WEIGHTS_0");
    const color = prim.getAttribute("COLOR_0");
    const region = prim.getAttribute("_REGION");
    const normal = prim.getAttribute("NORMAL");
    const uv = prim.getAttribute("TEXCOORD_0");
    const uv1 = prim.getAttribute("TEXCOORD_1");
    return {
      index,
      mode: prim.getMode(),
      semantics: prim.listSemantics(),
      count: positionAccessor === null ? 0 : positionAccessor.getCount(),
      positions: positionAccessor === null ? new Float32Array(0) : floatsOf(positionAccessor),
      normals: normal === null ? null : floatsOf(normal),
      uvs: uv === null ? null : floatsOf(uv),
      uvs1: uv1 === null ? null : floatsOf(uv1),
      indices: indexAccessor === null ? null : Uint32Array.from(indexAccessor.getArray()),
      joints: joints === null ? null : joints.getArray(),
      weights: weights === null ? null : floatsOf(weights),
      weightsNormalizedType: weights === null ? null : weights.getComponentType(),
      color0: color === null ? null : { data: floatsOf(color), size: color.getElementSize() },
      region: region === null ? null : region.getArray(),
      hasJoints1: prim.getAttribute("JOINTS_1") !== null || prim.getAttribute("WEIGHTS_1") !== null,
      hasColor1: prim.getAttribute("COLOR_1") !== null,
      targets: prim.listTargets().map((target) => {
        const position = target.getAttribute("POSITION");
        const targetNormal = target.getAttribute("NORMAL");
        return { position: position === null ? null : floatsOf(position), normal: targetNormal === null ? null : floatsOf(targetNormal) };
      }),
      material: prim.getMaterial(),
    };
  });
  return meshNode.prims;
}

export function triangleCountOf(prim) {
  return Math.floor((prim.indices === null ? prim.count : prim.indices.length) / 3);
}

export function trianglesOf(prim) {
  const length = prim.indices === null ? prim.count : prim.indices.length;
  return { length: Math.floor(length / 3), at: (t, k) => (prim.indices === null ? t * 3 + k : prim.indices[t * 3 + k]) };
}

/** 프리미티브를 이어 붙인 메시 단위 뷰(정점 위치, 이름별 morph 델타, 스킨) */
export function viewOf(meshNode) {
  if (meshNode.view !== undefined) return meshNode.view;
  const prims = primsOf(meshNode);
  const names = targetNamesOf(meshNode.mesh) ?? [];
  const total = prims.reduce((sum, prim) => sum + prim.count, 0);
  const concat = (select, stride, ArrayType) => {
    if (prims.length === 1) return select(prims[0]) ?? new ArrayType(total * stride);
    const out = new ArrayType(total * stride);
    let offset = 0;
    for (const prim of prims) {
      const part = select(prim);
      if (part !== null && part !== undefined) out.set(part, offset * stride);
      offset += prim.count;
    }
    return out;
  };
  const positions = concat((prim) => prim.positions, 3, Float32Array);
  const targets = new Map();
  names.forEach((name, t) => targets.set(name, concat((prim) => prim.targets[t]?.position ?? null, 3, Float32Array)));
  meshNode.view = {
    count: total,
    positions,
    targets,
    joints: prims.every((prim) => prim.joints !== null) ? concat((prim) => prim.joints, 4, Uint16Array) : null,
    weights: prims.every((prim) => prim.weights !== null) ? concat((prim) => prim.weights, 4, Float32Array) : null,
  };
  return meshNode.view;
}

function buildModel(doc, json, where) {
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const meshNodes = nodes
    .filter((node) => node.getMesh() !== null)
    .map((node) => ({ name: node.getName(), node, mesh: node.getMesh(), skin: node.getSkin(), world: node.getWorldMatrix() }));
  const skins = root.listSkins();
  const nodeByName = new Map();
  for (const node of nodes) {
    const list = nodeByName.get(node.getName()) ?? [];
    list.push(node);
    nodeByName.set(node.getName(), list);
  }
  const meshNodeByName = new Map();
  for (const meshNode of meshNodes) if (!meshNodeByName.has(meshNode.name)) meshNodeByName.set(meshNode.name, meshNode);
  return {
    where,
    json,
    doc,
    nodes,
    skins,
    joints: skins[0] === undefined ? [] : skins[0].listJoints().map((joint) => joint.getName()),
    jointNodes: skins[0] === undefined ? [] : skins[0].listJoints(),
    nodeByName,
    meshNodes,
    meshNodeByName,
  };
}

/** GLB 바이트를 열어 모델을 만든다. 실패하면 V5 오류를 남기고 null */
export async function loadGlbModel(bytes, where, report) {
  const container = parseGlbContainer(bytes);
  if (container.json === null || container.problems.length > 0) {
    report.require("V5");
    for (const problem of container.problems) report.error("V5", where, problem);
    if (container.json === null) return null;
  }
  report.begin("V5");
  if (checkContainerJson(container.json, report, where)) return null;
  try {
    const doc = await gltfIo().readBinary(bytes);
    return buildModel(doc, container.json, where);
  } catch (error) {
    report.require("V5");
    report.error("V5", where, `GLB를 읽지 못했습니다(kit-glb-load-failed): ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// ---------------------------------------------------------------- 공간 해시

export function cellHash(ix, iy, iz) {
  return (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) | 0;
}

export class PointGrid {
  constructor(positions, cell) {
    this.positions = positions;
    this.cell = cell;
    this.cells = new Map();
    const count = positions.length / 3;
    for (let i = 0; i < count; i += 1) {
      const key = cellHash(Math.floor(positions[i * 3] / cell), Math.floor(positions[i * 3 + 1] / cell), Math.floor(positions[i * 3 + 2] / cell));
      const list = this.cells.get(key);
      if (list === undefined) this.cells.set(key, [i]);
      else list.push(i);
    }
  }

  /** 반경 안 가장 가까운 점. 없으면 null */
  nearest(x, y, z, maxRadius) {
    const { cell, positions } = this;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const cz = Math.floor(z / cell);
    const maxRing = Math.ceil(maxRadius / cell);
    let best = -1;
    let bestSquared = maxRadius * maxRadius;
    const visit = (dx, dy, dz) => {
      const list = this.cells.get(cellHash(cx + dx, cy + dy, cz + dz));
      if (list === undefined) return;
      for (const index of list) {
        const ex = positions[index * 3] - x;
        const ey = positions[index * 3 + 1] - y;
        const ez = positions[index * 3 + 2] - z;
        const squared = ex * ex + ey * ey + ez * ez;
        if (squared <= bestSquared) {
          bestSquared = squared;
          best = index;
        }
      }
    };
    for (let ring = 0; ring <= maxRing; ring += 1) {
      if (best >= 0 && (ring - 1) * cell > Math.sqrt(bestSquared)) break;
      for (let dx = -ring; dx <= ring; dx += 1) {
        for (let dy = -ring; dy <= ring; dy += 1) {
          if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
            for (let dz = -ring; dz <= ring; dz += 1) visit(dx, dy, dz);
          } else if (ring > 0) {
            visit(dx, dy, -ring);
            visit(dx, dy, ring);
          }
        }
      }
    }
    return best;
  }

  /** 거리 `radius` 이내 모든 점(주변 27칸만 훑으므로 radius ≤ cell) */
  within(x, y, z, radius) {
    const { cell, positions } = this;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const cz = Math.floor(z / cell);
    const result = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const list = this.cells.get(cellHash(cx + dx, cy + dy, cz + dz));
          if (list === undefined) continue;
          for (const index of list) {
            const ex = positions[index * 3] - x;
            const ey = positions[index * 3 + 1] - y;
            const ez = positions[index * 3 + 2] - z;
            if (ex * ex + ey * ey + ez * ez <= radius * radius) result.push(index);
          }
        }
      }
    }
    return result;
  }
}
