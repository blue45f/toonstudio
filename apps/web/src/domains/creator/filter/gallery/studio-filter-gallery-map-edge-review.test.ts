/**
 * 필터 갤러리 · 매핑·가장자리 계열 적대적 리뷰 결함 회귀 시험(2026-10-30).
 *   1. 거리 맵(밝기 기준)이 알파 0 픽셀의 숨은 RGB 휘도로 안·바깥을 판정했다. 앞선 명도 반전처럼 투명 (0,0,0,0) 을
 *      (255,255,255,0) 으로 바꾸는 필터 뒤에서는 투명 영역 전체가 안이 되어, 보이는 사각형의 거리가 실제 경계가 아니라 그림
 *      테두리까지 잰 값이 됐다.
 *   2. 변위(밝기 맵)가 알파 0 픽셀의 숨은 RGB 휘도로 그 출력 픽셀의 변위량을 정해, 어떤 보이는 내용(알파 포함)을 끌어올지가
 *      숨은 값에 따라 달라졌다.
 *   3~5. 범프 맵(높이)·라플라스·이미지 기울기가 알파를 무시한 휘도 평면을 써서, 투명 이웃의 숨은 RGB 가 실루엣의 음영·선·
 *      기울기 크기와 방향 색을 바꿨다.
 * 모두 알파를 곱한 휘도로 읽도록 고쳤다. 불투명 그림과 캔버스 관례(투명 픽셀 RGB 0, 나머지 불투명) 그림은 고치기 전과
 * 바이트까지 같다(지문은 고치기 전 커널로 잰 값).
 */
import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_COLOR_EFFECTS } from "./studio-filter-gallery-color";
import { STUDIO_FILTER_GALLERY_EDGE_EFFECTS, STUDIO_FILTER_GALLERY_MAP_EFFECTS } from "./studio-filter-gallery-map-edge";

import type { StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParams } from "./studio-filter-gallery-types";

type Rgb = readonly [number, number, number];
type LumaCase = readonly [label: string, id: string, params: StudioFilterGalleryParams];

const EFFECTS = [...STUDIO_FILTER_GALLERY_MAP_EFFECTS, ...STUDIO_FILTER_GALLERY_EDGE_EFFECTS, ...STUDIO_FILTER_GALLERY_COLOR_EFFECTS];

function byId(id: string): StudioFilterGalleryEffectDef {
  const effect = EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`효과 없음: ${id}`);
  return effect;
}

function paint(width: number, height: number, color: (x: number, y: number) => readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(color(x, y), (y * width + x) * 4);
  return { width, height, data };
}

function run(id: string, params: StudioFilterGalleryParams, input: StudioFilterGalleryImage): StudioFilterGalleryImage {
  const image = { width: input.width, height: input.height, data: input.data.slice() };
  byId(id).apply(image, params, { seed: 7, scale: 1 });
  return image;
}

const pixel = (image: StudioFilterGalleryImage, x: number, y: number): number[] =>
  Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

/** 둘 중 하나라도 보이는(알파 > 0) 픽셀 가운데 RGBA 가 다른 픽셀의 좌표. */
function visibleDifferences(left: StudioFilterGalleryImage, right: StudioFilterGalleryImage): string[] {
  const out: string[] = [];
  for (let index = 0; index < left.width * left.height; index += 1) {
    const offset = index * 4;
    if (left.data[offset + 3] === 0 && right.data[offset + 3] === 0) continue;
    if ([0, 1, 2, 3].some((channel) => left.data[offset + channel] !== right.data[offset + channel])) {
      out.push(`(${index % left.width},${Math.floor(index / left.width)})`);
    }
  }
  return out;
}

/** 출력 바이트 전체의 FNV-1a 32비트 지문. */
function fingerprint(data: Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (const byte of data) hash = Math.imul(hash ^ byte, 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const WIDTH = 28, HEIGHT = 20;

/** 가운데 사각형과 오른쪽 위 원으로 된 실루엣 안인가. */
const insideShape = (x: number, y: number): boolean => (x >= 8 && x < 18 && y >= 5 && y < 15) || Math.hypot(x - 21.5, y - 4.5) < 3.6;

/** 픽셀마다 밝기가 다른 결 있는 색. */
const textured = (x: number, y: number): Rgb => [40 + ((x * 23 + y * 11) % 180), 30 + ((x * 7 + y * 29) % 200), 60 + ((x * 13 + y * 5) % 150)];

/**
 * 결 있는 불투명 실루엣. rim 이면 실루엣에 4-이웃으로 닿는 바깥 한 줄을 반투명(알파 96)으로 칠한다. 나머지는 알파 0 이고
 * 보이지 않는 RGB 는 hidden 이 정한다(캔버스 관례는 0).
 */
function silhouette(hidden: (x: number, y: number) => Rgb, rim = true): StudioFilterGalleryImage {
  return paint(WIDTH, HEIGHT, (x, y) => {
    if (insideShape(x, y)) return [...textured(x, y), 255];
    const touches = insideShape(x - 1, y) || insideShape(x + 1, y) || insideShape(x, y - 1) || insideShape(x, y + 1);
    return rim && touches ? [180, 90, 30, 96] : [...hidden(x, y), 0];
  });
}

const CANVAS = (): Rgb => [0, 0, 0];

/** 캔버스 관례(0) 대신 투명 픽셀에 숨길 RGB. */
const HIDDEN: readonly (readonly [string, (x: number, y: number) => Rgb])[] = [
  ["흰색", () => [255, 255, 255]],
  ["회색", () => [128, 128, 128]],
  ["무늬", (x, y) => [(x * 97 + y * 57) % 256, (x * 31 + y * 151) % 256, (x * 7 + y * 203) % 256]],
];

/** 결 있는 색 아래에 128 회색 둘레의 회색 계단(127·128·129 포함) 네 줄을 둔 불투명 그림. */
const opaque = (): StudioFilterGalleryImage =>
  paint(WIDTH, HEIGHT, (x, y) => {
    if (y < 16) return [...textured(x, y), 255];
    const level = 101 + 2 * x + (y - 16);
    return [level, level, level, 255];
  });

/** 휘도를 읽는 효과와 매개변수(이름표 앞 숫자가 결함 번호). */
const LUMA_CASES: readonly LumaCase[] = [
  ["1 거리 맵 · 유클리드", "edge.distance-map", { source: "luma" }],
  // 문턱값 30 이면 반투명 테두리(휘도 약 110, 덮인 휘도 약 41)도 안이라 숨은 이웃까지의 거리가 보이는 테두리에 바로 닿는다.
  ["1 거리 맵 · 맨해튼 · 문턱값 30 · 정규화 끔", "edge.distance-map", { source: "luma", metric: "manhattan", threshold: 30, normalize: false }],
  ["1 거리 맵 · 체비쇼프 · 문턱값 40", "edge.distance-map", { source: "luma", metric: "chebyshev", threshold: 40 }],
  ["2 변위 · 가장자리 반복", "map.displace", { source: "luma", horizontalScale: 20, verticalScale: 20 }],
  ["2 변위 · 감싸기", "map.displace", { source: "luma", horizontalScale: -60, verticalScale: 35, edge: "wrap" }],
  ["2 변위 · 투명", "map.displace", { source: "luma", horizontalScale: 45, verticalScale: -45, edge: "transparent" }],
  ["3 범프 맵 · 기본값", "map.bump-map", {}],
  ["3 범프 맵 · 반전·보정 끔", "map.bump-map", { azimuth: 300, elevation: 20, depth: 20, invert: true, compensate: false }],
  ["4 라플라스 · 크기", "edge.laplace", {}],
  ["4 라플라스 · 영교차", "edge.laplace", { mode: "zero-crossing", strength: 6 }],
  ["5 이미지 기울기 · 크기", "edge.image-gradient", {}],
  ["5 이미지 기울기 · 방향", "edge.image-gradient", { output: "direction" }],
  ["5 이미지 기울기 · 둘 다", "edge.image-gradient", { output: "both" }],
];

describe("필터 갤러리 · 매핑·가장자리 리뷰 결함 회귀 — 투명 픽셀의 숨은 RGB", () => {
  it.each(LUMA_CASES)("결함 %s: 투명 픽셀에 숨은 RGB 가 무엇이든 보이는 결과가 같다", (_label, id, params) => {
    const reference = run(id, params, silhouette(CANVAS));
    for (const [name, hidden] of HIDDEN) {
      expect(visibleDifferences(run(id, params, silhouette(hidden)), reference), `숨은 ${name}`).toEqual([]);
    }
  });

  it("명도 반전 뒤의 효과는 투명 RGB 가 흰색이 되어도 같은 그림을 직접 그린 입력과 보이는 결과가 같다", () => {
    const square = (level: number): StudioFilterGalleryImage =>
      paint(24, 16, (x, y) => (x >= 8 && x < 16 && y >= 4 && y < 12 ? [level, level, level, 255] : [0, 0, 0, 0]));
    // 명도 반전은 어두운(40) 사각형을 215 로 밝히고, 보이지 않는 (0,0,0,0) 을 (255,255,255,0) 으로 바꾼다.
    const inverted = run("color.value-invert", {}, square(40));
    expect(pixel(inverted, 8, 4)).toEqual([215, 215, 215, 255]);
    expect(pixel(inverted, 0, 0)).toEqual([255, 255, 255, 0]);
    for (const [label, id, params] of LUMA_CASES) {
      expect(visibleDifferences(run(id, params, inverted), run(id, params, square(215))), label).toEqual([]);
    }
    // 거리 맵 모서리는 그림 테두리까지(고치기 전 159)가 아니라 사각형 경계까지의 거리 1px(가장 먼 4px 의 1/4 → 64)이다.
    expect(pixel(run("edge.distance-map", { source: "luma" }, inverted), 8, 4)).toEqual([64, 64, 64, 255]);
  });

  it("거리 맵의 밝기 기준은 배정밀도 휘도에 알파를 곱한 값을 문턱값과 비교한다", () => {
    // 128 회색의 휘도는 127.99999999999999 라 문턱값 128 이면 바깥, 127 이면 안이다. 문턱값 128 의 판정은 고치기 전과 같은
    // 판정(알려진 부동소수 부작용)을 지키는 것이지 사양이 아니다. Float32 로 반올림하면 128 이 되어 뒤집힌다.
    const gray = paint(12, 10, () => [128, 128, 128, 255]);
    expect(pixel(run("edge.distance-map", { source: "luma", threshold: 128 }, gray), 6, 5)).toEqual([0, 0, 0, 255]);
    expect(pixel(run("edge.distance-map", { source: "luma", threshold: 127, normalize: false }, gray), 6, 5)).toEqual([5, 5, 5, 255]);
    // 반투명 흰색은 덮인 비율만큼의 휘도로 읽는다: 알파 200(≈ 200)은 문턱값 128 의 안, 알파 100(≈ 100)은 바깥이다.
    const veil = paint(12, 10, (x) => [255, 255, 255, x < 6 ? 200 : 100]);
    const output = run("edge.distance-map", { source: "luma", normalize: false }, veil);
    expect([3, 5, 6, 9].map((x) => pixel(output, x, 5)[0])).toEqual([3, 1, 0, 0]);
  });

  it("불투명 그림과 캔버스 관례(투명 RGB 0) 그림은 고치기 전과 바이트까지 같다", () => {
    // 지문은 고치기 전 커널로 잰 값이다([불투명 그림, 반투명 테두리 없는 캔버스 관례 실루엣]).
    const expected: Readonly<Record<string, readonly [string, string]>> = {
      "1 거리 맵 · 유클리드": ["7c807a7f", "f3196dfd"],
      "1 거리 맵 · 맨해튼 · 문턱값 30 · 정규화 끔": ["8230b875", "26277b35"],
      "1 거리 맵 · 체비쇼프 · 문턱값 40": ["2abb0364", "2c9e8555"],
      "2 변위 · 가장자리 반복": ["acee9412", "9f9b0446"],
      "2 변위 · 감싸기": ["e5d39ff0", "4d4a0df5"],
      "2 변위 · 투명": ["4c75abec", "cced1c21"],
      "3 범프 맵 · 기본값": ["c2f6c020", "4e190fb8"],
      "3 범프 맵 · 반전·보정 끔": ["0c82c34a", "e8802090"],
      "4 라플라스 · 크기": ["4058ab31", "442f6e30"],
      "4 라플라스 · 영교차": ["32fd73dc", "6287ae45"],
      "5 이미지 기울기 · 크기": ["e8c98545", "a8976e45"],
      "5 이미지 기울기 · 방향": ["249cd55a", "de4ec371"],
      "5 이미지 기울기 · 둘 다": ["728d22ee", "50184ec0"],
    };
    const actual = Object.fromEntries(LUMA_CASES.map(([label, id, params]) => [label, [
      fingerprint(run(id, params, opaque()).data),
      fingerprint(run(id, params, silhouette(CANVAS, false)).data),
    ]]));
    expect(actual).toEqual(expected);
  });
});
