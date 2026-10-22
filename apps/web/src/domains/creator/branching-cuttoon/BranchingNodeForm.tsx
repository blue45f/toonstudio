"use no memo";
// 문구는 useBranchingT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import {
  addChoice,
  addCut,
  BRANCHING_CUTTOON_LIMITS,
  moveChoice,
  moveCutRef,
  removeChoice,
  removeCutRef,
  removeNode,
  setStartNode,
  updateChoice,
  updateCutCaption,
  updateNode,
  type BranchingCuttoonGraph,
  type BranchingEditResult,
  type BranchingNode,
} from "./model";
import { Plus } from "lucide-react";
import { useEffect, useId, useState, type ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

import { editBlockMessage, kindLabel, nodeDisplayTitle } from "./branching-cuttoon-copy";
import {
  addChoiceDomId,
  addCutDomId,
  choiceLabelDomId,
  cutCaptionDomId,
  nodeHeadingDomId,
  nodeTitleDomId,
  type BranchingJumpRequest,
} from "./branching-cuttoon-dom";
import {
  BC_DANGER_BUTTON,
  BC_FOCUS_RING,
  BC_HEADING,
  BC_HINT,
  BC_INPUT,
  BC_KIND_BADGE,
  BC_LABEL,
  BC_SMALL_BUTTON,
  BC_SURFACE,
} from "./branching-cuttoon-styles";
import { BranchingChoiceRow, type BranchingTargetOption } from "./BranchingChoiceRow";
import { BranchingCutRow } from "./BranchingCutRow";
import { BranchingNotice } from "./BranchingNotice";
import { useBranchingT, type BranchingT } from "./use-branching-t";
import { useFocusRequest } from "./use-focus-request";

interface BranchingNodeFormProps {
  readonly graph: BranchingCuttoonGraph;
  readonly node: BranchingNode;
  readonly onChange: (graph: BranchingCuttoonGraph) => void;
  /** 오류 항목을 눌러 이 장면으로 이동했을 때의 요청. 처리하면 onJumpHandled 로 알린다. */
  readonly jump: BranchingJumpRequest | null;
  readonly onJumpHandled: () => void;
  /** 장면을 지운 뒤 선택을 옮길 장면(시작 장면)의 식별자를 알린다. */
  readonly onNodeRemoved: (nextSelectedId: string) => void;
}

type OkResult<T extends object> = { readonly ok: true; readonly graph: BranchingCuttoonGraph } & T;

/** 같은 제목이 여러 장면에 있으면 식별자를 덧붙여 도착 장면 선택에서 구분되게 한다. */
function targetOptions(t: BranchingT, graph: BranchingCuttoonGraph): readonly BranchingTargetOption[] {
  const counts = new Map<string, number>();
  for (const candidate of graph.nodes) {
    const title = nodeDisplayTitle(t, candidate);
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  return graph.nodes.map((candidate) => {
    const title = nodeDisplayTitle(t, candidate);
    return { id: candidate.id, label: (counts.get(title) ?? 0) > 1 ? `${title} (${candidate.id})` : title };
  });
}

/** 선택한 장면 하나를 고치는 양식: 제목·종류, 컷 목록, 선택지 목록, 장면 지우기. */
export function BranchingNodeForm({ graph, node, onChange, jump, onJumpHandled, onNodeRemoved }: BranchingNodeFormProps): ReactElement {
  const t = useBranchingT();
  const prefix = `bc${useId().replace(/:/gu, "")}`;
  const headingId = nodeHeadingDomId(prefix);
  const titleId = nodeTitleDomId(prefix);
  const kindId = `${prefix}-node-kind`;
  const cutsHeadingId = `${prefix}-cuts-heading`;
  const choicesHeadingId = `${prefix}-choices-heading`;
  const focus = useFocusRequest();
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 오류 항목을 눌러 이 장면으로 왔으면 문제가 있는 입력 칸으로 초점을 옮긴다. 칸을 찾지 못하면 장면 제목 칸으로 간다.
  useEffect(() => {
    if (!jump || jump.nodeId !== node.id) return;
    const wanted = jump.choiceId !== undefined
      ? choiceLabelDomId(prefix, jump.choiceId)
      : jump.cutId !== undefined
        ? cutCaptionDomId(prefix, jump.cutId)
        : titleId;
    (document.getElementById(wanted) ?? document.getElementById(titleId))?.focus();
    onJumpHandled();
  }, [jump, node.id, onJumpHandled, prefix, titleId]);

  /** 편집 결과를 반영한다. 거절되면 그래프는 그대로 두고 이유를 안내한다. */
  const apply = <T extends object>(result: BranchingEditResult<T>): OkResult<T> | null => {
    if (!result.ok) {
      setNotice(editBlockMessage(t, result.reason));
      return null;
    }
    setNotice(null);
    onChange(result.graph);
    return result;
  };

  const options = targetOptions(t, graph);
  const isEnding = node.kind === "ending";
  const inboundCount = graph.nodes.reduce(
    (total, candidate) => total + candidate.choices.filter((choice) => choice.targetNodeId === node.id).length,
    0,
  );

  const addNewCut = (): void => {
    const done = apply(addCut(graph, node.id, ""));
    if (done) focus(cutCaptionDomId(prefix, done.cutId));
  };
  const addNewChoice = (): void => {
    const done = apply(addChoice(graph, node.id, ""));
    if (done) focus(choiceLabelDomId(prefix, done.choiceId));
  };
  const deleteNode = (): void => {
    const done = apply(removeNode(graph, node.id));
    if (!done) return;
    setConfirmingDelete(false);
    onNodeRemoved(done.graph.startNodeId);
  };

  return (
    <section aria-labelledby={headingId} className={BC_SURFACE}>
      <h3 id={headingId} tabIndex={-1} className={cn(BC_HEADING, "[overflow-wrap:anywhere] focus:outline-none", BC_FOCUS_RING)}>
        {t("branchingCuttoon.node.heading", { title: nodeDisplayTitle(t, node) })}
      </h3>
      {notice ? <BranchingNotice tone="warn" className="mt-3">{notice}</BranchingNotice> : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={titleId} className={BC_LABEL}>{t("branchingCuttoon.node.titleField")}</label>
          <input
            id={titleId}
            type="text"
            value={node.title}
            maxLength={BRANCHING_CUTTOON_LIMITS.nodeTitleLength}
            onChange={(event) => apply(updateNode(graph, node.id, { title: event.target.value }))}
            className={`${BC_INPUT} mt-1`}
          />
        </div>
        <div>
          {node.kind === "start" ? (
            <>
              <p className={BC_LABEL}>{t("branchingCuttoon.node.kindField")}</p>
              <p className="mt-1 flex min-h-11 items-center gap-2 text-sm text-fg-2">
                <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-bold", BC_KIND_BADGE.start)}>
                  {kindLabel(t, "start")}
                </span>
                {t("branchingCuttoon.node.startHint")}
              </p>
            </>
          ) : (
            <>
              <label htmlFor={kindId} className={BC_LABEL}>{t("branchingCuttoon.node.kindField")}</label>
              <div className="mt-1 flex flex-wrap gap-2">
                <select
                  id={kindId}
                  value={node.kind}
                  onChange={(event) => apply(updateNode(graph, node.id, { kind: event.target.value === "ending" ? "ending" : "scene" }))}
                  className={cn(BC_INPUT, "w-auto min-w-32")}
                >
                  <option value="scene">{kindLabel(t, "scene")}</option>
                  <option value="ending">{kindLabel(t, "ending")}</option>
                </select>
                <button type="button" onClick={() => apply(setStartNode(graph, node.id))} className={BC_SMALL_BUTTON}>
                  {t("branchingCuttoon.node.setStart")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <section aria-labelledby={cutsHeadingId} className="mt-6">
        <h4 id={cutsHeadingId} className="text-sm font-black text-fg">
          {t("branchingCuttoon.cuts.heading", { count: node.cutIds.length, max: BRANCHING_CUTTOON_LIMITS.cutsPerNode })}
        </h4>
        <p className={cn(BC_HINT, "mt-1")}>{t("branchingCuttoon.cuts.hint")}</p>
        {node.cutIds.length > 0 ? (
          <ul className="mt-3 grid gap-3">
            {node.cutIds.map((cutId, position) => (
              <BranchingCutRow
                key={`${cutId}-${position}`}
                prefix={prefix}
                cut={graph.cuts.find((candidate) => candidate.id === cutId) ?? null}
                cutId={cutId}
                position={position}
                total={node.cutIds.length}
                onCaption={(caption) => apply(updateCutCaption(graph, cutId, caption))}
                onMove={(direction) => apply(moveCutRef(graph, node.id, position, direction))}
                onRemove={() => {
                  if (apply(removeCutRef(graph, node.id, position))) focus(addCutDomId(prefix));
                }}
              />
            ))}
          </ul>
        ) : (
          <p className={cn(BC_HINT, "mt-3")}>{t("branchingCuttoon.cuts.empty")}</p>
        )}
        <button type="button" id={addCutDomId(prefix)} onClick={addNewCut} className={cn(BC_SMALL_BUTTON, "mt-3")}>
          <Plus size={15} aria-hidden="true" />
          {t("branchingCuttoon.cuts.add")}
        </button>
      </section>

      <section aria-labelledby={choicesHeadingId} className="mt-6">
        <h4 id={choicesHeadingId} className="text-sm font-black text-fg">
          {t("branchingCuttoon.choices.heading", { count: node.choices.length, max: BRANCHING_CUTTOON_LIMITS.choicesPerNode })}
        </h4>
        <p className={cn(BC_HINT, "mt-1")}>
          {isEnding ? t("branchingCuttoon.choices.endingHint") : t("branchingCuttoon.choices.hint")}
        </p>
        {node.choices.length > 0 ? (
          <ul className="mt-3 grid gap-3">
            {node.choices.map((choice, position) => (
              <BranchingChoiceRow
                key={choice.id}
                prefix={prefix}
                choice={choice}
                position={position}
                total={node.choices.length}
                targets={options}
                onLabel={(label) => apply(updateChoice(graph, node.id, choice.id, { label }))}
                onTarget={(targetNodeId) => apply(updateChoice(graph, node.id, choice.id, { targetNodeId }))}
                onMove={(direction) => apply(moveChoice(graph, node.id, choice.id, direction))}
                onRemove={() => {
                  if (apply(removeChoice(graph, node.id, choice.id))) focus(addChoiceDomId(prefix));
                }}
              />
            ))}
          </ul>
        ) : null}
        {isEnding ? null : (
          <button type="button" id={addChoiceDomId(prefix)} onClick={addNewChoice} className={cn(BC_SMALL_BUTTON, "mt-3")}>
            <Plus size={15} aria-hidden="true" />
            {t("branchingCuttoon.choices.add")}
          </button>
        )}
      </section>

      {node.kind === "start" ? (
        <p className={cn(BC_HINT, "mt-6")}>{t("branchingCuttoon.node.startCannotDelete")}</p>
      ) : (
        <div className="mt-6 border-t border-line pt-4">
          {confirmingDelete ? (
            <div role="group" aria-label={t("branchingCuttoon.node.deleteConfirmLabel")} className="grid gap-3">
              <p className="text-sm leading-6 text-fg-2">{t("branchingCuttoon.node.deleteConfirm", { count: inboundCount })}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={deleteNode} className={BC_DANGER_BUTTON}>{t("branchingCuttoon.node.deleteConfirmAction")}</button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className={BC_SMALL_BUTTON}>{t("branchingCuttoon.common.cancel")}</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className={BC_DANGER_BUTTON}>{t("branchingCuttoon.node.delete")}</button>
          )}
        </div>
      )}
    </section>
  );
}
