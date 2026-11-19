import type { WebtoonProductionStage } from "./webtoon-focus-timer";

export type StudioAssistantRoutableTab =
  | "spec-slicer"
  | "scroll-pacing"
  | "tension-map"
  | "sfx-lexicon"
  | "color-harmony"
  | "focus-timer"
  | "croquis-pose"
  | "workflow-packs"
  | "learning";

export interface StudioAssistantRoutingContext {
  readonly query: string;
  readonly focusStage: WebtoonProductionStage;
  readonly panelsCount: number;
  readonly protectedRegionsCount: number;
  readonly canvasHeight: number;
}

export interface StudioAssistantRouteMatch {
  readonly tabId: StudioAssistantRoutableTab;
  readonly label: string;
  readonly score: number;
  readonly reason: string;
}

interface AssistantSkillEntry {
  readonly tabId: StudioAssistantRoutableTab;
  readonly label: string;
  readonly keywords: readonly string[];
  readonly preferredStages: readonly WebtoonProductionStage[];
  readonly defaultReason: string;
}

const ASSISTANT_SKILL_CATALOG: readonly AssistantSkillEntry[] = [
  {
    tabId: "spec-slicer",
    label: "플랫폼 규격 & 슬라이서",
    keywords: [
      "규격",
      "슬라이스",
      "분할",
      "자르기",
      "내보내기",
      "납품",
      "네이버",
      "카카오",
      "레진",
      "가로",
      "세로",
      "jpg",
      "slice",
      "spec",
      "export",
      "gutter",
      "preflight",
    ],
    preferredStages: ["finishing-sfx"],
    defaultReason: "플랫폼 업로드 규격 검사와 컷 여백 안전 분할을 바로 계산합니다.",
  },
  {
    tabId: "scroll-pacing",
    label: "스크롤 페이싱 시뮬레이터",
    keywords: [
      "스크롤",
      "페이싱",
      "호흡",
      "리듬",
      "컷간격",
      "여백",
      "속도",
      "완독",
      "가독성",
      "scroll",
      "pacing",
      "rhythm",
      "reading",
    ],
    preferredStages: ["storyboard"],
    defaultReason: "독자 스크롤 속도별 컷 호흡과 완독 시간을 시뮬레이션합니다.",
  },
  {
    tabId: "tension-map",
    label: "텐션 맵 (감정·사건 곡선)",
    keywords: [
      "텐션",
      "감정",
      "사건",
      "곡선",
      "대본",
      "콘티",
      "클라이맥스",
      "연출",
      "포즈추천",
      "tension",
      "emotion",
      "script",
      "story",
      "storyboard",
    ],
    preferredStages: ["storyboard"],
    defaultReason: "대본·컷 흐름의 감정 긴장도 곡선을 시각화하고 컷별 포즈를 추천합니다.",
  },
  {
    tabId: "sfx-lexicon",
    label: "효과음·의성어 사전",
    keywords: [
      "효과음",
      "의성어",
      "의태어",
      "식자",
      "말풍선",
      "텍스트",
      "타격",
      "폭발",
      "심장",
      "sfx",
      "lettering",
      "sound",
      "onomatopoeia",
    ],
    preferredStages: ["finishing-sfx"],
    defaultReason: "상황별 한국어 효과음과 추천 배색을 검색해 캔버스에 바로 삽입합니다.",
  },
  {
    tabId: "color-harmony",
    label: "피부/그림자 컬러 조화",
    keywords: [
      "컬러",
      "색",
      "색상",
      "피부",
      "그림자",
      "음영",
      "채색",
      "조명",
      "무드",
      "팔레트",
      "color",
      "skin",
      "shadow",
      "palette",
      "lighting",
      "mood",
    ],
    preferredStages: ["flat-color"],
    defaultReason: "피부톤 팔레트와 탁하지 않은 쿨톤 쉬프트 음영·장면 무드 색상을 제안합니다.",
  },
  {
    tabId: "focus-timer",
    label: "마감 & 포커스플로우",
    keywords: [
      "마감",
      "타이머",
      "포모도로",
      "집중",
      "공정",
      "시간",
      "일정",
      "timer",
      "pomodoro",
      "focus",
      "deadline",
    ],
    preferredStages: ["draft", "lineart"],
    defaultReason: "공정별 실작업 시간을 기록하며 마감 리듬을 유지합니다.",
  },
  {
    tabId: "croquis-pose",
    label: "인체 크로키 & 구도 가이드",
    keywords: [
      "크로키",
      "포즈",
      "인체",
      "동세",
      "투시",
      "구도",
      "카메라",
      "앵글",
      "3d",
      "배경",
      "하이앵글",
      "로우앵글",
      "pose",
      "croquis",
      "perspective",
      "camera",
      "anatomy",
      "bg3d",
    ],
    preferredStages: ["draft", "lineart", "background-3d"],
    defaultReason: "인체 동세 크로키와 하이·로우·더치 틸트 카메라 투시 가이드를 제공합니다.",
  },
  {
    tabId: "workflow-packs",
    label: "워크플로우 팩",
    keywords: [
      "워크플로우",
      "팩",
      "프리셋",
      "세팅",
      "장르",
      "로판",
      "액션",
      "느와르",
      "공유",
      "저작권",
      "라이선스",
      "번들",
      "workflow",
      "pack",
      "preset",
      "bundle",
      "rights",
      "bom",
    ],
    preferredStages: ["storyboard", "background-3d", "finishing-sfx"],
    defaultReason: "플랫폼·컬러·구도·타이머·저작권 검증을 묶은 장르별 제작 팩을 1클릭 적용합니다.",
  },
  {
    tabId: "learning",
    label: "배우면서 만들기",
    keywords: [
      "학습",
      "강좌",
      "자료",
      "가이드",
      "튜토리얼",
      "배우기",
      "초보",
      "learn",
      "tutorial",
      "academy",
      "guide",
    ],
    preferredStages: [],
    defaultReason: "현재 작업 맥락에 맞는 툰스튜디오 실습 강좌와 레퍼런스를 추천합니다.",
  },
];

function normalizeQuery(raw: string): string {
  return raw.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

/**
 * 현재 제작 공정과 캔버스 상태, 사용자 검색어를 결합해 가장 적합한 웹툰 보조 도구 탭을 추천한다.
 * 외부 모델 호출 없이 결정적으로 동작해 0ms대 응답과 재현 가능한 테스트를 보장한다.
 */
export function routeStudioAssistantSkills(
  context: StudioAssistantRoutingContext,
  limit = 3,
): StudioAssistantRouteMatch[] {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(5, Math.floor(limit))) : 3;
  const normalized = normalizeQuery(context.query);
  const compact = normalized.replace(/\s+/g, "");
  const queryTokens = normalized ? normalized.split(/[\s,./·+-]+/).filter((token) => token.length > 0) : [];

  const ranked = ASSISTANT_SKILL_CATALOG.map((entry) => {
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of entry.keywords) {
      const kwLower = keyword.toLocaleLowerCase("ko-KR");
      if (normalized && (normalized.includes(kwLower) || compact.includes(kwLower))) {
        score += kwLower.length >= 3 ? 6 : 4;
        matchedKeywords.push(keyword);
      } else if (queryTokens.some((token) => kwLower.includes(token) && token.length >= 2)) {
        score += 2.5;
        matchedKeywords.push(keyword);
      }
    }

    const stageMatched = entry.preferredStages.includes(context.focusStage);
    if (stageMatched) {
      score += normalized ? 2 : 5;
    }

    if (!normalized) {
      if (entry.tabId === "spec-slicer" && context.canvasHeight >= 10_000) {
        score += 2;
      }
      if (entry.tabId === "scroll-pacing" && context.panelsCount >= 3) {
        score += 2.5;
      }
      if (entry.tabId === "workflow-packs") {
        score += 1.5;
      }
    }

    const reason =
      matchedKeywords.length > 0
        ? `키워드(${matchedKeywords.slice(0, 2).join(", ")}) 매칭 · ${entry.defaultReason}`
        : stageMatched
          ? `현재 작업 공정 기준 추천 · ${entry.defaultReason}`
          : entry.defaultReason;

    return {
      tabId: entry.tabId,
      label: entry.label,
      score: Math.round(score * 10) / 10,
      reason,
    };
  });

  const filtered = normalized ? ranked.filter((item) => item.score > 0) : ranked;
  const source = filtered.length > 0 ? filtered : ranked;

  return [...source]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.tabId.localeCompare(right.tabId);
    })
    .slice(0, boundedLimit);
}
