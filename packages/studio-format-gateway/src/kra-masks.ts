/**
 * @file kra-masks.ts
 * @description Krita 마스크의 값(`.pixelselection`) 해석 규칙과, 투명도 마스크를 레이어 RGBA8에 적용하는 순수 함수.
 *
 * 근거(Krita 5.2.2를 블랙박스로 실행해 만든 합성 문서를 관찰했고 소스는 읽지 않았다. 자세한 근거와 대조 결과는
 * `docs/design/krita-kra-reader-observed-2026-10-29.md` 3.1절·3.2절)
 * - 값 파일을 갖는 마스크는 `transparencymask`·`selectionmask`·`filtermask`다. 값 파일은 레이어 타일 파일과 같은 형식
 *   (`VERSION 2`, 64x64 타일, `PIXELSIZE 1`)이고 이름은 `<마스크 filename>.pixelselection`, 타일이 없는 곳의 값은
 *   `<…>.pixelselection.defaultpixel`(1바이트)이다. `transformmask`·`colorizemask`는 값 파일이 없다.
 * - 타일 좌표는 마스크 로컬이고 이미지 좌표는 `<mask>`의 `x`·`y` 속성을 더한 값이다. 마스크를 옮긴 문서를 Krita로 다시 열어 읽은
 *   마스크 값과 투영이 이 해석과 모든 픽셀에서 같았다. 부모 레이어를 옮겨도 마스크의 좌표는 바뀌지 않는다(이미지 좌표 그대로).
 * - 기본값은 보통 0이고 선택을 뒤집은 마스크는 255이며 타일이 0개일 수 있다(전부 선택). 선택을 한 번도 주지 않은 새 투명도 마스크는
 *   값 파일 자체가 없고, 그 문서를 Krita로 다시 열면 빈 선택(전부 0)으로 읽어 레이어를 전부 숨긴다. 값 파일과 `.defaultpixel`이 둘 다
 *   없는 투명도 마스크만 그렇게 해석한다(가져오기 쪽 규칙). 그 밖의 읽지 못한 마스크는 값을 알 수 없다고 보고한다.
 * - 투명도 마스크는 레이어 알파에 `round(알파 * 마스크 / 255)`를 곱한다. 8비트 정수 색 공간(RGBA, GRAYA)에서 (알파, 마스크) 256x256
 *   조합 전부가 Krita의 투영과 같았다. 마스크가 여럿이면 `masks` 목록의 끝(가장 아래)부터 차례로 곱한다(순서가 바뀌면 반올림이
 *   달라 380픽셀이 달랐다). 숨긴 마스크(`visible="0"`)는 적용되지 않았고 선택 마스크는 합성에 영향이 없었다. 색은 그대로 두고 알파가
 *   0이 되면 색도 0으로 만든다: Krita는 미리 곱한 알파로 계산해 색이 조금 달라지지만(미리 곱한 색 기준 1단계 이내) 보이는 결과는
 *   같다. 캔버스 밖에서 Krita의 투영은 마스크를 적용하지 않지만 이 함수는 레이어 전체에 일관되게 적용한다.
 * - 16비트 이상 색 공간은 레이어를 먼저 RGBA8로 줄인 뒤 곱하므로 Krita의 합성 이미지와 알파가 1단계까지 다르다(Krita는 16비트
 *   알파에 곱하고 줄인다).
 * - 필터 마스크의 효과, 변형·색칠 마스크, 그룹 레이어의 마스크(그룹은 픽셀이 없다)는 적용하지 않는다.
 */

import { KraError } from "./kra-types";

import type { KraExtent, KraLayer, KraMask } from "./kra-types";

/** 값 파일(`.pixelselection`)을 갖는 것으로 관찰한 마스크 종류. */
const VALUE_MASK_TYPES: ReadonlySet<string> = new Set(["transparencymask", "selectionmask", "filtermask"]);

export function hasKraMaskValues(nodeType: string): boolean {
  return VALUE_MASK_TYPES.has(nodeType);
}

/**
 * 적용 작업량(픽셀 수 곱하기 실제로 곱하는 마스크 수) 상한. 동기 함수가 호출자의 스레드를 붙잡는 시간을 한정한다(표 조회로 1회에 대략
 * 2~3ns이니 상한에서 1초 안팎). 호출자는 `maxPixelOps` 옵션으로 낮추기만 할 수 있다.
 */
export const KRA_MASK_APPLY_MAX_PIXEL_OPS = 2 ** 28;

export interface KraMaskApplyOptions {
  /** 작업량 상한을 이 값으로 낮춘다(0 이상의 정수, `KRA_MASK_APPLY_MAX_PIXEL_OPS` 이하). */
  readonly maxPixelOps?: number;
}

export interface KraMaskedPixels {
  /** 입력 레이어의 `extent`와 같다. */
  readonly extent: KraExtent;
  /** 투명도 마스크를 곱한 새 RGBA8 버퍼(직선 알파). 입력 버퍼는 바꾸지 않는다. */
  readonly pixels: Uint8Array;
  /** 곱한 투명도 마스크 수(보이는 마스크만, 값이 전부 255인 마스크 포함). */
  readonly appliedMasks: number;
}

/**
 * `applyKraTransparencyMasks`의 결과. 적용할 수 없는 경우를 값으로 구분해서, 호출자가 `result?.pixels ?? layer.pixels` 같은 식으로
 * 마스크를 조용히 건너뛰지 못하게 한다.
 * - `applied`: 마스크를 곱한 픽셀.
 * - `no-pixels`: 레이어에 픽셀이 없다(그룹, 래스터가 아닌 레이어, 읽지 않았거나 읽지 못한 레이어, 타일이 없고 기본 픽셀이 투명한 빈 레이어).
 * - `mask-unreadable`: 보이는 투명도 마스크 중 값을 읽지 못한 것(`defaultValue`가 null)이 있어 결과를 알 수 없다. `maskIndex`는 `layer.masks`의
 *   인덱스다. 이 마스크를 Krita가 어떻게 그릴지는 알 수 없으므로 마스크 없는 픽셀을 대신 쓰면 틀린 그림일 수 있다.
 */
export type KraMaskApplyResult =
  | ({ readonly status: "applied" } & KraMaskedPixels)
  | { readonly status: "no-pixels" }
  | { readonly status: "mask-unreadable"; readonly maskIndex: number };

/** `round(a * m / 255)`를 정수로. 0..255 입력 전체에서 정확하다(테스트가 전수 대조한다). */
function multiply255(a: number, m: number): number {
  const t = a * m + 128;
  return ((t >> 8) + t) >> 8;
}

let multiplyTable: Uint8Array | null = null;

/** `[(마스크 << 8) | 알파] = round(알파 * 마스크 / 255)`. 64KiB이고 처음 쓸 때 한 번 만든다. */
function getMultiplyTable(): Uint8Array {
  if (multiplyTable === null) {
    const table = new Uint8Array(65_536);
    for (let mask = 0; mask < 256; mask += 1) {
      for (let alpha = 0; alpha < 256; alpha += 1) table[(mask << 8) | alpha] = multiply255(alpha, mask);
    }
    multiplyTable = table;
  }
  return multiplyTable;
}

/** 한 픽셀의 알파에 마스크 값을 곱한다(`row`는 마스크 값 << 8). 알파가 0이 되면 색도 0으로 만든다. */
function scalePixel(out: Uint8Array, table: Uint8Array, pixel: number, row: number): void {
  const at = pixel * 4 + 3;
  const alpha = out[at]!;
  const scaled = table[row | alpha]!;
  if (scaled === alpha) return;
  if (scaled === 0) {
    out[at - 3] = 0;
    out[at - 2] = 0;
    out[at - 1] = 0;
  }
  out[at] = scaled;
}

/** `start`부터 `count`개 픽셀의 알파에 같은 마스크 값을 곱한다. */
function scaleRange(out: Uint8Array, table: Uint8Array, start: number, count: number, value: number): void {
  const row = value << 8;
  for (let pixel = start; pixel < start + count; pixel += 1) scalePixel(out, table, pixel, row);
}

/**
 * 레이어의 보이는 투명도 마스크를 알파에 곱한 RGBA8을 돌려준다(`KraMaskApplyResult`). 마스크는 `masks`의 끝에서부터 곱한다. 작업량이
 * 상한(`KRA_MASK_APPLY_MAX_PIXEL_OPS`, 옵션으로 낮출 수 있다)을 넘으면 `limit-exceeded`로 던진다. 동기 함수라 큰 레이어는 호출자의
 * 스레드를 그만큼(상한에서 1초 안팎) 붙잡는다.
 */
export function applyKraTransparencyMasks(layer: Pick<KraLayer, "extent" | "pixels" | "masks">, options?: KraMaskApplyOptions): KraMaskApplyResult {
  const maxPixelOps = options?.maxPixelOps ?? KRA_MASK_APPLY_MAX_PIXEL_OPS;
  if (!Number.isSafeInteger(maxPixelOps) || maxPixelOps < 0 || maxPixelOps > KRA_MASK_APPLY_MAX_PIXEL_OPS) {
    throw new KraError(`maxPixelOps는 0 이상 ${KRA_MASK_APPLY_MAX_PIXEL_OPS} 이하의 정수여야 한다`, "limit-invalid");
  }
  const { extent, pixels } = layer;
  if (extent === null || pixels === null) return { status: "no-pixels" };
  const applicable: KraMask[] = [];
  for (let index = layer.masks.length - 1; index >= 0; index -= 1) {
    const mask = layer.masks[index]!;
    if (mask.nodeType !== "transparencymask" || !mask.visible) continue;
    if (mask.defaultValue === null) return { status: "mask-unreadable", maskIndex: index };
    applicable.push(mask);
  }
  const { width, height } = extent;
  let work = 0;
  for (const mask of applicable) if (mask.values !== null || mask.defaultValue !== 255) work += width * height;
  if (work > maxPixelOps) {
    throw new KraError(`마스크 적용 작업량 ${work}이(가) 한도 ${maxPixelOps}을(를) 넘는다`, "limit-exceeded");
  }
  const out = pixels.slice();
  const table = getMultiplyTable();
  for (const mask of applicable) {
    const outside = mask.defaultValue!;
    const values = mask.values;
    const region = mask.extent;
    if (values === null || region === null) {
      // 타일이 없는 마스크는 어디서나 기본값이다.
      if (outside !== 255) scaleRange(out, table, 0, width * height, outside);
      continue;
    }
    // 마스크 사각형을 레이어 좌표로 옮긴다(이미지 좌표 기준). 열은 반복 범위가 되므로 레이어 안으로 자르고, 행은 비교만 하므로 자르지 않아도 같다.
    const left = Math.max(0, region.x - extent.x);
    const right = Math.min(width, region.x + region.width - extent.x);
    const top = region.y - extent.y;
    const bottom = top + region.height;
    for (let row = 0; row < height; row += 1) {
      const rowStart = row * width;
      if (row < top || row >= bottom || left >= right) {
        if (outside !== 255) scaleRange(out, table, rowStart, width, outside);
        continue;
      }
      if (outside !== 255) {
        scaleRange(out, table, rowStart, left, outside);
        scaleRange(out, table, rowStart + right, width - right, outside);
      }
      const valueStart = (row + extent.y - region.y) * region.width + (left + extent.x - region.x) - left;
      for (let column = left; column < right; column += 1) scalePixel(out, table, rowStart + column, values[valueStart + column]! << 8);
    }
  }
  return { status: "applied", extent, pixels: out, appliedMasks: applicable.length };
}
