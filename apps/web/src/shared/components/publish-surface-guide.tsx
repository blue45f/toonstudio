import { ArrowRight, Info } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

/**
 * 게시 표면 역할 정본 (BLUEPRINT §1.2, S1-6) — "게시"라는 이름의 화면이 둘이라
 * 생기는 혼동을 이름 옆에서 바로 푼다.
 *
 * - studio  = /studio/publish 게시 명령 센터: **회차 게시의 정본(canonical)**.
 *   작품 한 편의 검수·내보내기·게시를 끝내는 화면.
 * - serial  = /publish 연재 센터: **작품 단위 연재 운영 뷰**. 여러 작품의 연재
 *   현황과 외부 채널 배포 패키지를 보는 화면이며, 회차 게시 자체는 하지 않는다.
 *
 * 두 화면은 서로를 대체하지 않는다. 각 화면 상단에 자기 역할 한 줄과 상대
 * 화면으로 가는 링크를 함께 둔다. 역할·정본 여부·상호 링크의 단일 출처는
 * 아래 PUBLISH_SURFACE_ROLES이며, 라우트 권위(site-route-authority)의
 * 두 게시 항목 설명도 같은 선언을 따른다. 새 게시 표면이 생기면 여기에
 * variant를 더한다.
 */
export type PublishSurfaceId = "studio" | "serial";

export interface PublishSurfaceRole {
  /** 이 표면 자신의 경로. */
  href: string;
  /** 회차 게시 정본 여부. 정본은 게시 군집에서 studio 하나뿐이다. */
  canonical: boolean;
  /** 서로를 가리키는 상호 링크의 도착 표면. */
  counterpart: PublishSurfaceId;
}

export const PUBLISH_SURFACE_ROLES: Readonly<Record<PublishSurfaceId, PublishSurfaceRole>> = {
  studio: { href: "/studio/publish", canonical: true, counterpart: "serial" },
  serial: { href: "/publish", canonical: false, counterpart: "studio" },
};

export function PublishSurfaceGuide({ surface }: { surface: PublishSurfaceId }) {
  const bt = useBilingual("PublishSurfaceGuide");
  const isStudio = surface === "studio";
  const counterpartHref = PUBLISH_SURFACE_ROLES[PUBLISH_SURFACE_ROLES[surface].counterpart].href;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg-2">
      <Info size={15} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
        {isStudio
          ? bt("정본 · 회차 게시", "Canonical · Episode publishing")
          : bt("연재 운영", "Serialization operations")}
      </span>
      <p className="min-w-0 flex-1 leading-relaxed">
        {isStudio
          ? bt(
              "회차 게시는 여기가 정본입니다. 작품 한 편의 검수·내보내기·게시를 끝내는 화면입니다.",
              "This is the canonical place to publish an episode — review, export and publish one work here.",
            )
          : bt(
              "여기는 작품 단위 연재 운영 뷰입니다. 여러 작품의 연재 현황과 외부 채널 배포 패키지를 준비하는 화면입니다.",
              "This is the per-work serialization operations view — check serialization across works and prepare external channel packages here.",
            )}
      </p>
      <Link
        href={counterpartHref}
        className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline"
      >
        {isStudio
          ? bt("연재 운영은 연재 센터에서", "For serialization operations, open the Serialization center")
          : bt("회차 게시는 정본인 게시 명령 센터에서", "To publish an episode, use the canonical Publish command center")}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}
