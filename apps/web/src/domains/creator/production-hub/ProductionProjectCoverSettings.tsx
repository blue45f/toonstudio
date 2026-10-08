import { useEffect, useState } from "react";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type { ProductionClientCommand } from "./production-api";
import { ProductionSectionCard } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type ExecuteCommand = (command: ProductionClientCommand, message: string) => Promise<void>;

function isCoverImageUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("data:image/");
}

/**
 * 프로젝트 대표 표지 설정.
 *
 * 표지의 정본은 aggregate의 명시 필드(coverImageUrl)다 — 생성 시 연결된 작품의
 * 표지(creator_work.cover)로 시드되고, 이후 변경은 set-project-cover 명령으로만 일어난다.
 * 표지가 없으면 헤더는 이미지를 지어내지 않고 제목 이니셜 타일(폴백)을 보여준다.
 */
export function ProductionProjectCoverSettings({
  aggregate,
  execute,
  canEdit,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute?: ExecuteCommand;
  readonly canEdit: boolean;
}) {
  const bt = useBilingual("ProductionProjectCoverSettings");
  const current = aggregate.coverImageUrl ?? null;
  const [draft, setDraft] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(current ?? "");
    setError(null);
  }, [current]);

  const editable = Boolean(canEdit && execute);
  const trimmed = draft.trim();
  const dirty = trimmed !== (current ?? "");

  const save = async (value: string | null) => {
    if (!execute) return;
    setSaving(true);
    setError(null);
    try {
      await execute(
        { type: "set-project-cover", coverImageUrl: value },
        value
          ? bt("프로젝트 표지를 저장했습니다.", "Project cover saved.")
          : bt("프로젝트 표지를 지웠습니다.", "Project cover removed."),
      );
    } catch {
      setError(bt("표지를 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", "Could not save the cover. Please try again in a moment."));
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => {
    if (trimmed && !isCoverImageUrl(trimmed)) {
      setError(bt("표지는 https:// 로 시작하는 주소나 data:image/ 데이터여야 합니다.", "The cover must be an https:// URL or a data:image/ value."));
      return;
    }
    void save(trimmed ? trimmed : null);
  };

  return (
    <ProductionSectionCard
      title={bt("프로젝트 표지", "Project cover")}
      description={bt(
        "모든 제작 화면 상단에 표시되는 대표 이미지입니다. 연결된 작품의 표지가 기본값이며, 여기서 지정한 값이 우선합니다.",
        "The representative image shown at the top of every production surface. The linked work's cover is the default; a value set here takes precedence.",
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        {current ? (
          <img src={current} alt="" className="h-28 w-[5.25rem] shrink-0 rounded-xl border border-line object-cover" loading="lazy" />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-28 w-[5.25rem] shrink-0 items-center justify-center rounded-xl border border-dashed border-line bg-panel text-2xl font-black text-fg-3"
          >
            {aggregate.title.trim().charAt(0) || "?"}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          {current ? (
            <p className="truncate text-xs text-fg-3" title={current}>{current}</p>
          ) : (
            <p className="text-xs text-fg-3">
              {bt("아직 지정한 표지가 없어요. 헤더에는 제목 이니셜 타일로 표시됩니다.", "No cover set yet. The header shows a title-initial tile instead.")}
            </p>
          )}
          {editable ? (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-fg-2">{bt("표지 이미지 주소", "Cover image URL")}</span>
                <input
                  className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="https://… 또는 data:image/…"
                  inputMode="url"
                />
              </label>
              {error ? (
                <p className="text-xs font-semibold text-bad" role="alert">{error}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11" })}
                  disabled={!dirty || saving}
                  onClick={onSave}
                >
                  {bt("표지 저장", "Save cover")}
                </button>
                {current ? (
                  <button
                    type="button"
                    className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                    disabled={saving}
                    onClick={() => void save(null)}
                  >
                    {bt("표지 지우기", "Remove cover")}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </ProductionSectionCard>
  );
}
