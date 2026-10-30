/**
 * 필터 갤러리 "스케치" 분류 커널 12종.
 *
 * 사진 편집기의 스케치 묶음처럼 대부분 결과를 잉크색(전경색 역할)과 종이색(배경색 역할) 두 색 사이로 사상한다
 * (크롬·물 종이는 예외). 원작 프로그램의 코드·텍스처는 쓰지 않고 공개 매뉴얼의 기능 설명과 일반적인 영상 처리
 * 기법(알파 가중 블러, 소벨 기울기 조명, 평행 해칭과 길게 늘인 값 노이즈 획, 무작위 문턱 디더, 프랙털 노이즈 도메인 휨,
 * 백색 잡음의 선적분 합성곱(Cabral·Leedom 1993, LIC))만으로 새로 구현했다. 난수는 모두 context.seed 에 효과별
 * 상수를 더한 해시에서 나오므로 같은 입력이면 같은 결과다. 크기 매개변수는 이미지 px 단위이고(context.scale 은
 * 쓰지 않는다), 알파는 모든 효과가 그대로 둔다(RGB 만 고친다).
 */
import {
  clamp, clamp01, fbm2, gaussianPlane, hash1, hash2, luma, lumaPlane, sobel, valueNoise2,
} from "./studio-filter-gallery-kernel-utils";
import { paramChoices, paramColor, paramSelect, paramSlider, readColor, readSelect, readSlider } from "./studio-filter-gallery-param-specs";
import {
  STUDIO_FILTER_GALLERY_LIGHT_OPTIONS,
  STUDIO_FILTER_GALLERY_TEXTURE_OPTIONS,
  applyRelief,
  lightVector,
  textureHeight,
} from "./studio-filter-gallery-textures";

import type { ColorSpec, Rgb } from "./studio-filter-gallery-param-specs";
import type { StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParams } from "./studio-filter-gallery-types";

const inkSpec = (value: string): ColorSpec => paramColor("inkColor", "잉크 색", value);
const paperSpec = (value: string): ColorSpec => paramColor("paperColor", "종이 색", value);
const INK = inkSpec("#1b1b1b");
const PAPER = paperSpec("#f4f1ea");

const lightSelect = (value: (typeof STUDIO_FILTER_GALLERY_LIGHT_OPTIONS)[number]["value"]) =>
  paramSelect("lightDirection", "빛 방향", STUDIO_FILTER_GALLERY_LIGHT_OPTIONS, value);

// ── 공용 픽셀 도구 ──

const DIAGONAL = Math.SQRT1_2;
const fract = (value: number): number => value - Math.floor(value);

/** gaussianPlane 은 상자 반지름 r/√3 을 1 아래로 줄이지 않아 반지름 0.5~√3 이 모두 이 반지름의 흐림과 같다. */
const FINEST_GAUSSIAN = Math.sqrt(3);

/**
 * 반지름 √3 아래까지 이어지는 가우시안(제자리). √3 이상은 gaussianPlane 그대로이고, 그 아래는 원본과 √3 흐림을
 * 반지름 비율로 섞는다. gaussianPlane 이 이웃한 두 정수 상자 결과를 소수 부분만큼 섞는 규약을 상자 반지름 0(원본)~1
 * 구간으로 넓힌 것이라 √3 에서 끊기지 않는다. 선형 연산이라 알파 가중 흐림의 분자·분모에 그대로 쓸 수 있다.
 */
function fineGaussianPlane(plane: Float32Array, width: number, height: number, radius: number): void {
  if (radius >= FINEST_GAUSSIAN) {
    gaussianPlane(plane, width, height, radius);
    return;
  }
  if (!(radius > 0)) return;
  const blurred = plane.slice();
  gaussianPlane(blurred, width, height, FINEST_GAUSSIAN);
  const share = radius / FINEST_GAUSSIAN;
  for (let index = 0; index < plane.length; index += 1) plane[index] += (blurred[index] - plane[index]) * share;
}

/**
 * tone(0 = 잉크, 1 = 종이)을 두 색 사이로 사상해 RGB 에 쓴다. 알파는 그대로 둔다.
 */
function paintTones(image: StudioFilterGalleryImage, tone: Float32Array, ink: Rgb, paper: Rgb): void {
  const { data } = image;
  for (let index = 0, offset = 0; index < tone.length; index += 1, offset += 4) {
    const t = clamp01(tone[index]);
    data[offset] = ink[0] + (paper[0] - ink[0]) * t;
    data[offset + 1] = ink[1] + (paper[1] - ink[1]) * t;
    data[offset + 2] = ink[2] + (paper[2] - ink[2]) * t;
  }
}

/** 잉크·종이 두 색을 읽어 tone 평면을 칠한다(기본 잉크·종이 명세 또는 효과 전용 명세). */
function paintWith(image: StudioFilterGalleryImage, tone: Float32Array, params: StudioFilterGalleryParams, ink = INK, paper = PAPER): void {
  paintTones(image, tone, readColor(params, ink), readColor(params, paper));
}

/**
 * 알파 가중 휘도 평면(0~255). 휘도×알파와 알파를 따로 가우시안으로 흐린 뒤 나누므로 투명 픽셀의 RGB 가
 * 이웃으로 번지지 않고, 반대로 투명 픽셀 자리는 이웃 값으로 채워져 기울기 계산이 안전해진다. 흐림 창 안에
 * 불투명 픽셀이 전혀 없는 곳(흐림 창보다 먼 완전 투명 영역)은 실루엣에서 바깥으로 한 겹씩 벗겨 나가며 가장 가까운 값으로
 * 채운다. 그 자리를 0(검정)으로 두면 흐림 창보다 멀리 닿는 뒤 단계(석고 덩어리 흐림, 목탄 번짐, 찢긴 가장자리 표본 이동,
 * 메모지 층 흐림·요철)가 보이지 않는 검은 영역을 형태로 읽어 보이는 픽셀에 음영·잉크를 남긴다. radius 가 0.5 보다
 * 작으면 흐리지 않는다. fine 이면 fineGaussianPlane 으로 흐려 반지름 √3 아래도 칸마다 흐림이 달라진다(이때는 0.5 아래도
 * 알파 가중으로 읽는다).
 */
export function alphaWeightedLuma(image: StudioFilterGalleryImage, radius: number, fine = false): Float32Array {
  if (radius < 0.5 && !fine) return lumaPlane(image);
  const { width, height, data } = image;
  const plane = new Float32Array(width * height);
  const weight = new Float32Array(width * height);
  for (let index = 0, offset = 0; index < plane.length; index += 1, offset += 4) {
    const alpha = data[offset + 3] / 255;
    weight[index] = alpha;
    plane[index] = luma(data[offset], data[offset + 1], data[offset + 2]) * alpha;
  }
  const blur = fine ? fineGaussianPlane : gaussianPlane;
  blur(weight, width, height, radius);
  blur(plane, width, height, radius);
  let uncovered = false;
  for (let index = 0; index < plane.length; index += 1) {
    if (weight[index] > 1e-4) {
      plane[index] = plane[index] / weight[index];
    } else {
      plane[index] = 0;
      weight[index] = 0;
      uncovered = true;
    }
  }
  if (!uncovered) return plane;
  // 채움 원천은 흐림 창 안의 투명 테두리(실루엣 바로 바깥으로 연장된 값)다. 불투명한 그림 속은 백만분의 일만 쳐서(덮인 칸
  // 표시로 0 보다 크게만 둔다), 밝은 속을 어두운 윤곽이 두른 그림 바깥이 속 색으로 밝아지지(후광) 않게 한다.
  for (let index = 0; index < weight.length; index += 1) weight[index] *= 1.000001 - data[index * 4 + 3] / 255;
  fillUncovered(plane, weight, width, height);
  return plane;
}

const DIAGONAL_WEIGHT = Math.SQRT1_2;

/**
 * weight 가 0 인 칸을 덮인 칸에서 바깥으로 한 겹(8-이웃)씩 벗겨 나가며, 앞 겹까지 채워진 이웃의 가중 평균으로 채운다
 * (대각 이웃은 1/√2). 한 겹은 동시에 정해 순서에 따르지 않고, 국소적이라 먼 곳의 다른 톤이 섞이지 않으며 그림을 옮기거나
 * 투명 여백을 늘려도 채움이 그대로다(예전 당기기·밀기 피라미드는 거친 층 평균이 밝은 선 옆 빈칸을 어둡게 했고 2×2
 * 격자 정렬에 따라 결과가 출렁였다). 덮인 칸 값은 바꾸지 않고 작업량은 픽셀 수에 비례한다. 덮인 칸이 없으면 0 으로 둔다.
 */
function fillUncovered(values: Float32Array, weight: Float32Array, width: number, height: number): void {
  const count = width * height;
  // 0 빈칸, 1 덮였거나 채워짐, 2 이번 겹 후보.
  const state = new Uint8Array(count);
  let filled = 0;
  for (let index = 0; index < count; index += 1) {
    if (weight[index] > 0) {
      state[index] = 1;
      filled += 1;
    }
  }
  if (filled === 0 || filled === count) return;
  let frontier = new Int32Array(count);
  let next = new Int32Array(count);
  const layerValues = new Float32Array(count);
  const layerWeights = new Float32Array(count);
  const enqueueEmptyNeighbours = (index: number, queue: Int32Array, length: number): number => {
    const x = index % width, y = (index - x) / width;
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny += 1) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
        const neighbour = ny * width + nx;
        if (state[neighbour] !== 0) continue;
        state[neighbour] = 2;
        queue[length] = neighbour;
        length += 1;
      }
    }
    return length;
  };
  let size = 0;
  for (let index = 0; index < count; index += 1) if (state[index] === 1) size = enqueueEmptyNeighbours(index, frontier, size);
  while (size > 0) {
    for (let k = 0; k < size; k += 1) {
      const index = frontier[k];
      const x = index % width, y = (index - x) / width;
      let sum = 0, total = 0, sources = 0;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny += 1) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
          const neighbour = ny * width + nx;
          if (state[neighbour] !== 1) continue;
          const share = weight[neighbour] * (nx === x || ny === y ? 1 : DIAGONAL_WEIGHT);
          sum += values[neighbour] * share;
          total += share;
          sources += 1;
        }
      }
      layerValues[k] = total > 0 ? sum / total : 0;
      layerWeights[k] = sources > 0 ? total / sources : 0;
    }
    for (let k = 0; k < size; k += 1) {
      const index = frontier[k];
      values[index] = layerValues[k];
      // 바깥 겹도 다음 겹의 원천이 되도록 0 보다 큰 무게를 남긴다.
      weight[index] = layerWeights[k] > 0 ? layerWeights[k] : 1e-12;
      state[index] = 1;
    }
    let nextSize = 0;
    for (let k = 0; k < size; k += 1) nextSize = enqueueEmptyNeighbours(frontier[k], next, nextSize);
    [frontier, next] = [next, frontier];
    size = nextSize;
  }
}

/**
 * 평행 해칭 획의 덮임(0~1). (dx, dy) 방향으로 spacing 간격의 줄을 긋고 줄마다 length 길이의 획 조각에 무작위
 * 문턱을 준다. 문턱이 cover 보다 낮은 획만 그리므로 어두운 곳일수록 획이 촘촘해진다. 단면은 가운데가 진하고
 * 양 끝은 가늘어져 손으로 그은 획처럼 보인다.
 */
function hatch(x: number, y: number, dx: number, dy: number, spacing: number, length: number, cover: number, seed: number): number {
  const across = (y * dx - x * dy) / spacing;
  const line = Math.floor(across);
  // 줄마다 획 길이와 시작 위치가 달라 벽돌처럼 줄지어 보이지 않는다.
  const along = (x * dx + y * dy) / (length * (0.6 + 0.8 * hash1(line, seed + 2))) + hash1(line, seed);
  const segment = Math.floor(along);
  if (hash2(line, segment, seed + 1) >= cover) return 0;
  const profile = 1 - Math.abs(fract(across) * 2 - 1);
  const end = fract(along);
  const tooth = 0.7 + 0.3 * hash2(x, y, seed + 3);
  return clamp01((profile * Math.min(1, end * 8, (1 - end) * 8) - 0.12) * 2.2) * tooth;
}

/** 오른쪽 위(↗) 대각선을 따라 radius 만큼 평균해 목탄 번짐을 만든다. */
function smudgeDiagonal(plane: Float32Array, width: number, height: number, radius: number): Float32Array {
  const out = new Float32Array(plane.length);
  const taps = 2 * radius + 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        sum += plane[clamp(y - k, 0, height - 1) * width + clamp(x + k, 0, width - 1)];
      }
      out[y * width + x] = sum / taps;
    }
  }
  return out;
}

// ── 1. 저부조 ──

const BAS_DETAIL = paramSlider("detail", "세부", 1, 15, 13);
const BAS_SMOOTHNESS = paramSlider("smoothness", "매끄러움", 1, 15, 3);
const BAS_LIGHT = lightSelect("bottom");

const basRelief: StudioFilterGalleryEffectDef = {
  id: "sketch.bas-relief",
  category: "sketch",
  label: "저부조",
  description: "흐린 명암을 빛 방향으로 양각해 낮게 새긴 부조처럼 만들고 잉크색과 종이색으로 칠합니다.",
  references: ["Photoshop · 저부조"],
  params: [BAS_DETAIL, BAS_SMOOTHNESS, BAS_LIGHT, INK, PAPER],
  cost: 5,
  apply(image, params) {
    const detail = readSlider(params, BAS_DETAIL);
    const smoothness = readSlider(params, BAS_SMOOTHNESS);
    const [lx, ly] = lightVector(readSelect(params, BAS_LIGHT));
    const { width, height } = image;
    // 세부가 낮을수록 더 흐린 높이맵을 써서 큰 형태만 남긴다.
    const plane = alphaWeightedLuma(image, 0.5 + smoothness * 0.55 + (15 - detail) * 0.15);
    const { gx, gy } = sobel(plane, width, height);
    const gain = 0.0009 + detail * 0.00012;
    const tone = new Float32Array(plane.length);
    for (let index = 0; index < tone.length; index += 1) {
      // 기울기가 빛 반대쪽을 향하는 면이 빛을 마주 본다(밝다).
      const relief = -(gx[index] * lx + gy[index] * ly) * gain;
      tone[index] = 0.5 + relief + (plane[index] / 255 - 0.5) * 0.3;
    }
    paintWith(image, tone, params);
  },
};

// ── 2. 분필과 목탄 ──

const CC_CHARCOAL = paramSlider("charcoalArea", "목탄 영역", 0, 20, 6);
const CC_CHALK = paramSlider("chalkArea", "분필 영역", 0, 20, 6);
const CC_PRESSURE = paramSlider("strokePressure", "획 압력", 0, 5, 1);

const chalkCharcoal: StudioFilterGalleryEffectDef = {
  id: "sketch.chalk-charcoal",
  category: "sketch",
  label: "분필과 목탄",
  description: "중간 회색 바탕에 어두운 곳은 잉크색 대각선 목탄 획, 밝은 곳은 종이색 분필 획으로 다시 그립니다.",
  references: ["Photoshop · 분필과 목탄"],
  params: [CC_CHARCOAL, CC_CHALK, CC_PRESSURE, INK, PAPER],
  cost: 5,
  apply(image, params, context) {
    const charcoalLimit = 0.12 + (readSlider(params, CC_CHARCOAL) / 20) * 0.5;
    const chalkLimit = 0.88 - (readSlider(params, CC_CHALK) / 20) * 0.5;
    const opacity = 0.55 + readSlider(params, CC_PRESSURE) * 0.09;
    const seed = context.seed + 2203;
    const { width, height } = image;
    const plane = alphaWeightedLuma(image, 0.8);
    const tone = new Float32Array(plane.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const t = plane[index] / 255;
        // 중간 회색 바탕 + 고운 종이 결.
        let value = 0.5 + (hash2(x, y, seed) - 0.5) * 0.08;
        // 덮임만큼 바탕도 함께 어두워지거나(목탄 가루) 밝아져(분필 가루) 획이 성긴 곳에서도 형태가 읽힌다.
        const charcoalCover = clamp01((charcoalLimit - t) * 4 + 0.5);
        if (charcoalCover > 0) {
          const stroke = hatch(x, y, DIAGONAL, -DIAGONAL, 3, 18, charcoalCover, seed + 1);
          value -= value * clamp01(stroke * opacity + charcoalCover * 0.35);
        }
        const chalkCover = clamp01((t - chalkLimit) * 4 + 0.5);
        if (chalkCover > 0) {
          const stroke = hatch(x, y, DIAGONAL, DIAGONAL, 3.6, 13, chalkCover, seed + 2);
          value += (1 - value) * clamp01(stroke * opacity + chalkCover * 0.3);
        }
        tone[index] = value;
      }
    }
    paintWith(image, tone, params);
  },
};

// ── 3. 목탄 ──

const CH_THICKNESS = paramSlider("charcoalThickness", "목탄 굵기", 1, 7, 1);
const CH_DETAIL = paramSlider("detail", "세부", 0, 5, 5);
const CH_BALANCE = paramSlider("lightDarkBalance", "명암 균형", 0, 100, 50);

const charcoal: StudioFilterGalleryEffectDef = {
  id: "sketch.charcoal",
  category: "sketch",
  label: "목탄",
  description: "굵은 윤곽선과 번진 대각선 목탄 획으로 명암을 단순화해 잉크색과 종이색으로 그립니다.",
  references: ["Photoshop · 목탄"],
  params: [CH_THICKNESS, CH_DETAIL, CH_BALANCE, INK, PAPER],
  cost: 6,
  apply(image, params, context) {
    const thickness = readSlider(params, CH_THICKNESS);
    const detail = readSlider(params, CH_DETAIL);
    const shift = ((readSlider(params, CH_BALANCE) - 50) / 100) * 0.8;
    const seed = context.seed + 3307;
    const { width, height } = image;
    const plane = alphaWeightedLuma(image, 0.6 + (5 - detail) * 0.5);
    const { magnitude } = sobel(plane, width, height);
    const edgeGain = 1 / (110 + (5 - detail) * 45);
    const along = 4 + thickness * 2.2;
    const across = 0.8 + thickness * 0.6;
    const ink = new Float32Array(plane.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const darkness = clamp01(1 - plane[index] / 255 + shift);
        // ↗ 방향으로 길게 늘인 값 노이즈를 어두운 정도만큼 문턱 처리해 번진 목탄 획을 만든다.
        const stroke = valueNoise2(((x - y) * DIAGONAL) / along, ((x + y) * DIAGONAL) / across, seed);
        const strokes = clamp01((stroke + darkness - 1) * 2.4 + 0.5) * (0.45 + 0.55 * darkness);
        ink[index] = Math.max(strokes, clamp01(magnitude[index] * edgeGain - 0.12));
      }
    }
    const smudged = smudgeDiagonal(ink, width, height, 1 + Math.round(thickness / 2));
    for (let index = 0; index < smudged.length; index += 1) smudged[index] = 1 - smudged[index];
    paintWith(image, smudged, params);
  },
};

// ── 4. 크롬 ──

const CR_DETAIL = paramSlider("detail", "세부", 0, 10, 4);
const CR_SMOOTHNESS = paramSlider("smoothness", "매끄러움", 0, 10, 7);

const chrome: StudioFilterGalleryEffectDef = {
  id: "sketch.chrome",
  category: "sketch",
  label: "크롬",
  description: "흐린 명암을 주기적인 반사 띠로 바꾸고 살짝 양각해 광택 나는 회색 금속 표면처럼 만듭니다.",
  references: ["Photoshop · 크롬"],
  params: [CR_DETAIL, CR_SMOOTHNESS],
  cost: 5,
  apply(image, params) {
    const detail = readSlider(params, CR_DETAIL);
    const smoothness = readSlider(params, CR_SMOOTHNESS);
    const { width, height, data } = image;
    const plane = alphaWeightedLuma(image, 1 + smoothness * 0.8);
    const { gx, gy } = sobel(plane, width, height);
    const [lx, ly] = lightVector("top-left");
    const bands = 1.1 + detail * 0.2;
    const slopeGain = (2 + detail * 0.5) / (8 * 255);
    for (let index = 0, offset = 0; index < plane.length; index += 1, offset += 4) {
      // 높은 곳(밝은 곳)과 경사가 반사 띠의 위상을 밀어 금속에 비친 주변처럼 굽이친다.
      const slope = -(gx[index] * lx + gy[index] * ly) * slopeGain;
      const phase = (plane[index] / 255) * bands + slope * 4;
      const metal = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
      const grey = clamp01(0.08 + 0.84 * metal + slope * 0.6) * 255;
      data[offset] = grey;
      data[offset + 1] = grey;
      data[offset + 2] = grey;
    }
  },
};

// ── 5. 콩테 크레용 ──

const CT_FOREGROUND = paramSlider("foregroundLevel", "전경 강도", 1, 15, 11);
const CT_BACKGROUND = paramSlider("backgroundLevel", "배경 강도", 1, 15, 7);
const CT_TEXTURE = paramSelect("texture", "텍스처", STUDIO_FILTER_GALLERY_TEXTURE_OPTIONS, "canvas");
const CT_SCALING = paramSlider("scaling", "배율", 50, 200, 100, "%");
const CT_RELIEF = paramSlider("relief", "부조", 0, 50, 4);
const CT_LIGHT = lightSelect("top");
const CT_INK = inkSpec("#3a2418");
const CT_PAPER = paperSpec("#e9dcc6");

const conteCrayon: StudioFilterGalleryEffectDef = {
  id: "sketch.conte-crayon",
  category: "sketch",
  label: "콩테 크레용",
  description: "어두운 곳은 잉크색, 밝은 곳은 종이색 크레용이 재질 결의 높은 곳에만 묻은 것처럼 칠하고 결을 양각합니다.",
  references: ["Photoshop · 콩테 크레용"],
  params: [CT_FOREGROUND, CT_BACKGROUND, CT_TEXTURE, CT_SCALING, CT_RELIEF, CT_LIGHT, CT_INK, CT_PAPER],
  cost: 7,
  apply(image, params, context) {
    const foreground = readSlider(params, CT_FOREGROUND) / 15;
    const background = readSlider(params, CT_BACKGROUND) / 15;
    const { width, height } = image;
    const surface = textureHeight(
      readSelect(params, CT_TEXTURE), width, height, readSlider(params, CT_SCALING) / 100, context.seed + 4409,
    );
    const plane = alphaWeightedLuma(image, 0.6);
    const tone = new Float32Array(plane.length);
    for (let index = 0; index < tone.length; index += 1) {
      const t = plane[index] / 255;
      // 크레용은 종이 결의 높은 곳에만 묻으므로 덮임을 결 높이로 조절한다.
      const tooth = 0.4 + 0.8 * surface[index];
      const dark = clamp01(((1 - t) * (0.55 + foreground) - 0.3) * 1.7 * tooth);
      const light = clamp01((t * (0.55 + background) - 0.3) * 1.7 * tooth);
      tone[index] = 0.5 - 0.5 * dark + 0.5 * light;
    }
    paintWith(image, tone, params, CT_INK, CT_PAPER);
    applyRelief(image, surface, readSelect(params, CT_LIGHT), readSlider(params, CT_RELIEF));
  },
};

// ── 6. 그래픽 펜 ──

const GP_LENGTH = paramSlider("strokeLength", "획 길이", 1, 15, 15);
const GP_BALANCE = paramSlider("lightDarkBalance", "명암 균형", 0, 100, 50);
const GP_DIRECTION = paramSelect(
  "direction",
  "획 방향",
  paramChoices(["right-diagonal", "오른쪽 대각선"], ["horizontal", "가로"], ["left-diagonal", "왼쪽 대각선"], ["vertical", "세로"]),
  "right-diagonal",
);

const graphicPen: StudioFilterGalleryEffectDef = {
  id: "sketch.graphic-pen",
  category: "sketch",
  label: "그래픽 펜",
  description: "어두운 곳일수록 촘촘한 한 방향의 가는 펜 획으로 다시 그려 잉크색과 종이색 두 색만 남깁니다.",
  references: ["Photoshop · 그래픽 펜"],
  params: [GP_LENGTH, GP_BALANCE, GP_DIRECTION, INK, PAPER],
  cost: 1,
  apply(image, params, context) {
    const length = Math.max(1, Math.round(readSlider(params, GP_LENGTH)));
    const shift = ((readSlider(params, GP_BALANCE) - 50) / 100) * 0.9;
    const direction = readSelect(params, GP_DIRECTION);
    const seed = context.seed + 5501;
    const { width, height } = image;
    const plane = lumaPlane(image);
    const tone = new Float32Array(plane.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        // line: 획이 놓이는 줄 번호(↗ 는 x + y, ↘ 는 x − y 가 한 획 위에서 일정), along: 줄을 따라가는 좌표.
        const line = direction === "horizontal" ? y : direction === "vertical" ? x : direction === "right-diagonal" ? x + y : x - y;
        const along = direction === "vertical" ? y : x;
        const segment = Math.floor((along + Math.floor(hash1(line, seed) * length)) / length);
        // 이웃 줄의 문턱이 고르게 퍼지도록 황금비 수열에 획마다 무작위를 더한다(같은 획은 같은 문턱).
        const threshold = fract(line * 0.618034 + hash2(line, segment, seed + 1) * 0.5);
        tone[index] = 1 - plane[index] / 255 + shift > threshold ? 0 : 1;
      }
    }
    paintWith(image, tone, params);
  },
};

// ── 7. 하프톤 패턴 ──

const HT_SIZE = paramSlider("size", "크기", 1, 12, 1);
const HT_CONTRAST = paramSlider("contrast", "대비", 0, 50, 5);
const HT_PATTERN = paramSelect("patternType", "패턴 유형", paramChoices(["circle", "동심원"], ["dot", "점"], ["line", "선"]), "dot");

const halftonePattern: StudioFilterGalleryEffectDef = {
  id: "sketch.halftone-pattern",
  category: "sketch",
  label: "하프톤 패턴",
  description: "점·선·동심원 망점 스크린으로 연속 명암을 흉내 내며 잉크색과 종이색 사이로 칠합니다.",
  references: ["Photoshop · 하프톤 패턴"],
  params: [HT_SIZE, HT_CONTRAST, HT_PATTERN, INK, PAPER],
  cost: 4,
  apply(image, params) {
    const period = 2.5 + readSlider(params, HT_SIZE) * 1.25;
    const sharpness = 1.2 + readSlider(params, HT_CONTRAST) * 0.6;
    const pattern = readSelect(params, HT_PATTERN);
    const { width, height } = image;
    const frequency = (Math.PI * 2) / period;
    const plane = alphaWeightedLuma(image, period * 0.3);
    const centerX = width / 2;
    const centerY = height / 2;
    const tone = new Float32Array(plane.length);
    for (let y = 0; y < height; y += 1) {
      const py = y + 0.5;
      for (let x = 0; x < width; x += 1) {
        const px = x + 0.5;
        // 스크린 값(0~1)보다 밝으면 종이, 어두우면 잉크. 대비가 낮으면 경계가 부드러워 연속 명암이 남는다.
        const screen = pattern === "dot"
          ? 0.5 + 0.25 * (Math.cos(px * frequency) + Math.cos(py * frequency))
          : pattern === "line"
            ? 0.5 + 0.5 * Math.cos(py * frequency)
            : 0.5 + 0.5 * Math.cos(Math.hypot(px - centerX, py - centerY) * frequency);
        const index = y * width + x;
        tone[index] = 0.5 + (plane[index] / 255 - screen) * sharpness;
      }
    }
    paintWith(image, tone, params);
  },
};

// ── 8. 메모지 ──

const NP_BALANCE = paramSlider("imageBalance", "이미지 균형", 0, 50, 25);
const NP_GRAININESS = paramSlider("graininess", "입자", 0, 20, 10);
const NP_RELIEF = paramSlider("relief", "부조", 0, 25, 11);

const notePaper: StudioFilterGalleryEffectDef = {
  id: "sketch.note-paper",
  category: "sketch",
  label: "메모지",
  description: "어두운 곳을 윗장이 오려진 구멍으로 남긴 두 겹 종이처럼 만들고 입자와 함께 양각합니다.",
  references: ["Photoshop · 메모지"],
  params: [NP_BALANCE, NP_GRAININESS, NP_RELIEF, INK, PAPER],
  cost: 5,
  apply(image, params, context) {
    const threshold = 0.2 + (readSlider(params, NP_BALANCE) / 50) * 0.6;
    const grain = readSlider(params, NP_GRAININESS) / 20;
    const relief = readSlider(params, NP_RELIEF) * 2;
    const seed = context.seed + 6607;
    const { width, height } = image;
    const plane = alphaWeightedLuma(image, 1.2);
    // layer 1 = 윗장, 0 = 구멍(아랫장). 살짝 흐려 종이 단면이 둥글게 보이게 한다.
    const layer = new Float32Array(plane.length);
    for (let index = 0; index < layer.length; index += 1) layer[index] = clamp01((plane[index] / 255 - threshold) * 14 + 0.5);
    gaussianPlane(layer, width, height, 1.2);
    const tone = new Float32Array(plane.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const noise = hash2(x, y, seed) - 0.5;
        tone[index] = 0.22 + 0.7 * layer[index] + noise * grain * 0.16;
        layer[index] += noise * grain * 0.12;
      }
    }
    paintWith(image, tone, params);
    applyRelief(image, layer, "top-left", relief);
  },
};

// ── 9. 석고 ──

const PL_BALANCE = paramSlider("imageBalance", "이미지 균형", 0, 50, 20);
const PL_SMOOTHNESS = paramSlider("smoothness", "매끄러움", 1, 15, 2);
const PL_LIGHT = lightSelect("top");

const plaster: StudioFilterGalleryEffectDef = {
  id: "sketch.plaster",
  category: "sketch",
  label: "석고",
  description: "어두운 곳을 둥글게 솟은 석고 덩어리로 빚어 빛 방향으로 음영을 주고 잉크색과 종이색으로 칠합니다.",
  references: ["Photoshop · 석고"],
  params: [PL_BALANCE, PL_SMOOTHNESS, PL_LIGHT, INK, PAPER],
  cost: 6,
  apply(image, params) {
    const threshold = 0.15 + (readSlider(params, PL_BALANCE) / 50) * 0.7;
    const smoothness = readSlider(params, PL_SMOOTHNESS);
    const [lx, ly] = lightVector(readSelect(params, PL_LIGHT));
    const { width, height } = image;
    const plane = alphaWeightedLuma(image, 0.8);
    // 문턱 → 흐림 → 다시 문턱: 석고를 부어 굳힌 듯 모서리가 둥근 덩어리가 된다.
    const mass = new Float32Array(plane.length);
    for (let index = 0; index < mass.length; index += 1) mass[index] = clamp01((threshold - plane[index] / 255) * 10 + 0.5);
    gaussianPlane(mass, width, height, 0.8 + smoothness * 0.8);
    for (let index = 0; index < mass.length; index += 1) {
      const m = clamp01((mass[index] - 0.35) / 0.3);
      mass[index] = m * m * (3 - 2 * m);
    }
    gaussianPlane(mass, width, height, 1.6 + smoothness * 0.15);
    const { gx, gy } = sobel(mass, width, height);
    const lightLength = Math.hypot(lx, ly, 0.9);
    const tone = new Float32Array(plane.length);
    for (let index = 0; index < tone.length; index += 1) {
      // 높이장 법선 (−∂h/∂x, −∂h/∂y, 1) 과 빛 벡터의 램버트 음영.
      const nx = -gx[index] * 0.9;
      const ny = -gy[index] * 0.9;
      const lambert = (nx * lx + ny * ly + 0.9) / (Math.sqrt(nx * nx + ny * ny + 1) * lightLength);
      tone[index] = lambert * 1.3 - 0.05 - mass[index] * 0.12;
    }
    paintWith(image, tone, params);
  },
};

// ── 10. 망사 효과 ──

const RT_DENSITY = paramSlider("density", "밀도", 0, 50, 12);
const RT_FOREGROUND = paramSlider("foregroundLevel", "전경 레벨", 0, 50, 40);
const RT_BACKGROUND = paramSlider("backgroundLevel", "배경 레벨", 0, 50, 5);

const reticulation: StudioFilterGalleryEffectDef = {
  id: "sketch.reticulation",
  category: "sketch",
  label: "망사 효과",
  description: "필름 유제가 수축한 듯 그림자에서는 뭉치고 밝은 곳에서는 옅게 흩어지는 입자로 다시 그립니다.",
  references: ["Photoshop · 망사 효과(Reticulation)"],
  params: [RT_DENSITY, RT_FOREGROUND, RT_BACKGROUND, INK, PAPER],
  cost: 4,
  apply(image, params, context) {
    const density = readSlider(params, RT_DENSITY) / 50;
    const foreground = readSlider(params, RT_FOREGROUND) / 50;
    const background = readSlider(params, RT_BACKGROUND) / 50;
    const sharpness = 2 + density * 14;
    const seed = context.seed + 7703;
    const { width, height } = image;
    const plane = alphaWeightedLuma(image, 0.6);
    const tone = new Float32Array(plane.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const darkness = clamp01((1 - plane[index] / 255) * (0.45 + foreground * 0.9) - background * 0.35 + 0.05);
        // 고운 해시 입자와 2px 덩어리 노이즈를 섞어 어두운 곳에서 입자가 서로 붙게 한다.
        const clump = 0.6 * valueNoise2(x / 1.8, y / 1.8, seed) + 0.4 * hash2(x, y, seed + 1);
        tone[index] = 1 - clamp01((darkness - clump) * sharpness + 0.5);
      }
    }
    paintWith(image, tone, params);
  },
};

// ── 11. 찢긴 가장자리 ──

const TE_BALANCE = paramSlider("imageBalance", "이미지 균형", 0, 50, 25);
const TE_SMOOTHNESS = paramSlider("smoothness", "매끄러움", 1, 15, 11);
const TE_CONTRAST = paramSlider("contrast", "대비", 1, 25, 17);

const tornEdges: StudioFilterGalleryEffectDef = {
  id: "sketch.torn-edges",
  category: "sketch",
  label: "찢긴 가장자리",
  description: "프랙털 노이즈로 흔든 문턱으로 형태를 잘라 찢어 붙인 종이 조각처럼 잉크색과 종이색 두 색만 남깁니다.",
  references: ["Photoshop · 찢긴 가장자리"],
  params: [TE_BALANCE, TE_SMOOTHNESS, TE_CONTRAST, INK, PAPER],
  cost: 9,
  apply(image, params, context) {
    const threshold = 0.15 + (readSlider(params, TE_BALANCE) / 50) * 0.7;
    const smoothness = readSlider(params, TE_SMOOTHNESS);
    // 대비가 낮을수록 가장자리 흔들림이 커져 더 거칠게 찢긴다.
    const rough = (25 - readSlider(params, TE_CONTRAST)) / 24;
    const warp = 1.5 + rough * 5;
    const ragged = 0.04 + rough * 0.16;
    const seed = context.seed + 8803;
    const { width, height } = image;
    // 매끄러움 1~3(반지름 0.75~1.45)은 공용 흐림의 가장 작은 상자에 묶여 같은 결과였다. √3 아래도 이어지게 흐린다.
    const plane = alphaWeightedLuma(image, 0.4 + smoothness * 0.35, true);
    const tone = new Float32Array(plane.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // 표본 위치를 프랙털 노이즈로 밀어 윤곽을 굵게 흔들고(찢긴 선), 문턱에 고운 노이즈를 더해 섬유 톱니를 낸다.
        const sx = clamp(Math.round(x + (fbm2(x / 9, y / 9, seed, 2) - 0.5) * 2 * warp), 0, width - 1);
        const sy = clamp(Math.round(y + (fbm2(x / 9, y / 9, seed + 5, 2) - 0.5) * 2 * warp), 0, height - 1);
        const fibre = (valueNoise2(x / 2.5, y / 2.5, seed + 9) - 0.5) * 2 * ragged + (hash2(x, y, seed + 1) - 0.5) * ragged * 0.5;
        tone[y * width + x] = plane[sy * width + sx] / 255 + fibre > threshold ? 1 : 0;
      }
    }
    paintWith(image, tone, params);
  },
};

// ── 12. 물 종이 ──

const WP_FIBER = paramSlider("fiberLength", "섬유 길이", 3, 50, 15);
const WP_BRIGHTNESS = paramSlider("brightness", "밝기", 0, 100, 60);
const WP_CONTRAST = paramSlider("contrast", "대비", 0, 100, 80);

const waterPaper: StudioFilterGalleryEffectDef = {
  id: "sketch.water-paper",
  category: "sketch",
  label: "물 종이",
  description: "젖은 섬유질 종이에 물감이 번지듯 색을 무작위 짧은 섬유 방향으로 흘려 얼룩지게 섞습니다.",
  references: ["Photoshop · 물 종이"],
  params: [WP_FIBER, WP_BRIGHTNESS, WP_CONTRAST],
  cost: 8,
  apply(image, params, context) {
    const fiber = readSlider(params, WP_FIBER);
    const lift = (readSlider(params, WP_BRIGHTNESS) - 50) * 1.6;
    const gain = 0.4 + (readSlider(params, WP_CONTRAST) / 100) * 1.2;
    const seed = context.seed + 9907;
    const { width, height, data } = image;
    const source = data.slice();
    // 섬유 한 가닥당 표본 수(3~10). 길이가 길어도 작업량이 크게 늘지 않게 간격을 넓힌다.
    const steps = clamp(Math.round(fiber / 4), 3, 10);
    const flowScale = fiber * 0.8;
    const fibreContrast = 0.1 * Math.sqrt(steps);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        // 섬유 방향: 섬유 길이 규모로 천천히 도는 무작위 장 + 픽셀마다 흔들림, 길이도 섬유마다 다르다.
        const angle = (valueNoise2(x / flowScale, y / flowScale, seed) * 2 + hash2(x, y, seed + 2) * 0.3) * Math.PI;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const half = fiber * (0.3 + 0.7 * hash2(x, y, seed + 3)) * 0.5;
        let red = 0, green = 0, blue = 0, total = 0, grain = 0;
        for (let step = 0; step < steps; step += 1) {
          const along = (((step + 0.5) / steps) * 2 - 1) * half;
          const sx = clamp(Math.round(x + dx * along), 0, width - 1);
          const sy = clamp(Math.round(y + dy * along), 0, height - 1);
          const sourceOffset = (sy * width + sx) * 4;
          // 섬유 가운데일수록 무겁고, 투명 픽셀은 색을 보태지 않는다(알파 가중).
          const weight = source[sourceOffset + 3] * (1 - (Math.abs(along) / (half + 1e-6)) * 0.6);
          red += source[sourceOffset] * weight;
          green += source[sourceOffset + 1] * weight;
          blue += source[sourceOffset + 2] * weight;
          total += weight;
          // 같은 경로를 따라 백색 잡음을 적분하면(선적분 합성곱) 흐름 방향의 종이 섬유 결이 생긴다.
          grain += hash2(sx, sy, seed + 4);
        }
        const offset = index * 4;
        // 표본 무게(알파 합)가 이 픽셀 알파보다 작으면 모자란 만큼 제 색으로 채운다. 짝수 표본 수는 가운데 픽셀을 건너뛰어
        // 표본이 투명하거나 희미한 가장자리에만 닿을 수 있는데, 그때 거의 불투명한 선이 희미한 픽셀의 양자화된 색으로 통째로
        // 바뀌지 않고 알파 0↔1 사이에서도 결과가 이어진다. 불투명·균일 알파 입력은 표본 무게가 늘 더 커서 그대로다.
        const deficit = source[offset + 3] - total;
        if (deficit > 0) {
          red += source[offset] * deficit;
          green += source[offset + 1] * deficit;
          blue += source[offset + 2] * deficit;
          total += deficit;
        }
        if (total <= 0) continue;
        // 섬유 결 + 섬유 길이보다 큰 얼룩(젖은 종이의 물 자국).
        const fibre = 0.92 + 0.16 * valueNoise2(x / (fiber * 1.5), y / (fiber * 1.5), seed + 5) + (grain / steps - 0.5) * fibreContrast;
        data[offset] = ((red / total - 128) * gain + 128 + lift) * fibre;
        data[offset + 1] = ((green / total - 128) * gain + 128 + lift) * fibre;
        data[offset + 2] = ((blue / total - 128) * gain + 128 + lift) * fibre;
      }
    }
  },
};

/** 스케치 분류 효과 목록(id 는 문서에 저장되므로 바꾸지 않는다). */
export const STUDIO_FILTER_GALLERY_SKETCH_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  basRelief,
  chalkCharcoal,
  charcoal,
  chrome,
  conteCrayon,
  graphicPen,
  halftonePattern,
  notePaper,
  plaster,
  reticulation,
  tornEdges,
  waterPaper,
];
