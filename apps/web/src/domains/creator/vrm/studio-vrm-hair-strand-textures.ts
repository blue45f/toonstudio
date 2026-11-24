/**
 * VRoid/애니메 3D 절차형 헤어용 결정론적 모발결 알베도·탄젠트 노멀·이중 초승달 엔젤링 매트캡 생성기.
 *
 * 단색 버텍스 컬러와 넓은 회백색 매트캡이 어두운 모발(`#352a28` 등)을 뿌연 플라스틱으로
 * 물들이는 문제를 해소한다. 모든 텍스처는 순수 수치 연산으로 생성되어 브라우저·Node 테스트
 * 환경에서 비트 단위로 동일한 결과를 보장한다.
 */
import * as THREE from "three";

export const STUDIO_VRM_HAIR_STRAND_TEXTURE_SIZE = 256;
export const STUDIO_VRM_HAIR_MATCAP_TEXTURE_SIZE = 128;

const TWO_PI = Math.PI * 2;
const ALBEDO_PIXEL_CACHE = new Map<number, Uint8Array>();
const MATCAP_PIXEL_CACHE = new Map<number, Uint8Array>();
let cachedNormalPixels: Uint8Array | null = null;

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * 모발결 높이장(0=가닥 사이 골, 1=가닥 능선).
 * 가로 `u ∈ [0, 1)` 에 대해 정수 배수 주파수만 사용해 `RepeatWrapping` 이음새가 0이며,
 * 알베도와 노멀맵이 동일한 높이장을 공유해 광택과 음영 골이 1:1 정합된다.
 */
export function sampleStudioVrmHairStrandHeight(u: number, v: number): number {
  const uu = ((Number.isFinite(u) ? u : 0) % 1 + 1) % 1;
  const vv = clamp01(v);
  // 뿌리→끝으로 미세하게 흔들리는 유기적 모발 흐름(가로 주기 1 유지)
  const flowU = uu
    + 0.006 * Math.sin(vv * Math.PI * 2)
    + 0.0025 * Math.sin(vv * Math.PI * 4 + 0.7);
  const phaseWarp = 0.16 * Math.sin(TWO_PI * 3 * flowU + 0.35);

  // 다중 주파수 정현파 모발 다발(큰 다발 5·8 + 중간 가닥 17·29 + 미세 섬유 53·79)
  const macro = 0.5
    + 0.3 * Math.cos(TWO_PI * 5 * flowU + 0.2)
    + 0.2 * Math.sin(TWO_PI * 8 * flowU - 0.55);
  const mid = 0.5
    + 0.3 * Math.cos(TWO_PI * 17 * flowU + phaseWarp)
    + 0.2 * Math.sin(TWO_PI * 29 * flowU - phaseWarp * 1.35 + 0.85);
  const fine = 0.5
    + 0.28 * Math.cos(TWO_PI * 53 * flowU + 1.15)
    + 0.22 * Math.sin(TWO_PI * 79 * flowU + 0.35);

  const combined = macro * 0.36 + mid * 0.42 + fine * 0.22;
  return clamp01(Math.pow(clamp01(combined), 0.86));
}

/**
 * 256×256 sRGB 절차적 애니메 모발결 알베도 텍스처(`RepeatWrapping`).
 *
 * - 세로 방향 다중 주파수 모발 섬유 결(골과 능선 대비)
 * - 두피 뿌리(`v → 0`) 미세 음영, 중단(`v ≈ 0.36`) 은은한 광택 대역, 끝단(`v → 1`) 따뜻한 반투명 톤
 * - 전체 평균 휘도를 `0.94..0.98` 범위로 정규화해 어두운 모발색이 뿌옇게 바래지 않는다.
 */
export function createStudioVrmHairStrandAlbedoTexture(shine: number): THREE.DataTexture {
  const size = STUDIO_VRM_HAIR_STRAND_TEXTURE_SIZE;
  const strength = clamp01(shine);
  const cacheKey = Math.round(strength * 100);
  let template = ALBEDO_PIXEL_CACHE.get(cacheKey);
  if (!template) {
    const quantizedStrength = cacheKey / 100;
    const pixelCount = size * size;
    const rawRgb = new Float32Array(pixelCount * 3);

    const strandContrast = 0.16 + quantizedStrength * 0.08;
    const midBoost = 0.02 + quantizedStrength * 0.045;
    let lumSum = 0;

    for (let y = 0; y < size; y += 1) {
      const v = y / (size - 1);
      const rootShadow = 1 - 0.13 * Math.exp(-Math.pow(v / 0.14, 2));
      const midBand = Math.exp(-Math.pow((v - 0.36) / 0.15, 2));
      const tipWarmth = smoothstep(0.62, 1, v);

      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const height = sampleStudioVrmHairStrandHeight(u, v);
        const fiber = 1 - strandContrast * (1 - height);
        const sheen = 1 + midBoost * midBand * (0.4 + 0.6 * height);
        const base = fiber * rootShadow * sheen;

        const r = base * (1 + tipWarmth * 0.032);
        const g = base * (1 + tipWarmth * 0.012);
        const b = base * (1 - tipWarmth * 0.024);

        const idx = (y * size + x) * 3;
        rawRgb[idx] = r;
        rawRgb[idx + 1] = g;
        rawRgb[idx + 2] = b;
        lumSum += 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }

    // 평균을 약 0.955 로 맞춰 곱셈 텍스처가 어두운 머리를 씻어내지 않으면서 선명한 모발 결을 유지한다.
    const meanLum = lumSum / pixelCount;
    const targetMean = 0.952 + quantizedStrength * 0.012;
    const gain = meanLum > 1e-4 ? targetMean / meanLum : 1;

    template = new Uint8Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i += 1) {
      const src = i * 3;
      const dst = i * 4;
      template[dst] = Math.round(clamp(rawRgb[src]! * gain, 0.66, 1) * 255);
      template[dst + 1] = Math.round(clamp(rawRgb[src + 1]! * gain, 0.66, 1) * 255);
      template[dst + 2] = Math.round(clamp(rawRgb[src + 2]! * gain, 0.64, 1) * 255);
      template[dst + 3] = 255;
    }
    ALBEDO_PIXEL_CACHE.set(cacheKey, template);
  }

  const data = template.slice();
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `studio-vrm-hair-strand-albedo:s${cacheKey}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 256×256 탄젠트 공간 모발결 노멀맵(`NoColorSpace`, `RepeatWrapping`).
 * 세로 가닥 골과 능선을 법선으로 인코딩해 직사광·림라이트·엔젤링이 실크 결 단위로 부서지게 한다.
 */
export function createStudioVrmHairStrandNormalTexture(): THREE.DataTexture {
  const size = STUDIO_VRM_HAIR_STRAND_TEXTURE_SIZE;
  if (!cachedNormalPixels) {
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      const v = y / (size - 1);
      for (let x = 0; x < size; x += 1) {
        heights[y * size + x] = sampleStudioVrmHairStrandHeight(x / size, v);
      }
    }

    const baked = new Uint8Array(size * size * 4);
    const slopeX = 6.2;
    const slopeY = 1.3;
    for (let y = 0; y < size; y += 1) {
      const ym = Math.max(0, y - 1);
      const yp = Math.min(size - 1, y + 1);
      for (let x = 0; x < size; x += 1) {
        const xm = (x - 1 + size) % size;
        const xp = (x + 1) % size;
        const dx = (heights[y * size + xp]! - heights[y * size + xm]!) * slopeX;
        const dy = (heights[yp * size + x]! - heights[ym * size + x]!) * slopeY;
        const invLen = 1 / Math.hypot(-dx, -dy, 1);
        const offset = (y * size + x) * 4;
        baked[offset] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
        baked[offset + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
        baked[offset + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
        baked[offset + 3] = 255;
      }
    }
    cachedNormalPixels = baked;
  }

  const data = cachedNormalPixels.slice();
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = "studio-vrm-hair-strand-normal";
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * VRoid/웹툰 스타일 고대비 이중 초승달 엔젤링 매트캡 텍스처(128×128).
 *
 * 기존 넓은 가우시안 + 전역 림 안개가 어두운 머리를 회백색으로 뿌옇게 덮던 문제를 제거하고,
 * 링 외부 배경을 순수 암부(0)로 유지하면서 상단 주 초승달과 하단 보조 초승달만 또렷하게 띄운다.
 */
export function createStudioVrmHairAngelRingMatcapTexture(shine: number): THREE.DataTexture {
  const size = STUDIO_VRM_HAIR_MATCAP_TEXTURE_SIZE;
  const strength = clamp01(shine);
  const cacheKey = Math.round(strength * 100);
  let template = MATCAP_PIXEL_CACHE.get(cacheKey);
  if (!template) {
    const quantizedStrength = cacheKey / 100;
    const intensity = 0.34 + quantizedStrength * 0.66;
    template = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y += 1) {
      const ny = (y / (size - 1)) * 2 - 1;
      for (let x = 0; x < size; x += 1) {
        const nx = (x / (size - 1)) * 2 - 1;
        const r2 = nx * nx + ny * ny;
        const offset = (y * size + x) * 4;
        if (r2 > 1.02) {
          template[offset] = 0;
          template[offset + 1] = 0;
          template[offset + 2] = 0;
          template[offset + 3] = 255;
          continue;
        }

        const arch = 0.3 - nx * nx * 0.24;
        const sideEnvelope = Math.pow(Math.max(0, Math.cos(clamp(nx, -1, 1) * Math.PI * 0.56)), 1.35);
        // VRoid/웹툰 엔젤링의 결 끊김 리듬(단조로운 고리 대신 톱니·깃털형 하이라이트)
        const strandNotch = 0.78 + 0.22 * Math.cos(nx * Math.PI * 7.5 + ny * 2.2) * Math.cos(nx * Math.PI * 13 - 0.6);

        const primaryRaw = Math.exp(-Math.pow((ny - arch) / 0.056, 2));
        const primary = smoothstep(0.14, 0.92, primaryRaw) * sideEnvelope * strandNotch;

        const secondaryRaw = Math.exp(-Math.pow((ny - (arch - 0.175)) / 0.032, 2));
        const secondary = smoothstep(0.22, 0.95, secondaryRaw)
          * sideEnvelope
          * 0.42
          * (0.82 + 0.18 * Math.sin(nx * Math.PI * 9));

        // 가장자리 실루엣 극소 림(내부 미드톤 안개 0)
        const r = Math.sqrt(r2);
        const grazingRim = Math.pow(clamp01((r - 0.86) / 0.14), 3) * smoothstep(-0.18, 0.45, ny) * 0.14;

        const val = clamp01((primary * 0.96 + secondary + grazingRim) * intensity);
        template[offset] = Math.round(val * 255);
        template[offset + 1] = Math.round(val * 0.985 * 255);
        template[offset + 2] = Math.round(val * 0.955 * 255);
        template[offset + 3] = 255;
      }
    }
    MATCAP_PIXEL_CACHE.set(cacheKey, template);
  }

  const data = template.slice();
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = "studio-vrm-hair-angel-ring-matcap";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
