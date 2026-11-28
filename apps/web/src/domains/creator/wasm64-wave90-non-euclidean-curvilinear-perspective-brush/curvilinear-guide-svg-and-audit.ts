/**
 * Wave 90 — 고대비 인쇄 안전 곡면 투시 SVG 다이어그램 렌더러 및 자연스러운 한국어 작업 리포트.
 *
 * - 측지선 그리드, 4/5/6점 소실점 조준 마커, 곡면 보정 3D 프롭, 굴절 브러시 닙 타원을 SVG로 렌더링
 * - NaN/Infinity 완전 차단, 모든 사용자 문자열 XML 이스케이프 처리
 * - 번역투 없는 실무형 한국어 스튜디오 요약 리포트 생성
 */

import {
  computeCurvilinearVanishingPoints,
  generateCurvilinearGuideGrid,
  type CanonicalVanishingPointId,
  type CurvilinearCameraConfig,
  type CurvilinearGuideGrid,
  type CurvilinearPolylineSegment,
  type CurvilinearProjectionMode,
  type Vec2,
} from "./curvilinear-projection-field";
import type {
  CurvilinearBentPropResult,
  CurvilinearWgslShaderArtifact,
  RefractedBrushStrokeResult,
} from "./refractive-geodesic-brush-and-prop-solver";

export type CurvilinearSvgTheme = "light" | "dark";

export interface CurvilinearSvgScene {
  readonly title: string;
  readonly camera: CurvilinearCameraConfig;
  readonly guideGrid?: CurvilinearGuideGrid;
  readonly props?: readonly CurvilinearBentPropResult[];
  readonly strokes?: readonly RefractedBrushStrokeResult[];
  readonly showVanishingPointLabels?: boolean;
  readonly showBackFacingPropEdges?: boolean;
  readonly theme?: CurvilinearSvgTheme;
}

export interface CurvilinearSessionAuditInput {
  readonly camera: CurvilinearCameraConfig;
  readonly guideGrid?: CurvilinearGuideGrid;
  readonly props?: readonly CurvilinearBentPropResult[];
  readonly strokes?: readonly RefractedBrushStrokeResult[];
  readonly wgslArtifact?: CurvilinearWgslShaderArtifact;
}

export interface CurvilinearSessionSummaryKo {
  readonly modeLabelKo: string;
  readonly fovDegrees: number;
  readonly activeVanishingPointIds: readonly CanonicalVanishingPointId[];
  readonly activeVanishingPointLabelsKo: readonly string[];
  readonly foreshorteningRange: { readonly min: number; readonly max: number };
  readonly maxAnisotropyRatio: number;
  readonly maxGeodesicBendPx: number;
  readonly propCount: number;
  readonly propCurveCount: number;
  readonly strokeCount: number;
  readonly stampCount: number;
  readonly meanSnapResidualPx: number;
  readonly seamSplitTotal: number;
  readonly headlineKo: string;
  readonly summaryParagraphKo: string;
  readonly bulletLinesKo: readonly string[];
}

interface SvgPalette {
  readonly bg: string;
  readonly frameStroke: string;
  readonly gridMeridian: string;
  readonly gridParallel: string;
  readonly horizonStroke: string;
  readonly rimStroke: string;
  readonly propFront: string;
  readonly propBack: string;
  readonly propSpeedline: string;
  readonly propArch: string;
  readonly brushInk: string;
  readonly vpStroke: string;
  readonly vpFill: string;
  readonly textPrimary: string;
  readonly badgeBg: string;
  readonly badgeBorder: string;
}

const LIGHT_PALETTE: SvgPalette = {
  bg: "#FAF8F3",
  frameStroke: "#223E30",
  gridMeridian: "#64748B",
  gridParallel: "#94A3B8",
  horizonStroke: "#B45309",
  rimStroke: "#1F4435",
  propFront: "#111827",
  propBack: "#6B7280",
  propSpeedline: "#9A3412",
  propArch: "#1F4435",
  brushInk: "#0F172A",
  vpStroke: "#B91C1C",
  vpFill: "#FEF2F2",
  textPrimary: "#111827",
  badgeBg: "#FFFFFF",
  badgeBorder: "#CBD5E1",
};

const DARK_PALETTE: SvgPalette = {
  bg: "#131715",
  frameStroke: "#3B5E4D",
  gridMeridian: "#475569",
  gridParallel: "#334155",
  horizonStroke: "#F59E0B",
  rimStroke: "#34D399",
  propFront: "#F8FAFC",
  propBack: "#64748B",
  propSpeedline: "#FB923C",
  propArch: "#6EE7B7",
  brushInk: "#E2E8F0",
  vpStroke: "#F87171",
  vpFill: "#2A1215",
  textPrimary: "#F8FAFC",
  badgeBg: "#1E2421",
  badgeBorder: "#334155",
};

const MODE_LABELS_KO: Record<CurvilinearProjectionMode, string> = {
  "4pt-cylindrical": "4점 수직 원통 파노라마",
  "5pt-fisheye-equidistant": "5점 등거리 어안 투시",
  "5pt-fisheye-equisolid": "5점 등면적 어안 투시",
  "5pt-fisheye-stereographic": "5점 등각 스테레오그래픽 어안",
  "5pt-panini": "5점 파니니 초광각 건축 투시",
  "6pt-spherical-dual": "6점 이중 반구 360도 구면 투시",
};

export function escapeXmlText(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(value: number, fallback = 0): string {
  const safe = Number.isFinite(value) ? value : fallback;
  return safe.toFixed(2);
}

function buildSvgPolylinePoints(points: readonly Vec2[]): string {
  const tokens: string[] = [];
  for (const pt of points) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    tokens.push(`${fmt(pt.x)},${fmt(pt.y)}`);
  }
  return tokens.join(" ");
}

function renderPolylineSegments(
  segments: readonly CurvilinearPolylineSegment[],
  stroke: string,
  strokeWidth: number,
  opacity: number,
  dashArray?: string,
): string {
  const lines: string[] = [];
  const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
  for (const seg of segments) {
    if (seg.points.length < 2) continue;
    const pts = buildSvgPolylinePoints(seg.points);
    if (!pts) continue;
    lines.push(
      `    <polyline fill="none" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}" stroke-opacity="${fmt(opacity)}" stroke-linecap="round" stroke-linejoin="round"${dashAttr} points="${pts}" />`,
    );
  }
  return lines.join("\n");
}

/**
 * 곡면 투시 가이드 그리드·소실점·3D 프롭 곡면선·굴절 브러시 획을
 * 인쇄 안전 고대비 SVG 문서 문자열로 렌더링한다.
 */
export function renderCurvilinearPerspectiveSvg(scene: CurvilinearSvgScene): string {
  const width = Math.max(64, Math.round(scene.camera.viewportWidth));
  const height = Math.max(64, Math.round(scene.camera.viewportHeight));
  const palette = scene.theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const grid = scene.guideGrid ?? generateCurvilinearGuideGrid(scene.camera, 6);
  const props = scene.props ?? [];
  const strokes = scene.strokes ?? [];
  const showVpLabels = scene.showVanishingPointLabels ?? true;
  const showBackEdges = scene.showBackFacingPropEdges ?? true;

  const escapedTitle = escapeXmlText(scene.title);
  const modeTitle = escapeXmlText(MODE_LABELS_KO[scene.camera.mode]);
  const fovText = `${Math.round(scene.camera.fovDegrees)}°`;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapedTitle}">`,
  );
  out.push(`  <title>${escapedTitle}</title>`);
  out.push(`  <rect x="0" y="0" width="${width}" height="${height}" fill="${palette.bg}" />`);
  out.push(
    `  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="${palette.frameStroke}" stroke-width="1.5" stroke-opacity="0.35" />`,
  );

  // 1. 반구 / 어안 외곽 경계 원
  if (grid.hemisphereBounds.length > 0) {
    out.push(`  <g id="hemisphere-bounds">`);
    for (const bound of grid.hemisphereBounds) {
      out.push(
        `    <circle cx="${fmt(bound.cx)}" cy="${fmt(bound.cy)}" r="${fmt(bound.radiusPx)}" fill="none" stroke="${palette.rimStroke}" stroke-width="1.5" stroke-dasharray="6 4" stroke-opacity="0.7" />`,
      );
    }
    out.push(`  </g>`);
  }

  // 2. 측지선 투시 그리드
  out.push(`  <g id="curvilinear-guide-grid">`);
  for (const arc of grid.guideArcs) {
    const strokeColor =
      arc.kind === "horizon"
        ? palette.horizonStroke
        : arc.kind === "meridian"
          ? palette.gridMeridian
          : palette.gridParallel;
    const strokeW = arc.kind === "horizon" ? 1.8 : 0.85;
    const strokeOp = arc.kind === "horizon" ? 0.85 : 0.35;
    const rendered = renderPolylineSegments(arc.segments, strokeColor, strokeW, strokeOp);
    if (rendered) out.push(rendered);
  }
  out.push(`  </g>`);

  // 3. 곡면 보정 3D 프롭 와이어프레임 (깊이 정렬 순서 유지)
  if (props.length > 0) {
    out.push(`  <g id="bent-3d-props">`);
    for (const prop of props) {
      out.push(`    <g data-prop-id="${escapeXmlText(prop.propId)}" data-prop-label="${escapeXmlText(prop.label)}">`);
      for (const curve of prop.curves) {
        if (!curve.frontFacing && !showBackEdges) continue;
        let strokeColor = curve.frontFacing ? palette.propFront : palette.propBack;
        if (curve.role === "speedline") strokeColor = palette.propSpeedline;
        else if (curve.role === "arch") strokeColor = palette.propArch;
        const strokeWidth = curve.frontFacing ? (curve.role === "silhouette" ? 2.0 : 1.35) : 0.9;
        const opacity = curve.frontFacing ? 0.92 : 0.35;
        const dash = curve.frontFacing ? undefined : "4 3";
        const rendered = renderPolylineSegments(
          curve.polyline.segments,
          strokeColor,
          strokeWidth,
          opacity,
          dash,
        );
        if (rendered) out.push(rendered);
      }
      out.push(`    </g>`);
    }
    out.push(`  </g>`);
  }

  // 4. 굴절 브러시 획 및 야코비안 타원 닙 스탬프
  if (strokes.length > 0) {
    out.push(`  <g id="refracted-brush-strokes">`);
    for (let sIdx = 0; sIdx < strokes.length; sIdx += 1) {
      const stroke = strokes[sIdx];
      if (!stroke || stroke.stamps.length === 0) continue;
      out.push(`    <g data-stroke-index="${sIdx}" data-snap-axis="${stroke.resolvedSnapAxis}">`);
      const spinePts = buildSvgPolylinePoints(stroke.stamps.map((st) => ({ x: st.x, y: st.y })));
      if (spinePts && stroke.stamps.length >= 2) {
        out.push(
          `      <polyline fill="none" stroke="${palette.brushInk}" stroke-width="1.2" stroke-opacity="0.45" points="${spinePts}" />`,
        );
      }
      for (const st of stroke.stamps) {
        if (!Number.isFinite(st.x) || !Number.isFinite(st.y)) continue;
        const rx = Math.max(0.4, st.nib.widthPx * 0.5);
        const ry = Math.max(0.3, st.nib.minorWidthPx * 0.5);
        const angleDeg = (st.nib.nibAngleRad * 180) / Math.PI;
        out.push(
          `      <ellipse cx="${fmt(st.x)}" cy="${fmt(st.y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${palette.brushInk}" fill-opacity="${fmt(st.nib.opacityScale)}" transform="rotate(${fmt(angleDeg)} ${fmt(st.x)} ${fmt(st.y)})" />`,
        );
      }
      out.push(`    </g>`);
    }
    out.push(`  </g>`);
  }

  // 5. 4/5/6점 소실점 조준선 및 라벨
  out.push(`  <g id="vanishing-points">`);
  for (const vp of grid.vanishingPoints) {
    if (!vp.visible) continue;
    const vx = Math.max(8, Math.min(width - 8, vp.x));
    const vy = Math.max(8, Math.min(height - 8, vp.y));
    out.push(
      `    <circle cx="${fmt(vx)}" cy="${fmt(vy)}" r="5.5" fill="${palette.vpFill}" stroke="${palette.vpStroke}" stroke-width="1.8" />`,
    );
    out.push(
      `    <line x1="${fmt(vx - 9)}" y1="${fmt(vy)}" x2="${fmt(vx + 9)}" y2="${fmt(vy)}" stroke="${palette.vpStroke}" stroke-width="1.2" />`,
    );
    out.push(
      `    <line x1="${fmt(vx)}" y1="${fmt(vy - 9)}" x2="${fmt(vx)}" y2="${fmt(vy + 9)}" stroke="${palette.vpStroke}" stroke-width="1.2" />`,
    );
    if (showVpLabels) {
      const labelX = vx > width - 86 ? vx - 66 : vx + 10;
      const labelY = vy < 24 ? vy + 16 : vy - 8;
      out.push(
        `    <text x="${fmt(labelX)}" y="${fmt(labelY)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" font-weight="600" fill="${palette.vpStroke}">${escapeXmlText(vp.labelKo)}</text>`,
      );
    }
  }
  out.push(`  </g>`);

  // 6. 상단 제목 배지
  out.push(`  <g id="header-badge">`);
  out.push(
    `    <rect x="14" y="12" width="320" height="36" rx="8" fill="${palette.badgeBg}" fill-opacity="0.92" stroke="${palette.badgeBorder}" stroke-width="1" />`,
  );
  out.push(
    `    <text x="24" y="34" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="600" fill="${palette.textPrimary}">${escapedTitle} · ${modeTitle} (${fovText})</text>`,
  );
  out.push(`  </g>`);
  out.push(`</svg>`);

  return out.join("\n");
}

/**
 * 곡면 투시 작업 상태를 번역투 없는 자연스러운 한국어 스튜디오 리포트로 요약한다.
 */
export function summarizeCurvilinearSessionKo(
  report: CurvilinearSessionAuditInput,
): CurvilinearSessionSummaryKo {
  const modeLabelKo = MODE_LABELS_KO[report.camera.mode];
  const fovDegrees = Math.round(report.camera.fovDegrees);
  const vps = report.guideGrid
    ? report.guideGrid.vanishingPoints
    : computeCurvilinearVanishingPoints(report.camera);
  const activeVps = vps.filter((vp) => vp.visible);
  const activeVanishingPointIds = activeVps.map((vp) => vp.id);
  const activeVanishingPointLabelsKo = activeVps.map((vp) => vp.labelKo);

  const props = report.props ?? [];
  const strokes = report.strokes ?? [];

  let minFore = Number.POSITIVE_INFINITY;
  let maxFore = 0;
  let maxAnisotropyRatio = 1;
  let maxGeodesicBendPx = 0;
  let propCurveCount = 0;
  let seamSplitTotal = 0;
  let stampCount = 0;
  let snapResidualWeightedSum = 0;

  for (const prop of props) {
    propCurveCount += prop.curves.length;
    if (prop.maxBendDeviationPx > maxGeodesicBendPx) {
      maxGeodesicBendPx = prop.maxBendDeviationPx;
    }
    for (const c of prop.curves) {
      seamSplitTotal += c.polyline.seamSplitCount;
    }
  }

  for (const stroke of strokes) {
    stampCount += stroke.stamps.length;
    snapResidualWeightedSum += stroke.meanSnapResidualPx;
    if (stroke.maxBendDeviationPx > maxGeodesicBendPx) {
      maxGeodesicBendPx = stroke.maxBendDeviationPx;
    }
    if (stroke.stamps.length > 0) {
      if (stroke.minForeshorteningRatio < minFore) minFore = stroke.minForeshorteningRatio;
      if (stroke.maxForeshorteningRatio > maxFore) maxFore = stroke.maxForeshorteningRatio;
      for (const st of stroke.stamps) {
        if (st.anisotropyRatio > maxAnisotropyRatio) maxAnisotropyRatio = st.anisotropyRatio;
      }
    }
  }

  const foreshorteningRange = {
    min: Number.isFinite(minFore) ? Number(minFore.toFixed(3)) : 1,
    max: maxFore > 0 ? Number(maxFore.toFixed(3)) : 1,
  };
  const meanSnapResidualPx =
    strokes.length > 0 ? Number((snapResidualWeightedSum / strokes.length).toFixed(2)) : 0;
  const roundedBend = Number(maxGeodesicBendPx.toFixed(2));
  const roundedAniso = Number(maxAnisotropyRatio.toFixed(2));

  const vpSummary =
    activeVanishingPointLabelsKo.length > 0
      ? activeVanishingPointLabelsKo.join(", ")
      : "화면 내 활성 소실점 없음";

  const headlineKo = `${modeLabelKo} (${fovDegrees}°) · 활성 소실점 ${activeVps.length}개`;

  const modeNoteKo =
    report.camera.mode === "5pt-panini"
      ? "수직 건축선은 직선으로 고정되고 수평선만 곡면으로 휘어집니다."
      : report.camera.mode === "6pt-spherical-dual"
        ? `전·후면 이중 반구 투시로 적도 이음새를 ${seamSplitTotal}회 자동 분할했습니다.`
        : "모든 직선 프롭과 브러시 획이 측지선 곡률에 맞춰 자연스럽게 굽어집니다.";

  const wgslNoteKo = report.wgslArtifact
    ? ` WebGPU 셰이더(${report.wgslArtifact.uniformBufferByteLength}B 유니폼) 준비 완료.`
    : "";

  const summaryParagraphKo =
    `현재 캔버스는 ${modeLabelKo}(시야각 ${fovDegrees}°)로 설정되어 있으며 ` +
    `화면 안에 ${activeVps.length}개 소실점(${vpSummary})이 잡혀 있습니다. ` +
    `야코비안 단축 배율은 ${foreshorteningRange.min}~${foreshorteningRange.max}배(최대 이방성 ${roundedAniso}배), ` +
    `측지선 최대 굴절 편차는 ${roundedBend}px입니다. ` +
    `3D 프롭 ${props.length}개(곡면 선분 ${propCurveCount}개)와 굴절 브러시 ${strokes.length}획(스탬프 ${stampCount}개, 평균 스냅 오차 ${meanSnapResidualPx}px)을 반영했습니다. ` +
    `${modeNoteKo}${wgslNoteKo}`;

  const bulletLinesKo: readonly string[] = [
    `투영 방식: ${modeLabelKo} · 시야각 ${fovDegrees}°`,
    `활성 소실점(${activeVps.length}개): ${vpSummary}`,
    `단축·굴절 지표: 단축 ${foreshorteningRange.min}~${foreshorteningRange.max}배 · 최대 이방성 ${roundedAniso}배 · 최대 굴절 ${roundedBend}px`,
    `장면 구성: 3D 프롭 ${props.length}개(${propCurveCount}선분) · 굴절 브러시 ${strokes.length}획(${stampCount}스탬프, 스냅 잔차 ${meanSnapResidualPx}px)`,
  ];

  return {
    modeLabelKo,
    fovDegrees,
    activeVanishingPointIds,
    activeVanishingPointLabelsKo,
    foreshorteningRange,
    maxAnisotropyRatio: roundedAniso,
    maxGeodesicBendPx: roundedBend,
    propCount: props.length,
    propCurveCount,
    strokeCount: strokes.length,
    stampCount,
    meanSnapResidualPx,
    seamSplitTotal,
    headlineKo,
    summaryParagraphKo,
    bulletLinesKo,
  };
}
