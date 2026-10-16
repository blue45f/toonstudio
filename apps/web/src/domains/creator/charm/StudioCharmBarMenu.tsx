/**
 * 참 바 `⋯` 메뉴.
 *
 * 팝오버는 body 끝 포털이라 포커스를 옮기지 않으면 Tab 으로는 닿지 못한다. 그래서 열리면 첫 활성 항목으로 포커스를
 * 옮기고, ↑ ↓ Home End 로 항목을 오가며(끝에서 순환), Tab·Shift+Tab 으로 가장자리를 벗어나거나 Esc 를 누르면 닫고
 * 트리거로 돌려보낸다(`StudioCharmPopover` 의 `onTabOut`, `useStudioCharmPopover` 의 Esc 처리).
 * 비모달이라 포커스를 가두지 않는다. 항목은 네이티브 버튼이라 Enter·Space 가 그대로 통한다.
 */

import { Keyboard, Pencil, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { bi } from "./studio-charm-copy";
import { STUDIO_CHARM_SHORTCUTS, type StudioCharmShortcutId } from "./studio-charm-keyboard";
import { StudioCharmPopover } from "./StudioCharmPopover";

import type { KeyboardEvent } from "react";
import type { StudioCharmPopoverPlan } from "./studio-charm-popover-layout";

function shortcutAction(id: StudioCharmShortcutId): string {
  switch (id) {
    case "move": return bi("칩 사이 이동", "Move between charms");
    case "edge": return bi("처음·마지막 칩", "First / last charm");
    case "stamp": return bi("캔버스에 붙이기", "Stamp onto the canvas");
    case "reorder": return bi("순서 바꾸기", "Reorder");
    case "remove": return bi("순서 편집 중 참 바에서 빼기", "Remove from the bar (while editing order)");
    case "exit": return bi("순서 편집 끝내기", "Finish editing the order");
  }
}

const ITEM_CLASS = cn(
  "flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-sm text-fg hover:bg-raised disabled:opacity-40",
  STUDIO_FOCUS_RING,
);

/** 지금 누를 수 있는 항목(꺼진 항목은 포커스를 받지 못하므로 건너뛴다). */
function enabledItems(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
}

/** ↑ ↓ Home End 로 항목을 오간다. 끝에서 반대편으로 순환한다. */
function moveFocusWithArrowKeys(event: KeyboardEvent<HTMLElement>): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const items = enabledItems(event.currentTarget);
  if (items.length === 0) return;
  const current = event.target instanceof HTMLButtonElement ? items.indexOf(event.target) : -1;
  let next: number;
  if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
  else if (event.key === "ArrowUp") next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = items.length - 1;
  else return;
  event.preventDefault();
  items[next]?.focus();
}

interface MenuBodyProps {
  readonly canEdit: boolean;
  readonly onStartEditing: () => void;
  readonly onApplyStarter: () => void;
  readonly onCloseBar: () => void;
}

/** 열려 있는 동안에만 마운트된다. 마운트되면 첫 활성 항목으로 포커스를 옮긴다. */
function StudioCharmBarMenuBody({ canEdit, onStartEditing, onApplyStarter, onCloseBar }: MenuBodyProps) {
  useBilingualI18nRevision();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (root) enabledItems(root)[0]?.focus();
  }, []);

  return (
    <div ref={rootRef} className="grid gap-1 p-2">
      <button type="button" disabled={!canEdit} onClick={onStartEditing} className={ITEM_CLASS}>
        <Pencil size={14} aria-hidden="true" />
        {bi("순서·삭제 편집", "Edit order and removal")}
      </button>
      <button type="button" onClick={onApplyStarter} className={ITEM_CLASS}>
        <Sparkles size={14} aria-hidden="true" />
        {bi("기본 참 다시 담기", "Add the starter charms again")}
      </button>
      <button
        type="button"
        aria-expanded={showShortcuts}
        aria-controls={showShortcuts ? listId : undefined}
        onClick={() => setShowShortcuts((value) => !value)}
        className={ITEM_CLASS}
      >
        <Keyboard size={14} aria-hidden="true" />
        {bi("단축키 안내", "Keyboard shortcuts")}
      </button>
      {showShortcuts ? (
        <dl id={listId} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-line bg-card p-2 text-xs" data-studio-charm-shortcuts="">
          {STUDIO_CHARM_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.id} className="contents">
              <dt><kbd className="rounded border border-line bg-raised px-1 py-0.5 font-mono text-[0.68rem] text-fg">{shortcut.keys}</kbd></dt>
              <dd className="text-fg-2">{shortcutAction(shortcut.id)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <button type="button" onClick={onCloseBar} className={ITEM_CLASS}>
        <X size={14} aria-hidden="true" />
        {bi("참 바 닫기", "Close the charm bar")}
      </button>
    </div>
  );
}

export interface StudioCharmBarMenuProps extends MenuBodyProps {
  readonly plan: StudioCharmPopoverPlan | null;
  readonly id: string;
  /** Tab·Shift+Tab 으로 메뉴 가장자리를 벗어났다: 닫고 트리거로 돌려보낸다. */
  readonly onTabOut: () => void;
}

export function StudioCharmBarMenu({ plan, id, onTabOut, ...body }: StudioCharmBarMenuProps) {
  useBilingualI18nRevision();
  return (
    <StudioCharmPopover
      plan={plan}
      label={bi("참 바 메뉴", "Charm bar menu")}
      id={id}
      onTabOut={onTabOut}
      onKeyDown={moveFocusWithArrowKeys}
    >
      <StudioCharmBarMenuBody {...body} />
    </StudioCharmPopover>
  );
}
