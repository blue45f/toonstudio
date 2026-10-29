/**
 * 물 패스(스텝의 앞 절반): MoXi 흐름층 LBM + Curtis 표면·모세관 층 교환 + 가장자리 가중 증발.
 *
 * 셀마다 이전 버퍼(Cur)에서 이웃을 모아(gather) 다음 버퍼(Next)에 쓴다. 그래서 타일·셀 순회 순서와 무관하다.
 * 링크 플럭스(모세관 물)는 링크 소유 셀이 한 번만 계산해 저장하고(A0) 양 끝이 같은 값을 읽으므로(A1) 물 총량이
 * 정확히 보존된다(증발·잔량 접힘만 장부에 빠진다).
 *
 * 1) 흐름층: 다공성 부분 bounce-back 스트리밍(링크 κ = 1 − (1 − κ_종이)·φ(ρ̄)), 젖음 전선 고정(한쪽이 마르고
 *    젖은 쪽 밀도가 ρ_pin = pin·(0.3 + κ_종이)보다 낮으면 링크를 완전히 막는다 — 섬유를 따라서는 문턱이 낮아
 *    전선이 섬유를 타고 나아간다), 체적 가속(모세관 흡입 −k_c∇(s/c), 종이 기울기 −k_h∇h, 가장자리 바깥 흐름
 *    −η∇χ(χ = 젖음 지시값)), BGK 충돌(τ = 1, 평형 속도에 힘 이동 τ·a).
 * 2) 표면층: 상한 초과분은 흐름층으로, 흡수(seep)는 흡수율·(1 − s/c)에 비례해 모세관(β)과 흐름층(1 − β)으로.
 * 3) 모세관층: 문턱 이상 포화에서만 8링크 확산(섬유 전도율 1 − κ, 링크당 기증 10% 상한 → 양수 보장).
 * 4) 증발: 젖음 전선(이웃이 덜 젖은 셀)에서 1 + edgeBoost·front 배 — Curtis 가장자리 짙어짐의 물 쪽 원인.
 *
 * 성능: 처리 대상은 `prepareWetPaperStep`이 고른 타일뿐이다(바깥 벽 한 겹 안쪽이라 8이웃이 항상 격자 안).
 * 셀 자신과 8이웃이 모두 말라 있으면 계산 없이 0을 쓴다(그 셀의 스텝은 항등이다).
 */

import {
  WET_PAPER_LBM_CX,
  WET_PAPER_LBM_CY,
  WET_PAPER_LBM_OPP,
  WET_PAPER_LINK_CLASS,
  WET_PAPER_LINK_DIFFUSION_WEIGHT,
  WET_PAPER_LINK_FORWARD,
} from "./studio-wet-paper-lbm";
import { WET_PAPER_TILE } from "./studio-wet-paper-state";

import type { WetPaperKernel } from "./studio-wet-paper-kernel";
import type { WetPaperState } from "./studio-wet-paper-state";

// 핫 루프용 지역 복사본(가져온 바인딩 접근 비용 제거).
const CX = Int32Array.from(WET_PAPER_LBM_CX);
const CY = Int32Array.from(WET_PAPER_LBM_CY);
const OPP = Int32Array.from(WET_PAPER_LBM_OPP);
const LINK_CLASS = Int32Array.from(WET_PAPER_LINK_CLASS);
const FORWARD = Uint8Array.from(WET_PAPER_LINK_FORWARD);
const LINK_W = Float64Array.from(WET_PAPER_LINK_DIFFUSION_WEIGHT);
/** 링크 소유 셀이 계산하는 전방 방향(E, S, SE, NE). */
const OWNED_DIRECTIONS = Int32Array.of(1, 2, 5, 8);
/** 방향별 이웃 오프셋(dy·width + dx)과 링크 클래스 오프셋(class·cells) — 호출마다 격자 크기로 채운다. */
const NEIGHBOR_OFFSET = new Int32Array(9);
const CLASS_OFFSET = new Int32Array(9);

function fillOffsets(width: number, cells: number): void {
  for (let q = 0; q < 9; q += 1) {
    NEIGHBOR_OFFSET[q] = (CY[q] as number) * width + (CX[q] as number);
    CLASS_OFFSET[q] = (LINK_CLASS[q] as number) * cells;
  }
}

/**
 * 링크(소유 셀 owner ↔ 이웃 neighbor)의 모세관 물 플럭스(이웃 → 소유 셀이 양수). 링크당 한 번만 계산한다.
 * 문턱(용량 대비 포화)을 넘는 쪽이 있을 때만 흐르고, 링크당 기증 셀 물의 10%로 묶는다. 벽 셀과는 흐르지 않는다.
 */
export function wetPaperCapillaryLinkFlux(
  state: WetPaperState,
  owner: number,
  neighbor: number,
  linkWeight: number,
  kappa: number,
  kernel: WetPaperKernel,
): number {
  const sOwner = state.sCur[owner] as number;
  const sNeighbor = state.sCur[neighbor] as number;
  if (sOwner <= 0 && sNeighbor <= 0) return 0;
  if (state.wall[neighbor] === 1 || state.wall[owner] === 1) return 0;
  const thetaOwner = sOwner * (state.invCapacity[owner] as number);
  const thetaNeighbor = sNeighbor * (state.invCapacity[neighbor] as number);
  if (!((thetaOwner > thetaNeighbor ? thetaOwner : thetaNeighbor) > kernel.capillaryThreshold)) return 0;
  const conductance = kernel.capillaryDiffusion * linkWeight * (1 - kappa)
    * (0.5 * ((state.capacity[owner] as number) + (state.capacity[neighbor] as number)));
  let flux = conductance * (thetaNeighbor - thetaOwner);
  if (flux > 0) {
    const limit = 0.1 * sNeighbor;
    if (flux > limit) flux = limit;
  } else {
    const limit = -0.1 * sOwner;
    if (flux < limit) flux = limit;
  }
  return flux;
}

/** A0: 처리 대상 셀이 소유한 링크의 모세관 플럭스를 한 번씩 계산해 저장한다. */
function computeCapillaryLinks(state: WetPaperState, kernel: WetPaperKernel): void {
  const { width, tilesX } = state.grid;
  const flux = state.capillaryFlux;
  const kappa = state.kappa;
  for (let listIndex = 0; listIndex < state.processCount; listIndex += 1) {
    const tile = state.processList[listIndex] as number;
    const tileX = tile % tilesX;
    const tileY = (tile - tileX) / tilesX;
    const x0 = tileX * WET_PAPER_TILE;
    const y0 = tileY * WET_PAPER_TILE;
    for (let y = y0; y < y0 + WET_PAPER_TILE; y += 1) {
      for (let x = x0; x < x0 + WET_PAPER_TILE; x += 1) {
        const i = y * width + x;
        for (let slot = 0; slot < 4; slot += 1) {
          const q = OWNED_DIRECTIONS[slot] as number;
          const linkIndex = (CLASS_OFFSET[q] as number) + i;
          flux[linkIndex] = wetPaperCapillaryLinkFlux(
            state,
            i,
            i + (NEIGHBOR_OFFSET[q] as number),
            LINK_W[q] as number,
            kappa[linkIndex] as number,
            kernel,
          );
        }
      }
    }
  }
}

/**
 * 물 패스 한 번(처리 대상 타일 전부). `evaporationScale`은 건조 가속 배율(스텝 번호의 결정적 함수).
 * 반환값: 이번 스텝 증발량.
 */
export function stepWetPaperWater(
  state: WetPaperState,
  kernel: WetPaperKernel,
  evaporationScale: number,
): number {
  const { width, cells, tilesX } = state.grid;
  fillOffsets(width, cells);
  computeCapillaryLinks(state, kernel);
  const fCur = state.fCur;
  const fNext = state.fNext;
  const rhoCur = state.rhoCur;
  const rhoNext = state.rhoNext;
  const wsCur = state.wsCur;
  const wsNext = state.wsNext;
  const sCur = state.sCur;
  const sNext = state.sNext;
  const wetNext = state.wetNext;
  const wetMax = state.wetMax;
  const ux = state.ux;
  const uy = state.uy;
  const kappa = state.kappa;
  const wall = state.wall;
  const capacity = state.capacity;
  const invCapacity = state.invCapacity;
  const absorb = state.absorb;
  const paperHeight = state.height;
  const capillaryFlux = state.capillaryFlux;
  const halfInvRhoFull = 0.5 / kernel.rhoFull;
  const rhoDry = kernel.rhoDry;
  const pinThreshold = kernel.pinThreshold;
  const sigma = kernel.surfaceTension;
  const uMax = kernel.uMax;
  const u2Max = uMax * uMax;
  const aMax = kernel.aMax;
  const indicatorFull = kernel.blurFull;
  const indicatorScale = 1 / indicatorFull;
  const offsetSW = NEIGHBOR_OFFSET[6] as number;
  const offsetNW = NEIGHBOR_OFFSET[7] as number;
  let evaporated = 0;

  for (let listIndex = 0; listIndex < state.processCount; listIndex += 1) {
    const tile = state.processList[listIndex] as number;
    const tileX = tile % tilesX;
    const tileY = (tile - tileX) / tilesX;
    const x0 = tileX * WET_PAPER_TILE;
    const y0 = tileY * WET_PAPER_TILE;
    for (let y = y0; y < y0 + WET_PAPER_TILE; y += 1) {
      for (let x = x0; x < x0 + WET_PAPER_TILE; x += 1) {
        const i = y * width + x;
        const east = i + 1;
        const west = i - 1;
        const south = i + width;
        const north = i - width;

        // 셀과 8이웃이 모두 말랐으면 이 셀의 스텝은 항등(0)이다.
        let neighborhoodWater = (rhoCur[i] as number) + (wsCur[i] as number) + (sCur[i] as number);
        for (let q = 1; q < 9 && neighborhoodWater <= 0; q += 1) {
          const n = i + (NEIGHBOR_OFFSET[q] as number);
          neighborhoodWater += (rhoCur[n] as number) + (wsCur[n] as number) + (sCur[n] as number);
        }
        if (!(neighborhoodWater > 0)) {
          for (let q = 0; q < 9; q += 1) fNext[q * cells + i] = 0;
          rhoNext[i] = 0;
          wsNext[i] = 0;
          sNext[i] = 0;
          wetNext[i] = 0;
          ux[i] = 0;
          uy[i] = 0;
          continue;
        }
        const rhoHere = rhoCur[i] as number;

        // (1) 스트리밍: 상류 셀 up = i − c_q. 벽이면 완전 bounce-back.
        let rho1 = fCur[i] as number;
        let jx = 0;
        let jy = 0;
        for (let q = 1; q < 9; q += 1) {
          const bounced = fCur[(OPP[q] as number) * cells + i] as number;
          const up = i - (NEIGHBOR_OFFSET[q] as number);
          let value = bounced;
          if (wall[up] === 0) {
            const kappaPaper = kappa[(CLASS_OFFSET[q] as number) + (FORWARD[q] === 1 ? up : i)] as number;
            const rhoUp = rhoCur[up] as number;
            let linkKappa = kappaPaper;
            if (
              (rhoUp < rhoHere ? rhoUp : rhoHere) < rhoDry
              && (rhoUp < rhoHere ? rhoHere : rhoUp) < pinThreshold * (0.3 + kappaPaper)
            ) {
              // 젖음 전선 고정: 마른 쪽으로 넘어갈 만큼 물이 차지 않았다.
              linkKappa = 1;
            } else {
              const fill = (rhoUp + rhoHere) * halfInvRhoFull;
              if (fill < 1) linkKappa = 1 - (1 - kappaPaper) * (fill * (1 - sigma + sigma * fill));
            }
            value = (1 - linkKappa) * (fCur[q * cells + up] as number) + linkKappa * bounced;
          }
          rho1 += value;
          jx += (CX[q] as number) * value;
          jy += (CY[q] as number) * value;
        }

        // (2) 체적 가속: 모세관 흡입, 종이 기울기(골로), 가장자리 바깥 흐름(젖음 지시값 기울기 반대).
        const wetE = (wsCur[east] as number) + (rhoCur[east] as number);
        const wetW = (wsCur[west] as number) + (rhoCur[west] as number);
        const wetS = (wsCur[south] as number) + (rhoCur[south] as number);
        const wetN = (wsCur[north] as number) + (rhoCur[north] as number);
        const chiE = wetE >= indicatorFull ? 1 : wetE * indicatorScale;
        const chiW = wetW >= indicatorFull ? 1 : wetW * indicatorScale;
        const chiS = wetS >= indicatorFull ? 1 : wetS * indicatorScale;
        const chiN = wetN >= indicatorFull ? 1 : wetN * indicatorScale;
        let ax = -kernel.capillaryForce * 0.5 * (
          (sCur[east] as number) * (invCapacity[east] as number)
          - (sCur[west] as number) * (invCapacity[west] as number)
        )
          - kernel.slopeForce * 0.5 * ((paperHeight[east] as number) - (paperHeight[west] as number))
          - kernel.edgeFlow * 0.5 * (chiE - chiW);
        let ay = -kernel.capillaryForce * 0.5 * (
          (sCur[south] as number) * (invCapacity[south] as number)
          - (sCur[north] as number) * (invCapacity[north] as number)
        )
          - kernel.slopeForce * 0.5 * ((paperHeight[south] as number) - (paperHeight[north] as number))
          - kernel.edgeFlow * 0.5 * (chiS - chiN);
        const a2 = ax * ax + ay * ay;
        if (a2 > aMax * aMax) {
          const scale = aMax / Math.sqrt(a2);
          ax *= scale;
          ay *= scale;
        }

        // (3) 속도(이류용 거시 속도 u = j/ρ + a/2, 평형용 u_eq = j/ρ + τa) — 마하 상한.
        let velocityX = 0;
        let velocityY = 0;
        let eqX = 0;
        let eqY = 0;
        if (rho1 > 1e-7) {
          const inv = 1 / rho1;
          velocityX = jx * inv + 0.5 * ax;
          velocityY = jy * inv + 0.5 * ay;
          eqX = jx * inv + ax;
          eqY = jy * inv + ay;
          const m1 = velocityX * velocityX + velocityY * velocityY;
          if (m1 > u2Max) {
            const scale = uMax / Math.sqrt(m1);
            velocityX *= scale;
            velocityY *= scale;
          }
          const m2 = eqX * eqX + eqY * eqY;
          if (m2 > u2Max) {
            const scale = uMax / Math.sqrt(m2);
            eqX *= scale;
            eqY *= scale;
          }
        }

        // (4) 모세관층 확산: 링크 플럭스(A0)를 모은다. 전방 링크는 내 값, 후방 링크는 이웃 값의 반대.
        let s1 = (sCur[i] as number)
          + (capillaryFlux[(CLASS_OFFSET[1] as number) + i] as number)
          + (capillaryFlux[(CLASS_OFFSET[2] as number) + i] as number)
          + (capillaryFlux[(CLASS_OFFSET[5] as number) + i] as number)
          + (capillaryFlux[(CLASS_OFFSET[8] as number) + i] as number)
          - (capillaryFlux[(CLASS_OFFSET[3] as number) + west] as number)
          - (capillaryFlux[(CLASS_OFFSET[4] as number) + north] as number)
          - (capillaryFlux[(CLASS_OFFSET[6] as number) + i + offsetSW] as number)
          - (capillaryFlux[(CLASS_OFFSET[7] as number) + i + offsetNW] as number);

        // (5) 표면층: 상한 초과분 → 흐름층, 흡수 → 모세관(β)·흐름층(1 − β).
        const capHere = capacity[i] as number;
        const invCapHere = invCapacity[i] as number;
        const absorbHere = absorb[i] as number;
        let ws = wsCur[i] as number;
        let flowAdd = 0;
        if (ws > kernel.surfaceCap) {
          flowAdd += ws - kernel.surfaceCap;
          ws = kernel.surfaceCap;
        }
        if (ws > 0) {
          let fraction = kernel.seepRate * absorbHere * (1 - s1 * invCapHere);
          if (fraction < 0) fraction = 0;
          if (fraction > 1) fraction = 1;
          const seep = ws * fraction;
          let toCapillary = kernel.seepSplit * seep;
          const room = capHere - s1;
          if (toCapillary > room) toCapillary = room > 0 ? room : 0;
          s1 += toCapillary;
          flowAdd += seep - toCapillary;
          ws -= seep;
        }
        // 흐름층 물이 덜 찬 섬유로 스며든다(종이가 마신다).
        let absorbed = 0;
        if (rho1 > 0 && s1 < capHere) {
          absorbed = kernel.flowAbsorb * absorbHere * (1 - s1 * invCapHere) * rho1;
          const room = capHere - s1;
          if (absorbed > room) absorbed = room;
          if (absorbed > rho1) absorbed = rho1;
          s1 += absorbed;
        }

        // (6) 증발: 젖음 전선 가중(이전 스텝 젖음 기준, 4면 이웃).
        const wetPrev = (wsCur[i] as number) + rhoHere;
        let front = 0;
        if (wetPrev > rhoDry) {
          const inv = 1 / (wetPrev + 1e-6);
          front = 1 - wetE * inv;
          const dW = 1 - wetW * inv;
          if (dW > front) front = dW;
          const dS = 1 - wetS * inv;
          if (dS > front) front = dS;
          const dN = 1 - wetN * inv;
          if (dN > front) front = dN;
          if (front < 0) front = 0;
          if (front > 1) front = 1;
        }
        const boost = (1 + kernel.edgeBoost * front) * evaporationScale;
        let evapSurface = kernel.evapSurface * boost;
        if (evapSurface > ws) evapSurface = ws;
        ws -= evapSurface;
        const flowTotal = rho1 - absorbed + flowAdd;
        let evapFlow = kernel.evapFlow * boost;
        if (evapFlow > flowTotal) evapFlow = flowTotal;
        let target = flowTotal - evapFlow;
        let evapCapillary = 0;
        if (ws <= 0 && target < rhoDry && s1 > 0) {
          evapCapillary = kernel.evapCapillary * boost;
          if (evapCapillary > s1) evapCapillary = s1;
          s1 -= evapCapillary;
        }
        evaporated += evapSurface + evapFlow + evapCapillary;

        // 잔량 접힘: 물이 거의 없으면 0으로 접고 장부에 증발로 기록한다.
        if (ws + target + s1 < kernel.waterEps) {
          evaporated += ws + target + s1;
          ws = 0;
          target = 0;
          s1 = 0;
        }

        // (7) 충돌(BGK τ = 1) + 질량 조정: f_out = f_eq·k, 나머지는 정지 분포에 더한다(9방향 전개).
        const keep = rho1 > 0 ? (target < rho1 ? target / rho1 : 1) : 0;
        const scaledRho = rho1 * keep;
        const face = scaledRho / 9;
        const diagonal = scaledRho / 36;
        const usq = 1.5 * (eqX * eqX + eqY * eqY);
        const base = 1 - usq;
        const cuE = 3 * eqX;
        const cuS = 3 * eqY;
        const cuSE = 3 * (eqX + eqY);
        const cuNE = 3 * (eqX - eqY);
        const f0 = (4 / 9) * scaledRho * base;
        const fE = face * (base + cuE + 0.5 * cuE * cuE);
        const fW = face * (base - cuE + 0.5 * cuE * cuE);
        const fS = face * (base + cuS + 0.5 * cuS * cuS);
        const fN = face * (base - cuS + 0.5 * cuS * cuS);
        const fSE = diagonal * (base + cuSE + 0.5 * cuSE * cuSE);
        const fNW = diagonal * (base - cuSE + 0.5 * cuSE * cuSE);
        const fNE = diagonal * (base + cuNE + 0.5 * cuNE * cuNE);
        const fSW = diagonal * (base - cuNE + 0.5 * cuNE * cuNE);
        const remainder = target - (f0 + fE + fS + fW + fN + fSE + fSW + fNW + fNE);
        const rest = f0 + remainder;
        fNext[i] = rest > 0 ? rest : 0;
        fNext[cells + i] = fE;
        fNext[2 * cells + i] = fS;
        fNext[3 * cells + i] = fW;
        fNext[4 * cells + i] = fN;
        fNext[5 * cells + i] = fSE;
        fNext[6 * cells + i] = fSW;
        fNext[7 * cells + i] = fNW;
        fNext[8 * cells + i] = fNE;
        rhoNext[i] = target;
        wsNext[i] = ws;
        sNext[i] = s1;
        const wetness = ws + target;
        wetNext[i] = wetness;
        if (wetness > (wetMax[i] as number)) wetMax[i] = wetness;
        ux[i] = target > 0 ? velocityX : 0;
        uy[i] = target > 0 ? velocityY : 0;
      }
    }
  }
  return evaporated;
}
