/**
 * 필터 갤러리 · 노이즈 계열과 경계 보존 흐림.
 *
 * 사진 편집기의 "던지기·고르기·흘러내림·HSV 노이즈"(무작위 픽셀 교란)와 경계를 지키는 두 흐림
 * (대칭 최근접 이웃 평균, 평균 곡률 흐름)을 공개 알고리즘으로 새로 구현했다.
 *   - 대칭 최근접 이웃: Harwood·Subbarao·Hakalahti·Davis 1987.
 *   - 평균 곡률 흐름: 등위선 곡률 κ|∇u| 로 확산하는 기하 흐름(Alvarez·Guichard·Lions·Morel 1993).
 * 무작위성은 모두 context.seed 를 섞은 정수 해시라 같은 입력은 언제나 같은 결과를 낸다. 알파는 그대로 둔다.
 */
import { clamp, createRandom, hash2, hsvToRgb, numberParam, rgbToHsv } from "./studio-filter-gallery-kernel-utils";

import type { StudioFilterGalleryEffectDef, StudioFilterGalleryParamSpec, StudioFilterGalleryParams } from "./studio-filter-gallery-types";

const RANDOMIZATION: StudioFilterGalleryParamSpec = {
  key: "randomization", label: "무작위 비율", control: "slider", min: 1, max: 100, step: 1, default: 50, suffix: "%",
};
const REPEAT: StudioFilterGalleryParamSpec = { key: "repeat", label: "반복", control: "slider", min: 1, max: 10, step: 1, default: 1 };

/** 던지기는 픽셀을 완전히 새 색으로 바꿔 50%면 그림이 묻히므로 기본값을 낮게 둔다. */
const HURL_RANDOMIZATION: StudioFilterGalleryParamSpec = { ...RANDOMIZATION, default: 20 };

function randomizationParams(params: StudioFilterGalleryParams, fallback = 50): { readonly chance: number; readonly repeat: number } {
  return {
    chance: numberParam(params, "randomization", fallback, 1, 100) / 100,
    repeat: Math.round(numberParam(params, "repeat", 1, 1, 10)),
  };
}

const hurl: StudioFilterGalleryEffectDef = {
  id: "noise.hurl",
  category: "noise",
  label: "던지기",
  description: "고른 비율만큼의 픽셀을 완전히 무작위한 색으로 바꿉니다.",
  references: ["GIMP · 던지기(Hurl)"],
  params: [HURL_RANDOMIZATION, REPEAT],
  cost: 1,
  apply(image, params, context) {
    const { chance, repeat } = randomizationParams(params, 20);
    const { data } = image;
    const pixels = image.width * image.height;
    for (let pass = 0; pass < repeat; pass += 1) {
      const seed = context.seed ^ (0x1f2e3d4c + pass * 977);
      for (let index = 0; index < pixels; index += 1) {
        if (hash2(index, pass, seed) >= chance) continue;
        const offset = index * 4;
        data[offset] = hash2(index, 1, seed) * 256;
        data[offset + 1] = hash2(index, 2, seed) * 256;
        data[offset + 2] = hash2(index, 3, seed) * 256;
      }
    }
  },
};

const pick: StudioFilterGalleryEffectDef = {
  id: "noise.pick",
  category: "noise",
  label: "고르기",
  description: "고른 비율만큼의 픽셀을 바로 옆 3×3 이웃 가운데 무작위로 고른 픽셀로 바꿉니다.",
  references: ["GIMP · 고르기(Pick)"],
  params: [RANDOMIZATION, REPEAT],
  cost: 1,
  apply(image, params, context) {
    const { chance, repeat } = randomizationParams(params);
    const { width, height, data } = image;
    for (let pass = 0; pass < repeat; pass += 1) {
      const source = data.slice();
      const seed = context.seed ^ (0x2a3b4c5d + pass * 1543);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          if (hash2(index, pass, seed) >= chance) continue;
          const choice = Math.floor(hash2(index, 7, seed) * 9);
          const sx = clamp(x + (choice % 3) - 1, 0, width - 1), sy = clamp(y + Math.floor(choice / 3) - 1, 0, height - 1);
          const from = (sy * width + sx) * 4, to = index * 4;
          // 알파는 그대로 두고 색만 옮긴다(보이지 않는 픽셀의 색을 끌어오지 않도록 투명한 이웃은 건너뛴다).
          if (source[from + 3]! === 0) continue;
          data[to] = source[from]!; data[to + 1] = source[from + 1]!; data[to + 2] = source[from + 2]!;
        }
      }
    }
  },
};

const slur: StudioFilterGalleryEffectDef = {
  id: "noise.slur",
  category: "noise",
  label: "흘러내림",
  description: "고른 픽셀이 바로 위(가끔 위 대각선) 픽셀을 이어받아 그림이 아래로 녹아 흐르는 듯 보이게 합니다.",
  references: ["GIMP · 흘러내림(Slur)"],
  params: [RANDOMIZATION, REPEAT],
  cost: 1,
  apply(image, params, context) {
    const { chance, repeat } = randomizationParams(params);
    const { width, height, data } = image;
    for (let pass = 0; pass < repeat; pass += 1) {
      const seed = context.seed ^ (0x3c4d5e6f + pass * 2203);
      // 위에서 아래로 제자리 갱신하므로 한 번 흘러내린 색이 다음 줄로 이어져 줄기가 생긴다.
      for (let y = 1; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          if (hash2(index, pass, seed) >= chance) continue;
          const roll = hash2(index, 11, seed);
          const sx = roll < 0.1 ? Math.max(0, x - 1) : roll < 0.2 ? Math.min(width - 1, x + 1) : x;
          const from = ((y - 1) * width + sx) * 4, to = index * 4;
          if (data[from + 3]! === 0) continue;
          data[to] = data[from]!; data[to + 1] = data[from + 1]!; data[to + 2] = data[from + 2]!;
        }
      }
    }
  },
};

const hsvNoise: StudioFilterGalleryEffectDef = {
  id: "noise.hsv-noise",
  category: "noise",
  label: "HSV 노이즈",
  description: "색상·채도·명도를 따로 정한 폭 안에서 무작위로 흔들어 색 얼룩 같은 노이즈를 만듭니다.",
  references: ["GIMP · HSV 노이즈"],
  params: [
    { key: "holdness", label: "고정도", control: "slider", min: 1, max: 8, step: 1, default: 2 },
    { key: "hue", label: "색상 폭", control: "slider", min: 0, max: 180, step: 1, default: 8, suffix: "°" },
    { key: "saturation", label: "채도 폭", control: "slider", min: 0, max: 100, step: 1, default: 15, suffix: "%" },
    { key: "value", label: "명도 폭", control: "slider", min: 0, max: 100, step: 1, default: 15, suffix: "%" },
  ],
  cost: 0.8,
  apply(image, params, context) {
    const holdness = Math.round(numberParam(params, "holdness", 2, 1, 8));
    const hueRange = numberParam(params, "hue", 8, 0, 180) / 360;
    const saturationRange = numberParam(params, "saturation", 15, 0, 100) / 100;
    const valueRange = numberParam(params, "value", 15, 0, 100) / 100;
    const random = createRandom(context.seed ^ 0x4d5e6f70);
    // 고정도가 높을수록 여러 난수의 최솟값을 써서 흔들림이 0 근처에 모인다.
    const jitter = (): number => {
      let magnitude = 1;
      for (let draw = 0; draw < holdness; draw += 1) magnitude = Math.min(magnitude, random());
      return random() < 0.5 ? -magnitude : magnitude;
    };
    const hsv = new Float32Array(3), rgb = new Float32Array(3);
    const { data } = image;
    for (let offset = 0; offset < data.length; offset += 4) {
      rgbToHsv(data[offset]!, data[offset + 1]!, data[offset + 2]!, hsv);
      const hue = hsv[0]! + jitter() * hueRange;
      const saturation = hsv[1]! + jitter() * saturationRange;
      const value = hsv[2]! + jitter() * valueRange;
      hsvToRgb(hue, saturation, value, rgb);
      data[offset] = rgb[0]!; data[offset + 1] = rgb[1]!; data[offset + 2] = rgb[2]!;
    }
  },
};

const symmetricNearestNeighbor: StudioFilterGalleryEffectDef = {
  id: "blur.symmetric-nearest-neighbor",
  category: "blur",
  label: "대칭 최근접 이웃",
  description: "중심을 사이에 둔 픽셀 쌍마다 중심 색에 더 가까운 쪽만 평균해 경계를 지키며 잡티를 고릅니다.",
  references: ["GIMP · 대칭 최근접 이웃"],
  params: [{ key: "radius", label: "반경", control: "slider", min: 1, max: 6, step: 1, default: 3, suffix: "px" }],
  cost: 10,
  apply(image, params) {
    const { width, height, data } = image;
    const radius = Math.round(numberParam(params, "radius", 3, 1, 6));
    const source = data.slice();
    const at = (x: number, y: number): number => (clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)) * 4;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const center = (y * width + x) * 4;
        if (source[center + 3]! === 0) continue;
        const cr = source[center]!, cg = source[center + 1]!, cb = source[center + 2]!;
        let red = cr, green = cg, blue = cb, total = 1;
        // 창의 절반(사전순으로 중심보다 앞선 위치)만 돌면 대칭 쌍을 한 번씩 본다.
        for (let dy = -radius; dy <= 0; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dy === 0 && dx >= 0) break;
            const a = at(x + dx, y + dy), b = at(x - dx, y - dy);
            const da = source[a + 3]! === 0 ? Infinity
              : Math.abs(source[a]! - cr) + Math.abs(source[a + 1]! - cg) + Math.abs(source[a + 2]! - cb);
            const db = source[b + 3]! === 0 ? Infinity
              : Math.abs(source[b]! - cr) + Math.abs(source[b + 1]! - cg) + Math.abs(source[b + 2]! - cb);
            if (da === Infinity && db === Infinity) continue;
            const chosen = da <= db ? a : b;
            red += source[chosen]!; green += source[chosen + 1]!; blue += source[chosen + 2]!;
            total += 1;
          }
        }
        data[center] = red / total; data[center + 1] = green / total; data[center + 2] = blue / total;
      }
    }
  },
};

const valueOr = (plane: Float32Array, opaque: Uint8Array, index: number, fallback: number): number =>
  opaque[index] === 1 ? plane[index]! : fallback;

const meanCurvature: StudioFilterGalleryEffectDef = {
  id: "blur.mean-curvature",
  category: "blur",
  label: "평균 곡률 흐림",
  description: "등고선의 곡률을 따라서만 번지게 해 모서리는 살리고 잔 요철과 계단을 둥글게 다듬습니다.",
  references: ["GIMP · 평균 곡률 흐림"],
  params: [{ key: "iterations", label: "반복", control: "slider", min: 1, max: 30, step: 1, default: 10 }],
  cost: 30,
  apply(image, params) {
    const { width, height, data } = image;
    const iterations = Math.round(numberParam(params, "iterations", 10, 1, 30));
    const count = width * height;
    const opaque = new Uint8Array(count);
    for (let index = 0; index < count; index += 1) opaque[index] = data[index * 4 + 3]! > 0 ? 1 : 0;
    let current = new Float32Array(count), next = new Float32Array(count);
    for (let channel = 0; channel < 3; channel += 1) {
      for (let index = 0; index < count; index += 1) current[index] = data[index * 4 + channel]!;
      for (let step = 0; step < iterations; step += 1) {
        for (let y = 0; y < height; y += 1) {
          const ym = Math.max(0, y - 1) * width, y0 = y * width, yp = Math.min(height - 1, y + 1) * width;
          for (let x = 0; x < width; x += 1) {
            const center = current[y0 + x]!;
            if (opaque[y0 + x] === 0) { next[y0 + x] = center; continue; }
            const xm = Math.max(0, x - 1), xp = Math.min(width - 1, x + 1);
            // 투명한 이웃은 중심값으로 반사(노이만 경계)해 보이지 않는 픽셀의 색이 가장자리로 번지지 않게 한다.
            const east = valueOr(current, opaque, y0 + xp, center), west = valueOr(current, opaque, y0 + xm, center);
            const south = valueOr(current, opaque, yp + x, center), north = valueOr(current, opaque, ym + x, center);
            const ux = (east - west) / 2;
            const uy = (south - north) / 2;
            const uxx = east - 2 * center + west;
            const uyy = south - 2 * center + north;
            const uxy = (valueOr(current, opaque, yp + xp, center) - valueOr(current, opaque, yp + xm, center)
              - valueOr(current, opaque, ym + xp, center) + valueOr(current, opaque, ym + xm, center)) / 4;
            const gradient = ux * ux + uy * uy;
            // κ|∇u| = (uxx·uy² − 2·ux·uy·uxy + uyy·ux²) / |∇u|². 평탄한 곳(기울기 0)은 라플라시안의 절반으로 대신한다.
            const flow = gradient > 1e-6
              ? (uxx * uy * uy - 2 * ux * uy * uxy + uyy * ux * ux) / gradient
              : (uxx + uyy) / 2;
            next[y0 + x] = center + 0.25 * flow;
          }
        }
        [current, next] = [next, current];
      }
      for (let index = 0; index < count; index += 1) data[index * 4 + channel] = current[index]!;
    }
  },
};

export const STUDIO_FILTER_GALLERY_NOISE_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [hurl, pick, slur, hsvNoise];

export const STUDIO_FILTER_GALLERY_BLUR_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [symmetricNearestNeighbor, meanCurvature];
