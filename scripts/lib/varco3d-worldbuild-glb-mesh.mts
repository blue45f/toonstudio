import type { Varco3dWorldbuildAssetSpec } from "./varco3d-worldbuild.mts";

function parseHexToRgb01(hex: string): readonly [number, number, number] {
  const clean = hex.replace(/^#/u, "");
  if (clean.length !== 6) return [0.75, 0.75, 0.78];
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return [
    Number.isFinite(r) ? Number(r.toFixed(4)) : 0.75,
    Number.isFinite(g) ? Number(g.toFixed(4)) : 0.75,
    Number.isFinite(b) ? Number(b.toFixed(4)) : 0.78,
  ];
}

interface MeshBuilder {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
}

function createMeshBuilder(): MeshBuilder {
  return {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
  };
}

function pushVertex(
  builder: MeshBuilder,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  u: number,
  v: number,
): number {
  const len = Math.hypot(nx, ny, nz) || 1;
  const idx = builder.positions.length / 3;
  builder.positions.push(x, y, z);
  builder.normals.push(nx / len, ny / len, nz / len);
  builder.uvs.push(Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)));
  return idx;
}

/**
 * 닫힌(Closed) 매니폴드 박스 추가 — 모든 모서리가 정확히 2개의 삼각형에 공유되며
 * 바깥쪽 법선(Outward Normal)과 [0, 1] UV를 가진다.
 */
function addManifoldBox(
  builder: MeshBuilder,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  uvAnchor = false,
): void {
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const sx = Math.max(1e-4, (x1 - x0) * 0.5);
  const sy = Math.max(1e-4, (y1 - y0) * 0.5);
  const sz = Math.max(1e-4, (z1 - z0) * 0.5);

  const corners: readonly [number, number, number, number, number][] = [
    [x0, y0, z0, 0, 0],
    [x1, y0, z0, 1, 0],
    [x1, y1, z0, 1, 1],
    [x0, y1, z0, 0, 1],
    [x0, y0, z1, 0, 1],
    [x1, y0, z1, 1, 1],
    [x1, y1, z1, 1, 0],
    [x0, y1, z1, 0, 0],
  ];

  const base = builder.positions.length / 3;
  for (let i = 0; i < corners.length; i += 1) {
    const [x, y, z, u, v] = corners[i]!;
    const nx = (x - cx) / sx;
    const ny = (y - cy) / sy;
    const nz = (z - cz) / sz;
    const uu = uvAnchor ? u : 0.1 + u * 0.8;
    const vv = uvAnchor ? v : 0.1 + v * 0.8;
    pushVertex(builder, x, y, z, nx, ny, nz, uu, vv);
  }

  builder.indices.push(
    base + 0, base + 2, base + 1,
    base + 0, base + 3, base + 2,
    base + 4, base + 5, base + 6,
    base + 4, base + 6, base + 7,
    base + 0, base + 1, base + 5,
    base + 0, base + 5, base + 4,
    base + 3, base + 6, base + 2,
    base + 3, base + 7, base + 6,
    base + 0, base + 4, base + 7,
    base + 0, base + 7, base + 3,
    base + 1, base + 2, base + 6,
    base + 1, base + 6, base + 5,
  );
}

/**
 * 닫힌(Closed) 다각 기둥/절두체(Frustum Prism) 추가 — 매니폴드 위상과 외향 법선을 보장한다.
 */
function addManifoldPrism(
  builder: MeshBuilder,
  cx: number,
  y0: number,
  y1: number,
  cz: number,
  rx0: number,
  rz0: number,
  rx1: number,
  rz1: number,
  segments = 8,
): void {
  const bCenter = pushVertex(builder, cx, y0, cz, 0, -1, 0, 0.5, 0.5);
  const tCenter = pushVertex(builder, cx, y1, cz, 0, 1, 0, 0.5, 0.5);
  const bRingStart = builder.positions.length / 3;
  for (let i = 0; i < segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    pushVertex(
      builder,
      cx + rx0 * cos,
      y0,
      cz + rz0 * sin,
      cos,
      -0.45,
      sin,
      0.5 + 0.45 * cos,
      0.5 + 0.45 * sin,
    );
  }
  const tRingStart = builder.positions.length / 3;
  for (let i = 0; i < segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    pushVertex(
      builder,
      cx + rx1 * cos,
      y1,
      cz + rz1 * sin,
      cos,
      0.45,
      sin,
      0.5 + 0.45 * cos,
      0.5 + 0.45 * sin,
    );
  }

  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    const b0 = bRingStart + i;
    const b1 = bRingStart + next;
    const t0 = tRingStart + i;
    const t1 = tRingStart + next;
    builder.indices.push(bCenter, b0, b1);
    builder.indices.push(tCenter, t1, t0);
    builder.indices.push(b0, t0, t1, b0, t1, b1);
  }
}

function populateAssetGeometry(builder: MeshBuilder, spec: Varco3dWorldbuildAssetSpec): void {
  const [w, h, d] = spec.boundingBoxMeters;
  const hx = Math.max(0.02, w / 2);
  const hy = Math.max(0.02, h);
  const hz = Math.max(0.02, d / 2);

  const baseH = Math.min(hy * 0.12, 0.14);
  addManifoldBox(builder, -hx, 0, -hz, hx, baseH, hz, true);

  switch (spec.id) {
    case "classroom-podium-desk": {
      addManifoldBox(builder, -hx * 0.86, baseH + 0.004, -hz * 0.78, hx * 0.86, hy * 0.82, hz * 0.78);
      addManifoldBox(builder, -hx * 0.96, hy * 0.824, -hz * 0.92, hx * 0.96, hy * 0.9, hz * 0.92);
      addManifoldBox(builder, -hx * 0.94, hy * 0.904, -hz * 0.9, hx * 0.94, hy * 0.95, -hz * 0.68);
      addManifoldBox(builder, -hx * 0.72, hy * 0.904, -hz * 0.35, -hx * 0.22, hy * 0.94, hz * 0.35);
      addManifoldBox(builder, -hx * 0.12, hy * 0.904, -hz * 0.28, hx * 0.32, hy * 0.93, hz * 0.28);
      addManifoldBox(builder, -hx * 0.1, hy * 0.932, -hz * 0.28, hx * 0.3, hy, -hz * 0.22);
      addManifoldPrism(builder, hx * 0.58, hy * 0.904, hy, 0, 0.03, 0.03, 0.015, 0.015, 8);
      break;
    }
    case "rofan-golden-throne": {
      addManifoldBox(builder, -hx * 0.88, baseH + 0.004, -hz * 0.88, hx * 0.88, hy * 0.2, hz * 0.88);
      addManifoldBox(builder, -hx * 0.68, hy * 0.204, -hz * 0.68, hx * 0.68, hy * 0.44, hz * 0.56);
      addManifoldBox(builder, -hx * 0.62, hy * 0.444, -hz * 0.58, hx * 0.62, hy * 0.54, hz * 0.5);
      addManifoldBox(builder, -hx * 0.74, hy * 0.444, -hz * 0.58, -hx * 0.56, hy * 0.76, hz * 0.48);
      addManifoldBox(builder, hx * 0.56, hy * 0.444, -hz * 0.58, hx * 0.74, hy * 0.76, hz * 0.48);
      addManifoldBox(builder, -hx * 0.58, hy * 0.544, -hz * 0.68, hx * 0.58, hy * 0.9, -hz * 0.46);
      addManifoldPrism(builder, 0, hy * 0.904, hy, -hz * 0.56, hx * 0.38, 0.1, hx * 0.12, 0.06, 10);
      addManifoldPrism(builder, -hx * 0.82, hy * 0.204, hy * 0.92, -hz * 0.72, 0.07, 0.07, 0.06, 0.06, 8);
      addManifoldPrism(builder, hx * 0.82, hy * 0.204, hy * 0.92, -hz * 0.72, 0.07, 0.07, 0.06, 0.06, 8);
      break;
    }
    case "murim-sword-rack": {
      addManifoldBox(builder, -hx * 0.82, baseH + 0.004, -hz * 0.45, -hx * 0.68, hy * 0.94, hz * 0.45);
      addManifoldBox(builder, hx * 0.68, baseH + 0.004, -hz * 0.45, hx * 0.82, hy * 0.94, hz * 0.45);
      addManifoldBox(builder, -hx * 0.92, hy * 0.944, -hz * 0.55, hx * 0.92, hy, hz * 0.55);
      addManifoldBox(builder, -hx * 0.86, hy * 0.34, -hz * 0.32, hx * 0.86, hy * 0.4, hz * 0.32);
      addManifoldBox(builder, -hx * 0.86, hy * 0.62, -hz * 0.32, hx * 0.86, hy * 0.68, hz * 0.32);
      for (const xRatio of [-0.48, -0.16, 0.16, 0.48]) {
        addManifoldPrism(
          builder,
          hx * xRatio,
          baseH + 0.02,
          hy * 0.92,
          0,
          0.028,
          0.018,
          0.012,
          0.008,
          8,
        );
      }
      break;
    }
    case "noir-neon-streetlamp": {
      addManifoldPrism(builder, 0, baseH + 0.004, hy * 0.26, 0, hx * 0.58, hz * 0.58, hx * 0.28, hz * 0.28, 8);
      addManifoldPrism(builder, 0, hy * 0.264, hy * 0.94, 0, hx * 0.18, hz * 0.18, hx * 0.12, hz * 0.12, 8);
      addManifoldBox(builder, -hx * 0.94, hy * 0.944, -hz * 0.22, hx * 0.94, hy, hz * 0.22);
      addManifoldPrism(builder, -hx * 0.72, hy * 0.78, hy * 0.94, 0, hx * 0.22, hz * 0.22, hx * 0.14, hz * 0.14, 8);
      addManifoldPrism(builder, hx * 0.72, hy * 0.78, hy * 0.94, 0, hx * 0.22, hz * 0.22, hx * 0.14, hz * 0.14, 8);
      addManifoldBox(builder, hx * 0.22, hy * 0.45, -hz * 0.18, hx * 0.88, hy * 0.72, hz * 0.18);
      break;
    }
    case "hunter-awakening-altar": {
      addManifoldPrism(builder, 0, baseH + 0.004, hy * 0.24, 0, hx * 0.84, hz * 0.84, hx * 0.74, hz * 0.74, 8);
      addManifoldPrism(builder, 0, hy * 0.244, hy * 0.42, 0, hx * 0.56, hz * 0.56, hx * 0.46, hz * 0.46, 8);
      addManifoldPrism(builder, 0, hy * 0.424, hy, 0, hx * 0.24, hz * 0.24, hx * 0.06, hz * 0.06, 8);
      for (const [sx, sz] of [
        [-0.72, -0.72],
        [0.72, -0.72],
        [-0.72, 0.72],
        [0.72, 0.72],
      ] as const) {
        addManifoldPrism(
          builder,
          hx * sx,
          baseH + 0.004,
          hy * 0.68,
          hz * sz,
          hx * 0.12,
          hz * 0.12,
          hx * 0.09,
          hz * 0.09,
          8,
        );
      }
      break;
    }
    case "cyberpunk-holo-kiosk": {
      addManifoldBox(builder, -hx * 0.82, baseH + 0.004, -hz * 0.76, hx * 0.82, hy * 0.52, hz * 0.62);
      addManifoldBox(builder, -hx * 0.88, hy * 0.524, -hz * 0.76, hx * 0.88, hy * 0.6, hz * 0.88);
      addManifoldBox(builder, -hx * 0.78, hy * 0.604, -hz * 0.76, hx * 0.78, hy * 0.9, hz * 0.36);
      addManifoldBox(builder, -hx * 0.92, hy * 0.904, -hz * 0.82, hx * 0.92, hy, hz * 0.82);
      addManifoldBox(builder, -hx * 0.68, hy * 0.64, hz * 0.42, hx * 0.68, hy * 0.86, hz * 0.54);
      break;
    }
    case "medical-iv-monitor": {
      addManifoldPrism(builder, 0, baseH + 0.004, hy * 0.94, 0, 0.035, 0.035, 0.025, 0.025, 8);
      addManifoldBox(builder, -hx * 0.78, hy * 0.944, -hz * 0.16, hx * 0.78, hy, hz * 0.16);
      addManifoldBox(builder, -hx * 0.68, hy * 0.76, -hz * 0.18, -hx * 0.28, hy * 0.93, hz * 0.18);
      addManifoldBox(builder, hx * 0.28, hy * 0.76, -hz * 0.18, hx * 0.68, hy * 0.93, hz * 0.18);
      addManifoldBox(builder, -hx * 0.62, hy * 0.48, -hz * 0.52, hx * 0.62, hy * 0.7, hz * 0.52);
      addManifoldBox(builder, -hx * 0.56, hy * 0.24, -hz * 0.48, hx * 0.56, hy * 0.32, hz * 0.48);
      break;
    }
    case "cafe-espresso-bar": {
      addManifoldBox(builder, -hx * 0.94, baseH + 0.004, -hz * 0.84, hx * 0.94, hy * 0.72, hz * 0.84);
      addManifoldBox(builder, -hx * 0.98, hy * 0.724, -hz * 0.92, hx * 0.98, hy * 0.78, hz * 0.92);
      addManifoldBox(builder, -hx * 0.78, hy * 0.784, -hz * 0.56, -hx * 0.08, hy * 0.96, hz * 0.44);
      addManifoldBox(builder, -hx * 0.72, hy * 0.964, -hz * 0.48, -hx * 0.14, hy, hz * 0.36);
      addManifoldPrism(builder, hx * 0.14, hy * 0.784, hy, 0, 0.09, 0.09, 0.11, 0.11, 8);
      addManifoldBox(builder, hx * 0.36, hy * 0.784, -hz * 0.62, hx * 0.88, hy * 0.98, hz * 0.62);
      break;
    }
    default: {
      addManifoldBox(builder, -hx * 0.82, baseH + 0.002, -hz * 0.82, hx * 0.82, hy * 0.56, hz * 0.82);
      addManifoldPrism(builder, 0, hy * 0.564, hy, 0, hx * 0.62, hz * 0.62, hx * 0.28, hz * 0.28, 8);
      break;
    }
  }
}

export function synthesizeDeterministicGlb(spec: Varco3dWorldbuildAssetSpec): Buffer {
  const builder = createMeshBuilder();
  populateAssetGeometry(builder, spec);

  const vertexCount = builder.positions.length / 3;
  const positions = new Float32Array(builder.positions);
  const normals = new Float32Array(builder.normals);
  const uvs = new Float32Array(builder.uvs);
  const indices = new Uint16Array(builder.indices);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < builder.positions.length; i += 3) {
    const px = builder.positions[i]!;
    const py = builder.positions[i + 1]!;
    const pz = builder.positions[i + 2]!;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (pz < minZ) minZ = pz;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    if (pz > maxZ) maxZ = pz;
  }

  const posBytes = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
  const normBytes = Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength);
  const uvBytes = Buffer.from(uvs.buffer, uvs.byteOffset, uvs.byteLength);
  const idxBytes = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength);

  const binChunk = Buffer.concat([posBytes, normBytes, uvBytes, idxBytes]);
  const binPad = (4 - (binChunk.byteLength % 4)) % 4;
  const paddedBin = binPad > 0 ? Buffer.concat([binChunk, Buffer.alloc(binPad, 0)]) : binChunk;

  const [r, g, b] = parseHexToRgb01(spec.primaryColorHex);
  const [sr, sg, sb] = parseHexToRgb01(spec.secondaryColorHex);

  const posOffset = 0;
  const normOffset = posOffset + posBytes.byteLength;
  const uvOffset = normOffset + normBytes.byteLength;
  const idxOffset = uvOffset + uvBytes.byteLength;

  const gltfJson = {
    asset: {
      version: "2.0",
      generator: "ToonStudio VARCO 3D Worldbuild Pipeline",
    },
    extras: {
      assetId: spec.id,
      universeId: spec.universeId,
      category: spec.category,
      labelKo: spec.labelKo,
      boundingBoxMeters: spec.boundingBoxMeters,
      secondaryColorRgb: [sr, sg, sb],
      bg3dSlotId: spec.bg3dSlotId ?? null,
      shaperTargetSlot: spec.shaperTargetSlot ?? null,
    },
    scene: 0,
    scenes: [{ name: spec.id, nodes: [0] }],
    nodes: [{ name: spec.id, mesh: 0 }],
    materials: [
      {
        name: `${spec.id}-mat`,
        pbrMetallicRoughness: {
          baseColorFactor: [r, g, b, 1],
          metallicFactor: spec.category === "character-part" ? 0.35 : 0.18,
          roughnessFactor: 0.58,
        },
      },
    ],
    meshes: [
      {
        name: `${spec.id}-mesh`,
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
              TEXCOORD_0: 2,
            },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    buffers: [{ byteLength: paddedBin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: posOffset, byteLength: posBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: normOffset, byteLength: normBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: uvOffset, byteLength: uvBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes.byteLength, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: vertexCount,
        type: "VEC3",
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126,
        count: vertexCount,
        type: "VEC3",
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5126,
        count: vertexCount,
        type: "VEC2",
        min: [0, 0],
        max: [1, 1],
      },
      {
        bufferView: 3,
        byteOffset: 0,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
    ],
  };

  const rawJson = Buffer.from(JSON.stringify(gltfJson), "utf8");
  const jsonPad = (4 - (rawJson.byteLength % 4)) % 4;
  const paddedJson = jsonPad > 0 ? Buffer.concat([rawJson, Buffer.alloc(jsonPad, 0x20)]) : rawJson;

  const totalLength = 12 + 8 + paddedJson.byteLength + 8 + paddedBin.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(paddedJson.byteLength, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(paddedBin.byteLength, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonChunkHeader, paddedJson, binChunkHeader, paddedBin]);
}
