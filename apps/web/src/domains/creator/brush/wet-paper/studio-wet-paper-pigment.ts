/**
 * 안료 패스(스텝의 뒤 절반): Curtis식 부유 안료 수송 + 흡착·탈착 + 지연 경화.
 *
 * 수송은 링크 단위다. 링크마다 "소유 셀 → 이웃"과 "이웃 → 소유 셀" 유출 비율을 한 번만 계산해 저장하고(B1),
 * 각 셀은 자기 8링크의 비율을 모아 새 부유량을 만든다(B2). 같은 비율을 양 끝이 읽으므로 안료 총량이
 * 정확히 보존된다. 유출 비율 = 확산(두 셀 모두 젖음, 섬유 전도율) + 상류 이류(면 속도 × 이동도)
 * + 가장자리 이동(3×3 젖음 비율이 높은 쪽 → 낮은 쪽 = 젖은 영역 안쪽 → 전선, Curtis 가장자리 짙어짐. 물 두께
 * 비가 아니라 거시 젖음 마스크를 따라서 고르게 마르는 워시 안쪽에 dab 간격 줄무늬가 생기지 않는다)
 * + 골 미끄러짐(요철 높은 쪽 → 낮은 쪽,
 * 입자 침전) + 모세관 운반(모세관 물이 흐르면 기증 셀 안료가 물 비율만큼 따라간다 — 다시 적신 곳에서 덜 젖은
 * 곳으로 안료를 밀어 백런 테두리를 만든다). 링크당 상한(면 0.125, 대각 0.05)으로 합 ≤ 0.7 → 양수 보장.
 * 두 안료 종은 링크 기하(젖음·속도·기울기·모세관 유량)를 공유하고 이동도·골 미끄러짐만 다르다.
 *
 * 흡착은 물막이 얇을수록(마를수록)·골일수록(입자 침전)·섬유를 빨리 스칠수록(섬유 포집) 빠르다. 젖은 곳의
 * 침착분은 탈착률만큼 다시 떠오르고(착색분은 제외), 마르면 남은 부유분이 모두 침착한다. 마른 지 cureSteps가
 * 지난 셀이 다시 젖으면 그때 침착분의 (1 − rewet)를 먼저 고정한다(지연 경화 — 마른 셀은 탈착하지 않으므로
 * 매 스텝 경화하는 것과 결과가 같고, 마른 타일을 건너뛸 수 있다). 수묵은 rewet 0: 굳은 먹은 들리지 않는다.
 */

import {
  WET_PAPER_LBM_CX,
  WET_PAPER_LBM_CY,
  WET_PAPER_LINK_CLASS,
  WET_PAPER_LINK_DIFFUSION_WEIGHT,
  WET_PAPER_LINK_FORWARD,
} from "./studio-wet-paper-lbm";
import { WET_PAPER_LINK_CLASSES, WET_PAPER_TILE } from "./studio-wet-paper-state";

import type { WetPaperKernel } from "./studio-wet-paper-kernel";
import type { WetPaperState } from "./studio-wet-paper-state";

const CX = Int32Array.from(WET_PAPER_LBM_CX);
const CY = Int32Array.from(WET_PAPER_LBM_CY);
const LINK_CLASS = Int32Array.from(WET_PAPER_LINK_CLASS);
const FORWARD = Uint8Array.from(WET_PAPER_LINK_FORWARD);
const LINK_W = Float64Array.from(WET_PAPER_LINK_DIFFUSION_WEIGHT);
/** 링크 소유 셀이 계산하는 전방 방향(E, S, SE, NE). */
const OWNED_DIRECTIONS = Int32Array.of(1, 2, 5, 8);
const FACE_CAP = 0.125;
const DIAGONAL_CAP = 0.05;
/** 방향별 이웃 오프셋(dy·width + dx)과 링크 클래스 오프셋(class·cells) — 호출마다 격자 크기로 채운다. */
const NEIGHBOR_OFFSET = new Int32Array(9);
const CLASS_OFFSET = new Int32Array(9);

/** 링크 한 방향(a → b)의 종 무관 기하(작업 버퍼). */
interface LinkGeometry {
  /** 종 무관 유출(확산 + 가장자리 이동). */
  base: number;
  /** 양의 면 법선 속도(이동도를 곱한다). */
  advect: number;
  /** 양의 요철 낙차(골 미끄러짐 계수를 곱한다). */
  slope: number;
  /** 모세관 운반 비율(이동도를 곱한다). */
  carry: number;
}

const FORWARD_GEOMETRY: LinkGeometry = { base: 0, advect: 0, slope: 0, carry: 0 };
const BACKWARD_GEOMETRY: LinkGeometry = { base: 0, advect: 0, slope: 0, carry: 0 };

/**
 * 링크 (a, b = a + c_q, a가 소유)의 두 방향 기하를 계산한다. 링크당 한 번만 불리고 양 끝이 같은 값을 읽는다.
 */
function measureLink(
  state: WetPaperState,
  kernel: WetPaperKernel,
  a: number,
  b: number,
  q: number,
  linkIndex: number,
  forward: LinkGeometry,
  backward: LinkGeometry,
): void {
  const rhoDry = kernel.rhoDry;
  const wetA = state.wetNext[a] as number;
  const wetB = state.wetNext[b] as number;
  forward.base = 0;
  forward.advect = 0;
  forward.slope = 0;
  forward.carry = 0;
  backward.base = 0;
  backward.advect = 0;
  backward.slope = 0;
  backward.carry = 0;
  if (wetA > rhoDry && wetB > rhoDry) {
    const diffusion = kernel.pigmentDiffusion * (LINK_W[q] as number)
      * (1 - (state.kappa[linkIndex] as number)) * kernel.invGref;
    forward.base = diffusion;
    backward.base = diffusion;
    if (q < 5) {
      const normal = 0.5 * (
        ((state.ux[a] as number) + (state.ux[b] as number)) * (CX[q] as number)
        + ((state.uy[a] as number) + (state.uy[b] as number)) * (CY[q] as number)
      );
      if (normal > 0) forward.advect = normal;
      else backward.advect = -normal;
      // 가장자리 이동: 젖은 영역 안쪽 → 마른 셀에 가까운 쪽(마르는 전선으로 안료가 모인다). 물 두께 비가 아니라
      // 3×3 젖음 비율(거시 마스크)의 차이를 따르므로 워시 안쪽에서는 0이다(Curtis의 흐린 젖음 마스크 기울기).
      const edge = kernel.edgeDrift * ((state.wetFraction[a] as number) - (state.wetFraction[b] as number));
      if (edge > 0) forward.base += edge;
      else backward.base -= edge;
      const slope = (state.height[a] as number) - (state.height[b] as number);
      if (slope > 0) forward.slope = slope;
      else backward.slope = -slope;
    }
  }
  // 모세관 운반: 물 패스가 저장한 링크 플럭스(b → a가 양수)를 그대로 읽는다.
  const flux = state.capillaryFlux[linkIndex] as number;
  if (flux < 0) {
    const donor = (state.wsCur[a] as number) + (state.rhoCur[a] as number) + (state.sCur[a] as number);
    forward.carry = (kernel.capillaryCarry * -flux) / (donor + 1e-6);
  } else if (flux > 0) {
    const donor = (state.wsCur[b] as number) + (state.rhoCur[b] as number) + (state.sCur[b] as number);
    backward.carry = (kernel.capillaryCarry * flux) / (donor + 1e-6);
  }
}

function speciesFraction(geometry: LinkGeometry, mobility: number, grainDrift: number, cap: number): number {
  const out = geometry.base + mobility * (geometry.advect + geometry.carry) + grainDrift * geometry.slope;
  return out > cap ? cap : out;
}

/**
 * B0: 처리 대상 셀의 3×3 젖음 비율. 처리 대상이 아닌 타일의 셀은 마른 상태(wetNext 0)라 그대로 읽어도 된다.
 */
function computeWetFraction(state: WetPaperState, kernel: WetPaperKernel): void {
  const { width, tilesX } = state.grid;
  const wetNext = state.wetNext;
  const wetFraction = state.wetFraction;
  const rhoDry = kernel.rhoDry;
  for (let listIndex = 0; listIndex < state.processCount; listIndex += 1) {
    const tile = state.processList[listIndex] as number;
    const tileX = tile % tilesX;
    const tileY = (tile - tileX) / tilesX;
    const x0 = tileX * WET_PAPER_TILE;
    const y0 = tileY * WET_PAPER_TILE;
    for (let y = y0; y < y0 + WET_PAPER_TILE; y += 1) {
      for (let x = x0; x < x0 + WET_PAPER_TILE; x += 1) {
        const i = y * width + x;
        let count = 0;
        for (let dy = -width; dy <= width; dy += width) {
          if ((wetNext[i + dy - 1] as number) > rhoDry) count += 1;
          if ((wetNext[i + dy] as number) > rhoDry) count += 1;
          if ((wetNext[i + dy + 1] as number) > rhoDry) count += 1;
        }
        wetFraction[i] = count / 9;
      }
    }
  }
}

/** B1: 처리 대상 셀이 소유한 링크의 두 방향 유출 비율(종별)을 계산해 저장한다. */
function computePigmentLinks(state: WetPaperState, kernel: WetPaperKernel): void {
  const { width, cells, tilesX } = state.grid;
  const linkOutF = state.linkOutF;
  const linkOutB = state.linkOutB;
  const wall = state.wall;
  const wetNext = state.wetNext;
  const capillaryFlux = state.capillaryFlux;
  const rhoDry = kernel.rhoDry;
  const species0 = kernel.species[0];
  const species1 = kernel.species[1];
  const speciesStride = WET_PAPER_LINK_CLASSES * cells;
  for (let q = 0; q < 9; q += 1) {
    NEIGHBOR_OFFSET[q] = (CY[q] as number) * width + (CX[q] as number);
    CLASS_OFFSET[q] = (LINK_CLASS[q] as number) * cells;
  }
  for (let listIndex = 0; listIndex < state.processCount; listIndex += 1) {
    const tile = state.processList[listIndex] as number;
    const tileX = tile % tilesX;
    const tileY = (tile - tileX) / tilesX;
    const x0 = tileX * WET_PAPER_TILE;
    const y0 = tileY * WET_PAPER_TILE;
    for (let y = y0; y < y0 + WET_PAPER_TILE; y += 1) {
      for (let x = x0; x < x0 + WET_PAPER_TILE; x += 1) {
        const i = y * width + x;
        const wetHere = (wetNext[i] as number) > rhoDry;
        for (let slot = 0; slot < 4; slot += 1) {
          const q = OWNED_DIRECTIONS[slot] as number;
          const linkIndex = (CLASS_OFFSET[q] as number) + i;
          const n = i + (NEIGHBOR_OFFSET[q] as number);
          if (
            wall[n] === 1
            || (!(wetHere && (wetNext[n] as number) > rhoDry) && (capillaryFlux[linkIndex] as number) === 0)
          ) {
            // 벽이거나, 두 셀 중 하나라도 마르고 모세관 물도 흐르지 않으면 이 링크로는 안료가 움직이지 않는다.
            linkOutF[linkIndex] = 0;
            linkOutB[linkIndex] = 0;
            linkOutF[speciesStride + linkIndex] = 0;
            linkOutB[speciesStride + linkIndex] = 0;
            continue;
          }
          measureLink(state, kernel, i, n, q, linkIndex, FORWARD_GEOMETRY, BACKWARD_GEOMETRY);
          const cap = q < 5 ? FACE_CAP : DIAGONAL_CAP;
          linkOutF[linkIndex] = speciesFraction(FORWARD_GEOMETRY, species0.mobility, species0.grainDrift, cap);
          linkOutB[linkIndex] = speciesFraction(BACKWARD_GEOMETRY, species0.mobility, species0.grainDrift, cap);
          if (species1.active) {
            linkOutF[speciesStride + linkIndex] =
              speciesFraction(FORWARD_GEOMETRY, species1.mobility, species1.grainDrift, cap);
            linkOutB[speciesStride + linkIndex] =
              speciesFraction(BACKWARD_GEOMETRY, species1.mobility, species1.grainDrift, cap);
          }
        }
      }
    }
  }
}

/** B2 + 흡착·탈착·지연 경화 + 타일 젖음 표시. */
function gatherPigment(state: WetPaperState, kernel: WetPaperKernel): void {
  const { width, cells, tilesX } = state.grid;
  const gCur = state.gCur;
  const gNext = state.gNext;
  const dep = state.dep;
  const fix = state.fix;
  const linkOutF = state.linkOutF;
  const linkOutB = state.linkOutB;
  const rhoDry = kernel.rhoDry;
  const step = state.stepIndex;
  const speciesStride = WET_PAPER_LINK_CLASSES * cells;
  const speciesCount = kernel.species[1].active ? 2 : 1;
  for (let listIndex = 0; listIndex < state.processCount; listIndex += 1) {
    const tile = state.processList[listIndex] as number;
    const tileX = tile % tilesX;
    const tileY = (tile - tileX) / tilesX;
    const x0 = tileX * WET_PAPER_TILE;
    const y0 = tileY * WET_PAPER_TILE;
    let tileActive = false;
    for (let y = y0; y < y0 + WET_PAPER_TILE; y += 1) {
      for (let x = x0; x < x0 + WET_PAPER_TILE; x += 1) {
        const i = y * width + x;
        const water = state.wetNext[i] as number;
        const wet = water >= rhoDry;
        if (wet) {
          const dryAt = state.dryStep[i] as number;
          if (dryAt >= 0 && step - dryAt >= kernel.cureSteps) {
            // 지연 경화: 오래 말라 있던 셀이 다시 젖는 순간, 들릴 수 있는 침착분의 (1 − rewet)를 고정한다.
            for (let species = 0; species < speciesCount; species += 1) {
              const index = species * cells + i;
              const deposited = dep[index] as number;
              if (deposited <= 0) continue;
              fix[index] = (fix[index] as number) + deposited * (1 - kernel.rewet);
              dep[index] = deposited * kernel.rewet;
            }
          }
          state.dryStep[i] = -1;
        } else if ((state.dryStep[i] as number) === -1) {
          state.dryStep[i] = step;
        }
        if (water + (state.sNext[i] as number) > 0) tileActive = true;
        for (let species = 0; species < speciesCount; species += 1) {
          const speciesKernel = kernel.species[species as 0 | 1];
          const linkBase = species * speciesStride;
          const base = species * cells;
          let outTotal = 0;
          let inflow = 0;
          // 처리 대상 셀은 벽 안쪽이라 8이웃이 항상 격자 안이다(벽 링크의 비율은 0).
          for (let q = 1; q < 9; q += 1) {
            const n = i + (NEIGHBOR_OFFSET[q] as number);
            if (FORWARD[q] === 1) {
              const linkIndex = linkBase + (CLASS_OFFSET[q] as number) + i;
              outTotal += linkOutF[linkIndex] as number;
              inflow += (linkOutB[linkIndex] as number) * (gCur[base + n] as number);
            } else {
              const linkIndex = linkBase + (CLASS_OFFSET[q] as number) + n;
              outTotal += linkOutB[linkIndex] as number;
              inflow += (linkOutF[linkIndex] as number) * (gCur[base + n] as number);
            }
          }
          let suspended = (gCur[base + i] as number) * (1 - outTotal) + inflow;
          if (suspended < 0) suspended = 0;
          let deposited = dep[base + i] as number;
          let fixed = fix[base + i] as number;
          if (!wet) {
            // 마른 셀: 남은 부유 안료는 모두 종이에 앉는다(착색분은 바로 고정).
            if (suspended > 0) {
              fixed += suspended * speciesKernel.staining;
              deposited += suspended * (1 - speciesKernel.staining);
              suspended = 0;
            }
          } else {
            const wetness = water >= kernel.depthRef ? 1 : water / kernel.depthRef;
            if (deposited > 0 && speciesKernel.liftRate > 0) {
              let lift = speciesKernel.liftRate * wetness;
              if (lift > 0.5) lift = 0.5;
              const lifted = deposited * lift;
              deposited -= lifted;
              suspended += lifted;
            }
            if (suspended > 0) {
              const paperHeight = state.height[i] as number;
              const velocityX = state.ux[i] as number;
              const velocityY = state.uy[i] as number;
              let speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY) / kernel.captureSpeedRef;
              if (speed > 1) speed = 1;
              const thin = 1 - wetness;
              let rate = speciesKernel.settleRate
                * (1 + kernel.granulationGain * speciesKernel.granulation * (1 - paperHeight))
                + kernel.dryingCapture * thin * thin
                + kernel.fiberCapture * (state.fiber[i] as number) * (0.25 + 0.75 * speed);
              if (rate > 0.9) rate = 0.9;
              const settled = suspended * rate;
              suspended -= settled;
              fixed += settled * speciesKernel.staining;
              deposited += settled * (1 - speciesKernel.staining);
            }
            if (suspended > 0) tileActive = true;
          }
          gNext[base + i] = suspended;
          dep[base + i] = deposited;
          fix[base + i] = fixed;
        }
      }
    }
    state.tileWet[tile] = tileActive ? 1 : 0;
  }
}

/** 안료 패스 한 번(활성 종 전부 + 지연 경화 + 타일 젖음). */
export function stepWetPaperPigment(state: WetPaperState, kernel: WetPaperKernel): void {
  computeWetFraction(state, kernel);
  computePigmentLinks(state, kernel);
  gatherPigment(state, kernel);
}
