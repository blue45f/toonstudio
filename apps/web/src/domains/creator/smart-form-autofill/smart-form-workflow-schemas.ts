import type { FreeAiZeroBillModeId } from "@/shared/ai/free-ai-zero-bill-cascade";

export const MAX_REQUIRED_FIELDS = 2 as const;
export const MIN_OPTIONAL_FIELDS = 6 as const;
export const MAX_UNDO_HISTORY = 15 as const;

export const SMART_FORM_WORKFLOW_IDS = [
  "project-create",
  "episode-publish",
  "export-release",
  "team-division-invite",
  "support-inquiry",
] as const;

export type SmartFormWorkflowId = (typeof SMART_FORM_WORKFLOW_IDS)[number];
export type SmartFormFieldKind = "text" | "textarea" | "select" | "tags";
export type SmartFormFieldOrigin = "empty" | "ai-suggested" | "user-edited";
export type SmartFormRecommendationSource = "ai-local" | "ai-zero-bill-cascade";

export interface SmartFormFieldDefinition {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly kind: SmartFormFieldKind;
  readonly placeholderKo: string;
  readonly helperKo: string;
  readonly options?: readonly string[];
}

export interface SmartFormWorkflowSchema {
  readonly id: SmartFormWorkflowId;
  readonly tabLabelKo: string;
  readonly tabLabelEn: string;
  readonly headlineKo: string;
  readonly summaryKo: string;
  readonly submitLabelKo: string;
  readonly sampleInputsKo: readonly string[];
  readonly cascadeMode: FreeAiZeroBillModeId;
  readonly requiredFields: readonly SmartFormFieldDefinition[];
  readonly optionalFields: readonly SmartFormFieldDefinition[];
}

export const GENRE_OPTIONS = [
  "로맨스 판타지",
  "학원·청춘",
  "액션·판타지",
  "일상·코미디",
  "미스터리·스릴러",
  "SF·사이버펑크",
  "힐링·드라마",
] as const;

export const PLATFORM_SPEC_OPTIONS = [
  "네이버 웹툰 세로형 (800×1280px 분할 · 72DPI RGB)",
  "카카오페이지 세로형 (720×1280px 분할 · 72DPI RGB)",
  "고해상도 마스터 원고 (1080×8000px · 300DPI)",
  "SNS 컷툰 정사각 (1080×1080px · 4컷 카드)",
  "단행본 인쇄 B5 (300DPI CMYK · 3mm 도련)",
] as const;

export const AGE_RATING_OPTIONS = ["전체 이용가", "12세 이용가", "15세 이용가"] as const;

export const DIVISION_PRESET_OPTIONS = [
  "1인 독립 연재 (올인원 간편 모드)",
  "2인 협업 (콘티·선화 + 채색·배경)",
  "3인 분업 (글·콘티 / 선화 / 채색·보정)",
  "6인 풀 스튜디오 (글·콘티·3D배경·선화·채색·식자)",
] as const;

function defineField(
  id: string,
  labelKo: string,
  labelEn: string,
  kind: SmartFormFieldKind,
  placeholderKo: string,
  helperKo: string,
  options?: readonly string[],
): SmartFormFieldDefinition {
  return options
    ? { id, labelKo, labelEn, kind, placeholderKo, helperKo, options }
    : { id, labelKo, labelEn, kind, placeholderKo, helperKo };
}

export const SMART_FORM_WORKFLOW_SCHEMAS: Readonly<
  Record<SmartFormWorkflowId, SmartFormWorkflowSchema>
> = Object.freeze({
  "project-create": {
    id: "project-create",
    tabLabelKo: "작품 생성",
    tabLabelEn: "Create Work",
    headlineKo: "작품 제목이나 한 줄 아이디어만 적으세요",
    summaryKo: "장르·플랫폼 규격·태그·시놉시스·권리 BOM·배색까지 AI가 바로 권장값으로 채워드립니다.",
    submitLabelKo: "이 구성으로 작품 만들기",
    sampleInputsKo: [
      "서울 야경 로판 학원물 1화",
      "사이버펑크 액션 보스전 12화 카카오페이지",
      "일상 고양이 4컷툰 인스타그램",
      "미스터리 추리 단행본 1장 인쇄",
    ],
    cascadeMode: "idea-remix",
    requiredFields: [
      defineField(
        "workPrompt",
        "작품 제목 또는 한 줄 설명",
        "Title or one-line idea",
        "text",
        "예: 서울 야경 로판 학원물 1화",
        "필수 항목은 이 한 칸뿐입니다. 키워드 몇 개만 적어도 나머지 9개 항목을 AI가 채워요.",
      ),
    ],
    optionalFields: [
      defineField("genre", "추천 장르", "Genre", "select", "장르 선택", "한 줄 설명 속 분위기·배경 단서로 자동 분류합니다.", GENRE_OPTIONS),
      defineField("targetPlatformSpec", "타깃 플랫폼 규격", "Target Platform Spec", "select", "연재 규격 선택", "플랫폼 출고 기준에 맞는 캔버스 폭과 해상도를 추천합니다.", PLATFORM_SPEC_OPTIONS),
      defineField("ageRating", "연령 등급", "Age Rating", "select", "연령 등급 선택", "장르 수위와 연출 톤에 맞는 안전 기본 등급입니다.", AGE_RATING_OPTIONS),
      defineField("tags", "추천 태그 5개", "5 Recommended Tags", "tags", "#로판, #학원물, #서울야경, #감성연출, #1화", "독자 탐색에 잘 걸리는 핵심 키워드 5개를 자동 조합합니다."),
      defineField("synopsis", "시놉시스 초안", "Synopsis Draft", "textarea", "작품 소개 2~3줄 초안", "작품 홈과 연재 제안서에 바로 붙여 넣을 수 있는 소개글입니다."),
      defineField("rightsBomDefault", "권리 BOM 안전 기본값", "Rights BOM Safe Default", "text", "상업 안전 무료 폰트·CC0 배경·AI 보조 기록", "출고 시 저작권 분쟁을 막는 라이선스 원장 기본 설정입니다."),
      defineField("divisionPreset", "분업 팀 프리셋", "Team Division Preset", "select", "팀 구성 선택", "작화 밀도와 포맷에 알맞은 협업 인원 구성을 추천합니다.", DIVISION_PRESET_OPTIONS),
      defineField("scrollMarginPx", "권장 스크롤 여백", "Scroll Margin", "text", "260px (감성 호흡 기준)", "모바일 세로 스크롤에서 시선이 머무는 권장 컷 간격입니다."),
      defineField("colorPalette", "대표 배색 팔레트 (OKLCH)", "Signature Palette", "text", "OKLCH 시맨틱 팔레트", "장면 감정과 시간대에 맞춘 OKLCH 기반 키·배경·포인트 배색입니다."),
    ],
  },
  "episode-publish": {
    id: "episode-publish",
    tabLabelKo: "회차 발행",
    tabLabelEn: "Publish Episode",
    headlineKo: "이번 회차 제목이나 핵심 장면만 한 줄로 적으세요",
    summaryKo: "회차 소개글·작가의 말·연령 등급·공개 시간·썸네일 구도·해시태그를 AI가 채워드립니다.",
    submitLabelKo: "회차 발행 준비 완료",
    sampleInputsKo: [
      "비 오는 옥상에서 첫 고백 7화",
      "던전 최종 보스 각성 24화",
      "고양이 간식 쟁탈전 4컷 특별편",
    ],
    cascadeMode: "thumbnail-hook-optimizer",
    requiredFields: [
      defineField(
        "episodeSeed",
        "회차 제목 또는 핵심 장면 한 줄",
        "Episode title or key scene",
        "text",
        "예: 비 오는 옥상에서 첫 고백 7화",
        "필수 1칸만 입력하면 발행 메타데이터 전체가 자동으로 채워집니다.",
      ),
    ],
    optionalFields: [
      defineField("episodeSummary", "회차 소개글", "Episode Summary", "textarea", "독자 클릭을 부르는 스포일러 없는 1~2줄 소개", "결말 스포일러를 피하면서 궁금증을 높이는 요약 문구입니다."),
      defineField("authorNote", "작가의 말 초안", "Author Note", "text", "독자와 소통하는 짧은 한마디", "댓글 참여를 자연스럽게 이끄는 인사 문구입니다."),
      defineField("ageRating", "회차 연령 등급", "Episode Age Rating", "select", "연령 등급", "회차 장면 성격을 반영해 등급을 자동 점검합니다.", AGE_RATING_OPTIONS),
      defineField("publishSchedule", "권장 공개 시간대", "Suggested Publish Slot", "text", "화/금 22:00 KST (야간 독자 집중 구간)", "장르별 독자 유입이 활발한 시간대입니다."),
      defineField("thumbnailHook", "썸네일 추천 구도·카피", "Thumbnail Hook", "text", "인물 눈빛 클로즈업 + 중앙 70% 안전 크롭", "1:1 및 16:9 목록 카드에서 잘리지 않는 구도 가이드입니다."),
      defineField("scrollMarginPx", "컷 여백·엔딩 훅 점검", "Scroll Pacing Check", "text", "평균 260px · 마지막 컷 직전 400px 낙하 여백", "클라이맥스와 엔딩 직전의 권장 스크롤 여백입니다."),
      defineField("hashtags", "회차 홍보 해시태그", "Episode Hashtags", "tags", "#웹툰연재 #회차공개", "SNS·커뮤니티 공유용 해시태그 5개입니다."),
      defineField("rightsBomDefault", "권리 BOM 출처 고지", "Rights BOM Notice", "text", "사용 폰트·3D 배경 라이선스 확인 완료", "회차 하단 또는 출고 메타에 첨부할 권리 내역입니다."),
    ],
  },
  "export-release": {
    id: "export-release",
    tabLabelKo: "원고 내보내기",
    tabLabelEn: "Export Release",
    headlineKo: "어디에 올릴 원고인지 한 줄만 적어 주세요",
    summaryKo: "플랫폼 해상도·분할 높이·색 공간·파일명 규칙·권리 BOM 검수까지 한 번에 맞춥니다.",
    submitLabelKo: "이 규격으로 내보내기",
    sampleInputsKo: [
      "네이버 웹툰 1화 마감 원고 출고",
      "카카오페이지 12화 고화질 분할 내보내기",
      "단행본 인쇄용 CMYK 300DPI PDF 출고",
    ],
    cascadeMode: "export-preflight-coach",
    requiredFields: [
      defineField(
        "exportGoal",
        "내보낼 대상 한 줄 설명",
        "Export destination summary",
        "text",
        "예: 네이버 웹툰 1화 마감 원고 출고",
        "플랫폼 이름과 회차만 적으면 출고 옵션을 자동으로 맞춥니다.",
      ),
    ],
    optionalFields: [
      defineField("targetPlatformSpec", "출력 규격·해상도", "Output Spec", "select", "출력 규격 선택", "업로드 거절을 막는 플랫폼 표준 가로·세로 규격입니다.", PLATFORM_SPEC_OPTIONS),
      defineField("fileFormat", "파일 형식·압축 품질", "File Format & Quality", "text", "JPG 92% (원본 PNG 백업 병행)", "화질 저하 없이 플랫폼 용량 제한을 지키는 설정입니다."),
      defineField("sliceHeightPx", "자동 세로 분할 높이", "Auto Slice Height", "text", "1280px (말풍선 경계 자동 회피)", "대사 말풍선이 잘리지 않도록 여백 구간에서 분할합니다."),
      defineField("colorProfile", "색 공간·프로파일", "Color Profile", "text", "sRGB IEC61966-2.1 (웹 연재 표준)", "모바일 웹과 인쇄물 사이의 색 틀어짐을 방지합니다."),
      defineField("rightsBomDefault", "Rights BOM 출고 점검", "Rights BOM Gate", "text", "폰트·브러시·3D 배경 상업 라이선스 자동 검증", "내보내기 직전 무료·상업 라이선스 누락을 차단합니다."),
      defineField("filenameTemplate", "파일명 규칙", "Filename Pattern", "text", "ep01_slice_{index:02d}.jpg", "편집부 및 자동 업로더가 바로 인식하는 정렬 파일명입니다."),
      defineField("preflightChecklist", "출고 전 자동 점검 항목", "Preflight Checklist", "text", "말풍선 16px 이상 · 여백 220px 이상 · 20MB 이하", "마감 직전 실수를 줄여 주는 핵심 검사 목록입니다."),
    ],
  },
  "team-division-invite": {
    id: "team-division-invite",
    tabLabelKo: "분업 팀 초대",
    tabLabelEn: "Team Invite",
    headlineKo: "초대할 분과 맡길 작업 두 칸만 적으세요",
    summaryKo: "역할·권한·인수인계 규칙·마감 주기·크레딧 표기·초대 메시지를 AI가 대신 작성합니다.",
    submitLabelKo: "초대장 보내기",
    sampleInputsKo: [
      "3화 배경 채색과 야간 조명 보정",
      "1화 3D 배경 배치 및 선화 정리",
      "글로벌 영문·일문 식자 및 효과음 현지화",
    ],
    cascadeMode: "script-to-cuts",
    requiredFields: [
      defineField(
        "inviteTarget",
        "초대할 팀원 이름 또는 이메일",
        "Collaborator name or email",
        "text",
        "예: 김채색 또는 artist@example.com",
        "필수 1/2: 닉네임만 먼저 입력해 초대 링크를 만들 수도 있어요.",
      ),
      defineField(
        "teamNeed",
        "맡길 작업 한 줄 설명",
        "Task summary",
        "text",
        "예: 3화 배경 채색과 야간 조명 보정",
        "필수 2/2: 작업 내용을 분석해 역할·권한·인수인계 규칙을 채웁니다.",
      ),
    ],
    optionalFields: [
      defineField("divisionRole", "권장 분업 역할", "Division Role", "text", "채색·명암·보정 담당", "6인 분업 보드의 공정 레인과 바로 연동되는 역할입니다."),
      defineField("divisionPreset", "팀 규모 프리셋", "Team Scale Preset", "select", "팀 프리셋 선택", "현재 작업 범위에 맞는 분업 템플릿입니다.", DIVISION_PRESET_OPTIONS),
      defineField("permissionScope", "접근 권한 범위", "Permission Scope", "text", "담당 컷 슬라이스 편집 · 원본 삭제 잠금", "실수로 타 공정 레이어를 덮어쓰지 않도록 최소 권한을 적용합니다."),
      defineField("handoffRule", "인수인계 규칙", "Handoff Rule", "text", "레이어 폴더 분리 + 완료 체크 시 다음 공정 자동 알림", "선화→채색→식자 전달 시 파일 정리를 표준화합니다."),
      defineField("deadlineHint", "권장 마감 주기", "Suggested Cadence", "text", "회차 공개 48시간 전 1차 공유 · 24시간 전 최종 확정", "주간 연재 마감에 쫓기지 않는 완충 일정입니다."),
      defineField("rightsBomDefault", "기여자 크레딧·권리 기록", "Contributor Credit & Rights", "text", "회차 Rights BOM에 기여 공정 및 사용 에셋 출처 자동 기록", "협업자 크레딧과 정산 근거를 원고에 함께 남깁니다."),
      defineField("welcomeMessage", "초대 인사말 초안", "Invite Message Draft", "textarea", "팀원에게 전달할 정중한 초대 문구", "복사하거나 바로 발송할 수 있는 맞춤형 초대 메시지입니다."),
    ],
  },
  "support-inquiry": {
    id: "support-inquiry",
    tabLabelKo: "문의 접수",
    tabLabelEn: "Support Inquiry",
    headlineKo: "불편하거나 궁금한 점 한 줄만 적어 주세요",
    summaryKo: "문의 분류·우선순위·관련 화면·환경 정보·재현 절차·1분 자가 점검 팁을 자동으로 채워드립니다.",
    submitLabelKo: "문의 접수하기",
    sampleInputsKo: [
      "태블릿 브러시 필압이 갑자기 지연되고 저장이 느려요",
      "네이버 웹툰 규격 내보내기에서 무료 폰트가 누락돼요",
      "팀원 초대 링크를 눌렀는데 권한이 안 열려요",
    ],
    cascadeMode: "export-preflight-coach",
    requiredFields: [
      defineField(
        "inquirySummary",
        "문의 또는 오류 내용 한 줄",
        "One-line inquiry or issue",
        "text",
        "예: 태블릿 브러시 필압이 갑자기 지연되고 저장이 느려요",
        "필수 1칸만 적으시면 분류와 기술 정보는 AI가 자동으로 정리해 드려요.",
      ),
    ],
    optionalFields: [
      defineField("inquiryCategory", "자동 분류", "Category", "text", "드로잉·성능 / 저장·동기화 / 내보내기 / 협업·권한", "담당 엔지니어가 바로 확인할 수 있도록 분류를 지정합니다."),
      defineField("urgencyLevel", "우선순위", "Priority", "text", "높음 (작업 중단 영향)", "원고 손실·마감 지연 가능성을 기준으로 자동 판단합니다."),
      defineField("affectedSurface", "관련 작업 화면", "Affected Surface", "text", "스튜디오 캔버스 편집기", "문제가 발생한 추정 화면 경로를 함께 기록합니다."),
      defineField("environmentSummary", "자동 감지 환경 요약", "Environment Summary", "text", "로컬 브라우저 · OPFS/SQLite 저장소 점검 포함", "민감한 개인정보 없이 진단용 환경 정보만 요약합니다."),
      defineField("reproHint", "재현 절차 요약", "Repro Steps", "textarea", "1) 화면 진입 → 2) 동작 실행 → 3) 현상 확인", "답변 속도를 높이는 간단한 재현 순서 초안입니다."),
      defineField("expectedOutcome", "기대하는 정상 동작", "Expected Behavior", "text", "지연 없이 즉시 반영되고 자동 저장 완료 표시", "원하는 해결 기준을 명확히 적어 드립니다."),
      defineField("selfCheckTip", "접수 전 1분 자가 점검 팁", "1-Min Quick Tip", "text", "브라우저 하드웨어 가속 및 로컬 캐시 상태 확인", "답변을 기다리지 않고 바로 시도해 볼 수 있는 안전한 점검 방법입니다."),
    ],
  },
});

export function assertMinimalRequiredContract(schema: SmartFormWorkflowSchema): void {
  if (schema.requiredFields.length < 1 || schema.requiredFields.length > MAX_REQUIRED_FIELDS) {
    throw new Error(
      `[smart-form-contract] '${schema.id}' 워크플로의 필수 항목은 1~${MAX_REQUIRED_FIELDS}개여야 합니다 (현재 ${schema.requiredFields.length}개).`,
    );
  }
  const seen = new Set<string>();
  for (const field of schema.requiredFields) {
    if (seen.has(field.id)) {
      throw new Error(`[smart-form-contract] 중복 필수 필드 ID: ${field.id}`);
    }
    seen.add(field.id);
  }
  for (const field of schema.optionalFields) {
    if (seen.has(field.id)) {
      throw new Error(`[smart-form-contract] 필수/선택 필드 ID 충돌: ${field.id}`);
    }
    seen.add(field.id);
  }
}

export function assertAllBuiltInWorkflowContracts(): void {
  for (const workflowId of SMART_FORM_WORKFLOW_IDS) {
    const schema = SMART_FORM_WORKFLOW_SCHEMAS[workflowId];
    assertMinimalRequiredContract(schema);
    if (schema.optionalFields.length < MIN_OPTIONAL_FIELDS) {
      throw new Error(
        `[smart-form-contract] '${schema.id}' 선택 항목은 최소 ${MIN_OPTIONAL_FIELDS}개 이상이어야 합니다.`,
      );
    }
  }
}

assertAllBuiltInWorkflowContracts();
