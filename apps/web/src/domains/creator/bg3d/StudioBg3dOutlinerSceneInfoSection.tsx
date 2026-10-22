import { useEffect, useId, useRef, useState } from "react";

import type { FormEvent } from "react";

import { useT } from "@/shared/lib/i18n";

import { FOCUS_RING, NOTICE_TEXT, cx } from "./studio-bg3d-asset-panel-styles";
import { describeStudioBg3dOrganizationFailure } from "./studio-bg3d-organization-feedback";

import type { StudioBg3dOrganizationController } from "./studio-bg3d-organization-controller";

interface StudioBg3dOutlinerSceneInfoSectionProps {
  readonly organization: StudioBg3dOrganizationController;
  /** 메모 입력 초안. SKP 장면 이름 후보가 이 초안에 줄을 더하므로 위쪽 패널이 쥐고 있다. */
  readonly memoDraft: string;
  readonly onMemoDraftChange: (memo: string) => void;
}

interface SceneInfoFeedback {
  readonly tone: "ok" | "error";
  readonly message: string;
}

const FIELD_CLASS = cx(
  "w-full min-w-0 rounded-lg border border-line bg-card px-2.5 text-xs font-medium text-fg",
  "placeholder:text-fg-3 focus-visible:border-accent",
  FOCUS_RING,
);
const SAVE_CLASS = cx(
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-accent/55 bg-accent-soft px-3",
  "text-xs font-bold text-accent transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9",
  FOCUS_RING,
);

/**
 * 장면 이름과 메모. 저장한 값은 장면 문서의 meta 에 들어가 저장·복원·공유·컷 버전에 함께 실린다.
 * 입력 중에는 아무것도 커밋하지 않고, "저장"을 눌렀을 때 바뀐 칸만 한 번의 실행 취소 단위로 반영한다.
 */
export function StudioBg3dOutlinerSceneInfoSection({
  organization,
  memoDraft,
  onMemoDraftChange,
}: StudioBg3dOutlinerSceneInfoSectionProps) {
  const t = useT();
  const savedName = organization.view.meta.name;
  const savedMemo = organization.view.meta.memo;
  const [nameDraft, setNameDraft] = useState(savedName);
  const [feedback, setFeedback] = useState<SceneInfoFeedback | null>(null);
  const previousSavedName = useRef(savedName);
  const headingId = useId();
  const nameId = useId();
  const memoId = useId();

  // 되돌리기·다시 하기·협업으로 저장된 이름이 바뀌면, 사용자가 손대지 않은 초안만 따라간다.
  useEffect(() => {
    const previous = previousSavedName.current;
    previousSavedName.current = savedName;
    setNameDraft((current) => (current === previous ? savedName : current));
  }, [savedName]);

  const dirty = nameDraft !== savedName || memoDraft !== savedMemo;

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const changes = {
      ...(nameDraft !== savedName ? { name: nameDraft } : {}),
      ...(memoDraft !== savedMemo ? { memo: memoDraft } : {}),
    };
    if (Object.keys(changes).length === 0) {
      setFeedback({ tone: "ok", message: t("studio.bg3dScene.status.unchanged", "바뀐 내용이 없어요.") });
      return;
    }
    const result = organization.setSceneMeta(changes);
    if (result.ok) {
      setFeedback({ tone: "ok", message: t("studio.bg3dScene.status.sceneSaved", "장면 정보를 저장했어요.") });
      return;
    }
    const copy = describeStudioBg3dOrganizationFailure(result.reason, "meta");
    setFeedback({ tone: result.reason === "unchanged" ? "ok" : "error", message: t(copy.key, copy.fallback) });
  };

  return (
    <section aria-labelledby={headingId} className="space-y-2" data-studio-bg3d-scene-info="">
      <h4 id={headingId} className="text-xs font-bold text-fg-2">
        {t("studio.bg3dScene.scene.heading", "장면 정보")}
      </h4>
      <form onSubmit={save} className="space-y-2">
        <div>
          <label htmlFor={nameId} className="block text-xs font-semibold text-fg-2">
            {t("studio.bg3dScene.scene.nameLabel", "장면 이름")}
          </label>
          <input
            id={nameId}
            type="text"
            value={nameDraft}
            maxLength={160}
            autoComplete="off"
            placeholder={t("studio.bg3dScene.scene.namePlaceholder", "예: 교실 낮")}
            className={cx(FIELD_CLASS, "mt-1 min-h-11 sm:min-h-9")}
            onChange={(event) => setNameDraft(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor={memoId} className="block text-xs font-semibold text-fg-2">
            {t("studio.bg3dScene.scene.memoLabel", "장면 메모")}
          </label>
          <textarea
            id={memoId}
            value={memoDraft}
            maxLength={1200}
            rows={4}
            placeholder={t("studio.bg3dScene.scene.memoPlaceholder", "예: 창가 책상은 오전 조명 기준")}
            className={cx(FIELD_CLASS, "mt-1 min-h-24 resize-y py-2 leading-relaxed")}
            onChange={(event) => onMemoDraftChange(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={SAVE_CLASS} disabled={!dirty}>
            {t("studio.bg3dScene.scene.save", "장면 정보 저장")}
          </button>
          {dirty ? (
            <span className={NOTICE_TEXT}>{t("studio.bg3dScene.scene.dirty", "저장하지 않은 변경이 있어요.")}</span>
          ) : null}
        </div>
      </form>
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
