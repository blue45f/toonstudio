/**
 * SKP 변환 테스트용 합성 픽스처 — 모든 바이트와 형상을 코드로 만든다(바이너리 픽스처 커밋 금지).
 *
 * - createSkpHeaderBytes: 실제 .skp 헤더 구조(openskp 1.3.0 소스 근거)를 흉내 낸 최소 바이트.
 * - createSyntheticGlb: GLB 컨테이너 규칙을 지키는 최소 GLB.
 * - createBoxPrimitive: OpenSKP 의 GlbPrimitive 와 같은 구조의 상자(면마다 정점 분리, 바깥 법선).
 * - createFakeOpenSkpModule: 변환기 주입용 가짜 모듈과 호출 기록.
 * - createSkpReportFixture: 화면·저장소 테스트용 보고서 v1(스키마를 통과하는 완전한 값).
 */

import { deflateSync } from "node:zlib";

import type { OpenSkpModuleLike } from "./studio-bg3d-skp-conversion-core";
import type { StudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import type { StudioBg3dSkpPrimitive } from "./studio-bg3d-skp-mesh-merge";

export interface SkpHeaderOptions {
  /** 중괄호를 포함한 버전 문자열. null 이면 버전 영역을 만들지 않는다. */
  readonly version?: string | null;
  readonly container?: "vff" | "legacy" | "unknown";
  readonly byteLength?: number;
}

function utf16le(text: string): number[] {
  return Array.from(text).flatMap((character) => {
    const code = character.charCodeAt(0);
    return [code & 0xff, code >> 8];
  });
}

export function createSkpHeaderBytes(options: SkpHeaderOptions = {}): Uint8Array {
  const version = options.version === undefined ? "{21.0.339}" : options.version;
  const bytes: number[] = [0xff, 0xfe, 0xff, 0x0e, ...utf16le("SketchUp Model")];
  if (version !== null) bytes.push(0xff, 0xfe, 0xff, version.length, ...utf16le(version));
  const container = options.container ?? "vff";
  if (container === "vff") bytes.push(0x50, 0x4b, 0x03, 0x04);
  if (container === "legacy") bytes.push(...Array.from("CVersionMap", (character) => character.charCodeAt(0)));
  const output = new Uint8Array(Math.max(options.byteLength ?? 256, bytes.length));
  output.set(bytes);
  return output;
}

export interface ZipIndexEntry {
  readonly name: string;
  /** 중앙 디렉터리에 선언할 압축 해제 크기. 데이터는 만들지 않는다. */
  readonly uncompressedSize: number;
}

export interface ZipIndexOptions {
  /** 끝 기록 뒤에 붙일 ZIP 주석 길이. */
  readonly commentBytes?: number;
  /** true 면 첫 항목의 크기 칸을 ZIP64 표식(0xFFFFFFFF)으로 쓴다. */
  readonly zip64FirstEntry?: boolean;
  /** 앞쪽 로컬 헤더와 중앙 디렉터리 사이에 채울 바이트 수(큰 파일을 흉내 낸다). */
  readonly dataBytes?: number;
}

const ZIP_LOCAL_HEADER_BYTES = 30;

/**
 * 로컬 헤더 서명, 가짜 데이터, 중앙 디렉터리, 끝 기록만 갖춘 최소 ZIP 바이트. 오프셋은 이 바이트열의 시작을 기준으로
 * 쓴다(VFF 안의 ZIP 이 그렇다). 압축 해제 크기 판독 테스트용이며 실제로 풀 수는 없다.
 */
export function createZipIndexBytes(entries: readonly ZipIndexEntry[], options: ZipIndexOptions = {}): Uint8Array {
  const encoder = new TextEncoder();
  const names = entries.map((entry) => encoder.encode(entry.name));
  const dataBytes = options.dataBytes ?? 0;
  const directoryOffset = ZIP_LOCAL_HEADER_BYTES + dataBytes;
  const directorySize = names.reduce((sum, name) => sum + 46 + name.byteLength, 0);
  const commentBytes = options.commentBytes ?? 0;
  const output = new Uint8Array(directoryOffset + directorySize + 22 + commentBytes);
  const view = new DataView(output.buffer);
  output.set([0x50, 0x4b, 0x03, 0x04], 0);
  let offset = directoryOffset;
  entries.forEach((entry, index) => {
    view.setUint32(offset, 0x02014b50, true);
    const size = options.zip64FirstEntry === true && index === 0 ? 0xffff_ffff : entry.uncompressedSize;
    view.setUint32(offset + 24, size, true);
    view.setUint16(offset + 28, names[index].byteLength, true);
    output.set(names[index], offset + 46);
    offset += 46 + names[index].byteLength;
  });
  const end = directoryOffset + directorySize;
  view.setUint32(end, 0x06054b50, true);
  view.setUint16(end + 10, entries.length, true);
  view.setUint32(end + 12, directorySize, true);
  view.setUint32(end + 16, directoryOffset, true);
  view.setUint16(end + 20, commentBytes, true);
  return output;
}

/**
 * 2021 이후(VFF) 형식을 흉내 낸 바이트: 실제 헤더 + 중앙 디렉터리만 있는 ZIP. model.dat 의 선언 크기를 정할 수 있다.
 * 변환기(가짜 모듈) 앞단의 사전 검사를 시험하는 데만 쓴다.
 */
export function createSkpVffBytes(
  entries: readonly ZipIndexEntry[] = [{ name: "model.dat", uncompressedSize: 4096 }],
  options: ZipIndexOptions & { readonly version?: string | null } = {},
): Uint8Array {
  const header = createSkpHeaderBytes({
    version: options.version === undefined ? "{21.0.339}" : options.version,
    container: "unknown",
    byteLength: 0,
  });
  const zip = createZipIndexBytes(entries, options);
  const output = new Uint8Array(header.byteLength + zip.byteLength);
  output.set(header, 0);
  output.set(zip, header.byteLength);
  return output;
}

/** UTF-16LE 로 들어 있는 같은 길이의 문자열을 처음 한 곳만 바꾼 복사본을 돌려준다(버전 문자열 변조 등). */
export function replaceUtf16Text(bytes: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error("바꿀 문자열의 길이가 같아야 합니다.");
  const needle = utf16le(from);
  const output = bytes.slice();
  for (let start = 0; start + needle.length <= output.length; start += 1) {
    if (needle.every((value, offset) => output[start + offset] === value)) {
      output.set(utf16le(to), start);
      return output;
    }
  }
  throw new Error("바꿀 문자열을 찾지 못했습니다.");
}

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

export interface SyntheticGlbOptions {
  readonly nodes?: readonly Record<string, unknown>[];
  readonly scenes?: readonly Record<string, unknown>[];
  readonly scene?: number;
  readonly assetVersion?: string;
  readonly bin?: Uint8Array | null;
  /** JSON 에 합칠 추가 최상위 키(메시·접근자 등). */
  readonly extra?: Record<string, unknown>;
}

export function createSyntheticGlb(options: SyntheticGlbOptions = {}): Uint8Array {
  const json = {
    asset: { version: options.assetVersion ?? "2.0", generator: "test-fixture" },
    scene: options.scene ?? 0,
    scenes: options.scenes ?? [{ nodes: [0] }],
    nodes: options.nodes ?? [{ mesh: 0 }],
    ...options.extra,
  };
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonBytes = new Uint8Array(Math.ceil(encoded.byteLength / 4) * 4).fill(0x20);
  jsonBytes.set(encoded);
  const bin = options.bin === undefined ? new Uint8Array(8).fill(7) : options.bin;
  const total = 12 + 8 + jsonBytes.byteLength + (bin ? 8 + bin.byteLength : 0);
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  output.set(jsonBytes, 20);
  if (bin) {
    const offset = 20 + jsonBytes.byteLength;
    view.setUint32(offset, bin.byteLength, true);
    view.setUint32(offset + 4, BIN_CHUNK, true);
    output.set(bin, offset + 8);
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** GLB 의 JSON 청크를 읽는다(테스트 검증용). */
export function readGlbJson(glb: Uint8Array): Record<string, unknown> {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const length = view.getUint32(12, true);
  const text = new TextDecoder().decode(glb.subarray(20, 20 + length));
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error("GLB JSON 루트가 객체가 아닙니다.");
  return parsed;
}

type Vec3 = readonly [number, number, number];

const BOX_FACES: readonly { readonly n: Vec3; readonly u: Vec3; readonly v: Vec3 }[] = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

export interface BoxPrimitiveOptions {
  readonly size?: number;
  readonly origin?: Vec3;
  readonly materialIndex?: number;
  /** 와인딩과 법선을 반대로 만들 면 번호(0..5). 한 면이 뒤집힌 상자를 만든다. */
  readonly reversedFaces?: readonly number[];
  readonly geomName?: string;
}

/** 변 길이 size 의 상자. 면마다 정점 4개(분리), 삼각형 12개, 법선은 바깥쪽. */
export function createBoxPrimitive(options: BoxPrimitiveOptions = {}): StudioBg3dSkpPrimitive {
  const size = options.size ?? 1;
  const [ox, oy, oz] = options.origin ?? [0, 0, 0];
  const half = size / 2;
  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const uvs = new Float32Array(24 * 2);
  const indices = new Uint32Array(36);
  BOX_FACES.forEach((face, faceIndex) => {
    const reversed = options.reversedFaces?.includes(faceIndex) === true;
    const center = [ox + half + face.n[0] * half, oy + half + face.n[1] * half, oz + half + face.n[2] * half];
    const corners: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    corners.forEach(([a, b], cornerIndex) => {
      const vertex = faceIndex * 4 + cornerIndex;
      for (let axis = 0; axis < 3; axis += 1) {
        positions[vertex * 3 + axis] = center[axis] + a * half * face.u[axis] + b * half * face.v[axis];
        normals[vertex * 3 + axis] = (reversed ? -1 : 1) * face.n[axis];
      }
      uvs[vertex * 2] = (a + 1) / 2;
      uvs[vertex * 2 + 1] = (b + 1) / 2;
    });
    const base = faceIndex * 4;
    const triangles = reversed
      ? [base, base + 2, base + 1, base, base + 3, base + 2]
      : [base, base + 1, base + 2, base, base + 2, base + 3];
    indices.set(triangles, faceIndex * 6);
  });
  return {
    positions,
    normals,
    uvs,
    indices,
    materialIndex: options.materialIndex ?? 0,
    geomName: options.geomName ?? "mesh_box",
  };
}

export interface FakeSkpCalls {
  readonly build: { readonly source: ArrayBuffer; readonly options: unknown }[];
  readonly toGlb: { readonly scene: unknown; readonly options: unknown }[];
  parse: number;
}

export interface FakeSkpModuleOptions {
  readonly scene?: unknown;
  /** undefined 면 parseSkp 를 제공하지 않는다. */
  readonly model?: unknown;
  readonly parseError?: unknown;
  readonly buildError?: unknown;
  readonly toGlbError?: unknown;
  /** toGLB 가 돌려줄 값. 생략하면 합성 GLB. */
  readonly glb?: Uint8Array | ArrayBuffer;
  /** buildScene 이 진행 콜백을 부르도록 한다. */
  readonly progress?: readonly { readonly stage: string; readonly current: number; readonly total: number }[];
}

export function createFakeOpenSkpModule(options: FakeSkpModuleOptions = {}): {
  readonly module: OpenSkpModuleLike;
  readonly calls: FakeSkpCalls;
} {
  const calls: FakeSkpCalls = { build: [], toGlb: [], parse: 0 };
  const scene = options.scene ?? { glbPrimitives: [createBoxPrimitive()], gltfMaterials: [{}], textures: [] };
  const module: OpenSkpModuleLike = {
    buildScene: (source, buildOptions) => {
      calls.build.push({ source, options: buildOptions });
      for (const entry of options.progress ?? []) buildOptions?.onProgress?.(entry);
      if (options.buildError !== undefined) throw options.buildError;
      return scene;
    },
    toGLB: (value, glbOptions) => {
      calls.toGlb.push({ scene: value, options: glbOptions });
      if (options.toGlbError !== undefined) throw options.toGlbError;
      return options.glb ?? createSyntheticGlb();
    },
    ...(options.model === undefined && options.parseError === undefined
      ? {}
      : {
        parseSkp: () => {
          calls.parse += 1;
          if (options.parseError !== undefined) throw options.parseError;
          return options.model;
        },
      }),
  };
  return { module, calls };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.byteLength);
  body.set(new TextEncoder().encode(type));
  body.set(data, 4);
  const chunk = new Uint8Array(12 + data.byteLength);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.byteLength, false);
  chunk.set(body, 4);
  view.setUint32(8 + data.byteLength, crc32(body), false);
  return chunk;
}

/** 코드로 만든 단색 RGB PNG(저작권 있는 이미지 바이트 없음). */
export function createPngBytes(width = 4, height = 4, rgb: Vec3 = [200, 80, 40]): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  header.set([8, 2, 0, 0, 0], 8);
  const row = new Uint8Array(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set(rgb, 1 + x * 3);
  const raw = new Uint8Array(row.byteLength * height);
  for (let y = 0; y < height; y += 1) raw.set(row, y * row.byteLength);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

/**
 * 스키마를 통과하는 보고서 v1 (SketchUp 2021 파일, 의자 컴포넌트 하나, 크기 정상, 경고 없음).
 * 필요한 부분만 overrides 로 바꾼다. 값은 매 호출마다 새로 만든다.
 */
export function createSkpReportFixture(
  overrides: Partial<StudioBg3dSkpImportReport> = {},
): StudioBg3dSkpImportReport {
  return {
    version: 1,
    kind: "toonstudio-bg3d-skp-import-report",
    source: {
      byteSize: 120_000,
      container: "vff",
      sketchupVersion: "21.0.339",
      sketchupMajor: 21,
      sketchupLabel: "SketchUp 2021",
      declaredUnits: "Inches",
    },
    conversion: {
      converter: "openskp",
      execution: "worker",
      elapsedMs: 420,
      textures: "none",
      metadataPass: "done",
      hiddenFacesExcluded: true,
      primitivesBeforeMerge: 12,
      primitivesAfterMerge: 2,
    },
    coordinates: {
      sourceUnit: "inch",
      outputUnit: "meter",
      metersPerSourceUnit: 0.0254,
      sourceUpAxis: "z",
      outputUpAxis: "y",
    },
    units: { appliedUnit: "inch", scaleFactor: 1, userSelected: false },
    size: {
      openSkpMeters: [2.54, 1.27, 2.54],
      meters: [2.54, 1.27, 2.54],
      maxExtentMeters: 2.54,
      level: "ok",
      recommendedUnit: null,
    },
    counts: {
      sourceFaces: 40,
      vertices: 160,
      triangles: 80,
      materials: 2,
      textures: 0,
      texturesReferenced: 0,
      instances: 3,
    },
    names: {
      components: { available: true, items: ["Chair"], total: 1, truncated: false },
      tags: { available: true, items: ["Layer0", "Furniture"], total: 2, truncated: false },
      scenes: { available: true, items: ["Scene 1"], total: 1, truncated: false },
    },
    warnings: [],
    ...overrides,
  };
}
