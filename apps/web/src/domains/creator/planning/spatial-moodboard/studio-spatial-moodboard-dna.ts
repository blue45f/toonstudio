/**
 * Visual Electric · FLORA Style DNA · Heptabase 클린룸 2D 공간 무드보드,
 * 기존 컬럼 무드보드(`planning/studio-moodboard.ts`) 무손실 양방향 변환,
 * 결정론적 로컬 Style DNA 추출기 및 Rights BOM 상업 내보내기 가드.
 *
 * - 무한 2D 공간 노드(x, y, width, height, scale, zIndex) + 클러스터 + 리믹스 엣지(color/composition/style-source)
 * - 기존 컬럼형 `Moodboard`와 모든 카드·참조·스케치·연결을 보존하는 양방향 무손실 변환
 * - 비결정적 난수 0% 결정론적 Median-Cut 색 양자화로 5~8색 팔레트, 휘도 대비 곡선, 채도 대역, 선굵기/셀셰이딩/MToon 힌트 추출
 * - 상업 라이선스 미검증 외부 웹 핀을 보수적으로 `reference-only`로 분류하고 상업 내보내기 병합 경고 배지 생성
 */
import {
  MOODBOARD_MAX_CARDS,
  MOODBOARD_MAX_COLUMNS,
  MOODBOARD_MAX_CONNECTIONS,
  type Moodboard,
  type MoodboardCard,
  type MoodboardColumn,
  type MoodboardConnection,
} from "../studio-moodboard";

export type SpatialAssetRightsTag =
  | "creator-original"
  | "commercial-cleared"
  | "reference-only";

export type SpatialRemixEdgeKind =
  | "color-source"
  | "composition-source"
  | "style-source";

export interface SpatialMoodboardNode {
  readonly id: string;
  readonly cardId: string;
  readonly card: MoodboardCard;
  readonly columnIdHint?: string;
  readonly columnTitleHint?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly zIndex: number;
  readonly rightsTag: SpatialAssetRightsTag;
  readonly sourceUrl?: string;
}

export interface SpatialMoodboardCluster {
  readonly id: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly nodeIds: readonly string[];
}

export interface SpatialRemixEdge {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly kind: SpatialRemixEdgeKind;
  readonly weight01: number;
}

export interface SpatialMoodboardDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly projectId?: string;
  readonly title: string;
  readonly nodes: readonly SpatialMoodboardNode[];
  readonly clusters: readonly SpatialMoodboardCluster[];
  readonly remixEdges: readonly SpatialRemixEdge[];
  readonly legacyConnections: readonly MoodboardConnection[];
}

export type RgbaPixelSample = readonly [number, number, number, number];

export interface WorkStyleDnaToken {
  readonly id: string;
  readonly sourceLabel: string;
  readonly paletteHex: readonly string[];
  readonly luminanceContrastCurve: readonly [number, number, number];
  readonly saturationBand: {
    readonly min01: number;
    readonly mean01: number;
    readonly max01: number;
  };
  readonly lineWeightHintPx: number;
  readonly celShadingStepHint: 2 | 3 | 4;
  readonly mtoonShadeShift: number;
  readonly mtoonShadeToony: number;
}

export interface SpatialRightsWarningBadge {
  readonly nodeId: string;
  readonly cardId: string;
  readonly rightsTag: "reference-only";
  readonly canMergeIntoCommercialExport: false;
  readonly reasonKo: string;
}

export interface SpatialMoodboardRightsAudit {
  readonly totalNodeCount: number;
  readonly commercialSafeCount: number;
  readonly referenceOnlyCount: number;
  readonly canMergeAllIntoCommercialExport: boolean;
  readonly warningBadges: readonly SpatialRightsWarningBadge[];
}

interface RgbSample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function isExternalWebUrl(value: string | undefined): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

/**
 * 카드 유형과 출처 URL·검증 여부를 바탕으로 Rights BOM 권리 태그를 보수적으로 분류한다.
 */
export function classifySpatialAssetRightsTag(
  card: MoodboardCard,
  verifiedCommercialLicense = false,
): SpatialAssetRightsTag {
  if (card.kind === "note" || card.kind === "todo" || card.kind === "sketch") {
    return "creator-original";
  }
  if (card.kind === "link" || isExternalWebUrl(card.ref)) {
    return verifiedCommercialLicense ? "commercial-cleared" : "reference-only";
  }
  return verifiedCommercialLicense ? "commercial-cleared" : "creator-original";
}

/**
 * 기존 컬럼형 `Moodboard`를 무한 2D 공간 무드보드 문서로 무손실 변환한다.
 */
export function fromColumnMoodboardToSpatial(
  board: Moodboard,
  options?: {
    readonly columnGapPx?: number;
    readonly cardWidthPx?: number;
    readonly cardHeightPx?: number;
    readonly rowGapPx?: number;
    readonly verifiedCommercialCardIds?: ReadonlySet<string>;
  },
): SpatialMoodboardDocument {
  const cardW = clamp(options?.cardWidthPx ?? 240, 120, 640);
  const cardH = clamp(options?.cardHeightPx ?? 180, 90, 640);
  const colGap = clamp(options?.columnGapPx ?? 80, 24, 320);
  const rowGap = clamp(options?.rowGapPx ?? 28, 12, 160);
  const padding = 24;

  const nodes: SpatialMoodboardNode[] = [];
  const clusters: SpatialMoodboardCluster[] = [];
  let zIndex = 1;

  for (let cIdx = 0; cIdx < board.columns.length; cIdx += 1) {
    const col = board.columns[cIdx];
    const clusterX = cIdx * (cardW + padding * 2 + colGap);
    const clusterNodeIds: string[] = [];

    for (let rIdx = 0; rIdx < col.cardIds.length; rIdx += 1) {
      const cardId = col.cardIds[rIdx];
      const card = board.cards[cardId];
      if (!card) continue;

      const nodeId = `node-${card.id}`;
      const verified = options?.verifiedCommercialCardIds?.has(card.id) ?? false;
      const rightsTag = classifySpatialAssetRightsTag(card, verified);

      nodes.push({
        id: nodeId,
        cardId: card.id,
        card,
        columnIdHint: col.id,
        columnTitleHint: col.title,
        x: clusterX + padding,
        y: padding + 44 + rIdx * (cardH + rowGap),
        width: cardW,
        height: cardH,
        scale: 1,
        zIndex,
        rightsTag,
        sourceUrl: isExternalWebUrl(card.ref) ? card.ref : undefined,
      });
      clusterNodeIds.push(nodeId);
      zIndex += 1;
    }

    const clusterHeight = Math.max(
      260,
      padding * 2 + 44 + clusterNodeIds.length * (cardH + rowGap),
    );
    clusters.push({
      id: col.id,
      title: col.title,
      x: clusterX,
      y: 0,
      width: cardW + padding * 2,
      height: clusterHeight,
      nodeIds: clusterNodeIds,
    });
  }

  return {
    schemaVersion: 1,
    id: board.id,
    projectId: board.projectId,
    title: board.title,
    nodes,
    clusters,
    remixEdges: [],
    legacyConnections: board.connections ? [...board.connections] : [],
  };
}

/**
 * 무한 2D 공간 무드보드 문서를 기존 컬럼형 `Moodboard`로 무손실 역변환한다.
 */
export function toColumnMoodboard(doc: SpatialMoodboardDocument): Moodboard {
  const cards: Record<string, MoodboardCard> = {};
  const nodeById = new Map<string, SpatialMoodboardNode>();

  const limitedNodes = doc.nodes.slice(0, MOODBOARD_MAX_CARDS);
  for (const node of limitedNodes) {
    cards[node.cardId] = node.card;
    nodeById.set(node.id, node);
  }

  const placedCardIds = new Set<string>();
  const columns: MoodboardColumn[] = [];

  for (const cluster of doc.clusters) {
    if (columns.length >= MOODBOARD_MAX_COLUMNS) break;
    const cardIds: string[] = [];
    for (const nodeId of cluster.nodeIds) {
      const node = nodeById.get(nodeId);
      if (!node || placedCardIds.has(node.cardId)) continue;
      placedCardIds.add(node.cardId);
      cardIds.push(node.cardId);
    }
    columns.push({
      id: cluster.id,
      title: cluster.title,
      cardIds,
    });
  }

  // 클러스터에 속하지 않은 자유 배치 노드를 columnIdHint 또는 기본 컬럼으로 보존
  const fallbackColumns = new Map<string, { title: string; cardIds: string[] }>();
  for (const node of limitedNodes) {
    if (placedCardIds.has(node.cardId)) continue;
    placedCardIds.add(node.cardId);
    const colId = node.columnIdHint ?? `${doc.id}-col-spatial`;
    const existing = fallbackColumns.get(colId);
    if (existing) {
      existing.cardIds.push(node.cardId);
    } else {
      fallbackColumns.set(colId, {
        title: node.columnTitleHint ?? "공간 캔버스",
        cardIds: [node.cardId],
      });
    }
  }

  for (const [colId, group] of fallbackColumns.entries()) {
    const existingColIdx = columns.findIndex((col) => col.id === colId);
    if (existingColIdx >= 0) {
      columns[existingColIdx] = {
        ...columns[existingColIdx],
        cardIds: [...columns[existingColIdx].cardIds, ...group.cardIds],
      };
    } else if (columns.length < MOODBOARD_MAX_COLUMNS) {
      columns.push({ id: colId, title: group.title, cardIds: group.cardIds });
    } else if (columns.length > 0) {
      const lastIdx = columns.length - 1;
      columns[lastIdx] = {
        ...columns[lastIdx],
        cardIds: [...columns[lastIdx].cardIds, ...group.cardIds],
      };
    }
  }

  if (columns.length === 0) {
    columns.push({ id: `${doc.id}-col-0`, title: "레퍼런스", cardIds: [] });
  }

  // 기존 연결 + 공간 리믹스 엣지를 중복 없이 MoodboardConnection으로 보존
  const deduped = new Map<string, MoodboardConnection>();
  const registerConnection = (fromCardId: string, toCardId: string): void => {
    if (
      fromCardId === toCardId ||
      !Object.hasOwn(cards, fromCardId) ||
      !Object.hasOwn(cards, toCardId) ||
      deduped.size >= MOODBOARD_MAX_CONNECTIONS
    ) {
      return;
    }
    const key = JSON.stringify([fromCardId, toCardId].sort());
    if (!deduped.has(key)) {
      deduped.set(key, { from: fromCardId, to: toCardId });
    }
  };

  for (const conn of doc.legacyConnections) {
    registerConnection(conn.from, conn.to);
  }
  for (const edge of doc.remixEdges) {
    const fromNode = nodeById.get(edge.fromNodeId);
    const toNode = nodeById.get(edge.toNodeId);
    if (fromNode && toNode) {
      registerConnection(fromNode.cardId, toNode.cardId);
    }
  }

  const connections = Array.from(deduped.values());
  return {
    version: 1,
    id: doc.id,
    projectId: doc.projectId,
    title: doc.title,
    columns,
    ...(connections.length > 0 ? { connections } : {}),
    cards,
  };
}

/**
 * 공간 무드보드 두 노드 사이에 스타일/색상/구도 리믹스 엣지를 추가한다.
 */
export function addSpatialRemixEdge(
  doc: SpatialMoodboardDocument,
  input: {
    readonly id?: string;
    readonly fromNodeId: string;
    readonly toNodeId: string;
    readonly kind: SpatialRemixEdgeKind;
    readonly weight01: number;
  },
): SpatialMoodboardDocument {
  if (input.fromNodeId === input.toNodeId) return doc;
  const hasFrom = doc.nodes.some((n) => n.id === input.fromNodeId);
  const hasTo = doc.nodes.some((n) => n.id === input.toNodeId);
  if (!hasFrom || !hasTo) return doc;

  const edgeId =
    input.id?.trim() || `remix-${input.fromNodeId}-${input.toNodeId}-${input.kind}`;
  const nextEdge: SpatialRemixEdge = {
    id: edgeId,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    kind: input.kind,
    weight01: clamp(input.weight01, 0, 1),
  };

  const filtered = doc.remixEdges.filter((e) => e.id !== edgeId);
  return {
    ...doc,
    remixEdges: [...filtered, nextEdge],
  };
}

function parseHexToRgb(hex: string): RgbSample | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (v: number) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function relativeLuminance01(s: RgbSample): number {
  return (0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b) / 255;
}

function hsvSaturation01(s: RgbSample): number {
  const maxC = Math.max(s.r, s.g, s.b);
  const minC = Math.min(s.r, s.g, s.b);
  if (maxC <= 0) return 0;
  return (maxC - minC) / maxC;
}

function bucketChannelSpread(bucket: readonly RgbSample[]): {
  readonly channel: "r" | "g" | "b";
  readonly range: number;
} {
  let minR = 255;
  let maxR = 0;
  let minG = 255;
  let maxG = 0;
  let minB = 255;
  let maxB = 0;
  for (const s of bucket) {
    if (s.r < minR) minR = s.r;
    if (s.r > maxR) maxR = s.r;
    if (s.g < minG) minG = s.g;
    if (s.g > maxG) maxG = s.g;
    if (s.b < minB) minB = s.b;
    if (s.b > maxB) maxB = s.b;
  }
  const rSpan = maxR - minR;
  const gSpan = maxG - minG;
  const bSpan = maxB - minB;
  if (rSpan >= gSpan && rSpan >= bSpan) return { channel: "r", range: rSpan };
  if (gSpan >= rSpan && gSpan >= bSpan) return { channel: "g", range: gSpan };
  return { channel: "b", range: bSpan };
}

function medianCutQuantize(
  samples: readonly RgbSample[],
  targetColors: number,
): readonly string[] {
  if (samples.length === 0) return [];
  const buckets: RgbSample[][] = [samples.slice()];

  while (buckets.length < targetColors) {
    let bestIdx = -1;
    let bestScore = -1;
    let bestChannel: "r" | "g" | "b" = "r";

    for (let i = 0; i < buckets.length; i += 1) {
      const b = buckets[i];
      if (b.length < 2) continue;
      const spread = bucketChannelSpread(b);
      if (spread.range <= 0) continue;
      const score = spread.range * b.length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestChannel = spread.channel;
      }
    }

    if (bestIdx === -1) break;
    const target = buckets[bestIdx];
    target.sort((a, b) => a[bestChannel] - b[bestChannel] || a.r - b.r || a.g - b.g || a.b - b.b);
    const mid = Math.floor(target.length / 2);
    const left = target.slice(0, mid);
    const right = target.slice(mid);
    buckets.splice(bestIdx, 1, left, right);
  }

  const summaries = buckets
    .filter((b) => b.length > 0)
    .map((b) => {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (const s of b) {
        sr += s.r;
        sg += s.g;
        sb += s.b;
      }
      const hex = rgbToHex(sr / b.length, sg / b.length, sb / b.length);
      return { hex, count: b.length };
    })
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));

  const uniqueHex: string[] = [];
  for (const item of summaries) {
    if (!uniqueHex.includes(item.hex)) {
      uniqueHex.push(item.hex);
    }
  }
  return uniqueHex;
}

function quantile(sortedValues: readonly number[], q01: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = clamp(q01, 0, 1) * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(sortedValues.length - 1, Math.ceil(idx));
  const frac = idx - lo;
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * frac;
}

/**
 * RGBA 픽셀 샘플 또는 HEX 스와치에서 결정론적(Median-Cut) WorkStyleDnaToken을 추출한다.
 */
export function extractWorkStyleDnaToken(input: {
  readonly id: string;
  readonly sourceLabel: string;
  readonly rgbaSamples?: readonly RgbaPixelSample[];
  readonly hexSwatches?: readonly string[];
  readonly targetPaletteSize?: number;
}): WorkStyleDnaToken {
  const samples: RgbSample[] = [];

  for (const px of input.rgbaSamples ?? []) {
    if (px[3] < 16) continue;
    samples.push({
      r: clamp(px[0], 0, 255),
      g: clamp(px[1], 0, 255),
      b: clamp(px[2], 0, 255),
    });
  }
  for (const hex of input.hexSwatches ?? []) {
    const parsed = parseHexToRgb(hex);
    if (parsed) samples.push(parsed);
  }

  if (samples.length === 0) {
    throw new Error("Style DNA를 추출할 유효 픽셀 또는 HEX 색상 샘플이 없습니다.");
  }

  const targetSize = Math.round(clamp(input.targetPaletteSize ?? 6, 5, 8));
  const paletteHex = medianCutQuantize(samples, targetSize);

  const lumas = samples.map(relativeLuminance01).sort((a, b) => a - b);
  const shadow = Number(quantile(lumas, 0.1).toFixed(4));
  const mid = Number(quantile(lumas, 0.5).toFixed(4));
  const highlight = Number(quantile(lumas, 0.9).toFixed(4));
  const contrastRange = clamp(highlight - shadow, 0, 1);

  let minSat = 1;
  let maxSat = 0;
  let satSum = 0;
  for (const s of samples) {
    const sat = hsvSaturation01(s);
    if (sat < minSat) minSat = sat;
    if (sat > maxSat) maxSat = sat;
    satSum += sat;
  }
  const meanSat = satSum / samples.length;

  const lineWeightHintPx = Number((1.4 + contrastRange * 1.8).toFixed(2));
  const celShadingStepHint: 2 | 3 | 4 =
    contrastRange >= 0.62 ? 2 : contrastRange >= 0.35 ? 3 : 4;
  const mtoonShadeShift = Number((-0.15 + (mid - 0.5) * 0.3).toFixed(3));
  const mtoonShadeToony = Number(clamp(0.55 + contrastRange * 0.4, 0.5, 0.95).toFixed(3));

  return {
    id: input.id.trim() || "style-dna-default",
    sourceLabel: input.sourceLabel.trim() || "작품 무드보드",
    paletteHex,
    luminanceContrastCurve: [shadow, mid, highlight],
    saturationBand: {
      min01: Number(minSat.toFixed(4)),
      mean01: Number(meanSat.toFixed(4)),
      max01: Number(maxSat.toFixed(4)),
    },
    lineWeightHintPx,
    celShadingStepHint,
    mtoonShadeShift,
    mtoonShadeToony,
  };
}

/**
 * 공간 무드보드의 Rights BOM 상업 내보내기 적합성을 감사하고 참고 전용 핀 경고 배지를 생성한다.
 */
export function auditSpatialMoodboardRights(
  doc: SpatialMoodboardDocument,
): SpatialMoodboardRightsAudit {
  const warningBadges: SpatialRightsWarningBadge[] = [];
  let commercialSafeCount = 0;

  for (const node of doc.nodes) {
    if (node.rightsTag === "reference-only") {
      warningBadges.push({
        nodeId: node.id,
        cardId: node.cardId,
        rightsTag: "reference-only",
        canMergeIntoCommercialExport: false,
        reasonKo:
          "상업 라이선스가 검증되지 않은 외부 참고 자료입니다. 내보내기 산출물에 직접 합성할 수 없습니다.",
      });
    } else {
      commercialSafeCount += 1;
    }
  }

  return {
    totalNodeCount: doc.nodes.length,
    commercialSafeCount,
    referenceOnlyCount: warningBadges.length,
    canMergeAllIntoCommercialExport: warningBadges.length === 0,
    warningBadges,
  };
}
