/**
 * 공용 레이아웃 시스템 토큰 (apps/web/src/shared/components/layout)
 *
 * 마케팅/안내 페이지 감사(2026-09-30: `/`, `/pricing`, `/about/studio`, `/events`,
 * `/product-tour`, `/membership`)에서 뽑아낸 공통 스케일을 Tailwind 클래스 문자열로
 * 고정한다. 색상은 `app/styles/globals.css`의 `@theme`에 정의된 기존 토큰만 사용하고
 * 새 색상을 만들지 않는다 (다크모드·대비 테마는 토큰 기반으로 자동 대응).
 */
import type { ToneRegister } from "@/shared/language/tone-policy";

export const LAYOUT_TOKENS = {
  /**
   * 페이지 외곽 — 헤더 높이만큼 확보한 최소 높이 + 캔버스 배경 + 페이지 수직 여백.
   * 헤더 폴백은 BLUEPRINT §5.2(3)의 단일 높이 60px(3.75rem)과 일치시킨다.
   * (기존 4.25rem=68px 폴백은 실제 헤더 56/60px와 어긋나 있었다.)
   */
  page: "min-h-[calc(100dvh-var(--site-header-height,3.75rem))] bg-canvas py-7 sm:py-10 lg:py-12",
  /** 본문 최대 너비 — 기존 `Container` size="wide"(1320px)와 동일. `width.standard`와 같은 값이다. */
  maxWidth: "max-w-[1320px]",
  /** 본문 좌우 여백 — 기존 `Container`와 동일. */
  gutter: "px-4 sm:px-6",
  /**
   * 거터 단계 선언 (BLUEPRINT §5.2(2) `--layout-gutter`) — 모바일 16px, ≥640px 24px, ≥1280px 32px.
   * 헤더·본문·푸터 정렬선을 맞추는 신규 표면용이며, 기존 `gutter` 사용처는 이관 전까지 그대로 둔다.
   */
  gutterSteps: "px-4 sm:px-6 xl:px-8",

  /**
   * 폭 체계 (BLUEPRINT §5.2(1)) — 레이아웃 치수의 단일 선언처.
   * 새 표면은 이 4단 밖의 임의 폭(max-w-[90rem], max-w-5xl 등)을 쓰지 않는다.
   * CSS 변수가 필요한 곳은 이 값과 대조 테스트(layout-tokens.test.ts)로 일치를 강제한다.
   */
  width: {
    /** 본문·양식 필드 열 (48rem). */
    reading: "max-w-3xl",
    /** 기본값 — 공개·앱 페이지 전부 (82.5rem = 1320px). */
    standard: "max-w-[1320px]",
    /** 데이터 밀집 표면 전용 (100rem = 1600px) — 선언한 표면만. */
    app: "max-w-[1600px]",
    /** 에디터·캔버스·리더 몰입 표면 전용. */
    full: "max-w-none",
  },

  /** 반응형 전환 지점 (BLUEPRINT §5.2(6)) — 신규 코드는 이 5개만 쓴다. */
  breakpoints: [640, 768, 1024, 1280, 1536] as readonly number[],

  /** 섹션 수직 리듬. 페이지 내부에서 연속 섹션은 `mt-*` 대신 이 py 스케일 중 하나를 택한다. */
  sectionSpacing: {
    compact: "py-10 sm:py-12",
    default: "py-12 sm:py-16 lg:py-20",
    roomy: "py-16 sm:py-20 lg:py-24",
  },

  /** 히어로 카드(배너형) 컨테이너 — Pricing/Membership 히어로와 동일. */
  heroCard: "relative overflow-hidden rounded-[2rem] border border-line-strong bg-panel p-6 sm:p-9",

  /**
   * 타이포 스케일 — 한국어 제목은 어절 단위 줄바꿈(break-keep)과 균형 줄바꿈(text-balance),
   * 본문은 고아 단어 방지(text-pretty)를 기본으로 둔다. 휴대폰(390px) 히어로 제목은 2rem으로
   * 시작해 '핵심 기능은 무료로'가 단어 중간에서 끊기지 않고 두 줄 안에 들어오게 한다.
   */
  type: {
    /** 히어로 H1 — font-display + 2rem/4xl/6xl (PricingPage·MembershipPolicyPage 기준). */
    heroTitle: "font-display text-[2rem] leading-[1.18] font-black tracking-[-0.04em] text-fg break-keep text-balance sm:text-4xl sm:leading-[1.12] lg:text-6xl",
    /** 섹션 H2 — font-display + 2xl/3xl/4xl. */
    sectionTitle: "font-display text-2xl leading-snug font-black tracking-tight text-fg break-keep text-balance sm:text-3xl lg:text-4xl",
    /** 히어로 리드 문단. */
    heroLede: "mt-5 max-w-3xl text-base leading-7 text-fg-2 break-keep text-pretty sm:text-lg",
    /** 섹션 설명 문단(휴대폰도 본문 16px). */
    sectionDescription: "mt-4 max-w-3xl text-base leading-7 text-fg-2 break-keep text-pretty",
    /** 영문 eyebrow 라벨 — 전역 `@utility eyebrow` (display, uppercase, 0.16em, 0.75rem). */
    eyebrow: "eyebrow flex items-center gap-2 text-accent",
    /** 히어로용 pill eyebrow — Pricing/Membership 히어로와 동일. */
    heroEyebrow:
      "inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-black tracking-[0.14em] text-accent",
  },

  /** 카드 스케일 (감사: rounded-2xl/3xl + border-line + bg-panel). */
  card: {
    default: "rounded-2xl border border-line bg-panel p-5",
    large: "rounded-3xl border border-line bg-panel p-6 sm:p-8",
  },
  radius: {
    card: "rounded-2xl",
    panel: "rounded-3xl",
    hero: "rounded-[2rem]",
  },
  shadow: {
    subtle: "shadow-sm",
    none: "shadow-none",
  },
  /** 단계 카드 리듬 — 기존 /studio/new 섹션과 같은 값으로 고정한다. */
  formStep: "mt-4 rounded-3xl border border-line bg-card p-4 sm:p-5",
  /** 단계 번호 배지 — 숫자만 들어가는 원형 배지. */
  formStepBadge:
    "grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-on-accent",
} as const;

export type LayoutSectionSpacing = keyof typeof LAYOUT_TOKENS.sectionSpacing;
export type LayoutWidthTier = keyof typeof LAYOUT_TOKENS.width;

/**
 * 페이지 템플릿 변형 (BLUEPRINT §3.1) — 5개만 허용한다.
 * dashboard: 지금 할 일 중심 / list: 필터+그리드 / detail: 주 대상+보조 레일 /
 * form: 단계 양식 / reading: 본문 폭(reading) 제한.
 */
export type PageTemplateVariant = "dashboard" | "list" | "detail" | "form" | "reading";

/** 변형 → 폭 단 매핑. reading만 본문 폭으로 좁히고 나머지는 표준 폭을 쓴다. */
export const PAGE_TEMPLATE_WIDTH: Readonly<Record<PageTemplateVariant, LayoutWidthTier>> = {
  dashboard: "standard",
  list: "standard",
  detail: "standard",
  form: "standard",
  reading: "reading",
};

/**
 * 변형 → 기본 말투 매핑 (BLUEPRINT §3.4 말투 정책과 §3.1 템플릿 변형의 연결).
 * 템플릿 변형은 전부 사용자 대면 표면이라 기본 말투는 해요체(`polite`)다.
 * 법적·결제 문서처럼 합니다체가 허용되는 표면은 PageShell의 `surfaceKind`
 * prop으로 표면 종류를 선언해 이 기본값을 덮는다(정책 단일 출처:
 * shared/language/tone-policy.ts의 TONE_POLICY).
 */
export const PAGE_TEMPLATE_TONE: Readonly<Record<PageTemplateVariant, ToneRegister>> = {
  dashboard: "polite",
  list: "polite",
  detail: "polite",
  form: "polite",
  reading: "polite",
};

/**
 * 템플릿 슬롯 이름 (BLUEPRINT §3.1) — 변형마다 슬롯 자체는 같고 배치만 다르다.
 * 이 이름이 `data-template-slot` 값과 PageShell/ListTemplate/DetailTemplate의
 * 렌더 순서의 단일 선언처다.
 */
export type PageTemplateSlot =
  | "hero"
  | "purposeHeader"
  | "now"
  | "steps"
  | "filters"
  | "work"
  | "rail"
  | "evidence"
  | "advanced"
  | "recovery";

/**
 * 변형 → 슬롯 순서 확정 (S3-2).
 * - list: 목적 헤더 → (지금 할 일) → **필터** → 작업 구역(그리드/표 결과).
 *   필터는 결과보다 항상 앞에 오고, 근거·고급·복구는 결과 뒤에 둔다.
 * - detail: 목적 헤더 → (지금 할 일) → 작업 구역(주 대상) → **보조 레일**.
 *   레일은 DOM에서 주 대상 뒤에 오고(읽기 순서), 시각 배치는
 *   PAGE_TEMPLATE_DETAIL_GRID가 ≥1024px에서 오른쪽 열로 옮긴다.
 * - steps(단계 표시)는 회차 맥락인 form 변형에만 둔다(§3.1·§2.2 규칙).
 */
export const PAGE_TEMPLATE_SLOTS: Readonly<Record<PageTemplateVariant, readonly PageTemplateSlot[]>> = {
  dashboard: ["hero", "purposeHeader", "now", "work", "evidence", "advanced", "recovery"],
  list: ["hero", "purposeHeader", "now", "filters", "work", "evidence", "advanced", "recovery"],
  detail: ["hero", "purposeHeader", "now", "work", "rail", "evidence", "advanced", "recovery"],
  form: ["hero", "purposeHeader", "steps", "work", "advanced", "recovery"],
  reading: ["hero", "purposeHeader", "work", "advanced"],
};

/**
 * detail 변형의 시각 배치 — 주 대상 열 + 보조 레일 20rem.
 * <1024px에서는 단일 열로 쌓이고 레일이 주 대상 아래에 온다(§5.2 행 레일 전환 규칙과 정합).
 */
export const PAGE_TEMPLATE_DETAIL_GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8";
