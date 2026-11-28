import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import type { Office2dVisibleRect } from "./office2d-camera";
import type { Office2dCanvas2D } from "./office2d-procedural-art";

type RouteCanvas = Pick<Office2dCanvas2D, "save" | "restore" | "beginPath" | "moveTo" | "lineTo" |
  "closePath" | "stroke" | "fill" | "ellipse" | "setLineDash" | "lineWidth" | "lineCap" | "lineJoin" |
  "fillStyle" | "strokeStyle">;

/** 경로 탐색기가 고른 남은 경유점을 바닥에 표시한다. 화면 밖 구간은 캔버스 경로에 추가하지 않는다. */
export function paintOffice2dRouteGuide(
  ctx: RouteCanvas,
  start: StudioVirtualSpacePoint,
  waypoints: readonly StudioVirtualSpacePoint[],
  destination: StudioVirtualSpacePoint,
  visible: Office2dVisibleRect,
  zoom: number,
  time: number,
  reducedMotion: boolean,
): void {
  const unit = 1 / zoom;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  let previous = start;
  let connected = false;
  let hasRoute = false;
  for (const next of waypoints) {
    // 양 끝이 같은 화면 경계 밖에 있을 때만 제외한다. 화면을 가로지르는 긴 선분은 유지한다.
    const outside = (previous.x < visible.minX && next.x < visible.minX) ||
      (previous.x > visible.maxX && next.x > visible.maxX) ||
      (previous.y < visible.minY && next.y < visible.minY) ||
      (previous.y > visible.maxY && next.y > visible.maxY);
    if (!outside) {
      if (!connected) ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(next.x, next.y);
      hasRoute = true;
    }
    connected = !outside;
    previous = next;
  }
  if (hasRoute) {
    ctx.setLineDash([4 * unit, 9 * unit]);
    ctx.strokeStyle = "rgba(12, 46, 54, 0.75)";
    ctx.lineWidth = 4 * unit;
    ctx.stroke();
    ctx.strokeStyle = "#c7fff3";
    ctx.lineWidth = 1.8 * unit;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const { x, y } = destination;
  if (x >= visible.minX && x <= visible.maxX && y >= visible.minY && y <= visible.maxY) {
    const wave = reducedMotion ? 0.45 : (time * 1.15) % 1;
    ctx.beginPath();
    ctx.ellipse(x, y, (8 + wave * 9) * unit, (4 + wave * 4) * unit, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(123, 240, 213, ${0.8 - 0.55 * wave})`;
    ctx.lineWidth = 2 * unit;
    ctx.stroke();

    // 어두운 외곽선과 고정된 마름모 중심점은 밝은 바닥과 야간 조명에서 모두 읽힌다.
    ctx.beginPath();
    ctx.moveTo(x, y - 6 * unit);
    ctx.lineTo(x + 6 * unit, y);
    ctx.lineTo(x, y + 6 * unit);
    ctx.lineTo(x - 6 * unit, y);
    ctx.closePath();
    ctx.fillStyle = "#b8ffe9";
    ctx.fill();
    ctx.strokeStyle = "#153f44";
    ctx.lineWidth = 2 * unit;
    ctx.stroke();
  }
  ctx.restore();
}
