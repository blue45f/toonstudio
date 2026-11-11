import { ArrowRight, Info } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { PUBLISH_SURFACE_ROLES, type PublishSurfaceId } from "./publish-surface-roles";

export type { PublishSurfaceId, PublishSurfaceRole } from "./publish-surface-roles";

/**
 * 게시 표면 상단에 자기 역할 한 줄과 상대 표면 링크를 보여 준다.
 * 역할·정본 여부·상호 링크의 단일 출처는 publish-surface-roles.ts 다.
 */
export function PublishSurfaceGuide({ surface }: { surface: PublishSurfaceId }) {
  const bt = useBilingual("PublishSurfaceGuide");
  const isStudio = surface === "studio";
  const counterpartHref = PUBLISH_SURFACE_ROLES[PUBLISH_SURFACE_ROLES[surface].counterpart].href;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg-2">
      <Info size={15} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
        {isStudio
          ? bt("회차 게시", "Episode publishing")
          : bt("게시 정보 준비", "Publishing information")}
      </span>
      <p className="min-w-0 flex-1 leading-relaxed">
        {isStudio
          ? bt(
              "선택한 회차를 검토하고 게시 설정을 확인합니다. 실제 게시·예약 결과는 이 화면에서 확인하세요.",
              "Review the selected episode and its publishing settings. Check the actual publication or schedule result here.",
            )
          : bt(
              "선택한 작품의 게시 정보 파일(JSON)과 피드 미리보기를 준비합니다. 외부 게시나 예약은 실행하지 않습니다.",
              "Prepare a publication information JSON file and feed preview for the selected work. This does not publish externally or execute a schedule.",
            )}
      </p>
      <Link
        href={counterpartHref}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold text-accent hover:underline"
      >
        {isStudio
          ? bt("게시 정보·피드 준비 열기", "Prepare publication information and feeds")
          : bt("회차 게시 설정 열기", "Open episode publishing settings")}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}
