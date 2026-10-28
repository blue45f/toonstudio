import { readStudioVirtualAvatarProfile } from "../studio-virtual-space-avatar-store";
import type { StudioVirtualAvatarProfile, StudioVirtualSpaceFacing } from "../studio-virtual-space-model";
import { onSpriteSheetConfigChanged } from "../studio-virtual-space-sprite-sheet";
import type { Office2dCanvas2D } from "./office2d-procedural-art";
import { office2dRoundRect } from "./office2d-procedural-art";

/** 기존 꾸미기 저장/초기화 알림을 재사용하고 프레임마다 저장소를 읽지 않는다. */
export function createOffice2dAvatarProfileSource(): {
  readonly get: () => StudioVirtualAvatarProfile | null;
  readonly dispose: () => void;
} {
  let profile = readStudioVirtualAvatarProfile();
  const refresh = () => { profile = readStudioVirtualAvatarProfile(); };
  const unsubscribe = onSpriteSheetConfigChanged(refresh);
  if (typeof window !== "undefined") window.addEventListener("storage", refresh);
  return {
    get: () => profile,
    dispose: () => {
      unsubscribe();
      if (typeof window !== "undefined") window.removeEventListener("storage", refresh);
    },
  };
}

export interface Office2dAccessoryPlacement {
  readonly facing: StudioVirtualSpaceFacing;
  readonly footX: number;
  readonly footY: number;
  readonly width: number;
  readonly height: number;
  readonly tiltRad: number;
  readonly offset?: { readonly x: number; readonly y: number };
}

/** 보행/작업 시트와 같은 128×192 셀·발끝(188px) 기준으로 액세서리를 합성한다. */
export function paintOffice2dAvatarAccessory(
  ctx: Office2dCanvas2D,
  profile: StudioVirtualAvatarProfile,
  placement: Office2dAccessoryPlacement,
): void {
  const kind = profile.accessory;
  if (kind === "none") return;
  const { facing } = placement;
  const back = facing === "up";
  const side = facing === "left" || facing === "right";
  if (back && (kind === "glasses" || kind === "sunglasses")) return;
  ctx.save();
  ctx.translate(placement.footX, placement.footY);
  ctx.rotate(placement.tiltRad);
  ctx.scale(placement.width / 128, placement.height / 192);
  ctx.translate(-64 + (placement.offset?.x ?? 0), -188 + (placement.offset?.y ?? 0));
  // 옆모습도 동일한 실루엣을 뒤집어 안경·가방이 바라보는 방향을 따르게 한다.
  if (facing === "left") { ctx.translate(128, 0); ctx.scale(-1, 1); }
  ctx.fillStyle = profile.accent;
  ctx.strokeStyle = "#302b39";
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const ellipse = (x: number, y: number, rx: number, ry: number) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  const box = (x: number, y: number, width: number, height: number, radius = 5) => {
    office2dRoundRect(ctx, x, y, width, height, radius); ctx.fill(); ctx.stroke();
  };
  switch (kind) {
    case "beret":
      ellipse(side ? 63 : 58, 19, side ? 25 : 31, 12);
      box(59, 4, 6, 9, 2);
      break;
    case "cap":
    case "beanie":
      ctx.beginPath(); ctx.moveTo(31, 31); ctx.quadraticCurveTo(31, 4, 64, 7);
      ctx.quadraticCurveTo(97, 4, 97, 31); ctx.closePath(); ctx.fill(); ctx.stroke();
      box(29, 26, 70, kind === "beanie" ? 12 : 7, 4);
      if (kind === "beanie") ellipse(64, 6, 6, 6);
      else if (!back) ellipse(side ? 92 : 65, 34, side ? 20 : 31, 5);
      break;
    case "headband":
      ctx.lineWidth = 8; ctx.strokeStyle = profile.accent;
      ctx.beginPath(); ctx.moveTo(30, 38); ctx.quadraticCurveTo(64, 7, 98, 38); ctx.stroke();
      break;
    case "headphones":
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(29, 58); ctx.quadraticCurveTo(22, 8, 64, 11);
      ctx.quadraticCurveTo(106, 8, 99, 58); ctx.stroke();
      ctx.lineWidth = 2.4;
      if (!side) box(23, 47, 13, 23, 6);
      box(side ? 55 : 92, 47, 13, 23, 6);
      break;
    case "cat":
      ctx.beginPath(); ctx.moveTo(31, 31); ctx.lineTo(30, 6); ctx.lineTo(51, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(79, 22); ctx.lineTo(99, 6); ctx.lineTo(96, 32); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#f7b5c4";
      ctx.beginPath(); ctx.moveTo(35, 24); ctx.lineTo(35, 14); ctx.lineTo(44, 23);
      ctx.moveTo(86, 23); ctx.lineTo(94, 14); ctx.lineTo(92, 25); ctx.fill();
      break;
    case "glasses":
    case "sunglasses": {
      const dark = kind === "sunglasses";
      ctx.fillStyle = dark ? "#25283c" : "rgba(225, 247, 255, 0.26)";
      if (side) {
        box(73, 50, 23, 17, 5);
        ctx.beginPath(); ctx.moveTo(73, 55); ctx.lineTo(52, 51); ctx.stroke();
      } else {
        box(38, 50, 23, 17, 6); box(67, 50, 23, 17, 6);
        ctx.beginPath(); ctx.moveTo(61, 56); ctx.lineTo(67, 56); ctx.stroke();
      }
      if (dark) {
        ctx.strokeStyle = "rgba(255,255,255,0.65)";
        ctx.beginPath(); ctx.moveTo(side ? 79 : 44, 61); ctx.lineTo(side ? 88 : 53, 54); ctx.stroke();
      }
      break;
    }
    case "bow":
      ctx.beginPath(); ctx.moveTo(84, 25); ctx.lineTo(68, 14); ctx.lineTo(68, 35);
      ctx.lineTo(84, 25); ctx.lineTo(103, 14); ctx.lineTo(102, 35); ctx.closePath(); ctx.fill(); ctx.stroke();
      ellipse(85, 25, 5, 5);
      break;
    case "leaf":
      ctx.fillStyle = "#62bd88";
      ctx.beginPath(); ctx.moveTo(79, 25); ctx.quadraticCurveTo(83, 8, 103, 15);
      ctx.quadraticCurveTo(99, 34, 79, 25); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(79, 25); ctx.lineTo(96, 18); ctx.stroke();
      break;
    case "star":
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radius = i % 2 === 0 ? 13 : 6;
        const x = 89 + Math.cos(angle) * radius, y = 28 + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case "flower":
      for (let i = 0; i < 5; i += 1) {
        const angle = i * Math.PI * 2 / 5;
        ellipse(89 + Math.cos(angle) * 7, 27 + Math.sin(angle) * 7, 5, 5);
      }
      ctx.fillStyle = "#ffe493"; ellipse(89, 27, 5, 5);
      break;
    case "backpack":
      if (back || side) box(side ? 32 : 43, 88, side ? 24 : 43, 52, 10);
      else { box(40, 89, 7, 40, 3); box(80, 89, 7, 40, 3); }
      if (back) box(49, 112, 31, 20, 5);
      break;
    case "tote":
      ctx.beginPath(); ctx.moveTo(85, 105); ctx.quadraticCurveTo(106, 96, 105, 130); ctx.stroke();
      box(side ? 78 : 91, 125, 28, 30, 5);
      break;
    case "scarf":
      box(43, 82, 43, 13, 6);
      box(side ? 73 : 67, 91, 12, 30, 4);
      break;
  }
  ctx.restore();
}
