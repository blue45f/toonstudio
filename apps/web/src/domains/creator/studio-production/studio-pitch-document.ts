/**
 * 기획서(피치 문서) 모델.
 *
 * 로그라인·시놉시스·주요 캐릭터·연재 계획을 구조화해 저장하고, 기존 PPTX
 * 내보내기(StudioPitchPptxCard)가 먹는 슬라이드 목록으로 결정적으로 변환한다.
 * 슬라이드 ID가 고정이라 "슬라이드로 반영"을 다시 눌러도 중복이 생기지 않고,
 * 사용자가 직접 추가한 자유 슬라이드는 건드리지 않는다.
 *
 * 길이 상한은 워크스페이스 슬라이드 파서(제목 240자·본문 4,000자) 안에
 * 항상 들어가도록 잡았다: 캐릭터 슬라이드 최악의 경우도
 * 8행 × (이름 80 + 역할 80 + 설명 300 + 구분자) ≈ 3,730자 < 4,000자.
 */

export const PITCH_LOGLINE_MAX_LENGTH = 300;
export const PITCH_SYNOPSIS_MAX_LENGTH = 4_000;
export const PITCH_CHARACTER_NAME_MAX_LENGTH = 80;
export const PITCH_CHARACTER_ROLE_MAX_LENGTH = 80;
export const PITCH_CHARACTER_DESCRIPTION_MAX_LENGTH = 300;
export const PITCH_MAX_CHARACTERS = 8;
export const PITCH_PLAN_CADENCE_MAX_LENGTH = 120;
export const PITCH_PLAN_EPISODE_COUNT_MAX_LENGTH = 120;
export const PITCH_PLAN_OUTLINE_MAX_LENGTH = 2_000;

const PITCH_CHARACTER_ID_MAX_LENGTH = 160;
const SLIDE_BODY_MAX_LENGTH = 4_000;

export interface ProductionPitchCharacter {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly description: string;
}

export interface ProductionPitchSerializationPlan {
  readonly cadence: string;
  readonly episodeCount: string;
  readonly outline: string;
}

export interface ProductionPitchDocument {
  readonly logline: string;
  readonly synopsis: string;
  readonly characters: readonly ProductionPitchCharacter[];
  readonly serializationPlan: ProductionPitchSerializationPlan;
}

export interface PitchSlideLike {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export const PITCH_SLIDE_IDS = {
  logline: "pitch-logline",
  synopsis: "pitch-synopsis",
  characters: "pitch-characters",
  serializationPlan: "pitch-serialization-plan",
} as const;

const PITCH_SLIDE_ID_SET: ReadonlySet<string> = new Set(Object.values(PITCH_SLIDE_IDS));

export const PITCH_SECTION_LABELS = {
  logline: "로그라인",
  synopsis: "시놉시스",
  characters: "주요 캐릭터",
  serializationPlan: "연재 계획",
} as const;

export type PitchSectionKey = keyof typeof PITCH_SECTION_LABELS;

export function createEmptyPitchDocument(): ProductionPitchDocument {
  return {
    logline: "",
    synopsis: "",
    characters: [],
    serializationPlan: { cadence: "", episodeCount: "", outline: "" },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 워크스페이스 런타임의 safeIdentity와 같은 규칙을 이 모듈 안에서 재현한다. */
function safePitchCharacterId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed !== value || trimmed.length > PITCH_CHARACTER_ID_MAX_LENGTH) return null;
  if (trimmed === "." || trimmed === ".." || trimmed.includes("\\")) return null;
  for (let index = 0; index < trimmed.length; index += 1) {
    const code = trimmed.charCodeAt(index);
    if (code <= 31 || code === 127) return null;
  }
  return trimmed;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > maxLength) return null;
  return value.trim();
}

function requiredText(value: unknown, maxLength: number): string | null {
  const text = boundedText(value, maxLength);
  return text !== null && text.length > 0 ? text : null;
}

function parsePitchCharacter(value: unknown): ProductionPitchCharacter | null {
  if (!isRecord(value)) return null;
  const id = safePitchCharacterId(value.id);
  const name = requiredText(value.name, PITCH_CHARACTER_NAME_MAX_LENGTH);
  const role = boundedText(value.role, PITCH_CHARACTER_ROLE_MAX_LENGTH);
  const description = boundedText(value.description, PITCH_CHARACTER_DESCRIPTION_MAX_LENGTH);
  if (!id || !name || role === null || description === null) return null;
  return { id, name, role, description };
}

/**
 * 저장된 기획서를 검증해 정규화한다. 형식이 깨졌으면 데이터를 조용히
 * 버리지 않고 null을 돌려주어 호출자(워크스페이스 파서)가 거부하게 한다.
 */
export function parsePitchDocument(value: unknown): ProductionPitchDocument | null {
  if (!isRecord(value)) return null;
  const logline = boundedText(value.logline, PITCH_LOGLINE_MAX_LENGTH);
  const synopsis = boundedText(value.synopsis, PITCH_SYNOPSIS_MAX_LENGTH);
  if (logline === null || synopsis === null) return null;

  const rawCharacters = value.characters === undefined ? [] : value.characters;
  if (!Array.isArray(rawCharacters) || rawCharacters.length > PITCH_MAX_CHARACTERS) return null;
  const characters = rawCharacters.map(parsePitchCharacter);
  if (characters.some((character) => character === null)) return null;

  const rawPlan = value.serializationPlan === undefined ? {} : value.serializationPlan;
  if (!isRecord(rawPlan)) return null;
  const cadence = boundedText(rawPlan.cadence, PITCH_PLAN_CADENCE_MAX_LENGTH);
  const episodeCount = boundedText(rawPlan.episodeCount, PITCH_PLAN_EPISODE_COUNT_MAX_LENGTH);
  const outline = boundedText(rawPlan.outline, PITCH_PLAN_OUTLINE_MAX_LENGTH);
  if (cadence === null || episodeCount === null || outline === null) return null;

  return {
    logline,
    synopsis,
    characters: characters as ProductionPitchCharacter[],
    serializationPlan: { cadence, episodeCount, outline },
  };
}

export function pitchDocumentHasContent(document: ProductionPitchDocument): boolean {
  return (
    document.logline.trim().length > 0
    || document.synopsis.trim().length > 0
    || document.characters.some((character) => character.name.trim().length > 0)
    || document.serializationPlan.cadence.trim().length > 0
    || document.serializationPlan.episodeCount.trim().length > 0
    || document.serializationPlan.outline.trim().length > 0
  );
}

export function pitchDocumentCompletion(document: ProductionPitchDocument): {
  readonly filledCount: number;
  readonly totalCount: number;
  readonly missingSections: readonly string[];
} {
  const filled: Record<PitchSectionKey, boolean> = {
    logline: document.logline.trim().length > 0,
    synopsis: document.synopsis.trim().length > 0,
    characters: document.characters.some((character) => character.name.trim().length > 0),
    serializationPlan:
      document.serializationPlan.cadence.trim().length > 0
      || document.serializationPlan.episodeCount.trim().length > 0
      || document.serializationPlan.outline.trim().length > 0,
  };
  const keys = Object.keys(PITCH_SECTION_LABELS) as PitchSectionKey[];
  const missingSections = keys
    .filter((key) => !filled[key])
    .map((key) => PITCH_SECTION_LABELS[key]);
  return {
    filledCount: keys.length - missingSections.length,
    totalCount: keys.length,
    missingSections,
  };
}

function formatPitchCharacterLine(character: ProductionPitchCharacter): string {
  const name = character.name.trim();
  const role = character.role.trim();
  const description = character.description.trim();
  const head = role ? `${name} (${role})` : name;
  return description ? `${head} — ${description}` : head;
}

function formatPitchPlanBody(plan: ProductionPitchSerializationPlan): string {
  const lines: string[] = [];
  if (plan.cadence.trim()) lines.push(`연재 주기: ${plan.cadence.trim()}`);
  if (plan.episodeCount.trim()) lines.push(`목표 회차: ${plan.episodeCount.trim()}`);
  if (plan.outline.trim()) lines.push(plan.outline.trim());
  return lines.join("\n");
}

/** 기획서를 PPTX 슬라이드로 변환한다. 비어 있는 섹션은 슬라이드를 만들지 않는다. */
export function pitchDocumentSlides(document: ProductionPitchDocument): readonly PitchSlideLike[] {
  const slides: PitchSlideLike[] = [];
  if (document.logline.trim()) {
    slides.push({ id: PITCH_SLIDE_IDS.logline, title: PITCH_SECTION_LABELS.logline, body: document.logline.trim() });
  }
  if (document.synopsis.trim()) {
    slides.push({ id: PITCH_SLIDE_IDS.synopsis, title: PITCH_SECTION_LABELS.synopsis, body: document.synopsis.trim() });
  }
  const namedCharacters = document.characters.filter((character) => character.name.trim().length > 0);
  if (namedCharacters.length > 0) {
    const body = namedCharacters.map(formatPitchCharacterLine).join("\n").slice(0, SLIDE_BODY_MAX_LENGTH);
    slides.push({ id: PITCH_SLIDE_IDS.characters, title: PITCH_SECTION_LABELS.characters, body });
  }
  const planBody = formatPitchPlanBody(document.serializationPlan);
  if (planBody) {
    slides.push({ id: PITCH_SLIDE_IDS.serializationPlan, title: PITCH_SECTION_LABELS.serializationPlan, body: planBody });
  }
  return slides;
}

/**
 * 기존 슬라이드 목록에 기획서 슬라이드를 반영한다. 기획서가 소유한
 * 슬라이드(pitch-* ID)는 최신 내용으로 교체해 맨 앞에 두고, 사용자가
 * 직접 만든 슬라이드는 순서 그대로 뒤에 남긴다. 반복 호출해도 결과가 같다.
 */
export function applyPitchDocumentToSlides<T extends PitchSlideLike>(
  current: readonly T[],
  document: ProductionPitchDocument,
): readonly (PitchSlideLike | T)[] {
  const generated = pitchDocumentSlides(document);
  const manual = current.filter((slide) => !PITCH_SLIDE_ID_SET.has(slide.id));
  return [...generated, ...manual];
}

function parsePitchCharacterLine(line: string, index: number): ProductionPitchCharacter | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const separatorIndex = trimmed.indexOf(" — ");
  const head = separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed;
  const description = separatorIndex >= 0 ? trimmed.slice(separatorIndex + 3).trim() : "";
  const roleMatch = /^(.*?)\s*\(([^()]*)\)$/.exec(head);
  const name = (roleMatch ? roleMatch[1]! : head).trim().slice(0, PITCH_CHARACTER_NAME_MAX_LENGTH);
  if (!name) return null;
  return {
    // 이름에 어떤 문자가 있어도 워크스페이스 ID 규칙을 깨지 않도록 순서 기반 ID를 쓴다.
    id: `pitch-character-restored-${index + 1}`,
    name,
    role: (roleMatch ? roleMatch[2]! : "").trim().slice(0, PITCH_CHARACTER_ROLE_MAX_LENGTH),
    description: description.slice(0, PITCH_CHARACTER_DESCRIPTION_MAX_LENGTH),
  };
}

function parsePitchPlanBody(body: string): ProductionPitchSerializationPlan {
  let cadence = "";
  let episodeCount = "";
  const outlineLines: string[] = [];
  for (const line of body.split("\n")) {
    if (line.startsWith("연재 주기:")) cadence = line.slice("연재 주기:".length).trim();
    else if (line.startsWith("목표 회차:")) episodeCount = line.slice("목표 회차:".length).trim();
    else outlineLines.push(line);
  }
  return {
    cadence: cadence.slice(0, PITCH_PLAN_CADENCE_MAX_LENGTH),
    episodeCount: episodeCount.slice(0, PITCH_PLAN_EPISODE_COUNT_MAX_LENGTH),
    outline: outlineLines.join("\n").trim().slice(0, PITCH_PLAN_OUTLINE_MAX_LENGTH),
  };
}

/**
 * 기획서 필드가 아직 없는 기존 워크스페이스(슬라이드만 있는 경우)를 위해
 * pitch-* 슬라이드에서 기획서를 복원한다. 자유 슬라이드는 무시한다.
 */
export function pitchDocumentFromSlides(slides: readonly PitchSlideLike[]): ProductionPitchDocument {
  const byId = new Map(slides.map((slide) => [slide.id, slide]));
  const characters: ProductionPitchCharacter[] = [];
  const characterSlide = byId.get(PITCH_SLIDE_IDS.characters);
  if (characterSlide) {
    for (const line of characterSlide.body.split("\n")) {
      const character = parsePitchCharacterLine(line, characters.length);
      if (!character) continue;
      characters.push(character);
      if (characters.length >= PITCH_MAX_CHARACTERS) break;
    }
  }
  const planSlide = byId.get(PITCH_SLIDE_IDS.serializationPlan);
  return {
    logline: byId.get(PITCH_SLIDE_IDS.logline)?.body.trim().slice(0, PITCH_LOGLINE_MAX_LENGTH) ?? "",
    synopsis: byId.get(PITCH_SLIDE_IDS.synopsis)?.body.trim().slice(0, PITCH_SYNOPSIS_MAX_LENGTH) ?? "",
    characters,
    serializationPlan: planSlide
      ? parsePitchPlanBody(planSlide.body)
      : { cadence: "", episodeCount: "", outline: "" },
  };
}
