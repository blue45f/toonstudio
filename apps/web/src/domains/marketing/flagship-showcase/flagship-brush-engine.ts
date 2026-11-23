/**
 * 자기 완결 Canvas2D 물리 브러시 체험 엔진 (마케팅 도메인 전용).
 *
 * 외부 편집기 도메인 비공개 모듈에 의존하지 않으며 원시 hex/rgb/hsl 없이
 * OKLCH 토큰만으로 5종 물리 브러시(6B 2층 종이결 · 왁스 크레파스 ·
 * 쿠벨카-문크 광학 수채 · 48돈모 유화 · G펜)의 필기감을 구현한다.
 */
import type { FlagshipBrushId, WatercolorPigmentId } from "./flagship-showcase-data";

export const MINI_CANVAS_WIDTH = 560;
export const MINI_CANVAS_HEIGHT = 280;

const GRID_COLS = 56;
const GRID_ROWS = 28;
const BIT_BLUE = 1;
const BIT_YELLOW = 2;

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface BrushStrokeOptions {
  readonly brush: FlagshipBrushId;
  readonly pigment: WatercolorPigmentId;
  readonly pressure: number;
  readonly watercolorGrid: Uint8Array;
}

export function createWatercolorGrid(): Uint8Array {
  return new Uint8Array(GRID_COLS * GRID_ROWS);
}

/** 결정적 2층 종이결(고운 섬유 + 거친 황목 골) 해시: 0..1 */
function paperTooth(x: number, y: number): number {
  const fine = Math.sin(x * 0.85 + y * 0.31) * Math.cos(y * 0.91 - x * 0.27);
  const coarse = Math.sin(x * 0.21 - y * 0.17) * Math.sin(y * 0.23 + x * 0.19);
  return Math.max(0, Math.min(1, 0.5 + fine * 0.28 + coarse * 0.22));
}

function oklchColor(l: number, c: number, h: number, alpha = 1): string {
  return alpha < 1 ? `oklch(${l} ${c} ${h} / ${alpha.toFixed(3)})` : `oklch(${l} ${c} ${h})`;
}

export function resolveMiniCanvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return {
      x: ((clientX - rect.left) / rect.width) * MINI_CANVAS_WIDTH,
      y: ((clientY - rect.top) / rect.height) * MINI_CANVAS_HEIGHT,
    };
  }
  return {
    x: Math.max(0, Math.min(MINI_CANVAS_WIDTH, clientX)),
    y: Math.max(0, Math.min(MINI_CANVAS_HEIGHT, clientY)),
  };
}

function markAndCheckOpticalMix(grid: Uint8Array, x: number, y: number, pigment: WatercolorPigmentId): boolean {
  const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor((x / MINI_CANVAS_WIDTH) * GRID_COLS)));
  const row = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor((y / MINI_CANVAS_HEIGHT) * GRID_ROWS)));
  const idx = row * GRID_COLS + col;
  const bit = pigment === "cobalt" ? BIT_BLUE : BIT_YELLOW;
  const next = (grid[idx] ?? 0) | bit;
  grid[idx] = next;
  return (next & (BIT_BLUE | BIT_YELLOW)) === (BIT_BLUE | BIT_YELLOW);
}

function paintPencil6b(
  ctx: CanvasRenderingContext2D,
  from: CanvasPoint,
  to: CanvasPoint,
  pressure: number,
): void {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(2, Math.ceil(dist / 2.2));
  const spread = 3.6 + pressure * 3.8;
  ctx.save();
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const cx = from.x + (to.x - from.x) * t;
    const cy = from.y + (to.y - from.y) * t;
    // 2층 종이결: 1층 고운 흑연 코어 + 2층 종이 돌기 입자
    for (let grain = 0; grain < 6; grain += 1) {
      const angle = (grain * 1.047) + t * 3.1;
      const radius = ((grain % 3) + 0.6) * (spread / 3);
      const gx = cx + Math.cos(angle) * radius;
      const gy = cy + Math.sin(angle) * radius;
      const tooth = paperTooth(gx, gy);
      if (tooth > 0.34) {
        const alpha = (0.14 + tooth * 0.42) * Math.min(1.15, 0.55 + pressure);
        ctx.fillStyle = oklchColor(0.24, 0.015, 260, alpha);
        ctx.fillRect(gx, gy, 1.5 + tooth * 1.4, 1.4 + tooth * 1.1);
      }
    }
  }
  ctx.restore();
}

function paintWaxCrayon(
  ctx: CanvasRenderingContext2D,
  from: CanvasPoint,
  to: CanvasPoint,
  pressure: number,
): void {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(2, Math.ceil(dist / 2.8));
  const radius = 5.5 + pressure * 4.5;
  ctx.save();
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const cx = from.x + (to.x - from.x) * t;
    const cy = from.y + (to.y - from.y) * t;
    for (let d = 0; d < 9; d += 1) {
      const ox = ((d % 3) - 1) * (radius * 0.58);
      const oy = (Math.floor(d / 3) - 1) * (radius * 0.58);
      const tooth = paperTooth(cx + ox, cy + oy);
      if (tooth > 0.42) {
        ctx.fillStyle = oklchColor(0.58, 0.19, 34, 0.28 + tooth * 0.48);
        ctx.fillRect(cx + ox, cy + oy, 3.1, 2.4);
      }
    }
  }
  ctx.restore();
}

function paintWatercolor(
  ctx: CanvasRenderingContext2D,
  from: CanvasPoint,
  to: CanvasPoint,
  pressure: number,
  pigment: WatercolorPigmentId,
  grid: Uint8Array,
): boolean {
  const width = 14 + pressure * 10;
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(2, Math.ceil(dist / 5));
  let mixed = false;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 수채 기본 습윤 워시 + 가장자리 워터블룸
  const baseColor = pigment === "cobalt"
    ? oklchColor(0.52, 0.19, 256, 0.24)
    : oklchColor(0.82, 0.17, 92, 0.32);
  const coreColor = pigment === "cobalt"
    ? oklchColor(0.49, 0.2, 256, 0.56)
    : oklchColor(0.8, 0.18, 92, 0.62);

  ctx.strokeStyle = baseColor;
  ctx.lineWidth = width * 1.45;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.strokeStyle = coreColor;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  // 쿠벨카-문크 광학 겹침 영역 감지 -> 탁한 회색이 아닌 맑은 에메랄드 초록 합성
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const px = from.x + (to.x - from.x) * t;
    const py = from.y + (to.y - from.y) * t;
    if (markAndCheckOpticalMix(grid, px, py, pigment)) {
      mixed = true;
      ctx.fillStyle = oklchColor(0.61, 0.19, 152, 0.42);
      ctx.beginPath();
      ctx.arc(px, py, width * 0.54, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  return mixed;
}

function paintOil48(
  ctx: CanvasRenderingContext2D,
  from: CanvasPoint,
  to: CanvasPoint,
  pressure: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const halfSpan = 6.5 + pressure * 4.5;

  ctx.save();
  ctx.lineCap = "round";
  // 48돈모를 대표하는 방향성 브리슬 필라멘트 묶음 + 미세 임파스토 하이라이트
  const strands = 12;
  for (let s = 0; s < strands; s += 1) {
    const ratio = (s / (strands - 1)) * 2 - 1;
    const offset = ratio * halfSpan;
    const lightness = s % 3 === 0 ? 0.56 : s % 3 === 1 ? 0.48 : 0.41;
    ctx.strokeStyle = oklchColor(lightness, 0.14, 212, 0.72);
    ctx.lineWidth = 1.6 + (s % 2) * 0.6;
    ctx.beginPath();
    ctx.moveTo(from.x + nx * offset, from.y + ny * offset);
    ctx.lineTo(to.x + nx * offset, to.y + ny * offset);
    ctx.stroke();
  }
  // 상단 임파스토 능선광
  ctx.strokeStyle = oklchColor(0.76, 0.08, 200, 0.45);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(from.x + nx * (halfSpan * 0.7), from.y + ny * (halfSpan * 0.7));
  ctx.lineTo(to.x + nx * (halfSpan * 0.7), to.y + ny * (halfSpan * 0.7));
  ctx.stroke();
  ctx.restore();
}

function paintGPen(
  ctx: CanvasRenderingContext2D,
  from: CanvasPoint,
  to: CanvasPoint,
  pressure: number,
): void {
  const velocity = Math.hypot(to.x - from.x, to.y - from.y);
  const taper = Math.max(0.45, Math.min(1.45, (pressure > 0 ? pressure + 0.3 : 0.85) - velocity * 0.012));
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = oklchColor(0.18, 0.02, 265, 0.98);
  ctx.lineWidth = Math.max(1.4, 4.6 * taper);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

export function paintMiniBrushSegment(
  ctx: CanvasRenderingContext2D,
  from: CanvasPoint,
  to: CanvasPoint,
  options: BrushStrokeOptions,
): { readonly opticalMixTriggered: boolean } {
  const pressure = options.pressure > 0 ? Math.min(1, options.pressure) : 0.62;
  switch (options.brush) {
    case "pencil6b":
      paintPencil6b(ctx, from, to, pressure);
      return { opticalMixTriggered: false };
    case "crayon":
      paintWaxCrayon(ctx, from, to, pressure);
      return { opticalMixTriggered: false };
    case "watercolor": {
      const mixed = paintWatercolor(ctx, from, to, pressure, options.pigment, options.watercolorGrid);
      return { opticalMixTriggered: mixed };
    }
    case "oil48":
      paintOil48(ctx, from, to, pressure);
      return { opticalMixTriggered: false };
    case "gpen":
      paintGPen(ctx, from, to, pressure);
      return { opticalMixTriggered: false };
  }
}

/** 1클릭 쿠벨카-문크 파랑+노랑=초록 광학 혼색 시연 곡선 */
export function paintKubelkaMunkDemo(ctx: CanvasRenderingContext2D, grid: Uint8Array): void {
  const bluePts: readonly CanvasPoint[] = [
    { x: 96, y: 174 },
    { x: 184, y: 122 },
    { x: 282, y: 148 },
    { x: 374, y: 126 },
  ];
  const yellowPts: readonly CanvasPoint[] = [
    { x: 454, y: 108 },
    { x: 356, y: 158 },
    { x: 268, y: 142 },
    { x: 176, y: 172 },
  ];
  for (let i = 1; i < bluePts.length; i += 1) {
    const prev = bluePts[i - 1];
    const curr = bluePts[i];
    if (prev && curr) paintWatercolor(ctx, prev, curr, 0.82, "cobalt", grid);
  }
  for (let i = 1; i < yellowPts.length; i += 1) {
    const prev = yellowPts[i - 1];
    const curr = yellowPts[i];
    if (prev && curr) paintWatercolor(ctx, prev, curr, 0.84, "saffron", grid);
  }
}
