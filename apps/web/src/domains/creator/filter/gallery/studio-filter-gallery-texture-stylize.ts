/**
 * 필터 갤러리 "텍스처" 분류 커널 5종.
 *
 * 균열·그레인·모자이크 타일·패치워크·텍스처화를 공개 매뉴얼의 기능 설명과 일반적인 절차적 텍스처 기법
 * (Worley 1996 셀 노이즈의 F2−F1 경계, 값 노이즈 도메인 휨, 칸 평균색, 높이맵 요철 조명)만으로 새로 구현했다.
 * 재질 높이맵과 요철 조명은 공용 텍스처 모듈을 쓴다. 난수는 context.seed 에 효과별 상수를 더한 해시에서만 나오고,
 * 크기 매개변수는 이미지 px 단위이며, 다섯 효과 모두 알파를 그대로 둔다(RGB 만 고친다).
 * 스타일화 분류는 `studio-filter-gallery-stylize.ts` 에 있다.
 */
import { clamp, hash2, luma, valueNoise2 } from "./studio-filter-gallery-kernel-utils";
import {
  alphaWeightedLuma,
  paramChoices,
  paramSelect,
  paramSlider,
  paramToggle,
  readSelect,
  readSlider,
  readToggle,
} from "./studio-filter-gallery-sketch";
import {
  STUDIO_FILTER_GALLERY_LIGHT_OPTIONS,
  STUDIO_FILTER_GALLERY_TEXTURE_OPTIONS,
  applyRelief,
  textureHeight,
} from "./studio-filter-gallery-textures";

import type { StudioFilterGalleryEffectDef } from "./studio-filter-gallery-types";

/**
 * Worley(1996) 셀 노이즈의 F2 − F1(셀 단위). 0 에 가까울수록 두 셀의 경계(균열·줄눈)다.
 * 특징점을 셀 안쪽 15~85% 에 두어 3×3 이웃 셀만 봐도 경계가 끊기지 않는다.
 */
function cellBorder(u: number, v: number, seed: number): number {
  const cellX = Math.floor(u);
  const cellY = Math.floor(v);
  let first = Infinity;
  let second = Infinity;
  for (let j = -1; j <= 1; j += 1) {
    for (let i = -1; i <= 1; i += 1) {
      const cx = cellX + i;
      const cy = cellY + j;
      const dx = cx + 0.15 + 0.7 * hash2(cx, cy, seed) - u;
      const dy = cy + 0.15 + 0.7 * hash2(cx, cy, seed + 1) - v;
      const distance = dx * dx + dy * dy;
      if (distance < first) {
        second = first;
        first = distance;
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  return Math.sqrt(second) - Math.sqrt(first);
}

// ── 13. 균열 ──

const CQ_SPACING = paramSlider("crackSpacing", "균열 간격", 2, 100, 15);
const CQ_DEPTH = paramSlider("crackDepth", "균열 깊이", 0, 10, 6);
const CQ_BRIGHTNESS = paramSlider("crackBrightness", "균열 밝기", 0, 10, 9);

const craquelure: StudioFilterGalleryEffectDef = {
  id: "texture.craquelure",
  category: "texture",
  label: "균열",
  description: "이미지를 회반죽 면에 칠한 듯 양각하고 그 위에 가늘게 갈라진 균열 그물을 새깁니다.",
  references: ["Photoshop · 균열"],
  params: [CQ_SPACING, CQ_DEPTH, CQ_BRIGHTNESS],
  cost: 7,
  apply(image, params, context) {
    const { width, height, data } = image;
    const spacing = Math.min(readSlider(params, CQ_SPACING), Math.max(2, width, height));
    const depth = readSlider(params, CQ_DEPTH) / 10;
    const brightness = readSlider(params, CQ_BRIGHTNESS) / 10;
    if (depth <= 0) return;
    const seed = context.seed + 1201;
    const crackWidth = 1.1 + depth * 1.1;
    const warp = spacing * 0.45;
    const warpScale = spacing * 1.1;
    const darken = depth * (0.8 - brightness * 0.55);
    // 회반죽 면은 이미지 명암을 따라 살짝 솟고(알파 가중 휘도) 균열에서 움푹 꺼진다.
    const surface = alphaWeightedLuma(image, 1);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        // 균열이 곧은 다각형이 되지 않도록 표본 좌표를 값 노이즈로 휜다.
        const u = (x + (valueNoise2(x / warpScale, y / warpScale, seed) - 0.5) * warp) / spacing;
        const v = (y + (valueNoise2(x / warpScale, y / warpScale, seed + 1) - 0.5) * warp) / spacing;
        const border = cellBorder(u, v, seed + 2) * spacing;
        const crack = border < crackWidth ? 1 - border / crackWidth : 0;
        surface[index] = 0.65 + (surface[index] / 255) * 0.35 - crack * (0.25 + depth * 0.5);
        const shade = 1 - crack * darken;
        const offset = index * 4;
        data[offset] *= shade;
        data[offset + 1] *= shade;
        data[offset + 2] *= shade;
      }
    }
    applyRelief(image, surface, "top-left", depth * 50);
  },
};

// ── 14. 그레인 ──

const GR_INTENSITY = paramSlider("intensity", "강도", 0, 100, 40);
const GR_CONTRAST = paramSlider("contrast", "대비", 0, 100, 50);
const GR_TYPE = paramSelect(
  "grainType",
  "그레인 유형",
  paramChoices(
    ["regular", "일반"], ["soft", "부드럽게"], ["sprinkles", "뿌리기"], ["clumped", "뭉침"], ["contrasty", "고대비"],
    ["enlarged", "확대"], ["stippled", "점묘"], ["horizontal", "가로"], ["vertical", "세로"], ["speckle", "반점"],
  ),
  "regular",
);
type GrainType = (typeof GR_TYPE.options)[number]["value"];

/** 그레인 유형별 밝기 변화(대략 −1~1). 뿌리기·점묘는 apply 에서 따로 처리한다. */
function grainNoise(type: GrainType, x: number, y: number, seed: number): number {
  switch (type) {
    case "soft":
      return (valueNoise2(x / 1.7, y / 1.7, seed) - 0.5) * 1.6;
    case "clumped":
      return (valueNoise2(x / 2.6, y / 2.6, seed) - 0.5) * 1.8 + (hash2(x, y, seed + 1) - 0.5) * 0.5;
    case "contrasty":
      return hash2(x, y, seed) < 0.5 ? -1 : 1;
    case "enlarged":
      return (valueNoise2(x / 4, y / 4, seed) - 0.5) * 2;
    case "horizontal":
      // y 가 정수라 행마다 독립이고 x 로만 천천히 변한다 → 가로 줄무늬 입자.
      return (valueNoise2(x / 6, y, seed) - 0.5) * 2;
    case "vertical":
      return (valueNoise2(x, y / 6, seed) - 0.5) * 2;
    case "speckle": {
      const blob = hash2(Math.floor(x / 2), Math.floor(y / 2), seed);
      if (blob < 0.12) return hash2(Math.floor(x / 2), Math.floor(y / 2), seed + 1) < 0.5 ? -1.6 : 1.6;
      return (hash2(x, y, seed + 2) - 0.5) * 0.3;
    }
    default:
      // 일반: 두 균등 난수의 합(삼각 분포)으로 필름 입자처럼 가운데에 몰린 단색 노이즈.
      return hash2(x, y, seed) + hash2(x, y, seed + 1) - 1;
  }
}

const grain: StudioFilterGalleryEffectDef = {
  id: "texture.grain",
  category: "texture",
  label: "그레인",
  description: "일반·부드럽게·뭉침·점묘·가로·세로 등 열 가지 입자 유형 중 하나로 이미지에 입자 질감을 더합니다.",
  references: ["Photoshop · 그레인(텍스처)"],
  params: [GR_INTENSITY, GR_CONTRAST, GR_TYPE],
  cost: 1,
  apply(image, params, context) {
    const amount = readSlider(params, GR_INTENSITY) / 100;
    const type = readSelect(params, GR_TYPE);
    // 대비 50 이 원본 대비다. 고대비 유형은 대비를 조금 더 올린다.
    const gain = (0.4 + (readSlider(params, GR_CONTRAST) / 100) * 1.2) * (type === "contrasty" ? 1.35 : 1);
    const seed = context.seed + 1409;
    const { width, height, data } = image;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        let red = (data[offset] - 128) * gain + 128;
        let green = (data[offset + 1] - 128) * gain + 128;
        let blue = (data[offset + 2] - 128) * gain + 128;
        if (type === "sprinkles") {
          // 드문드문 밝은 알갱이를 흩뿌린다.
          if (hash2(x, y, seed) < amount * 0.22) {
            const lift = 0.55 + 0.45 * hash2(x, y, seed + 1);
            red += (255 - red) * lift;
            green += (255 - green) * lift;
            blue += (255 - blue) * lift;
          }
        } else if (type === "stippled") {
          // 어두운 곳일수록 잉크 점이 찍히고, 나머지는 종이처럼 밝아진다.
          const darkness = clamp(1 - luma(red, green, blue) / 255, 0, 1);
          const dot = hash2(x, y, seed) < darkness * (0.25 + amount * 0.75);
          const keep = dot ? 0.18 : 1;
          const lift = dot ? 0 : amount * 0.5;
          red = red * keep + (255 - red * keep) * lift;
          green = green * keep + (255 - green * keep) * lift;
          blue = blue * keep + (255 - blue * keep) * lift;
        } else {
          const noise = grainNoise(type, x, y, seed) * amount * 110;
          red += noise;
          green += noise;
          blue += noise;
        }
        data[offset] = red;
        data[offset + 1] = green;
        data[offset + 2] = blue;
      }
    }
  },
};

// ── 15. 모자이크 타일 ──

const MT_SIZE = paramSlider("tileSize", "타일 크기", 2, 100, 12);
const MT_GROUT = paramSlider("groutWidth", "줄눈 폭", 1, 15, 3);
const MT_LIGHTEN = paramSlider("lightenGrout", "줄눈 밝기", 0, 10, 9);

const mosaicTiles: StudioFilterGalleryEffectDef = {
  id: "texture.mosaic-tiles",
  category: "texture",
  label: "모자이크 타일",
  description: "조금씩 어긋난 작은 타일로 이미지를 나누고 타일 사이에 줄눈을 넣어 모서리를 비스듬히 깎습니다.",
  references: ["Photoshop · 모자이크 타일"],
  params: [MT_SIZE, MT_GROUT, MT_LIGHTEN],
  cost: 2,
  apply(image, params, context) {
    const { width, height, data } = image;
    const size = Math.min(readSlider(params, MT_SIZE), Math.max(2, width, height));
    const grout = Math.min(readSlider(params, MT_GROUT), size * 0.45) / 2;
    const lighten = readSlider(params, MT_LIGHTEN) / 10;
    const seed = context.seed + 1511;
    const warp = size * 0.1;
    const warpScale = size * 1.4;
    const bevel = Math.max(1, size * 0.15);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // 타일 격자를 값 노이즈로 살짝 휘어 손으로 붙인 듯 줄이 고르지 않게 한다.
        const u = x + 0.5 + (valueNoise2(x / warpScale, y / warpScale, seed) - 0.5) * 2 * warp;
        const v = y + 0.5 + (valueNoise2(x / warpScale, y / warpScale, seed + 1) - 0.5) * 2 * warp;
        const cellX = Math.floor(u / size);
        const cellY = Math.floor(v / size);
        const left = u - cellX * size;
        const top = v - cellY * size;
        const edge = Math.min(left, size - left, top, size - top);
        const offset = (y * width + x) * 4;
        if (edge < grout) {
          // 줄눈: 이미지 색이 비치는 어두운 시멘트에서 줄눈 밝기만큼 밝은 회색으로.
          for (let channel = 0; channel < 3; channel += 1) {
            data[offset + channel] = data[offset + channel] * (0.25 + 0.1 * lighten) + 150 * lighten;
          }
          continue;
        }
        let shade = 1 + (hash2(cellX, cellY, seed + 2) - 0.5) * 0.14;
        const inner = edge - grout;
        if (inner < bevel) {
          // 왼쪽·위 모서리는 빛을 받고 오른쪽·아래 모서리는 그늘진다.
          const falloff = 1 - inner / bevel;
          shade += edge === left || edge === top ? falloff * 0.3 : -falloff * 0.35;
        }
        data[offset] *= shade;
        data[offset + 1] *= shade;
        data[offset + 2] *= shade;
      }
    }
  },
};

// ── 16. 패치워크 ──

const PW_SIZE = paramSlider("squareSize", "사각형 크기", 1, 10, 4);
const PW_RELIEF = paramSlider("relief", "부조", 0, 25, 8);

const patchwork: StudioFilterGalleryEffectDef = {
  id: "texture.patchwork",
  category: "texture",
  label: "패치워크",
  description: "작은 사각형마다 그 영역의 우세한 색을 채우고 사각형을 무작위로 높이거나 낮춰 양각합니다.",
  references: ["Photoshop · 패치워크"],
  params: [PW_SIZE, PW_RELIEF],
  cost: 1,
  apply(image, params, context) {
    const { width, height, data } = image;
    const cell = Math.max(1, Math.min(Math.round(readSlider(params, PW_SIZE)) + 2, Math.max(width, height)));
    const seed = context.seed + 1613;
    const heights = new Float32Array(width * height);
    for (let top = 0; top < height; top += cell) {
      const bottom = Math.min(height, top + cell);
      for (let left = 0; left < width; left += cell) {
        const right = Math.min(width, left + cell);
        let red = 0, green = 0, blue = 0, weight = 0;
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const offset = (y * width + x) * 4;
            const alpha = data[offset + 3];
            red += data[offset] * alpha;
            green += data[offset + 1] * alpha;
            blue += data[offset + 2] * alpha;
            weight += alpha;
          }
        }
        const lift = 0.3 + 0.7 * hash2(left / cell, top / cell, seed);
        // 우세한 색: 알파 가중 평균에 가장 가까운 실제 픽셀 색(평균의 탁한 색 대신 칸에 실제로 있는 색).
        let best = Infinity, bestOffset = -1;
        if (weight > 0) {
          red /= weight;
          green /= weight;
          blue /= weight;
          for (let y = top; y < bottom; y += 1) {
            for (let x = left; x < right; x += 1) {
              const offset = (y * width + x) * 4;
              if (data[offset + 3] === 0) continue;
              const distance = (data[offset] - red) ** 2 + (data[offset + 1] - green) ** 2 + (data[offset + 2] - blue) ** 2;
              if (distance < best) {
                best = distance;
                bestOffset = offset;
              }
            }
          }
        }
        const fillRed = bestOffset >= 0 ? data[bestOffset] : 0;
        const fillGreen = bestOffset >= 0 ? data[bestOffset + 1] : 0;
        const fillBlue = bestOffset >= 0 ? data[bestOffset + 2] : 0;
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const index = y * width + x;
            // 칸 왼쪽·위 1px 은 홈으로 낮춰 사각형 경계가 도드라지게 한다.
            heights[index] = x === left || y === top ? lift * 0.4 : lift;
            if (bestOffset < 0) continue;
            data[index * 4] = fillRed;
            data[index * 4 + 1] = fillGreen;
            data[index * 4 + 2] = fillBlue;
          }
        }
      }
    }
    applyRelief(image, heights, "top-left", readSlider(params, PW_RELIEF) * 2);
  },
};

// ── 17. 텍스처화 ──

const TX_TEXTURE = paramSelect("texture", "텍스처", STUDIO_FILTER_GALLERY_TEXTURE_OPTIONS, "canvas");
const TX_SCALING = paramSlider("scaling", "배율", 50, 200, 100, "%");
const TX_RELIEF = paramSlider("relief", "부조", 0, 50, 4);
const TX_LIGHT = paramSelect("lightDirection", "빛 방향", STUDIO_FILTER_GALLERY_LIGHT_OPTIONS, "top");
const TX_INVERT = paramToggle("invert", "반전", false);

const texturizer: StudioFilterGalleryEffectDef = {
  id: "texture.texturizer",
  category: "texture",
  label: "텍스처화",
  description: "캔버스·삼베·사암·벽돌 같은 재질 결을 골라 배율과 빛 방향에 맞춰 이미지 위에 요철로 얹습니다.",
  references: ["Photoshop · 텍스처화", "GIMP · 캔버스 적용"],
  params: [TX_TEXTURE, TX_SCALING, TX_RELIEF, TX_LIGHT, TX_INVERT],
  cost: 5,
  apply(image, params, context) {
    const surface = textureHeight(
      readSelect(params, TX_TEXTURE), image.width, image.height, readSlider(params, TX_SCALING) / 100, context.seed + 1709,
    );
    applyRelief(image, surface, readSelect(params, TX_LIGHT), readSlider(params, TX_RELIEF), readToggle(params, TX_INVERT));
  },
};

/** 텍스처 분류 효과 목록(id 는 문서에 저장되므로 바꾸지 않는다). */
export const STUDIO_FILTER_GALLERY_TEXTURE_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  craquelure,
  grain,
  mosaicTiles,
  patchwork,
  texturizer,
];
