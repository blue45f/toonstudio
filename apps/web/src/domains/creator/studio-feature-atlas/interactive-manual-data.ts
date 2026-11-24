/**
 * 4대 창작자 역할별 10분 실습 매뉴얼 및 맥락별 빠른 문제 해결 FAQ 정본 데이터.
 */

import type { AtlasRoutePath, FeatureAxisId } from "./studio-feature-catalog";

export type CreatorRoleId =
  | "beginner-first-4cut"
  | "webtoon-assistant"
  | "director-3d-character-bg"
  | "series-pd";

export interface ManualPracticeStep {
  readonly id: string;
  readonly order: number;
  readonly titleKo: string;
  readonly actionGuideKo: string;
  readonly expectedResultKo: string;
  readonly durationMinutes: number;
  readonly shortcutHint?: string;
  readonly axisId: FeatureAxisId;
  readonly route: AtlasRoutePath;
}

export interface CreatorRoleManual {
  readonly roleId: CreatorRoleId;
  readonly roleLabelKo: string;
  readonly shortLabelKo: string;
  readonly goalKo: string;
  readonly audienceKo: string;
  readonly totalMinutes: number;
  readonly targetRoute: AtlasRoutePath;
  readonly previewImageSrc: string;
  readonly previewImageAltKo: string;
  readonly steps: readonly ManualPracticeStep[];
}

export interface ContextualTroubleshootingFaq {
  readonly id: string;
  readonly questionKo: string;
  readonly symptomTagKo: string;
  readonly quickFixStepsKo: readonly [string, string];
  readonly axisId: FeatureAxisId;
  readonly roleIds: readonly CreatorRoleId[];
  readonly actionRoute: AtlasRoutePath;
  readonly actionLabelKo: string;
  readonly keywords: readonly string[];
}

/** 4대 창작자 역할별 10분 실습 매뉴얼. */
export const CREATOR_ROLE_MANUALS: readonly CreatorRoleManual[] = [
  {
    roleId: "beginner-first-4cut",
    roleLabelKo: "초보 작가 · 첫 4컷 완성",
    shortLabelKo: "초보 작가 첫 4컷",
    goalKo: "첫 4컷의 도구·말풍선·저장 확인 순서를 살펴봅니다. 총 10분은 안내용 예상치이며 완성 시간을 측정한 값이 아닙니다.",
    audienceKo: "웹툰을 처음 그리거나 브라우저 스튜디오에 처음 들어온 작가",
    totalMinutes: 10,
    targetRoute: "/studio/canvas",
    previewImageSrc: "/assets/atelier/onboarding/first-cut-desk.webp",
    previewImageAltKo: "초보 작가를 위한 첫 4컷 작업 책상 안내 이미지",
    steps: [
      {
        id: "beg-1-canvas-gpen",
        order: 1,
        titleKo: "4컷 세로 캔버스 열고 G펜 손떨림 맞추기",
        actionGuideKo: "캔버스에서 펜(B) 옵션을 살펴봅니다. 손떨림·마찰음 독립 예제는 실제 펜 연결 여부를 따로 확인합니다.",
        expectedResultKo: "현재 도구 옵션과 독립 소리·좌표 예제의 차이를 확인합니다.",
        durationMinutes: 2,
        shortcutHint: "B",
        axisId: "drawing-2d-foley",
        route: "/studio/canvas",
      },
      {
        id: "beg-2-pose-guide",
        order: 2,
        titleKo: "기본 데생 인형과 72포즈로 인물 구도 잡기",
        actionGuideKo: "캐릭터 화면과 포즈 예제를 살펴보고 실제 장면에 반영되는지 확인합니다. 예제 선택만으로 컷에 삽입되지는 않습니다.",
        expectedResultKo: "포즈 선택과 실제 장면·원고 반영을 구분합니다.",
        durationMinutes: 2,
        axisId: "character-3d-bg",
        route: "/studio/character",
      },
      {
        id: "beg-3-close-gap-fill",
        order: 3,
        titleKo: "틈 닫기 색 채우기로 밑색 한 번에 넣기",
        actionGuideKo: "색 채우기(G)에서 틈 닫기를 켜고 인물 피부·머리·옷 영역을 한 번씩 눌러 밑색을 채웁니다.",
        expectedResultKo: "선이 살짝 열려 있어도 색이 밖으로 새지 않고 깔끔하게 채워집니다.",
        durationMinutes: 2,
        shortcutHint: "G",
        axisId: "drawing-2d-foley",
        route: "/studio/canvas",
      },
      {
        id: "beg-4-balloon-dialogue",
        order: 4,
        titleKo: "말풍선 놓고 대사 줄바꿈 점검하기",
        actionGuideKo: "말풍선 도구(T)로 대사를 입력한 뒤 자동 줄바꿈 안내를 보며 컷 시선 흐름에 맞게 배치합니다.",
        expectedResultKo: "모바일 세로 화면에서도 글자가 작거나 잘리지 않는 말풍선이 완성됩니다.",
        durationMinutes: 2,
        shortcutHint: "T",
        axisId: "cut-layout-colorscript",
        route: "/studio/canvas",
      },
      {
        id: "beg-5-local-save-export",
        order: 5,
        titleKo: "세로 미리보기 확인 후 내 기기 안전 저장",
        actionGuideKo: "화면 맞춤(Home)으로 4컷 호흡을 훑어본 뒤 로컬 스냅샷 저장과 이미지 내보내기를 누릅니다.",
        expectedResultKo: "저장 완료 표시와 재열기 결과, 내보낸 이미지의 실제 내용을 확인합니다.",
        durationMinutes: 2,
        shortcutHint: "Home",
        axisId: "rights-bom-export",
        route: "/studio/canvas",
      },
    ],
  },
  {
    roleId: "webtoon-assistant",
    roleLabelKo: "웹툰 어시스턴트 · 선화·채색·식자 고속 루틴",
    shortLabelKo: "웹툰 어시스턴트",
    goalKo: "주변기기·선화·혼색·대사 실험과 기존 편집 화면의 연결 여부를 구분해 살펴봅니다.",
    audienceKo: "선화·밑색·명암·식자 분업을 빠르게 처리하는 어시스턴트 작가",
    totalMinutes: 10,
    targetRoute: "/studio/canvas",
    previewImageSrc: "/assets/atelier/media/alcohol-marker.webp",
    previewImageAltKo: "웹툰 어시스턴트 채색 작업용 알코올 마커 매체 썸네일",
    steps: [
      {
        id: "ast-1-webhid-profile",
        order: 1,
        titleKo: "왼손 컨트롤러(WebHID) 또는 단축키 프로필 연결",
        actionGuideKo: "주변기기 매핑 예제와 브라우저 권한·실기기 지원 여부를 살펴봅니다. 예제 설정만으로 편집기에 연결되지는 않습니다.",
        expectedResultKo: "기기 연결 여부와 편집기 명령 반영 여부를 각각 확인합니다.",
        durationMinutes: 2,
        shortcutHint: "R",
        axisId: "peripherals-multidevice",
        route: "/studio/canvas",
      },
      {
        id: "ast-2-webnn-lineart",
        order: 2,
        titleKo: "WebNN 내 기기 선화 보정으로 러프 정리",
        actionGuideKo: "선화 분석 실험의 샘플 입력과 실제 모델 추론 상태를 확인합니다. 현재 러프 레이어에 적용됐다고 단정하지 않습니다.",
        expectedResultKo: "샘플 분석·모델 추론·실제 레이어 적용의 범위를 구분합니다.",
        durationMinutes: 2,
        shortcutHint: "B",
        axisId: "ondevice-zero-cost",
        route: "/tech",
      },
      {
        id: "ast-3-km-pigment-fill",
        order: 3,
        titleKo: "올가미 채우기 & 물감 혼색(Kubelka-Munk) 채색",
        actionGuideKo: "올가미(L)·색 채우기(G)와 혼색(Shift+N) 도구를 살펴보고, 독립 안료 혼색 예제와 실제 브러시 결과를 구분합니다.",
        expectedResultKo: "샘플 혼색 결과와 실제 채색 결과를 각각 확인합니다.",
        durationMinutes: 2,
        shortcutHint: "Shift+N",
        axisId: "ondevice-zero-cost",
        route: "/studio/canvas",
      },
      {
        id: "ast-4-voice-balloon-sfx",
        order: 4,
        titleKo: "대본·음성 기반 말풍선 및 효과음(SFX) 일괄 배치",
        actionGuideKo: "대사 분석·배치 계획 예제와 말풍선(T) 도구를 살펴봅니다. 음성 인식이나 현재 원고에 일괄 삽입이 완료된 것은 아닙니다.",
        expectedResultKo: "배치 계획과 실제 원고의 텍스트·위치·가독성을 나눠 확인합니다.",
        durationMinutes: 2,
        shortcutHint: "T",
        axisId: "cut-layout-colorscript",
        route: "/studio/canvas",
      },
      {
        id: "ast-5-opfs-branch-pin",
        order: 5,
        titleKo: "OPFS 스냅샷 분기 저장 후 위치 댓글 남기기",
        actionGuideKo: "스냅샷 브랜치 예제와 실제 저장 기능을 구분하고 위치 댓글(Alt+C)의 작성·공유 결과를 별도로 확인합니다.",
        expectedResultKo: "메인 작가가 이전 시안과 바로 비교하고 수정 지점만 정확히 확인합니다.",
        durationMinutes: 2,
        shortcutHint: "Alt+C",
        axisId: "virtual-studio-spatial",
        route: "/studio/canvas",
      },
    ],
  },
  {
    roleId: "director-3d-character-bg",
    roleLabelKo: "3D 캐릭터·배경 디렉터 · 인물·무대 세팅",
    shortLabelKo: "3D 캐릭터·배경 디렉터",
    goalKo: "헤어·포즈·충돌 독립 예제와 캐릭터·배경 편집 화면의 적용 범위를 나눠 확인합니다.",
    audienceKo: "작품 주연 3D 모델·헤어·배경 무대와 카메라 구도를 총괄하는 디렉터",
    totalMinutes: 10,
    targetRoute: "/studio/character",
    previewImageSrc: "/assets/atelier/onboarding/character-sculpt.webp",
    previewImageAltKo: "3D 캐릭터 셰이퍼와 포즈·조명 세팅 안내 이미지",
    steps: [
      {
        id: "dir-1-shaper-3view",
        order: 1,
        titleKo: "캐릭터 셰이퍼 비율 조정 및 3면 설정집 뽑기",
        actionGuideKo: "캐릭터 셰이퍼에서 등신·얼굴 윤곽·체형을 맞추고 정면·측면·후면 3면 설정집을 생성합니다.",
        expectedResultKo: "팀 전체가 같은 비율 기준으로 작화를 맞출 수 있는 기준 시트가 완성됩니다.",
        durationMinutes: 2,
        axisId: "character-3d-bg",
        route: "/studio/character",
      },
      {
        id: "dir-2-hair-transplant",
        order: 2,
        titleKo: "크로스 VRM 실물 헤어 이식 · 툰 재질 상속",
        actionGuideKo: "기본 패널의 정렬 계획을 살펴봅니다. 실제 VRM이 전달된 경우에만 장면 이식이 가능하며 SpringBone은 체인 구성까지만 다룹니다.",
        expectedResultKo: "계획 계산·장면 이식·물리 업데이트 연결의 차이를 확인합니다.",
        durationMinutes: 2,
        axisId: "character-3d-bg",
        route: "/studio/character",
      },
      {
        id: "dir-3-pose-xpbd",
        order: 3,
        titleKo: "포즈·XPBD 충돌 독립 예제 범위 확인",
        actionGuideKo: "포즈와 샘플 충돌 계산 예제를 살펴봅니다. 실제 GPU 실행 여부와 현재 장면의 물리 업데이트 연결은 별도 확인합니다.",
        expectedResultKo: "샘플 충돌 판정과 실제 장면의 움직임을 구분합니다.",
        durationMinutes: 2,
        axisId: "ondevice-zero-cost",
        route: "/tech",
      },
      {
        id: "dir-4-bg3d-lighting",
        order: 4,
        titleKo: "3D 배경 무대 배치 & 2D/3D 광원 베이크",
        actionGuideKo: "배경 화면의 카메라·조명을 확인합니다. 독립 광원 계산 예제가 실제 장면을 바꾸는지는 별도로 확인합니다.",
        expectedResultKo: "장면의 실제 렌더링 결과에서 인물·배경 그림자 방향을 확인합니다.",
        durationMinutes: 2,
        axisId: "character-3d-bg",
        route: "/studio/bg3d",
      },
      {
        id: "dir-5-gpen-projection",
        order: 5,
        titleKo: "3D 장면을 G펜 벡터 선화로 캔버스에 투영",
        actionGuideKo: "외곽선 강도와 강약을 맞춘 뒤 G펜 벡터 선화 투영으로 2D 드로잉 레이어에 넘깁니다.",
        expectedResultKo: "실제 선화 산출물의 형식·확대 품질·캔버스 삽입 결과를 확인합니다.",
        durationMinutes: 2,
        shortcutHint: "Z",
        axisId: "character-3d-bg",
        route: "/studio/canvas",
      },
    ],
  },
  {
    roleId: "series-pd",
    roleLabelKo: "연재 PD · 협업 검수·권리 감사·출고",
    shortLabelKo: "연재 PD",
    goalKo: "공간·색감·영상 실험과 실제 댓글·권리 점검·출고 화면을 구분해 확인합니다.",
    audienceKo: "연재 회차 검수, 라이선스 점검, 플랫폼 출고와 홍보 릴스를 챙기는 PD·편집자",
    totalMinutes: 10,
    targetRoute: "/studio/space",
    previewImageSrc: "/assets/atelier/onboarding/virtual-collab.webp",
    previewImageAltKo: "가상 스튜디오 실시간 협업과 원고 검수 안내 이미지",
    steps: [
      {
        id: "pd-1-virtual-lightbox",
        order: 1,
        titleKo: "가상 스튜디오 입장 · 공중 라이트박스 회차 펼치기",
        actionGuideKo: "가상 공간 화면과 라이트박스 구성 예제를 살펴보고 실제 팀 세션·원고 연결 여부를 확인합니다.",
        expectedResultKo: "공간·음향 예제와 실제 다중 사용자 세션의 차이를 확인합니다.",
        durationMinutes: 2,
        axisId: "virtual-studio-spatial",
        route: "/studio/space",
      },
      {
        id: "pd-2-colorscript-darkmode",
        order: 2,
        titleKo: "에피소드 컬러스크립트 · 다크모드 시인성 확인",
        actionGuideKo: "컬러스크립트 샘플의 명도·색온도 계산을 살펴봅니다. 실제 원고 검수는 원고 데이터를 연결한 화면에서 확인합니다.",
        expectedResultKo: "샘플 점수와 실제 원고의 가독성 검수를 구분합니다.",
        durationMinutes: 2,
        axisId: "cut-layout-colorscript",
        route: "/studio/canvas",
      },
      {
        id: "pd-3-redline-pin",
        order: 3,
        titleKo: "위치 댓글과 비인쇄 빨간펜으로 수정 요청 고정",
        actionGuideKo: "수정이 필요한 컷 위에 위치 댓글(Alt+C)과 빨간펜 메모를 남기고, 출고본에서는 비인쇄로 자동 제외되게 둡니다.",
        expectedResultKo: "메신저 캡처 없이 정확한 컷 좌표에서 수정 완료 여부를 추적합니다.",
        durationMinutes: 2,
        shortcutHint: "Alt+C",
        axisId: "cut-layout-colorscript",
        route: "/studio/canvas",
      },
      {
        id: "pd-4-rights-bom-audit",
        order: 4,
        titleKo: "권리 감사 BOM 근거 · 점검 영수증 확인",
        actionGuideKo: "원고에 들어간 3D 소품·브러시·폰트 라이선스 감사를 돌려 rights-bom-receipt.json 영수증을 확인합니다.",
        expectedResultKo: "누락된 권리 근거를 확인합니다. 점검 기록은 법적 이용 허가나 분쟁 예방 보증이 아닙니다.",
        durationMinutes: 2,
        axisId: "rights-bom-export",
        route: "/studio/canvas",
      },
      {
        id: "pd-5-slice-movingtoon",
        order: 5,
        titleKo: "연재처 자동 분할 출고 · 4K 무빙툰 예고편 생성",
        actionGuideKo: "실제 원고 분할 결과와 영상 출력 실험을 나눠 확인합니다. 4K/60fps 설정의 코덱·장치 지원과 산출물은 별도 확인합니다.",
        expectedResultKo: "제출용 파일과 영상 산출물을 실제로 열어 규격·내용을 확인합니다.",
        durationMinutes: 2,
        axisId: "rights-bom-export",
        route: "/tech",
      },
    ],
  },
];

/** 맥락별 빠른 문제 해결 FAQ. */
export const CONTEXTUAL_TROUBLESHOOTING_FAQS: readonly ContextualTroubleshootingFaq[] = [
  {
    id: "faq-stylus-pressure",
    questionKo: "스타일러스 필압이나 기울기가 예상보다 둔하게 반응해요",
    symptomTagKo: "펜 필압 · 팜 리젝션",
    quickFixStepsKo: [
      "펜 입력 예제와 실제 도구 설정을 구분하고 기기·브라우저가 제공하는 필압·기울기 입력값을 확인하세요. 입력 빈도는 실기기 측정이 필요합니다.",
      "브러시별 독립 필압 커브에서 자주 쓰는 G펜·연필의 시작 압력을 한 단계 부드럽게 낮춰 보세요.",
    ],
    axisId: "peripherals-multidevice",
    roleIds: ["beginner-first-4cut", "webtoon-assistant"],
    actionRoute: "/studio/canvas",
    actionLabelKo: "캔버스 스타일러스 설정 확인",
    keywords: ["필압", "기울기", "스타일러스", "펜", "팜 리젝션", "타블렛", "둔함"],
  },
  {
    id: "faq-webhid-lefthand",
    questionKo: "TourBox나 ExpressKey 왼손 컨트롤러가 브라우저에서 안 잡혀요",
    symptomTagKo: "WebHID 왼손 패드",
    quickFixStepsKo: [
      "Chrome·Edge 등 WebHID 지원 브라우저에서 장치를 연결한 뒤 '왼손 컨트롤러 연결' 버튼을 눌러 권한 창에서 기기를 선택하세요.",
      "권한이나 장치 점유 문제가 있는지 확인하세요. 매핑 예제를 선택한 것만으로 실제 기기가 연결되지는 않습니다.",
    ],
    axisId: "peripherals-multidevice",
    roleIds: ["webtoon-assistant", "director-3d-character-bg"],
    actionRoute: "/studio/canvas",
    actionLabelKo: "WebHID 연결 설정으로 이동",
    keywords: ["WebHID", "왼손 컨트롤러", "TourBox", "ExpressKey", "Quick Keys", "연결", "인식"],
  },
  {
    id: "faq-muddy-color-mix",
    questionKo: "파란색과 노란색을 섞었는데 탁한 회색처럼 나와요",
    symptomTagKo: "물감 물리 혼색",
    quickFixStepsKo: [
      "일반 디지털 브러시 대신 '물감처럼 섞어 칠하기(Shift+N)'와 Kubelka-Munk 물리 안료 혼색 모드를 켜세요.",
      "혼색 예제의 샘플 계산과 실제 브러시 스트로크 결과를 비교하세요. 예제 값만으로 현재 원고의 색이 바뀌지는 않습니다.",
    ],
    axisId: "ondevice-zero-cost",
    roleIds: ["beginner-first-4cut", "webtoon-assistant"],
    actionRoute: "/tech",
    actionLabelKo: "Kubelka-Munk 혼색 체험 보기",
    keywords: ["혼색", "탁한 색", "회색", "초록", "Kubelka-Munk", "물감", "Shift+N"],
  },
  {
    id: "faq-vrm-hair-mismatch",
    questionKo: "다른 VRM 캐릭터 머리를 이식했는데 크기가 떠 있거나 색감이 달라요",
    symptomTagKo: "헤어 이식 · 색감 상속",
    quickFixStepsKo: [
      "기본 패널이 계획 예제인지 실제 VRM이 연결된 상태인지 먼저 확인하고 정렬 계획의 대상 크기를 비교하세요.",
      "실제 VRM이 전달된 경우에만 장면 이식 결과를 확인하세요. 계획 완료와 물리 업데이트 연결은 별개입니다.",
    ],
    axisId: "character-3d-bg",
    roleIds: ["director-3d-character-bg"],
    actionRoute: "/studio/character",
    actionLabelKo: "캐릭터 헤어 이식 패널 열기",
    keywords: ["헤어 이식", "VRM", "두개골", "색감", "툰 셰이더", "머리"],
  },
  {
    id: "faq-rights-bom-blocked",
    questionKo: "마감 출고 버튼을 눌렀는데 권리 감사 BOM 경고가 뜨며 막혔어요",
    symptomTagKo: "권리 감사 BOM",
    quickFixStepsKo: [
      "권리 감사 BOM 목록에서 상업 이용 미확인이나 출처 누락으로 표시된 폰트·3D 소품·브러시를 클릭해 교체하세요.",
      "점검 기록과 실제 출고 결과를 확인하세요. 모든 항목의 통과가 법적 이용 허가나 분쟁 예방을 보증하지 않습니다.",
    ],
    axisId: "rights-bom-export",
    roleIds: ["series-pd", "webtoon-assistant"],
    actionRoute: "/studio/canvas",
    actionLabelKo: "권리 감사 BOM 점검 열기",
    keywords: ["권리 BOM", "출고 차단", "저작권", "폰트", "라이선스", "rights-bom-receipt"],
  },
  {
    id: "faq-spatial-audio-balance",
    questionKo: "가상 스튜디오에서 옆자리 동료 작업 소리나 음성이 너무 커요",
    symptomTagKo: "3D HRTF 공간 음향",
    quickFixStepsKo: [
      "공간 음향 실험의 샘플 위치·벽체 계산과 실제 동료 음성 연결 여부를 먼저 구분하세요.",
      "실제 음향이 연결된 화면에서 제공하는 볼륨·음소거 설정을 확인하세요. 공간 예제 선택만으로 동료 음성이 바뀌지는 않습니다.",
    ],
    axisId: "virtual-studio-spatial",
    roleIds: ["series-pd", "beginner-first-4cut"],
    actionRoute: "/studio/space",
    actionLabelKo: "가상 스튜디오 음향 조절",
    keywords: ["가상 스튜디오", "소리", "HRTF", "ASMR", "차음", "공간 음향", "시끄러움"],
  },
  {
    id: "faq-browser-crash-recovery",
    questionKo: "브라우저 탭을 실수로 닫았는데 그리던 원고가 날아갈까 걱정돼요",
    symptomTagKo: "OPFS 자동 복구",
    quickFixStepsKo: [
      "툰스튜디오는 서버 저장 전에도 내 기기 브라우저 OPFS와 SQLite WASM에 작업 상태를 우선 기록합니다.",
      "캔버스를 다시 열어 실제 복구 안내와 저장된 원고 내용을 확인하세요. 브랜치 예제의 선택은 실제 문서 복구가 아닙니다.",
    ],
    axisId: "virtual-studio-spatial",
    roleIds: ["beginner-first-4cut", "webtoon-assistant", "series-pd"],
    actionRoute: "/studio/canvas",
    actionLabelKo: "로컬 스냅샷 복구 확인",
    keywords: ["복구", "저장", "OPFS", "브라우저 닫힘", "스냅샷", "날아감"],
  },
  {
    id: "faq-4k-movingtoon-cost",
    questionKo: "4K 무빙툰 예고 영상을 뽑으면 렌더링 대기열이나 별도 요금이 드나요?",
    symptomTagKo: "WebCodecs 4K 로컬 출고",
    quickFixStepsKo: [
      "영상 실험 화면에서 실제 코덱·하드웨어 지원과 실행 상태를 확인하세요. 설정 예제는 실제 인코딩 성능·비용 측정 결과가 아닙니다.",
      "지원하지 않는 환경에서는 현재 화면의 오류·대체 출력 안내를 확인하고 실제 산출물을 열어 보세요.",
    ],
    axisId: "rights-bom-export",
    roleIds: ["series-pd", "director-3d-character-bg"],
    actionRoute: "/tech",
    actionLabelKo: "4K 무빙툰 인코더 진단 보기",
    keywords: ["4K", "무빙툰", "WebCodecs", "비용", "0원", "릴스", "쇼츠", "인코딩"],
  },
];
