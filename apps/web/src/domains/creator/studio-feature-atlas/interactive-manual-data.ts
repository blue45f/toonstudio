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
    goalKo: "설치나 복잡한 설정 없이 10분 안에 말풍선 달린 첫 4컷 세로 웹툰을 저장합니다.",
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
        actionGuideKo: "드로잉 캔버스로 들어가 펜(B)을 고른 뒤 손떨림 보정과 종이 마찰음을 편한 세기로 맞춥니다.",
        expectedResultKo: "선이 흔들리지 않고 켄트지 위 사각거리는 필압 감촉이 살아납니다.",
        durationMinutes: 2,
        shortcutHint: "B",
        axisId: "drawing-2d-foley",
        route: "/studio/canvas",
      },
      {
        id: "beg-2-pose-guide",
        order: 2,
        titleKo: "기본 데생 인형과 72포즈로 인물 구도 잡기",
        actionGuideKo: "캐릭터 패널에서 원하는 일상 포즈를 불러와 컷 안에 놓고, 그 위 레이어에 가볍게 선을 땁니다.",
        expectedResultKo: "인체 비율 고민 없이 1~4컷 인물의 눈높이와 크기가 고르게 잡힙니다.",
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
        expectedResultKo: "브라우저 OPFS에 안전하게 저장되고 바로 공유할 수 있는 4컷 이미지가 준비됩니다.",
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
    goalKo: "왼손 컨트롤러, 0원 선화 보정, 물감 혼색, 식자·댓글까지 마감 속도를 끌어올립니다.",
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
        actionGuideKo: "TourBox·ExpressKey·Quick Keys를 브라우저 WebHID로 연결하거나 자주 쓰는 단축키 세트를 불러옵니다.",
        expectedResultKo: "브러시 크기, 화면 회전(R), 확대(Z)를 마우스 이동 없이 왼손으로 바로 돌립니다.",
        durationMinutes: 2,
        shortcutHint: "R",
        axisId: "peripherals-multidevice",
        route: "/studio/canvas",
      },
      {
        id: "ast-2-webnn-lineart",
        order: 2,
        titleKo: "WebNN 내 기기 선화 보정으로 러프 정리",
        actionGuideKo: "러프 선 레이어에서 온디바이스 선화 보정을 실행해 끊긴 선과 지저분한 겹선을 깔끔하게 다듬습니다.",
        expectedResultKo: "외부 서버 전송이나 토큰 요금 없이 펜선 정리 시간이 눈에 띄게 줄어듭니다.",
        durationMinutes: 2,
        shortcutHint: "B",
        axisId: "ondevice-zero-cost",
        route: "/tech",
      },
      {
        id: "ast-3-km-pigment-fill",
        order: 3,
        titleKo: "올가미 채우기 & 물감 혼색(Kubelka-Munk) 채색",
        actionGuideKo: "올가미(L)와 색 채우기(G)로 밑색을 깔고, 물감처럼 섞어 칠하기(Shift+N)로 맑은 명암 경계를 만듭니다.",
        expectedResultKo: "채도가 죽는 회색 탁함 없이 투명 수채·셀 채색 톤이 균일하게 유지됩니다.",
        durationMinutes: 2,
        shortcutHint: "Shift+N",
        axisId: "ondevice-zero-cost",
        route: "/studio/canvas",
      },
      {
        id: "ast-4-voice-balloon-sfx",
        order: 4,
        titleKo: "대본·음성 기반 말풍선 및 효과음(SFX) 일괄 배치",
        actionGuideKo: "대본이나 음성 입력을 말풍선(T) 레이어로 넘기고, 컷 분위기에 맞는 효과음 글자를 올립니다.",
        expectedResultKo: "수작업 복사·붙여넣기 없이 컷별 대사 위치와 가독성이 한 번에 맞춰집니다.",
        durationMinutes: 2,
        shortcutHint: "T",
        axisId: "cut-layout-colorscript",
        route: "/studio/canvas",
      },
      {
        id: "ast-5-opfs-branch-pin",
        order: 5,
        titleKo: "OPFS 스냅샷 분기 저장 후 위치 댓글 남기기",
        actionGuideKo: "현재 작업본을 OPFS 브랜치로 저장하고, 확인이 필요한 컷 위에 위치 댓글(Alt+C)을 꽂아 공유합니다.",
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
    goalKo: "주연 VRM 헤어 이식, 72포즈·물리 충돌, 배경 광원 베이크와 2D 선화 투영까지 한 흐름으로 묶습니다.",
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
        actionGuideKo: "원본 VRM의 머리를 대상 캐릭터 두개골에 자동 정렬·이식하고, 만화풍 툰 셰이더 색감 상속을 적용합니다.",
        expectedResultKo: "머리가 두개골에 붕 뜨지 않고 얼굴 음영과 같은 톤으로 자연스럽게 붙습니다.",
        durationMinutes: 2,
        axisId: "character-3d-bg",
        route: "/studio/character",
      },
      {
        id: "dir-3-pose-xpbd",
        order: 3,
        titleKo: "72포즈 적용 후 WebGPU XPBD 헤어·의상 충돌 점검",
        actionGuideKo: "장면에 맞는 포즈를 고른 뒤 WebGPU XPBD 물리를 돌려 머리카락과 옷자락이 어깨를 뚫지 않는지 확인합니다.",
        expectedResultKo: "움직임이 큰 액션 컷에서도 머리카락과 망토가 자연스럽게 흐릅니다.",
        durationMinutes: 2,
        axisId: "ondevice-zero-cost",
        route: "/tech",
      },
      {
        id: "dir-4-bg3d-lighting",
        order: 4,
        titleKo: "3D 배경 무대 배치 & 2D/3D 광원 베이크",
        actionGuideKo: "배경 무대에 카메라 렌즈 화각을 맞추고 주광·림 라이트 각도를 돌려 툰 음영을 바로 구워 냅니다.",
        expectedResultKo: "인물과 배경의 그림자 방향이 일치해 합성 티가 나지 않습니다.",
        durationMinutes: 2,
        axisId: "character-3d-bg",
        route: "/studio/bg3d",
      },
      {
        id: "dir-5-gpen-projection",
        order: 5,
        titleKo: "3D 장면을 G펜 벡터 선화로 캔버스에 투영",
        actionGuideKo: "외곽선 강도와 강약을 맞춘 뒤 G펜 벡터 선화 투영으로 2D 드로잉 레이어에 넘깁니다.",
        expectedResultKo: "800% 확대해도 깨지지 않는 벡터 배경·인물 선화가 2D 캔버스에 바로 올라갑니다.",
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
    goalKo: "가상 스튜디오 팀 검수부터 컬러스크립트, 권리 감사 BOM, 4K 예고 무빙툰 출고까지 마감 사고를 막습니다.",
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
        actionGuideKo: "목재 아틀리에나 자료실 협업 방에 들어가 공중 라이트박스에 이번 화 컷을 한눈에 펼칩니다.",
        expectedResultKo: "팀원들과 3D 공간 음향으로 대화하며 전체 회차 흐름을 동시에 확인합니다.",
        durationMinutes: 2,
        axisId: "virtual-studio-spatial",
        route: "/studio/space",
      },
      {
        id: "pd-2-colorscript-darkmode",
        order: 2,
        titleKo: "에피소드 컬러스크립트 · 다크모드 시인성 확인",
        actionGuideKo: "컷별 색감 띠와 명암 대비를 살펴보고, 다크모드 화면에서 말풍선·효과음이 묻히지 않는지 봅니다.",
        expectedResultKo: "감정 전환이 뚜렷하고 밤에 보는 독자 화면에서도 글자가 선명하게 읽힙니다.",
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
        titleKo: "권리 감사 BOM 점검 · 상업 증명서 발급",
        actionGuideKo: "원고에 들어간 3D 소품·브러시·폰트 라이선스 감사를 돌려 rights-bom-receipt.json 영수증을 확인합니다.",
        expectedResultKo: "미확인 상업 라이선스 소재가 출고 전에 걸러져 저작권 사고를 미리 막습니다.",
        durationMinutes: 2,
        axisId: "rights-bom-export",
        route: "/studio/canvas",
      },
      {
        id: "pd-5-slice-movingtoon",
        order: 5,
        titleKo: "연재처 자동 분할 출고 · 4K 무빙툰 예고편 생성",
        actionGuideKo: "플랫폼 세로 규격 자동 분할로 최종 원고를 묶고, 하이라이트 3컷으로 4K/60fps 무빙툰 예고 릴스를 뽑습니다.",
        expectedResultKo: "연재 제출 패키지와 SNS 홍보용 4K 쇼츠가 별도 외주 없이 동시에 완성됩니다.",
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
      "캔버스 주변기기 설정에서 '펜 전용 그리기(팜 리젝션)'와 240Hz 입력 보간이 켜져 있는지 확인하세요.",
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
      "제조사 전용 백그라운드 프로그램이 HID 포트를 단독 점유하고 있다면 잠시 닫고 다시 연결하면 바로 잡힙니다.",
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
      "종이결 침전과 수채 글레이즈 두께를 조절하면 파랑+노랑이 실제 물감처럼 맑은 초록으로 섞입니다.",
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
      "크로스 VRM 헤어 이식 패널에서 '두개골 자동 정렬'과 대상 등신 프리셋을 다시 실행해 머리 위치를 밀착시키세요.",
      "'툰 셰이더 색감 DNA 자동 상속'을 켜면 얼굴 피부·그림자 톤에 맞춰 머리 음영이 자동으로 맞춰집니다.",
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
      "모든 항목이 통과되면 rights-bom-receipt.json 영수증이 자동 생성되고 바로 출고할 수 있습니다.",
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
      "공간 음향 스테이지에서 '정숙 자료실'이나 '방음 허들 부스' 구역으로 옮기면 벽체 차음이 자동 적용됩니다.",
      "동료 연필 ASMR 볼륨 슬라이더만 따로 낮추면 대사와 피드백 안내 소리는 또렷하게 유지됩니다.",
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
      "다시 캔버스를 열어 OPFS 스냅샷 기록에서 가장 최근 커밋이나 브랜치를 고르면 손실 없이 복원됩니다.",
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
      "WebCodecs 하드웨어 인코더가 내 기기 GPU에서 직접 인코딩하므로 서버 대기열과 추가 렌더링 요금이 0원입니다.",
      "브라우저가 WebCodecs를 지원하지 않는 구형 환경에서도 안전 폴백 프로파일로 컷 시퀀스를 내보낼 수 있습니다.",
    ],
    axisId: "rights-bom-export",
    roleIds: ["series-pd", "director-3d-character-bg"],
    actionRoute: "/tech",
    actionLabelKo: "4K 무빙툰 인코더 진단 보기",
    keywords: ["4K", "무빙툰", "WebCodecs", "비용", "0원", "릴스", "쇼츠", "인코딩"],
  },
];
