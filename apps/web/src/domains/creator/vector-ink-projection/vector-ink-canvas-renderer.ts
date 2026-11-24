/**
 * 3D 실루엣·크리즈 G펜 벡터 잉크 투영 `<canvas>` 2D 렌더러 및 G펜 필압 리본 미리보기 패스 생성기.
 * 색상은 DOM `getComputedStyle`의 시맨틱 CSS 변수에서만 읽는다.
 */

import type { CreatorGpenProfile, VectorInkProjectionResult } from "./types";
import { evaluateGpenStrokeWidth } from "./vector-ink-projection-engine";

function resolveCanvasColorToken(canvas: HTMLCanvasElement, cssVar: string): string {
  const computed = globalThis.getComputedStyle?.(canvas);
  const value = computed?.getPropertyValue(cssVar).trim();
  return value && value.length > 0 ? value : "currentColor";
}

/** G펜 필압·테이퍼 프로필을 소형 SVG 리본 `<path d>`로 생성한다. */
export function buildGpenNibPreviewPath(profile: CreatorGpenProfile): string {
  const width = 140;
  const midY = 14;
  const steps = 28;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = 6 + t * (width - 12);
    const w = evaluateGpenStrokeWidth({
      t,
      curvature: 0.15 * Math.sin(Math.PI * t),
      shadowFactor: 0.55,
      kind: "silhouette",
      closed: false,
      profile,
    });
    const halfH = Math.min(10.5, Math.max(0.6, w * 1.45));
    top.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${(midY - halfH).toFixed(1)}`);
    bottom.push(`L ${x.toFixed(1)} ${(midY + halfH).toFixed(1)}`);
  }
  return `${top.join(" ")} ${bottom.reverse().join(" ")} Z`;
}

/** 투영된 가변 폭 큐빅 베지어 잉크 스트로크와 선택적 제어점 핸들을 `<canvas>`에 렌더링한다. */
export function drawVectorInkViewport(
  canvas: HTMLCanvasElement,
  projection: VectorInkProjectionResult,
  showBezierGuides: boolean,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const lineColor = resolveCanvasColorToken(canvas, "--color-line");
  const inkColor = resolveCanvasColorToken(canvas, "--color-fg");
  const accentColor = resolveCanvasColorToken(canvas, "--color-accent");
  const coolColor = resolveCanvasColorToken(canvas, "--color-cool");
  const warnColor = resolveCanvasColorToken(canvas, "--color-warn");

  // 1) 작업대 삼분할 정렬 가이드
  ctx.save();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;
  for (const frac of [1 / 3, 2 / 3]) {
    ctx.beginPath();
    ctx.moveTo(w * frac, 0);
    ctx.lineTo(w * frac, h);
    ctx.moveTo(0, h * frac);
    ctx.lineTo(w, h * frac);
    ctx.stroke();
  }
  ctx.restore();

  // 2) 좌상단 주광 방향 표시
  ctx.save();
  const hudX = 34;
  const hudY = 34;
  const lx = projection.keyLightDirection.x;
  const ly = -projection.keyLightDirection.y;
  const dirLen = Math.hypot(lx, ly) || 1;
  const dx = (lx / dirLen) * 16;
  const dy = (ly / dirLen) * 16;
  ctx.strokeStyle = warnColor;
  ctx.fillStyle = warnColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(hudX, hudY, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hudX, hudY);
  ctx.lineTo(hudX - dx, hudY - dy);
  ctx.stroke();
  ctx.restore();

  // 3) Z-정렬된 가변 선폭 G펜 벡터 외곽선 폴리곤 채우기
  for (const stroke of projection.strokes) {
    if (stroke.outlinePolygon.length < 3) continue;
    ctx.save();
    ctx.fillStyle = inkColor;
    ctx.globalAlpha = stroke.kind === "crease" ? 0.9 : 1;
    ctx.beginPath();
    const first = stroke.outlinePolygon[0];
    if (first) {
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.outlinePolygon.length; i += 1) {
        const pt = stroke.outlinePolygon[i];
        if (pt) ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 4) 편집 가능한 큐빅 베지어 중심선 및 핸들 오버레이
  if (showBezierGuides) {
    ctx.save();
    for (const stroke of projection.strokes) {
      ctx.strokeStyle = coolColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.78;
      ctx.beginPath();
      const firstSeg = stroke.segments[0];
      if (firstSeg) {
        ctx.moveTo(firstSeg.p0.x, firstSeg.p0.y);
        for (const seg of stroke.segments) {
          ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p3.x, seg.p3.y);
        }
        ctx.stroke();
      }

      ctx.strokeStyle = accentColor;
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.85;
      for (const seg of stroke.segments) {
        ctx.beginPath();
        ctx.moveTo(seg.p0.x, seg.p0.y);
        ctx.lineTo(seg.cp1.x, seg.cp1.y);
        ctx.moveTo(seg.p3.x, seg.p3.y);
        ctx.lineTo(seg.cp2.x, seg.cp2.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(seg.p0.x, seg.p0.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
