const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const GLB_MAX_JSON_BYTES = 2 * 1024 * 1024;
export const GLB_METADATA_PREFIX_LIMIT = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + GLB_MAX_JSON_BYTES;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseGlbJson(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) {
    throw new Error("3D 에셋 파일이 완전하지 않습니다.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== GLB_VERSION) {
    throw new Error("GLB 2.0 형식만 사용할 수 있습니다.");
  }
  if (view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error("3D 에셋의 선언 길이와 실제 크기가 다릅니다.");
  }
  let chunkOffset = GLB_HEADER_BYTES;
  let jsonChunks = 0;
  let binaryChunks = 0;
  while (chunkOffset < bytes.byteLength) {
    if (bytes.byteLength - chunkOffset < GLB_CHUNK_HEADER_BYTES) {
      throw new Error("3D 에셋 내부 블록이 완전하지 않습니다.");
    }
    const chunkLength = view.getUint32(chunkOffset, true);
    const chunkType = view.getUint32(chunkOffset + 4, true);
    const chunkEnd = chunkOffset + GLB_CHUNK_HEADER_BYTES + chunkLength;
    if (chunkLength % 4 !== 0 || chunkEnd > bytes.byteLength) {
      throw new Error("3D 에셋 내부 블록 경계가 올바르지 않습니다.");
    }
    if (chunkType === GLB_JSON_CHUNK) jsonChunks += 1;
    else if (chunkType === GLB_BIN_CHUNK) binaryChunks += 1;
    else throw new Error("지원하지 않는 3D 에셋 내부 블록이 있습니다.");
    if (
      jsonChunks > 1 ||
      binaryChunks > 1 ||
      (chunkOffset === GLB_HEADER_BYTES && chunkType !== GLB_JSON_CHUNK)
    ) {
      throw new Error("3D 에셋 내부 블록 구성이 올바르지 않습니다.");
    }
    chunkOffset = chunkEnd;
  }
  if (chunkOffset !== bytes.byteLength || jsonChunks !== 1) {
    throw new Error("3D 에셋 장면 블록이 없습니다.");
  }
  return parseAdmittedGlbJsonPrefix(bytes);
}

/** 업로드 검증을 마친 불변 GLB에서 장면 설명만 읽는다. 바이너리 메시 블록은 필요 없다. */
export function parseAdmittedGlbJsonPrefix(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) throw new Error("3D 에셋 장면 헤더가 없습니다.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(GLB_HEADER_BYTES, true);
  const jsonType = view.getUint32(GLB_HEADER_BYTES + 4, true);
  if (
    jsonType !== GLB_JSON_CHUNK ||
    jsonLength < 2 ||
    jsonLength > GLB_MAX_JSON_BYTES ||
    GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonLength > bytes.byteLength
  ) {
    throw new Error("3D 에셋 장면 설명이 올바르지 않습니다.");
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes.subarray(GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES, GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonLength));
    let contentEnd = decoded.length;
    while (contentEnd > 0) {
      const code = decoded.charCodeAt(contentEnd - 1);
      if (code !== 0 && code !== 32) break;
      contentEnd -= 1;
    }
    decoded = decoded.slice(0, contentEnd);
  } catch {
    throw new Error("3D 에셋 장면 설명의 인코딩이 올바르지 않습니다.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("3D 에셋 장면 설명을 해석할 수 없습니다.");
  }
  if (!plainRecord(parsed) || !plainRecord(parsed.asset) || parsed.asset.version !== "2.0") {
    throw new Error("GLB 2.0 장면 정보가 없습니다.");
  }
  for (const collectionName of ["buffers", "images"] as const) {
    const collection = parsed[collectionName];
    if (!Array.isArray(collection)) continue;
    if (collection.some((entry) => plainRecord(entry) && typeof entry.uri === "string")) {
      throw new Error("외부 리소스를 참조하는 3D 에셋은 사용할 수 없습니다.");
    }
  }
  return parsed;
}

export function isVrmDocument(document: Record<string, unknown>): boolean {
  const extensionsUsed = Array.isArray(document.extensionsUsed)
    ? document.extensionsUsed.filter((value): value is string => typeof value === "string")
    : [];
  const extensions = plainRecord(document.extensions) ? document.extensions : {};
  return (
    extensionsUsed.includes("VRM") ||
    extensionsUsed.includes("VRMC_vrm") ||
    Object.hasOwn(extensions, "VRM") ||
    Object.hasOwn(extensions, "VRMC_vrm")
  );
}
