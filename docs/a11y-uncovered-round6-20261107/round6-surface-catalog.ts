import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = process.cwd();
const ROUND4_REPORT_PATH = path.join(
  REPO_ROOT,
  "docs/a11y-uncovered-round4-20261107/route-classification-report.json",
);
const OUT_DIR = path.join(REPO_ROOT, "docs/a11y-uncovered-round6-20261107");
const OUT_JSON_PATH = path.join(OUT_DIR, "route-classification-round6.json");

export interface Round6SelectedSurface {
  id: string;
  route: string;
  domainGroup: string;
  groupLabel: string;
  componentName: string;
  sourceFile: string;
  renderMode: "PUBLIC_RICH_UI" | "SYNTHETIC_FIXTURE_UI";
  syntheticFixtureNote: string;
}

export const ROUND6_SELECTED_SURFACES: readonly Round6SelectedSurface[] = [
  {
    id: "SURF-R6-01-CUTS-STUDIO",
    route: "/cuts/studio",
    domainGroup: "cuts",
    groupLabel: "숏폼 컷츠 무빙툰 스튜디오 · 렌더 파이프라인·키프레임·오토더킹 워크벤치",
    componentName: "CutsStudioPage",
    sourceFile: "apps/web/src/domains/cuts/CutsStudioPage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "비로그인 게스트에서도 REA 9:16 렌더 엔진·FPS·카메라 커브·오토더킹 시뮬레이터 및 타임라인 편집기가 즉시 렌더링됨",
  },
  {
    id: "SURF-R6-02-LEARN-TRACE",
    route: "/learn/trace",
    domainGroup: "learn",
    groupLabel: "창작 학습 · 비파괴 어니언스킨 따라 그리기(Trace) 실습실",
    componentName: "TracePracticePage",
    sourceFile: "apps/web/src/domains/learn/TracePracticePage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "정적 STEPS 및 드릴 타이머·어니언스킨 가이드 농도 인터랙티브 컨트롤이 즉시 렌더링됨",
  },
  {
    id: "SURF-R6-03-PDF-WORKBENCH",
    route: "/studio/pdf-workbench",
    domainGroup: "creator-pdf-workbench",
    groupLabel: "스튜디오 단행본·인쇄 PDF 병합·분할·재단·잉크 프로파일 워크벤치",
    componentName: "PdfWorkbenchPage",
    sourceFile: "apps/web/src/domains/creator/pdf-workbench/PdfWorkbenchPage.tsx",
    renderMode: "SYNTHETIC_FIXTURE_UI",
    syntheticFixtureNote:
      "기본 재단·잉크 프로파일 바에 더해 합성 2페이지 PDF(pdf-lib 메모리 생성)를 업로드하여 파일/페이지별 회전·이동·삭제 버튼까지 실브라우저 검증",
  },
  {
    id: "SURF-R6-04-TASTE-ONBOARDING",
    route: "/onboarding/taste",
    domainGroup: "engagement",
    groupLabel: "독자 취향 스펙트럼 4단계 온보딩 위저드 (장르·감상 강도·회피 태그·요약)",
    componentName: "TasteOnboardingPage",
    sourceFile: "apps/web/src/domains/engagement/TasteOnboardingPage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "로컬 상태 기반 4단계(장르 선택 → 감상 강도 → 회피 태그 → 완성 요약) 전 단계 인터랙티브 전환 검증",
  },
  {
    id: "SURF-R6-05-STUDIO-TEMPLATES",
    route: "/studio/templates",
    domainGroup: "creator-templates",
    groupLabel: "스튜디오 작품 템플릿 갤러리 · 카테고리·규격 빠른 필터·즐겨찾기",
    componentName: "StudioTemplatesPage",
    sourceFile: "apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "정적 STUDIO_TEMPLATES 카탈로그 및 카테고리·규격 빠른 필터·검색·즐겨찾기 UI 전체 렌더링",
  },
  {
    id: "SURF-R6-06-CREATE-START",
    route: "/create",
    domainGroup: "creator-start",
    groupLabel: "작품 시작하기 관문 · 상황별 추천·웹소설→웹툰 4단계 파이프라인",
    componentName: "CreateStartPage",
    sourceFile: "apps/web/src/domains/creator/CreateStartPage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "구역 보기 전환(추천 시작/다른 시작 방법/주제·제작 도구/이어서 작업) 및 아코디언·카드 그리드 즉시 렌더링",
  },
  {
    id: "SURF-R6-07-STUDIO-TOOLCHAIN",
    route: "/studio/toolchain",
    domainGroup: "creator-toolchain",
    groupLabel: "스튜디오 프로덕션 툴체인 · 로컬 실행기 파이프라인·재현 영수증 인스펙터",
    componentName: "StudioProductionToolchainPage",
    sourceFile: "apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "4대 로컬 실행기 트랙(Flamenco/ComfyUI/Natron/Scribus) 전환 및 제작 영역별 도구 그리드 전체 렌더링",
  },
  {
    id: "SURF-R6-08-HIRING-POSITIONS",
    route: "/collaborate/positions",
    domainGroup: "collaboration-hiring",
    groupLabel: "구인·의뢰 모집 조건 탐색 · 직무별 표준 단가 & 3단계 에스크로 계산기",
    componentName: "HiringPositionsPage",
    sourceFile: "apps/web/src/domains/collaboration/hiring/HiringPositionsPage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "직무 단가 프리셋 4종·회차 기준 컷수(60/70/85컷) 에스크로 계산기 및 외주 표준 스펙 스위트 렌더링",
  },
  {
    id: "SURF-R6-09-SHOWCASE-PROMO",
    route: "/showcase/promo",
    domainGroup: "creator-promo",
    groupLabel: "웹툰 예고편·숏폼 홍보 영상 제작기 · 3초 바이럴 훅 디렉터·합성 BGM",
    componentName: "StudioPromoPage",
    sourceFile: "apps/web/src/domains/creator/promo/StudioPromoPage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "예고편 3초 훅 아키타입 4종 전환, 영상 기획 폼, 로컬 합성 BGM·오디오 믹서·보이스 디렉터 전체 렌더링",
  },
  {
    id: "SURF-R6-10-SITEMAP",
    route: "/sitemap",
    domainGroup: "legal-navigation",
    groupLabel: "전체 서비스 사이트맵 · 6대 맥락 허브·디렉토리 검색·단계별 아코디언",
    componentName: "SitemapPage",
    sourceFile: "apps/web/src/domains/legal/SitemapPage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "6대 핵심 맥락 허브, 6단계 창작-홍보 파이프라인, 사이트 디렉토리 검색, 코어 목적지 아코디언 그룹 전체 렌더링",
  },
  {
    id: "SURF-R6-11-DESIGN-SYSTEM",
    route: "/design",
    domainGroup: "legal-design-system",
    groupLabel: "디자인 시스템 레퍼런스 · 타이포·색상·모션·UI 프리미티브 갤러리",
    componentName: "DesignSystemPage",
    sourceFile: "apps/web/src/domains/legal/DesignSystemPage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "토큰 스케일, 모션 데모(shimmer/pulse-soft/count-up/fill-in), Button/Badge/Chip/Select/Segmented/UnderlineTabs 갤러리 전체 렌더링",
  },
  {
    id: "SURF-R6-12-CREATOR-RESEARCH",
    route: "/research",
    domainGroup: "creator-resources",
    groupLabel: "창작 리서치 데스크 · 레퍼런스·고증 자료 검색·작업공간 탭·출처 점검",
    componentName: "CreatorHubPage",
    sourceFile: "apps/web/src/domains/creator-resources/CreatorHubPage.tsx",
    renderMode: "PUBLIC_RICH_UI",
    syntheticFixtureNote:
      "리서치 검색 패널, 4개 작업 영역 탭(진행 현황/리서치 초점/판단 노트/저장 보드), 3단계 가이드 및 출처 점검 아코디언 전체 렌더링",
  },
] as const;

const EXCLUDED_BY_OWNER_OR_DOMAIN = new Map<string, string>([
  ["/about", "Round 4 기검증 12개 표면에 포함"],
  ["/business-plan", "Round 4 기검증 12개 표면에 포함"],
  ["/market/compare", "Market 도메인 제외 지시 반영"],
  ["/market/fit", "Market 도메인 제외 지시 반영"],
  ["/market/fit-lab", "Market 도메인 제외 지시 반영"],
  ["/membership/usage", "Pricing/Billing 도메인 제외 + 비로그인 인증 장벽"],
  ["/memberships", "Pricing/Billing 도메인 제외 + 비로그인 인증 장벽"],
  ["/studio/anchor-lab", "Character 관련(캐릭터 앵커 일관성 실험실) 제외 지시 반영"],
  ["/install", "공유 UI(shared/pwa) 제외 지시 반영"],
  ["/offline", "공유 UI(shared/pwa) 제외 지시 반영"],
]);

const AUTH_GATED_ROUTES = new Map<string, string>([
  ["/asset-points", "비로그인 시 포인트 지갑 본문 대신 로그인 유도 안내만 렌더링"],
  ["/me", "비로그인 시 계정 프로필 편집 본문 미노출"],
  ["/creator/early-access", "세션 기반 작가 전용 유료분 설정 화면(비로그인 차단)"],
  ["/newsletter", "비로그인(!actorId) 시 '로그인하면 구독을 관리할 수 있어요' 안내 카드만 노출"],
  ["/newsletter/compose", "비로그인(!actorId) 시 실제 뉴스레터 발송 폼이 차단됨"],
  ["/collaborate/moderation", "useAdminGate()로 비로그인/일반 사용자 접근 차단"],
  ["/collaborate/new", "비로그인 시 실제 모집 공고 작성 제출이 차단됨"],
  ["/collaborate/visual-audit/edit", "비로그인 및 정적 슬러그(:id) 편집 권한 부재로 차단"],
  ["/community/promote/new", "비로그인(!userId) 시 홍보 글 작성 폼 대신 로그인 안내만 노출"],
  ["/community/promote/moderation", "비로그인(!userId) 시 신고 관리 목록 차단"],
  ["/cuts/rewards", "비로그인 시 정산 원장 상세 조회 제한"],
  ["/team/organization", "비로그인(!userId) 시 organization-signed-out-title 안내 카드만 노출"],
  ["/team/people", "비로그인(!userId) 시 SignedOutTeamIntro 안내만 노출"],
  ["/team/people/join", "유효 초대 토큰 및 로그인 필수"],
  ["/team/people/visual-audit/usage", "비로그인(!userId) 시 '로그인하면 사용량을 확인할 수 있어요' 안내만 노출"],
  ["/ecosystem/library", "비로그인(!userId) 시 개인 서재 API 로드 생략 및 빈 상태"],
  ["/hub", "세션/로컬 워크스페이스 프로젝트 유무에 의존"],
]);

const API_OR_EMPTY_DATA_ROUTES = new Map<string, string>([
  ["/collaborate/visual-audit", "동적 슬러그(:id=visual-audit) 백엔드 조회 실패 시 에러/빈 카드만 노출"],
  ["/pencafe/visual-audit", "동적 슬러그(:handle=visual-audit) 팬카페 피드 API 부재 시 에러 상태 노출"],
  ["/production/pinned-review", "유효 공유 토큰(?token=...) 부재 시 '검토 링크가 올바르지 않거나...' 에러 노출"],
  ["/showcase/reviews/visual-audit", "유효 공유 토큰 부재로 에러 카드 노출"],
  ["/production/review/visual-audit/visual-audit", "외부 리뷰 세션 API 부재 시 ErrorState 노출"],
  ["/share/version/visual-audit", "버전 공유 토큰 부재 시 blocked/error 상태 노출"],
  ["/showcase/work/visual-audit", "작품 슬러그 API 부재 시 ErrorState/NotFound 노출"],
  ["/opportunities", "외부/백엔드 검색 API 의존으로 빈 결과 노출"],
  ["/studio/analytics", "백엔드 분석 API 실패 시 초기 화면이 ShowcaseEmptyState로 폴백"],
  ["/publish", "상단 REA 바는 표시되나 본문 카탈로그 섹션이 /api/integrations/catalog 응답에 의존"],
  ["/developers", "상단 REA 바는 표시되나 본문 매니페스트 섹션이 /api/integrations/developer-manifest 응답에 의존"],
]);

const REDIRECT_OR_MULTI_MOUNT_ROUTES = new Map<string, string>([
  ["/studio/ai-runtime", "<Navigate replace to='/studio/ai-lab?...' /> 단순 리다이렉트"],
  ["/studio/ai-settings", "<Navigate replace to='/settings/ai?source=studio' /> 단순 리다이렉트"],
  ["/studio/join", "StudioProductionHubPage 단일 컴포넌트 다중 마운트(?demo=1 필요)"],
  ["/studio/present", "StudioProductionHubPage 단일 컴포넌트 다중 마운트(?demo=1 필요)"],
  ["/studio/projects", "StudioProductionHubPage 단일 컴포넌트 다중 마운트(?demo=1 필요)"],
  ["/studio/review", "StudioProductionHubPage 단일 컴포넌트 다중 마운트(?demo=1 필요)"],
  ["/studio/share", "StudioProductionHubPage 단일 컴포넌트 다중 마운트(?demo=1 필요)"],
  ["/studio/versions", "StudioProductionHubPage 단일 컴포넌트 다중 마운트(?demo=1 필요)"],
]);

export function buildRound6ClassificationReport() {
  const round4Raw = JSON.parse(fs.readFileSync(ROUND4_REPORT_PATH, "utf8"));
  const round4Secondary: Array<{ route: string; reason?: string }> = (
    round4Raw.classifiedRoutes || []
  ).filter((entry: { disposition: string }) => entry.disposition === "uncovered-secondary");

  const selectedMap = new Map(ROUND6_SELECTED_SURFACES.map((s) => [s.route, s]));

  const classifiedSecondary = round4Secondary.map((entry) => {
    const route = entry.route;
    const selected = selectedMap.get(route);
    if (selected) {
      return {
        route,
        round6Disposition: "selected-round6-12" as const,
        surfaceId: selected.id,
        componentName: selected.componentName,
        sourceFile: selected.sourceFile,
        renderMode: selected.renderMode,
        verificationStatus: "VERIFIED_IN_ROUND6_REAL_BROWSER" as const,
        note: selected.syntheticFixtureNote,
      };
    }
    if (EXCLUDED_BY_OWNER_OR_DOMAIN.has(route)) {
      return {
        route,
        round6Disposition: "excluded-active-owner-or-domain" as const,
        verificationStatus: "EXCLUDED_BY_SCOPE_RULE" as const,
        note: EXCLUDED_BY_OWNER_OR_DOMAIN.get(route)!,
      };
    }
    if (AUTH_GATED_ROUTES.has(route)) {
      return {
        route,
        round6Disposition: "auth-gated-wall" as const,
        verificationStatus: "NOT_VERIFIED_AUTH_REQUIRED" as const,
        note: AUTH_GATED_ROUTES.get(route)!,
      };
    }
    if (API_OR_EMPTY_DATA_ROUTES.has(route)) {
      return {
        route,
        round6Disposition: "api-or-token-dependent-empty-or-error" as const,
        verificationStatus: "NOT_VERIFIED_EMPTY_OR_API_DEPENDENT" as const,
        note: API_OR_EMPTY_DATA_ROUTES.get(route)!,
      };
    }
    if (REDIRECT_OR_MULTI_MOUNT_ROUTES.has(route)) {
      return {
        route,
        round6Disposition: "redirect-or-multi-mount-query-gated" as const,
        verificationStatus: "NOT_VERIFIED_REDIRECT_OR_DUPLICATE_HOST" as const,
        note: REDIRECT_OR_MULTI_MOUNT_ROUTES.get(route)!,
      };
    }
    return {
      route,
      round6Disposition: "remaining-uncovered-backlog" as const,
      verificationStatus: "DEFERRED_SECONDARY_BACKLOG" as const,
      note: "게스트 렌더링 가능 보조 화면 — 이번 Round 6 대표 12개 선정 이후 차순위 백로그로 보존",
    };
  });

  const countsByRound6Disposition = classifiedSecondary.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.round6Disposition] = (acc[item.round6Disposition] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const report = {
    generatedAt: "2026-11-07",
    sourceRound4Report: "../a11y-uncovered-round4-20261107/route-classification-report.json",
    totalRound4SecondaryCandidates: round4Secondary.length,
    selectedRound6SurfaceCount: ROUND6_SELECTED_SURFACES.length,
    countsByRound6Disposition,
    selectedSurfaces: ROUND6_SELECTED_SURFACES,
    classifiedSecondaryRoutes: classifiedSecondary,
  };

  const header = {
    generatedAt: report.generatedAt,
    sourceRound4Report: report.sourceRound4Report,
    totalRound4SecondaryCandidates: report.totalRound4SecondaryCandidates,
    selectedRound6SurfaceCount: report.selectedRound6SurfaceCount,
    countsByRound6Disposition: report.countsByRound6Disposition,
    selectedSurfaces: report.selectedSurfaces,
  };
  const headerJson = JSON.stringify(header, null, 2);
  const routeLines = report.classifiedSecondaryRoutes.map((r) => `    ${JSON.stringify(r)}`).join(",\n");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    OUT_JSON_PATH,
    `${headerJson.slice(0, -2)},\n  "classifiedSecondaryRoutes": [\n${routeLines}\n  ]\n}\n`,
    "utf8",
  );
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildRound6ClassificationReport();
  console.log(
    JSON.stringify(
      {
        totalRound4SecondaryCandidates: report.totalRound4SecondaryCandidates,
        selectedRound6SurfaceCount: report.selectedRound6SurfaceCount,
        countsByRound6Disposition: report.countsByRound6Disposition,
      },
      null,
      2,
    ),
  );
}
