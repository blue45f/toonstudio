/**
 * ToonStudio vs 경쟁사 6종 UI/UX 10대 축 정량 벤치마크 루브릭 정본.
 *
 * - 평가 총점: 100점 (10대 축 × 10점).
 * - ToonStudio 점수는 이 파일에 하드코딩하지 않고 `ux-competitor-benchmark-scanners.mjs`가
 *   저장소 소스·CSS·컴포넌트·번들 진입 그래프·검증 스크립트를 직접 실측해 계산한다.
 * - 경쟁사 6종 기준선은 설문·추정 NPS 등 허구 수치를 배제하고, 각 제품의 공개 문서와
 *   배포 구조에서 확인 가능한 구조적 능력 기준선(public-structural-rubric)으로 투명하게 기록한다.
 */

export const UX_BENCHMARK_SCHEMA_VERSION = "toonstudio.ux-competitor-benchmark/1";
export const DEFAULT_MIN_SCORE = 95;
export const AXIS_MAX_SCORE = 10;
export const TOTAL_MAX_SCORE = 100;

export const UX_BENCHMARK_AXES = Object.freeze([
  {
    id: "gnb-lnb-journey",
    order: 1,
    titleKo: "GNB·LNB 통일성 및 5단계 창작 여정 명확성",
    shortKo: "GNB·LNB·5단계 여정",
    maxScore: AXIS_MAX_SCORE,
    focusSummaryKo: "단일 정본 내비 지도, 페이지별 역할 한 줄 안내, 다음 추천 동선 칩 실존 여부",
  },
  {
    id: "mobile-thumb-ux",
    order: 2,
    titleKo: "모바일(320~430px) 엄지 UX & 가로 오버플로 0px",
    shortKo: "모바일 엄지 UX",
    maxScore: AXIS_MAX_SCORE,
    focusSummaryKo: "44px 이상 터치 타깃(min-h-11), safe-area-inset-bottom, overflow-x: clip, 하단 5탭 엄지 독",
  },
  {
    id: "multidevice-consistency",
    order: 3,
    titleKo: "태블릿(768~1279px) · PC(>= 1280px) 멀티디바이스 일관성",
    shortKo: "태블릿·PC 일관성",
    maxScore: AXIS_MAX_SCORE,
    focusSummaryKo: "3단 뷰포트 브레이크포인트, 1280px 좌측 레일, coarse 포인터 44px 및 계약 테스트",
  },
  {
    id: "minimal-form-ai-autofill",
    order: 4,
    titleKo: "필수항목 최소화(<= 2개) & AI 원클릭 자동 채우기",
    shortKo: "필수 <=2 & AI 채움",
    maxScore: AXIS_MAX_SCORE,
    focusSummaryKo: "5대 핵심 워크플로 필수항목 2개 이하, 선택 6개+ AI 원클릭 채움, 사용자 수정 보호 및 지연 마운트",
  },
  {
    id: "oklch-spectrum-a11y",
    order: 5,
    titleKo: "OKLCH 다색 스펙트럼 비주얼 & 접근성 대비(>= 4.5:1)",
    shortKo: "OKLCH 스펙트럼·접근성",
    maxScore: AXIS_MAX_SCORE,
    focusSummaryKo: "5색 OKLCH 스펙트럼 토큰, 4.5:1 대비·고대비·모션 감소, 셸 CSS 원시 HEX 0건·transition:all 0건",
  },
  {
    id: "beginner-onboarding-ai-support",
    order: 6,
    titleKo: "초보자 60초 첫 1컷 온보딩 & 1:1 AI 고객센터",
    shortKo: "60초 온보딩·AI 상담",
    maxScore: AXIS_MAX_SCORE,
    focusSummaryKo: "5단계 60초 스포트라이트 온보딩, 1:1 실시간 AI 채팅상담·PII 마스킹·로컬 KB·백엔드 연동",
  },
  {
    id: "all-in-one-creative-depth",
    order: 7,
    titleKo: "올인원 크리에이티브 깊이",
    shortKo: "올인원 창작 깊이",
    maxScore: AXIS_MAX_SCORE,
    focusSummaryKo: "포토샵 프로 + 8대 AI 스위트 + 3D 배경·캐릭터 통합 합성 + 자동 투시 배경·3단 군중 드로잉",
  },
  {
    id: "studio-division-os",
    order: 8,
    titleKo: "스튜디오 분업 OS 완결성",
    shortKo: "스튜디오 분업 OS",
    maxScore: AXIS_MAX_SCORE,
    focusSummaryKo: "컷 슬라이스 분할/합본, 9역할×8폴더 RBAC, AD 5종 자동 검수, MG/RS 정산, 포렌식 LSB 워터마크",
  },
  {
    id: "initial-bundle-lazy-boundary",
    order: 9,
    titleKo: "초기 진입 번들 속도 & 지연 경계",
    shortKo: "초기 번들·지연 경계",
    maxScore: AXIS_MAX_SCORE,
    focusSummaryKo: "studio-eager-graph <= 17.5 MiB, 지연 무효화 0건, 불투명 동적 import 0건, 3.5초 비차단 세션",
  },
  {
    id: "local-zero-cost-ai-guard",
    order: 10,
    titleKo: "로컬 ₩0 풀스택·무과금 AI 가드 완결성",
    shortKo: "₩0 풀스택·무과금 AI",
    maxScore: AXIS_MAX_SCORE,
    focusSummaryKo: "루프백 객체 스토리지 에뮬레이터, 로컬 6인 분업 시드팩, 402/429·90% 안전선 Fail-Closed 무과금 AI 가드",
  },
]);

export const COMPETITOR_PROFILES = Object.freeze([
  {
    id: "clip-studio-paint",
    name: "Clip Studio Paint",
    shortName: "CSP",
    categoryKo: "프로 2D 만화·일러스트 네이티브 앱",
    distributionModelKo: "유료 영구/구독 네이티브 앱 (Windows/macOS/iPad/Android)",
    measurementMode: "public-structural-rubric",
    scores: Object.freeze({
      "gnb-lnb-journey": {
        score: 5.0,
        rationaleKo: "데스크톱 다중 팔레트 구조는 정교하나 제작·분업·마켓·지원을 잇는 5단계 단일 웹 여정 지도 부재",
      },
      "mobile-thumb-ux": {
        score: 5.0,
        rationaleKo: "스마트폰 심플 모드를 제공하나 320~430px 웹 한 손 엄지 독·가로 오버플로 0px 구조 제약",
      },
      "multidevice-consistency": {
        score: 7.5,
        rationaleKo: "PC·태블릿 네이티브 앱 동등성은 높으나 브라우저 무설치 즉시 실행 미지원",
      },
      "minimal-form-ai-autofill": {
        score: 4.0,
        rationaleKo: "신규 원고·출고 설정 필드가 세분화돼 있으며 5대 워크플로 AI 원클릭 자동 채우기 부재",
      },
      "oklch-spectrum-a11y": {
        score: 5.0,
        rationaleKo: "다크/라이트 무채색 툴 크롬 중심; OKLCH 다색 스펙트럼·웹 고대비/모션 감소 가드 미적용",
      },
      "beginner-onboarding-ai-support": {
        score: 4.5,
        rationaleKo: "공식 문서·튜토리얼은 풍부하나 60초 첫 1컷 인터랙티브 온보딩 및 인앱 1:1 실시간 AI 상담 부재",
      },
      "all-in-one-creative-depth": {
        score: 8.0,
        rationaleKo: "전문 2D 브러시·톤·3D 포즈/LT선추출 최상급이나 생성형 8대 AI 스위트·자동 3단 군중 드로잉 미통합",
      },
      "studio-division-os": {
        score: 4.5,
        rationaleKo: "팀워크 멀티페이지 관리 지원; 컷 슬라이스·9역할 레이어 RBAC·AD 5종 자동 검수·MG/RS 정산·LSB 워터마크 부재",
      },
      "initial-bundle-lazy-boundary": {
        score: 5.0,
        rationaleKo: "수백 MB 이상 네이티브 설치형 바이너리 배포로 브라우저 즉시 진입·지연 경계 불가",
      },
      "local-zero-cost-ai-guard": {
        score: 5.0,
        rationaleKo: "로컬 오프라인 저장은 가능하나 유료 라이선스 필수 및 ₩0 멀티 AI 과금 차단 캐스케이드 부재",
      },
    }),
  },
  {
    id: "canva-magic-studio",
    name: "Canva Magic Studio",
    shortName: "Canva",
    categoryKo: "웹·모바일 올인원 디자인 및 Magic AI 플랫폼",
    distributionModelKo: "프리미엄(Freemium) SaaS + 유료 Pro/Teams AI 크레딧",
    measurementMode: "public-structural-rubric",
    scores: Object.freeze({
      "gnb-lnb-journey": {
        score: 7.5,
        rationaleKo: "웹·모바일 통일 좌측 LNB와 템플릿 탐색이 명쾌하나 웹툰 5단계 제작→분업→출고 여정 지도 부재",
      },
      "mobile-thumb-ux": {
        score: 8.0,
        rationaleKo: "모바일 하단 툴바와 터치 타깃 완성도가 높으나 장편 웹툰 세로 컷·레이어 심화 편집 시 시트 중첩",
      },
      "multidevice-consistency": {
        score: 8.5,
        rationaleKo: "PC 웹·태블릿·모바일 앱 간 셸 및 문서 일관성이 매우 높음",
      },
      "minimal-form-ai-autofill": {
        score: 8.0,
        rationaleKo: "한 줄 프롬프트 기반 Magic Design 자동 생성이 강력하나 웹툰 출고·분업·권리 BOM 자동 채우기 부재",
      },
      "oklch-spectrum-a11y": {
        score: 7.5,
        rationaleKo: "밝고 다채로운 시각 계층과 가독성이 우수하나 OKLCH 스펙트럼 토큰·forced-colors 고대비 체계 미공개",
      },
      "beginner-onboarding-ai-support": {
        score: 7.5,
        rationaleKo: "초보자 템플릿 온보딩이 빠르나 웹툰 60초 첫 1컷 스포트라이트·무료 1:1 실시간 AI 상담 및 티켓 자동채움 제한",
      },
      "all-in-one-creative-depth": {
        score: 6.5,
        rationaleKo: "템플릿·Magic AI 스위트는 풍부하나 전문 래스터 브러시·3D 배경+캐릭터 NPR 합성·웹툰 컷/식자 엔진 부재",
      },
      "studio-division-os": {
        score: 4.0,
        rationaleKo: "브랜드 승인 플로우 지원; 웹툰 컷 슬라이스·9직군 RBAC·AD 5종 화풍 QA·정산 원장·포렌식 워터마크 부재",
      },
      "initial-bundle-lazy-boundary": {
        score: 8.0,
        rationaleKo: "웹 브라우저 즉시 진입과 경량 셸 지연 로딩이 우수",
      },
      "local-zero-cost-ai-guard": {
        score: 4.0,
        rationaleKo: "클라우드 종속 구조(로컬 ₩0 풀스택 불가)이며 주요 Magic AI 기능은 유료 구독·크레딧 전환 필요",
      },
    }),
  },
  {
    id: "figma",
    name: "Figma",
    shortName: "Figma",
    categoryKo: "웹 기반 벡터 UI 디자인·실시간 협업 도구",
    distributionModelKo: "클라우드 SaaS (무료 스타터 + 팀/AI 유료 시트)",
    measurementMode: "public-structural-rubric",
    scores: Object.freeze({
      "gnb-lnb-journey": {
        score: 7.5,
        rationaleKo: "파일 브라우저·에디터·커뮤니티 셸 구조가 정돈돼 있으나 웹툰 5단계 창작 여정·다음 동선 가이드 부재",
      },
      "mobile-thumb-ux": {
        score: 3.5,
        rationaleKo: "320~430px 모바일 브라우저 정식 편집 미지원(뷰어/미러 앱 중심)",
      },
      "multidevice-consistency": {
        score: 7.0,
        rationaleKo: "PC 웹/데스크톱 일관성은 최상급이나 태블릿 브라우저 터치 편집·모바일 편집 제약",
      },
      "minimal-form-ai-autofill": {
        score: 6.0,
        rationaleKo: "빈 파일 시작은 단순하나 발행·출고·분업 초대·고객문의 5대 워크플로 AI 자동 채우기 미내장",
      },
      "oklch-spectrum-a11y": {
        score: 7.5,
        rationaleKo: "정제된 다크/라이트 토큰과 키보드 접근성은 우수하나 크리에이티브 다색 스펙트럼 계층보다 무채색 중심",
      },
      "beginner-onboarding-ai-support": {
        score: 6.0,
        rationaleKo: "인터랙티브 학습 파일 제공; 웹툰 60초 첫 1컷 완성 가이드·1:1 실시간 AI 고객센터 부재",
      },
      "all-in-one-creative-depth": {
        score: 6.0,
        rationaleKo: "벡터 UI·오토레이아웃 최상급이나 래스터 리터칭·3D NPR 웹툰 씬 합성·자동 투시 배경/군중 부재",
      },
      "studio-division-os": {
        score: 6.0,
        rationaleKo: "실시간 협업·브랜칭·권한은 우수하나 웹툰 9직군 컷 슬라이스·AD 화풍 QA·정산 원장·LSB 워터마크 부재",
      },
      "initial-bundle-lazy-boundary": {
        score: 8.5,
        rationaleKo: "WASM 지연 로딩과 경량 웹 진입 파이프라인이 업계 최상위 수준",
      },
      "local-zero-cost-ai-guard": {
        score: 4.5,
        rationaleKo: "클라우드 종속으로 로컬 ₩0 풀스택·자체 스토리지 에뮬레이터 불가, AI 기능은 유료 시트 정책 연동",
      },
    }),
  },
  {
    id: "tooning",
    name: "Tooning",
    shortName: "Tooning",
    categoryKo: "웹 기반 AI 컷툰·웹툰 제작 에디터",
    distributionModelKo: "클라우드 SaaS (무료 체험 + 크레딧/구독 유료 플랜)",
    measurementMode: "public-structural-rubric",
    scores: Object.freeze({
      "gnb-lnb-journey": {
        score: 6.0,
        rationaleKo: "컷툰 에디터 중심 단일 동선은 단순하나 분업·마켓·AI 고객센터까지 잇는 5단계 통합 여정 미비",
      },
      "mobile-thumb-ux": {
        score: 4.5,
        rationaleKo: "PC 웹 캔버스 중심으로 320~430px 한 손 엄지 독·44px 터치 타깃 일괄 보장 제약",
      },
      "multidevice-consistency": {
        score: 5.5,
        rationaleKo: "데스크톱 웹 중심 설계로 PC·태블릿·모바일 3단 레이아웃 일관성 제한",
      },
      "minimal-form-ai-autofill": {
        score: 6.5,
        rationaleKo: "AI 스토리·컷 생성 입력 단계가 간소하나 출고·분업·문의 5대 워크플로 통합 자동 채우기 부재",
      },
      "oklch-spectrum-a11y": {
        score: 6.0,
        rationaleKo: "친근한 컬러 톤이나 OKLCH 시맨틱 스펙트럼·forced-colors 고대비·모션 감소 체계적 가드 미비",
      },
      "beginner-onboarding-ai-support": {
        score: 6.5,
        rationaleKo: "캐릭터/소품 조립 입문 장벽이 낮으나 60초 첫 1컷 스포트라이트 상태 머신·1:1 AI 상담/로컬 KB 미비",
      },
      "all-in-one-creative-depth": {
        score: 5.0,
        rationaleKo: "컷툰 리소스 조립·AI 생성에 특화되나 포토샵 프로 리터칭·3D 배경+캐릭터 NPR 합성·프로 브러시 부재",
      },
      "studio-division-os": {
        score: 3.0,
        rationaleKo: "개인/소규모 창작 중심으로 9직군 컷 슬라이스 분업 OS·AD 5종 자동 검수·MG/RS 정산·포렌식 워터마크 부재",
      },
      "initial-bundle-lazy-boundary": {
        score: 7.0,
        rationaleKo: "웹 즉시 진입이 가능하나 리소스 팩 로딩 비중 존재",
      },
      "local-zero-cost-ai-guard": {
        score: 4.0,
        rationaleKo: "클라우드 종속 및 AI 크레딧 유료 과금 구조로 로컬 ₩0 풀스택·Fail-Closed 무과금 가드 부재",
      },
    }),
  },
  {
    id: "plotr",
    name: "Plotr",
    shortName: "Plotr",
    categoryKo: "웹툰·웹소설 스토리 플롯·캐릭터 기획 도구",
    distributionModelKo: "클라우드 SaaS (무료/유료 플랜)",
    measurementMode: "public-structural-rubric",
    scores: Object.freeze({
      "gnb-lnb-journey": {
        score: 5.5,
        rationaleKo: "기획·플롯 보드 중심 구조로 작화·3D·분업·마켓·고객지원 통합 5단계 여정 지도 범위 제한",
      },
      "mobile-thumb-ux": {
        score: 5.0,
        rationaleKo: "모바일 웹 열람·메모는 가능하나 하단 5탭 엄지 독과 모바일 원고 제작 UX 부재",
      },
      "multidevice-consistency": {
        score: 6.0,
        rationaleKo: "문서·카드 보드의 PC/태블릿 웹 일관성은 무난하나 작화/3D 작업대 멀티디바이스 전환 미지원",
      },
      "minimal-form-ai-autofill": {
        score: 7.0,
        rationaleKo: "한 줄 로그라인·캐릭터 설정 AI 보조가 간편하나 원고 출고·권리 BOM·분업 초대 워크플로 부재",
      },
      "oklch-spectrum-a11y": {
        score: 6.0,
        rationaleKo: "읽기 중심 깔끔한 카드 UI이나 OKLCH 5색 스펙트럼 토큰·고대비 접근성 가드 체계 제한",
      },
      "beginner-onboarding-ai-support": {
        score: 6.0,
        rationaleKo: "스토리 작성 시작은 쉬우나 60초 첫 1컷 드로잉·배경·말풍선 완성 온보딩 및 1:1 AI 고객센터 부재",
      },
      "all-in-one-creative-depth": {
        score: 3.5,
        rationaleKo: "스토리/플롯 기획 특화로 2D 드로잉·포토샵 프로·3D 씬 합성·자동 배경/군중 드로잉 미제공",
      },
      "studio-division-os": {
        score: 3.0,
        rationaleKo: "스토리 공유 중심이며 원고 컷 슬라이스·9직군 레이어 RBAC·AD 화풍 QA·정산·포렌식 워터마크 부재",
      },
      "initial-bundle-lazy-boundary": {
        score: 8.0,
        rationaleKo: "텍스트·카드 중심 경량 웹 앱으로 초기 로딩이 빠름",
      },
      "local-zero-cost-ai-guard": {
        score: 4.5,
        rationaleKo: "클라우드 SaaS로 로컬 ₩0 풀스택·오브젝트 스토리지 에뮬레이터·멀티 AI 과금 차단 가드 부재",
      },
    }),
  },
  {
    id: "procreate",
    name: "Procreate",
    shortName: "Procreate",
    categoryKo: "iPadOS 네이티브 디지털 페인팅·일러스트 앱",
    distributionModelKo: "iPadOS/iOS App Store 유료 일시불 네이티브 앱",
    measurementMode: "public-structural-rubric",
    scores: Object.freeze({
      "gnb-lnb-journey": {
        score: 6.5,
        rationaleKo: "갤러리↔캔버스 2단계 미니멀 동선은 매우 명쾌하나 웹툰 연재·분업·마켓·지원 멀티페이지 여정 부재",
      },
      "mobile-thumb-ux": {
        score: 7.0,
        rationaleKo: "iPhone(Pocket)·iPad 네이티브 제스처·터치 UX 완성도가 높으나 안드로이드·모바일 웹 미지원",
      },
      "multidevice-consistency": {
        score: 4.5,
        rationaleKo: "iPadOS 단일 기기 최적화는 탁월하나 PC(Windows/macOS/Linux)·웹 브라우저·안드로이드 미지원",
      },
      "minimal-form-ai-autofill": {
        score: 6.5,
        rationaleKo: "캔버스 생성 입력이 최소이나 연재 규격·시놉시스·태그·분업 초대·문의 AI 자동 채우기 기능 없음",
      },
      "oklch-spectrum-a11y": {
        score: 7.0,
        rationaleKo: "iPadOS 시스템 접근성 연동이 우수하나 캔버스 집중 무채색 다크/라이트 2테마 중심",
      },
      "beginner-onboarding-ai-support": {
        score: 5.5,
        rationaleKo: "제스처 중심 인터페이스로 학습 곡선이 존재하며 60초 첫 1컷 온보딩·1:1 AI 채팅 고객센터 부재",
      },
      "all-in-one-creative-depth": {
        score: 6.5,
        rationaleKo: "래스터 페인팅·브러시 감각은 최상이나 3D 배경+캐릭터 NPR 합성·8대 AI 스위트·자동 군중·웹툰 식자 부재",
      },
      "studio-division-os": {
        score: 1.5,
        rationaleKo: "단일 기기 로컬 파일 중심으로 다인 실시간 협업·컷 슬라이스·9직군 RBAC·AD QA·정산·워터마크 없음",
      },
      "initial-bundle-lazy-boundary": {
        score: 6.0,
        rationaleKo: "설치 후 로컬 기동은 빠르나 App Store 유료 설치 필수(무설치 웹 즉시 진입 불가)",
      },
      "local-zero-cost-ai-guard": {
        score: 5.5,
        rationaleKo: "로컬 오프라인 실행은 안정적이나 유료 앱이며 ₩0 풀스택 백엔드·무과금 멀티 AI 가드 체계 없음",
      },
    }),
  },
]);

export function round1(value) {
  return Math.round(value * 10) / 10;
}

export function validateRubricIntegrity() {
  const errors = [];
  if (UX_BENCHMARK_AXES.length !== 10) {
    errors.push(`평가 축 개수가 10개가 아닙니다: ${UX_BENCHMARK_AXES.length}`);
  }
  const axisTotal = UX_BENCHMARK_AXES.reduce((sum, axis) => sum + axis.maxScore, 0);
  if (axisTotal !== TOTAL_MAX_SCORE) {
    errors.push(`평가 축 배점 합계가 ${TOTAL_MAX_SCORE}점이 아닙니다: ${axisTotal}`);
  }
  if (COMPETITOR_PROFILES.length !== 6) {
    errors.push(`경쟁사 기준선 개수가 6종이 아닙니다: ${COMPETITOR_PROFILES.length}`);
  }
  for (const competitor of COMPETITOR_PROFILES) {
    for (const axis of UX_BENCHMARK_AXES) {
      const entry = competitor.scores[axis.id];
      if (!entry) {
        errors.push(`${competitor.name}: 축 누락(${axis.id})`);
        continue;
      }
      if (typeof entry.score !== "number" || entry.score < 0 || entry.score > axis.maxScore) {
        errors.push(`${competitor.name}/${axis.id}: 유효하지 않은 점수(${entry.score})`);
      }
      if (!entry.rationaleKo || entry.rationaleKo.trim().length < 10) {
        errors.push(`${competitor.name}/${axis.id}: 구조적 근거 설명 누락`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function summarizeCompetitorBaselines() {
  const summaries = COMPETITOR_PROFILES.map((profile) => {
    const totalScore = round1(
      UX_BENCHMARK_AXES.reduce((sum, axis) => sum + profile.scores[axis.id].score, 0),
    );
    return {
      id: profile.id,
      name: profile.name,
      shortName: profile.shortName,
      categoryKo: profile.categoryKo,
      distributionModelKo: profile.distributionModelKo,
      measurementMode: profile.measurementMode,
      totalScore,
      maxScore: TOTAL_MAX_SCORE,
      axisScores: Object.fromEntries(
        UX_BENCHMARK_AXES.map((axis) => [axis.id, profile.scores[axis.id].score]),
      ),
    };
  });
  const sorted = [...summaries].sort((a, b) => b.totalScore - a.totalScore);
  return {
    competitors: summaries,
    highestCompetitor: sorted[0],
  };
}

export function computeCompetitorDeltas(toonStudioAxes) {
  const axisScoreMap = new Map(toonStudioAxes.map((item) => [item.axisId, item.score]));
  const toonTotal = round1(
    toonStudioAxes.reduce((sum, item) => sum + item.score, 0),
  );
  const { competitors, highestCompetitor } = summarizeCompetitorBaselines();

  const overall = competitors.map((comp) => {
    const delta = round1(toonTotal - comp.totalScore);
    return {
      competitorId: comp.id,
      competitorName: comp.name,
      shortName: comp.shortName,
      competitorTotal: comp.totalScore,
      toonStudioTotal: toonTotal,
      delta,
      leadStatus: delta > 0 ? "AHEAD" : delta === 0 ? "TIED" : "BEHIND",
    };
  });

  const perAxis = UX_BENCHMARK_AXES.map((axis) => {
    const toonScore = axisScoreMap.get(axis.id) ?? 0;
    const competitorEntries = COMPETITOR_PROFILES.map((profile) => {
      const compScore = profile.scores[axis.id].score;
      return {
        competitorId: profile.id,
        shortName: profile.shortName,
        score: compScore,
        delta: round1(toonScore - compScore),
      };
    });
    const bestForAxis = [...competitorEntries].sort((a, b) => b.score - a.score)[0];
    return {
      axisId: axis.id,
      order: axis.order,
      titleKo: axis.titleKo,
      shortKo: axis.shortKo,
      toonStudioScore: toonScore,
      maxScore: axis.maxScore,
      bestCompetitorShortName: bestForAxis.shortName,
      bestCompetitorScore: bestForAxis.score,
      deltaVsBestCompetitor: round1(toonScore - bestForAxis.score),
      beatsAllOnAxis: competitorEntries.every((entry) => entry.delta > 0),
      byCompetitor: Object.fromEntries(
        competitorEntries.map((entry) => [
          entry.competitorId,
          { score: entry.score, delta: entry.delta },
        ]),
      ),
    };
  });

  return {
    toonTotal,
    highestCompetitor,
    deltaVsHighestCompetitor: round1(toonTotal - highestCompetitor.totalScore),
    beatsAllCompetitorsOverall: overall.every((entry) => entry.delta > 0),
    beatsAllCompetitorsEveryAxis: perAxis.every((entry) => entry.beatsAllOnAxis),
    overall,
    perAxis,
  };
}
