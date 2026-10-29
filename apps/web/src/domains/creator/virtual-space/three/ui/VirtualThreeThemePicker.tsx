import { useId, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { findVirtualThreeTheme, VIRTUAL_THREE_THEMES } from "../themes/virtual-three-theme-catalog";
import type { VirtualThreeThemeNotice } from "../themes/virtual-three-theme-store";
import type { VirtualThreeThemeId, VirtualThreeThemePreviewState } from "../themes/virtual-three-theme-types";
import "./virtual-three-theme-picker.css";

export type { VirtualThreeThemePreviewState } from "../themes/virtual-three-theme-types";

export interface VirtualThreeThemePickerProps {
  /** 준비가 끝나 실제 무대에 보이는 테마다. 버튼으로 요청한 값과 구분한다. */
  readonly shownThemeId: VirtualThreeThemeId;
  readonly requestedThemeId: VirtualThreeThemeId;
  readonly savedThemeId: VirtualThreeThemeId | null;
  readonly hydrated: boolean;
  readonly preview: VirtualThreeThemePreviewState;
  readonly notice: VirtualThreeThemeNotice | null;
  readonly onPreview: (id: VirtualThreeThemeId) => void;
  /** 실제 무대 commit을 확인한 shown ID만 저장한다. */
  readonly onApply: (id: VirtualThreeThemeId) => void;
  readonly onRevert: () => void;
  readonly onRetry: () => void;
  readonly onDismissNotice: () => void;
}

function stopStudioWorldKeyPropagation(event: KeyboardEvent<HTMLButtonElement>): void {
  if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
}

/** 실제 무대가 준비됐다는 외부 commit 결과를 받은 뒤 저장 요청을 허용한다. */
export function VirtualThreeThemePicker({
  shownThemeId, requestedThemeId, savedThemeId, hydrated, preview, notice,
  onPreview, onApply, onRevert, onRetry, onDismissNotice,
}: VirtualThreeThemePickerProps) {
  const bt = useBilingual("StudioVirtualSpaceThreeThemePicker");
  const descriptionPrefix = useId();
  const shown = findVirtualThreeTheme(shownThemeId);
  const readyToSave = hydrated && preview.status === "ready" && shownThemeId === requestedThemeId;
  const unsaved = shownThemeId !== savedThemeId;
  const retrySave = notice?.code === "storage-write-failed";
  return (
    <fieldset className="virtual-three-theme-picker" disabled={!hydrated} aria-busy={preview.status === "loading"}>
      <legend>{bt("3D 공간 테마", "3D space theme")}</legend>
      <p className="virtual-three-theme-picker__note">
        {bt("테마를 골라 공간에서 미리 본 뒤 저장하세요. 선택은 이 브라우저의 현재 공간에만 저장됩니다.",
          "Preview a theme in the space, then save it. The choice is saved for this space in this browser only.")}
      </p>
      <div className="virtual-three-theme-picker__list">
        {VIRTUAL_THREE_THEMES.map((theme) => (
          <button key={theme.id} type="button" disabled={!hydrated} aria-pressed={requestedThemeId === theme.id}
            aria-label={bt(theme.copy.ko.name, theme.copy.en.name)} aria-describedby={`${descriptionPrefix}-${theme.id}`}
            data-three-theme={theme.id} onKeyDown={stopStudioWorldKeyPropagation} onKeyUp={stopStudioWorldKeyPropagation}
            onClick={() => onPreview(theme.id)}>
            <strong>{bt(theme.copy.ko.name, theme.copy.en.name)}</strong>
            <span id={`${descriptionPrefix}-${theme.id}`}>{bt(theme.copy.ko.description, theme.copy.en.description)}</span>
            {savedThemeId === theme.id ? <small>{bt("저장됨", "Saved")}</small> : null}
          </button>
        ))}
      </div>
      <div className="virtual-three-theme-picker__status" role="status" aria-live="polite" aria-atomic="true">
        {!hydrated ? bt("저장한 테마를 읽는 중…", "Reading your saved theme…") : null}
        {hydrated && preview.status === "loading"
          ? <>{bt("새 공간을 준비하는 중…", "Preparing the new space…")}{preview.total > 0 ? ` ${preview.loaded}/${preview.total}` : ""}</> : null}
        {hydrated && preview.status === "ready" && shown
          ? <>{bt("현재 보기:", "Showing:")} {bt(shown.copy.ko.name, shown.copy.en.name)}</> : null}
      </div>
      {preview.status === "error" ? <div className="virtual-three-theme-picker__error" role="alert">
        <p>{bt("테마를 준비하지 못했습니다. 이전 공간은 그대로 유지됩니다.", "The theme could not be prepared. Your previous space is still available.")}</p>
        <button type="button" disabled={!hydrated} onKeyDown={stopStudioWorldKeyPropagation} onKeyUp={stopStudioWorldKeyPropagation}
          onClick={onRetry}>{bt("다시 시도", "Try again")}</button>
      </div> : null}
      {notice ? <div className="virtual-three-theme-picker__error" role="alert">
        <p>{bt(notice.ko, notice.en)}</p>
        <button type="button" disabled={!hydrated} onKeyDown={stopStudioWorldKeyPropagation} onKeyUp={stopStudioWorldKeyPropagation}
          onClick={onDismissNotice}>{bt("알림 닫기", "Dismiss")}</button>
      </div> : null}
      <div className="virtual-three-theme-picker__actions">
        <button type="button" disabled={!readyToSave || (!unsaved && !retrySave)}
          onKeyDown={stopStudioWorldKeyPropagation} onKeyUp={stopStudioWorldKeyPropagation} onClick={() => onApply(shownThemeId)}>
          {retrySave ? bt("저장 다시 시도", "Retry saving") : bt("이 테마 저장", "Save this theme")}
        </button>
        <button type="button" disabled={!hydrated || savedThemeId === null || requestedThemeId === savedThemeId}
          onKeyDown={stopStudioWorldKeyPropagation} onKeyUp={stopStudioWorldKeyPropagation} onClick={onRevert}>
          {bt("저장한 테마로 돌아가기", "Return to saved theme")}
        </button>
      </div>
    </fieldset>
  );
}
