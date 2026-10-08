import { layoutGraph, textUnits, type Rect } from "./engineering-diagram-layout";
import {
  ENGINEERING_DIAGRAM_LIMITS as LIMIT,
  type EngineeringDiagram,
} from "./engineering-diagram-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 도식 명세가 계약을 지키는지 검사해 문제 목록을 돌려준다(빈 배열이면 통과).
 * 기술 도감·발표 슬라이드의 모든 도식이 같은 기준을 쓰도록 테스트가 이 함수를 호출한다.
 */

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** 화면 폭(em)으로 길이를 검사한다. maxEm 이 없으면 비어 있지 않은지만 본다. */
function checkText(problems: string[], where: string, value: LocalizedText | undefined, maxEm?: number): void {
  if (!value) {
    problems.push(`${where}: 텍스트가 없습니다`);
    return;
  }
  if (!value.ko.trim()) problems.push(`${where}: 한국어가 비어 있습니다`);
  if (!value.en.trim()) problems.push(`${where}: 영어가 비어 있습니다`);
  if (maxEm === undefined) return;
  const koEm = textUnits(value.ko);
  const enEm = textUnits(value.en);
  if (koEm > maxEm) problems.push(`${where}: 한국어 ${koEm.toFixed(1)}em > ${maxEm}em ("${value.ko}")`);
  if (enEm > maxEm) problems.push(`${where}: 영어 ${enEm.toFixed(1)}em > ${maxEm}em ("${value.en}")`);
}

export function validateEngineeringDiagram(diagram: EngineeringDiagram): string[] {
  const problems: string[] = [];
  const id = diagram.id;
  if (!KEBAB.test(id)) problems.push(`${id}: id는 소문자 kebab-case여야 합니다`);
  checkText(problems, `${id}.title`, diagram.title);
  checkText(problems, `${id}.caption`, diagram.caption);
  checkText(problems, `${id}.alt`, diagram.alt);

  if (diagram.kind === "graph") {
    if (diagram.nodes.length < 2) problems.push(`${id}: 노드는 2개 이상이어야 합니다`);
    if (diagram.nodes.length > LIMIT.graphNodes) problems.push(`${id}: 노드 ${diagram.nodes.length}개 > ${LIMIT.graphNodes}개`);
    const ids = new Set<string>();
    const cells = new Map<string, string>();
    for (const node of diagram.nodes) {
      if (ids.has(node.id)) problems.push(`${id}: 노드 id 중복 ${node.id}`);
      ids.add(node.id);
      checkText(problems, `${id}.${node.id}.label`, node.label, LIMIT.nodeLabelEm);
      if (node.sub) checkText(problems, `${id}.${node.id}.sub`, node.sub, LIMIT.nodeSubEm);
      const [col, row] = node.at;
      const span = node.span ?? 1;
      if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0) problems.push(`${id}.${node.id}: 격자 위치는 0 이상의 정수여야 합니다`);
      if (col + span > LIMIT.graphColumns) problems.push(`${id}.${node.id}: 열 범위가 ${LIMIT.graphColumns}칸을 넘습니다`);
      if (row >= LIMIT.graphRows) problems.push(`${id}.${node.id}: 행 범위가 ${LIMIT.graphRows}행을 넘습니다`);
      for (let offset = 0; offset < span; offset += 1) {
        const key = `${col + offset},${row}`;
        const owner = cells.get(key);
        if (owner) problems.push(`${id}: 칸 ${key}를 ${owner}와 ${node.id}가 함께 씁니다`);
        cells.set(key, node.id);
      }
    }
    for (const edge of diagram.edges) {
      if (!ids.has(edge.from)) problems.push(`${id}: 간선의 from ${edge.from}이 없습니다`);
      if (!ids.has(edge.to)) problems.push(`${id}: 간선의 to ${edge.to}가 없습니다`);
      if (edge.from === edge.to) problems.push(`${id}: 자기 자신으로 가는 간선 ${edge.from}`);
      if (edge.label) checkText(problems, `${id}.edge.${edge.from}->${edge.to}`, edge.label, LIMIT.edgeLabelEm);
    }
    if (diagram.edges.length === 0) problems.push(`${id}: 간선이 하나도 없습니다(흐름을 보여주지 못합니다)`);
    const connected = new Set(diagram.edges.flatMap((edge) => [edge.from, edge.to]));
    for (const node of diagram.nodes) if (!connected.has(node.id)) problems.push(`${id}: 어떤 간선과도 이어지지 않은 노드 ${node.id}`);
    for (const group of diagram.groups ?? []) {
      checkText(problems, `${id}.group.${group.id}`, group.label, LIMIT.groupLabelEm);
      for (const nodeId of group.nodeIds) if (!ids.has(nodeId)) problems.push(`${id}: 그룹 ${group.id}가 없는 노드 ${nodeId}를 가리킵니다`);
    }
    if (problems.length === 0) {
      const layout = layoutGraph(diagram, (value) => value.ko);
      for (const edge of layout.edges) {
        if (edge.crossesNode) problems.push(`${id}: 간선 ${edge.edge.from}->${edge.edge.to}가 다른 노드를 가로지릅니다(격자를 조정하세요)`);
      }
      for (const group of layout.groups) {
        const members = new Set(group.group.nodeIds);
        const others: Rect[] = layout.nodes.filter((item) => !members.has(item.node.id)).map((item) => item.rect);
        const frame = group.rect;
        for (const other of others) {
          const centerX = other.x + other.w / 2;
          const centerY = other.y + other.h / 2;
          if (centerX > frame.x && centerX < frame.x + frame.w && centerY > frame.y && centerY < frame.y + frame.h) {
            problems.push(`${id}: 그룹 ${group.group.id}의 프레임 안에 그룹 밖 노드가 들어옵니다`);
            break;
          }
        }
      }
      // 같은 간선 쌍의 중복 선언은 한 번만 그려도 충분하다.
      const seen = new Set<string>();
      for (const edge of diagram.edges) {
        const key = `${edge.from}->${edge.to}`;
        if (seen.has(key)) problems.push(`${id}: 중복 간선 ${key}`);
        seen.add(key);
      }
    }
  } else if (diagram.kind === "sequence") {
    if (diagram.actors.length < 2) problems.push(`${id}: 참여자는 2개 이상이어야 합니다`);
    if (diagram.actors.length > LIMIT.sequenceActors) problems.push(`${id}: 참여자 ${diagram.actors.length}명 > ${LIMIT.sequenceActors}명`);
    if (diagram.messages.length < 2) problems.push(`${id}: 메시지는 2개 이상이어야 합니다`);
    if (diagram.messages.length > LIMIT.sequenceMessages) problems.push(`${id}: 메시지 ${diagram.messages.length}개 > ${LIMIT.sequenceMessages}개`);
    const ids = new Set<string>();
    for (const actor of diagram.actors) {
      if (ids.has(actor.id)) problems.push(`${id}: 참여자 id 중복 ${actor.id}`);
      ids.add(actor.id);
      checkText(problems, `${id}.${actor.id}.label`, actor.label, LIMIT.nodeLabelEm);
      if (actor.sub) checkText(problems, `${id}.${actor.id}.sub`, actor.sub, LIMIT.nodeSubEm);
    }
    diagram.messages.forEach((message, index) => {
      if (!ids.has(message.from)) problems.push(`${id}: 메시지 ${index + 1}의 from ${message.from}이 없습니다`);
      if (!ids.has(message.to)) problems.push(`${id}: 메시지 ${index + 1}의 to ${message.to}가 없습니다`);
      checkText(problems, `${id}.message.${index + 1}`, message.label, LIMIT.messageLabelEm);
      if (message.note) checkText(problems, `${id}.message.${index + 1}.note`, message.note, LIMIT.messageNoteEm);
    });
  } else {
    if (diagram.layers.length < 2) problems.push(`${id}: 계층은 2개 이상이어야 합니다`);
    if (diagram.layers.length > LIMIT.layers) problems.push(`${id}: 계층 ${diagram.layers.length}개 > ${LIMIT.layers}개`);
    const ids = new Set<string>();
    for (const layer of diagram.layers) {
      if (ids.has(layer.id)) problems.push(`${id}: 계층 id 중복 ${layer.id}`);
      ids.add(layer.id);
      checkText(problems, `${id}.${layer.id}.label`, layer.label, LIMIT.layerLabelEm);
      if (layer.sub) checkText(problems, `${id}.${layer.id}.sub`, layer.sub, LIMIT.layerSubEm);
      if ((layer.chips?.length ?? 0) > 6) problems.push(`${id}.${layer.id}: 칩 ${layer.chips?.length}개 > 6개`);
    }
    for (const bracket of diagram.brackets ?? []) {
      checkText(problems, `${id}.bracket`, bracket.label, LIMIT.bracketLabelEm);
      for (const layerId of bracket.layerIds) if (!ids.has(layerId)) problems.push(`${id}: 괄호가 없는 계층 ${layerId}를 가리킵니다`);
    }
  }
  return problems;
}
