import type { ReviewPenStroke } from "./review-pen";

const utf8 = new TextEncoder();
const quotedBytes = (value: string): number => utf8.encode(JSON.stringify(value)).byteLength;
const sequenceBytes = (count: number): number => 2 + Math.max(0, count - 1) * 2;
const objectSyntaxBytes = (keys: readonly string[]): number => sequenceBytes(keys.length)
  + keys.reduce((total, key) => total + quotedBytes(key) + 2, 0);
const POINT_SYNTAX_BYTES = objectSyntaxBytes(["x", "y"]);
const STROKE_SYNTAX_BYTES = objectSyntaxBytes(["id", "points", "color", "width"]);

/** JSON.stringify의 최단 숫자를 PostgreSQL JSONB가 지수 없이 출력하는 길이로 계산한다. */
export function reviewPenNumberStorageByteLength(value: number): number {
  if (!Number.isFinite(value)) return Infinity;
  const shortest = JSON.stringify(value);
  const exponentAt = shortest.indexOf("e");
  if (exponentAt === -1) return shortest.length;
  const coefficient = shortest.slice(0, exponentAt);
  const signBytes = coefficient.startsWith("-") ? 1 : 0;
  const unsigned = coefficient.slice(signBytes);
  const decimalAt = unsigned.indexOf(".");
  const digits = unsigned.length - (decimalAt === -1 ? 0 : 1);
  const decimalPosition = (decimalAt === -1 ? unsigned.length : decimalAt)
    + Number(shortest.slice(exponentAt + 1));
  if (decimalPosition <= 0) return signBytes + 2 - decimalPosition + digits;
  if (decimalPosition >= digits) return signBytes + decimalPosition;
  return signBytes + digits + 1;
}

/** 검증된 획의 JSONB text 바이트 수다. 키 순서와 무관하며 ', '·': ' 공백을 포함한다. */
export function reviewPenStrokesStorageByteLength(strokes: readonly ReviewPenStroke[]): number {
  let total = sequenceBytes(strokes.length);
  for (const stroke of strokes) {
    total += STROKE_SYNTAX_BYTES + quotedBytes(stroke.id) + quotedBytes(stroke.color)
      + reviewPenNumberStorageByteLength(stroke.width) + sequenceBytes(stroke.points.length);
    for (const point of stroke.points) {
      total += POINT_SYNTAX_BYTES + reviewPenNumberStorageByteLength(point.x)
        + reviewPenNumberStorageByteLength(point.y);
    }
  }
  return total;
}
