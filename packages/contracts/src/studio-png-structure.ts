const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function fail(detail: string): never { throw new Error(`PNG 검증 실패: ${detail}`); }
export function inspectStudioPngStructure(bytes: Uint8Array, width: number, height: number): void {
  if (bytes.byteLength < 57 || SIGNATURE.some((value, index) => bytes[index] !== value)) fail("PNG 서명·길이가 올바르지 않습니다.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, idat = false, idatBytes = 0, idatEnded = false, palette = false, colorType = -1;
  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 12) fail("PNG 블록이 잘렸습니다.");
    const length = view.getUint32(offset, false), end = offset + 12 + length;
    if (end > bytes.byteLength) fail("PNG 블록 경계가 올바르지 않습니다.");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/u.test(type)) fail("PNG 블록 이름이 올바르지 않습니다.");
    let crc = 0xffffffff;
    for (let index = offset + 4; index < end - 4; index += 1) crc = CRC[(crc ^ bytes[index]) & 255] ^ crc >>> 8;
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end - 4, false)) fail("PNG CRC가 다릅니다.");
    if (offset === 8) {
      if (type !== "IHDR" || length !== 13 || view.getUint32(offset + 8, false) !== width
        || view.getUint32(offset + 12, false) !== height) fail("PNG IHDR 크기가 영수증과 다릅니다.");
      const depth = bytes[offset + 16]; colorType = bytes[offset + 17];
      const depths: Readonly<Record<number, readonly number[]>> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[colorType]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0
        || (bytes[offset + 20] !== 0 && bytes[offset + 20] !== 1)) fail("PNG IHDR 형식이 올바르지 않습니다.");
    } else if (type === "IHDR") fail("PNG IHDR가 중복되었습니다.");
    if (["acTL", "fcTL", "fdAT"].includes(type)) fail("움직이는 PNG는 6패스 본문으로 저장할 수 없습니다.");
    if (type === "PLTE") {
      if (idat || palette || length < 3 || length > 768 || length % 3 !== 0) fail("PNG 팔레트가 올바르지 않습니다.");
      palette = true;
    }
    if (type === "IDAT") {
      if (idatEnded || (colorType === 3 && !palette)) fail("PNG 픽셀 블록 순서가 올바르지 않습니다.");
      idat = true; idatBytes += length;
    } else if (idat) idatEnded = true;
    if (type === "IEND") {
      if (length !== 0 || !idat || idatBytes === 0 || end !== bytes.byteLength) fail("PNG 종료·픽셀 블록이 올바르지 않습니다.");
      return;
    }
    if (!['IHDR', 'PLTE', 'IDAT'].includes(type) && /^[A-Z]/u.test(type)) fail("알 수 없는 필수 PNG 블록입니다.");
    offset = end;
  }
  fail("PNG 종료 블록이 없습니다.");
}
