// 협업 제작 표면 역할 데이터 — production-surface-guide.tsx(컴포넌트 파일)에서 분리한 순수 모듈.
// 컴포넌트 파일이 컴포넌트만 내보내야 Fast Refresh 가 동작한다(react-refresh/only-export-components).

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
