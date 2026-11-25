/**
 * 툰스튜디오·드로잉 전체 기능 아틀라스(7대 기능 축) 정본 카탈로그 및 조회 헬퍼.
 *
 * - 독립 예제 소개와 기존 화면 링크를 구분하며 라우트 존재만으로 실제 원고 연결을 단정하지 않는다.
 * - 8대 차별화 카드와 단축키 치트시트를 함께 재내보내기해 단일 진입 카탈로그로 제공한다.
 */

import {
  DIFFERENTIATOR_SHOWCASE_CARDS,
  ATLAS_ENTRY_SCOPE_LABELS,
  STUDIO_SHORTCUT_CHEATSHEET,
  type AtlasRoutePath,
  type AtlasEntryScope,
  type DifferentiatorShowcaseCard,
  type FeatureAxisId,
  type ShortcutCategoryId,
  type StudioShortcutEntry,
} from "./studio-feature-showcase-data";

export {
  DIFFERENTIATOR_SHOWCASE_CARDS,
  ATLAS_ENTRY_SCOPE_LABELS,
  STUDIO_SHORTCUT_CHEATSHEET,
  type AtlasRoutePath,
  type AtlasEntryScope,
  type DifferentiatorShowcaseCard,
  type FeatureAxisId,
  type ShortcutCategoryId,
  type StudioShortcutEntry,
};

export interface StudioFeatureItem {
  readonly id: string;
  readonly scope: AtlasEntryScope;
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

/** 툰스튜디오 7대 기능 축 안내. 항목 수는 구현 완료 기능 수가 아니다. */
export const STUDIO_FEATURE_AXES: readonly StudioFeatureAxis[] = [
  {
    id: "drawing-2d-foley",
    order: 1,
    titleKo: "2D 프로 드로잉 · 실물 물리 마찰음",
    shortLabelKo: "2D 드로잉·마찰음",
    taglineKo: "소리·필압·벡터 선화의 실험 항목과 드로잉 화면을 안내합니다.",
    primaryRoute: "/studio/canvas",
    previewImageSrc: "/assets/atelier/media/gpen-ink.webp",
    previewImageAltKo: "G펜 스틸 닙과 켄트지 드로잉 클로즈업",
    features: [
      {
        id: "feat-physical-foley",
        scope: "standalone-example",
        axisId: "drawing-2d-foley",
        titleKo: "실물 화구·종이결 물리 마찰음",
        summaryKo:
          "화구·종이 조합과 합성 소리의 독립 예제입니다. 실제 펜 스트로크와의 연결 여부는 대상 화면에서 확인해야 합니다.",
        route: "/studio/canvas",
        badgeKo: "매체·종이 소리",
        shortcuts: ["B", "P"],
        keywords: ["마찰음", "화구", "종이결", "G펜", "연필", "수채", "ASMR", "Foley"],
      },
      {
        id: "feat-sparse-vector-canvas",
        scope: "standalone-example",
        axisId: "drawing-2d-foley",
        titleKo: "무한 캔버스 희소 타일 · 선명한 확대",
        summaryKo:
          "희소 타일과 확대 좌표 계산을 살펴보는 실험 항목입니다. 실제 원고의 메모리 사용량과 확대 품질을 측정한 결과는 아닙니다.",
        route: "/studio/canvas",
        badgeKo: "무한 캔버스",
        shortcuts: ["Z", "Space", "Home"],
        keywords: ["무한 캔버스", "희소 타일", "벡터", "확대", "메모리 절감"],
      },
      {
        id: "feat-stabilizer-kalman",
        scope: "standalone-example",
        axisId: "drawing-2d-foley",
        titleKo: "손떨림 보정 · 입력 예측 예제",
        summaryKo:
          "2D 칼만 예측으로 입력 좌표를 계산하는 예제입니다. 실제 펜 지연 감소나 선 품질 개선을 보증하지 않습니다.",
        route: "/studio/canvas",
        badgeKo: "매끄러운 선화",
        shortcuts: ["B", "E"],
        keywords: ["손떨림", "선화", "필압", "잉크 지연", "칼만 예측"],
      },
      {
        id: "feat-close-gap-fill-ruler",
        scope: "screen-guide",
        axisId: "drawing-2d-foley",
        titleKo: "틈 닫기 색 채우기 · 원근 투시 가이드",
        summaryKo:
          "색 채우기·투시 자·도형 도구의 관련 화면 안내입니다. 현재 도구에서 사용할 수 있는 옵션을 확인하세요.",
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
    taglineKo: "캐릭터·배경 화면과 헤어·포즈 독립 예제의 사용 범위를 나눠 안내합니다.",
    primaryRoute: "/studio/character",
    previewImageSrc: "/assets/atelier/onboarding/character-sculpt.webp",
    previewImageAltKo: "3D 캐릭터 조형과 포즈 조정 화면",
    features: [
      {
        id: "feat-vrm-hair-transplant",
        scope: "standalone-example",
        axisId: "character-3d-bg",
        titleKo: "크로스 VRM 실물 헤어 이식",
        summaryKo:
          "헤어 정렬 계획과 별도로 전달한 실제 VRM의 이식을 다룹니다. 기본 독립 예제는 현재 장면의 캐릭터를 바꾸지 않으며 물리 업데이트 연결도 별도입니다.",
        route: "/studio/character",
        badgeKo: "헤어 이식",
        shortcuts: [],
        keywords: ["헤어 이식", "VRM", "두개골 정렬", "툰 셰이더", "캐릭터 머리"],
      },
      {
        id: "feat-72-pose-natural-rig",
        scope: "standalone-example",
        axisId: "character-3d-bg",
        titleKo: "72가지 포즈 · 손짓 · 표정 프리셋",
        summaryKo:
          "포즈 목록과 관절·접지 계산을 살펴보는 예제입니다. 선택 결과가 현재 장면에 적용되는지는 연결 화면에서 확인해야 합니다.",
        route: "/studio/character",
        badgeKo: "72포즈·관절 보정",
        shortcuts: [],
        keywords: ["72포즈", "포즈", "손짓", "표정", "데생 인형", "관절 보정"],
      },
      {
        id: "feat-character-shaper-3view",
        scope: "screen-guide",
        axisId: "character-3d-bg",
        titleKo: "캐릭터 셰이퍼 · 3면 설정집 생성",
        summaryKo:
          "캐릭터 비율과 설정집 관련 화면 안내입니다. 선택 모델과 화면에서 제공하는 출력 범위를 확인하세요.",
        route: "/studio/character",
        badgeKo: "3면 설정집",
        shortcuts: [],
        keywords: ["캐릭터 셰이퍼", "3면도", "설정집", "비율", "표정"],
      },
      {
        id: "feat-bg3d-vector-projection",
        scope: "screen-guide",
        axisId: "character-3d-bg",
        titleKo: "3D 배경 무대 · G펜 벡터 선화 투영",
        summaryKo:
          "3D 배경·카메라·선화 추출 화면으로 이동합니다. 캔버스 삽입과 저장 결과는 해당 화면에서 확인하세요.",
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
    taglineKo: "컷·말풍선 화면과 대사·색감 실험 예제를 안내합니다.",
    primaryRoute: "/studio/canvas",
    previewImageSrc: "/assets/atelier/onboarding/first-cut-desk.webp",
    previewImageAltKo: "첫 4컷 웹툰 콘티와 말풍선 작업 데스크",
    features: [
      {
        id: "feat-cut-eyeflow-direction",
        scope: "screen-guide",
        axisId: "cut-layout-colorscript",
        titleKo: "컷 호흡 · 시선 흐름 · 샷 크기 검수",
        summaryKo:
          "컷 배치와 샷 구성 관련 화면 안내입니다. 이 지도에서 실제 원고의 시선 흐름을 자동 검사하지 않습니다.",
        route: "/studio/canvas",
        badgeKo: "연출 호흡",
        shortcuts: ["C", "V"],
        keywords: ["컷 연출", "시선 흐름", "샷 크기", "세로 스크롤", "콘티"],
      },
      {
        id: "feat-balloon-voice-sfx",
        scope: "standalone-example",
        axisId: "cut-layout-colorscript",
        titleKo: "말풍선 · 세로쓰기 · 음성→말풍선 배치",
        summaryKo:
          "대사 분석·말풍선 배치 계획의 독립 예제와 텍스트 도구 안내입니다. 음성 인식이나 현재 원고에 말풍선 삽입이 완료됐다는 뜻은 아닙니다.",
        route: "/studio/canvas",
        badgeKo: "말풍선·효과음",
        shortcuts: ["T"],
        keywords: ["말풍선", "식자", "대사", "효과음", "SFX", "음성 입력"],
      },
      {
        id: "feat-episode-colorscript",
        scope: "standalone-example",
        axisId: "cut-layout-colorscript",
        titleKo: "에피소드 컬러스크립트 · 명암 조화",
        summaryKo:
          "샘플 컷의 색온도·밝기 흐름을 계산하는 독립 예제입니다. 현재 원고를 불러와 실측하는 검수는 별도 연결이 필요합니다.",
        route: "/studio/canvas",
        badgeKo: "색감 흐름",
        shortcuts: ["I", "O"],
        keywords: ["컬러스크립트", "배색", "명암", "다크모드 검수", "분위기"],
      },
      {
        id: "feat-continuity-comment-pins",
        scope: "screen-guide",
        axisId: "cut-layout-colorscript",
        titleKo: "작품 연속성 설정집 · 컷 위치 댓글",
        summaryKo:
          "설정집과 위치 댓글 관련 화면 안내입니다. 실제 댓글 작성·권한·저장 결과는 해당 화면에서 확인하세요.",
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
    taglineKo: "주변기기 입력과 태블릿·모바일 배치의 실험 항목을 소개합니다. 기기 지원과 연결 상태는 별도 확인이 필요합니다.",
    primaryRoute: "/studio/canvas",
    previewImageSrc: "/assets/atelier/media/graphite-pencil.webp",
    previewImageAltKo: "흑연 연필 질감과 정밀 스타일러스 입력 표현",
    features: [
      {
        id: "feat-webhid-lefthand",
        scope: "standalone-example",
        axisId: "peripherals-multidevice",
        titleKo: "왼손 컨트롤러 브라우저 직결 (WebHID)",
        summaryKo:
          "WebHID 장치 매핑의 실험 항목입니다. 기기·브라우저 권한과 실제 편집기 명령 연결 여부를 확인해야 합니다.",
        route: "/studio/canvas",
        badgeKo: "WebHID 왼손 패드",
        shortcuts: ["R", "Z"],
        keywords: ["왼손 컨트롤러", "WebHID", "TourBox", "ExpressKey", "Quick Keys", "다이얼"],
      },
      {
        id: "feat-stylus-pressure-tilt",
        scope: "standalone-example",
        axisId: "peripherals-multidevice",
        titleKo: "스타일러스 필압 · 기울기 · 배럴 롤 · 뒷면 지우개",
        summaryKo:
          "필압·기울기·배럴 롤 등 입력값을 다루는 실험 항목입니다. 수집 가능한 항목과 입력 빈도는 기기·브라우저에 따라 다르며 실기기 성능 보증은 아닙니다.",
        route: "/studio/canvas",
        badgeKo: "스타일러스 입력 예제",
        shortcuts: ["B", "E"],
        keywords: ["스타일러스", "필압", "기울기", "배럴 롤", "뒷면 지우개", "팜 리젝션", "타블렛"],
      },
      {
        id: "feat-smartwatch-apple-galaxy",
        scope: "standalone-example",
        axisId: "peripherals-multidevice",
        titleKo: "스마트워치 · Mac 트랙패드 · iPad 입력 예제",
        summaryKo:
          "워치 메시지와 기기별 입력·화면 설정의 실험 항목입니다. 실제 BLE 연결, 원격 제스처, 주사율·색역 동작은 개별 기기 확인이 필요합니다.",
        route: "/studio/canvas",
        badgeKo: "워치·기기 입력 예제",
        shortcuts: [],
        keywords: ["스마트워치", "Apple Watch", "Wear OS", "BLE", "iPad", "ProMotion", "트랙패드"],
      },
      {
        id: "feat-tablet-mobile-webxr",
        scope: "standalone-example",
        axisId: "peripherals-multidevice",
        titleKo: "태블릿 3모드 · 모바일 엄지 도크 · 왼손 미러 · WebXR",
        summaryKo:
          "양손 휠·엄지 도크·왼손 배치를 살펴보는 독립 예제와 공간 화면 안내입니다. 원고 조작과 WebXR 연결 완료를 뜻하지 않습니다.",
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
    taglineKo: "가상 공간 화면과 음향·협업 실험 항목을 안내합니다.",
    primaryRoute: "/studio/space",
    previewImageSrc: "/assets/atelier/spaces/wood-atelier.webp",
    previewImageAltKo: "따뜻한 목재 아틀리에 가상 스튜디오 공간",
    features: [
      {
        id: "feat-six-atelier-spaces",
        scope: "standalone-example",
        axisId: "virtual-studio-spatial",
        titleKo: "6종 가상 작업실 공간",
        summaryKo:
          "6종 공간의 이미지와 구성 예제입니다. 모든 공간이 다중 사용자 작업실로 연결됐다는 뜻은 아닙니다.",
        route: "/studio/space",
        badgeKo: "6종 아틀리에",
        shortcuts: [],
        keywords: ["가상 스튜디오", "목재 아틀리에", "자료실", "만화카페", "루프탑", "작업실"],
      },
      {
        id: "feat-hrtf-binaural-stage",
        scope: "standalone-example",
        axisId: "virtual-studio-spatial",
        titleKo: "3D HRTF 공간 음향 · 벽체 차음",
        summaryKo:
          "거리·방향·벽체 조건별 음향 계산을 다루는 실험 항목입니다. 실제 동료 음성·아바타 위치와의 연결은 별도로 확인해야 합니다.",
        route: "/studio/space",
        badgeKo: "3D HRTF 음향",
        shortcuts: [],
        keywords: ["HRTF", "공간 음향", "바이노럴", "차음", "잔향", "발소리", "동료 소리"],
      },
      {
        id: "feat-spatial-lightbox-collab",
        scope: "standalone-example",
        axisId: "virtual-studio-spatial",
        titleKo: "공중 라이트박스 스토리보드 · 3D 피드백 스티커",
        summaryKo:
          "라이트박스·포인터·피드백 배치의 실험 항목입니다. 실제 팀 세션의 동기화나 댓글 저장 결과를 이 지도에서 확인하지 않습니다.",
        route: "/studio/space",
        badgeKo: "실시간 스토리보드",
        shortcuts: ["Alt+C"],
        keywords: ["실시간 협업", "라이트박스", "스토리보드", "피드백 스티커", "팀 검수"],
      },
      {
        id: "feat-opfs-branch-vcs",
        scope: "standalone-example",
        axisId: "virtual-studio-spatial",
        titleKo: "내 기기 스냅샷 브랜치 · 원클릭 되돌리기 (OPFS)",
        summaryKo:
          "스냅샷·브랜치 구조를 다루는 실험 항목입니다. 실제 문서 저장·복구 연결이나 무손실 복구를 보증하지 않습니다.",
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
    titleKo: "온디바이스 기술 안내 (WebNN · Kubelka-Munk · WebGPU XPBD)",
    shortLabelKo: "온디바이스 기술 안내",
    taglineKo: "로컬 계산 예제와 관련 기술 화면을 소개합니다. 모델 추론·GPU 실행·원고 연결 여부는 각 화면에서 확인하세요.",
    primaryRoute: "/tech",
    previewImageSrc: "/assets/atelier/media/watercolor-sable.webp",
    previewImageAltKo: "세이블 수채 붓과 물리 안료 혼색 표현",
    features: [
      {
        id: "feat-kubelka-munk-pigment",
        scope: "standalone-example",
        axisId: "ondevice-zero-cost",
        titleKo: "Kubelka-Munk 8밴드 실제 물감 혼색",
        summaryKo:
          "Kubelka-Munk 안료 혼색 계산의 독립 예제입니다. 실제 브러시 스트로크에 연결된 결과와는 구분합니다.",
        route: "/tech",
        badgeKo: "실제 물감 광학",
        shortcuts: ["Shift+N"],
        keywords: ["Kubelka-Munk", "물감 혼색", "안료", "수채", "유화", "혼색", "0원"],
      },
      {
        id: "feat-webnn-lineart-director",
        scope: "standalone-example",
        axisId: "ondevice-zero-cost",
        titleKo: "WebNN 내 기기 선화 정리 · 컷 연출 진단",
        summaryKo:
          "선화·컷 연출 진단의 실험 항목입니다. 준비된 모델의 실제 추론 실행과 원고 연결 여부를 확인해야 하며 보안·비용을 보증하지 않습니다.",
        route: "/tech",
        badgeKo: "WebNN 실험 안내",
        shortcuts: ["B"],
        keywords: ["WebNN", "온디바이스", "0원", "선화 보정", "러프 정리", "컷 진단"],
      },
      {
        id: "feat-webgpu-xpbd-lighting",
        scope: "standalone-example",
        axisId: "ondevice-zero-cost",
        titleKo: "WebGPU XPBD 헤어·의상 물리 & 2D/3D 광원 베이크",
        summaryKo:
          "XPBD 충돌·광원 계산의 독립 예제입니다. WebGPU 실제 실행 여부와 현재 장면에 적용되는 범위는 대상 화면에서 확인해야 합니다.",
        route: "/tech",
        badgeKo: "WebGPU 물리·광원",
        shortcuts: [],
        keywords: ["WebGPU", "XPBD", "헤어 물리", "의상 물리", "광원 베이크", "림 라이트"],
      },
      {
        id: "feat-local-first-sqlite-opfs",
        scope: "screen-guide",
        axisId: "ondevice-zero-cost",
        titleKo: "로그인 전 즉시 진입 · 로컬 우선 저장",
        summaryKo:
          "게스트 진입과 로컬 저장 관련 화면 안내입니다. 저장 성공·재열기·복구 결과는 실제 문서에서 확인하세요.",
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
    taglineKo: "권리 점검·출고 화면과 영상 출력 실험을 안내합니다. 점검 기록은 법적 이용 허가나 분쟁 예방 보증이 아닙니다.",
    primaryRoute: "/studio/canvas",
    previewImageSrc: "/assets/atelier/onboarding/episode-publish.webp",
    previewImageAltKo: "웹툰 원고 최종 점검과 출고 패키지 화면",
    features: [
      {
        id: "feat-rights-bom-receipt",
        scope: "screen-guide",
        axisId: "rights-bom-export",
        titleKo: "출고 전 권리 감사 BOM · 점검 영수증",
        summaryKo:
          "소재·브러시·폰트의 등록된 라이선스 근거를 점검하는 출고 화면 안내입니다. rights-bom-receipt.json은 점검 기록이며 이용 허가 증명서가 아닙니다.",
        route: "/studio/canvas",
        badgeKo: "권리 점검 기록",
        shortcuts: [],
        keywords: ["권리 BOM", "저작권", "라이선스", "rights-bom-receipt", "출고 차단", "폰트 점검"],
      },
      {
        id: "feat-webcodecs-4k-movingtoon",
        scope: "standalone-example",
        axisId: "rights-bom-export",
        titleKo: "4K/60fps 무빙툰 쇼츠·릴스 로컬 출고 (WebCodecs)",
        summaryKo:
          "WebCodecs 영상 인코딩의 실험 항목입니다. 4K/60fps는 설정 항목이며 지원 코덱·장치·실제 출력 성능은 별도 확인이 필요합니다.",
        route: "/tech",
        badgeKo: "4K 무빙툰",
        shortcuts: [],
        keywords: ["4K", "무빙툰", "WebCodecs", "릴스", "쇼츠", "영상 출고", "패럴랙스"],
      },
      {
        id: "feat-platform-smart-slice",
        scope: "screen-guide",
        axisId: "rights-bom-export",
        titleKo: "플랫폼 세로 규격 검증 · 자동 분할 출고",
        summaryKo:
          "세로 원고 분할·규격 점검 화면 안내입니다. 연재처의 현재 요구사항과 실제 산출물을 대조하세요.",
        route: "/studio/canvas",
        badgeKo: "연재 규격 분할",
        shortcuts: ["C"],
        keywords: ["출고", "자동 분할", "세로 원고", "플랫폼 규격", "Smart Slice"],
      },
      {
        id: "feat-timelapse-goods-readiness",
        scope: "screen-guide",
        axisId: "rights-bom-export",
        titleKo: "작업 타임랩스 · 굿즈/인쇄 재단선 점검",
        summaryKo:
          "타임랩스·인쇄·굿즈 관련 항목을 비교하는 안내입니다. 권리 점검 통과가 모든 2차 이용 허가를 뜻하지 않습니다.",
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
