/**
 * GLB 균일 배율 적용 — 장면 루트 노드들을 배율이 있는 부모 노드 하나로 감싼다.
 *
 * 단위 재적용은 형상 바이너리를 건드리지 않고 JSON 청크만 다시 쓴다. 그래서 변환을 다시 하지 않고도
 * 거의 즉시 끝나며, 정점 버퍼·접근자·텍스처는 한 바이트도 바뀌지 않는다. 결과 GLB 는 glTF 표준
 * 노드 변환만 쓰므로 어떤 로더(three.js GLTFLoader 포함)에서도 같은 크기로 읽힌다.
 *
 * 입력은 OpenSKP 가 만든 정적 GLB 를 전제하지만, GLB 컨테이너 규칙(헤더·청크 길이·4바이트 정렬)은
 * 일반적으로 검증해 어긋나면 skp-parse-failed 로 실패한다.
 */

import { StudioBg3dSkpParseError } from "./studio-bg3d-skp-contract";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_JSON_CHUNK = 0x4e4f534a;
const JSON_PAD_BYTE = 0x20;

/** 배율 노드의 이름. 보관된 GLB 에서 단위 보정으로 추가된 노드임을 알아볼 수 있게 한다. */
export const STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME = "SKP_unit_scale";

function invalidGlb(message: string): StudioBg3dSkpParseError {
  return new StudioBg3dSkpParseError(message, { reason: "invalid-output" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Array.isArray 는 any[] 로 좁히므로 unknown[] 로 좁히는 가드를 따로 둔다. */
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

interface GlbChunk {
  readonly type: number;
  readonly data: Uint8Array;
}

function readChunks(glb: Uint8Array): readonly GlbChunk[] {
  if (glb.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) throw invalidGlb("GLB 헤더가 너무 짧습니다.");
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw invalidGlb("GLB 매직이 올바르지 않습니다.");
  if (view.getUint32(4, true) !== GLB_VERSION) throw invalidGlb("GLB 버전 2만 지원합니다.");
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== glb.byteLength) throw invalidGlb("GLB 선언 길이가 실제 길이와 다릅니다.");
  const chunks: GlbChunk[] = [];
  let offset = GLB_HEADER_BYTES;
  while (offset < glb.byteLength) {
    if (offset + GLB_CHUNK_HEADER_BYTES > glb.byteLength) throw invalidGlb("GLB 청크 헤더가 잘렸습니다.");
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + GLB_CHUNK_HEADER_BYTES;
    if (length % 4 !== 0 || start + length > glb.byteLength) throw invalidGlb("GLB 청크 길이가 올바르지 않습니다.");
    chunks.push({ type, data: glb.subarray(start, start + length) });
    offset = start + length;
  }
  return chunks;
}

function encodeJsonChunk(json: unknown): Uint8Array {
  const text = JSON.stringify(json);
  const encoded = new TextEncoder().encode(text);
  const padded = new Uint8Array(Math.ceil(encoded.byteLength / 4) * 4).fill(JSON_PAD_BYTE);
  padded.set(encoded);
  return padded;
}

function writeGlb(chunks: readonly GlbChunk[]): Uint8Array {
  const total = chunks.reduce(
    (sum, chunk) => sum + GLB_CHUNK_HEADER_BYTES + chunk.data.byteLength,
    GLB_HEADER_BYTES,
  );
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, total, true);
  let offset = GLB_HEADER_BYTES;
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.data.byteLength, true);
    view.setUint32(offset + 4, chunk.type, true);
    output.set(chunk.data, offset + GLB_CHUNK_HEADER_BYTES);
    offset += GLB_CHUNK_HEADER_BYTES + chunk.data.byteLength;
  }
  return output;
}

function readJsonRoot(chunks: readonly GlbChunk[]): Record<string, unknown> {
  if (chunks.length === 0 || chunks[0].type !== GLB_JSON_CHUNK) throw invalidGlb("첫 청크가 JSON 이 아닙니다.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(chunks[0].data));
  } catch {
    throw invalidGlb("GLB JSON 청크를 읽지 못했습니다.");
  }
  if (!isRecord(parsed)) throw invalidGlb("GLB JSON 루트가 객체가 아닙니다.");
  return parsed;
}

/**
 * 변환기가 돌려준 바이트가 GLB 2.0 컨테이너인지 확인한다: 매직·버전·선언 길이·청크 정렬, 첫 JSON
 * 청크의 해석, asset.version "2.0". 깊은 구조 검사는 가져오기 뒤 GLB 검증 관문이 맡는다.
 */
export function assertStudioBg3dSkpGlbContainer(glb: Uint8Array): void {
  const root = readJsonRoot(readChunks(glb));
  const asset = root.asset;
  if (!isRecord(asset) || asset.version !== "2.0") throw invalidGlb("GLB asset.version 이 2.0 이 아닙니다.");
}

function wrapSceneRoots(root: Record<string, unknown>, factor: number): void {
  const scenes = root.scenes;
  const nodes = root.nodes;
  if (!isUnknownArray(scenes) || !isUnknownArray(nodes) || scenes.length === 0) {
    throw invalidGlb("배율을 적용할 장면 또는 노드가 없습니다.");
  }
  const sceneIndex = typeof root.scene === "number" && Number.isSafeInteger(root.scene) ? root.scene : 0;
  const scene: unknown = scenes[sceneIndex];
  if (!isRecord(scene) || !isUnknownArray(scene.nodes) || scene.nodes.length === 0) {
    throw invalidGlb("배율을 적용할 장면 루트 노드가 없습니다.");
  }
  const referencesValidNodes = scene.nodes.every(
    (index) => typeof index === "number" && Number.isSafeInteger(index) && index >= 0 && index < nodes.length,
  );
  if (!referencesValidNodes) throw invalidGlb("장면 루트가 존재하지 않는 노드를 가리킵니다.");
  const wrapperIndex = nodes.length;
  nodes.push({
    name: STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME,
    scale: [factor, factor, factor],
    children: [...scene.nodes],
  });
  scene.nodes = [wrapperIndex];
}

/**
 * GLB 의 모든 장면 루트를 균일 배율 노드 하나로 감싼 새 GLB 를 돌려준다.
 * 배율이 1이면 입력을 그대로 돌려주고, 유한한 양수가 아니면 TypeError 로 거부한다(호출 오류).
 */
export function scaleStudioBg3dGlbUniformly(glb: Uint8Array, factor: number): Uint8Array {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new TypeError("studio-bg3d-skp-glb-scale:invalid-factor");
  }
  if (factor === 1) return glb;
  const chunks = readChunks(glb);
  const root = readJsonRoot(chunks);
  wrapSceneRoots(root, factor);
  return writeGlb([{ type: GLB_JSON_CHUNK, data: encodeJsonChunk(root) }, ...chunks.slice(1)]);
}
