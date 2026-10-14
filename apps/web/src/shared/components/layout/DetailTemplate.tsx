import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

import { PAGE_TEMPLATE_DETAIL_GRID } from "./layout-tokens";

export interface DetailTemplateProps {
  /** 보조 레일 슬롯 — 근거·상태·관련 행동. 주 대상(children) 뒤에 렌더된다. */
  rail?: ReactNode;
  /** 작업 구역 — 주 대상 본문. */
  children: ReactNode;
  className?: string;
  /** 레일 래퍼 클래스. */
  railClassName?: string;
  /**
   * PageShell처럼 바깥이 이미 `data-page-template`를 선언한 경우 true —
   * 루트에 변형 속성을 중복으로 붙이지 않는다.
   */
  nested?: boolean;
}

/**
 * detail 변형의 구역 조립 부품 (BLUEPRINT §3.1, S3-2 확정).
 *
 * 읽기 순서(DOM)는 주 대상 → 레일이며, ≥1024px에서만
 * PAGE_TEMPLATE_DETAIL_GRID가 레일을 오른쪽 20rem 열로 옮긴다.
 * 레일이 없으면 단일 열로 렌더된다(그리드 클래스를 붙이지 않는다).
 * PageShell의 detail+rail 슬롯도 이 부품을 통해 같은 배치를 쓴다.
 */
export function DetailTemplate({ rail, children, className, railClassName, nested = false }: DetailTemplateProps) {
  const templateAttr = nested ? undefined : "detail";
  if (rail == null) {
    return (
      <div data-page-template={templateAttr} className={className}>
        <div data-template-slot="work">{children}</div>
      </div>
    );
  }
  return (
    <div data-page-template={templateAttr} className={cx(PAGE_TEMPLATE_DETAIL_GRID, className)}>
      <div data-template-slot="work" className="min-w-0">
        {children}
      </div>
      <aside data-template-slot="rail" className={cx("mt-8 lg:mt-0", railClassName)}>
        {rail}
      </aside>
    </div>
  );
}
