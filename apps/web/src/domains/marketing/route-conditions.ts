import { resolveSiteRouteMetadata } from "@/shared/lib/site-route-metadata";

export type RouteConditionKey = "beta" | "experimental" | "sign-in" | "project" | "desktop";

/**
 * 링크 목적지의 사용 조건. 문구를 따로 적지 않고 사이트 라우트 메타데이터(성숙도·접근·기기)를 그대로 읽는다.
 * /sitemap 의 조건 배지와 같은 기준(베타·실험·로그인·프로젝트·데스크톱)이라 화면 사이에 어긋나지 않는다.
 * 컴포넌트 파일에는 컴포넌트만 내보내야 하므로(react-refresh) 판정 함수는 이 파일에 둔다.
 */
export function routeConditionsFor(href: string): readonly RouteConditionKey[] {
  const metadata = resolveSiteRouteMetadata(href);
  const conditions: RouteConditionKey[] = [];
  if (metadata.maturity === "beta") conditions.push("beta");
  if (metadata.maturity === "experimental") conditions.push("experimental");
  if (metadata.access === "sign-in") conditions.push("sign-in");
  if (metadata.access === "project") conditions.push("project");
  if (metadata.device === "desktop-first") conditions.push("desktop");
  return conditions;
}
