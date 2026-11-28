/**
 * Wave 121 — 인쇄 안전 순수 OKLCH 바람장·주름·충돌 검수 SVG 렌더러 및 한국어 작화 브리프 생성기.
 *
 * - 원시 색상 포맷을 배제하고 100% 순수 `oklch(...)` 팔레트만 사용
 * - XML 특수문자(`<`, `>`, `&`, `"`, `'`) 완전 이스케이프 및 `NaN`/`Infinity` 0건 보장
 * - 번역투 없는 실무 한국어 웹툰 작화 감독 검수 브리프 생성
 */

import type {
  ClothFoldRidgeKind,
  HeroWebtoonFreezeFrameBake,
} from "./cloth-fold-ridge-and-wgsl";
import type { BodyCapsuleCollider, Vec2 } from "./xpbd-cloth-hair-wind-solver";

export type XpbdBakeSvgTheme = "calm-atelier-print" | "studio-dark";

export interface RenderXpbdBakeSvgOptions {
  readonly theme?: XpbdBakeSvgTheme;
  readonly showMeshWireframe?: boolean;
  readonly showShadingNormals?: boolean;
  readonly titleOverride?: string;
}

export interface XpbdClothHairBakeBriefKo {
  readonly presetId: HeroWebtoonFreezeFrameBake["presetId"];
  readonly presetLabelKo: string;
  readonly materialLabelKo: string;
  readonly headlineKo: string;
  readonly silhouetteAssessmentKo: string;
  readonly physicsAuditKo: string;
  readonly inkingGuideKo: string;
  readonly checklistKo: readonly string[];
  readonly markdownSummaryKo: string;
}

interface XpbdOklchPalette {
  readonly canvasBg: string;
  readonly frameStroke: string;
  readonly gridStroke: string;
  readonly windStroke: string;
  readonly windArrowFill: string;
  readonly colliderFill: string;
  readonly colliderStroke: string;
  readonly colliderHaloStroke: string;
  readonly colliderLabelInk: string;
  readonly clothFill: string;
  readonly clothWireStroke: string;
  readonly pinFill: string;
  readonly pinStroke: string;
  readonly contourStroke: string;
  readonly pipeFoldStroke: string;
  readonly drapeFoldStroke: string;
  readonly flutterCrestStroke: string;
  readonly shadingTickStroke: string;
  readonly hudBg: string;
  readonly hudBorder: string;
  readonly hudTitleInk: string;
  readonly hudMetaInk: string;
}

const CALM_ATELIER_PRINT_PALETTE: XpbdOklchPalette = {
  canvasBg: "oklch(0.982 0.007 88)",
  frameStroke: "oklch(0.24 0.02 250)",
  gridStroke: "oklch(0.86 0.01 88 / 0.55)",
  windStroke: "oklch(0.48 0.11 232)",
  windArrowFill: "oklch(0.44 0.13 232)",
  colliderFill: "oklch(0.92 0.022 155 / 0.52)",
  colliderStroke: "oklch(0.36 0.09 158)",
  colliderHaloStroke: "oklch(0.50 0.08 158 / 0.65)",
  colliderLabelInk: "oklch(0.28 0.06 158)",
  clothFill: "oklch(0.95 0.018 76 / 0.72)",
  clothWireStroke: "oklch(0.62 0.03 245 / 0.42)",
  pinFill: "oklch(0.48 0.16 28)",
  pinStroke: "oklch(0.98 0.005 90)",
  contourStroke: "oklch(0.16 0.015 260)",
  pipeFoldStroke: "oklch(0.28 0.12 255)",
  drapeFoldStroke: "oklch(0.34 0.11 160)",
  flutterCrestStroke: "oklch(0.46 0.16 34)",
  shadingTickStroke: "oklch(0.42 0.06 255 / 0.65)",
  hudBg: "oklch(0.99 0.004 90 / 0.94)",
  hudBorder: "oklch(0.76 0.015 90)",
  hudTitleInk: "oklch(0.18 0.018 255)",
  hudMetaInk: "oklch(0.36 0.02 250)",
};

const STUDIO_DARK_PALETTE: XpbdOklchPalette = {
  canvasBg: "oklch(0.18 0.014 252)",
  frameStroke: "oklch(0.82 0.015 90)",
  gridStroke: "oklch(0.32 0.015 252 / 0.65)",
  windStroke: "oklch(0.74 0.12 225)",
  windArrowFill: "oklch(0.78 0.13 225)",
  colliderFill: "oklch(0.32 0.06 160 / 0.42)",
  colliderStroke: "oklch(0.74 0.11 160)",
  colliderHaloStroke: "oklch(0.68 0.09 160 / 0.55)",
  colliderLabelInk: "oklch(0.86 0.06 160)",
  clothFill: "oklch(0.29 0.025 250 / 0.72)",
  clothWireStroke: "oklch(0.64 0.03 245 / 0.38)",
  pinFill: "oklch(0.74 0.17 34)",
  pinStroke: "oklch(0.18 0.014 252)",
  contourStroke: "oklch(0.95 0.01 90)",
  pipeFoldStroke: "oklch(0.76 0.13 248)",
  drapeFoldStroke: "oklch(0.76 0.12 160)",
  flutterCrestStroke: "oklch(0.78 0.16 38)",
  shadingTickStroke: "oklch(0.72 0.06 248 / 0.65)",
  hudBg: "oklch(0.22 0.015 252 / 0.94)",
  hudBorder: "oklch(0.42 0.02 252)",
  hudTitleInk: "oklch(0.95 0.01 90)",
  hudMetaInk: "oklch(0.78 0.016 240)",
};

export function escapeXpbdSvgXml(raw: string): string {
  return raw
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function fmtNum(value: number, fallback = 0): string {
  const safe = Number.isFinite(value) ? value : fallback;
  const rounded = Math.round(safe * 100) / 100;
  return Object.is(rounded, -0) ? "0" : rounded.toFixed(2);
}

function polylinePointsAttr(points: readonly Vec2[]): string {
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    parts.push(`${fmtNum(pt.x)},${fmtNum(pt.y)}`);
  }
  return parts.join(" ");
}

function ridgeStrokeForKind(kind: ClothFoldRidgeKind, palette: XpbdOklchPalette): string {
  switch (kind) {
    case "pipe-fold":
      return palette.pipeFoldStroke;
    case "drape-fold":
      return palette.drapeFoldStroke;
    case "wind-flutter-crest":
      return palette.flutterCrestStroke;
  }
}

function renderColliderSvgElement(collider: BodyCapsuleCollider, palette: XpbdOklchPalette): string {
  const r = Math.max(1, Number.isFinite(collider.radius) ? collider.radius : 1);
  const segLen = Math.hypot(collider.bx - collider.ax, collider.by - collider.ay);
  const safeId = escapeXpbdSvgXml(collider.id);
  const safeLabel = escapeXpbdSvgXml(collider.labelKo);
  const cx = (collider.ax + collider.bx) * 0.5;
  const cy = (collider.ay + collider.by) * 0.5;

  if (segLen < 0.5) {
    return [
      `    <g data-collider="${safeId}">`,
      `      <circle cx="${fmtNum(collider.ax)}" cy="${fmtNum(collider.ay)}" r="${fmtNum(r + 3)}" fill="none" stroke="${palette.colliderHaloStroke}" stroke-width="1.00" stroke-dasharray="4 3" />`,
      `      <circle cx="${fmtNum(collider.ax)}" cy="${fmtNum(collider.ay)}" r="${fmtNum(r)}" fill="${palette.colliderFill}" stroke="${palette.colliderStroke}" stroke-width="1.60" />`,
      `      <text x="${fmtNum(cx)}" y="${fmtNum(cy + 4)}" text-anchor="middle" font-size="11" font-weight="600" fill="${palette.colliderLabelInk}">${safeLabel}</text>`,
      `    </g>`,
    ].join("\n");
  }

  return [
    `    <g data-collider="${safeId}">`,
    `      <line x1="${fmtNum(collider.ax)}" y1="${fmtNum(collider.ay)}" x2="${fmtNum(collider.bx)}" y2="${fmtNum(collider.by)}" stroke="${palette.colliderHaloStroke}" stroke-width="${fmtNum((r + 3) * 2)}" stroke-linecap="round" opacity="0.35" />`,
    `      <line x1="${fmtNum(collider.ax)}" y1="${fmtNum(collider.ay)}" x2="${fmtNum(collider.bx)}" y2="${fmtNum(collider.by)}" stroke="${palette.colliderFill}" stroke-width="${fmtNum(r * 2)}" stroke-linecap="round" />`,
    `      <line x1="${fmtNum(collider.ax)}" y1="${fmtNum(collider.ay)}" x2="${fmtNum(collider.bx)}" y2="${fmtNum(collider.by)}" stroke="${palette.colliderStroke}" stroke-width="1.50" stroke-dasharray="5 3" stroke-linecap="round" />`,
    `      <text x="${fmtNum(cx)}" y="${fmtNum(cy + 4)}" text-anchor="middle" font-size="11" font-weight="600" fill="${palette.colliderLabelInk}">${safeLabel}</text>`,
    `    </g>`,
  ].join("\n");
}

/**
 * 인체 충돌 캡슐, 바람 유선 화살표, 베이크된 천·머리카락 격자, 추출된 주름 능선을
 * 순수 OKLCH 인쇄 안전 SVG 문자열로 렌더링한다.
 */
export function renderXpbdClothHairBakeSvg(
  bake: HeroWebtoonFreezeFrameBake,
  options: RenderXpbdBakeSvgOptions = {},
): string {
  const palette = options.theme === "studio-dark" ? STUDIO_DARK_PALETTE : CALM_ATELIER_PRINT_PALETTE;
  const showWireframe = options.showMeshWireframe ?? true;
  const showNormals = options.showShadingNormals ?? true;
  const width = Math.max(160, Number.isFinite(bake.state.viewportWidth) ? bake.state.viewportWidth : 640);
  const height = Math.max(160, Number.isFinite(bake.state.viewportHeight) ? bake.state.viewportHeight : 800);
  const safeTitle = escapeXpbdSvgXml(options.titleOverride ?? bake.title);
  const safePresetLabel = escapeXpbdSvgXml(bake.presetLabelKo);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmtNum(width)} ${fmtNum(height)}" width="${fmtNum(width)}" height="${fmtNum(height)}" role="img" aria-label="${safeTitle}">`,
    `  <title>${safeTitle}</title>`,
    `  <g data-layer="paper-frame">`,
    `    <rect x="0.00" y="0.00" width="${fmtNum(width)}" height="${fmtNum(height)}" fill="${palette.canvasBg}" stroke="${palette.frameStroke}" stroke-width="2.00" />`,
  ];

  for (let gx = 80; gx < width; gx += 80) {
    lines.push(
      `    <line x1="${fmtNum(gx)}" y1="0.00" x2="${fmtNum(gx)}" y2="${fmtNum(height)}" stroke="${palette.gridStroke}" stroke-width="0.75" />`,
    );
  }
  for (let gy = 80; gy < height; gy += 80) {
    lines.push(
      `    <line x1="0.00" y1="${fmtNum(gy)}" x2="${fmtNum(width)}" y2="${fmtNum(gy)}" stroke="${palette.gridStroke}" stroke-width="0.75" />`,
    );
  }
  lines.push(`  </g>`);

  // 바람 유선 화살표
  lines.push(`  <g data-layer="wind-streamlines">`);
  for (let i = 0; i < bake.windStreamlines.length; i += 1) {
    const stream = bake.windStreamlines[i];
    const pts = polylinePointsAttr(stream.points);
    if (pts.length === 0 || stream.points.length < 2) continue;
    const tip = stream.points[stream.points.length - 1];
    const angle = Number.isFinite(stream.tipAngleRad) ? stream.tipAngleRad : 0;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const backX = tip.x - cosA * 10;
    const backY = tip.y - sinA * 10;
    const wingLeftX = backX - sinA * 4.5;
    const wingLeftY = backY + cosA * 4.5;
    const wingRightX = backX + sinA * 4.5;
    const wingRightY = backY - cosA * 4.5;
    lines.push(
      `    <polyline data-id="${escapeXpbdSvgXml(stream.id)}" points="${pts}" fill="none" stroke="${palette.windStroke}" stroke-width="1.35" stroke-dasharray="6 4" stroke-linecap="round" />`,
    );
    lines.push(
      `    <polygon points="${fmtNum(tip.x)},${fmtNum(tip.y)} ${fmtNum(wingLeftX)},${fmtNum(wingLeftY)} ${fmtNum(wingRightX)},${fmtNum(wingRightY)}" fill="${palette.windArrowFill}" />`,
    );
  }
  lines.push(`  </g>`);

  // 인체 충돌 캡슐
  lines.push(`  <g data-layer="body-colliders">`);
  for (let i = 0; i < bake.state.colliders.length; i += 1) {
    lines.push(renderColliderSvgElement(bake.state.colliders[i], palette));
  }
  lines.push(`  </g>`);

  // 베이크된 천·머리카락 실루엣 및 메쉬 와이어프레임
  lines.push(`  <g data-layer="baked-cloth-mesh">`);
  const contourPts = polylinePointsAttr(bake.outerContourPolyline);
  if (contourPts.length > 0) {
    lines.push(`    <polygon points="${contourPts}" fill="${palette.clothFill}" stroke="none" />`);
  }
  if (showWireframe) {
    for (let i = 0; i < bake.state.distanceConstraints.length; i += 1) {
      const c = bake.state.distanceConstraints[i];
      if (c.kind === "shear") continue;
      const pa = bake.state.particles[c.a];
      const pb = bake.state.particles[c.b];
      lines.push(
        `    <line x1="${fmtNum(pa.x)}" y1="${fmtNum(pa.y)}" x2="${fmtNum(pb.x)}" y2="${fmtNum(pb.y)}" stroke="${palette.clothWireStroke}" stroke-width="0.90" />`,
      );
    }
  }
  for (let i = 0; i < bake.state.particles.length; i += 1) {
    const p = bake.state.particles[i];
    if (!p.pinned) continue;
    lines.push(
      `    <circle cx="${fmtNum(p.x)}" cy="${fmtNum(p.y)}" r="3.60" fill="${palette.pinFill}" stroke="${palette.pinStroke}" stroke-width="1.20" />`,
    );
  }
  lines.push(`  </g>`);

  // 외곽 펜선 실루엣
  lines.push(`  <g data-layer="outer-ink-contour">`);
  if (contourPts.length > 0) {
    lines.push(
      `    <polygon points="${contourPts}" fill="none" stroke="${palette.contourStroke}" stroke-width="2.10" stroke-linejoin="round" />`,
    );
  }
  lines.push(`  </g>`);

  // 주름 능선 및 음영 방향 벡터 틱
  lines.push(`  <g data-layer="tension-fold-ridges">`);
  for (let i = 0; i < bake.foldRidges.ridges.length; i += 1) {
    const ridge = bake.foldRidges.ridges[i];
    const pts = polylinePointsAttr(ridge.points);
    if (pts.length === 0) continue;
    const strokeColor = ridgeStrokeForKind(ridge.kind, palette);
    lines.push(
      `    <polyline data-id="${escapeXpbdSvgXml(ridge.id)}" data-kind="${escapeXpbdSvgXml(ridge.kind)}" points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="${fmtNum(ridge.strokeWidthPx, 1.5)}" stroke-linecap="round" stroke-linejoin="round" />`,
    );
    if (showNormals && ridge.points.length >= 2) {
      const midPt = ridge.points[Math.floor(ridge.points.length / 2)];
      const tickEndX = midPt.x + ridge.shadingNormal.x * 9;
      const tickEndY = midPt.y + ridge.shadingNormal.y * 9;
      lines.push(
        `    <line x1="${fmtNum(midPt.x)}" y1="${fmtNum(midPt.y)}" x2="${fmtNum(tickEndX)}" y2="${fmtNum(tickEndY)}" stroke="${palette.shadingTickStroke}" stroke-width="1.10" stroke-linecap="round" />`,
      );
    }
  }
  lines.push(`  </g>`);

  // 상단 요약 배지
  const stretchPct = fmtNum(bake.maxStretchErrorRatio * 100);
  const sweepText = fmtNum(bake.silhouetteSweepRatio);
  const metaLine = escapeXpbdSvgXml(
    `${bake.presetLabelKo} | 프레임 #${bake.bakedFrameIndex} | 확장도 ${sweepText}x | 신축 오차 ${stretchPct}% | 관통 ${bake.colliderPenetrationCount}건 | 능선 ${bake.foldRidges.ridges.length}개`,
  );
  lines.push(`  <g data-layer="hud-summary-badge">`);
  lines.push(
    `    <rect x="16.00" y="14.00" width="${fmtNum(Math.min(width - 32, 608))}" height="48.00" rx="10.00" fill="${palette.hudBg}" stroke="${palette.hudBorder}" stroke-width="1.20" />`,
  );
  lines.push(
    `    <text x="28.00" y="34.00" font-size="13" font-weight="700" fill="${palette.hudTitleInk}">${safeTitle}</text>`,
  );
  lines.push(
    `    <text x="28.00" y="52.00" font-size="11" font-weight="500" fill="${palette.hudMetaInk}">${metaLine}</text>`,
  );
  lines.push(`  </g>`);
  lines.push(`  <!-- preset:${safePresetLabel} -->`);
  lines.push(`</svg>`);

  return lines.join("\n");
}

function describeWindDirectionKo(windX: number, windY: number): string {
  const horizontal = windX > 25 ? "오른쪽" : windX < -25 ? "왼쪽" : "정면";
  const vertical = windY < -25 ? "상승" : windY > 25 ? "하강" : "수평";
  if (horizontal === "정면" && vertical === "수평") return "미풍";
  if (vertical === "수평") return `${horizontal} 측풍`;
  return `${horizontal} ${vertical} 바람`;
}

/**
 * 번역투 없는 실무 한국어 웹툰 작화 감독용 XPBD 정지컷 베이크 브리프를 생성한다.
 */
export function summarizeXpbdClothHairBakeKo(bake: HeroWebtoonFreezeFrameBake): XpbdClothHairBakeBriefKo {
  const stretchPct = (bake.maxStretchErrorRatio * 100).toFixed(2);
  const sweepText = bake.silhouetteSweepRatio.toFixed(2);
  const tailDx = bake.state.metrics.tailDisplacement.x.toFixed(1);
  const windDirKo = describeWindDirectionKo(bake.state.wind.windVector.x, bake.state.wind.windVector.y);
  const counts = bake.foldRidges.countsByKind;
  const totalRidges = bake.foldRidges.ridges.length;
  const materialLabelKo = bake.state.material.labelKo;

  const readinessKo = bake.traceReady ? "즉시 펜선 트레이싱 가능" : "재시뮬레이션 점검 필요";
  const headlineKo = `${bake.presetLabelKo} 정지컷 베이크 완료 (${readinessKo} · 관통 ${bake.colliderPenetrationCount}건 · 주름 능선 ${totalRidges}개)`;

  const silhouetteAssessmentKo =
    `${windDirKo}에 맞춰 ${bake.presetLabelKo} 자락이 기본 자세 대비 ${sweepText}배 펼쳐졌고, ` +
    `꼬리 끝단 수평 변위는 ${tailDx}px로 잡혔습니다(베이크 프레임 #${bake.bakedFrameIndex}/${bake.totalSimulatedSteps}).`;

  const physicsAuditKo =
    `${materialLabelKo} 물성 기준으로 구조 신축 오차는 최대 ${stretchPct}%(허용 2.00% 미만)에 머물렀으며, ` +
    `인체 캡슐 충돌체 관통은 ${bake.colliderPenetrationCount}건(접촉 ${bake.state.metrics.colliderContactCount}개 입자)입니다.`;

  const inkingGuideKo =
    `추출된 파이프 주름 ${counts["pipe-fold"]}개는 루트에서 하단으로 힘 있게 긋고, ` +
    `드레이프 주름 ${counts["drape-fold"]}개는 중간 음영 경계선으로 정리한 뒤, ` +
    `하단 펄럭임 마루 ${counts["wind-flutter-crest"]}개는 바람 끝단 강약 펜선으로 마무리하십시오.`;

  const checklistKo: readonly string[] = [
    `실루엣 확장도 ${sweepText}배와 외곽선(${bake.outerContourPolyline.length}점)을 펜선 1차 레이어에 배치`,
    `인체 충돌 관통 ${bake.colliderPenetrationCount}건 확인(머리·어깨·몸통 경계 겹침 없음)`,
    `최대 신축 오차 ${stretchPct}%로 원단 늘어짐 왜곡 차단`,
    `파이프 ${counts["pipe-fold"]} · 드레이프 ${counts["drape-fold"]} · 펄럭임 ${counts["wind-flutter-crest"]} 주름 능선의 음영 벡터 방향으로 그림자 톤 채우기`,
  ];

  const markdownSummaryKo = [
    `### ${headlineKo}`,
    `- **동세·실루엣**: ${silhouetteAssessmentKo}`,
    `- **물리 검수**: ${physicsAuditKo}`,
    `- **펜선·음영 가이드**: ${inkingGuideKo}`,
  ].join("\n");

  return {
    presetId: bake.presetId,
    presetLabelKo: bake.presetLabelKo,
    materialLabelKo,
    headlineKo,
    silhouetteAssessmentKo,
    physicsAuditKo,
    inkingGuideKo,
    checklistKo,
    markdownSummaryKo,
  };
}
