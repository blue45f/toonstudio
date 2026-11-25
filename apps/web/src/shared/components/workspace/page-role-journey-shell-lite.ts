import { canonicalSitePath } from "@/shared/lib/site-route-authority";

export type JourneyStageNumber = 1 | 2 | 3 | 4 | 5;

export type PageJourneyAccentTone =
  | "creation"
  | "three-d"
  | "collab"
  | "market"
  | "support";

export interface CreatorJourneyStage {
  readonly stageNumber: JourneyStageNumber;
  readonly stepCode: "01" | "02" | "03" | "04" | "05";
  readonly stageId:
    | "start"
    | "create"
    | "collaborate"
    | "discover-market"
    | "support-account";
  readonly circleBadge: "①" | "②" | "③" | "④" | "⑤";
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly shortLabelKo: string;
  readonly shortLabelEn: string;
  readonly subtitleKo: string;
  readonly subtitleEn: string;
  readonly primaryHref: string;
  readonly accentTone: PageJourneyAccentTone;
}

export interface ShellPageJourneySummary {
  readonly stageNumber: JourneyStageNumber;
  readonly stageBadgeKo: string;
  readonly stageBadgeEn: string;
  readonly roleHeadlineKo: string;
  readonly roleHeadlineEn: string;
  readonly accentTone: PageJourneyAccentTone;
}

/**
 * ToonStudio 5단계 창작 여정 단일 정본(초기 셸 경량 공유 모듈).
 * 상세 42+ 라우트 안내(`page-role-journey-map.ts`)는 지연 로딩 표면에서만 불러와
 * 초기 critical precache 크기를 엄격히 유지한다.
 */
export const CREATOR_JOURNEY_STAGES: readonly CreatorJourneyStage[] = Object.freeze([
  {
    stageNumber: 1, stepCode: "01", stageId: "start", circleBadge: "①",
    badgeKo: "① 시작·홈", badgeEn: "1 · Start & Home",
    shortLabelKo: "시작·홈", shortLabelEn: "Start & Home",
    subtitleKo: "작업 홈·새 작품 시작", subtitleEn: "Workspace home & new work",
    primaryHref: "/home", accentTone: "creation",
  },
  {
    stageNumber: 2, stepCode: "02", stageId: "create", circleBadge: "②",
    badgeKo: "② 작품 제작", badgeEn: "2 · Studio & Create",
    shortLabelKo: "작품 제작", shortLabelEn: "Studio & Create",
    subtitleKo: "스튜디오·3D·AI·포토샵", subtitleEn: "Canvas, 3D, AI & layers",
    primaryHref: "/studio", accentTone: "three-d",
  },
  {
    stageNumber: 3, stepCode: "03", stageId: "collaborate", circleBadge: "③",
    badgeKo: "③ 분업·협업", badgeEn: "3 · Collaborate",
    shortLabelKo: "분업·협업", shortLabelEn: "Collaborate",
    subtitleKo: "분업 OS·팀·커뮤니티", subtitleEn: "Production OS & teams",
    primaryHref: "/production", accentTone: "collab",
  },
  {
    stageNumber: 4, stepCode: "04", stageId: "discover-market", circleBadge: "④",
    badgeKo: "④ 탐색·마켓", badgeEn: "4 · Discover & Market",
    shortLabelKo: "탐색·마켓", shortLabelEn: "Discover & Market",
    subtitleKo: "통합 소재 검색·에셋 마켓·배우기", subtitleEn: "Asset search, market & learn",
    primaryHref: "/market", accentTone: "market",
  },
  {
    stageNumber: 5, stepCode: "05", stageId: "support-account", circleBadge: "⑤",
    badgeKo: "⑤ 내 공간·AI 고객센터", badgeEn: "5 · Account & AI Support",
    shortLabelKo: "AI 고객센터", shortLabelEn: "AI Support",
    subtitleKo: "1:1 채팅상담·지원·설정", subtitleEn: "1:1 AI chat, help & settings",
    primaryHref: "/studio/support", accentTone: "support",
  },
]);

const STAGE_BY_NUMBER: Readonly<Record<JourneyStageNumber, CreatorJourneyStage>> = {
  1: CREATOR_JOURNEY_STAGES[0]!,
  2: CREATOR_JOURNEY_STAGES[1]!,
  3: CREATOR_JOURNEY_STAGES[2]!,
  4: CREATOR_JOURNEY_STAGES[3]!,
  5: CREATOR_JOURNEY_STAGES[4]!,
};

type ShellRouteTuple = readonly [
  pattern: string,
  stageNumber: JourneyStageNumber,
  accentTone: PageJourneyAccentTone,
  exact?: true,
];

const SHELL_ROUTE_TUPLES: readonly ShellRouteTuple[] = [
  ["/", 1, "creation", true],
  ["/home", 1, "creation"],
  ["/create", 1, "creation", true],
  ["/studio/new", 1, "creation"],
  ["/studio/templates", 1, "creation"],
  ["/studio/import", 1, "creation"],
  ["/now", 1, "creation"],
  ["/studio", 2, "creation", true],
  ["/studio/comic", 2, "creation"],
  ["/studio/bg3d", 2, "three-d"],
  ["/studio/ai-lab", 2, "three-d"],
  ["/studio/assets/characters", 2, "three-d"],
  ["/studio/assets", 2, "three-d"],
  ["/studio/publish", 2, "creation"],
  ["/studio/growth", 2, "creation"],
  ["/studio/present", 2, "creation"],
  ["/studio/jobs", 2, "three-d"],
  ["/studio/p/", 2, "creation"],
  ["/production", 3, "collab"],
  ["/studio/review", 3, "collab"],
  ["/studio/projects", 3, "collab"],
  ["/studio/share", 3, "collab"],
  ["/studio/space", 3, "collab"],
  ["/team", 3, "collab"],
  ["/collaborate", 3, "collab"],
  ["/community", 3, "collab"],
  ["/showcase", 3, "collab"],
  ["/reviews", 3, "collab"],
  ["/opportunities", 3, "collab"],
  ["/research/materials", 4, "market"],
  ["/market", 4, "market"],
  ["/hub", 4, "market"],
  ["/discover", 4, "market"],
  ["/explore", 4, "market"],
  ["/ranking", 4, "market"],
  ["/calendar", 4, "market"],
  ["/recommend", 4, "market"],
  ["/research", 4, "market"],
  ["/learn", 4, "market"],
  ["/insights", 4, "market"],
  ["/about/technology", 4, "three-d"],
  ["/play", 4, "market"],
  ["/fortune", 4, "market"],
  ["/studio/support", 5, "support"],
  ["/support", 5, "support"],
  ["/creator-support", 5, "support"],
  ["/studio/versions", 5, "support"],
  ["/studio/ai-settings", 5, "support"],
  ["/help", 5, "support"],
  ["/my", 5, "support"],
  ["/library", 5, "support"],
  ["/notifications", 5, "support"],
  ["/settings", 5, "support"],
  ["/sitemap", 5, "support"],
];

function normalizeShellPath(pathname: string): string {
  const withoutHash = pathname.split("#")[0] ?? "/";
  const withoutQuery = withoutHash.split("?")[0] ?? "/";
  const canonical = canonicalSitePath(withoutQuery || "/");
  return canonical.length > 1 && canonical.endsWith("/")
    ? canonical.slice(0, -1)
    : canonical;
}

/** 셸 헤더/LNB 전용 경량 여정 단계·톤 해석기(상세 42라우트 사전 미포함). */
export function resolveShellJourneySummary(pathname: string): ShellPageJourneySummary {
  const path = normalizeShellPath(pathname);
  let best: ShellRouteTuple | null = null;
  let bestLength = -1;

  for (const tuple of SHELL_ROUTE_TUPLES) {
    const [pattern, , , exact] = tuple;
    const matched = exact
      ? path === pattern
      : pattern.endsWith("/")
        ? path.startsWith(pattern)
        : path === pattern || path.startsWith(`${pattern}/`);
    if (matched && pattern.length > bestLength) {
      best = tuple;
      bestLength = pattern.length;
    }
  }

  const stageNumber: JourneyStageNumber = best ? best[1] : 1;
  const accentTone: PageJourneyAccentTone = best ? best[2] : "creation";
  const stage = STAGE_BY_NUMBER[stageNumber];
  return {
    stageNumber,
    stageBadgeKo: stage.badgeKo,
    stageBadgeEn: stage.badgeEn,
    roleHeadlineKo: stage.subtitleKo,
    roleHeadlineEn: stage.subtitleEn,
    accentTone,
  };
}

/** 시맨틱 톤별 배지 Tailwind 클래스(원시 HEX 없이 시맨틱 토큰만 사용). */
export function accentToneBadgeClasses(tone: PageJourneyAccentTone): string {
  switch (tone) {
    case "creation":
      return "border-accent/40 bg-accent-soft text-accent";
    case "three-d":
      return "border-info/40 bg-info-soft text-info";
    case "collab":
      return "border-accent-2/40 bg-accent-soft text-fg";
    case "market":
      return "border-warning/40 bg-warning-soft text-warning";
    case "support":
      return "border-success/40 bg-success-soft text-success";
  }
}

/** 시맨틱 톤별 인터랙티브 칩 Tailwind 클래스(명시적 transition 속성 + 모션 감소 가드). */
export function accentToneChipClasses(
  tone: PageJourneyAccentTone,
  active = false,
): string {
  const base =
    "transition-[border-color,background-color,color,transform] duration-150 motion-reduce:transition-none";
  if (active) {
    switch (tone) {
      case "creation":
        return `${base} border-accent bg-accent-soft text-fg shadow-xs`;
      case "three-d":
        return `${base} border-info bg-info-soft text-fg shadow-xs`;
      case "collab":
        return `${base} border-accent-2 bg-accent-soft text-fg shadow-xs`;
      case "market":
        return `${base} border-warning bg-warning-soft text-fg shadow-xs`;
      case "support":
        return `${base} border-success bg-success-soft text-fg shadow-xs`;
    }
  }
  switch (tone) {
    case "creation":
      return `${base} border-line bg-card text-fg-2 hover:border-accent/55 hover:bg-raised hover:text-fg`;
    case "three-d":
      return `${base} border-line bg-card text-fg-2 hover:border-info/55 hover:bg-raised hover:text-fg`;
    case "collab":
      return `${base} border-line bg-card text-fg-2 hover:border-accent-2/55 hover:bg-raised hover:text-fg`;
    case "market":
      return `${base} border-line bg-card text-fg-2 hover:border-warning/55 hover:bg-raised hover:text-fg`;
    case "support":
      return `${base} border-line bg-card text-fg-2 hover:border-success/55 hover:bg-raised hover:text-fg`;
  }
}
