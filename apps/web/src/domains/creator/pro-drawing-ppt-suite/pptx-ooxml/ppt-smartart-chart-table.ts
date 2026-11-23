/**
 * SmartArt 6종 순수 SVG 기하 생성기, 편집 가능 스타일 표(Table) 모델,
 * 요소 빌드 애니메이션 타임라인 엔진 (네이티브 차트 4종 및 프리셋 3종 통합 내보내기).
 */

import type {
  BuildAnimationEntry,
  BuildAnimationKind,
  BuildAnimationTarget,
  NativeChartVariant,
  PptxTableModel,
  PptxTransitionKind,
  SmartArtItem,
  SmartArtVariant,
} from "./ooxml-pptx-types";
import { getChartAccentToken } from "./ppt-native-charts";

export {
  PPTX_DECK_PRESETS,
  createBlankSlide,
  createDefaultChartBlock,
  createDefaultSmartArtBlock,
  createDefaultTableModel,
  createPptxPresetDeck,
  type PptxPresetMeta,
} from "./ppt-deck-presets";

export {
  CHART_ACCENT_TOKEN_SLOTS,
  buildNativeChartSvgModel,
  getChartAccentToken,
  type ChartBarGeometry,
  type ChartDonutSlice,
  type ChartGridLine,
  type ChartLinePoint,
  type ChartRadarVertex,
  type NativeChartSvgModel,
} from "./ppt-native-charts";

export interface OptionDescriptor<T extends string> {
  readonly id: T;
  readonly label: string;
}

export const SMARTART_VARIANT_OPTIONS: readonly OptionDescriptor<SmartArtVariant>[] = [
  { id: "process-chevron", label: "프로세스 셰브론" },
  { id: "timeline-milestone", label: "타임라인 마일스톤" },
  { id: "pyramid-tiers", label: "피라미드 계층" },
  { id: "org-hierarchy", label: "조직도 계층" },
  { id: "swot-quadrant", label: "SWOT 4분면" },
  { id: "cycle-loop", label: "순환 사이클" },
];

export const NATIVE_CHART_VARIANT_OPTIONS: readonly OptionDescriptor<NativeChartVariant>[] = [
  { id: "bar", label: "세로 막대 차트" },
  { id: "line", label: "추세 꺾은선 차트" },
  { id: "donut", label: "비중 도넛 차트" },
  { id: "radar", label: "밸런스 레이더 차트" },
];

export const BUILD_ANIMATION_OPTIONS: readonly OptionDescriptor<BuildAnimationKind>[] = [
  { id: "appear", label: "나타내기 (Appear)" },
  { id: "fly-in", label: "날아오기 (Fly-In)" },
  { id: "fade", label: "밝기 변화 (Fade)" },
  { id: "zoom", label: "확대/축소 (Zoom)" },
  { id: "wipe", label: "닦아내기 (Wipe)" },
];

export const TRANSITION_OPTIONS: readonly OptionDescriptor<PptxTransitionKind>[] = [
  { id: "none", label: "없음" },
  { id: "fade", label: "페이드 (Fade)" },
  { id: "push", label: "밀어내기 (Push)" },
  { id: "wipe", label: "닦아내기 (Wipe)" },
  { id: "morph", label: "모핑 (Morph)" },
  { id: "zoom", label: "줌 (Zoom)" },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ============================================================================
// 1. SmartArt 6종 순수 SVG 기하 생성기
// ============================================================================

export interface SmartArtSvgNode {
  readonly id: string;
  readonly path: string;
  readonly fillToken: string;
  readonly label: string;
  readonly detail: string;
  readonly badge: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly detailX: number;
  readonly detailY: number;
  readonly textAnchor: "start" | "middle" | "end";
}

export interface SmartArtSvgConnector {
  readonly id: string;
  readonly path: string;
  readonly hasArrow?: boolean;
}

export interface SmartArtSvgModel {
  readonly variant: SmartArtVariant;
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly SmartArtSvgNode[];
  readonly connectors: readonly SmartArtSvgConnector[];
  readonly centerLabel?: string;
}

function roundedRectPath(x: number, y: number, w: number, h: number, r = 10): string {
  const rad = Math.min(r, w / 2, h / 2);
  const x2 = round2(x + w);
  const y2 = round2(y + h);
  return [
    `M ${round2(x + rad)} ${round2(y)}`,
    `L ${round2(x2 - rad)} ${round2(y)}`,
    `Q ${x2} ${round2(y)} ${x2} ${round2(y + rad)}`,
    `L ${x2} ${round2(y2 - rad)}`,
    `Q ${x2} ${y2} ${round2(x2 - rad)} ${y2}`,
    `L ${round2(x + rad)} ${y2}`,
    `Q ${round2(x)} ${y2} ${round2(x)} ${round2(y2 - rad)}`,
    `L ${round2(x)} ${round2(y + rad)}`,
    `Q ${round2(x)} ${round2(y)} ${round2(x + rad)} ${round2(y)}`,
    "Z",
  ].join(" ");
}

function circlePath(cx: number, cy: number, r: number): string {
  const rx = round2(r);
  return `M ${round2(cx - rx)} ${round2(cy)} A ${rx} ${rx} 0 1 0 ${round2(cx + rx)} ${round2(cy)} A ${rx} ${rx} 0 1 0 ${round2(cx - rx)} ${round2(cy)} Z`;
}

export function buildSmartArtSvgModel(
  variant: SmartArtVariant,
  rawItems: readonly SmartArtItem[],
  width = 520,
  height = 240,
): SmartArtSvgModel {
  const items: readonly SmartArtItem[] =
    rawItems.length > 0
      ? rawItems.slice(0, 6)
      : [{ id: "empty-1", label: "항목 1", detail: "내용 입력" }];
  const count = items.length;
  const pad = 16;

  if (variant === "process-chevron") {
    const gap = 8;
    const tip = Math.min(22, (width - pad * 2) / (count * 3.8));
    const stepW = (width - pad * 2 - gap * (count - 1)) / count;
    const boxH = Math.min(118, height - 56);
    const topY = (height - boxH) / 2;
    const midY = topY + boxH / 2;

    const nodes: SmartArtSvgNode[] = items.map((item, idx) => {
      const x = pad + idx * (stepW + gap);
      const xRight = x + stepW;
      const notch = idx === 0 ? 0 : tip;
      const path = [
        `M ${round2(x)} ${round2(topY)}`,
        `L ${round2(xRight - tip)} ${round2(topY)}`,
        `L ${round2(xRight)} ${round2(midY)}`,
        `L ${round2(xRight - tip)} ${round2(topY + boxH)}`,
        `L ${round2(x)} ${round2(topY + boxH)}`,
        notch > 0 ? `L ${round2(x + notch)} ${round2(midY)}` : "",
        "Z",
      ]
        .filter(Boolean)
        .join(" ");

      const centerX = round2(x + (stepW + notch - tip) / 2);
      return {
        id: item.id,
        path,
        fillToken: getChartAccentToken(idx),
        label: item.label,
        detail: item.detail ?? "",
        badge: `${idx + 1}`,
        labelX: centerX,
        labelY: round2(midY - 6),
        detailX: centerX,
        detailY: round2(midY + 14),
        textAnchor: "middle",
      };
    });

    return { variant, width, height, nodes, connectors: [] };
  }

  if (variant === "timeline-milestone") {
    const spineY = round2(height / 2);
    const startX = pad + 42;
    const endX = width - pad - 42;
    const span = Math.max(1, endX - startX);
    const cardW = Math.min(124, (width - pad * 2) / Math.max(2, count) - 6);
    const cardH = 54;

    const connectors: SmartArtSvgConnector[] = [
      { id: "tl-spine", path: `M ${round2(pad + 10)} ${spineY} L ${round2(width - pad - 10)} ${spineY}`, hasArrow: true },
    ];
    const nodes: SmartArtSvgNode[] = items.map((item, idx) => {
      const cx = count === 1 ? width / 2 : startX + (span * idx) / (count - 1);
      const above = idx % 2 === 0;
      const cardY = above ? spineY - 22 - cardH : spineY + 22;
      const cardX = clamp(cx - cardW / 2, pad, width - pad - cardW);
      connectors.push({
        id: `tl-stem-${idx}`,
        path: `M ${round2(cx)} ${spineY} L ${round2(cx)} ${round2(above ? cardY + cardH : cardY)}`,
      });
      return {
        id: item.id,
        path: `${roundedRectPath(cardX, cardY, cardW, cardH, 8)} ${circlePath(cx, spineY, 8)}`,
        fillToken: getChartAccentToken(idx),
        label: item.label,
        detail: item.detail ?? "",
        badge: `M${idx + 1}`,
        labelX: round2(cardX + cardW / 2),
        labelY: round2(cardY + 22),
        detailX: round2(cardX + cardW / 2),
        detailY: round2(cardY + 40),
        textAnchor: "middle",
      };
    });

    return { variant, width, height, nodes, connectors };
  }

  if (variant === "pyramid-tiers") {
    const gap = 5;
    const tierH = (height - pad * 2 - gap * (count - 1)) / count;
    const centerX = width / 2;
    const minHalfW = 46;
    const maxHalfW = (width - pad * 2) / 2;

    const nodes: SmartArtSvgNode[] = items.map((item, idx) => {
      const yTop = pad + idx * (tierH + gap);
      const yBot = yTop + tierH;
      const topHalf = minHalfW + (maxHalfW - minHalfW) * (idx / count);
      const botHalf = minHalfW + (maxHalfW - minHalfW) * ((idx + 1) / count);
      const path = [
        `M ${round2(centerX - topHalf)} ${round2(yTop)}`,
        `L ${round2(centerX + topHalf)} ${round2(yTop)}`,
        `L ${round2(centerX + botHalf)} ${round2(yBot)}`,
        `L ${round2(centerX - botHalf)} ${round2(yBot)}`,
        "Z",
      ].join(" ");

      return {
        id: item.id,
        path,
        fillToken: getChartAccentToken(idx),
        label: item.label,
        detail: item.detail ?? "",
        badge: `L${idx + 1}`,
        labelX: round2(centerX),
        labelY: round2(yTop + tierH * 0.46),
        detailX: round2(centerX),
        detailY: round2(yTop + tierH * 0.78),
        textAnchor: "middle",
      };
    });

    return { variant, width, height, nodes, connectors: [] };
  }

  if (variant === "org-hierarchy") {
    const root = items[0];
    const children = items.slice(1);
    const rootW = Math.min(180, width * 0.42);
    const rootH = 54;
    const rootX = (width - rootW) / 2;
    const rootY = pad + 4;
    const busY = rootY + rootH + 28;
    const childY = busY + 26;
    const childH = Math.min(68, height - childY - pad);

    const nodes: SmartArtSvgNode[] = [
      {
        id: root.id,
        path: roundedRectPath(rootX, rootY, rootW, rootH, 10),
        fillToken: getChartAccentToken(0),
        label: root.label,
        detail: root.detail ?? "",
        badge: "ROOT",
        labelX: round2(width / 2),
        labelY: round2(rootY + 23),
        detailX: round2(width / 2),
        detailY: round2(rootY + 41),
        textAnchor: "middle",
      },
    ];

    const connectors: SmartArtSvgConnector[] = [];
    if (children.length > 0) {
      const gap = 12;
      const childW = (width - pad * 2 - gap * (children.length - 1)) / children.length;
      const childCenters = children.map((_, idx) => pad + idx * (childW + gap) + childW / 2);
      connectors.push({
        id: "org-root-drop",
        path: `M ${round2(width / 2)} ${round2(rootY + rootH)} L ${round2(width / 2)} ${round2(busY)}`,
      });
      if (childCenters.length > 1) {
        connectors.push({
          id: "org-bus",
          path: `M ${round2(childCenters[0])} ${round2(busY)} L ${round2(childCenters[childCenters.length - 1])} ${round2(busY)}`,
        });
      }
      children.forEach((child, idx) => {
        const cx = childCenters[idx];
        const x = pad + idx * (childW + gap);
        connectors.push({
          id: `org-drop-${idx}`,
          path: `M ${round2(cx)} ${round2(busY)} L ${round2(cx)} ${round2(childY)}`,
        });
        nodes.push({
          id: child.id,
          path: roundedRectPath(x, childY, childW, childH, 10),
          fillToken: getChartAccentToken(idx + 1),
          label: child.label,
          detail: child.detail ?? "",
          badge: `${idx + 1}`,
          labelX: round2(cx),
          labelY: round2(childY + childH * 0.42),
          detailX: round2(cx),
          detailY: round2(childY + childH * 0.72),
          textAnchor: "middle",
        });
      });
    }

    return { variant, width, height, nodes, connectors };
  }

  if (variant === "swot-quadrant") {
    const badges = ["S", "W", "O", "T"];
    const slots = [0, 1, 2, 3].map(
      (idx) => items[idx] ?? { id: `swot-pad-${idx}`, label: badges[idx], detail: "내용 입력" },
    );
    const gap = 10;
    const cellW = (width - pad * 2 - gap) / 2;
    const cellH = (height - pad * 2 - gap) / 2;

    const nodes: SmartArtSvgNode[] = slots.map((item, idx) => {
      const x = pad + (idx % 2) * (cellW + gap);
      const y = pad + Math.floor(idx / 2) * (cellH + gap);
      return {
        id: item.id,
        path: roundedRectPath(x, y, cellW, cellH, 10),
        fillToken: getChartAccentToken(idx),
        label: item.label,
        detail: item.detail ?? "",
        badge: badges[idx] ?? `${idx + 1}`,
        labelX: round2(x + 14),
        labelY: round2(y + 30),
        detailX: round2(x + 14),
        detailY: round2(y + 52),
        textAnchor: "start",
      };
    });

    return { variant, width, height, nodes, connectors: [] };
  }

  // cycle-loop
  const cx = width / 2;
  const cy = height / 2;
  const orbitRx = Math.min(width * 0.34, 170);
  const orbitRy = Math.min(height * 0.34, 78);
  const nodeW = 112;
  const nodeH = 44;

  const connectors: SmartArtSvgConnector[] = [];
  const nodes: SmartArtSvgNode[] = items.map((item, idx) => {
    const angle = -Math.PI / 2 + (idx * Math.PI * 2) / count;
    const nextAngle = -Math.PI / 2 + (((idx + 1) % count) * Math.PI * 2) / count;
    const nx = cx + Math.cos(angle) * orbitRx;
    const ny = cy + Math.sin(angle) * orbitRy;

    if (count > 1) {
      const midAngle = angle + Math.PI / count;
      connectors.push({
        id: `cycle-arc-${idx}`,
        path: `M ${round2(cx + Math.cos(angle + 0.34) * orbitRx * 0.72)} ${round2(cy + Math.sin(angle + 0.34) * orbitRy * 0.72)} Q ${round2(cx + Math.cos(midAngle) * orbitRx * 0.88)} ${round2(cy + Math.sin(midAngle) * orbitRy * 0.88)} ${round2(cx + Math.cos(nextAngle - 0.34) * orbitRx * 0.72)} ${round2(cy + Math.sin(nextAngle - 0.34) * orbitRy * 0.72)}`,
        hasArrow: true,
      });
    }

    const bx = clamp(nx - nodeW / 2, pad, width - pad - nodeW);
    const by = clamp(ny - nodeH / 2, pad, height - pad - nodeH);
    return {
      id: item.id,
      path: roundedRectPath(bx, by, nodeW, nodeH, 22),
      fillToken: getChartAccentToken(idx),
      label: item.label,
      detail: item.detail ?? "",
      badge: `${idx + 1}`,
      labelX: round2(bx + nodeW / 2),
      labelY: round2(by + 19),
      detailX: round2(bx + nodeW / 2),
      detailY: round2(by + 34),
      textAnchor: "middle",
    };
  });

  return { variant: "cycle-loop", width, height, nodes, connectors, centerLabel: "순환" };
}

// ============================================================================
// 2. 스타일 표(Table) 편집 연산
// ============================================================================

export function addTableRow(
  table: PptxTableModel,
  initialCells?: readonly string[],
): PptxTableModel {
  const colCount = Math.max(1, table.headers.length);
  const newRow = Array.from({ length: colCount }, (_, idx) =>
    initialCells?.[idx] ?? (idx === 0 ? `항목 ${table.rows.length + 1}` : "내용 입력"),
  );
  return { ...table, rows: [...table.rows, newRow] };
}

export function removeTableRow(table: PptxTableModel, rowIndex: number): PptxTableModel {
  if (table.rows.length <= 1 || rowIndex < 0 || rowIndex >= table.rows.length) return table;
  return { ...table, rows: table.rows.filter((_, idx) => idx !== rowIndex) };
}

export function addTableColumn(table: PptxTableModel, headerLabel?: string): PptxTableModel {
  return {
    ...table,
    headers: [...table.headers, headerLabel ?? `열 ${table.headers.length + 1}`],
    rows: table.rows.map((row) => [...row, "-"]),
  };
}

export function removeTableColumn(table: PptxTableModel, colIndex: number): PptxTableModel {
  if (table.headers.length <= 1 || colIndex < 0 || colIndex >= table.headers.length) return table;
  return {
    ...table,
    headers: table.headers.filter((_, idx) => idx !== colIndex),
    rows: table.rows.map((row) => row.filter((_, idx) => idx !== colIndex)),
  };
}

export function updateTableHeader(
  table: PptxTableModel,
  colIndex: number,
  value: string,
): PptxTableModel {
  if (colIndex < 0 || colIndex >= table.headers.length) return table;
  return {
    ...table,
    headers: table.headers.map((header, idx) => (idx === colIndex ? value : header)),
  };
}

export function updateTableCell(
  table: PptxTableModel,
  rowIndex: number,
  colIndex: number,
  value: string,
): PptxTableModel {
  if (rowIndex < 0 || rowIndex >= table.rows.length) return table;
  return {
    ...table,
    rows: table.rows.map((row, rIdx) =>
      rIdx === rowIndex ? row.map((cell, cIdx) => (cIdx === colIndex ? value : cell)) : row,
    ),
  };
}

export function toggleTableHeaderRow(table: PptxTableModel): PptxTableModel {
  return { ...table, showHeaderRow: !table.showHeaderRow };
}

export function toggleTableBandedRows(table: PptxTableModel): PptxTableModel {
  return { ...table, bandedRows: !table.bandedRows };
}

// ============================================================================
// 3. 요소 빌드 애니메이션 타임라인 엔진
// ============================================================================

export interface AnimationFrameState {
  readonly visible: boolean;
  readonly opacity: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly clipRightPercent: number;
}

export function normalizeAnimationTimeline(
  entries: readonly BuildAnimationEntry[],
): readonly BuildAnimationEntry[] {
  return [...entries]
    .sort((a, b) => a.order - b.order || a.delayMs - b.delayMs)
    .map((entry, idx) => ({
      ...entry,
      order: idx + 1,
      delayMs: Math.max(0, Math.round(entry.delayMs)),
      durationMs: Math.max(80, Math.round(entry.durationMs)),
    }));
}

export function reorderAnimationEntry(
  entries: readonly BuildAnimationEntry[],
  entryId: string,
  direction: "up" | "down",
): readonly BuildAnimationEntry[] {
  const ordered = [...normalizeAnimationTimeline(entries)];
  const idx = ordered.findIndex((item) => item.id === entryId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return ordered;
  const temp = ordered[idx];
  ordered[idx] = ordered[swapIdx];
  ordered[swapIdx] = temp;
  return ordered.map((item, nextIdx) => ({ ...item, order: nextIdx + 1, delayMs: nextIdx * 180 }));
}

export function getTotalTimelineDurationMs(entries: readonly BuildAnimationEntry[]): number {
  if (entries.length === 0) return 0;
  return Math.max(...entries.map((entry) => entry.delayMs + entry.durationMs));
}

export function computeAnimationPlaybackFrame(
  entries: readonly BuildAnimationEntry[],
  elapsedMs: number | null,
): Readonly<Record<BuildAnimationTarget, AnimationFrameState>> {
  const idle: AnimationFrameState = {
    visible: true,
    opacity: 1,
    translateX: 0,
    translateY: 0,
    scale: 1,
    clipRightPercent: 0,
  };
  const state: Record<BuildAnimationTarget, AnimationFrameState> = {
    title: idle,
    bullets: idle,
    visual: idle,
    table: idle,
    shapes: idle,
  };
  if (elapsedMs === null) return state;

  for (const entry of entries) {
    const duration = Math.max(80, entry.durationMs);
    if (elapsedMs < entry.delayMs) {
      state[entry.target] = {
        visible: false,
        opacity: 0,
        translateX: entry.kind === "fly-in" ? -18 : 0,
        translateY: entry.kind === "fly-in" ? 10 : 0,
        scale: entry.kind === "zoom" ? 0.86 : 1,
        clipRightPercent: entry.kind === "wipe" ? 100 : 0,
      };
      continue;
    }

    const rawT = clamp((elapsedMs - entry.delayMs) / duration, 0, 1);
    const eased = 1 - (1 - rawT) * (1 - rawT);

    if (entry.kind === "appear") {
      state[entry.target] = { ...idle };
    } else if (entry.kind === "fade") {
      state[entry.target] = { ...idle, opacity: round2(eased) };
    } else if (entry.kind === "fly-in") {
      state[entry.target] = {
        ...idle,
        opacity: round2(eased),
        translateX: round2((1 - eased) * -22),
        translateY: round2((1 - eased) * 10),
      };
    } else if (entry.kind === "zoom") {
      state[entry.target] = {
        ...idle,
        opacity: round2(eased),
        scale: round2(0.86 + eased * 0.14),
      };
    } else {
      state[entry.target] = { ...idle, opacity: 1, clipRightPercent: round2((1 - eased) * 100) };
    }
  }

  return state;
}
