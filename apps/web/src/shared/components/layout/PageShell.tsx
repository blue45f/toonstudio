import type { ReactNode } from "react";

import { resolveToneRegister, type SurfaceKind } from "@/shared/language/tone-policy";
import { cx } from "@/shared/lib/cx";
import { Container } from "../container";

import { DetailTemplate } from "./DetailTemplate";
import { LAYOUT_TOKENS, PAGE_TEMPLATE_TONE, PAGE_TEMPLATE_WIDTH, type PageTemplateVariant } from "./layout-tokens";

export type { PageTemplateVariant };

export interface PageShellProps {
  /** 페이지 본문. */
  children: ReactNode;
  /** 본문 앞에 렌더되는 히어로 슬롯 (HeroBlock 권장). */
  hero?: ReactNode;
  /**
   * 페이지 템플릿 변형 (BLUEPRINT §3.1) — 5개만 허용한다.
   * 지정하면 루트에 `data-page-template`가 붙고, `size`를 생략했을 때
   * 변형의 폭 단(PAGE_TEMPLATE_WIDTH)으로 본문 폭이 정해진다.
   * 생략하면 기존 동작(레거시 셸 페이지)과 완전히 동일하다.
   */
  variant?: PageTemplateVariant;
  /**
   * 표면 종류 선언 (BLUEPRINT §3.4 말투 정책) — 이 표면이 어떤 종류인지를
   * 선언하면 루트에 `data-tone`으로 최종 말투가 고정된다.
   * 우선순위: surfaceKind 선언 > 변형 기본 말투(PAGE_TEMPLATE_TONE, 전 변형
   * 해요체) > 일반 표면 기본값(해요체). 법적 문서(legal)·결제 문서(payment)
   * 표면만 합니다체가 허용된다. variant와 surfaceKind를 모두 생략하면
   * `data-tone`을 렌더하지 않아 기존 동작과 동일하다.
   */
  surfaceKind?: SurfaceKind;
  /** 목적 헤더 슬롯 (PurposeHeader 권장) — hero 다음, 지금 할 일보다 앞에 렌더된다. */
  purposeHeader?: ReactNode;
  /** 지금 할 일 슬롯 (NowCard 권장) — 있을 때만, 항상 목적 헤더 바로 아래에 렌더된다. */
  now?: ReactNode;
  /**
   * 필터 슬롯 — list 변형 전용 (S3-2 확정, PAGE_TEMPLATE_SLOTS).
   * 지금 할 일 다음, 본문(결과)보다 항상 앞에 렌더된다.
   */
  filters?: ReactNode;
  /**
   * 보조 레일 슬롯 — detail 변형 전용 (S3-2 확정).
   * 지정하면 본문이 DetailTemplate으로 조립돼 ≥1024px에서 주 대상 + 20rem 레일
   * 2열이 되고, 그 아래에서는 레일이 본문 아래에 쌓인다.
   */
  rail?: ReactNode;
  /** 본문 최대 너비 — 기존 `Container` 사이즈와 동일. 기본값 "wide"(1320px). */
  size?: "default" | "wide";
  /** 외곽 래퍼 추가 클래스. */
  className?: string;
}

/**
 * 페이지 외곽 셸 — 배경(bg-canvas), 최대 너비, 헤더 여백을 통일한다.
 *
 * BLUEPRINT §3.1 템플릿 계약의 슬롯 순서를 이 컴포넌트가 보장한다:
 * hero → 목적 헤더(purposeHeader) → 지금 할 일(now) → 본문(children).
 * 고급 구역(AdvancedSection)·복구 구역은 본문 안에서 표면이 배치한다.
 *
 * 사용 예:
 * ```tsx
 * <PageShell hero={<HeroBlock title="..." />}>
 *   <SectionContainer title="...">...</SectionContainer>
 * </PageShell>
 * ```
 *
 * 템플릿 사용 예:
 * ```tsx
 * <PageShell variant="dashboard" purposeHeader={<PurposeHeader ... />} now={<NowCard ... />}>
 *   ...
 * </PageShell>
 * ```
 *
 * reduced-motion/다크모드는 토큰 기반이라 별도 분기 없이 자동 대응한다.
 */
export function PageShell({ children, hero, variant, surfaceKind, purposeHeader, now, filters, rail, size, className }: PageShellProps) {
  const resolvedSize = size ?? (variant != null && PAGE_TEMPLATE_WIDTH[variant] === "reading" ? "prose" : "wide");
  const resolvedTone =
    variant != null || surfaceKind !== undefined
      ? resolveToneRegister({ surfaceKind, templateTone: variant != null ? PAGE_TEMPLATE_TONE[variant] : undefined })
      : undefined;
  return (
    <div className={cx(LAYOUT_TOKENS.page, className)} data-page-template={variant} data-tone={resolvedTone}>
      <Container size={resolvedSize}>
        {hero}
        {purposeHeader}
        {now}
        {filters != null && <div data-template-slot="filters">{filters}</div>}
        {rail != null ? (
          <DetailTemplate rail={rail} nested>
            {children}
          </DetailTemplate>
        ) : (
          children
        )}
      </Container>
    </div>
  );
}
