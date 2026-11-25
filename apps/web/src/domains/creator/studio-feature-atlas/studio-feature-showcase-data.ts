/**
 * 8대 핵심 차별화 기술·주변기기 쇼케이스 카드 및 실전 단축키 치트시트 정본 데이터.
 *
 * - 대표 화면 링크와 독립 예제 설명을 구분한다. 링크 존재는 원고 연결이나 실행 완료의 근거가 아니다.
 * - `/assets/atelier/{media|spaces|onboarding}/*.webp`는 소개용 삽화다.
 */

export type AtlasRoutePath =
  | "/studio/canvas"
  | "/studio/character"
  | "/studio/bg3d"
  | "/studio/space"
  | "/compare/studio"
  | "/tech";

export type FeatureAxisId =
  | "drawing-2d-foley"
  | "character-3d-bg"
  | "cut-layout-colorscript"
  | "peripherals-multidevice"
  | "virtual-studio-spatial"
  | "ondevice-zero-cost"
  | "rights-bom-export";

export type ShortcutCategoryId = "draw" | "select" | "view-cut" | "collab-flow";

/** 링크가 존재한다는 사실과 개별 실험의 편집기 연결을 구분한다. */
export type AtlasEntryScope = "standalone-example" | "screen-guide";

export const ATLAS_ENTRY_SCOPE_LABELS: Readonly<Record<AtlasEntryScope, string>> = {
  "standalone-example": "독립 예제 안내 · 실제 원고 연결 미확인",
  "screen-guide": "기존 화면 안내 · 세부 동작은 이동 후 확인",
};

export interface DifferentiatorShowcaseCard {
  readonly id: string;
  readonly scope: AtlasEntryScope;
  readonly order: number;
  readonly badgeKo: string;
  readonly titleKo: string;
  readonly headlineKo: string;
  readonly summaryKo: string;
  readonly creatorBenefitKo: string;
  readonly axisId: FeatureAxisId;
  readonly route: AtlasRoutePath;
  readonly ctaLabelKo: string;
  readonly imageSrc: string;
  readonly imageAltKo: string;
  readonly specHighlightsKo: readonly [string, string, string];
  readonly keywords: readonly string[];
}

export interface StudioShortcutEntry {
  readonly id: string;
  readonly keys: string;
  readonly categoryId: ShortcutCategoryId;
  readonly categoryLabelKo: string;
  readonly actionKo: string;
  readonly tipKo: string;
  readonly axisId: FeatureAxisId;
  readonly route: AtlasRoutePath;
  readonly keywords: readonly string[];
}

/** 8대 핵심 차별화 기술·주변기기 쇼케이스 카드 (실제 5개 라우트 + 3개 WebP 자산군 전량 연결). */
export const DIFFERENTIATOR_SHOWCASE_CARDS: readonly DifferentiatorShowcaseCard[] = [
  {
    id: "diff-physical-foley-drawing",
    scope: "standalone-example",
    order: 1,
    badgeKo: "차별화 01 · 오감 드로잉",
    titleKo: "실물 화구 물리 마찰음 & 종이결 캔버스",
    headlineKo: "화구·종이 조합별 합성 소리 예제를 살펴봅니다",
    summaryKo:
      "화구·종이별 합성 소리와 희소 타일·좌표 예측의 독립 예제입니다. 실제 캔버스 스트로크 연결과 입력 지연 개선을 확인한 결과는 아닙니다.",
    creatorBenefitKo: "소리·필압 조합을 비교할 수 있습니다. 실제 작업에서의 필압 조절 효과는 별도 확인이 필요합니다.",
    axisId: "drawing-2d-foley",
    route: "/studio/canvas",
    ctaLabelKo: "관련 캔버스 화면 안내",
    imageSrc: "/assets/atelier/media/gpen-ink.webp",
    imageAltKo: "G펜 스틸 닙과 종이결 마찰 드로잉 썸네일",
    specHighlightsKo: [
      "G펜·4B 연필·수채 붓·마커·유화 나이프·목탄 6종 화구",
      "켄트지·한지·황목지·린넨 캔버스 4종 종이결 물리 마찰",
      "희소 타일 구조 · 입력 좌표 예측 계산 예제",
    ],
    keywords: ["마찰음", "G펜", "종이결", "화구", "Foley", "드로잉", "ASMR"],
  },
  {
    id: "diff-kubelka-munk-webnn",
    scope: "standalone-example",
    order: 2,
    badgeKo: "기술 02 · 온디바이스 광학 예제",
    titleKo: "실제 물감 혼색(Kubelka-Munk) & WebNN 선화 보정",
    headlineKo: "안료 혼색 계산과 선화 분석 실험의 범위를 살펴봅니다",
    summaryKo:
      "안료 혼색과 선화 분석을 다루는 독립 실험 항목입니다. 실제 WebNN 모델 추론과 원고 편집 연결은 각 화면에서 확인해야 합니다.",
    creatorBenefitKo: "로컬 계산 방식을 살펴봅니다. 모델 실행·성능·보안·비용 보증을 제공하는 안내는 아닙니다.",
    axisId: "ondevice-zero-cost",
    route: "/tech",
    ctaLabelKo: "온디바이스 기술 체험실 열기",
    imageSrc: "/assets/atelier/media/watercolor-sable.webp",
    imageAltKo: "세이블 수채 붓과 Kubelka-Munk 물리 안료 혼색 썸네일",
    specHighlightsKo: [
      "8밴드 Kubelka-Munk 안료 혼색 + 종이 골짜기 침전 표현",
      "WebNN 입력 · 러프 선화·컷 진단 실험 항목",
      "원고 연결 · 실제 추론 실행 여부는 개별 화면 확인",
    ],
    keywords: ["Kubelka-Munk", "WebNN", "물감 혼색", "0원", "온디바이스", "선화 보정", "수채"],
  },
  {
    id: "diff-vrm-hair-72pose",
    scope: "standalone-example",
    order: 3,
    badgeKo: "차별화 03 · 3D 인물 제작",
    titleKo: "크로스 VRM 실물 헤어 이식 & 72포즈 캐릭터 셰이퍼",
    headlineKo: "헤어 정렬 계획과 포즈 계산 예제를 구분해 살펴봅니다",
    summaryKo:
      "기본 헤어 패널은 계획 예제이며 별도로 실제 VRM을 전달해야 장면 이식을 실행합니다. 포즈·설정집의 현재 캐릭터 연결과 물리 업데이트도 별도 확인이 필요합니다.",
    creatorBenefitKo: "헤어 계획과 포즈 구성을 비교합니다. 현재 캐릭터에 적용됐다는 뜻은 아닙니다.",
    axisId: "character-3d-bg",
    route: "/studio/character",
    ctaLabelKo: "캐릭터 셰이퍼·포즈실 열기",
    imageSrc: "/assets/atelier/onboarding/character-sculpt.webp",
    imageAltKo: "3D 캐릭터 헤어 이식과 포즈 조형 썸네일",
    specHighlightsKo: [
      "두개골 정렬 계획 · 실제 VRM 전달 시 이식 경로",
      "포즈 목록 · 관절·접지 계산 예제",
      "정면·측면·후면 3면 설정집 & 3D→G펜 벡터 선화 투영",
    ],
    keywords: ["헤어 이식", "VRM", "72포즈", "캐릭터 셰이퍼", "3면 설정집", "포즈"],
  },
  {
    id: "diff-webgpu-xpbd-lighting",
    scope: "standalone-example",
    order: 4,
    badgeKo: "기술 04 · 물리·광원 계산 예제",
    titleKo: "WebGPU 헤어·의상 물리(XPBD) & 2D/3D 광원 베이크",
    headlineKo: "충돌·광원 계산 예제와 실제 GPU 실행을 구분합니다",
    summaryKo:
      "헤어·의상 충돌과 광원을 다루는 독립 예제입니다. 계산 결과가 현재 장면을 바꾸거나 WebGPU에서 실행됐다는 뜻은 아닙니다.",
    creatorBenefitKo: "충돌·광원 설정을 비교합니다. 실제 장면 연결과 렌더링 결과는 별도로 확인해야 합니다.",
    axisId: "ondevice-zero-cost",
    route: "/tech",
    ctaLabelKo: "WebGPU 물리·광원 데모 보기",
    imageSrc: "/assets/atelier/media/oil-impasto.webp",
    imageAltKo: "유화 나이프 질감과 입체 광원 표현 썸네일",
    specHighlightsKo: [
      "XPBD 헤어·의상 충돌 계산 예제",
      "캡슐 콜라이더 샘플 충돌 점검",
      "샘플 주광·림 라이트 · 툰 음영 계산 예제",
    ],
    keywords: ["WebGPU", "XPBD", "헤어 물리", "의상 물리", "광원 베이크", "조명"],
  },
  {
    id: "diff-peripherals-webhid-stylus",
    scope: "standalone-example",
    order: 5,
    badgeKo: "기술 05 · 주변기기 입력 예제",
    titleKo: "왼손 컨트롤러(WebHID) · 스타일러스 · 스마트워치 예제",
    headlineKo: "주변기기 매핑·입력값·메시지 예제를 살펴봅니다",
    summaryKo:
      "주변기기 매핑과 입력·워치 메시지의 실험 항목입니다. 실기기 연결, 입력 빈도와 편집기 명령 반영은 기기·브라우저별 확인이 필요합니다.",
    creatorBenefitKo: "입력 구성과 매핑을 비교합니다. 실기기 성능이나 모든 제품의 호환성을 보증하지 않습니다.",
    axisId: "peripherals-multidevice",
    route: "/studio/canvas",
    ctaLabelKo: "캔버스 주변기기 설정 열기",
    imageSrc: "/assets/atelier/media/graphite-pencil.webp",
    imageAltKo: "4B 흑연 연필과 정밀 스타일러스·왼손 컨트롤러 연동 썸네일",
    specHighlightsKo: [
      "TourBox·ExpressKey·Quick Keys 매핑 실험 항목",
      "필압·기울기·배럴 롤·지우개 입력 예제 · 빈도 실측 미포함",
      "워치 메시지 · 태블릿·모바일·왼손 배치 예제",
    ],
    keywords: ["WebHID", "왼손 컨트롤러", "TourBox", "스타일러스", "스마트워치", "필압", "기울기", "주변기기"],
  },
  {
    id: "diff-virtual-studio-hrtf",
    scope: "standalone-example",
    order: 6,
    badgeKo: "차별화 06 · 공간 음향 협업",
    titleKo: "가상 스튜디오 & 3D HRTF 공간 음향 실시간 작업실",
    headlineKo: "가상 공간 화면과 음향·피드백 실험을 안내합니다",
    summaryKo:
      "공간 이미지와 거리·방향·차음 계산, 라이트박스 구성 예제를 소개합니다. 실제 동료 음성·원고·다중 사용자 동기화 연결은 별도 확인이 필요합니다.",
    creatorBenefitKo: "공간·음향 구성과 협업 화면을 살펴봅니다. 팀 작업 완료를 검증하는 화면은 아닙니다.",
    axisId: "virtual-studio-spatial",
    route: "/studio/space",
    ctaLabelKo: "가상 스튜디오 입장하기",
    imageSrc: "/assets/atelier/spaces/wood-atelier.webp",
    imageAltKo: "목재 아틀리에 가상 스튜디오와 공간 음향 협업 썸네일",
    specHighlightsKo: [
      "목재 아틀리에·정숙 자료실·루프탑 등 6종 몰입 작업 공간",
      "거리 감쇄·벽체 차음·동료 연필 ASMR 3D HRTF 바이노럴 음향",
      "공중 플로팅 라이트박스 스토리보드 & 3D 공간 피드백 스티커",
    ],
    keywords: ["가상 스튜디오", "HRTF", "공간 음향", "실시간 협업", "라이트박스", "아틀리에"],
  },
  {
    id: "diff-rights-bom-4k-export",
    scope: "screen-guide",
    order: 7,
    badgeKo: "기술 07 · 권리 점검·영상 출력 안내",
    titleKo: "권리 감사 BOM 점검 기록 & 무빙툰 출력 안내",
    headlineKo: "권리 점검 기록과 영상 출력 조건을 각각 확인합니다",
    summaryKo:
      "권리 BOM 출고 화면과 WebCodecs 영상 실험을 안내합니다. 점검 영수증은 이용 허가 증명서가 아니며 영상 출력 지원·성능은 장치별로 확인해야 합니다.",
    creatorBenefitKo: "등록된 권리 근거와 출력 설정을 점검합니다. 법적 이용 허가나 분쟁 예방을 보증하지 않습니다.",
    axisId: "rights-bom-export",
    route: "/studio/canvas",
    ctaLabelKo: "원고 출고·권리 점검 보기",
    imageSrc: "/assets/atelier/onboarding/episode-publish.webp",
    imageAltKo: "권리 감사 BOM과 4K 무빙툰 출고 화면 썸네일",
    specHighlightsKo: [
      "등록된 소재·폰트·브러시 라이선스 근거와 BOM 기록 점검",
      "WebCodecs 영상 실험 · 4K/60fps 출력 지원 별도 확인",
      "플랫폼 세로 규격 자동 분할(Smart Slice) & 다크모드 검수",
    ],
    keywords: ["권리 BOM", "저작권", "4K", "무빙툰", "WebCodecs", "출고", "릴스"],
  },
  {
    id: "diff-local-first-open-compare",
    scope: "screen-guide",
    order: 8,
    badgeKo: "차별화 08 · 로컬 우선·투명 비교",
    titleKo: "설치 없는 로컬 우선 스튜디오 & 글로벌 6종 투명 비교",
    headlineKo: "게스트 캔버스와 제작 도구 비교 화면을 엽니다",
    summaryKo:
      "게스트 진입·로컬 저장·도구 비교 화면 안내입니다. 스냅샷 브랜치 예제와 실제 문서의 저장·복구 연결은 구분해 확인해야 합니다.",
    creatorBenefitKo: "무거운 설치나 강제 월정액 잠금 없이 작업 습관에 맞는지 직접 비교하고 결정할 수 있습니다.",
    axisId: "ondevice-zero-cost",
    route: "/compare/studio",
    ctaLabelKo: "글로벌 도구 6종과 비교 보기",
    imageSrc: "/assets/atelier/spaces/comic-gallery.webp",
    imageAltKo: "코믹 갤러리 전시 공간과 제작 도구 투명 비교 썸네일",
    specHighlightsKo: [
      "SQLite WASM + OPFS 저장 안내 · 브랜치 예제는 별도",
      "로그인 차단 없는 게스트 즉시 드로잉 진입",
      "글로벌 제작 도구 6종 공개 스펙·워크플로우 투명 비교",
    ],
    keywords: ["도구 비교", "로컬 저장", "OPFS", "SQLite", "무설치", "게스트 진입", "비교"],
  },
];

/** 툰스튜디오 실전 단축키 치트시트 (실제 `STUDIO_RAIL_TOOL_CATALOG` 기준). */
export const STUDIO_SHORTCUT_CHEATSHEET: readonly StudioShortcutEntry[] = [
  {
    id: "sc-pen",
    keys: "B",
    categoryId: "draw",
    categoryLabelKo: "드로잉·채색",
    actionKo: "펜(브러시) 선택",
    tipKo: "G펜·연필·수채 붓으로 바로 전환합니다.",
    axisId: "drawing-2d-foley",
    route: "/studio/canvas",
    keywords: ["펜", "브러시", "G펜", "그리기", "B"],
  },
  {
    id: "sc-pixel-pencil",
    keys: "P",
    categoryId: "draw",
    categoryLabelKo: "드로잉·채색",
    actionKo: "픽셀 펜 전환",
    tipKo: "또렷한 도트·러프 스케치 선을 그을 때 씁니다.",
    axisId: "drawing-2d-foley",
    route: "/studio/canvas",
    keywords: ["픽셀 펜", "연필", "스케치", "P"],
  },
  {
    id: "sc-eraser",
    keys: "E",
    categoryId: "draw",
    categoryLabelKo: "드로잉·채색",
    actionKo: "지우개 선택",
    tipKo: "스타일러스 뒷면 지우개를 뒤집어 쓸 수도 있습니다.",
    axisId: "drawing-2d-foley",
    route: "/studio/canvas",
    keywords: ["지우개", "뒷면 지우개", "지우기", "E"],
  },
  {
    id: "sc-fill",
    keys: "G",
    categoryId: "draw",
    categoryLabelKo: "드로잉·채색",
    actionKo: "색 채우기 (틈 닫기)",
    tipKo: "선 틈이 살짝 열려 있어도 밑색을 깔끔하게 채웁니다.",
    axisId: "drawing-2d-foley",
    route: "/studio/canvas",
    keywords: ["색 채우기", "밑색", "틈 닫기", "페인트통", "G"],
  },
  {
    id: "sc-wet-mix",
    keys: "Shift+N",
    categoryId: "draw",
    categoryLabelKo: "드로잉·채색",
    actionKo: "물감처럼 섞어 칠하기",
    tipKo: "Kubelka-Munk 물리 안료 혼색으로 경계를 자연스럽게 섞습니다.",
    axisId: "ondevice-zero-cost",
    route: "/studio/canvas",
    keywords: ["물감 혼색", "Kubelka-Munk", "섞어 칠하기", "Shift+N"],
  },
  {
    id: "sc-eyedropper",
    keys: "I",
    categoryId: "draw",
    categoryLabelKo: "드로잉·채색",
    actionKo: "색 가져오기 (스포이트)",
    tipKo: "컬러스크립트나 참고 이미지에서 색을 즉시 추출합니다.",
    axisId: "cut-layout-colorscript",
    route: "/studio/canvas",
    keywords: ["스포이트", "색 가져오기", "컬러", "I"],
  },
  {
    id: "sc-select",
    keys: "V",
    categoryId: "select",
    categoryLabelKo: "선택·변형",
    actionKo: "선택 · 이동 도구",
    tipKo: "말풍선·컷 프레임·레이어 오브젝트를 집어 옮깁니다.",
    axisId: "cut-layout-colorscript",
    route: "/studio/canvas",
    keywords: ["선택", "이동", "말풍선 이동", "V"],
  },
  {
    id: "sc-transform",
    keys: "Shift+T",
    categoryId: "select",
    categoryLabelKo: "선택·변형",
    actionKo: "크기 · 회전 바꾸기",
    tipKo: "선택한 그림이나 컷 요소를 자유롭게 확대·회전합니다.",
    axisId: "peripherals-multidevice",
    route: "/studio/canvas",
    keywords: ["변형", "크기", "회전", "Shift+T"],
  },
  {
    id: "sc-lasso",
    keys: "L",
    categoryId: "select",
    categoryLabelKo: "선택·변형",
    actionKo: "올가미 선택",
    tipKo: "복잡한 머리카락이나 의상 영역만 자유롭게 감쌉니다.",
    axisId: "drawing-2d-foley",
    route: "/studio/canvas",
    keywords: ["올가미", "자유 선택", "영역", "L"],
  },
  {
    id: "sc-crop",
    keys: "C",
    categoryId: "select",
    categoryLabelKo: "선택·변형",
    actionKo: "자르기 · 컷 트리밍",
    tipKo: "세로 원고 여백과 컷 비율을 빠르게 정리합니다.",
    axisId: "rights-bom-export",
    route: "/studio/canvas",
    keywords: ["자르기", "크롭", "컷 정리", "C"],
  },
  {
    id: "sc-hand",
    keys: "Space",
    categoryId: "view-cut",
    categoryLabelKo: "화면·연출",
    actionKo: "화면 이동 (누르고 드래그)",
    tipKo: "스페이스바를 누른 채 캔버스를 종이처럼 밀어 옮깁니다.",
    axisId: "drawing-2d-foley",
    route: "/studio/canvas",
    keywords: ["화면 이동", "손바닥", "패닝", "Space"],
  },
  {
    id: "sc-zoom",
    keys: "Z",
    categoryId: "view-cut",
    categoryLabelKo: "화면·연출",
    actionKo: "화면 확대 · 축소",
    tipKo: "캔버스 확대·축소 도구입니다. 실제 확대 품질과 반응 속도는 원고·기기에 따라 확인하세요.",
    axisId: "drawing-2d-foley",
    route: "/studio/canvas",
    keywords: ["확대", "축소", "줌", "Z"],
  },
  {
    id: "sc-rotate-view",
    keys: "R",
    categoryId: "view-cut",
    categoryLabelKo: "화면·연출",
    actionKo: "캔버스 화면 회전",
    tipKo: "손목 각도에 맞게 종이를 돌리듯 화면만 회전합니다.",
    axisId: "peripherals-multidevice",
    route: "/studio/canvas",
    keywords: ["화면 회전", "손목", "종이 돌리기", "R"],
  },
  {
    id: "sc-zoom-fit",
    keys: "Home",
    categoryId: "view-cut",
    categoryLabelKo: "화면·연출",
    actionKo: "화면 맞춤 보기",
    tipKo: "전체 컷 구도와 호흡을 한눈에 다시 맞춥니다.",
    axisId: "cut-layout-colorscript",
    route: "/studio/canvas",
    keywords: ["화면 맞춤", "전체 보기", "초기화", "Home"],
  },
  {
    id: "sc-balloon-text",
    keys: "T",
    categoryId: "collab-flow",
    categoryLabelKo: "말풍선·협업",
    actionKo: "말풍선 · 대사 텍스트 추가",
    tipKo: "컷 안에 대사를 넣고 세로쓰기와 여백을 바로 잡습니다.",
    axisId: "cut-layout-colorscript",
    route: "/studio/canvas",
    keywords: ["말풍선", "텍스트", "대사", "식자", "T"],
  },
  {
    id: "sc-comment-pin",
    keys: "Alt+C",
    categoryId: "collab-flow",
    categoryLabelKo: "말풍선·협업",
    actionKo: "컷 위치 댓글 핀 꽂기",
    tipKo: "어시스턴트·PD에게 수정 지점을 정확한 좌표로 남깁니다.",
    axisId: "virtual-studio-spatial",
    route: "/studio/canvas",
    keywords: ["위치 댓글", "피드백", "협업", "검수", "Alt+C"],
  },
];
