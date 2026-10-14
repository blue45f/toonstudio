import type { CSSProperties, ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

import "../spectacle.css";

export interface SpectacleHeroArt {
  src: string;
  srcSet?: string;
  sizes?: string;
}

export interface SpectacleHeroProps {
  /** 히어로 제목 (h1). 강조는 <em> 한 곳만 — 스펙트럼 그라디언트 텍스트가 붙는다. */
  title: ReactNode;
  /** h1의 id — 섹션 aria-labelledby 연결용. */
  titleId?: string;
  /** 제목 앞 브랜드·워드마크 슬롯. */
  beforeTitle?: ReactNode;
  /** 제목 위 eyebrow 문장. */
  eyebrow?: ReactNode;
  /** 제목 아래 리드 문단. */
  lede?: ReactNode;
  /** 전면 아트. 없으면 스펙트럼+타이포 커버로 대체된다. 장식이라 alt는 항상 빈 값이다. */
  art?: SpectacleHeroArt;
  /** 우측 글래스 패널 슬롯 (창작 안내·요약 등). */
  aside?: ReactNode;
  /** 이 표면의 틴트 — 지정하면 --domain-tint를 이 히어로 범위에서만 덮어쓴다. */
  tint?: string;
  /** 주 행동 슬롯 (입력 폼·CTA). 글로우 CTA는 화면당 1개 원칙 (§6.4 경계 4). */
  children?: ReactNode;
  className?: string;
  artClassName?: string;
  innerClassName?: string;
  copyClassName?: string;
  eyebrowClassName?: string;
  ledeClassName?: string;
}

/**
 * 스펙터클 히어로 (BLUEPRINT §6.2 (2), S3-15) — HeroBlock의 아트 변형.
 * 3층 표준: 배경 아트 → --art-scrim 스크림 → 카피/글래스 패널.
 * 색은 표현 토큰(--spectacle-*·--domain-tint)만으로 조립하고, 표면은 자기 색을
 * 발명하지 않고 tint로 --domain-tint 하나만 정한다.
 * above-the-fold 부품이라 진입 모션을 걸지 않는다 (§6.2 (3) 모션 문법).
 */
export function SpectacleHero({
  title,
  titleId,
  beforeTitle,
  eyebrow,
  lede,
  art,
  aside,
  tint,
  children,
  className,
  artClassName,
  innerClassName,
  copyClassName,
  eyebrowClassName,
  ledeClassName,
}: SpectacleHeroProps) {
  const style = tint ? ({ "--domain-tint": tint } as CSSProperties) : undefined;
  return (
    <section
      className={cx("spectacle-hero", className)}
      aria-labelledby={titleId}
      data-spectacle-hero="true"
      data-spectacle-art={art ? "image" : "none"}
      style={style}
    >
      {art ? (
        <img
          className={cx("spectacle-hero-art", artClassName)}
          src={art.src}
          srcSet={art.srcSet}
          sizes={art.sizes}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
        />
      ) : null}
      <div className={cx("spectacle-hero-inner", innerClassName)}>
        <div className={cx("spectacle-hero-copy", copyClassName)}>
          {beforeTitle}
          {eyebrow != null && <p className={cx("spectacle-hero-eyebrow", eyebrowClassName)}>{eyebrow}</p>}
          <h1 id={titleId} className="spectacle-hero-title">
            {title}
          </h1>
          {lede != null && <p className={cx("spectacle-hero-lede", ledeClassName)}>{lede}</p>}
          {children}
        </div>
        {aside}
      </div>
    </section>
  );
}
