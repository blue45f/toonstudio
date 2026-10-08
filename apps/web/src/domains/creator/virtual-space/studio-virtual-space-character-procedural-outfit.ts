/**
 * 프로시저럴 캐릭터 의상 디테일 페인터
 *
 * `drawFigure`가 몸통을 채운 직후 outfit-detail 레이어(`PROCEDURAL_PAINT_ORDER`)로 호출한다.
 * 의상 스타일별 깃·단추·주머니·무늬를 96×112 논리 셀 좌표 그대로 덧그린다.
 * `bob`에는 호흡/걷기 바운스와 앉기 낙차가 합쳐져 들어오고, 그 절반만큼 디테일을 내린다.
 */

import { circle, INK, roundRect, strokePath } from "./studio-virtual-space-character-procedural-canvas";
import type { StudioVirtualAvatarOutfitStyle } from "./studio-virtual-space-model";

export function drawOutfitDetail(
  ctx: CanvasRenderingContext2D,
  style: StudioVirtualAvatarOutfitStyle,
  accent: string,
  bob: number,
): void {
  const line = "rgba(0,0,0,0.22)";
  const y = bob * 0.5;
  switch (style) {
    case "hoodie":
      ctx.strokeStyle = line;
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      strokePath(ctx, () => { ctx.moveTo(38, 60 + y); ctx.quadraticCurveTo(48, 51 + y, 58, 60 + y); });
      ctx.fillStyle = line;
      roundRect(ctx, 41, 73 + y, 14, 9, 3);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      strokePath(ctx, () => { ctx.moveTo(45, 63 + y); ctx.lineTo(45, 71 + y); });
      strokePath(ctx, () => { ctx.moveTo(51, 63 + y); ctx.lineTo(51, 71 + y); });
      break;
    case "tee":
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.9;
      circle(ctx, 48, 69 + y, 4);
      ctx.globalAlpha = 1;
      break;
    case "jacket":
      ctx.fillStyle = line;
      ctx.beginPath();
      ctx.moveTo(48, 60 + y); ctx.lineTo(42, 72 + y); ctx.lineTo(48, 80 + y); ctx.lineTo(54, 72 + y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      strokePath(ctx, () => { ctx.moveTo(48, 60 + y); ctx.lineTo(48, 90 + y); });
      ctx.globalAlpha = 1;
      break;
    case "dress":
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(37, 76 + y); ctx.lineTo(29, 96 + y); ctx.lineTo(67, 96 + y); ctx.lineTo(59, 76 + y);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = line;
      roundRect(ctx, 36, 74 + y, 24, 4, 2);
      break;
    case "suit":
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(48, 60 + y); ctx.lineTo(43, 70 + y); ctx.lineTo(48, 76 + y); ctx.lineTo(53, 70 + y);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(48, 63 + y); ctx.lineTo(45, 69 + y); ctx.lineTo(48, 82 + y); ctx.lineTo(51, 69 + y);
      ctx.closePath(); ctx.fill();
      break;
    case "sweater":
      ctx.fillStyle = line;
      roundRect(ctx, 42, 56 + y, 12, 5, 2.5);
      ctx.lineWidth = 2;
      ctx.strokeStyle = line;
      strokePath(ctx, () => { ctx.moveTo(34, 70 + y); ctx.lineTo(62, 70 + y); });
      strokePath(ctx, () => { ctx.moveTo(34, 78 + y); ctx.lineTo(62, 78 + y); });
      break;
    case "uniform":
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2.5;
      strokePath(ctx, () => { ctx.moveTo(42, 58 + y); ctx.lineTo(48, 63 + y); ctx.lineTo(54, 58 + y); });
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK;
      circle(ctx, 48, 70 + y, 1.6);
      circle(ctx, 48, 76 + y, 1.6);
      ctx.fillStyle = line;
      roundRect(ctx, 53, 66 + y, 7, 6, 1.5);
      break;
    case "apron":
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      strokePath(ctx, () => { ctx.moveTo(41, 58 + y); ctx.lineTo(41, 68 + y); });
      strokePath(ctx, () => { ctx.moveTo(55, 58 + y); ctx.lineTo(55, 68 + y); });
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.8;
      roundRect(ctx, 39, 66 + y, 18, 22, 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = line;
      roundRect(ctx, 43, 76 + y, 10, 7, 2);
      break;
    case "coat":
      ctx.fillStyle = line;
      ctx.globalAlpha = 0.35;
      roundRect(ctx, 31, 58 + y, 34, 38, 10);
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(31, 74 + y, 34, 5);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 2.5;
      strokePath(ctx, () => { ctx.moveTo(42, 58 + y); ctx.lineTo(48, 64 + y); ctx.lineTo(54, 58 + y); });
      ctx.globalAlpha = 1;
      break;
    case "sportswear":
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(33, 66 + y, 30, 5);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      strokePath(ctx, () => { ctx.moveTo(27, 68.5 + y); ctx.lineTo(34, 68.5 + y); });
      strokePath(ctx, () => { ctx.moveTo(62, 68.5 + y); ctx.lineTo(69, 68.5 + y); });
      break;
    case "cardigan":
      ctx.strokeStyle = line;
      ctx.lineWidth = 2.5;
      strokePath(ctx, () => { ctx.moveTo(48, 60 + y); ctx.lineTo(48, 90 + y); });
      ctx.fillStyle = INK;
      circle(ctx, 48, 68 + y, 1.6);
      circle(ctx, 48, 75 + y, 1.6);
      circle(ctx, 48, 82 + y, 1.6);
      break;
    case "overalls":
      ctx.fillStyle = accent;
      ctx.fillRect(40, 56 + y, 5, 16);
      ctx.fillRect(51, 56 + y, 5, 16);
      ctx.globalAlpha = 0.85;
      roundRect(ctx, 40, 70 + y, 16, 13, 3);
      ctx.globalAlpha = 1;
      ctx.fillStyle = line;
      roundRect(ctx, 44, 74 + y, 8, 5, 1.5);
      break;
    case "blazer":
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(43, 59 + y); ctx.lineTo(53, 59 + y); ctx.lineTo(48, 72 + y);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = line;
      ctx.lineWidth = 2.5;
      strokePath(ctx, () => { ctx.moveTo(43, 59 + y); ctx.lineTo(47, 72 + y); });
      strokePath(ctx, () => { ctx.moveTo(53, 59 + y); ctx.lineTo(49, 72 + y); });
      ctx.fillStyle = INK;
      circle(ctx, 48, 79 + y, 1.7);
      ctx.fillStyle = line;
      roundRect(ctx, 54, 72 + y, 7, 5, 1.5);
      break;
    case "turtleneck":
      ctx.fillStyle = line;
      roundRect(ctx, 42, 53 + y, 12, 8, 3);
      ctx.globalAlpha = 0.5;
      roundRect(ctx, 44, 55 + y, 8, 4, 2);
      ctx.globalAlpha = 1;
      break;
    case "denim":
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.6;
      strokePath(ctx, () => { ctx.moveTo(44, 62 + y); ctx.lineTo(44, 88 + y); });
      strokePath(ctx, () => { ctx.moveTo(52, 62 + y); ctx.lineTo(52, 88 + y); });
      ctx.strokeStyle = line;
      ctx.lineWidth = 2.5;
      strokePath(ctx, () => { ctx.moveTo(42, 58 + y); ctx.lineTo(48, 65 + y); ctx.lineTo(54, 58 + y); });
      ctx.fillStyle = line;
      roundRect(ctx, 35, 68 + y, 9, 6, 1.5);
      roundRect(ctx, 52, 68 + y, 9, 6, 1.5);
      break;
    case "polo":
      ctx.fillStyle = line;
      ctx.beginPath();
      ctx.moveTo(41, 58 + y); ctx.lineTo(48, 66 + y); ctx.lineTo(44, 58 + y);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(55, 58 + y); ctx.lineTo(48, 66 + y); ctx.lineTo(52, 58 + y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = INK;
      circle(ctx, 48, 70 + y, 1.5);
      circle(ctx, 48, 76 + y, 1.5);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(46, 82 + y, 4, 4);
      ctx.globalAlpha = 1;
      break;
    case "hanbok":
      // 저고리 깃 교차 + 고름 리본 + 치마 실루엣
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 3;
      strokePath(ctx, () => { ctx.moveTo(40, 58 + y); ctx.lineTo(52, 70 + y); });
      strokePath(ctx, () => { ctx.moveTo(56, 58 + y); ctx.lineTo(44, 70 + y); });
      ctx.fillStyle = accent;
      roundRect(ctx, 44, 70 + y, 4, 15, 2);
      roundRect(ctx, 50, 72 + y, 4, 13, 2);
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(36, 76 + y); ctx.lineTo(28, 98 + y); ctx.lineTo(68, 98 + y); ctx.lineTo(60, 76 + y);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case "sailor":
      ctx.fillStyle = line;
      roundRect(ctx, 37, 55 + y, 22, 11, 3);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      strokePath(ctx, () => { ctx.moveTo(38, 60 + y); ctx.lineTo(58, 60 + y); });
      strokePath(ctx, () => { ctx.moveTo(38, 64 + y); ctx.lineTo(58, 64 + y); });
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(48, 66 + y); ctx.lineTo(43, 74 + y); ctx.lineTo(53, 74 + y);
      ctx.closePath(); ctx.fill();
      circle(ctx, 48, 66 + y, 2.4);
      break;
    default:
      break;
  }
}
