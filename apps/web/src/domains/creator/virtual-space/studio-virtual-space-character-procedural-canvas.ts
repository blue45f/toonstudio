/**
 * 프로시저럴 캐릭터 드로잉 공용 캔버스 도형
 *
 * `studio-virtual-space-character-procedural.ts`(몸·머리카락·얼굴·액세서리)와
 * `studio-virtual-space-character-procedural-outfit.ts`(의상 디테일)가 함께 쓰는
 * 잉크 색과 채우기·선 도형을 한곳에 둔다. 상태 없이 캔버스 호출만 한다.
 */

/** 표정·단추·안경·헤드폰처럼 진하게 찍는 선과 면에 공통으로 쓰는 잉크 색. */
export const INK = "#26262e";

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  ctx.fill();
}

export function strokePath(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.beginPath();
  draw();
  ctx.stroke();
}
