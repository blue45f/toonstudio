import type { ModeledSample, PreviewSample } from "../core/types";

/**
 * 표시 전용 예측 표본. 마지막 두 정본 표본의 속도로 등속 외삽하며
 * 정본 스트림에는 절대 들어가지 않는다(`source: "predicted"`).
 */
export function predictSamples(
  history: readonly ModeledSample[],
  horizonMs: number,
  count: number,
): PreviewSample[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0 || horizonMs <= 0 || history.length === 0) return [];
  const last = history[history.length - 1];
  if (!last) return [];
  const prev = history.length >= 2 ? history[history.length - 2] : undefined;
  let vx = 0;
  let vy = 0;
  if (prev) {
    const dt = last.tMs - prev.tMs;
    if (dt > 0) {
      vx = (last.x - prev.x) / dt;
      vy = (last.y - prev.y) / dt;
    }
  }
  const out: PreviewSample[] = [];
  for (let i = 1; i <= n; i += 1) {
    const dt = (horizonMs * i) / n;
    out.push({
      x: last.x + vx * dt,
      y: last.y + vy * dt,
      tMs: last.tMs + dt,
      pressure: last.pressure,
      source: "predicted",
    });
  }
  return out;
}

/**
 * 2차 곡률 감쇠(Curvature-Damped) 예측 표본 생성기.
 * 최근 3개 표본으로부터 각속도(ω)와 가속도 감쇠(exp(-damping * dt / horizonMs))를 추정하여
 * 곡선·원형 스트로크에서 등속 외삽이 접선 바깥으로 튀는 오버슈트 현상을 억제한다.
 */
export function predictCurvatureDampedSamples(
  history: readonly ModeledSample[],
  horizonMs: number,
  count: number,
  damping = 0.65,
): PreviewSample[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0 || horizonMs <= 0 || history.length === 0) return [];
  const last = history[history.length - 1];
  if (!last) return [];
  if (history.length < 2) {
    return predictSamples(history, horizonMs, count);
  }
  const prev = history[history.length - 2]!;
  const dt1 = Math.max(1e-3, last.tMs - prev.tMs);
  let vx = (last.x - prev.x) / dt1;
  let vy = (last.y - prev.y) / dt1;
  const speed = Math.hypot(vx, vy);

  let omega = 0;
  if (history.length >= 3 && speed > 1e-3) {
    const prev2 = history[history.length - 3]!;
    const dt0 = Math.max(1e-3, prev.tMs - prev2.tMs);
    const vx0 = (prev.x - prev2.x) / dt0;
    const vy0 = (prev.y - prev2.y) / dt0;
    const speed0 = Math.hypot(vx0, vy0);
    if (speed0 > 1e-3) {
      const a0 = Math.atan2(vy0, vx0);
      const a1 = Math.atan2(vy, vx);
      let dTheta = a1 - a0;
      while (dTheta > Math.PI) dTheta -= Math.PI * 2;
      while (dTheta < -Math.PI) dTheta += Math.PI * 2;
      omega = Math.max(-0.06, Math.min(0.06, dTheta / ((dt0 + dt1) * 0.5)));
    }
  }

  const safeDamping = Math.max(0, Math.min(2, damping));
  const stepDt = horizonMs / n;
  const out: PreviewSample[] = [];
  let curX = last.x;
  let curY = last.y;
  let curP = last.pressure;

  for (let i = 1; i <= n; i += 1) {
    const dt = horizonMs * (i / n);
    const decay = Math.exp((-safeDamping * dt) / horizonMs);
    const theta = omega * stepDt * decay;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const rvx = vx * cosT - vy * sinT;
    const rvy = vx * sinT + vy * cosT;
    vx = rvx;
    vy = rvy;
    curX += vx * stepDt * decay;
    curY += vy * stepDt * decay;
    curP = Math.max(0.02, Math.min(1, curP * (1 - 0.04 * (i / n))));
    out.push({
      x: curX,
      y: curY,
      tMs: last.tMs + dt,
      pressure: curP,
      source: "predicted",
    });
  }
  return out;
}
