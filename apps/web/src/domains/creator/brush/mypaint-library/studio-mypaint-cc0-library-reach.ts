/**
 * CC0 MyPaint 브러시의 물감 도달 범위(변환 표면 여백) 추정 — 고정된 libmypaint 1.6.1 의 설정 계산을 따라간다.
 *
 * - 곡선(mypaint_mapping_calculate)은 첫·끝 구간을 직선으로 연장한다. 입력이 곡선 점 범위를 벗어나면 출력이 곡선 점의
 *   최댓값보다 커질 수 있으므로, 입력마다 제품이 실제로 낼 수 있는 정의역에서 곡선의 최솟값·최댓값을 구한다.
 * - 속도 입력(speed1·speed2)은 ln(e^γ + v)·m + q 이고, v 는 지수 평균한 획 속도(px/s)다. 계획 단계는 저장된 표본의
 *   위치·시간으로 그 지수 평균을 libmypaint 와 같은 식으로 따라가 최댓값을 쓴다(고정 속도 가정이 아니다).
 * - 반지름은 libmypaint 처럼 1000px, 방향 오프셋은 축마다 3240px 에서 자른다.
 * - 추적 잡음(tracking_noise)은 위치를 흔들 뿐 아니라 이벤트 사이 이동량을 키워 속도 지수 평균도 키운다. 건너뛰기(0.5·잡음
 *   길이)와 느린 추적까지 libmypaint 순서대로 따라가며, 이벤트마다 결정적 이동량에 잡음 변화량의 평균 크기 √π·잡음을 더한다.
 *   잡음 오프셋은 축마다 ±2√3·잡음 안에 있어 최악값은 4√6·잡음이지만, 그 값은 실측 도달 범위의 2~5배라 fur·soft irregular
 *   의 8px 이상 획을 대부분 계획 단계에서 거부한다. 실측(추적 잡음 브러시 12종 × 4~24px × 획 5종 × 시드 5개)에서 필요한
 *   계수는 0.74 이하였다. 이 성분만 상한이 아닌 추정이며, 모자라면 작업자 출력 검증이 표면 가장자리 접촉으로 결과를 거부한다.
 * - 모든 성분은 축별 상한이다. 계획 표면은 획 경계 상자를 축마다 이 값만큼 넓힌다.
 */
import { STUDIO_MYPAINT_CC0_REACH_DEFAULTS } from "./studio-mypaint-cc0-library-index.generated";

import type { StudioMypaintCc0ReachRow } from "./studio-mypaint-cc0-library-index.generated";

/** rand_gauss 는 균등 난수 4개의 합을 늘인 값이라 절댓값이 2√3 을 넘지 않는다. */
const GAUSS_LIMIT = 2 * Math.sqrt(3);
/** libmypaint ACTUAL_RADIUS_MAX. */
const RADIUS_LIMIT_PX = 1000;
/** libmypaint directional_offsets 의 축별 상한. */
const OFFSET_AXIS_LIMIT_PX = 3240;
/** libmypaint stroke_to: dtime 이 0 이하이면 0.0001 초로 본다. */
const MIN_DTIME_SECONDS = 0.0001;
/** libmypaint stroke_to 의 max_dtime(초). 이보다 긴 간격은 브러시 상태를 리셋한다. */
const RESET_DTIME_SECONDS = 5;
/**
 * 두 처리 이벤트 사이 잡음 변화량의 평균 크기(잡음 단위). rand_gauss 는 분산 1 이라 축마다 차이의 분산이 2 이고, 2차원
 * 크기의 평균은 √2·√(π/2) = √π 다(정규 근사). 최악값 4√6 은 쓰지 않는다(머리 주석 참고).
 */
const NOISE_STEP_MEAN = Math.sqrt(Math.PI);
/** 제품 세션의 마무리 꼬리: 마지막 표본 위치로 0.016초 이벤트를 8번 보낸다. */
const FINISH_TAIL_STEPS = 8;
const FINISH_TAIL_DTIME_SECONDS = 0.016;
/** 개발판 입력 이름 → 1.6.1 입력(프로그램 단계의 별칭과 같다). */
const INPUT_ALIASES: Readonly<Record<string, string>> = Object.freeze({ surfacemap_x: "gridmap_x", surfacemap_y: "gridmap_y" });
/** 값 범위가 고정된 입력(brushsettings.json 의 hard 범위, 제품 호출의 고정값 반영). */
const FIXED_INPUT_DOMAINS: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  random: [0, 1], stroke: [0, 1], direction: [0, 180], direction_angle: [0, 360],
  tilt_declination: [0, 90], tilt_ascension: [-180, 180], attack_angle: [-180, 180],
  tilt_declinationx: [-90, 90], tilt_declinationy: [-90, 90], gridmap_x: [0, 256], gridmap_y: [0, 256],
  // 제품은 viewzoom 1·막대 회전 0 으로 stroke_to 를 부른다(입력 = ln 1 = 0, 0).
  viewzoom: [0, 0], barrel_rotation: [0, 0],
});
/** 모르는 입력(1.6.1 밖)은 넓은 범위로 본다 — 여백을 넓히는 쪽이 안전하다. */
const UNKNOWN_INPUT_DOMAIN: readonly [number, number] = [-360, 360];

export interface StudioMypaintCc0StrokeTiming {
  readonly x: number;
  readonly y: number;
  /** 획 시작부터의 시간(ms). */
  readonly tMs: number;
}

/** 속도 지수 평균을 따라가는 데 필요한 기준값(초·px). */
export interface StudioMypaintCc0SpeedFilter {
  readonly speed1Slowness: number;
  readonly speed2Slowness: number;
  /** offset_by_speed 속도 벡터 지수 평균의 시간 상수(초). */
  readonly offsetTimeConstant: number;
  /** 추적 잡음 크기(px) = 기준 반지름 × tracking_noise 기준값. 0.001 이하이면 잡음과 건너뛰기가 없다. */
  readonly trackingNoisePx: number;
  /** slow_tracking 기준값. */
  readonly slowTracking: number;
}

interface ReachSetting {
  readonly base: number;
  readonly inputs: Readonly<Record<string, readonly number[]>>;
}

/** mypaint_mapping_calculate 의 입력 곡선 하나(평탄한 [x0, y0, x1, y1, …]). 끝 구간은 직선 연장, 평평·수직 구간은 y0. */
export function evaluateMypaintCurve(curve: readonly number[], x: number): number {
  let x0 = curve[0] ?? 0, y0 = curve[1] ?? 0, x1 = curve[2] ?? x0, y1 = curve[3] ?? y0;
  for (let index = 4; index + 1 < curve.length && x > x1; index += 2) {
    x0 = x1; y0 = y1; x1 = curve[index]!; y1 = curve[index + 1]!;
  }
  if (x0 === x1 || y0 === y1) return y0;
  return (y1 * (x - x0) + y0 * (x1 - x)) / (x1 - x0);
}

/** 정의역 [low, high] 에서 곡선이 내는 최솟값·최댓값(구간별 직선이라 끝점과 안쪽 꺾인 점만 보면 된다). */
export function mypaintCurveRange(curve: readonly number[], low: number, high: number): readonly [number, number] {
  let minimum = Infinity, maximum = -Infinity;
  const visit = (x: number): void => {
    const y = evaluateMypaintCurve(curve, x);
    if (y < minimum) minimum = y;
    if (y > maximum) maximum = y;
  };
  visit(low);
  visit(high);
  for (let index = 0; index + 1 < curve.length; index += 2) {
    const x = curve[index]!;
    if (x > low && x < high) visit(x);
  }
  return [minimum, maximum];
}

/** libmypaint 의 속도 입력 사상 ln(γ + v)·m + q (γ = e^gamma 설정 기준값, 45px/s 에서 0.5·기울기 0.015). */
export function mypaintSpeedInput(speedPxPerSecond: number, gammaLog: number): number {
  const gamma = Math.exp(gammaLog), m = 0.015 * (45 + gamma), q = 0.5 - m * Math.log(45 + gamma);
  return Math.log(gamma + Math.max(0, speedPxPerSecond)) * m + q;
}

function settingsOf(rows: readonly StudioMypaintCc0ReachRow[]): (name: string) => ReachSetting {
  const table = new Map<string, ReachSetting>();
  for (const row of rows) {
    const inputs: Record<string, readonly number[]> = {};
    for (const [input, curve] of Object.entries(row[2] ?? {})) inputs[INPUT_ALIASES[input] ?? input] = curve;
    table.set(row[0], { base: row[1], inputs });
  }
  return (name) => table.get(name) ?? { base: STUDIO_MYPAINT_CC0_REACH_DEFAULTS[name] ?? 0, inputs: {} };
}

/** 지수 평균 감쇠(libmypaint exp_decay): 시간 상수가 0.001 이하이면 바로 따라간다. */
function decay(timeConstant: number, seconds: number): number {
  return timeConstant > 0.001 ? Math.exp(-seconds / timeConstant) : 0;
}

/**
 * 제품 세션이 보내는 이벤트(첫 표본 위치 프라이밍, 표본마다 stroke_to, 마무리 꼬리)를 libmypaint 순서대로 따라가
 * 속도 지수 평균 세 가지(speed1·speed2 의 크기, offset_by_speed 의 속도 벡터)의 획 동안 최댓값 상한을 낸다.
 * 이벤트 안에서 평균은 그 이벤트의 속도 쪽으로만 움직이므로 이벤트 끝값만 보면 된다.
 */
export function mypaintFilteredSpeedMaxima(
  samples: readonly StudioMypaintCc0StrokeTiming[],
  filter: StudioMypaintCc0SpeedFilter,
): { readonly speed1: number; readonly speed2: number; readonly offset: number } {
  const first = samples[0], last = samples.at(-1);
  if (!first || !last) return { speed1: 0, speed2: 0, offset: 0 };
  const noise = filter.trackingNoisePx > 0.001 ? filter.trackingNoisePx : 0;
  let slow1 = 0, slow2 = 0, slowX = 0, slowY = 0, slowJitter = 0, max1 = 0, max2 = 0, maxOffset = 0;
  // 프라이밍(리셋 분기)이 결정적 커서를 첫 표본에 두고, brush_reset 이 건너뛰기를 지운다. 그래서 첫 표본은 건너뛰지 않고
  // 0.0001초 동안 잡음 변화량만큼 움직여 속도 평균이 한 번 튄다.
  let x = first.x, y = first.y;
  let skip = 0, skipX = first.x, skipY = first.y, skipped = 0;
  const event = (px: number, py: number, seconds: number): void => {
    let dtime = seconds > 0 ? seconds : MIN_DTIME_SECONDS;
    if (skip > 0.001) {
      skip -= Math.hypot(skipX - px, skipY - py);
      skipX = px; skipY = py;
      skipped += dtime;
      dtime = skipped;
      if (skip > 0.001 && dtime <= RESET_DTIME_SECONDS) return;
      skip = 0; skipped = 0;
    }
    if (noise) { skip = 0.5 * noise; skipX = px; skipY = py; }
    if (dtime > RESET_DTIME_SECONDS) {
      // 리셋 분기(brush_reset)는 잡음 단계 뒤에 실행되어 상태와 건너뛰기를 모두 지운다.
      x = px; y = py; slow1 = 0; slow2 = 0; slowX = 0; slowY = 0; slowJitter = 0; skip = 0; skipped = 0;
      return;
    }
    const follow = 1 - decay(filter.slowTracking, 100 * dtime);
    const dx = (px - x) * follow, dy = (py - y) * follow;
    x += dx; y += dy;
    // 잡음 커서와 결정적 커서의 차이는 잡음 오프셋들의 볼록 결합이라, 이동량 차이는 follow × (잡음 변화량)이다.
    const jitterSpeed = (follow * NOISE_STEP_MEAN * noise) / dtime;
    const speed = Math.hypot(dx, dy) / dtime + jitterSpeed;
    if (!Number.isFinite(speed)) return;
    slow1 += (speed - slow1) * (1 - decay(filter.speed1Slowness, dtime));
    slow2 += (speed - slow2) * (1 - decay(filter.speed2Slowness, dtime));
    const offsetFollow = 1 - decay(filter.offsetTimeConstant, dtime);
    slowX += (dx / dtime - slowX) * offsetFollow;
    slowY += (dy / dtime - slowY) * offsetFollow;
    slowJitter += (jitterSpeed - slowJitter) * offsetFollow;
    max1 = Math.max(max1, slow1);
    max2 = Math.max(max2, slow2);
    maxOffset = Math.max(maxOffset, Math.hypot(slowX, slowY) + slowJitter);
  };
  // 세션은 첫 표본을 dtime 0.0001초로 보낸다.
  event(first.x, first.y, MIN_DTIME_SECONDS);
  for (let index = 1; index < samples.length; index += 1) {
    event(samples[index]!.x, samples[index]!.y, (samples[index]!.tMs - samples[index - 1]!.tMs) / 1000);
  }
  for (let step = 0; step < FINISH_TAIL_STEPS; step += 1) event(last.x, last.y, FINISH_TAIL_DTIME_SECONDS);
  return { speed1: max1, speed2: max2, offset: maxOffset };
}

/**
 * 반지름 radiusPx 로 표본 획을 그릴 때 물감이 표본 경로에서 닿을 수 있는 거리(px)의 추정 상한.
 * 반지름 곡선·무작위 반지름·방향 오프셋·속도 오프셋·무작위 산포·추적 잡음을 libmypaint 의 식대로 더한다.
 */
export function studioMypaintCc0ReachPx(
  rows: readonly StudioMypaintCc0ReachRow[],
  radiusPx: number,
  samples: readonly StudioMypaintCc0StrokeTiming[],
): number {
  const setting = settingsOf(rows);
  const range = (name: string, domainOf: (input: string) => readonly [number, number]): readonly [number, number] => {
    const { base, inputs } = setting(name);
    let low = base, high = base;
    for (const [input, curve] of Object.entries(inputs)) {
      const [from, to] = domainOf(input);
      const [curveLow, curveHigh] = mypaintCurveRange(curve, from, to);
      low += curveLow;
      high += curveHigh;
    }
    return [low, high];
  };
  const fixedDomain = (input: string): readonly [number, number] => FIXED_INPUT_DOMAINS[input] ?? UNKNOWN_INPUT_DOMAIN;
  const offsetSlowness = range("offset_by_speed_slowness", fixedDomain)[0];
  const trackingNoise = Math.max(0, setting("tracking_noise").base);
  // 설정 곡선이 있으면 시간 상수의 가장 작은 값(가장 빨리 따라가는 평균)을 쓴다.
  const speeds = mypaintFilteredSpeedMaxima(samples, {
    speed1Slowness: Math.max(0, range("speed1_slowness", fixedDomain)[0]),
    speed2Slowness: Math.max(0, range("speed2_slowness", fixedDomain)[0]),
    offsetTimeConstant: Math.max(0.002, Math.exp(offsetSlowness * 0.01) - 1),
    trackingNoisePx: trackingNoise * radiusPx,
    slowTracking: setting("slow_tracking").base,
  });
  const gamma1 = setting("speed1_gamma").base, gamma2 = setting("speed2_gamma").base;
  const pressureHigh = Math.exp(setting("pressure_gain_log").base);
  const radiusLog = Math.log(Math.max(1e-6, radiusPx));
  const baseDomain = (input: string): readonly [number, number] => {
    switch (input) {
      case "pressure": return [0, pressureHigh];
      case "speed1": return [mypaintSpeedInput(0, gamma1), mypaintSpeedInput(speeds.speed1, gamma1)];
      case "speed2": return [mypaintSpeedInput(0, gamma2), mypaintSpeedInput(speeds.speed2, gamma2)];
      // 제품은 radius_logarithmic 기준값을 ln(반지름) 으로 바꿔 넣는다(brush_radius 입력 = 그 기준값).
      case "brush_radius": return [radiusLog, radiusLog];
      default: return fixedDomain(input);
    }
  };
  // custom 입력은 custom_input 설정값을 따라가는 지수 평균이라, 시작값 0 과 그 설정의 범위 안에 머문다.
  const customSetting = range("custom_input", (input) => (input === "custom" ? UNKNOWN_INPUT_DOMAIN : baseDomain(input)));
  const domainOf = (input: string): readonly [number, number] =>
    (input === "custom" ? [Math.min(0, customSetting[0]), Math.max(0, customSetting[1])] : baseDomain(input));
  const magnitude = (name: string): number => {
    const [low, high] = range(name, domainOf);
    return Math.max(Math.abs(low), Math.abs(high));
  };
  const positive = (name: string): number => Math.max(0, range(name, domainOf)[1]);

  // 반지름: ln(반지름) + 곡선 합 + 무작위 반지름(±2√3·|radius_by_random|), 1000px 에서 자른다.
  const radiusCurves = range("radius_logarithmic", domainOf)[1] - setting("radius_logarithmic").base;
  const dabLog = radiusLog + radiusCurves + GAUSS_LIMIT * magnitude("radius_by_random");
  const dab = Math.min(RADIUS_LIMIT_PX, Math.exp(Math.min(30, dabLog)));
  // 방향 오프셋: (설정 합) × 기준 반지름 × e^offset_multiplier, 축마다 3240px 에서 자른다.
  const angular = magnitude("offset_angle") + magnitude("offset_angle_asc") + magnitude("offset_angle_view")
    + positive("offset_angle_2") + positive("offset_angle_2_asc") + positive("offset_angle_2_view");
  const multiplier = radiusPx * Math.exp(Math.min(30, range("offset_multiplier", domainOf)[1]));
  const axisX = Math.min(OFFSET_AXIS_LIMIT_PX, (magnitude("offset_x") + angular) * multiplier);
  const axisY = Math.min(OFFSET_AXIS_LIMIT_PX, (magnitude("offset_y") + angular) * multiplier);
  const directional = Math.hypot(axisX, axisY);
  // 속도 오프셋: 지수 평균 속도 벡터 × offset_by_speed × 0.1 (viewzoom 1).
  const bySpeed = 0.1 * magnitude("offset_by_speed") * speeds.offset;
  // 무작위 산포·추적 잡음: ±2√3 × 값 × 기준 반지름.
  const scatter = GAUSS_LIMIT * positive("offset_by_random") * radiusPx;
  const tracking = GAUSS_LIMIT * trackingNoise * radiusPx;
  return dab + directional + bySpeed + scatter + tracking;
}
