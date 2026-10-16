/**
 * 참 바의 칩 하나. 아이콘 칩이며 누르면 붙이고, 끌어서 캔버스에 놓을 수 있다.
 *
 * 접근성: 네이티브 버튼 + roving tabindex(바 전체가 Tab 정지점 하나). 접근 가능한 이름은 참 이름이고,
 * 사용법은 `aria-describedby` 로 가리키는 숨김 안내문에 있다. 잠금·사라진 원본·불러오는 중을 각각 구분해 보여 준다.
 * 터치 대상은 44px(`pointer-coarse`·`max-lg`), 모션은 `motion-reduce` 로 끈다.
 */

import { CircleHelp } from "lucide-react";
import { memo } from "react";

import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { bi } from "./studio-charm-copy";
import { isStudioCharmDraggable } from "./studio-charm-drag";
import { StudioCharmPreview } from "./StudioCharmPreview";

import type { DragEvent, KeyboardEvent } from "react";
import type { StudioCharmResolution } from "./studio-charm-catalog";
import type { StudioCharmDescriptor } from "./studio-charm-descriptor";
import type { StudioCharmId } from "./studio-charm-model";

const CHIP_SIZE = "size-10 pointer-coarse:size-11 max-lg:size-11";

export interface StudioCharmChipProps {
  readonly id: StudioCharmId;
  readonly resolution: StudioCharmResolution;
  readonly index: number;
  readonly tabStop: boolean;
  readonly editing: boolean;
  readonly selectedForEdit: boolean;
  /** 잠금 사유 문구. 있으면 칩은 `aria-disabled` 이며 누르면 이유만 알린다. */
  readonly lockText: string | null;
  readonly describedBy: string;
  readonly registerElement: (id: StudioCharmId, element: HTMLButtonElement | null) => void;
  readonly onPress: (id: StudioCharmId) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, id: StudioCharmId, index: number) => void;
  readonly onFocusChip: (index: number) => void;
  readonly onDragStart: (event: DragEvent<HTMLButtonElement>, descriptor: StudioCharmDescriptor) => void;
}

function StudioCharmChipView({
  id,
  resolution,
  index,
  tabStop,
  editing,
  selectedForEdit,
  lockText,
  describedBy,
  registerElement,
  onPress,
  onKeyDown,
  onFocusChip,
  onDragStart,
}: StudioCharmChipProps) {
  useBilingualI18nRevision();

  if (resolution.status === "pending") {
    return (
      <span
        aria-hidden="true"
        data-studio-charm-pending="true"
        className={cn("skeleton shrink-0 rounded-lg", CHIP_SIZE)}
      />
    );
  }

  if (resolution.status === "missing") {
    const label = bi("사용할 수 없는 참", "Unavailable charm");
    return (
      <button
        ref={(element) => registerElement(id, element)}
        type="button"
        tabIndex={tabStop ? 0 : -1}
        aria-label={label}
        aria-describedby={describedBy}
        aria-pressed={editing ? selectedForEdit : undefined}
        title={bi(
          "원본 소재를 찾을 수 없어요. Delete 로 빼거나 편집 모드에서 뺄 수 있어요.",
          "The original item can no longer be found. Remove it with Delete or in edit mode.",
        )}
        data-studio-charm-id={id}
        data-studio-charm-state="missing"
        onClick={() => onPress(id)}
        onKeyDown={(event) => onKeyDown(event, id, index)}
        onFocus={() => onFocusChip(index)}
        className={cn(
          "grid shrink-0 place-items-center rounded-lg border border-dashed border-warning/60 bg-warning/10 text-fg-2 hover:bg-raised",
          CHIP_SIZE,
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
          "motion-reduce:transition-none",
          selectedForEdit && "border-accent bg-accent-soft",
        )}
      >
        <CircleHelp size={18} aria-hidden="true" />
      </button>
    );
  }

  const { descriptor } = resolution;
  const draggable = isStudioCharmDraggable(descriptor) && !editing && !lockText;
  const aiLabel = descriptor.rights.aiGenerated ? bi("AI 생성", "AI-generated") : null;
  const accessibleName = aiLabel ? `${descriptor.label}, ${aiLabel}` : descriptor.label;
  const hint = lockText
    ?? (editing
      ? bi("눌러서 편집할 참으로 고르기", "Press to select this charm for editing")
      : bi("눌러서 붙이기 · 끌어서 원하는 위치에 놓기", "Press to stamp · drag to drop where you want"));

  return (
    <button
      ref={(element) => registerElement(id, element)}
      type="button"
      tabIndex={tabStop ? 0 : -1}
      aria-label={accessibleName}
      aria-describedby={describedBy}
      aria-disabled={lockText ? true : undefined}
      aria-pressed={editing ? selectedForEdit : undefined}
      title={`${descriptor.label} — ${hint}`}
      draggable={draggable}
      data-studio-charm-id={id}
      data-studio-charm-kind={descriptor.kind}
      data-studio-charm-state="ready"
      onClick={() => onPress(id)}
      onKeyDown={(event) => onKeyDown(event, id, index)}
      onFocus={() => onFocusChip(index)}
      onDragStart={(event) => onDragStart(event, descriptor)}
      className={cn(
        "group relative flex shrink-0 touch-manipulation flex-col items-center gap-0.5 rounded-lg border p-0.5",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        "motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97]",
        selectedForEdit
          ? "border-accent bg-accent-soft"
          : "border-line bg-card hover:border-accent/50 hover:bg-raised",
        lockText && "cursor-not-allowed opacity-60",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <span className={cn("block shrink-0", CHIP_SIZE)}>
        <StudioCharmPreview descriptor={descriptor} />
      </span>
      {aiLabel ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 rounded border border-line bg-panel px-0.5 text-[0.5rem] font-bold leading-tight text-fg-2"
        >
          AI
        </span>
      ) : null}
      <span className="studio-charm-chip__label max-w-14 truncate text-[0.62rem] leading-tight text-fg-2">
        {descriptor.label}
      </span>
    </button>
  );
}

export const StudioCharmChip = memo(StudioCharmChipView);
