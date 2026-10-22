import { Eye, EyeOff, Plus, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import type { FormEvent } from "react";

import { useT } from "@/shared/lib/i18n";

import { describeStudioBg3dOrganizationFailure } from "./studio-bg3d-organization-feedback";
import {
  CHIP_BASE,
  CHIP_OFF,
  CHIP_ON,
  FOCUS_RING,
  NOTICE_TEXT,
  cx,
} from "./studio-bg3d-asset-panel-styles";

import type {
  StudioBg3dOrganizationController,
  StudioBg3dOrganizationResult,
} from "./studio-bg3d-organization-controller";

interface StudioBg3dOutlinerTagSectionProps {
  readonly organization: StudioBg3dOrganizationController;
  /** 선택한 오브젝트(장면에 있는 것만). */
  readonly selectedEntityIds: readonly string[];
}

interface TagFeedback {
  readonly tone: "ok" | "error";
  readonly message: string;
}

const INPUT_CLASS = cx(
  "min-h-11 w-full min-w-0 rounded-lg border border-line bg-card px-2.5 text-xs font-medium text-fg",
  "placeholder:text-fg-3 focus-visible:border-accent sm:min-h-9",
  FOCUS_RING,
);
const SUBMIT_CLASS = cx(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-accent/55 bg-accent-soft",
  "px-3 text-xs font-bold text-accent transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9",
  FOCUS_RING,
);

/**
 * 장면 태그 목록(숨기기·구성원 선택)과 선택한 오브젝트의 태그 붙이기·떼기.
 * 태그 숨김은 오브젝트의 숨김 상태와 따로 움직인다: 숨긴 태그가 붙은 오브젝트만 보기에서 빠지고 저장된 숨김 값은 그대로다.
 */
export function StudioBg3dOutlinerTagSection({ organization, selectedEntityIds }: StudioBg3dOutlinerTagSectionProps) {
  const t = useT();
  const { view } = organization;
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<TagFeedback | null>(null);
  const headingId = useId();
  const inputId = useId();
  const datalistId = useId();

  // 선택한 오브젝트가 가진 태그와 그 태그를 가진 선택 오브젝트 수.
  const selectedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of selectedEntityIds) {
      for (const tag of view.tagsByEntityId.get(id) ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  }, [selectedEntityIds, view.tagsByEntityId]);

  const hasSelection = selectedEntityIds.length > 0;

  const report = (result: StudioBg3dOrganizationResult, okKey: string, okFallback: string) => {
    if (result.ok) {
      setFeedback({ tone: "ok", message: t(okKey, okFallback) });
      return;
    }
    const copy = describeStudioBg3dOrganizationFailure(result.reason, "tag");
    setFeedback({ tone: result.reason === "unchanged" ? "ok" : "error", message: t(copy.key, copy.fallback) });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasSelection) {
      setFeedback({
        tone: "error",
        message: t("studio.bg3dScene.tags.needSelection", "먼저 태그를 붙일 오브젝트를 하나 이상 골라 주세요."),
      });
      return;
    }
    const result = organization.addTag(selectedEntityIds, draft);
    report(result, "studio.bg3dScene.status.tagAdded", "태그를 붙였어요.");
    if (result.ok) setDraft("");
  };

  const removeTag = (tag: string) => {
    report(organization.removeTag(selectedEntityIds, tag), "studio.bg3dScene.status.tagRemoved", "태그를 뗐어요.");
    // 누른 칩이 사라지므로 포커스가 문서 처음으로 날아가지 않게 입력칸으로 옮긴다.
    inputRef.current?.focus();
  };

  const toggleVisibility = (tag: string, hidden: boolean) => {
    report(
      organization.toggleTagVisibility(tag),
      hidden ? "studio.bg3dScene.status.tagShown" : "studio.bg3dScene.status.tagHiddenDone",
      hidden ? "태그를 다시 보여요." : "태그를 숨겼어요.",
    );
  };

  return (
    <section aria-labelledby={headingId} className="space-y-2" data-studio-bg3d-tag-section="">
      <h4 id={headingId} className="text-xs font-bold text-fg-2">
        {t("studio.bg3dScene.tags.heading", "태그")}
      </h4>

      {view.tags.length === 0 ? (
        <p className={cx(NOTICE_TEXT, "rounded-lg border border-dashed border-line px-3 py-2")}>
          {t("studio.bg3dScene.tags.empty", "아직 태그가 없어요. 오브젝트를 고른 뒤 태그를 붙이면 이곳에 모여요.")}
        </p>
      ) : (
        <ul aria-label={t("studio.bg3dScene.tags.listLabel", "장면 태그 목록")} className="flex flex-wrap gap-1.5">
          {view.tags.map((entry) => (
            <li key={entry.tag} className="flex items-stretch">
              <button
                type="button"
                className={cx(CHIP_BASE, "rounded-r-none border-r-0", entry.hidden ? CHIP_OFF : CHIP_ON)}
                aria-label={
                  entry.hidden
                    ? t("studio.bg3dScene.tags.show", { tag: entry.tag }, "{tag} 태그 보이기")
                    : t("studio.bg3dScene.tags.hide", { tag: entry.tag }, "{tag} 태그 숨기기")
                }
                title={entry.hidden ? t("studio.bg3dScene.tags.showTitle", "태그 보이기") : t("studio.bg3dScene.tags.hideTitle", "태그 숨기기")}
                onClick={() => toggleVisibility(entry.tag, entry.hidden)}
              >
                {entry.hidden ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
              </button>
              <button
                type="button"
                className={cx(CHIP_BASE, "rounded-l-none", entry.hidden ? CHIP_OFF : CHIP_ON)}
                aria-label={t("studio.bg3dScene.tags.select", { tag: entry.tag, count: entry.count }, "{tag} 태그 오브젝트 {count}개 선택")}
                onClick={() => organization.selectEntities(entry.memberIds)}
              >
                <span className="max-w-[10rem] truncate">{entry.tag}</span>
                <span aria-hidden className="tabular-nums opacity-80">{entry.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {view.tags.length > 0 ? (
        <p className={NOTICE_TEXT}>
          {t(
            "studio.bg3dScene.tags.hiddenNote",
            "숨긴 태그는 보기와 출력에서만 빠져요. 오브젝트 자체의 숨김 상태는 바뀌지 않아요.",
          )}
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-1.5">
        <label htmlFor={inputId} className="block text-xs font-semibold text-fg-2">
          {t("studio.bg3dScene.tags.addLabel", "선택한 오브젝트에 붙일 태그")}
        </label>
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={draft}
            maxLength={64}
            list={datalistId}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("studio.bg3dScene.tags.addPlaceholder", "예: 교실, 소품")}
            className={INPUT_CLASS}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className={SUBMIT_CLASS}>
            <Plus size={13} aria-hidden />
            {t("studio.bg3dScene.tags.addButton", "붙이기")}
          </button>
        </div>
        <datalist id={datalistId}>
          {view.tags.map((entry) => (
            <option key={entry.tag} value={entry.tag} />
          ))}
        </datalist>
      </form>

      {hasSelection ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-fg-2">
            {t("studio.bg3dScene.tags.selectedHeading", { count: selectedEntityIds.length }, "선택한 오브젝트 {count}개의 태그")}
          </p>
          {selectedTags.length === 0 ? (
            <p className={NOTICE_TEXT}>{t("studio.bg3dScene.tags.selectedEmpty", "선택한 오브젝트에는 태그가 없어요.")}</p>
          ) : (
            <ul aria-label={t("studio.bg3dScene.tags.selectedListLabel", "선택한 오브젝트의 태그")} className="flex flex-wrap gap-1.5">
              {selectedTags.map(([tag, count]) => (
                <li key={tag}>
                  <button
                    type="button"
                    className={cx(CHIP_BASE, CHIP_OFF)}
                    aria-label={t("studio.bg3dScene.tags.remove", { tag }, "{tag} 태그 떼기")}
                    title={t("studio.bg3dScene.tags.removeTitle", "이 태그 떼기")}
                    onClick={() => removeTag(tag)}
                  >
                    <span className="max-w-[10rem] truncate">{tag}</span>
                    {selectedEntityIds.length > 1 ? (
                      <span aria-hidden className="tabular-nums opacity-80">{count}/{selectedEntityIds.length}</span>
                    ) : null}
                    <X size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <p
        role={feedback?.tone === "error" ? "alert" : "status"}
        className={cx(
          feedback ? NOTICE_TEXT : "sr-only",
          feedback?.tone === "error" && "font-semibold text-accent",
        )}
      >
        {feedback?.message ?? ""}
      </p>
    </section>
  );
}
