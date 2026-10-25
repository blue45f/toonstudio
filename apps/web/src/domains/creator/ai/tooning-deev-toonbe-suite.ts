/**
 * Deev (DV) AI Character Chat & Lorebook + ToonBe (TB) Webtoon/Novel Platform Engine
 *
 * Grounded in REA static/runtime analysis of https://plus.tooning.io/:
 * - Deev (`DV`):
 *   - 6-Step Character Creation Wizard (`Profile`, `Settings`, `First`, `Media`, `Lorebook`, `Register`)
 *   - 4 Character Templates (`Basic`, `RolePlay`, `Simulation`, `Custom`) & 7 Prompt Categories (`RolePlay`, `Status`, `Relationship`, `Progress`, `Skill`, `Simulation`, `Free`)
 *   - Keyword-triggered Lorebook (max 50 entries, max 20 keywords/entry, 800 chars)
 *   - Chat Room: 17 `ShChatMode` modes, 6 `TextVerbosity` levels, 4-section Long-Term Memory (`Information`, `Character`, `Event`, `Etc`), User Personas (max 10), `Chat` vs `Novel` view modes, and 5-preset in-chat image regeneration (`expression`, `pose`, `background`, `outfit`, `closer`)
 * - ToonBe (`TB`):
 *   - 3-Step Work Upsert (`Thumbnail`, `Profile`, `Register`), 10 `TbUserWorkType` creator credit roles, bidirectional Work ↔ AI Character linking
 *   - Webtoon Manuscript Validator (`image/jpeg`, `MAX_WIDTH = 700`, `5MB`/file, `50MB`/episode, `WebtoonImageValidationError`)
 *   - Novel Episode Editor (`15,000` char limit + inline illustrations)
 *   - Webtoon Viewer (scroll position restore) & Novel Viewer (`scroll`/`tap`, 4 fonts `SansSerif`/`Serif`/`Pretendard`/`Nanum`, 4 font sizes `SS`/`SM`/`MB`/`BB`)
 */

export type DvCharacterWizardStep =
  | "Profile"
  | "Settings"
  | "First"
  | "Media"
  | "Lorebook"
  | "Register";

export const DV_CHARACTER_WIZARD_STEPS: readonly {
  readonly step: DvCharacterWizardStep;
  readonly stepNumber: number;
  readonly labelKo: string;
}[] = [
  { step: "Profile", stepNumber: 1, labelKo: "1. 프로필 & 썸네일" },
  { step: "Settings", stepNumber: 2, labelKo: "2. 세계관 & 프롬프트 설정" },
  { step: "First", stepNumber: 3, labelKo: "3. 첫 상황 & 첫 대사" },
  { step: "Media", stepNumber: 4, labelKo: "4. 상황별 트리거 미디어" },
  { step: "Lorebook", stepNumber: 5, labelKo: "5. 키워드 로어북" },
  { step: "Register", stepNumber: 6, labelKo: "6. 공개 범위 & 작품 연동" },
] as const;

export type DvCharacterTemplateType = "Basic" | "RolePlay" | "Simulation" | "Custom";

export type ShCharacterPromptType =
  | "RolePlay"
  | "Status"
  | "Relationship"
  | "Progress"
  | "Skill"
  | "Simulation"
  | "Free";

export const DV_PROMPT_TEMPLATE_CATEGORIES: readonly {
  readonly type: ShCharacterPromptType;
  readonly labelKo: string;
  readonly snippetKo: string;
}[] = [
  { type: "RolePlay", labelKo: "롤플레이 규칙", snippetKo: "캐릭터의 말투와 시대적 고증을 유지하며 1인칭 시점으로 반응한다." },
  { type: "Status", labelKo: "상태창 표시", snippetKo: "[현재 위치 / 시간대 / 호감도(0~100) / 감정 상태]를 응답 하단에 표시한다." },
  { type: "Relationship", labelKo: "관계도 변화", snippetKo: "대화와 사건에 따라 경계 → 신뢰 → 연대 단계로 태도가 변화한다." },
  { type: "Progress", labelKo: "사건 진행률", snippetKo: "메인 퀘스트 달성률(%)과 남은 단서 수를 추적한다." },
  { type: "Skill", labelKo: "스킬·능력 시스템", snippetKo: "보유 마력량과 고유 스킬 발동 조건을 판정한다." },
  { type: "Simulation", labelKo: "다중 인물 시뮬레이션", snippetKo: "상황에 따라 주변 NPC의 대사와 반응을 함께 묘사한다." },
  { type: "Free", labelKo: "자유 지시문", snippetKo: "작가가 정의한 커스텀 연출 지침을 우선 적용한다." },
] as const;

export type ShChatMode =
  | "Creative"
  | "Quick"
  | "Smart"
  | "Pro"
  | "Fast"
  | "Balance"
  | "Smart2"
  | "Pro2"
  | "GrokFast"
  | "GrokPro"
  | "DeepSeek"
  | "ClaudeHaiku"
  | "ClaudeSonnet"
  | "ClaudeSonnet4_6"
  | "GptFast"
  | "GptPro"
  | "SolarPro";

export const DV_CHAT_MODES: readonly {
  readonly mode: ShChatMode;
  readonly labelKo: string;
  readonly providerGroup: string;
}[] = [
  { mode: "ClaudeSonnet4_6", labelKo: "Claude Sonnet 4.6 (서사 특화)", providerGroup: "Anthropic" },
  { mode: "ClaudeSonnet", labelKo: "Claude Sonnet (감정선 정밀)", providerGroup: "Anthropic" },
  { mode: "ClaudeHaiku", labelKo: "Claude Haiku (초고속 응답)", providerGroup: "Anthropic" },
  { mode: "GptPro", labelKo: "GPT Pro (고난도 추론)", providerGroup: "OpenAI" },
  { mode: "GptFast", labelKo: "GPT Fast (경량 대화)", providerGroup: "OpenAI" },
  { mode: "Smart2", labelKo: "Gemini Smart 2 (장문 기억)", providerGroup: "Google" },
  { mode: "Pro2", labelKo: "Gemini Pro 2 (복합 세계관)", providerGroup: "Google" },
  { mode: "GrokPro", labelKo: "Grok Pro (창의 롤플레이)", providerGroup: "xAI" },
  { mode: "GrokFast", labelKo: "Grok Fast (빠른 티키타카)", providerGroup: "xAI" },
  { mode: "DeepSeek", labelKo: "DeepSeek R1/V3 (논리 시뮬레이션)", providerGroup: "DeepSeek" },
  { mode: "SolarPro", labelKo: "Upstage Solar Pro (한국어 특화)", providerGroup: "Upstage" },
  { mode: "Creative", labelKo: "Creative (창작 스토리)", providerGroup: "Tooning" },
  { mode: "Balance", labelKo: "Balance (밸런스 표준)", providerGroup: "Tooning" },
  { mode: "Smart", labelKo: "Smart (상황 분석)", providerGroup: "Tooning" },
  { mode: "Pro", labelKo: "Pro (고품질 연출)", providerGroup: "Tooning" },
  { mode: "Quick", labelKo: "Quick (즉각 반응)", providerGroup: "Tooning" },
  { mode: "Fast", labelKo: "Fast (무료 경량)", providerGroup: "Tooning" },
] as const;

export type DvTextVerbosity = "Auto" | "Low" | "Medium" | "High" | "Max" | "Ultra";

export type DvChatRoomViewMode = "Chat" | "Novel";

export type DvMemorySectionType = "Information" | "Character" | "Event" | "Etc";

export type DvInChatImageRegenPreset =
  | "expression"
  | "pose"
  | "background"
  | "outfit"
  | "closer";

export const DV_IN_CHAT_IMAGE_REGEN_PRESETS: readonly {
  readonly preset: DvInChatImageRegenPreset;
  readonly labelKo: string;
  readonly promptModifier: string;
}[] = [
  { preset: "expression", labelKo: "표정 변화", promptModifier: "focus on dynamic facial expression shift matching current dialogue" },
  { preset: "pose", labelKo: "포즈 변경", promptModifier: "change character body posture and hand gesture naturally" },
  { preset: "background", labelKo: "배경 전환", promptModifier: "update environment lighting and scene background to match current location" },
  { preset: "outfit", labelKo: "의상 디테일", promptModifier: "highlight character outfit texture and styling details" },
  { preset: "closer", labelKo: "클로즈업 샷", promptModifier: "move camera closer to dramatic extreme close-up framing" },
] as const;

export interface DvLorebookEntry {
  readonly entryId: string;
  readonly title: string;
  readonly keywords: readonly string[]; // max 20 keywords, 30 chars each
  readonly content: string; // max 800 chars
  readonly enabled: boolean;
}

export const DV_LOREBOOK_LIMITS = {
  maxEntries: 50,
  maxKeywordsPerEntry: 20,
  maxKeywordLength: 30,
  maxContentLength: 800,
} as const;

/**
 * Matches user/character chat message against active Lorebook entries and returns triggered lore context.
 */
export function matchDvLorebookEntriesForMessage(
  messageText: string,
  entries: readonly DvLorebookEntry[],
): readonly DvLorebookEntry[] {
  const normalizedMsg = messageText.toLowerCase();
  return entries.filter((entry) => {
    if (!entry.enabled) return false;
    return entry.keywords.some((kw) => {
      const trimmed = kw.trim().toLowerCase();
      return trimmed.length > 0 && normalizedMsg.includes(trimmed);
    });
  });
}

export interface DvMediaTriggerAsset {
  readonly code: string; // alphanumeric + underscore, max 30 chars
  readonly folderPath: readonly string[]; // max 3 depth
  readonly descriptionKo: string;
}

export function validateDvMediaTriggerCode(code: string, folderPath: readonly string[] = []): {
  readonly valid: boolean;
  readonly reasonKo?: string;
} {
  if (!/^[A-Za-z0-9_]{1,30}$/u.test(code)) {
    return {
      valid: false,
      reasonKo: "미디어 트리거 코드는 영문·숫자·밑줄(_) 조합 1~30자만 허용됩니다.",
    };
  }
  if (folderPath.length > 3) {
    return {
      valid: false,
      reasonKo: "미디어 폴더 트리는 최대 3단계 깊이까지만 생성할 수 있습니다.",
    };
  }
  return { valid: true };
}

export interface DvLongTermMemoryChunk {
  readonly chunkId: string;
  readonly section: DvMemorySectionType;
  readonly summaryText: string;
}

/**
 * Generates an in-chat character illustration prompt using 1 of the 5 Deev regeneration presets.
 */
export function buildDvInChatImageRegenPrompt(params: {
  readonly characterName: string;
  readonly dialogueLine: string;
  readonly preset: DvInChatImageRegenPreset;
}): string {
  const spec =
    DV_IN_CHAT_IMAGE_REGEN_PRESETS.find((p) => p.preset === params.preset) ??
    DV_IN_CHAT_IMAGE_REGEN_PRESETS[0]!;
  return `[Deev In-Chat Image · ${params.characterName} · ${spec.labelKo}] ${spec.promptModifier} — "${params.dialogueLine.trim()}"`;
}

// ============================================================================
// ToonBe (TB) Webtoon & Novel Platform Engine
// ============================================================================

export type TbUserWorkRoleType =
  | "StoryWriter"
  | "ScriptWriter"
  | "Illustrator"
  | "BackgroundArtist"
  | "Colorist"
  | "Assistant"
  | "Adapter"
  | "Producer"
  | "Main"
  | "Sub";

export const TB_CREATOR_CREDIT_ROLES: readonly {
  readonly role: TbUserWorkRoleType;
  readonly labelKo: string;
}[] = [
  { role: "StoryWriter", labelKo: "글 작가 (StoryWriter)" },
  { role: "ScriptWriter", labelKo: "콘티·각색 작가 (ScriptWriter)" },
  { role: "Illustrator", labelKo: "그림 작가 (Illustrator)" },
  { role: "BackgroundArtist", labelKo: "배경 작가 (BackgroundArtist)" },
  { role: "Colorist", labelKo: "채색 작가 (Colorist)" },
  { role: "Assistant", labelKo: "어시스턴트 (Assistant)" },
  { role: "Adapter", labelKo: "원작 각색 (Adapter)" },
  { role: "Producer", labelKo: "프로듀서·PD (Producer)" },
  { role: "Main", labelKo: "대표 작가 (Main)" },
  { role: "Sub", labelKo: "공동 작가 (Sub)" },
] as const;

export type TbWebtoonImageValidationError =
  | "InvalidExtension"
  | "WidthExceeded"
  | "SingleSizeExceeded"
  | "TotalSizeExceeded";

export const TB_WEBTOON_MANUSCRIPT_LIMITS = {
  MAX_WIDTH_PX: 700,
  MAX_SINGLE_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
  MAX_TOTAL_SIZE_BYTES: 50 * 1024 * 1024, // 50 MB
  ALLOWED_MIME: "image/jpeg",
} as const;

export const TB_NOVEL_MAX_CHARS = 15000;

export interface TbWebtoonManuscriptFileCandidate {
  readonly fileName: string;
  readonly mimeType: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly sizeBytes: number;
}

export interface TbWebtoonValidationReport {
  readonly valid: boolean;
  readonly errors: readonly {
    readonly fileName: string;
    readonly errorType: TbWebtoonImageValidationError;
    readonly messageKo: string;
  }[];
  readonly totalSizeBytes: number;
  readonly validFileCount: number;
}

/**
 * Validates webtoon episode manuscript images against exact ToonBe (`TB`) upload constraints:
 * - JPEG only (`image/jpeg` and `.jpg`/`.jpeg`)
 * - Max width `700px` (`WidthExceeded`)
 * - Max single file size `5MB` (`SingleSizeExceeded`)
 * - Max episode total size `50MB` (`TotalSizeExceeded`)
 */
export function validateTbWebtoonEpisodeManuscripts(
  files: readonly TbWebtoonManuscriptFileCandidate[],
): TbWebtoonValidationReport {
  const errors: {
    readonly fileName: string;
    readonly errorType: TbWebtoonImageValidationError;
    readonly messageKo: string;
  }[] = [];

  let totalSizeBytes = 0;

  for (const file of files) {
    totalSizeBytes += file.sizeBytes;
    const isJpegExt = /\.(?:jpe?g)$/iu.test(file.fileName);
    if (file.mimeType !== TB_WEBTOON_MANUSCRIPT_LIMITS.ALLOWED_MIME || !isJpegExt) {
      errors.push({
        fileName: file.fileName,
        errorType: "InvalidExtension",
        messageKo: `${file.fileName}: JPG/JPEG 형식만 업로드할 수 있습니다.`,
      });
    }
    if (file.widthPx > TB_WEBTOON_MANUSCRIPT_LIMITS.MAX_WIDTH_PX) {
      errors.push({
        fileName: file.fileName,
        errorType: "WidthExceeded",
        messageKo: `${file.fileName}: 가로 크기(${file.widthPx}px)가 최대 허용 폭(700px)을 초과했습니다.`,
      });
    }
    if (file.sizeBytes > TB_WEBTOON_MANUSCRIPT_LIMITS.MAX_SINGLE_SIZE_BYTES) {
      errors.push({
        fileName: file.fileName,
        errorType: "SingleSizeExceeded",
        messageKo: `${file.fileName}: 개별 파일 용량이 5MB를 초과했습니다.`,
      });
    }
  }

  if (totalSizeBytes > TB_WEBTOON_MANUSCRIPT_LIMITS.MAX_TOTAL_SIZE_BYTES) {
    errors.push({
      fileName: "episode-total",
      errorType: "TotalSizeExceeded",
      messageKo: `회차 전체 원고 용량이 최대 한도(50MB)를 초과했습니다.`,
    });
  }

  return {
    valid: errors.length === 0 && files.length > 0,
    errors,
    totalSizeBytes,
    validFileCount: errors.length === 0 ? files.length : Math.max(0, files.length - errors.length),
  };
}

export type TbNovelViewerMode = "scroll" | "tap";
export type TbNovelFontFamily = "SansSerif" | "Serif" | "Pretendard" | "Nanum";
export type TbNovelFontSizeCode = "SS" | "SM" | "MB" | "BB";

export const TB_NOVEL_VIEWER_FONT_SIZES: Readonly<Record<TbNovelFontSizeCode, number>> = {
  SS: 14,
  SM: 16,
  MB: 18,
  BB: 21,
};

export interface TbWorkCharacterLinkBinding {
  readonly workId: string;
  readonly workTitle: string;
  readonly workType: "Webtoon" | "Novel";
  readonly linkedCharacterIds: readonly string[];
  readonly creatorCredits: readonly {
    readonly creatorName: string;
    readonly role: TbUserWorkRoleType;
  }[];
}

export function validateTbNovelEpisodeContent(text: string): {
  readonly valid: boolean;
  readonly charCount: number;
  readonly maxChars: 15000;
  readonly inlineImageCount: number;
  readonly reasonKo?: string;
} {
  const charCount = text.length;
  const inlineImageCount = Array.from(text.matchAll(/!\[[^\]]*\]\([^)]+\)/gu)).length;
  if (charCount === 0) {
    return {
      valid: false,
      charCount: 0,
      maxChars: TB_NOVEL_MAX_CHARS,
      inlineImageCount: 0,
      reasonKo: "웹소설 본문을 1자 이상 입력해 주세요.",
    };
  }
  if (charCount > TB_NOVEL_MAX_CHARS) {
    return {
      valid: false,
      charCount,
      maxChars: TB_NOVEL_MAX_CHARS,
      inlineImageCount,
      reasonKo: `웹소설 회차 본문은 최대 ${TB_NOVEL_MAX_CHARS.toLocaleString()}자까지 등록할 수 있습니다.`,
    };
  }
  return {
    valid: true,
    charCount,
    maxChars: TB_NOVEL_MAX_CHARS,
    inlineImageCount,
  };
}
