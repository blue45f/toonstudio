/**
 * 투시선 일치 웹툰 배경 SVG 생성 엔진 (8종 테마 · 1점/2점 투시 · OKLCH 그라데이션·창광·그림자).
 * 모든 건축 소실선이 컷 내 주인공 시선 높이(vanishingPointY)의 지평선에 정확히 수렴한다.
 */

import {
  buildOklchScenePalette,
  clampNumber,
  createSeededRng,
  formatOklch,
  type AutoBgThemeId,
  type OklchScenePalette,
  type PerspectiveMode,
  type TimeOfDay,
} from "./auto-bg-crowd-palettes";

export interface PerspectiveRay {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly vpIndex: 1 | 2;
}

export interface BackdropGenerationOptions {
  readonly width: number;
  readonly height: number;
  readonly theme: AutoBgThemeId;
  readonly timeOfDay: TimeOfDay;
  readonly perspectiveMode: PerspectiveMode;
  readonly vanishingPointX: number;
  readonly vanishingPointY: number;
  readonly secondaryVanishingPointX?: number;
  readonly showPerspectiveGuides?: boolean;
  readonly lineWeight?: number;
  readonly seed?: number;
}

export interface BackdropGenerationResult {
  readonly svg: string;
  readonly innerMarkup: string;
  readonly defsMarkup: string;
  readonly width: number;
  readonly height: number;
  readonly theme: AutoBgThemeId;
  readonly timeOfDay: TimeOfDay;
  readonly perspectiveMode: PerspectiveMode;
  readonly vanishingPoint: { readonly x: number; readonly y: number };
  readonly secondaryVanishingPoint: { readonly x: number; readonly y: number } | null;
  readonly guideLines: readonly PerspectiveRay[];
  readonly palette: OklchScenePalette;
}

interface PerspectiveContext {
  readonly w: number;
  readonly h: number;
  readonly vp1X: number;
  readonly vp2X: number | null;
  readonly vpY: number;
  readonly mode: PerspectiveMode;
  readonly stroke: number;
  readonly palette: OklchScenePalette;
  readonly timeOfDay: TimeOfDay;
  readonly rng: () => number;
  readonly rays: PerspectiveRay[];
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "0.0";
}

/** 소실점(vpX, vpY)에서 시작해 (targetX, targetY) 방향으로 비율 t(0..1) 지점의 좌표를 반환한다. */
function lerpFromVp(
  vpX: number,
  vpY: number,
  targetX: number,
  targetY: number,
  t: number,
): { x: number; y: number } {
  return {
    x: vpX + (targetX - vpX) * t,
    y: vpY + (targetY - vpY) * t,
  };
}

function recordRay(
  ctx: PerspectiveContext,
  vpIndex: 1 | 2,
  targetX: number,
  targetY: number,
): PerspectiveRay {
  const vx = vpIndex === 2 && ctx.vp2X !== null ? ctx.vp2X : ctx.vp1X;
  const ray: PerspectiveRay = {
    x1: vx,
    y1: ctx.vpY,
    x2: targetX,
    y2: targetY,
    vpIndex: vpIndex === 2 && ctx.vp2X !== null ? 2 : 1,
  };
  ctx.rays.push(ray);
  return ray;
}

/** 소실점으로부터 2개의 깊이 구간(tNear, tFar)과 2개의 높이선으로 투시 사변형(벽/창/건물면)을 만든다. */
function perspectiveQuad(
  vpX: number,
  vpY: number,
  edgeX: number,
  topY: number,
  bottomY: number,
  tFar: number,
  tNear: number,
): string {
  const p1 = lerpFromVp(vpX, vpY, edgeX, topY, tFar);
  const p2 = lerpFromVp(vpX, vpY, edgeX, topY, tNear);
  const p3 = lerpFromVp(vpX, vpY, edgeX, bottomY, tNear);
  const p4 = lerpFromVp(vpX, vpY, edgeX, bottomY, tFar);
  return `${fmt(p1.x)},${fmt(p1.y)} ${fmt(p2.x)},${fmt(p2.y)} ${fmt(p3.x)},${fmt(p3.y)} ${fmt(p4.x)},${fmt(p4.y)}`;
}

function buildSkyAndGround(ctx: PerspectiveContext): string {
  const { w, h, vpY, palette } = ctx;
  const horizonBandH = Math.max(24, h * 0.14);
  return [
    `<g id="backdrop-sky" data-vanishing-y="${fmt(vpY)}">`,
    `<rect x="0" y="0" width="${fmt(w)}" height="${fmt(vpY + 2)}" fill="url(#bg-sky-grad)"/>`,
    `<rect x="0" y="${fmt(vpY)}" width="${fmt(w)}" height="${fmt(h - vpY)}" fill="url(#bg-ground-grad)"/>`,
    `<rect x="0" y="${fmt(vpY - horizonBandH * 0.55)}" width="${fmt(w)}" height="${fmt(horizonBandH)}" fill="url(#bg-haze-grad)"/>`,
    `<line x1="0" y1="${fmt(vpY)}" x2="${fmt(w)}" y2="${fmt(vpY)}" stroke="${palette.haze}" stroke-width="1"/>`,
    `</g>`,
  ].join("");
}

function buildSeoulStreet(ctx: PerspectiveContext): { arch: string; lighting: string } {
  const { w, h, vp1X, vpY, stroke, palette } = ctx;
  const vpRight = ctx.mode === "2-point" && ctx.vp2X !== null ? ctx.vp2X : vp1X;
  const pieces: string[] = [];
  const lightPieces: string[] = [];

  // 도로 및 보도 투시선
  for (const edgeX of [0, w * 0.18, w * 0.82, w]) {
    const ray = recordRay(ctx, 1, edgeX, h);
    pieces.push(
      `<line x1="${fmt(ray.x1)}" y1="${fmt(ray.y1)}" x2="${fmt(ray.x2)}" y2="${fmt(ray.y2)}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 0.9)}" opacity="0.72"/>`,
    );
  }
  // 횡단보도 줄무늬 (원근 간격 압축)
  for (let i = 0; i < 6; i += 1) {
    const t = 0.25 + i * 0.12;
    const leftPt = lerpFromVp(vp1X, vpY, w * 0.22, h, t);
    const rightPt = lerpFromVp(vp1X, vpY, w * 0.78, h, t);
    pieces.push(
      `<line x1="${fmt(leftPt.x)}" y1="${fmt(leftPt.y)}" x2="${fmt(rightPt.x)}" y2="${fmt(rightPt.y)}" stroke="${palette.architectureLight}" stroke-width="${fmt(Math.max(1.5, t * 7))}" opacity="0.58"/>`,
    );
  }

  // 좌·우 도심 빌딩 열 (소실점 잠금)
  const depths: readonly [number, number, number][] = [
    [0.14, 0.32, 0.08],
    [0.34, 0.58, 0.02],
    [0.6, 0.92, -0.08],
  ];
  depths.forEach(([tFar, tNear, topRatio], idx) => {
    const topY = h * topRatio;
    const botY = h * 0.96;
    recordRay(ctx, 1, 0, topY);
    recordRay(ctx, ctx.mode === "2-point" ? 2 : 1, w, topY);

    const leftPts = perspectiveQuad(vp1X, vpY, 0, topY, botY, tFar, tNear);
    const rightPts = perspectiveQuad(vpRight, vpY, w, topY, botY, tFar, tNear);
    const fillL = idx === 2 ? palette.architectureShadow : idx === 1 ? palette.architectureMid : palette.architectureLight;
    const fillR = idx === 2 ? palette.architectureMid : palette.architectureShadow;
    pieces.push(`<polygon points="${leftPts}" fill="${fillL}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
    pieces.push(`<polygon points="${rightPts}" fill="${fillR}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);

    // 빌딩 창문 빛 그리드
    for (let row = 0; row < 3; row += 1) {
      const rTop = topY + (botY - topY) * (0.14 + row * 0.22);
      const rBot = rTop + (botY - topY) * 0.11;
      const winL = perspectiveQuad(vp1X, vpY, 0, rTop, rBot, tFar + 0.03, tNear - 0.03);
      const winR = perspectiveQuad(vpRight, vpY, w, rTop, rBot, tFar + 0.03, tNear - 0.03);
      lightPieces.push(`<polygon points="${winL}" fill="${palette.windowGlow}" opacity="0.62"/>`);
      lightPieces.push(`<polygon points="${winR}" fill="${palette.windowGlow}" opacity="0.52"/>`);
    }
  });

  // 세로 간판 & 바닥 그림자
  const signLeft = perspectiveQuad(vp1X, vpY, w * 0.06, h * 0.18, h * 0.48, 0.44, 0.52);
  const signRight = perspectiveQuad(vpRight, vpY, w * 0.94, h * 0.22, h * 0.52, 0.48, 0.57);
  lightPieces.push(`<polygon points="${signLeft}" fill="${palette.accentLight}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 0.75)}" opacity="0.86"/>`);
  lightPieces.push(`<polygon points="${signRight}" fill="${palette.accentLight}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 0.75)}" opacity="0.78"/>`);
  lightPieces.push(`<polygon points="${fmt(vp1X)},${fmt(vpY)} ${fmt(w * 0.02)},${fmt(h)} ${fmt(w * 0.34)},${fmt(h)}" fill="${palette.shadowTint}"/>`);

  return { arch: pieces.join(""), lighting: lightPieces.join("") };
}

function buildCozyCafe(ctx: PerspectiveContext): { arch: string; lighting: string } {
  const { w, h, vp1X, vpY, stroke, palette } = ctx;
  const vp2 = ctx.mode === "2-point" && ctx.vp2X !== null ? ctx.vp2X : vp1X;
  const pieces: string[] = [];
  const lightPieces: string[] = [];

  // 실내 천장·벽·바닥 투시 골격
  recordRay(ctx, 1, 0, 0);
  recordRay(ctx, 1, 0, h);
  recordRay(ctx, ctx.mode === "2-point" ? 2 : 1, w, 0);
  recordRay(ctx, ctx.mode === "2-point" ? 2 : 1, w, h);

  // 좌측 통창 벽면 + 창밖 햇살 샤프트
  const leftWall = perspectiveQuad(vp1X, vpY, 0, 0, h, 0.22, 1);
  const bigWindow = perspectiveQuad(vp1X, vpY, 0, h * 0.12, h * 0.7, 0.28, 0.88);
  pieces.push(`<polygon points="${leftWall}" fill="${palette.architectureLight}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
  pieces.push(`<polygon points="${bigWindow}" fill="url(#bg-sky-grad)" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 1.1)}"/>`);

  // 우측 에스프레소 바 & 선반
  const rightWall = perspectiveQuad(vp2, vpY, w, 0, h, 0.22, 1);
  const counter = perspectiveQuad(vp2, vpY, w, h * 0.56, h * 0.92, 0.32, 0.88);
  pieces.push(`<polygon points="${rightWall}" fill="${palette.architectureMid}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
  pieces.push(`<polygon points="${counter}" fill="${palette.architectureShadow}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);

  // 천장 원목 서까래 및 펜던트 조명
  for (let i = 1; i <= 4; i += 1) {
    const t = i * 0.2;
    const pL = lerpFromVp(vp1X, vpY, 0, 0, t);
    const pR = lerpFromVp(vp2, vpY, w, 0, t);
    pieces.push(`<line x1="${fmt(pL.x)}" y1="${fmt(pL.y)}" x2="${fmt(pR.x)}" y2="${fmt(pR.y)}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * (0.6 + t * 0.8))}" opacity="0.55"/>`);
    const lampX = (pL.x + pR.x) * 0.5;
    const lampY = pL.y + h * 0.08 * t + 14;
    pieces.push(`<line x1="${fmt(lampX)}" y1="${fmt(pL.y)}" x2="${fmt(lampX)}" y2="${fmt(lampY)}" stroke="${palette.inkLine}" stroke-width="1.2"/>`);
    lightPieces.push(`<circle cx="${fmt(lampX)}" cy="${fmt(lampY)}" r="${fmt(5 + t * 11)}" fill="${palette.windowGlow}"/>`);
  }

  // 창광 바닥 사선 투영
  const shaftStart = lerpFromVp(vp1X, vpY, 0, h * 0.16, 0.72);
  const shaftFoot = lerpFromVp(vp1X, vpY, 0, h * 0.72, 0.72);
  lightPieces.push(
    `<polygon points="${fmt(shaftStart.x)},${fmt(shaftStart.y)} ${fmt(shaftFoot.x)},${fmt(shaftFoot.y)} ${fmt(w * 0.74)},${fmt(h * 0.96)} ${fmt(w * 0.44)},${fmt(h * 0.66)}" fill="${palette.windowGlow}" opacity="0.34"/>`,
  );
  lightPieces.push(`<polygon points="${fmt(w * 0.62)},${fmt(h * 0.72)} ${fmt(w)},${fmt(h * 0.94)} ${fmt(w)},${fmt(h)} ${fmt(w * 0.52)},${fmt(h)}" fill="${palette.shadowTint}"/>`);

  return { arch: pieces.join(""), lighting: lightPieces.join("") };
}

function buildRofanBallroom(ctx: PerspectiveContext): { arch: string; lighting: string } {
  const { w, h, vp1X, vpY, stroke, palette } = ctx;
  const pieces: string[] = [];
  const lightPieces: string[] = [];

  // 대리석 바닥 투시 방사선
  for (let i = 0; i <= 6; i += 1) {
    const edgeX = (w / 6) * i;
    const ray = recordRay(ctx, 1, edgeX, h);
    pieces.push(`<line x1="${fmt(ray.x1)}" y1="${fmt(ray.y1)}" x2="${fmt(ray.x2)}" y2="${fmt(ray.y2)}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 0.65)}" opacity="0.4"/>`);
  }
  for (let i = 1; i <= 5; i += 1) {
    const t = Math.pow(i / 5, 1.45);
    const y = vpY + (h - vpY) * t;
    pieces.push(`<line x1="0" y1="${fmt(y)}" x2="${fmt(w)}" y2="${fmt(y)}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 0.6)}" opacity="0.34"/>`);
  }

  // 좌우 아치형 대리석 기둥 열
  recordRay(ctx, 1, 0, h * 0.04);
  recordRay(ctx, 1, w, h * 0.04);
  for (const t of [0.24, 0.46, 0.74]) {
    const colL = perspectiveQuad(vp1X, vpY, 0, h * 0.04, h * 0.96, t, t + 0.09);
    const colR = perspectiveQuad(vp1X, vpY, w, h * 0.04, h * 0.96, t, t + 0.09);
    pieces.push(`<polygon points="${colL}" fill="${palette.architectureLight}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
    pieces.push(`<polygon points="${colR}" fill="${palette.architectureLight}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
  }

  // 중앙 황궁 아치 창문 & 대형 크리스털 샹들리에
  const archW = w * 0.24;
  const archTop = Math.max(h * 0.14, vpY - h * 0.28);
  pieces.push(`<path d="M ${fmt(vp1X - archW * 0.5)} ${fmt(vpY)} L ${fmt(vp1X - archW * 0.5)} ${fmt(archTop + archW * 0.35)} Q ${fmt(vp1X)} ${fmt(archTop - 16)} ${fmt(vp1X + archW * 0.5)} ${fmt(archTop + archW * 0.35)} L ${fmt(vp1X + archW * 0.5)} ${fmt(vpY)} Z" fill="${palette.windowGlow}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);

  const chanY = Math.max(32, vpY * 0.42);
  pieces.push(`<line x1="${fmt(vp1X)}" y1="0" x2="${fmt(vp1X)}" y2="${fmt(chanY)}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
  lightPieces.push(`<ellipse cx="${fmt(vp1X)}" cy="${fmt(chanY + 12)}" rx="${fmt(w * 0.17)}" ry="${fmt(h * 0.036)}" fill="${palette.windowGlow}" stroke="${palette.accentLight}" stroke-width="${fmt(stroke)}"/>`);
  lightPieces.push(`<ellipse cx="${fmt(vp1X)}" cy="${fmt(chanY + 28)}" rx="${fmt(w * 0.11)}" ry="${fmt(h * 0.025)}" fill="${palette.windowGlow}" opacity="0.88"/>`);
  lightPieces.push(`<polygon points="${fmt(vp1X - archW * 0.45)},${fmt(vpY)} ${fmt(vp1X + archW * 0.45)},${fmt(vpY)} ${fmt(w * 0.76)},${fmt(h)} ${fmt(w * 0.24)},${fmt(h)}" fill="${palette.windowGlow}" opacity="0.22"/>`);

  return { arch: pieces.join(""), lighting: lightPieces.join("") };
}

function buildSchoolHallway(ctx: PerspectiveContext): { arch: string; lighting: string } {
  const { w, h, vp1X, vpY, stroke, palette } = ctx;
  const pieces: string[] = [];
  const lightPieces: string[] = [];

  // 복도 4개 코너 소실선
  for (const [tx, ty] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
    const ray = recordRay(ctx, 1, tx, ty);
    pieces.push(`<line x1="${fmt(ray.x1)}" y1="${fmt(ray.y1)}" x2="${fmt(ray.x2)}" y2="${fmt(ray.y2)}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
  }

  // 좌측 창문 열 + 우측 교실 문/사물함 열
  const leftWall = perspectiveQuad(vp1X, vpY, 0, 0, h, 0.16, 1);
  const rightWall = perspectiveQuad(vp1X, vpY, w, 0, h, 0.16, 1);
  pieces.push(`<polygon points="${leftWall}" fill="${palette.architectureLight}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
  pieces.push(`<polygon points="${rightWall}" fill="${palette.architectureMid}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);

  for (const [tFar, tNear] of [[0.2, 0.36], [0.4, 0.62], [0.68, 0.94]] as const) {
    const winPts = perspectiveQuad(vp1X, vpY, 0, h * 0.14, h * 0.56, tFar, tNear);
    const doorPts = perspectiveQuad(vp1X, vpY, w, h * 0.2, h * 0.94, tFar, tNear);
    pieces.push(`<polygon points="${winPts}" fill="${palette.windowGlow}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 0.85)}"/>`);
    pieces.push(`<polygon points="${doorPts}" fill="${palette.architectureShadow}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 0.85)}"/>`);

    // 창문 사선 햇살 바닥 투영
    const wBottomFar = lerpFromVp(vp1X, vpY, 0, h * 0.96, tFar);
    const wBottomNear = lerpFromVp(vp1X, vpY, 0, h * 0.96, tNear);
    lightPieces.push(
      `<polygon points="${fmt(wBottomFar.x)},${fmt(wBottomFar.y)} ${fmt(wBottomNear.x)},${fmt(wBottomNear.y)} ${fmt(wBottomNear.x + w * 0.42 * tNear)},${fmt(wBottomNear.y)} ${fmt(wBottomFar.x + w * 0.42 * tFar)},${fmt(wBottomFar.y)}" fill="${palette.windowGlow}" opacity="0.34"/>`,
    );
  }

  // 천장 형광등 리듬
  for (const t of [0.28, 0.52, 0.8]) {
    const pL = lerpFromVp(vp1X, vpY, w * 0.32, 0, t);
    const pR = lerpFromVp(vp1X, vpY, w * 0.68, 0, t);
    lightPieces.push(`<line x1="${fmt(pL.x)}" y1="${fmt(pL.y)}" x2="${fmt(pR.x)}" y2="${fmt(pR.y)}" stroke="${palette.windowGlow}" stroke-width="${fmt(2 + t * 5)}" stroke-linecap="round"/>`);
  }

  return { arch: pieces.join(""), lighting: lightPieces.join("") };
}

function buildHanRiverNight(ctx: PerspectiveContext): { arch: string; lighting: string } {
  const { w, h, vp1X, vpY, stroke, palette } = ctx;
  const vp2 = ctx.mode === "2-point" && ctx.vp2X !== null ? ctx.vp2X : vp1X;
  const pieces: string[] = [];
  const lightPieces: string[] = [];

  // 강변 산책로 & 난간·가로등 투시선
  recordRay(ctx, 1, 0, h * 0.72);
  recordRay(ctx, 1, 0, h * 0.94);
  recordRay(ctx, ctx.mode === "2-point" ? 2 : 1, w, h * 0.78);
  recordRay(ctx, ctx.mode === "2-point" ? 2 : 1, w * 0.92, h * 0.32);

  const promenade = `${fmt(vp1X)},${fmt(vpY)} ${fmt(0)},${fmt(h * 0.76)} ${fmt(0)},${fmt(h)} ${fmt(w)},${fmt(h)} ${fmt(w)},${fmt(h * 0.88)}`;
  pieces.push(`<polygon points="${promenade}" fill="${palette.architectureShadow}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);

  // 원경 한강 대교 주탑 및 사장교 케이블
  const towerX = w * 0.68;
  const towerTop = Math.max(24, vpY - h * 0.24);
  pieces.push(`<line x1="0" y1="${fmt(vpY - 2)}" x2="${fmt(w)}" y2="${fmt(vpY - 2)}" stroke="${palette.architectureLight}" stroke-width="${fmt(stroke * 1.4)}"/>`);
  pieces.push(`<rect x="${fmt(towerX - 6)}" y="${fmt(towerTop)}" width="12" height="${fmt(vpY - towerTop)}" fill="${palette.architectureMid}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 0.8)}"/>`);
  for (let i = -4; i <= 4; i += 1) {
    if (i === 0) continue;
    pieces.push(`<line x1="${fmt(towerX)}" y1="${fmt(towerTop + 8)}" x2="${fmt(towerX + i * w * 0.065)}" y2="${fmt(vpY - 2)}" stroke="${palette.accentLight}" stroke-width="1" opacity="0.68"/>`);
  }

  // 원경 서울 스카이라인 실루엣 & 수면 반사광
  for (let i = 0; i < 12; i += 1) {
    const bx = (w / 12) * i;
    const bh = 18 + ((i * 29) % 48);
    pieces.push(`<rect x="${fmt(bx)}" y="${fmt(vpY - bh)}" width="${fmt(w / 13)}" height="${fmt(bh)}" fill="${palette.architectureShadow}" opacity="0.82"/>`);
    lightPieces.push(`<rect x="${fmt(bx + 4)}" y="${fmt(vpY + 6 + (i % 3) * 8)}" width="${fmt(w / 18)}" height="2.6" rx="1" fill="${palette.windowGlow}" opacity="0.58"/>`);
  }

  // 난간 포스트 투시
  for (const t of [0.22, 0.42, 0.68, 0.92]) {
    const topP = lerpFromVp(vp1X, vpY, 0, h * 0.68, t);
    const botP = lerpFromVp(vp1X, vpY, 0, h * 0.9, t);
    pieces.push(`<line x1="${fmt(topP.x)}" y1="${fmt(topP.y)}" x2="${fmt(botP.x)}" y2="${fmt(botP.y)}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * (0.7 + t * 0.8))}"/>`);
    const lampP = lerpFromVp(vp2, vpY, w * 0.92, h * 0.32, t);
    lightPieces.push(`<circle cx="${fmt(lampP.x)}" cy="${fmt(lampP.y)}" r="${fmt(3 + t * 7)}" fill="${palette.windowGlow}" opacity="0.72"/>`);
  }

  return { arch: pieces.join(""), lighting: lightPieces.join("") };
}

function buildWuxiaInn(ctx: PerspectiveContext): { arch: string; lighting: string } {
  const { w, h, vp1X, vpY, stroke, palette } = ctx;
  const vp2 = ctx.mode === "2-point" && ctx.vp2X !== null ? ctx.vp2X : vp1X;
  const pieces: string[] = [];
  const lightPieces: string[] = [];

  recordRay(ctx, 1, 0, h * 0.06);
  recordRay(ctx, 1, 0, h * 0.94);
  recordRay(ctx, ctx.mode === "2-point" ? 2 : 1, w, h * 0.06);
  recordRay(ctx, ctx.mode === "2-point" ? 2 : 1, w, h * 0.94);

  // 2층 목조 발코니 & 기둥
  const balconyL = perspectiveQuad(vp1X, vpY, 0, h * 0.16, h * 0.36, 0.22, 0.96);
  const balconyR = perspectiveQuad(vp2, vpY, w, h * 0.16, h * 0.36, 0.22, 0.96);
  pieces.push(`<polygon points="${balconyL}" fill="${palette.architectureShadow}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
  pieces.push(`<polygon points="${balconyR}" fill="${palette.architectureShadow}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);

  // 나무 기둥 및 붉은 등롱
  for (const t of [0.28, 0.56, 0.84]) {
    const pTopL = lerpFromVp(vp1X, vpY, 0, h * 0.05, t);
    const pBotL = lerpFromVp(vp1X, vpY, 0, h * 0.96, t);
    const pTopR = lerpFromVp(vp2, vpY, w, h * 0.05, t);
    const pBotR = lerpFromVp(vp2, vpY, w, h * 0.96, t);
    pieces.push(`<line x1="${fmt(pTopL.x)}" y1="${fmt(pTopL.y)}" x2="${fmt(pBotL.x)}" y2="${fmt(pBotL.y)}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * (1.2 + t * 1.4))}"/>`);
    pieces.push(`<line x1="${fmt(pTopR.x)}" y1="${fmt(pTopR.y)}" x2="${fmt(pBotR.x)}" y2="${fmt(pBotR.y)}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * (1.2 + t * 1.4))}"/>`);

    const lanL = lerpFromVp(vp1X, vpY, w * 0.12, h * 0.26, t);
    const lanR = lerpFromVp(vp2, vpY, w * 0.88, h * 0.26, t);
    const r = 6 + t * 10;
    lightPieces.push(`<ellipse cx="${fmt(lanL.x)}" cy="${fmt(lanL.y)}" rx="${fmt(r * 0.82)}" ry="${fmt(r)}" fill="${palette.accentLight}" stroke="${palette.inkLine}" stroke-width="1.1"/>`);
    lightPieces.push(`<ellipse cx="${fmt(lanR.x)}" cy="${fmt(lanR.y)}" rx="${fmt(r * 0.82)}" ry="${fmt(r)}" fill="${palette.accentLight}" stroke="${palette.inkLine}" stroke-width="1.1"/>`);
  }

  // 정면 격자 창살 문
  const gateW = w * 0.26;
  const gateH = h * 0.22;
  pieces.push(`<rect x="${fmt(vp1X - gateW * 0.5)}" y="${fmt(vpY - gateH)}" width="${fmt(gateW)}" height="${fmt(gateH)}" fill="${palette.windowGlow}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
  lightPieces.push(`<polygon points="${fmt(vp1X - gateW * 0.45)},${fmt(vpY)} ${fmt(vp1X + gateW * 0.45)},${fmt(vpY)} ${fmt(vp1X + gateW)},${fmt(h)} ${fmt(vp1X - gateW)},${fmt(h)}" fill="${palette.windowGlow}" opacity="0.2"/>`);

  return { arch: pieces.join(""), lighting: lightPieces.join("") };
}

function buildRainyAlley(ctx: PerspectiveContext): { arch: string; lighting: string } {
  const { w, h, vp1X, vpY, stroke, palette, rng } = ctx;
  const pieces: string[] = [];
  const lightPieces: string[] = [];

  // 좁은 골목 좌우 벽면 투시
  for (const [tx, ty] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
    recordRay(ctx, 1, tx, ty);
  }
  const leftWall = perspectiveQuad(vp1X, vpY, 0, -h * 0.04, h * 0.98, 0.14, 1);
  const rightWall = perspectiveQuad(vp1X, vpY, w, -h * 0.04, h * 0.98, 0.14, 1);
  pieces.push(`<polygon points="${leftWall}" fill="${palette.architectureShadow}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);
  pieces.push(`<polygon points="${rightWall}" fill="${palette.architectureMid}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke)}"/>`);

  // 네온 간판 & 젖은 아스팔트 수직 반사
  const neon1 = perspectiveQuad(vp1X, vpY, w * 0.08, h * 0.22, h * 0.46, 0.46, 0.6);
  const neon2 = perspectiveQuad(vp1X, vpY, w * 0.92, h * 0.28, h * 0.5, 0.34, 0.48);
  lightPieces.push(`<polygon points="${neon1}" fill="${palette.accentLight}" stroke="${palette.inkLine}" stroke-width="1.2" opacity="0.88"/>`);
  lightPieces.push(`<polygon points="${neon2}" fill="${palette.windowGlow}" stroke="${palette.inkLine}" stroke-width="1.2" opacity="0.82"/>`);
  lightPieces.push(`<ellipse cx="${fmt(vp1X)}" cy="${fmt(vpY + (h - vpY) * 0.55)}" rx="${fmt(w * 0.16)}" ry="${fmt(h * 0.16)}" fill="${palette.accentLight}" opacity="0.2"/>`);

  // 대각선 빗줄기 레이어
  const rainColor = formatOklch({ l: 0.88, c: 0.03, h: 220, a: 0.42 });
  for (let i = 0; i < 42; i += 1) {
    const rx = rng() * w;
    const ry = rng() * h;
    const len = 18 + rng() * 34;
    lightPieces.push(`<line x1="${fmt(rx)}" y1="${fmt(ry)}" x2="${fmt(rx - len * 0.2)}" y2="${fmt(ry + len)}" stroke="${rainColor}" stroke-width="1.1"/>`);
  }

  return { arch: pieces.join(""), lighting: lightPieces.join("") };
}

function buildConcertPlaza(ctx: PerspectiveContext): { arch: string; lighting: string } {
  const { w, h, vp1X, vpY, stroke, palette } = ctx;
  const pieces: string[] = [];
  const lightPieces: string[] = [];

  // 광장 방사형 보도블록 투시
  for (let i = 0; i <= 8; i += 1) {
    const ray = recordRay(ctx, 1, (w / 8) * i, h);
    pieces.push(`<line x1="${fmt(ray.x1)}" y1="${fmt(ray.y1)}" x2="${fmt(ray.x2)}" y2="${fmt(ray.y2)}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 0.7)}" opacity="0.38"/>`);
  }

  // 원경 대형 콘서트 무대 트러스
  const stageW = w * 0.48;
  const stageH = h * 0.22;
  pieces.push(`<rect x="${fmt(vp1X - stageW * 0.5)}" y="${fmt(vpY - stageH)}" width="${fmt(stageW)}" height="${fmt(stageH)}" fill="${palette.architectureShadow}" stroke="${palette.inkLine}" stroke-width="${fmt(stroke * 1.1)}"/>`);
  pieces.push(`<rect x="${fmt(vp1X - stageW * 0.34)}" y="${fmt(vpY - stageH * 0.78)}" width="${fmt(stageW * 0.68)}" height="${fmt(stageH * 0.55)}" fill="${palette.accentLight}" opacity="0.34"/>`);

  // 교차 스포트라이트 빔
  for (const offset of [-0.36, -0.14, 0.14, 0.36]) {
    const originX = vp1X + stageW * offset;
    const topX = originX + offset * w * 0.7;
    recordRay(ctx, 1, clampNumber(topX, 0, w), 0);
    lightPieces.push(
      `<polygon points="${fmt(originX - 6)},${fmt(vpY - stageH)} ${fmt(originX + 6)},${fmt(vpY - stageH)} ${fmt(topX + 42)},0 ${fmt(topX - 42)},0" fill="${palette.windowGlow}" opacity="0.22"/>`,
    );
  }

  return { arch: pieces.join(""), lighting: lightPieces.join("") };
}

function buildPerspectiveGuideOverlay(ctx: PerspectiveContext): string {
  const guideStroke = formatOklch({ l: 0.72, c: 0.14, h: 42, a: 0.46 });
  const horizonStroke = formatOklch({ l: 0.68, c: 0.16, h: 190, a: 0.68 });
  const lines = ctx.rays.map(
    (ray) =>
      `<line x1="${fmt(ray.x1)}" y1="${fmt(ray.y1)}" x2="${fmt(ray.x2)}" y2="${fmt(ray.y2)}" stroke="${guideStroke}" stroke-width="0.9" stroke-dasharray="5 5"/>`,
  );
  const vpMarkers = [
    `<circle cx="${fmt(ctx.vp1X)}" cy="${fmt(ctx.vpY)}" r="4.5" fill="none" stroke="${horizonStroke}" stroke-width="1.6"/>`,
  ];
  if (ctx.mode === "2-point" && ctx.vp2X !== null) {
    vpMarkers.push(
      `<circle cx="${fmt(ctx.vp2X)}" cy="${fmt(ctx.vpY)}" r="4.5" fill="none" stroke="${horizonStroke}" stroke-width="1.6"/>`,
    );
  }
  return [
    `<g id="perspective-guides" data-perspective-mode="${ctx.mode}" data-vp-x="${fmt(ctx.vp1X)}" data-vp-y="${fmt(ctx.vpY)}">`,
    `<line x1="0" y1="${fmt(ctx.vpY)}" x2="${fmt(ctx.w)}" y2="${fmt(ctx.vpY)}" stroke="${horizonStroke}" stroke-width="1.2" stroke-dasharray="8 4"/>`,
    ...lines,
    ...vpMarkers,
    `</g>`,
  ].join("");
}

/** 8종 웹툰 테마 투시 일치 배경 SVG를 생성한다. */
export function generateMatchingWebtoonBackdropSvg(
  options: BackdropGenerationOptions,
): BackdropGenerationResult {
  const w = Math.round(clampNumber(options.width, 160, 4096));
  const h = Math.round(clampNumber(options.height, 160, 4096));
  const vp1X = clampNumber(options.vanishingPointX, w * 0.08, w * 0.92);
  const vpY = clampNumber(options.vanishingPointY, h * 0.14, h * 0.84);
  const vp2X =
    options.perspectiveMode === "2-point"
      ? clampNumber(
          options.secondaryVanishingPointX ?? (vp1X < w * 0.5 ? w * 0.94 : w * 0.06),
          -w * 0.4,
          w * 1.4,
        )
      : null;

  const palette = buildOklchScenePalette(options.theme, options.timeOfDay);
  const ctx: PerspectiveContext = {
    w,
    h,
    vp1X,
    vp2X,
    vpY,
    mode: options.perspectiveMode,
    stroke: clampNumber(options.lineWeight ?? 1.5, 0.5, 5),
    palette,
    timeOfDay: options.timeOfDay,
    rng: createSeededRng(options.seed ?? 202611),
    rays: [],
  };

  let built: { arch: string; lighting: string };
  switch (options.theme) {
    case "seoul-street":
      built = buildSeoulStreet(ctx);
      break;
    case "cozy-cafe":
      built = buildCozyCafe(ctx);
      break;
    case "rofan-ballroom":
      built = buildRofanBallroom(ctx);
      break;
    case "school-hallway":
      built = buildSchoolHallway(ctx);
      break;
    case "han-river-night":
      built = buildHanRiverNight(ctx);
      break;
    case "wuxia-inn":
      built = buildWuxiaInn(ctx);
      break;
    case "rainy-alley":
      built = buildRainyAlley(ctx);
      break;
    case "concert-plaza":
      built = buildConcertPlaza(ctx);
      break;
  }

  const defsMarkup = [
    `<linearGradient id="bg-sky-grad" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${palette.skyTop}"/>`,
    `<stop offset="100%" stop-color="${palette.skyHorizon}"/>`,
    `</linearGradient>`,
    `<linearGradient id="bg-ground-grad" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${palette.groundFar}"/>`,
    `<stop offset="100%" stop-color="${palette.groundNear}"/>`,
    `</linearGradient>`,
    `<linearGradient id="bg-haze-grad" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="${palette.haze}" stop-opacity="0"/>`,
    `<stop offset="50%" stop-color="${palette.haze}" stop-opacity="0.85"/>`,
    `<stop offset="100%" stop-color="${palette.haze}" stop-opacity="0"/>`,
    `</linearGradient>`,
  ].join("");

  const skyAndGround = buildSkyAndGround(ctx);
  const guides = options.showPerspectiveGuides ? buildPerspectiveGuideOverlay(ctx) : "";
  const innerMarkup = [
    skyAndGround,
    `<g id="backdrop-architecture" data-theme="${options.theme}">${built.arch}</g>`,
    `<g id="backdrop-lighting-shadows" data-time="${options.timeOfDay}">${built.lighting}</g>`,
    guides,
  ].join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${defsMarkup}</defs>${innerMarkup}</svg>`;

  return {
    svg,
    innerMarkup,
    defsMarkup,
    width: w,
    height: h,
    theme: options.theme,
    timeOfDay: options.timeOfDay,
    perspectiveMode: options.perspectiveMode,
    vanishingPoint: { x: vp1X, y: vpY },
    secondaryVanishingPoint: vp2X !== null ? { x: vp2X, y: vpY } : null,
    guideLines: Object.freeze([...ctx.rays]),
    palette,
  };
}
