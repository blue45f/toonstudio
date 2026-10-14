import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

import { LAYOUT_TOKENS } from "./layout-tokens";

export interface FormStepSectionProps {
  /**
   * 단계 번호 — 배지에 숫자로만 렌더되는 데이터 값이다.
   * 아이콘 컴포넌트/식별자를 인자로 받지 않는다(과거 아이콘 인자 회귀 교훈).
   */
  step: number;
  /** 제목(h2)의 id — section의 aria-labelledby와 연결해 단계 제목으로 읽히게 한다. */
  titleId: string;
  /** 단계 제목 한 문장. */
  title: ReactNode;
  /** 제목 아래 설명 1줄 (선택). */
  description?: ReactNode;
  /** 단계 본문 (입력·선택지). */
  children: ReactNode;
  /** 외곽 섹션 추가 클래스. 단계 간격(mt-4)은 토큰이 고정하므로 간격은 여기서 바꾸지 않는다. */
  className?: string;
}

/**
 * 단계 양식 섹션 (BLUEPRINT §3.1 템플릿 `form` 변형의 작업 구역 단위).
 *
 * form 변형의 슬롯 순서 — 목적 헤더(PurposeHeader) → 단계 섹션 ×n →
 * 고급 구역(선택 설정, 기본 접힘/꺼짐) → 제출·복구 구역 — 중 "단계"를 맡는다.
 * 번호 배지·제목·설명 1줄의 마크업과 카드 리듬을 공용 토큰으로 고정해,
 * 표면마다 단계 헤더를 다시 발명하지 않게 한다(/studio/new가 파일럿).
 *
 * 단계가 없는 표면에는 쓰지 않는다(스텝퍼 남용 방지, BLUEPRINT §2.2 위험 항목과 같은 규칙).
 */
export function FormStepSection({ step, titleId, title, description, children, className }: FormStepSectionProps) {
  return (
    <section className={cx(LAYOUT_TOKENS.formStep, className)} aria-labelledby={titleId} data-form-step={step}>
      <div className="flex items-center gap-3">
        <span className={LAYOUT_TOKENS.formStepBadge} aria-hidden="true">
          {step}
        </span>
        <div>
          <h2 id={titleId} className="text-lg font-black text-fg">
            {title}
          </h2>
          {description != null && <p className="text-xs text-fg-2">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
