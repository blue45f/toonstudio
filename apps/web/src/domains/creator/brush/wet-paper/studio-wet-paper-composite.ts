/**
 * Beer–Lambert 합성: 광학 밀도 D → 획 색 RGBA8(직선 알파) 래스터.
 *
 * 선택: Kubelka–Munk가 아니라 Beer–Lambert다. 한 획은 사용자가 고른 한 색의 투명 안료(수채·먹)라 산란 항(S)이
 * 의미 있게 갈리지 않고, 제품 레이어 합성(source-over)과 맞물리는 단순한 투과 모델이 더 정직하다.
 * - 안료 흡광 계수: 흰 종이 위에서 기준 밀도 D_ref일 때 정확히 획 색 C가 보이도록 K_c = −ln(C_c)/D_ref
 *   (C_c는 1/255로 하한). 투과율 T_c = exp(−K_c·D). D가 D_ref보다 크면(테두리·입자·백런 고리) 같은 색이
 *   더 깊고 진해지고, 작으면(번짐 후광·옅은 워시) 옅어진다 — 실제 투명 겹칠(glazing)의 거동.
 * - 직선 알파 변환: a = 1 − min_c T_c, 색_c = 1 − (1 − T_c)/a. 이 RGBA를 흰 바탕 위에 source-over로 그리면
 *   결과가 정확히 T(흰 종이 위 Beer–Lambert)다. 색 바탕 위에서는 곱셈 겹칠의 근사다(문서화된 한계).
 * - 지수는 결정적 근사(`detExp`)로 만든 4097칸 LUT를 선형 보간한다(엔진 간 바이트 일치).
 *
 * 해상도: 솔버 격자(셀 ≈ 2–12 문서 px)를 문서 약 1.25 px 픽셀의 래스터로 합성한다. 젖음 전선은 펴진 덮임 장(솔버의
 * `edge`, 없으면 이진 덮임)을 쌍선형 보간한 0.5 등고선으로 자른다. 안티앨리어스 반 폭은 그 점의 장 기울기(래스터
 * 픽셀당)의 절반이라 전선 둘레가 늘 한 픽셀 폭으로 부드럽다. 밀도는 덮인 셀끼리만 정규화 보간해 테두리(가장자리
 * 짙어짐)가 바깥 0과 섞여 흐려지지 않게 한다. 셀보다 작은 종이 결은 같은 문서 좌표 종이 높이로 다시 입힌다.
 */

import { parseStudioGpuColor } from "../../render/studio-webgpu-color";
import {
  getStudioPaperPresetV1,
  samplePaperHeightV1,
} from "../studio-paper-media-profile-v1";

import { clamp01, clampNumber, detExp, detLn } from "./studio-wet-paper-math";

import type { StudioWetPaperBakeResult } from "./studio-wet-paper-solver";

const LUT_SIZE = 4096;
/** LUT가 덮는 최대 광학 밀도(이 이상은 끝값으로 포화 — 투과율 ≈ 0). */
const LUT_MAX_DENSITY = 12;
const MIN_CHANNEL = 1 / 255;

/**
 * 합성 래스터 상한: 배율(셀당 픽셀)과 총 픽셀(메모리·SVG 크기 상한). 래스터 픽셀은 문서 약 1.25 px를
 * 목표로 하고(굵은 붓은 셀이 커서 배율이 커진다), 총 픽셀 상한을 넘으면 배율을 낮춘다.
 */
export const STUDIO_WET_PAPER_RASTER_LIMITS = Object.freeze({
  maxScale: 48,
  maxPixels: 1_048_576,
  /** 목표 픽셀 크기(문서 px). */
  targetPixelPx: 1.25,
});

export interface StudioWetPaperPigmentColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

/** 합성된 RGBA8 래스터와 문서 좌표 배치. */
export interface StudioWetPaperRaster {
  readonly width: number;
  readonly height: number;
  readonly originXPx: number;
  readonly originYPx: number;
  /** 래스터 픽셀 한 변의 문서 px. */
  readonly pixelPx: number;
  /** 직선 알파 RGBA8(행 우선). */
  readonly rgba: Uint8ClampedArray;
}

/**
 * 가장 어두운 채널이 이보다 밝은 안료는 흡광이 거의 없어, Beer–Lambert 굽기가 기준 밀도에서도 이 비율보다 옅다.
 * 흰·파스텔 획이 베이스 워시로는 보이다가 굽고 나면 사라지지 않게 그런 안료는 굽지 않는다.
 */
const MIN_PIGMENT_ABSORBANCE_SPAN = 0.2;

/**
 * 제품 색 문법(#rgb, #rrggbb, #rrggbbaa, rgb(), rgba())을 해석한다. 굽기는 불투명하고 흡광이 있는 안료만 다룬다.
 * 해석할 수 없는 색, 반투명·투명 색(알파 < 1 — 예전에는 'transparent' 가 검정 안료로 구워졌다), 거의 흰 안료는
 * null 이다(베이스 워시 유지 — 베이스 워시는 색 알파를 그대로 쓴다).
 */
export function parseStudioWetPaperPigmentColor(color: unknown): StudioWetPaperPigmentColor | null {
  const parsed = parseStudioGpuColor(color);
  if (!parsed || !(parsed[3] >= 1)) return null;
  if (1 - Math.min(parsed[0], parsed[1], parsed[2]) < MIN_PIGMENT_ABSORBANCE_SPAN) return null;
  return { red: parsed[0], green: parsed[1], blue: parsed[2] };
}

function transmittanceLut(channel: number, referenceDensity: number): Float64Array {
  const absorbance = -detLn(Math.max(MIN_CHANNEL, clamp01(channel))) / Math.max(0.05, referenceDensity);
  const lut = new Float64Array(LUT_SIZE + 1);
  for (let index = 0; index <= LUT_SIZE; index += 1) {
    lut[index] = detExp(-absorbance * ((index * LUT_MAX_DENSITY) / LUT_SIZE));
  }
  return lut;
}

/** 래스터 배율(셀당 픽셀 수). 결정적이며 총 픽셀 상한을 넘지 않는다. */
export function studioWetPaperRasterScale(result: StudioWetPaperBakeResult): number {
  const limits = STUDIO_WET_PAPER_RASTER_LIMITS;
  let scale = Math.round(clampNumber(result.cellPx / limits.targetPixelPx, 1, limits.maxScale));
  while (scale > 1 && result.width * scale * result.height * scale > limits.maxPixels) scale -= 1;
  return scale;
}

/**
 * 행 단위로 나눠 돌릴 수 있는 합성 작업(Canvas 호스트가 조각 예산 안에서 몇 행씩 진행한다). 같은 입력이면
 * 한 번에 돌리든 나눠 돌리든 바이트가 같다(행은 서로 독립).
 */
export interface StudioWetPaperRasterJob {
  readonly raster: StudioWetPaperRaster;
  /** 다음에 채울 행(height면 끝). */
  nextRow: number;
  readonly result: StudioWetPaperBakeResult;
  readonly scale: number;
  readonly lutRed: Float64Array;
  readonly lutGreen: Float64Array;
  readonly lutBlue: Float64Array;
  readonly preset: ReturnType<typeof getStudioPaperPresetV1>;
}

/** 합성 작업을 만든다(LUT·버퍼 할당). 해석할 수 없는 색이면 null. */
export function createStudioWetPaperRasterJob(
  result: StudioWetPaperBakeResult,
  color: unknown,
): StudioWetPaperRasterJob | null {
  const pigment = parseStudioWetPaperPigmentColor(color);
  if (!pigment) return null;
  const scale = studioWetPaperRasterScale(result);
  const width = result.width * scale;
  const height = result.height * scale;
  return {
    raster: Object.freeze({
      width,
      height,
      originXPx: result.originXPx,
      originYPx: result.originYPx,
      pixelPx: result.cellPx / scale,
      rgba: new Uint8ClampedArray(width * height * 4),
    }),
    nextRow: 0,
    result,
    scale,
    lutRed: transmittanceLut(pigment.red, result.referenceDensity),
    lutGreen: transmittanceLut(pigment.green, result.referenceDensity),
    lutBlue: transmittanceLut(pigment.blue, result.referenceDensity),
    preset: getStudioPaperPresetV1(result.sheet.heightPresetId),
  };
}

/** 최대 maxRows 행을 채운다. 모든 행을 채웠으면 true. */
export function advanceStudioWetPaperRasterJob(job: StudioWetPaperRasterJob, maxRows: number): boolean {
  const { raster, result, scale, lutRed, lutGreen, lutBlue, preset } = job;
  const { width, height, pixelPx, rgba } = raster;
  const rowEnd = Math.min(height, job.nextRow + Math.max(1, Math.floor(maxRows)));
  const gridWidth = result.width;
  const gridHeight = result.height;
  const density = result.density;
  const coverage = result.coverage;
  const edge = result.edge;
  const grainDetail = clamp01(result.grainDetail);
  const paperSeed = result.sheet.seed >>> 0;
  const lutScale = LUT_SIZE / LUT_MAX_DENSITY;
  const edgeHalfWidth = 0.5 / scale;
  const invScale = 1 / scale;
  for (let py = job.nextRow; py < rowEnd; py += 1) {
    const gy = (py + 0.5) * invScale - 0.5;
    const y0 = gy <= 0 ? 0 : Math.floor(gy);
    const ty = gy <= 0 ? 0 : gy - y0;
    const row0 = (y0 < gridHeight ? y0 : gridHeight - 1) * gridWidth;
    const row1 = (y0 + 1 < gridHeight ? y0 + 1 : gridHeight - 1) * gridWidth;
    const worldY = result.originYPx + (py + 0.5) * pixelPx;
    for (let px = 0; px < width; px += 1) {
      const gx = (px + 0.5) * invScale - 0.5;
      const x0 = gx <= 0 ? 0 : Math.floor(gx);
      const tx = gx <= 0 ? 0 : gx - x0;
      const c0 = x0 < gridWidth ? x0 : gridWidth - 1;
      const c1 = x0 + 1 < gridWidth ? x0 + 1 : gridWidth - 1;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      const k00 = (coverage[row0 + c0] as number) * w00;
      const k10 = (coverage[row0 + c1] as number) * w10;
      const k01 = (coverage[row1 + c0] as number) * w01;
      const k11 = (coverage[row1 + c1] as number) * w11;
      const binary = k00 + k10 + k01 + k11;
      let covered = binary;
      let halfWidth = edgeHalfWidth;
      let e00 = 0;
      let e10 = 0;
      let e01 = 0;
      let e11 = 0;
      if (edge) {
        e00 = (edge[row0 + c0] as number) / 255;
        e10 = (edge[row0 + c1] as number) / 255;
        e01 = (edge[row1 + c0] as number) / 255;
        e11 = (edge[row1 + c1] as number) / 255;
        covered = e00 * w00 + e10 * w10 + e01 * w01 + e11 * w11;
        const slopeX = ((1 - ty) * (e10 - e00) + ty * (e11 - e01)) * invScale;
        const slopeY = ((1 - tx) * (e01 - e00) + tx * (e11 - e10)) * invScale;
        halfWidth = Math.max(1e-3, 0.5 * Math.sqrt(slopeX * slopeX + slopeY * slopeY));
      }
      if (covered <= 0.5 - halfWidth) continue;
      // 덮인 셀끼리만 정규화 보간(테두리 밀도가 바깥 0과 섞여 흐려지지 않는다). 펴진 전선이 덮인 셀 바깥 셀 안까지
      // 나온 곳은 전선 장 무게로 보간한다.
      let value = binary > 0
        ? (
          k00 * (density[row0 + c0] as number)
          + k10 * (density[row0 + c1] as number)
          + k01 * (density[row1 + c0] as number)
          + k11 * (density[row1 + c1] as number)
        ) / binary
        : (
          e00 * w00 * (density[row0 + c0] as number)
          + e10 * w10 * (density[row0 + c1] as number)
          + e01 * w01 * (density[row1 + c0] as number)
          + e11 * w11 * (density[row1 + c1] as number)
        ) / covered;
      // 젖음 전선: 등고선 둘레 한 픽셀 폭 안티앨리어스.
      if (covered < 0.5 + halfWidth) {
        const t = (covered - (0.5 - halfWidth)) / (2 * halfWidth);
        value *= t * t * (3 - 2 * t);
      }
      if (grainDetail > 0 && value > 0) {
        // 셀보다 작은 종이 결: 골(낮은 높이)은 진하게, 봉우리는 옅게.
        const paper = samplePaperHeightV1(preset, result.originXPx + (px + 0.5) * pixelPx, worldY, paperSeed);
        value *= 1 + grainDetail * (1 - 2 * paper);
      }
      if (!(value > 1e-5)) continue;
      let position = value * lutScale;
      if (position > LUT_SIZE - 1e-9) position = LUT_SIZE - 1e-9;
      const index = Math.floor(position);
      const fraction = position - index;
      const tRed = (lutRed[index] as number) + ((lutRed[index + 1] as number) - (lutRed[index] as number)) * fraction;
      const tGreen = (lutGreen[index] as number)
        + ((lutGreen[index + 1] as number) - (lutGreen[index] as number)) * fraction;
      const tBlue = (lutBlue[index] as number) + ((lutBlue[index + 1] as number) - (lutBlue[index] as number)) * fraction;
      let minT = tRed < tGreen ? tRed : tGreen;
      if (tBlue < minT) minT = tBlue;
      const alpha = 1 - minT;
      if (alpha < 0.5 / 255) continue;
      const invAlpha = 1 / alpha;
      const base = (py * width + px) * 4;
      rgba[base] = Math.round((1 - (1 - tRed) * invAlpha) * 255);
      rgba[base + 1] = Math.round((1 - (1 - tGreen) * invAlpha) * 255);
      rgba[base + 2] = Math.round((1 - (1 - tBlue) * invAlpha) * 255);
      rgba[base + 3] = Math.round(alpha * 255);
    }
  }
  job.nextRow = rowEnd;
  return rowEnd >= height;
}

/**
 * 베이크 결과를 색 하나로 합성한 래스터(동기 — SVG 내보내기·테스트). 해석할 수 없는 색이면 null.
 */
export function compositeStudioWetPaperRaster(
  result: StudioWetPaperBakeResult,
  color: unknown,
): StudioWetPaperRaster | null {
  const job = createStudioWetPaperRasterJob(result, color);
  if (!job) return null;
  advanceStudioWetPaperRasterJob(job, job.raster.height);
  return job.raster;
}

/** 흰 바탕 위 source-over 결과(테스트·진단용): 합성 RGBA가 Beer–Lambert 투과율을 재현하는지 확인한다. */
export function studioWetPaperOverWhite(rgba: Uint8ClampedArray, index: number): readonly [number, number, number] {
  const alpha = (rgba[index * 4 + 3] ?? 0) / 255;
  return [
    alpha * ((rgba[index * 4] ?? 0) / 255) + (1 - alpha),
    alpha * ((rgba[index * 4 + 1] ?? 0) / 255) + (1 - alpha),
    alpha * ((rgba[index * 4 + 2] ?? 0) / 255) + (1 - alpha),
  ];
}
