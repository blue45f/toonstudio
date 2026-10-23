import { Boxes, Check, ChevronRight, PencilLine, Unlink2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import { cx } from "@/shared/lib/cx";
import { useT } from "@/shared/lib/i18n";

import { describeStudioBg3dOrganizationFailure } from "./studio-bg3d-organization-feedback";

import type { StudioBg3dOrganizationController } from "./studio-bg3d-organization-controller";

/** 컴포넌트 보기의 묶음 머리글 한 줄. `groupId` 가 null 이면 컴포넌트에 속하지 않은 오브젝트를 모은 가상 묶음이다. */
export interface StudioBg3dComponentGroupRowData {
  readonly key: string;
  readonly groupId: string | null;
  readonly name: string;
  readonly memberIds: readonly string[];
}

interface StudioBg3dOutlinerComponentGroupRowProps {
  readonly row: StudioBg3dComponentGroupRowData;
  readonly organization: StudioBg3dOrganizationController;
  readonly variant: "dock" | "panel";
  readonly collapsed: boolean;
  readonly selected: boolean;
  readonly setButtonRef: (node: HTMLButtonElement | null) => void;
  readonly onToggleCollapsed: () => void;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

function iconButtonClass(variant: "dock" | "panel"): string {
  return cx(
    "grid shrink-0 place-items-center rounded text-fg-3 transition-colors",
    "hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2",
    "focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
    variant === "dock" ? "size-7" : "size-11 sm:size-7",
  );
}

/**
 * 컴포넌트 보기의 묶음 머리글. 한 줄을 누르면 인스턴스 전체를 고르고, 이름 바꾸기는 모든 인스턴스에 함께 적용된다.
 * 이름 바꾸기는 줄 안에서 바로 입력하고(Enter 저장, Esc 취소) 실패하면 이유와 다음 행동을 줄 아래에 알린다.
 */
export function StudioBg3dOutlinerComponentGroupRow({
  row,
  organization,
  variant,
  collapsed,
  selected,
  setButtonRef,
  onToggleCollapsed,
  onKeyDown,
}: StudioBg3dOutlinerComponentGroupRowProps) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const count = row.memberIds.length;
  const groupId = row.groupId;
  const editing = draft !== null;

  // 편집을 열면 입력칸으로, 닫으면 이름 바꾸기 버튼으로 포커스를 옮겨 키보드 사용자가 자리를 잃지 않게 한다.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
    else if (wasEditing.current) renameButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const closeEditor = () => {
    setDraft(null);
    setError(null);
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft === null || groupId === null) return;
    const result = organization.renameComponent(groupId, draft);
    if (result.ok || result.reason === "unchanged") {
      closeEditor();
      return;
    }
    const copy = describeStudioBg3dOrganizationFailure(result.reason, "name");
    setError(t(copy.key, copy.fallback));
  };

  return (
    <>
      <div
        className={cx(
          "group flex items-center gap-0.5 rounded-lg border px-1 py-1 text-xs transition-colors",
          selected ? "border-accent/55 bg-accent-soft text-accent" : "border-line/80 bg-panel text-fg-2 hover:bg-raised",
        )}
      >
        <button
          type="button"
          className={iconButtonClass(variant)}
          aria-label={
            collapsed
              ? t("studio.bg3dScene.group.expand", { name: row.name }, "{name} 펼치기")
              : t("studio.bg3dScene.group.collapse", { name: row.name }, "{name} 접기")
          }
          onClick={onToggleCollapsed}
        >
          <ChevronRight
            size={13}
            className={cx("transition-transform motion-reduce:transition-none", !collapsed && "rotate-90")}
            aria-hidden
          />
        </button>
        {editing ? (
          <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={save}>
            <label htmlFor={inputId} className="sr-only">
              {t("studio.bg3dScene.group.renameLabel", "컴포넌트 이름")}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={draft}
              maxLength={96}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              className={cx(
                "min-h-9 min-w-0 flex-1 rounded border border-line bg-card px-2 text-xs font-semibold text-fg",
                "focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1",
                "focus-visible:outline-accent",
              )}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeEditor();
                }
              }}
            />
            <button type="submit" className={iconButtonClass(variant)} aria-label={t("studio.bg3dScene.group.renameSave", "이름 저장")}>
              <Check size={13} aria-hidden />
            </button>
            <button
              type="button"
              className={iconButtonClass(variant)}
              aria-label={t("studio.bg3dScene.group.renameCancel", "이름 바꾸기 취소")}
              onClick={closeEditor}
            >
              <X size={13} aria-hidden />
            </button>
          </form>
        ) : (
          <>
            <button
              ref={setButtonRef}
              type="button"
              className={cx(
                "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              )}
              aria-label={t("studio.bg3dScene.group.select", { name: row.name, count }, "{name} 인스턴스 {count}개 모두 선택")}
              onClick={() => organization.selectEntities(row.memberIds)}
              onKeyDown={onKeyDown}
            >
              <Boxes size={13} className="shrink-0 text-fg-3" aria-hidden />
              <span className="truncate font-semibold">{row.name}</span>
              <span aria-hidden className="shrink-0 tabular-nums text-fg-3">
                {count}
              </span>
            </button>
            {groupId !== null ? (
              <div className="flex shrink-0 items-center">
                <button
                  ref={renameButtonRef}
                  type="button"
                  className={iconButtonClass(variant)}
                  aria-label={t("studio.bg3dScene.group.rename", { name: row.name }, "{name} 이름 바꾸기")}
                  title={t("studio.bg3dScene.group.renameTitle", "컴포넌트 이름 바꾸기")}
                  onClick={() => {
                    setError(null);
                    setDraft(row.name);
                  }}
                >
                  <PencilLine size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  className={iconButtonClass(variant)}
                  aria-label={t("studio.bg3dScene.group.ungroup", { name: row.name }, "{name} 묶음 풀기")}
                  title={t("studio.bg3dScene.group.ungroupTitle", "묶음 풀기")}
                  onClick={() => organization.ungroupComponent(row.memberIds)}
                >
                  <Unlink2 size={12} aria-hidden />
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="px-2 pt-1 text-xs font-semibold leading-relaxed text-accent">
          {error}
        </p>
      ) : null}
    </>
  );
}
