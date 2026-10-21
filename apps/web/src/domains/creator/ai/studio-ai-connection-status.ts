/**
 * AI 패널 연결 상태 — 전수 판정 정본 (E1/E2, 2026-10-22).
 *
 * 문제: AI 패널마다 실행 연결이 다르다(사용자 키로 실제 호출 / 기기·브라우저
 * 로컬 실행 / 외부 제공자 연결 전 / 생성 없이 편집·조회만)인데 화면에서
 * 구분할 수 없어, 눌러도 실행되지 않는 패널이 실데이터·실행처럼 보였다.
 *
 * 이 모듈이 단일 기준이다.
 * - `StudioAiConnectionStatusKind`: 화면 배지가 쓰는 5가지 상태.
 * - `STUDIO_AI_PANEL_CONNECTION_REGISTRY`: 사용자 대면 AI 패널 전수의 판정표.
 *   `execution`에는 판정 근거(실제 실행 함수·클라이언트·호스트)를 적는다.
 *   새 AI 패널을 만들면 여기에 먼저 등록하고 배지를 단다.
 *
 * 유료 제공자 실연결(E3)은 이 모듈의 범위가 아니다 — 연결 전인 표면은
 * `not-connected`로 정직하게 표기하고 로컬 폴백만 동작시킨다.
 */

export type StudioAiConnectionStatusKind =
  /** 제공자(BYOK·서버·외부 런타임)가 연결돼 지금 실행할 수 있다. */
  | "provider-ready"
  /** 제공자 실행 경로·호스트는 있으나 키/로그인/런타임이 없어 지금은 실행되지 않는다. */
  | "provider-unconfigured"
  /** 제공자 없이 기기·브라우저 안에서 바로 실행된다(ONNX·결정적 로컬 알고리즘). */
  | "local"
  /** 외부 제공자 계약만 있고 실연결이 없다. 로컬 폴백이 있으면 그쪽만 동작한다. */
  | "not-connected"
  /** 생성을 실행하지 않는 편집·조회·기록 전용 표면. */
  | "editor-only";

export interface StudioAiConnectionStatusMeta {
  readonly kind: StudioAiConnectionStatusKind;
  readonly labelKo: string;
  /** 실행되지 않는 경우 그 사유, 동작하는 경우 실행 위치를 한 줄로. */
  readonly detailKo: string;
}

export const STUDIO_AI_CONNECTION_STATUS_META: Readonly<
  Record<StudioAiConnectionStatusKind, StudioAiConnectionStatusMeta>
> = Object.freeze({
  "provider-ready": Object.freeze({
    kind: "provider-ready",
    labelKo: "실행 가능 · AI 연결됨",
    detailKo: "연결된 AI 제공자로 지금 실행됩니다.",
  }),
  "provider-unconfigured": Object.freeze({
    kind: "provider-unconfigured",
    labelKo: "연결 필요 · 아직 실행 안 됨",
    detailKo: "통합 AI 설정에서 키·모델(또는 로그인/런타임)을 연결하면 실행됩니다. 지금 눌러도 생성되지 않습니다.",
  }),
  local: Object.freeze({
    kind: "local",
    labelKo: "로컬 실행 · 바로 동작",
    detailKo: "외부 AI를 부르지 않고 이 기기·브라우저 안에서 실행됩니다.",
  }),
  "not-connected": Object.freeze({
    kind: "not-connected",
    labelKo: "연결 전 · 외부 AI 미연결",
    detailKo: "외부 AI 제공자가 아직 연결되지 않았습니다. 아래 로컬 폴백만 동작합니다.",
  }),
  "editor-only": Object.freeze({
    kind: "editor-only",
    labelKo: "편집 전용 · 생성 실행 없음",
    detailKo: "자료를 편집·조회하는 표면입니다. 여기서 AI 생성이 실행되지는 않습니다.",
  }),
});

export function studioAiConnectionKindForConfigured(
  configured: boolean,
): StudioAiConnectionStatusKind {
  return configured ? "provider-ready" : "provider-unconfigured";
}

/** 패널의 정적(기본) 연결 형태 — 런타임 `configured`와 조합하기 전의 분류. */
export type StudioAiPanelConnectionBase =
  | "provider"
  | "local"
  | "local-and-optional-provider"
  | "not-connected-with-local-fallback"
  | "editor-only"
  | "shell";

export interface StudioAiPanelConnectionEntry {
  readonly id: string;
  /** 화면에 보이는 패널/표면 이름. */
  readonly surfaceKo: string;
  readonly component: string;
  readonly base: StudioAiPanelConnectionBase;
  /** 판정 근거 — 어떤 실행 함수·클라이언트·호스트와 연결됐는지. */
  readonly execution: string;
  readonly fallbackKo?: string;
}

const E = (
  id: string,
  surfaceKo: string,
  component: string,
  base: StudioAiPanelConnectionBase,
  execution: string,
  fallbackKo?: string,
): StudioAiPanelConnectionEntry =>
  Object.freeze({ id, surfaceKo, component, base, execution, fallbackKo });

/**
 * 전수 판정표 (2026-10-22 코드 실측).
 * `provider`인 패널은 런타임에 configured 여부에 따라 provider-ready /
 * provider-unconfigured 배지로 갈린다 — 실행 버튼도 같은 조건으로 잠긴다.
 */
export const STUDIO_AI_PANEL_CONNECTION_REGISTRY: readonly StudioAiPanelConnectionEntry[] =
  Object.freeze([
    E("colorize", "AI 자동 채색", "StudioAiColorizePanel", "provider",
      "호스트 StudioCuttoonEditorHost.executeAiColorize → studio-ai-client.colorizeLineArt (사용자 이미지 API, BYOK). configured=false면 입력·버튼 비활성 + AiRecoveryNotice(not_configured)"),
    E("onnx-colorize", "기기 채색 (Tag2Pix)", "StudioOnnxColorizePanel", "local",
      "studio-onnx-colorize.colorizeLineArtOnDeviceWithLayers — onnxruntime-web 기기 추론. 실행 버튼에서 동적 import"),
    E("auto-color-hints", "자동 채색 힌트", "StudioAutoColorHintsPanel", "local",
      "studio-auto-color-hints.planStudioAutoColorHints + advanced-fill 적용 브리지 — 로컬 영역 계획/채우기. '계획 전용' 칩 병행 표기"),
    E("colorize-mask", "힌트 채색 마스크 (Colorize Mask)", "StudioColorizeMaskPanel", "local",
      "순수 컨트롤 패널 — 굽기는 상위 호스트가 studio-colorize-mask.applyStudioColorizeMask(로컬 전파)로 실행"),
    E("color-hint-studio", "AI 채색 힌트 스튜디오", "ai-assist/AiColorHintStudio", "local",
      "ai-assist/ai-color-hint-engine 로컬 엔진. AiAssistDock 부제에 '전부 무료·기기 동작' 명시"),
    E("background", "AI 배경 생성", "StudioAiBackgroundPanel", "provider",
      "프레젠테이션 전용 — 실행은 부모(StudioPage)가 studio-ai-client 이미지 생성으로 수행. configured=false면 생성 버튼 비활성 + not_configured 고지"),
    E("character-consistency", "AI 캐릭터 일관성 생성", "StudioAiCharacterConsistencyPanel", "provider",
      "프레젠테이션 전용 — 부모가 studio-ai-client.generateConsistentCharacterImage(참고 이미지+프롬프트) 호출. configured/hasReference 없으면 비활성"),
    E("composition-suggestion", "장면 구성 제안 (콘티→그림 보조)", "StudioAiCompositionPanel", "provider",
      "자기완결 패널이 studio-ai-client.suggestSceneComposition을 직접 호출. configured=false면 실행 버튼 비활성 + not_configured 고지. 그림 생성은 하지 않는 텍스트 제안임을 하단에 명시"),
    E("dialogue-suggest", "대사 제안", "StudioDialogueSuggestPanel", "provider",
      "호스트가 studio-ai-client.suggestDialogueLines 호출. configured=false면 비활성 + not_configured 고지"),
    E("palette-suggest", "색상 팔레트 추천", "StudioPaletteSuggestPanel", "provider",
      "호스트가 studio-ai-client.suggestColorPalette 호출. configured=false면 비활성 + not_configured 고지"),
    E("dialogue-translate", "대사 번역·식자 보조", "StudioDialogueTranslatePanel", "provider",
      "호스트가 studio-ai-client 번역(BYOK) 호출. configured=false면 비활성 + not_configured 고지"),
    E("anime-style", "애니풍 변환", "StudioOnnxAnimeStylePanel", "local-and-optional-provider",
      "기기 경로: studio-onnx-anime-style.convertToAnimeStyleOnDevice(AnimeGANv2 ONNX, 로컬). 클라우드 경로: studio-ai-client.convertImageToAnimeStyle(BYOK) — cloudConfigured=false면 그 버튼만 비활성"),
    E("stroke-proposal", "스마트 획 보정 제안", "StudioStrokeProposalReviewPanel / StudioConnectedStrokeProposalPanel", "local",
      "studio-stroke-proposal 로컬 선 보정 알고리즘. 패널 문구로 '생성형 AI가 아닌 기기 내 알고리즘'을 이미 명시"),
    E("stroke-studio", "AI 획 보조 스튜디오", "ai-assist/AiStrokeStudio", "local",
      "ai-assist/ai-stroke-assist 로컬 보조"),
    E("perspective-studio", "AI 원근 스튜디오", "ai-assist/AiPerspectiveStudio", "local",
      "ai-assist/ai-perspective-grid 로컬 그리드 생성"),
    E("balloon-studio", "AI 말풍선 스튜디오", "ai-assist/AiBalloonStudio", "local",
      "ai-assist/ai-balloon-placement + 로컬 폰트 — 로컬 배치"),
    E("light-guide", "빛 가이드", "ai-assist/AiLightGuidePanel", "local",
      "ai-color-hint-engine 기반 로컬 가이드 표시 (채색 힌트 스튜디오 하위)"),
    E("3d-generation", "AI 3D 생성", "StudioAi3dGenerationPanel", "provider",
      "studio-3d-generation-client.Studio3dGenerationHttpClient 잡 제출/조회. StudioAdvancedAiTools가 Hyper3D/Rodin 개인 키+로그인이 없으면 client=null로 패널 대신 not_configured/login_required 고지를 렌더"),
    E("lora-training", "캐릭터·화풍 학습 (LoRA)", "StudioAiLoraTrainingPanel", "provider",
      "studio-lora-fal.submitStudioLoraTraining/generateStudioLoraImage (fal.ai BYOK). isStudioFalConfigured=false면 전체 비활성 + 캐릭터 일관성 폴백 안내",
      "키가 없으면 참조 이미지 방식(캐릭터 일관성 패널)이 폴백"),
    E("photo-character", "사진→캐릭터 마법사", "canon/StudioPhotoCharacterWizard", "provider",
      "studio-ai-client.generateConsistentCharacterImage(BYOK). configured=false면 생성 단계 고지 + 원본 사진을 참조로 보관하는 폴백",
      "키가 없으면 원본 사진을 캐릭터 참조로 그대로 보관"),
    E("creative-director", "AI 크리에이티브 디렉터", "AiCreativeDirectorPanel", "provider",
      "studio-server-ai-client(서버 무료 AI) 또는 개인 무료 키. DirectorStatusBadge로 server/personal/unavailable을 이미 표기하고, 불가 시 예시를 지어내지 않고 도구 안내로 폴백"),
    E("comic-director", "AI 코믹 디렉터", "StudioAiComicDirectorPanel", "provider",
      "studio-ai-comic-director-api 세션/잡 API + studio-ai-client 생성 경로. 세션 서버 연결이 실행 전제"),
    E("personal-runtime", "개인/클라우드 추론 런타임", "PersonalRuntimeWorkspace", "provider",
      "personal-inference-client가 사용자가 등록한 Creator Runtime(baseUrl+토큰)에 fetch. capabilities.engines[mode].configured로 '런타임 연결됨/연결 필요'를 이미 표기"),
    E("super-suite", "AI 슈퍼 스위트 (화풍·연출 레시피)", "StudioAiSuperSuiteModal", "local",
      "studio-ai-emotion-bubble-matcher(결정적 로컬)·prompt-enhancer·shading-assist·storyboard-director 로컬 모듈만 사용 — 모델 호출 없음. 런치패드에 '로컬 초안 작성 가능' 표기"),
    E("episode-production", "회차 제작 게이트웨이/모달", "StudioAiEpisodeProductionModal", "local",
      "studio-ai-episode-production-director가 '모델을 호출하지 않는 결정적 preflight 계약'임을 모듈 문서가 명시. 실제 이미지 생성은 별도 제공자 패널 몫"),
    E("toon-automation", "툰 자동화 워크스페이스/제작 보드", "StudioToonAutomationWorkspace / StudioToonProductionBoard", "editor-only",
      "studio-toon-automation 문서 편집 + studio-scenario-candidate-workflow 로컬 후보 흐름. 음성 제공자(gemini/elevenlabs 등)는 문서 설정값일 뿐 이 화면에서 제공자를 호출하지 않음"),
    E("assist-hub", "AI 어시스트 허브 (셸)", "StudioAiAssistHub", "shell",
      "실행 셸 — 상단 연결 스트립(connectionLabel/connectionOk)과 studio-ai-execution-preflight가 하위 도구별 configured 상태를 이미 표기. 실제 실행은 각 도구 패널 항목 참조"),
    E("production-launchpad", "제작 흐름 런치패드", "StudioAiProductionLaunchpad", "shell",
      "실행 셸 — 카드마다 textConfigured/imageConfigured에서 파생한 상태 문구('텍스트 AI 연결 필요' 등)를 표기"),
    E("advanced-tools", "고급 공동 창작·3D (셸)", "StudioAdvancedAiTools", "shell",
      "획 제안(로컬)과 3D 생성(제공자)을 탭으로 묶은 셸 — 상태는 각 하위 항목 참조"),
    E("tool-popover", "AI 도구 팝오버 (셸)", "StudioAiToolPopoverBody", "shell",
      "isStudioAiConfigured로 하위 도구를 디스패치하는 컨테이너 — 상태는 각 도구 패널 항목 참조"),
    E("assist-dock", "AI 드로잉 어시스턴트 독 (셸)", "ai-assist/AiAssistDock", "shell",
      "로컬 ai-assist 스튜디오들의 컨테이너 — 부제에 '전부 무료로 동작' 명시"),
    E("provenance", "비공개 AI 작업 이력", "StudioAiProvenancePanel", "editor-only",
      "studio-ai-provenance 기록 조회·삭제 전용. 생성 실행 없음"),
    E("image-reference-pack", "AI 이미지 참조 팩 편집기", "StudioAiImageReferencePackEditor", "editor-only",
      "참조 이미지 역할 편집 전용 — 모듈 문서가 '제공자 업로드는 통합 레이어 몫'임을 명시. 생성 실행 없음"),
    E("character-canon", "캐릭터 캐논 관리", "canon/StudioCharacterCanonManager 등", "editor-only",
      "useStudioCharacterCanon 로컬 라이브러리(IDB) 편집·선택. 생성은 사진→캐릭터 마법사 항목 참조"),
    E("composition-brief", "구도 → AI 이미지 생성 브리프", "StudioCompositionGenerationBriefPanel", "not-connected-with-local-fallback",
      "studio-composition-generation-brief.buildCompositionGenerationBrief(결정적 로컬 조립)까지만. 생성 잡을 호출하는 제공자 코드가 없음 — onRequestGeneration 주입이 없으면 '연결 전' 표기 (E2). 주의: 2026-10-22 실측에서 이 패널을 마운트한 제품 호스트가 아직 없음(포저/bg3d 스냅샷 배선은 후속) — 패널 자체의 상태 표기·폴백은 테스트로 검증됨",
      "브리프 복사(외부 도구·협업 전달) + 캡처 그대로 컷 삽입(onInsertCaptureFallback)"),
    E("story-seed", "스토리 씨앗 빌더", "planning/StudioStorySeedBuilder", "not-connected-with-local-fallback",
      "기본 제공자는 planning/studio-story-seed.localStorySeedProvider(결정적 로컬). StorySeedProvider 계약(kind:'ai')을 구현한 외부 제공자는 레포에 없음 — 외부 AI는 연결 전 (E2)",
      "로컬 결정적 제안이 기본값으로 실제 동작 — 장르 키트 조합, 같은 입력=같은 초안, 실패 시에도 '기본 제안으로 만들기' 폴백 버튼 제공"),
  ]);

export function studioAiPanelConnectionEntry(
  id: string,
): StudioAiPanelConnectionEntry | undefined {
  return STUDIO_AI_PANEL_CONNECTION_REGISTRY.find((entry) => entry.id === id);
}
