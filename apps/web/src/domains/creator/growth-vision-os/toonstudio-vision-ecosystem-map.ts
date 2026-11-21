/**
 * 3초 이해 ToonStudio OS 인터랙티브 비주얼 비전 지도 모델.
 *
 * - 6대 창작 기둥(OKLCH 6색 스펙트럼)
 * - 7대 직군 필터 + 4대 숙련도 필터(초보 / 프로 / 스튜디오 PD / 해외 바이어)
 * - 목표별 1클릭 진입 대상(성장 워크벤치 탭 직접 점프 + 스튜디오 경로 딥링크)
 */

export type VisionPillarId =
  | "beginner-start"
  | "pro-drawing"
  | "hyper-ai"
  | "team-sos"
  | "publish-qa"
  | "ip-monetize";

export type VisionRoleId =
  | "all"
  | "solo-beginner"
  | "main-artist"
  | "color-bg-artist"
  | "story-writer"
  | "studio-pd"
  | "academy-mentor"
  | "global-buyer";

export type VisionProficiencyId =
  | "all"
  | "beginner"
  | "pro"
  | "studio-pd"
  | "global-buyer";

export type GrowthWorkbenchTabId =
  | "live-broadcast"
  | "buyer-pitch"
  | "live-critique"
  | "device-handoff"
  | "hiatus-qa";

export interface VisionRoleFilterOption {
  readonly id: VisionRoleId;
  readonly label: string;
  readonly shortTag: string;
  readonly defaultProficiency: VisionProficiencyId;
}

export interface VisionProficiencyOption {
  readonly id: VisionProficiencyId;
  readonly label: string;
  readonly badge: string;
}

export interface VisionFeatureNode {
  readonly id: string;
  readonly title: string;
  readonly oneLineValue: string;
  readonly routePath: string;
  readonly growthTabId?: GrowthWorkbenchTabId;
  readonly roles: readonly Exclude<VisionRoleId, "all">[];
  readonly proficiencies: readonly Exclude<VisionProficiencyId, "all">[];
}

export interface VisionPillarDefinition {
  readonly id: VisionPillarId;
  readonly orderLabel: string;
  readonly title: string;
  readonly threeSecondTagline: string;
  readonly spectrumClass: string;
  readonly accentOklch: string;
  readonly primaryRoutePath: string;
  readonly linkedGrowthTabId?: GrowthWorkbenchTabId;
  readonly roles: readonly Exclude<VisionRoleId, "all">[];
  readonly proficiencies: readonly Exclude<VisionProficiencyId, "all">[];
  readonly features: readonly VisionFeatureNode[];
}

export interface ResolvedVisionFeatureNode extends VisionFeatureNode {
  readonly matched: boolean;
}

export interface ResolvedVisionPillar extends VisionPillarDefinition {
  readonly highlighted: boolean;
  readonly relevanceScore: number;
  readonly matchedFeatureCount: number;
  readonly resolvedFeatures: readonly ResolvedVisionFeatureNode[];
}

export interface VisionEcosystemResolution {
  readonly roleId: VisionRoleId;
  readonly proficiencyId: VisionProficiencyId;
  readonly headline3Sec: string;
  readonly pillars: readonly ResolvedVisionPillar[];
  readonly highlightedPillarIds: readonly VisionPillarId[];
  readonly primaryJump: {
    readonly pillarId: VisionPillarId;
    readonly label: string;
    readonly routePath: string;
    readonly growthTabId?: GrowthWorkbenchTabId;
    readonly summary: string;
  };
  readonly totalFeatureCount: number;
  readonly matchedFeatureCount: number;
}

/** 7대 창작 직군 (+ 전체 보기) */
export const VISION_ROLE_FILTERS: readonly VisionRoleFilterOption[] = [
  { id: "all", label: "전체 직군", shortTag: "ALL", defaultProficiency: "all" },
  { id: "solo-beginner", label: "입문·1인 지망생", shortTag: "입문", defaultProficiency: "beginner" },
  { id: "main-artist", label: "메인 작화가", shortTag: "선화", defaultProficiency: "pro" },
  { id: "color-bg-artist", label: "채색·배경·3D 어시", shortTag: "3D/채색", defaultProficiency: "pro" },
  { id: "story-writer", label: "글작가·콘티·각색", shortTag: "스토리", defaultProficiency: "pro" },
  { id: "studio-pd", label: "스튜디오 PD·편집자", shortTag: "PD", defaultProficiency: "studio-pd" },
  { id: "academy-mentor", label: "학원·대학 멘토", shortTag: "멘토", defaultProficiency: "pro" },
  { id: "global-buyer", label: "해외 판권 바이어", shortTag: "바이어", defaultProficiency: "global-buyer" },
];

/** 4대 숙련도 필터 (+ 전체) */
export const VISION_PROFICIENCY_FILTERS: readonly VisionProficiencyOption[] = [
  { id: "all", label: "전체 단계", badge: "6기둥" },
  { id: "beginner", label: "초보", badge: "3분 시작" },
  { id: "pro", label: "프로", badge: "작화·속도" },
  { id: "studio-pd", label: "스튜디오 PD", badge: "분업·출판" },
  { id: "global-buyer", label: "해외 바이어", badge: "IP·판권" },
];

/** ToonStudio OS 6대 창작 기둥 (OKLCH 6색 스펙트럼) */
export const TOONSTUDIO_VISION_PILLARS: readonly VisionPillarDefinition[] = [
  {
    id: "beginner-start",
    orderLabel: "01",
    title: "초보 3분 시작·소재 검색",
    threeSecondTagline: "빈 캔버스 고민 없이 장르 스타터 킷과 ⌘K 소재 검색으로 3분 만에 첫 컷 완성",
    spectrumClass: "gvos-pillar-1",
    accentOklch: "oklch(0.66 0.17 42)",
    primaryRoutePath: "/studio?mode=beginner",
    linkedGrowthTabId: "live-critique",
    roles: ["solo-beginner", "academy-mentor", "story-writer"],
    proficiencies: ["beginner"],
    features: [
      {
        id: "feat-starter-kits",
        title: "원클릭 장르 스타터 킷",
        oneLineValue: "로판·액션·일상 4컷 템플릿과 쉬운 4버튼 화면으로 첫 화 진입",
        routePath: "/studio?mode=beginner&kit=rofan",
        roles: ["solo-beginner", "academy-mentor"],
        proficiencies: ["beginner"],
      },
      {
        id: "feat-global-asset-search",
        title: "전역 ⌘K 소재·브러시 검색",
        oneLineValue: "말풍선·배경·톤·포즈를 한 검색창에서 찾아 캔버스에 즉시 배치",
        routePath: "/studio?palette=assets",
        roles: ["solo-beginner", "main-artist", "color-bg-artist"],
        proficiencies: ["beginner", "pro"],
      },
      {
        id: "feat-academy-critique",
        title: "학원·멘토 라이브 첨삭 교실",
        oneLineValue: "수강생 원본을 잠근 채 강사 레드라인과 Before/After 브러시 시연 리플레이",
        routePath: "/studio/critique-classroom",
        growthTabId: "live-critique",
        roles: ["solo-beginner", "academy-mentor"],
        proficiencies: ["beginner", "pro"],
      },
    ],
  },
  {
    id: "pro-drawing",
    orderLabel: "02",
    title: "프로 작화·브러시·3D",
    threeSecondTagline: "필압 120Hz 엔진·3D 배경/포즈 연동·아이패드↔PC 오프라인 이어 그리기",
    spectrumClass: "gvos-pillar-2",
    accentOklch: "oklch(0.64 0.15 162)",
    primaryRoutePath: "/studio/canvas",
    linkedGrowthTabId: "device-handoff",
    roles: ["main-artist", "color-bg-artist", "academy-mentor"],
    proficiencies: ["pro"],
    features: [
      {
        id: "feat-pro-brush-3d",
        title: "프로 잉킹·채색·3D 배경 연동",
        oneLineValue: "벡터 선화·어시스트 채색·3D 카메라 구도 추출을 한 캔버스에서 처리",
        routePath: "/studio/canvas?tool=pro-ink",
        roles: ["main-artist", "color-bg-artist"],
        proficiencies: ["pro"],
      },
      {
        id: "feat-device-handoff",
        title: "아이패드·갤럭시탭·PC 이어 그리기",
        oneLineValue: "활성 브러시·줌·회전각·미저장 차분을 오프라인 토큰으로 무손실 복원",
        routePath: "/studio/handoff",
        growthTabId: "device-handoff",
        roles: ["main-artist", "color-bg-artist", "solo-beginner"],
        proficiencies: ["beginner", "pro"],
      },
      {
        id: "feat-live-broadcast",
        title: "실시간 드로잉 방송 · 15초 쇼츠",
        oneLineValue: "미공개 대사·스포일러 자동 블러 송출과 9:16 30fps 타임랩스 자동 추출",
        routePath: "/studio/live-broadcast",
        growthTabId: "live-broadcast",
        roles: ["main-artist", "solo-beginner"],
        proficiencies: ["pro", "beginner"],
      },
    ],
  },
  {
    id: "hyper-ai",
    orderLabel: "03",
    title: "0~99% 하이퍼 AI 자동화",
    threeSecondTagline: "100% 수동 작화부터 99% 원클릭 자동 채색·식자·컷 분할까지 작가가 비율 조절",
    spectrumClass: "gvos-pillar-3",
    accentOklch: "oklch(0.61 0.17 254)",
    primaryRoutePath: "/studio/automation",
    roles: ["solo-beginner", "main-artist", "color-bg-artist", "story-writer"],
    proficiencies: ["beginner", "pro"],
    features: [
      {
        id: "feat-automation-slider",
        title: "수동 ↔ 99% 자동화 다이얼",
        oneLineValue: "선화 유지·밑색·명암·배경 톤 매칭 단계를 컷마다 선택 적용",
        routePath: "/studio/automation?dial=hybrid",
        roles: ["solo-beginner", "main-artist", "color-bg-artist"],
        proficiencies: ["beginner", "pro"],
      },
      {
        id: "feat-continuity-lettering",
        title: "자동 식자 · 떡밥·설정 충돌 감지",
        oneLineValue: "대본을 말풍선으로 배치하고 과거 회차 설정 모순을 발행 전 경고",
        routePath: "/studio/automation?tab=continuity",
        roles: ["story-writer", "studio-pd", "main-artist"],
        proficiencies: ["pro", "studio-pd"],
      },
    ],
  },
  {
    id: "team-sos",
    orderLabel: "04",
    title: "팀 분업·글로벌 외주 광장·휴재 SOS",
    threeSecondTagline: "콘티·선화·채색·후보정 동시 분업과 마감 위기 긴급 외주·휴재기 팬 소통 유지",
    spectrumClass: "gvos-pillar-4",
    accentOklch: "oklch(0.62 0.18 306)",
    primaryRoutePath: "/production/team-division",
    linkedGrowthTabId: "hiatus-qa",
    roles: ["studio-pd", "main-artist", "color-bg-artist", "story-writer"],
    proficiencies: ["studio-pd", "pro"],
    features: [
      {
        id: "feat-division-hub",
        title: "회차 분업 보드 · 가상 스튜디오",
        oneLineValue: "담당 파트별 컷 잠금·고정 검수본 핀 리뷰·실시간 출근 상태 공유",
        routePath: "/production/team-division",
        roles: ["studio-pd", "main-artist", "color-bg-artist"],
        proficiencies: ["studio-pd", "pro"],
      },
      {
        id: "feat-outsourcing-sos",
        title: "글로벌 외주 광장 · 휴재 SOS",
        oneLineValue: "마감 직전 선화·채색 긴급 지원 매칭과 해시체인 검수 정산",
        routePath: "/production/outsourcing-sos",
        roles: ["studio-pd", "main-artist"],
        proficiencies: ["studio-pd"],
      },
      {
        id: "feat-hiatus-qa",
        title: "휴재기 무스포일러 캐릭터 Q&A 봇",
        oneLineValue: "작가 승인 회차 안에서만 팬 질문에 답하고 공식 비하인드 카드 발급",
        routePath: "/studio/hiatus-fan-qa",
        growthTabId: "hiatus-qa",
        roles: ["story-writer", "studio-pd", "main-artist"],
        proficiencies: ["studio-pd", "pro"],
      },
    ],
  },
  {
    id: "publish-qa",
    orderLabel: "05",
    title: "6대 플랫폼 출판·7대 AI 자동 검수",
    threeSecondTagline: "네이버·카카오·레진·픽코마·라인망가·글로벌 규격 분할과 Rights BOM 원클릭 통과",
    spectrumClass: "gvos-pillar-5",
    accentOklch: "oklch(0.62 0.19 14)",
    primaryRoutePath: "/studio/export-preflight",
    roles: ["studio-pd", "main-artist", "story-writer"],
    proficiencies: ["studio-pd", "pro"],
    features: [
      {
        id: "feat-6platform-export",
        title: "6대 플랫폼 규격 일괄 내보내기",
        oneLineValue: "가로폭·세로 분할·파일 용량·C2PA 출처 서명과 Rights BOM 라이선스 검사",
        routePath: "/studio/export-preflight?preset=6-platforms",
        roles: ["studio-pd", "main-artist"],
        proficiencies: ["studio-pd", "pro"],
      },
      {
        id: "feat-7ai-qa-gate",
        title: "7대 AI 자동 검수 게이트",
        oneLineValue: "오탈자·말풍선 잘림·저작권 소재·심의 수위·해상도·레이어 누락 자동 점검",
        routePath: "/studio/export-preflight?gate=7-ai-qa",
        roles: ["studio-pd", "story-writer", "main-artist"],
        proficiencies: ["studio-pd", "pro"],
      },
    ],
  },
  {
    id: "ip-monetize",
    orderLabel: "06",
    title: "웹소설/드라마/애니 IP 확장·수익화",
    threeSecondTagline: "웹소설 양방향 각색·OTT 피칭·24fps 애니 X-Sheet·해외 바이어 1클릭 영·일문 피치 룸",
    spectrumClass: "gvos-pillar-6",
    accentOklch: "oklch(0.69 0.15 84)",
    primaryRoutePath: "/production/osmu-ip",
    linkedGrowthTabId: "buyer-pitch",
    roles: ["global-buyer", "studio-pd", "story-writer"],
    proficiencies: ["global-buyer", "studio-pd"],
    features: [
      {
        id: "feat-buyer-pitch-room",
        title: "해외 바이어 1클릭 영·일문 IP 피치 룸",
        oneLineValue: "비밀번호·만료·워터마크로 보호된 1~3화 번역본·캐릭터 시트·완독 지표 패키지",
        routePath: "/pitch-room/builder",
        growthTabId: "buyer-pitch",
        roles: ["global-buyer", "studio-pd"],
        proficiencies: ["global-buyer", "studio-pd"],
      },
      {
        id: "feat-osmu-pipeline",
        title: "웹소설·웹드라마·애니 24fps X-Sheet",
        oneLineValue: "웹툰 원고에서 OTT 드라마 트리트먼트와 24fps 애니 콘티 시트까지 즉시 연결",
        routePath: "/production/osmu-ip",
        roles: ["story-writer", "studio-pd", "global-buyer"],
        proficiencies: ["studio-pd", "global-buyer"],
      },
    ],
  },
];

const ROLE_HEADLINES: Record<VisionRoleId, string> = {
  all: "입문 3분 스타터부터 프로 작화·AI 자동화·팀 분업·6대 출판·해외 IP 판권까지 6대 기둥으로 이어지는 웹툰 제작 OS입니다.",
  "solo-beginner": "빈 화면 부담 없이 장르 스타터 킷으로 3분 만에 첫 컷을 만들고, 멘토 첨삭과 AI 보조로 데뷔 원고까지 완주합니다.",
  "main-artist": "120Hz 필압 작화·아이패드↔PC 오프라인 이어 그리기·스포일러 블러 라이브 방송으로 연재 속도와 팬덤을 함께 키웁니다.",
  "color-bg-artist": "3D 배경 연동·하이퍼 AI 밑색/명암·태블릿 오프라인 핸드오프로 반복 채색 시간을 절반 이하로 줄입니다.",
  "story-writer": "대본 자동 식자·떡밥 충돌 감지·휴재기 무스포일러 Q&A 봇·웹소설/OTT 각색까지 서사 자산을 한곳에서 지킵니다.",
  "studio-pd": "팀 분업·휴재 SOS 외주·7대 AI 출판 검수·해외 바이어 영·일문 피치 룸까지 스튜디오 전 공정을 한 화면에서 관제합니다.",
  "academy-mentor": "수강생 원본을 잠근 라이브 레드라인 첨삭 교실과 Before/After 브러시 리플레이로 실전 피드백 밀도를 높입니다.",
  "global-buyer": "비밀번호·워터마크가 적용된 영·일문 1~3화 샘플, 캐릭터 시트, 완독·유료전환 지표를 1클릭 피치 룸에서 바로 검토합니다.",
};

export function resolveVisionEcosystemMap(params: {
  readonly roleId: VisionRoleId;
  readonly proficiencyId: VisionProficiencyId;
}): VisionEcosystemResolution {
  const { roleId, proficiencyId } = params;
  const hasFilter = roleId !== "all" || proficiencyId !== "all";

  let totalFeatureCount = 0;
  let matchedFeatureCount = 0;

  const pillars: ResolvedVisionPillar[] = TOONSTUDIO_VISION_PILLARS.map((pillar) => {
    const resolvedFeatures: ResolvedVisionFeatureNode[] = pillar.features.map((feature) => {
      totalFeatureCount += 1;
      const roleHit = roleId === "all" || feature.roles.includes(roleId);
      const profHit = proficiencyId === "all" || feature.proficiencies.includes(proficiencyId);
      const matched = hasFilter ? roleHit && profHit : true;
      if (matched) matchedFeatureCount += 1;
      return { ...feature, matched };
    });

    const pillarRoleHit = roleId === "all" || pillar.roles.includes(roleId);
    const pillarProfHit = proficiencyId === "all" || pillar.proficiencies.includes(proficiencyId);
    const pillarMatchedFeatures = resolvedFeatures.filter((item) => item.matched).length;

    const relevanceScore =
      (pillarRoleHit && roleId !== "all" ? 3 : 0) +
      (pillarProfHit && proficiencyId !== "all" ? 2 : 0) +
      pillarMatchedFeatures * 2;

    const highlighted = !hasFilter || pillarMatchedFeatures > 0 || (pillarRoleHit && pillarProfHit);

    return {
      ...pillar,
      highlighted,
      relevanceScore,
      matchedFeatureCount: pillarMatchedFeatures,
      resolvedFeatures,
    };
  });

  const highlightedPillars = pillars.filter((item) => item.highlighted);
  const topPillar =
    [...(highlightedPillars.length > 0 ? highlightedPillars : pillars)].sort(
      (a, b) => b.relevanceScore - a.relevanceScore,
    )[0] ?? pillars[0];

  const topFeature =
    topPillar.resolvedFeatures.find((item) => item.matched && item.growthTabId) ??
    topPillar.resolvedFeatures.find((item) => item.matched) ??
    topPillar.resolvedFeatures[0];

  const proficiencySuffix =
    proficiencyId === "all"
      ? ""
      : ` (${VISION_PROFICIENCY_FILTERS.find((item) => item.id === proficiencyId)?.label ?? ""} 기준 핵심 기둥 ${highlightedPillars.length}개 강조)`;

  return {
    roleId,
    proficiencyId,
    headline3Sec: `${ROLE_HEADLINES[roleId]}${proficiencySuffix}`,
    pillars,
    highlightedPillarIds: highlightedPillars.map((item) => item.id),
    primaryJump: {
      pillarId: topPillar.id,
      label: topFeature ? `${topFeature.title} 바로 열기` : `${topPillar.title} 바로 열기`,
      routePath: topFeature?.routePath ?? topPillar.primaryRoutePath,
      growthTabId: topFeature?.growthTabId ?? topPillar.linkedGrowthTabId,
      summary: topFeature?.oneLineValue ?? topPillar.threeSecondTagline,
    },
    totalFeatureCount,
    matchedFeatureCount,
  };
}
