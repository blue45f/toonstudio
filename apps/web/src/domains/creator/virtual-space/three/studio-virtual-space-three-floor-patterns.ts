/** 3D 바닥의 독립 재질 입력. 2D 테마 키·팔레트·painter를 참조하지 않는다. */
export type StudioThreeFloorPattern = "planks" | "marble" | "carpet" | "deck" | "lawn" | "slate" | "stone" | "sand" | "checker";
export interface StudioThreeFloorSpec {
  readonly pattern: StudioThreeFloorPattern;
  readonly base: number;
  readonly accent: number;
  readonly roughness: number;
  readonly metalness: number;
}

export const STUDIO_THREE_FLOOR_TILE = 128;
const hex = (color: number) => `#${(color & 0xff_ff_ff).toString(16).padStart(6, "0")}`;
function shade(color: number, amount: number): number {
  const channel = (shift: number) => {
    const value = (color >> shift) & 255;
    return Math.max(0, Math.min(255, Math.round(amount >= 0 ? value + (255 - value) * amount : value * (1 + amount))));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
function hash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43_758.5453;
  return value - Math.floor(value);
}
function rect(ctx: CanvasRenderingContext2D, color: number, x: number, y: number, w: number, h: number, alpha = 1): void {
  ctx.globalAlpha = alpha; ctx.fillStyle = hex(color); ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
}
function line(ctx: CanvasRenderingContext2D, color: number, x: number, y: number, endX: number, endY: number, width = 1, alpha = 1): void {
  ctx.globalAlpha = alpha; ctx.strokeStyle = hex(color); ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke(); ctx.globalAlpha = 1;
}
function roundRect(ctx: CanvasRenderingContext2D, color: number, x: number, y: number, w: number, h: number, radius: number, alpha = 1): void {
  ctx.globalAlpha = alpha; ctx.fillStyle = hex(color); ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill(); ctx.globalAlpha = 1;
}
function planks(ctx: CanvasRenderingContext2D, spec: StudioThreeFloorSpec, vertical: boolean): void {
  rect(ctx, spec.base, 0, 0, 128, 128);
  for (let index = 0; index < 4; index += 1) {
    const offset = index * 32, tone = (hash(index, vertical ? 1 : 0) - 0.5) * 0.09;
    if (vertical) rect(ctx, shade(spec.base, tone), offset, 0, 32, 128);
    else rect(ctx, shade(spec.base, tone), 0, offset, 128, 32);
    if (vertical) {
      line(ctx, shade(spec.accent, -0.15), offset, 0, offset, 128, 2, 0.8);
      for (let g = 0; g < 3; g += 1) {
        const x = offset + 8 + hash(index, g + 4) * 16;
        line(ctx, spec.accent, x, 10 + g * 34, x + 3, 34 + g * 34, 1, 0.28);
      }
      const joint = hash(index, 9) * 80 + 20;
      line(ctx, shade(spec.accent, -0.15), offset, joint, offset + 32, joint, 1.5, 0.6);
    } else {
      line(ctx, shade(spec.accent, -0.15), 0, offset, 128, offset, 2, 0.8);
      for (let g = 0; g < 3; g += 1) {
        const y = offset + 8 + hash(index, g + 4) * 16;
        line(ctx, spec.accent, 10 + g * 34, y, 34 + g * 34, y + 3, 1, 0.28);
      }
      const joint = hash(index, 9) * 80 + 20;
      line(ctx, shade(spec.accent, -0.15), joint, offset, joint, offset + 32, 1.5, 0.6);
    }
  }
}
function marble(ctx: CanvasRenderingContext2D, spec: StudioThreeFloorSpec): void {
  rect(ctx, spec.base, 0, 0, 128, 128);
  for (let row = 0; row < 2; row += 1) for (let col = 0; col < 2; col += 1) {
    const x = col * 64, y = row * 64;
    rect(ctx, shade(spec.base, (hash(col + 3, row + 5) - 0.5) * 0.05), x, y, 64, 64);
    ctx.strokeStyle = hex(spec.accent); ctx.globalAlpha = 0.5; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x + 6, y + 14 + hash(col, row) * 20);
    ctx.bezierCurveTo(x + 24, y + 22, x + 34, y + 34, x + 58, y + 44 + hash(row, col) * 10); ctx.stroke();
    ctx.globalAlpha = 0.3; ctx.lineWidth = 0.8; ctx.beginPath();
    ctx.moveTo(x + 20, y + 30); ctx.lineTo(x + 30, y + 40);
    ctx.moveTo(x + 38, y + 18); ctx.lineTo(x + 46, y + 28); ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (let i = 0; i <= 2; i += 1) {
    line(ctx, shade(spec.accent, -0.1), i * 64, 0, i * 64, 128, 1.5, 0.7);
    line(ctx, shade(spec.accent, -0.1), 0, i * 64, 128, i * 64, 1.5, 0.7);
  }
}
function speckle(ctx: CanvasRenderingContext2D, spec: StudioThreeFloorSpec, blades: boolean): void {
  rect(ctx, spec.base, 0, 0, 128, 128);
  for (let i = 0; i < 260; i += 1) {
    const x = hash(i, 1) * 128, y = hash(i, 2) * 128;
    const color = i % 3 === 0 ? shade(spec.base, 0.16) : i % 3 === 1 ? shade(spec.base, -0.13) : spec.accent;
    if (blades) line(ctx, color, x, y, x + (hash(i, 3) - 0.5) * 3, y - 3 - hash(i, 4) * 3, 1.1, 0.55);
    else rect(ctx, color, x, y, 1.8, 1.8, 0.5);
  }
}
function slate(ctx: CanvasRenderingContext2D, spec: StudioThreeFloorSpec): void {
  rect(ctx, shade(spec.base, -0.12), 0, 0, 128, 128);
  for (let row = 0; row < 2; row += 1) for (let col = 0; col < 2; col += 1) {
    rect(ctx, shade(spec.base, (hash(col + 7, row + 2) - 0.5) * 0.07), col * 64 + 1, row * 64 + 1, 62, 62);
    rect(ctx, shade(spec.base, 0.14), col * 64 + 5, row * 64 + 4, 54, 2, 0.35);
  }
  for (let i = 0; i <= 2; i += 1) {
    line(ctx, spec.accent, i * 64, 0, i * 64, 128, 1.6, 0.85);
    line(ctx, spec.accent, 0, i * 64, 128, i * 64, 1.6, 0.85);
  }
}
function stone(ctx: CanvasRenderingContext2D, spec: StudioThreeFloorSpec): void {
  rect(ctx, spec.accent, 0, 0, 128, 128);
  for (let row = 0; row * 34 < 162; row += 1) for (let col = -1; col * 44 < 172; col += 1) {
    const x = col * 44 + (row % 2 === 0 ? 0 : 22), y = row * 34;
    roundRect(ctx, shade(spec.base, (hash(col + 11, row + 13) - 0.5) * 0.1), x + 2, y + 2, 40, 30, 9);
    roundRect(ctx, shade(spec.base, 0.18), x + 6, y + 5, 30, 6, 3, 0.4);
  }
}
function checker(ctx: CanvasRenderingContext2D, spec: StudioThreeFloorSpec): void {
  for (let row = 0; row < 4; row += 1) for (let col = 0; col < 4; col += 1) {
    const color = (col + row) % 2 === 0 ? spec.base : spec.accent;
    rect(ctx, color, col * 32, row * 32, 32, 32);
    rect(ctx, shade(color, 0.1), col * 32 + 2, row * 32 + 2, 28, 3, 0.35);
  }
}

/** 기존 3D baseline 타일의 결정적 무늬를 보존하되 3D가 별도 소유한다. */
export function paintStudioThreeFloor(context: CanvasRenderingContext2D, spec: StudioThreeFloorSpec): void {
  switch (spec.pattern) {
    case "planks": planks(context, spec, false); break;
    case "deck": planks(context, spec, true); break;
    case "marble": marble(context, spec); break;
    case "carpet": case "sand": speckle(context, spec, false); break;
    case "lawn": speckle(context, spec, true); break;
    case "slate": slate(context, spec); break;
    case "stone": stone(context, spec); break;
    case "checker": checker(context, spec); break;
  }
}
