/**
 * Wave 37D — 2D 배경 컷 광원 + 3D VRM SDF 셀 셰이딩 + XPBD 헤어·의상 물리 `<canvas>` 프리뷰 렌더러.
 * Calm Atelier CSS 시맨틱 토큰과 OKLCH 색공간만 사용한다(원시 hex/rgb/hsl 0건).
 */

import type { OklchColor, Unified2d3dLightRigResult } from "./webgpu-toon-lighting-baker";
import type { Vec3, XpbdSimulationState, XpbdWindConfig } from "./xpbd-types-and-rig";

export interface PreviewCanvasRenderOptions {
  readonly showColliders?: boolean;
  readonly wind?: XpbdWindConfig;
}

interface PreviewChromePalette {
  readonly fg: string;
  readonly fgMuted: string;
  readonly good: string;
}

const DEG_TO_RAD = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatOklchLocal(color: OklchColor, alpha?: number): string {
  const l = clamp(color.l, 0, 1).toFixed(3);
  const c = clamp(color.c, 0, 0.4).toFixed(3);
  const h = (((color.h % 360) + 360) % 360).toFixed(1);
  if (typeof alpha === "number" && Number.isFinite(alpha) && alpha < 0.999) {
    return `oklch(${l} ${c} ${h} / ${clamp(alpha, 0, 1).toFixed(2)})`;
  }
  return `oklch(${l} ${c} ${h})`;
}

function mixOklch(a: OklchColor, b: OklchColor, t: number): OklchColor {
  const k = clamp(t, 0, 1);
  let dh = ((b.h - a.h + 540) % 360) - 180;
  if (a.c < 0.005) dh = 0;
  const h = a.c < 0.005 ? b.h : (((a.h + dh * k) % 360) + 360) % 360;
  return {
    l: clamp(a.l + (b.l - a.l) * k, 0, 1),
    c: clamp(a.c + (b.c - a.c) * k, 0, 0.4),
    h,
  };
}

function resolvePreviewChromePalette(canvas: HTMLCanvasElement): PreviewChromePalette {
  const rootStyle =
    typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const elStyle = typeof getComputedStyle === "function" ? getComputedStyle(canvas) : null;
  const fallbackFg = elStyle?.color.trim() || "CanvasText";

  const pick = (token: string, fallback: string): string => {
    const fromEl = elStyle?.getPropertyValue(token).trim() ?? "";
    if (fromEl.length > 0) return fromEl;
    const fromRoot = rootStyle?.getPropertyValue(token).trim() ?? "";
    return fromRoot.length > 0 ? fromRoot : fallback;
  };

  const fg = pick("--color-fg", fallbackFg);
  const accent = pick("--color-accent", fg);
  return {
    fg,
    fgMuted: pick("--color-fg-2", fg),
    good: pick("--color-good", accent),
  };
}

/**
 * 2D 배경 컷 광원, 3D VRM SDF 셀 셰이딩 볼륨, 5종 캡슐 콜라이더 와이어, XPBD 헤어·의상 가닥을 `<canvas>`에 그린다.
 */
export function renderXpbdLightingPreviewCanvas(
  canvas: HTMLCanvasElement,
  simState: XpbdSimulationState,
  lightRig: Unified2d3dLightRigResult,
  options: PreviewCanvasRenderOptions = {},
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const palette = resolvePreviewChromePalette(canvas);
  const width = canvas.width || 560;
  const height = canvas.height || 340;
  const horizonY = Math.round(height * 0.72);
  const meta2d = lightRig.cut2dLightMetadata;
  const centerX = width * 0.5;
  const scale = Math.min(width * 0.88, height * 0.94);

  const worldToCanvas = (v: Vec3): readonly [number, number] => [
    centerX + v[0] * scale + v[2] * scale * 0.14,
    horizonY - (v[1] - 1.02) * scale * 0.84,
  ];

  ctx.clearRect(0, 0, width, height);

  // 1) 2D 배경 컷 하늘·바닥 그라데이션 (단일 물리 광원 색온도 일치)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0, formatOklchLocal(meta2d.skyZenithOklch));
  skyGrad.addColorStop(1, formatOklchLocal(meta2d.skyHorizonOklch));
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, horizonY);

  const floorGrad = ctx.createLinearGradient(0, horizonY, 0, height);
  floorGrad.addColorStop(0, formatOklchLocal(meta2d.groundLitOklch));
  floorGrad.addColorStop(1, formatOklchLocal(lightRig.floorBounceOklch));
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, horizonY, width, height - horizonY);

  // 2) 투영 그림자 (주광원 정반대 180° 방향 + 고도각 기반 길이)
  const shadowRad = lightRig.projectedShadowAngleDeg * DEG_TO_RAD;
  const shadowShiftX = Math.cos(shadowRad) * Math.min(120, 26 * lightRig.projectedShadowLengthRatio);
  const shadowShiftY = Math.sin(shadowRad) * 16;
  ctx.save();
  ctx.fillStyle = formatOklchLocal(meta2d.groundShadowOklch, 0.78);
  ctx.beginPath();
  ctx.ellipse(
    centerX + shadowShiftX,
    horizonY + 26 + shadowShiftY,
    Math.min(138, 44 + 18 * lightRig.projectedShadowLengthRatio),
    18,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  // 3) 주광원 배지 & 2D-3D 광선 가이드
  const sunX = centerX + lightRig.lightDirection2d[0] * (width * 0.34);
  const sunY = Math.max(30, horizonY - 110 - lightRig.lightDirection2d[1] * 115);
  ctx.save();
  ctx.strokeStyle = formatOklchLocal(lightRig.keyLightOklch, 0.65);
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(sunX, sunY);
  ctx.lineTo(centerX, horizonY - 125);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = formatOklchLocal(lightRig.keyLightOklch);
  ctx.beginPath();
  ctx.arc(sunX, sunY, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = formatOklchLocal(lightRig.rimLightOklch);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 4) 3D VRM 캐릭터 베이크 SDF 셀 셰이딩 볼륨
  const gridW = lightRig.sdfFieldWidth;
  const gridH = lightRig.sdfFieldHeight;
  const bustOriginX = centerX - scale * 0.28;
  const bustSpanW = scale * 0.56;
  const bustTopY = horizonY - (1.78 - 1.02) * scale * 0.84;
  const bustSpanH = 0.78 * scale * 0.84;
  const cellW = bustSpanW / gridW;
  const cellH = bustSpanH / gridH;

  for (let i = 0; i < lightRig.sdfSamples.length; i += 1) {
    const sample = lightRig.sdfSamples[i];
    if (!sample || !sample.hit) continue;
    const gx = i % gridW;
    const gy = Math.floor(i / gridW);
    ctx.fillStyle = formatOklchLocal(sample.finalColorOklch);
    ctx.fillRect(
      bustOriginX + gx * cellW - 0.5,
      bustTopY + gy * cellH - 0.5,
      cellW + 1.2,
      cellH + 1.2,
    );
  }

  // 5) 5종 캡슐 콜라이더 와이어프레임 오버레이
  if (options.showColliders) {
    ctx.save();
    ctx.strokeStyle = palette.good;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    for (const cap of simState.colliders) {
      const [ax, ay] = worldToCanvas(cap.a);
      const [bx, by] = worldToCanvas(cap.b);
      const radPx = cap.radius * scale * 0.84;
      ctx.beginPath();
      ctx.ellipse(
        (ax + bx) * 0.5,
        (ay + by) * 0.5,
        Math.hypot(bx - ax, by - ay) * 0.5 + radPx,
        radPx,
        Math.atan2(by - ay, bx - ax),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6) XPBD 의상 스트립 & 헤어 가닥
  const grouped = new Map<number, { kind: "hair" | "cloth"; nodes: { seg: number; pos: Vec3 }[] }>();
  for (const p of simState.particles) {
    const bucket = grouped.get(p.strandIndex) ?? { kind: p.kind, nodes: [] };
    bucket.nodes.push({ seg: p.segmentIndex, pos: p.pos });
    grouped.set(p.strandIndex, bucket);
  }

  const litBand = lightRig.celRamp[lightRig.celRamp.length - 1]?.colorOklch ?? lightRig.keyLightOklch;
  const clothLitColor = formatOklchLocal(mixOklch(litBand, lightRig.floorBounceOklch, 0.35), 0.88);
  const clothShadowColor = formatOklchLocal(lightRig.shadowTintOklch, 0.85);
  const hairBaseColor = formatOklchLocal(mixOklch(lightRig.shadowTintOklch, lightRig.keyLightOklch, 0.42));
  const hairRimColor = formatOklchLocal(lightRig.rimLightOklch, 0.72);

  for (const bucket of grouped.values()) {
    bucket.nodes.sort((a, b) => a.seg - b.seg);
    if (bucket.nodes.length < 2) continue;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    bucket.nodes.forEach((node, idx) => {
      const [sx, sy] = worldToCanvas(node.pos);
      if (idx === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });

    if (bucket.kind === "cloth") {
      ctx.strokeStyle = clothLitColor;
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = clothShadowColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = hairBaseColor;
      ctx.lineWidth = 4.2;
      ctx.stroke();
      ctx.strokeStyle = hairRimColor;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      const offsetX = lightRig.lightDirection2d[0] * 1.4;
      bucket.nodes.forEach((node, idx) => {
        const [sx, sy] = worldToCanvas(node.pos);
        if (idx === 0) ctx.moveTo(sx + offsetX, sy);
        else ctx.lineTo(sx + offsetX, sy);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  // 7) 좌상단·좌하단 실시간 HUD 라벨
  ctx.save();
  ctx.fillStyle = palette.fg;
  ctx.font = "600 11px sans-serif";
  const windText = options.wind
    ? `바람 ${options.wind.strengthMps.toFixed(1)}m/s (${Math.round(options.wind.azimuthDeg)}°)`
    : "바람 대기";
  ctx.fillText(
    `${windText} · 광원 ${Math.round(lightRig.input.azimuthDeg)}° / 고도 ${Math.round(lightRig.input.elevationDeg)}° / ${lightRig.input.colorTempKelvin}K`,
    12,
    20,
  );
  ctx.fillStyle = palette.fgMuted;
  ctx.font = "500 10px sans-serif";
  ctx.fillText(
    `투영 그림자 ${Math.round(lightRig.projectedShadowAngleDeg)}° · 길이비 ${lightRig.projectedShadowLengthRatio.toFixed(2)}x`,
    12,
    height - 10,
  );
  ctx.restore();

  return true;
}
