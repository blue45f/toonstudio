import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  sitePageHeaderArtSource,
  type SitePageHeaderArtPlacement,
} from "./site-page-header-art";

import { cn } from "@/shared/lib/utils";

/**
 * 공개 페이지 공통 헤더 — "아이브로 · 제목 · 한 줄 설명 · 주요 행동" 문법을 한곳에서 고정한다.
 *
 * 탐색·커뮤니티·마켓·계정·도움말처럼 서로 다른 도메인의 페이지가 같은 위계와 간격으로
 * 시작하도록 만든 표현 전용 컴포넌트다. 도메인 사이에서는 `domains/legal/public` 경계로만
 * 가져다 쓰며, 여러 앱 영역이 쓰게 되면 `shared/components/layout`으로 승격할 후보다.
 *
 * - `size="hero"`: 허브(탐색·마켓 홈·학습 홈 등) 첫 화면용 큰 제목.
 * - `surface="plain"`: 카드 배경 없이 하단 구분선만 두는 작업형 페이지 헤더.
 * - `aside`: lg 이상에서 오른쪽에 두는 보조 요소(모바일에서는 본문 아래로 내려간다).
 * - `art`: aside가 없을 때 그 자리에 두는 장식 아트(일러스트 풀 키). 경로별 배정은
 *   `site-page-header-art`의 배정 맵이 정본이고, 페이지가 직접 키를 골라도 된다.
 * - `artPlacement="banner"`: 아트를 측면 장식이 아니라 헤더 배경으로 깔고 남색 스크림
 *   위에 제목을 얹는 배너형(시안 공통 방향). 배정 기반 opt-in이라 발견 계열처럼
 *   배너가 확정된 페이지만 켜고, 나머지 사용처의 렌더는 바뀌지 않는다. `aside`가
 *   있으면 배너보다 aside가 우선한다(기존 계약 유지).
 */
export interface SitePageHeaderProps {
  /** 영역을 알려 주는 짧은 라벨(영문 대문자 권장). */
  readonly eyebrow: ReactNode;
  /** 아이브로 앞 아이콘. */
  readonly icon?: LucideIcon;
  /** 페이지 제목(h1). */
  readonly title: ReactNode;
  /** 제목 아래 한두 줄 설명. */
  readonly description?: ReactNode;
  /** 주요 행동 1개와 선택적 보조 행동. */
  readonly actions?: ReactNode;
  /** 설명 아래에 두는 입력·상태 요소(검색 폼, 필터 요약 등). */
  readonly children?: ReactNode;
  /** 오른쪽 보조 영역. */
  readonly aside?: ReactNode;
  /**
   * 헤더 아트(일러스트 풀 키) — `aside`가 없을 때만 오른쪽 자리에 장식 이미지로 둔다.
   * 페이지 고유 보조 영역이 있는 화면은 `aside`가 항상 우선한다.
   */
  readonly art?: string;
  /**
   * 아트 배치 방식. `banner`면 아트를 헤더 배경으로 깔고 스크림 위에 밝은 텍스트를
   * 얹는다. 배정은 `site-page-header-art`의 배너 경로 집합이 정본이며, 기본값
   * `aside`(측면 장식)는 기존 사용처의 렌더를 바꾸지 않는다.
   */
  readonly artPlacement?: SitePageHeaderArtPlacement;
  /** 보조 영역 래퍼 클래스(예: 모바일에서 숨기기 `hidden sm:block`). */
  readonly asideClassName?: string;
  /** 보조 영역 폭 — `wide`는 대표 작품 카드처럼 큰 아트를 둘 때(lg 이상 최대 32rem). */
  readonly asideSize?: "default" | "wide";
  readonly titleId?: string;
  readonly className?: string;
  readonly surface?: "panel" | "plain";
  readonly size?: "default" | "hero";
}

const ASIDE_COLUMNS = {
  default: "lg:grid-cols-[minmax(0,1fr)_minmax(17rem,24rem)]",
  wide: "lg:grid-cols-[minmax(0,1fr)_minmax(20rem,32rem)]",
} as const;

const TITLE_SIZE = {
  default: "text-[clamp(1.75rem,5.4vw,2.5rem)] leading-[1.15] tracking-[-0.03em]",
  hero: "text-[clamp(2rem,6vw,3.25rem)] leading-[1.1] tracking-[-0.045em]",
} as const;

/**
 * 헤더 아트 그림 — D-1 마스트헤드와 같은 문법이다: 일러스트 풀 이미지, 장식 전용
 * (alt 빈 문자열·aria-hidden), 초점 위치 50% 30%. 작품이나 실제 화면으로 읽히지 않게
 * 테두리와 패널 톤 안에 가둔다.
 */
function SitePageHeaderArtwork({ artKey }: { readonly artKey: string }) {
  return (
    <img
      data-site-page-header-art={artKey}
      src={sitePageHeaderArtSource(artKey)}
      alt=""
      aria-hidden="true"
      width={640}
      height={480}
      decoding="async"
      draggable={false}
      className="h-44 w-full rounded-2xl border border-line object-cover sm:h-52 lg:h-full lg:min-h-60"
      style={{ objectPosition: "50% 30%" }}
    />
  );
}

/**
 * 배너 배경 아트 — 측면 장식과 같은 풀·같은 초점(50% 30%)을 쓰되 헤더 전면을 덮는다.
 * 아래에 남색 그라디언트 폴백이 항상 깔려 있어, 로드가 늦거나 실패해도 스크림 위
 * 제목의 대비가 무너지지 않는다(실패 시 이미지만 걷어 낸다).
 */
function SitePageHeaderBannerArtwork({ artKey }: { readonly artKey: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute inset-0 bg-[linear-gradient(150deg,oklch(0.17_0.035_265),oklch(0.09_0.025_265))]" />
      {failed ? null : (
        <img
          data-site-page-header-art={artKey}
          src={sitePageHeaderArtSource(artKey)}
          alt=""
          width={1280}
          height={640}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: "50% 30%" }}
        />
      )}
      {/* 스크림: 작품 상세 히어로와 같은 남색 문법 — 아래쪽이 가장 진해 본문 대비를 확보한다. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.09_0.025_265/0.95)_0%,oklch(0.09_0.025_265/0.82)_38%,oklch(0.09_0.025_265/0.45)_68%,oklch(0.09_0.025_265/0.22)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(78deg,oklch(0.09_0.025_265/0.45)_0%,transparent_58%)]" />
    </div>
  );
}

/** 배너 최소 높이 — 본문을 과도하게 밀지 않게 측면 아트 시절의 헤더 높이와 같은 급으로 절제한다. */
const BANNER_MIN_HEIGHT = {
  default: "min-h-60 sm:min-h-64",
  hero: "min-h-72 sm:min-h-80",
} as const;

export function SitePageHeader({
  eyebrow,
  icon: Icon,
  title,
  description,
  actions,
  children,
  aside,
  art,
  artPlacement = "aside",
  asideClassName,
  asideSize = "default",
  titleId,
  className,
  surface = "panel",
  size = "default",
}: SitePageHeaderProps) {
  const panel = surface === "panel";
  const asideNode = aside ?? (art ? <SitePageHeaderArtwork artKey={art} /> : null);

  // 전경(아이브로·제목·설명·자식·행동)은 배너 여부에 따라 글자색만 갈린다.
  // 배너에서는 테마 토큰 대신 아트 표면의 고정 명암(흰 글자·연보라 아이브로)을 쓴다 —
  // 작품 상세 히어로와 같은 문법이다.
  const foreground = (onArt: boolean) => (
    <>
      <p
        className={cn(
          "eyebrow flex items-center gap-1.5",
          onArt ? "text-[oklch(0.85_0.09_265)]" : "text-accent",
        )}
      >
        {Icon ? <Icon size={14} aria-hidden="true" /> : null}
        {eyebrow}
      </p>
      <h1
        id={titleId}
        className={cn(
          "mt-2.5 text-balance break-keep font-bold",
          onArt ? "max-w-3xl text-white" : "text-fg",
          TITLE_SIZE[size],
        )}
      >
        {title}
      </h1>
      {description != null ? (
        <p
          className={cn(
            "mt-3 max-w-2xl text-balance break-keep text-sm leading-relaxed sm:text-base",
            onArt ? "text-white/80" : "text-fg-2",
          )}
        >
          {description}
        </p>
      ) : null}
      {children != null ? <div className="mt-5">{children}</div> : null}
      {actions != null ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </>
  );

  // 배너는 아트가 실제로 그려지는 자리(aside 없음)에서만 켜진다 — aside 우선 계약을
  // 그대로 두어, 보조 영역이 있는 화면(예: 탐색 스포트라이트)은 렌더가 바뀌지 않는다.
  if (artPlacement === "banner" && aside == null && art != null) {
    return (
      <header
        data-site-page-header={surface}
        data-site-page-header-variant="banner"
        className={cn(
          "relative isolate overflow-hidden rounded-3xl border border-line",
          className,
        )}
      >
        <SitePageHeaderBannerArtwork artKey={art} />
        <div
          className={cn(
            "relative flex flex-col justify-end p-5 sm:p-7 lg:p-8",
            BANNER_MIN_HEIGHT[size],
          )}
        >
          <div className="min-w-0">{foreground(true)}</div>
        </div>
      </header>
    );
  }

  return (
    <header
      data-site-page-header={surface}
      className={cn(
        "relative isolate",
        panel
          ? "overflow-hidden rounded-3xl border border-line bg-panel/60 p-5 sm:p-7 lg:p-8"
          : "border-b border-line pb-6 sm:pb-8",
        className,
      )}
    >
      {panel ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"
        />
      ) : null}
      <div
        className={cn(
          "grid gap-6",
          asideNode != null && cn(ASIDE_COLUMNS[asideSize], "lg:items-center"),
        )}
      >
        <div className="min-w-0">{foreground(false)}</div>
        {asideNode != null ? <div className={cn("min-w-0", asideClassName)}>{asideNode}</div> : null}
      </div>
    </header>
  );
}
