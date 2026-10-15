import type { CSSProperties, ReactNode } from "react";

import type { Title } from "@/shared/lib/types";

import { cx } from "@/shared/lib/cx";
import { coverGridPriority } from "./cover-image-sizing";
import { TitlePoster } from "./title-poster";

import "./spectacle.css";

export interface CoverCardProps {
  /** 표지 데이터 — 타이포 폴백·그라디언트·메타는 TitlePoster 계약을 그대로 승격한다. */
  title: Title;
  size?: "sm" | "md" | "lg" | "hero";
  /** portrait=3:4(기본 단위), wide=16:10(마켓 소재 변형, §6.3). */
  ratio?: "portrait" | "wide";
  /** 첫 페인트 행 표지 — 단독 사용(히어로 등) 전용. 그리드 안에서는 index가 우선한다. */
  priority?: boolean;
  /** 그리드 안에서의 0-base 위치 — 주면 priority를 coverGridPriority로 도출한다(S3-16: 첫 행 판정은 그리드 책임, 호출자는 priority를 임의로 정하지 않는다). */
  index?: number;
  rank?: number;
  /** 가격·라이선스 등 표지 위 배지 슬롯 (마켓). */
  badge?: ReactNode;
  /** 표지 아래 메타 슬롯 (가격·상태 등 표면 정보). */
  meta?: ReactNode;
  /** 이 카드의 틴트 — 지정하면 --domain-tint를 카드 범위에서만 덮어쓴다 (장르·카테고리). */
  tint?: string;
  className?: string;
}

/**
 * 표지 카드 (BLUEPRINT §6.2 (2)·(4), S3-15) — 표지를 콘텐츠의 기본 단위로 승격한 부품.
 * 렌더링 본체는 TitlePoster(즉시 보이는 타이포 폴백 포함)이고, 이 래퍼는
 * elevation·틴트·배지/메타 슬롯만 책임진다. 표지 로드 계약(S3-16): 그리드
 * 안에서는 index로 priority를 도출하고(첫 행만), sizes/srcset은 TitlePoster가
 * 자동 부여한다 — 호출자가 priority·sizes를 손으로 정하지 않는다.
 */
export function CoverCard({
  title,
  size = "md",
  ratio = "portrait",
  priority,
  index,
  rank,
  badge,
  meta,
  tint,
  className,
}: CoverCardProps) {
  const style = tint ? ({ "--domain-tint": tint } as CSSProperties) : undefined;
  const effectivePriority = index != null ? coverGridPriority(index) : priority;
  return (
    <article className={cx("cover-card", className)} data-cover-card="true" data-cover-ratio={ratio} style={style}>
      {badge != null && <span className="cover-card-badge">{badge}</span>}
      <TitlePoster title={title} size={size} rank={rank} priority={effectivePriority} className="cover-card-poster" />
      {meta != null && <div className="cover-card-meta">{meta}</div>}
    </article>
  );
}
