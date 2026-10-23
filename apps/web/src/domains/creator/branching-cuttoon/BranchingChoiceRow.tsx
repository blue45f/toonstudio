"use no memo";
// 문구는 useBranchingT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { BRANCHING_CUTTOON_LIMITS, type BranchingChoice } from "./model";

import { choiceLabelDomId, choiceTargetDomId } from "./branching-cuttoon-dom";
import { BC_INPUT, BC_LABEL, BC_SMALL_BUTTON, BC_SUBSURFACE } from "./branching-cuttoon-styles";
import { useBranchingT } from "./use-branching-t";

import type { ReactElement } from "react";

export interface BranchingTargetOption {
  readonly id: string;
  readonly label: string;
}

interface BranchingChoiceRowProps {
  /** 요소 식별자 접두사(화면 인스턴스별로 다르다). */
  readonly prefix: string;
  readonly choice: BranchingChoice;
  /** 0부터 시작하는 위치와 전체 개수. 문구에는 1부터 센 번호를 쓴다. */
  readonly position: number;
  readonly total: number;
  readonly targets: readonly BranchingTargetOption[];
  readonly onLabel: (label: string) => void;
  readonly onTarget: (targetNodeId: string) => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRemove: () => void;
}

/** 선택지 한 줄: 이름 입력, 도착 장면 선택, 순서 이동, 지우기. */
export function BranchingChoiceRow({
  prefix,
  choice,
  position,
  total,
  targets,
  onLabel,
  onTarget,
  onMove,
  onRemove,
}: BranchingChoiceRowProps): ReactElement {
  const t = useBranchingT();
  const n = position + 1;
  const labelId = choiceLabelDomId(prefix, choice.id);
  const targetId = choiceTargetDomId(prefix, choice.id);
  // 가져온 파일이 없는 장면을 가리키면 그 값을 그대로 보여 주는 선택지를 하나 더해, 화면이 실제 상태를 감추지 않게 한다.
  const unknownTarget = choice.targetNodeId !== "" && !targets.some((option) => option.id === choice.targetNodeId);

  return (
    <li className={BC_SUBSURFACE}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={labelId} className={BC_LABEL}>{t("branchingCuttoon.choices.labelField", { n })}</label>
          <input
            id={labelId}
            type="text"
            value={choice.label}
            maxLength={BRANCHING_CUTTOON_LIMITS.choiceLabelLength}
            onChange={(event) => onLabel(event.target.value)}
            className={`${BC_INPUT} mt-1`}
          />
        </div>
        <div>
          <label htmlFor={targetId} className={BC_LABEL}>{t("branchingCuttoon.choices.targetField", { n })}</label>
          <select
            id={targetId}
            value={choice.targetNodeId}
            onChange={(event) => onTarget(event.target.value)}
            className={`${BC_INPUT} mt-1`}
          >
            <option value="">{t("branchingCuttoon.choices.targetPlaceholder")}</option>
            {targets.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
            {unknownTarget ? (
              <option value={choice.targetNodeId}>{t("branchingCuttoon.choices.targetMissing", { value: choice.targetNodeId })}</option>
            ) : null}
          </select>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onMove(-1)} disabled={position === 0} aria-label={t("branchingCuttoon.choices.moveUp", { n })} className={BC_SMALL_BUTTON}>
          <ArrowUp size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={position === total - 1} aria-label={t("branchingCuttoon.choices.moveDown", { n })} className={BC_SMALL_BUTTON}>
          <ArrowDown size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={onRemove} aria-label={t("branchingCuttoon.choices.remove", { n })} className={BC_SMALL_BUTTON}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
