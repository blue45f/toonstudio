import { ArrowRight, Info } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

/**
 * 협업 제작 표면 역할 정본 (pipeline 후보 9) — "제작"이라는 이름의 협업
 * 표면이 둘이라 생기는 혼동을 각 표면 상단에서 바로 푼다.
 *
 * - hub    = 제작 허브 (진입 /production, 프로젝트 페이지는
 *   /production/projects/:projectId/*): **프로젝트 제작 운영의 정본
 *   (canonical)**. 공정 보드·일정·인계·검수·역할을 프로젝트 단위로
 *   끝내는 화면 (production-hub/ProductionHubPage의 ProductionProjectPage).
 * - studio = 스튜디오 제작 (/studio/projects 등 /studio/* 제작 표면):
 *   **에디터 곁 협업 뷰**. 편집 중인 작품 하나의 작업·검토·버전·발표·
 *   공유를 에디터를 오가며 다루는 화면
 *   (studio-production/StudioProductionHubPageV2).
 *
 * 장기 수렴 방향: 역할·공정 보드의 진입은 스튜디오 제작 쪽에서 떼어
 * 정본인 제작 허브로 모아 간다. 스튜디오 제작은 에디터와 붙어 있어야
 * 의미가 있는 검토·버전·공유만 남긴다. 그 전까지 두 표면은 서로를
 * 대체하지 않으며, 각 표면 상단에 자기 역할 한 줄과 상대 표면으로
 * 가는 링크를 함께 둔다. 역할·정본 여부·상호 링크의 단일 출처는
 * 아래 PRODUCTION_SURFACE_ROLES다. 새 협업 제작 표면이 생기면
 * 여기에 variant를 더한다.
 */
export type ProductionSurfaceId = "hub" | "studio";

export interface ProductionSurfaceRole {
  /** 이 표면의 진입 경로. */
  href: string;
  /** 프로젝트 제작 운영 정본 여부. 정본은 협업 제작 군집에서 hub 하나뿐이다. */
  canonical: boolean;
  /** 서로를 가리키는 상호 링크의 도착 표면. */
  counterpart: ProductionSurfaceId;
}

export const PRODUCTION_SURFACE_ROLES: Readonly<Record<ProductionSurfaceId, ProductionSurfaceRole>> = {
  hub: { href: "/production", canonical: true, counterpart: "studio" },
  studio: { href: "/studio/projects", canonical: false, counterpart: "hub" },
};

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
