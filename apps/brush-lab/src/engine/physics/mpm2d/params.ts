/**
 * 2D MLS-MPM 점탄성 물감 솔버의 파라미터·안정 조건(CFL).
 *
 * 외부 의존 0, 사칙과 `Math.sqrt`만 쓴다. 단위는 px·초·질량(임의)이며 한 입자의 부피는 `spacingPx²`, 질량은 `rho·부피`다.
 *
 * 출처: Hu et al., "A Moving Least Squares Material Point Method with Displacement Discontinuity and Two-Way Rigid Body
 * Coupling", SIGGRAPH 2018의 MLS-MPM P2G/G2P 수식(개념·수식만 재구현, 코드 복제 없음). 점탄성(Maxwell 이완 + 항복)은
 * 편차 변형률 ν = (r − 1/r)/2 (r = 주 신장비)를 ν/(1 + dt/τ)로 이완하고 ν_y로 되돌리는 자체 구성식이다.
 */
import { SumiError } from "../../core/errors";

export interface MpmParams {
  /** 시뮬레이션 영역 폭(px). 종이(캔버스)와 같다. */
  readonly widthPx: number;
  /** 시뮬레이션 영역 높이(px). */
  readonly heightPx: number;
  /** 격자 셀 한 변(px). 영역은 셀 4개 이상이어야 한다. */
  readonly cellPx: number;
  /** 입자 한도. 닿으면 주입을 멈추고 `rejectedCapacity`로 센다(무음 절단 없음). */
  readonly maxParticles: number;
  /** 입자 초기 간격(px). 입자 부피 V0 = spacingPx². */
  readonly spacingPx: number;
  /** 질량 밀도(질량/px²). */
  readonly rho: number;
  /** 체적 탄성 K. 압축파 속도는 sqrt((K + μ)/ρ)다. */
  readonly bulk: number;
  /** 전단 탄성 μ. */
  readonly shear: number;
  /** Maxwell 이완 시간 τ(초). 0 이하면 이완 없음(순수 탄성). 작을수록 묽다. */
  readonly relaxTimeS: number;
  /** 항복 편차 변형률 ν_y. 넘으면 ν_y로 되돌려 되직한 물감처럼 흐른다. */
  readonly yieldStrain: number;
  /** 종이 마찰(전역 선형 항력, 1/초). */
  readonly dragPerS: number;
  /** 서브스텝 dt(초). 프레임이 아니라 이 값이 고정이다(결정성의 전제). */
  readonly dtS: number;
  /** 농도 확산율(1/초): 격자에서 평균낸 농도로 PIC식 블렌드. 0이면 입자 농도는 변하지 않는다. */
  readonly concDiffusionPerS: number;
  /** 벽 접선 마찰(0 = 미끄럼, 1 = 고착). */
  readonly wallFriction: number;
  /** `advanceTo` 한 번에 진행할 수 있는 서브스텝 상한. 넘는 시간은 건너뛰고 `droppedSubsteps`로 센다. */
  readonly maxStepsPerAdvance: number;
}

/** 기본값: K = 6e4, μ = 4e4, 8 서브스텝/프레임(dt ≈ 2.08 ms), 셀 2 px → CFL ≈ 0.33. */
export const MPM_DEFAULTS: Omit<MpmParams, "widthPx" | "heightPx"> = {
  cellPx: 2,
  maxParticles: 20000,
  spacingPx: 1.2,
  rho: 1,
  bulk: 6e4,
  shear: 4e4,
  relaxTimeS: 0.2,
  yieldStrain: 0.5,
  dragPerS: 8,
  dtS: 1 / 60 / 8,
  concDiffusionPerS: 4,
  wallFriction: 0.2,
  maxStepsPerAdvance: 4096,
};

/**
 * CFL 상한. dt·c/dx가 이보다 크면 `cflViolation`이다. 스파이크(SP-B)에서 0.56은 안정, 1.04 이상은 붕괴했다.
 * 안전 여유를 두어 0.6으로 정했고 위반해도 솔버는 던지지 않는다 — 클램프(`clampEvents`)가 붕괴를 가려서 NaN 없이
 * 버티므로, 호출자는 이 값과 `clampEvents`를 함께 감시해야 한다.
 */
export const MPM_CFL_LIMIT = 0.6;

/** 서브스텝 수를 정할 때 쓰는 목표 CFL(상한 0.6보다 한참 낮게 두어 여유를 남긴다). */
export const MPM_CFL_TARGET = 0.35;

/** 압축파 속도(px/초): sqrt((K + μ)/ρ). */
export function mpmWaveSpeed(p: Pick<MpmParams, "bulk" | "shear" | "rho">): number {
  return Math.sqrt((p.bulk + p.shear) / p.rho);
}

/** CFL 수: dt·c/dx. */
export function mpmCfl(p: Pick<MpmParams, "bulk" | "shear" | "rho" | "dtS" | "cellPx">): number {
  return (p.dtS * mpmWaveSpeed(p)) / p.cellPx;
}

/** 프레임 시간 `frameDtS`를 목표 CFL 이하로 나누는 최소 서브스텝 수(정수, 1 이상). */
export function substepsForCfl(
  p: Pick<MpmParams, "bulk" | "shear" | "rho" | "cellPx">,
  frameDtS: number,
  targetCfl = MPM_CFL_TARGET,
): number {
  const dtMax = (targetCfl * p.cellPx) / mpmWaveSpeed(p);
  return Math.max(1, Math.ceil(frameDtS / dtMax));
}

function fail(reason: string, details?: Record<string, unknown>): never {
  throw new SumiError("mpm-params-invalid", `MPM 파라미터가 올바르지 않다: ${reason}`, details);
}

/** 유한한 양수가 아니면 던진다. */
function positive(name: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) fail(`${name}은 유한한 양수여야 한다`, { [name]: v });
}

/**
 * 기본값에 덮어쓰고 검증한다(무음 보정 없음: 틀린 값은 던진다).
 * 영역 크기는 필수이며 셀 4개 이상이어야 한다. 입자 한도는 정수다.
 */
export function resolveMpmParams(
  widthPx: number,
  heightPx: number,
  overrides: Partial<Omit<MpmParams, "widthPx" | "heightPx">> = {},
): MpmParams {
  const p: MpmParams = { ...MPM_DEFAULTS, ...overrides, widthPx, heightPx };
  positive("widthPx", p.widthPx);
  positive("heightPx", p.heightPx);
  positive("cellPx", p.cellPx);
  positive("spacingPx", p.spacingPx);
  positive("rho", p.rho);
  positive("bulk", p.bulk);
  positive("shear", p.shear);
  positive("dtS", p.dtS);
  positive("yieldStrain", p.yieldStrain);
  if (!Number.isFinite(p.relaxTimeS)) fail("relaxTimeS는 유한해야 한다(0 이하는 이완 없음)", { relaxTimeS: p.relaxTimeS });
  for (const [name, v] of [
    ["dragPerS", p.dragPerS],
    ["concDiffusionPerS", p.concDiffusionPerS],
  ] as const) {
    if (!Number.isFinite(v) || v < 0) fail(`${name}은 0 이상의 유한한 수여야 한다`, { [name]: v });
  }
  if (!Number.isFinite(p.wallFriction) || p.wallFriction < 0 || p.wallFriction > 1) {
    fail("wallFriction은 0..1이어야 한다", { wallFriction: p.wallFriction });
  }
  if (!Number.isInteger(p.maxParticles) || p.maxParticles <= 0) {
    fail("maxParticles는 양의 정수여야 한다", { maxParticles: p.maxParticles });
  }
  if (!Number.isInteger(p.maxStepsPerAdvance) || p.maxStepsPerAdvance <= 0) {
    fail("maxStepsPerAdvance는 양의 정수여야 한다", { maxStepsPerAdvance: p.maxStepsPerAdvance });
  }
  if (p.widthPx < 4 * p.cellPx || p.heightPx < 4 * p.cellPx) {
    fail("영역은 셀 4개 이상이어야 한다", { widthPx: p.widthPx, heightPx: p.heightPx, cellPx: p.cellPx });
  }
  // 격자 노드 수가 비현실적으로 크면(메모리) 거부한다.
  const nodes = (Math.ceil(p.widthPx / p.cellPx) + 1) * (Math.ceil(p.heightPx / p.cellPx) + 1);
  if (nodes > 16_000_000) fail("격자 노드가 1600만 개를 넘는다", { nodes });
  return p;
}
