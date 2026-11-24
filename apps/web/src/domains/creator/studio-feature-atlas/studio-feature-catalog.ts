/**
 * 툰스튜디오·드로잉 전체 기능 아틀라스(7대 기능 축) 정본 카탈로그 및 조회 헬퍼.
 *
 * - 현재 저장소에 실제 구현된 기능·라우트·WebP 아틀리에 에셋 경로만 정직하게 수록한다.
 * - 8대 차별화 카드와 단축키 치트시트를 함께 재내보내기해 단일 진입 카탈로그로 제공한다.
 */

import {
  DIFFERENTIATOR_SHOWCASE_CARDS,
  STUDIO_SHORTCUT_CHEATSHEET,
  type AtlasRoutePath,
  type DifferentiatorShowcaseCard,
  type FeatureAxisId,
  type ShortcutCategoryId,
  type StudioShortcutEntry,
} from "./studio-feature-showcase-data";

export {
  DIFFERENTIATOR_SHOWCASE_CARDS,
  STUDIO_SHORTCUT_CHEATSHEET,
  type AtlasRoutePath,
  type DifferentiatorShowcaseCard,
  type FeatureAxisId,
  type ShortcutCategoryId,
  type StudioShortcutEntry,
};

export interface StudioFeatureItem {
  readonly id: string;
  readonly axisId: FeatureAxisId;
  readonly titleKo: string;
  readonly summaryKo: string;
  readonly route: AtlasRoutePath;
  readonly badgeKo: string;
  readonly shortcuts: readonly string[];
  readonly keywords: readonly string[];
}

export interface StudioFeatureAxis {
  readonly id: FeatureAxisId;
  readonly order: number;
  readonly titleKo: string;
  readonly shortLabelKo: string;
  readonly taglineKo: string;
  readonly primaryRoute: AtlasRoutePath;
  readonly previewImageSrc: string;
  readonly previewImageAltKo: string;
  readonly features: readonly StudioFeatureItem[];
}

export interface AtlasCatalogSummary {
  readonly axisCount: number;
  readonly featureCount: number;
  readonly differentiatorCount: number;
  readonly shortcutCount: number;
  readonly routes: readonly AtlasRoutePath[];
}

/** 툰스튜디오 7대 기능 축 전체 맵 (현재 구현 기준). */
export const STUDIO_FEATURE_AXES: readonly StudioFeatureAxis[] = [
  {
    id: "drawing-2d-foley",
    order: 1,
    titleKo: "2D 프로 드로잉 · 실물 물리 마찰음",
    shortLabelKo: "2D 드로잉·마찰음",
    taglineKo: "펜촉과 종이결이 맞닿는 감촉을 소리·필압·벡터 선화로 그대로 살립니다.",
    primaryRoute: "/studio/canvas",
    previewImageSrc: "/assets/atelier/media/gpen-ink.webp",
    previewImageAltKo: "G펜 스틸 닙과 켄트지 드로잉 클로즈업",
    features: [
      {
        id: "feat-physical-foley",
        axisId: "drawing-2d-foley",
        titleKo: "실물 화구·종이결 물리 마찰음",
        summaryKo:
          "G펜, 4B 연필, 수채 붓, 알코올 마커, 유화 나이프, 목탄이 켄트지·한지·황목지·린넨 캔버스를 스칠 때 필압과 속도에 맞춰 사각거림을 냅니다.",
        route: "/studio/canvas",
        badgeKo: "매체·종이 소리",
        shortcuts: ["B", "P"],
        keywords: ["마찰음", "화구", "종이결", "G펜", "연필", "수채", "ASMR", "Foley"],
      },
      {
        id: "feat-sparse-vector-canvas",
        axisId: "drawing-2d-foley",
        titleKo: "무한 캔버스 희소 타일 · 선명한 확대",
        summaryKo:
          "화면에 보이는 256×256 타일만 메모리에 올려 가볍게 작업하고, 800% 가까이 확대해도 선이 계단처럼 깨지지 않습니다.",
        route: "/studio/canvas",
        badgeKo: "무한 캔버스",
        shortcuts: ["Z", "Space", "Home"],
        keywords: ["무한 캔버스", "희소 타일", "벡터", "확대", "메모리 절감"],
      },
      {
        id: "feat-stabilizer-kalman",
        axisId: "drawing-2d-foley",
        titleKo: "손떨림 보정 · 1프레임 선행 예측",
        summaryKo:
          "빠르게 선을 그을 때 펜 끝이 뒤처지는 느낌을 2D 칼만 예측으로 줄이고, 급커브에서 선이 튀지 않게 잡아 줍니다.",
        route: "/studio/canvas",
        badgeKo: "매끄러운 선화",
        shortcuts: ["B", "E"],
        keywords: ["손떨림", "선화", "필압", "잉크 지연", "칼만 예측"],
      },
      {
        id: "feat-close-gap-fill-ruler",
        axisId: "drawing-2d-foley",
        titleKo: "틈 닫기 색 채우기 · 원근 투시 가이드",
        summaryKo:
          "선이 살짝 벌어진 틈도 막아 밑색을 한 번에 채우고, 1~3점 투시 자와 스마트 도형으로 깔끔한 배경 선을 긋습니다.",
        route: "/studio/canvas",
        badgeKo: "밑색·투시 자",
        shortcuts: ["G", "N", "Shift+N"],
        keywords: ["틈 닫기", "색 채우기", "올가미 채우기", "원근 자", "투시", "스마트 도형"],
      },
    ],
  },
  {
    id: "character-3d-bg",
    order: 2,
    titleKo: "3D 캐릭터 · 실물 헤어 이식 · 72포즈 · 배경",
    shortLabelKo: "3D 인물·헤어·배경",
    taglineKo: "주연 얼굴·체형부터 다른 모델의 헤어 이식, 72가지 포즈, 배경 선화까지 한 곳에서 끝냅니다.",
    primaryRoute: "/studio/character",
    previewImageSrc: "/assets/atelier/onboarding/character-sculpt.webp",
    previewImageAltKo: "3D 캐릭터 조형과 포즈 조정 화면",
    features: [
      {
        id: "feat-vrm-hair-transplant",
        axisId: "character-3d-bg",
        titleKo: "크로스 VRM 실물 헤어 이식",
        summaryKo:
          "다른 캐릭터의 3D 머리를 두개골 크기에 맞춰 자동 정렬하고, 본 웨이트와 만화풍 툰 셰이더 색감까지 자연스럽게 이어 받습니다.",
        route: "/studio/character",
        badgeKo: "헤어 이식",
        shortcuts: [],
        keywords: ["헤어 이식", "VRM", "두개골 정렬", "툰 셰이더", "캐릭터 머리"],
      },
      {
        id: "feat-72-pose-natural-rig",
        axisId: "character-3d-bg",
        titleKo: "72가지 포즈 · 손짓 · 표정 프리셋",
        summaryKo:
          "일상·액션·로맨스 포즈와 손동작을 바로 적용하고, 어색한 관절 꺾임과 바닥 파고듦을 자동으로 다듬습니다.",
        route: "/studio/character",
        badgeKo: "72포즈·관절 보정",
        shortcuts: [],
        keywords: ["72포즈", "포즈", "손짓", "표정", "데생 인형", "관절 보정"],
      },
      {
        id: "feat-character-shaper-3view",
        axisId: "character-3d-bg",
        titleKo: "캐릭터 셰이퍼 · 3면 설정집 생성",
        summaryKo:
          "슬라이더로 체형·이목구비 비율을 맞춘 뒤 정면·측면·후면 설정집과 표정 연동 시트를 한 번에 뽑아 둡니다.",
        route: "/studio/character",
        badgeKo: "3면 설정집",
        shortcuts: [],
        keywords: ["캐릭터 셰이퍼", "3면도", "설정집", "비율", "표정"],
      },
      {
        id: "feat-bg3d-vector-projection",
        axisId: "character-3d-bg",
        titleKo: "3D 배경 무대 · G펜 벡터 선화 투영",
        summaryKo:
          "스케치 구도를 바탕으로 3D 배경과 카메라 렌즈 각도를 잡은 뒤, 2D 캔버스에서 바로 다듬을 수 있는 G펜 선화로 넘깁니다.",
        route: "/studio/bg3d",
        badgeKo: "3D 배경·선화 추출",
        shortcuts: ["R"],
        keywords: ["3D 배경", "장면 도우미", "카메라 렌즈", "선화 투영", "스케치 투 3D"],
      },
    ],
  },
  {
    id: "cut-layout-colorscript",
    order: 3,
    titleKo: "컷 연출 · 말풍선 · 컬러스크립트",
    shortLabelKo: "컷·말풍선·색감",
    taglineKo: "세로 스크롤 호흡, 말풍선 식자, 한 화 전체 색감 흐름을 놓치지 않게 잡아 줍니다.",
    primaryRoute: "/studio/canvas",
    previewImageSrc: "/assets/atelier/onboarding/first-cut-desk.webp",
    previewImageAltKo: "첫 4컷 웹툰 콘티와 말풍선 작업 데스크",
    features: [
      {
        id: "feat-cut-eyeflow-direction",
        axisId: "cut-layout-colorscript",
        titleKo: "컷 호흡 · 시선 흐름 · 샷 크기 검수",
        summaryKo:
          "풀샷·미디엄·클로즈업 리듬과 모바일 세로 스크롤 간격을 점검해 독자 시선이 막히는 구간을 바로 알려 줍니다.",
        route: "/studio/canvas",
        badgeKo: "연출 호흡",
        shortcuts: ["C", "V"],
        keywords: ["컷 연출", "시선 흐름", "샷 크기", "세로 스크롤", "콘티"],
      },
      {
        id: "feat-balloon-voice-sfx",
        axisId: "cut-layout-colorscript",
        titleKo: "말풍선 · 세로쓰기 · 음성→말풍선 배치",
        summaryKo:
          "한국어 말풍선 줄바꿈과 넘침을 자동 점검하고, 말로 읽은 대사나 대본을 컷별 말풍선과 효과음(SFX)으로 옮겨 놓습니다.",
        route: "/studio/canvas",
        badgeKo: "말풍선·효과음",
        shortcuts: ["T"],
        keywords: ["말풍선", "식자", "대사", "효과음", "SFX", "음성 입력"],
      },
      {
        id: "feat-episode-colorscript",
        axisId: "cut-layout-colorscript",
        titleKo: "에피소드 컬러스크립트 · 명암 조화",
        summaryKo:
          "1컷부터 마지막 컷까지 감정선에 맞는 색온도와 밝기 흐름을 한눈에 보고, 다크모드에서도 잘 읽히는지 검수합니다.",
        route: "/studio/canvas",
        badgeKo: "색감 흐름",
        shortcuts: ["I", "O"],
        keywords: ["컬러스크립트", "배색", "명암", "다크모드 검수", "분위기"],
      },
      {
        id: "feat-continuity-comment-pins",
        axisId: "cut-layout-colorscript",
        titleKo: "작품 연속성 설정집 · 컷 위치 댓글",
        summaryKo:
          "회차가 쌓여도 의상·소품 설정이 어긋나지 않게 대조하고, 컷 위 원하는 좌표에 수정 메모와 비인쇄 빨간펜을 꽂아 둡니다.",
        route: "/studio/canvas",
        badgeKo: "연속성·빨간펜",
        shortcuts: ["Alt+C"],
        keywords: ["위치 댓글", "빨간펜", "연속성", "설정집", "검수"],
      },
    ],
  },
  {
    id: "peripherals-multidevice",
    order: 4,
    titleKo: "주변기기 · 멀티 디바이스",
    shortLabelKo: "주변기기·멀티기기",
    taglineKo: "별도 드라이버 씨름 없이 왼손 다이얼, 240Hz 스타일러스, 스마트워치, 태블릿·XR까지 연결합니다.",
    primaryRoute: "/studio/canvas",
    previewImageSrc: "/assets/atelier/media/graphite-pencil.webp",
    previewImageAltKo: "흑연 연필 질감과 정밀 스타일러스 입력 표현",
    features: [
      {
        id: "feat-webhid-lefthand",
        axisId: "peripherals-multidevice",
        titleKo: "왼손 컨트롤러 브라우저 직결 (WebHID)",
        summaryKo:
          "TourBox Neo/Elite, Wacom ExpressKey Remote, Xencelabs Quick Keys를 Chrome WebHID로 바로 연결해 브러시 크기·회전·실행 취소를 손끝으로 돌립니다.",
        route: "/studio/canvas",
        badgeKo: "WebHID 왼손 패드",
        shortcuts: ["R", "Z"],
        keywords: ["왼손 컨트롤러", "WebHID", "TourBox", "ExpressKey", "Quick Keys", "다이얼"],
      },
      {
        id: "feat-stylus-pressure-tilt",
        axisId: "peripherals-multidevice",
        titleKo: "스타일러스 필압 · 기울기 · 배럴 롤 · 뒷면 지우개",
        summaryKo:
          "240Hz 펜 입력, 호버 3D 닙 윤곽, 360° 펜 회전, 뒷면 지우개, 팜 리젝션, 판 태블릿 1:1 비율 잠금과 브러시별 필압 곡선을 모두 지원합니다.",
        route: "/studio/canvas",
        badgeKo: "240Hz 스타일러스",
        shortcuts: ["B", "E"],
        keywords: ["스타일러스", "필압", "기울기", "배럴 롤", "뒷면 지우개", "팜 리젝션", "타블렛"],
      },
      {
        id: "feat-smartwatch-apple-galaxy",
        axisId: "peripherals-multidevice",
        titleKo: "스마트워치 · Mac 트랙패드 · iPad 120Hz 연동",
        summaryKo:
          "Apple Watch·Wear OS·스마트 링을 BLE로 이어 작업 시간 휴식 안내와 원격 제스처를 쓰고, ProMotion 120Hz와 Display-P3 색역을 그대로 활용합니다.",
        route: "/studio/canvas",
        badgeKo: "워치·120Hz",
        shortcuts: [],
        keywords: ["스마트워치", "Apple Watch", "Wear OS", "BLE", "iPad", "ProMotion", "트랙패드"],
      },
      {
        id: "feat-tablet-mobile-webxr",
        axisId: "peripherals-multidevice",
        titleKo: "태블릿 3모드 · 모바일 엄지 도크 · 왼손 미러 · WebXR",
        summaryKo:
          "태블릿·모바일에서도 한 손으로 도구를 바꾸고, 왼손잡이 화면 반전과 WebXR 공간 작업대까지 기기에 맞춰 매끄럽게 전환합니다.",
        route: "/studio/space",
        badgeKo: "태블릿·모바일·XR",
        shortcuts: ["Shift+T"],
        keywords: ["태블릿", "모바일", "왼손잡이 미러", "WebXR", "엄지 도크", "AR", "VR"],
      },
    ],
  },
  {
    id: "virtual-studio-spatial",
    order: 5,
    titleKo: "가상 스튜디오 · 3D HRTF 공간 음향 · 실시간 협업",
    shortLabelKo: "가상 스튜디오·협업",
    taglineKo: "같은 작업실에 둘러앉아 연필 사각임과 방향감 있는 소리를 나누며 실시간으로 원고를 맞춥니다.",
    primaryRoute: "/studio/space",
    previewImageSrc: "/assets/atelier/spaces/wood-atelier.webp",
    previewImageAltKo: "따뜻한 목재 아틀리에 가상 스튜디오 공간",
    features: [
      {
        id: "feat-six-atelier-spaces",
        axisId: "virtual-studio-spatial",
        titleKo: "6종 가상 작업실 공간",
        summaryKo:
          "목재 아틀리에, 정숙 자료실, 루프탑 테라스, 심야 만화카페, 코믹 갤러리, 판타지 길드홀 중 오늘 작업 분위기에 맞는 공간을 고릅니다.",
        route: "/studio/space",
        badgeKo: "6종 아틀리에",
        shortcuts: [],
        keywords: ["가상 스튜디오", "목재 아틀리에", "자료실", "만화카페", "루프탑", "작업실"],
      },
      {
        id: "feat-hrtf-binaural-stage",
        axisId: "virtual-studio-spatial",
        titleKo: "3D HRTF 공간 음향 · 벽체 차음",
        summaryKo:
          "동료 아바타의 거리와 방향, 방음 벽체 여부에 따라 연필 마찰음과 발소리, 음성 잔향이 실제 공간처럼 자연스럽게 들립니다.",
        route: "/studio/space",
        badgeKo: "3D HRTF 음향",
        shortcuts: [],
        keywords: ["HRTF", "공간 음향", "바이노럴", "차음", "잔향", "발소리", "동료 소리"],
      },
      {
        id: "feat-spatial-lightbox-collab",
        axisId: "virtual-studio-spatial",
        titleKo: "공중 라이트박스 스토리보드 · 3D 피드백 스티커",
        summaryKo:
          "회차 컷을 공중 라이트박스에 펼쳐 놓고 팀원과 실시간 포인터를 맞추며, 구도·대사·색감 수정 스티커를 3D 공간에 고정합니다.",
        route: "/studio/space",
        badgeKo: "실시간 스토리보드",
        shortcuts: ["Alt+C"],
        keywords: ["실시간 협업", "라이트박스", "스토리보드", "피드백 스티커", "팀 검수"],
      },
      {
        id: "feat-opfs-branch-vcs",
        axisId: "virtual-studio-spatial",
        titleKo: "내 기기 스냅샷 브랜치 · 원클릭 되돌리기 (OPFS)",
        summaryKo:
          "브라우저 OPFS에 변경된 조각만 중복 제거해 저장하므로, 시안 A·B 브랜치를 나눠 그리다가 언제든 손실 없이 되돌릴 수 있습니다.",
        route: "/studio/canvas",
        badgeKo: "브랜치·복구",
        shortcuts: [],
        keywords: ["OPFS", "스냅샷", "버전 관리", "브랜치", "되돌리기", "자동 저장"],
      },
    ],
  },
  {
    id: "ondevice-zero-cost",
    order: 6,
    titleKo: "온디바이스 0원 엔진 (WebNN · Kubelka-Munk · WebGPU XPBD)",
    shortLabelKo: "온디바이스 0원 엔진",
    taglineKo: "외부 서버 전송이나 토큰 과금 없이 내 기기에서 물감 광학·선화 보정·옷감 물리를 즉시 계산합니다.",
    primaryRoute: "/tech",
    previewImageSrc: "/assets/atelier/media/watercolor-sable.webp",
    previewImageAltKo: "세이블 수채 붓과 물리 안료 혼색 표현",
    features: [
      {
        id: "feat-kubelka-munk-pigment",
        axisId: "ondevice-zero-cost",
        titleKo: "Kubelka-Munk 8밴드 실제 물감 혼색",
        summaryKo:
          "파란색과 노란색을 섞을 때 디지털 회색으로 탁해지지 않고, 실제 수채·유화 물감처럼 맑은 초록과 종이 골짜기 안료 침전까지 계산합니다.",
        route: "/tech",
        badgeKo: "실제 물감 광학",
        shortcuts: ["Shift+N"],
        keywords: ["Kubelka-Munk", "물감 혼색", "안료", "수채", "유화", "혼색", "0원"],
      },
      {
        id: "feat-webnn-lineart-director",
        axisId: "ondevice-zero-cost",
        titleKo: "WebNN 내 기기 선화 정리 · 컷 연출 진단",
        summaryKo:
          "지저분한 러프 선을 다듬고 말풍선·샷 구도를 점검하는 작업을 내 기기에서 바로 처리해 원고 유출 걱정과 추가 요금이 없습니다.",
        route: "/tech",
        badgeKo: "WebNN 0원 보정",
        shortcuts: ["B"],
        keywords: ["WebNN", "온디바이스", "0원", "선화 보정", "러프 정리", "컷 진단"],
      },
      {
        id: "feat-webgpu-xpbd-lighting",
        axisId: "ondevice-zero-cost",
        titleKo: "WebGPU XPBD 헤어·의상 물리 & 2D/3D 광원 베이크",
        summaryKo:
          "머리카락과 망토가 몸을 뚫고 들어가지 않게 실시간 충돌을 풀고, 주 광원·림 라이트를 2D/3D 툰 음영으로 바로 구워 냅니다.",
        route: "/tech",
        badgeKo: "WebGPU 물리·광원",
        shortcuts: [],
        keywords: ["WebGPU", "XPBD", "헤어 물리", "의상 물리", "광원 베이크", "림 라이트"],
      },
      {
        id: "feat-local-first-sqlite-opfs",
        axisId: "ondevice-zero-cost",
        titleKo: "로그인 전 즉시 진입 · 로컬 우선 저장",
        summaryKo:
          "설치나 가입 장벽 없이 바로 캔버스를 열고, 작업 데이터는 내 브라우저 SQLite WASM과 OPFS에 우선 안전하게 보관합니다.",
        route: "/compare/studio",
        badgeKo: "로컬 우선·무설치",
        shortcuts: [],
        keywords: ["로컬 저장", "SQLite", "OPFS", "비로그인", "무설치", "오프라인"],
      },
    ],
  },
  {
    id: "rights-bom-export",
    order: 7,
    titleKo: "권리 감사 BOM · 4K 무빙툰 · 출고",
    shortLabelKo: "권리 BOM·4K 출고",
    taglineKo: "상업 연재 저작권 증명서 발급부터 4K 무빙툰 예고편, 플랫폼 규격 분할까지 출고 사고를 막아 줍니다.",
    primaryRoute: "/studio/canvas",
    previewImageSrc: "/assets/atelier/onboarding/episode-publish.webp",
    previewImageAltKo: "웹툰 원고 최종 점검과 출고 패키지 화면",
    features: [
      {
        id: "feat-rights-bom-receipt",
        axisId: "rights-bom-export",
        titleKo: "출고 전 권리 감사 BOM · 증명서 자동 발급",
        summaryKo:
          "원고에 쓴 3D 배경·브러시·폰트의 상업 이용 가능 여부를 출고 직전에 걸러내고, 제출용 rights-bom-receipt.json 영수증을 함께 묶어 줍니다.",
        route: "/studio/canvas",
        badgeKo: "저작권 안전망",
        shortcuts: [],
        keywords: ["권리 BOM", "저작권", "라이선스", "rights-bom-receipt", "출고 차단", "폰트 점검"],
      },
      {
        id: "feat-webcodecs-4k-movingtoon",
        axisId: "rights-bom-export",
        titleKo: "4K/60fps 무빙툰 쇼츠·릴스 로컬 출고 (WebCodecs)",
        summaryKo:
          "카메라 패닝·깊이 시차·흔들림 효과를 넣은 4K 무빙툰 예고 영상을 내 브라우저 하드웨어 인코더로 바로 뽑아 서버 대기열이 없습니다.",
        route: "/tech",
        badgeKo: "4K 무빙툰",
        shortcuts: [],
        keywords: ["4K", "무빙툰", "WebCodecs", "릴스", "쇼츠", "영상 출고", "패럴랙스"],
      },
      {
        id: "feat-platform-smart-slice",
        axisId: "rights-bom-export",
        titleKo: "플랫폼 세로 규격 검증 · 자동 분할 출고",
        summaryKo:
          "국내외 연재처 가로 폭과 용량 제한에 맞춰 세로 원고를 안전하게 자르고, 말풍선이 잘리지 않는 경계를 자동으로 찾습니다.",
        route: "/studio/canvas",
        badgeKo: "연재 규격 분할",
        shortcuts: ["C"],
        keywords: ["출고", "자동 분할", "세로 원고", "플랫폼 규격", "Smart Slice"],
      },
      {
        id: "feat-timelapse-goods-readiness",
        axisId: "rights-bom-export",
        titleKo: "작업 타임랩스 · 굿즈/인쇄 재단선 점검",
        summaryKo:
          "독자 홍보용 타임랩스를 깔끔하게 남기고, 권리 BOM이 통과된 원고는 인쇄·굿즈 재단선과 2차 사업 준비도까지 한 번에 확인합니다.",
        route: "/compare/studio",
        badgeKo: "타임랩스·2차 사업",
        shortcuts: [],
        keywords: ["타임랩스", "굿즈", "인쇄", "재단선", "2차 IP", "프로모션"],
      },
    ],
  },
];

export function getFeatureAxisById(axisId: FeatureAxisId): StudioFeatureAxis | undefined {
  return STUDIO_FEATURE_AXES.find((axis) => axis.id === axisId);
}

export function getAllStudioFeatures(): readonly StudioFeatureItem[] {
  return STUDIO_FEATURE_AXES.flatMap((axis) => axis.features);
}

export function getDifferentiatorById(id: string): DifferentiatorShowcaseCard | undefined {
  return DIFFERENTIATOR_SHOWCASE_CARDS.find((card) => card.id === id);
}

export function getAtlasCatalogSummary(): AtlasCatalogSummary {
  const routes = new Set<AtlasRoutePath>();
  for (const axis of STUDIO_FEATURE_AXES) {
    routes.add(axis.primaryRoute);
    for (const feature of axis.features) {
      routes.add(feature.route);
    }
  }
  for (const card of DIFFERENTIATOR_SHOWCASE_CARDS) {
    routes.add(card.route);
  }
  return {
    axisCount: STUDIO_FEATURE_AXES.length,
    featureCount: getAllStudioFeatures().length,
    differentiatorCount: DIFFERENTIATOR_SHOWCASE_CARDS.length,
    shortcutCount: STUDIO_SHORTCUT_CHEATSHEET.length,
    routes: [...routes],
  };
}
