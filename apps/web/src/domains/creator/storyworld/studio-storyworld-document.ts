/**
 * 스토리월드 문서 읽기: 검증 + 버전 정규화.
 *
 * 랩 화면이 들고 있던 JSON 검증을 그대로 옮기고, 개연성 점검용 선택 필드(회차 번호, 질문지 답,
 * 원고 출처, 나이·연도)를 더했다. 새 필드는 전부 선택이라 1판 문서도 그대로 유효하다.
 * 읽는 순간 2판으로 정규화하며(1판 → 2판은 필드를 추가하지 않고 버전 표시만 올린다),
 * 데이터베이스 마이그레이션은 하지 않는다.
 *
 * 문자열 길이는 오류로 거절하지 않고 잘라서 받는다. 손으로 고친 파일 하나 때문에 작품 전체를
 * 못 여는 일을 피하기 위해서다. 구조가 틀린 값(타입 불일치)은 위치를 알려 거절한다.
 */
import {
  STUDIO_STORYWORLD_LEGACY_SCHEMA_VERSION,
  STUDIO_STORYWORLD_SCHEMA_VERSION,
  type StoryworldProject,
} from "./studio-storyworld-causality";

export const STORYWORLD_DOCUMENT_MAX_TEXT_LENGTH = 1_000_000;
export const STORYWORLD_DOCUMENT_LIMITS = Object.freeze({
  characters: 64,
  facts: 512,
  scenes: 256,
});

const ROLE_VALUES = ["decision", "resolution", "flashback"] as const;
const QUESTION_VALUES = ["roles", "motive", "cause", "information", "coincidence", "consequence"] as const;
const ANSWER_STATE_VALUES = ["answered", "not-applicable", "unknown", "skipped"] as const;
const MOTIVE_BASIS_VALUES = ["goal", "event", "emotion", "unknown"] as const;
const CLUE_VALUES = ["foreshadowed", "none", "unknown"] as const;
const BOUNDARY_VALUES = ["start", "scene-number", "separator", "blank-lines", "heading", "manual"] as const;

const MAX_EXCERPT_LENGTH = 480;
const MAX_NOTE_LENGTH = 500;
const MAX_MARKER_LENGTH = 120;
const MAX_TIME_CUES = 8;
const MAX_TIME_CUE_LENGTH = 40;
const MAX_MOTIVES = 24;
const MAX_STATED_AGES = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Array.isArray는 unknown을 any[]로 좁혀서 원소가 any가 된다. 원소를 unknown으로 두려고 따로 둔 좁히기 함수. */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path}는 비어 있지 않은 문자열이어야 합니다.`);
  }
}

function assertFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}는 유한한 숫자여야 합니다.`);
  }
}

function assertOptionalStringArray(record: Record<string, unknown>, key: string, path: string): void {
  const value = record[key];
  if (value === undefined) return;
  if (!isUnknownArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${path}.${key}는 문자열 배열이어야 합니다.`);
  }
}

function assertOptionalRecordArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  validate: (item: Record<string, unknown>, itemPath: string) => void,
): void {
  const value = record[key];
  if (value === undefined) return;
  if (!isUnknownArray(value)) throw new Error(`${path}.${key}는 배열이어야 합니다.`);
  value.forEach((item, index) => {
    if (!isRecord(item)) throw new Error(`${path}.${key}[${index}]는 객체여야 합니다.`);
    validate(item, `${path}.${key}[${index}]`);
  });
}

function assertOptionalFiniteNumber(record: Record<string, unknown>, key: string, path: string): void {
  if (record[key] !== undefined) assertFiniteNumber(record[key], `${path}.${key}`);
}

function assertOptionalInteger(record: Record<string, unknown>, key: string, path: string): void {
  const value = record[key];
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${path}.${key}는 정수여야 합니다.`);
  }
}

function assertOptionalString(record: Record<string, unknown>, key: string, path: string): void {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    throw new Error(`${path}.${key}는 문자열이어야 합니다.`);
  }
}

function assertOneOf(value: unknown, allowed: readonly string[], path: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${path}가 지원되지 않습니다.`);
  }
}

function assertStoryworldCharacter(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  assertString(value.id, `${path}.id`);
  assertString(value.name, `${path}.name`);
  assertOptionalString(value, "goal", path);
  assertOptionalString(value, "description", path);
  assertOptionalStringArray(value, "aliases", path);
  assertOptionalStringArray(value, "tags", path);
  assertOptionalStringArray(value, "initialFactIds", path);
  assertOptionalStringArray(value, "secretFactIds", path);
  assertOptionalInteger(value, "birthYear", path);
  if (value.motion !== undefined) {
    if (!isRecord(value.motion)) throw new Error(`${path}.motion은 객체여야 합니다.`);
    for (const key of ["reveal", "emphasis", "expressionNotes", "voiceNote"]) {
      assertOptionalString(value.motion, key, `${path}.motion`);
    }
  }
}

function assertStoryworldFact(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  assertString(value.id, `${path}.id`);
  assertString(value.label, `${path}.label`);
  assertString(value.subjectId, `${path}.subjectId`);
  assertString(value.key, `${path}.key`);
  assertOptionalString(value, "description", path);
  assertOptionalFiniteNumber(value, "intendedReaderRevealOrder", path);
  assertOptionalStringArray(value, "tags", path);
}

function assertScenePlausibility(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  if (value.roles !== undefined) {
    if (!isUnknownArray(value.roles)) throw new Error(`${path}.roles는 배열이어야 합니다.`);
    value.roles.forEach((role, index) => assertOneOf(role, ROLE_VALUES, `${path}.roles[${index}]`));
  }
  if (value.answers !== undefined) {
    if (!isRecord(value.answers)) throw new Error(`${path}.answers는 객체여야 합니다.`);
    for (const [question, state] of Object.entries(value.answers)) {
      assertOneOf(question, QUESTION_VALUES, `${path}.answers의 질문 이름`);
      assertOneOf(state, ANSWER_STATE_VALUES, `${path}.answers.${question}`);
    }
  }
  assertOptionalRecordArray(value, "motives", path, (item, itemPath) => {
    assertString(item.characterId, `${itemPath}.characterId`);
    assertOneOf(item.basis, MOTIVE_BASIS_VALUES, `${itemPath}.basis`);
    assertOptionalString(item, "causeSceneId", itemPath);
    assertOptionalString(item, "note", itemPath);
  });
  if (value.coincidence !== undefined) {
    if (!isRecord(value.coincidence)) throw new Error(`${path}.coincidence는 객체여야 합니다.`);
    assertOneOf(value.coincidence.clue, CLUE_VALUES, `${path}.coincidence.clue`);
    assertOptionalStringArray(value.coincidence, "clueSceneIds", `${path}.coincidence`);
  }
}

function assertSceneSource(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  if (typeof value.excerpt !== "string") throw new Error(`${path}.excerpt는 문자열이어야 합니다.`);
  assertOneOf(value.boundary, BOUNDARY_VALUES, `${path}.boundary`);
  assertOptionalString(value, "marker", path);
  assertOptionalString(value, "copy", path);
  assertOptionalInteger(value, "start", path);
  assertOptionalInteger(value, "end", path);
  assertOptionalStringArray(value, "timeCues", path);
}

function assertStoryworldScene(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`${path}는 객체여야 합니다.`);
  assertString(value.id, `${path}.id`);
  assertString(value.title, `${path}.title`);
  assertOptionalString(value, "description", path);
  assertOptionalString(value, "locationId", path);
  assertFiniteNumber(value.order, `${path}.order`);
  assertOptionalFiniteNumber(value, "timeIndex", path);
  assertOptionalStringArray(value, "participantIds", path);
  assertOptionalStringArray(value, "dependsOnSceneIds", path);
  assertOptionalStringArray(value, "setupIds", path);
  assertOptionalStringArray(value, "payoffIds", path);
  assertOptionalStringArray(value, "motifIds", path);
  assertOptionalInteger(value, "storyYear", path);
  if (value.episodeNumber !== undefined) {
    if (typeof value.episodeNumber !== "number" || !Number.isSafeInteger(value.episodeNumber) || value.episodeNumber < 1) {
      throw new Error(`${path}.episodeNumber는 1 이상의 정수여야 합니다.`);
    }
  }

  assertOptionalRecordArray(value, "preconditions", path, (item, itemPath) => {
    assertString(item.factId, `${itemPath}.factId`);
    if (item.comparator !== undefined && ![
      "exists", "not-exists", "equals", "not-equals", "greater-than", "less-than",
    ].includes(String(item.comparator))) {
      throw new Error(`${itemPath}.comparator가 지원되지 않습니다.`);
    }
  });
  assertOptionalRecordArray(value, "effects", path, (item, itemPath) => {
    assertString(item.factId, `${itemPath}.factId`);
    if (!["set", "delete", "increment", "decrement"].includes(String(item.op))) {
      throw new Error(`${itemPath}.op가 지원되지 않습니다.`);
    }
  });
  assertOptionalRecordArray(value, "knowledgeUses", path, (item, itemPath) => {
    assertString(item.characterId, `${itemPath}.characterId`);
    assertString(item.factId, `${itemPath}.factId`);
  });
  assertOptionalRecordArray(value, "reveals", path, (item, itemPath) => {
    assertString(item.factId, `${itemPath}.factId`);
    if (!isUnknownArray(item.audiences) || item.audiences.some((audience) =>
      typeof audience !== "string" || audience.length === 0
    )) {
      throw new Error(`${itemPath}.audiences는 문자열 배열이어야 합니다.`);
    }
  });
  assertOptionalRecordArray(value, "emotionalBeats", path, (item, itemPath) => {
    assertString(item.characterId, `${itemPath}.characterId`);
    assertFiniteNumber(item.valence, `${itemPath}.valence`);
    assertFiniteNumber(item.arousal, `${itemPath}.arousal`);
  });
  assertOptionalRecordArray(value, "localization", path, (item, itemPath) => {
    assertString(item.locale, `${itemPath}.locale`);
    assertFiniteNumber(item.sourceCharacters, `${itemPath}.sourceCharacters`);
    assertFiniteNumber(item.translatedCharacters, `${itemPath}.translatedCharacters`);
    assertFiniteNumber(item.balloonCapacityCharacters, `${itemPath}.balloonCapacityCharacters`);
  });
  assertOptionalRecordArray(value, "assets", path, (item, itemPath) => {
    assertString(item.assetId, `${itemPath}.assetId`);
    assertString(item.label, `${itemPath}.label`);
    if (!["cleared", "restricted", "unknown", "expired"].includes(String(item.licenseStatus))) {
      throw new Error(`${itemPath}.licenseStatus가 지원되지 않습니다.`);
    }
  });
  assertOptionalRecordArray(value, "statedAges", path, (item, itemPath) => {
    assertString(item.characterId, `${itemPath}.characterId`);
    const age = item.age;
    assertFiniteNumber(age, `${itemPath}.age`);
    if (age < 0) throw new Error(`${itemPath}.age는 0 이상이어야 합니다.`);
  });
  if (value.production !== undefined) {
    if (!isRecord(value.production)) throw new Error(`${path}.production은 객체여야 합니다.`);
    for (const key of [
      "drawingMinutes", "letteringMinutes", "renderMinutes", "reviewMinutes", "uniqueAssetCount", "complexity",
    ]) {
      assertOptionalFiniteNumber(value.production, key, `${path}.production`);
    }
    assertOptionalStringArray(value.production, "assigneeIds", `${path}.production`);
  }
  if (value.accessibility !== undefined && !isRecord(value.accessibility)) {
    throw new Error(`${path}.accessibility는 객체여야 합니다.`);
  }
  if (value.plausibility !== undefined) assertScenePlausibility(value.plausibility, `${path}.plausibility`);
  if (value.source !== undefined) assertSceneSource(value.source, `${path}.source`);
}

function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("");
}

function uniqueStrings(values: readonly unknown[], maxItems: number, maxLength: number): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const cleaned = clip(value.trim(), maxLength);
    if (cleaned) seen.add(cleaned);
    if (seen.size >= maxItems) break;
  }
  return [...seen];
}

function cleanPlausibility(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (isUnknownArray(value.roles)) {
    const roles = uniqueStrings(value.roles, ROLE_VALUES.length, 20);
    next.roles = ROLE_VALUES.filter((role) => roles.includes(role));
  }
  if (isRecord(value.answers)) {
    const answers: Record<string, unknown> = {};
    for (const question of QUESTION_VALUES) {
      const state = value.answers[question];
      if (typeof state === "string" && (ANSWER_STATE_VALUES as readonly string[]).includes(state)) {
        answers[question] = state;
      }
    }
    next.answers = answers;
  }
  if (isUnknownArray(value.motives)) {
    next.motives = value.motives.filter(isRecord).slice(0, MAX_MOTIVES).map((motive) => ({
      characterId: motive.characterId,
      basis: motive.basis,
      ...(typeof motive.causeSceneId === "string" && motive.causeSceneId ? { causeSceneId: motive.causeSceneId } : {}),
      ...(typeof motive.note === "string" && motive.note.trim() ? { note: clip(motive.note.trim(), MAX_NOTE_LENGTH) } : {}),
    }));
  }
  if (isRecord(value.coincidence)) {
    const clueSceneIds = isUnknownArray(value.coincidence.clueSceneIds)
      ? uniqueStrings(value.coincidence.clueSceneIds, 12, 120)
      : [];
    next.coincidence = {
      clue: value.coincidence.clue,
      ...(clueSceneIds.length > 0 ? { clueSceneIds } : {}),
    };
  }
  return next;
}

function cleanSource(value: Record<string, unknown>): Record<string, unknown> {
  const timeCues = isUnknownArray(value.timeCues)
    ? uniqueStrings(value.timeCues, MAX_TIME_CUES, MAX_TIME_CUE_LENGTH)
    : [];
  return {
    excerpt: clip(typeof value.excerpt === "string" ? value.excerpt : "", MAX_EXCERPT_LENGTH),
    boundary: value.boundary,
    ...(typeof value.marker === "string" && value.marker.trim() ? { marker: clip(value.marker.trim(), MAX_MARKER_LENGTH) } : {}),
    ...(typeof value.copy === "string" && value.copy.trim() ? { copy: clip(value.copy.trim(), MAX_MARKER_LENGTH) } : {}),
    ...(typeof value.start === "number" ? { start: value.start } : {}),
    ...(typeof value.end === "number" ? { end: value.end } : {}),
    ...(timeCues.length > 0 ? { timeCues } : {}),
  };
}

function cleanScene(scene: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...scene };
  if (isRecord(scene.plausibility)) next.plausibility = cleanPlausibility(scene.plausibility);
  if (isRecord(scene.source)) next.source = cleanSource(scene.source);
  if (isUnknownArray(scene.statedAges)) next.statedAges = scene.statedAges.slice(0, MAX_STATED_AGES);
  return next;
}

/**
 * 파싱된 값을 검증하고 2판으로 정규화한다. 구조가 틀리면 어느 필드인지 알려 주는 오류를 던진다.
 * 1판 문서는 새 필드를 더하지 않고 `schemaVersion`만 올려 돌려준다.
 */
export function normalizeStoryworldProject(value: unknown): StoryworldProject {
  if (!isRecord(value)) throw new Error("최상위 값은 객체여야 합니다.");
  if (
    value.schemaVersion !== STUDIO_STORYWORLD_SCHEMA_VERSION
    && value.schemaVersion !== STUDIO_STORYWORLD_LEGACY_SCHEMA_VERSION
  ) {
    throw new Error(`schemaVersion은 ${STUDIO_STORYWORLD_LEGACY_SCHEMA_VERSION} 또는 ${STUDIO_STORYWORLD_SCHEMA_VERSION}이어야 합니다.`);
  }
  assertString(value.id, "project.id");
  assertString(value.title, "project.title");
  if (!isUnknownArray(value.characters) || !isUnknownArray(value.facts) || !isUnknownArray(value.scenes)) {
    throw new Error("characters, facts, scenes는 배열이어야 합니다.");
  }
  if (
    value.characters.length > STORYWORLD_DOCUMENT_LIMITS.characters
    || value.facts.length > STORYWORLD_DOCUMENT_LIMITS.facts
    || value.scenes.length > STORYWORLD_DOCUMENT_LIMITS.scenes
  ) {
    throw new Error("로컬 분석 한도는 인물 64명, 사실 512개, 장면 256개입니다.");
  }
  value.characters.forEach((item, index) => assertStoryworldCharacter(item, `characters[${index}]`));
  value.facts.forEach((item, index) => assertStoryworldFact(item, `facts[${index}]`));
  value.scenes.forEach((item, index) => assertStoryworldScene(item, `scenes[${index}]`));
  if (value.setupContracts !== undefined) {
    if (!isUnknownArray(value.setupContracts)) throw new Error("setupContracts는 배열이어야 합니다.");
    value.setupContracts.forEach((item, index) => {
      const path = `setupContracts[${index}]`;
      if (!isRecord(item)) throw new Error(`${path}는 객체여야 합니다.`);
      assertString(item.id, `${path}.id`);
      assertString(item.label, `${path}.label`);
      assertOptionalFiniteNumber(item, "payoffDueByOrder", path);
      assertOptionalFiniteNumber(item, "requiredPayoffCount", path);
    });
  }
  if (value.motifs !== undefined) {
    if (!isUnknownArray(value.motifs)) throw new Error("motifs는 배열이어야 합니다.");
    value.motifs.forEach((item, index) => {
      const path = `motifs[${index}]`;
      if (!isRecord(item)) throw new Error(`${path}는 객체여야 합니다.`);
      assertString(item.id, `${path}.id`);
      assertString(item.label, `${path}.label`);
      assertOptionalFiniteNumber(item, "minOccurrences", path);
      assertOptionalFiniteNumber(item, "maxGapScenes", path);
    });
  }
  assertOptionalFiniteNumber(value, "productionCapacityMinutes", "project");
  const scenes = value.scenes.filter(isRecord).map(cleanScene);
  return { ...value, schemaVersion: STUDIO_STORYWORLD_SCHEMA_VERSION, scenes } as unknown as StoryworldProject;
}

/** JSON 문자열을 읽어 스토리월드 문서로 돌려준다. 1MB 초과·구조 오류는 오류로 거절한다. */
export function parseStoryworldProject(text: string): StoryworldProject {
  if (text.length > STORYWORLD_DOCUMENT_MAX_TEXT_LENGTH) throw new Error("스토리월드 JSON은 1MB 이하여야 합니다.");
  const value: unknown = JSON.parse(text);
  return normalizeStoryworldProject(value);
}

/**
 * 불러오기 오류를 작가 언어로 바꿉니다. 내부 검사 문구(필드 이름·형식 이름)는
 * 화면에 그대로 내보내지 않고, 무엇이 문제인지와 다음에 할 일을 함께 전합니다.
 */
export function friendlyStoryworldFileError(caught: unknown): string {
  const raw = caught instanceof Error ? caught.message : "";
  if (raw.includes("1MB")) {
    return "설정 파일이 너무 큽니다(1MB 초과). 파일을 나누거나 불필요한 내용을 줄인 뒤 다시 불러와 주세요.";
  }
  if (raw.includes("schemaVersion")) {
    return "이 화면에서 저장한 설정 파일이 아닌 것 같습니다. '설정 파일로 저장'으로 받은 파일을 골랐는지 확인한 뒤 다시 불러와 주세요.";
  }
  // 한도 초과는 파일이 망가진 것이 아니다. 아래 일반 안내(손상 확인)로 떨어지지 않게 한도와 할 일을 알린다.
  if (raw.includes("로컬 분석 한도")) {
    const { characters, facts, scenes } = STORYWORLD_DOCUMENT_LIMITS;
    return `한 번에 점검할 수 있는 크기를 넘었습니다. 인물 ${characters}명, 사실 ${facts}개, 장면 ${scenes}개까지 불러올 수 있습니다. 항목을 줄이거나 작품을 나눈 뒤 다시 불러와 주세요.`;
  }
  if (/characters|facts|scenes|setupContracts|motifs/.test(raw)) {
    return "설정 파일에서 인물·사실·장면 중 빠졌거나 형식이 다른 항목이 있습니다. 원본 파일을 열어 빠진 항목을 채운 뒤 다시 불러와 주세요.";
  }
  return "설정 파일을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인하고, 이 화면에서 저장한 설정 파일을 골라 다시 불러와 주세요.";
}
