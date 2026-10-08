import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { type RouteConditionKey, routeConditionsFor } from "./route-conditions";

/** 사용 조건이 없으면(안정·공개·반응형) 아무것도 그리지 않는다. 색이 아닌 글자로 조건을 알린다. 판정 기준은 route-conditions.ts. */
export function RouteConditionBadges({ href, className }: { readonly href: string; readonly className?: string }) {
  const bi = useBilingualLocalizer("domains.marketing.RouteConditionBadges");
  const conditions = routeConditionsFor(href);
  if (conditions.length === 0) return null;
  const labels: Readonly<Record<RouteConditionKey, string>> = {
    beta: bi("베타", "Beta"),
    experimental: bi("실험", "Experimental"),
    "sign-in": bi("로그인 필요", "Sign-in required"),
    project: bi("프로젝트 필요", "Project required"),
    desktop: bi("데스크톱 권장", "Desktop recommended"),
  };
  return (
    <span className={className ? `mk-condition-list ${className}` : "mk-condition-list"} data-route-conditions="">
      <span className="sr-only">{bi("사용 조건", "Usage conditions")}: </span>
      {conditions.map((key) => (
        <small key={key} className="mk-condition" data-condition={key}>{labels[key]}</small>
      ))}
    </span>
  );
}
