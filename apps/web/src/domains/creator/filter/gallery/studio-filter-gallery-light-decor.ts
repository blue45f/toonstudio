/**
 * 필터 갤러리 · 빛과 그림자(light)·장식(decor) 계열.
 *
 * 빛: 조명 효과(램버트 확산광 + 휘도 요철), 초신성, 반짝임, 긴 그림자. 장식: 둥근 모서리, 커피 얼룩, 안개, 직소 퍼즐.
 * 알파는 그대로 두는 것이 원칙이고 예외는 둘이다.
 *   - 긴 그림자는 그림 "아래"에 그림자를 깔므로 투명한 곳에 새 알파를 만든다(알파는 늘기만 한다).
 *   - 둥근 모서리는 모서리 픽셀 알파에 원호 덮임 비율을 곱한다(알파는 줄기만 한다).
 * 무작위성은 context.seed + 효과별 상수로 시드한 해시·난수열에서만 나오므로 같은 입력·매개변수·시드는 같은 픽셀이 된다.
 * 광원·광선·얼룩처럼 개수가 있는 대상은 상한을 두어 작업량이 픽셀 수에 비례하도록 묶었다.
 */
import {
  clamp, clamp01, colorParam, createRandom, fbm2, hash1, hash2, hsvToRgb, luma, numberParam, rgbToHsv, stringParam, valueNoise2,
} from "./studio-filter-gallery-kernel-utils";

import type {
  StudioFilterGalleryContext, StudioFilterGalleryEffectDef, StudioFilterGalleryParamSpec, StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

type Rgb = [number, number, number];

/** 매개변수 명세와, 같은 최소·최대·기본값으로 값을 읽는 판독기 한 쌍(명세와 판독이 어긋나지 않게 한 곳에서 만든다). */
interface Param<T> {
  readonly spec: StudioFilterGalleryParamSpec;
  readonly read: (params: StudioFilterGalleryParams) => T;
}

function slider(key: string, label: string, min: number, max: number, step: number, fallback: number, suffix?: string): Param<number> {
  const spec: StudioFilterGalleryParamSpec = suffix === undefined
    ? { key, label, control: "slider", min, max, step, default: fallback }
    : { key, label, control: "slider", min, max, step, default: fallback, suffix };
  return { spec, read: (params) => numberParam(params, key, fallback, min, max) };
}

function choice<T extends string>(key: string, label: string, options: readonly (readonly [T, string])[], fallback: T): Param<T> {
  const values = options.map(([value]) => value);
  const spec: StudioFilterGalleryParamSpec = {
    key, label, control: "select", options: options.map(([value, text]) => ({ value, label: text })), default: fallback,
  };
  return { spec, read: (params) => stringParam(params, key, values, fallback) };
}

function color(key: string, label: string, fallback: string): Param<Rgb> {
  const rgb = colorParam({ [key]: fallback }, key, [0, 0, 0]);
  return { spec: { key, label, control: "color", default: fallback }, read: (params) => colorParam(params, key, rgb) };
}

/** 스택 시드에 효과별 상수를 더한 32비트 시드. */
const effectSeed = (context: StudioFilterGalleryContext, salt: number): number => ((context.seed | 0) + salt) | 0;

/** 시드를 해시로 한 번 섞은 난수열(작은 정수 시드여도 xorshift 첫 값들이 고르게 퍼진다). */
const seededRandom = (seed: number): (() => number) => createRandom(Math.floor(hash1(0x2545f491, seed) * 4294967296) | 0);

const mix = (from: number, to: number, t: number): number => from + (to - from) * t;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const degrees = (value: number): number => (value * Math.PI) / 180;

// ── 조명 효과 ─────────────────────────────────────────────────────────

const LIGHT_TYPE = choice("lightType", "광원 종류", [["point", "점광원"], ["spot", "스포트라이트"], ["directional", "방향성"]], "spot");
const LIGHT_X = slider("positionX", "가로 위치", 0, 100, 1, 30, "%");
const LIGHT_Y = slider("positionY", "세로 위치", 0, 100, 1, 30, "%");
const LIGHT_ANGLE = slider("angle", "방향", 0, 360, 1, 45, "°");
const LIGHT_INTENSITY = slider("intensity", "세기", 0, 200, 1, 100, "%");
const LIGHT_COLOR = color("color", "빛 색", "#fff4e0");
const LIGHT_AMBIENT = slider("ambient", "주변광", 0, 100, 1, 25, "%");
const LIGHT_BUMP = slider("bumpDepth", "요철 깊이", 0, 50, 1, 8);
/** 스포트라이트 원뿔: 안쪽 16°까지 온전히, 바깥 36°에서 0 이 되도록 부드럽게 줄어든다. */
const SPOT_INNER = Math.cos(degrees(16)), SPOT_OUTER = Math.cos(degrees(36));
/** 방향광의 고도(바닥에서 올려 본 각). */
const SUN_ELEVATION = degrees(40);

const lightingEffects: StudioFilterGalleryEffectDef = {
  id: "light.lighting-effects",
  category: "light",
  label: "조명 효과",
  description: "점광원·스포트라이트·방향광으로 이미지를 비추고 밝기를 요철로 삼아 입체감을 더합니다.",
  references: ["Photoshop · 조명 효과", "GIMP · 조명 효과"],
  params: [LIGHT_TYPE.spec, LIGHT_X.spec, LIGHT_Y.spec, LIGHT_ANGLE.spec, LIGHT_INTENSITY.spec, LIGHT_COLOR.spec, LIGHT_AMBIENT.spec, LIGHT_BUMP.spec],
  cost: 0.5,
  apply(image, params) {
    const { width, height, data } = image;
    const type = LIGHT_TYPE.read(params), intensity = (1.25 * LIGHT_INTENSITY.read(params)) / 100;
    const ambient = LIGHT_AMBIENT.read(params) / 100, bump = LIGHT_BUMP.read(params) / 2, [lightRed, lightGreen, lightBlue] = LIGHT_COLOR.read(params);
    const diagonal = Math.max(1, Math.hypot(width, height)), lightZ = 0.35 * diagonal;
    const lightX = (LIGHT_X.read(params) / 100) * width, lightY = (LIGHT_Y.read(params) / 100) * height;
    const angle = degrees(LIGHT_ANGLE.read(params)), dirX = Math.cos(angle), dirY = Math.sin(angle);
    // 스포트라이트 축: 광원에서 angle 방향으로 광원 높이만큼 떨어진 바닥 점을 겨눈다(수직에서 45° 기운 원뿔).
    const reach = lightZ, axisLength = Math.hypot(reach, lightZ);
    const axisX = (reach * dirX) / axisLength, axisY = (reach * dirY) / axisLength, axisZ = -lightZ / axisLength;
    // 방향광은 angle 방향으로 나아가므로 빛을 향하는 벡터는 그 반대쪽 위다.
    const sunX = -dirX * Math.cos(SUN_ELEVATION), sunY = -dirY * Math.cos(SUN_ELEVATION), sunZ = Math.sin(SUN_ELEVATION);
    // 높이는 알파를 곱한 휘도(0~1)다. 투명한 곳의 의미 없는 RGB 가 요철이 되지 않고, 그림 가장자리는 비탈이 된다.
    const relief = new Float32Array(width * height);
    for (let index = 0, offset = 0; index < relief.length; index += 1, offset += 4) {
      relief[index] = (luma(data[offset]!, data[offset + 1]!, data[offset + 2]!) * data[offset + 3]!) / 65025;
    }
    for (let y = 0, offset = 0; y < height; y += 1) {
      const row = y * width, up = Math.max(0, y - 1) * width, down = Math.min(height - 1, y + 1) * width;
      for (let x = 0; x < width; x += 1, offset += 4) {
        if (data[offset + 3] === 0) continue;
        // 휘도를 높이로 본 노멀(중앙차분). bump 0 이면 평평한 면 (0, 0, 1) 이다.
        const gx = -(relief[row + Math.min(width - 1, x + 1)]! - relief[row + Math.max(0, x - 1)]!) * 0.5 * bump;
        const gy = -(relief[down + x]! - relief[up + x]!) * 0.5 * bump;
        const norm = Math.sqrt(gx * gx + gy * gy + 1), nx = gx / norm, ny = gy / norm, nz = 1 / norm;
        let diffuse: number;
        if (type === "directional") {
          diffuse = Math.max(0, nx * sunX + ny * sunY + nz * sunZ);
        } else {
          const tx = lightX - (x + 0.5), ty = lightY - (y + 0.5), distance = Math.sqrt(tx * tx + ty * ty + lightZ * lightZ);
          const lx = tx / distance, ly = ty / distance, lz = lightZ / distance;
          // 램버트 확산광에 거리 감쇠를 곱한다(바로 아래가 1, 대각선만큼 멀어지면 약 1/3).
          diffuse = Math.max(0, nx * lx + ny * ly + nz * lz) / (1 + 2 * ((distance - lightZ) / diagonal) ** 2);
          if (type === "spot") diffuse *= smoothstep(SPOT_OUTER, SPOT_INNER, -(lx * axisX + ly * axisY + lz * axisZ));
        }
        const light = (diffuse * intensity) / 255;
        data[offset] = data[offset]! * (ambient + light * lightRed);
        data[offset + 1] = data[offset + 1]! * (ambient + light * lightGreen);
        data[offset + 2] = data[offset + 2]! * (ambient + light * lightBlue);
      }
    }
  },
};

// ── 초신성 ────────────────────────────────────────────────────────────

const NOVA_X = slider("positionX", "가로 위치", 0, 100, 1, 50, "%");
const NOVA_Y = slider("positionY", "세로 위치", 0, 100, 1, 50, "%");
const NOVA_RADIUS = slider("radius", "반지름", 1, 100, 1, 20, "px");
const NOVA_SPOKES = slider("spokes", "광선 수", 1, 1024, 1, 100);
const NOVA_HUE = slider("randomHue", "색상 흩뜨림", 0, 360, 1, 0, "°");
const NOVA_COLOR = color("color", "색", "#5a8cff");

const supernova: StudioFilterGalleryEffectDef = {
  id: "light.supernova",
  category: "light",
  label: "초신성",
  description: "지정한 위치에 하얗게 타는 중심과 무작위 광선이 퍼지는 초신성 빛을 더합니다.",
  references: ["GIMP · 초신성"],
  params: [NOVA_X.spec, NOVA_Y.spec, NOVA_RADIUS.spec, NOVA_SPOKES.spec, NOVA_HUE.spec, NOVA_COLOR.spec],
  cost: 0.75,
  apply(image, params, context) {
    const { width, height, data } = image;
    const centerX = (NOVA_X.read(params) / 100) * width, centerY = (NOVA_Y.read(params) / 100) * height;
    const radius = NOVA_RADIUS.read(params), spokes = Math.round(NOVA_SPOKES.read(params)), hueSpread = NOVA_HUE.read(params) / 360;
    const base = NOVA_COLOR.read(params), random = seededRandom(effectSeed(context, 0x5e7a));
    // 광선마다 밝기(어두운 광선이 많고 밝은 광선은 드물게)와 색상(randomHue 범위 안)을 정한다. 끝 칸은 첫 칸을 복제해 한 바퀴가 이어진다.
    const strength = new Float32Array(spokes + 1), tint = new Float32Array((spokes + 1) * 3), hsv = new Float32Array(3), rgb = new Float32Array(3);
    rgbToHsv(base[0], base[1], base[2], hsv);
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      strength[spoke] = 0.15 + 0.85 * random() ** 3;
      hsvToRgb(hsv[0]! + (random() - 0.5) * hueSpread, hsv[1]!, hsv[2]!, rgb);
      tint.set(rgb, spoke * 3);
    }
    strength[spokes] = strength[0]!;
    tint.copyWithin(spokes * 3, 0, 3);
    for (let y = 0, offset = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1, offset += 4) {
        if (data[offset + 3] === 0) continue;
        const dx = x + 0.5 - centerX, dy = y + 0.5 - centerY, c = Math.sqrt(dx * dx + dy * dy) / radius;
        const u = ((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1) * spokes, k = Math.min(spokes - 1, Math.floor(u)), f = u - k;
        const ray = mix(strength[k]!, strength[k + 1]!, f);
        // 흰 중심(반지름 0.6배에서 절반), 색 후광(1/c²), 느리게 줄어드는 광선(1/c)을 더한다.
        const core = 255 / (1 + (c / 0.6) ** 4), glow = 0.6 / (1 + c * c), beam = (1.2 * ray * ray) / (1 + 0.25 * c);
        for (let channel = 0; channel < 3; channel += 1) {
          const spokeColor = mix(tint[k * 3 + channel]!, tint[(k + 1) * 3 + channel]!, f);
          data[offset + channel] = data[offset + channel]! + core + glow * base[channel]! + beam * spokeColor;
        }
      }
    }
  },
};

// ── 반짝임 ────────────────────────────────────────────────────────────

const SPARKLE_THRESHOLD = slider("threshold", "밝기 기준", 50, 100, 0.5, 92, "%");
const SPARKLE_LENGTH = slider("spikeLength", "빛살 길이", 1, 100, 1, 20, "px");
const SPARKLE_POINTS = slider("spikePoints", "빛살 수", 2, 16, 1, 4);
const SPARKLE_ANGLE = slider("spikeAngle", "빛살 각도", 0, 360, 1, 45, "°");
const SPARKLE_INTENSITY = slider("intensity", "세기", 0, 100, 1, 60, "%");
/** 반짝임 광원 상한. 광원 수 × 빛살 수 × 빛살 길이로 그리는 양이 이미지 크기와 무관하게 묶인다. */
const SPARKLE_MAX_SOURCES = 512;

/** 밝기 amount 의 빛을 (x, y) 주변 네 픽셀에 쌍선형으로 나눠 더한다. tint 는 0~1 색이다. */
function addLight(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, amount: number, tint: Float32Array, at: number): void {
  const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  for (let corner = 0; corner < 4; corner += 1) {
    const px = x0 + (corner & 1), py = y0 + (corner >> 1);
    if (px < 0 || py < 0 || px >= width || py >= height) continue;
    const weight = amount * ((corner & 1) === 1 ? tx : 1 - tx) * ((corner >> 1) === 1 ? ty : 1 - ty), offset = (py * width + px) * 4;
    data[offset] = data[offset]! + weight * tint[at]!;
    data[offset + 1] = data[offset + 1]! + weight * tint[at + 1]!;
    data[offset + 2] = data[offset + 2]! + weight * tint[at + 2]!;
  }
}

const sparkle: StudioFilterGalleryEffectDef = {
  id: "light.sparkle",
  category: "light",
  label: "반짝임",
  description: "가장 밝은 지점들에서 별 모양 빛살이 뻗어 나오는 반짝임을 더합니다.",
  references: ["GIMP · 반짝임(Sparkle)", "드로잉 앱 공통 · 반짝이 효과"],
  params: [SPARKLE_THRESHOLD.spec, SPARKLE_LENGTH.spec, SPARKLE_POINTS.spec, SPARKLE_ANGLE.spec, SPARKLE_INTENSITY.spec],
  cost: 0.5,
  apply(image, params, context) {
    const { width, height, data } = image;
    const count = width * height, length = SPARKLE_LENGTH.read(params), points = Math.round(SPARKLE_POINTS.read(params));
    const angle = degrees(SPARKLE_ANGLE.read(params)), intensity = SPARKLE_INTENSITY.read(params) / 100, seed = effectSeed(context, 0x59a7);
    // 알파를 곱한 휘도의 분위수로 기준 밝기(cut)를 정한다. 투명한 곳은 반짝이지 않는다.
    const level = new Uint8Array(count), histogram = new Uint32Array(256);
    let visible = 0;
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
      const alpha = data[offset + 3]!;
      if (alpha === 0) continue;
      const value = Math.round((luma(data[offset]!, data[offset + 1]!, data[offset + 2]!) * alpha) / 255);
      level[index] = value; histogram[value]! += 1; visible += 1;
    }
    if (visible === 0 || intensity <= 0) return;
    // 기준 밝기 = threshold 분위수: 아래부터 누적이 그 비율에 처음 닿는 단계 cut 과, cut 단계 픽셀 중 그 비율 아래에 드는 몫 fraction(0~1].
    const target = (visible * SPARKLE_THRESHOLD.read(params)) / 100;
    let cut = 0, below = histogram[0]!;
    while (cut < 255 && below < target) {
      cut += 1; below += histogram[cut]!;
    }
    const fraction = clamp01((target - (below - histogram[cut]!)) / Math.max(1, histogram[cut]!));
    // 빛살 길이 절반 크기 칸마다 가장 밝은 후보 하나만 남겨(같은 밝기는 해시로) 광원이 뭉치지 않게 한다.
    const cell = Math.max(2, Math.round(length / 2)), columns = Math.ceil(width / cell), slots = columns * Math.ceil(height / cell);
    const best = new Int32Array(slots).fill(-1), score = new Float32Array(slots);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x, value = level[index]!;
        if (value < cut || value === 0) continue;
        const slot = Math.floor(y / cell) * columns + Math.floor(x / cell), candidate = value + hash2(x, y, seed);
        if (best[slot]! < 0 || candidate > score[slot]!) { best[slot] = index; score[slot] = candidate; }
      }
    }
    // cut 보다 밝은 칸은 늘 남는다. 가장 밝은 픽셀이 cut 단계인 칸들은 칸 해시 순서로 줄 세워 (순위 + 0.5) / 개수 가 fraction 이상인
    // 칸만 남긴다. 정수 단계만 보면 한 단계에 픽셀이 몰린 그림(셀 채색 면·잘린 하이라이트)에서 기준을 여러 칸 옮겨도 같은 결과였다.
    // 이제 기준을 올리면 그 단계 칸이 고른 간격으로 하나씩 빠진다. 다 빠지면 마지막까지 남는 칸 하나를 쓴다(기준 100% 에서도
    // 가장 밝은 곳은 반짝인다).
    const order: number[] = [], atCut: number[] = [];
    for (let slot = 0; slot < slots; slot += 1) {
      const index = best[slot]!;
      if (index < 0) continue;
      if (level[index]! > cut) order.push(slot);
      else atCut.push(slot);
    }
    if (atCut.length > 0) {
      const gateSeed = (seed + 0x1b87) | 0, gates = new Float64Array(atCut.length);
      atCut.forEach((slot, position) => { gates[position] = hash2(slot % columns, Math.floor(slot / columns), gateSeed); });
      // 해시 오름차순 순위가 keepFrom 이상인 칸(= 해시가 그 순위의 값 이상인 칸)만 남는다. 다 빠지는데 cut 보다 밝은 칸도 없으면
      // 해시가 가장 큰 칸 하나를 남긴다.
      const ranked = gates.slice().sort(), firstKept = Math.ceil(fraction * atCut.length - 0.5);
      const keepFrom = firstKept < atCut.length ? firstKept : order.length === 0 ? atCut.length - 1 : atCut.length;
      if (keepFrom < atCut.length) {
        const bar = ranked[keepFrom]!;
        atCut.forEach((slot, position) => { if (gates[position]! >= bar) order.push(slot); });
      }
    }
    order.sort((left, right) => score[right]! - score[left]! || left - right);
    // 광원이 상한보다 많으면 밝기 순서를 고르게 솎는다(가장 밝은 칸은 늘 들어간다). 가장 밝은 칸만 남기면 남는 칸이 상한보다 많은
    // 동안(큰 그림·짧은 빛살) 기준을 내려도 그림이 그대로였다. 광원 목록은 예전처럼 형식 배열로 둔다(일반 배열로 두면 256² 측정에서
    // 빛살이 많은 설정의 그리기가 15~18% 느렸다).
    const sources = order.length <= SPARKLE_MAX_SOURCES
      ? Int32Array.from(order)
      : Int32Array.from({ length: SPARKLE_MAX_SOURCES }, (_, rank) => order[Math.floor((rank * order.length) / SPARKLE_MAX_SOURCES)]!);
    // 그리기 전에 광원 색(원본 색을 흰색 쪽으로 반쯤 당긴 0~1 값)을 떠 둔다. 앞서 그린 빛살이 뒤 광원 색에 섞이지 않게 한다.
    const tint = new Float32Array(sources.length * 3);
    sources.forEach((slot, rank) => {
      const offset = best[slot]! * 4;
      for (let channel = 0; channel < 3; channel += 1) tint[rank * 3 + channel] = 0.5 + data[offset + channel]! / 510;
    });
    sources.forEach((slot, rank) => {
      const index = best[slot]!, x = (index % width) + 0.5, y = Math.floor(index / width) + 0.5, brightness = level[index]! / 255;
      const peak = 255 * intensity * (0.4 + 0.6 * brightness);
      const reach = length * (0.55 + 0.45 * brightness) * (0.75 + 0.5 * hash1(index, seed));
      addLight(data, width, height, x, y, peak, tint, rank * 3);
      for (let spike = 0; spike < points; spike += 1) {
        const theta = angle + (spike * 2 * Math.PI) / points, dx = Math.cos(theta), dy = Math.sin(theta);
        for (let step = 1; step < reach; step += 1) {
          const fall = 1 - step / reach;
          addLight(data, width, height, x + dx * step, y + dy * step, peak * fall * fall, tint, rank * 3);
        }
      }
    });
  },
};

// ── 긴 그림자 ─────────────────────────────────────────────────────────

const SHADOW_ANGLE = slider("angle", "방향", -180, 180, 1, 45, "°");
const SHADOW_LENGTH = slider("length", "길이", 0, 200, 1, 40, "px");
const SHADOW_STYLE = choice("style", "끝 처리", [["finite", "유한"], ["fading", "점점 흐리게"]], "fading");
const SHADOW_COLOR = color("color", "그림자 색", "#000000");
const SHADOW_OPACITY = slider("opacity", "불투명도", 0, 100, 1, 60, "%");

/**
 * 알파 실루엣을 방향 (ux, uy) 로 끌어 늘인 그림자 덮임(0~1)을 out 에 더한다.
 * 주축(|성분|이 큰 축)으로 1px 씩 나아가는 평행선들로 이미지를 기울여(shear) 훑으므로 선마다 1차원 문제가 된다.
 * 유한은 창 [i − ⌊걸음⌋, i] 의 최댓값(단조 덱)과, 한 칸 더 뒤 표본에 걸음의 소수 부분을 곱한 값 중 큰 쪽이다(그림자 끝 1px 을
 * 덮임 비율로 그려 길이를 1px 보다 잘게 바꿔도 보인다 — 걸음을 반올림하면 대각선에서 길이 칸 셋 중 하나가 같은 그림이었다).
 * 점점 흐리게는 c ← max(현재, c − 1/걸음) 의 선형 감쇠다. 선 위 표본과 되쓰기에
 * 같은 부축 선형 보간 가중치를 써서 픽셀마다 가중치 합이 1 이고, 걸음마다 보간을 거듭하지 않아 그림자가 번지지 않는다. O(N).
 */
function castShadow(alpha: Float32Array, out: Float32Array, width: number, height: number, ux: number, uy: number, length: number, fading: boolean): void {
  const majorX = Math.abs(ux) >= Math.abs(uy);
  const majorLength = majorX ? width : height, minorLength = majorX ? height : width;
  const majorStride = majorX ? 1 : width, minorStride = majorX ? width : 1;
  const uMajor = majorX ? ux : uy, slope = (majorX ? uy : ux) / uMajor, forward = uMajor > 0;
  const steps = length / Math.hypot(1, slope), span = Math.floor(steps), part = steps - span, decay = 1 / Math.max(1e-6, steps);
  const line = new Float32Array(majorLength), result = new Float32Array(majorLength), deque = new Int32Array(majorLength);
  const extra = Math.ceil(Math.abs(slope) * majorLength) + 1;
  for (let lane = -extra; lane <= minorLength + extra; lane += 1) {
    let low = 0, high = majorLength - 1;
    if (slope !== 0) {
      const a = (-1 - lane) / slope, b = (minorLength - lane) / slope;
      low = Math.max(low, Math.floor(Math.min(a, b)));
      high = Math.min(high, Math.ceil(Math.max(a, b)));
    } else if (lane < 0 || lane >= minorLength) continue;
    const count = high - low + 1;
    if (count <= 0) continue;
    for (let i = 0; i < count; i += 1) {
      const major = forward ? low + i : high - i, position = lane + major * slope, m0 = Math.floor(position), f = position - m0;
      const base = major * majorStride;
      const a0 = m0 >= 0 && m0 < minorLength ? alpha[base + m0 * minorStride]! : 0;
      const a1 = m0 + 1 >= 0 && m0 + 1 < minorLength ? alpha[base + (m0 + 1) * minorStride]! : 0;
      line[i] = a0 + (a1 - a0) * f;
    }
    if (fading) {
      let carry = 0;
      for (let i = 0; i < count; i += 1) {
        carry = Math.max(line[i]!, carry - decay); result[i] = carry;
      }
    } else {
      let head = 0, tail = 0;
      for (let i = 0; i < count; i += 1) {
        while (tail > head && line[deque[tail - 1]!]! <= line[i]!) tail -= 1;
        deque[tail] = i; tail += 1;
        while (deque[head]! < i - span) head += 1;
        const tip = i > span ? line[i - span - 1]! * part : 0;
        result[i] = Math.max(line[deque[head]!]!, tip);
      }
    }
    for (let i = 0; i < count; i += 1) {
      const value = result[i]!;
      if (value <= 0) continue;
      const major = forward ? low + i : high - i, position = lane + major * slope, m0 = Math.floor(position), f = position - m0;
      const base = major * majorStride;
      if (m0 >= 0 && m0 < minorLength) out[base + m0 * minorStride]! += value * (1 - f);
      if (m0 + 1 >= 0 && m0 + 1 < minorLength) out[base + (m0 + 1) * minorStride]! += value * f;
    }
  }
}

const longShadow: StudioFilterGalleryEffectDef = {
  id: "light.long-shadow",
  category: "light",
  label: "긴 그림자",
  description: "그림의 실루엣을 한 방향으로 길게 늘인 그림자를 그림 아래에 깝니다.",
  references: ["GIMP · 긴 그림자"],
  params: [SHADOW_ANGLE.spec, SHADOW_LENGTH.spec, SHADOW_STYLE.spec, SHADOW_COLOR.spec, SHADOW_OPACITY.spec],
  cost: 0.5,
  apply(image, params) {
    const { width, height, data } = image;
    const count = width * height, radians = degrees(SHADOW_ANGLE.read(params));
    const opacity = SHADOW_OPACITY.read(params) / 100, [red, green, blue] = SHADOW_COLOR.read(params);
    const alpha = new Float32Array(count), shadow = new Float32Array(count);
    for (let index = 0; index < count; index += 1) alpha[index] = data[index * 4 + 3]! / 255;
    // 각도는 화면 좌표(y 아래) 기준이다: 0° 오른쪽, 90° 아래, 기본 45° 는 오른쪽 아래로 그림자가 뻗는다.
    castShadow(alpha, shadow, width, height, Math.cos(radians), Math.sin(radians), SHADOW_LENGTH.read(params), SHADOW_STYLE.read(params) === "fading");
    // 그림자를 원본 "아래"에 합성한다(원본 over 그림자). 결과 알파 a + s(1 − a) 는 원래 알파보다 작아지지 않는다.
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
      const cover = Math.min(1, shadow[index]!) * opacity, own = alpha[index]!;
      if (cover <= 0 || own >= 1) continue;
      const under = cover * (1 - own), total = own + under;
      data[offset] = (data[offset]! * own + red * under) / total;
      data[offset + 1] = (data[offset + 1]! * own + green * under) / total;
      data[offset + 2] = (data[offset + 2]! * own + blue * under) / total;
      data[offset + 3] = total * 255;
    }
  },
};

// ── 둥근 모서리 ───────────────────────────────────────────────────────

const CORNER_RADIUS = slider("radius", "반지름", 1, 200, 1, 24, "px");

const roundCorners: StudioFilterGalleryEffectDef = {
  id: "decor.round-corners",
  category: "decor",
  label: "둥근 모서리",
  description: "이미지 네 모서리를 매끈한 원호로 깎아 투명하게 만듭니다.",
  references: ["GIMP · 둥근 모서리", "Krita · 둥근 모서리"],
  params: [CORNER_RADIUS.spec],
  cost: 0.1,
  apply(image, params) {
    const { width, height, data } = image;
    // 반지름은 짧은 변의 절반을 넘지 않는다. 모서리 사각형 안 픽셀만 원호까지 거리로 덮임(안티에일리어싱)을 구해 알파에 곱한다.
    const radius = Math.min(CORNER_RADIUS.read(params), Math.min(width, height) / 2);
    for (let y = 0; y < height; y += 1) {
      const py = y + 0.5, cy = clamp(py, radius, height - radius);
      if (cy === py) continue;
      for (let x = 0; x < width; x += 1) {
        const px = x + 0.5, cx = clamp(px, radius, width - radius);
        if (cx === px) continue;
        const offset = (y * width + x) * 4;
        data[offset + 3] = data[offset + 3]! * clamp01(radius + 0.5 - Math.sqrt((px - cx) ** 2 + (py - cy) ** 2));
      }
    }
  },
};

// ── 커피 얼룩 ─────────────────────────────────────────────────────────

const STAIN_COUNT = slider("count", "얼룩 수", 1, 10, 1, 3);
const STAIN_SIZE = slider("size", "크기", 10, 100, 1, 35, "%");
const STAIN_DARKNESS = slider("darkness", "진하기", 0, 100, 1, 50, "%");
/** 곱하기 목표가 되는 마른 커피 색(0~1). */
const COFFEE: Rgb = [0.46, 0.3, 0.15];
/** 얼룩 고리 모양을 각도별로 저장하는 표 칸 수. */
const RING_SAMPLES = 128;

/**
 * 커피 얼룩 작업량(cost 1 단위 ≈ 픽셀당 50ns). 얼룩마다 테 바깥 꼬리 원(1.35R) 안 픽셀에서 atan2·제곱근·지수·값 노이즈를 계산하므로
 * 픽셀당 일은 얼룩 수 × 얼룩이 덮는 이미지 비율이다. 얼룩 반지름·위치가 시드마다 달라 무거운 쪽 꼬리가 길므로, 얼룩마다 가장 큰
 * 반지름(R = 0.625 × 크기 × 짧은 변)의 꼬리 원이 정사각형 이미지를 가장 많이 덮는 경우를 더한 상한을 쓴다. 계수는 256²·512² 시드
 * 수십 개 실측 최악(얼룩 하나: 크기 35% 약 40ns/px, 60% 약 113ns/px, 100% 약 183ns/px · 기본값 약 94ns/px · 얼룩 10개: 크기 60% 약
 * 780ns/px, 100% 약 1210~1275ns/px)을 덮는다.
 */
function coffeeStainCost(params: StudioFilterGalleryParams): number {
  const stains = Math.round(STAIN_COUNT.read(params)), size = STAIN_SIZE.read(params) / 100;
  return (2 + stains * Math.min(200, 360 * size * size)) / 50;
}

const coffeeStain: StudioFilterGalleryEffectDef = {
  id: "decor.coffee-stain",
  category: "decor",
  label: "커피 얼룩",
  description: "가장자리 테가 진한 커피 잔 얼룩을 이미지에 곱해 얹습니다.",
  references: ["GIMP · 커피 얼룩"],
  params: [STAIN_COUNT.spec, STAIN_SIZE.spec, STAIN_DARKNESS.spec],
  // 기본값(빈 매개변수는 기본값으로 읽힌다)의 작업량이다.
  cost: coffeeStainCost({}),
  costFor: coffeeStainCost,
  apply(image, params, context) {
    const { width, height, data } = image;
    const stains = Math.round(STAIN_COUNT.read(params)), darkness = (1.5 * STAIN_DARKNESS.read(params)) / 100;
    const diameter = (STAIN_SIZE.read(params) / 100) * Math.min(width, height), random = seededRandom(effectSeed(context, 0xc0ff));
    const ringRadius = new Float32Array(RING_SAMPLES + 1), ringRim = new Float32Array(RING_SAMPLES + 1);
    for (let stain = 0; stain < stains; stain += 1) {
      const centerX = (1.2 * random() - 0.1) * width, centerY = (1.2 * random() - 0.1) * height;
      const radius = Math.max(0.5, 0.5 * diameter * (0.75 + 0.5 * random())), noiseSeed = Math.floor(random() * 0x7fffffff);
      // 고리 반지름의 흔들림과 테 진하기를 각도 표로 만든다. 원 위에서 2차원 노이즈를 읽으므로 한 바퀴 돌면 끊김 없이 이어진다.
      for (let k = 0; k <= RING_SAMPLES; k += 1) {
        const theta = (2 * Math.PI * k) / RING_SAMPLES, ox = 7 + 1.6 * Math.cos(theta), oy = 7 + 1.6 * Math.sin(theta);
        ringRadius[k] = radius * (0.88 + 0.24 * fbm2(ox, oy, noiseSeed, 3));
        ringRim[k] = clamp01(0.2 + 1.4 * (fbm2(1.3 * ox, 1.3 * oy, noiseSeed + 1, 2) - 0.25));
      }
      // 고리 반지름은 최대 1.12R 이고 테 바깥 꼬리는 ρ 1.2 까지라 1.35R 원 밖은 볼 필요가 없다.
      const reach = 1.35 * radius, mottle = 0.3 * radius;
      const x0 = Math.max(0, Math.floor(centerX - reach)), x1 = Math.min(width - 1, Math.ceil(centerX + reach));
      const y0 = Math.max(0, Math.floor(centerY - reach)), y1 = Math.min(height - 1, Math.ceil(centerY + reach));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const dx = x + 0.5 - centerX, dy = y + 0.5 - centerY, squared = dx * dx + dy * dy;
          if (squared > reach * reach) continue;
          const u = ((Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1) * RING_SAMPLES, k = Math.floor(u), f = u - k;
          const rho = Math.sqrt(squared) / mix(ringRadius[k]!, ringRadius[k + 1]!, f);
          if (rho > 1.2) continue;
          // 마른 커피는 가장자리에 모인다: 테는 안쪽으로 완만하고 바깥쪽으로 날카롭게 진하고, 고리 안은 옅게 얼룩진다.
          const rim = mix(ringRim[k]!, ringRim[k + 1]!, f) * Math.exp(-(((rho - 1) / (rho < 1 ? 0.08 : 0.025)) ** 2));
          const inner = rho < 1 ? 0.22 + 0.25 * valueNoise2((x + 0.5) / mottle, (y + 0.5) / mottle, noiseSeed + 2) : 0;
          const density = clamp01((inner + rim) * darkness), offset = (y * width + x) * 4;
          data[offset] = data[offset]! * (1 - density * (1 - COFFEE[0]));
          data[offset + 1] = data[offset + 1]! * (1 - density * (1 - COFFEE[1]));
          data[offset + 2] = data[offset + 2]! * (1 - density * (1 - COFFEE[2]));
        }
      }
    }
  },
};

// ── 안개 ──────────────────────────────────────────────────────────────

const FOG_COLOR = color("color", "안개 색", "#eef0f2");
const FOG_TURBULENCE = slider("turbulence", "난류", 1, 15, 0.5, 6);
const FOG_OPACITY = slider("opacity", "불투명도", 0, 100, 1, 60, "%");

const fog: StudioFilterGalleryEffectDef = {
  id: "decor.fog",
  category: "decor",
  label: "안개",
  description: "프랙털 노이즈로 만든 안개 덩어리를 이미지 위에 덮습니다.",
  references: ["GIMP · 안개"],
  params: [FOG_COLOR.spec, FOG_TURBULENCE.spec, FOG_OPACITY.spec],
  cost: 1,
  apply(image, params, context) {
    const { width, height, data } = image;
    const turbulence = FOG_TURBULENCE.read(params), opacity = FOG_OPACITY.read(params) / 100;
    const [red, green, blue] = FOG_COLOR.read(params), seed = effectSeed(context, 0x0f06);
    // 난류가 클수록 덩어리가 잘고 거칠다(기본 주파수·옥타브 수·옥타브 이득이 함께 커진다).
    const frequency = (1.2 + 0.35 * turbulence) / Math.max(1, Math.min(width, height));
    const octaves = clamp(Math.round(2 + turbulence / 3), 2, 7), gain = 0.45 + 0.02 * turbulence;
    for (let y = 0, offset = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1, offset += 4) {
        if (data[offset + 3] === 0) continue;
        const amount = opacity * smoothstep(0.3, 0.72, fbm2((x + 0.5) * frequency, (y + 0.5) * frequency, seed, octaves, gain));
        data[offset] = mix(data[offset]!, red, amount);
        data[offset + 1] = mix(data[offset + 1]!, green, amount);
        data[offset + 2] = mix(data[offset + 2]!, blue, amount);
      }
    }
  },
};

// ── 직소 퍼즐 ─────────────────────────────────────────────────────────

const JIGSAW_X = slider("tilesX", "가로 조각 수", 1, 40, 1, 6);
const JIGSAW_Y = slider("tilesY", "세로 조각 수", 1, 40, 1, 4);
const JIGSAW_BEVEL = slider("bevelWidth", "경사 폭", 0, 20, 1, 3, "px");
const JIGSAW_HIGHLIGHT = slider("highlight", "음영 세기", 0, 100, 1, 50, "%");
const JIGSAW_STYLE = choice("style", "모양", [["square", "사각"], ["curved", "곡선"]], "curved");
/** 이웃한 두 변의 꼭지 머리 원 사이에 남길 최소 간격(px). 자름선 잉크가 원 양쪽 1px 씩이라 2px 안이면 맞닿는다. */
const KNOB_CLEARANCE = 3.5;
/** 꼭지 머리(원) 반지름과 목 반폭의 비(꼭지 크기 기준 0.17 · 0.1)로 정해지는, 목과 이어지는 호의 반각 코사인. */
const NECK_COS = Math.sqrt(1 - (0.1 / 0.17) ** 2);

/** 점 (px, py) 에서 선분 (ax, ay)–(bx, by) 까지 거리. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay, lengthSq = vx * vx + vy * vy;
  const t = lengthSq > 0 ? clamp01(((px - ax) * vx + (py - ay) * vy) / lengthSq) : 0;
  const dx = px - ax - t * vx, dy = py - ay - t * vy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 조각 경계 한 변까지의 거리. 변 좌표계에서 a 는 변을 따라(0~span), b 는 변에 수직이며, center 에 꼭지가 side(±1) 쪽으로
 * 튀어나온다. 곡선형은 목(두 선분)과 둥근 머리(목과 이어지는 짧은 호를 뺀 원), 사각형은 네모난 혹이다. size 는 꼭지 크기다.
 */
function edgeDistance(a: number, b: number, span: number, center: number, side: number, size: number, curved: boolean): number {
  if (!curved) {
    const half = 0.12 * size, depth = 0.3 * side * size;
    return Math.min(
      segmentDistance(a, b, 0, 0, center - half, 0), segmentDistance(a, b, center - half, 0, center - half, depth),
      segmentDistance(a, b, center - half, depth, center + half, depth), segmentDistance(a, b, center + half, depth, center + half, 0),
      segmentDistance(a, b, center + half, 0, span, 0),
    );
  }
  const neck = 0.1 * size, head = 0.17 * size, headB = 0.25 * side * size, neckEnd = headB - side * head * NECK_COS;
  let distance = Math.min(
    segmentDistance(a, b, 0, 0, center - neck, 0), segmentDistance(a, b, center - neck, 0, center - neck, neckEnd),
    segmentDistance(a, b, center + neck, neckEnd, center + neck, 0), segmentDistance(a, b, center + neck, 0, span, 0),
  );
  // 머리 원에서 변 쪽을 향한 짧은 호(목 자리)는 빼고, 그 밖 방향이면 원까지 거리를 쓴다(빠진 호의 끝점은 목 선분이 맡는다).
  const va = a - center, vb = b - headB, radial = Math.sqrt(va * va + vb * vb);
  if (radial < 1e-9 || (-side * vb) / radial < NECK_COS) distance = Math.min(distance, Math.abs(radial - head));
  return distance;
}

const jigsaw: StudioFilterGalleryEffectDef = {
  id: "decor.jigsaw",
  category: "decor",
  label: "직소 퍼즐",
  description: "이미지를 퍼즐 조각처럼 나누는 자름선과 조각 테두리의 입체 음영을 그립니다.",
  references: ["GIMP · 직소"],
  params: [JIGSAW_X.spec, JIGSAW_Y.spec, JIGSAW_BEVEL.spec, JIGSAW_HIGHLIGHT.spec, JIGSAW_STYLE.spec],
  cost: 2,
  apply(image, params, context) {
    const { width, height, data } = image;
    const tilesX = Math.round(JIGSAW_X.read(params)), tilesY = Math.round(JIGSAW_Y.read(params));
    const bevel = JIGSAW_BEVEL.read(params), highlight = JIGSAW_HIGHLIGHT.read(params) / 100;
    const curved = JIGSAW_STYLE.read(params) === "curved", seed = effectSeed(context, 0x1195);
    const tileW = width / tilesX, tileH = height / tilesY, size = Math.min(tileW, tileH), near = bevel + 2, reach = 0.5 * size + near;
    // 변마다 꼭지 방향(±1)·위치(변 길이 비율)·크기를 해시로 미리 정한다(같은 시드면 같은 퍼즐). 세로 자름선은 경계 열 i(0~tilesX)·행 j,
    // 가로 자름선은 경계 행 j(0~tilesY)·열 i 로 찾는다.
    // 한 조각에 이웃한 두 변(예: 왼쪽·위)의 꼭지가 함께 들어오면 두 머리가 그 모서리 쪽에서 마주 본다. 꼭지 크기는 짧은 변의
    // 0.72~0.84 이고, 위치(변 길이 비율)는 lowest~1 − lowest 다. 가장 가까운 경우(위치 lowest·크기 0.84) 두 머리 원의 중심(변에서
    // 0.25 × 크기 안쪽) 사이는 (lowest − 0.21)·√2·짧은 변, 반지름(0.17 × 크기) 합은 0.2856·짧은 변이므로, lowest 를 원 사이가
    // KNOB_CLEARANCE 이상 떨어지는 가장 작은 값으로 잡아 자름선이 엇갈리거나 맞닿아 조각을 쪼개지 않게 한다. 짧은 변이 약 88px
    // 이상이면 lowest 는 0.44(원 사이는 짧은 변의 약 4%)이고, 조각이 작을수록 꼭지가 변 가운데로 모인다. 사각형 혹은 같은
    // 위치에서 원보다 더 떨어지고, 직사각형 조각은 긴 변 쪽 꼭지가 모서리에서 더 멀어 간격이 더 넓다. 짧은 변이 약 28px 보다
    // 작으면 가운데 꼭지끼리도 그 간격을 띄울 수 없고, 약 24px 보다 작으면 곡선형 목(폭 0.2 × 크기)이 양쪽 잉크에 막혀 머리가
    // 조각에서 떨어져 보일 수 있다.
    const lowest = Math.min(0.5, Math.max(0.44, 0.21 + (0.2856 + KNOB_CLEARANCE / size) / Math.SQRT2));
    const knobTable = (count: number, columns: number, salt: number): Float32Array => {
      const table = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        const i = index % columns, j = (index - i) / columns;
        table[index * 3] = hash2(i, j, salt) < 0.5 ? -1 : 1;
        table[index * 3 + 1] = lowest + 2 * (0.5 - lowest) * hash2(i, j, salt + 1);
        table[index * 3 + 2] = size * (0.72 + 0.12 * hash2(i, j, salt + 2));
      }
      return table;
    };
    const verticalKnobs = knobTable((tilesX + 1) * tilesY, tilesX + 1, seed), horizontalKnobs = knobTable(tilesX * (tilesY + 1), tilesX, seed + 7919);
    // 자름선 직선부보다 멀고 꼭지 상자(변 따라 ±0.17, 수직 0~0.42 × 꼭지 크기)에서도 near 이상 떨어지면 계산을 건너뛴다.
    const probe = (table: Float32Array, at: number, a: number, b: number, span: number): number => {
      const side = table[at]!, center = span * table[at + 1]!, knob = table[at + 2]!;
      if (Math.abs(b) > near && (Math.abs(a - center) > 0.17 * knob + near || side * b > 0.42 * knob + near || side * b < 0)) return Infinity;
      return edgeDistance(a, b, span, center, side, knob, curved);
    };
    // 자름선까지 거리장. 꼭지는 자기 변에서 조각 짧은 변의 절반 안에만 있으므로 픽셀이 속한 칸의 네 변만 보면 된다.
    const field = new Float32Array(width * height).fill(Infinity);
    for (let y = 0; y < height; y += 1) {
      const py = y + 0.5, j = Math.min(tilesY - 1, Math.floor(py / tileH)), along = py - j * tileH;
      for (let x = 0; x < width; x += 1) {
        const px = x + 0.5, i = Math.min(tilesX - 1, Math.floor(px / tileW)), across = px - i * tileW;
        let distance = Infinity;
        if (i > 0 && across < reach) distance = Math.min(distance, probe(verticalKnobs, (j * (tilesX + 1) + i) * 3, along, across, tileH));
        if (i < tilesX - 1 && tileW - across < reach) {
          distance = Math.min(distance, probe(verticalKnobs, (j * (tilesX + 1) + i + 1) * 3, along, across - tileW, tileH));
        }
        if (j > 0 && along < reach) distance = Math.min(distance, probe(horizontalKnobs, (j * tilesX + i) * 3, across, along, tileW));
        if (j < tilesY - 1 && tileH - along < reach) {
          distance = Math.min(distance, probe(horizontalKnobs, ((j + 1) * tilesX + i) * 3, across, along - tileH, tileW));
        }
        field[y * width + x] = distance;
      }
    }
    // 경사 높이 h = 1 − (1 − d/경사폭)² 를 왼쪽 위에서 오는 빛으로 비춘다. 조각의 왼쪽 위 테는 밝고 오른쪽 아래 테는 어둡다.
    const profile = (distance: number): number => 1 - (1 - Math.min(1, distance / bevel)) ** 2;
    for (let y = 0, offset = 0; y < height; y += 1) {
      const row = y * width, up = Math.max(0, y - 1) * width, down = Math.min(height - 1, y + 1) * width;
      for (let x = 0; x < width; x += 1, offset += 4) {
        const distance = field[row + x]!;
        if (distance > bevel + 1.5 || data[offset + 3] === 0) continue;
        let shade = 0;
        if (bevel > 0 && highlight > 0) {
          const hx = profile(field[row + Math.min(width - 1, x + 1)]!) - profile(field[row + Math.max(0, x - 1)]!);
          const hy = profile(field[down + x]!) - profile(field[up + x]!);
          shade = 0.8 * highlight * clamp(0.354 * bevel * (hx + hy), -1, 1);
        }
        const ink = 1 - 0.85 * clamp01(1 - distance);
        for (let channel = 0; channel < 3; channel += 1) {
          const value = data[offset + channel]!;
          data[offset + channel] = (shade > 0 ? value + (255 - value) * shade : value * (1 + shade)) * ink;
        }
      }
    }
  },
};

/** 빛과 그림자 계열 효과(분류 light). */
export const STUDIO_FILTER_GALLERY_LIGHT_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [lightingEffects, supernova, sparkle, longShadow];

/** 장식 계열 효과(분류 decor). */
export const STUDIO_FILTER_GALLERY_DECOR_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [roundCorners, coffeeStain, fog, jigsaw];
