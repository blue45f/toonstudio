/**
 * ToonOffice 2D 절차형 아트: 바닥 재질·벽·접지 그림자·이미지 없을 때의 폴백 가구와 캐릭터.
 *
 * 바닥은 방마다 고정 시드 난수로 그려 매번 같은 결과가 나오고, 렌더러가 청크 캐시에 한 번만 굽는다.
 * 브라우저 캔버스 전체가 아니라 실제로 쓰는 메서드만 모은 Office2dCanvas2D 인터페이스로 그려서 테스트 대역을 쉽게 만든다.
 */
import type { Office2dFloorRegion, Office2dWall } from "./office2d-scene";

export type Office2dCanvas2D = Pick<CanvasRenderingContext2D,
  | "save" | "restore" | "translate" | "scale" | "rotate" | "setTransform" | "fillRect" | "strokeRect" | "clearRect"
  | "beginPath" | "closePath" | "moveTo" | "lineTo" | "arc" | "ellipse" | "quadraticCurveTo" | "rect" | "fill" | "stroke"
  | "drawImage" | "fillText" | "measureText" | "createLinearGradient" | "createRadialGradient" | "clip" | "setLineDash"
  | "fillStyle" | "strokeStyle" | "lineWidth" | "globalAlpha" | "globalCompositeOperation" | "font" | "textAlign" | "textBaseline"
  | "imageSmoothingEnabled" | "lineJoin" | "lineCap">;

/** 결정적 난수(mulberry32). */
export function office2dRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function office2dRoundRect(ctx: Office2dCanvas2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

interface PlankPalette { readonly base: string; readonly alt: string; readonly seam: string; readonly grain: string }

function planks(ctx: Office2dCanvas2D, region: Office2dFloorRegion, palette: PlankPalette, random: () => number): void {
  const plankHeight = 16;
  const plankLength = 112;
  for (let row = 0, y = region.y; y < region.y + region.height; row += 1, y += plankHeight) {
    const offset = (row * 37) % plankLength;
    for (let x = region.x - offset; x < region.x + region.width; x += plankLength) {
      ctx.fillStyle = random() > 0.5 ? palette.base : palette.alt;
      ctx.fillRect(x, y, plankLength, plankHeight);
      ctx.fillStyle = palette.grain;
      ctx.globalAlpha = 0.18;
      for (let index = 0; index < 3; index += 1) ctx.fillRect(x + 6 + random() * (plankLength - 24), y + 3 + random() * 9, 10 + random() * 26, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.seam;
      ctx.fillRect(x, y, 1, plankHeight);
    }
    ctx.fillStyle = palette.seam;
    ctx.fillRect(region.x, y + plankHeight - 1, region.width, 1);
  }
}

function herringbone(ctx: Office2dCanvas2D, region: Office2dFloorRegion, palette: PlankPalette, random: () => number): void {
  const unit = 12;
  const length = 48;
  ctx.fillStyle = palette.base;
  ctx.fillRect(region.x, region.y, region.width, region.height);
  for (let y = region.y - length; y < region.y + region.height + length; y += unit * 2) {
    for (let x = region.x - length; x < region.x + region.width + length; x += length) {
      const shift = ((Math.round((y - region.y) / (unit * 2)) % 2) + 2) % 2 === 0 ? 0 : length / 2;
      // 가로 판
      ctx.fillStyle = random() > 0.5 ? palette.base : palette.alt;
      ctx.fillRect(x + shift, y, length / 2, unit);
      ctx.fillStyle = palette.seam;
      ctx.fillRect(x + shift, y + unit - 1, length / 2, 1);
      ctx.fillRect(x + shift + length / 2 - 1, y, 1, unit);
      // 세로 판
      ctx.fillStyle = random() > 0.5 ? palette.alt : palette.base;
      ctx.fillRect(x + shift + length / 2, y, unit, unit * 2);
      ctx.fillStyle = palette.seam;
      ctx.fillRect(x + shift + length / 2 + unit - 1, y, 1, unit * 2);
      ctx.fillRect(x + shift + length / 2, y + unit * 2 - 1, unit, 1);
    }
  }
}

function speckle(ctx: Office2dCanvas2D, region: Office2dFloorRegion, base: string, flecks: readonly string[], density: number, random: () => number, size = 2): void {
  ctx.fillStyle = base;
  ctx.fillRect(region.x, region.y, region.width, region.height);
  const count = Math.round((region.width * region.height) / 1000 * density);
  for (let index = 0; index < count; index += 1) {
    ctx.fillStyle = flecks[Math.floor(random() * flecks.length)] ?? base;
    ctx.fillRect(region.x + random() * region.width, region.y + random() * region.height, size, size);
  }
}

function tiles(ctx: Office2dCanvas2D, region: Office2dFloorRegion, size: number, base: string, alt: string, grout: string, random: () => number): void {
  for (let y = region.y; y < region.y + region.height; y += size) {
    for (let x = region.x; x < region.x + region.width; x += size) {
      ctx.fillStyle = random() > 0.82 ? alt : base;
      ctx.fillRect(x, y, size, size);
    }
  }
  ctx.fillStyle = grout;
  for (let y = region.y; y <= region.y + region.height; y += size) ctx.fillRect(region.x, y, region.width, 1);
  for (let x = region.x; x <= region.x + region.width; x += size) ctx.fillRect(x, region.y, 1, region.height);
}

/** 방 바닥 한 칸을 그린다. 렌더러가 청크 단위로 잘라(clip) 호출한다. */
export function paintOffice2dFloor(ctx: Office2dCanvas2D, region: Office2dFloorRegion, genericTone = "#e9e1d2"): void {
  const random = office2dRandom(region.seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.width, region.height);
  ctx.clip();
  switch (region.floor) {
    case "oak": planks(ctx, region, { base: "#dcbb92", alt: "#d4b086", seam: "#b38b63", grain: "#9c7650" }, random); break;
    case "walnut": planks(ctx, region, { base: "#b48861", alt: "#aa7d57", seam: "#7c5638", grain: "#6b472c" }, random); break;
    case "herringbone": herringbone(ctx, region, { base: "#d7af82", alt: "#cda477", seam: "#a57b54", grain: "#8d6744" }, random); break;
    case "carpet-sage": speckle(ctx, region, "#a9bf9f", ["#a2b898", "#b1c6a7", "#a5bb9b"], 14, random); break;
    case "carpet-navy": speckle(ctx, region, "#4d5d82", ["#48587c", "#55668b", "#506186"], 14, random); break;
    case "terrazzo": speckle(ctx, region, "#ebe5da", ["#ddd3c4", "#e4cfc6", "#d3dccf", "#d8d5e2", "#eadcbf"], 3.2, random, 3); break;
    case "concrete": tiles(ctx, region, 96, "#cfccc6", "#c7c3bc", "#b7b2aa", random); speckleOverlay(ctx, region, random); break;
    case "tile-cream": tiles(ctx, region, 48, "#f2e9d7", "#ebe0ca", "#d8cbb2", random); break;
    case "cork": speckle(ctx, region, "#c99d6b", ["#c09363", "#d2a774", "#b98c5c"], 16, random); break;
    case "generic": ctx.fillStyle = genericTone; ctx.fillRect(region.x, region.y, region.width, region.height); break;
  }
  ctx.restore();
}

function speckleOverlay(ctx: Office2dCanvas2D, region: Office2dFloorRegion, random: () => number): void {
  ctx.globalAlpha = 0.25;
  const count = Math.round((region.width * region.height) / 1800);
  for (let index = 0; index < count; index += 1) {
    ctx.fillStyle = random() > 0.5 ? "#b9b4ab" : "#dedad3";
    ctx.fillRect(region.x + random() * region.width, region.y + random() * region.height, 2, 2);
  }
  ctx.globalAlpha = 1;
}

/** 벽 바로 아래 바닥의 앰비언트 오클루전(부드러운 그늘). */
export function paintOffice2dWallShade(ctx: Office2dCanvas2D, wall: Office2dWall): void {
  if (wall.side === "north") {
    const gradient = ctx.createLinearGradient(0, wall.y + wall.height, 0, wall.y + wall.height + 26);
    gradient.addColorStop(0, "rgba(40, 28, 18, 0.28)");
    gradient.addColorStop(1, "rgba(40, 28, 18, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(wall.x, wall.y + wall.height, wall.width, 26);
  } else if (wall.side === "west" || wall.side === "east") {
    const inner = wall.side === "west" ? wall.x + wall.width : wall.x;
    const gradient = ctx.createLinearGradient(inner, 0, wall.side === "west" ? inner + 16 : inner - 16, 0);
    gradient.addColorStop(0, "rgba(40, 28, 18, 0.2)");
    gradient.addColorStop(1, "rgba(40, 28, 18, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(wall.side === "west" ? inner : inner - 16, wall.y, 16, wall.height);
  }
}

const WALL_CAP = "#5f4c3d";
const WALL_CAP_LIGHT = "#7a6352";

/** 옆벽·남쪽 낮은 벽(위에서 본 윗면). 바닥 패스에서 그린다. */
export function paintOffice2dLowWall(ctx: Office2dCanvas2D, wall: Office2dWall): void {
  ctx.fillStyle = WALL_CAP;
  ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
  ctx.fillStyle = WALL_CAP_LIGHT;
  if (wall.side === "south") {
    ctx.fillRect(wall.x, wall.y, wall.width, 3);
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(wall.x, wall.y + wall.height - 4, wall.width, 4);
  } else {
    ctx.fillRect(wall.side === "west" ? wall.x + wall.width - 3 : wall.x, wall.y, 3, wall.height);
  }
}

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(value) || hex.length !== 7) return hex;
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * (1 + amount))));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/**
 * 북쪽 정면 벽(3/4 시점 벽면). 윗면 캡 + 그라데이션 벽면 + 걸레받이 + 패널 줄눈.
 * 벽 장식 이미지는 렌더러가 이 위에 얹는다.
 */
export function paintOffice2dNorthWall(ctx: Office2dCanvas2D, wall: Office2dWall): void {
  const cap = 12;
  const baseboard = 8;
  ctx.fillStyle = WALL_CAP;
  ctx.fillRect(wall.x, wall.y, wall.width, cap);
  ctx.fillStyle = WALL_CAP_LIGHT;
  ctx.fillRect(wall.x, wall.y + cap - 3, wall.width, 3);
  const face = ctx.createLinearGradient(0, wall.y + cap, 0, wall.y + wall.height);
  face.addColorStop(0, shade(wall.tone, 0.04));
  face.addColorStop(1, shade(wall.tone, -0.1));
  ctx.fillStyle = face;
  ctx.fillRect(wall.x, wall.y + cap, wall.width, wall.height - cap - baseboard);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = shade(wall.tone, -0.35);
  for (let x = wall.x + 96; x < wall.x + wall.width - 8; x += 96) ctx.fillRect(x, wall.y + cap, 1, wall.height - cap - baseboard);
  ctx.globalAlpha = 1;
  ctx.fillStyle = shade(wall.tone, -0.38);
  ctx.fillRect(wall.x, wall.y + wall.height - baseboard, wall.width, baseboard);
  ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
  ctx.fillRect(wall.x, wall.y + wall.height - baseboard, wall.width, 1);
}

/** 북쪽 벽 명판(방 이름). */
export function paintOffice2dWallSign(ctx: Office2dCanvas2D, x: number, y: number, label: string): void {
  ctx.font = "700 13px Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif";
  const width = Math.min(220, ctx.measureText(label).width + 26);
  office2dRoundRect(ctx, x - width / 2, y, width, 24, 6);
  ctx.fillStyle = "#3b2f27";
  ctx.fill();
  ctx.strokeStyle = "#d9b98c";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#f8ecd6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + 12.5);
}

/** 접지 그림자(부드러운 타원). */
export function paintOffice2dShadow(ctx: Office2dCanvas2D, x: number, y: number, radiusX: number, radiusY: number, alpha = 0.24): void {
  if (radiusX <= 0 || radiusY <= 0) return;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radiusX);
  gradient.addColorStop(0, `rgba(30, 20, 12, ${alpha})`);
  gradient.addColorStop(1, "rgba(30, 20, 12, 0)");
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, radiusY / radiusX);
  ctx.translate(-x, -y);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radiusX, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 이미지가 없을 때의 가구 폴백: 윗면 + 앞면 상자. */
export function paintOffice2dFallbackObject(ctx: Office2dCanvas2D, x: number, y: number, width: number, height: number, tone: string): void {
  const top = Math.max(8, height * 0.32);
  ctx.fillStyle = shade(tone, -0.18);
  ctx.fillRect(x - width / 2, y - height + top, width, height - top);
  ctx.fillStyle = shade(tone, 0.12);
  ctx.fillRect(x - width / 2, y - height, width, top);
  ctx.strokeStyle = "rgba(60, 40, 28, 0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - width / 2, y - height, width, height);
}

/** 이미지가 없을 때의 캐릭터 폴백(2등신 실루엣). */
export function paintOffice2dFallbackActor(ctx: Office2dCanvas2D, x: number, y: number, height: number, accent: string, facing: string, phase: number): void {
  const head = height * 0.36;
  const bob = Math.sin(phase) * 1.5;
  ctx.fillStyle = shade(accent, -0.15);
  office2dRoundRect(ctx, x - height * 0.17, y - height * 0.55 + bob, height * 0.34, height * 0.42, 6);
  ctx.fill();
  ctx.fillStyle = "#3b2f2a";
  ctx.fillRect(x - height * 0.12, y - height * 0.14, height * 0.09, height * 0.14);
  ctx.fillRect(x + height * 0.03, y - height * 0.14, height * 0.09, height * 0.14);
  ctx.fillStyle = "#f3d3bd";
  ctx.beginPath();
  ctx.arc(x, y - height * 0.72 + bob, head / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a3426";
  ctx.beginPath();
  ctx.arc(x + (facing === "left" ? 2 : facing === "right" ? -2 : 0), y - height * 0.76 + bob, head / 2, Math.PI, Math.PI * 2);
  ctx.fill();
}
