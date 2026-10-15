#!/usr/bin/env node
/**
 * Godot 3D PoC 측정용 합성 GLB 픽스처 생성기(결정적, 외부 에셋 없음).
 *
 * 산출물은 저장소에 커밋하지 않는다(`--out` 폴더, 기본 tools/godot-3d-poc/.cache/fixtures).
 *  - synthetic-character.glb   : 구·원기둥으로 만든 단순 인체형 6파트(법선·UV·2재질). 삼각형 수·AABB 를 expected.json 에 기록한다.
 *  - ext-meshopt.glb           : 위 파일을 EXT_meshopt_compression 으로 실제 압축(required).
 *  - ext-quantized.glb         : KHR_mesh_quantization 으로 실제 양자화(required).
 *  - ext-draco.glb             : KHR_draco_mesh_compression 으로 실제 압축(draco3d 가 해석되면 생성, 아니면 건너뜀).
 *  - ext-basisu.glb            : KHR_texture_basisu(KTX2 UASTC, 인코더 기본값인 zstd 슈퍼컴프레션) 텍스처(ktx2-encoder 가 동작하면 생성, 아니면 건너뜀).
 *  - ext-basisu-uastc-raw.glb  : 위와 같되 슈퍼컴프레션 없는 UASTC.
 *  - ext-basisu-etc1s.glb      : 위와 같되 ETC1S 모드(BasisLZ 슈퍼컴프레션).
 *  - ext-draco-declared.glb 등 : 실제 압축 없이 확장만 required 로 선언한 파일(선언만으로 거절되는지 보는 음성 대조군).
 *
 * 사용: node tools/godot-3d-poc/measure/make-fixtures.mjs [--out <폴더>]
 * 전제: 저장소 루트에서 pnpm install 이 끝난 상태(@gltf-transform/*, meshoptimizer 는 루트 devDependency).
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRDracoMeshCompression, KHRMeshQuantization, KHRTextureBasisu } from "@gltf-transform/extensions";
import { draco, meshopt, quantize } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const requireFromRoot = createRequire(path.join(root, "package.json"));

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const outDir = path.resolve(argValue("--out", path.join(here, "..", ".cache", "fixtures")));
mkdirSync(outDir, { recursive: true });

/** UV 구. 법선은 중심에서 바깥 방향. */
function uvSphere(radius, segments, rings, center) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const v = ring / rings;
    const phi = v * Math.PI;
    for (let seg = 0; seg <= segments; seg += 1) {
      const u = seg / segments;
      const theta = u * Math.PI * 2;
      const nx = Math.cos(theta) * Math.sin(phi);
      const ny = Math.cos(phi);
      const nz = Math.sin(theta) * Math.sin(phi);
      positions.push(center[0] + nx * radius, center[1] + ny * radius, center[2] + nz * radius);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }
  const stride = segments + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let seg = 0; seg < segments; seg += 1) {
      const a = ring * stride + seg;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return { positions, normals, uvs, indices };
}

/** Y 축 원기둥(옆면만, 캡 없음 — 파트는 구와 겹쳐서 닫는다). */
function cylinder(radius, height, segments, center) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let level = 0; level <= 1; level += 1) {
    const y = center[1] + (level - 0.5) * height;
    for (let seg = 0; seg <= segments; seg += 1) {
      const theta = (seg / segments) * Math.PI * 2;
      const nx = Math.cos(theta);
      const nz = Math.sin(theta);
      positions.push(center[0] + nx * radius, y, center[2] + nz * radius);
      normals.push(nx, 0, nz);
      uvs.push(seg / segments, level);
    }
  }
  const stride = segments + 1;
  for (let seg = 0; seg < segments; seg += 1) {
    indices.push(seg, seg + 1, seg + stride, seg + 1, seg + 1 + stride, seg + stride);
  }
  return { positions, normals, uvs, indices };
}

function addMesh(document, buffer, name, geometry, material) {
  const position = document.createAccessor().setType("VEC3").setArray(new Float32Array(geometry.positions)).setBuffer(buffer);
  const normal = document.createAccessor().setType("VEC3").setArray(new Float32Array(geometry.normals)).setBuffer(buffer);
  const uv = document.createAccessor().setType("VEC2").setArray(new Float32Array(geometry.uvs)).setBuffer(buffer);
  const index = document.createAccessor().setType("SCALAR").setArray(new Uint16Array(geometry.indices)).setBuffer(buffer);
  const primitive = document
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setAttribute("NORMAL", normal)
    .setAttribute("TEXCOORD_0", uv)
    .setIndices(index)
    .setMaterial(material);
  return document.createMesh(name).addPrimitive(primitive);
}

function buildCharacter() {
  const document = new Document();
  document.getRoot().getAsset().generator = "toonstudio godot-3d-poc make-fixtures";
  const buffer = document.createBuffer();
  const skin = document.createMaterial("skin").setBaseColorFactor([0.95, 0.78, 0.65, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  const cloth = document.createMaterial("cloth").setBaseColorFactor([0.35, 0.45, 0.85, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  const parts = [
    ["Head", uvSphere(0.14, 24, 16, [0, 1.62, 0]), skin],
    ["Torso", uvSphere(0.24, 24, 16, [0, 1.2, 0]), cloth],
    ["ArmL", cylinder(0.05, 0.6, 16, [-0.34, 1.2, 0]), skin],
    ["ArmR", cylinder(0.05, 0.6, 16, [0.34, 1.2, 0]), skin],
    ["LegL", cylinder(0.07, 0.8, 16, [-0.12, 0.5, 0]), cloth],
    ["LegR", cylinder(0.07, 0.8, 16, [0.12, 0.5, 0]), cloth],
  ];
  const scene = document.createScene("Scene");
  const rootNode = document.createNode("Character");
  scene.addChild(rootNode);
  let triangles = 0;
  let vertices = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const [name, geometry, material] of parts) {
    const mesh = addMesh(document, buffer, name, geometry, material);
    rootNode.addChild(document.createNode(name).setMesh(mesh));
    triangles += geometry.indices.length / 3;
    vertices += geometry.positions.length / 3;
    for (let i = 0; i < geometry.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], geometry.positions[i + axis]);
        max[axis] = Math.max(max[axis], geometry.positions[i + axis]);
      }
    }
  }
  const expected = {
    nodes: 1 + parts.length,
    meshInstances: parts.length,
    surfaces: parts.length,
    triangles,
    vertices,
    aabb: [...min, max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
  return { document, expected };
}

function newIo() {
  return new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRDracoMeshCompression, KHRTextureBasisu])
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
}

function patchJsonChunk(glb, mutate) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(Buffer.from(glb.subarray(20, 20 + jsonLength)).toString("utf8"));
  mutate(json);
  let text = JSON.stringify(json);
  while (Buffer.byteLength(text) % 4 !== 0) text += " ";
  const jsonBytes = Buffer.from(text, "utf8");
  const rest = glb.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBytes.length + rest.length, 8);
  header.writeUInt32LE(jsonBytes.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, jsonBytes, rest]);
}

const report = { generatedWith: "make-fixtures.mjs", files: {}, skipped: {} };

const character = buildCharacter();
const io = newIo();
const plainBytes = await io.writeBinary(character.document);
writeFileSync(path.join(outDir, "synthetic-character.glb"), plainBytes);
report.files["synthetic-character.glb"] = { bytes: plainBytes.byteLength, kind: "plain", expected: character.expected };

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

{
  const { document } = buildCharacter();
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const bytes = await io.writeBinary(document);
  writeFileSync(path.join(outDir, "ext-meshopt.glb"), bytes);
  report.files["ext-meshopt.glb"] = { bytes: bytes.byteLength, kind: "real-compression", extension: "EXT_meshopt_compression", expected: character.expected };
}

{
  const { document } = buildCharacter();
  await document.transform(quantize());
  const bytes = await io.writeBinary(document);
  writeFileSync(path.join(outDir, "ext-quantized.glb"), bytes);
  report.files["ext-quantized.glb"] = { bytes: bytes.byteLength, kind: "real-quantization", extension: "KHR_mesh_quantization", expected: character.expected };
}

// Draco: draco3d 는 루트 직접 의존성이 아니라 pnpm 가상 저장소에서 찾는다. 없으면 건너뛴다.
try {
  const pnpmStore = path.join(root, "node_modules", ".pnpm");
  const candidate = readdirSync(pnpmStore).find((entry) => entry.startsWith("draco3d@"));
  if (!candidate) throw new Error("draco3d 를 pnpm 저장소에서 찾지 못했습니다");
  const draco3d = requireFromRoot(path.join(pnpmStore, candidate, "node_modules", "draco3d"));
  const dracoIo = newIo().registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
    "draco3d.encoder": await draco3d.createEncoderModule(),
    "draco3d.decoder": await draco3d.createDecoderModule(),
  });
  const { document } = buildCharacter();
  await document.transform(draco());
  const bytes = await dracoIo.writeBinary(document);
  writeFileSync(path.join(outDir, "ext-draco.glb"), bytes);
  report.files["ext-draco.glb"] = { bytes: bytes.byteLength, kind: "real-compression", extension: "KHR_draco_mesh_compression", expected: character.expected };
} catch (error) {
  report.skipped["ext-draco.glb"] = String(error?.message ?? error);
}

// KTX2/Basis: ktx2-encoder(gltf-transform 연동) + 합성 체커 텍스처. 이미지 디코더는 합성 원본을 그대로 돌려주는 최소 구현이다.
/** KTX2 헤더에서 supercompressionScheme(0 없음, 1 BasisLZ, 2 Zstd)과 DFD colorModel(163 ETC1S, 166 UASTC)을 읽는다. */
function readKtx2Header(ktx2Bytes) {
  const view = new DataView(ktx2Bytes.buffer, ktx2Bytes.byteOffset, ktx2Bytes.byteLength);
  const dfdOffset = view.getUint32(48, true);
  return { bytes: ktx2Bytes.byteLength, levels: view.getUint32(40, true), supercompressionScheme: view.getUint32(44, true), colorModel: view.getUint8(dfdOffset + 12) };
}

// Basis Universal 모드별로 한 파일씩 만든다. 첫 파일은 인코더 기본값(UASTC + zstd 슈퍼컴프레션)이고,
// 나머지는 슈퍼컴프레션 없는 UASTC와 ETC1S(BasisLZ)다. 실제로 어떤 모드가 만들어졌는지는 fixtures.json 의 ktx2 필드(헤더 값)로 확인한다.
const KTX2_VARIANTS = [
  { file: "ext-basisu.glb", kind: "real-ktx2-uastc-zstd", options: { isUASTC: true } },
  { file: "ext-basisu-uastc-raw.glb", kind: "real-ktx2-uastc-raw", options: { isUASTC: true, needSupercompression: false } },
  { file: "ext-basisu-etc1s.glb", kind: "real-ktx2-etc1s-basislz", options: { isUASTC: false } },
];
for (const variant of KTX2_VARIANTS) {
  try {
    const { ktx2 } = await import("ktx2-encoder/gltf-transform");
    const size = 128;
    const rgba = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const on = ((x >> 4) + (y >> 4)) % 2 === 0;
        const offset = (y * size + x) * 4;
        rgba[offset] = on ? 240 : 60;
        rgba[offset + 1] = on ? 200 : 90;
        rgba[offset + 2] = on ? 160 : 200;
        rgba[offset + 3] = 255;
      }
    }
    const { document } = buildCharacter();
    const texture = document.createTexture("checker").setMimeType("image/png").setImage(new Uint8Array([137, 80, 78, 71]));
    for (const material of document.getRoot().listMaterials()) material.setBaseColorTexture(texture);
    await document.transform(
      ktx2({
        ...variant.options,
        generateMipmap: true,
        imageDecoder: async () => ({ data: rgba, width: size, height: size }),
      }),
    );
    const bytes = await newIo().writeBinary(document);
    writeFileSync(path.join(outDir, variant.file), bytes);
    const image = (await newIo().readBinary(bytes)).getRoot().listTextures()[0].getImage();
    report.files[variant.file] = { bytes: bytes.byteLength, kind: variant.kind, extension: "KHR_texture_basisu", ktx2: readKtx2Header(image), expected: character.expected };
  } catch (error) {
    report.skipped[variant.file] = String(error?.message ?? error);
  }
}

for (const extension of ["KHR_draco_mesh_compression", "KHR_texture_basisu", "EXT_meshopt_compression", "KHR_mesh_quantization"]) {
  const name = `declared-${extension.toLowerCase()}.glb`;
  const bytes = patchJsonChunk(Buffer.from(plainBytes), (json) => {
    json.extensionsUsed = [...(json.extensionsUsed ?? []), extension];
    json.extensionsRequired = [...(json.extensionsRequired ?? []), extension];
  });
  writeFileSync(path.join(outDir, name), bytes);
  report.files[name] = { bytes: bytes.byteLength, kind: "declared-only", extension, expected: null };
}

writeFileSync(path.join(outDir, "fixtures.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outDir, files: Object.keys(report.files), skipped: report.skipped }, null, 2));
