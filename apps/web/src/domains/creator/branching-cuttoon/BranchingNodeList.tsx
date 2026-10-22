"use no memo";
// 문구는 useBranchingT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import {
  addNode,
  BRANCHING_CUTTOON_LIMITS,
  type BranchingCuttoonGraph,
  type BranchingEditableNodeKind,
  type BranchingValidationReport,
} from "./model";
import { Flag, Plus } from "lucide-react";
import { useId, useState, type ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

import { editBlockMessage, kindLabel, nodeDisplayTitle } from "./branching-cuttoon-copy";
import { BC_FOCUS_RING, BC_HEADING, BC_KIND_BADGE, BC_SMALL_BUTTON, BC_SURFACE } from "./branching-cuttoon-styles";
import { BranchingNotice } from "./BranchingNotice";
import { useBranchingT } from "./use-branching-t";

interface BranchingNodeListProps {
  readonly graph: BranchingCuttoonGraph;
  readonly report: BranchingValidationReport;
  readonly selectedNodeId: string;
  /** 장면을 골랐다. focus 가 true 면 양식의 제목 칸으로 초점도 옮긴다(새 장면을 더한 직후). */
  readonly onSelect: (nodeId: string, focus: boolean) => void;
  readonly onChange: (graph: BranchingCuttoonGraph) => void;
}

/** 장면 목록과 장면·결말 추가. 장면마다 종류와 남은 오류·경고 수를 글자로 함께 보인다(색만으로 전달하지 않는다). */
export function BranchingNodeList({ graph, report, selectedNodeId, onSelect, onChange }: BranchingNodeListProps): ReactElement {
  const t = useBranchingT();
  const headingId = useId().replace(/:/gu, "");
  const [notice, setNotice] = useState<string | null>(null);

  const counts = new Map<string, { errors: number; warnings: number }>();
  for (const issue of report.issues) {
    if (issue.nodeId === undefined) continue;
    const current = counts.get(issue.nodeId) ?? { errors: 0, warnings: 0 };
    if (issue.severity === "error") current.errors += 1;
    else current.warnings += 1;
    counts.set(issue.nodeId, current);
  }

  const add = (kind: BranchingEditableNodeKind): void => {
    const title = kind === "ending" ? t("branchingCuttoon.nodes.newEndingTitle") : t("branchingCuttoon.nodes.newSceneTitle");
    const result = addNode(graph, kind, title);
    if (!result.ok) {
      setNotice(editBlockMessage(t, result.reason));
      return;
    }
    setNotice(null);
    onChange(result.graph);
    onSelect(result.nodeId, true);
  };

  return (
    <nav aria-labelledby={headingId} className={BC_SURFACE}>
      <h3 id={headingId} className={BC_HEADING}>
        {t("branchingCuttoon.nodes.heading", { count: graph.nodes.length, max: BRANCHING_CUTTOON_LIMITS.nodes })}
      </h3>
      {notice ? <BranchingNotice tone="warn" className="mt-3">{notice}</BranchingNotice> : null}
      <ul className="mt-3 grid gap-2">
        {graph.nodes.map((node, position) => {
          const selected = node.id === selectedNodeId;
          const found = counts.get(node.id);
          return (
            <li key={`${node.id}:${position}`}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(node.id, false)}
                className={cn(
                  "flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-150 motion-reduce:transition-none",
                  BC_FOCUS_RING,
                  selected ? "border-accent/60 bg-accent-soft text-fg" : "border-line bg-panel/55 text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                <span className={cn("inline-flex min-h-6 shrink-0 items-center rounded-full border px-2 text-[0.7rem] font-bold", BC_KIND_BADGE[node.kind])}>
                  {node.kind === "ending" ? <Flag size={11} className="mr-1" aria-hidden="true" /> : null}
                  {kindLabel(t, node.kind)}
                </span>
                <span className="min-w-0 flex-1 font-bold [overflow-wrap:anywhere]">{nodeDisplayTitle(t, node)}</span>
                {found && found.errors > 0 ? (
                  <span className="shrink-0 rounded-full border border-bad/50 bg-bad/10 px-2 text-[0.7rem] font-bold text-fg">
                    {t("branchingCuttoon.nodes.errorCount", { count: found.errors })}
                  </span>
                ) : null}
                {found && found.warnings > 0 ? (
                  <span className="shrink-0 rounded-full border border-warn/50 bg-warn/10 px-2 text-[0.7rem] font-bold text-fg">
                    {t("branchingCuttoon.nodes.warningCount", { count: found.warnings })}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => add("scene")} className={BC_SMALL_BUTTON}>
          <Plus size={15} aria-hidden="true" />
          {t("branchingCuttoon.nodes.addScene")}
        </button>
        <button type="button" onClick={() => add("ending")} className={BC_SMALL_BUTTON}>
          <Plus size={15} aria-hidden="true" />
          {t("branchingCuttoon.nodes.addEnding")}
        </button>
      </div>
    </nav>
  );
}
