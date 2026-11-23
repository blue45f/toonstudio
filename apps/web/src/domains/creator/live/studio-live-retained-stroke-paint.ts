import type { StudioCalligraphyRibbonRun } from "../brush/studio-calligraphy-ribbon";

const ELLIPSE_FALLBACK_SEGMENTS = 24;

/**
 * Round-cap suffix stroke shared by live highlighter travel and the eraser preview.
 * One-point suffixes still emit a cap so a coalesced sample is visible.
 */
export function paintStudioLiveRetainedRoundStroke(
  context: CanvasRenderingContext2D,
  pairs: readonly { readonly x: number; readonly y: number }[],
  start: number,
  style: {
    readonly stroke: string;
    readonly width: number;
    readonly opacity: number;
    readonly composite?: GlobalCompositeOperation;
  },
): void {
  if (pairs.length === 0) return;
  const from = Math.max(0, Math.min(start, pairs.length - 1));
  context.globalCompositeOperation = style.composite ?? "source-over";
  context.globalAlpha = Math.max(0, Math.min(1, style.opacity));
  context.strokeStyle = style.stroke;
  context.fillStyle = style.stroke;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(0.5, style.width);
  context.beginPath();
  context.moveTo(pairs[from]!.x, pairs[from]!.y);
  if (from + 1 >= pairs.length) {
    context.lineTo(pairs[from]!.x, pairs[from]!.y);
  } else {
    for (let index = from + 1; index < pairs.length; index += 1) {
      context.lineTo(pairs[index]!.x, pairs[index]!.y);
    }
  }
  context.stroke();
}

/**
 * 캘리그라피 단일 탭의 회전 타원을 그린다(`StudioDrawNode` `<Ellipse>`와 동일 기하).
 * 테스트 기록용 최소 2D 컨텍스트에 `ellipse`가 없을 때도 다각형 경로로 안전하게 폴백한다.
 */
export function paintStudioLiveRetainedEllipticalTap(
  context: CanvasRenderingContext2D,
  tap: Readonly<{
    readonly x: number;
    readonly y: number;
    readonly radiusX: number;
    readonly radiusY: number;
    readonly angleRadians: number;
    readonly color: string;
    readonly opacity: number;
  }>,
): void {
  context.fillStyle = tap.color;
  context.globalAlpha = Math.max(0, Math.min(1, tap.opacity));
  context.beginPath();
  if (typeof context.ellipse === "function") {
    context.ellipse(
      tap.x,
      tap.y,
      Math.max(0.25, tap.radiusX),
      Math.max(0.25, tap.radiusY),
      tap.angleRadians,
      0,
      Math.PI * 2,
    );
  } else {
    const rx = Math.max(0.25, tap.radiusX);
    const ry = Math.max(0.25, tap.radiusY);
    const cos = Math.cos(tap.angleRadians);
    const sin = Math.sin(tap.angleRadians);
    for (let index = 0; index < ELLIPSE_FALLBACK_SEGMENTS; index += 1) {
      const theta = (index / ELLIPSE_FALLBACK_SEGMENTS) * Math.PI * 2;
      const lx = Math.cos(theta) * rx;
      const ly = Math.sin(theta) * ry;
      const wx = tap.x + lx * cos - ly * sin;
      const wy = tap.y + lx * sin + ly * cos;
      if (index === 0) context.moveTo(wx, wy);
      else context.lineTo(wx, wy);
    }
    context.closePath();
  }
  context.fill();
}

/**
 * 캘리그라피 리본 run과 시작/끝 캡을 단일 `fill`로 합집합 채움한다.
 * `paintStudioDrawCalligraphyRibbon`과 동일하게 겹침 이중 알파를 만들지 않는다.
 */
export function paintStudioLiveRetainedCalligraphyRun(
  context: CanvasRenderingContext2D,
  run: StudioCalligraphyRibbonRun,
  options: Readonly<{
    readonly includeStartCap: boolean;
    readonly includeEndCap: boolean;
  }>,
): void {
  const [firstX, firstY, ...rest] = run.outlinePoints;
  if (firstX === undefined || firstY === undefined) return;
  context.beginPath();
  context.moveTo(firstX, firstY);
  for (let offset = 0; offset < rest.length; offset += 2) {
    const x = rest[offset];
    const y = rest[offset + 1];
    if (x === undefined || y === undefined) break;
    context.lineTo(x, y);
  }
  context.closePath();
  if (options.includeStartCap) {
    context.moveTo(run.startCap.x + run.startCap.radius, run.startCap.y);
    context.arc(run.startCap.x, run.startCap.y, run.startCap.radius, 0, Math.PI * 2);
  }
  if (options.includeEndCap) {
    context.moveTo(run.endCap.x + run.endCap.radius, run.endCap.y);
    context.arc(run.endCap.x, run.endCap.y, run.endCap.radius, 0, Math.PI * 2);
  }
  context.fill();
}
