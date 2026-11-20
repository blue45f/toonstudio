/**
 * Fresh Ideas v2.0 Contracts, Mode State Machine & 100-Capability Registry (REQ-001 ~ REQ-010).
 * Pure TypeScript domain module with zero React/DOM dependencies.
 */

export type FreshIdeasMode = "mode-a-5-lens" | "mode-b-channel-draft" | "mode-c-ecosystem";

export type FreshIdeasTriggerRoute =
  | "generate-fresh-ideas"
  | "plain-summary"
  | "match-my-writing-style"
  | "get-more-perspectives"
  | "prep-for-meetings"
  | "focus-my-energy";

export type SourceDensityTier = "low-density" | "mid-density" | "high-density";

export type FreshIdeasSourceKind =
  | "article"
  | "multi-doc"
  | "youtube-transcript"
  | "sheet-csv"
  | "slide-pdf"
  | "changelog-pr"
  | "meeting-transcript"
  | "newsletter-bundle"
  | "self-past-post"
  | "community-comments"
  | "visual-diagram";

export type KoreanSpeechRegister = "haera" | "haeyo" | "hapsyo";

export type CoreLensId =
  | "contrarian-take"
  | "personal-story-hook"
  | "data-evidence-angle"
  | "practical-playbook"
  | "what-they-missed";

export type ExtendedLensId =
  | "historical-parallel"
  | "failure-autopsy"
  | "cross-domain-analogy"
  | "three-year-backcast"
  | "unit-economics"
  | "myth-vs-reality"
  | "workflow-stack"
  | "uncomfortable-tradeoff"
  | "scale-10x-01x";

export type AnyLensId = CoreLensId | ExtendedLensId;

export type TargetChannelId =
  | "linkedin-kr"
  | "x-threads"
  | "shorts-reels-60s"
  | "ig-carousel"
  | "newsletter"
  | "brunch-blog"
  | "internal-1pager"
  | "podcast-sheet"
  | "community-debate"
  | "default-dual-preview";

export interface FreshIdeasUserConfig {
  readonly schemaVersion: "2.0.0";
  readonly preferredChannels: readonly TargetChannelId[];
  readonly defaultKoreanRegister: KoreanSpeechRegister;
  readonly extraBannedPhrases: readonly string[];
  readonly enableUnslopRedlines: boolean;
}

export interface FreshIdeasCapabilitySpec {
  readonly reqId: string;
  readonly number: number;
  readonly domainIndex: number;
  readonly domainLabelKo: string;
  readonly titleKo: string;
  readonly moduleName:
    | "fresh-ideas-contracts"
    | "fresh-ideas-ingest-deconstruct"
    | "fresh-ideas-lenses-engine"
    | "fresh-ideas-channels-localization"
    | "fresh-ideas-quality-ecosystem";
}

export interface ToolBoundaryDecision {
  readonly surface: "google-docs" | "google-sheets" | "gmail" | "google-keep" | "web-search";
  readonly allowTurn1Read: boolean;
  readonly requireExplicitConfirmToWrite: boolean;
  readonly maxUnconnectedRetries: 1;
}

export interface ColdStartOption {
  readonly id: "paste-source" | "workspace-doc" | "project-decision";
  readonly labelKo: string;
  readonly promptHintKo: string;
}

export const DEFAULT_FRESH_IDEAS_USER_CONFIG: FreshIdeasUserConfig = Object.freeze({
  schemaVersion: "2.0.0",
  preferredChannels: ["linkedin-kr", "brunch-blog"],
  defaultKoreanRegister: "haeyo",
  extraBannedPhrases: [],
  enableUnslopRedlines: true,
});

const DOMAIN_TITLES: readonly [number, string, FreshIdeasCapabilitySpec["moduleName"], readonly string[]][] = [
  [
    1,
    "스킬 아키텍처·프롬프트",
    "fresh-ideas-contracts",
    [
      "멀티파일 모듈 분리",
      "한·영 트리거 라우팅",
      "Mode A/B/C 상태 머신",
      "점진적 컨텍스트 로딩",
      "입력 분량별 적응 분기",
      "비차단 기본 독자 추론",
      "네거티브 가드 명문화",
      "읽기·쓰기 도구 경계",
      "콜드 스타트 3경로 안내",
      "버전·개인화 슬롯 관리",
    ],
  ],
  [
    2,
    "멀티소스·멀티모달 수집",
    "fresh-ideas-ingest-deconstruct",
    [
      "다중 문서 교차 리믹스",
      "유튜브 자막·챕터 수집",
      "시트·CSV 정량 리믹스",
      "슬라이드·PDF 해체",
      "릴리즈 노트·PR 변환",
      "긴 회의록 발언 추출",
      "뉴스레터 묶음 통념 합성",
      "과거 글 2026 셀프 리믹스",
      "댓글·커뮤니티 반응 결합",
      "차트·스케치 시각 해석",
    ],
  ],
  [
    3,
    "원문 해체 엔진",
    "fresh-ideas-ingest-deconstruct",
    [
      "숨은 전제 2건 추출",
      "논리 도약 구간 탐지",
      "이해관계자 비대칭 매핑",
      "생존자 편향 점검",
      "2·3차 파급효과 연쇄",
      "시간·규모 경계 스트레스",
      "핵심 은유 포착·전복",
      "부수 각주 주연 격상",
      "추상어-구체어 번역",
      "소스 밀도 자동 진단",
    ],
  ],
  [
    4,
    "5대 기본 렌즈 정밀화",
    "fresh-ideas-lenses-engine",
    [
      "반론 반증 가능성 명시",
      "반론 강도 3단계 조절",
      "허위 경험담 날조 차단",
      "4박자 서사 갈등 아크",
      "데이터 실시간 검증 연동",
      "데이터 과밀 역방향 전환",
      "30분 첫 실행 플레이북",
      "단계별 완료 기준 병기",
      "5축 사각지대 스캔",
      "렌즈 중복 감지·강제 피벗",
    ],
  ],
  [
    5,
    "확장 렌즈 팩",
    "fresh-ideas-lenses-engine",
    [
      "역사적 평행이론 렌즈",
      "안티 패턴 부검 렌즈",
      "이종 산업 비유 치환",
      "3년 뒤 미래 역산",
      "비용·단위경제 해부",
      "초심자 오해 교정",
      "실전 도구 파이프라인",
      "윤리·역량 트레이드오프",
      "10x·0.1x 스케일 테스트",
      "소스 맞춤형 자동 조합기",
    ],
  ],
  [
    6,
    "채널별 Mode B 설계도",
    "fresh-ideas-channels-localization",
    [
      "링크드인 2줄 훅 템플릿",
      "X·스레드 연작 카드",
      "60초 쇼츠 타임코드 대본",
      "인스타 캐러셀 슬라이드 맵",
      "뉴스레터 에디션 골격",
      "브런치·블로그 장문 구조",
      "사내 1페이저 의사결정 메모",
      "팟캐스트 진행 토킹 포인트",
      "커뮤니티 토론 발제문",
      "채널 미지정 듀얼 프리뷰",
    ],
  ],
  [
    7,
    "한국어 수사학·Unslop",
    "fresh-ideas-channels-localization",
    [
      "영어 직역투 전면 차단",
      "한국어 헤드라인 리듬 다변화",
      "국내 플랫폼 레지스터 분리",
      "한영 실무 용어 균형",
      "한국 직장·스타트업 현지화",
      "종결어미 일관성 잠금",
      "단색 인덱스 한국어 라벨",
      "과장 번역 수식어 제거",
      "모바일 keep-all·조사 정제",
      "해외 소스 한국 시장 브리지",
    ],
  ],
  [
    8,
    "품질 게이트·클리셰 제거",
    "fresh-ideas-quality-ecosystem",
    [
      "AI 클리셰 블랙리스트",
      "주어 치환 구체성 테스트",
      "5개 각도 직교성 감사",
      "첫 문장 고긴장 훅 규칙",
      "독자 페르소나 초점 고정",
      "헤드라인 3종 A/B 변주",
      "구체 장면·마이크로 대사",
      "예상 재반박 선제 방어",
      "개인·소팀 실행 권한 제한",
      "목적별 맞춤형 CTA 분기",
    ],
  ],
  [
    9,
    "근거 검증·안전 가드레일",
    "fresh-ideas-quality-ecosystem",
    [
      "출처 URL 전 구간 보존",
      "상관-인과 왜곡 방지",
      "의료·법률·금융 반론 안전선",
      "원저작물 표절 방지",
      "인신공격 배제 구조 비평",
      "4요소 정밀 자리표시자",
      "미연결 앱 단회 발췌 안내",
      "사내 기밀 비식별화 필터",
      "직접 인용구 원문 일치",
      "초박형 소스 보강 공식",
    ],
  ],
  [
    10,
    "워크스페이스·생태계 체이닝",
    "fresh-ideas-quality-ecosystem",
    [
      "내 문체 프로필 자동 체이닝",
      "5인 자문단 반론 스트레스",
      "회의 아젠다 브리프 전환",
      "제작 에너지·소요시간 태깅",
      "1-to-3 OSMU 패키지 생성",
      "Mode C 40/60 하이브리드 결합",
      "Docs 4시드 부록 구조 저장",
      "Sheets·Keep 7열 아이디어 뱅크",
      "3~5부작 연재 시리즈 기획",
      "세션 선호도 기반 추천 태그",
    ],
  ],
];

export const FRESH_IDEAS_100_CAPABILITIES: readonly FreshIdeasCapabilitySpec[] = Object.freeze(
  DOMAIN_TITLES.flatMap(([domainIndex, domainLabelKo, moduleName, titles]) =>
    titles.map((titleKo, idx) => {
      const number = (domainIndex - 1) * 10 + idx + 1;
      return Object.freeze({
        reqId: `REQ-${String(number).padStart(3, "0")}`,
        number,
        domainIndex,
        domainLabelKo,
        titleKo,
        moduleName,
      });
    }),
  ),
);

export function classifyFreshIdeasTriggerIntent(prompt: string): FreshIdeasTriggerRoute {
  const normalized = prompt.trim().toLocaleLowerCase("ko-KR");
  if (/요약만|tl;dr|tldr|줄여줘|번역해/.test(normalized) && !/리믹스|각도|아이디어|비틀/.test(normalized)) {
    return "plain-summary";
  }
  if (/내\s*문체로만|말투\s*바꿔|rewrite\s+in\s+my\s+voice/.test(normalized)) {
    return "match-my-writing-style";
  }
  if (/자문단|투표|찬반\s*패널|decision\s+panel/.test(normalized)) {
    return "get-more-perspectives";
  }
  if (/회의\s*준비|미팅\s*브리프|prep\s+for\s+meeting/.test(normalized)) {
    return "prep-for-meetings";
  }
  if (/뭐부터\s*할까|에너지\s*우선순위|task\s+triage/.test(normalized)) {
    return "focus-my-energy";
  }
  return "generate-fresh-ideas";
}

export function classifySourceDensity(rawText: string, sourceCount = 1): SourceDensityTier {
  const length = rawText.trim().length;
  const numericTokenCount = (rawText.match(/\d+(?:\.\d+)?%?/g) ?? []).length;
  if (sourceCount >= 2 || length >= 1200 || numericTokenCount >= 8) {
    return "high-density";
  }
  if (length < 180) {
    return "low-density";
  }
  return "mid-density";
}

export function inferDefaultTargetPersona(rawText: string): string {
  const lower = rawText.toLocaleLowerCase("ko-KR");
  if (/웹툰|작화|콘티|브러시|블렌더|bg3d|컷/.test(lower)) {
    return "웹툰 작가·스튜디오 배경/연출 담당자";
  }
  if (/개발|pr|배포|코드|엔지니어|api|아키텍처/.test(lower)) {
    return "개발 팀장·프로덕트 엔지니어";
  }
  if (/매출|마진|cac|ltv|투자|ir|예산|roi/.test(lower)) {
    return "스타트업 창업자·재무/사업 총괄";
  }
  return "실무 리드·콘텐츠 기획자";
}

export function resolveToolBoundaryPolicy(
  surface: ToolBoundaryDecision["surface"],
): ToolBoundaryDecision {
  return Object.freeze({
    surface,
    allowTurn1Read: true,
    requireExplicitConfirmToWrite: surface !== "web-search",
    maxUnconnectedRetries: 1,
  });
}

export function buildColdStartChooser(): readonly ColdStartOption[] {
  return Object.freeze([
    {
      id: "paste-source",
      labelKo: "아티클·링크·메모 붙여넣기",
      promptHintKo: "읽던 기사 본문, URL, 또는 거친 회의 메모를 붙여 넣으면 즉시 5개 각도로 분해합니다.",
    },
    {
      id: "workspace-doc",
      labelKo: "문서·뉴스레터 불러오기",
      promptHintKo: "Google Docs 제목이나 최근 Gmail 뉴스레터 주제를 지정하면 원문을 읽어 리믹스합니다.",
    },
    {
      id: "project-decision",
      labelKo: "최근 프로젝트 의사결정·릴리즈 노트",
      promptHintKo: "최근 배포한 기능 변경점이나 팀 회고 한 단락을 외부 발행용 인사이트로 전환합니다.",
    },
  ]);
}
