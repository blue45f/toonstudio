import { ArrowRight, Info } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

/**
 * 게시 표면 안내 — "게시"라는 이름의 화면이 둘이라 생기는 혼동을 이름 옆에서 바로 푼다.
 *
 * - studio  = /studio/publish 게시 명령 센터: 작품 한 편의 검수·내보내기·게시.
 * - serial  = /publish 연재 센터: 여러 작품의 연재 현황과 외부 채널 배포 패키지.
 *
 * 두 화면은 서로를 대체하지 않는다. 각 화면 상단에 자기가 무엇인지 한 줄로 말하고
 * 다른 화면으로 가는 길을 함께 둔다. 새 게시 표면이 생기면 여기에 variant를 더한다.
 */
export function PublishSurfaceGuide({ surface }: { surface: "studio" | "serial" }) {
  const bt = useBilingual("PublishSurfaceGuide");
  const isStudio = surface === "studio";
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg-2">
      <Info size={15} className="shrink-0 text-accent" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-relaxed">
        {isStudio
          ? bt(
              "여기는 작품 한 편의 검수·내보내기·게시를 끝내는 화면입니다.",
              "This is where you review, export and publish one work.",
            )
          : bt(
              "여기는 여러 작품의 연재 현황과 외부 채널 배포 패키지를 준비하는 화면입니다.",
              "This is where you check serialization across works and prepare external channel packages.",
            )}
      </p>
      <Link
        href={isStudio ? "/publish" : "/studio/publish"}
        className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline"
      >
        {isStudio
          ? bt("여러 작품 관리는 연재 센터에서", "For all your works, open the Serialization center")
          : bt("작품 한 편의 게시는 게시 명령 센터에서", "To publish one work, open the Publish command center")}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}
