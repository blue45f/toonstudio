/**
 * 스토리월드 세계관 보드 뷰 모델.
 *
 * 정본은 `StoryworldProject` 원본 데이터(characters·facts·scenes)이며, 이 모듈은 그 데이터를
 * "요소 카드 + 관계 미니 그래프" 표시 계층으로만 투영한다. 분석 로직(인과관계 엔진)과는 무관하고
 * 어떤 점수도 계산하지 않는다.
 *
 * 요소 종류는 데이터가 실재하는 것만 둔다:
 * - character: project.characters
 * - scene: project.scenes (서사의 사건 단위)
 * - location: scene.locationId의 서로 다른 값에서 도출 (장소 이름 레지스트리가 없어 식별자를 그대로 표기)
 * - fact: project.facts (주체는 subjectId → 캐릭터면 이름, 아니면 세계 주체 식별자)
 *
 * 세력(faction)은 스키마에 데이터가 없어 보드 종류로 만들지 않는다.
 */
import type { StoryworldProject } from "./studio-storyworld-causality";

export type StoryworldBoardElementKind = "character" | "scene" | "location" | "fact";
export type StoryworldBoardGraphKind = "character" | "scene" | "location";
export type StoryworldBoardRelationKind = "participates" | "depends-on" | "located-at";

export interface StoryworldBoardCharacterCard {
  readonly kind: "character";
  readonly id: string;
  readonly name: string;
  readonly goal: string | null;
  /** 이 인물이 참여자로 선언된 장면 수 (비활성 장면 포함, 선언 기준). */
  readonly sceneCount: number;
  readonly initialFactCount: number;
  readonly secretFactCount: number;
}

export interface StoryworldBoardSceneCard {
  readonly kind: "scene";
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly locationId: string | null;
  readonly participantCount: number;
  readonly dependencyCount: number;
  readonly disabled: boolean;
}

export interface StoryworldBoardLocationCard {
  readonly kind: "location";
  /** 장소 식별자. 이름 레지스트리가 없어 식별자 자체가 표기명이다. */
  readonly id: string;
  readonly sceneCount: number;
  readonly participantCount: number;
}

export interface StoryworldBoardFactCard {
  readonly kind: "fact";
  readonly id: string;
  readonly label: string;
  readonly key: string;
  readonly subjectId: string;
  /** 주체가 캐릭터면 캐릭터 이름, 아니면 세계 주체 식별자 그대로. */
  readonly subjectLabel: string;
  readonly canonical: boolean;
}

export interface StoryworldBoardRelation {
  readonly kind: StoryworldBoardRelationKind;
  readonly fromNodeId: string;
  readonly toNodeId: string;
}

export interface StoryworldBoardGraphNode {
  readonly nodeId: string;
  readonly kind: StoryworldBoardGraphKind;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

export interface StoryworldBoardGraphEdge {
  readonly kind: StoryworldBoardRelationKind;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly path: string;
}

export interface StoryworldBoardGraph {
  readonly nodes: readonly StoryworldBoardGraphNode[];
  readonly edges: readonly StoryworldBoardGraphEdge[];
  readonly width: number;
  readonly height: number;
}

export type StoryworldBoardGraphOmission = "no-relations" | "too-large" | null;

export interface StoryworldBoard {
  readonly characters: readonly StoryworldBoardCharacterCard[];
  readonly scenes: readonly StoryworldBoardSceneCard[];
  readonly locations: readonly StoryworldBoardLocationCard[];
  readonly facts: readonly StoryworldBoardFactCard[];
  readonly relations: readonly StoryworldBoardRelation[];
  readonly elementCount: number;
  readonly hasElements: boolean;
  readonly graph: StoryworldBoardGraph | null;
  readonly graphOmission: StoryworldBoardGraphOmission;
}

/** 미니 그래프가 읽히는 규모 상한. 넘으면 그래프를 접고 카드로만 보여 준다. */
export const STORYWORLD_BOARD_GRAPH_MAX_NODES = 30;
export const STORYWORLD_BOARD_GRAPH_MAX_EDGES = 80;

const GRAPH_WIDTH = 740;
const COLUMN_X: Readonly<Record<StoryworldBoardGraphKind, number>> = {
  character: 118,
  scene: 370,
  location: 622,
};
const ROW_TOP = 30;
const ROW_GAP = 52;

export function storyworldBoardNodeId(kind: StoryworldBoardGraphKind, id: string): string {
  return `${kind}:${id}`;
}

function sortedScenes(project: StoryworldProject) {
  return [...project.scenes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function buildStoryworldBoard(project: StoryworldProject): StoryworldBoard {
  const scenes = sortedScenes(project);
  const characterById = new Map(project.characters.map((character) => [character.id, character]));
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));

  const characters: StoryworldBoardCharacterCard[] = project.characters.map((character) => ({
    kind: "character",
    id: character.id,
    name: character.name,
    goal: character.goal ?? null,
    sceneCount: scenes.filter((scene) => scene.participantIds?.includes(character.id)).length,
    initialFactCount: character.initialFactIds?.length ?? 0,
    secretFactCount: character.secretFactIds?.length ?? 0,
  }));

  const sceneCards: StoryworldBoardSceneCard[] = scenes.map((scene) => ({
    kind: "scene",
    id: scene.id,
    title: scene.title,
    order: scene.order,
    locationId: scene.locationId ?? null,
    participantCount: scene.participantIds?.length ?? 0,
    dependencyCount: scene.dependsOnSceneIds?.length ?? 0,
    disabled: scene.disabled === true,
  }));

  const locationMap = new Map<string, { sceneCount: number; participantIds: Set<string> }>();
  for (const scene of scenes) {
    if (!scene.locationId) continue;
    const entry = locationMap.get(scene.locationId) ?? { sceneCount: 0, participantIds: new Set<string>() };
    entry.sceneCount += 1;
    for (const participantId of scene.participantIds ?? []) entry.participantIds.add(participantId);
    locationMap.set(scene.locationId, entry);
  }
  const locations: StoryworldBoardLocationCard[] = [...locationMap.entries()]
    .map(([id, entry]) => ({
      kind: "location" as const,
      id,
      sceneCount: entry.sceneCount,
      participantCount: entry.participantIds.size,
    }))
    .sort((a, b) => b.sceneCount - a.sceneCount || a.id.localeCompare(b.id));

  const facts: StoryworldBoardFactCard[] = project.facts.map((fact) => ({
    kind: "fact",
    id: fact.id,
    label: fact.label,
    key: fact.key,
    subjectId: fact.subjectId,
    subjectLabel: characterById.get(fact.subjectId)?.name ?? fact.subjectId,
    canonical: fact.canonical === true,
  }));

  // 관계는 양쪽 끝점이 실제 요소로 존재할 때만 만든다. 끊긴 참조는 분석 탭의 몫이다.
  const relations: StoryworldBoardRelation[] = [];
  const seenRelations = new Set<string>();
  const addRelation = (kind: StoryworldBoardRelationKind, fromNodeId: string, toNodeId: string) => {
    const key = `${kind}:${fromNodeId}->${toNodeId}`;
    if (seenRelations.has(key)) return;
    seenRelations.add(key);
    relations.push({ kind, fromNodeId, toNodeId });
  };
  for (const scene of scenes) {
    const sceneNodeId = storyworldBoardNodeId("scene", scene.id);
    for (const participantId of scene.participantIds ?? []) {
      if (characterById.has(participantId)) {
        addRelation("participates", storyworldBoardNodeId("character", participantId), sceneNodeId);
      }
    }
    for (const dependencyId of scene.dependsOnSceneIds ?? []) {
      if (dependencyId !== scene.id && sceneById.has(dependencyId)) {
        addRelation("depends-on", sceneNodeId, storyworldBoardNodeId("scene", dependencyId));
      }
    }
    if (scene.locationId) {
      addRelation("located-at", sceneNodeId, storyworldBoardNodeId("location", scene.locationId));
    }
  }

  const elementCount = characters.length + sceneCards.length + locations.length + facts.length;
  const graphNodes: StoryworldBoardGraphNode[] = [];
  const pushColumn = (kind: StoryworldBoardGraphKind, items: readonly { id: string; label: string }[]) => {
    items.forEach((item, index) => {
      graphNodes.push({
        nodeId: storyworldBoardNodeId(kind, item.id),
        kind,
        label: item.label,
        x: COLUMN_X[kind],
        y: ROW_TOP + index * ROW_GAP,
      });
    });
  };
  pushColumn("character", characters.map((card) => ({ id: card.id, label: card.name })));
  pushColumn("scene", sceneCards.map((card) => ({ id: card.id, label: card.title })));
  pushColumn("location", locations.map((card) => ({ id: card.id, label: card.id })));

  let graph: StoryworldBoardGraph | null = null;
  let graphOmission: StoryworldBoardGraphOmission = null;
  if (relations.length === 0) {
    graphOmission = "no-relations";
  } else if (graphNodes.length > STORYWORLD_BOARD_GRAPH_MAX_NODES || relations.length > STORYWORLD_BOARD_GRAPH_MAX_EDGES) {
    graphOmission = "too-large";
  } else {
    const nodeById = new Map(graphNodes.map((node) => [node.nodeId, node]));
    const edges: StoryworldBoardGraphEdge[] = relations.flatMap((relation) => {
      const from = nodeById.get(relation.fromNodeId);
      const to = nodeById.get(relation.toNodeId);
      if (!from || !to) return [];
      const path = relation.kind === "depends-on"
        ? `M ${from.x} ${from.y} C ${from.x - 64} ${from.y}, ${to.x - 64} ${to.y}, ${to.x} ${to.y}`
        : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      return [{ kind: relation.kind, fromNodeId: relation.fromNodeId, toNodeId: relation.toNodeId, path }];
    });
    const maxRows = Math.max(
      characters.length,
      sceneCards.length,
      locations.length,
      1,
    );
    graph = {
      nodes: graphNodes,
      edges,
      width: GRAPH_WIDTH,
      height: ROW_TOP * 2 + (maxRows - 1) * ROW_GAP,
    };
  }

  return {
    characters,
    scenes: sceneCards,
    locations,
    facts,
    relations,
    elementCount,
    hasElements: elementCount > 0,
    graph,
    graphOmission,
  };
}
