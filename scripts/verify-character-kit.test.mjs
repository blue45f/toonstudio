/**
 * scripts/verify-character-kit.mjs 단위 테스트(KT-09).
 *
 * 실제 에셋 없이 `@gltf-transform/core`로 만든 합성 키트(스켈레톤 68, 베이스 9메시, 필수 파츠 5종)로 통과/실패 케이스를 돈다.
 * 진입점은 두 가지다: `pnpm exec vitest run scripts/verify-character-kit.test.mjs` 와 `node --test scripts/verify-character-kit.test.mjs`.
 * (기존 scripts/validate-app-boundaries.test.mjs와 같은 `process.env.VITEST ? vitest : node:test` 이중 진입 방식)
 * 검증기가 TS 계약을 직접 import하므로 node:test 경로에서는 `tsx/esm/api`의 `tsImport`로 읽는다.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "..");

/** 합성 GLB 생성·검증은 느리지 않지만 vitest 기본 30초는 여유가 적어 넉넉히 준다. node:test는 제한이 없다. */
function it(name, body) {
  return process.env.VITEST ? test(name, body, 180_000) : test(name, body);
}

async function importTs(relative) {
  if (process.env.VITEST) {
    if (relative === "./verify-character-kit.mjs") return import("./verify-character-kit.mjs");
    if (relative === "../apps/character-lab/src/contracts/index.ts") return import("../apps/character-lab/src/contracts/index.ts");
    return import("../apps/character-lab/src/domains/authored/kit-capability.ts");
  }
  const { tsImport } = await import("tsx/esm/api");
  return tsImport(relative, import.meta.url);
}

const verifier = await importTs("./verify-character-kit.mjs");
const contracts = await importTs("../apps/character-lab/src/contracts/index.ts");
const { deriveKitCapabilities } = await importTs("../apps/character-lab/src/domains/authored/kit-capability.ts");

const {
  ALL_AVAILABLE_CAPABILITIES,
  ALL_FACS_MORPH_NAMES,
  DEFAULT_RECIPE_COLORS,
  FACE_PARAM_KEYS,
  KIT_BONE_MAP,
  KIT_BUDGET,
  KIT_DEFAULT_ID,
  KIT_DEFAULT_SLOTS,
  KIT_END_BONES,
  KIT_HIDEABLE_REGION_IDS,
  KIT_MORPH_COVERAGE,
  KIT_PART_SLOTS,
  KIT_REGION_IDS,
  KIT_REQUIRED_JOINT_OFFSET_MORPHS,
  KIT_REQUIRED_PRESETS,
  KIT_ROLE_TINT_RULES,
  KIT_SCHEMA_ID,
  KIT_SKELETON_JOINTS,
  KIT_SKELETON_PARENTS,
  SLOT_PRESET_IDS,
  parseKitManifest,
} = contracts;
const {
  CHECKS,
  IRIS_RECOLOR_MIN_MEAN_LUMINANCE,
  RECOLOR_MIN_MEAN_LUMINANCE,
  createMemorySource,
  decodeImageInfo,
  parseCliArgs,
  parseGlbContainer,
  runCli,
  verifyJointOffsets,
  verifyKit,
  verifyMorphFollow,
  verifyMorphSeam,
  verifyUvOverlap,
} = verifier;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// ---------------------------------------------------------------- 이미지 인코더(테스트 전용)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data)])), 8 + data.length);
  return out;
}

/** 필터 유형을 지정해 PNG를 만든다. `pixel(x, y)`는 채널 값 배열(8비트 또는 16비트 정수)을 돌려준다. */
function makePng({ width, height, colorType, depth = 8, pixel, palette = null, transparency = null, filter = 0 }) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const bitsPerPixel = channels * depth;
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(rowBytes);
    for (let x = 0; x < width; x += 1) {
      const values = pixel(x, y);
      for (let c = 0; c < channels; c += 1) {
        const index = x * channels + c;
        if (depth === 16) row.writeUInt16BE(values[c], index * 2);
        else if (depth === 8) row[index] = values[c];
        else {
          const bit = index * depth;
          row[bit >> 3] |= values[c] << (8 - depth - (bit & 7));
        }
      }
    }
    rows.push(row);
  }
  const filtered = rows.map((row, y) => {
    const prev = y > 0 ? rows[y - 1] : Buffer.alloc(rowBytes);
    const out = Buffer.alloc(rowBytes + 1);
    out[0] = filter;
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prev[x];
      const upLeft = x >= bpp ? prev[x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[x + 1] = (row[x] - predictor) & 255;
    }
    return out;
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = depth;
  header[9] = colorType;
  const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", header)];
  if (palette !== null) chunks.push(pngChunk("PLTE", Buffer.from(palette.flat())));
  if (transparency !== null) chunks.push(pngChunk("tRNS", Buffer.from(transparency)));
  chunks.push(pngChunk("IDAT", deflateSync(Buffer.concat(filtered))), pngChunk("IEND", Buffer.alloc(0)));
  return new Uint8Array(Buffer.concat(chunks));
}

/** 균일 회색 RGB PNG(알파 없음) */
function grayRgbPng(luma, size = 64) {
  const v = Math.round(luma * 255);
  return makePng({ width: size, height: size, colorType: 2, pixel: () => [v, v, v] });
}

/** 균일 회색 RGBA PNG */
function grayRgbaPng(luma, alpha = 0.6, size = 64) {
  const v = Math.round(luma * 255);
  return makePng({ width: size, height: size, colorType: 6, pixel: () => [v, v, v, Math.round(alpha * 255)] });
}

class BitWriter {
  constructor() {
    this.bytes = [];
    this.current = 0;
    this.used = 0;
  }

  write(value, count) {
    for (let i = count - 1; i >= 0; i -= 1) {
      this.current = (this.current << 1) | ((value >> i) & 1);
      this.used += 1;
      if (this.used === 8) this.flushByte();
    }
  }

  flushByte() {
    this.bytes.push(this.current);
    if (this.current === 0xff) this.bytes.push(0x00);
    this.current = 0;
    this.used = 0;
  }

  pad() {
    while (this.used !== 0) this.write(1, 1);
  }
}

/**
 * 블록 단위로 균일한 베이스라인 JPEG(허프만 표준 아님: DC 4비트 고정 길이 코드, AC는 EOB 한 비트).
 * `lumaOf(bx, by)`는 Y 블록 좌표의 0..255 값. 성분이 3개면 Cb/Cr은 중립(128)이다.
 */
function makeJpeg({ width, height, components = 1, sampling = [[1, 1], [1, 1], [1, 1]], lumaOf, restartInterval = 0, progressive = false }) {
  const out = [0xff, 0xd8];
  const segment = (marker, payload) => out.push(0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload);
  segment(0xdb, [0x00, ...new Array(64).fill(1)]);
  const frame = [8, height >> 8, height & 255, width >> 8, width & 255, components];
  for (let c = 0; c < components; c += 1) frame.push(c + 1, (sampling[c][0] << 4) | sampling[c][1], 0);
  segment(progressive ? 0xc2 : 0xc0, frame);
  segment(0xc4, [0x00, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...Array.from({ length: 12 }, (_, i) => i)]);
  segment(0xc4, [0x10, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x00]);
  if (restartInterval > 0) segment(0xdd, [restartInterval >> 8, restartInterval & 255]);
  const scan = [components];
  for (let c = 0; c < components; c += 1) scan.push(c + 1, 0x00);
  scan.push(0, 63, 0);
  segment(0xda, scan);

  const writer = new BitWriter();
  const hMax = Math.max(...sampling.slice(0, components).map((s) => s[0]));
  const vMax = Math.max(...sampling.slice(0, components).map((s) => s[1]));
  const predictors = new Array(components).fill(0);
  const encodeBlock = (component, luma) => {
    const dc = component === 0 ? (luma - 128) * 8 : 0;
    const diff = dc - predictors[component];
    predictors[component] = dc;
    const magnitude = Math.abs(diff);
    const size = magnitude === 0 ? 0 : Math.floor(Math.log2(magnitude)) + 1;
    writer.write(size, 4);
    if (size > 0) writer.write(diff >= 0 ? diff : diff + (1 << size) - 1, size);
    writer.write(0, 1);
  };
  const mcusX = components === 1 ? Math.ceil(width / 8) : Math.ceil(width / (8 * hMax));
  const mcusY = components === 1 ? Math.ceil(height / 8) : Math.ceil(height / (8 * vMax));
  const total = mcusX * mcusY;
  let restartIndex = 0;
  for (let m = 0; m < total; m += 1) {
    if (restartInterval > 0 && m > 0 && m % restartInterval === 0) {
      writer.pad();
      out.push(...writer.bytes, 0xff, 0xd0 + (restartIndex & 7));
      writer.bytes = [];
      restartIndex += 1;
      predictors.fill(0);
    }
    const mx = m % mcusX;
    const my = Math.floor(m / mcusX);
    if (components === 1) {
      encodeBlock(0, lumaOf(mx, my));
      continue;
    }
    for (let c = 0; c < components; c += 1) {
      for (let v = 0; v < sampling[c][1]; v += 1) {
        for (let h = 0; h < sampling[c][0]; h += 1) encodeBlock(c, lumaOf(mx * sampling[c][0] + h, my * sampling[c][1] + v));
      }
    }
  }
  writer.pad();
  out.push(...writer.bytes, 0xff, 0xd9);
  return new Uint8Array(out);
}

function grayJpeg(luma, size = 64) {
  return makeJpeg({ width: size, height: size, lumaOf: () => Math.round(luma * 255) });
}

// ---------------------------------------------------------------- 합성 키트 생성

/** 관절의 부모 기준 로컬 이동(회전은 모두 항등) */
function localTranslation(name) {
  const bare = name.replace("mixamorig:", "");
  const fixed = {
    Hips: [0, 0.95, 0],
    Spine: [0, 0.1, 0],
    Spine1: [0, 0.12, 0],
    Spine2: [0, 0.12, 0],
    Neck: [0, 0.1, 0],
    Head: [0, 0.08, 0.01],
    HeadTop_End: [0, 0.2, 0],
    TS_Jaw: [0, -0.04, 0.05],
    "TS_Eye.L": [0.032, 0.07, 0.09],
    "TS_Eye.R": [-0.032, 0.07, 0.09],
  };
  if (fixed[bare] !== undefined) return fixed[bare];
  const side = bare.startsWith("Left") ? 1 : -1;
  const rest = bare.replace(/^(Left|Right)/u, "");
  const arm = { Shoulder: [0.03, 0.08, 0], Arm: [0.12, 0, 0], ForeArm: [0.28, 0, 0], Hand: [0.26, 0, 0] };
  if (arm[rest] !== undefined) return [side * arm[rest][0], arm[rest][1], arm[rest][2]];
  const leg = { UpLeg: [0.09, -0.05, 0], Leg: [0, -0.43, 0], Foot: [0, -0.42, 0], ToeBase: [0, -0.04, 0.12], Toe_End: [0, -0.01, 0.07] };
  if (leg[rest] !== undefined) return [side * leg[rest][0], leg[rest][1], leg[rest][2]];
  const finger = /^Hand(Thumb|Index|Middle|Ring|Pinky)([1-4])$/u.exec(rest);
  if (finger !== null) {
    const first = { Thumb: [0.03, -0.01, 0.03], Index: [0.09, 0, 0.02], Middle: [0.095, 0, 0], Ring: [0.09, 0, -0.015], Pinky: [0.08, 0, -0.03] }[finger[1]];
    const v = finger[2] === "1" ? first : [0.03, 0, 0];
    return [side * v[0], v[1], v[2]];
  }
  throw new Error(`로컬 이동을 모르는 joint: ${name}`);
}

const JOINT_WORLD = (() => {
  const world = new Map();
  for (const name of KIT_SKELETON_JOINTS) {
    const parent = KIT_SKELETON_PARENTS[name];
    const base = parent === null ? [0, 0, 0] : world.get(parent);
    const local = localTranslation(name);
    world.set(name, [base[0] + local[0], base[1] + local[1], base[2] + local[2]]);
  }
  return world;
})();

const BODY_SCALE = {
  height: [0.02, 0.08, 0.02],
  shoulderWidth: [0.1, 0, 0],
  chestDepth: [0, 0, 0.08],
  waist: [0.06, 0, 0.06],
  hip: [0.08, 0, 0.04],
  armLength: [0.08, 0, 0],
  legLength: [0, 0.08, 0],
  headSize: [0.04, 0.05, 0.04],
  neckLength: [0, 0.06, 0],
};

/** morph 이름과 정점 위치로 정해지는 결정적 델타(체형은 위치에 선형, 얼굴·표정은 상수) */
function deltaOf(name, p) {
  const param = /^param:([A-Za-z]+):([+-])$/u.exec(name);
  if (param !== null) {
    const sign = param[2] === "+" ? 1 : -1;
    const scale = BODY_SCALE[param[1]];
    if (scale !== undefined) return [sign * scale[0] * p[0], sign * scale[1] * p[1], sign * scale[2] * p[2]];
    const i = FACE_PARAM_KEYS.indexOf(param[1]);
    const amplitude = 0.003 + 0.0004 * i;
    return [sign * amplitude * Math.cos(i), sign * amplitude * Math.sin(i), sign * amplitude * 0.5];
  }
  const f = ALL_FACS_MORPH_NAMES.indexOf(name);
  const amplitude = 0.004 + 0.0003 * f;
  return [amplitude * Math.sin(f + 1), amplitude * Math.cos(f + 1), amplitude * 0.25];
}

const JOINT_INDEX = new Map(KIT_SKELETON_JOINTS.map((name, index) => [name, index]));

const REGION_JOINT = {
  neck: "mixamorig:Neck",
  torso: "mixamorig:Spine1",
  pelvis: "mixamorig:Hips",
  "upperArm.L": "mixamorig:LeftArm",
  "upperArm.R": "mixamorig:RightArm",
  "forearm.L": "mixamorig:LeftForeArm",
  "forearm.R": "mixamorig:RightForeArm",
  "hand.L": "mixamorig:LeftHand",
  "hand.R": "mixamorig:RightHand",
  "thigh.L": "mixamorig:LeftUpLeg",
  "thigh.R": "mixamorig:RightUpLeg",
  "calf.L": "mixamorig:LeftLeg",
  "calf.R": "mixamorig:RightLeg",
  "foot.L": "mixamorig:LeftFoot",
  "foot.R": "mixamorig:RightFoot",
};

class MeshBuilder {
  constructor() {
    this.positions = [];
    this.joints = [];
    this.regions = [];
    this.uvs = [];
    this.indices = [];
  }

  get vertexCount() {
    return this.positions.length;
  }

  get triangleCount() {
    return this.indices.length / 3;
  }

  addVertex(position, jointName, uv, region = 0) {
    this.positions.push(position);
    this.joints.push(JOINT_INDEX.get(jointName));
    this.uvs.push(uv);
    this.regions.push(region);
    return this.positions.length - 1;
  }

  addTriangle(a, b, c) {
    this.indices.push(a, b, c);
  }

  /** 네 모서리 A,B,C,D → 삼각형 ABC, ACD. UV는 8×8 격자의 `cell`번 칸 안(겹침 없음) */
  addQuad(corners, jointName, cell, region = 0) {
    const cx = cell % 8;
    const cy = Math.floor(cell / 8);
    const uv = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
    const ids = corners.map((corner, k) => this.addVertex(corner, jointName, [(cx + uv[k][0]) / 8, (cy + uv[k][1]) / 8], region));
    this.addTriangle(ids[0], ids[1], ids[2]);
    this.addTriangle(ids[0], ids[2], ids[3]);
    return ids;
  }

  /** 모든 정점을 (dx,dy,dz)만큼 옮긴 새 빌더 */
  clone(offset = [0, 0, 0]) {
    const copy = new MeshBuilder();
    copy.positions = this.positions.map((p) => [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]]);
    copy.joints = [...this.joints];
    copy.regions = [...this.regions];
    copy.uvs = this.uvs.map((uv) => [...uv]);
    copy.indices = [...this.indices];
    return copy;
  }
}

function regionCorners(regionId) {
  const head = JOINT_WORLD.get(REGION_JOINT[regionId]);
  const corners = [
    [head[0] - 0.004, head[1] - 0.004, head[2] + 0.002],
    [head[0] + 0.004, head[1] - 0.004, head[2] + 0.002],
    [head[0] + 0.004, head[1] + 0.004, head[2] + 0.002],
    [head[0] - 0.004, head[1] + 0.004, head[2] + 0.002],
  ];
  if (regionId.startsWith("foot")) corners[3] = [head[0] - 0.004, 0, head[2] + 0.1];
  return corners;
}

function bodyBuilder() {
  const builder = new MeshBuilder();
  KIT_HIDEABLE_REGION_IDS.forEach((id, index) => builder.addQuad(regionCorners(id), REGION_JOINT[id], index, KIT_REGION_IDS.indexOf(id)));
  return builder;
}

function headBuilder() {
  const builder = new MeshBuilder();
  const head = JOINT_WORLD.get("mixamorig:Head");
  builder.addQuad(
    [[head[0] - 0.004, head[1] - 0.004, head[2] + 0.002], [head[0] + 0.004, head[1] - 0.004, head[2] + 0.002], [head[0] + 0.004, head[1] + 0.004, head[2] + 0.002], [head[0] - 0.004, head[1] + 0.004, head[2] + 0.002]],
    "mixamorig:Head",
    0,
    0,
  );
  // 목 이음매: 몸 neck 영역 모서리 A,B,C와 같은 위치
  const neck = regionCorners("neck");
  const cell = 1;
  const seam = neck.slice(0, 3).map((corner, k) => builder.addVertex(corner, "mixamorig:Neck", [(cell + [0.1, 0.9, 0.9][k]) / 8, (0 + [0.1, 0.1, 0.9][k]) / 8], 1));
  builder.addTriangle(seam[0], seam[1], seam[2]);
  const crown = [[-0.04, 1.6, 0.01], [0.04, 1.6, 0.01], [0, 1.64, 0.01]];
  const ids = crown.map((corner, k) => builder.addVertex(corner, "mixamorig:Head", [(2 + [0.1, 0.9, 0.5][k]) / 8, [0.1, 0.1, 0.9][k] / 8], 0));
  builder.addTriangle(ids[0], ids[1], ids[2]);
  builder.addQuad([[-0.05, 1.53, 0.1], [0.05, 1.53, 0.1], [0.05, 1.56, 0.1], [-0.05, 1.56, 0.1]], "mixamorig:Head", 3, 0);
  return builder;
}

function faceQuadCopy(offset, size = 1) {
  const full = headBuilder();
  const copy = new MeshBuilder();
  const start = full.vertexCount - 4;
  const ids = [];
  for (let i = 0; i < 4; i += 1) {
    const p = full.positions[start + i];
    ids.push(copy.addVertex([p[0] * size + offset[0], p[1] + offset[1], p[2] + offset[2]], "mixamorig:Head", full.uvs[start + i], 0));
  }
  copy.addTriangle(ids[0], ids[1], ids[2]);
  copy.addTriangle(ids[0], ids[2], ids[3]);
  return copy;
}

function eyeQuad(side, radius, depth) {
  const joint = side === "L" ? "TS_Eye.L" : "TS_Eye.R";
  const center = JOINT_WORLD.get(joint);
  const builder = new MeshBuilder();
  builder.addQuad(
    [[center[0] - radius, center[1] - radius, center[2] + depth], [center[0] + radius, center[1] - radius, center[2] + depth], [center[0] + radius, center[1] + radius, center[2] + depth], [center[0] - radius, center[1] + radius, center[2] + depth]],
    joint,
    side === "L" ? 0 : 1,
    0,
  );
  return builder;
}

function shellBuilder(regionIds, offset) {
  const builder = new MeshBuilder();
  regionIds.forEach((id, index) => builder.addQuad(regionCorners(id).map((p) => [p[0], p[1], p[2] + offset]), REGION_JOINT[id], index, 0));
  return builder;
}

function hairBuilder(triangles) {
  const builder = new MeshBuilder();
  const ring = [[0, 1.66, 0.02], [0.08, 1.62, 0.02], [0.09, 1.56, 0.02], [-0.09, 1.56, 0.02], [-0.08, 1.62, 0.02]];
  const ids = ring.map((p) => builder.addVertex(p, "mixamorig:Head", [0.5 + p[0] * 2, (p[1] - 1.5) * 4], 0));
  const fan = [[0, 1, 2], [0, 2, 3], [0, 3, 4]];
  for (const [a, b, c] of fan.slice(0, triangles)) builder.addTriangle(ids[a], ids[b], ids[c]);
  return builder;
}

function uniqueMorphs(roles) {
  const names = [];
  for (const role of roles) for (const name of KIT_MORPH_COVERAGE[role]) if (!names.includes(name)) names.push(name);
  return names;
}

function weightsOf(builder) {
  const weights = new Float32Array(builder.vertexCount * 4);
  for (let v = 0; v < builder.vertexCount; v += 1) weights[v * 4] = 1;
  return weights;
}

function jointsOf(builder) {
  const joints = new Uint8Array(builder.vertexCount * 4);
  for (let v = 0; v < builder.vertexCount; v += 1) joints[v * 4] = builder.joints[v];
  return joints;
}

/** 재질 사양: 이름 → 역할과 텍스처 */
function materialSpecFor(name, role) {
  const rule = KIT_ROLE_TINT_RULES[role];
  const recolor = rule !== undefined && rule.mode === "recolor";
  const alpha = role === "lash" || role === "brow";
  let luma = 0.92;
  if (role === "iris") luma = 0.62;
  return {
    name,
    role,
    alpha,
    luma,
    tint: recolor ? { mode: "recolor", colorKey: rule.colorKey } : { mode: "fixed", hex: "#f4f4f6" },
  };
}

function imageBytesFor(spec) {
  return spec.alpha ? grayRgbaPng(spec.luma) : grayJpeg(spec.luma);
}

/**
 * 메시 사양 → 선언(kit.json meshes[]) 하나.
 * `prims[i]` = { builder, role, material }, 모든 프리미티브가 같은 morph 이름 목록을 공유한다.
 */
function declarationOf(spec) {
  const roles = spec.prims.map((prim) => prim.role);
  const materials = spec.prims.map((prim) => prim.material);
  const declaration = {
    node: spec.node,
    triangles: spec.prims.reduce((sum, prim) => sum + prim.builder.triangleCount, 0),
    vertices: spec.prims.reduce((sum, prim) => sum + prim.builder.vertexCount, 0),
    skinned: true,
    morphs: spec.morphs,
  };
  if (spec.prims.length === 1) return { ...declaration, role: roles[0], material: materials[0] };
  return { ...declaration, primitiveRoles: roles, primitiveMaterials: materials };
}

function baseMeshSpecs() {
  const specs = [];
  const body = bodyBuilder();
  const head = headBuilder();
  specs.push({ node: "TS_Body", prims: [{ builder: body, role: "skin", material: "ts_skin_body" }], morphs: uniqueMorphs(["skin"]), regions: true });
  specs.push({ node: "TS_Head", prims: [{ builder: head, role: "head", material: "ts_skin_head" }], morphs: uniqueMorphs(["head"]), regions: true });
  specs.push({ node: "TS_Eye_L", prims: [{ builder: eyeQuad("L", 0.012, 0), role: "eyeball", material: "ts_eye" }], morphs: uniqueMorphs(["eyeball"]) });
  specs.push({ node: "TS_Eye_R", prims: [{ builder: eyeQuad("R", 0.012, 0), role: "eyeball", material: "ts_eye" }], morphs: uniqueMorphs(["eyeball"]) });
  const jaw = JOINT_WORLD.get("TS_Jaw");
  const mouthQuad = (dy) => {
    const builder = new MeshBuilder();
    builder.addQuad([[-0.02, jaw[1] + dy, jaw[2]], [0.02, jaw[1] + dy, jaw[2]], [0.02, jaw[1] + dy + 0.008, jaw[2]], [-0.02, jaw[1] + dy + 0.008, jaw[2]]], "TS_Jaw", 0, 0);
    return builder;
  };
  specs.push({
    node: "TS_Mouth",
    prims: [
      { builder: mouthQuad(0), role: "teeth", material: "ts_teeth" },
      { builder: mouthQuad(-0.02), role: "tongue", material: "ts_tongue" },
    ],
    morphs: uniqueMorphs(["teeth", "tongue"]),
  });
  specs.push({ node: "TS_Lashes", prims: [{ builder: faceQuadCopy([0, 0, 0.001]), role: "lash", material: "ts_lashes" }], morphs: uniqueMorphs(["lash"]) });
  specs.push({ node: "TS_Brow_L", prims: [{ builder: faceQuadCopy([0, 0, 0.001]), role: "brow", material: "ts_brow" }], morphs: uniqueMorphs(["brow"]) });
  specs.push({ node: "TS_Brow_R", prims: [{ builder: faceQuadCopy([0, 0, 0.001]), role: "brow", material: "ts_brow" }], morphs: uniqueMorphs(["brow"]) });
  specs.push({ node: "TS_Underwear", prims: [{ builder: shellBuilder(["torso", "pelvis"], 0.003), role: "underwear", material: "ts_underwear" }], morphs: uniqueMorphs(["underwear"]) });
  return specs;
}

const PART_HIDES = {
  top: ["torso", "upperArm.L", "upperArm.R"],
  bottom: ["pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R"],
  shoes: ["foot.L", "foot.R"],
};

function partMeshSpecs(slot, name) {
  if (slot === "hair") {
    return [3, 2, 1].map((triangles, lod) => ({
      node: `TS_AuthoredHair_${name}_LOD${lod}`,
      lod,
      prims: [{ builder: hairBuilder(triangles), role: "hair", material: `ts_hair_${name}` }],
      morphs: uniqueMorphs(["hair"]),
    }));
  }
  if (slot === "irises") {
    const specs = [];
    for (const side of ["L", "R"]) specs.push({ node: `TS_Iris_${side}`, prims: [{ builder: eyeQuad(side, 0.008, 0.002), role: "iris", material: "ts_iris" }], morphs: uniqueMorphs(["iris"]) });
    for (const side of ["L", "R"]) specs.push({ node: `TS_Highlight_${side}`, prims: [{ builder: eyeQuad(side, 0.002, 0.003), role: "eye-highlight", material: "ts_highlight" }], morphs: uniqueMorphs(["eye-highlight"]) });
    return specs;
  }
  const prefix = { top: "TS_Top", bottom: "TS_Bottom", shoes: "TS_Shoes", accessory: "TS_Accessory" }[slot];
  const builder = slot === "accessory" ? faceQuadCopy([0, 0, 0.002]) : shellBuilder(PART_HIDES[slot], 0.004);
  return [{ node: `${prefix}_${name}`, prims: [{ builder, role: slot, material: `ts_${slot}_${name}` }], morphs: uniqueMorphs([slot]) }];
}

/** 메시 사양 목록 → GLB 바이트(합성). 재질은 이름으로 공유한다. */
async function writeGlb(meshSpecs) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const armature = doc.createNode("Armature");
  scene.addChild(armature);
  const nodes = new Map();
  for (const name of KIT_SKELETON_JOINTS) {
    const parent = KIT_SKELETON_PARENTS[name];
    const node = doc.createNode(name).setTranslation(localTranslation(name));
    (parent === null ? armature : nodes.get(parent)).addChild(node);
    nodes.set(name, node);
  }
  const skin = doc.createSkin("Armature").setSkeleton(nodes.get("mixamorig:Hips"));
  const inverse = new Float32Array(KIT_SKELETON_JOINTS.length * 16);
  KIT_SKELETON_JOINTS.forEach((name, index) => {
    skin.addJoint(nodes.get(name));
    const world = JOINT_WORLD.get(name);
    inverse.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -world[0], -world[1], -world[2], 1], index * 16);
  });
  skin.setInverseBindMatrices(doc.createAccessor().setType("MAT4").setArray(inverse).setBuffer(buffer));

  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const materials = new Map();
  const materialOf = (name, role) => {
    if (materials.has(name)) return materials.get(name);
    const spec = materialSpecFor(name, role);
    const material = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setDoubleSided(false);
    const texture = doc.createTexture(name).setImage(imageBytesFor(spec)).setMimeType(spec.alpha ? "image/png" : "image/jpeg");
    material.setBaseColorTexture(texture);
    if (spec.alpha) material.setAlphaMode("BLEND");
    materials.set(name, material);
    return material;
  };
  for (const spec of meshSpecs) {
    const mesh = doc.createMesh(spec.node);
    mesh.setExtras({ targetNames: [...spec.morphs] });
    for (const { builder, role, material } of spec.prims) {
      const count = builder.vertexCount;
      const positions = new Float32Array(count * 3);
      builder.positions.forEach((p, v) => positions.set(p, v * 3));
      const normals = new Float32Array(count * 3);
      for (let v = 0; v < count; v += 1) normals[v * 3 + 2] = 1;
      const uvs = new Float32Array(count * 2);
      builder.uvs.forEach((uv, v) => uvs.set(uv, v * 2));
      const primitive = doc
        .createPrimitive()
        .setAttribute("POSITION", accessor("VEC3", positions))
        .setAttribute("NORMAL", accessor("VEC3", normals))
        .setAttribute("TEXCOORD_0", accessor("VEC2", uvs))
        .setAttribute("JOINTS_0", accessor("VEC4", jointsOf(builder)))
        .setAttribute("WEIGHTS_0", accessor("VEC4", weightsOf(builder)))
        .setIndices(accessor("SCALAR", Uint16Array.from(builder.indices)))
        .setMaterial(materialOf(material, role));
      if (spec.regions === true) primitive.setAttribute("_REGION", accessor("SCALAR", Uint8Array.from(builder.regions)));
      for (const name of spec.morphs) {
        const delta = new Float32Array(count * 3);
        builder.positions.forEach((p, v) => delta.set(deltaOf(name, p), v * 3));
        primitive.addTarget(doc.createPrimitiveTarget(name).setAttribute("POSITION", accessor("VEC3", delta)));
      }
      mesh.addPrimitive(primitive);
    }
    scene.addChild(doc.createNode(spec.node).setMesh(mesh).setSkin(skin));
  }
  return io.writeBinary(doc);
}

function fileEntry(relativePath, bytes) {
  return { path: relativePath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function boundsOf(meshSpecs) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const spec of meshSpecs) for (const { builder } of spec.prims) for (const p of builder.positions) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], p[axis]);
      max[axis] = Math.max(max[axis], p[axis]);
    }
  }
  return { min, max };
}

function jointOffsetTable() {
  const table = {};
  for (const morph of KIT_REQUIRED_JOINT_OFFSET_MORPHS) {
    const entry = {};
    for (const name of KIT_SKELETON_JOINTS) {
      const delta = deltaOf(morph, localTranslation(name));
      if (Math.hypot(...delta) > 1e-9) entry[name] = delta;
    }
    table[morph] = entry;
  }
  return table;
}

let pristineKit = null;

/** 합성 키트를 한 번만 만들고 테스트마다 복제해 쓴다. */
async function buildPristineKit() {
  const files = new Map();
  const baseSpecs = baseMeshSpecs();
  const baseBytes = await writeGlb(baseSpecs);
  files.set("bases/female.glb", baseBytes);
  files.set("bases/male.glb", baseBytes);
  const bounds = boundsOf(baseSpecs);
  const materials = {};
  const addMaterials = (specs) => {
    for (const spec of specs) {
      spec.prims.forEach(({ role, material }) => {
        const info = materialSpecFor(material, role);
        materials[material] = { role, tint: info.tint, doubleSided: false };
      });
    }
  };
  addMaterials(baseSpecs);
  const baseEntry = (baseId) => ({
    file: fileEntry(`bases/${baseId}.glb`, baseBytes),
    heightM: 1.64,
    boundsM: { min: bounds.min.map((v) => Number(v.toFixed(4))), max: bounds.max.map((v) => Number(v.toFixed(4))) },
    meshes: baseSpecs.map(declarationOf),
    bodyRegions: KIT_HIDEABLE_REGION_IDS.map((id, index) => ({ id, mesh: "TS_Body", indexStart: index * 6, indexCount: 6 })),
  });

  const parts = [];
  for (const slot of KIT_PART_SLOTS) {
    for (const name of SLOT_PRESET_IDS[slot]) {
      const id = `${slot}/${name}`;
      if (!KIT_REQUIRED_PRESETS.includes(id)) {
        parts.push({ id, slot, variants: {}, unavailable: { female: "여성 핏 미제작", male: "남성 핏 미제작" } });
        continue;
      }
      const specs = partMeshSpecs(slot, name);
      addMaterials(specs);
      const bytes = await writeGlb(specs);
      const relative = `parts/${slot}/${name}.glb`;
      files.set(relative, bytes);
      const variant = { file: fileEntry(relative, bytes), meshes: specs.map((spec) => ({ ...declarationOf(spec), ...(spec.lod === undefined ? {} : { lod: spec.lod }) })), hides: PART_HIDES[slot] ?? [] };
      parts.push({ id, slot, variants: { female: variant, male: variant }, unavailable: {} });
    }
  }

  const raw = {
    schema: KIT_SCHEMA_ID,
    kitId: KIT_DEFAULT_ID,
    kitVersion: 1,
    displayName: "합성 테스트 키트",
    generatedAt: "2026-10-08",
    generator: { tool: "tools/blender/character_kit", blender: "5.2.1", command: ["--stage", "export-kit"] },
    coordinateSystem: { up: "+Y", forward: "+Z", unit: "m", handedness: "right", rest: "T-pose", rootScale: 1 },
    provenance: {
      sources: [
        {
          id: "hbm-1.4.1",
          name: "Blender Foundation Human Base Meshes Bundle",
          version: "1.4.1",
          url: "https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip",
          zipSha256: "811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515",
          license: "CC0-1.0",
          derivative: true,
          changesKo: "멀티레스 레벨 1 적용, 목에서 몸/머리 분할, T-포즈 변환, 리깅.",
        },
        { id: "toonstudio-original", name: "ToonStudio 원본 디자인", license: "original", derivative: false, changesKo: "절차 생성한 원본 디자인." },
      ],
      noticeFile: "NOTICE.md",
      summaryKo: "Blender Foundation Human Base Meshes Bundle v1.4.1(CC0) 파생물과 원본 디자인.",
    },
    skeleton: { root: "Armature", joints: [...KIT_SKELETON_JOINTS], parents: { ...KIT_SKELETON_PARENTS }, boneMap: { ...KIT_BONE_MAP }, endBones: [...KIT_END_BONES] },
    materials,
    jointOffsets: jointOffsetTable(),
    bases: { female: baseEntry("female"), male: baseEntry("male") },
    parts,
    defaults: { base: "female", slots: { ...KIT_DEFAULT_SLOTS }, colors: { ...DEFAULT_RECIPE_COLORS } },
    slotCapabilities: { female: ALL_AVAILABLE_CAPABILITIES, male: ALL_AVAILABLE_CAPABILITIES },
    physics: { mode: "static", chains: [], colliders: [] },
    budgets: JSON.parse(JSON.stringify(KIT_BUDGET)),
  };
  const parsed = parseKitManifest(raw);
  if (!parsed.ok) throw new Error(`합성 kit.json이 계약 스키마를 통과하지 못했습니다: ${parsed.failure.reasonKo}`);
  raw.slotCapabilities = {
    female: JSON.parse(JSON.stringify(deriveKitCapabilities(parsed.manifest, "female"))),
    male: JSON.parse(JSON.stringify(deriveKitCapabilities(parsed.manifest, "male"))),
  };
  files.set("NOTICE.md", "# 출처\n\nBlender Foundation Human Base Meshes Bundle v1.4.1(CC0)을 가공한 파생물입니다.\n");
  return { files, manifest: raw };
}

async function newKit() {
  pristineKit ??= await buildPristineKit();
  return { files: new Map(pristineKit.files), manifest: structuredClone(pristineKit.manifest) };
}

async function runVerify(kit, options = {}) {
  const files = new Map(kit.files);
  files.set("kit.json", JSON.stringify(kit.manifest));
  return verifyKit({ source: createMemorySource(files), ...options });
}

function updateManifestFile(manifest, relativePath, bytes) {
  const entry = fileEntry(relativePath, bytes);
  const patch = (file) => {
    if (file.path === relativePath) Object.assign(file, entry);
  };
  for (const base of Object.values(manifest.bases)) patch(base.file);
  for (const part of manifest.parts) for (const variant of Object.values(part.variants)) patch(variant.file);
}

/** GLB 하나를 읽어 문서를 고친 뒤 다시 쓰고 manifest의 bytes/sha256을 맞춘다. */
async function tweakGlb(kit, relativePath, mutate) {
  const doc = await io.readBinary(kit.files.get(relativePath));
  await mutate(doc);
  const bytes = await io.writeBinary(doc);
  kit.files.set(relativePath, bytes);
  updateManifestFile(kit.manifest, relativePath, bytes);
  return doc;
}

/** GLB의 JSON 청크만 고쳐 쓴다(gltf-transform이 쓰지 못하는 비정상 입력용). */
function patchGlbJson(bytes, mutate) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(Buffer.from(bytes.subarray(20, 20 + jsonLength)).toString("utf8"));
  mutate(json);
  let text = Buffer.from(JSON.stringify(json), "utf8");
  const padding = (4 - (text.length % 4)) % 4;
  text = Buffer.concat([text, Buffer.alloc(padding, 0x20)]);
  const rest = Buffer.from(bytes.subarray(20 + jsonLength));
  const header = Buffer.alloc(20);
  header.writeUInt32BE(0x676c5446, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + text.length + rest.length, 8);
  header.writeUInt32LE(text.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return new Uint8Array(Buffer.concat([header, text, rest]));
}

function setFile(kit, relativePath, bytes) {
  kit.files.set(relativePath, bytes);
  updateManifestFile(kit.manifest, relativePath, bytes);
}

function meshNodeOf(doc, name) {
  const node = doc.getRoot().listNodes().find((candidate) => candidate.getName() === name && candidate.getMesh() !== null);
  assert.ok(node, `${name} 메시 노드를 찾지 못했습니다.`);
  return node;
}

function primOf(doc, name, index = 0) {
  return meshNodeOf(doc, name).getMesh().listPrimitives()[index];
}

function errorsOf(result, id) {
  return result.findings.filter((finding) => finding.id === id && finding.level === "error");
}

function warningsOf(result, id) {
  return result.findings.filter((finding) => finding.id === id && finding.level === "warning");
}

function assertError(result, id, fragment) {
  const found = errorsOf(result, id).some((finding) => finding.message.includes(fragment));
  assert.ok(found, `${id} 오류에 '${fragment}'가 없습니다.\n실제: ${JSON.stringify(result.findings.filter((f) => f.id === id), null, 1)}`);
}

function assertNoFindings(result, ids) {
  const found = result.findings.filter((finding) => ids.includes(finding.id));
  assert.deepEqual(found, [], `예상치 못한 검증 결과:\n${JSON.stringify(found, null, 1)}`);
}

// ---------------------------------------------------------------- 통과 케이스

it("합성 키트는 V1~V20을 모두 실행하고 오류·경고 없이 통과한다", async () => {
  const kit = await newKit();
  const result = await runVerify(kit);
  assertNoFindings(result, CHECKS.map((check) => check.id));
  assert.equal(result.ok, true);
  assert.equal(result.errors, 0);
  assert.deepEqual(Object.keys(result.checks), CHECKS.map((check) => check.id));
  for (const [id, check] of Object.entries(result.checks)) assert.equal(check.status, "pass", `${id}가 통과 상태가 아닙니다(${check.status}).`);
  // 수치 보고: 파일·텍스처·최악 활성 삼각형·UV 겹침·따라가기·관절 오프셋
  assert.ok(Array.isArray(result.metrics.files) && result.metrics.files.length === 7, "고유 파일 7개(베이스 2 + 파츠 5)");
  assert.equal(result.metrics["bases/female.glb:TS_Body#undefined.uvOverlap"], undefined);
  assert.ok(result.metrics.textures.length > 0);
  const body = result.metrics.meshes.find((mesh) => mesh.file === "bases/female.glb" && mesh.node === "TS_Body");
  assert.deepEqual([body.triangles, body.vertices, body.morphTargets], [30, 60, 18]);
  const worst = result.metrics.worstCase.female;
  const base = kit.manifest.bases.female;
  const baseTriangles = base.meshes.reduce((sum, mesh) => sum + mesh.triangles, 0);
  assert.equal(worst.baseTriangles, baseTriangles);
  const slotSum = Object.values(worst.picks).reduce((sum, pick) => sum + pick.triangles, 0);
  assert.equal(worst.totalTriangles, baseTriangles + slotSum);
  assert.equal(worst.picks.hair.id, "hair/soft-bob");
  assert.equal(worst.picks.hair.triangles, 3, "헤어는 LOD0 삼각형만 센다");
  assert.equal(worst.picks.accessory.id, null);
  const seam = result.metrics["bases/female.glb.seam"];
  assert.ok(seam.pairs >= 3 && seam.sharedTargets === 8 && seam.maxDeltaM < 1e-9, JSON.stringify(seam));
});

it("--base male만 검사하면 여성 전용 항목은 건드리지 않는다", async () => {
  const kit = await newKit();
  const result = await runVerify(kit, { base: "male" });
  assert.deepEqual(result.bases, ["male"]);
  assertNoFindings(result, CHECKS.map((check) => check.id));
});

it("--only는 선택한 검사만 돌리고 GLB 검사를 고르면 V5도 함께 돈다", async () => {
  const kit = await newKit();
  const result = await runVerify(kit, { only: ["V8"] });
  assert.deepEqual(Object.keys(result.checks).sort(), ["V5", "V8"]);
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------- V1

it("V1: kit.json이 없으면 오류이고 JSON이 깨지면 오류다", async () => {
  const empty = await verifyKit({ source: createMemorySource(new Map()) });
  assert.equal(empty.ok, false);
  assertError(empty, "V1", "kit.json이 없습니다");
  const broken = await verifyKit({ source: createMemorySource(new Map([["kit.json", "{ not json"]])) });
  assertError(broken, "V1", "JSON을 해석하지 못했습니다");
});

it("V1: 구조를 해석할 수 없으면 오류를 내고 나머지 검사는 건너뛴 것으로 보고한다", async () => {
  const kit = await newKit();
  delete kit.manifest.skeleton;
  const result = await runVerify(kit);
  assert.equal(result.ok, false);
  assert.ok(errorsOf(result, "V1").length > 0);
  assert.equal(result.checks.V5.status, "skipped");
  assert.equal(result.checks.V9.status, "skipped");
});

it("V1: 기본값·kitId·kitVersion이 계약 상수와 다르면 오류다", async () => {
  const kit = await newKit();
  kit.manifest.defaults.slots.hair = "hair/hime-cut";
  kit.manifest.defaults.colors.skin = "#000000";
  kit.manifest.kitVersion = 2;
  kit.manifest.kitId = "other-kit";
  const result = await runVerify(kit, { only: ["V1"] });
  assertError(result, "V1", "KIT_DEFAULT_SLOTS");
  assertError(result, "V1", "DEFAULT_RECIPE_COLORS");
  assertError(result, "V1", "KIT_CURRENT_VERSION");
  assertError(result, "V1", "kitId");
});

it("V1: 계약 교차 검증 실패(필수 파츠 없음)는 V1에 모두 나온다", async () => {
  const kit = await newKit();
  delete kit.manifest.parts.find((part) => part.id === "top/tee").variants.female;
  const result = await runVerify(kit, { only: ["V1"] });
  assertError(result, "V1", "top/tee");
});

// ---------------------------------------------------------------- V2·V3·V4

it("V2: SHA-256·크기 불일치, 파일 없음, 모르는 파일, 대소문자 중복을 잡는다", async () => {
  const kit = await newKit();
  kit.manifest.parts.find((part) => part.id === "hair/soft-bob").variants.female.file.sha256 = "0".repeat(64);
  kit.manifest.parts.find((part) => part.id === "top/tee").variants.female.file.bytes += 1;
  kit.files.delete("parts/shoes/sneakers.glb");
  kit.files.set("extra/readme.txt", "남는 파일");
  kit.files.set("BASES/FEMALE.GLB", "대소문자");
  const result = await runVerify(kit, { only: ["V2"] });
  assertError(result, "V2", "SHA-256이 kit.json 선언과 다릅니다");
  assertError(result, "V2", "kit-bytes-mismatch");
  assertError(result, "V2", "파일이 없습니다");
  assertError(result, "V2", "kit.json이 모르는 파일");
  assertError(result, "V2", "대소문자만 다른 중복 경로");
});

it("V3: 베이스 16 MiB·파츠 1.5 MiB 한도를 실제 바이트로 잰다", async () => {
  const kit = await newKit();
  setFile(kit, "bases/male.glb", new Uint8Array(16 * 1024 * 1024));
  setFile(kit, "parts/hair/soft-bob.glb", new Uint8Array(2 * 1024 * 1024));
  const atLimit = await runVerify(kit, { only: ["V3"] });
  assert.ok(
    !errorsOf(atLimit, "V3").some((finding) => finding.message.includes("베이스 GLB")),
    "베이스 16 MiB는 한도 안이라 위반이 아니어야 합니다.",
  );
  setFile(kit, "bases/male.glb", new Uint8Array(16 * 1024 * 1024 + 1));
  const result = await runVerify(kit, { only: ["V3"] });
  assertError(result, "V3", "베이스 GLB");
  assertError(result, "V3", "파츠 GLB");
  assert.equal(typeof result.metrics.totalBytes, "number");
});

it("V4: https가 아닌 출처 URL, zip SHA 없음, 한글 없는 변경 내용, NOTICE 없음을 잡는다", async () => {
  const kit = await newKit();
  kit.manifest.provenance.sources[0].url = "http://download.blender.org/x.zip";
  delete kit.manifest.provenance.sources[0].zipSha256;
  kit.manifest.provenance.sources[0].changesKo = "changed";
  kit.files.delete("NOTICE.md");
  const result = await runVerify(kit, { only: ["V4"] });
  assertError(result, "V4", "https URL");
  assertError(result, "V4", "zipSha256");
  assertError(result, "V4", "한글");
  assertError(result, "V4", "NOTICE");
});

// ---------------------------------------------------------------- V5

it("V5: 금지 확장·허용 밖 필수 확장·외부 URI·GLB가 아닌 바이트를 잡고 선택 확장은 경고만 한다", async () => {
  const kit = await newKit();
  setFile(kit, "parts/hair/soft-bob.glb", patchGlbJson(kit.files.get("parts/hair/soft-bob.glb"), (json) => (json.extensionsUsed = ["KHR_draco_mesh_compression"])));
  setFile(kit, "parts/top/tee.glb", patchGlbJson(kit.files.get("parts/top/tee.glb"), (json) => (json.extensionsRequired = ["KHR_materials_variants"])));
  setFile(kit, "parts/bottom/jeans.glb", patchGlbJson(kit.files.get("parts/bottom/jeans.glb"), (json) => (json.images[0].uri = "textures/a.png")));
  setFile(kit, "parts/shoes/sneakers.glb", new TextEncoder().encode("이건 GLB가 아닙니다. 20바이트를 넘기는 문장."));
  setFile(kit, "parts/irises/round-large.glb", patchGlbJson(kit.files.get("parts/irises/round-large.glb"), (json) => (json.extensionsUsed = ["KHR_materials_variants"])));
  const result = await runVerify(kit, { only: ["V5"] });
  assertError(result, "V5", "금지 확장 KHR_draco_mesh_compression");
  assertError(result, "V5", "extensionsRequired의 KHR_materials_variants");
  assertError(result, "V5", "외부 URI");
  assertError(result, "V5", "GLB 매직");
  assert.ok(warningsOf(result, "V5").some((finding) => finding.where === "parts/irises/round-large.glb"), "선택 확장은 경고");
  assert.ok(!errorsOf(result, "V5").some((finding) => finding.where === "parts/irises/round-large.glb"));
});

it("parseGlbContainer: 짧은 입력·버전·길이 불일치를 한글로 알린다", () => {
  assert.match(parseGlbContainer(new Uint8Array(4)).problems[0], /20바이트/u);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(99, 8);
  const parsed = parseGlbContainer(new Uint8Array(header));
  assert.ok(parsed.problems.some((problem) => problem.includes("버전")));
  assert.ok(parsed.problems.some((problem) => problem.includes("길이")));
  assert.equal(parsed.json, null);
});

// ---------------------------------------------------------------- V6

it("V6: skin.joints 순서가 manifest와 다르면 JOINTS 인덱스 어긋남으로 오류다", async () => {
  const kit = await newKit();
  const joints = kit.manifest.skeleton.joints;
  [joints[3], joints[4]] = [joints[4], joints[3]];
  const result = await runVerify(kit, { only: ["V6"] });
  assertError(result, "V6", "skin.joints 순서");
});

it("V6: 부모 관계가 다르면 오류다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "parts/top/tee.glb", (doc) => {
    const nodes = doc.getRoot().listNodes();
    const hand = nodes.find((node) => node.getName() === "mixamorig:LeftHand");
    const arm = nodes.find((node) => node.getName() === "mixamorig:LeftArm");
    hand.getParentNode().removeChild(hand);
    arm.addChild(hand);
  });
  const result = await runVerify(kit, { only: ["V6"] });
  assertError(result, "V6", "joint mixamorig:LeftHand의 부모");
});

it("V6: 선언 안 된 메시 노드·빠진 메시 노드·헤어 이름 규칙 위반을 잡는다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const body = meshNodeOf(doc, "TS_Body");
    doc.getRoot().listScenes()[0].addChild(doc.createNode("TS_Extra").setMesh(body.getMesh()).setSkin(body.getSkin()));
    meshNodeOf(doc, "TS_Brow_L").dispose();
  });
  await tweakGlb(kit, "parts/hair/soft-bob.glb", (doc) => meshNodeOf(doc, "TS_AuthoredHair_soft-bob_LOD0").setName("TS_AuthoredHair_other_LOD0"));
  const result = await runVerify(kit, { only: ["V6"] });
  assertError(result, "V6", "kit-mesh-undeclared");
  assertError(result, "V6", "kit-mesh-missing");
  assertError(result, "V6", "TS_AuthoredHair_soft-bob_LOD<n>");
});

it("V6: boneMap이 55본을 덮지 못하면(TS_Jaw 누락) 오류다", async () => {
  const kit = await newKit();
  delete kit.manifest.skeleton.boneMap["TS_Jaw"];
  const result = await runVerify(kit, { only: ["V6"] });
  assertError(result, "V6", "계약 55본");
  assertError(result, "V6", "jaw");
});

it("V6: 같은 GLB 파일을 서로 다른 메시 선언으로 참조하면 오류다", async () => {
  const kit = await newKit();
  const tee = kit.manifest.parts.find((part) => part.id === "top/tee");
  tee.variants.male = structuredClone(tee.variants.female);
  tee.variants.male.meshes[0].triangles += 1;
  const result = await runVerify(kit, { only: ["V6"] });
  assertError(result, "V6", "서로 다른 메시 선언");
});

// ---------------------------------------------------------------- V7

it("V7: Armature 변환·메시 노드 변환·음수 스케일을 잡는다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "parts/top/tee.glb", (doc) => {
    doc.getRoot().listNodes().find((node) => node.getName() === "Armature").setTranslation([0, 0.1, 0]);
    meshNodeOf(doc, "TS_Top_tee").setTranslation([0.1, 0, 0]);
    doc.getRoot().listNodes().find((node) => node.getName() === "mixamorig:LeftHand").setScale([-1, 1, 1]);
  });
  const result = await runVerify(kit, { only: ["V7"] });
  assertError(result, "V7", "Armature 노드의 변환이 항등");
  assertError(result, "V7", "kit-transform-invalid");
  assertError(result, "V7", "음수/0 스케일");
});

it("V7: 베이스 높이·발바닥 높이·얼굴 방향을 잰다", async () => {
  const kit = await newKit();
  kit.manifest.bases.female.heightM = 1.8;
  await tweakGlb(kit, "bases/male.glb", (doc) => {
    for (const name of ["TS_Eye_L", "TS_Eye_R"]) {
      const accessor = primOf(doc, name).getAttribute("POSITION");
      const array = accessor.getArray();
      for (let i = 2; i < array.length; i += 3) array[i] = -0.2;
      accessor.setArray(array);
    }
    const body = primOf(doc, "TS_Body").getAttribute("POSITION");
    const array = body.getArray();
    for (let i = 1; i < array.length; i += 3) if (array[i] < 0.001) array[i] = 0.03;
    body.setArray(array);
  });
  const result = await runVerify(kit, { only: ["V7"] });
  assert.ok(errorsOf(result, "V7").some((finding) => finding.where === "bases/female.glb" && finding.message.includes("heightM")));
  assert.ok(errorsOf(result, "V7").some((finding) => finding.where === "bases/male.glb" && finding.message.includes("눈 중심 z")));
  assert.ok(errorsOf(result, "V7").some((finding) => finding.where === "bases/male.glb" && finding.message.includes("발바닥")));
});

// ---------------------------------------------------------------- V8

it("V8: 가중치 합·JOINTS_1·joint 인덱스·0 가중치 슬롯·스킨 없음을 잡는다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const head = primOf(doc, "TS_Head");
    const weights = head.getAttribute("WEIGHTS_0");
    const weightArray = weights.getArray();
    weightArray[0] = 0.5;
    weights.setArray(weightArray);
    const joints = head.getAttribute("JOINTS_0");
    const jointArray = joints.getArray();
    jointArray[4] = 70;
    jointArray[5] = 5;
    joints.setArray(jointArray);
    const body = primOf(doc, "TS_Body");
    body.setAttribute("JOINTS_1", body.getAttribute("JOINTS_0"));
    body.setAttribute("WEIGHTS_1", body.getAttribute("WEIGHTS_0"));
    primOf(doc, "TS_Lashes").setAttribute("JOINTS_0", null);
    meshNodeOf(doc, "TS_Brow_R").setSkin(null);
  });
  await tweakGlb(kit, "parts/top/tee.glb", (doc) => {
    const skin = doc.getRoot().listSkins()[0];
    skin.getInverseBindMatrices().setArray(new Float32Array(67 * 16));
  });
  const result = await runVerify(kit, { only: ["V8"] });
  assertError(result, "V8", "가중치 합이 1");
  assertError(result, "V8", "joint 인덱스가 68 이상");
  assertError(result, "V8", "가중치 0인 슬롯");
  assertError(result, "V8", "JOINTS_1/WEIGHTS_1");
  assertError(result, "V8", "JOINTS_0 또는 WEIGHTS_0가 없습니다");
  assertError(result, "V8", "스킨에 바인딩되지 않은 메시");
  assertError(result, "V8", "inverseBindMatrices");
});

// ---------------------------------------------------------------- V9

it("V9: 선언한 morph가 GLB에 없거나 이름이 어휘 밖(ext:*)이거나 개수 정보가 없으면 오류다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const body = primOf(doc, "TS_Body");
    const targets = body.listTargets();
    body.removeTarget(targets[targets.length - 1]);
    // gltf-transform은 extras.targetNames를 타깃 이름에서 다시 만들어 쓰므로 타깃 이름을 바꾼다.
    primOf(doc, "TS_Head").listTargets().find((target) => target.getName() === "facs:jawOpen").setName("ext:custom");
  });
  // 이름 정보 자체를 지우는 입력은 JSON 청크를 직접 고쳐 만든다.
  setFile(
    kit,
    "bases/female.glb",
    patchGlbJson(kit.files.get("bases/female.glb"), (json) => delete json.meshes.find((mesh) => mesh.name === "TS_Lashes").extras.targetNames),
  );
  const result = await runVerify(kit, { only: ["V9"] });
  assertError(result, "V9", "kit-morph-missing");
  assertError(result, "V9", "필수인 morph");
  assertError(result, "V9", "`ext:*`는 v1 금지");
  assertError(result, "V9", "extras.targetNames");
});

it("V9: +/- 델타가 같거나 상한을 넘거나 0이면 오류이고 부수 메시의 0 표정 타깃은 경고다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const body = primOf(doc, "TS_Body");
    const bodyNames = meshNodeOf(doc, "TS_Body").getMesh().getExtras().targetNames;
    const target = (name) => body.listTargets()[bodyNames.indexOf(name)].getAttribute("POSITION");
    target("param:waist:-").setArray(Float32Array.from(target("param:waist:+").getArray()));
    const big = target("param:hip:+");
    big.setArray(Float32Array.from(big.getArray(), (value) => value * 5));
    const zero = target("param:armLength:+");
    zero.setArray(new Float32Array(zero.getArray().length));
    const brow = primOf(doc, "TS_Brow_L");
    const browNames = meshNodeOf(doc, "TS_Brow_L").getMesh().getExtras().targetNames;
    const faceTarget = brow.listTargets()[browNames.indexOf("facs:browDown")].getAttribute("POSITION");
    faceTarget.setArray(new Float32Array(faceTarget.getArray().length));
  });
  const result = await runVerify(kit, { only: ["V9"] });
  assertError(result, "V9", "param:waist:-의 델타가 같습니다");
  assertError(result, "V9", "param:hip:+의 최대 델타");
  assertError(result, "V9", "param:armLength:+의 델타가 사실상 0");
  assert.ok(warningsOf(result, "V9").some((finding) => finding.where.endsWith("TS_Brow_L") && finding.message.includes("facs:browDown")));
  assert.ok(!errorsOf(result, "V9").some((finding) => finding.message.includes("facs:browDown")));
});

it("V9: 몸/머리 이음매 정점의 공유 타깃 델타가 다르면 목이 벌어지는 오류다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const head = primOf(doc, "TS_Head");
    const names = meshNodeOf(doc, "TS_Head").getMesh().getExtras().targetNames;
    const accessor = head.listTargets()[names.indexOf("param:neckLength:+")].getAttribute("POSITION");
    const array = accessor.getArray();
    array[4 * 3 + 1] += 0.01; // 이음매 정점 4번
    accessor.setArray(array);
  });
  const result = await runVerify(kit, { only: ["V9"] });
  assertError(result, "V9", "이음매 정점");
  assertError(result, "V9", "param:neckLength:+");
});

it("V9: 목 이음매 정점을 찾지 못하면(몸/머리 사이 틈) 오류다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const accessor = primOf(doc, "TS_Head").getAttribute("POSITION");
    const array = accessor.getArray();
    for (let v = 4; v <= 6; v += 1) array[v * 3 + 1] += 0.02;
    accessor.setArray(array);
  });
  const result = await runVerify(kit, { only: ["V9"] });
  assertError(result, "V9", "이음매 정점을 찾지 못했습니다");
});

it("V9: 의상이 몸을 따라가지 않으면 오류, 5~15 mm 편차는 경고다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const names = meshNodeOf(doc, "TS_Underwear").getMesh().getExtras().targetNames;
    const accessor = primOf(doc, "TS_Underwear").listTargets()[names.indexOf("param:waist:+")].getAttribute("POSITION");
    const array = accessor.getArray();
    for (let i = 0; i < array.length; i += 3) array[i] += 0.03;
    accessor.setArray(array);
  });
  await tweakGlb(kit, "parts/bottom/jeans.glb", (doc) => {
    const names = meshNodeOf(doc, "TS_Bottom_jeans").getMesh().getExtras().targetNames;
    const accessor = primOf(doc, "TS_Bottom_jeans").listTargets()[names.indexOf("param:hip:+")].getAttribute("POSITION");
    const array = accessor.getArray();
    for (let i = 0; i < array.length; i += 3) array[i + 1] += 0.008;
    accessor.setArray(array);
  });
  const result = await runVerify(kit, { only: ["V9"] });
  assert.ok(errorsOf(result, "V9").some((finding) => finding.where.includes("TS_Underwear") && finding.message.includes("param:waist:+")), JSON.stringify(result.findings, null, 1));
  assert.ok(warningsOf(result, "V9").some((finding) => finding.where.includes("TS_Bottom_jeans") && finding.message.includes("param:hip:+")));
  assert.ok(!errorsOf(result, "V9").some((finding) => finding.where.includes("TS_Bottom_jeans")));
});

it("V9: morph 법선 델타가 일부 타깃에만 있으면 오류, 몸/머리 밖 메시의 법선은 경고다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const body = primOf(doc, "TS_Body");
    const normal = body.getAttribute("NORMAL");
    body.listTargets()[0].setAttribute("NORMAL", normal);
    const underwear = primOf(doc, "TS_Underwear");
    for (const target of underwear.listTargets()) target.setAttribute("NORMAL", underwear.getAttribute("NORMAL"));
  });
  const result = await runVerify(kit, { only: ["V9"] });
  assertError(result, "V9", "법선 델타가 일부 타깃에만");
  assert.ok(warningsOf(result, "V9").some((finding) => finding.where.endsWith("TS_Underwear") && finding.message.includes("법선")));
});

// ---------------------------------------------------------------- V10

it("V10: bodyRegions가 인덱스를 분할하지 않거나 hides 영역이 범위에 없으면 오류다", async () => {
  const kit = await newKit();
  kit.manifest.bases.female.bodyRegions[2].indexStart += 3;
  kit.manifest.bases.female.bodyRegions.pop();
  const result = await runVerify(kit, { only: ["V10"] });
  assertError(result, "V10", "kit-region-range-invalid");
  assertError(result, "V10", "영역 id 15개");
  assertError(result, "V10", "hides의 영역 foot.R");
});

it("V10: _REGION 속성이 없거나 범위 밖이거나 영역이 비어 있거나 면이 영역 순이 아니면 오류다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    primOf(doc, "TS_Head").setAttribute("_REGION", null);
    const body = primOf(doc, "TS_Body").getAttribute("_REGION");
    const array = body.getArray();
    array[0] = 16;
    for (let v = 4; v < 8; v += 1) array[v] = 9; // 두 번째 영역(torso) 정점을 hand.R로 바꿔 면 정렬을 깬다
    body.setArray(array);
  });
  const result = await runVerify(kit, { only: ["V10"] });
  assertError(result, "V10", "_REGION(UNSIGNED_BYTE) 정점 속성이 없습니다");
  assertError(result, "V10", "_REGION 값 16");
  assertError(result, "V10", "정점이 하나도 없는 영역");
  assertError(result, "V10", "영역 torso 범위의 삼각형");
});

// ---------------------------------------------------------------- V11

it("V11: 선언 삼각형·정점 수 불일치와 헤어 LOD0 예산 초과를 잡는다", async () => {
  const kit = await newKit();
  kit.manifest.bases.female.meshes[0].triangles += 1;
  kit.manifest.bases.female.meshes[1].vertices += 1;
  await tweakGlb(kit, "parts/hair/soft-bob.glb", (doc) => {
    const primitive = primOf(doc, "TS_AuthoredHair_soft-bob_LOD0");
    const indices = new Uint16Array(20_001 * 3);
    for (let t = 0; t < 20_001; t += 1) indices.set([0, 1, 2], t * 3);
    primitive.getIndices().setArray(indices);
  });
  const result = await runVerify(kit, { only: ["V11"] });
  assertError(result, "V11", "선언 삼각형");
  assertError(result, "V11", "선언 정점");
  assertError(result, "V11", "헤어 LOD0 삼각형 20001개가 예산 20000개");
});

it("V11: 퇴화 삼각형과 정점 수를 넘는 인덱스를 잡는다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const position = primOf(doc, "TS_Underwear").getAttribute("POSITION");
    const array = position.getArray();
    array.copyWithin(3, 0, 3); // 정점 1을 정점 0과 같게: 첫 삼각형 퇴화
    position.setArray(array);
    const indices = primOf(doc, "TS_Lashes").getIndices();
    const values = indices.getArray();
    values[0] = 1000;
    indices.setArray(values);
  });
  const result = await runVerify(kit, { only: ["V11"] });
  assertError(result, "V11", "퇴화 삼각형");
  assertError(result, "V11", "정점 수를 넘는 인덱스");
});

// ---------------------------------------------------------------- V12

it("V12: UV가 겹치거나 0..1 밖이거나 없으면 오류다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const uv = primOf(doc, "TS_Body").getAttribute("TEXCOORD_0");
    const array = uv.getArray();
    array.copyWithin(8, 0, 8); // 두 번째 사각형의 UV를 첫 번째와 같게
    array[16] = 1.5;
    uv.setArray(array);
    primOf(doc, "TS_Head").setAttribute("TEXCOORD_0", null);
  });
  const result = await runVerify(kit, { only: ["V12"] });
  assertError(result, "V12", "UV 겹침 픽셀 비율");
  assertError(result, "V12", "0..1 단일 타일");
  assertError(result, "V12", "TEXCOORD_0(UVMap)이 없습니다");
});

it("verifyUvOverlap: 떨어진 삼각형·변을 공유하는 삼각형은 겹침 0, 같은 삼각형 둘은 겹침이다", () => {
  const apart = new Float32Array([0.1, 0.1, 0.4, 0.1, 0.1, 0.4, 0.6, 0.6, 0.9, 0.6, 0.6, 0.9]);
  assert.equal(verifyUvOverlap(apart, null, 256).overlapRatio, 0);
  const quad = new Float32Array([0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9]);
  assert.equal(verifyUvOverlap(quad, Uint32Array.from([0, 1, 2, 0, 2, 3]), 256).overlapRatio, 0);
  const same = verifyUvOverlap(quad, Uint32Array.from([0, 1, 2, 0, 1, 2]), 256);
  assert.ok(same.overlapRatio > 0.99, `겹침 비율 ${same.overlapRatio}`);
  const flipped = verifyUvOverlap(quad, Uint32Array.from([0, 1, 2, 0, 2, 1]), 256);
  assert.ok(flipped.overlapRatio > 0.99, "감김 방향이 달라도 겹침으로 센다");
  assert.equal(verifyUvOverlap(new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]), null, 64).skippedTriangles, 1);
});

// ---------------------------------------------------------------- V13

it("V13: ORM·emissive 텍스처, baseColorFactor, doubleSided, 재질 이름, 한 역할 두 재질, 텍스처 없음을 잡는다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const materials = doc.getRoot().listMaterials();
    const skin = materials.find((material) => material.getName() === "ts_skin_body");
    skin.setMetallicRoughnessTexture(skin.getBaseColorTexture());
    skin.setBaseColorFactor([0.5, 0.5, 0.5, 1]);
    const head = materials.find((material) => material.getName() === "ts_skin_head");
    head.setEmissiveTexture(head.getBaseColorTexture());
    head.setDoubleSided(true);
    materials.find((material) => material.getName() === "ts_brow").setBaseColorTexture(null);
    materials.find((material) => material.getName() === "ts_underwear").setName("ts_underwear2");
    // TS_Eye_R만 같은 이름의 다른 재질 객체로 바꾼다
    const other = doc.createMaterial("ts_eye").setBaseColorFactor([1, 1, 1, 1]);
    primOf(doc, "TS_Eye_R").setMaterial(other);
  });
  const result = await runVerify(kit, { only: ["V13"] });
  assertError(result, "V13", "ORM");
  assertError(result, "V13", "baseColorFactor가 [1,1,1,1]이 아닙니다");
  assertError(result, "V13", "emissive 텍스처");
  assertError(result, "V13", "doubleSided");
  assertError(result, "V13", "baseColor 텍스처가 필요합니다");
  assertError(result, "V13", "선언 'ts_underwear'");
  assertError(result, "V13", "kit-material-multiple");
});

it("V13: 알파 없는 PNG, 알파 필요한데 JPEG, 알파 PNG인데 OPAQUE(경고)를 구분한다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const materials = doc.getRoot().listMaterials();
    materials.find((material) => material.getName() === "ts_skin_body").getBaseColorTexture().setImage(grayRgbPng(0.9)).setMimeType("image/png");
    materials.find((material) => material.getName() === "ts_skin_head").setAlphaMode("BLEND");
    materials.find((material) => material.getName() === "ts_lashes").setAlphaMode("OPAQUE");
  });
  const result = await runVerify(kit, { only: ["V13"] });
  assertError(result, "V13", "알파 채널이 없는 PNG");
  assertError(result, "V13", "알파 없는 JPEG");
  assert.ok(warningsOf(result, "V13").some((finding) => finding.message.includes("alphaMode가 OPAQUE")));
});

it("V13: recolor 텍스처 평균 휘도 0.75 미만은 오류, iris는 0.55까지 허용한다(리드 결정 A-2)", async () => {
  assert.equal(RECOLOR_MIN_MEAN_LUMINANCE, 0.75);
  assert.equal(IRIS_RECOLOR_MIN_MEAN_LUMINANCE, 0.55);
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const skin = doc.getRoot().listMaterials().find((material) => material.getName() === "ts_skin_body");
    skin.getBaseColorTexture().setImage(grayJpeg(0.6)).setMimeType("image/jpeg");
  });
  await tweakGlb(kit, "parts/hair/soft-bob.glb", (doc) => {
    doc.getRoot().listMaterials()[0].getBaseColorTexture().setImage(grayJpeg(0.6));
  });
  await tweakGlb(kit, "parts/irises/round-large.glb", (doc) => {
    const iris = doc.getRoot().listMaterials().find((material) => material.getName() === "ts_iris");
    iris.getBaseColorTexture().setImage(grayJpeg(0.5));
  });
  const result = await runVerify(kit, { only: ["V13"] });
  assert.ok(errorsOf(result, "V13").some((finding) => finding.where.endsWith(":ts_skin_body") && finding.message.includes("0.75")));
  assert.ok(errorsOf(result, "V13").some((finding) => finding.where.endsWith(":ts_hair_soft-bob") && finding.message.includes("0.75")), "헤어는 0.6이어도 오류");
  assert.ok(errorsOf(result, "V13").some((finding) => finding.where.endsWith(":ts_iris") && finding.message.includes("0.55")), "iris 0.5는 0.55 미만이라 오류");
  // 0.62 iris(합성 키트 기본)는 통과해야 한다.
  const fine = await runVerify(await newKit(), { only: ["V13"] });
  assertNoFindings(fine, ["V13"]);
});

it("V13: 고정색 eye-highlight가 흰색이 아니면 경고한다(리드 결정 A-1)", async () => {
  const kit = await newKit();
  kit.manifest.materials.ts_highlight.tint = { mode: "fixed", hex: "#303030" };
  const result = await runVerify(kit, { only: ["V13"] });
  assert.ok(warningsOf(result, "V13").some((finding) => finding.where.endsWith(":ts_highlight") && finding.message.includes("흰색")));
  assert.equal(errorsOf(result, "V13").length, 0);
});

it("V13: 2의 거듭제곱이 아닌 크기·상한 초과·측정할 수 없는 JPEG를 잡는다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "parts/top/tee.glb", (doc) => {
    doc.getRoot().listMaterials()[0].getBaseColorTexture().setImage(makeJpeg({ width: 72, height: 72, lumaOf: () => 230 }));
  });
  await tweakGlb(kit, "parts/bottom/jeans.glb", (doc) => {
    doc.getRoot().listMaterials()[0].getBaseColorTexture().setImage(grayJpeg(0.9, 2048));
  });
  await tweakGlb(kit, "parts/shoes/sneakers.glb", (doc) => {
    doc.getRoot().listMaterials()[0].getBaseColorTexture().setImage(makeJpeg({ width: 64, height: 64, lumaOf: () => 230, progressive: true }));
  });
  const result = await runVerify(kit, { only: ["V13"] });
  assertError(result, "V13", "2의 거듭제곱이 아닙니다");
  assertError(result, "V13", "상한 1024²");
  assert.ok(warningsOf(result, "V13").some((finding) => finding.message.includes("프로그레시브")));
});

// ---------------------------------------------------------------- V14·V15

it("V14: 헤어 LOD 번호 공백과 삼각형 비단조 감소, COLOR_0 비회색·알파, COLOR_1을 잡는다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "parts/hair/soft-bob.glb", (doc) => {
    meshNodeOf(doc, "TS_AuthoredHair_soft-bob_LOD2").setName("TS_AuthoredHair_soft-bob_LOD4");
    const lod1 = primOf(doc, "TS_AuthoredHair_soft-bob_LOD1");
    lod1.getIndices().setArray(Uint16Array.from([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 1, 2]));
    const lod0 = primOf(doc, "TS_AuthoredHair_soft-bob_LOD0");
    const count = lod0.getAttribute("POSITION").getCount();
    const color = doc.createAccessor().setType("VEC4").setArray(Float32Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : i % 4 === 3 ? 0.5 : 0))).setBuffer(doc.getRoot().listBuffers()[0]);
    lod0.setAttribute("COLOR_0", color);
    lod0.setAttribute("COLOR_1", color);
  });
  const result = await runVerify(kit, { only: ["V14"] });
  assertError(result, "V14", "0부터 연속이 아닙니다");
  assertError(result, "V14", "줄지 않습니다");
  assertError(result, "V14", "회색(R=G=B)이 아닌 정점");
  assertError(result, "V14", "알파가 1이 아닌 정점");
  assertError(result, "V14", "COLOR_1은 금지");
});

it("V14: 회색 AO COLOR_0(알파 1)은 통과한다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "parts/hair/soft-bob.glb", (doc) => {
    const lod0 = primOf(doc, "TS_AuthoredHair_soft-bob_LOD0");
    const count = lod0.getAttribute("POSITION").getCount();
    lod0.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(Float32Array.from({ length: count * 4 }, (_, i) => (i % 4 === 3 ? 1 : 0.8))).setBuffer(doc.getRoot().listBuffers()[0]));
  });
  assertNoFindings(await runVerify(kit, { only: ["V14"] }), ["V14"]);
});

it("V15: _Outline 접미 메시 노드는 오류다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => meshNodeOf(doc, "TS_Underwear").setName("TS_Underwear_Outline"));
  assertError(await runVerify(kit, { only: ["V15"] }), "V15", "kit-outline-shell-forbidden");
});

// ---------------------------------------------------------------- V16~V19

it("V16: 필수 파츠 변형 없음, 어휘 밖 id, 한글 아닌 미제공 사유를 잡는다", async () => {
  const kit = await newKit();
  delete kit.manifest.parts.find((part) => part.id === "shoes/sneakers").variants.male;
  kit.manifest.parts.find((part) => part.id === "hair/hime-cut").unavailable.female = "n/a";
  kit.manifest.parts.push({ id: "hair/unknown-style", slot: "hair", variants: {}, unavailable: { female: "없음", male: "없음" } });
  const result = await runVerify(kit, { only: ["V16"] });
  assertError(result, "V16", "필수 파츠 shoes/sneakers의 male 변형이 없습니다");
  assertError(result, "V16", "hair/hime-cut: female 변형이 없으면");
  assertError(result, "V16", "hair/unknown-style가 프리셋 어휘");
});

it("V17: 선언한 슬롯 능력이 규칙 계산과 다르면 오류다", async () => {
  const kit = await newKit();
  kit.manifest.slotCapabilities.female.hair = { status: "unavailable", reasonKo: "선언이 틀렸습니다" };
  const result = await runVerify(kit, { only: ["V17"] });
  assertError(result, "V17", "hair");
  assertError(result, "V17", "kit-capabilities-mismatch");
});

it("V18: 필수 관절 오프셋 누락, 크기 초과, 모르는 본, 부호가 뒤집힌 오프셋을 잡는다", async () => {
  const kit = await newKit();
  delete kit.manifest.jointOffsets["param:hip:-"];
  kit.manifest.jointOffsets["param:legLength:+"]["mixamorig:LeftLeg"] = kit.manifest.jointOffsets["param:legLength:+"]["mixamorig:LeftLeg"].map((value) => -value);
  kit.manifest.jointOffsets["param:neckLength:+"]["mixamorig:NoSuchBone"] = [0.5, 0, 0];
  const result = await runVerify(kit, { only: ["V18"] });
  assertError(result, "V18", "필수 관절 오프셋 morph");
  assertError(result, "V18", "param:legLength:+의 mixamorig:Left");
  assertError(result, "V18", "관절 오프셋이 몸 정점 변위와");
  assertError(result, "V18", "0.3 m를 넘습니다");
  assertError(result, "V18", "joints에 없는 본");
  const good = await runVerify(await newKit(), { only: ["V18"] });
  assertNoFindings(good, ["V18"]);
  assert.ok(good.metrics["bases/female.glb.jointOffsets"].compared > 20, JSON.stringify(good.metrics["bases/female.glb.jointOffsets"]));
  assert.ok(good.metrics["bases/female.glb.jointOffsets"].worstM < 0.002);
});

it("V18: 오프셋이 몸 정점 변위와 10~25 mm 어긋나면 경고다", async () => {
  const kit = await newKit();
  const entry = kit.manifest.jointOffsets["param:legLength:+"];
  entry["mixamorig:LeftLeg"] = [entry["mixamorig:LeftLeg"][0], entry["mixamorig:LeftLeg"][1] + 0.015, entry["mixamorig:LeftLeg"][2]];
  const result = await runVerify(kit, { only: ["V18"] });
  assert.equal(errorsOf(result, "V18").length, 0, JSON.stringify(result.findings, null, 1));
  assert.ok(warningsOf(result, "V18").some((finding) => finding.message.includes("경고")));
  assert.equal((await runVerify(kit, { only: ["V18"], strict: true })).ok, false, "--strict는 경고도 실패로 센다");
});

it("V19: 물리 체인·콜라이더가 비어 있지 않으면 오류다", async () => {
  const kit = await newKit();
  kit.manifest.physics = { mode: "static", chains: [{}], colliders: [] };
  const result = await runVerify(kit, { only: ["V19"] });
  assertError(result, "V19", "chains: []");
});

// ---------------------------------------------------------------- V20

it("V20: NaN, 정점 수를 넘는 인덱스, 법선 길이, 법선 없음, 삼각형이 아닌 모드를 잡는다", async () => {
  const kit = await newKit();
  await tweakGlb(kit, "bases/female.glb", (doc) => {
    const position = primOf(doc, "TS_Body").getAttribute("POSITION");
    const array = position.getArray();
    array[3] = Number.NaN;
    position.setArray(array);
    const normal = primOf(doc, "TS_Head").getAttribute("NORMAL");
    normal.setArray(Float32Array.from(normal.getArray(), (value) => value * 3));
    primOf(doc, "TS_Lashes").setAttribute("NORMAL", null);
    primOf(doc, "TS_Brow_L").setMode(1);
    const indices = primOf(doc, "TS_Brow_R").getIndices();
    const values = indices.getArray();
    values[0] = 500;
    indices.setArray(values);
  });
  const result = await runVerify(kit, { only: ["V20"] });
  assertError(result, "V20", "POSITION에 NaN/Inf");
  assertError(result, "V20", "노멀 길이가 1±0.05");
  assertError(result, "V20", "NORMAL이 없습니다");
  assertError(result, "V20", "TRIANGLES(4)가 아닙니다");
  assertError(result, "V20", "정점 수(");
});

// ---------------------------------------------------------------- 이미지 해독 단위 테스트

it("decodeImageInfo: PNG 색 유형·비트 깊이·필터별 평균 휘도와 알파 여부", () => {
  const near = (value, expected, tolerance = 0.01) => assert.ok(Math.abs(value - expected) <= tolerance, `${value} ≈ ${expected}`);
  const rgb = decodeImageInfo(grayRgbPng(0.5));
  assert.equal(rgb.format, "png");
  assert.equal(rgb.hasAlpha, false);
  assert.deepEqual([rgb.width, rgb.height], [64, 64]);
  near(rgb.meanLuminance, 0.5);
  // 알파 가중: 오른쪽 절반(밝음, 불투명), 왼쪽 절반(어두움, 투명) → 밝은 쪽 값
  const half = decodeImageInfo(makePng({ width: 8, height: 8, colorType: 6, pixel: (x) => (x < 4 ? [0, 0, 0, 0] : [204, 204, 204, 255]) }));
  assert.equal(half.hasAlpha, true);
  near(half.meanLuminance, 0.8);
  for (const filter of [1, 2, 3, 4]) {
    const filtered = decodeImageInfo(makePng({ width: 16, height: 16, colorType: 2, filter, pixel: (x, y) => [(x * 16 + y) & 255, 100, 200 - x] }));
    near(filtered.meanLuminance, decodeImageInfo(makePng({ width: 16, height: 16, colorType: 2, filter: 0, pixel: (x, y) => [(x * 16 + y) & 255, 100, 200 - x] })).meanLuminance, 1e-9);
  }
  near(decodeImageInfo(makePng({ width: 8, height: 8, colorType: 0, pixel: () => [128] })).meanLuminance, 128 / 255);
  const grayAlpha = decodeImageInfo(makePng({ width: 8, height: 8, colorType: 4, pixel: () => [255, 128] }));
  assert.equal(grayAlpha.hasAlpha, true);
  near(grayAlpha.meanLuminance, 1);
  near(decodeImageInfo(makePng({ width: 4, height: 4, colorType: 0, depth: 4, pixel: () => [15] })).meanLuminance, 1);
  near(decodeImageInfo(makePng({ width: 4, height: 4, colorType: 2, depth: 16, pixel: () => [65535, 0, 0] })).meanLuminance, 0.2126);
  const palette = decodeImageInfo(makePng({ width: 4, height: 4, colorType: 3, depth: 8, palette: [[255, 255, 255], [0, 0, 0]], transparency: [255, 0], pixel: (x) => [x < 2 ? 0 : 1] }));
  assert.equal(palette.hasAlpha, true);
  near(palette.meanLuminance, 1, 1e-9);
  const interlaced = makePng({ width: 4, height: 4, colorType: 2, pixel: () => [10, 10, 10] });
  interlaced[28] = 1;
  const note = decodeImageInfo(interlaced);
  assert.equal(note.meanLuminance, null);
  assert.match(note.note, /인터레이스/u);
});

it("decodeImageInfo: 베이스라인 JPEG(그레이·4:4:4·4:2:0·재시작 구간)의 크기와 평균 휘도", () => {
  const near = (value, expected, tolerance = 0.004) => assert.ok(Math.abs(value - expected) <= tolerance, `${value} ≈ ${expected}`);
  const gray = decodeImageInfo(grayJpeg(0.8, 64));
  assert.equal(gray.format, "jpeg");
  assert.equal(gray.hasAlpha, false);
  assert.deepEqual([gray.width, gray.height], [64, 64]);
  near(gray.meanLuminance, 0.8);
  const ramp = (bx) => 40 + bx * 20;
  const expected = (Array.from({ length: 8 }, (_, bx) => ramp(bx)).reduce((sum, value) => sum + value, 0) / 8 / 255);
  near(decodeImageInfo(makeJpeg({ width: 64, height: 64, lumaOf: ramp })).meanLuminance, expected);
  near(decodeImageInfo(makeJpeg({ width: 64, height: 64, components: 3, lumaOf: ramp })).meanLuminance, expected);
  const subsampled = makeJpeg({ width: 64, height: 64, components: 3, sampling: [[2, 2], [1, 1], [1, 1]], lumaOf: ramp });
  near(decodeImageInfo(subsampled).meanLuminance, expected);
  const restarts = makeJpeg({ width: 64, height: 64, components: 3, sampling: [[2, 1], [1, 1], [1, 1]], lumaOf: ramp, restartInterval: 3 });
  near(decodeImageInfo(restarts).meanLuminance, expected);
  const grayRestart = makeJpeg({ width: 64, height: 64, lumaOf: ramp, restartInterval: 5 });
  near(decodeImageInfo(grayRestart).meanLuminance, expected);
  const progressive = decodeImageInfo(makeJpeg({ width: 64, height: 64, lumaOf: ramp, progressive: true }));
  assert.equal(progressive.meanLuminance, null);
  assert.match(progressive.note, /프로그레시브/u);
  assert.deepEqual([progressive.width, progressive.height], [64, 64]);
  const truncated = decodeImageInfo(grayJpeg(0.8, 64).subarray(0, 120));
  assert.equal(truncated.meanLuminance, null);
  assert.equal(decodeImageInfo(new TextEncoder().encode("GIF89a...........")).format, null);
});

// ---------------------------------------------------------------- 기하 도우미 단위 테스트

it("verifyMorphFollow: 가장 가까운 기준 정점과 변위가 다르면 편차(m)를 낸다", () => {
  const reference = { positions: new Float32Array([0, 0, 0, 1, 0, 0]), targets: new Map([["m", new Float32Array([0, 0, 0, 0, 0.1, 0])]]) };
  const subject = { positions: new Float32Array([0.001, 0, 0, 1.001, 0, 0, 5, 5, 5]), targets: new Map([["m", new Float32Array([0, 0, 0, 0, 0.12, 0, 9, 9, 9])]]) };
  const result = verifyMorphFollow({ subject, reference, names: ["m"] });
  assert.equal(result.matched, 2);
  assert.equal(result.unmatched, 1, "반경 밖 정점은 비교하지 않고 센다");
  assert.ok(Math.abs(result.perTarget.get("m").max - 0.02) < 1e-6);
  assert.ok(Math.abs(verifyMorphFollow({ subject, reference, names: ["m"], quantile: 0.5 }).perTarget.get("m").statistic) < 1e-6);
});

it("verifyMorphSeam: 같은 위치 정점의 공유 타깃 델타를 비교한다", () => {
  const first = { positions: new Float32Array([0, 0, 0, 1, 1, 1]), targets: new Map([["a", new Float32Array([0, 0.1, 0, 0, 0, 0])]]) };
  const second = { positions: new Float32Array([1, 1, 1, 0, 0, 0, 9, 9, 9]), targets: new Map([["a", new Float32Array([0, 0, 0, 0, 0.1, 0, 0, 0, 0])]]) };
  const same = verifyMorphSeam(first, second);
  assert.equal(same.pairs, 2);
  assert.equal(same.maxDelta, 0);
  second.targets.get("a")[4] = 0.2;
  const different = verifyMorphSeam(first, second);
  assert.ok(Math.abs(different.maxDelta - 0.1) < 1e-6);
  assert.equal(different.worstName, "a");
});

it("verifyJointOffsets: 선언 오프셋을 부모 월드 회전으로 월드화해 몸 정점 변위와 비교한다", () => {
  // 부모(루트)가 +90° Y 회전 → 로컬 +X는 월드 -Z로 간다
  const rotateY90 = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
  const common = {
    joints: ["root", "child"],
    parents: { root: null, child: "root" },
    headWorld: new Map([["root", [0, 0, 0]], ["child", [0, 0, 0.5]]]),
    parentWorldMatrix: new Map([["root", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]], ["child", rotateY90]]),
    morphs: ["m"],
  };
  const view = (dz) => ({
    count: 3,
    positions: new Float32Array([0, 0, 0.5, 0.001, 0, 0.5, 0, 0.001, 0.5]),
    joints: new Uint16Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    targets: new Map([["m", new Float32Array([0, 0, dz, 0, 0, dz, 0, 0, dz])]]),
  });
  const right = verifyJointOffsets({ ...common, jointOffsets: { m: { child: [0.1, 0, 0] } }, views: [view(-0.1)] });
  assert.equal(right.compared, 1);
  assert.ok(right.worst.diffM < 1e-6, `월드화가 맞으면 편차 0: ${right.worst.diffM}`);
  const wrongFrame = verifyJointOffsets({ ...common, jointOffsets: { m: { child: [0, 0, -0.1] } }, views: [view(-0.1)] });
  assert.ok(wrongFrame.worst.diffM > 0.09, "월드 변위를 그대로 적으면(프레임 오류) 어긋난다");
  assert.equal(verifyJointOffsets({ ...common, jointOffsets: {}, views: [{ ...view(0), count: 1 }] }).compared, 0, "정점이 3개 미만이면 비교하지 않는다");
});

// ---------------------------------------------------------------- CLI

it("parseCliArgs: 옵션을 해석하고 잘못된 인자는 사유와 함께 돌려준다", () => {
  const ok = parseCliArgs(["--root", "x", "--base", "male", "--json", "out.json", "--strict", "--only", "v1,V6", "--follow-quantile", "0.9"]);
  assert.equal(ok.error, null);
  assert.equal(ok.base, "male");
  assert.equal(ok.strict, true);
  assert.deepEqual(ok.only, ["V1", "V6"]);
  assert.equal(ok.followQuantile, 0.9);
  assert.equal(parseCliArgs(["-h"]).help, true);
  assert.equal(parseCliArgs(["--", "--help"]).help, true, "pnpm run 의 -- 구분자는 무시한다");
  assert.match(parseCliArgs(["--bogus"]).error, /알 수 없는 인자/u);
  assert.match(parseCliArgs(["--base", "robot"]).error, /female, male, all/u);
  assert.match(parseCliArgs(["--only", "V99"]).error, /V99/u);
  assert.match(parseCliArgs(["--root"]).error, /값이 필요/u);
  assert.match(parseCliArgs(["--follow-quantile", "2"]).error, /0 초과 1 이하/u);
});

function writeKitFiles(directory, kit) {
  const files = new Map(kit.files);
  files.set("kit.json", JSON.stringify(kit.manifest, null, 2));
  for (const [relative, value] of files) {
    const target = path.join(directory, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, value);
  }
}

function runScript(args) {
  return spawnSync(process.execPath, ["--import", "tsx", path.join(repositoryRoot, "scripts/verify-character-kit.mjs"), ...args], { cwd: repositoryRoot, encoding: "utf8", timeout: 120_000 });
}

it("CLI: --help는 사용법을 출력하고 0으로 끝난다", () => {
  const run = runScript(["--help"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /사용법/u);
  assert.match(run.stdout, /--only/u);
  assert.match(run.stdout, /V20/u);
  assert.equal(runScript(["--nope"]).status, 2);
});

it("CLI: 디스크 키트를 검증해 통과하면 0, 깨지면 1로 끝나고 --json을 쓴다", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "toonstudio-kit-verify-"));
  try {
    const kit = await newKit();
    writeKitFiles(directory, kit);
    const jsonPath = path.join(directory, "out", "report.json");
    const pass = runScript(["--root", directory, "--json", jsonPath, "--only", "V1,V2,V3,V4,V16,V17,V19"]);
    assert.equal(pass.status, 0, `${pass.stdout}\n${pass.stderr}`);
    assert.match(pass.stdout, /결과: 오류 0/u);
    const report = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(report.schema, "toonstudio.character-kit-verify/1");
    assert.equal(report.ok, true);
    assert.equal(report.checks.V2.status, "pass");
    assert.equal(existsSync(jsonPath), true);
    writeFileSync(path.join(directory, "bases", "female.glb"), new Uint8Array(10));
    const fail = runScript(["--root", directory, "--only", "V2"]);
    assert.equal(fail.status, 1);
    assert.match(fail.stdout, /kit-bytes-mismatch/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("runCli: 사용법 오류는 2, 키트가 없으면 1을 돌려준다(프로세스를 끝내지 않는다)", async () => {
  const lines = [];
  const output = { log: (line) => lines.push(line), error: (line) => lines.push(line) };
  assert.equal(await runCli(["--base", "robot"], output), 2);
  const empty = mkdtempSync(path.join(tmpdir(), "toonstudio-kit-empty-"));
  try {
    assert.equal(await runCli(["--root", empty], output), 1);
    assert.ok(lines.some((line) => String(line).includes("kit.json이 없습니다")));
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});
