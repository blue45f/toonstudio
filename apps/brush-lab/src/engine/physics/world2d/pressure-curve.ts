/**
 * 압력 → 값 룩업 테이블(붓털 벌어짐 반경·강성 배율).
 *
 * 3D 붓털(캡슐 체인 + 구형 조인트) 시뮬레이션은 압력에 따라 반경이 단조 증가하다가 압력 0.9 이상에서 좌굴해 꺾인다(SP-D 실측).
 * 3D 엔진(wasm 1.6 MB)을 쓰지 않고 이 거동을 **룩업 테이블로 흉내 낸다**: 단조 구간은 거듭제곱 곡선으로, 좌굴 구간은 측정값 표로.
 * 표는 우리 스파이크가 Rapier 3D(A-curved 구성: 휴지 굽힘 14°·벌어짐 8°·6 Hz)를 돌려 얻은 힘 가중 RMS 반경이며
 * 외부 제품의 값·에셋이 아니다. 한계(정직 보고): 구성 하나의 측정이고 압력 0.05 미만은 외삽이며, 곧은 가닥·다른 굽힘 구성의 거동은 담지 않는다.
 *
 * 모든 값은 f32 미러(`Math.fround`)로 계산한다.
 */

const f = Math.fround;

/** SP-D 측정 압력 점(A-curved, Rapier 3D). */
export const SPD_MEASURED_PRESSURES: readonly number[] = [0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 0.9, 1.0];
/** SP-D 측정 힘 가중 RMS 반경(u). 1 u = 4 px(SP-D 보고서의 환산). */
export const SPD_MEASURED_RMS_RADIUS_U: readonly number[] = [5.689384, 6.707679, 7.696345, 8.237346, 8.918245, 9.461460, 7.099229, 7.460552];
/** SP-D가 단조 구간(p ≤ 0.7)에 맞춘 거듭제곱 곡선 r = a·p^b (u). */
export const SPD_POWER_FIT = { a: 10.168462596414523, b: 0.18752816163515368 } as const;
/** SP-D 측정 중 최대 반경(u). 표 정규화 기준(압력 0.7). */
export const SPD_PEAK_RADIUS_U = 9.46146;
/** 압력 0 값은 측정이 없어(최소 압력 0.05) 외삽이다: 압력 0.05 값의 이 비율로 둔다. */
export const ZERO_PRESSURE_EXTRAPOLATION = 0.8;

/** 균등 간격 압력 표본의 기본 개수(0.01 간격이라 측정 압력 점이 격자에 정확히 놓인다). */
export const PRESSURE_CURVE_SAMPLES = 101;

/** [0,1] 균등 격자 LUT. 입력 압력은 clamp되고 구간은 선형 보간한다. */
export class PressureCurveTable {
  readonly values: Float32Array;

  constructor(values: ArrayLike<number>) {
    if (values.length < 2) throw new RangeError(`압력 곡선 표는 점이 2개 이상이어야 한다(받은 값 ${values.length}개)`);
    this.values = new Float32Array(values.length);
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i] ?? 0;
      if (!Number.isFinite(v)) throw new RangeError(`압력 곡선 표 ${i}번 값이 유한하지 않다(${v})`);
      this.values[i] = v;
    }
  }

  /** 압력 p(0..1로 clamp)의 값. */
  eval(p: number): number {
    const n = this.values.length;
    const x = p < 0 ? 0 : p > 1 ? 1 : p;
    const scaled = f(x * (n - 1));
    const lower = Math.min(n - 2, Math.floor(scaled));
    const frac = f(scaled - lower);
    const lo = this.values[lower] ?? 0;
    const hi = this.values[lower + 1] ?? lo;
    return f(lo + f(f(hi - lo) * frac));
  }

  /** 비감소(단조) 여부. 좌굴을 흉내 내는 표는 false다. */
  isMonotonic(): boolean {
    for (let i = 1; i < this.values.length; i += 1) {
      if ((this.values[i] ?? 0) < (this.values[i - 1] ?? 0)) return false;
    }
    return true;
  }

  /** 표의 최댓값. */
  max(): number {
    let m = -Infinity;
    for (const v of this.values) if (v > m) m = v;
    return m;
  }

  /** (압력, 값) 매듭을 선형으로 이어 균등 격자로 표본화한다. 매듭은 압력 오름차순이어야 하고 0과 1을 덮어야 한다. */
  static fromKnots(knots: readonly (readonly [number, number])[], samples: number = PRESSURE_CURVE_SAMPLES): PressureCurveTable {
    if (knots.length < 2) throw new RangeError("압력 곡선 매듭은 2개 이상이어야 한다");
    if ((knots[0]?.[0] ?? 1) !== 0 || (knots[knots.length - 1]?.[0] ?? 0) !== 1) {
      throw new RangeError("압력 곡선 매듭은 압력 0에서 시작해 1에서 끝나야 한다");
    }
    for (let i = 1; i < knots.length; i += 1) {
      if ((knots[i]?.[0] ?? 0) <= (knots[i - 1]?.[0] ?? 0)) throw new RangeError("압력 곡선 매듭의 압력은 엄격히 증가해야 한다");
    }
    const out: number[] = [];
    let seg = 0;
    for (let i = 0; i < samples; i += 1) {
      const p = i / (samples - 1);
      while (seg < knots.length - 2 && p > (knots[seg + 1]?.[0] ?? 1) + 1e-12) seg += 1;
      const [p0, v0] = knots[seg] ?? [0, 0];
      const [p1, v1] = knots[seg + 1] ?? [1, 0];
      const t = (p - p0) / (p1 - p0);
      out.push(v0 + (v1 - v0) * (t < 0 ? 0 : t > 1 ? 1 : t));
    }
    return new PressureCurveTable(out);
  }
}

/**
 * 단조 구간 거듭제곱 곡선 v(p) = p^b (p = 1에서 1). 압력 0.05 미만은 측정이 없어 0.05의 값에서 압력 0의 외삽값으로 선형 연결한다.
 * `exponent` 기본값은 SP-D 피팅(0.1875)이다.
 */
export function powerPressureCurve(exponent: number = SPD_POWER_FIT.b, samples: number = PRESSURE_CURVE_SAMPLES): PressureCurveTable {
  const p0 = SPD_MEASURED_PRESSURES[0] ?? 0.05;
  const v0 = p0 ** exponent;
  const knots: [number, number][] = [[0, v0 * ZERO_PRESSURE_EXTRAPOLATION]];
  const n = 64;
  for (let i = 0; i <= n; i += 1) {
    const p = p0 + ((1 - p0) * i) / n;
    knots.push([p, p ** exponent]);
  }
  return PressureCurveTable.fromKnots(knots, samples);
}

/**
 * 3D 좌굴을 흉내 낸 비단조 표: SP-D 측정값을 피크(압력 0.7 = 1)로 정규화해 그대로 잇는다.
 * 압력 0.9 이상에서 값이 0.75~0.79로 꺾인다(가닥이 좌굴해 털끝 고리가 오히려 줄어드는 현상).
 */
export function bucklingPressureCurve(samples: number = PRESSURE_CURVE_SAMPLES): PressureCurveTable {
  const knots: [number, number][] = [];
  const first = (SPD_MEASURED_RMS_RADIUS_U[0] ?? 1) / SPD_PEAK_RADIUS_U;
  knots.push([0, first * ZERO_PRESSURE_EXTRAPOLATION]);
  for (let i = 0; i < SPD_MEASURED_PRESSURES.length; i += 1) {
    knots.push([SPD_MEASURED_PRESSURES[i] ?? 0, (SPD_MEASURED_RMS_RADIUS_U[i] ?? 0) / SPD_PEAK_RADIUS_U]);
  }
  return PressureCurveTable.fromKnots(knots, samples);
}

/** 선형 곡선 v(p) = from + (to − from)·p. 강성 배율처럼 단순한 변화에 쓴다. */
export function linearPressureCurve(from: number, to: number, samples: number = PRESSURE_CURVE_SAMPLES): PressureCurveTable {
  return PressureCurveTable.fromKnots(
    [
      [0, from],
      [1, to],
    ],
    samples,
  );
}

/** 압력과 무관한 상수 곡선. */
export function constantPressureCurve(value: number): PressureCurveTable {
  return linearPressureCurve(value, value, 2);
}

export const PRESSURE_CURVE_IDS = ["power-fit", "buckling-3d", "linear"] as const;
export type PressureCurveId = (typeof PRESSURE_CURVE_IDS)[number];

/** 이름으로 조회한다. 모르는 이름은 RangeError(무음 기본값 없음). */
export function pressureCurveById(id: PressureCurveId): PressureCurveTable {
  switch (id) {
    case "power-fit":
      return powerPressureCurve();
    case "buckling-3d":
      return bucklingPressureCurve();
    case "linear":
      return linearPressureCurve(0.45, 1);
    default:
      throw new RangeError(`알 수 없는 압력 곡선: ${String(id)}`);
  }
}
