import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

export interface ListTemplateProps {
  /**
   * 필터 슬롯 — 정렬·유형·상세 필터 등 결과를 좁히는 통제 묶음.
   * §3.1 list 변형 규칙상 결과(work)보다 항상 앞에 렌더된다.
   * 검색 입력처럼 목적 헤더에 속하는 통제는 여기에 넣지 않는다.
   */
  filters?: ReactNode;
  /** 작업 구역 — 결과 그리드/표, 빈 상태, 복구 구역을 호출자가 조립해 넣는다. */
  children: ReactNode;
  className?: string;
  /** 필터 래퍼 클래스 — 부모 flex gap이 load-bearing인 표면이 간격을 명시할 때 쓴다. */
  filtersClassName?: string;
  /** 작업 구역 래퍼 클래스. */
  workClassName?: string;
}

/**
 * list 변형의 구역 조립 부품 (BLUEPRINT §3.1, S3-2 확정).
 *
 * PageShell을 쓰지 않는 목록 표면(자체 히어로·컨테이너를 가진 표면)에서도
 * list 슬롯 순서(필터 → 결과)를 같은 규칙으로 강제하기 위한 섹션 단위 부품이다.
 * 래퍼는 간격을 만들지 않는다 — 표면이 기존 리듬(flex gap·mt-*)을
 * className/filtersClassName/workClassName으로 그대로 선언한다.
 */
export function ListTemplate({ filters, children, className, filtersClassName, workClassName }: ListTemplateProps) {
  return (
    <div data-page-template="list" className={className}>
      {filters != null && (
        <div data-template-slot="filters" className={cx(filtersClassName)}>
          {filters}
        </div>
      )}
      <div data-template-slot="work" className={cx(workClassName)}>
        {children}
      </div>
    </div>
  );
}
