import type {
  EngineeringDiagramEdge,
  EngineeringDiagramGroup,
  EngineeringDiagramLayer,
  EngineeringDiagramNode,
  EngineeringGraphDiagram,
  EngineeringLayersDiagram,
  EngineeringSequenceDiagram,
} from "./engineering-diagram-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 도식 명세를 SVG 좌표로 바꾸는 순수 함수 모음.
 *
 * - 노드 위치와 간선 경로는 격자(col/row)만으로 정해지므로 언어와 무관하다. 그래서 테스트가 한국어 문자열로
 *   "간선이 다른 노드를 가로지르지 않는가"를 미리 검사할 수 있다.
 * - 글줄 나눔만 언어에 따라 달라지며, 호출자가 넘기는 `text` 해석기로 문자열을 얻는다.
 */

export type Point = readonly [number, number];

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type TextResolver = (value: LocalizedText) => string;

export const FONT = {
  nodeLabel: 17,
  nodeSub: 13,
  edgeLabel: 12.5,
  actorLabel: 17,
  actorSub: 13,
  message: 14.5,
  note: 12.5,
  layerLabel: 18,
  layerSub: 13,
  chip: 12.5,
  group: 13.5,
  bracket: 13,
} as const;

/** 글자 폭 추정(em). 한글·한자·전각은 1em, 영문은 글자별 근삿값이다. */
export function textUnits(text: string): number {
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f) ||
      (code >= 0x3000 && code <= 0x30ff) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xff00 && code <= 0xffef);
    if (wide) units += 1;
    else if (char === " ") units += 0.32;
    else if (/[A-Z0-9]/u.test(char)) units += 0.64;
    else if (/[mwMW@%]/u.test(char)) units += 0.86;
    else if (/[il.,'|!:;()[\]]/u.test(char)) units += 0.3;
    else if (/[a-z]/u.test(char)) units += 0.56;
    else units += 0.52;
  }
  return units;
}

/** 폭 안에 들어가도록 줄을 나눈다. 공백이 있으면 단어 경계, 없으면 글자 경계에서 나누고 넘치면 말줄임표를 붙인다. */
export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const fits = (value: string) => textUnits(value) * fontSize <= maxWidth;
  const lines: string[] = [];
  let current = "";
  const chars = [...clean];
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] as string;
    const candidate = current + char;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    // 공백 기준으로 되돌려 단어를 보존한다(영문). 공백이 없으면 글자 경계에서 자른다.
    const lastSpace = current.lastIndexOf(" ");
    const latin = char !== " " && !/[\u3000-\u9fff\uac00-\ud7a3]/u.test(char);
    // 공백이 없는 식별자(storage.googleapis.com, studio-direct-v1)는 구두점 뒤에서 끊어 읽기 좋게 한다.
    const punct = Math.max(current.lastIndexOf("."), current.lastIndexOf("/"), current.lastIndexOf("-"), current.lastIndexOf("_"), current.lastIndexOf(":"));
    if (latin && lastSpace > 0) {
      lines.push(current.slice(0, lastSpace).trim());
      current = `${current.slice(lastSpace + 1)}${char}`;
    } else if (latin && lastSpace <= 0 && punct >= 3 && punct < current.length - 1) {
      lines.push(current.slice(0, punct + 1));
      current = `${current.slice(punct + 1)}${char}`;
    } else {
      lines.push(current.trim());
      current = char === " " ? "" : char;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current.trim()) lines.push(current.trim());
  if (lines.length > maxLines) lines.length = maxLines;
  const consumed = lines.join("").replace(/\s+/gu, "").length;
  const total = clean.replace(/\s+/gu, "").length;
  if (consumed < total && lines.length > 0) {
    let last = lines[lines.length - 1] as string;
    while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

/* ───────────────────────── graph ───────────────────────── */

export const GRAPH_METRICS = {
  colW: 176,
  colGap: 72,
  rowH: 88,
  rowGap: 60,
  pad: 28,
  groupPad: 16,
  groupHeader: 26,
  lane: 24,
  laneStep: 12,
} as const;

export interface LaidOutNode {
  readonly node: EngineeringDiagramNode;
  readonly rect: Rect;
  readonly labelLines: readonly string[];
  readonly subLines: readonly string[];
}

export interface LaidOutEdge {
  readonly edge: EngineeringDiagramEdge;
  readonly points: readonly Point[];
  readonly labelAt: Point | undefined;
  readonly labelLines: readonly string[];
  /** 다른 노드의 내부를 지나는 경로를 피하지 못했는지. 도식 작성 시 격자를 고쳐야 한다. */
  readonly crossesNode: boolean;
  /** 라벨을 노드·다른 라벨과 겹치지 않게 놓을 자리가 없었는지. 도식 작성 시 격자를 고쳐야 한다. */
  readonly labelCollides: boolean;
}

export interface LaidOutGroup {
  readonly group: EngineeringDiagramGroup;
  readonly rect: Rect;
}

export interface GraphLayout {
  readonly viewBox: readonly [number, number, number, number];
  readonly nodes: readonly LaidOutNode[];
  readonly edges: readonly LaidOutEdge[];
  readonly groups: readonly LaidOutGroup[];
}

const cx = (rect: Rect): number => rect.x + rect.w / 2;
const cy = (rect: Rect): number => rect.y + rect.h / 2;

function segmentHitsRect(a: Point, b: Point, rect: Rect): boolean {
  const eps = 1.5;
  const left = rect.x + eps;
  const right = rect.x + rect.w - eps;
  const top = rect.y + eps;
  const bottom = rect.y + rect.h - eps;
  if (a[1] === b[1]) {
    if (a[1] <= top || a[1] >= bottom) return false;
    return Math.max(a[0], b[0]) > left && Math.min(a[0], b[0]) < right;
  }
  if (a[0] === b[0]) {
    if (a[0] <= left || a[0] >= right) return false;
    return Math.max(a[1], b[1]) > top && Math.min(a[1], b[1]) < bottom;
  }
  for (let step = 1; step < 24; step += 1) {
    const t = step / 24;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    if (x > left && x < right && y > top && y < bottom) return true;
  }
  return false;
}

export function polylineHitsAny(points: readonly Point[], rects: readonly Rect[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1] as Point;
    const b = points[index] as Point;
    if (rects.some((rect) => segmentHitsRect(a, b, rect))) return true;
  }
  return false;
}

const LABEL_H = 20;

function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}

interface LabelPlacement {
  readonly at: Point | undefined;
  readonly rect: Rect | undefined;
  /** 노드나 앞서 놓인 라벨과 겹치지 않는 자리를 찾지 못했는지. */
  readonly collides: boolean;
}

/**
 * 간선 라벨 자리를 고른다. 긴 구간부터 여러 위치를 시도해 노드·다른 라벨과 겹치지 않는 자리를 찾고,
 * 가능하면 다른 간선과 공유하지 않는 구간(갈라진 뒤의 가지)을 우선해 라벨이 어느 간선의 것인지 헷갈리지 않게 한다.
 */
function placeEdgeLabel(
  points: readonly Point[],
  line: string,
  nodeRects: readonly Rect[],
  placed: readonly Rect[],
  otherPaths: readonly (readonly Point[])[],
): LabelPlacement {
  if (!line || points.length < 2) return { at: undefined, rect: undefined, collides: false };
  const width = Math.ceil(textUnits(line) * FONT.edgeLabel) + 14;
  const segments: { a: Point; b: Point; length: number }[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1] as Point;
    const b = points[index] as Point;
    segments.push({ a, b, length: Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) });
  }
  segments.sort((left, right) => right.length - left.length);
  const candidates: Point[] = [];
  for (const segment of segments) {
    if (segment.length < 24 && candidates.length > 0) continue;
    for (const t of [0.5, 0.36, 0.64, 0.24, 0.76]) {
      candidates.push([segment.a[0] + (segment.b[0] - segment.a[0]) * t, segment.a[1] + (segment.b[1] - segment.a[1]) * t]);
    }
  }
  const rectAt = (at: Point): Rect => ({ x: at[0] - width / 2, y: at[1] - LABEL_H / 2, w: width, h: LABEL_H });
  const free = (at: Point): boolean => {
    const rect = rectAt(at);
    return !nodeRects.some((node) => rectsOverlap(rect, node, 2)) && !placed.some((other) => rectsOverlap(rect, other, 2));
  };
  const shared = (at: Point): boolean =>
    otherPaths.some((path) => path.some((point, index) => index > 0 && distanceToSegment(at, path[index - 1] as Point, point) < 3));
  const chosen = candidates.find((at) => free(at) && !shared(at)) ?? candidates.find(free);
  if (chosen) return { at: chosen, rect: rectAt(chosen), collides: false };
  const fallback = candidates[0] as Point;
  return { at: fallback, rect: rectAt(fallback), collides: true };
}

interface LaneState {
  readonly counts: Map<string, number>;
}

function routeEdge(from: Rect, to: Rect, obstacles: readonly Rect[], lanes: LaneState): { points: Point[]; crosses: boolean } {
  const toRight = cx(to) > cx(from);
  const toBelow = cy(to) > cy(from);
  const sameRow = Math.abs(cy(from) - cy(to)) < 1;
  const sameColumn = Math.abs(cx(from) - cx(to)) < 1;
  const candidates: Point[][] = [];

  const laneY = (below: boolean): number => {
    const key = `${below ? "b" : "t"}:${Math.round(cy(from))}`;
    const used = lanes.counts.get(key) ?? 0;
    const base = below ? Math.max(from.y + from.h, to.y + to.h) + GRAPH_METRICS.lane : Math.min(from.y, to.y) - GRAPH_METRICS.lane;
    return below ? base + used * GRAPH_METRICS.laneStep : base - used * GRAPH_METRICS.laneStep;
  };
  const bumpLane = (below: boolean): void => {
    const key = `${below ? "b" : "t"}:${Math.round(cy(from))}`;
    lanes.counts.set(key, (lanes.counts.get(key) ?? 0) + 1);
  };

  if (sameRow) {
    candidates.push(toRight ? [[from.x + from.w, cy(from)], [to.x, cy(to)]] : [[from.x, cy(from)], [to.x + to.w, cy(to)]]);
    const below = laneY(true);
    candidates.push([[cx(from), from.y + from.h], [cx(from), below], [cx(to), below], [cx(to), to.y + to.h]]);
    const above = laneY(false);
    candidates.push([[cx(from), from.y], [cx(from), above], [cx(to), above], [cx(to), to.y]]);
  } else if (sameColumn) {
    candidates.push(toBelow ? [[cx(from), from.y + from.h], [cx(to), to.y]] : [[cx(from), from.y], [cx(to), to.y + to.h]]);
    const rightX = Math.max(from.x + from.w, to.x + to.w) + GRAPH_METRICS.lane;
    candidates.push([[from.x + from.w, cy(from)], [rightX, cy(from)], [rightX, cy(to)], [to.x + to.w, cy(to)]]);
    const leftX = Math.min(from.x, to.x) - GRAPH_METRICS.lane;
    candidates.push([[from.x, cy(from)], [leftX, cy(from)], [leftX, cy(to)], [to.x, cy(to)]]);
  } else {
    // 가로 먼저, 세로 나중 → 세로 먼저, 가로 나중 → 대각선 순으로 시도한다.
    candidates.push([
      [toRight ? from.x + from.w : from.x, cy(from)],
      [cx(to), cy(from)],
      [cx(to), toBelow ? to.y : to.y + to.h],
    ]);
    candidates.push([
      [cx(from), toBelow ? from.y + from.h : from.y],
      [cx(from), cy(to)],
      [toRight ? to.x : to.x + to.w, cy(to)],
    ]);
    candidates.push([
      [toRight ? from.x + from.w : from.x, cy(from)],
      [toRight ? to.x : to.x + to.w, cy(to)],
    ]);
  }

  const chosenIndex = candidates.findIndex((points) => !polylineHitsAny(points, obstacles));
  const index = chosenIndex === -1 ? 0 : chosenIndex;
  if (sameRow && index === 1) bumpLane(true);
  if (sameRow && index === 2) bumpLane(false);
  return { points: candidates[index] as Point[], crosses: chosenIndex === -1 };
}

export function layoutGraph(diagram: EngineeringGraphDiagram, text: TextResolver): GraphLayout {
  const m = GRAPH_METRICS;
  const rects = new Map<string, Rect>();
  const nodes: LaidOutNode[] = diagram.nodes.map((node) => {
    const span = node.span ?? 1;
    const rect: Rect = {
      x: m.pad + node.at[0] * (m.colW + m.colGap),
      y: m.pad + node.at[1] * (m.rowH + m.rowGap),
      w: span * m.colW + (span - 1) * m.colGap,
      h: m.rowH,
    };
    rects.set(node.id, rect);
    const inner = node.shape === "diamond" ? rect.w - 52 : rect.w - 26;
    const labelLines = wrapText(text(node.label), FONT.nodeLabel, inner, 2);
    const subLines = node.sub ? wrapText(text(node.sub), FONT.nodeSub, inner, node.shape === "diamond" ? 1 : 2) : [];
    return { node, rect, labelLines, subLines };
  });

  const lanes: LaneState = { counts: new Map() };
  const routedEdges = diagram.edges.map((edge) => {
    const from = rects.get(edge.from);
    const to = rects.get(edge.to);
    if (!from || !to) return { edge, points: [] as Point[], crosses: false };
    const obstacles = [...rects.entries()].filter(([id]) => id !== edge.from && id !== edge.to).map(([, rect]) => rect);
    const routed = routeEdge(from, to, obstacles, lanes);
    return { edge, points: routed.points, crosses: routed.crosses };
  });
  // 간선 라벨은 노드의 글이 있는 안쪽 영역만 피하면 된다(칸 사이 틈보다 긴 라벨이 노드 가장자리를 살짝 덮는 것은 허용).
  const nodeRects = nodes.map((item) => ({ x: item.rect.x + 16, y: item.rect.y + 8, w: item.rect.w - 32, h: item.rect.h - 16 }));
  const placedLabels: Rect[] = [];
  const edges: LaidOutEdge[] = routedEdges.map((routed, index) => {
    const label = routed.edge.label ? text(routed.edge.label) : "";
    const labelLines = label ? wrapText(label, FONT.edgeLabel, 150, 1) : [];
    const otherPaths = routedEdges.filter((_, other) => other !== index).map((other) => other.points);
    const placement = placeEdgeLabel(routed.points, labelLines[0] ?? "", nodeRects, placedLabels, otherPaths);
    if (placement.rect) placedLabels.push(placement.rect);
    return {
      edge: routed.edge,
      points: routed.points,
      labelAt: placement.at,
      labelLines,
      crossesNode: routed.crosses,
      labelCollides: placement.collides,
    };
  });

  const groups: LaidOutGroup[] = (diagram.groups ?? []).flatMap((group) => {
    const members = group.nodeIds.map((id) => rects.get(id)).filter((rect): rect is Rect => rect !== undefined);
    if (members.length === 0) return [];
    const minX = Math.min(...members.map((rect) => rect.x)) - m.groupPad;
    const minY = Math.min(...members.map((rect) => rect.y)) - m.groupPad - m.groupHeader;
    const maxX = Math.max(...members.map((rect) => rect.x + rect.w)) + m.groupPad;
    const maxY = Math.max(...members.map((rect) => rect.y + rect.h)) + m.groupPad;
    return [{ group, rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } }];
  });

  const xs: number[] = [];
  const ys: number[] = [];
  for (const { rect } of [...nodes, ...groups]) {
    xs.push(rect.x, rect.x + rect.w);
    ys.push(rect.y, rect.y + rect.h);
  }
  for (const edge of edges) {
    for (const [x, y] of edge.points) {
      xs.push(x);
      ys.push(y);
    }
  }
  const minX = Math.min(...xs, 0) - m.pad / 2;
  const minY = Math.min(...ys, 0) - m.pad / 2;
  const maxX = Math.max(...xs, 1) + m.pad / 2;
  const maxY = Math.max(...ys, 1) + m.pad / 2;
  return { viewBox: [minX, minY, maxX - minX, maxY - minY], nodes, edges, groups };
}

/* ───────────────────────── sequence ───────────────────────── */

export const SEQUENCE_METRICS = {
  actorW: 188,
  actorH: 78,
  actorGap: 62,
  pad: 28,
  firstRow: 52,
  rowH: 80,
} as const;

export interface LaidOutActor {
  readonly actor: EngineeringSequenceDiagram["actors"][number];
  readonly rect: Rect;
  readonly lineX: number;
  readonly labelLines: readonly string[];
  readonly subLines: readonly string[];
}

export interface LaidOutMessage {
  readonly message: EngineeringSequenceDiagram["messages"][number];
  readonly index: number;
  readonly y: number;
  readonly fromX: number;
  readonly toX: number;
  readonly self: boolean;
  readonly labelLines: readonly string[];
  readonly noteLines: readonly string[];
}

export interface SequenceLayout {
  readonly viewBox: readonly [number, number, number, number];
  readonly actors: readonly LaidOutActor[];
  readonly messages: readonly LaidOutMessage[];
  readonly lineBottom: number;
}

export function layoutSequence(diagram: EngineeringSequenceDiagram, text: TextResolver): SequenceLayout {
  const m = SEQUENCE_METRICS;
  const actors: LaidOutActor[] = diagram.actors.map((actor, index) => {
    const rect: Rect = { x: m.pad + index * (m.actorW + m.actorGap), y: m.pad, w: m.actorW, h: m.actorH };
    const labelLines = wrapText(text(actor.label), FONT.actorLabel, rect.w - 22, 2);
    return {
      actor,
      rect,
      lineX: rect.x + rect.w / 2,
      labelLines,
      // 이름이 한 줄이면 부제를 두 줄까지, 이름이 두 줄이면 부제는 한 줄만 둔다(상자 높이 안에 맞춘다).
      subLines: actor.sub ? wrapText(text(actor.sub), FONT.actorSub, rect.w - 22, labelLines.length > 1 ? 1 : 2) : [],
    };
  });
  const lineX = new Map(actors.map((item) => [item.actor.id, item.lineX]));
  const messages: LaidOutMessage[] = diagram.messages.map((message, index) => {
    const fromX = lineX.get(message.from) ?? 0;
    const toX = lineX.get(message.to) ?? 0;
    const self = message.from === message.to;
    // 자기 호출은 다음 생명선 쪽으로 조금 더 넓게 쓴다(라벨 줄바꿈을 줄인다). 글자에는 배경 테두리가 있어 생명선과 겹쳐도 읽힌다.
    const span = self ? Math.round((m.actorW + m.actorGap) * 1.3) - 56 : Math.max(Math.abs(toX - fromX) - 24, 120);
    return {
      message,
      index,
      y: m.pad + m.actorH + m.firstRow + index * m.rowH,
      fromX,
      toX,
      self,
      labelLines: wrapText(`${index + 1}. ${text(message.label)}`, FONT.message, span, 2),
      noteLines: message.note ? wrapText(text(message.note), FONT.note, span, 2) : [],
    };
  });
  const last = messages.at(-1);
  const lineBottom = (last ? last.y : m.pad + m.actorH) + 52;
  const baseRight = m.pad + actors.length * m.actorW + Math.max(actors.length - 1, 0) * m.actorGap;
  const selfRight = messages
    .filter((item) => item.self)
    .map((item) => {
      const widest = Math.max(
        0,
        ...item.labelLines.map((line) => textUnits(line) * FONT.message),
        ...item.noteLines.map((line) => textUnits(line) * FONT.note),
      );
      return item.fromX + 52 + widest;
    });
  const right = Math.max(baseRight, ...selfRight);
  return { viewBox: [0, 0, right + m.pad, lineBottom + m.pad], actors, messages, lineBottom };
}

/* ───────────────────────── layers ───────────────────────── */

export const LAYER_METRICS = {
  width: 1120,
  pad: 28,
  barH: 80,
  gap: 26,
  bracketW: 150,
  labelW: 340,
} as const;

export interface LaidOutChip {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

export interface LaidOutLayer {
  readonly layer: EngineeringDiagramLayer;
  readonly rect: Rect;
  readonly labelLines: readonly string[];
  readonly subLines: readonly string[];
  readonly chips: readonly LaidOutChip[];
}

export interface LaidOutBracket {
  readonly labelLines: readonly string[];
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

export interface LayersLayout {
  readonly viewBox: readonly [number, number, number, number];
  readonly layers: readonly LaidOutLayer[];
  readonly brackets: readonly LaidOutBracket[];
}

export function layoutLayers(diagram: EngineeringLayersDiagram, text: TextResolver): LayersLayout {
  const m = LAYER_METRICS;
  const hasBrackets = (diagram.brackets?.length ?? 0) > 0;
  const barW = m.width - m.pad * 2 - (hasBrackets ? m.bracketW + 22 : 0);
  const chipAreaX = m.pad + m.labelW;
  const chipAreaW = barW - m.labelW - 18;
  const layers: LaidOutLayer[] = diagram.layers.map((layer, index) => {
    const rect: Rect = { x: m.pad, y: m.pad + index * (m.barH + m.gap), w: barW, h: m.barH };
    const rows: { text: string; w: number }[][] = [[]];
    let cursorX = 0;
    for (const chip of layer.chips ?? []) {
      const w = Math.ceil(textUnits(chip) * FONT.chip + 22);
      const current = rows[rows.length - 1] as { text: string; w: number }[];
      if (cursorX + w > chipAreaW && current.length > 0) {
        if (rows.length === 2) break;
        rows.push([]);
        cursorX = 0;
      }
      (rows[rows.length - 1] as { text: string; w: number }[]).push({ text: chip, w });
      cursorX += w + 8;
    }
    const filledRows = rows.filter((row) => row.length > 0);
    const blockH = filledRows.length * 26 + Math.max(filledRows.length - 1, 0) * 8;
    const startY = rect.y + (rect.h - blockH) / 2;
    const chips: LaidOutChip[] = filledRows.flatMap((row, rowIndex) => {
      let x = chipAreaX;
      return row.map((chip) => {
        const placed: LaidOutChip = { text: chip.text, x, y: startY + rowIndex * 34, w: chip.w };
        x += chip.w + 8;
        return placed;
      });
    });
    return {
      layer,
      rect,
      labelLines: wrapText(text(layer.label), FONT.layerLabel, m.labelW - 36, 2),
      subLines: layer.sub ? wrapText(text(layer.sub), FONT.layerSub, m.labelW - 36, 2) : [],
      chips,
    };
  });
  const byId = new Map(layers.map((item) => [item.layer.id, item.rect]));
  const brackets: LaidOutBracket[] = (diagram.brackets ?? []).flatMap((bracket) => {
    const members = bracket.layerIds.map((id) => byId.get(id)).filter((rect): rect is Rect => rect !== undefined);
    if (members.length === 0) return [];
    return [{
      labelLines: wrapText(text(bracket.label), FONT.bracket, m.bracketW - 14, 3),
      x: m.pad + barW + 14,
      top: Math.min(...members.map((rect) => rect.y)),
      bottom: Math.max(...members.map((rect) => rect.y + rect.h)),
    }];
  });
  const height = m.pad * 2 + layers.length * m.barH + Math.max(layers.length - 1, 0) * m.gap;
  return { viewBox: [0, 0, m.width, height], layers, brackets };
}
