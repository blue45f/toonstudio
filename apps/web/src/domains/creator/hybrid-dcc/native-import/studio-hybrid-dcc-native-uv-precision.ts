/** 좌표계 변환·Float32 확정이 원본 UV에 새 접힘을 만들었는지 선형으로 확인한다. */
export type StudioNativeUvPoint = readonly [number, number];
export class StudioNativeUvPrecisionError extends Error {
  constructor(detail: string) { super(detail); this.name = "StudioNativeUvPrecisionError"; }
}
function fail(detail: string): never { throw new StudioNativeUvPrecisionError(detail); }
function area(a: StudioNativeUvPoint, b: StudioNativeUvPoint, c: StudioNativeUvPoint): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** source는 축 반전 전 원본이다. GLB의 V 반전은 -1, OBJ의 동일 좌표계는 +1을 전달한다. */
export function assertStudioNativeUvPrecision(
  source: readonly StudioNativeUvPoint[],
  target: readonly StudioNativeUvPoint[],
  expectedOrientation: 1 | -1,
): void {
  if (source.length < 3 || source.length !== target.length || (expectedOrientation !== 1 && expectedOrientation !== -1)) {
    fail("UV 정밀도 검증의 원본·변환 코너 순서나 축 방향 계약이 올바르지 않습니다.");
  }
  let sourceMinU = Infinity; let sourceMinV = Infinity; let sourceMaxU = -Infinity; let sourceMaxV = -Infinity;
  let targetMinU = Infinity; let targetMinV = Infinity; let targetMaxU = -Infinity; let targetMaxV = -Infinity;
  for (let index = 0; index < source.length; index += 1) {
    const a = source[index]; const b = source[(index + 1) % source.length];
    const x = target[index]; const y = target[(index + 1) % target.length];
    if (!a || !b || !x || !y || ![...a, ...b, ...x, ...y].every(Number.isFinite)) {
      fail("UV 원본 또는 변환 좌표가 유한하지 않아 보존할 수 없습니다.");
    }
    sourceMinU = Math.min(sourceMinU, a[0]); sourceMinV = Math.min(sourceMinV, a[1]);
    sourceMaxU = Math.max(sourceMaxU, a[0]); sourceMaxV = Math.max(sourceMaxV, a[1]);
    targetMinU = Math.min(targetMinU, x[0]); targetMinV = Math.min(targetMinV, x[1]);
    targetMaxU = Math.max(targetMaxU, x[0]); targetMaxV = Math.max(targetMaxV, x[1]);
    const sourceEdge = Math.hypot(b[0] - a[0], b[1] - a[1]); const targetEdge = Math.hypot(y[0] - x[0], y[1] - x[1]);
    if (!Number.isFinite(sourceEdge) || !Number.isFinite(targetEdge)) fail("UV 모서리 길이가 유한한 표현 범위를 넘었습니다.");
    if (sourceEdge > 0 && targetEdge === 0) fail("원본 UV 모서리가 좌표 변환·Float32 정밀도에서 새로 접혀 가져오기를 취소했습니다.");
  }
  if ((sourceMaxU > sourceMinU && targetMaxU === targetMinU) || (sourceMaxV > sourceMinV && targetMaxV === targetMinV)) {
    fail("원본 UV의 양수 폭 또는 높이가 좌표 변환·Float32 정밀도에서 0이 되어 가져오기를 취소했습니다.");
  }
  const sourceOrigin = source[0]; const targetOrigin = target[0];
  if (!sourceOrigin || !targetOrigin) fail("UV fan의 원본 코너가 없습니다.");
  for (let index = 1; index + 1 < source.length; index += 1) {
    const b = source[index]; const c = source[index + 1]; const y = target[index]; const z = target[index + 1];
    if (!b || !c || !y || !z) fail("UV fan의 원본·변환 코너 수가 일치하지 않습니다.");
    const before = area(sourceOrigin, b, c); const after = area(targetOrigin, y, z);
    if (!Number.isFinite(before) || !Number.isFinite(after)) fail("UV fan 면적이 유한한 표현 범위를 넘었습니다.");
    // 이미 접힌 UV fan·Solidify rim 등은 authoring 입력으로 허용한다.
    if (before !== 0 && (after === 0 || Math.sign(after) !== Math.sign(before) * expectedOrientation)) {
      fail("원본 UV fan의 면적이나 방향이 좌표 변환·Float32 정밀도에서 소실되어 가져오기를 취소했습니다.");
    }
  }
}
