/**
 * scripts/verify-character-kit.mjs — 키트 v2(`toonstudio.character-kit/2`) 규칙 시험(2026-10-23, WP B-1).
 *
 * 합성 v2 키트 = CORE-1 합성 manifest(`apps/character-lab/src/testing/kit-v2-fixtures.ts`, 여성 베이스만) + 이 파일이 만든 GLB 다섯 개
 * (베이스 몸·머리 표면, 헤어 soft-bob 2프리미티브·형태 키·UV0/UV1, 상의 tee 패턴 UV1, 셔츠 이너 층 변형, 강체 리본). 나머지 파츠 파일은
 * 없으므로 시험마다 `only`로 그 규칙만 돌리고 결과를 파일 경로로 거른다. 규칙마다 "좋은 키트는 통과 → 한 가지를 어기면 그 규칙만 실패"를 본다.
 * 진입점: `node_modules/.bin/vitest run scripts/verify-character-kit-v2.test.mjs` 와 `node --test scripts/verify-character-kit-v2.test.mjs`.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

function it(name, body) {
  return process.env.VITEST ? test(name, body, 180_000) : test(name, body);
}

async function importTs(relative) {
  if (process.env.VITEST) {
    const table = {
      "./verify-character-kit.mjs": () => import("./verify-character-kit.mjs"),
      "./lib/character-kit-geometry.mjs": () => import("./lib/character-kit-geometry.mjs"),
      "./lib/character-kit-v2-checks.mjs": () => import("./lib/character-kit-v2-checks.mjs"),
      "../apps/character-lab/src/contracts/index.ts": () => import("../apps/character-lab/src/contracts/index.ts"),
      "../apps/character-lab/src/testing/kit-v2-fixtures.ts": () => import("../apps/character-lab/src/testing/kit-v2-fixtures.ts"),
      "../apps/character-lab/src/testing/kit-fixtures.ts": () => import("../apps/character-lab/src/testing/kit-fixtures.ts"),
    };
    return table[relative]();
  }
  const { tsImport } = await import("tsx/esm/api");
  return tsImport(relative, import.meta.url);
}

const { createMemorySource, verifyKit, V2_CHECKS } = await importTs("./verify-character-kit.mjs");
const { analyzeStrandField, closestOnSurface, createSurface, measureUvDensity } = await importTs("./lib/character-kit-geometry.mjs");
const { activeWorstV2 } = await importTs("./lib/character-kit-v2-checks.mjs");
const { KIT_BUDGET, KIT_SKELETON_JOINTS, KIT_SKELETON_PARENTS } = await importTs("../apps/character-lab/src/contracts/index.ts");
const { kitManifestV2Json } = await importTs("../apps/character-lab/src/testing/kit-v2-fixtures.ts");
const { kitManifestJson } = await importTs("../apps/character-lab/src/testing/kit-fixtures.ts");

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// ---------------------------------------------------------------- 합성 기하

const HEAD = { center: [0, 1.55, 0], radius: 0.09 };
const BODY = { radius: 0.13, y0: 0.95, y1: 1.4 };

/** 바깥 법선 UV 구 */
function sphere({ center, radius }, rings = 14, segments = 20) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let r = 0; r <= rings; r += 1) {
    const theta = (Math.PI * r) / rings;
    for (let s = 0; s <= segments; s += 1) {
      const phi = (2 * Math.PI * s) / segments;
      const n = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      positions.push(center[0] + radius * n[0], center[1] + radius * n[1], center[2] + radius * n[2]);
      normals.push(...n);
    }
  }
  for (let r = 0; r < rings; r += 1) for (let s = 0; s < segments; s += 1) {
    const a = r * (segments + 1) + s;
    const b = a + segments + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return { positions, normals, indices };
}

/** 바깥 법선 원기둥 옆면(뚜껑 없음). `uv1Scale`이 있으면 UV1 = (호 길이, 높이) × 배율 */
function cylinder({ radius, y0, y1, segments = 24, rings = 6, uv1Scale = null }) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const uvs1 = [];
  const indices = [];
  for (let r = 0; r <= rings; r += 1) {
    const y = y0 + ((y1 - y0) * r) / rings;
    for (let s = 0; s <= segments; s += 1) {
      const phi = (2 * Math.PI * s) / segments;
      positions.push(radius * Math.cos(phi), y, radius * Math.sin(phi));
      normals.push(Math.cos(phi), 0, Math.sin(phi));
      uvs.push(s / segments, r / rings);
      if (uv1Scale !== null) uvs1.push(radius * phi * uv1Scale, y * uv1Scale);
    }
  }
  for (let r = 0; r < rings; r += 1) for (let s = 0; s < segments; s += 1) {
    const a = r * (segments + 1) + s;
    const b = a + segments + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { positions, normals, uvs, uvs1: uv1Scale === null ? null : uvs1, indices };
}

/**
 * 머리 구 위 자오선을 따라가며 끝으로 갈수록 머리에서 `lift`만큼 떨어지는 가닥(4각 관, 뿌리 부채꼴 마개, 끝 한 점). 가닥 흐름 t는 뿌리 0 → 끝 1.
 * 색 영역처럼 t < `split`과 t ≥ `split`을 두 프리미티브로 나누고 경계 고리는 양쪽에 복제한다(포지 v2 헤어와 같은 꼴).
 */
function strands({ count = 6, rings = 10, offset = 0.004, lift = 0.02, tube = 0.0015, split = 0.7, uv0 = (t) => 0.02 + 0.97 * t, uv1 = (t) => t, shapes = {} }) {
  const prims = [0, 1].map(() => ({ positions: [], normals: [], uvs: [], uvs1: [], indices: [], targets: {} }));
  for (const name of Object.keys(shapes)) for (const prim of prims) prim.targets[name] = [];
  for (let k = 0; k < count; k += 1) {
    const phi = (2 * Math.PI * k) / count;
    const ePhi = [-Math.sin(phi), 0, Math.cos(phi)];
    const point = (t) => {
      const theta = ((25 + 75 * t) * Math.PI) / 180;
      const n = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      const radial = HEAD.radius + offset + lift * t; // 끝으로 갈수록 머리에서 떨어진다(실제 헤어처럼 끝이 뿌리보다 두피에서 멀다)
      return { n, p: [HEAD.center[0] + radial * n[0], HEAD.center[1] + radial * n[1], HEAD.center[2] + radial * n[2]] };
    };
    for (const [zone, prim] of prims.entries()) {
      const ts = Array.from({ length: rings }, (_, i) => i / (rings - 1)).filter((t) => (zone === 0 ? t <= split + 1e-9 : t >= split - 1e-9));
      const boundary = zone === 1 ? [Math.max(...Array.from({ length: rings }, (_, i) => i / (rings - 1)).filter((t) => t <= split + 1e-9))] : [];
      const params = zone === 1 ? [...boundary, ...ts.filter((t) => t > boundary[0])] : ts;
      const base = prim.positions.length / 3;
      const add = (p, normal, t, alpha) => {
        prim.positions.push(...p);
        prim.normals.push(...normal);
        prim.uvs.push(alpha, uv0(t));
        prim.uvs1.push(zone === 0 ? 0 : 0.5, uv1(t));
        for (const [name, fn] of Object.entries(shapes)) prim.targets[name].push(...fn(t, point(t).n));
      };
      if (zone === 0) add(point(0).p, point(0).n, 0, 0.5); // 뿌리 마개 중심
      for (const t of params) {
        const { n, p } = point(t);
        const last = zone === 1 && t === params[params.length - 1];
        if (last) {
          add(p, n, t, 0.5); // 끝 한 점
          continue;
        }
        for (let a = 0; a < 4; a += 1) {
          const angle = (Math.PI / 2) * a;
          const dir = [Math.cos(angle) * n[0] + Math.sin(angle) * ePhi[0], Math.cos(angle) * n[1] + Math.sin(angle) * ePhi[1], Math.cos(angle) * n[2] + Math.sin(angle) * ePhi[2]];
          add([p[0] + tube * dir[0], p[1] + tube * dir[1], p[2] + tube * dir[2]], dir, t, a / 4);
        }
      }
      const ringStart = (i) => base + (zone === 0 ? 1 : 0) + 4 * i;
      const ringCount = zone === 0 ? params.length : params.length - 1;
      if (zone === 0) for (let a = 0; a < 4; a += 1) prim.indices.push(base, ringStart(0) + a, ringStart(0) + ((a + 1) % 4));
      for (let i = 0; i + 1 < ringCount; i += 1) for (let a = 0; a < 4; a += 1) {
        const p0 = ringStart(i) + a;
        const p1 = ringStart(i) + ((a + 1) % 4);
        const q0 = ringStart(i + 1) + a;
        const q1 = ringStart(i + 1) + ((a + 1) % 4);
        prim.indices.push(p0, q0, p1, p1, q0, q1);
      }
      if (zone === 1) {
        const tip = ringStart(ringCount);
        for (let a = 0; a < 4; a += 1) prim.indices.push(ringStart(ringCount - 1) + a, tip, ringStart(ringCount - 1) + ((a + 1) % 4));
      }
    }
  }
  return prims;
}

// ---------------------------------------------------------------- GLB

/** 메시 사양 → GLB. `skinned`인 메시는 계약 68 joint 스켈레톤(원점, 항등 IBM)에 머리 joint 100 %로 묶는다. */
async function writeGlb(meshes, { skeleton = true } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  let skin = null;
  let headIndex = 0;
  if (skeleton) {
    const armature = doc.createNode("Armature");
    scene.addChild(armature);
    const nodes = new Map();
    skin = doc.createSkin("Armature");
    for (const name of KIT_SKELETON_JOINTS) {
      const node = doc.createNode(name);
      (KIT_SKELETON_PARENTS[name] === null ? armature : nodes.get(KIT_SKELETON_PARENTS[name])).addChild(node);
      nodes.set(name, node);
      skin.addJoint(node);
    }
    headIndex = KIT_SKELETON_JOINTS.indexOf("mixamorig:Head");
    const ibm = new Float32Array(KIT_SKELETON_JOINTS.length * 16);
    for (let j = 0; j < KIT_SKELETON_JOINTS.length; j += 1) ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], j * 16);
    skin.setInverseBindMatrices(doc.createAccessor().setType("MAT4").setArray(ibm).setBuffer(buffer));
  }
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const materials = new Map();
  for (const spec of meshes) {
    const mesh = doc.createMesh(spec.node);
    const names = Object.keys(spec.prims[0].targets ?? {});
    mesh.setExtras({ targetNames: names });
    for (const prim of spec.prims) {
      const count = prim.positions.length / 3;
      if (!materials.has(prim.material)) materials.set(prim.material, doc.createMaterial(prim.material).setDoubleSided(Boolean(spec.doubleSided)));
      const primitive = doc
        .createPrimitive()
        .setAttribute("POSITION", accessor("VEC3", Float32Array.from(prim.positions)))
        .setAttribute("NORMAL", accessor("VEC3", Float32Array.from(prim.normals)))
        .setAttribute("TEXCOORD_0", accessor("VEC2", Float32Array.from(prim.uvs ?? new Array(count * 2).fill(0.5))))
        .setIndices(accessor("SCALAR", Uint32Array.from(prim.indices)))
        .setMaterial(materials.get(prim.material));
      if (prim.uvs1) primitive.setAttribute("TEXCOORD_1", accessor("VEC2", Float32Array.from(prim.uvs1)));
      if (spec.skinned !== false && skeleton) {
        const joints = new Uint16Array(count * 4);
        const weights = new Float32Array(count * 4);
        for (let v = 0; v < count; v += 1) {
          joints[v * 4] = headIndex;
          weights[v * 4] = 1;
        }
        primitive.setAttribute("JOINTS_0", accessor("VEC4", joints)).setAttribute("WEIGHTS_0", accessor("VEC4", weights));
      }
      for (const name of names) primitive.addTarget(doc.createPrimitiveTarget(name).setAttribute("POSITION", accessor("VEC3", Float32Array.from(prim.targets[name]))));
      mesh.addPrimitive(primitive);
    }
    const node = doc.createNode(spec.node).setMesh(mesh);
    if ((spec.skinned !== false || spec.forceSkin) && skeleton) node.setSkin(skin);
    scene.addChild(node);
  }
  return io.writeBinary(doc);
}

function fileEntry(path, bytes) {
  return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** 최소 RGBA PNG(필터 0) */
function rgbaPng(width, height) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    let c = 0xffffffff;
    for (const byte of out.subarray(4, 8 + data.length)) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
    out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(height * (1 + width * 4), 0);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]));
}

// ---------------------------------------------------------------- 합성 v2 키트

const HEAD_MORPHS = ["height", "legLength", "neckLength", "headSize"].flatMap((key) => [`param:${key}:+`, `param:${key}:-`]);
const HAIR_PATH = "parts/female/hair/soft-bob.glb";
const TEE_PATH = "parts/female/top/tee.glb";
const SHIRT_INNER_PATH = "parts/female/inner/shirt.glb";
const RIBBON_PATH = "parts/female/accessory/ribbon.glb";
const MASK_PATH = "bases/female-head-regions.png";

function paramDeltas(prims, names) {
  for (const prim of prims) for (const name of names) {
    const sign = name.endsWith(":+") ? 1 : -1;
    const count = prim.positions.length / 3;
    prim.targets[name] = Array.from({ length: count * 3 }, (_, i) => (i % 3 === 1 ? sign * 0.0005 : 0));
  }
}

/**
 * 합성 v2 키트. `tweak`로 GLB 재료를 바꿔 위반 키트를 만든다.
 * @param {{hair?: object, shapes?: Record<string, Function>, extraShapes?: string[], innerGap?: number, innerLayer?: string, teeUv1?: Function, ribbonSkinned?: boolean, mask?: boolean}} tweak
 */
async function buildKit(tweak = {}) {
  const manifest = kitManifestV2Json({ male: false });
  const files = new Map();
  const part = (id) => manifest.parts.find((candidate) => candidate.id === id);

  const head = sphere(HEAD);
  const body = cylinder(BODY);
  const baseBytes = await writeGlb([
    { node: "TS_Body", prims: [{ ...body, material: "ts_skin_body", targets: {} }] },
    { node: "TS_Head", prims: [{ ...head, material: "ts_skin_head", targets: {} }] },
  ]);
  files.set("bases/female.glb", baseBytes);
  manifest.bases.female.file = fileEntry("bases/female.glb", baseBytes);

  // 헤어: 2프리미티브(본체·끝 영역), 형태 length·volume, UV0 램프·UV1 흐름
  const shapes = tweak.shapes ?? {
    "shape:length:+": (t, n) => [0, -0.003 * t, 0],
    "shape:length:-": (t, n) => [0, 0.002 * t, 0].map((value, i) => value + 0 * n[i]),
    "shape:volume:+": (t, n) => n.map((value) => 0.003 * t * value),
    "shape:volume:-": (t, n) => n.map((value) => -0.001 * t * value),
  };
  const lods = [10, 7, 4].map((rings, lod) => {
    const prims = strands({ rings, shapes: lod < 2 ? shapes : {}, ...(tweak.hair ?? {}) });
    paramDeltas(prims, HEAD_MORPHS);
    return { node: `TS_AuthoredHair_soft-bob_LOD${lod}`, lod, doubleSided: true, prims: prims.map((prim, zone) => ({ ...prim, material: zone === 0 ? "ts_hair_soft-bob" : "ts_hair_tip_soft-bob" })) };
  });
  const hairBytes = await writeGlb(lods);
  files.set(HAIR_PATH, hairBytes);
  manifest.materials["ts_hair_soft-bob"] = { role: "hair", channel: "hair", tint: { mode: "recolor" }, doubleSided: true };
  manifest.materials["ts_hair_tip_soft-bob"] = { role: "hair", channel: "hair-tip", tint: { mode: "recolor" }, doubleSided: true };
  const hairVariant = part("hair/soft-bob").variants.female;
  hairVariant.file = fileEntry(HAIR_PATH, hairBytes);
  hairVariant.shapes = ["length", "volume", ...(tweak.extraShapes ?? [])];
  hairVariant.meshes = lods.map((lod) => ({
    node: lod.node,
    primitiveRoles: ["hair", "hair"],
    primitiveMaterials: ["ts_hair_soft-bob", "ts_hair_tip_soft-bob"],
    lod: lod.lod,
    triangles: lod.prims.reduce((sum, prim) => sum + prim.indices.length / 3, 0),
    vertices: lod.prims.reduce((sum, prim) => sum + prim.positions.length / 3, 0),
    skinned: true,
    morphs: Object.keys(lod.prims[0].targets),
    uv1: { purpose: "hair-flow" },
  }));

  // 상의 tee: 패턴 UV1(1 UV = 60 cm) 본체 + 트림
  const teeBody = cylinder({ radius: BODY.radius + 0.006, y0: 1.0, y1: 1.35, uv1Scale: 100 / 60 });
  if (tweak.teeUv1) tweak.teeUv1(teeBody);
  const trim = cylinder({ radius: BODY.radius + 0.007, y0: 1.33, y1: 1.35, rings: 1 });
  const bodyMorphs = part("top/tee").variants.female.meshes[0].morphs;
  const teePrims = [{ ...teeBody, material: "ts_top_tee", targets: {} }, { ...trim, material: "ts_top_tee_trim", targets: {} }];
  paramDeltas(teePrims, bodyMorphs);
  const teeBytes = await writeGlb([{ node: "TS_Top_tee", prims: [teePrims[0]] }, { node: "TS_Top_tee_Trim", prims: [teePrims[1]] }]);
  files.set(TEE_PATH, teeBytes);
  const tee = part("top/tee").variants.female;
  tee.file = fileEntry(TEE_PATH, teeBytes);
  for (const [index, mesh] of tee.meshes.entries()) Object.assign(mesh, { triangles: teePrims[index].indices.length / 3, vertices: teePrims[index].positions.length / 3 });

  // 셔츠 이너 층 변형: 몸 원기둥에서 innerGap만큼 떨어진 셸
  const layer = tweak.innerLayer ?? "inner";
  const shell = cylinder({ radius: BODY.radius + (tweak.innerGap ?? 0.003), y0: 1.0, y1: 1.35 });
  const shirt = part("top/shirt");
  const layered = shirt.layerVariants.female.inner;
  const shellPrims = [{ ...shell, material: layer === "inner" ? "ts_inner_shirt" : "ts_outer_shirt", targets: {} }];
  paramDeltas(shellPrims, layered.meshes[0].morphs);
  const node = layer === "inner" ? "TS_Inner_shirt" : "TS_Outer_shirt";
  const shellBytes = await writeGlb([{ node, prims: shellPrims }]);
  const shellPath = layer === "inner" ? SHIRT_INNER_PATH : "parts/female/outer/shirt.glb";
  files.set(shellPath, shellBytes);
  Object.assign(layered, { file: fileEntry(shellPath, shellBytes) });
  Object.assign(layered.meshes[0], { node, role: layer, material: shellPrims[0].material, triangles: shell.indices.length / 3, vertices: shell.positions.length / 3 });
  if (layer !== "inner") {
    manifest.materials.ts_outer_shirt = { role: "outer", channel: "outer", tint: { mode: "recolor" }, doubleSided: false };
    shirt.layerVariants.female = { [layer]: layered };
  }

  // 강체 리본(스킨 없음, 앵커 hair)
  const ribbon = sphere({ center: [0, 1.6, -0.1], radius: 0.01 }, 4, 6);
  const ribbonBytes = await writeGlb([{ node: "TS_HairAccessory_ribbon", skinned: false, forceSkin: tweak.ribbonSkinned === true, prims: [{ ...ribbon, material: "ts_hairaccessory_ribbon", targets: {} }] }], { skeleton: tweak.ribbonSkinned === true });
  files.set(RIBBON_PATH, ribbonBytes);
  const ribbonVariant = part("accessory/ribbon").variants.female;
  ribbonVariant.file = fileEntry(RIBBON_PATH, ribbonBytes);
  Object.assign(ribbonVariant.meshes[0], { triangles: ribbon.indices.length / 3, vertices: ribbon.positions.length / 3 });

  if (tweak.mask === false) delete manifest.bases.female.headRegionMask;
  else {
    const png = rgbaPng(256, 256);
    files.set(MASK_PATH, png);
    manifest.bases.female.headRegionMask.file = fileEntry(MASK_PATH, png);
  }
  return { manifest, files };
}

async function run(kit, only) {
  const files = new Map(kit.files);
  files.set("kit.json", JSON.stringify(kit.manifest));
  return verifyKit({ source: createMemorySource(files), base: "female", only });
}

function findings(result, id, path, level = "error") {
  return result.findings.filter((finding) => finding.id === id && finding.level === level && (path === undefined || finding.where.startsWith(path)));
}

function assertFinding(result, id, path, fragment, level = "error") {
  const list = findings(result, id, path, level);
  assert.ok(list.some((finding) => finding.message.includes(fragment)), `${id} ${level} '${fragment}' 없음(${path ?? "전체"}).\n실제: ${JSON.stringify(result.findings.filter((f) => f.id === id), null, 1)}`);
}

function assertClean(result, ids) {
  const found = result.findings.filter((finding) => ids.includes(finding.id) && finding.level === "error");
  assert.deepEqual(found, [], `예상치 못한 오류:\n${JSON.stringify(found, null, 1)}`);
}

const V2_RULES = ["V1", "V3", "V14", "V16", "V17", "V21", "V22", "V23", "V24"];

// ---------------------------------------------------------------- 순수 기하

it("closestOnSurface: 구 표면의 바깥은 양수, 안쪽은 음수 부호 거리다", () => {
  const surface = createSurface([{ ...sphere(HEAD, 24, 32), positions: Float32Array.from(sphere(HEAD, 24, 32).positions), normals: Float32Array.from(sphere(HEAD, 24, 32).normals), indices: Uint32Array.from(sphere(HEAD, 24, 32).indices) }]);
  const outside = closestOnSurface(surface, 0, HEAD.center[1] + HEAD.radius + 0.002, 0, 0.06);
  const inside = closestOnSurface(surface, 0.03, HEAD.center[1] + 0.03, 0.06, 0.06);
  assert.ok(Math.abs(outside.signed - 0.002) < 3e-4, String(outside.signed));
  assert.ok(inside.signed < -0.005, String(inside.signed));
  assert.equal(closestOnSurface(surface, 2, 2, 2, 0.06), null); // 반경 밖은 재지 않는다
});

it("closestOnSurface: 두 메시의 이음매(같은 위치 정점)를 넘어 가장 가까운 면을 찾는다(전수 탐색과 같다)", () => {
  // 구를 북·남 반구 두 메시로 나누고 적도 정점을 복제한다(몸·머리 목 이음매와 같은 꼴). 적도 바로 아래 바깥 점의 가장 가까운 정점은
  // 북반구 사본일 수 있는데, 이음매를 합치지 않으면 남반구 면을 후보에서 놓친다(2026-10-23 실측: 남성 트윈테일 목덜미 −4.42 mm 오판).
  const full = sphere(HEAD, 14, 20);
  const half = (north) => {
    const rows = 20 + 1;
    const keep = (r) => (north ? r <= 7 : r >= 7);
    const map = new Map();
    const positions = [];
    const normals = [];
    for (let r = 0; r <= 14; r += 1) for (let s = 0; s < rows; s += 1) if (keep(r)) {
      map.set(r * rows + s, positions.length / 3);
      positions.push(...full.positions.slice((r * rows + s) * 3, (r * rows + s) * 3 + 3));
      normals.push(...full.normals.slice((r * rows + s) * 3, (r * rows + s) * 3 + 3));
    }
    const indices = [];
    for (let t = 0; t < full.indices.length; t += 3) {
      const corners = full.indices.slice(t, t + 3);
      if (corners.every((index) => map.has(index))) indices.push(...corners.map((index) => map.get(index)));
    }
    return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
  };
  const surface = createSurface([half(true), half(false)]);
  const brute = (x, y, z) => {
    let best = Infinity;
    for (let t = 0; t < full.indices.length; t += 3) {
      const one = createSurface([{ positions: Float32Array.from(full.indices.slice(t, t + 3).flatMap((i) => full.positions.slice(i * 3, i * 3 + 3))), indices: Uint32Array.from([0, 1, 2]) }]);
      best = Math.min(best, closestOnSurface(one, x, y, z, 1)?.distance ?? Infinity);
    }
    return best;
  };
  for (let k = 0; k < 24; k += 1) {
    const phi = (2 * Math.PI * (k + 0.37)) / 12;
    const theta = Math.PI / 2 + (k % 2 === 0 ? 0.06 : -0.06); // 적도 바로 아래·위(같은 거리의 복제 정점 중 어느 쪽을 고르든 반대쪽 면이 답인 경우가 생긴다)
    const r = HEAD.radius + 0.002;
    const point = [r * Math.sin(theta) * Math.cos(phi), HEAD.center[1] + r * Math.cos(theta), r * Math.sin(theta) * Math.sin(phi)];
    const hit = closestOnSurface(surface, ...point, 0.06);
    assert.ok(Math.abs(hit.distance - brute(...point)) < 1e-9, `k=${k}: ${hit.distance} ≠ ${brute(...point)}`);
    assert.ok(hit.signed > 0);
  }
});

it("analyzeStrandField: 프리미티브 경계에서 잘린 가닥을 붙여 극값을 뿌리·끝에서만 찾고, 가닥 중간의 꺾임을 잡는다", () => {
  const toInput = (prims, key) => prims.map((prim) => ({ positions: Float32Array.from(prim.positions), indices: Uint32Array.from(prim.indices), values: Float32Array.from(prim[key].filter((_, i) => i % 2 === 1)) }));
  const good = analyzeStrandField(toInput(strands({}), "uvs1"));
  assert.equal(good.extrema.filter((entry) => entry.interior).length, 0);
  assert.deepEqual([...new Set(good.extrema.filter((e) => e.kind === "min").map((e) => e.value))], [0]);
  assert.deepEqual([...new Set(good.extrema.filter((e) => e.kind === "max").map((e) => e.value))], [1]);
  // 붙이지 않으면(프리미티브 하나씩) 끝 영역의 시작 고리가 가짜 뿌리로 보인다 — 용접이 필요한 이유
  const split = analyzeStrandField(toInput(strands({}), "uvs1").slice(1));
  assert.ok(split.extrema.some((entry) => entry.kind === "min" && entry.value > 0.5));
  const folded = analyzeStrandField(toInput(strands({ uv1: (t) => (t < 0.5 ? t : 1 - t) }), "uvs1"));
  assert.ok(folded.extrema.some((entry) => entry.interior && entry.kind === "max"), "가닥 중간 최대(접힘)를 잡아야 한다");
});

it("measureUvDensity: 원기둥 펼침은 배율 1로 균일하고, 절반을 늘리면 분위수가 벌어진다", () => {
  const shell = cylinder({ radius: 0.15, y0: 1, y1: 1.3, uv1Scale: 100 / 40 });
  const asInput = (c) => ({ positions: Float32Array.from(c.positions), indices: Uint32Array.from(c.indices), uvs: Float32Array.from(c.uvs1), cmPerUnit: 40 });
  const uniform = measureUvDensity(asInput(shell));
  assert.ok(Math.abs(uniform.scaleP50 - 1) < 0.02 && Math.abs(uniform.scaleP05 - 1) < 0.02 && Math.abs(uniform.scaleP95 - 1) < 0.02, JSON.stringify(uniform));
  assert.ok(uniform.anisotropyP95 < 1.05);
  for (let i = 1; i < shell.uvs1.length; i += 2) if (shell.positions[((i - 1) / 2) * 3 + 1] > 1.15) shell.uvs1[i] *= 1.6;
  const stretched = measureUvDensity(asInput(shell));
  assert.ok(stretched.scaleP95 > 1.15, JSON.stringify(stretched));
});

it("activeWorstV2: 층을 더한 합이 예산을 넘는지, 소품 12개 반복은 따로 센다", () => {
  const ok = activeWorstV2({ baseTriangles: 100_000, slotWorst: { hair: 20_000, top: 25_000 }, layerWorst: { inner: 10_000, outer: 20_000 }, accessoryMax: 6_000 });
  assert.equal(ok.withLayers, 175_000);
  assert.equal(ok.withAccessories, 175_000 + 11 * 6_000);
  assert.equal(ok.budget, KIT_BUDGET.triangles.activeWorst);
});

// ---------------------------------------------------------------- 합성 v2 키트

it("좋은 합성 v2 키트는 v2 규칙(V1·V3·V14·V16·V17·V21~V24)에서 오류 0이고, 보고서는 V21~V24를 싣는다", async () => {
  const result = await run(await buildKit(), V2_RULES);
  assertClean(result, V2_RULES);
  for (const { id } of V2_CHECKS) assert.equal(result.checks[id]?.status, "pass", `${id}: ${JSON.stringify(result.checks[id])}`);
  const evidence = result.metrics.customEvidence.female;
  assert.deepEqual(evidence.layers, ["inner", "legwear", "outer"]); // 합성 manifest의 셔츠·블레이저·슬랙스 층 변형
  assert.deepEqual(evidence.shapes.hair, ["length", "volume"]);
  assert.equal(evidence.hairFlow, true);
  assert.equal(evidence.patternUv, true);
  assert.ok(evidence.channels.includes("hair-tip") && evidence.channels.includes("sclera"));
  assert.equal(evidence.anchors.length, 14);
});

it("V1: v2 계약 스키마로 읽는다 — 재질 채널이 역할에 맞지 않으면 실패", async () => {
  const kit = await buildKit();
  kit.manifest.materials["ts_hair_tip_soft-bob"].channel = "top";
  assertFinding(await run(kit, ["V1"]), "V1", "kit.json:materials.ts_hair_tip_soft-bob", "recolor이고 채널이 hair·hair-tip·hair-accent 중 하나여야 합니다");
});

it("V8: 강체 소품은 스킨 없이 통과하고, 스킨에 묶으면 실패한다(V6도 스켈레톤 없는 강체 파일을 받는다)", async () => {
  const good = await run(await buildKit(), ["V6", "V8"]);
  assert.deepEqual([...findings(good, "V6", RIBBON_PATH), ...findings(good, "V8", RIBBON_PATH)], []);
  const bad = await run(await buildKit({ ribbonSkinned: true }), ["V8"]);
  assertFinding(bad, "V8", RIBBON_PATH, "강체(skinned: false)로 선언했지만 스킨에 바인딩되어 있습니다");
});

it("V9: 형태 morph는 선언한 이름만 — 선언 밖 이름·± 같음·델타 과대·한쪽 없음을 잡는다", async () => {
  const good = await run(await buildKit(), ["V9"]);
  assert.deepEqual(findings(good, "V9", HAIR_PATH), []);
  const shift = (amount) => (t, n) => n.map((value) => amount * t * value);
  const undeclared = await run(await buildKit({ shapes: { "shape:length:+": shift(0.001), "shape:length:-": shift(-0.0005), "shape:volume:+": shift(0.002), "shape:volume:-": shift(-0.0005), "shape:curl:+": shift(0.001) } }), ["V9"]);
  assertFinding(undeclared, "V9", HAIR_PATH, "형태 키는 변형 shapes에 선언한 이름만");
  const same = await run(await buildKit({ shapes: { "shape:length:+": shift(0.002), "shape:length:-": shift(0.002), "shape:volume:+": shift(0.002), "shape:volume:-": shift(-0.0005) } }), ["V9"]);
  assertFinding(same, "V9", HAIR_PATH, "shape:length:+와 shape:length:-의 델타가 같습니다");
  const huge = await run(await buildKit({ shapes: { "shape:length:+": shift(0.2), "shape:length:-": shift(0.1), "shape:volume:+": shift(0.002), "shape:volume:-": shift(-0.0005) } }), ["V9"]);
  assertFinding(huge, "V9", HAIR_PATH, "상한 0.15 m를 넘습니다");
  assertFinding(huge, "V9", HAIR_PATH, "설계 제안값 0.08 m", "warning");
  const missing = await run(await buildKit({ extraShapes: ["wave"] }), ["V1", "V9"]);
  assertFinding(missing, "V9", HAIR_PATH, "shape:wave:+ morph가 이 변형의 어느 메시에도 없습니다");
});

it("V14: 헤어 흐름 UV1 — 방향 뒤집힘·뿌리가 0이 아님·범위 밖을 잡는다", async () => {
  const reversed = await run(await buildKit({ hair: { uv1: (t) => 1 - t } }), ["V14"]);
  assertFinding(reversed, "V14", HAIR_PATH, "헤어 흐름 UV1이 거꾸로입니다"); // 값은 0과 1 사이 그대로라 뿌리·끝 값 검사만으로는 못 잡는다
  const lifted = await run(await buildKit({ hair: { uv1: (t) => 0.1 + 0.9 * t } }), ["V14"]);
  assertFinding(lifted, "V14", HAIR_PATH, "흐름은 뿌리 0에서 시작해야 합니다");
  const outside = await run(await buildKit({ hair: { uv1: (t) => 1.2 * t } }), ["V14"]);
  assertFinding(outside, "V14", HAIR_PATH, "[0, 1] 밖입니다");
});

it("V16: 슬롯 변형과 층 변형의 채널 구성이 LAYER_CHANNEL_MAP으로 대응하지 않으면 경고한다", async () => {
  const kit = await buildKit();
  kit.manifest.materials.ts_inner_shirt.channel = "inner-trim";
  assertFinding(await run(kit, ["V16"]), "V16", "kit.json:top/shirt@female#inner", "LAYER_CHANNEL_MAP", "warning");
});

it("V17: 변형 앵커가 베이스 앵커 표에 없거나 uv1 목적이 슬롯에 맞지 않으면 실패한다", async () => {
  const noAnchor = await buildKit();
  delete noAnchor.manifest.bases.female.anchors.hair;
  assertFinding(await run(noAnchor, ["V17"]), "V17", "kit.json:accessory/ribbon@female", "기본 앵커 hair가 베이스 female의 anchors 표에 없습니다");
  const flowOnTee = await buildKit();
  flowOnTee.manifest.parts.find((part) => part.id === "top/tee").variants.female.meshes[0].uv1 = { purpose: "hair-flow" };
  assertFinding(await run(flowOnTee, ["V17"]), "V17", "kit.json:top/tee@female:TS_Top_tee", "uv1 hair-flow는 헤어 슬롯 메시에만");
});

it("V21: 형태 키 −1이 가닥을 머리 안으로 밀면 실패한다(휴지 자세는 통과)", async () => {
  const inward = await run(await buildKit({ shapes: { "shape:length:+": (t) => [0, -0.002 * t, 0], "shape:length:-": (t) => [0, 0.001 * t, 0], "shape:volume:+": (t, n) => n.map((v) => 0.003 * t * v), "shape:volume:-": (t, n) => n.map((v) => -0.008 * v) } }), ["V21"]);
  assertFinding(inward, "V21", HAIR_PATH, "shape:volume:- = 1에서 정점");
  assert.deepEqual(findings(inward, "V21", HAIR_PATH).filter((finding) => finding.message.includes("shape:volume:+")), []);
});

it("V22: 이너 층이 몸에 1.5 mm보다 붙으면 실패하고, 아우터는 4 mm를 요구한다", async () => {
  assertFinding(await run(await buildKit({ innerGap: 0.0008 }), ["V22"]), "V22", SHIRT_INNER_PATH, "inner 층의 몸 간격 1% 분위수가");
  const outer = await run(await buildKit({ innerLayer: "outer", innerGap: 0.003 }), ["V1", "V22"]);
  assertFinding(outer, "V22", "parts/female/outer/shirt.glb", "최소 4 mm");
});

it("V23: UV0.v가 가닥 중간에서 꺾이거나 UV1 흐름과 반대로 가면 실패한다", async () => {
  const folded = await run(await buildKit({ hair: { uv0: (t) => (t < 0.5 ? 0.02 + t : 1.02 - t) } }), ["V23"]);
  assertFinding(folded, "V23", HAIR_PATH, "UV0.v가 가닥 중간에서 꺾이는 곳이");
  const against = await run(await buildKit({ hair: { uv0: (t) => 0.99 - 0.97 * t } }), ["V23"]);
  assertFinding(against, "V23", HAIR_PATH, "UV0.v가 헤어 흐름 UV1.v와 반대로 가는 변이");
});

it("V24: 패턴 UV1 밀도가 부위마다 다르거나 선언 배율과 어긋나면 실패한다", async () => {
  const stretched = await run(await buildKit({ teeUv1: (c) => { for (let i = 1; i < c.uvs1.length; i += 2) if (c.positions[((i - 1) / 2) * 3 + 1] > 1.2) c.uvs1[i] *= 1.6; } }), ["V24"]);
  assertFinding(stretched, "V24", TEE_PATH, "UV1 밀도가 균일하지 않습니다");
  const scaled = await run(await buildKit({ teeUv1: (c) => { for (let i = 0; i < c.uvs1.length; i += 1) c.uvs1[i] *= 1.3; } }), ["V24"]);
  assertFinding(scaled, "V24", TEE_PATH, "UV1 밀도 중앙값이 선언");
});

it("V2·V13: 머리 영역 마스크 PNG의 해시·크기를 본다", async () => {
  const kit = await buildKit();
  kit.manifest.bases.female.headRegionMask.width = 512;
  const result = await run(kit, ["V2", "V13"]);
  assertFinding(result, "V13", MASK_PATH, "마스크 크기 256×256가 선언 512×256와 다릅니다");
  assert.deepEqual(findings(result, "V2", MASK_PATH), []);
  kit.files.set(MASK_PATH, rgbaPng(256, 128));
  assertFinding(await run(kit, ["V2"]), "V2", MASK_PATH, "SHA-256이 kit.json 선언과 다릅니다");
});

it("v1 키트에 --only V21을 주면 해당 없음으로 건너뛴다(v1 보고서는 V21~V24를 싣지 않는다)", async () => {
  const result = await run({ manifest: kitManifestJson({ male: false }), files: new Map() }, ["V21"]);
  assert.equal(result.checks.V21?.status, "skipped");
  assert.match(result.checks.V21.skippedReason, /키트 v1 manifest에는/u);
});
