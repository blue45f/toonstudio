const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function writeUint32BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function encodeAscii(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function decodeAscii(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

export function isValidPngBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function buildTextChunk(keyword: string, text: string): Uint8Array {
  const keyBytes = encodeAscii(keyword);
  const textBytes = new TextEncoder().encode(text);
  const dataLen = keyBytes.length + 1 + textBytes.length;
  const chunk = new Uint8Array(4 + 4 + dataLen + 4);

  writeUint32BE(chunk, 0, dataLen);
  chunk.set(encodeAscii("tEXt"), 4);
  chunk.set(keyBytes, 8);
  chunk[8 + keyBytes.length] = 0; // null separator
  chunk.set(textBytes, 8 + keyBytes.length + 1);

  const crcInput = chunk.subarray(4, 8 + dataLen);
  writeUint32BE(chunk, 8 + dataLen, crc32(crcInput));
  return chunk;
}

/**
 * PNG 바이너리의 `IEND` 청크 직전에 `tEXt` Rights BOM 메타데이터 청크를 무손실 삽입한다.
 */
export function injectPngRightsTextChunk(
  pngBytes: Uint8Array,
  keyword: string,
  text: string,
): Uint8Array {
  if (!isValidPngBytes(pngBytes)) {
    throw new Error("유효한 PNG 바이너리 시그니처가 아닙니다.");
  }

  let offset = PNG_SIGNATURE.length;
  let iendOffset = -1;

  while (offset + 12 <= pngBytes.length) {
    const length = readUint32BE(pngBytes, offset);
    const type = decodeAscii(pngBytes.subarray(offset + 4, offset + 8));
    if (type === "IEND") {
      iendOffset = offset;
      break;
    }
    offset += 12 + length;
  }

  if (iendOffset === -1) {
    throw new Error("PNG IEND 청크를 찾을 수 없습니다.");
  }

  const textChunk = buildTextChunk(keyword, text);
  const result = new Uint8Array(pngBytes.length + textChunk.length);
  result.set(pngBytes.subarray(0, iendOffset), 0);
  result.set(textChunk, iendOffset);
  result.set(pngBytes.subarray(iendOffset), iendOffset + textChunk.length);
  return result;
}

/**
 * PNG 바이너리에서 지정한 키워드의 `tEXt` 청크 본문을 추출한다.
 */
export function extractPngRightsTextChunk(
  pngBytes: Uint8Array,
  keyword = "ToonStudioRightsBOM",
): string | null {
  if (!isValidPngBytes(pngBytes)) return null;

  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= pngBytes.length) {
    const length = readUint32BE(pngBytes, offset);
    const type = decodeAscii(pngBytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > pngBytes.length) break;

    if (type === "tEXt") {
      const data = pngBytes.subarray(dataStart, dataEnd);
      const nullIdx = data.indexOf(0);
      if (nullIdx !== -1) {
        const chunkKey = decodeAscii(data.subarray(0, nullIdx));
        if (chunkKey === keyword) {
          return new TextDecoder().decode(data.subarray(nullIdx + 1));
        }
      }
    }
    if (type === "IEND") break;
    offset = dataEnd + 4;
  }

  return null;
}
