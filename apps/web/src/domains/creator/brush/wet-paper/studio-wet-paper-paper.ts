/**
 * 시드 고정 절차적 종이: 요철 높이(그레인), 섬유 방향·밀도, 링크별 투과(차단 계수 κ), 모세관 용량, 흡수율.
 *
 * 모든 값은 문서 좌표의 순수 함수다(획·격자·타일 순서와 무관). 그래서 같은 레인의 두 획은 같은 종이를 보고,
 * 타일을 어떤 순서로 깨워도 결과가 같다.
 * - 요철 높이: 제품 종이 프리셋 샘플러 `samplePaperHeightV1`(문서 좌표 고정, 레인 프로그램이 낱장을 핀).
 * - 섬유: 서로 다른 방향의 줄무늬 노이즈 층 4장. 층마다 섬유 방향으로 길고(섬유 길이 px) 가로로 얇은(섬유 폭 px)
 *   값 노이즈의 능선을 섬유로 본다(Sumi 종이 셰이더의 "회전 좌표 + 신장 노이즈 능선" 개념을 결정적 정수 해시로
 *   재구현). 가장 강한 층의 방향이 그 셀의 섬유 방향이다.
 * - κ(MoXi 다공성 부분 bounce-back): 섬유와 나란한 링크는 덜, 가로지르는 링크는 더 막는다. 섬유가 없는 틈은
 *   더 막히고 섬유 채널은 덜 막힌다(섬유 거칠기). 링크는 소유 셀 하나에만 저장해 양 끝이 같은 κ를 본다
 *   (질량 보존의 전제).
 */

import {
  getStudioPaperPresetV1,
  samplePaperHeightV1,
} from "../studio-paper-media-profile-v1";

import {
  clamp01,
  clampNumber,
  detCos,
  detSin,
  smoothstep,
  wetPaperHash01,
  wetPaperValueNoise,
} from "./studio-wet-paper-math";
import { WET_PAPER_TILE } from "./studio-wet-paper-state";

import type { StudioWetPaperSheetProgram } from "./studio-wet-paper-programs";
import type { WetPaperState } from "./studio-wet-paper-state";

/** 링크 κ 상한(완전 차단은 젖음 전선 고정이 담당한다). */
export const WET_PAPER_KAPPA_MAX = 0.97;

const FIBER_LAYERS = 4;
const SQRT1_2 = 0.7071067811865476;
/** 전방 링크 클래스 E, S, SE, NE의 단위 방향. */
const CLASS_DIR_X = [1, 0, SQRT1_2, SQRT1_2] as const;
const CLASS_DIR_Y = [0, 1, SQRT1_2, -SQRT1_2] as const;

export interface WetPaperSheetSample {
  height: number;
  fiber: number;
  fiberCos: number;
  fiberSin: number;
}

interface FiberLayer {
  readonly cos: number;
  readonly sin: number;
  readonly seed: number;
}

export interface WetPaperSheetSampler {
  readonly sheet: StudioWetPaperSheetProgram;
  readonly sample: (wx: number, wy: number, out: WetPaperSheetSample) => void;
}

/** 프로그램 낱장 하나의 샘플러(층 각도는 한 번만 계산). */
export function createWetPaperSheetSampler(sheet: StudioWetPaperSheetProgram): WetPaperSheetSampler {
  const preset = getStudioPaperPresetV1(sheet.heightPresetId);
  const seed = sheet.seed | 0;
  const layers: FiberLayer[] = [];
  for (let index = 0; index < FIBER_LAYERS; index += 1) {
    const angle = (index * Math.PI) / FIBER_LAYERS
      + (wetPaperHash01(seed, index, 0x0f1b) - 0.5) * 0.7;
    layers.push(Object.freeze({
      cos: detCos(angle),
      sin: detSin(angle),
      seed: (seed + Math.imul(index + 1, 0x9e37_79b9)) | 0,
    }));
  }
  const invLength = 1 / Math.max(2, sheet.fiberLengthPx);
  const invWidth = 1 / Math.max(0.5, sheet.fiberWidthPx);
  const density = clamp01(sheet.fiberDensity);
  const segLow = 0.78 - 0.45 * density;
  const segHigh = segLow + 0.2;
  const sample = (wx: number, wy: number, out: WetPaperSheetSample): void => {
    out.height = samplePaperHeightV1(preset, wx, wy, seed >>> 0);
    let best = 0;
    let bestCos = 1;
    let bestSin = 0;
    for (let index = 0; index < FIBER_LAYERS; index += 1) {
      const layer = layers[index] as FiberLayer;
      const along = (wx * layer.cos + wy * layer.sin) * invLength;
      let across = (wy * layer.cos - wx * layer.sin) * invWidth;
      // 섬유가 곧은 막대가 되지 않도록 느린 노이즈로 가로 좌표를 휘게 한다.
      across += (wetPaperValueNoise(along * 0.6, across * 0.03 + index * 7.3, layer.seed ^ 0x2c1b) - 0.5) * 2.4;
      const ridgeNoise = wetPaperValueNoise(along, across + index * 19.1, layer.seed);
      const ridge = 1 - Math.abs(2 * ridgeNoise - 1);
      const ridge2 = ridge * ridge;
      const ridge6 = ridge2 * ridge2 * ridge2;
      const segment = smoothstep(
        segLow,
        segHigh,
        wetPaperValueNoise(along * 0.45 + index * 3.7, across * 0.08, layer.seed ^ 0x5a5a),
      );
      const strength = ridge6 * segment;
      if (strength > best) {
        best = strength;
        bestCos = layer.cos;
        bestSin = layer.sin;
      }
    }
    out.fiber = best;
    out.fiberCos = bestCos;
    out.fiberSin = bestSin;
  };
  return Object.freeze({ sheet, sample });
}

/**
 * (k0, 이방성) → 섬유 나란/가로 링크 차단 계수. 평균이 k0 근처에 머물도록 나란 방향은 k0·(1 − a),
 * 가로 방향은 k0 + (κmax − k0)·a로 둔다.
 */
export function wetPaperFiberBlocking(k0: number, anisotropy: number): {
  parallel: number;
  perpendicular: number;
} {
  const base = clampNumber(k0, 0, WET_PAPER_KAPPA_MAX);
  const aniso = clamp01(anisotropy);
  return {
    parallel: base * (1 - aniso),
    perpendicular: base + (WET_PAPER_KAPPA_MAX - base) * aniso,
  };
}

/**
 * 타일 하나의 종이 필드를 채우는 함수를 만든다(베이크당 한 번 생성, 타일을 깨울 때마다 호출).
 */
export function createWetPaperTileFiller(
  sheet: StudioWetPaperSheetProgram,
): (state: WetPaperState, tileX: number, tileY: number) => void {
  const sampler = createWetPaperSheetSampler(sheet);
  const scratch: WetPaperSheetSample = { height: 0.5, fiber: 0, fiberCos: 1, fiberSin: 0 };
  const k0 = clampNumber(sheet.fiberBlocking, 0, 0.9);
  const anisotropy = clamp01(sheet.fiberAnisotropy);
  const roughness = clamp01(sheet.fiberRoughness);
  const absorbency = clamp01(sheet.absorbency);
  return (state, tileX, tileY) => {
    const { width, cells, originXPx, originYPx, cellPx } = state.grid;
    const x0 = tileX * WET_PAPER_TILE;
    const y0 = tileY * WET_PAPER_TILE;
    for (let ly = 0; ly < WET_PAPER_TILE; ly += 1) {
      const y = y0 + ly;
      const wy = originYPx + (y + 0.5) * cellPx;
      for (let lx = 0; lx < WET_PAPER_TILE; lx += 1) {
        const x = x0 + lx;
        const wx = originXPx + (x + 0.5) * cellPx;
        const index = y * width + x;
        sampler.sample(wx, wy, scratch);
        const height = scratch.height;
        const fiber = scratch.fiber;
        state.height[index] = height;
        state.fiber[index] = fiber;
        // 골은 물을 더 담고, 섬유는 물을 더 빨아들인다.
        const capacity = 0.45 + 0.5 * absorbency + 0.3 * (1 - height);
        state.capacity[index] = capacity;
        state.invCapacity[index] = 1 / capacity;
        state.absorb[index] = clamp01(0.25 + 0.6 * absorbency + 0.25 * fiber - 0.1 * height);
        const anisoHere = anisotropy * clamp01(fiber * 1.6);
        const blocking = wetPaperFiberBlocking(k0, anisoHere);
        // 섬유 채널은 전도율↑, 섬유 사이 틈은 ↓, 셀 단위 지터로 규칙성을 깬다.
        const jitter = wetPaperHash01(sheet.seed ^ 0x7e3a, Math.floor(wx), Math.floor(wy));
        let conduct = 1 + roughness * (2 * clamp01(fiber * 1.4) - 1) * 0.9;
        conduct *= 1 + roughness * (jitter - 0.5) * 0.5;
        if (conduct < 0.05) conduct = 0.05;
        for (let linkClass = 0; linkClass < 4; linkClass += 1) {
          const dot = (CLASS_DIR_X[linkClass] ?? 1) * scratch.fiberCos
            + (CLASS_DIR_Y[linkClass] ?? 0) * scratch.fiberSin;
          const dot2 = dot * dot;
          const dot6 = dot2 * dot2 * dot2;
          const kappaDir = blocking.perpendicular
            + (blocking.parallel - blocking.perpendicular) * dot6;
          const kappa = 1 - (1 - kappaDir) * conduct;
          state.kappa[linkClass * cells + index] = clampNumber(kappa, 0, WET_PAPER_KAPPA_MAX);
        }
      }
    }
  };
}
