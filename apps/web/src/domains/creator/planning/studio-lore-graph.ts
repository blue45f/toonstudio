/**
 * 설정 관계도(로어 그래프) 모델 — 세계관 허브 항목의 연결을 그래프로 투영한다.
 *
 * 왜 별도 모델인가 (현재 상태 실측, 2026-10-14):
 * - 캐릭터 관계도는 storyworld 보드(studio-storyworld-board)가 이미 갖고 있지만,
 *   그건 분석용 프로젝트(캐릭터·장면·장소·사실)의 투영이라 세계관 허브의
 *   설정 항목(studio-world-lore)과는 데이터가 다르다.
 * - 허브 항목의 연결은 명시 필드뿐이다: relatedEntryIds(항목↔항목)와
 *   characterIds(항목↔바이블 캐릭터). 이 모듈은 그 두 필드만 읽어
 *   보기 전용 그래프를 만든다 — 이름 유사성으로 연결을 추측하지 않는다.
 *
 * 표시 정책 (storyworld 보드와 같은 관례):
 * - 노드·간선이 상한을 넘으면 그래프를 그리지 않고 목록으로 축소한다(mode="list").
 *   큰 그래프를 억지로 그리면 읽을 수 없고, 연결 자체는 목록으로도 온전히 확인된다.
 * - 연결이 하나도 없으면 그래프 대신 목록 + 안내를 낸다(omission="no-relations").
 * - 배치는 결정적이다: 종류별 열, 열 안에서는 이름순. 같은 입력은 항상 같은
 *   좌표를 내므로 테스트가 고정할 수 있고, 화면이 열 때마다 흔들리지 않는다.
 * - 캐릭터 노드는 어떤 항목과라도 연결된 캐릭터만 넣는다. 연결 없는 캐릭터까지
 *   전부 그리면 관계도가 아니라 캐릭터 명단이 된다.
 */
import type { StudioStoryCharacter } from "../studio-story-bible";
import {
  STUDIO_LORE_ENTRY_KINDS,
  type StudioLoreEntryKind,
  type StudioWorldLore,
} from "./studio-world-lore";

export type LoreGraphNodeKind = StudioLoreEntryKind | "character";
export type LoreGraphEdgeKind = "related" | "character";

export interface LoreGraphNode {
  readonly nodeId: string;
  /** 항목 id 또는 캐릭터 id (종류 접두 없는 원본 id). */
  readonly sourceId: string;
  readonly kind: LoreGraphNodeKind;
  readonly label: string;
  /** 이 노드에 닿은 간선 수. 0이면 고립 노드. */
  readonly degree: number;
  readonly x: number;
  readonly y: number;
}

export interface LoreGraphEdge {
  readonly kind: LoreGraphEdgeKind;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  /** SVG path 문자열 — 모델이 좌표까지 확정해 컴포넌트는 그리기만 한다. */
  readonly path: string;
}

/** 목록 폴백 한 줄 — 그래프를 접었을 때 연결을 텍스트로 온전히 보여주는 단위. */
export interface LoreGraphListRow {
  readonly nodeId: string;
  readonly sourceId: string;
  readonly kind: LoreGraphNodeKind;
  readonly label: string;
  readonly degree: number;
  /** 연결된 상대의 표시 이름들 (이름순). 비어 있으면 고립 노드. */
  readonly connectedLabels: readonly string[];
}

export type LoreGraphOmission = "empty" | "no-relations" | "too-large" | null;

export interface LoreGraph {
  /** "graph"면 nodes·edges를 그리고, "list"면 listRows만 보여준다. */
  readonly mode: "graph" | "list";
  readonly omission: LoreGraphOmission;
  readonly nodes: readonly LoreGraphNode[];
  readonly edges: readonly LoreGraphEdge[];
  /** 항상 채워진다 — 그래프 모드에서도 접근성·검색용 텍스트 대안으로 쓴다. */
  readonly listRows: readonly LoreGraphListRow[];
  readonly width: number;
  readonly height: number;
  /** 상한 판정 전의 전체 규모 (목록 축소 안내 문구가 실제 숫자를 말할 수 있게). */
  readonly totalNodeCount: number;
  readonly totalEdgeCount: number;
  readonly isolatedCount: number;
}

/** 관계도가 읽히는 규모 상한. 넘으면 목록으로 축소한다 (보드 상한과 같은 취지). */
export const LORE_GRAPH_MAX_NODES = 40;
export const LORE_GRAPH_MAX_EDGES = 120;

export interface LoreGraphLimits {
  readonly maxNodes?: number;
  readonly maxEdges?: number;
}

/** 열 순서 — 설정 종류 선언 순서를 따르고 캐릭터 열은 마지막에 둔다. */
const KIND_ORDER: readonly LoreGraphNodeKind[] = [...STUDIO_LORE_ENTRY_KINDS, "character"];

const COLUMN_GAP = 150;
const COLUMN_LEFT = 90;
const ROW_TOP = 34;
const ROW_GAP = 54;

export function loreGraphNodeId(kind: LoreGraphNodeKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

function kindRank(kind: LoreGraphNodeKind): number {
  return KIND_ORDER.indexOf(kind);
}

export function buildLoreGraph(
  lore: StudioWorldLore,
  characters: readonly StudioStoryCharacter[],
  limits: LoreGraphLimits = {},
): LoreGraph {
  const maxNodes = limits.maxNodes ?? LORE_GRAPH_MAX_NODES;
  const maxEdges = limits.maxEdges ?? LORE_GRAPH_MAX_EDGES;
  const entryById = new Map(lore.entries.map((entry) => [entry.id, entry]));
  const characterById = new Map(characters.map((character) => [character.id, character]));

  // ── 노드 집합: 전 항목 + 연결된 캐릭터만 ─────────────────────────────
  const referencedCharacterIds = new Set<string>();
  for (const entry of lore.entries) {
    for (const characterId of entry.characterIds) {
      if (characterById.has(characterId)) referencedCharacterIds.add(characterId);
    }
  }

  interface RawNode {
    nodeId: string;
    sourceId: string;
    kind: LoreGraphNodeKind;
    label: string;
  }
  const rawNodes: RawNode[] = [
    ...lore.entries.map((entry) => ({
      nodeId: loreGraphNodeId(entry.kind, entry.id),
      sourceId: entry.id,
      kind: entry.kind as LoreGraphNodeKind,
      label: entry.name,
    })),
    ...characters
      .filter((character) => referencedCharacterIds.has(character.id))
      .map((character) => ({
        nodeId: loreGraphNodeId("character", character.id),
        sourceId: character.id,
        kind: "character" as LoreGraphNodeKind,
        label: character.name,
      })),
  ];
  const nodeById = new Map(rawNodes.map((node) => [node.nodeId, node]));

  // ── 간선: related는 무방향으로 정규화해 양방향 선언을 1개로 합친다 ──
  interface RawEdge {
    kind: LoreGraphEdgeKind;
    fromNodeId: string;
    toNodeId: string;
  }
  const rawEdges: RawEdge[] = [];
  const seenEdges = new Set<string>();
  const addEdge = (kind: LoreGraphEdgeKind, a: string, b: string) => {
    if (a === b) return;
    const [fromNodeId, toNodeId] = kind === "related" && b < a ? [b, a] : [a, b];
    const key = `${kind}:${fromNodeId}->${toNodeId}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    rawEdges.push({ kind, fromNodeId, toNodeId });
  };
  for (const entry of lore.entries) {
    const fromNodeId = loreGraphNodeId(entry.kind, entry.id);
    for (const relatedId of entry.relatedEntryIds) {
      const target = entryById.get(relatedId);
      if (target) addEdge("related", fromNodeId, loreGraphNodeId(target.kind, target.id));
    }
    for (const characterId of entry.characterIds) {
      if (characterById.has(characterId)) {
        addEdge("character", fromNodeId, loreGraphNodeId("character", characterId));
      }
    }
  }

  // ── 차수·인접 (목록 행과 고립 판정의 단일 출처) ──────────────────────
  const neighbors = new Map<string, Set<string>>(rawNodes.map((node) => [node.nodeId, new Set()]));
  for (const edge of rawEdges) {
    neighbors.get(edge.fromNodeId)?.add(edge.toNodeId);
    neighbors.get(edge.toNodeId)?.add(edge.fromNodeId);
  }
  const labelOf = (nodeId: string) => nodeById.get(nodeId)?.label ?? nodeId;
  const listRows: readonly LoreGraphListRow[] = Object.freeze(
    [...rawNodes]
      .map((node) => {
        const connected = neighbors.get(node.nodeId) ?? new Set<string>();
        return {
          nodeId: node.nodeId,
          sourceId: node.sourceId,
          kind: node.kind,
          label: node.label,
          degree: connected.size,
          connectedLabels: Object.freeze(
            [...connected].map(labelOf).sort((a, b) => a.localeCompare(b)),
          ),
        };
      })
      .sort(
        (a, b) =>
          b.degree - a.degree ||
          kindRank(a.kind) - kindRank(b.kind) ||
          a.label.localeCompare(b.label) ||
          a.nodeId.localeCompare(b.nodeId),
      ),
  );
  const isolatedCount = listRows.filter((row) => row.degree === 0).length;

  const totals = {
    listRows,
    totalNodeCount: rawNodes.length,
    totalEdgeCount: rawEdges.length,
    isolatedCount,
  };

  if (lore.entries.length === 0) {
    return Object.freeze({
      mode: "list",
      omission: "empty",
      nodes: Object.freeze([]),
      edges: Object.freeze([]),
      width: 0,
      height: 0,
      ...totals,
    });
  }
  if (rawEdges.length === 0) {
    return Object.freeze({
      mode: "list",
      omission: "no-relations",
      nodes: Object.freeze([]),
      edges: Object.freeze([]),
      width: 0,
      height: 0,
      ...totals,
    });
  }
  if (rawNodes.length > maxNodes || rawEdges.length > maxEdges) {
    return Object.freeze({
      mode: "list",
      omission: "too-large",
      nodes: Object.freeze([]),
      edges: Object.freeze([]),
      width: 0,
      height: 0,
      ...totals,
    });
  }

  // ── 배치: 종류별 열, 열 안에서는 이름순 ─────────────────────────────
  const presentKinds = KIND_ORDER.filter((kind) => rawNodes.some((node) => node.kind === kind));
  const positioned = new Map<string, { x: number; y: number }>();
  let maxRows = 1;
  presentKinds.forEach((kind, columnIndex) => {
    const column = rawNodes
      .filter((node) => node.kind === kind)
      .sort((a, b) => a.label.localeCompare(b.label) || a.nodeId.localeCompare(b.nodeId));
    maxRows = Math.max(maxRows, column.length);
    column.forEach((node, rowIndex) => {
      positioned.set(node.nodeId, {
        x: COLUMN_LEFT + columnIndex * COLUMN_GAP,
        y: ROW_TOP + rowIndex * ROW_GAP,
      });
    });
  });

  const nodes: readonly LoreGraphNode[] = Object.freeze(
    rawNodes
      .map((node) => {
        const pos = positioned.get(node.nodeId) ?? { x: COLUMN_LEFT, y: ROW_TOP };
        return Object.freeze({
          ...node,
          degree: neighbors.get(node.nodeId)?.size ?? 0,
          x: pos.x,
          y: pos.y,
        });
      })
      // 반환 순서도 배치 순서(열→행)와 같게 고정한다 — 그리는 순서·테스트가 흔들리지 않게.
      .sort(
        (a, b) =>
          kindRank(a.kind) - kindRank(b.kind) || a.y - b.y || a.nodeId.localeCompare(b.nodeId),
      ),
  );
  const nodePos = new Map(nodes.map((node) => [node.nodeId, node]));
  const edges: readonly LoreGraphEdge[] = Object.freeze(
    rawEdges.flatMap((edge) => {
      const from = nodePos.get(edge.fromNodeId);
      const to = nodePos.get(edge.toNodeId);
      if (!from || !to) return [];
      // 같은 열 안의 연결은 직선이 노드들을 관통하므로 바깥으로 휘게 그린다.
      const path =
        from.x === to.x
          ? `M ${from.x} ${from.y} C ${from.x + 58} ${from.y}, ${to.x + 58} ${to.y}, ${to.x} ${to.y}`
          : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      return [Object.freeze({ ...edge, path })];
    }),
  );

  return Object.freeze({
    mode: "graph",
    omission: null,
    nodes,
    edges,
    width: COLUMN_LEFT * 2 + (presentKinds.length - 1) * COLUMN_GAP,
    height: ROW_TOP * 2 + (maxRows - 1) * ROW_GAP,
    ...totals,
  });
}
