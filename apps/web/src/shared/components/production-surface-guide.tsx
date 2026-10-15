import { ArrowRight, Info } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { PRODUCTION_SURFACE_ROLES, type ProductionSurfaceId } from "./production-surface-roles";

export type { ProductionSurfaceId, ProductionSurfaceRole } from "./production-surface-roles";

/**
 * 협업 제작 표면 상단에 자기 역할 한 줄과 상대 표면 링크를 보여 준다.
 * 역할·정본 여부·상호 링크의 단일 출처는 production-surface-roles.ts 다.
 */
export function ProductionSurfaceGuide({ surface }: { surface: ProductionSurfaceId }) {
  const bt = useBilingual("ProductionSurfaceGuide");
  const isHub = surface === "hub";
  const counterpartHref = PRODUCTION_SURFACE_ROLES[PRODUCTION_SURFACE_ROLES[surface].counterpart].href;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg-2">
      <Info size={15} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
        {isHub
          ? bt("정본 · 제작 운영", "Canonical · Production operations")
          : bt("에디터 협업", "Editor-side collaboration")}
      </span>
      <p className="min-w-0 flex-1 leading-relaxed">
        {isHub
          ? bt(
              "프로젝트 제작 운영은 여기가 정본입니다. 공정 보드·일정·인계·검수를 프로젝트 단위로 끝내는 화면입니다.",
              "This is the canonical home of project production operations — process board, schedule, handoffs and reviews, per project.",
            )
          : bt(
              "여기는 편집 중인 작품의 작업·검토·버전·공유를 다루는 화면입니다. 역할·공정 보드 진입은 장기적으로 제작 허브로 모아 갑니다.",
              "This is where you handle tasks, reviews, versions and sharing for the work you are editing. Role and process-board entry points will converge into the Production hub over time.",
            )}
      </p>
      <Link
        href={counterpartHref}
        className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline"
      >
        {isHub
          ? bt("에디터 곁 검토·버전·공유는 스튜디오 제작에서", "For editor-side reviews, versions and sharing, open Studio production")
          : bt("프로젝트 제작 운영은 정본인 제작 허브에서", "For project production operations, open the canonical Production hub")}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}
