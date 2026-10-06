import { Children, createElement, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { RevealOnScroll } from "./reveal-on-scroll";

/** 형제 스태거 간격(ms). 랭킹 보드의 진입 스태거(45ms)보다 살짝 느긋하게 잡는다. */
export const STAGGER_STEP_MS = 55;
/** 마지막 아이템도 330ms 안에 등장한다 — 긴 목록에서 뒤쪽이 하염없이 늦어지지 않게 하는 상한. */
export const STAGGER_MAX_DELAY_MS = 330;

/**
 * 목록 인덱스 → 스태거 지연(ms). 0번은 즉시, 이후는 간격만큼 누적하되 상한에서 멈춘다.
 * 순수 함수라 단위 테스트로 고정한다.
 */
export function staggerDelayMs(
  index: number,
  stepMs: number = STAGGER_STEP_MS,
  maxDelayMs: number = STAGGER_MAX_DELAY_MS,
): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index) * stepMs, maxDelayMs);
}

export interface StaggerRevealProps {
  children: ReactNode;
  /** 각 아이템의 등장 변형(기본 "up"). RevealOnScroll과 같은 의미. */
  variant?: "up" | "fade";
  /** 스태거 간격(ms). */
  stepMs?: number;
  /** 지연 상한(ms). */
  maxDelayMs?: number;
  /** 컨테이너 태그(기본 "div"). 목록이면 "ul" + itemAs="li" 조합을 쓴다. */
  as?: "div" | "section" | "ul";
  /** 각 아이템 래퍼 태그(기본 "div"). */
  itemAs?: "div" | "section" | "li";
  className?: string;
  itemClassName?: string;
  style?: CSSProperties;
  /** 컨테이너가 영역을 대표하면 라벨을 그대로 전달한다. */
  "aria-label"?: string;
}

/**
 * StaggerReveal — 자식들을 순차 등장시키는 공용 목록 래퍼.
 *
 * 각 자식을 RevealOnScroll로 감싸 fx.css의 reveal 체계(IntersectionObserver, once)를
 * 그대로 쓰고, 지연만 인덱스 순으로 얹는다. 가시성은 RevealOnScroll이 보장한다:
 * IO 미지원·reduced-motion에서도 콘텐츠는 항상 또렷이 보인다(모션만 빠진다).
 *
 * 그리드 자식으로 쓸 때는 itemClassName에 "h-full" 등을 넘겨 래퍼가 셀 높이를
 * 채우게 하라. 자식이 이미 자체 등장 모션을 가진 컴포넌트면 이중으로 감싸지 마라.
 */
export function StaggerReveal({
  children,
  variant = "up",
  stepMs = STAGGER_STEP_MS,
  maxDelayMs = STAGGER_MAX_DELAY_MS,
  as: Tag = "div",
  itemAs = "div",
  className,
  itemClassName,
  style,
  "aria-label": ariaLabel,
}: StaggerRevealProps) {
  const items = Children.toArray(children);
  return createElement(
    Tag,
    { className, style, "aria-label": ariaLabel },
    items.map((child, index) => (
      <RevealOnScroll
        key={child.key ?? index}
        as={itemAs}
        variant={variant}
        delayMs={staggerDelayMs(index, stepMs, maxDelayMs)}
        className={itemClassName}
      >
        {child}
      </RevealOnScroll>
    )),
  );
}

export default StaggerReveal;
