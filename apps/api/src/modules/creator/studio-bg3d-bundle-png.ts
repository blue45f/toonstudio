import { inflateSync } from "node:zlib";

/** CRC·IHDR 검증 뒤에만 호출한다. PNG 압축 본문도 선언된 픽셀 예산 안에서 끝까지 해제돼야 한다. */
export function assertStudioBg3dBundlePngPixels(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false), height = view.getUint32(20, false);
  const depth = bytes[24], type = bytes[25], interlaced = bytes[28] === 1;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Readonly<Record<number, number>>)[type];
  if (!channels) throw new Error("지원하지 않는 PNG 색상 형식");
  const passes = interlaced ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
  const rows: { readonly bytes: number; readonly count: number }[] = [];
  let expected = 0;
  for (const [x, y, stepX, stepY] of passes) {
    const passWidth = Math.max(0, Math.ceil((width - x) / stepX)), passHeight = Math.max(0, Math.ceil((height - y) / stepY));
    if (!passWidth || !passHeight) continue;
    const rowBytes = Math.ceil(passWidth * channels * depth / 8);
    expected += (rowBytes + 1) * passHeight; rows.push({ bytes: rowBytes, count: passHeight });
  }
  const segments: Uint8Array[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = view.getUint32(offset, false), end = offset + 12 + length;
    if (bytes[offset + 4] === 73 && bytes[offset + 5] === 68 && bytes[offset + 6] === 65 && bytes[offset + 7] === 84) segments.push(bytes.subarray(offset + 8, end - 4));
    offset = end;
  }
  const decoded = inflateSync(Buffer.concat(segments), { maxOutputLength: expected });
  if (decoded.length !== expected) throw new Error("PNG 압축 픽셀 길이가 IHDR과 다릅니다.");
  let offset = 0;
  for (const row of rows) for (let count = 0; count < row.count; count += 1) {
    if (decoded[offset] > 4) throw new Error("PNG 픽셀 필터가 올바르지 않습니다.");
    offset += row.bytes + 1;
  }
}
