import { Link2, Unlink2 } from "lucide-react";
import { useId, useState } from "react";

import type { FormEvent } from "react";

import { useT } from "@/shared/lib/i18n";

import { FOCUS_RING, NOTICE_TEXT, cx } from "./studio-bg3d-asset-panel-styles";
import { describeStudioBg3dOrganizationFailure } from "./studio-bg3d-organization-feedback";

import type {
  StudioBg3dOrganizationController,
  StudioBg3dOrganizationResult,
} from "./studio-bg3d-organization-controller";

interface StudioBg3dOutlinerComponentSectionProps {
  readonly organization: StudioBg3dOrganizationController;
  /** 선택한 오브젝트(장면에 있는 것만). */
  readonly selectedEntityIds: readonly string[];
}

interface ComponentFeedback {
  readonly tone: "ok" | "error";
  readonly message: string;
}

const INPUT_CLASS = cx(
  "min-h-11 w-full min-w-0 rounded-lg border border-line bg-card px-2.5 text-xs font-medium text-fg",
  "placeholder:text-fg-3 focus-visible:border-accent sm:min-h-9",
  FOCUS_RING,
);
const BUTTON_CLASS = cx(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-line bg-card",
  "px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg",
  "disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9",
  FOCUS_RING,
);

/**
 * 선택한 오브젝트를 이름 붙은 컴포넌트로 묶거나 푼다. 같은 컴포넌트에 속한 인스턴스는 "컴포넌트" 보기에서 한 묶음으로 접고 펼친다.
 * SketchUp 의 컴포넌트 정의·인스턴스 동기 편집을 흉내 내지 않는다 — 묶음은 이름으로 모으는 표시일 뿐 모양을 공유하지 않는다.
 */
export function StudioBg3dOutlinerComponentSection({
  organization,
  selectedEntityIds,
}: StudioBg3dOutlinerComponentSectionProps) {
  const t = useT();
  const [name, setName] = useState("");
  const [feedback, setFeedback] = useState<ComponentFeedback | null>(null);
  const headingId = useId();
  const inputId = useId();
  const hasSelection = selectedEntityIds.length > 0;
  const selectedInComponent = selectedEntityIds.some((id) => organization.view.componentIdByEntityId.has(id));

  const report = (result: StudioBg3dOrganizationResult, okKey: string, okFallback: string) => {
    if (result.ok) {
      setFeedback({ tone: "ok", message: t(okKey, okFallback) });
      return;
    }
    const copy = describeStudioBg3dOrganizationFailure(result.reason, "name");
    setFeedback({ tone: result.reason === "unchanged" ? "ok" : "error", message: t(copy.key, copy.fallback) });
  };

  const group = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasSelection) {
      setFeedback({
        tone: "error",
        message: t("studio.bg3dScene.components.needSelection", "먼저 묶을 오브젝트를 하나 이상 골라 주세요."),
      });
      return;
    }
    const result = organization.groupComponent(selectedEntityIds, name);
    report(result, "studio.bg3dScene.status.grouped", "컴포넌트로 묶었어요.");
    if (result.ok) setName("");
  };

  return (
    <section aria-labelledby={headingId} className="space-y-2" data-studio-bg3d-component-section="">
      <h4 id={headingId} className="text-xs font-bold text-fg-2">
        {t("studio.bg3dScene.components.heading", "컴포넌트")}
      </h4>
      <p className={NOTICE_TEXT}>
        {t(
          "studio.bg3dScene.components.help",
          "같은 컴포넌트에 속한 오브젝트는 위쪽 '컴포넌트' 보기에서 한 묶음으로 접고 펼칠 수 있어요. 묶어도 모양이나 위치는 서로 따라가지 않아요.",
        )}
      </p>
      <form onSubmit={group} className="space-y-1.5">
        <label htmlFor={inputId} className="block text-xs font-semibold text-fg-2">
          {t("studio.bg3dScene.components.nameLabel", "묶음 이름")}
        </label>
        <div className="flex gap-1.5">
          <input
            id={inputId}
            type="text"
            value={name}
            maxLength={96}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("studio.bg3dScene.components.namePlaceholder", "예: 교실 책상 세트")}
            className={INPUT_CLASS}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className={BUTTON_CLASS}>
            <Link2 size={13} aria-hidden />
            {t("studio.bg3dScene.components.groupButton", "묶기")}
          </button>
        </div>
      </form>
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={!selectedInComponent}
        onClick={() =>
          report(organization.ungroupComponent(selectedEntityIds), "studio.bg3dScene.status.ungrouped", "묶음을 풀었어요.")
        }
      >
        <Unlink2 size={13} aria-hidden />
        {t("studio.bg3dScene.components.ungroupButton", "선택한 오브젝트 묶음 풀기")}
      </button>
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
