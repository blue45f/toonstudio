/**
 * 진입장벽 제로(Zero-Barrier) 적응형 워크스페이스 카탈로그 및 데이터 계약.
 *
 * - 숙련도 3단계(`beginner-easy` · `creator-standard` · `pro-studio`)와 6단계 작업 흐름
 * - 총 20종 적응형 도구 카탈로그(초보 4버튼 노출 → 복잡도 80% 숨김)
 * - 원클릭 장르 스타터 킷 6종(빈 캔버스 공포 0%)
 * - 한/영 자연어 음성 명령 12종 규칙
 */

export type WorkspaceProficiencyMode = "beginner-easy" | "creator-standard" | "pro-studio";

export type CreationStageId = "idea" | "panel" | "draw" | "color" | "lettering" | "publish";

export type BeginnerCoreActionId =
  | "pick-template"
  | "place-character"
  | "write-dialogue"
  | "export-finish";

export type GenreStarterKitId =
  | "rofan-opening"
  | "modern-hunter-awakening"
  | "seoul-campus-romance"
  | "daily-four-cut-gag"
  | "murim-duel"
  | "thriller-twist";

export type VoiceCommandActionId =
  | "auto-color"
  | "insert-background"
  | "undo-last"
  | "add-speech-bubble"
  | "clean-lineart"
  | "save-project"
  | "place-character"
  | "split-panel"
  | "add-sfx"
  | "export-webtoon"
  | "switch-beginner-mode"
  | "switch-pro-mode";

export interface ProficiencyModeProfile {
  readonly id: WorkspaceProficiencyMode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly targetHiddenComplexityPercent: number;
}

export interface CreationStageProfile {
  readonly id: CreationStageId;
  readonly order: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly goalKo: string;
  readonly goalEn: string;
  readonly primaryCoreActionId: BeginnerCoreActionId;
}

export interface StudioAdaptiveTool {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly plainHintKo: string;
  readonly plainHintEn: string;
  readonly stages: readonly CreationStageId[];
  readonly minMode: WorkspaceProficiencyMode;
  readonly coreBeginnerActionId: BeginnerCoreActionId | null;
  readonly group: "core" | "stage-assist" | "pro-control";
}

export interface StarterPanelItem {
  readonly panelIndex: number;
  readonly framingKo: string;
  readonly framingEn: string;
  readonly backgroundPresetKo: string;
  readonly characterPoseKo: string;
  readonly dialogueKo: string;
  readonly sfxKo: string | null;
  readonly isColored: boolean;
  readonly lineCleaned: boolean;
}

export interface GenreStarterKitDefinition {
  readonly id: GenreStarterKitId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly taglineKo: string;
  readonly taglineEn: string;
  readonly moodPaletteKo: string;
  readonly toneVariant: "accent" | "cool" | "good" | "warn";
  readonly backdropKo: string;
  readonly protagonistPoseKo: string;
  readonly sampleDialoguesKo: readonly string[];
  readonly panels: readonly StarterPanelItem[];
}

export interface StarterCanvasSnapshot {
  readonly snapshotId: string;
  readonly kitId: GenreStarterKitId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly activeBackdropKo: string;
  readonly panels: readonly StarterPanelItem[];
  readonly savedCount: number;
  readonly exportReady: boolean;
  readonly emptyCanvasRiskPercent: 0;
  readonly lastChangeSummaryKo: string;
  readonly updatedAtMs: number;
}

export interface VoiceCommandRule {
  readonly actionId: VoiceCommandActionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly exampleKo: string;
  readonly exampleEn: string;
  readonly phrases: readonly string[];
  readonly keywords: readonly string[];
}

export const PROFICIENCY_MODE_PROFILES: readonly ProficiencyModeProfile[] = [
  {
    id: "beginner-easy",
    labelKo: "초보 쉬움",
    labelEn: "Beginner Easy",
    badgeKo: "복잡함 80% 숨김",
    badgeEn: "80% simpler",
    summaryKo: "꼭 필요한 핵심 4버튼만 남기고 나머지는 깔끔하게 가려 바로 첫 화를 만들어요.",
    summaryEn: "Keeps only the 4 essential buttons visible so you finish episode 1 immediately.",
    targetHiddenComplexityPercent: 80,
  },
  {
    id: "creator-standard",
    labelKo: "표준 창작",
    labelEn: "Creator Standard",
    badgeKo: "단계별 핵심 도구",
    badgeEn: "Stage essentials",
    summaryKo: "컷 정리, 손떨림 보정, 자동 채색처럼 자주 쓰는 창작 도구를 단계별로 열어 드려요.",
    summaryEn: "Unlocks everyday drawing, auto-color, and balloon tools per active step.",
    targetHiddenComplexityPercent: 45,
  },
  {
    id: "pro-studio",
    labelKo: "프로 스튜디오",
    labelEn: "Pro Studio",
    badgeKo: "전체 20종 확장",
    badgeEn: "Full 20 tools",
    summaryKo: "필압 곡선, 입체 조명, 다국어 식자, 인쇄 여백 검수까지 전문 도구를 모두 펼쳐요.",
    summaryEn: "Expands every pro tool including pressure curves, 3D lighting, and print preflight.",
    targetHiddenComplexityPercent: 0,
  },
];

export const CREATION_STAGE_PROFILES: readonly CreationStageProfile[] = [
  {
    id: "idea",
    order: 1,
    labelKo: "아이디어",
    labelEn: "Idea",
    goalKo: "장르와 첫 장면 분위기를 골라 빈 화면 고민을 끝내요.",
    goalEn: "Pick a genre mood to skip blank-canvas anxiety.",
    primaryCoreActionId: "pick-template",
  },
  {
    id: "panel",
    order: 2,
    labelKo: "컷 나누기",
    labelEn: "Panels",
    goalKo: "세로 읽기 흐름에 맞게 컷 칸과 배경을 잡아요.",
    goalEn: "Arrange vertical webtoon panels and backdrops.",
    primaryCoreActionId: "pick-template",
  },
  {
    id: "draw",
    order: 3,
    labelKo: "그리기",
    labelEn: "Draw",
    goalKo: "주인공 포즈를 올려 두고 깔끔한 선으로 다듬어요.",
    goalEn: "Place protagonist poses and keep lines clean.",
    primaryCoreActionId: "place-character",
  },
  {
    id: "color",
    order: 4,
    labelKo: "채색",
    labelEn: "Color",
    goalKo: "한 번에 밑색과 분위기 조명을 입혀 생기를 더해요.",
    goalEn: "Fill base colors and mood lighting in one tap.",
    primaryCoreActionId: "place-character",
  },
  {
    id: "lettering",
    order: 5,
    labelKo: "대사·식자",
    labelEn: "Dialogue",
    goalKo: "읽기 편한 말풍선과 효과음으로 장면을 살려요.",
    goalEn: "Add readable speech bubbles and sound effects.",
    primaryCoreActionId: "write-dialogue",
  },
  {
    id: "publish",
    order: 6,
    labelKo: "완성 내보내기",
    labelEn: "Publish",
    goalKo: "세로 미리보기로 확인하고 바로 업로드 파일로 저장해요.",
    goalEn: "Preview mobile scroll and export ready-to-post files.",
    primaryCoreActionId: "export-finish",
  },
];

export const STUDIO_ADAPTIVE_TOOL_CATALOG: readonly StudioAdaptiveTool[] = [
  {
    id: "pick-template",
    labelKo: "템플릿 고르기",
    labelEn: "Pick template",
    plainHintKo: "장르별 4컷 구성과 배경을 한 번에 불러와요.",
    plainHintEn: "Load a ready 4-panel layout and backdrop in one click.",
    stages: ["idea", "panel"],
    minMode: "beginner-easy",
    coreBeginnerActionId: "pick-template",
    group: "core",
  },
  {
    id: "place-character",
    labelKo: "캐릭터 놓기",
    labelEn: "Place character",
    plainHintKo: "주인공 자세와 표정을 골라 컷 안에 쏙 올려요.",
    plainHintEn: "Drop a character pose and expression right into the panel.",
    stages: ["draw", "color"],
    minMode: "beginner-easy",
    coreBeginnerActionId: "place-character",
    group: "core",
  },
  {
    id: "write-dialogue",
    labelKo: "대사 쓰기",
    labelEn: "Write dialogue",
    plainHintKo: "말풍선을 눌러 대사만 적으면 크기가 자동 맞춤돼요.",
    plainHintEn: "Type lines into auto-sized speech bubbles.",
    stages: ["idea", "lettering"],
    minMode: "beginner-easy",
    coreBeginnerActionId: "write-dialogue",
    group: "core",
  },
  {
    id: "export-finish",
    labelKo: "완성 내보내기",
    labelEn: "Export & finish",
    plainHintKo: "연재 플랫폼에 바로 올릴 이미지로 깔끔하게 저장해요.",
    plainHintEn: "Save clean vertical images ready to publish.",
    stages: ["publish"],
    minMode: "beginner-easy",
    coreBeginnerActionId: "export-finish",
    group: "core",
  },
  {
    id: "story-beat-cards",
    labelKo: "장면 흐름 카드",
    labelEn: "Story beat cards",
    plainHintKo: "기승전결 순서대로 장면 메모를 카드로 정리해요.",
    plainHintEn: "Organize scene beats in clear story order.",
    stages: ["idea", "panel"],
    minMode: "creator-standard",
    coreBeginnerActionId: null,
    group: "stage-assist",
  },
  {
    id: "auto-panel-rhythm",
    labelKo: "칸 간격 자동 맞춤",
    labelEn: "Auto panel spacing",
    plainHintKo: "모바일 스크롤 속도에 맞게 컷 사이 여백을 정리해요.",
    plainHintEn: "Balance vertical gutters for smooth phone reading.",
    stages: ["panel"],
    minMode: "creator-standard",
    coreBeginnerActionId: null,
    group: "stage-assist",
  },
  {
    id: "one-tap-backdrop",
    labelKo: "배경 한 번에 넣기",
    labelEn: "One-tap backdrop",
    plainHintKo: "학교·도시·판타지 배경을 컷 분위기에 맞게 깔아 줘요.",
    plainHintEn: "Apply matching scene backdrops with one tap.",
    stages: ["panel", "draw", "color"],
    minMode: "creator-standard",
    coreBeginnerActionId: null,
    group: "stage-assist",
  },
  {
    id: "clean-line-stabilizer",
    labelKo: "손떨림 보정 펜",
    labelEn: "Smooth line pen",
    plainHintKo: "마우스나 손가락으로 그려도 매끈한 선으로 정리해요.",
    plainHintEn: "Smooths shaky strokes even on mouse or touch.",
    stages: ["draw"],
    minMode: "creator-standard",
    coreBeginnerActionId: null,
    group: "stage-assist",
  },
  {
    id: "smart-flat-color",
    labelKo: "밑색·그림자 자동 채색",
    labelEn: "Smart auto color",
    plainHintKo: "선 안쪽을 알아서 찾아 기본 색과 그림자를 채워 줘요.",
    plainHintEn: "Fills base colors and soft shadows inside your lines.",
    stages: ["color"],
    minMode: "creator-standard",
    coreBeginnerActionId: null,
    group: "stage-assist",
  },
  {
    id: "bubble-sfx-placer",
    labelKo: "말풍선·효과음 꾸미기",
    labelEn: "Bubble & SFX styler",
    plainHintKo: "외침·속마음 말풍선과 두근 효과음을 골라 붙여요.",
    plainHintEn: "Style whisper, shout bubbles, and action sound effects.",
    stages: ["lettering"],
    minMode: "creator-standard",
    coreBeginnerActionId: null,
    group: "stage-assist",
  },
  {
    id: "vertical-scroll-preview",
    labelKo: "스마트폰 세로 미리보기",
    labelEn: "Mobile scroll preview",
    plainHintKo: "독자 휴대폰 화면에서 글자가 잘 보이는지 바로 확인해요.",
    plainHintEn: "Preview reading flow on a phone-sized viewport.",
    stages: ["publish"],
    minMode: "creator-standard",
    coreBeginnerActionId: null,
    group: "stage-assist",
  },
  {
    id: "pacing-tension-graph",
    labelKo: "회차 몰입도·감정 곡선",
    labelEn: "Episode pacing curve",
    plainHintKo: "독자 이탈 구간과 엔딩 임팩트를 수치로 조율해요.",
    plainHintEn: "Tune cliffhangers and emotional peaks across cuts.",
    stages: ["idea"],
    minMode: "pro-studio",
    coreBeginnerActionId: null,
    group: "pro-control",
  },
  {
    id: "camera-eye-flow-guide",
    labelKo: "시선 유도선·연출 구도",
    labelEn: "Eye-flow & camera grid",
    plainHintKo: "컷 전환 시 독자 시선이 자연스럽게 이어지게 설계해요.",
    plainHintEn: "Guide reader eye flow across dramatic panel transitions.",
    stages: ["panel"],
    minMode: "pro-studio",
    coreBeginnerActionId: null,
    group: "pro-control",
  },
  {
    id: "custom-brush-pressure",
    labelKo: "필압 곡선·브러시 세부 설정",
    labelEn: "Brush pressure curve",
    plainHintKo: "펜 기울기와 필압 반응 곡선을 손맛에 맞게 미세 조정해요.",
    plainHintEn: "Fine-tune pen tilt and pressure response curves.",
    stages: ["draw"],
    minMode: "pro-studio",
    coreBeginnerActionId: null,
    group: "pro-control",
  },
  {
    id: "vector-line-node-edit",
    labelKo: "선 굵기·곡선 정밀 다듬기",
    labelEn: "Line weight & curve edit",
    plainHintKo: "이미 그린 선의 굵기 강약과 곡률을 비파괴로 수정해요.",
    plainHintEn: "Adjust stroke thickness and curve points non-destructively.",
    stages: ["draw"],
    minMode: "pro-studio",
    coreBeginnerActionId: null,
    group: "pro-control",
  },
  {
    id: "blend-mode-tone-stack",
    labelKo: "레이어 합성·스크린톤 조합",
    labelEn: "Layer blend & screentones",
    plainHintKo: "곱하기 그림자, 발광 효과, 스크린톤을 정밀하게 겹쳐요.",
    plainHintEn: "Stack multiply shadows, glow lights, and screentone layers.",
    stages: ["color"],
    minMode: "pro-studio",
    coreBeginnerActionId: null,
    group: "pro-control",
  },
  {
    id: "three-point-lighting-rig",
    labelKo: "입체 조명·원근 눈금선",
    labelEn: "3D lighting & perspective",
    plainHintKo: "주광·역광 방향과 3점 투시 보조선으로 공간감을 살려요.",
    plainHintEn: "Control key/rim lighting and 3-point perspective guides.",
    stages: ["color", "panel"],
    minMode: "pro-studio",
    coreBeginnerActionId: null,
    group: "pro-control",
  },
  {
    id: "multilingual-lettering-flow",
    labelKo: "다국어 대사 자동 맞춤",
    labelEn: "Multilingual lettering reflow",
    plainHintKo: "한·영·일 번역 대사 길이에 맞춰 말풍선 여백을 자동 조정해요.",
    plainHintEn: "Auto-reflow translated Korean, English, and Japanese dialogue.",
    stages: ["lettering"],
    minMode: "pro-studio",
    coreBeginnerActionId: null,
    group: "pro-control",
  },
  {
    id: "print-bleed-preflight",
    labelKo: "플랫폼 규격·인쇄 여백 검수",
    labelEn: "Platform & print preflight",
    plainHintKo: "네이버·카카오 세로 컷 분할 규격과 단행본 재단선을 확인해요.",
    plainHintEn: "Verify webtoon slice specs and print bleed margins.",
    stages: ["publish"],
    minMode: "pro-studio",
    coreBeginnerActionId: null,
    group: "pro-control",
  },
  {
    id: "team-review-macro-deck",
    labelKo: "팀 검수·작업 단축키 묶음",
    labelEn: "Team review & macro deck",
    plainHintKo: "어시스턴트 피드백 핀과 반복 작업 일괄 실행을 연결해요.",
    plainHintEn: "Run batch macros and coordinate assistant review pins.",
    stages: ["publish", "lettering"],
    minMode: "pro-studio",
    coreBeginnerActionId: null,
    group: "pro-control",
  },
];

function makePanel(
  panelIndex: number,
  framingKo: string,
  framingEn: string,
  backgroundPresetKo: string,
  characterPoseKo: string,
  dialogueKo: string,
  sfxKo: string | null,
): StarterPanelItem {
  return {
    panelIndex,
    framingKo,
    framingEn,
    backgroundPresetKo,
    characterPoseKo,
    dialogueKo,
    sfxKo,
    isColored: true,
    lineCleaned: true,
  };
}

export const GENRE_STARTER_KITS: readonly GenreStarterKitDefinition[] = [
  {
    id: "rofan-opening",
    titleKo: "로판 1화 오프닝",
    titleEn: "Rofan Ep.1 Opening",
    taglineKo: "회귀 각성 · 샹들리에 연회장 4컷",
    taglineEn: "Regression awakening · ballroom 4-cut",
    moodPaletteKo: "장미빛 크림 · 달빛 남색",
    toneVariant: "accent",
    backdropKo: "달빛이 비치는 황궁 샹들리에 연회장",
    protagonistPoseKo: "드레스 자락을 쥐고 뒤돌아보는 결연한 표정",
    sampleDialoguesKo: [
      "이번 생만큼은, 내가 먼저 선택하겠어.",
      "아직 연회는 끝나지 않았습니다, 영애.",
      "운명의 시계가 다시 돌기 시작했다.",
    ],
    panels: [
      makePanel(1, "전경 도입 컷", "Establishing wide", "달빛이 비치는 황궁 샹들리에 연회장", "계단 위에서 홀을 내려다보는 실루엣", "운명의 시계가 다시 돌기 시작했다.", "반짝"),
      makePanel(2, "눈빛 클로즈업", "Eyes close-up", "은은한 금빛 보케 배경", "숨을 고르며 눈을 크게 뜨는 회귀 직후 표정", "이번 생만큼은, 내가 먼저 선택하겠어.", "두근"),
      makePanel(3, "상대역 등장 컷", "Co-lead entrance", "아치형 창문과 붉은 커튼", "장갑 낀 손을 내미는 황태자 자세", "아직 연회는 끝나지 않았습니다, 영애.", null),
      makePanel(4, "엔딩 결심 컷", "Resolution beat", "흩날리는 꽃잎과 달빛 계단", "드레스 자락을 쥐고 당당하게 미소 짓는 포즈", "좋아요. 이번 춤은 내가 이끌겠어요.", "스르륵"),
    ],
  },
  {
    id: "modern-hunter-awakening",
    titleKo: "현대 헌터 각성",
    titleEn: "Modern Hunter Awakening",
    taglineKo: "균열 게이트 · 각성 알림창 4컷",
    taglineEn: "Rift gate · awakening alert 4-cut",
    moodPaletteKo: "청록 마력 · 야간 네이비",
    toneVariant: "cool",
    backdropKo: "비 오는 서울 도심 사거리 균열 게이트",
    protagonistPoseKo: "한 손을 뻗어 푸른 마력을 끌어올리는 각성 자세",
    sampleDialoguesKo: [
      "모두 물러서. 이번엔 내가 막는다.",
      "[알림] 숨겨진 등급이 깨어났습니다.",
      "이제부터 진짜 시작이야.",
    ],
    panels: [
      makePanel(1, "위기 전경 컷", "Crisis skyline", "비 오는 서울 도심 사거리 균열 게이트", "빗속에서 하늘 균열을 올려다보는 뒷모습", "경보가 울렸다. 대피할 시간이 없어.", "쿠구구궁"),
      makePanel(2, "대치 미디엄 컷", "Standoff medium", "갈라진 아스팔트와 가로등 불빛", "앞을 가로막으며 자세를 낮추는 방어 포즈", "모두 물러서. 이번엔 내가 막는다.", "척"),
      makePanel(3, "각성 폭발 컷", "Awakening burst", "푸른 에너지 파동과 빗방울 정지", "한 손을 뻗어 푸른 마력을 끌어올리는 각성 자세", "[알림] 숨겨진 등급이 깨어났습니다.", "파지직"),
      makePanel(4, "각성 선언 엔딩", "Declaration finish", "빛나는 상태창과 야경 실루엣", "눈빛이 빛나며 정면을 바라보는 클로즈업", "이제부터 진짜 시작이야.", "웅-"),
    ],
  },
  {
    id: "seoul-campus-romance",
    titleKo: "서울 학원 로맨스",
    titleEn: "Seoul Campus Romance",
    taglineKo: "봄 햇살 캠퍼스 · 우연한 마주침 4컷",
    taglineEn: "Spring campus · chance meeting 4-cut",
    moodPaletteKo: "복숭아 햇살 · 연하늘",
    toneVariant: "good",
    backdropKo: "봄 오후 서울 언덕길 교정과 햇살 창가",
    protagonistPoseKo: "교재 노트를 안고 살짝 미소 짓는 옆모습",
    sampleDialoguesKo: [
      "어? 혹시 아까 강의실에 놓고 간 노트 맞죠?",
      "고마워요, 마침 찾고 있었는데…!",
      "그날 이후로 같은 수업이 기다려졌다.",
    ],
    panels: [
      makePanel(1, "벚꽃 교정 전경", "Campus spring wide", "봄 오후 서울 언덕길 교정과 햇살 창가", "이어폰을 빼며 걸음을 멈추는 자연스러운 자세", "바쁘게 지나가던 평범한 수요일 오후였다.", "살랑"),
      makePanel(2, "노트 건네기 컷", "Handing notebook", "따뜻한 복도 창문 햇살", "교재 노트를 내밀며 환하게 웃는 포즈", "어? 혹시 아까 강의실에 놓고 간 노트 맞죠?", "톡"),
      makePanel(3, "두근 눈맞춤 컷", "Eye contact close-up", "부드러운 빛망울과 바람에 날리는 머리카락", "놀라서 두 손으로 노트를 받아 드는 표정", "고마워요, 마침 찾고 있었는데…!", "두근"),
      makePanel(4, "여운 엔딩 컷", "Warm epilogue", "노을이 물드는 캠퍼스 벤치", "노트를 품에 안고 뒤돌아보는 미소 포즈", "그날 이후로 같은 수업이 기다려졌다.", null),
    ],
  },
  {
    id: "daily-four-cut-gag",
    titleKo: "일상 4컷 개그",
    titleEn: "Daily 4-Cut Comedy",
    taglineKo: "기승전결 공감 · 1분 완성 코믹 4컷",
    taglineEn: "Relatable punchline · quick 4-cut",
    moodPaletteKo: "버터 옐로 · 따뜻한 코랄",
    toneVariant: "warn",
    backdropKo: "따뜻한 원룸 책상과 커피잔이 놓인 아침 창가",
    protagonistPoseKo: "이불을 둘러쓰고 두 팔을 번쩍 든 코믹 포즈",
    sampleDialoguesKo: [
      "오늘부터 아침 6시 기상, 완벽한 하루 시작!",
      "잠깐… 알람을 오후 6시로 맞춰뒀네?",
      "내일의 나에게 맡긴다. 완벽한 계획이야.",
    ],
    panels: [
      makePanel(1, "기: 비장한 다짐", "Setup: bold promise", "따뜻한 원룸 책상과 커피잔이 놓인 아침 창가", "주먹을 불끈 쥐고 의욕이 넘치는 표정", "오늘부터 아침 6시 기상, 완벽한 하루 시작!", "반짝!"),
      makePanel(2, "승: 평온한 숙면", "Build: deep sleep", "햇빛이 쨍하게 들어오는 침대 위", "이불을 목까지 덮고 행복한 표정으로 자는 포즈", "음… 오늘은 유난히 개운하네?", "새근새근"),
      makePanel(3, "전: 충격 확인", "Twist: clock shock", "집중선 코믹 효과 배경", "스마트폰 화면을 보고 얼어붙은 과장 표정", "잠깐… 알람을 오후 6시로 맞춰뒀네?", "덜컹!"),
      makePanel(4, "결: 쿨한 포기", "Punchline: cool surrender", "포근한 파스텔 단색 배경", "이불을 둘러쓰고 엄지를 척 올린 코믹 포즈", "내일의 나에게 맡긴다. 완벽한 계획이야.", "쓱-"),
    ],
  },
  {
    id: "murim-duel",
    titleKo: "무협 결투",
    titleEn: "Martial Arts Duel",
    taglineKo: "대나무 숲 발도 · 긴장감 일섬 4컷",
    taglineEn: "Bamboo grove · single-strike duel 4-cut",
    moodPaletteKo: "먹빛 청녹 · 새벽 안개",
    toneVariant: "cool",
    backdropKo: "새벽 안개가 낮게 깔린 대나무 숲 절벽",
    protagonistPoseKo: "검을 비스듬히 겨누고 중심을 낮춘 발도 자세",
    sampleDialoguesKo: [
      "그 검, 함부로 뽑을 물건이 아닐 텐데.",
      "말은 여기까지다. 합으로 답하지.",
      "바람보다 빠른 첫 수가 허공을 갈랐다.",
    ],
    panels: [
      makePanel(1, "안개 숲 대치", "Misty grove standoff", "새벽 안개가 낮게 깔린 대나무 숲 절벽", "바람에 도포 자락이 날리는 정적 대치 자세", "그 검, 함부로 뽑을 물건이 아닐 텐데.", "쏴아아"),
      makePanel(2, "검자루 클로즈업", "Sword hilt close-up", "날카로운 먹선 집중 배경", "엄지로 검집을 살짝 밀어 올리는 손 자세", "말은 여기까지다. 합으로 답하지.", "찰칵"),
      makePanel(3, "일섬 액션 컷", "Slash impact cut", "대각선 검기 궤적과 갈라지는 댓잎", "검을 비스듬히 겨누고 중심을 낮춘 발도 자세", "바람보다 빠른 첫 수가 허공을 갈랐다.", "서걱!"),
      makePanel(4, "여운 정적 컷", "Still aftermath", "천천히 떨어지는 대나무 잎과 아침 햇빛", "검을 거두며 숨을 고르는 뒷모습", "승부는 이미 첫 수에서 끝났다.", "스윽"),
    ],
  },
  {
    id: "thriller-twist",
    titleKo: "스릴러 반전",
    titleEn: "Thriller Twist",
    taglineKo: "한밤중 복도 · 소름 돋는 메시지 반전 4컷",
    taglineEn: "Midnight hallway · chilling twist 4-cut",
    moodPaletteKo: "깊은 슬레이트 · 경고 앰버",
    toneVariant: "warn",
    backdropKo: "형광등이 깜빡이는 한밤중 아파트 복도",
    protagonistPoseKo: "스마트폰 불빛에 얼굴 반쪽이 비친 긴장된 자세",
    sampleDialoguesKo: [
      "분명 문은 안에서 잠겨 있었어.",
      "[새 메시지] 지금 네 뒤에 서 있는 사람은 누구야?",
      "화면 너머로 낯익은 그림자가 고개를 들었다.",
    ],
    panels: [
      makePanel(1, "복도 원경 컷", "Dim hallway wide", "형광등이 깜빡이는 한밤중 아파트 복도", "복도 끝을 경계하며 걸음을 멈춘 뒷모습", "발소리가 멈췄다. 나 말고 아무도 없을 텐데.", "지직…"),
      makePanel(2, "문고리 클로즈업", "Door lock close-up", "어두운 현관문과 차가운 금속 질감", "떨리는 손으로 잠금장치를 확인하는 포즈", "분명 문은 안에서 잠겨 있었어.", "달칵"),
      makePanel(3, "메시지 점등 컷", "Phone alert glow", "어둠 속 밝게 켜진 휴대폰 화면 반사광", "스마트폰 불빛에 얼굴 반쪽이 비친 긴장된 자세", "[새 메시지] 지금 네 뒤에 서 있는 사람은 누구야?", "징-"),
      makePanel(4, "반전 실루엣 엔딩", "Twist silhouette cliffhanger", "거울과 창문에 비친 이중 그림자", "천천히 고개를 돌리며 숨을 삼키는 컷", "화면 너머로 낯익은 그림자가 고개를 들었다.", "툭"),
    ],
  },
];

export const VOICE_COMMAND_RULES: readonly VoiceCommandRule[] = [
  {
    actionId: "auto-color",
    labelKo: "자동 채색 입히기",
    labelEn: "Apply auto color",
    exampleKo: "채색해 줘",
    exampleEn: "Color it",
    phrases: ["채색해줘", "색칠해줘", "색입혀줘", "자동채색", "colorit", "autocolor", "fillcolors", "colorpanels"],
    keywords: ["채색", "색칠", "밑색", "컬러", "색입", "color", "paint", "fill", "shade"],
  },
  {
    actionId: "insert-background",
    labelKo: "장면 배경 넣기",
    labelEn: "Insert scene backdrop",
    exampleKo: "배경 넣어줘",
    exampleEn: "Add background",
    phrases: ["배경넣어줘", "배경깔아줘", "배경추가", "배경바꿔줘", "addbackground", "insertbackground", "setbackdrop"],
    keywords: ["배경", "풍경", "무대", "배경넣", "background", "backdrop", "scenery"],
  },
  {
    actionId: "undo-last",
    labelKo: "방금 작업 되돌리기",
    labelEn: "Undo last step",
    exampleKo: "되돌려 줘",
    exampleEn: "Undo",
    phrases: ["되돌려줘", "방금전으로", "취소해줘", "실행취소", "돌아가줘", "undo", "goback", "revert"],
    keywords: ["되돌", "취소", "복구", "이전", "돌아", "undo", "revert", "back"],
  },
  {
    actionId: "add-speech-bubble",
    labelKo: "말풍선 대사 추가",
    labelEn: "Add speech bubble",
    exampleKo: "말풍선 추가",
    exampleEn: "Add speech bubble",
    phrases: ["말풍선추가", "말풍선넣어줘", "대사추가", "대사넣어줘", "addspeechbubble", "addbubble", "adddialogue"],
    keywords: ["말풍선", "대사", "식자", "풍선", "bubble", "dialogue", "speech", "caption"],
  },
  {
    actionId: "clean-lineart",
    labelKo: "선 깔끔하게 보정",
    labelEn: "Clean line art",
    exampleKo: "선 깔끔하게",
    exampleEn: "Clean lines",
    phrases: ["선깔끔하게", "선정리해줘", "손떨림보정", "선다듬어줘", "cleanlines", "smoothlineart", "cleanlineart"],
    keywords: ["깔끔", "선정리", "선다듬", "선화", "보정", "clean", "lineart", "smooth", "lines"],
  },
  {
    actionId: "save-project",
    labelKo: "지금 상태 안전 저장",
    labelEn: "Save current work",
    exampleKo: "저장해 줘",
    exampleEn: "Save project",
    phrases: ["저장해줘", "지금저장", "세이브해줘", "보관해줘", "save", "saveproject", "savenow"],
    keywords: ["저장", "세이브", "백업", "보관", "save", "backup"],
  },
  {
    actionId: "place-character",
    labelKo: "주인공 캐릭터 배치",
    labelEn: "Place character",
    exampleKo: "캐릭터 놓아줘",
    exampleEn: "Place character",
    phrases: ["캐릭터놓아줘", "캐릭터넣어줘", "주인공배치", "인물추가", "placecharacter", "addcharacter"],
    keywords: ["캐릭터", "주인공", "인물", "포즈", "character", "hero", "pose"],
  },
  {
    actionId: "split-panel",
    labelKo: "새 컷 칸 추가",
    labelEn: "Add new panel",
    exampleKo: "컷 나눠줘",
    exampleEn: "Split panel",
    phrases: ["컷나눠줘", "칸나눠줘", "컷추가해줘", "프레임추가", "splitpanel", "addpanel", "newcut"],
    keywords: ["컷", "칸", "분할", "프레임", "panel", "split", "frame"],
  },
  {
    actionId: "add-sfx",
    labelKo: "효과음 스티커 넣기",
    labelEn: "Add sound effect",
    exampleKo: "효과음 넣어줘",
    exampleEn: "Add SFX",
    phrases: ["효과음넣어줘", "효과음추가", "두근효과음", "addsfx", "addsoundeffect"],
    keywords: ["효과음", "두근", "의성어", "sfx", "soundeffect"],
  },
  {
    actionId: "export-webtoon",
    labelKo: "연재용 완성 내보내기",
    labelEn: "Export webtoon",
    exampleKo: "완성 내보내기",
    exampleEn: "Export webtoon",
    phrases: ["완성내보내기", "웹툰내보내기", "출간내보내기", "exportwebtoon", "exportfinish", "publishepisode"],
    keywords: ["내보내기", "완성", "출간", "업로드", "export", "publish"],
  },
  {
    actionId: "switch-beginner-mode",
    labelKo: "초보 쉬움 화면으로 전환",
    labelEn: "Switch to beginner mode",
    exampleKo: "초보 모드로 바꿔줘",
    exampleEn: "Beginner mode",
    phrases: ["초보모드", "초보쉬움", "쉽게보여줘", "간단하게보여줘", "beginnermode", "simplemode", "easymode"],
    keywords: ["초보", "쉬움", "간단", "beginner", "easy", "simple"],
  },
  {
    actionId: "switch-pro-mode",
    labelKo: "프로 스튜디오로 1클릭 확장",
    labelEn: "Expand to pro studio",
    exampleKo: "프로 모드로 열어줘",
    exampleEn: "Pro mode",
    phrases: ["프로모드", "전문가모드", "프로스튜디오", "모든도구열어줘", "promode", "prostudio", "fullmode"],
    keywords: ["프로", "전문가", "확장", "pro", "expert", "studio"],
  },
];

export const QUICK_VOICE_COMMAND_PRESETS: readonly {
  readonly actionId: VoiceCommandActionId;
  readonly commandKo: string;
  readonly commandEn: string;
}[] = [
  { actionId: "auto-color", commandKo: "채색해 줘", commandEn: "Color it" },
  { actionId: "insert-background", commandKo: "배경 넣어줘", commandEn: "Add background" },
  { actionId: "add-speech-bubble", commandKo: "말풍선 추가", commandEn: "Add speech bubble" },
  { actionId: "clean-lineart", commandKo: "선 깔끔하게", commandEn: "Clean lines" },
  { actionId: "undo-last", commandKo: "되돌려 줘", commandEn: "Undo" },
  { actionId: "save-project", commandKo: "저장해 줘", commandEn: "Save project" },
];
