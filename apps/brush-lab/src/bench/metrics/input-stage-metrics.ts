import { InputPipeline, resolveInputConfig } from "../../engine/input/input-pipeline";
import { stabilizerPctToOneEuro } from "../../engine/input/stabilizer-map";
import { applyStrokeStream } from "../../engine/input/stages/chain";
import { presetById } from "../../engine/presets/catalog";
import { renderStroke } from "../../engine/raster/reference-renderer";
import { buildFixture } from "../fixtures/stroke-fixtures";

import { cornerAccuracyFromImage, lineWidthCurve, slowSpeedJitterRms } from "./handfeel-metrics";
import { mean } from "./lab-math";

import type { LabImage, RawSample } from "../../engine/core/types";
import type { InputPipelineConfig } from "../../engine/input/input-pipeline";
import type { RawStage } from "../../engine/input/stages/raw-stage";
import type { StrokeFixture } from "../fixtures/stroke-fixtures";

/**
 * 입력 단계 비교 측정(SP-C 표를 저장소 안에서 재현). 단계 하나와 그 뒤의 엔진 1€ 설정을 묶은 '경로'(`InputStageCase`)를
 * 9종 fixture 중 필요한 것에 돌려 다음을 잰다. 앱의 그리기 화면과 같은 구조다:
 * 포인터 표본 → 단계(`applyStrokeStream`) → 레인 안쪽 `InputPipeline`(엔진 1€) → 래스터.
 *
 * - 코너 편차(px): 지그재그 128²·512², pencil-hb를 CPU 참조로 렌더해 `build-report`와 같은 절차(선폭 곡선 32 정류장 → 평균/2 →
 *   `cornerAccuracyFromImage`)로 잰다. **지표 정의는 바꾸지 않았다.**
 * - 오버슈트(px): 고속 획(fast-flick 512², 3.8 px/ms) 끝에서 마지막 진행 방향으로 raw `up`을 지나 뻗은 최대 거리.
 * - 지연(ms): 직선(line 512²)에서 (raw 위치 − 출력 위치) / 속도의 중앙 구간 평균. 단계+엔진 1€ 합산이다.
 * - 지터(px): 저속 손떨림(tremor 512², 위치 잡음 σ 0.8 px) 출력 경로의 3차 detrend 잔차 RMS(`slowSpeedJitterRms`, 저장소 지표 식).
 * - 길이 비율: 출력 경로 길이 / raw 경로 길이(곡선 512²).
 * - 형상 RMS(px): 스파이럴 512² 출력점에서 raw 폴리라인까지 거리의 RMS.
 *
 * 모든 값은 Node 22 단일 스레드에서 직접 계산한 결정적 수치다(브라우저·실제 펜 입력 측정이 아니다).
 */

export interface InputStageCase {
  id: string;
  label: string;
  /** 단계 체인(없으면 null = 엔진 기본 경로만). 호출마다 새 인스턴스를 만든다. */
  makeStage: () => RawStage | null;
  /**
   * 엔진 1€ 위치 설정. 'preset'은 프리셋 기본, 'raw'는 그리기 화면이 단계 방식에서 쓰는 s=0(사실상 raw) 매핑,
   * `{ pct }`는 1€ 슬라이더(로그 매핑) 값이다.
   */
  engine: "preset" | "raw" | { pct: number };
}

export interface InputStageMeasurement {
  caseId: string;
  zigzag128Px: number | null;
  zigzag512Px: number | null;
  zigzag512OvershootPx: number | null;
  jitterPx: number | null;
  lagMs: number;
  flickOvershootPx: number;
  lengthRatio: number;
  spiralRmsPx: number;
  /** 마지막 출력과 raw up 사이 거리(px, fast-flick 512²). 획 끝 따라잡기가 있으면 0. */
  endGapPx: number;
  /** 마지막 출력 시각 − raw up 시각(ms, fast-flick 512²): 획 끝 마무리가 늘린 시간. */
  settleMs: number;
  /** 이 경로가 모서리로 판정한 정점 수 중 지그재그 512² 꼭짓점 수 대비(코너 게이트가 있을 때만, 없으면 null). */
  gateCorners: number | null;
}

const RENDER_PRESET = "pencil-hb";
const FRAME_MS = 1000 / 60;
const WIDTH_STATIONS = 32;

/** 엔진 쪽 입력 설정: 프리셋 기본 또는 s=0(raw 수준) 1€. */
export function engineInputConfig(engine: InputStageCase["engine"]): Partial<InputPipelineConfig> {
  const base = presetById(RENDER_PRESET).input;
  if (engine === "preset") return base;
  const position = stabilizerPctToOneEuro(engine === "raw" ? 0 : engine.pct);
  const resolved = resolveInputConfig(base);
  return { ...base, oneEuro: { position, pressure: resolved.oneEuro.pressure, tilt: resolved.oneEuro.tilt } };
}

function stagedSamples(c: InputStageCase, raw: readonly RawSample[]): { out: RawSample[]; stage: RawStage | null } {
  const stage = c.makeStage();
  return { out: stage ? applyStrokeStream(stage, raw) : raw.map((s) => ({ ...s })), stage };
}

/** 단계 출력 → 엔진 `InputPipeline`(16.67 ms 프레임 단위, `StrokePipeline.push`와 같은 호출 순서) → 정본 위치 열. */
export function modelThroughEngine(
  samples: readonly RawSample[],
  cfg: Partial<InputPipelineConfig>,
): { x: number; y: number; tMs: number }[] {
  const pipeline = new InputPipeline(resolveInputConfig(cfg));
  const out: { x: number; y: number; tMs: number }[] = [];
  const t0 = samples[0]?.tMs ?? 0;
  let frame: RawSample[] = [];
  let frameIndex = 0;
  const flushFrame = (): void => {
    if (frame.length === 0) return;
    for (const s of pipeline.push(frame).committed) out.push({ x: s.x, y: s.y, tMs: s.tMs });
    frame = [];
  };
  for (const s of samples) {
    const k = Math.floor((s.tMs - t0) / FRAME_MS);
    if (k > frameIndex) {
      flushFrame();
      frameIndex = k;
    }
    frame.push(s);
  }
  flushFrame();
  for (const s of pipeline.finish()) out.push({ x: s.x, y: s.y, tMs: s.tMs });
  return out;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function pathLength(p: readonly { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i += 1) {
    const a = p[i - 1];
    const b = p[i];
    if (a && b) s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

/** 단계 출력(+엔진)을 pencil-hb CPU 참조로 렌더한 이미지. 렌더 프로그램의 입력 설정이 엔진 1€ 경로다. */
export function renderCase(c: InputStageCase, fixture: StrokeFixture): { image: LabImage } {
  const { out } = stagedSamples(c, fixture.samples);
  const program = { ...presetById(RENDER_PRESET), input: engineInputConfig(c.engine) };
  const res = renderStroke(program, out, { width: fixture.width, height: fixture.height, seed: 1 });
  return { image: res.image };
}

/** `build-report`와 같은 절차의 코너 편차(px)·오버슈트(px). 정점이 없거나 잉크가 없으면 null. */
export function imageCornerMetrics(img: LabImage, fixture: StrokeFixture): { devPx: number; overshootPx: number | null } | null {
  const path = fixture.intendedPath;
  if (!path || path.length < 3) return null;
  const widths = lineWidthCurve(img, path, WIDTH_STATIONS).filter((w) => w > 0);
  if (widths.length === 0) return null;
  const acc = cornerAccuracyFromImage(img, path, mean(widths) / 2);
  return acc.corners > 0 ? { devPx: acc.maxPx, overshootPx: acc.overshootPx } : null;
}

/** 지연(ms): 직선의 중앙 40 % 구간에서 (raw 위치 − 출력 위치)/속도의 평균(시각 보간). */
function lagOnLine(c: InputStageCase): number {
  const fx = buildFixture("line", { width: 512, height: 512 });
  const { out } = stagedSamples(c, fx.samples);
  const modeled = modelThroughEngine(out, engineInputConfig(c.engine));
  const raw = fx.samples;
  const first = raw[0];
  const last = raw[raw.length - 1];
  if (!first || !last) return 0;
  const speed = (last.x - first.x) / (last.tMs - first.tMs);
  const lags: number[] = [];
  for (const m of modeled) {
    if (m.tMs < first.tMs + 0.3 * (last.tMs - first.tMs) || m.tMs > first.tMs + 0.7 * (last.tMs - first.tMs)) continue;
    const rawX = first.x + speed * (m.tMs - first.tMs);
    lags.push((rawX - m.x) / speed);
  }
  return lags.length > 0 ? mean(lags) : 0;
}

function flickMetrics(c: InputStageCase): { overshoot: number; endGap: number; settle: number } {
  const fx = buildFixture("fast-flick", { width: 512, height: 512 });
  const { out } = stagedSamples(c, fx.samples);
  const modeled = modelThroughEngine(out, engineInputConfig(c.engine));
  const raw = fx.samples;
  const rawEnd = raw[raw.length - 1];
  const before = raw[Math.max(0, raw.length - 5)];
  const lastOut = modeled[modeled.length - 1];
  if (!rawEnd || !before || !lastOut) return { overshoot: 0, endGap: 0, settle: 0 };
  let dx = rawEnd.x - before.x;
  let dy = rawEnd.y - before.y;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  let over = 0;
  for (const m of modeled) {
    if (m.tMs < rawEnd.tMs - 30) continue;
    over = Math.max(over, (m.x - rawEnd.x) * dx + (m.y - rawEnd.y) * dy);
  }
  return { overshoot: over, endGap: Math.hypot(lastOut.x - rawEnd.x, lastOut.y - rawEnd.y), settle: lastOut.tMs - rawEnd.tMs };
}

/** 저속 지터(px): tremor 512²(≈20 px/s, 위치 잡음 σ 0.8 px)의 단계+엔진 출력 경로에서 3차 detrend 잔차 RMS(저장소 `slowSpeedJitterRms`). */
function jitterOfCase(c: InputStageCase): number | null {
  const fx = buildFixture("tremor", { width: 512, height: 512 });
  const { out } = stagedSamples(c, fx.samples);
  const modeled = modelThroughEngine(out, engineInputConfig(c.engine));
  return modeled.length >= 5 ? slowSpeedJitterRms(modeled.map((m) => [m.x, m.y] as const)) : null;
}

function lengthAndShape(c: InputStageCase): { lengthRatio: number; spiralRms: number } {
  const curve = buildFixture("curve", { width: 512, height: 512 });
  const cs = stagedSamples(c, curve.samples).out;
  const cm = modelThroughEngine(cs, engineInputConfig(c.engine));
  const rawLen = pathLength(curve.samples);
  const lengthRatio = rawLen > 0 ? pathLength(cm) / rawLen : 0;
  const spiral = buildFixture("spiral", { width: 512, height: 512 });
  const ss = stagedSamples(c, spiral.samples).out;
  const sm = modelThroughEngine(ss, engineInputConfig(c.engine));
  let sum = 0;
  for (const m of sm) {
    let d = Number.POSITIVE_INFINITY;
    for (let i = 1; i < spiral.samples.length; i += 1) {
      const a = spiral.samples[i - 1];
      const b = spiral.samples[i];
      if (a && b) d = Math.min(d, distToSegment(m.x, m.y, a.x, a.y, b.x, b.y));
    }
    sum += d * d;
  }
  return { lengthRatio, spiralRms: Math.sqrt(sum / Math.max(1, sm.length)) };
}

/** 경로 하나를 전부 측정한다. `withImages`가 false면 코너 편차(렌더 필요)를 건너뛴다(null). */
export function measureStageCase(c: InputStageCase, opts: { withImages?: boolean } = {}): InputStageMeasurement {
  const withImages = opts.withImages ?? true;
  let zigzag128: number | null = null;
  let zigzag512: number | null = null;
  let zigzag512Over: number | null = null;
  let gateCorners: number | null = null;
  if (withImages) {
    for (const size of [128, 512] as const) {
      const fx = buildFixture("zigzag", { width: size, height: size });
      const { image } = renderCase(c, fx);
      const m = imageCornerMetrics(image, fx);
      if (size === 128) zigzag128 = m?.devPx ?? null;
      else {
        zigzag512 = m?.devPx ?? null;
        zigzag512Over = m?.overshootPx ?? null;
      }
    }
  }
  const jitter = jitterOfCase(c);
  // 코너 게이트가 센 모서리 수는 단계를 따로 한 번 돌려 읽는다(지그재그 512²).
  {
    const fx = buildFixture("zigzag", { width: 512, height: 512 });
    const stage = c.makeStage();
    if (stage) {
      applyStrokeStream(stage, fx.samples.slice(0, -1));
      const corners = (stage as { corners?: number }).corners;
      gateCorners = typeof corners === "number" ? corners : null;
    }
  }
  const flick = flickMetrics(c);
  const shape = lengthAndShape(c);
  return {
    caseId: c.id,
    zigzag128Px: zigzag128,
    zigzag512Px: zigzag512,
    zigzag512OvershootPx: zigzag512Over,
    jitterPx: jitter,
    lagMs: lagOnLine(c),
    flickOvershootPx: flick.overshoot,
    lengthRatio: shape.lengthRatio,
    spiralRmsPx: shape.spiralRms,
    endGapPx: flick.endGap,
    settleMs: flick.settle,
    gateCorners,
  };
}
