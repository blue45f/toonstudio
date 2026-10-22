/**
 * 그래프 판(version) 지문.
 *
 * 읽기 진행 기록은 "어느 장면에 있었는가"와 "어떤 선택으로 왔는가"를 담는다. 장면과 선택지의 연결이 바뀐 그래프에 옛 기록을 적용하면
 * 없는 장면이나 이어지지 않는 길을 가리킬 수 있으므로, 연결의 지문이 같을 때만 기록을 되살린다.
 *
 * 지문에 넣는 것: 시작 장면, 장면(식별자·종류), 선택지(식별자·도착 장면). 넣지 않는 것: 제목·라벨·컷 글·순서.
 * 오타를 고치거나 문구를 다듬어도 독자의 읽던 위치는 유지되고, 길이 바뀌면 처음부터 시작한다. 암호학적 해시가 아니라 변경 감지용이다.
 */
import type { BranchingCuttoonGraph } from "./branching-cuttoon-types";

/** 지문 알고리즘이 바뀌면 올린다. 올리면 모든 옛 기록이 버려진다. */
const FINGERPRINT_PREFIX = "bt1-";

function hashText(text: string): string {
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    high = Math.imul(high ^ unit, 2654435761);
    low = Math.imul(low ^ unit, 1597334677);
  }
  high = Math.imul(high ^ (high >>> 16), 2246822507) ^ Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507) ^ Math.imul(high ^ (high >>> 13), 3266489909);
  return (4294967296 * (2097151 & low) + (high >>> 0)).toString(36);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** 장면·선택지의 연결로 만든 그래프 판 지문. 같은 연결이면 순서와 글이 달라도 같다. */
export function branchingGraphVersion(graph: BranchingCuttoonGraph): string {
  const nodes = [...graph.nodes]
    .sort((left, right) => compareText(left.id, right.id))
    .map((node) => {
      const choices = [...node.choices]
        .sort((left, right) => compareText(left.id, right.id))
        .map((choice) => `${choice.id}>${choice.targetNodeId}`)
        .join(",");
      return `${node.id}:${node.kind}[${choices}]`;
    });
  return `${FINGERPRINT_PREFIX}${hashText(`${graph.startNodeId}|${nodes.join(";")}`)}`;
}
