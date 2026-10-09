import type { OneEuroParams } from "./one-euro";

/**
 * 안정화 슬라이더(0..100) → Sumi 1€ 위치 필터 파라미터의 로그 매핑.
 *
 * 선형 매핑(minCutoff 3.0→0.5, β 0.05→0.005)은 슬라이더가 0이어도 손떨림 지터가 raw의 절반 가까이 남아 '끔'이 되지 않았다
 * (SP-C 실측: s=0에서도 지터 0.335 px). 차단 주파수와 속도 계수는 몇 배씩 바뀌는 양이라 로그 보간이 감각과 맞고,
 * 양 끝을 '사실상 raw'(30 Hz)와 '강한 평활'(0.4 Hz)로 잡으면 슬라이더 0이 정말 꺼진 것처럼 동작한다.
 *
 *   u = s / 100
 *   minCutoff = 30 · (0.4 / 30)^u      (30 Hz → 0.4 Hz)
 *   β         = 0.12 · (0.006 / 0.12)^u (0.12 → 0.006)
 *   dCutoff   = 1 Hz (고정)
 *
 * SP-C 실측(512², Node 22 단일 스레드): 저속 지터 0.738 → 0.112 px 단조 감소, 추적 지연 1.7 → 15.3 ms.
 * 이 함수는 순수 함수이며 시계·난수·DOM 전역을 쓰지 않는다.
 */

/** 슬라이더 0(끔)의 minCutoff(Hz). 240 Hz 입력에서 필터 지연이 1 ms대라 사실상 raw다. */
export const STABILIZER_MIN_CUTOFF_OFF_HZ = 30;
/** 슬라이더 100(최대)의 minCutoff(Hz). */
export const STABILIZER_MIN_CUTOFF_MAX_HZ = 0.4;
/** 슬라이더 0(끔)의 β(속도 계수). */
export const STABILIZER_BETA_OFF = 0.12;
/** 슬라이더 100(최대)의 β. */
export const STABILIZER_BETA_MAX = 0.006;
/** 1€ 속도 필터 차단 주파수(Hz). 슬라이더와 무관하게 고정한다. */
export const STABILIZER_D_CUTOFF_HZ = 1;

/** 슬라이더 값을 0..100으로 가둔다. 유한하지 않은 값(NaN·±Infinity)은 0(끔)으로 본다. */
export function clampStabilizerPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return pct < 0 ? 0 : pct > 100 ? 100 : pct;
}

/** 로그 보간 a·(b/a)^u. 끝점(u=0, u=1)에서 정확히 a·b가 되도록 지수 형태가 아니라 곱셈 형태를 쓴다. */
function logLerp(a: number, b: number, u: number): number {
  if (u <= 0) return a;
  if (u >= 1) return b;
  return a * Math.pow(b / a, u);
}

/** 안정화 슬라이더(0..100) → 위치 1€ 파라미터. 범위 밖 값은 가두어 처리한다. */
export function stabilizerPctToOneEuro(pct: number): OneEuroParams {
  const u = clampStabilizerPct(pct) / 100;
  return {
    minCutoff: logLerp(STABILIZER_MIN_CUTOFF_OFF_HZ, STABILIZER_MIN_CUTOFF_MAX_HZ, u),
    beta: logLerp(STABILIZER_BETA_OFF, STABILIZER_BETA_MAX, u),
    dCutoff: STABILIZER_D_CUTOFF_HZ,
  };
}

/** 끈 당김(lazy-brush) 끈 길이 로그 매핑의 양 끝(px). 슬라이더 0은 끈 없음(0 px)이다. */
export const LAZY_RADIUS_MIN_PX = 0.5;
export const LAZY_RADIUS_MAX_PX = 48;

/**
 * 끈 당김 슬라이더(0..100) → 끈 길이(px). 0이면 정확히 0(끈 없음 = raw),
 * 0 초과면 0.5 px부터 48 px까지 로그 보간한다. 선형 매핑은 s≈6에서 이미 손떨림 억제가 포화돼 대부분 구간이 과평활이었다.
 */
export function lazyRadiusPxFromPct(pct: number): number {
  const s = clampStabilizerPct(pct);
  if (s <= 0) return 0;
  return logLerp(LAZY_RADIUS_MIN_PX, LAZY_RADIUS_MAX_PX, s / 100);
}

/** 물리 펜 추적 지연 로그 매핑의 양 끝(ms). */
export const PEN_LAG_MIN_MS = 8;
export const PEN_LAG_MAX_MS = 60;

/**
 * 물리 펜 슬라이더(0..100) → 추적 지연(ms, 지면 항력/스프링 상수 = λ/k). 0이면 최소 지연(8 ms)으로 사실상 따라붙고,
 * 100이면 60 ms 끌린다. 지연이 서브스텝(1/240 s ≈ 4.2 ms)에 가까워지면 이산 모델이 요청한 지연을 낼 수 없어(`penSpringParams`가 ωn을 가둔다) 하한을 둔다.
 */
export function penLagMsFromPct(pct: number): number {
  return logLerp(PEN_LAG_MIN_MS, PEN_LAG_MAX_MS, clampStabilizerPct(pct) / 100);
}
