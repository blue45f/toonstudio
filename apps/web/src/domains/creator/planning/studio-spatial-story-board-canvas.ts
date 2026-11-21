/**
 * tldraw · Milanote · Kinopio · Grein.studio 클린룸 — 무한 공간 스토리·무드보드 캔버스,
 * 기하 자동 바인딩 Quick Arrows, 중첩 서브보드(Nested Sub-Board) 트리, 탄성 카드 스냅 정렬.
 */

export type Vec2Tuple = readonly [number, number];

export type SpatialBoardNodeKind =
  | "scene-card"
  | "character-note"
  | "reference-image"
  | "sub-board"
  | "sticky";

export interface SpatialBoardNode {
  readonly id: string;
  readonly boardId: string;
  readonly kind: SpatialBoardNodeKind;
  readonly titleKo: string;
  readonly bodyKo: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly tags: readonly string[];
  /** `kind === "sub-board"`일 때 연결되는 하위 보드 ID. */
  readonly targetSubBoardId?: string;
}

export interface SpatialQuickArrow {
  readonly id: string;
  readonly boardId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly labelKo?: string;
  /** 평행 화살표 겹침 방지를 위한 곡률 오프셋(px). */
  readonly curveOffsetPx?: number;
}

export interface NestedSubBoard {
  readonly id: string;
  readonly parentBoardId: string | null;
  readonly titleKo: string;
  readonly summaryKo: string;
}

export interface SpatialStoryBoardDocument {
  readonly rootBoardId: string;
  readonly boards: Readonly<Record<string, NestedSubBoard>>;
  readonly nodes: readonly SpatialBoardNode[];
  readonly arrows: readonly SpatialQuickArrow[];
}

export interface ResolvedQuickArrowGeometry {
  readonly arrowId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly start: Vec2Tuple;
  readonly end: Vec2Tuple;
  readonly controlPoint: Vec2Tuple;
  readonly lengthPx: number;
  readonly endAngleRad: number;
}

export interface ElasticSnapGuideLine {
  readonly axis: "x" | "y";
  readonly positionPx: number;
  readonly kind: "edge" | "center" | "spacing";
  readonly referenceNodeId: string;
}

export interface ElasticCardSnapResult {
  readonly x: number;
  readonly y: number;
  readonly snappedX: boolean;
  readonly snappedY: boolean;
  readonly guides: readonly ElasticSnapGuideLine[];
}

const EPS = 1e-6;

export function createSpatialStoryBoardDocument(
  rootTitleKo = "작품 전체 스토리보드",
): SpatialStoryBoardDocument {
  const rootBoardId = "board-root";
  return {
    rootBoardId,
    boards: {
      [rootBoardId]: {
        id: rootBoardId,
        parentBoardId: null,
        titleKo: rootTitleKo,
        summaryKo: "에피소드·캐릭터·레퍼런스를 자유롭게 배치하는 무한 공간 보드",
      },
    },
    nodes: [],
    arrows: [],
  };
}

/** 중첩 서브보드(Nested Sub-Board)와 진입 포털 카드를 동시에 생성한다. */
export function createNestedSubBoard(
  doc: SpatialStoryBoardDocument,
  options: {
    readonly parentBoardId: string;
    readonly subBoardId: string;
    readonly portalNodeId: string;
    readonly titleKo: string;
    readonly summaryKo?: string;
    readonly x: number;
    readonly y: number;
  },
): SpatialStoryBoardDocument {
  if (!doc.boards[options.parentBoardId] || doc.boards[options.subBoardId]) {
    return doc;
  }
  const subBoard: NestedSubBoard = {
    id: options.subBoardId,
    parentBoardId: options.parentBoardId,
    titleKo: options.titleKo,
    summaryKo: options.summaryKo ?? "",
  };
  const portalNode: SpatialBoardNode = {
    id: options.portalNodeId,
    boardId: options.parentBoardId,
    kind: "sub-board",
    titleKo: options.titleKo,
    bodyKo: options.summaryKo ?? "하위 보드 열기",
    x: options.x,
    y: options.y,
    width: 240,
    height: 120,
    tags: ["서브보드"],
    targetSubBoardId: options.subBoardId,
  };
  return {
    ...doc,
    boards: {
      ...doc.boards,
      [options.subBoardId]: subBoard,
    },
    nodes: [...doc.nodes, portalNode],
  };
}

/** 루트부터 현재 중첩 서브보드까지의 브레드크럼 경로를 순환 안전하게 계산한다. */
export function getBoardBreadcrumbPath(
  doc: SpatialStoryBoardDocument,
  boardId: string,
): NestedSubBoard[] {
  const path: NestedSubBoard[] = [];
  const visited = new Set<string>();
  let currId: string | null = boardId;
  while (currId && !visited.has(currId)) {
    const board: NestedSubBoard | undefined = doc.boards[currId];
    if (!board) break;
    visited.add(currId);
    path.push(board);
    currId = board.parentBoardId;
  }
  return path.reverse();
}

/** 특정 보드와 그 모든 하위 서브보드 안의 노드 총 개수를 집계한다. */
export function countNodesInSubtree(
  doc: SpatialStoryBoardDocument,
  boardId: string,
): number {
  const visited = new Set<string>();
  const queue = [boardId];
  let total = 0;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (visited.has(curr) || !doc.boards[curr]) continue;
    visited.add(curr);
    for (const node of doc.nodes) {
      if (node.boardId === curr) {
        total += 1;
        if (node.kind === "sub-board" && node.targetSubBoardId && !visited.has(node.targetSubBoardId)) {
          queue.push(node.targetSubBoardId);
        }
      }
    }
  }
  return total;
}

/**
 * 직사각형 중심에서 목표 방향 `(dirX, dirY)`로 쏜 광선이 사각형 경계와 만나는 최단 교점을 계산한다.
 */
export function computeRectBoundaryIntersection(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  targetPoint: Vec2Tuple,
  paddingPx = 4,
): Vec2Tuple {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const hw = Math.max(1, rect.width * 0.5 + paddingPx);
  const hh = Math.max(1, rect.height * 0.5 + paddingPx);

  const dx = targetPoint[0] - cx;
  const dy = targetPoint[1] - cy;
  if (Math.abs(dx) <= EPS && Math.abs(dy) <= EPS) {
    return [cx + hw, cy];
  }

  const tx = Math.abs(dx) > EPS ? hw / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const ty = Math.abs(dy) > EPS ? hh / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const t = Math.min(tx, ty);
  return [cx + dx * t, cy + dy * t];
}

/**
 * tldraw 스타일 기하 자동 바인딩 Quick Arrow:
 * 연결된 두 카드가 이동하거나 크기가 바뀌어도 경계 교점과 베지어 제어점을 즉시 재계산한다.
 */
export function resolveQuickArrowGeometry(
  arrow: SpatialQuickArrow,
  nodes: readonly SpatialBoardNode[],
): ResolvedQuickArrowGeometry | null {
  const fromNode = nodes.find((n) => n.id === arrow.fromNodeId);
  const toNode = nodes.find((n) => n.id === arrow.toNodeId);
  if (!fromNode || !toNode || fromNode.id === toNode.id) return null;

  const fromCenter: Vec2Tuple = [fromNode.x + fromNode.width * 0.5, fromNode.y + fromNode.height * 0.5];
  const toCenter: Vec2Tuple = [toNode.x + toNode.width * 0.5, toNode.y + toNode.height * 0.5];

  const start = computeRectBoundaryIntersection(fromNode, toCenter, 4);
  const end = computeRectBoundaryIntersection(toNode, fromCenter, 4);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthPx = Math.hypot(dx, dy);

  const curveOffset = arrow.curveOffsetPx ?? 0;
  const nx = lengthPx > EPS ? -dy / lengthPx : 0;
  const ny = lengthPx > EPS ? dx / lengthPx : -1;
  const controlPoint: Vec2Tuple = [
    (start[0] + end[0]) * 0.5 + nx * curveOffset,
    (start[1] + end[1]) * 0.5 + ny * curveOffset,
  ];
  const endAngleRad = Math.atan2(end[1] - controlPoint[1], end[0] - controlPoint[0]);

  return {
    arrowId: arrow.id,
    fromNodeId: fromNode.id,
    toNodeId: toNode.id,
    start,
    end,
    controlPoint,
    lengthPx,
    endAngleRad,
  };
}

/**
 * Kinopio · Milanote 스타일 탄성 카드 스냅 정렬:
 * 드래그 중인 카드의 좌/중/우·상/중/하 정렬 및 표준 간격(`gapPx`) 스냅을 계산한다.
 */
export function snapCardWithElasticGuides(
  movingNode: Pick<SpatialBoardNode, "id" | "boardId" | "width" | "height">,
  candidateX: number,
  candidateY: number,
  allNodes: readonly SpatialBoardNode[],
  options?: { readonly snapThresholdPx?: number; readonly preferredGapPx?: number },
): ElasticCardSnapResult {
  const threshold = Math.max(2, options?.snapThresholdPx ?? 10);
  const gap = Math.max(8, options?.preferredGapPx ?? 24);
  const siblings = allNodes.filter((n) => n.boardId === movingNode.boardId && n.id !== movingNode.id);

  let bestX = candidateX;
  let bestDistX = threshold + 1;
  let guideX: ElasticSnapGuideLine | null = null;

  let bestY = candidateY;
  let bestDistY = threshold + 1;
  let guideY: ElasticSnapGuideLine | null = null;

  const tryX = (targetX: number, guidePos: number, kind: ElasticSnapGuideLine["kind"], refId: string) => {
    const d = Math.abs(candidateX - targetX);
    if (d <= threshold && d < bestDistX) {
      bestDistX = d;
      bestX = targetX;
      guideX = { axis: "x", positionPx: guidePos, kind, referenceNodeId: refId };
    }
  };

  const tryY = (targetY: number, guidePos: number, kind: ElasticSnapGuideLine["kind"], refId: string) => {
    const d = Math.abs(candidateY - targetY);
    if (d <= threshold && d < bestDistY) {
      bestDistY = d;
      bestY = targetY;
      guideY = { axis: "y", positionPx: guidePos, kind, referenceNodeId: refId };
    }
  };

  for (const sib of siblings) {
    // X 축 좌/우/중앙/간격 스냅
    tryX(sib.x, sib.x, "edge", sib.id);
    tryX(sib.x + sib.width - movingNode.width, sib.x + sib.width, "edge", sib.id);
    tryX(sib.x + (sib.width - movingNode.width) * 0.5, sib.x + sib.width * 0.5, "center", sib.id);
    tryX(sib.x + sib.width + gap, sib.x + sib.width + gap, "spacing", sib.id);
    tryX(sib.x - movingNode.width - gap, sib.x - gap, "spacing", sib.id);

    // Y 축 상/하/중앙/간격 스냅
    tryY(sib.y, sib.y, "edge", sib.id);
    tryY(sib.y + sib.height - movingNode.height, sib.y + sib.height, "edge", sib.id);
    tryY(sib.y + (sib.height - movingNode.height) * 0.5, sib.y + sib.height * 0.5, "center", sib.id);
    tryY(sib.y + sib.height + gap, sib.y + sib.height + gap, "spacing", sib.id);
    tryY(sib.y - movingNode.height - gap, sib.y - gap, "spacing", sib.id);
  }

  const guides: ElasticSnapGuideLine[] = [];
  if (guideX) guides.push(guideX);
  if (guideY) guides.push(guideY);

  return {
    x: bestX,
    y: bestY,
    snappedX: guideX !== null,
    snappedY: guideY !== null,
    guides,
  };
}
