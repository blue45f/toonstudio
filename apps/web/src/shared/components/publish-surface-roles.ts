// 게시 표면 역할 데이터 — publish-surface-guide.tsx(컴포넌트 파일)에서 분리한 순수 모듈.
// 컴포넌트 파일이 컴포넌트만 내보내야 Fast Refresh 가 동작한다(react-refresh/only-export-components).

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
