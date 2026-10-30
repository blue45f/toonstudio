/**
 * 필터 갤러리 · 매핑(map) 계열 7종과 가장자리(edge) 계열 3종.
 *
 * 매핑: 범프 맵(람베르트 음영), 환영(조각별로 민 사본 겹치기), 작은 행성(등장방형 파노라마의 입체 투영), 종이 타일,
 * 작은 타일, 이음매 없는 타일, 변위. 가장자리: 라플라스(크기·영교차, Marr·Hildreth 1980), 이미지 기울기(소벨),
 * 거리 맵(유클리드 = Felzenszwalb·Huttenlocher 2012 선형 시간 정확 거리 변환, 맨해튼·체비쇼프 = Rosenfeld·Pfaltz 1966
 * 두 번 훑는 챔퍼 변환). 공개 알고리즘과 기능 설명만으로 새로 구현했다. 기하 효과는 왜곡 계열과 같은 알파 가중
 * 재표본기를 써서 알파가 표본과 함께 움직이고, 범프 맵·라플라스·이미지 기울기·거리 맵은 알파를 그대로 둔다. 휘도를 읽는
 * 효과(범프 맵·변위(밝기 맵)·라플라스·이미지 기울기·거리 맵의 밝기 기준)는 알파를 곱한 휘도를 읽어 투명 픽셀의 숨은 RGB 가
 * 보이는 결과로 새지 않는다. 불투명 픽셀과 RGB 0 인 투명 픽셀(캔버스 관례)로만 된 입력의 결과는 그대로이고, 반투명
 * 픽셀은 덮인 비율만큼 어두운 휘도로 읽는다.
 * 크기 매개변수는 이미지 px 단위이고(context.scale 은 쓰지 않는다), 무작위성은 context.seed 에서 파생한 결정적 값이다.
 */
import { remapWithEdges, sampleWithEdges } from "./studio-filter-gallery-distort";
import {
  booleanParam,
  clamp01,
  colorParam,
  coveredLumaPlane,
  createRandom,
  fbm2,
  gaussianPlane,
  luma,
  numberParam,
  sobel,
  stringParam,
} from "./studio-filter-gallery-kernel-utils";

import type { StudioFilterGalleryEdgeMode } from "./studio-filter-gallery-distort";
import type {
  StudioFilterGalleryContext,
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParamSpec,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

// ── 매개변수 명세 도구 ─────────────────────────────────────────────

type SliderSpec = Extract<StudioFilterGalleryParamSpec, { control: "slider" }>;
type ToggleSpec = Extract<StudioFilterGalleryParamSpec, { control: "toggle" }>;
type ColorSpec = Extract<StudioFilterGalleryParamSpec, { control: "color" }>;

interface SelectSpec<T extends string> {
  readonly key: string;
  readonly label: string;
  readonly control: "select";
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly default: T;
}

function slider(key: string, label: string, min: number, max: number, step: number, value: number, suffix?: string): SliderSpec {
  const spec: SliderSpec = { key, label, control: "slider", min, max, step, default: value };
  return suffix ? { ...spec, suffix } : spec;
}

function select<T extends string>(key: string, label: string, options: readonly (readonly [T, string])[], value: NoInfer<T>): SelectSpec<T> {
  return { key, label, control: "select", options: options.map(([option, text]) => ({ value: option, label: text })), default: value };
}

const toggle = (key: string, label: string, value: boolean): ToggleSpec => ({ key, label, control: "toggle", default: value });

/** 명세와 같은 최소·최대·기본값으로 슬라이더 값을 읽는다. */
const readSlider = (params: StudioFilterGalleryParams, spec: SliderSpec): number =>
  numberParam(params, spec.key, spec.default, spec.min, spec.max);

/** 명세의 선택지 안에서만 값을 읽는다(목록 밖이면 기본값). */
const readSelect = <T extends string>(params: StudioFilterGalleryParams, spec: SelectSpec<T>): T =>
  stringParam(params, spec.key, spec.options.map((option) => option.value), spec.default);

const readToggle = (params: StudioFilterGalleryParams, spec: ToggleSpec): boolean => booleanParam(params, spec.key, spec.default);

/** 색 명세의 기본값(#rrggbb)도 colorParam 으로 풀어 값과 같은 규칙으로 읽는다. */
const readColor = (params: StudioFilterGalleryParams, spec: ColorSpec): [number, number, number] =>
  colorParam(params, spec.key, colorParam({ [spec.key]: spec.default }, spec.key, [0, 0, 0]));

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** 가장자리 선택값(감싸기·가장자리 반복·투명) → 재표본기 방식. */
const edgeMode = (edge: "wrap" | "repeat-edge" | "transparent"): StudioFilterGalleryEdgeMode => (edge === "repeat-edge" ? "clamp" : edge);

/**
 * 알파를 곱한 휘도(0~255) — coveredLumaPlane 과 같은 정의(휘도 × α/255)의 배정밀도 판이다. 투명 픽셀은 숨은 RGB 와
 * 관계없이 0 이다. L × (α/255) 순서로 곱해 알파 255 에서는 휘도와 비트까지 같으므로 불투명 입력의 변위·문턱값 판정이 그대로다. 거리 맵은 Float32
 * 평면을 쓰지 않는다: 128 회색의 휘도 127.99999999999999 가 128 로 반올림돼 문턱값 128 의 판정이 뒤집힌다.
 */
const coveredLuma = (data: Uint8ClampedArray, offset: number): number =>
  luma(data[offset], data[offset + 1], data[offset + 2]) * (data[offset + 3] / 255);

// ── 범프 맵 ─────────────────────────────────────────────────────

const BUMP_AZIMUTH = slider("azimuth", "방위각", 0, 360, 1, 135, "°");
const BUMP_ELEVATION = slider("elevation", "고도", 0.5, 90, 0.5, 45, "°");
const BUMP_DEPTH = slider("depth", "깊이", 1, 65, 1, 3);
const BUMP_INVERT = toggle("invert", "높이 반전", false);
const BUMP_COMPENSATE = toggle("compensate", "어두워짐 보정", true);

function applyBumpMap(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const azimuth = toRadians(readSlider(params, BUMP_AZIMUTH));
  const elevation = toRadians(readSlider(params, BUMP_ELEVATION));
  const depth = readSlider(params, BUMP_DEPTH);
  const invert = readToggle(params, BUMP_INVERT);
  const compensate = readToggle(params, BUMP_COMPENSATE);
  const { width, height, data } = image;
  // 방위각은 화면 오른쪽에서 반시계 방향(위쪽이 +)으로 잰다. 135° 는 왼쪽 위에서 오는 빛이다.
  const lightX = Math.cos(azimuth) * Math.cos(elevation);
  const lightY = -Math.sin(azimuth) * Math.cos(elevation);
  const lightZ = Math.sin(elevation);
  // 높이는 알파를 곱한 휘도다. 투명 이웃은 숨은 RGB 와 관계없이 높이 0 이라 실루엣 가장자리의 음영이 그 값에 흔들리지 않는다.
  const { gx, gy } = sobel(coveredLumaPlane(image), width, height);
  // 소벨 값은 휘도 1단계 경사의 약 8배다. 높이(휘도 0~1) 경사에 깊이 × 2 를 곱해 법선 (−∂h/∂x, −∂h/∂y, 1) 을 만든다.
  const slope = ((invert ? -1 : 1) * depth * 2) / (8 * 255);
  for (let index = 0, offset = 0; index < gx.length; index += 1, offset += 4) {
    const nx = -gx[index] * slope, ny = -gy[index] * slope;
    const shade = Math.max(0, (nx * lightX + ny * lightY + lightZ) / Math.sqrt(nx * nx + ny * ny + 1));
    // 보정하면 평평한 면의 음영(고도의 사인)으로 나눠 평균 밝기를 지킨다.
    const factor = compensate ? shade / lightZ : shade;
    data[offset] *= factor;
    data[offset + 1] *= factor;
    data[offset + 2] *= factor;
  }
}

// ── 환영 ───────────────────────────────────────────────────────

const ILLUSION_DIVISIONS = slider("divisions", "분할 수", 1, 64, 1, 8);
const ILLUSION_TYPE = select("type", "방식", [["type1", "방식 1"], ["type2", "방식 2"]], "type1");
/** 방식 1 에서 사본을 미는 거리(짧은 변에 대한 비율). */
const ILLUSION_SHIFT = 0.25;

function applyIllusion(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const divisions = Math.round(readSlider(params, ILLUSION_DIVISIONS));
  const radial = readSelect(params, ILLUSION_TYPE) === "type1";
  const { width, height, data } = image;
  const source = data.slice();
  const sample = new Float32Array(4);
  const centerX = width / 2, centerY = height / 2, sector = (2 * Math.PI) / divisions;
  const shift = ILLUSION_SHIFT * Math.min(width, height);
  // 부채꼴 조각마다 사본을 정한다. 방식 1 = 이등분선 바깥쪽으로 민 사본(사본이 중심 둘레에 고리처럼 늘어선다),
  // 방식 2 = 조각마다 반 조각 각도만큼 번갈아 반대로 돌린 사본. 조각 경계는 프리즘처럼 끊긴다.
  const first = new Float64Array(divisions), second = new Float64Array(divisions);
  for (let piece = 0; piece < divisions; piece += 1) {
    const theta = (piece + 0.5) * sector - Math.PI, turn = ((piece & 1) === 0 ? 1 : -1) * (sector / 2);
    first[piece] = radial ? -Math.cos(theta) * shift : Math.cos(turn);
    second[piece] = radial ? -Math.sin(theta) * shift : Math.sin(turn);
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - centerX, dy = y + 0.5 - centerY;
      const piece = Math.floor((Math.atan2(dy, dx) + Math.PI) / sector) % divisions;
      const sourceX = radial ? x + 0.5 + first[piece] : centerX + dx * first[piece] - dy * second[piece];
      const sourceY = radial ? y + 0.5 + second[piece] : centerY + dx * second[piece] + dy * first[piece];
      // 돌린 사본의 모서리가 그림 밖으로 나가므로 거울 반사로 채워 줄무늬가 생기지 않게 한다.
      sampleWithEdges(source, width, height, sourceX, sourceY, "reflect", "reflect", sample);
      // 원본과 사본을 반씩 알파 가중으로 겹친다(알파도 둘의 평균).
      const offset = (y * width + x) * 4, own = source[offset + 3], copy = sample[3], weight = own + copy;
      for (let channel = 0; channel < 3; channel += 1) {
        data[offset + channel] = weight > 1e-3
          ? (source[offset + channel] * own + sample[channel] * copy) / weight
          : (source[offset + channel] + sample[channel]) / 2;
      }
      data[offset + 3] = weight / 2;
    }
  }
}

// ── 작은 행성 ───────────────────────────────────────────────────

const PLANET_ZOOM = slider("zoom", "확대", 10, 400, 1, 100, "%");
const PLANET_ROTATION = slider("rotation", "회전", -180, 180, 1, 0, "°");
const PLANET_INVERSE = toggle("inverse", "터널(안팎 반전)", false);

function applyLittlePlanet(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const zoom = readSlider(params, PLANET_ZOOM) / 100;
  const rotation = toRadians(readSlider(params, PLANET_ROTATION));
  const inverse = readToggle(params, PLANET_INVERSE);
  const { width, height } = image;
  const centerX = width / 2, centerY = height / 2;
  // 100% 에서 지평선(위도 0, 투영 반지름 2·unit)이 짧은 변의 35% 반지름에 오게 한다.
  const unit = Math.max(1e-3, 0.175 * Math.min(width, height) * zoom);
  // 그림을 경도 360°·위도 180° 등장방형 파노라마로 본다. 경도는 감싸고 위도는 가장자리 반복이다.
  remapWithEdges(image, "wrap", "clamp", (x, y, out) => {
    const dx = (x - centerX) / unit, dy = (y - centerY) / unit;
    // 입체 투영의 역: 평면 반지름 ρ ↔ 천저(작은 행성) 또는 천정(터널)에서 잰 구면 각 2·atan(ρ/2).
    const polar = 2 * Math.atan(Math.sqrt(dx * dx + dy * dy) / 2);
    // 화면 아래쪽이 파노라마 가운데 열을 보도록 경도를 맞춘다.
    const longitude = Math.atan2(dy, dx) - Math.PI / 2 + rotation;
    out.x = (longitude / (2 * Math.PI) + 0.5) * width;
    out.y = (inverse ? polar / Math.PI : 1 - polar / Math.PI) * height;
    return true;
  });
}

// ── 종이 타일 ───────────────────────────────────────────────────

const PAPER_TILE_SIZE = slider("tileSize", "타일 크기", 5, 200, 1, 40, "px");
const PAPER_MOVE_RATE = slider("moveRate", "이동률", 1, 90, 1, 25, "%");
const PAPER_BACKGROUND = select("background", "배경", [["transparent", "투명"], ["inverted", "반전"], ["color", "색"]], "inverted");
const PAPER_BACKGROUND_COLOR: ColorSpec = { key: "backgroundColor", label: "배경색", control: "color", default: "#ffffff" };

/**
 * 타일 한 장의 정수 이동(px). unit 은 −1~1 난수, maxMove 는 반올림하지 않은 최대 이동이다. 1px 이상이면 unit × maxMove 를
 * 반올림한다. 그보다 작으면 반올림이 거의 늘 0 이라 이동률 여러 칸이 같은 그림이 되므로, |unit| 이 1 − maxMove/2 보다 큰 타일만
 * 한 픽셀 민다. 움직이는 타일 비율(maxMove/2)이 이동률에 비례해 늘고, 1px 에서 반올림 규칙과 이어진다.
 */
const paperTileShift = (unit: number, maxMove: number): number =>
  maxMove >= 1 ? Math.round(unit * maxMove) : Math.abs(unit) > 1 - maxMove / 2 ? Math.sign(unit) : 0;

function applyPaperTile(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams, context: StudioFilterGalleryContext): void {
  const { width, height, data } = image;
  const tile = Math.max(1, Math.min(Math.round(readSlider(params, PAPER_TILE_SIZE)), Math.max(width, height)));
  // 최대 이동은 반올림하지 않는다. 정수로 반올림하면 타일 40px 에서 이동률 두세 칸(0.4px 씩)이 같은 거리가 돼 같은 그림이었다.
  const maxMove = (tile * readSlider(params, PAPER_MOVE_RATE)) / 100;
  const background = readSelect(params, PAPER_BACKGROUND);
  const [backgroundRed, backgroundGreen, backgroundBlue] = readColor(params, PAPER_BACKGROUND_COLOR);
  const source = data.slice();
  // 1) 틈 배경. 반전·색 배경은 원래 알파를 지키고, 투명 배경은 틈의 알파를 0 으로 만든다.
  for (let offset = 0; offset < data.length; offset += 4) {
    if (background === "transparent") {
      data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;
    } else if (background === "inverted") {
      data[offset] = 255 - source[offset]; data[offset + 1] = 255 - source[offset + 1]; data[offset + 2] = 255 - source[offset + 2];
    } else {
      data[offset] = backgroundRed; data[offset + 1] = backgroundGreen; data[offset + 2] = backgroundBlue;
    }
  }
  // 2) 타일을 시드 순서로 섞어 하나씩 무작위로 밀어 붙인다(나중 타일이 위로 겹친다).
  const columns = Math.ceil(width / tile), rows = Math.ceil(height / tile), tiles = columns * rows;
  const random = createRandom(context.seed + 0x9a7e);
  const order = new Int32Array(tiles);
  for (let index = 0; index < tiles; index += 1) order[index] = index;
  for (let index = tiles - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const kept = order[index];
    order[index] = order[swap];
    order[swap] = kept;
  }
  for (const piece of order) {
    const left = (piece % columns) * tile, top = Math.floor(piece / columns) * tile;
    const shiftX = paperTileShift(random() * 2 - 1, maxMove), shiftY = paperTileShift(random() * 2 - 1, maxMove);
    const right = Math.min(width, left + tile), bottom = Math.min(height, top + tile);
    for (let y = top; y < bottom; y += 1) {
      const targetY = y + shiftY;
      if (targetY < 0 || targetY >= height) continue;
      for (let x = left; x < right; x += 1) {
        const targetX = x + shiftX;
        if (targetX < 0 || targetX >= width) continue;
        const from = (y * width + x) * 4, to = (targetY * width + targetX) * 4;
        data[to] = source[from]; data[to + 1] = source[from + 1]; data[to + 2] = source[from + 2]; data[to + 3] = source[from + 3];
      }
    }
  }
}

// ── 작은 타일 ───────────────────────────────────────────────────

const SMALL_TILES = slider("tiles", "타일 수", 2, 16, 1, 3);
const SMALL_FLIP = select("flip", "뒤집기", [["none", "없음"], ["horizontal", "가로 뒤집기"], ["vertical", "세로 뒤집기"], ["both", "둘 다"]], "none");

interface TileFootprint {
  /** 출력 칸마다 덮는 첫 원본 픽셀 번호. */
  readonly first: Int32Array;
  /** 출력 칸 × taps 개의 겹친 길이 가중치(합 1). 그림 밖 칸은 0 이다. */
  readonly weights: Float32Array;
  readonly taps: number;
}

/**
 * 한 축의 출력 칸(열 또는 행)마다 덮는 원본 구간과 가중치. 타일 하나의 크기는 size/tiles(소수)이고 출력 한 칸은 원본
 * tiles 칸을 덮는다. 뒤집기를 고르면 홀수 번째 타일의 구간을 거울로 돌린다. 그림 밖으로 나간 구간은 잘라 다시 정규화한다.
 */
function tileFootprint(size: number, tiles: number, flip: boolean): TileFootprint {
  const taps = tiles + 1, tileSize = size / tiles;
  const first = new Int32Array(size), weights = new Float32Array(size * taps);
  for (let index = 0; index < size; index += 1) {
    const tile = Math.min(tiles - 1, Math.floor((index + 0.5) / tileSize));
    let start = (index - tile * tileSize) * tiles;
    if (flip && (tile & 1) === 1) start = size - start - tiles;
    const end = Math.min(size, start + tiles);
    start = Math.max(0, start);
    const base = Math.floor(start);
    let total = 0;
    for (let tap = 0; tap < taps; tap += 1) {
      const overlap = Math.max(0, Math.min(end, base + tap + 1) - Math.max(start, base + tap));
      weights[index * taps + tap] = overlap;
      total += overlap;
    }
    first[index] = base;
    for (let tap = 0; tap < taps; tap += 1) weights[index * taps + tap] = total > 0 ? weights[index * taps + tap] / total : tap === 0 ? 1 : 0;
  }
  return { first, weights, taps };
}

function applySmallTiles(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const tiles = Math.round(readSlider(params, SMALL_TILES));
  const flip = readSelect(params, SMALL_FLIP);
  const { width, height, data } = image;
  const columns = tileFootprint(width, tiles, flip === "horizontal" || flip === "both");
  const rows = tileFootprint(height, tiles, flip === "vertical" || flip === "both");
  // 출력 한 픽셀이 원본 tiles×tiles 칸을 덮으므로 가로 → 세로 순서의 분리형 면적 평균으로 줄인다(알파 가중).
  const horizontal = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (let tap = 0; tap < columns.taps; tap += 1) {
        const weight = columns.weights[x * columns.taps + tap];
        if (weight === 0) continue;
        const from = (y * width + columns.first[x] + tap) * 4, covered = data[from + 3] * weight;
        red += data[from] * covered; green += data[from + 1] * covered; blue += data[from + 2] * covered; alpha += covered;
      }
      const to = (y * width + x) * 4;
      horizontal[to] = red; horizontal[to + 1] = green; horizontal[to + 2] = blue; horizontal[to + 3] = alpha;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (let tap = 0; tap < rows.taps; tap += 1) {
        const weight = rows.weights[y * rows.taps + tap];
        if (weight === 0) continue;
        const from = ((rows.first[y] + tap) * width + x) * 4;
        red += horizontal[from] * weight; green += horizontal[from + 1] * weight; blue += horizontal[from + 2] * weight; alpha += horizontal[from + 3] * weight;
      }
      const to = (y * width + x) * 4;
      if (alpha > 1e-3) {
        data[to] = red / alpha; data[to + 1] = green / alpha; data[to + 2] = blue / alpha;
      } else {
        data[to] = 0; data[to + 1] = 0; data[to + 2] = 0;
      }
      data[to + 3] = alpha;
    }
  }
}

// ── 이음매 없는 타일 ─────────────────────────────────────────────

const SEAMLESS_BLEND = slider("blend", "섞기", 0, 100, 1, 100, "%");

function applyTileSeamless(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const blend = readSlider(params, SEAMLESS_BLEND) / 100;
  if (blend <= 0) return;
  const { width, height, data } = image;
  const source = data.slice();
  const shiftX = Math.floor(width / 2), shiftY = Math.floor(height / 2);
  // 가중치 sin²(π·위치) 는 가운데 1, 가장자리 0 이다. 가장자리에서는 절반 민 사본(가운데가 이어진 부분)만 보이므로
  // 오른쪽 끝과 왼쪽 끝이 원본의 이웃한 두 열이 되어 이어 붙여도 이음매가 없다. 사본 자신의 이음매는 가운데에 숨는다.
  const weightX = new Float32Array(width), weightY = new Float32Array(height);
  for (let x = 0; x < width; x += 1) weightX[x] = Math.sin((Math.PI * (x + 0.5)) / width) ** 2;
  for (let y = 0; y < height; y += 1) weightY[y] = Math.sin((Math.PI * (y + 0.5)) / height) ** 2;
  for (let y = 0; y < height; y += 1) {
    const row = y * width, shiftedRow = ((y + shiftY) % height) * width, wy = weightY[y];
    for (let x = 0; x < width; x += 1) {
      const wx = weightX[x], shiftedX = (x + shiftX) % width;
      // 네 사본(원본, 가로로 민 것, 세로로 민 것, 둘 다 민 것)의 알파 가중 합.
      const o00 = (row + x) * 4, o10 = (row + shiftedX) * 4, o01 = (shiftedRow + x) * 4, o11 = (shiftedRow + shiftedX) * 4;
      const a00 = source[o00 + 3] * wx * wy, a10 = source[o10 + 3] * (1 - wx) * wy;
      const a01 = source[o01 + 3] * wx * (1 - wy), a11 = source[o11 + 3] * (1 - wx) * (1 - wy);
      const alpha = a00 + a10 + a01 + a11;
      // 원본과 blend 비율로 섞는다(색은 알파 가중). 둘 다 투명하면 색은 그대로 둔다.
      const own = source[o00 + 3] * (1 - blend), mixed = alpha * blend, total = own + mixed;
      if (total > 1e-3) {
        for (let channel = 0; channel < 3; channel += 1) {
          const seamless = source[o00 + channel] * a00 + source[o10 + channel] * a10 + source[o01 + channel] * a01 + source[o11 + channel] * a11;
          data[o00 + channel] = (source[o00 + channel] * own + seamless * blend) / total;
        }
      }
      data[o00 + 3] = total;
    }
  }
}

// ── 변위 ───────────────────────────────────────────────────────

const DISPLACE_HORIZONTAL = slider("horizontalScale", "가로 배율", -100, 100, 1, 10, "px");
const DISPLACE_VERTICAL = slider("verticalScale", "세로 배율", -100, 100, 1, 10, "px");
const DISPLACE_SOURCE = select("source", "변위 맵", [["luma", "밝기"], ["noise", "노이즈"]], "noise");
const DISPLACE_NOISE_SCALE = slider("noiseScale", "노이즈 크기", 2, 200, 1, 40, "px");
const DISPLACE_EDGE = select("edge", "가장자리", [["wrap", "감싸기"], ["repeat-edge", "가장자리 반복"], ["transparent", "투명"]], "repeat-edge");

/** fbm 은 0.5 둘레에 몰리므로 대비를 3배로 늘려 0~1 을 거의 다 쓰게 한다(0.5 를 뺀 값을 돌려준다). */
const stretchNoise = (value: number): number => clamp01(0.5 + (value - 0.5) * 3) - 0.5;

function applyDisplace(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams, context: StudioFilterGalleryContext): void {
  const horizontal = readSlider(params, DISPLACE_HORIZONTAL);
  const vertical = readSlider(params, DISPLACE_VERTICAL);
  const fromLuma = readSelect(params, DISPLACE_SOURCE) === "luma";
  const noiseScale = readSlider(params, DISPLACE_NOISE_SCALE);
  const mode = edgeMode(readSelect(params, DISPLACE_EDGE));
  const { width, height, data } = image;
  const count = width * height;
  // 변위 맵 값 − 0.5 (밝기는 가로·세로가 같은 맵, 노이즈는 두 성분이 다른 시드). 밝기는 알파를 곱한 휘도라 투명 픽셀은
  // 숨은 RGB 와 관계없이 −0.5 이고, 그 RGB 가 어떤 보이는 내용을 끌어올지 정하지 못한다.
  const mapX = new Float32Array(count);
  const mapY = fromLuma ? mapX : new Float32Array(count);
  if (fromLuma) {
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) mapX[index] = coveredLuma(data, offset) / 255 - 0.5;
  } else {
    const seed = context.seed + 0xd15e;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        mapX[y * width + x] = stretchNoise(fbm2(x / noiseScale, y / noiseScale, seed, 3));
        mapY[y * width + x] = stretchNoise(fbm2(x / noiseScale, y / noiseScale, seed + 7919, 3));
      }
    }
  }
  remapWithEdges(image, mode, mode, (x, y, out) => {
    const index = Math.floor(y) * width + Math.floor(x);
    out.x = x + mapX[index] * horizontal;
    out.y = y + mapY[index] * vertical;
    return true;
  });
}

// ── 라플라스 ───────────────────────────────────────────────────

const LAPLACE_STRENGTH = slider("strength", "강도", 0.5, 8, 0.5, 2);
const LAPLACE_MODE = select("mode", "방식", [["magnitude", "크기"], ["zero-crossing", "영교차"]], "magnitude");

function applyLaplace(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const strength = readSlider(params, LAPLACE_STRENGTH);
  const zeroCrossing = readSelect(params, LAPLACE_MODE) === "zero-crossing";
  const { width, height, data } = image;
  // 알파를 곱한 휘도라 투명 이웃의 숨은 RGB 가 보이는 실루엣 선을 만들거나 지우지 않는다(영교차도 같은 평면을 쓴다).
  const plane = coveredLumaPlane(image);
  // 영교차는 잡음의 가짜 부호 변화를 줄이려고 먼저 흐린다(Marr–Hildreth 1980 의 가우시안 라플라시안 근사).
  if (zeroCrossing) gaussianPlane(plane, width, height, 1.5);
  const laplacian = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width, above = Math.max(0, y - 1) * width, below = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - 1), right = Math.min(width - 1, x + 1);
      // 8-이웃 라플라시안 커널 [1 1 1; 1 −8 1; 1 1 1] (가장자리 복제).
      laplacian[row + x] = plane[above + left] + plane[above + x] + plane[above + right] + plane[row + left] + plane[row + right]
        + plane[below + left] + plane[below + x] + plane[below + right] - 8 * plane[row + x];
    }
  }
  const threshold = 16 / strength;
  for (let y = 0; y < height; y += 1) {
    const row = y * width, above = Math.max(0, y - 1) * width, below = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      const value = laplacian[row + x];
      let level = Math.min(255, Math.abs(value) * strength * 0.5);
      if (zeroCrossing) {
        // 4-이웃과 부호가 실제로 바뀌면(곱이 음수) 0 에 더 가까운 쪽 픽셀에 선을 긋는다. 평평한 곳(정확히 0)으로 끝나는
        // 한쪽 고리는 교차가 아니므로, 정확히 0 인 픽셀은 양옆(또는 위아래)의 부호가 서로 반대일 때만 긋는다.
        const left = laplacian[row + Math.max(0, x - 1)], right = laplacian[row + Math.min(width - 1, x + 1)];
        const up = laplacian[above + x], down = laplacian[below + x];
        const edge = crossesZero(value, left, threshold) || crossesZero(value, right, threshold)
          || crossesZero(value, up, threshold) || crossesZero(value, down, threshold)
          || (value === 0 && ((left * right < 0 && Math.abs(left - right) > threshold) || (up * down < 0 && Math.abs(up - down) > threshold)));
        level = edge ? 255 : 0;
      }
      const offset = (row + x) * 4;
      data[offset] = level; data[offset + 1] = level; data[offset + 2] = level;
    }
  }
}

/** a 와 b 의 부호가 실제로 다르고(곱이 음수) 차이가 문턱값을 넘으며 a 가 0 에 더 가까우면 참이다. */
function crossesZero(a: number, b: number, threshold: number): boolean {
  return a * b < 0 && Math.abs(a) <= Math.abs(b) && Math.abs(a - b) > threshold;
}

// ── 이미지 기울기 ───────────────────────────────────────────────

const GRADIENT_OUTPUT = select("output", "출력", [["magnitude", "크기"], ["direction", "방향"], ["both", "둘 다"]], "magnitude");

/** 채도 1 색상환(hue 0~1 순환)에 밝기 value(0~1)를 곱한 RGB(0~255)를 out 에 쓴다. 픽셀마다 할당하지 않는다. */
function hueWheel(hue: number, value: number, out: Float32Array): void {
  const sector = (hue - Math.floor(hue)) * 6;
  out[0] = clamp01(Math.abs(sector - 3) - 1) * value * 255;
  out[1] = clamp01(2 - Math.abs(sector - 2)) * value * 255;
  out[2] = clamp01(2 - Math.abs(sector - 4)) * value * 255;
}

function applyImageGradient(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const output = readSelect(params, GRADIENT_OUTPUT);
  const { width, height, data } = image;
  // 알파를 곱한 휘도라 투명 이웃의 숨은 RGB 가 실루엣의 기울기 크기와 방향 색을 바꾸지 않는다.
  const { gx, gy, magnitude } = sobel(coveredLumaPlane(image), width, height);
  const rgb = new Float32Array(3);
  for (let index = 0, offset = 0; index < magnitude.length; index += 1, offset += 4) {
    // 소벨 크기 510(휘도 128단계 계단) 이상을 최대 밝기로 본다.
    const strength = Math.min(1, magnitude[index] / 510);
    if (output === "magnitude") {
      rgb[0] = strength * 255; rgb[1] = rgb[0]; rgb[2] = rgb[0];
    } else {
      // 방향은 색상환(오른쪽으로 밝아지는 경사 = 청록, 왼쪽 = 빨강)으로, 기울기가 없으면 검정이다.
      const hue = Math.atan2(gy[index], gx[index]) / (2 * Math.PI) + 0.5;
      hueWheel(hue, output === "both" ? strength : magnitude[index] > 1e-3 ? 1 : 0, rgb);
    }
    data[offset] = rgb[0]; data[offset + 1] = rgb[1]; data[offset + 2] = rgb[2];
  }
}

// ── 거리 맵 ─────────────────────────────────────────────────────

const DISTANCE_METRIC = select("metric", "거리 척도", [["euclidean", "유클리드"], ["manhattan", "맨해튼"], ["chebyshev", "체비쇼프"]], "euclidean");
const DISTANCE_SOURCE = select("source", "기준", [["alpha", "알파"], ["luma", "밝기"]], "alpha");
const DISTANCE_THRESHOLD = slider("threshold", "문턱값", 0, 255, 1, 128);
const DISTANCE_NORMALIZE = toggle("normalize", "정규화", true);

/** 거리 변환에서 "아직 바깥을 못 찾음"을 나타내는 큰 값(제곱 거리로 더해도 넘치지 않는다). */
const FAR = 1e20;

/**
 * 1차원 제곱 거리 변환 d[q] = min_p (q − p)² + f[p] 를 포물선 하한 포락선으로 선형 시간에 구한다
 * (Felzenszwalb·Huttenlocher 2012). v 는 포락선 포물선의 꼭짓점, z 는 포물선 사이 경계다.
 */
function squaredDistance1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q += 1) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
    while (s <= z[k]) {
      k -= 1;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
    }
    k += 1;
    v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1;
    const delta = q - v[k];
    d[q] = delta * delta + f[v[k]];
  }
}

/** 정확한 유클리드 거리(열 방향 → 행 방향 1차원 변환 두 번). inside 1 인 픽셀에서 가장 가까운 0 픽셀까지의 거리. */
function euclideanDistance(inside: Uint8Array, width: number, height: number): Float32Array {
  const grid = new Float32Array(width * height);
  const size = Math.max(width, height);
  const f = new Float64Array(size), d = new Float64Array(size), v = new Int32Array(size), z = new Float64Array(size + 1);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) f[y] = inside[y * width + x] === 1 ? FAR : 0;
    squaredDistance1d(f, height, d, v, z);
    for (let y = 0; y < height; y += 1) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) f[x] = grid[row + x];
    squaredDistance1d(f, width, d, v, z);
    for (let x = 0; x < width; x += 1) grid[row + x] = Math.sqrt(d[x]);
  }
  return grid;
}

/** 두 번 훑는 챔퍼 거리. 4-이웃 단위 걸음이면 맨해튼, 대각선도 1 걸음이면 체비쇼프 거리와 정확히 같다. */
function chamferDistance(inside: Uint8Array, width: number, height: number, diagonal: boolean): Float32Array {
  const grid = new Float32Array(width * height);
  for (let index = 0; index < grid.length; index += 1) grid[index] = inside[index] === 1 ? FAR : 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let best = grid[index];
      if (best === 0) continue;
      if (x > 0) best = Math.min(best, grid[index - 1] + 1);
      if (y > 0) {
        best = Math.min(best, grid[index - width] + 1);
        if (diagonal && x > 0) best = Math.min(best, grid[index - width - 1] + 1);
        if (diagonal && x < width - 1) best = Math.min(best, grid[index - width + 1] + 1);
      }
      grid[index] = best;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      let best = grid[index];
      if (best === 0) continue;
      if (x < width - 1) best = Math.min(best, grid[index + 1] + 1);
      if (y < height - 1) {
        best = Math.min(best, grid[index + width] + 1);
        if (diagonal && x < width - 1) best = Math.min(best, grid[index + width + 1] + 1);
        if (diagonal && x > 0) best = Math.min(best, grid[index + width - 1] + 1);
      }
      grid[index] = best;
    }
  }
  return grid;
}

function applyDistanceMap(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const metric = readSelect(params, DISTANCE_METRIC);
  const fromAlpha = readSelect(params, DISTANCE_SOURCE) === "alpha";
  const threshold = readSlider(params, DISTANCE_THRESHOLD);
  const normalize = readToggle(params, DISTANCE_NORMALIZE);
  const { width, height, data } = image;
  const count = width * height;
  // 기준 값(알파, 또는 알파를 곱한 휘도)이 문턱값 이상이면 안(켜짐), 아니면 바깥(꺼짐)이다. 투명 픽셀은 숨은 RGB 가
  // 밝아도 기준 값이 0 이라 문턱값이 0 이 아니면 바깥이므로, 보이는 영역의 거리가 그림 테두리가 아니라 실제 경계까지 잰
  // 값이 된다.
  const inside = new Uint8Array(count);
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    const value = fromAlpha ? data[offset + 3] : coveredLuma(data, offset);
    inside[index] = value >= threshold ? 1 : 0;
  }
  const distance = metric === "euclidean"
    ? euclideanDistance(inside, width, height)
    : chamferDistance(inside, width, height, metric === "chebyshev");
  // 그림 밖도 바깥으로 본다. 테두리 너머 픽셀까지의 거리는 세 척도 모두 수직 거리와 같다.
  let maximum = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = inside[index] === 1 ? Math.min(distance[index], x + 1, width - x, y + 1, height - y) : 0;
      distance[index] = value;
      if (value > maximum) maximum = value;
    }
  }
  // 정규화하면 가장 먼 픽셀이 흰색, 아니면 1px = 1단계(255px 이상은 흰색)다. 알파는 그대로다.
  const gain = normalize ? (maximum > 0 ? 255 / maximum : 0) : 1;
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    const level = Math.min(255, distance[index] * gain);
    data[offset] = level; data[offset + 1] = level; data[offset + 2] = level;
  }
}

export const STUDIO_FILTER_GALLERY_MAP_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  {
    id: "map.bump-map",
    category: "map",
    label: "범프 맵",
    description: "자기 휘도를 높이로 삼아 방위각·고도에서 비춘 람베르트 음영을 색에 곱해 부조처럼 도드라지게 합니다(알파 유지).",
    references: ["GIMP · 범프 맵", "Krita · 퐁 범프맵"],
    params: [BUMP_AZIMUTH, BUMP_ELEVATION, BUMP_DEPTH, BUMP_INVERT, BUMP_COMPENSATE],
    cost: 0.7,
    apply: applyBumpMap,
  },
  {
    id: "map.illusion",
    category: "map",
    label: "환영",
    description: "중심 둘레를 분할 수만큼 나눈 조각마다 바깥쪽으로 민 사본(방식 1) 또는 번갈아 돌린 사본(방식 2)을 반투명으로 겹쳐 만화경 같은 착시를 만듭니다(그림 밖은 거울 반사).",
    references: ["GIMP · 환영(Illusion)"],
    params: [ILLUSION_DIVISIONS, ILLUSION_TYPE],
    cost: 1.8,
    apply: applyIllusion,
  },
  {
    id: "map.little-planet",
    category: "map",
    label: "작은 행성",
    description: "그림을 등장방형 파노라마로 보고 입체 투영해 작은 행성처럼 둥글게 말고, 터널을 켜면 하늘이 가운데로 오도록 안팎을 뒤집습니다.",
    references: ["GIMP · 작은 행성"],
    params: [PLANET_ZOOM, PLANET_ROTATION, PLANET_INVERSE],
    cost: 2.7,
    apply: applyLittlePlanet,
  },
  {
    id: "map.paper-tile",
    category: "map",
    label: "종이 타일",
    description: "그림을 정사각 종이 타일로 잘라 무작위로 조금씩 밀고, 드러난 틈은 반전 그림·색·투명(알파 0) 중 고른 배경으로 채웁니다.",
    references: ["GIMP · 종이 타일"],
    params: [PAPER_TILE_SIZE, PAPER_MOVE_RATE, PAPER_BACKGROUND, PAPER_BACKGROUND_COLOR],
    cost: 0.5,
    apply: applyPaperTile,
  },
  {
    id: "map.small-tiles",
    category: "map",
    label: "작은 타일",
    description: "그림을 줄인 사본을 가로세로 타일 수만큼 바둑판처럼 되풀이하고, 뒤집기를 고르면 한 칸 건너 하나씩 뒤집습니다.",
    references: ["GIMP · 타일(작은 타일)", "Krita · 작은 타일"],
    params: [SMALL_TILES, SMALL_FLIP],
    cost: 3.5,
    apply: applySmallTiles,
  },
  {
    id: "map.tile-seamless",
    category: "map",
    label: "이음매 없는 타일",
    description: "절반만큼 감싸 민 사본과 가장자리로 갈수록 커지는 부드러운 가중치로 섞어, 이어 붙여도 이음매가 보이지 않는 타일로 만듭니다.",
    references: ["GIMP · 이음매 없는 타일"],
    params: [SEAMLESS_BLEND],
    cost: 0.4,
    apply: applyTileSeamless,
  },
  {
    id: "map.displace",
    category: "map",
    label: "변위",
    description: "밝기 또는 노이즈 변위 맵의 (값 − 0.5) × 배율 px 만큼 픽셀을 밀고, 그림 밖 좌표는 감싸기·가장자리 반복·투명(알파 0) 중 고른 방식으로 채웁니다.",
    references: ["Photoshop · 변위", "GIMP · 변위"],
    params: [DISPLACE_HORIZONTAL, DISPLACE_VERTICAL, DISPLACE_SOURCE, DISPLACE_NOISE_SCALE, DISPLACE_EDGE],
    cost: 5,
    apply: applyDisplace,
  },
];

export const STUDIO_FILTER_GALLERY_EDGE_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  {
    id: "edge.laplace",
    category: "edge",
    label: "라플라스",
    description: "휘도 라플라시안의 크기 또는 영교차를 검은 바탕 위 밝은 선으로 나타냅니다(알파 유지).",
    references: ["GIMP · 라플라스"],
    params: [LAPLACE_STRENGTH, LAPLACE_MODE],
    cost: 1,
    apply: applyLaplace,
  },
  {
    id: "edge.image-gradient",
    category: "edge",
    label: "이미지 기울기",
    description: "소벨 기울기의 크기는 회색, 방향은 색상환으로 나타내고, 둘 다를 고르면 방향 색에 크기를 밝기로 곱합니다(알파 유지).",
    references: ["GIMP · 이미지 기울기"],
    params: [GRADIENT_OUTPUT],
    cost: 1,
    apply: applyImageGradient,
  },
  {
    id: "edge.distance-map",
    category: "edge",
    label: "거리 맵",
    description: "알파 또는 밝기가 문턱값 이상인 영역의 각 픽셀에서 가장 가까운 바깥 픽셀까지의 거리를 회색으로 그립니다(알파 유지).",
    references: ["GIMP · 거리 맵"],
    params: [DISTANCE_METRIC, DISTANCE_SOURCE, DISTANCE_THRESHOLD, DISTANCE_NORMALIZE],
    cost: 1,
    apply: applyDistanceMap,
  },
];
