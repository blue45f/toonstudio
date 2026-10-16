/**
 * Godot 공간 배경 GLB의 서버 측 형식 검증 (순수 함수 — 테스트로 고정).
 *
 * 배경의 유일한 소비자는 Godot 4.4.1 무대의 GLTFDocument 런타임
 * 로더(bg_stage.gd)다. 로더가 읽지 못하는 파일을 받아 두면 무대는
 * 조용히 폴백 드로잉으로 떨어지고 편집자는 이유를 알 수 없다 —
 * 그래서 "구조적으로 유효한 GLB"가 아니라 "Godot가 실제로 읽는
 * GLB"를 업로드 경계에서 판정한다.
 *
 * 로드 가능 판정의 근거 (2026-10-12 헤드리스 실측,
 * GLTFDocument.append_from_buffer):
 * - required 확장 없음 (카탈로그 배경): 로드 OK.
 * - EXT_texture_webp required (Blender s2-resize 변형): 로드 OK —
 *   webp는 Godot가 지원하므로 금지 목록에 넣지 않는다.
 * - EXT_meshopt_compression·KHR_mesh_quantization required
 *   (three.js용 최적화본): 로드 실패 — "required extension is
 *   not supported" 오류로 append 자체가 거절된다.
 * - KHR_draco_mesh_compression·KHR_texture_basisu(meshopt·KTX2와
 *   함께 4단계 전제 실측에서 실패 확정): 같은 사유로 금지.
 */

export const GODOT_SPACE_BACKGROUND_MAX_BYTES = 20 * 1024 * 1024;

/**
 * 작품당 보관 상한. 페이로드가 DB bytea 로 저장되므로 파일 하나의 상한(위)만으로는 업로드를
 * 반복하는 계정이 DB 용량을 끝없이 쓸 수 있다. 실파일은 6~14MB 이고 한 방에 몇 장이면 충분해
 * 정상 사용에는 닿지 않는 값으로 잡았고, 넘으면 안 쓰는 배경을 지운 뒤 올리게 한다.
 */
export const GODOT_SPACE_BACKGROUND_MAX_ASSETS_PER_WORK = 12;
export const GODOT_SPACE_BACKGROUND_MAX_TOTAL_BYTES_PER_WORK = 100 * 1024 * 1024;

/**
 * 용량 상한의 근거: 로드 가능 실파일 최대는 무압축 교실본
 * 13.9MB(s2a-resize1024), 카탈로그 방 배경 6.7MB, Blender 방·거리
 * 무압축 계열 6.8~8.1MB다. 20MB는 그 전부에 여유를 두면서도
 * DB blob 저장과 무대 HTTP 로드(60초 타임아웃)의 부담을
 * bounded로 유지하는 값이다.
 */
export const GODOT_BACKGROUND_UNSUPPORTED_REQUIRED_EXTENSIONS = [
  "EXT_meshopt_compression",
  "KHR_mesh_quantization",
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
] as const;

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

export type GodotBackgroundGlbVerdict =
  | { readonly ok: true; readonly extensionsUsed: readonly string[] }
  | { readonly ok: false; readonly reason: string };

function fail(reason: string): GodotBackgroundGlbVerdict {
  return { ok: false, reason };
}

export function validateGodotBackgroundGlb(
  bytes: Uint8Array,
): GodotBackgroundGlbVerdict {
  if (bytes.byteLength === 0) {
    return fail("빈 파일입니다. GLB 파일을 올려 주세요.");
  }
  if (bytes.byteLength > GODOT_SPACE_BACKGROUND_MAX_BYTES) {
    return fail(
      `배경 GLB는 최대 ${GODOT_SPACE_BACKGROUND_MAX_BYTES / (1024 * 1024)}MB까지 올릴 수 있습니다 (현재 ${(bytes.byteLength / (1024 * 1024)).toFixed(1)}MB).`,
    );
  }
  if (bytes.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) {
    return fail("GLB 헤더를 읽을 수 없습니다. 손상된 파일이거나 GLB 형식이 아닙니다.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    return fail("GLB 파일이 아닙니다 (매직 바이트 불일치). .glb 바이너리 파일을 올려 주세요.");
  }
  if (view.getUint32(4, true) !== GLB_VERSION) {
    return fail("glTF 2.0 GLB만 올릴 수 있습니다 (버전 필드 불일치).");
  }
  if (view.getUint32(8, true) !== bytes.byteLength) {
    return fail("GLB 선언 길이와 실제 파일 크기가 다릅니다. 전송 중 잘렸거나 손상된 파일입니다.");
  }

  // 첫 청크는 반드시 JSON 청크여야 한다 (glTF 2.0 바이너리 규격).
  const jsonChunkLength = view.getUint32(HEADER_BYTES, true);
  if (view.getUint32(HEADER_BYTES + 4, true) !== CHUNK_TYPE_JSON) {
    return fail("GLB의 첫 청크가 JSON 청크가 아닙니다.");
  }
  const jsonStart = HEADER_BYTES + CHUNK_HEADER_BYTES;
  const jsonEnd = jsonStart + jsonChunkLength;
  if (jsonEnd > bytes.byteLength) {
    return fail("GLB JSON 청크가 파일 범위를 벗어납니다. 손상된 파일입니다.");
  }

  let document: {
    asset?: { version?: unknown };
    extensionsRequired?: unknown;
    extensionsUsed?: unknown;
    meshes?: unknown;
  };
  try {
    const jsonText = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(jsonStart, jsonEnd),
    );
    document = JSON.parse(jsonText) as typeof document;
  } catch {
    return fail("GLB JSON 청크를 해석할 수 없습니다. 손상된 파일입니다.");
  }

  const version = document.asset?.version;
  if (typeof version !== "string" || !version.startsWith("2")) {
    return fail("glTF 2.0 문서만 올릴 수 있습니다 (asset.version 불일치).");
  }

  // 나머지 청크를 끝까지 걸어 정합성을 확인하고 BIN 청크 존재를 본다.
  let offset = jsonEnd;
  let hasBinaryChunk = false;
  while (offset < bytes.byteLength) {
    if (offset + CHUNK_HEADER_BYTES > bytes.byteLength) {
      return fail("GLB 청크 헤더가 파일 끝을 벗어납니다. 손상된 파일입니다.");
    }
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    if (chunkType === CHUNK_TYPE_BIN) hasBinaryChunk = true;
    offset += CHUNK_HEADER_BYTES + chunkLength;
    if (offset > bytes.byteLength) {
      return fail("GLB 청크 길이가 파일 범위를 벗어납니다. 손상된 파일입니다.");
    }
  }
  if (offset !== bytes.byteLength) {
    return fail("GLB 청크 합계가 파일 크기와 다릅니다. 손상된 파일입니다.");
  }
  if (!hasBinaryChunk) {
    return fail("지오메트리 데이터(BIN 청크)가 없는 GLB입니다. 배경으로 쓸 수 없습니다.");
  }
  if (!Array.isArray(document.meshes) || document.meshes.length === 0) {
    return fail("메시가 없는 GLB입니다. 배경으로 쓸 장면이 없습니다.");
  }

  const extensionsUsed = Array.isArray(document.extensionsUsed)
    ? document.extensionsUsed.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const extensionsRequired = Array.isArray(document.extensionsRequired)
    ? document.extensionsRequired.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const unsupported = extensionsRequired.filter((name) =>
    (GODOT_BACKGROUND_UNSUPPORTED_REQUIRED_EXTENSIONS as readonly string[]).includes(name),
  );
  if (unsupported.length > 0) {
    return fail(
      `이 GLB는 Godot 무대가 읽을 수 없는 압축 확장(${unsupported.join(", ")})을 필수로 요구합니다. meshopt·Draco·KTX2 압축을 해제하고 텍스처 1024 이하의 무압축 GLB로 다시보내기해 올려 주세요.`,
    );
  }

  return { ok: true, extensionsUsed };
}
