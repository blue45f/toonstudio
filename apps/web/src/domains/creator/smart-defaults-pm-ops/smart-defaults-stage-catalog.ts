/**
 * 빈칸 0% 스마트 기본값 · 5대 창작 단계 정본 카탈로그.
 *
 * 전 5단계(새 작품 기획 · 콘티/컷 분할 · 3D 배경/조명 · 채색/후보정 · 출고/플랫폼)의
 * 20개 입력 항목에 1줄 의도 설명(`intentHint`), 추천 근거(`recommendedWhy`), 3종 대안 프리셋,
 * 단계별 3종 프리셋을 정의한다.
 */

export const SMART_DEFAULT_SPRITE_PATHS = {
  production: "/assets/studio/vibrant-sprites/emblem-production.webp",
  aiCompass: "/assets/studio/vibrant-sprites/tool-ai-compass.webp",
  layers: "/assets/studio/vibrant-sprites/tool-layers.webp",
} as const;

export const SMART_STAGE_ORDER = [
  "planning",
  "storyboard",
  "stage3d",
  "coloring",
  "delivery",
] as const;

export type SmartStageId = (typeof SMART_STAGE_ORDER)[number];
export type SmartFieldControlType = "select" | "text" | "textarea" | "number";

export interface SmartFieldAlternative {
  readonly id: string;
  readonly labelKo: string;
  readonly value: string;
  readonly whyKo: string;
}

export interface SmartFieldDefaultSpec {
  readonly fieldId: string;
  readonly labelKo: string;
  readonly controlType: SmartFieldControlType;
  readonly value: string;
  readonly recommendedValue: string;
  readonly unitKo?: string;
  /** 왜 이 항목을 선택해야 하는지 알려주는 1줄 한글 의도 설명. */
  readonly intentHint: string;
  /** 현재 기본값을 추천한 구체적 근거. */
  readonly recommendedWhy: string;
  /** 입력칸 상단에 표시할 AI/스마트 제안 배지. */
  readonly aiSuggestionBadgeKo: string;
  /** 즉시 눌러 바꿀 수 있는 3종 대안 프리셋. */
  readonly alternatives: readonly [
    SmartFieldAlternative,
    SmartFieldAlternative,
    SmartFieldAlternative,
  ];
}

export interface SmartStagePreset {
  readonly presetId: string;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly overrides: Readonly<Record<string, string>>;
}

export interface SmartStageDefaultsBundle {
  readonly stageId: SmartStageId;
  readonly stageLabelKo: string;
  readonly stageGoalKo: string;
  readonly spritePath: string;
  readonly fields: readonly SmartFieldDefaultSpec[];
  readonly stagePresets: readonly [SmartStagePreset, SmartStagePreset, SmartStagePreset];
  readonly blankFieldCount: number;
  readonly completionRatePercent: number;
}

export interface SmartStageTemplate {
  readonly stageId: SmartStageId;
  readonly stageLabelKo: string;
  readonly stageGoalKo: string;
  readonly spritePath: string;
  readonly fields: readonly SmartFieldDefaultSpec[];
  readonly stagePresets: readonly [SmartStagePreset, SmartStagePreset, SmartStagePreset];
}

type AltTuple = readonly [id: string, labelKo: string, value: string, whyKo: string];

function alt(tuple: AltTuple): SmartFieldAlternative {
  return { id: tuple[0], labelKo: tuple[1], value: tuple[2], whyKo: tuple[3] };
}

function makeField(spec: {
  readonly fieldId: string;
  readonly labelKo: string;
  readonly controlType: SmartFieldControlType;
  readonly value: string;
  readonly unitKo?: string;
  readonly intentHint: string;
  readonly recommendedWhy: string;
  readonly aiSuggestionBadgeKo: string;
  readonly alternatives: readonly [AltTuple, AltTuple, AltTuple];
}): SmartFieldDefaultSpec {
  const alts: readonly [SmartFieldAlternative, SmartFieldAlternative, SmartFieldAlternative] = [
    alt(spec.alternatives[0]),
    alt(spec.alternatives[1]),
    alt(spec.alternatives[2]),
  ];
  const safeValue = spec.value.trim() || alts[0].value;
  return {
    fieldId: spec.fieldId,
    labelKo: spec.labelKo,
    controlType: spec.controlType,
    value: safeValue,
    recommendedValue: safeValue,
    ...(spec.unitKo ? { unitKo: spec.unitKo } : {}),
    intentHint: spec.intentHint,
    recommendedWhy: spec.recommendedWhy,
    aiSuggestionBadgeKo: spec.aiSuggestionBadgeKo,
    alternatives: alts,
  };
}

export const SMART_STAGE_TEMPLATES: Readonly<Record<SmartStageId, SmartStageTemplate>> = {
  planning: {
    stageId: "planning",
    stageLabelKo: "새 작품 기획",
    stageGoalKo: "장르·타깃·시놉시스·화풍을 첫 화면부터 채워 백지 막힘 없이 1화 콘티로 넘어갑니다.",
    spritePath: SMART_DEFAULT_SPRITE_PATHS.aiCompass,
    fields: [
      makeField({
        fieldId: "genre",
        labelKo: "핵심 장르",
        controlType: "select",
        value: "현대 판타지 · 헌터 액션",
        intentHint: "장르에 따라 권장 회당 컷 수·카메라 구도·기본 효과음 세트가 함께 맞춰집니다.",
        recommendedWhy: "초반 1~3화 유입과 모바일 스크롤 속도감이 가장 안정적인 주류 연재 포맷입니다.",
        aiSuggestionBadgeKo: "AI 추천 · 연재 주류 장르",
        alternatives: [
          ["alt-rofan", "로맨스 판타지 · 회귀", "로맨스 판타지 · 회귀 궁정", "인물 클로즈업과 의상·보석 광택 팔레트를 우선 구성합니다."],
          ["alt-thriller", "미스터리 · 심리 스릴러", "미스터리 · 도시 스릴러", "여백 서스펜스와 저채도 그림자 대비를 중심으로 세팅합니다."],
          ["alt-daily", "일상 · 힐링 코미디", "일상 · 오피스 힐링 코미디", "45~55컷 경쾌한 호흡과 밝은 파스텔 톤으로 작업 부담을 줄입니다."],
        ],
      }),
      makeField({
        fieldId: "targetAudience",
        labelKo: "핵심 타깃 독자",
        controlType: "select",
        value: "2030 모바일 출퇴근 독자 (전연령~15세)",
        intentHint: "타깃 연령대와 읽기 환경이 대사 분량·말풍선 최소 폰트 크기·심의 기준을 결정합니다.",
        recommendedWhy: "모바일 세로 스크롤 완독률과 유료 미리보기 전환이 가장 높은 핵심 독자층입니다.",
        aiSuggestionBadgeKo: "스마트 기본값 · 모바일 최적화",
        alternatives: [
          ["alt-1020-action", "1020 빠른 전개 선호층", "1020 남성 중심 (빠른 템포·액션)", "대사 줄 수를 2줄 이내로 줄이고 컷 전환 속도를 높입니다."],
          ["alt-2030-romance", "2030 감정선 몰입층", "2030 여성 중심 (감정선·작화 밀도)", "표정 클로즈업 비중과 의상·배경 분위기 보정을 강화합니다."],
          ["alt-global-all", "글로벌 영어권 올에이지", "글로벌 영미·동남아 독자 (12세 이용가)", "말풍선 여백을 20% 넓혀 영문 번역 식자 넘침을 미리 방지합니다."],
        ],
      }),
      makeField({
        fieldId: "synopsis",
        labelKo: "한 줄 시놉시스",
        controlType: "textarea",
        value: "마감 전날 붕괴된 탑의 마지막 설계자가 3년 전으로 돌아와 숨겨진 길드 비밀을 파헤치며 도시를 구한다.",
        intentHint: "1~3화 엔딩 훅과 캐릭터 바이블 요약의 기준 문장이 되어 작화·각색 팀의 방향을 고정합니다.",
        recommendedWhy: "주인공의 결핍·반전 설정·1화 목표를 한 문장에 담아 콘티 전환이 즉시 가능합니다.",
        aiSuggestionBadgeKo: "AI 초안 자동 채움 · 바로 수정 가능",
        alternatives: [
          ["alt-syn-rofan", "회귀 영애 계약결혼 훅", "파혼 직전 전생의 기억을 되찾은 공작가 막내가 북부 대공에게 1년짜리 계약 동맹을 제안한다.", "관계성 갈등과 첫 화 대면 장면을 바로 콘티로 뽑기 좋습니다."],
          ["alt-syn-thriller", "폐쇄 공간 미스터리 훅", "자정마다 존재하지 않는 13층에 멈추는 신축 오피스텔에서 관리소장만 보는 입주민 명단이 발견된다.", "단일 3D 배경 세트를 재활용하면서도 긴장감을 극대화할 수 있습니다."],
          ["alt-syn-daily", "반려동물·일상 공감 훅", "야근에 지친 신입 디자이너가 옥탑방 길고양이와 동거하며 동네 단골들과 소소한 위로를 나눈다.", "복잡한 배경 부담 없이 매화 1에피소드 완결형 연재에 알맞습니다."],
        ],
      }),
      makeField({
        fieldId: "artStyle",
        labelKo: "대표 화풍 · 선화 톤",
        controlType: "select",
        value: "선명한 G펜 선화 + 2단 셀 명암 + 3D 배경 혼합",
        intentHint: "선화 굵기와 명암 단계를 미리 고정해야 3D 배경 라인 추출과 채색 어시 톤이 어긋나지 않습니다.",
        recommendedWhy: "주간 마감 70컷 분량을 3D 배경과 자연스럽게 섞어 소화하기 가장 효율적인 표준 화풍입니다.",
        aiSuggestionBadgeKo: "실무 표준 · 주간 마감 균형",
        alternatives: [
          ["alt-style-painted", "반실사 회화 · 소프트 글로우", "얇은 색선 + 부드러운 그라데이션 채색", "로맨스·판타지 표지와 클로즈업 컷의 화사함을 살립니다."],
          ["alt-style-noir", "고대비 먹선 · 누아르 음영", "강약 큰 브러시 먹선 + 딥 블랙 톤", "스릴러·액션 장면에서 타격감과 공포 대비를 강하게 줍니다."],
          ["alt-style-clean", "캐주얼 둥근펜 · 파스텔 플랫", "일정 굵기 둥근펜 + 1단 심플 음영", "1인 작가도 빠르게 채색을 끝낼 수 있는 초경량 화풍입니다."],
        ],
      }),
    ],
    stagePresets: [
      { presetId: "plan-action-hit", labelKo: "주간 액션 흥행 표준", summaryKo: "헌터 액션 · 1020 빠른 전개 · 선명한 G펜", overrides: { genre: "현대 판타지 · 헌터 액션", targetAudience: "1020 남성 중심 (빠른 템포·액션)", artStyle: "선명한 G펜 선화 + 2단 셀 명암 + 3D 배경 혼합" } },
      { presetId: "plan-rofan-premium", labelKo: "로판 프리미엄 작화", summaryKo: "회귀 궁정 · 2030 감정선 · 반실사 글로우", overrides: { genre: "로맨스 판타지 · 회귀 궁정", targetAudience: "2030 여성 중심 (감정선·작화 밀도)", synopsis: "파혼 직전 전생의 기억을 되찾은 공작가 막내가 북부 대공에게 1년짜리 계약 동맹을 제안한다.", artStyle: "얇은 색선 + 부드러운 그라데이션 채색" } },
      { presetId: "plan-solo-fast", labelKo: "1인 작가 초고속 연재", summaryKo: "일상 코미디 · 전연령 · 1단 심플 채색", overrides: { genre: "일상 · 오피스 힐링 코미디", targetAudience: "2030 모바일 출퇴근 독자 (전연령~15세)", synopsis: "야근에 지친 신입 디자이너가 옥탑방 길고양이와 동거하며 동네 단골들과 소소한 위로를 나눈다.", artStyle: "일정 굵기 둥근펜 + 1단 심플 음영" } },
    ],
  },
  storyboard: {
    stageId: "storyboard",
    stageLabelKo: "콘티 / 컷 분할",
    stageGoalKo: "회당 컷 수·세로 여백·호흡 템포를 플랫폼 스크롤 리듬에 맞춰 즉시 배치합니다.",
    spritePath: SMART_DEFAULT_SPRITE_PATHS.layers,
    fields: [
      makeField({
        fieldId: "cutCount",
        labelKo: "회당 목표 컷 수",
        controlType: "number",
        value: "65",
        unitKo: "컷",
        intentHint: "컷 수는 주간 원고 마감 시간과 외주 정산 단가 산정의 직접 기준이 됩니다.",
        recommendedWhy: "국내 정식연재 평균 60~70컷 구간으로 서사 밀도와 주간 마감 안정성의 균형점입니다.",
        aiSuggestionBadgeKo: "스마트 기본값 · 정식연재 평균",
        alternatives: [
          ["alt-cut-48", "48컷 (1인·일상 경량)", "48", "도전만화·1인 주간 연재의 체력 소모를 줄입니다."],
          ["alt-cut-75", "75컷 (액션·대형 CP)", "75", "전투·역동적 카메라 전환이 많은 대형 스튜디오 표준입니다."],
          ["alt-cut-58", "58컷 (감정선·로판)", "58", "대형 풀샷과 인물 클로즈업 완성도에 시간을 집중합니다."],
        ],
      }),
      makeField({
        fieldId: "verticalGutterPx",
        labelKo: "컷 사이 세로 여백",
        controlType: "number",
        value: "180",
        unitKo: "px",
        intentHint: "세로 여백이 너무 좁으면 모바일 화면에서 컷이 겹쳐 보이고 감정 전환 호흡이 무너집니다.",
        recommendedWhy: "1600px 마스터 기준 스마트폰 1화면당 1~1.5컷이 자연스럽게 걸리는 가독성 표준 간격입니다.",
        aiSuggestionBadgeKo: "모바일 스크롤 최적 간격",
        alternatives: [
          ["alt-gut-120", "120px (빠른 타격·대화)", "120", "티키타카 대화나 연타 액션의 속도감을 끌어올립니다."],
          ["alt-gut-260", "260px (서스펜스·반전)", "260", "스크롤을 내리는 짧은 정적으로 공포·충격 연출을 키웁니다."],
          ["alt-gut-150", "150px (690px 도전 규격)", "150", "690px 가로폭 작업 시 과도한 공백을 줄여 밀도를 유지합니다."],
        ],
      }),
      makeField({
        fieldId: "pacingTempo",
        labelKo: "연출 호흡 템포",
        controlType: "select",
        value: "균형 드라마 (도입 20% · 전개 50% · 반전 30%)",
        intentHint: "호흡 템포를 정하면 클로즈업·전신·배경 컷 비율과 회차 말미 클리프행어 위치가 자동 배분됩니다.",
        recommendedWhy: "초반 15초 시선 고정과 마지막 컷 다음 화 결제 유도를 동시에 만족하는 검증된 구조입니다.",
        aiSuggestionBadgeKo: "AI 추천 · 완독/미리보기 균형",
        alternatives: [
          ["alt-pace-fast", "고속 액션 (짧은 컷 연타)", "고속 타격 (1스크롤 2컷 · 클라이맥스 집중)", "전투·추격 회차에서 박진감을 극대화합니다."],
          ["alt-pace-suspense", "저속 서스펜스 (롱 샷·암전)", "저속 긴장 (긴 여백 · 시선 유도 암전 컷)", "미스터리·호러에서 단서 발견 직전의 몰입도를 높입니다."],
          ["alt-pace-comedy", "경쾌한 4박자 코미디", "기승전결 4박자 (리액션 컷 강조)", "일상·개그 타이밍의 박자를 일정하게 유지합니다."],
        ],
      }),
      makeField({
        fieldId: "cliffhangerBeat",
        labelKo: "엔딩 훅(마지막 3컷) 전략",
        controlType: "select",
        value: "새 위협 등장 + 주인공 시선 클로즈업",
        intentHint: "마지막 3컷의 여운이 유료 다음 화 전환율과 댓글 반응량을 가장 크게 좌우합니다.",
        recommendedWhy: "직관적인 시각 충격과 다음 화 궁금증을 동시에 남기는 가장 보편적인 엔딩 공식입니다.",
        aiSuggestionBadgeKo: "미리보기 전환 가드",
        alternatives: [
          ["alt-cliff-reveal", "대사 반전 · 정체 공개", "한 줄 충격 대사 + 흑백 반전 컷", "스릴러·추리 회차에서 댓글 토론을 유도합니다."],
          ["alt-cliff-romance", "거리 밀착 · 심쿵 정지", "두 사람 시선 교차 + 빛망울 클로즈업", "로맨스 독자의 다음 화 대기 심리를 강하게 자극합니다."],
          ["alt-cliff-warm", "따뜻한 여운 · 에필로그", "소품 클로즈업 + 나레이션 한 줄", "힐링·일상 장르에서 편안한 완결감을 줍니다."],
        ],
      }),
    ],
    stagePresets: [
      {
        presetId: "sb-fast-action",
        labelKo: "액션 75컷 고속 템포",
        summaryKo: "75컷 · 여백 120px · 고속 타격",
        overrides: { cutCount: "75", verticalGutterPx: "120", pacingTempo: "고속 타격 (1스크롤 2컷 · 클라이맥스 집중)" },
      },
      {
        presetId: "sb-suspense-thriller",
        labelKo: "스릴러 58컷 긴 여백",
        summaryKo: "58컷 · 여백 260px · 암전 서스펜스",
        overrides: {
          cutCount: "58",
          verticalGutterPx: "260",
          pacingTempo: "저속 긴장 (긴 여백 · 시선 유도 암전 컷)",
          cliffhangerBeat: "한 줄 충격 대사 + 흑백 반전 컷",
        },
      },
      {
        presetId: "sb-solo-light",
        labelKo: "1인 연재 48컷 경량",
        summaryKo: "48컷 · 여백 150px · 4박자 호흡",
        overrides: { cutCount: "48", verticalGutterPx: "150", pacingTempo: "기승전결 4박자 (리액션 컷 강조)" },
      },
    ],
  },
  stage3d: {
    stageId: "stage3d",
    stageLabelKo: "3D 배경 / 조명",
    stageGoalKo: "시간대·투시·3D 선화 두께를 작가 화풍에 미리 맞춰 3D 이질감 없이 즉시 렌더합니다.",
    spritePath: SMART_DEFAULT_SPRITE_PATHS.layers,
    fields: [
      makeField({
        fieldId: "timeOfDay",
        labelKo: "배경 시간대 · 태양 고도",
        controlType: "select",
        value: "오후 골든아워 (16:30 · 따뜻한 사선광)",
        intentHint: "시간대 프리셋이 하늘색, 그림자 길이, 창문 역광 색온도를 한 번에 통일합니다.",
        recommendedWhy: "인물 피부 톤을 살리면서 배경 입체감을 가장 자연스럽게 분리하는 만능 시간대입니다.",
        aiSuggestionBadgeKo: "AI 추천 · 피부/배경 분리 최적",
        alternatives: [
          ["alt-tod-day", "맑은 정오 (11:30 · 중립광)", "맑은 낮 (11:30 · 선명한 중립 자연광)", "학원·오피스·일상 장면에서 가장 깔끔하고 가독성이 높습니다."],
          ["alt-tod-neon", "네온 심야 (23:00 · 청/마젠타)", "네온 심야 (23:00 · 젖은 아스팔트 반사광)", "헌터·사이버펑크 액션에서 화려한 림라이트를 자동 생성합니다."],
          ["alt-tod-night", "깊은 새벽 (02:30 · 저채도 암부)", "깊은 새벽 (02:30 · 단광원 손전등/가로등)", "스릴러·공포 씬의 긴장감과 명암 대비를 높입니다."],
        ],
      }),
      makeField({
        fieldId: "cameraPerspective",
        labelKo: "카메라 투시 · 화각",
        controlType: "select",
        value: "표준 인물 화각 35mm (2점 투시 · 눈높이)",
        intentHint: "화각이 캐릭터 비율 왜곡과 배경 원근감을 결정하므로 컷 간 점프를 막기 위해 기준 화각이 필요합니다.",
        recommendedWhy: "인물과 주변 배경 정보를 동시에 안정적으로 담아 대화·이동 컷의 70%에 그대로 쓸 수 있습니다.",
        aiSuggestionBadgeKo: "웹툰 표준 35mm",
        alternatives: [
          ["alt-cam-24", "광각 24mm (로우앵글·박력)", "광각 24mm (3점 투시 · 로우앵글)", "액션 타격, 거대 건축물, 위압감 연출에 적합합니다."],
          ["alt-cam-50", "표준망원 50mm (클로즈업)", "인물 50mm (얕은 심도 · 감정 클로즈업)", "얼굴 왜곡 없이 로맨스·감정 대사 컷을 돋보이게 합니다."],
          ["alt-cam-iso", "직교·고정 70mm (공간 설명)", "망원 70mm (압축 원근 · 상황 설명)", "군중·건물 전경 컷에서 인물과 배경 배치를 명료하게 보여 줍니다."],
        ],
      }),
      makeField({
        fieldId: "lineWeightPx",
        labelKo: "3D→2D 선화 추출 두께",
        controlType: "number",
        value: "1.6",
        unitKo: "px",
        intentHint: "3D 배경 선이 캐릭터 선화보다 굵으면 인물이 배경에 묻혀 3D 티가 크게 납니다.",
        recommendedWhy: "캐릭터 메인 선화(2.2~2.5px)의 70% 수준으로 맞춰 배경이 자연스럽게 한 발 물러납니다.",
        aiSuggestionBadgeKo: "캐릭터 대비 0.7x 자동 보정",
        alternatives: [
          ["alt-lw-10", "1.0px (얇은 로판·회화)", "1.0", "얇은 색선 화풍에서 배경이 부드럽게 스며듭니다."],
          ["alt-lw-22", "2.2px (강한 액션·먹선)", "2.2", "굵은 펜터치와 함께 힘 있는 배경 실루엣을 만듭니다."],
          ["alt-lw-14", "1.4px (깔끔한 현대극)", "1.4", "실내 가구·소품 선이 뭉개지지 않게 선명도를 유지합니다."],
        ],
      }),
      makeField({
        fieldId: "shadowContrast",
        labelKo: "배경 음영 대비",
        controlType: "select",
        value: "중간 대비 (셀 2단 · 암부 채도 보정)",
        intentHint: "배경 그림자가 탁한 회색이 되면 인물 채색과 따로 놀아 전체 컷의 완성도가 떨어집니다.",
        recommendedWhy: "암부에 보라·남색 기운을 살짝 넣어 웹툰 채색과 자연스럽게 어울리는 2단 셀 음영을 만듭니다.",
        aiSuggestionBadgeKo: "3D 이질감 제거 가드",
        alternatives: [
          ["alt-sh-soft", "부드러운 파스텔 음영", "저대비 소프트 (로맨스·일상용)", "인물 표정이 어두워지지 않게 밝은 톤을 유지합니다."],
          ["alt-sh-hard", "강한 하드 섀도우", "고대비 하드 셀 (액션·스릴러용)", "빛과 어둠의 경계를 날카롭게 잘라 극적 긴장을 만듭니다."],
          ["alt-sh-lineonly", "선화+AO 패스 분리", "선화+AO 마스크 분리 (채색팀 후가공)", "대형 스튜디오 채색팀이 레이어를 직접 조색할 때 가장 편합니다."],
        ],
      }),
    ],
    stagePresets: [
      {
        presetId: "bg3d-neon-action",
        labelKo: "네온 심야 액션 세트",
        summaryKo: "23:00 네온 · 24mm 광각 · 2.2px 선화",
        overrides: {
          timeOfDay: "네온 심야 (23:00 · 젖은 아스팔트 반사광)",
          cameraPerspective: "광각 24mm (3점 투시 · 로우앵글)",
          lineWeightPx: "2.2",
          shadowContrast: "고대비 하드 셀 (액션·스릴러용)",
        },
      },
      {
        presetId: "bg3d-rofan-sunset",
        labelKo: "골든아워 로판 궁정",
        summaryKo: "16:30 노을 · 50mm 인물 · 1.0px 색선",
        overrides: {
          timeOfDay: "오후 골든아워 (16:30 · 따뜻한 사선광)",
          cameraPerspective: "인물 50mm (얕은 심도 · 감정 클로즈업)",
          lineWeightPx: "1.0",
          shadowContrast: "저대비 소프트 (로맨스·일상용)",
        },
      },
      {
        presetId: "bg3d-day-modern",
        labelKo: "맑은 낮 학원·오피스",
        summaryKo: "11:30 중립광 · 35mm 표준 · 1.4px 선화",
        overrides: {
          timeOfDay: "맑은 낮 (11:30 · 선명한 중립 자연광)",
          cameraPerspective: "표준 인물 화각 35mm (2점 투시 · 눈높이)",
          lineWeightPx: "1.4",
        },
      },
    ],
  },
  coloring: {
    stageId: "coloring",
    stageLabelKo: "채색 / 후보정",
    stageGoalKo: "팔레트 무드와 광원 각도를 회차 전체에 고정해 다인 분업 시에도 컷 간 색 흔들림을 막습니다.",
    spritePath: SMART_DEFAULT_SPRITE_PATHS.aiCompass,
    fields: [
      makeField({
        fieldId: "paletteMood",
        labelKo: "회차 팔레트 무드",
        controlType: "select",
        value: "시네마틱 웜&쿨 대비 (피부 맑음 + 암부 쿨톤)",
        intentHint: "팔레트 무드를 정하면 밑색·명암·후보정 어시가 같은 색온도 기준을 공유해 리터칭이 줄어듭니다.",
        recommendedWhy: "모바일 OLED 화면에서 인물 피부색이 뜨지 않고 배경과 또렷이 분리되는 실전 검증 팔레트입니다.",
        aiSuggestionBadgeKo: "캐릭터 바이블 색온도 고정",
        alternatives: [
          ["alt-pal-pastel", "화사한 파스텔 블룸", "화사한 로맨스 파스텔 (피치·라벤더 하이라이트)", "로맨스·학원물에서 밝고 사랑스러운 첫인상을 줍니다."],
          ["alt-pal-cyber", "네온 시안·마젠타", "고채도 네온 림라이트 (시안·마젠타 대비)", "야간 전투·스킬 이펙트가 화려한 액션 씬에 맞습니다."],
          ["alt-pal-noir", "저채도 누아르·포인트 레드", "저채도 슬레이트 그레이 + 포인트 크림슨", "미스터리·스릴러에서 단서와 위험 요소에 시선을 집중합니다."],
        ],
      }),
      makeField({
        fieldId: "keyLightAngleDeg",
        labelKo: "주 광원 각도",
        controlType: "number",
        value: "45",
        unitKo: "도",
        intentHint: "컷마다 광원 방향이 제각각 바뀌면 독자가 공간감을 잃고 채색 검수 수정이 급증합니다.",
        recommendedWhy: "좌상단 45도 광원은 코·턱·옷 주름 입체감을 가장 빠르고 일관되게 그려내는 정석 각도입니다.",
        aiSuggestionBadgeKo: "어시 공용 광원 앵커",
        alternatives: [
          ["alt-ang-135", "135도 (역광·실루엣)", "135", "등장 씬·극적 대치 컷에서 머리카락 림라이트를 강조합니다."],
          ["alt-ang-15", "15도 (정면 소프트)", "15", "그림자를 최소화해 밝고 귀여운 인물 표정을 살립니다."],
          ["alt-ang-290", "290도 (하단 반사광·공포)", "290", "아래에서 비추는 빛으로 위협·미스터리 분위기를 연출합니다."],
        ],
      }),
      makeField({
        fieldId: "shadingStyle",
        labelKo: "명암 채색 방식",
        controlType: "select",
        value: "1차 셀 음영 + 2차 에어브러시 그라데이션",
        intentHint: "채색 방식에 따라 컷당 소요시간이 최대 2배까지 차이 나므로 팀 규모와 마감일에 맞춰 선택해야 합니다.",
        recommendedWhy: "단순 셀보다 깊이감이 높으면서도 풀 회화 대비 작업 속도가 1.8배 빠른 상업 웹툰 표준입니다.",
        aiSuggestionBadgeKo: "마감 속도·퀄리티 균형",
        alternatives: [
          ["alt-shd-1step", "1단 깔끔한 셀 음영", "1단 하드 셀 명암 (초고속 마감)", "1인 연재·일상물에서 채색 시간을 대폭 절약합니다."],
          ["alt-shd-glow", "다층 보석·반사광 채색", "다층 반사광 + 머리카락/눈동자 글로우", "표지·로판 메인 클로즈업 컷의 시각 매력을 끌어올립니다."],
          ["alt-shd-gritty", "거친 텍스처·스크린톤 혼합", "하드 음영 + 종이/노이즈 질감 오버레이", "다크 판타지·느와르 액션의 거친 질감을 강조합니다."],
        ],
      }),
      makeField({
        fieldId: "postAtmosphere",
        labelKo: "후보정 대기·광원 효과",
        controlType: "select",
        value: "은은한 블룸 15% + 배경 대기 원근 안개",
        intentHint: "후보정은 컷의 시선을 주인공 얼굴에 모으고 2D 인물과 3D 배경의 경계를 부드럽게 덮어 줍니다.",
        recommendedWhy: "과한 발광으로 선화가 날아가지 않게 억제하면서도 완성도를 한 단계 높여 주는 안전 수치입니다.",
        aiSuggestionBadgeKo: "선화 보존 안전 보정",
        alternatives: [
          ["alt-post-vfx", "액션 모션블러 + 스파크", "방사형 모션블러 + 하이라이트 스파크 30%", "타격 순간의 에너지와 속도감을 배가합니다."],
          ["alt-post-vignette", "시네마 비네팅 + 필름 그레인", "가장자리 암부 비네팅 25% + 미세 그레인", "스릴러·회상 씬의 몰입감과 화면 집중도를 높입니다."],
          ["alt-post-clean", "미니멀 색보정 (노블룸)", "색온도 미세 통일만 적용 (선명도 최우선)", "가독성이 최우선인 일상·정보 컷을 깔끔하게 유지합니다."],
        ],
      }),
    ],
    stagePresets: [
      {
        presetId: "col-commercial-std",
        labelKo: "상업 주간연재 표준",
        summaryKo: "웜&쿨 대비 · 45도 광원 · 블룸 15%",
        overrides: {
          paletteMood: "시네마틱 웜&쿨 대비 (피부 맑음 + 암부 쿨톤)",
          keyLightAngleDeg: "45",
          shadingStyle: "1차 셀 음영 + 2차 에어브러시 그라데이션",
          postAtmosphere: "은은한 블룸 15% + 배경 대기 원근 안개",
        },
      },
      {
        presetId: "col-neon-action",
        labelKo: "고채도 네온 액션",
        summaryKo: "시안·마젠타 · 135도 역광 · 스파크 30%",
        overrides: {
          paletteMood: "고채도 네온 림라이트 (시안·마젠타 대비)",
          keyLightAngleDeg: "135",
          postAtmosphere: "방사형 모션블러 + 하이라이트 스파크 30%",
        },
      },
      {
        presetId: "col-pastel-rofan",
        labelKo: "화사한 로판 글로우",
        summaryKo: "파스텔 블룸 · 15도 정면광 · 다층 반사광",
        overrides: {
          paletteMood: "화사한 로맨스 파스텔 (피치·라벤더 하이라이트)",
          keyLightAngleDeg: "15",
          shadingStyle: "다층 반사광 + 머리카락/눈동자 글로우",
        },
      },
    ],
  },
  delivery: {
    stageId: "delivery",
    stageLabelKo: "출고 / 플랫폼",
    stageGoalKo: "네이버(690/1600px)·카카오·글로벌 규격과 심의 등급을 출고 전 자동으로 맞춥니다.",
    spritePath: SMART_DEFAULT_SPRITE_PATHS.production,
    fields: [
      makeField({
        fieldId: "platformSpec",
        labelKo: "출고 플랫폼 규격",
        controlType: "select",
        value: "네이버 웹툰 정식연재 마스터 (가로 1600px · 300DPI)",
        intentHint: "플랫폼마다 허용 가로폭·분할 용량·썸네일 비율이 달라 잘못 맞추면 업로드가 반려됩니다.",
        recommendedWhy: "1600px 마스터로 작업하면 690px 도전·글로벌 800px·단행본까지 손실 없이 자동 축소 출고할 수 있습니다.",
        aiSuggestionBadgeKo: "원소스 멀티출고 추천",
        alternatives: [
          ["alt-plat-naver690", "네이버 도전·베도 (690px)", "네이버 도전만화 · 베스트도전 (가로 690px · 72DPI)", "도전만화 업로드 제한(가로 690px · 컷당 2MB)에 즉시 맞춥니다."],
          ["alt-plat-kakao", "카카오페이지 (720/1440px)", "카카오페이지 · 카카오웹툰 (가로 720px / 2x 1440px)", "카카오 페이지뷰·스크롤뷰 규격과 회차 총용량 제한을 맞춥니다."],
          ["alt-plat-global", "글로벌 WEBTOON (800px)", "글로벌 WEBTOON · Tapas (가로 800×1280px 분할)", "영미·동남아 플랫폼 업로드 제한(가로 800px · 장당 1280px)을 준수합니다."],
        ],
      }),
      makeField({
        fieldId: "sliceHeightPx",
        labelKo: "세로 자동 분할 높이",
        controlType: "number",
        value: "2000",
        unitKo: "px",
        intentHint: "분할 높이가 너무 크면 모바일 이미지 로딩 지연과 파일 용량 초과 오류가 발생합니다.",
        recommendedWhy: "1600px 정식연재 기준 장당 2MB 이하를 안정적으로 유지하는 자동 슬라이스 구간입니다.",
        aiSuggestionBadgeKo: "용량 초과 자동 방지",
        alternatives: [
          ["alt-sl-1280", "1280px (글로벌·표준)", "1280", "WEBTOON 글로벌/Tapas 800×1280px 제한에 정확히 일치합니다."],
          ["alt-sl-1600", "1600px (카카오 권장)", "1600", "카카오페이지 모바일 뷰어 로딩 속도에 최적화됩니다."],
          ["alt-sl-2500", "2500px (고화질 검토용)", "2500", "사내 PD 검수 시 이미지 장수를 줄여 확인 속도를 높입니다."],
        ],
      }),
      makeField({
        fieldId: "colorProfile",
        labelKo: "색공간 · 압축 형식",
        controlType: "select",
        value: "sRGB JPG 품질 92% (원본 PSD/PNG 별도 보존)",
        intentHint: "CMYK나 비표준 프로파일로 내보내면 모바일 앱에서 색이 탁해지거나 반전됩니다.",
        recommendedWhy: "웹툰 앱 표준 sRGB 색감을 유지하면서 파일 용량을 60% 이상 절감하는 출고 표준입니다.",
        aiSuggestionBadgeKo: "모바일 색왜곡 0% 가드",
        alternatives: [
          ["alt-clr-png", "sRGB 무손실 PNG", "sRGB 무손실 PNG (선화·식자 최선명)", "용량 여유가 있을 때 말풍선 글자 깨짐을 원천 차단합니다."],
          ["alt-clr-webp", "sRGB WebP 90% (초경량)", "sRGB WebP 품질 90% (웹 프리뷰·공유용)", "외부 검수 링크 공유 시 모바일 로딩을 가장 빠르게 만듭니다."],
          ["alt-clr-cmyk", "단행본 CMYK 300DPI", "CMYK 300DPI TIFF/PDF (인쇄 출판용)", "종이책 단행본·굿즈 인쇄 출고 전 색분리 변환에 사용합니다."],
        ],
      }),
      makeField({
        fieldId: "ageRating",
        labelKo: "연령 등급 · 심의 기준",
        controlType: "select",
        value: "15세 이용가 (액션 타격 허용 · 과도한 선혈 차단)",
        intentHint: "연령 등급을 미리 지정해야 출고 직전 심의 반려로 인한 연재 펑크를 사전에 막을 수 있습니다.",
        recommendedWhy: "액션·로판·스릴러 상업 연재 대부분이 채택하는 표준 심의 가이드라인입니다.",
        aiSuggestionBadgeKo: "심의 반려 사전 차단",
        alternatives: [
          ["alt-age-all", "전체 이용가", "전체 이용가 (비속어·흡연·유혈 완전 배제)", "전 연령 노출과 브랜드 제휴·광고 수익 폭이 가장 넓습니다."],
          ["alt-age-12", "12세 이용가", "12세 이용가 (경미한 갈등 · 건전 연출)", "학원물·판타지 모험·글로벌 플랫폼 확장에 유리합니다."],
          ["alt-age-19", "19세 이용가 (성인 인증)", "19세 이용가 (성인 인증 · 수위 별도 표기)", "성인 타깃 로맨스·하드보일드 스릴러 전용 심의 기준입니다."],
        ],
      }),
    ],
    stagePresets: [
      {
        presetId: "del-naver-official",
        labelKo: "네이버 정식연재 1600px",
        summaryKo: "1600px · 2000px 분할 · sRGB JPG 92%",
        overrides: {
          platformSpec: "네이버 웹툰 정식연재 마스터 (가로 1600px · 300DPI)",
          sliceHeightPx: "2000",
          colorProfile: "sRGB JPG 품질 92% (원본 PSD/PNG 별도 보존)",
        },
      },
      {
        presetId: "del-kakao-page",
        labelKo: "카카오페이지 720/1440px",
        summaryKo: "카카오 규격 · 1600px 분할 · 15세 이용가",
        overrides: {
          platformSpec: "카카오페이지 · 카카오웹툰 (가로 720px / 2x 1440px)",
          sliceHeightPx: "1600",
          ageRating: "15세 이용가 (액션 타격 허용 · 과도한 선혈 차단)",
        },
      },
      {
        presetId: "del-global-webtoon",
        labelKo: "글로벌 WEBTOON 800px",
        summaryKo: "800×1280px · sRGB PNG · 12세 이용가",
        overrides: {
          platformSpec: "글로벌 WEBTOON · Tapas (가로 800×1280px 분할)",
          sliceHeightPx: "1280",
          colorProfile: "sRGB 무손실 PNG (선화·식자 최선명)",
          ageRating: "12세 이용가 (경미한 갈등 · 건전 연출)",
        },
      },
    ],
  },
};
