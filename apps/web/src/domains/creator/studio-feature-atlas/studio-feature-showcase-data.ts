/**
 * 8대 핵심 차별화 기술·주변기기 쇼케이스 카드 및 실전 단축키 치트시트 정본 데이터.
 *
 * - 실제 구현된 라우트(`/studio/canvas`, `/studio/character`, `/studio/space`, `/compare/studio`, `/tech`)와
 *   사전 제작된 `/assets/atelier/{media|spaces|onboarding}/*.webp` 자산 경로만 연결한다.
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

export interface DifferentiatorShowcaseCard {
  readonly id: string;
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
    order: 1,
    badgeKo: "차별화 01 · 오감 드로잉",
    titleKo: "실물 화구 물리 마찰음 & 종이결 캔버스",
    headlineKo: "G펜이 켄트지를 긁는 사각임까지 필압대로 살아납니다",
    summaryKo:
      "6종 실물 화구와 4종 종이결 조합마다 스트로크 속도와 필압에 따라 물리 마찰음을 실시간 합성합니다. 조용한 디지털 화면이 실제 화방 책상처럼 바뀝니다.",
    creatorBenefitKo: "눈으로만 보던 선 굵기와 종이 질감을 귀로도 바로 느껴 필압 조절이 한결 편해집니다.",
    axisId: "drawing-2d-foley",
    route: "/studio/canvas",
    ctaLabelKo: "드로잉 캔버스에서 바로 체험",
    imageSrc: "/assets/atelier/media/gpen-ink.webp",
    imageAltKo: "G펜 스틸 닙과 종이결 마찰 드로잉 썸네일",
    specHighlightsKo: [
      "G펜·4B 연필·수채 붓·마커·유화 나이프·목탄 6종 화구",
      "켄트지·한지·황목지·린넨 캔버스 4종 종이결 물리 마찰",
      "무한 캔버스 256×256 희소 타일 + 1프레임 선행 예측",
    ],
    keywords: ["마찰음", "G펜", "종이결", "화구", "Foley", "드로잉", "ASMR"],
  },
  {
    id: "diff-kubelka-munk-webnn",
    order: 2,
    badgeKo: "차별화 02 · 0원 온디바이스 광학",
    titleKo: "실제 물감 혼색(Kubelka-Munk) & WebNN 선화 보정",
    headlineKo: "서버 요금 0원으로 파랑+노랑이 맑은 초록으로 섞입니다",
    summaryKo:
      "단순 디지털 색 섞기처럼 탁한 회색이 되지 않도록 8밴드 안료 광학식으로 물감을 섞고, 내 기기 WebNN 엔진으로 러프 선화와 컷 구도를 바로 정리합니다.",
    creatorBenefitKo: "클라우드 토큰 결제나 원고 외부 전송 없이 빠르고 안심되는 채색·선화 보정을 누립니다.",
    axisId: "ondevice-zero-cost",
    route: "/tech",
    ctaLabelKo: "온디바이스 기술 체험실 열기",
    imageSrc: "/assets/atelier/media/watercolor-sable.webp",
    imageAltKo: "세이블 수채 붓과 Kubelka-Munk 물리 안료 혼색 썸네일",
    specHighlightsKo: [
      "8밴드 Kubelka-Munk 안료 혼색 + 종이 골짜기 침전 표현",
      "WebNN 내 기기 러프 선화 보정 · 컷 연출 자동 진단",
      "외부 서버 전송 0건 · 추가 AI 구독료 0원",
    ],
    keywords: ["Kubelka-Munk", "WebNN", "물감 혼색", "0원", "온디바이스", "선화 보정", "수채"],
  },
  {
    id: "diff-vrm-hair-72pose",
    order: 3,
    badgeKo: "차별화 03 · 3D 인물 제작",
    titleKo: "크로스 VRM 실물 헤어 이식 & 72포즈 캐릭터 셰이퍼",
    headlineKo: "마음에 드는 머리는 옮겨 심고, 72가지 포즈로 바로 콘티를 잡습니다",
    summaryKo:
      "서로 다른 3D 캐릭터의 헤어 파츠를 두개골 비율에 맞춰 자동 정렬·이식하고 툰 셰이더 색감까지 자연스럽게 이어 붙입니다. 72포즈와 3면 설정집도 즉시 꺼냅니다.",
    creatorBenefitKo: "매 화마다 얼굴 각도와 머리 볼륨을 다시 잡는 시간을 크게 줄여 줍니다.",
    axisId: "character-3d-bg",
    route: "/studio/character",
    ctaLabelKo: "캐릭터 셰이퍼·포즈실 열기",
    imageSrc: "/assets/atelier/onboarding/character-sculpt.webp",
    imageAltKo: "3D 캐릭터 헤어 이식과 포즈 조형 썸네일",
    specHighlightsKo: [
      "두개골 자동 정렬 · 본 웨이트 재매핑 크로스 VRM 헤어 이식",
      "72가지 포즈·손짓·표정 프리셋 + 관절 자연 보정",
      "정면·측면·후면 3면 설정집 & 3D→G펜 벡터 선화 투영",
    ],
    keywords: ["헤어 이식", "VRM", "72포즈", "캐릭터 셰이퍼", "3면 설정집", "포즈"],
  },
  {
    id: "diff-webgpu-xpbd-lighting",
    order: 4,
    badgeKo: "차별화 04 · 실시간 GPU 물리·광원",
    titleKo: "WebGPU 헤어·의상 물리(XPBD) & 2D/3D 광원 베이크",
    headlineKo: "바람에 날리는 머리카락과 역광 림 라이트를 브라우저에서 바로 굽습니다",
    summaryKo:
      "WebGPU 컴퓨트 셰이더로 머리카락과 의상이 몸체를 뚫지 않게 충돌을 계산하고, 장면 조명 각도를 돌려 2D 툰 음영과 역광 하이라이트를 즉시 반영합니다.",
    creatorBenefitKo: "무거운 외부 3D 렌더러를 켜지 않아도 역동적인 의상 주름과 드라마틱한 조명을 맞춥니다.",
    axisId: "ondevice-zero-cost",
    route: "/tech",
    ctaLabelKo: "WebGPU 물리·광원 데모 보기",
    imageSrc: "/assets/atelier/media/oil-impasto.webp",
    imageAltKo: "유화 나이프 질감과 입체 광원 표현 썸네일",
    specHighlightsKo: [
      "WebGPU 컴퓨트 XPBD 헤어·의상 실시간 충돌 풀이",
      "인체 캡슐 콜라이더 파고듦 방지 자동 감사",
      "2D/3D 레이트레이싱 근사 주광·림 라이트 툰 음영 베이크",
    ],
    keywords: ["WebGPU", "XPBD", "헤어 물리", "의상 물리", "광원 베이크", "조명"],
  },
  {
    id: "diff-peripherals-webhid-stylus",
    order: 5,
    badgeKo: "차별화 05 · 프로 주변기기 직결",
    titleKo: "왼손 컨트롤러(WebHID) · 240Hz 스타일러스 · 스마트워치",
    headlineKo: "쓰던 왼손 다이얼과 펜, 스마트워치까지 웹에서 그대로 손에 감깁니다",
    summaryKo:
      "TourBox·Wacom ExpressKey·Xencelabs Quick Keys를 Chrome WebHID로 바로 붙이고, 스타일러스 기울기·배럴 롤·뒷면 지우개·스마트워치 휴식/제스처까지 묶었습니다.",
    creatorBenefitKo: "웹 기반 스튜디오에서도 데스크톱 전용 툴 못지않은 단축키 손맛과 필압 반응 속도를 유지합니다.",
    axisId: "peripherals-multidevice",
    route: "/studio/canvas",
    ctaLabelKo: "캔버스 주변기기 설정 열기",
    imageSrc: "/assets/atelier/media/graphite-pencil.webp",
    imageAltKo: "4B 흑연 연필과 정밀 스타일러스·왼손 컨트롤러 연동 썸네일",
    specHighlightsKo: [
      "TourBox·ExpressKey·Quick Keys 3종 WebHID 즉시 매핑",
      "240Hz 필압·기울기·360° 배럴 롤·뒷면 지우개·팜 리젝션",
      "스마트워치 BLE 컴패니언 + 태블릿·모바일·왼손잡이 미러",
    ],
    keywords: ["WebHID", "왼손 컨트롤러", "TourBox", "스타일러스", "스마트워치", "필압", "기울기", "주변기기"],
  },
  {
    id: "diff-virtual-studio-hrtf",
    order: 6,
    badgeKo: "차별화 06 · 공간 음향 협업",
    titleKo: "가상 스튜디오 & 3D HRTF 공간 음향 실시간 작업실",
    headlineKo: "옆자리 동료의 연필 소리와 라이트박스 피드백이 한 공간에 살아 있습니다",
    summaryKo:
      "목재 아틀리에·자료실·루프탑 등 6종 작업실에 아바타로 모여, 거리·방향·벽체 차음이 반영된 3D 공간 음향 속에서 공중 라이트박스 스토리보드를 함께 검수합니다.",
    creatorBenefitKo: "혼자 밤샘 작업할 때의 고립감을 덜고, 어시스턴트·PD와의 컷 검수를 한 화면에서 끝냅니다.",
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
    order: 7,
    badgeKo: "차별화 07 · 안심 출고·무빙툰",
    titleKo: "권리 감사 BOM 증명서 & 4K/60fps 로컬 무빙툰 출고",
    headlineKo: "저작권 점검표부터 4K 홍보 릴스까지 마감 직전 5분 안에 끝냅니다",
    summaryKo:
      "출고 직전 원고에 포함된 소재·폰트·브러시 라이선스를 자동 감사해 rights-bom-receipt.json 증명서를 발급하고, WebCodecs로 4K/60fps 무빙툰 릴스를 내 PC에서 바로 뽑습니다.",
    creatorBenefitKo: "상업 연재 저작권 분쟁 위험을 원천 차단하고, 외부 영상 툴 없이 홍보 쇼츠까지 바로 만듭니다.",
    axisId: "rights-bom-export",
    route: "/studio/canvas",
    ctaLabelKo: "원고 출고·권리 점검 보기",
    imageSrc: "/assets/atelier/onboarding/episode-publish.webp",
    imageAltKo: "권리 감사 BOM과 4K 무빙툰 출고 화면 썸네일",
    specHighlightsKo: [
      "소재·폰트·브러시 상업 라이선스 자동 점검 & BOM 영수증 발급",
      "브라우저 WebCodecs 4K/60fps 2.5D 무빙툰 로컬 인코딩",
      "플랫폼 세로 규격 자동 분할(Smart Slice) & 다크모드 검수",
    ],
    keywords: ["권리 BOM", "저작권", "4K", "무빙툰", "WebCodecs", "출고", "릴스"],
  },
  {
    id: "diff-local-first-open-compare",
    order: 8,
    badgeKo: "차별화 08 · 로컬 우선·투명 비교",
    titleKo: "설치 없는 로컬 우선 스튜디오 & 글로벌 6종 투명 비교",
    headlineKo: "가입 전 1초 만에 캔버스를 열고, 기존 6개 제작 도구와 스펙을 직접 대조합니다",
    summaryKo:
      "SQLite WASM + OPFS 로컬 저장과 Git형 스냅샷 브랜치로 작업본을 내 기기에 단단히 지키면서, 글로벌 드로잉·웹툰 툴 6종과의 공개 스펙 차이를 숨김없이 보여 줍니다.",
    creatorBenefitKo: "무거운 설치나 강제 월정액 잠금 없이 작업 습관에 맞는지 직접 비교하고 결정할 수 있습니다.",
    axisId: "ondevice-zero-cost",
    route: "/compare/studio",
    ctaLabelKo: "글로벌 도구 6종과 비교 보기",
    imageSrc: "/assets/atelier/spaces/comic-gallery.webp",
    imageAltKo: "코믹 갤러리 전시 공간과 제작 도구 투명 비교 썸네일",
    specHighlightsKo: [
      "SQLite WASM + OPFS 로컬 우선 저장 & Git형 브랜치 롤백",
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
    tipKo: "희소 타일 캔버스에서 800% 세밀 묘사까지 부드럽게 확대합니다.",
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
