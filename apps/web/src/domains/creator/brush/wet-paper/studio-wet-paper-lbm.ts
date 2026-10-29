/**
 * D2Q9 격자 볼츠만 상수와 평형 분포(MoXi 흐름층).
 *
 * 방향 번호(y는 아래로 증가): 0:(0,0) 1:E(1,0) 2:S(0,1) 3:W(−1,0) 4:N(0,−1) 5:SE(1,1) 6:SW(−1,1)
 * 7:NW(−1,−1) 8:NE(1,−1). 링크 클래스는 전방 링크 E·S·SE·NE 네 가지이고, 링크는 "전방 방향의 출발 셀"
 * 하나가 소유한다(양 끝이 같은 κ를 읽어야 부분 bounce-back이 질량을 보존한다).
 *
 * 다공성 부분 bounce-back(Chu & Tai 2005 개념의 독립 재구현): 링크 차단 κ인 링크를 지나는 분포는
 * (1 − κ)만 건너가고 κ는 제자리로 튕겨 반대 방향 분포가 된다:
 *   f_q(x, t+1) = (1 − κ)·f*_q(x − c_q, t) + κ·f*_opp(q)(x, t).
 * 한 링크의 두 방향이 같은 κ를 쓰면 링크 양쪽 분포 합이 그대로 보존된다.
 */

export const WET_PAPER_LBM_Q = 9;
export const WET_PAPER_LBM_CX = Int32Array.of(0, 1, 0, -1, 0, 1, -1, -1, 1);
export const WET_PAPER_LBM_CY = Int32Array.of(0, 0, 1, 0, -1, 1, 1, -1, -1);
export const WET_PAPER_LBM_OPP = Int32Array.of(0, 3, 4, 1, 2, 7, 8, 5, 6);
export const WET_PAPER_LBM_WEIGHT = Float64Array.of(
  4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36,
);
/** 방향 → 링크 클래스(E 0, S 1, SE 2, NE 3). 후방 방향은 반대 방향의 클래스다. */
export const WET_PAPER_LINK_CLASS = Int32Array.of(0, 0, 1, 0, 1, 2, 3, 2, 3);
/** 방향 q가 전방(E, S, SE, NE)이면 1. 셀 i에서 i + c_q로 가는 링크는 전방이면 i가, 후방이면 이웃이 소유한다. */
export const WET_PAPER_LINK_FORWARD = Uint8Array.of(0, 1, 1, 0, 0, 1, 0, 0, 1);
/** 등방 8링크 확산 가중(면 2/3, 대각 1/6 — D2Q9 가중 비 4 : 1). */
export const WET_PAPER_LINK_DIFFUSION_WEIGHT = Float64Array.of(
  0, 2 / 3, 2 / 3, 2 / 3, 2 / 3, 1 / 6, 1 / 6, 1 / 6, 1 / 6,
);
/** c_s² = 1/3. */
export const WET_PAPER_LBM_CS2 = 1 / 3;

/**
 * 평형 분포 f_q^eq = w_q·ρ·(1 + 3 c·u + 4.5 (c·u)² − 1.5 |u|²) — 배열 out(길이 ≥ 9)에 쓴다.
 */
export function wetPaperLbmEquilibrium(
  rho: number,
  ux: number,
  uy: number,
  out: Float64Array | Float32Array,
): void {
  const usq = 1.5 * (ux * ux + uy * uy);
  for (let q = 0; q < WET_PAPER_LBM_Q; q += 1) {
    const cu = 3 * ((WET_PAPER_LBM_CX[q] ?? 0) * ux + (WET_PAPER_LBM_CY[q] ?? 0) * uy);
    out[q] = (WET_PAPER_LBM_WEIGHT[q] ?? 0) * rho * (1 + cu + 0.5 * cu * cu - usq);
  }
}

/** 분포의 0·1차 모멘트. */
export function wetPaperLbmMoments(f: ArrayLike<number>): { rho: number; jx: number; jy: number } {
  let rho = 0;
  let jx = 0;
  let jy = 0;
  for (let q = 0; q < WET_PAPER_LBM_Q; q += 1) {
    const value = f[q] ?? 0;
    rho += value;
    jx += (WET_PAPER_LBM_CX[q] ?? 0) * value;
    jy += (WET_PAPER_LBM_CY[q] ?? 0) * value;
  }
  return { rho, jx, jy };
}
