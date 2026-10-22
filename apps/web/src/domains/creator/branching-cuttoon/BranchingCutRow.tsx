"use no memo";
// 문구는 useBranchingT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { BRANCHING_CUTTOON_LIMITS, type BranchingCut } from "./model";

import { cutCaptionDomId } from "./branching-cuttoon-dom";
import { BC_LABEL, BC_SMALL_BUTTON, BC_SUBSURFACE, BC_TEXTAREA } from "./branching-cuttoon-styles";
import { useBranchingT } from "./use-branching-t";

import type { ReactElement } from "react";

interface BranchingCutRowProps {
  readonly prefix: string;
  /** 컷 표의 컷. 장면이 가리키는 컷이 표에 없으면 null — 글을 고칠 수 없고 참조만 뺄 수 있다. */
  readonly cut: BranchingCut | null;
  readonly cutId: string;
  readonly position: number;
  readonly total: number;
  readonly onCaption: (caption: string) => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRemove: () => void;
}

/** 컷 한 줄: 컷 글 입력, 순서 이동, 장면에서 빼기. */
export function BranchingCutRow({ prefix, cut, cutId, position, total, onCaption, onMove, onRemove }: BranchingCutRowProps): ReactElement {
  const t = useBranchingT();
  const n = position + 1;
  const id = cutCaptionDomId(prefix, cutId);
  return (
    <li className={BC_SUBSURFACE}>
      <label htmlFor={id} className={BC_LABEL}>{t("branchingCuttoon.cuts.captionField", { n })}</label>
      {cut ? (
        <textarea
          id={id}
          value={cut.caption}
          maxLength={BRANCHING_CUTTOON_LIMITS.captionLength}
          rows={3}
          onChange={(event) => onCaption(event.target.value)}
          className={`${BC_TEXTAREA} mt-1`}
        />
      ) : (
        <textarea
          id={id}
          value=""
          readOnly
          rows={2}
          placeholder={t("branchingCuttoon.cuts.captionMissing", { value: cutId })}
          className={`${BC_TEXTAREA} mt-1`}
        />
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onMove(-1)} disabled={position === 0} aria-label={t("branchingCuttoon.cuts.moveUp", { n })} className={BC_SMALL_BUTTON}>
          <ArrowUp size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={position === total - 1} aria-label={t("branchingCuttoon.cuts.moveDown", { n })} className={BC_SMALL_BUTTON}>
          <ArrowDown size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={onRemove} aria-label={t("branchingCuttoon.cuts.remove", { n })} className={BC_SMALL_BUTTON}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
