/**
 * 만화 딥펜 철길 갈라짐(Railroading) & 유화 팔레트 나이프 임파스토(Impasto) 순수 물리 엔진.
 *
 * `apps/brush-lab`의 검증된 닙 2차계·철길 갈라짐·잉크 저장소 감쇠 모델과
 * Baxter(2004) 계열 높이장·부피 보존 이류·Kubelka-Munk(Haase & Meyer 1992) 혼색 유화 모델을
 * 공용 패키지 `@toonstudio/studio-brush-platform`으로 정식 승격한 독립 순수 모듈이다.
 * 앱/랩 직접 참조 없이 Float32Array 결정적 연산만 수행한다.
 */

const f = Math.fround;
const MAX_SUBSTEP_MS = 2;
const KM_R_MIN = 1e-4;

/* -------------------------------------------------------------------------- */
/* 1. 만화 딥펜 닙 2차계 · 철길 갈라짐(Railroading) · 잉크 저장소             */
/* -------------------------------------------------------------------------- */

export interface DipPenNibSpec {
  /** 고유 진동수 ωn (rad/s). G펜 ≈ 180(≈ 2π·30). */
  readonly stiffness: number;
  /** 감쇠비 ζ. 0 이하이면 임계 감쇠(1)로 취급한다. */
  readonly damping: number;
  /** 닙 벌어짐이 시작되는 최소 필압 [0, 1]. */
  readonly threshold: number;
  /** 최대 닙 벌어짐(px). */
  readonly gapMax: number;
  /** 선폭 = baseWidth + gap * widthGain. */
  readonly widthGain: number;
  /** 최소 기본 선폭(px). */
  readonly baseWidth: number;
  /** 세로 반경 비율(ry = width * aspect / 2). */
  readonly aspect: number;
}

export interface DipPenNibFlexState {
  /** [0] 현재 벌어짐 gap(px), [1] 벌어짐 속도(px/s). */
  readonly data: Float32Array;
}

export interface DipPenNibOutput {
  readonly nibGap: number;
  readonly width: number;
  readonly rx: number;
  readonly ry: number;
}

export type MangaNibPersonalityId =
  | "g-pen"
  | "maru-pen"
  | "kabura-pen"
  | "school-pen"
  | "fude-brush-pen";

export interface MangaNibPersonalityProfile {
  readonly id: MangaNibPersonalityId;
  readonly labelKo: string;
  readonly spec: DipPenNibSpec;
  /** 두 갈래(Tine) 사이 모세관 잉크 막이 갈라지기 시작하는 벌어짐 비율 [0.2, 0.98]. */
  readonly railroadThresholdRatio: number;
  /** 1회 잉크 딥(Dip) 시 유효 스트로크 길이 용량(px). */
  readonly reservoirCapacityPx: number;
  readonly characterSummaryKo: string;
}

/** 만화·웹툰 대표 딥펜 5종 물리 개성 정본 프로파일. */
export const MANGA_NIB_PERSONALITY_PROFILES: Readonly<
  Record<MangaNibPersonalityId, MangaNibPersonalityProfile>
> = Object.freeze({
  "g-pen": Object.freeze({
    id: "g-pen",
    labelKo: "G펜 (다이나믹 억양)",
    spec: Object.freeze({
      stiffness: 180,
      damping: 0.65,
      threshold: 0.04,
      gapMax: 6.5,
      widthGain: 1.15,
      baseWidth: 0.55,
      aspect: 0.92,
    }),
    railroadThresholdRatio: 0.72,
    reservoirCapacityPx: 1400,
    characterSummaryKo:
      "낮은 강성과 넓은 벌어짐으로 필압 대비가 극적이며 과압 시 펜촉 중앙 잉크 갈라짐(Railroading)이 나타난다.",
  }),
  "maru-pen": Object.freeze({
    id: "maru-pen",
    labelKo: "마루펜 (극세 디테일)",
    spec: Object.freeze({
      stiffness: 340,
      damping: 0.88,
      threshold: 0.02,
      gapMax: 2.1,
      widthGain: 0.9,
      baseWidth: 0.32,
      aspect: 1.0,
    }),
    railroadThresholdRatio: 0.85,
    reservoirCapacityPx: 950,
    characterSummaryKo:
      "높은 고유진동수로 빠른 복원력과 머리카락·눈동자 묘사에 적합한 극세선을 제공한다.",
  }),
  "kabura-pen": Object.freeze({
    id: "kabura-pen",
    labelKo: "카부라/스푼펜 (균일 칸선·외곽선)",
    spec: Object.freeze({
      stiffness: 265,
      damping: 0.94,
      threshold: 0.06,
      gapMax: 3.0,
      widthGain: 0.75,
      baseWidth: 0.85,
      aspect: 0.96,
    }),
    railroadThresholdRatio: 0.92,
    reservoirCapacityPx: 1850,
    characterSummaryKo:
      "높은 감쇠비로 손떨림이나 급격한 필압 변화에도 일정한 선 굵기를 유지한다.",
  }),
  "school-pen": Object.freeze({
    id: "school-pen",
    labelKo: "스쿨펜 (배경·집중선)",
    spec: Object.freeze({
      stiffness: 300,
      damping: 0.82,
      threshold: 0.05,
      gapMax: 2.6,
      widthGain: 0.85,
      baseWidth: 0.5,
      aspect: 0.95,
    }),
    railroadThresholdRatio: 0.88,
    reservoirCapacityPx: 1500,
    characterSummaryKo:
      "단단한 펜촉 응답으로 배경 작화와 속도선에서 균일하고 경쾌한 타격감을 낸다.",
  }),
  "fude-brush-pen": Object.freeze({
    id: "fude-brush-pen",
    labelKo: "붓펜 (연성 엘라스토머)",
    spec: Object.freeze({
      stiffness: 115,
      damping: 0.58,
      threshold: 0.02,
      gapMax: 9.2,
      widthGain: 1.35,
      baseWidth: 0.4,
      aspect: 0.78,
    }),
    railroadThresholdRatio: 0.64,
    reservoirCapacityPx: 2200,
    characterSummaryKo:
      "매우 넓은 최대 벌어짐과 긴 테이퍼 여운으로 캘리그라피·베타 채움·동양적 필치를 구현한다.",
  }),
});

/** 필압에 대응하는 정상 상태 목표 닙 벌어짐(px). */
export function computeDipPenNibTarget(pressure: number, spec: DipPenNibSpec): number {
  const safeP = Number.isFinite(pressure) ? pressure : 0;
  const t = safeP - spec.threshold;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return f(clamped * Math.max(0, spec.gapMax));
}

/** 획 시작 필압으로 정상 상태 닙 버퍼를 초기화한다(첫 스탬프 지연 0). */
export function createDipPenNibFlexState(
  spec: DipPenNibSpec,
  initialPressure = 0,
): DipPenNibFlexState {
  const data = new Float32Array(2);
  data[0] = computeDipPenNibTarget(initialPressure, spec);
  data[1] = 0;
  return { data };
}

/** 2차 스프링-댐퍼 계로 닙 벌어짐을 `dtMs`만큼 전진시킨다(substep ≤ 2ms). */
export function stepDipPenNibFlex(
  state: DipPenNibFlexState,
  pressure: number,
  dtMs: number,
  spec: DipPenNibSpec,
): DipPenNibOutput {
  const safeDt = Number.isFinite(dtMs) ? Math.max(0, Math.min(250, dtMs)) : 0;
  const target = computeDipPenNibTarget(pressure, spec);
  const wn = Math.max(1, spec.stiffness);
  const zeta = spec.damping > 0 ? spec.damping : 1;
  const steps = Math.max(1, Math.ceil(safeDt / MAX_SUBSTEP_MS));
  const h = safeDt / steps / 1000;
  let g = state.data[0] ?? 0;
  let v = state.data[1] ?? 0;
  for (let i = 0; i < steps; i += 1) {
    const acc = wn * wn * (target - g) - 2 * zeta * wn * v;
    v = f(v + acc * h);
    g = f(g + v * h);
  }
  if (g < 0) {
    g = 0;
    v = 0;
  }
  state.data[0] = g;
  state.data[1] = v;
  const width = f(Math.max(0.05, spec.baseWidth + g * spec.widthGain));
  return {
    nibGap: g,
    width,
    rx: f(width / 2),
    ry: f((width * Math.max(0.1, spec.aspect)) / 2),
  };
}

export interface DipPenRailroadingOutput {
  /** 펜촉 두 갈래 분리도 [0, 1]. 0이면 단일 잉크 줄기, 1이면 완전한 이중 레일. */
  readonly splitRatio: number;
  /** 횡단 중심부(crossPos = 0) 잉크 밀도 [0, 1]. */
  readonly centerAlpha: number;
  /** 양쪽 금속 갈래(Tine) 트랙 잉크 밀도 [0, 1]. */
  readonly outerTrackAlpha: number;
  /** 횡단 좌표 crossPos ∈ [-1, 1]에서의 최종 단면 알파 [0, 1]. */
  readonly crossSectionAlpha: number;
}

/** 딥펜 과압 시 두 금속 갈래 사이 잉크 막 갈라짐(Railroading) 단면 프로파일을 계산한다. */
export function evaluateDipPenRailroadingProfile(
  nibGap: number,
  gapMax: number,
  railroadThresholdRatio = 0.72,
  crossPos = 0,
): DipPenRailroadingOutput {
  const safeGapMax = Math.max(1e-4, gapMax);
  const gapRatio = Math.max(0, Math.min(1.5, nibGap / safeGapMax));
  const threshold = Math.max(0.2, Math.min(0.98, railroadThresholdRatio));
  const splitRatio =
    gapRatio <= threshold
      ? 0
      : f(Math.min(1, (gapRatio - threshold) / Math.max(0.05, 1 - threshold)));

  const centerAlpha = f(Math.max(0.08, 1 - splitRatio * 0.82));
  const outerTrackAlpha = f(Math.min(1, 0.88 + splitRatio * 0.12));

  const absX = Math.min(1, Math.abs(crossPos));
  const tinePeakDist = Math.abs(absX - 0.72);
  const tineRidge = Math.exp(-(tinePeakDist * tinePeakDist) / 0.045);
  const intactProfile = Math.cos(absX * Math.PI * 0.45);
  const splitProfile =
    centerAlpha * (1 - absX * 0.5)
    + splitRatio * tineRidge * (outerTrackAlpha - centerAlpha * 0.5);
  const rawCross = intactProfile * (1 - splitRatio) + splitProfile * splitRatio;

  return {
    splitRatio,
    centerAlpha,
    outerTrackAlpha,
    crossSectionAlpha: f(Math.max(0, Math.min(1, rawCross))),
  };
}

/** 스탬프/셰이더 업로드용 1D 횡단 알파 LUT(`samples` 포인트, [-1, 1])를 샘플링한다. */
export function sampleDipPenStrokeCrossSection(
  nibGap: number,
  gapMax: number,
  railroadThresholdRatio: number,
  samples = 33,
): Float32Array {
  const count = Math.max(3, Math.floor(samples));
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const crossPos = (i / (count - 1)) * 2 - 1;
    out[i] = evaluateDipPenRailroadingProfile(nibGap, gapMax, railroadThresholdRatio, crossPos).crossSectionAlpha;
  }
  return out;
}

export interface DipPenReservoirOutput {
  readonly inkRemainingRatio: number;
  readonly flowScale: number;
  readonly widthScale: number;
}

/** 딥펜 잉크 저장소 소모 모델: 이동 거리·필압에 따라 유량과 선폭이 자연 감쇠한다. */
export function evaluateDipPenReservoirFlow(
  distanceTraveledPx: number,
  reservoirCapacityPx = 1400,
  pressure = 0.6,
): DipPenReservoirOutput {
  const dist = Math.max(0, Number.isFinite(distanceTraveledPx) ? distanceTraveledPx : 0);
  const cap = Math.max(50, Number.isFinite(reservoirCapacityPx) ? reservoirCapacityPx : 1400);
  const p = Math.max(0, Math.min(1, Number.isFinite(pressure) ? pressure : 0.6));
  const effectiveDrain = dist * (0.55 + 0.75 * p);
  const inkRemainingRatio = f(Math.exp(-effectiveDrain / cap));
  const flowScale = f(0.28 + 0.72 * Math.pow(inkRemainingRatio, 0.65));
  const widthScale = f(0.62 + 0.38 * inkRemainingRatio);
  return { inkRemainingRatio, flowScale, widthScale };
}

/* -------------------------------------------------------------------------- */
/* 2. Kubelka-Munk 2-Flux 안료 혼색 & 유화 나이프 임파스토 스크레이프         */
/* -------------------------------------------------------------------------- */

export const OIL_OPACITY_K = 4;
export const OIL_YIELD_SCALE = 1.2;
export const OIL_LEVEL_RATE = 0.12;
export const OIL_RELOAD = 0.03;
export const OIL_EPS = 1e-6;

function clampReflectance(R: number): number {
  return R < KM_R_MIN ? KM_R_MIN : R > 1 ? 1 : R;
}

/** Kubelka-Munk F(R) = (1 - R)^2 / (2R), R ∈ [1e-4, 1]. */
export function reflectanceToKsRatio(R: number): number {
  const r = clampReflectance(R);
  return f(((1 - r) * (1 - r)) / (2 * r));
}

/** 역변환 R∞ = 1 + q - sqrt(q(q + 2)). */
export function ksRatioToReflectance(q: number): number {
  const qq = q < 0 ? 0 : q;
  return f(clampReflectance(1 + qq - Math.sqrt(qq * (qq + 2))));
}

/** 선형 RGB 반사율 3채널 Kubelka-Munk 감산 안료 혼색. */
export function kmMixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const mixCh = (ra: number, rb: number): number =>
    ksRatioToReflectance(f(reflectanceToKsRatio(ra) * (1 - tt) + reflectanceToKsRatio(rb) * tt));
  return [mixCh(a[0], b[0]), mixCh(a[1], b[1]), mixCh(a[2], b[2])];
}

/** 행 우선 유화 높이·젖음·색질량 로컬 윈도우. */
export interface ImpastoOilWindow {
  readonly width: number;
  readonly heightPx: number;
  /** 총 높이 H = base + volume. */
  readonly height: Float32Array;
  /** 마른 릴리프 높이 B. */
  readonly base: Float32Array;
  /** 이동 가능한 젖은 부피 m (≤ V). */
  readonly wet: Float32Array;
  /** 질량 가중 선형 반사율 색 C = V * color. */
  readonly cr: Float32Array;
  readonly cg: Float32Array;
  readonly cb: Float32Array;
}

export interface ImpastoOilCarry {
  r: number;
  g: number;
  b: number;
  loaded: boolean;
}

export function createImpastoOilCarry(): ImpastoOilCarry {
  return { r: 0, g: 0, b: 0, loaded: false };
}

export function createImpastoOilWindow(width: number, heightPx: number): ImpastoOilWindow {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(heightPx));
  const n = safeW * safeH;
  return {
    width: safeW,
    heightPx: safeH,
    height: new Float32Array(n),
    base: new Float32Array(n),
    wet: new Float32Array(n),
    cr: new Float32Array(n),
    cg: new Float32Array(n),
    cb: new Float32Array(n),
  };
}

function paintVolumeAt(win: ImpastoOilWindow, offset: number): number {
  const v = (win.height[offset] ?? 0) - (win.base[offset] ?? 0);
  return v > 0 ? v : 0;
}

/** 윈도우 전체의 총 물감 부피와 젖은 물감 부피 합을 측정한다(보존 법칙 검증용). */
export function measureImpastoVolume(win: ImpastoOilWindow): {
  readonly totalVolume: number;
  readonly wetVolume: number;
} {
  let totalVolume = 0;
  let wetVolume = 0;
  for (let i = 0; i < win.height.length; i += 1) {
    totalVolume += paintVolumeAt(win, i);
    wetVolume += win.wet[i] ?? 0;
  }
  return { totalVolume, wetVolume };
}

/** 물감 침착: `dep[o]` 부피를 더하고 아래 젖은 물감과 KM 혼색한다. */
export function depositImpastoOilWindow(
  win: ImpastoOilWindow,
  dep: Float32Array,
  color: readonly [number, number, number],
  mixing = 0.55,
): void {
  const len = Math.min(dep.length, win.height.length);
  for (let o = 0; o < len; o += 1) {
    const dv = dep[o] ?? 0;
    if (dv <= 0) continue;
    const v0 = paintVolumeAt(win, o);
    const m0 = win.wet[o] ?? 0;
    let cr = color[0];
    let cg = color[1];
    let cb = color[2];
    if (v0 > OIL_EPS && m0 > OIL_EPS) {
      const t = dv / (dv + mixing * m0 + 1e-9);
      [cr, cg, cb] = kmMixRgb(
        [(win.cr[o] ?? 0) / v0, (win.cg[o] ?? 0) / v0, (win.cb[o] ?? 0) / v0],
        color,
        t,
      );
    }
    const v1 = v0 + dv;
    win.height[o] = f((win.height[o] ?? 0) + dv);
    win.wet[o] = f(m0 + dv);
    win.cr[o] = f(cr * v1);
    win.cg[o] = f(cg * v1);
    win.cb[o] = f(cb * v1);
  }
}

/** 붓/나이프가 들고 있는 픽업 색을 갱신한다. */
export function updateImpastoOilCarry(
  win: ImpastoOilWindow,
  weight: Float32Array,
  carry: ImpastoOilCarry,
  dabColor: readonly [number, number, number],
  depositTotal: number,
  pickup = 0.65,
): [number, number, number] {
  if (!carry.loaded) {
    carry.r = dabColor[0];
    carry.g = dabColor[1];
    carry.b = dabColor[2];
    carry.loaded = true;
    return [carry.r, carry.g, carry.b];
  }
  let mu = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  if (pickup > 0) {
    const len = Math.min(weight.length, win.wet.length);
    for (let o = 0; o < len; o += 1) {
      const wgt = weight[o] ?? 0;
      if (wgt <= 0) continue;
      const m = win.wet[o] ?? 0;
      if (m <= OIL_EPS) continue;
      const v = paintVolumeAt(win, o);
      if (v <= OIL_EPS) continue;
      const q = wgt * m;
      mu += q;
      sr += (q * (win.cr[o] ?? 0)) / v;
      sg += (q * (win.cg[o] ?? 0)) / v;
      sb += (q * (win.cb[o] ?? 0)) / v;
    }
  }
  let c: [number, number, number] = [carry.r, carry.g, carry.b];
  if (mu > OIL_EPS) {
    const wMix = (pickup * mu) / (mu + depositTotal + 1e-9);
    c = kmMixRgb(c, [sr / mu, sg / mu, sb / mu], wMix);
  }
  c = kmMixRgb(c, dabColor, OIL_RELOAD);
  carry.r = c[0];
  carry.g = c[1];
  carry.b = c[2];
  return c;
}

/** 부피 보존 no-flux gather 이류 밀기(젖은 물감 + 색 동반 이동, KM 혼색). */
export function pushImpastoOilWindow(
  win: ImpastoOilWindow,
  amount: Float32Array,
  dirX: Int8Array,
  dirY: Int8Array,
  mixing = 0.55,
): void {
  const { width: w, heightPx: h } = win;
  const n = w * h;
  const mv = new Float32Array(n);
  const target = new Int32Array(n).fill(-1);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = y * w + x;
      const a = amount[o] ?? 0;
      if (a <= 0) continue;
      const nx = x + (dirX[o] ?? 0);
      const ny = y + (dirY[o] ?? 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || (nx === x && ny === y)) continue;
      const m = win.wet[o] ?? 0;
      if (m <= OIL_EPS) continue;
      mv[o] = f(m * (a > 1 ? 1 : a));
      target[o] = ny * w + nx;
    }
  }
  const outH = new Float32Array(win.height);
  const outWet = new Float32Array(win.wet);
  const outR = new Float32Array(win.cr);
  const outG = new Float32Array(win.cg);
  const outB = new Float32Array(win.cb);
  const NB_DX = [-1, 1, 0, 0] as const;
  const NB_DY = [0, 0, -1, 1] as const;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = y * w + x;
      const v0 = paintVolumeAt(win, o);
      const own = mv[o] ?? 0;
      const vr = v0 - own;
      const mr = (win.wet[o] ?? 0) - own;
      let cr = v0 > OIL_EPS ? (win.cr[o] ?? 0) / v0 : 0;
      let cg = v0 > OIL_EPS ? (win.cg[o] ?? 0) / v0 : 0;
      let cb = v0 > OIL_EPS ? (win.cb[o] ?? 0) / v0 : 0;
      let incoming = 0;
      for (let k = 0; k < 4; k += 1) {
        const sx = x + (NB_DX[k] ?? 0);
        const sy = y + (NB_DY[k] ?? 0);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const so = sy * w + sx;
        if ((target[so] ?? -1) !== o) continue;
        const q = mv[so] ?? 0;
        if (q <= 0) continue;
        const sv = paintVolumeAt(win, so);
        if (sv <= OIL_EPS) continue;
        const qr = (win.cr[so] ?? 0) / sv;
        const qg = (win.cg[so] ?? 0) / sv;
        const qb = (win.cb[so] ?? 0) / sv;
        if (vr + incoming <= OIL_EPS) {
          cr = qr;
          cg = qg;
          cb = qb;
        } else {
          const t = q / (q + mixing * (mr + incoming) + 1e-9);
          [cr, cg, cb] = kmMixRgb([cr, cg, cb], [qr, qg, qb], t);
        }
        incoming += q;
      }
      const vNew = vr + incoming;
      outH[o] = f((win.base[o] ?? 0) + vNew);
      outWet[o] = f(mr + incoming);
      outR[o] = f(cr * vNew);
      outG[o] = f(cg * vNew);
      outB[o] = f(cb * vNew);
    }
  }
  win.height.set(outH);
  win.wet.set(outWet);
  win.cr.set(outR);
  win.cg.set(outG);
  win.cb.set(outB);
}

export interface PaletteKnifeScrapeOptions {
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly angleRad: number;
  /** 긁어내는 강도 [0, 0.95]. 기본 0.72. */
  readonly scrapeStrength?: number;
  /** 혼색 가중치 [0, 1]. 기본 0.55. */
  readonly mixing?: number;
  /** 측면 가장자리 둑(Ridge) 형성 비율 [0, 1]. 기본 0.45. */
  readonly lateralRidgeThreshold?: number;
}

/**
 * 유화 팔레트 나이프 임파스토 스크레이프:
 * 나이프 중심의 젖은 물감을 진행 방향과 양 측면 가장자리로 밀어내어 중앙은 얇아지고
 * 가장자리에는 부피 보존 임파스토 둑(Ridge)이 쌓이게 한다.
 */
export function scrapeImpastoPaletteKnife(
  win: ImpastoOilWindow,
  options: PaletteKnifeScrapeOptions,
): void {
  const { width: w, heightPx: h } = win;
  const n = w * h;
  if (n === 0 || !(options.radius > 0)) return;
  const clampedStrength = Math.max(0, Math.min(0.95, options.scrapeStrength ?? 0.72));
  const mixing = Math.max(0, Math.min(1, options.mixing ?? 0.55));
  const ridgeThreshold = Math.max(0.15, Math.min(0.85, options.lateralRidgeThreshold ?? 0.45));

  const cosA = Math.cos(options.angleRad);
  const sinA = Math.sin(options.angleRad);
  const stepX = Math.round(cosA) as -1 | 0 | 1;
  const stepY = Math.round(sinA) as -1 | 0 | 1;
  const primaryDx: -1 | 0 | 1 = stepX === 0 && stepY === 0 ? 1 : stepX;
  const primaryDy: -1 | 0 | 1 = stepX === 0 && stepY === 0 ? 0 : stepY;
  // 4-이웃 gather 제약을 지키기 위해 측면 방향은 주축에 수직인 단일 축으로 분해한다.
  const lateralAxisX: -1 | 0 | 1 = primaryDx === 0 ? 1 : 0;
  const lateralAxisY: -1 | 0 | 1 = primaryDx === 0 ? 0 : 1;

  const amount = new Float32Array(n);
  const dirX = new Int8Array(n);
  const dirY = new Int8Array(n);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = x - options.centerX;
      const dy = y - options.centerY;
      const dist = Math.hypot(dx, dy);
      if (dist > options.radius) continue;
      const o = y * w + x;
      const radialFalloff = 1 - (dist / options.radius) * 0.65;
      amount[o] = f(clampedStrength * radialFalloff);
      const cross = -dx * sinA + dy * cosA;
      if (Math.abs(cross) > options.radius * ridgeThreshold) {
        const sign = cross >= 0 ? 1 : -1;
        dirX[o] = (lateralAxisX * sign) as -1 | 0 | 1;
        dirY[o] = (lateralAxisY * sign) as -1 | 0 | 1;
      } else {
        dirX[o] = primaryDx;
        dirY[o] = primaryDy;
      }
    }
  }

  const passes = Math.max(1, Math.min(4, Math.round(options.radius * 0.4)));
  for (let p = 0; p < passes; p += 1) {
    pushImpastoOilWindow(win, amount, dirX, dirY, mixing);
  }
}

export interface ImpastoStepOptions {
  readonly viscosity: number;
  readonly oilYield: number;
  readonly dryingMs: number;
  readonly dtMs: number;
}

/** Bingham 항복 문턱 레벨링과 시간척도 건조 감쇠를 1스텝 진행한다. */
export function stepImpastoBinghamLeveling(
  win: ImpastoOilWindow,
  options: ImpastoStepOptions,
): { readonly movedVolume: number } {
  const { width: w, heightPx: h } = win;
  const rate = OIL_LEVEL_RATE * Math.max(0, 1 - options.viscosity) * (options.dtMs / (1000 / 60));
  const yieldH = Math.max(0, options.oilYield) * OIL_YIELD_SCALE;
  let movedVolume = 0;

  if (rate > 0) {
    const outH = new Float32Array(win.height);
    const outWet = new Float32Array(win.wet);
    const outR = new Float32Array(win.cr);
    const outG = new Float32Array(win.cg);
    const outB = new Float32Array(win.cb);
    const NB_DX = [-1, 1, 0, 0] as const;
    const NB_DY = [0, 0, -1, 1] as const;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const o = y * w + x;
        const ho = win.height[o] ?? 0;
        const mo = win.wet[o] ?? 0;
        const vo = paintVolumeAt(win, o);
        let out = 0;
        let inV = 0;
        let inR = 0;
        let inG = 0;
        let inB = 0;
        for (let k = 0; k < 4; k += 1) {
          const nx = x + (NB_DX[k] ?? 0);
          const ny = y + (NB_DY[k] ?? 0);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const no = ny * w + nx;
          const hn = win.height[no] ?? 0;
          const dOut = ho - hn - yieldH;
          if (dOut > 0 && mo > OIL_EPS) out += Math.min(rate * dOut, 0.25 * mo);
          const dIn = hn - ho - yieldH;
          const mn = win.wet[no] ?? 0;
          if (dIn > 0 && mn > OIL_EPS) {
            const fl = Math.min(rate * dIn, 0.25 * mn);
            const vn = Math.max(paintVolumeAt(win, no), OIL_EPS);
            inV += fl;
            inR += (fl * (win.cr[no] ?? 0)) / vn;
            inG += (fl * (win.cg[no] ?? 0)) / vn;
            inB += (fl * (win.cb[no] ?? 0)) / vn;
          }
        }
        if (out <= 0 && inV <= 0) continue;
        movedVolume += out + inV;
        const cr = vo > OIL_EPS ? (win.cr[o] ?? 0) / vo : 0;
        const cg = vo > OIL_EPS ? (win.cg[o] ?? 0) / vo : 0;
        const cb = vo > OIL_EPS ? (win.cb[o] ?? 0) / vo : 0;
        outH[o] = f(ho - out + inV);
        outWet[o] = f(mo - out + inV);
        outR[o] = f((win.cr[o] ?? 0) - out * cr + inR);
        outG[o] = f((win.cg[o] ?? 0) - out * cg + inG);
        outB[o] = f((win.cb[o] ?? 0) - out * cb + inB);
      }
    }
    win.height.set(outH);
    win.wet.set(outWet);
    win.cr.set(outR);
    win.cg.set(outG);
    win.cb.set(outB);
  }

  const decay = 1 - Math.min(1, Math.max(0, options.dtMs) / Math.max(1, options.dryingMs));
  for (let i = 0; i < win.wet.length; i += 1) {
    const m = win.wet[i] ?? 0;
    if (m > 0) win.wet[i] = m * decay < OIL_EPS ? 0 : f(m * decay);
  }

  return { movedVolume };
}

/** 높이장 H로부터 스페큘러 임파스토 조명용 단위 법선 벡터(nx, ny, nz)를 계산한다. */
export function computeImpastoReliefNormals(
  win: ImpastoOilWindow,
  reliefScale = 2.0,
): Float32Array {
  const { width: w, heightPx: h } = win;
  const normals = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    const ym = y > 0 ? y - 1 : y;
    const yp = y + 1 < h ? y + 1 : y;
    for (let x = 0; x < w; x += 1) {
      const xm = x > 0 ? x - 1 : x;
      const xp = x + 1 < w ? x + 1 : x;
      const dhdx = ((win.height[y * w + xp] ?? 0) - (win.height[y * w + xm] ?? 0)) * 0.5 * reliefScale;
      const dhdy = ((win.height[yp * w + x] ?? 0) - (win.height[ym * w + x] ?? 0)) * 0.5 * reliefScale;
      const invLen = 1 / Math.hypot(-dhdx, -dhdy, 1);
      const out = (y * w + x) * 3;
      normals[out] = f(-dhdx * invLen);
      normals[out + 1] = f(-dhdy * invLen);
      normals[out + 2] = f(invLen);
    }
  }
  return normals;
}
