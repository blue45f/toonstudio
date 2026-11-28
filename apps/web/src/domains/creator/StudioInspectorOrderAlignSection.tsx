import {
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalJustifyCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Trash2,
} from "lucide-react";

import { StudioInspectorSection } from "./StudioInspectorSection";

import type { ReactNode } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";

export type StudioInspectorAlignMode =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vcenter"
  | "bottom"
  | "distributeH"
  | "distributeV";

interface StudioInspectorSelectionActionsProps {
  selectionCount: number;
  reorder: (dir: "front" | "back" | "forward" | "backward") => void;
  alignSelected: (mode: StudioInspectorAlignMode) => void;
  duplicateSelected: () => void;
  removeSelected: () => void;
}

interface ActionButtonProps {
  label: string;
  shortLabel: string;
  controlId: string;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

function ActionButton({
  label,
  shortLabel,
  controlId,
  onClick,
  icon,
  disabled = false,
  disabledReason,
}: ActionButtonProps) {
  const title = disabled ? (disabledReason ?? label) : label;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={title}
      data-inspector-control-id={controlId}
      data-inspector-priority="advanced"
      className={buttonClass({
        size: "sm",
        variant: "quiet",
        className: "min-h-9 min-w-0 gap-1 px-2 text-[0.6875rem] pointer-coarse:min-h-11",
      })}
    >
      {icon}
      <span className="truncate">{shortLabel}</span>
    </button>
  );
}

/**
 * Shared selection action surface. A single object and a marquee selection use the same actions,
 * labels, touch targets and accessibility metadata, so the Inspector cannot drift into two
 * different command sets as features grow.
 */
export function StudioInspectorSelectionActions({
  selectionCount,
  reorder,
  alignSelected,
  duplicateSelected,
  removeSelected,
}: StudioInspectorSelectionActionsProps) {
  const t = useT();
  const canDistribute = selectionCount >= 3;
  const distributeReason = "간격 분배는 요소를 3개 이상 선택하면 사용할 수 있어요.";

  return (
    <>
      <StudioInspectorSection sectionId="element.order-align" loadingLabel={t("studio.canvas.panelLoading.orderAlign", "정렬·순서를 여는 중...")}>
        {selectionCount > 1 ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-canvas/45 px-2 py-1.5 text-[0.6875rem] text-fg-3">
            <span>선택 묶음 기준으로 정렬합니다.</span>
            <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-px font-bold tabular-nums text-accent">
              {selectionCount}개
            </span>
          </div>
        ) : null}

        <div className="space-y-1.5" role="group" aria-label="레이어 순서">
          <p className="text-[0.6875rem] font-bold text-fg-3">레이어 순서</p>
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton
              label="선택을 맨 앞으로"
              shortLabel="맨 앞으로"
              controlId="selection.order.front"
              onClick={() => reorder("front")}
              icon={<ArrowUpToLine size={14} aria-hidden />}
            />
            <ActionButton
              label="선택을 맨 뒤로"
              shortLabel="맨 뒤로"
              controlId="selection.order.back"
              onClick={() => reorder("back")}
              icon={<ArrowDownToLine size={14} aria-hidden />}
            />
          </div>
        </div>

        <div className="space-y-1.5" role="group" aria-label="선택 정렬">
          <p className="text-[0.6875rem] font-bold text-fg-3">정렬</p>
          <div className="grid grid-cols-3 gap-1.5">
            <ActionButton
              label="왼쪽 정렬"
              shortLabel="왼쪽"
              controlId="selection.align.left"
              onClick={() => alignSelected("left")}
              icon={<AlignStartVertical size={14} aria-hidden />}
            />
            <ActionButton
              label="가로 가운데 정렬"
              shortLabel="가로 중앙"
              controlId="selection.align.hcenter"
              onClick={() => alignSelected("hcenter")}
              icon={<AlignHorizontalJustifyCenter size={14} aria-hidden />}
            />
            <ActionButton
              label="오른쪽 정렬"
              shortLabel="오른쪽"
              controlId="selection.align.right"
              onClick={() => alignSelected("right")}
              icon={<AlignEndVertical size={14} aria-hidden />}
            />
            <ActionButton
              label="위쪽 정렬"
              shortLabel="위쪽"
              controlId="selection.align.top"
              onClick={() => alignSelected("top")}
              icon={<AlignStartHorizontal size={14} aria-hidden />}
            />
            <ActionButton
              label="세로 가운데 정렬"
              shortLabel="세로 중앙"
              controlId="selection.align.vcenter"
              onClick={() => alignSelected("vcenter")}
              icon={<AlignVerticalJustifyCenter size={14} aria-hidden />}
            />
            <ActionButton
              label="아래쪽 정렬"
              shortLabel="아래쪽"
              controlId="selection.align.bottom"
              onClick={() => alignSelected("bottom")}
              icon={<AlignEndHorizontal size={14} aria-hidden />}
            />
          </div>
        </div>

        <div className="space-y-1.5" role="group" aria-label="선택 간격 분배">
          <p className="text-[0.6875rem] font-bold text-fg-3">간격</p>
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton
              label="가로 등간격 분배"
              shortLabel="가로 균등"
              controlId="selection.distribute.horizontal"
              onClick={() => alignSelected("distributeH")}
              icon={<AlignHorizontalJustifyCenter size={14} className="rotate-90" aria-hidden />}
              disabled={!canDistribute}
              disabledReason={distributeReason}
            />
            <ActionButton
              label="세로 등간격 분배"
              shortLabel="세로 균등"
              controlId="selection.distribute.vertical"
              onClick={() => alignSelected("distributeV")}
              icon={<AlignVerticalJustifyCenter size={14} className="rotate-90" aria-hidden />}
              disabled={!canDistribute}
              disabledReason={distributeReason}
            />
          </div>
        </div>
      </StudioInspectorSection>

      <div className="mt-3 grid grid-cols-2 gap-1.5" role="group" aria-label="선택 빠른 작업">
        <button
          type="button"
          onClick={duplicateSelected}
          aria-label={`${selectionCount}개 선택 복제`}
          title="복제 (⌘J)"
          data-inspector-control-id="selection.duplicate"
          data-inspector-priority="essential"
          className={buttonClass({
            size: "sm",
            variant: "quiet",
            className: "min-h-9 gap-1 pointer-coarse:min-h-11",
          })}
        >
          <Copy size={14} aria-hidden /> 복제
        </button>
        <button
          type="button"
          onClick={removeSelected}
          aria-label={`${selectionCount}개 선택 삭제`}
          title="삭제 (Delete)"
          data-inspector-control-id="selection.delete"
          data-inspector-priority="essential"
          className={buttonClass({
            size: "sm",
            variant: "quiet",
            className: "min-h-9 gap-1 text-bad pointer-coarse:min-h-11",
          })}
        >
          <Trash2 size={14} aria-hidden /> 삭제
        </button>
      </div>
    </>
  );
}

export function StudioInspectorOrderAlignSection(
  actions: Omit<StudioInspectorSelectionActionsProps, "selectionCount">,
) {
  return <StudioInspectorSelectionActions selectionCount={1} {...actions} />;
}
