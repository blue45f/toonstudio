/**
 * my-space-daily-pulse.ts — `/my` 내 공간 "오늘의 작업 리듬" 모멘텀 리본 순수 모델.
 *
 * 가짜 통계 없이 실제 브라우저/계정 상태(`useApp` 읽기·평가·컬렉션 카운트,
 * `creator-continuity` 최근 목적지, 세션 상태, 현재 역할 필터)만을 입력받아
 * 1순위 다음 행동, 독자·창작·계정 3대 영역 실측 활성도 요약, 1탭 모드 전환 추천을 계산한다.
 */

import type {
  CreatorDestinationId,
  CreatorRecentDestination,
} from "@/shared/lib/creator-continuity";

export type MySpacePulseRole = "reader" | "creator" | "account";
export type MySpacePulseCategory = "all" | MySpacePulseRole;
export type MySpaceTopActionKind =
  | "resume-studio"
  | "revisit-recent"
  | "check-library"
  | "start-sample";

export interface MySpaceDailyPulseInput {
  readonly hydrated: boolean;
  readonly readsCount: number;
  readonly ratingsCount: number;
  readonly collectionsCount: number;
  readonly recentEntries: readonly CreatorRecentDestination[];
  readonly sessionStatus: string;
  readonly activeCategory: string;
}

export interface MySpaceTopAction {
  readonly kind: MySpaceTopActionKind;
  readonly href: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly ctaKo: string;
  readonly ctaEn: string;
  readonly toneVar: string;
}

export interface MySpaceDomainPulse {
  readonly role: MySpacePulseRole;
  readonly areaLabelKo: string;
  readonly areaLabelEn: string;
  readonly modeLabelKo: string;
  readonly modeLabelEn: string;
  readonly count: number;
  readonly hasActivity: boolean;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly barRatio: number;
  readonly toneVar: string;
  readonly isRecommended: boolean;
  readonly isActiveFilter: boolean;
}

export interface MySpaceDailyPulseModel {
  readonly hydrated: boolean;
  readonly topAction: MySpaceTopAction;
  readonly recommendedRole: MySpacePulseRole;
  readonly recommendedReasonKo: string;
  readonly recommendedReasonEn: string;
  readonly domains: readonly [MySpaceDomainPulse, MySpaceDomainPulse, MySpaceDomainPulse];
  readonly totalObservedSignals: number;
}

const CREATOR_DESTINATION_IDS: ReadonlySet<CreatorDestinationId> = new Set([
  "studio",
  "comic",
  "shaper",
  "market",
  "daily",
  "research",
  "reference-atlas",
  "opportunities",
  "gallery",
]);

const READER_DESTINATION_IDS: ReadonlySet<CreatorDestinationId> = new Set([
  "explore",
  "ranking",
  "calendar",
  "community",
]);

function clampNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function isValidRecentEntry(entry: CreatorRecentDestination | undefined): entry is CreatorRecentDestination {
  return Boolean(entry && typeof entry.href === "string" && entry.href.trim().startsWith("/"));
}

export function buildMySpaceDailyPulse(input: MySpaceDailyPulseInput): MySpaceDailyPulseModel {
  const readsCount = input.hydrated ? clampNonNegativeInt(input.readsCount) : 0;
  const ratingsCount = input.hydrated ? clampNonNegativeInt(input.ratingsCount) : 0;
  const collectionsCount = input.hydrated ? clampNonNegativeInt(input.collectionsCount) : 0;
  const readerRecordTotal = readsCount + ratingsCount + collectionsCount;

  const validRecent = input.recentEntries.filter(isValidRecentEntry);
  const recentStudio = validRecent.find((entry) => entry.id === "studio") ?? null;
  const latestRecent = validRecent[0] ?? null;

  const creatorVisits = validRecent.filter((entry) => CREATOR_DESTINATION_IDS.has(entry.id));
  const readerVisits = validRecent.filter((entry) => READER_DESTINATION_IDS.has(entry.id));
  const creatorCount = creatorVisits.length;
  const isAuthenticated = input.sessionStatus === "authenticated";
  const isAuthLoading = input.sessionStatus === "loading";
  const accountCount = isAuthenticated ? 1 : 0;

  // 1순위 다음 행동 결정 — 실제 스튜디오 방문 → 기타 최근 방문 → 서재 기록 → 첫 10분 샘플 순.
  let topAction: MySpaceTopAction;
  if (recentStudio) {
    topAction = {
      kind: "resume-studio",
      href: recentStudio.href,
      badgeKo: "1순위 · 스튜디오 이어가기",
      badgeEn: "Next · Resume Studio",
      titleKo: "최근 열었던 스튜디오 작업부터 이어가요",
      titleEn: "Pick up right from your latest Studio session",
      detailKo:
        creatorCount > 1
          ? `최근 창작 이동 ${creatorCount}곳 중 스튜디오 작업 기록이 남아 있습니다.`
          : "브라우저에 남아 있는 최근 스튜디오 작업 위치로 바로 이동합니다.",
      detailEn:
        creatorCount > 1
          ? `Studio is ready among ${creatorCount} recent creator stops in this browser.`
          : "Jump directly back to your most recent Studio editing spot.",
      ctaKo: "스튜디오 바로 열기",
      ctaEn: "Open Studio now",
      toneVar: "var(--color-accent)",
    };
  } else if (latestRecent) {
    topAction = {
      kind: "revisit-recent",
      href: latestRecent.href,
      badgeKo: "1순위 · 방금 보던 화면",
      badgeEn: "Next · Recent screen",
      titleKo: "직전에 살펴보던 화면으로 빠르게 돌아가요",
      titleEn: "Return quickly to the screen you visited last",
      detailKo: `최근 방문 ${validRecent.length}곳 중 가장 최근 화면으로 바로 이어집니다.`,
      detailEn: `Resume the latest destination from your ${validRecent.length} recent visits.`,
      ctaKo: "최근 화면 열기",
      ctaEn: "Open recent screen",
      toneVar: "var(--color-cool)",
    };
  } else if (readerRecordTotal > 0) {
    topAction = {
      kind: "check-library",
      href: "/library",
      badgeKo: "1순위 · 서재 확인",
      badgeEn: "Next · Check Library",
      titleKo: "읽던 작품과 서재 기록을 먼저 정리해요",
      titleEn: "Review your active library and reading notes first",
      detailKo: `읽기 ${readsCount} · 평가 ${ratingsCount} · 컬렉션 ${collectionsCount}건이 브라우저에 저장돼 있습니다.`,
      detailEn: `${readsCount} reads · ${ratingsCount} ratings · ${collectionsCount} collections saved locally.`,
      ctaKo: "서재 바로 열기",
      ctaEn: "Open library",
      toneVar: "var(--color-cool)",
    };
  } else {
    topAction = {
      kind: "start-sample",
      href: "/production/projects/sample-project/overview",
      badgeKo: "1순위 · 첫 시작 추천",
      badgeEn: "Next · First step",
      titleKo: "아직 작업 기록이 없어요. 10분 샘플로 흐름을 익혀 보세요",
      titleEn: "No saved activity yet. Try the 10-minute sample project first",
      detailKo: "실제 원고와 분리된 샘플 프로젝트에서 콘티·캔버스·발행 흐름을 가볍게 체험할 수 있어요.",
      detailEn: "Explore storyboard, canvas, and publishing in an isolated sample workspace.",
      ctaKo: "샘플 체험 시작",
      ctaEn: "Try 10-min sample",
      toneVar: "var(--color-accent)",
    };
  }

  // 1탭 역할 필터 추천 — 실제 실측 신호 우선순위에 따라 계산한다.
  let recommendedRole: MySpacePulseRole;
  let recommendedReasonKo: string;
  let recommendedReasonEn: string;

  if (recentStudio || (creatorCount > 0 && creatorCount >= readerVisits.length)) {
    recommendedRole = "creator";
    recommendedReasonKo = "최근 창작·스튜디오 방문 기록이 있어 창작 집중 보기를 추천해요.";
    recommendedReasonEn = "Recent creator visits detected — Creator focus brings tools up front.";
  } else if (readerRecordTotal > 0 || readerVisits.length > 0) {
    recommendedRole = "reader";
    recommendedReasonKo = "서재·감상 기록이 활성화되어 있어 독자 집중 보기를 추천해요.";
    recommendedReasonEn = "Active library records detected — Reading focus highlights your shelf.";
  } else if (isAuthenticated) {
    recommendedRole = "account";
    recommendedReasonKo = "로그인된 계정의 프로필·AI 연결 상태를 먼저 점검해 보세요.";
    recommendedReasonEn = "Signed-in account detected — review profile and AI connections first.";
  } else {
    recommendedRole = "creator";
    recommendedReasonKo = "로그인 없이도 바로 시작할 수 있도록 창작 집중 보기를 추천해요.";
    recommendedReasonEn = "Start right away without sign-in using Creator focus.";
  }

  const activeCategory = input.activeCategory.trim().toLowerCase();

  const readerPulse: MySpaceDomainPulse = {
    role: "reader",
    areaLabelKo: "독자·감상",
    areaLabelEn: "Reading",
    modeLabelKo: "독자 집중",
    modeLabelEn: "Reading focus",
    count: readerRecordTotal,
    hasActivity: readerRecordTotal > 0,
    summaryKo: !input.hydrated
      ? "불러오는 중"
      : readerRecordTotal > 0
        ? `서재 기록 ${readerRecordTotal}건`
        : "아직 기록 없음 · 지금 시작",
    summaryEn: !input.hydrated
      ? "Loading"
      : readerRecordTotal > 0
        ? `${readerRecordTotal} library records`
        : "No records yet · Start now",
    hintKo:
      readerRecordTotal > 0
        ? `읽기 ${readsCount} · 평가 ${ratingsCount} · 컬렉션 ${collectionsCount}`
        : "서재·멤버십·소식지 4개",
    hintEn:
      readerRecordTotal > 0
        ? `${readsCount} reads · ${ratingsCount} ratings · ${collectionsCount} lists`
        : "4 reading destinations",
    barRatio: readerRecordTotal > 0 ? Math.min(1, readerRecordTotal / 10) : 0,
    toneVar: "var(--color-cool)",
    isRecommended: recommendedRole === "reader",
    isActiveFilter: activeCategory === "reader",
  };

  const creatorPulse: MySpaceDomainPulse = {
    role: "creator",
    areaLabelKo: "창작·스튜디오",
    areaLabelEn: "Creator",
    modeLabelKo: "창작 집중",
    modeLabelEn: "Creator focus",
    count: creatorCount,
    hasActivity: creatorCount > 0,
    summaryKo: !input.hydrated
      ? "불러오는 중"
      : creatorCount > 0
        ? `최근 창작 이동 ${creatorCount}곳`
        : "아직 기록 없음 · 지금 시작",
    summaryEn: !input.hydrated
      ? "Loading"
      : creatorCount > 0
        ? `${creatorCount} recent creator stops`
        : "No records yet · Start now",
    hintKo: recentStudio ? "스튜디오 바로 복귀 가능" : "프로젝트·에셋·수익 6개",
    hintEn: recentStudio ? "Studio resume ready" : "6 studio & creator destinations",
    barRatio: creatorCount > 0 ? Math.min(1, creatorCount / 4) : 0,
    toneVar: "var(--color-accent)",
    isRecommended: recommendedRole === "creator",
    isActiveFilter: activeCategory === "creator",
  };

  const accountPulse: MySpaceDomainPulse = {
    role: "account",
    areaLabelKo: "계정·AI",
    areaLabelEn: "Account & AI",
    modeLabelKo: "설정·AI 점검",
    modeLabelEn: "Account & AI",
    count: accountCount,
    hasActivity: isAuthenticated,
    summaryKo: isAuthLoading
      ? "상태 확인 중"
      : isAuthenticated
        ? "계정 동기화 연결됨"
        : "아직 기록 없음 · 지금 시작",
    summaryEn: isAuthLoading
      ? "Checking session"
      : isAuthenticated
        ? "Account sync active"
        : "No records yet · Start now",
    hintKo: isAuthenticated ? "프로필·메시지·BYOK AI 4개" : "브라우저 로컬 보관 중 · 4개",
    hintEn: isAuthenticated ? "4 profile & BYOK AI tools" : "Local browser storage · 4 tools",
    barRatio: isAuthenticated ? 1 : 0,
    toneVar: "var(--color-good)",
    isRecommended: recommendedRole === "account",
    isActiveFilter: activeCategory === "account",
  };

  return {
    hydrated: input.hydrated,
    topAction,
    recommendedRole,
    recommendedReasonKo,
    recommendedReasonEn,
    domains: [readerPulse, creatorPulse, accountPulse],
    totalObservedSignals: readerRecordTotal + creatorCount + accountCount,
  };
}
