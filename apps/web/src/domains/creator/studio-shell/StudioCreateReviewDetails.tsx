import type { ComponentProps } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioProjectFormatProfile } from "../studio-project-format-catalog";
import { StudioCreateReturnToStart } from "./StudioCreateLaunchSummary";
import { StudioModeWorkspacePreview } from "./StudioModeWorkspacePreview";
import { StudioProjectFormatPreview } from "./StudioProjectFormatPreview";

interface StudioCreateReviewDetailsProps {
  readonly format: StudioProjectFormatProfile | null;
  readonly workspace: ComponentProps<typeof StudioModeWorkspacePreview>["profile"];
  readonly locale: "ko" | "en";
  readonly pageCount: number;
}

/** 미리보기는 시작의 필수 단계가 아니다. 전문 도구 설명은 원하는 때 펼쳐 본다. */
export function StudioCreateReviewDetails({
  format, workspace, locale, pageCount,
}: StudioCreateReviewDetailsProps) {
  const bt = useBilingual("StudioCreateReviewDetails");
  return (
    <details
      data-studio-create-preview="true"
      className="mt-4 min-w-0 rounded-3xl border border-line bg-card p-4 sm:p-5"
    >
      <summary className="min-h-12 cursor-pointer content-center rounded-xl text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {bt("작업실·출력 미리보기 (선택)", "Preview the workspace and outputs (optional)")}
        <span className="mt-1 block text-xs font-normal leading-5 text-fg-2">
          {bt("열릴 화면과 완성할 파일을 자세히 확인할 수 있어요.", "See the workspace that will open and its output formats.")}
        </span>
      </summary>
      <div className="mt-4 min-w-0 space-y-4">
        {format ? <StudioProjectFormatPreview profile={format} locale={locale} /> : null}
        <StudioModeWorkspacePreview profile={workspace} locale={locale} />
        {format ? (
          <p className="rounded-xl border border-line bg-panel/45 p-4 text-sm leading-6 text-fg-2">
            {bt(
              `${pageCount}개 초기 페이지 · ${format.keyToolsKo.join(" · ")}`,
              `${pageCount} initial page${pageCount === 1 ? "" : "s"} · ${format.keyToolsEn.join(" · ")}`,
            )}
          </p>
        ) : null}
        <StudioCreateReturnToStart />
      </div>
    </details>
  );
}
