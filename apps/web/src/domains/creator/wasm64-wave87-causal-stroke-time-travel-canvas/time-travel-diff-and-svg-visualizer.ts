/**
 * Wave 87: 시간 역행(Time-Travel) 전/후 비교 SVG 시각화기 및
 * 인과 계보(Causal Lineage) 한국어 영향도 리포트 생성기
 */

import { extractNodeGeometryPoints } from "./causal-stroke-dependency-graph";
import type {
  CausalCanvasNode,
  CausalNodeKind,
  CausalStrokeDependencyGraph,
  Point2D,
} from "./causal-stroke-dependency-graph";
import type { ReprojectionFidelityReport } from "./mls-rigid-warp-reprojection-solver";

export type TimeTravelDiffLayout = "side-by-side" | "overlay";

export interface TimeTravelDiffSvgOptions {
  readonly beforeNodes: readonly CausalCanvasNode[];
  readonly afterNodes: readonly CausalCanvasNode[];
  readonly report?: ReprojectionFidelityReport;
  readonly layout?: TimeTravelDiffLayout;
  readonly width?: number;
  readonly height?: number;
  readonly padding?: number;
  readonly titleKo?: string;
  readonly showBoneVectors?: boolean;
}

export type DistortionGradeKo = "정밀 강체 유지" | "양호한 국소 변형" | "왜곡 점검 필요";

export interface CausalImpactSummaryKo {
  readonly headline: string;
  readonly revisionTransition: string;
  readonly solverModeLabelKo: string;
  readonly recomputedSummary: string;
  readonly untouchedSummary: string;
  readonly distortionGradeKo: DistortionGradeKo;
  readonly lineageLines: readonly string[];
  readonly plainTextReport: string;
}

const NODE_KIND_LABEL_KO: Readonly<Record<CausalNodeKind, string>> = {
  "rough-skeleton-bone": "러프 골격 본",
  "ink-lineart-stroke": "펜 선화",
  "cel-fill-region": "셀 채색 영역",
  "shadow-highlight-pass": "그림자·하이라이트",
  "fluid-wash-effect": "수채 번짐 효과",
  "speech-balloon-tail": "말풍선 꼬리",
};

const PALETTE = {
  paperBg: "#FAF8F3",
  panelBg: "#FFFFFF",
  panelBorder: "#D7D2C6",
  headerInk: "#1E293B",
  mutedInk: "#475569",
  ghostSlate: "#64748B",
  ghostFill: "#94A3B8",
  boneActive: "#1F4435",
  balloonFill: "#FFFFFF",
  balloonStroke: "#0F172A",
} as const;

interface Bounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface ViewportTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function collectBounds(nodes: readonly CausalCanvasNode[]): Bounds2D {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const include = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const node of nodes) {
    for (const pt of extractNodeGeometryPoints(node)) include(pt.x, pt.y);
    if (node.kind === "speech-balloon-tail") {
      const { balloonCenter, balloonRadiusX, balloonRadiusY } = node.payload;
      include(balloonCenter.x - balloonRadiusX, balloonCenter.y - balloonRadiusY);
      include(balloonCenter.x + balloonRadiusX, balloonCenter.y + balloonRadiusY);
    } else if (node.kind === "fluid-wash-effect") {
      const r = Math.max(0, node.payload.bleedRadius);
      for (const anchor of node.payload.bleedAnchors) {
        include(anchor.x - r, anchor.y - r);
        include(anchor.x + r, anchor.y + r);
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { minX: 0, minY: 0, maxX: 320, maxY: 240 };
  }
  const padX = Math.max(24, (maxX - minX) * 0.12);
  const padY = Math.max(24, (maxY - minY) * 0.12);
  return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
}

function buildTransform(
  bounds: Bounds2D,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): ViewportTransform {
  const worldW = Math.max(1, bounds.maxX - bounds.minX);
  const worldH = Math.max(1, bounds.maxY - bounds.minY);
  const rawScale = Math.min(boxW / worldW, boxH / worldH);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  return {
    scale,
    offsetX: boxX + (boxW - worldW * scale) * 0.5 - bounds.minX * scale,
    offsetY: boxY + (boxH - worldH * scale) * 0.5 - bounds.minY * scale,
  };
}

function mapPoint(pt: Point2D, tf: ViewportTransform): Point2D {
  return { x: tf.offsetX + pt.x * tf.scale, y: tf.offsetY + pt.y * tf.scale };
}

function formatPointList(points: readonly Point2D[], tf: ViewportTransform): string {
  return points
    .map((pt) => {
      const m = mapPoint(pt, tf);
      return `${fmt(m.x)},${fmt(m.y)}`;
    })
    .join(" ");
}

function renderNodeSvg(
  node: CausalCanvasNode,
  tf: ViewportTransform,
  isGhost: boolean,
  showBoneVectors: boolean,
): string {
  const dash = isGhost ? ' stroke-dasharray="5 4"' : "";
  const idAttr = escapeXml(`${isGhost ? "ghost" : "fg"}-${node.id}`);

  switch (node.kind) {
    case "rough-skeleton-bone": {
      if (!showBoneVectors) return "";
      const a = mapPoint(node.payload.p0, tf);
      const b = mapPoint(node.payload.p1, tf);
      const stroke = isGhost ? PALETTE.ghostSlate : PALETTE.boneActive;
      return `<g data-node-id="${idAttr}" data-kind="rough-skeleton-bone" opacity="${isGhost ? "0.52" : "0.85"}"><line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" stroke="${stroke}" stroke-width="${isGhost ? "1.6" : "2.4"}" stroke-linecap="round"${dash} /><circle cx="${fmt(a.x)}" cy="${fmt(a.y)}" r="${isGhost ? "3" : "4"}" fill="${stroke}" /><circle cx="${fmt(b.x)}" cy="${fmt(b.y)}" r="${isGhost ? "2.5" : "3.5"}" fill="${PALETTE.panelBg}" stroke="${stroke}" stroke-width="1.5" /></g>`;
    }
    case "cel-fill-region": {
      if (node.payload.polygon.length < 3) return "";
      const fill = isGhost ? PALETTE.ghostFill : escapeXml(node.payload.fillColor);
      const op = isGhost ? "0.14" : fmt(Math.max(0.05, Math.min(1, node.payload.opacity)));
      return `<polygon data-node-id="${idAttr}" data-kind="cel-fill-region" points="${formatPointList(node.payload.polygon, tf)}" fill="${fill}" fill-opacity="${op}" stroke="${isGhost ? PALETTE.ghostSlate : "none"}" stroke-width="${isGhost ? "1.1" : "0"}"${dash} />`;
    }
    case "shadow-highlight-pass": {
      if (node.payload.polygon.length < 3) return "";
      const fill = isGhost ? PALETTE.ghostSlate : escapeXml(node.payload.tintColor);
      const op = isGhost ? "0.1" : fmt(Math.max(0.05, Math.min(0.9, node.payload.opacity)));
      return `<polygon data-node-id="${idAttr}" data-kind="shadow-highlight-pass" points="${formatPointList(node.payload.polygon, tf)}" fill="${fill}" fill-opacity="${op}" stroke="${isGhost ? PALETTE.ghostSlate : "none"}" stroke-width="${isGhost ? "0.9" : "0"}"${dash} />`;
    }
    case "fluid-wash-effect": {
      const r = Math.max(2, node.payload.bleedRadius * tf.scale);
      const color = isGhost ? PALETTE.ghostSlate : escapeXml(node.payload.pigmentColor);
      const op = isGhost ? "0.14" : fmt(Math.max(0.12, Math.min(0.65, node.payload.wetness * 0.55)));
      const circles = node.payload.bleedAnchors
        .map((anchor) => {
          const m = mapPoint(anchor, tf);
          return `<circle cx="${fmt(m.x)}" cy="${fmt(m.y)}" r="${fmt(r)}" fill="${color}" fill-opacity="${op}" stroke="${isGhost ? PALETTE.ghostSlate : "none"}" stroke-width="${isGhost ? "0.9" : "0"}"${dash} />`;
        })
        .join("");
      return `<g data-node-id="${idAttr}" data-kind="fluid-wash-effect">${circles}</g>`;
    }
    case "ink-lineart-stroke": {
      if (node.payload.points.length < 2) return "";
      const stroke = isGhost ? PALETTE.ghostSlate : escapeXml(node.payload.strokeColor);
      const sw = Math.max(1, node.payload.strokeWidth * Math.min(1.25, Math.max(0.7, tf.scale)));
      return `<polyline data-node-id="${idAttr}" data-kind="ink-lineart-stroke" points="${formatPointList(node.payload.points, tf)}" fill="none" stroke="${stroke}" stroke-width="${fmt(sw)}" stroke-linecap="round" stroke-linejoin="round" opacity="${isGhost ? "0.55" : "1"}"${dash} />`;
    }
    case "speech-balloon-tail": {
      const c = mapPoint(node.payload.balloonCenter, tf);
      const rx = Math.max(10, node.payload.balloonRadiusX * tf.scale);
      const ry = Math.max(8, node.payload.balloonRadiusY * tf.scale);
      const bl = mapPoint(node.payload.tailBaseLeft, tf);
      const tip = mapPoint(node.payload.tailTip, tf);
      const br = mapPoint(node.payload.tailBaseRight, tf);
      const stroke = isGhost ? PALETTE.ghostSlate : PALETTE.balloonStroke;
      const fill = isGhost ? "none" : PALETTE.balloonFill;
      const rot = node.payload.balloonTextRotationDeg;
      const rotAttr = Math.abs(rot) > 1e-6 ? ` transform="rotate(${fmt(rot)} ${fmt(c.x)} ${fmt(c.y)})"` : "";
      const textEl = isGhost
        ? ""
        : `<text x="${fmt(c.x)}" y="${fmt(c.y + 4)}" text-anchor="middle" font-size="11" font-family="sans-serif" fill="${PALETTE.headerInk}"${rotAttr}>${escapeXml(node.payload.text)}</text>`;
      return `<g data-node-id="${idAttr}" data-kind="speech-balloon-tail" opacity="${isGhost ? "0.45" : "1"}"><polygon points="${fmt(bl.x)},${fmt(bl.y)} ${fmt(tip.x)},${fmt(tip.y)} ${fmt(br.x)},${fmt(br.y)}" fill="${fill}" stroke="${stroke}" stroke-width="${isGhost ? "1.2" : "1.8"}" stroke-linejoin="round"${dash} /><ellipse cx="${fmt(c.x)}" cy="${fmt(c.y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${isGhost ? "1.2" : "1.8"}"${dash} />${textEl}</g>`;
    }
  }
}

function sortByLayerOrder(nodes: readonly CausalCanvasNode[]): readonly CausalCanvasNode[] {
  return [...nodes].sort((a, b) =>
    a.layerOrder !== b.layerOrder ? a.layerOrder - b.layerOrder : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

/** 시간 역행 수정 전(점선 슬레이트 고스트)과 수정 후(고대비 전경) 비교 SVG를 생성한다. */
export function renderTimeTravelDiffSvg(options: TimeTravelDiffSvgOptions): string {
  const layout: TimeTravelDiffLayout = options.layout ?? "side-by-side";
  const width = Math.max(360, Math.round(options.width ?? 920));
  const height = Math.max(260, Math.round(options.height ?? 440));
  const padding = Math.max(12, Math.round(options.padding ?? 20));
  const showBoneVectors = options.showBoneVectors ?? true;
  const headerHeight = 46;

  const beforeSorted = sortByLayerOrder(options.beforeNodes);
  const afterSorted = sortByLayerOrder(options.afterNodes);
  const bounds = collectBounds([...beforeSorted, ...afterSorted]);
  const titleKo =
    options.titleKo ??
    (options.report
      ? `시간 역행 재투영 비교 (리비전 #${options.report.sourceRevision} → #${options.report.targetRevision})`
      : "시간 역행 전/후 포즈 비교");
  const statsCaption = options.report
    ? `재투영 ${options.report.recomputedNodeCount}개 · 미변경 보전 ${options.report.untouchedNodeCount}개 · 최대 길이 오차 ${fmt(options.report.maxLengthDriftRatio * 100)}%`
    : `원본 ${beforeSorted.length}개 노드 · 재투영 ${afterSorted.length}개 노드`;

  const bodyTop = headerHeight + padding * 0.5;
  const bodyHeight = Math.max(120, height - bodyTop - padding);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}" role="img" aria-label="${escapeXml(titleKo)}">`,
    `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" fill="${PALETTE.paperBg}" />`,
    `<text x="${fmt(padding)}" y="24" font-size="14" font-weight="600" font-family="sans-serif" fill="${PALETTE.headerInk}">${escapeXml(titleKo)}</text>`,
    `<text x="${fmt(padding)}" y="41" font-size="11" font-family="sans-serif" fill="${PALETTE.mutedInk}">${escapeXml(statsCaption)}</text>`,
  ];

  const renderList = (nodes: readonly CausalCanvasNode[], tf: ViewportTransform, ghost: boolean): string =>
    nodes.map((node) => renderNodeSvg(node, tf, ghost, showBoneVectors)).join("");

  if (layout === "overlay") {
    const panelW = width - padding * 2;
    const tf = buildTransform(bounds, padding + 10, bodyTop + 26, panelW - 20, bodyHeight - 36);
    parts.push(
      `<rect x="${fmt(padding)}" y="${fmt(bodyTop)}" width="${fmt(panelW)}" height="${fmt(bodyHeight)}" rx="10" fill="${PALETTE.panelBg}" stroke="${PALETTE.panelBorder}" stroke-width="1" />`,
      `<text x="${fmt(padding + 12)}" y="${fmt(bodyTop + 18)}" font-size="11" font-family="sans-serif" fill="${PALETTE.mutedInk}">점선 슬레이트: 수정 전 원본 · 실선 전경: MLS 재투영 결과</text>`,
      `<g data-layer="ghost-before">${renderList(beforeSorted, tf, true)}</g>`,
      `<g data-layer="foreground-after">${renderList(afterSorted, tf, false)}</g>`,
    );
  } else {
    const gap = 14;
    const panelW = (width - padding * 2 - gap) * 0.5;
    const leftX = padding;
    const rightX = padding + panelW + gap;
    const leftTf = buildTransform(bounds, leftX + 10, bodyTop + 26, panelW - 20, bodyHeight - 36);
    const rightTf = buildTransform(bounds, rightX + 10, bodyTop + 26, panelW - 20, bodyHeight - 36);
    parts.push(
      `<rect x="${fmt(leftX)}" y="${fmt(bodyTop)}" width="${fmt(panelW)}" height="${fmt(bodyHeight)}" rx="10" fill="${PALETTE.panelBg}" stroke="${PALETTE.panelBorder}" stroke-width="1" />`,
      `<text x="${fmt(leftX + 12)}" y="${fmt(bodyTop + 18)}" font-size="11" font-weight="600" font-family="sans-serif" fill="${PALETTE.mutedInk}">수정 전 원본 포즈</text>`,
      `<g data-panel="before-original">${renderList(beforeSorted, leftTf, false)}</g>`,
      `<rect x="${fmt(rightX)}" y="${fmt(bodyTop)}" width="${fmt(panelW)}" height="${fmt(bodyHeight)}" rx="10" fill="${PALETTE.panelBg}" stroke="${PALETTE.panelBorder}" stroke-width="1" />`,
      `<text x="${fmt(rightX + 12)}" y="${fmt(bodyTop + 18)}" font-size="11" font-weight="600" font-family="sans-serif" fill="${PALETTE.boneActive}">재투영 결과 (원본 슬레이트 고스트 겹침)</text>`,
      `<g data-panel="after-ghost-before">${renderList(beforeSorted, rightTf, true)}</g>`,
      `<g data-panel="after-reprojected">${renderList(afterSorted, rightTf, false)}</g>`,
    );
  }

  parts.push(`</svg>`);
  return parts.join("");
}

/** 재투영 감사 리포트를 자연스러운 한국어 인과 계보 영향도 요약으로 정리한다. */
export function summarizeCausalImpactReportKo(
  report: ReprojectionFidelityReport,
  graph?: CausalStrokeDependencyGraph,
): CausalImpactSummaryKo {
  const editedNode = graph?.getNode(report.editedNodeId);
  const editedName = editedNode ? `${editedNode.label}(${editedNode.id})` : report.editedNodeId;
  const solverModeLabelKo =
    report.solverMode === "rigid" ? "MLS 강체(Rigid)" : "MLS 유사(Similarity)";
  const distortionGradeKo: DistortionGradeKo =
    report.integrityPassed && report.maxLengthDriftRatio <= 0.015
      ? "정밀 강체 유지"
      : report.integrityPassed && report.maxLengthDriftRatio <= 0.05
        ? "양호한 국소 변형"
        : "왜곡 점검 필요";

  const revisionTransition = `리비전 #${report.sourceRevision} → #${report.targetRevision}`;
  const headline = `${editedName} 수정에 연결된 하위 ${report.recomputedNodeCount}개 노드를 자동 재투영했고, 무관한 ${report.untouchedNodeCount}개 노드는 그대로 보전했습니다.`;
  const recomputedSummary = `하위 재계산 ${report.recomputedNodeCount}개 · 평균 이동 ${fmt(report.averageDisplacementPx)}px · 최대 길이 오차 ${fmt(report.maxLengthDriftRatio * 100)}%`;
  const untouchedSummary =
    report.untouchedNodeCount > 0
      ? `미변경 보전 ${report.untouchedNodeCount}개 (${report.untouchedNodeIds.join(", ")})`
      : "미변경 보전 대상 없음";

  const lineageLines = report.perNodeAudit.map((audit) => {
    const kindKo = NODE_KIND_LABEL_KO[audit.kind];
    if (!audit.recomputed) return `- [보전] ${audit.label} (${kindKo}): 변위 0px · 원본 해시 유지`;
    const roleTag = audit.nodeId === report.editedNodeId ? "소급 수정" : "자동 재투영";
    if (audit.kind === "speech-balloon-tail") {
      return `- [${roleTag}] ${audit.label} (${kindKo}): 꼬리 이동 ${fmt(audit.meanDisplacementPx)}px · 본문 회전 ${fmt(audit.balloonTextRotationDeg ?? 0)}° 유지`;
    }
    return `- [${roleTag}] ${audit.label} (${kindKo}): 평균 이동 ${fmt(audit.meanDisplacementPx)}px · 회전 ${fmt(audit.meanRotationDeltaDeg)}° · 길이 오차 ${fmt(audit.lengthDriftRatio * 100)}%`;
  });

  return {
    headline,
    revisionTransition,
    solverModeLabelKo,
    recomputedSummary,
    untouchedSummary,
    distortionGradeKo,
    lineageLines,
    plainTextReport: [
      `[인과 시간 역행 재투영 리포트] ${revisionTransition} (${solverModeLabelKo} · ${distortionGradeKo})`,
      headline,
      recomputedSummary,
      untouchedSummary,
      ...lineageLines,
    ].join("\n"),
  };
}
