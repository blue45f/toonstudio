import type { BranchingCuttoonGraph, BranchingValidationReport } from "./model";

import { BranchingNodeForm } from "./BranchingNodeForm";
import { BranchingNodeList } from "./BranchingNodeList";

import type { BranchingJumpRequest } from "./branching-cuttoon-dom";
import type { ReactElement } from "react";

interface BranchingCuttoonEditorProps {
  readonly graph: BranchingCuttoonGraph;
  readonly report: BranchingValidationReport;
  readonly selectedNodeId: string;
  readonly onSelectNode: (nodeId: string, focus: boolean) => void;
  readonly onChange: (graph: BranchingCuttoonGraph) => void;
  readonly jump: BranchingJumpRequest | null;
  readonly onJumpHandled: () => void;
}

/**
 * 최소 제작 화면의 본체: 왼쪽에 장면 목록, 오른쪽에 고르고 있는 장면의 양식. 그래프 캔버스는 만들지 않고 목록으로만 편집한다.
 * 선택한 장면이 사라졌으면(가져오기·지우기 직후) 첫 장면을 보여 준다.
 */
export function BranchingCuttoonEditor({
  graph,
  report,
  selectedNodeId,
  onSelectNode,
  onChange,
  jump,
  onJumpHandled,
}: BranchingCuttoonEditorProps): ReactElement | null {
  const selected = graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0];
  if (!selected) return null;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <BranchingNodeList graph={graph} report={report} selectedNodeId={selected.id} onSelect={onSelectNode} onChange={onChange} />
      <BranchingNodeForm
        key={selected.id}
        graph={graph}
        node={selected}
        onChange={onChange}
        jump={jump}
        onJumpHandled={onJumpHandled}
        onNodeRemoved={(nextId) => onSelectNode(nextId, true)}
      />
    </div>
  );
}
