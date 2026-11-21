/**
 * 프로시저럴 파티클 스프라이트 (기본 9종 고화질 + 드라마틱 연출 VFX 10종).
 *
 * - 기본 9종(`dust`·`sparkle`·`raindrop`·`snowflake`·`leaf`·`smoke`·`confetti`·`splash`·`petal`)은
 *   하위 호환을 유지하면서 다층 하이라이트·잉크 윤곽·소프트 글로우로 작화 품질을 끌어올렸다.
 * - 드라마틱 VFX 10종(`speedline`·`magic-rune`·`rose-petal`·`flame-aura`·`shockwave-ring`·
 *   `music-note`·`spotlight-beam`·`healing-mint`·`confetti-star`·`steam-heart`)은
 *   20종 화려한 연출 카탈로그와 체조/댄스 전용 이펙트에 바로 결합된다.
 */

import { defaultProceduralSheetDeps, type ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";
import type { StudioDramaticVfxId } from "./studio-virtual-space-dramatic-vfx-catalog";

/** 기본 파티클 스프라이트 9종(기존 시뮬레이션 1:1 계약 유지). */
export type StudioParticleSpriteKind =
  | "dust"
  | "sparkle"
  | "raindrop"
  | "snowflake"
  | "leaf"
  | "smoke"
  | "confetti"
  | "splash"
  | "petal";

export const STUDIO_PARTICLE_SPRITE_KINDS: readonly StudioParticleSpriteKind[] = Object.freeze([
  "dust", "sparkle", "raindrop", "snowflake", "leaf", "smoke", "confetti", "splash", "petal",
]);

/** 화려한 드라마틱 연출 VFX 전용 파티클 스프라이트 10종. */
export type StudioDramaticParticleSpriteKind =
  | "speedline"
  | "magic-rune"
  | "rose-petal"
  | "flame-aura"
  | "shockwave-ring"
  | "music-note"
  | "spotlight-beam"
  | "healing-mint"
  | "confetti-star"
  | "steam-heart";

export const STUDIO_DRAMATIC_PARTICLE_SPRITE_KINDS: readonly StudioDramaticParticleSpriteKind[] = Object.freeze([
  "speedline",
  "magic-rune",
  "rose-petal",
  "flame-aura",
  "shockwave-ring",
  "music-note",
  "spotlight-beam",
  "healing-mint",
  "confetti-star",
  "steam-heart",
]);

interface ParticleMeta {
  readonly ko: string;
  readonly en: string;
  readonly cell: number;
  readonly frames: number;
}

const META: Readonly<Record<StudioParticleSpriteKind, ParticleMeta>> = Object.freeze({
  dust:      { ko: "먼지", en: "Dust", cell: 24, frames: 4 },
  sparkle:   { ko: "반짝임", en: "Sparkle", cell: 24, frames: 4 },
  raindrop:  { ko: "빗방울", en: "Raindrop", cell: 16, frames: 2 },
  snowflake: { ko: "눈송이", en: "Snowflake", cell: 20, frames: 2 },
  leaf:      { ko: "나뭇잎", en: "Leaf", cell: 20, frames: 3 },
  smoke:     { ko: "연기", en: "Smoke", cell: 32, frames: 4 },
  confetti:  { ko: "색종이 조각", en: "Confetti", cell: 16, frames: 3 },
  splash:    { ko: "물튐", en: "Splash", cell: 28, frames: 4 },
  petal:     { ko: "꽃잎", en: "Petal", cell: 20, frames: 3 },
});

const DRAMATIC_META: Readonly<Record<StudioDramaticParticleSpriteKind, ParticleMeta>> = Object.freeze({
  speedline:       { ko: "대시 스피드라인", en: "Dash Speedline", cell: 32, frames: 3 },
  "magic-rune":    { ko: "마법진 룬 링", en: "Magic Rune Ring", cell: 36, frames: 4 },
  "rose-petal":    { ko: "로판 장미 꽃잎", en: "Rofan Rose Petal", cell: 24, frames: 4 },
  "flame-aura":    { ko: "집중 불꽃 오라", en: "Focus Flame Aura", cell: 28, frames: 4 },
  "shockwave-ring": { ko: "충격파 파문 링", en: "Shockwave Ring", cell: 36, frames: 4 },
  "music-note":    { ko: "리듬 음표 파동", en: "Rhythm Music Note", cell: 24, frames: 4 },
  "spotlight-beam": { ko: "무대 스포트라이트 빔", en: "Stage Spotlight Beam", cell: 40, frames: 3 },
  "healing-mint":  { ko: "민트 힐링 스파크", en: "Mint Healing Spark", cell: 24, frames: 4 },
  "confetti-star": { ko: "별빛 폭죽 컨페티", en: "Starlight Fireworks", cell: 28, frames: 4 },
  "steam-heart":   { ko: "커피 스팀 하트", en: "Coffee Steam Heart", cell: 24, frames: 4 },
});

/** 기본 파티클 한글·영문 이름. */
export function studioParticleSpriteLabel(kind: string): { readonly ko: string; readonly en: string } {
  const entry = META[kind as StudioParticleSpriteKind];
  return entry ? { ko: entry.ko, en: entry.en } : { ko: "파티클", en: "Particle" };
}

/** 드라마틱 VFX 파티클 한글·영문 이름. */
export function studioDramaticParticleSpriteLabel(kind: string): { readonly ko: string; readonly en: string } {
  const entry = DRAMATIC_META[kind as StudioDramaticParticleSpriteKind];
  return entry ? { ko: entry.ko, en: entry.en } : { ko: "연출 파티클", en: "Dramatic Particle" };
}

/** 20종 Dramatic VFX ID를 가장 어울리는 드라마틱 파티클 스프라이트 종류로 연결한다. */
export function studioDramaticParticleSpriteForVfx(vfxId: StudioDramaticVfxId): StudioDramaticParticleSpriteKind {
  switch (vfxId) {
    case "dash-speedlines":
    case "ink-calligraphy-slash":
      return "speedline";
    case "martial-fantasy-magic-circle":
    case "cyber-holo-grid":
      return "magic-rune";
    case "rofan-rose-petals":
    case "grass-petal-ripple":
      return "rose-petal";
    case "focus-flame-aura":
      return "flame-aura";
    case "highfive-shockwave":
    case "wood-step-ripple":
    case "marble-starlight-ripple":
    case "neon-tile-pulse":
      return "shockwave-ring";
    case "rhythm-note-wave":
    case "team-harmony-wave":
      return "music-note";
    case "stage-spotlight-ring":
    case "entrance-spotlight-beam":
      return "spotlight-beam";
    case "mint-healing-spark":
    case "mascot-clover-blessing":
      return "healing-mint";
    case "deadline-confetti-fireworks":
    case "eureka-spark-aura":
      return "confetti-star";
    case "coffee-healing-steam":
      return "steam-heart";
  }
}

export interface StudioParticleSprite<TKind extends string = StudioParticleSpriteKind> {
  readonly kind: TKind;
  readonly dataUrl: string;
  readonly cell: number;
  readonly frames: number;
  readonly width: number;
  readonly height: number;
}

function drawDust(ctx: CanvasRenderingContext2D, cell: number, frame: number, frames: number): void {
  const t = frame / (frames - 1);
  const cx = cell / 2;
  const cy = cell / 2;
  const radius = 3.2 + t * (cell / 2 - 3.6);
  ctx.fillStyle = `rgba(218, 204, 184, ${0.42 * (1 - t) + 0.06})`;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(250, 244, 232, ${0.58 * (1 - t) + 0.08})`;
  ctx.beginPath();
  ctx.arc(cx - radius * 0.22, cy - radius * 0.22, radius * 0.62, 0, Math.PI * 2);
  ctx.fill();
}

function drawSparkle(ctx: CanvasRenderingContext2D, cell: number, frame: number, frames: number): void {
  const t = frame / (frames - 1);
  const pulse = Math.sin(t * Math.PI);
  const scale = 0.42 + 0.58 * pulse;
  const cx = cell / 2;
  const cy = cell / 2;
  const arm = cell * 0.43 * scale;
  ctx.fillStyle = `rgba(253, 224, 71, ${0.22 + 0.24 * pulse})`;
  ctx.beginPath();
  ctx.arc(cx, cy, arm * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 244, 186, ${0.45 + 0.55 * pulse})`;
  ctx.beginPath();
  for (let armIndex = 0; armIndex < 4; armIndex += 1) {
    const angle = (armIndex / 4) * Math.PI * 2 + Math.PI / 4;
    const narrow = armIndex % 2 === 0 ? 0.15 : 0.28;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle - narrow) * arm, cy + Math.sin(angle - narrow) * arm);
    ctx.lineTo(cx + Math.cos(angle) * arm * 1.28, cy + Math.sin(angle) * arm * 1.28);
    ctx.lineTo(cx + Math.cos(angle + narrow) * arm, cy + Math.sin(angle + narrow) * arm);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.3 * scale + 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawRaindrop(ctx: CanvasRenderingContext2D, cell: number, frame: number): void {
  const stretch = frame === 0 ? 1 : 1.35;
  ctx.fillStyle = "rgba(125, 196, 250, 0.88)";
  ctx.beginPath();
  ctx.ellipse(cell / 2, cell / 2, 3.1, 5.6 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(30, 64, 175, 0.35)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = "rgba(235, 248, 255, 0.85)";
  ctx.beginPath();
  ctx.ellipse(cell / 2 - 1, cell / 2 - 2, 1.15, 2.5 * stretch, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnowflake(ctx: CanvasRenderingContext2D, cell: number, frame: number): void {
  const cx = cell / 2;
  const cy = cell / 2;
  const radius = cell * 0.38;
  const rotation = frame === 0 ? 0 : Math.PI / 6;
  ctx.strokeStyle = "rgba(224, 242, 254, 0.96)";
  ctx.lineWidth = 1.9;
  ctx.lineCap = "round";
  for (let arm = 0; arm < 6; arm += 1) {
    const angle = rotation + (arm / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.stroke();
    const bx = cx + Math.cos(angle) * radius * 0.6;
    const by = cy + Math.sin(angle) * radius * 0.6;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(angle + side * 0.5) * radius * 0.32, by + Math.sin(angle + side * 0.5) * radius * 0.32);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawLeaf(ctx: CanvasRenderingContext2D, cell: number, frame: number): void {
  const cx = cell / 2;
  const cy = cell / 2;
  const tilt = (frame - 1) * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.fillStyle = frame === 2 ? "#e5a649" : "#6cc764";
  ctx.beginPath();
  ctx.ellipse(0, 0, cell * 0.34, cell * 0.21, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(42, 74, 38, 0.78)";
  ctx.lineWidth = 1.15;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-cell * 0.28, cell * 0.1);
  ctx.lineTo(cell * 0.28, -cell * 0.1);
  ctx.stroke();
  ctx.restore();
}

function drawSmoke(ctx: CanvasRenderingContext2D, cell: number, frame: number, frames: number): void {
  const t = frame / (frames - 1);
  const radius = cell * (0.19 + t * 0.22);
  const x = cell / 2 + Math.sin(t * 4) * 2;
  const y = cell * (0.62 - t * 0.3);
  ctx.fillStyle = `rgba(216, 220, 232, ${0.42 * (1 - t) + 0.06})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 255, 255, ${0.34 * (1 - t) + 0.05})`;
  ctx.beginPath();
  ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawConfetti(ctx: CanvasRenderingContext2D, cell: number, frame: number): void {
  const colors = ["#f472b6", "#facc15", "#38bdf8"];
  const cx = cell / 2;
  const cy = cell / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame * 0.9);
  ctx.fillStyle = colors[frame % colors.length] ?? "#facc15";
  ctx.fillRect(-5.2, -2.6, 10.4, 5.2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.fillRect(-5.2, -2.6, 10.4, 1.6);
  ctx.restore();
  ctx.fillStyle = colors[(frame + 1) % colors.length] ?? "#f472b6";
  ctx.beginPath();
  ctx.arc(cx - 4, cy + 5, 1.9, 0, Math.PI * 2);
  ctx.fill();
}

function drawSplash(ctx: CanvasRenderingContext2D, cell: number, frame: number, frames: number): void {
  const t = frame / (frames - 1);
  ctx.strokeStyle = `rgba(125, 211, 252, ${0.92 * (1 - t) + 0.1})`;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  const baseY = cell * 0.72;
  const spread = 3 + t * (cell * 0.36);
  const height = 4 + Math.sin(t * Math.PI) * cell * 0.28;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cell / 2, baseY);
    ctx.quadraticCurveTo(cell / 2 + side * spread * 0.5, baseY - height, cell / 2 + side * spread, baseY - height * 0.4);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(224, 242, 254, ${0.9 * (1 - t) + 0.1})`;
  ctx.beginPath();
  ctx.arc(cell / 2, baseY - height * 0.9, 2.7 * (1 - t * 0.45), 0, Math.PI * 2);
  ctx.fill();
}

function drawPetal(ctx: CanvasRenderingContext2D, cell: number, frame: number): void {
  const cx = cell / 2;
  const cy = cell / 2;
  const sway = (frame - 1) * 0.45;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(sway);
  ctx.fillStyle = "rgba(255, 182, 213, 0.94)";
  ctx.beginPath();
  ctx.ellipse(0, 0, cell * 0.31, cell * 0.21, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(244, 142, 184, 0.92)";
  ctx.beginPath();
  ctx.ellipse(cell * 0.15, -cell * 0.1, cell * 0.09, cell * 0.06, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(190, 24, 93, 0.45)";
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(-cell * 0.24, cell * 0.12);
  ctx.lineTo(cell * 0.2, -cell * 0.1);
  ctx.stroke();
  ctx.restore();
}

function drawDramaticSpriteFrame(
  ctx: CanvasRenderingContext2D,
  kind: StudioDramaticParticleSpriteKind,
  cell: number,
  frame: number,
  frames: number,
): void {
  const t = frames > 1 ? frame / (frames - 1) : 0;
  const cx = cell / 2;
  const cy = cell / 2;
  switch (kind) {
    case "speedline": {
      ctx.strokeStyle = frame === 1 ? "#fde047" : "#38bdf8";
      ctx.lineWidth = 2.4 - t * 0.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(4, cy - 5 + frame * 2);
      ctx.lineTo(cell - 4, cy - 5 + frame * 2);
      ctx.moveTo(8, cy + 4 - frame);
      ctx.lineTo(cell - 6, cy + 4 - frame);
      ctx.stroke();
      break;
    }
    case "magic-rune": {
      const r = cell * (0.28 + t * 0.14);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * Math.PI * 0.5);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.92)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(129, 140, 248, 0.88)";
      ctx.strokeRect(-r * 0.65, -r * 0.65, r * 1.3, r * 1.3);
      ctx.restore();
      break;
    }
    case "rose-petal": {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((frame - 1.5) * 0.45);
      ctx.fillStyle = frame % 2 === 0 ? "#fb7185" : "#e11d48";
      ctx.beginPath();
      ctx.ellipse(0, 0, cell * 0.32, cell * 0.2, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(254, 240, 138, 0.72)";
      ctx.beginPath();
      ctx.arc(-cell * 0.1, -cell * 0.05, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "flame-aura": {
      const scale = 0.7 + Math.sin(t * Math.PI) * 0.35;
      ctx.fillStyle = "rgba(249, 115, 22, 0.88)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 6.2 * scale, 9.5 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(253, 224, 71, 0.92)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 3.4 * scale, 5.8 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "shockwave-ring": {
      const r = 4 + t * (cell * 0.38);
      ctx.strokeStyle = `rgba(52, 211, 153, ${0.95 * (1 - t) + 0.1})`;
      ctx.lineWidth = 2.6 * (1 - t * 0.55);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.75 * (1 - t) + 0.08})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "music-note": {
      const lift = -t * 3.5;
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(cx - 2, cy + 4 + lift);
      ctx.lineTo(cx - 2, cy - 6 + lift);
      ctx.lineTo(cx + 6, cy - 8 + lift);
      ctx.lineTo(cx + 6, cy + 2 + lift);
      ctx.stroke();
      ctx.fillStyle = frame % 2 === 0 ? "#38bdf8" : "#f472b6";
      ctx.beginPath();
      ctx.arc(cx - 4, cy + 5 + lift, 3.1, 0, Math.PI * 2);
      ctx.arc(cx + 4, cy + 3 + lift, 3.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "spotlight-beam": {
      const alpha = 0.25 + (1 - Math.abs(t - 0.5) * 2) * 0.35;
      ctx.fillStyle = `rgba(254, 240, 138, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(cx - 5, 2);
      ctx.lineTo(cx + 5, 2);
      ctx.lineTo(cell - 4, cell - 4);
      ctx.lineTo(4, cell - 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(244, 114, 182, 0.72)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(cx, cell - 6, cell * 0.36, 4.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "healing-mint": {
      const pulse = 0.65 + Math.sin(t * Math.PI) * 0.35;
      ctx.fillStyle = "rgba(45, 212, 191, 0.28)";
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.36 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2dd4bf";
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 6 * pulse);
      ctx.lineTo(cx, cy + 6 * pulse);
      ctx.moveTo(cx - 6 * pulse, cy);
      ctx.lineTo(cx + 6 * pulse, cy);
      ctx.stroke();
      break;
    }
    case "confetti-star": {
      const colors = ["#facc15", "#f472b6", "#38bdf8", "#4ade80"];
      ctx.fillStyle = colors[frame % colors.length] ?? "#facc15";
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2 + t * 0.5;
        const radius = i % 2 === 0 ? cell * 0.38 : cell * 0.16;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "steam-heart": {
      const rise = -t * 4;
      ctx.fillStyle = `rgba(251, 207, 232, ${0.88 * (1 - t * 0.45)})`;
      ctx.beginPath();
      ctx.arc(cx - 3, cy + rise, 3.4, 0, Math.PI * 2);
      ctx.arc(cx + 3, cy + rise, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 6.2, cy + 1 + rise);
      ctx.lineTo(cx, cy + 8 + rise);
      ctx.lineTo(cx + 6.2, cy + 1 + rise);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}

/**
 * 기본 9종 파티클 스프라이트 스트립을 만든다.
 * 스킨 생성에 캔버스가 필요하므로 deps를 주입받는다.
 */
export function buildStudioParticleSprite(
  kind: StudioParticleSpriteKind,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioParticleSprite<StudioParticleSpriteKind> {
  const entry = META[kind];
  if (!entry) throw new Error(`알 수 없는 파티클 스프라이트: ${kind}`);
  const { cell, frames } = entry;
  const canvas = deps.createCanvas(cell * frames, cell);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 캔버스 컨텍스트를 만들지 못했습니다.");
  ctx.clearRect(0, 0, cell * frames, cell);
  for (let frame = 0; frame < frames; frame += 1) {
    ctx.save();
    ctx.translate(frame * cell, 0);
    switch (kind) {
      case "dust": drawDust(ctx, cell, frame, frames); break;
      case "sparkle": drawSparkle(ctx, cell, frame, frames); break;
      case "raindrop": drawRaindrop(ctx, cell, frame); break;
      case "snowflake": drawSnowflake(ctx, cell, frame); break;
      case "leaf": drawLeaf(ctx, cell, frame); break;
      case "smoke": drawSmoke(ctx, cell, frame, frames); break;
      case "confetti": drawConfetti(ctx, cell, frame); break;
      case "splash": drawSplash(ctx, cell, frame, frames); break;
      case "petal": drawPetal(ctx, cell, frame); break;
    }
    ctx.restore();
  }
  return Object.freeze({
    kind,
    dataUrl: canvas.toDataURL("image/png"),
    cell,
    frames,
    width: cell * frames,
    height: cell,
  });
}

/** 화려한 드라마틱 연출 VFX 전용 10종 파티클 스프라이트 스트립을 만든다. */
export function buildStudioDramaticParticleSprite(
  kind: StudioDramaticParticleSpriteKind,
  deps: ProceduralSheetDeps = defaultProceduralSheetDeps(),
): StudioParticleSprite<StudioDramaticParticleSpriteKind> {
  const entry = DRAMATIC_META[kind];
  if (!entry) throw new Error(`알 수 없는 드라마틱 파티클 스프라이트: ${kind}`);
  const { cell, frames } = entry;
  const canvas = deps.createCanvas(cell * frames, cell);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 캔버스 컨텍스트를 만들지 못했습니다.");
  ctx.clearRect(0, 0, cell * frames, cell);
  for (let frame = 0; frame < frames; frame += 1) {
    ctx.save();
    ctx.translate(frame * cell, 0);
    drawDramaticSpriteFrame(ctx, kind, cell, frame, frames);
    ctx.restore();
  }
  return Object.freeze({
    kind,
    dataUrl: canvas.toDataURL("image/png"),
    cell,
    frames,
    width: cell * frames,
    height: cell,
  });
}
