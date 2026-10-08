/**
 * 물감 혼색 모듈(KM 밴드 근사 + 3채널 조정형). 외부 의존 0, 사칙과 `Math.sqrt`만 쓴다.
 *
 * 입출력 규약
 * - 색은 **선형 sRGB 0..1, straight(알파 미적용)**다. 감마(sRGB 전달 함수)와 알파 곱은 호출자가 경계에서 처리한다.
 *   `mixBatchPremul`만 선형 **premultiplied** RGBA 버퍼를 받아 안에서 unpremultiply → 혼색 → premultiply 한다.
 * - `t`는 b의 비율이다(0 → a, 1 → b). 가중은 spectral.js와 같이 농도 = (비율)²·휘도(착색력 1)라 t는 질량비가 아니다.
 *
 * 범위 밖·비유한 입력 정책(클램프, 던지지 않는다)
 * - 색 채널·`t`·`brushAlpha`·버퍼 안의 알파/색: 유한 값은 [0, 1]로 클램프, `NaN`은 0, `+Infinity`는 1, `-Infinity`는 0으로 본다.
 *   → 출력은 언제나 유한하고 [0, 1]이다(premultiplied 출력은 색 ≤ 알파).
 * - 근거: ① 픽셀 단위 핫 루프라 예외·사전 검사 비용이 크고, ② WGSL 미러는 던질 수 없어 같은 규칙(`clamp`, NaN→0)으로 맞춰야 하며,
 *   ③ 입력 오류가 아니라 누적 반올림이 만드는 1+ε 같은 값이 현실적인 원인이다. 대신 호출 한 번당 한 번의 **구조 검사**는 거부한다:
 *   표 형식·버퍼 길이·픽셀 수·램프 크기가 틀리면 `SumiError`(code `km-table-invalid`·`km-buffer-size`·`km-ramp-size`)를 던진다.
 * - `t`가 0이면 정확히 `a`, 1이면 정확히 `b`를 돌려준다(분기). 밴드 근사는 스펙트럼 복원 왕복 오차가 있어 분기가 없으면 t=0에서도 입력이
 *   조금 바뀌고 반복 적용(스머지)에서 누적된다. 분기 경계에서의 불연속은 왕복 오차 이하(측정 최대 ΔE00 0.44, 8밴드)다.
 *
 * 결정성: 연산은 IEEE 754 사칙·`sqrt`뿐이고 `Math.pow`·`cbrt`·`exp`를 쓰지 않는다. 합산 순서는 밴드 오름차순으로 고정이다.
 * 같은 입력은 같은 JS 엔진에서 비트 동일하다(다른 엔진 일치는 `sqrt`가 IEEE 정확 반올림이라 기대하지만 브라우저 미검증).
 *
 * f64 / f32 판단(`kubelka-munk.ts`의 `Math.fround` 미러 관행과의 관계)
 * - `kubelka-munk.ts`는 WGSL `km_mix`와 1:1로 맞춘 **f32 미러**다. 이 모듈은 아직 레인·습식 경로에 연결되지 않은 **CPU 기준 구현**이라
 *   내부 계산을 f64로 하고 f32는 저장 경계(`Float32Array` 출력)에서만 생긴다. 표 상수는 이미 f32로 표현되는 값이다.
 * - GPU 미러용 별도 f32 변형은 **지금은 만들지 않는다**(소비자가 없고 죽은 중복 코드가 된다). 필요 여부의 근거는 에뮬레이션 측정이다:
 *   모든 연산 뒤에 `Math.fround`를 건 f32 에뮬레이션(IEEE 사칙·sqrt, 무작위 3000쌍·t 0.02..0.98)을 f64 구현과 비교하면 최대 |Δ|가 8밴드 1.5e-5,
 *   6밴드 2.8e-5(어두운 색 위주 표본은 8밴드 1.1e-5·6밴드 2.1e-5), ΔE00 최대 0.002라 8비트 양자화(1/255 ≈ 3.9e-3) 아래다. 즉 같은 식을 WGSL로 옮겨도 된다.
 *   이는 아래 `reflectance`의 안정형 덕이다: 뺄셈형 `1 + q − sqrt(q² + 2q)`는 같은 에뮬레이션에서 어두운 색 표본의 ΔE00 최대가
 *   8밴드 6.5, 6밴드 16.3까지 갔다(큰 q에서 두 큰 수의 상쇄). 복원 행렬 계수가 큰 값(최대 약 ±90)이라 누적도 상쇄에 민감하다.
 * - GPU 연결(후속) 때는 이 식을 `Math.fround`로 감싼 f32 기준 함수를 `kubelka-munk.ts` 관행대로 추가하고 CPU(f64)와의 최대 오차 테스트를 건다.
 *   WGSL `sqrt`·나눗셈은 정확 반올림이 보장되지 않아(허용 ULP 오차) CPU와 GPU의 비트 일치는 기대하지 않고 허용 오차로 비교한다 — 실 GPU 값은 미측정이다.
 *
 * 스레드 안전: 믹서 인스턴스는 내부 스크래치 버퍼를 쓰므로 재진입·동시 호출이 안 된다. 워커마다 `createBandMixer`로 따로 만든다.
 *
 * 출처: Kubelka-Munk 공개 수식(Haase & Meyer 1992). 7기저 스펙트럼 표는 spectral.js 3.0.0(MIT) 파생 데이터이며 `km-tables.ts`의
 * MIT 고지를 유지해야 한다(`docs/license-policy.md` 6절).
 */
import { SumiError } from "../core/errors";

export { KM_TABLE_6, KM_TABLE_8 } from "./km-tables";

/** 선형 sRGB 0..1 straight 색. */
export type Rgb3 = readonly [number, number, number];

/** 결과를 쓸 버퍼(`o` 오프셋부터 3칸). */
export type RgbOut = Float32Array | Float64Array | number[];

/** 밴드 표: 7기저(흰·시안·마젠타·노랑·빨강·초록·파랑) 반사율 7×bands와 복원 행렬 3×bands(둘 다 행 우선). */
export interface BandTable {
  readonly bands: number;
  readonly basis: ArrayLike<number>;
  readonly rec: ArrayLike<number>;
}

export interface BandMixer {
  readonly bands: number;
  /** 단일 혼합. 결과 3개를 `out[o..o+2]`에 쓴다. */
  mix(a: Rgb3, b: Rgb3, t: number, out: RgbOut, o?: number): void;
  /**
   * 배치 스머지: `src`(선형 premultiplied RGBA, 길이 ≥ 4·n)의 각 픽셀을 고정 브러시색(straight)과 `t`로 섞어 `dst`에 쓴다.
   * `dst === src`(제자리)도 된다. 알파는 선형 보간 `αout = α + (αb − α)·t`, 색 가중은 `t' = t·αb / (t·αb + (1 − t)·α)`다.
   * 투명 픽셀(α ≤ 1e-6)은 브러시색, 브러시 알파가 0이면 원색 유지, 둘 다 투명이면 (0,0,0,0)이다. 불투명끼리는 `mix`와 비트 동일하다.
   */
  mixBatchPremul(src: Float32Array, brush: Rgb3, brushAlpha: number, t: number, dst: Float32Array, n: number): void;
  /** 고정 두 색의 t = 0..1 균등 램프(`size`개, RGB 3개씩). 첫 칸은 a, 마지막 칸은 b다. 반복 보간용 LUT. */
  buildRamp(a: Rgb3, b: Rgb3, size: number): Float32Array;
}

const LUM_R = 0.2126729;
const LUM_G = 0.7151522;
const LUM_B = 0.072175;

/** 기저 합성 반사율의 하한. 0이면 K/S = (1 − R)² / (2R)이 발산한다. */
const R_FLOOR = 1e-6;
/**
 * 휘도 가중(농도)의 하한. 반드시 `R_FLOOR`와 같은 크기로 둔다: 무채 어두운 색은 K/S ≈ 1/(2R)이 휘도 Y ≈ R과 함께 변해 곱 K/S·Y가 0.5에
 * 가까운 상수로 남는다(spectral.js가 순흑을 지우지 않는 이유). 하한 둘이 어긋나면(예: R 1e-6, 휘도 1e-16) 순흑의 농도가 사라져 흰색과 섞어도 흰색만 남는다.
 */
const LUM_FLOOR = R_FLOOR;
/** 알파가 이 이하면 투명 픽셀로 본다. */
const ALPHA_EPS = 1e-6;
/** 알파 가중 합의 하한(0으로 나누기 방지). */
const WEIGHT_EPS = 1e-9;
/** 램프 크기 상한(실수로 거대한 버퍼를 만드는 것을 거부). */
const MAX_RAMP_SIZE = 1 << 20;

/** [0, 1] 클램프. NaN → 0, +Infinity → 1, -Infinity → 0(비교가 모두 거짓이면 0으로 떨어진다). */
const unit = (x: number): number => (x > 0 ? (x < 1 ? x : 1) : 0);

/* ------------------------------------------------------------------ 3채널 KM 조정형 */

/** 3채널 KM의 반사율 하한. 채널 반사율이 0에 가까우면 F(R)이 발산해 어두운 채널이 혼합을 지배한다. */
const KM3_FLOOR = 0.01;
const KM3_SCALE = 1 - KM3_FLOOR;
const KM3_CHANNEL_MIN = 1e-6;
/** 휘도 가중 하한. 반사율 하한(`KM3_FLOOR`)과 같게 둬서 순흑(K/S 상한 × 휘도 하한)이 농도를 잃지 않게 한다(밴드 믹서의 `LUM_FLOOR`와 같은 이유). */
const KM3_LUM_MIN = KM3_FLOOR;

/**
 * 3채널 KM 조정형(빠름·거침): 채널 반사율을 `0.01 + 0.99·R`로 끌어올려 F(R) 발산을 막고 농도 = (비율)²·휘도로 가중한다.
 * 사칙과 `sqrt`만 쓴다. 측정(SP-E, 무작위 1500쌍, 기준 spectral.js)에서 평균 ΔE00 2.45(p95 약 10)로 색 쏠림이 있다.
 * 정확한 혼색이 필요하면 `createBandMixer`를 쓴다. `t`가 0이면 `a`, 1이면 `b` 그대로다. 범위 밖 입력은 위 정책대로 클램프한다.
 */
export function mixKm3Tuned(a: Rgb3, b: Rgb3, t: number, out: RgbOut, o = 0): void {
  const tt = unit(t);
  const a0 = unit(a[0]);
  const a1 = unit(a[1]);
  const a2 = unit(a[2]);
  const b0 = unit(b[0]);
  const b1 = unit(b[1]);
  const b2 = unit(b[2]);
  if (tt <= 0) {
    out[o] = a0;
    out[o + 1] = a1;
    out[o + 2] = a2;
    return;
  }
  if (tt >= 1) {
    out[o] = b0;
    out[o + 1] = b1;
    out[o + 2] = b2;
    return;
  }
  const la = Math.max(KM3_LUM_MIN, LUM_R * a0 + LUM_G * a1 + LUM_B * a2);
  const lb = Math.max(KM3_LUM_MIN, LUM_R * b0 + LUM_G * b1 + LUM_B * b2);
  const s = 1 - tt;
  const ca = s * s * la;
  const cb = tt * tt * lb;
  const inv = 1 / (ca + cb);
  out[o] = km3Channel(a0, b0, ca, cb, inv);
  out[o + 1] = km3Channel(a1, b1, ca, cb, inv);
  out[o + 2] = km3Channel(a2, b2, ca, cb, inv);
}

function km3Channel(a: number, b: number, ca: number, cb: number, inv: number): number {
  const ra = KM3_FLOOR + KM3_SCALE * (a > KM3_CHANNEL_MIN ? a : KM3_CHANNEL_MIN);
  const rb = KM3_FLOOR + KM3_SCALE * (b > KM3_CHANNEL_MIN ? b : KM3_CHANNEL_MIN);
  const q = (((1 - ra) * (1 - ra)) / (2 * ra) * ca + ((1 - rb) * (1 - rb)) / (2 * rb) * cb) * inv;
  return unit((reflectance(q) - KM3_FLOOR) / KM3_SCALE);
}

/**
 * K/S 비 q ≥ 0 → 무한 두께 반사율. `1 + q − sqrt(q² + 2q)`와 같은 값이지만 `(1 + q)² − (q² + 2q) = 1`이라
 * `1 / (1 + q + sqrt(q² + 2q))`로 쓰면 q가 클 때(어두운 밴드) 큰 두 수의 뺄셈 상쇄가 없다. 사칙과 sqrt만 쓴다.
 */
function reflectance(q: number): number {
  return 1 / (1 + q + Math.sqrt(q * q + 2 * q));
}

/* ------------------------------------------------------------------ n밴드 KM 근사 */

/** 표 형식을 한 번 검사한다(핫 루프 밖). 실패하면 던진다. */
function assertTable(table: BandTable): void {
  const n = table.bands;
  const bad = (reason: string): never => {
    throw new SumiError("km-table-invalid", `KM 밴드 표가 올바르지 않다: ${reason}`, { bands: n });
  };
  if (!Number.isInteger(n) || n < 1 || n > 64) bad("bands는 1..64의 정수여야 한다");
  if (table.basis.length !== 7 * n) bad(`basis 길이가 7·bands(${7 * n})가 아니다: ${table.basis.length}`);
  if (table.rec.length !== 3 * n) bad(`rec 길이가 3·bands(${3 * n})가 아니다: ${table.rec.length}`);
  for (let i = 0; i < table.basis.length; i += 1) {
    const v = table.basis[i];
    if (v === undefined || !Number.isFinite(v)) bad(`basis[${i}]가 유한하지 않다`);
  }
  for (let i = 0; i < table.rec.length; i += 1) {
    const v = table.rec[i];
    if (v === undefined || !Number.isFinite(v)) bad(`rec[${i}]가 유한하지 않다`);
  }
}

/**
 * n밴드 KM 믹서를 만든다. 표는 복사해 쓰므로 만든 뒤 원본을 바꿔도 영향이 없다(표 형식이 틀리면 `SumiError`).
 * 밴드 수가 정확도를 정한다: 무작위 1500쌍 평균 ΔE00(기준 spectral.js, SP-E 측정) 6밴드 0.92 · 8밴드 0.45 · 16밴드 0.05.
 */
export function createBandMixer(table: BandTable): BandMixer {
  assertTable(table);
  const n = table.bands;
  const basis = Float64Array.from(table.basis);
  const rec = Float64Array.from(table.rec);
  /** 현재 색 a와 b의 K/S(밴드별). 배치에서는 b(브러시)를 한 번만 계산해 둔다. */
  const ksA = new Float64Array(n);
  const ksB = new Float64Array(n);

  /** 선형 RGB(이미 클램프됨) → 밴드 반사율(7기저 가중합) → K/S. 가중은 흰 + 시안/마젠타/노랑 + 빨강/초록/파랑 분해다. */
  const toKs = (r: number, g: number, b: number, ks: Float64Array): void => {
    const w = r < g ? (r < b ? r : b) : g < b ? g : b;
    const r0 = r - w;
    const g0 = g - w;
    const b0 = b - w;
    const wc = g0 < b0 ? g0 : b0;
    const wm = r0 < b0 ? r0 : b0;
    const wy = r0 < g0 ? r0 : g0;
    const wr = Math.max(0, Math.min(r0 - b0, r0 - g0));
    const wg = Math.max(0, Math.min(g0 - b0, g0 - r0));
    const wb = Math.max(0, Math.min(b0 - g0, b0 - r0));
    for (let i = 0; i < n; i += 1) {
      const v =
        w * basis[i]! +
        wc * basis[n + i]! +
        wm * basis[2 * n + i]! +
        wy * basis[3 * n + i]! +
        wr * basis[4 * n + i]! +
        wg * basis[5 * n + i]! +
        wb * basis[6 * n + i]!;
      const refl = v < R_FLOOR ? R_FLOOR : v;
      ks[i] = ((1 - refl) * (1 - refl)) / (2 * refl);
    }
  };

  const luminance = (r: number, g: number, b: number): number => {
    const y = LUM_R * r + LUM_G * g + LUM_B * b;
    return y > LUM_FLOOR ? y : LUM_FLOOR;
  };

  /** 밴드별 K/S를 농도 가중 평균 → 반사율 → 선형 RGB 복원(합산은 밴드 오름차순 고정). */
  const mixKs = (ca: number, cb: number, out: RgbOut, o: number): void => {
    const inv = 1 / (ca + cb);
    let r = 0;
    let g = 0;
    let bl = 0;
    for (let i = 0; i < n; i += 1) {
      const refl = reflectance((ksA[i]! * ca + ksB[i]! * cb) * inv);
      r += rec[i]! * refl;
      g += rec[n + i]! * refl;
      bl += rec[2 * n + i]! * refl;
    }
    out[o] = unit(r);
    out[o + 1] = unit(g);
    out[o + 2] = unit(bl);
  };

  return {
    bands: n,
    mix(a, b, t, out, o = 0) {
      const tt = unit(t);
      const a0 = unit(a[0]);
      const a1 = unit(a[1]);
      const a2 = unit(a[2]);
      const b0 = unit(b[0]);
      const b1 = unit(b[1]);
      const b2 = unit(b[2]);
      if (tt <= 0) {
        out[o] = a0;
        out[o + 1] = a1;
        out[o + 2] = a2;
        return;
      }
      if (tt >= 1) {
        out[o] = b0;
        out[o + 1] = b1;
        out[o + 2] = b2;
        return;
      }
      toKs(a0, a1, a2, ksA);
      toKs(b0, b1, b2, ksB);
      const s = 1 - tt;
      mixKs(s * s * luminance(a0, a1, a2), tt * tt * luminance(b0, b1, b2), out, o);
    },
    mixBatchPremul(src, brush, brushAlpha, t, dst, count) {
      if (!Number.isInteger(count) || count < 0) {
        throw new SumiError("km-buffer-size", `픽셀 수가 0 이상의 정수가 아니다: ${count}`, { count });
      }
      if (src.length < count * 4 || dst.length < count * 4) {
        throw new SumiError("km-buffer-size", `버퍼가 ${count}픽셀(${count * 4}칸)보다 짧다`, {
          count,
          srcLength: src.length,
          dstLength: dst.length,
        });
      }
      const tt = unit(t);
      const ba = unit(brushAlpha);
      const br = unit(brush[0]);
      const bg = unit(brush[1]);
      const bb = unit(brush[2]);
      toKs(br, bg, bb, ksB);
      const lb = luminance(br, bg, bb);
      for (let p = 0; p < count; p += 1) {
        const i = p * 4;
        const al = unit(src[i + 3]!);
        if (al <= ALPHA_EPS) {
          // 투명 픽셀: 색은 브러시색, 알파는 αb·t(= 일반식에서 α = 0일 때와 같다).
          const outA = unit(ba * tt);
          dst[i] = br * outA;
          dst[i + 1] = bg * outA;
          dst[i + 2] = bb * outA;
          dst[i + 3] = outA;
          continue;
        }
        const inv = 1 / al;
        const ar = unit(src[i]! * inv);
        const ag = unit(src[i + 1]! * inv);
        const ab = unit(src[i + 2]! * inv);
        const outA = unit(al + (ba - al) * tt);
        const wb = tt * ba;
        const wsum = (1 - tt) * al + wb;
        // 불투명끼리는 가중이 t 그대로여야 mix()와 비트 동일하다((1 − t) + t가 1이 아닐 수 있는 반올림을 피한다).
        const w = al === 1 && ba === 1 ? tt : wsum > WEIGHT_EPS ? wb / wsum : 0;
        if (w <= 0) {
          dst[i] = ar * outA;
          dst[i + 1] = ag * outA;
          dst[i + 2] = ab * outA;
        } else if (w >= 1) {
          dst[i] = br * outA;
          dst[i + 1] = bg * outA;
          dst[i + 2] = bb * outA;
        } else {
          toKs(ar, ag, ab, ksA);
          const s = 1 - w;
          mixKs(s * s * luminance(ar, ag, ab), w * w * lb, dst, i);
          dst[i] = dst[i]! * outA;
          dst[i + 1] = dst[i + 1]! * outA;
          dst[i + 2] = dst[i + 2]! * outA;
        }
        dst[i + 3] = outA;
      }
    },
    buildRamp(a, b, size) {
      if (!Number.isInteger(size) || size < 1 || size > MAX_RAMP_SIZE) {
        throw new SumiError("km-ramp-size", `램프 크기는 1..${MAX_RAMP_SIZE}의 정수여야 한다: ${size}`, { size });
      }
      const out = new Float32Array(size * 3);
      for (let k = 0; k < size; k += 1) this.mix(a, b, size === 1 ? 0 : k / (size - 1), out, k * 3);
      return out;
    },
  };
}
