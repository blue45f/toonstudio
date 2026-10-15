import {
  EMPTY_STUDIO_TRANSLATION_CARD_SET,
  parseStudioTranslationCharacterCardSet,
  type StudioTranslationCharacterCardSet,
} from "./lettering/studio-translation-character-card";
import {
  evaluateStudioLocalizationQa,
  isStudioLocalizationStatus,
  isStudioLocalizationUnitKind,
  summarizeStudioLocalization,
  type StudioLocalizationUnit,
} from "./studio-localization-workflow";
import type { StudioProjectDiagnosticLocalization } from "./studio-project-diagnostics";

export const STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT =
  "toonspectrum:studio:localization-project-updated";

export interface StudioLocalizationProjectDocument {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly units: readonly StudioLocalizationUnit[];
  /**
   * 번역 인물 카드(호칭·존대·말투·금지어/고정어)와 대사별 화자 지정. **선택 필드**라 이 필드가 없던 기존 문서도
   * 그대로 유효하다. 카드 스키마는 자체 `schemaVersion` 을 갖고 있어 문서 버전(1)을 올리지 않는다 —
   * 올리면 이전 빌드가 문서 전체를 못 읽어 번역 작업(units)을 잃은 것처럼 보인다.
   */
  readonly characterCards?: StudioTranslationCharacterCardSet;
  readonly updatedAt: string;
}

export interface StudioLocalizationProjectStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function validProjectId(value: string): boolean {
  return value.trim() === value && value.length > 0 && value !== "." && value !== ".." && !value.includes("\\");
}

function storageKey(projectId: string): string {
  if (!validProjectId(projectId)) throw new Error("A valid project id is required.");
  return `toonstudio:localization-project:v1:${encodeURIComponent(projectId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUnit(value: unknown): StudioLocalizationUnit | null {
  if (!isRecord(value)
    || typeof value.id !== "string" || !value.id.trim()
    || typeof value.sourceLocale !== "string"
    || typeof value.targetLocale !== "string"
    || !isStudioLocalizationUnitKind(value.kind)
    || typeof value.sourceText !== "string" || !value.sourceText.trim()
    || typeof value.translatedText !== "string"
    || !isStudioLocalizationStatus(value.status)
    || !Array.isArray(value.glossary)
    || typeof value.sourceRemoved !== "boolean"
    || typeof value.backgroundRestored !== "boolean"
    || typeof value.letteringApplied !== "boolean"
    || typeof value.readingOrderAssigned !== "boolean"
    || typeof value.fontAvailable !== "boolean"
    || typeof value.updatedAt !== "string"
    || !Number.isFinite(Date.parse(value.updatedAt))) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as StudioLocalizationUnit;
}

export function parseStudioLocalizationProjectDocument(
  value: unknown,
  expectedProjectId?: string,
): StudioLocalizationProjectDocument | null {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.projectId !== "string"
    || !validProjectId(value.projectId)
    || (expectedProjectId !== undefined && value.projectId !== expectedProjectId)
    || !Array.isArray(value.units)
    || typeof value.updatedAt !== "string"
    || !Number.isFinite(Date.parse(value.updatedAt))) {
    return null;
  }
  const units = value.units.map(parseUnit);
  if (units.some((unit) => unit === null)) return null;
  const ids = units.map((unit) => unit!.id);
  if (new Set(ids).size !== ids.length) return null;
  // 카드가 읽히지 않으면(알 수 없는 버전·깨진 값) 카드만 버린다 — 번역 작업(units)은 지키는 쪽이 낫다.
  const characterCards =
    value.characterCards === undefined
      ? null
      : parseStudioTranslationCharacterCardSet(value.characterCards);
  return Object.freeze({
    schemaVersion: 1,
    projectId: value.projectId,
    units: Object.freeze(units as StudioLocalizationUnit[]),
    ...(characterCards === null ? {} : { characterCards }),
    updatedAt: value.updatedAt,
  });
}

export function readStudioLocalizationProject(
  storage: StudioLocalizationProjectStorage,
  projectId: string,
): StudioLocalizationProjectDocument {
  const raw = storage.getItem(storageKey(projectId));
  if (raw) {
    try {
      const parsed = parseStudioLocalizationProjectDocument(JSON.parse(raw) as unknown, projectId);
      if (parsed) return parsed;
    } catch {
      // Fall through to a safe empty project; corrupt data never enters the workflow.
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    projectId,
    units: Object.freeze([]),
    updatedAt: new Date(0).toISOString(),
  });
}

/**
 * 문서를 저장한다. `characterCards` 를 싣지 않은 문서(예: 번역 단위만 다루는 현지화 패널)는 **저장된 카드를
 * 지우지 않고 그대로 보존한다** — 카드를 모르는 호출부가 번역 단위를 저장할 때마다 인물 카드가 사라지는
 * 일을 막는 계약이다. 카드를 비우려면 빈 집합을 명시해서 넘긴다.
 */
export function writeStudioLocalizationProject(
  storage: StudioLocalizationProjectStorage,
  document: StudioLocalizationProjectDocument,
  target?: Pick<EventTarget, "dispatchEvent">,
): StudioLocalizationProjectDocument {
  let parsed = parseStudioLocalizationProjectDocument(document, document.projectId);
  if (!parsed) throw new Error("A valid localization project document is required.");
  if (parsed.characterCards === undefined) {
    // 카드를 싣지 않은 호출부가 번역 단위만 저장해도 저장된 카드는 그대로 둔다.
    const preserved = readStudioLocalizationProject(storage, parsed.projectId).characterCards;
    if (preserved !== undefined) parsed = Object.freeze({ ...parsed, characterCards: preserved });
  }
  storage.setItem(storageKey(parsed.projectId), JSON.stringify(parsed));
  target?.dispatchEvent(new CustomEvent(STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT, { detail: parsed }));
  return parsed;
}

/** 저장된 인물 카드 집합. 문서나 카드가 없으면 빈 집합이다. */
export function readStudioLocalizationCharacterCards(
  storage: StudioLocalizationProjectStorage,
  projectId: string,
): StudioTranslationCharacterCardSet {
  return readStudioLocalizationProject(storage, projectId).characterCards ?? EMPTY_STUDIO_TRANSLATION_CARD_SET;
}

/**
 * 인물 카드를 읽고-고치고-쓰는 한 번의 동기 갱신. 번역 단위(units)는 그대로 둔다.
 * 갱신 함수가 같은 참조를 돌려주면(변경 없음) 저장하지 않고 현재 문서를 돌려준다.
 */
export function updateStudioLocalizationCharacterCards(
  storage: StudioLocalizationProjectStorage,
  projectId: string,
  updater: (current: StudioTranslationCharacterCardSet) => StudioTranslationCharacterCardSet,
  target?: Pick<EventTarget, "dispatchEvent">,
): StudioLocalizationProjectDocument {
  const current = readStudioLocalizationProject(storage, projectId);
  const before = current.characterCards ?? EMPTY_STUDIO_TRANSLATION_CARD_SET;
  const after = updater(before);
  if (after === before) return current;
  // 갱신 함수의 결과도 파서를 한 번 거친다 — 상한·정리 규칙이 저장 경로에서 항상 적용되도록.
  const characterCards = parseStudioTranslationCharacterCardSet(after);
  if (characterCards === null) throw new Error("A valid translation character card set is required.");
  return writeStudioLocalizationProject(
    storage,
    { ...current, characterCards, updatedAt: new Date().toISOString() },
    target,
  );
}

export function projectLocalizationDiagnostics(
  units: readonly StudioLocalizationUnit[],
): readonly StudioProjectDiagnosticLocalization[] {
  const locales = new Map<string, StudioLocalizationUnit[]>();
  for (const unit of units) {
    const key = unit.targetLocale.toLowerCase();
    const group = locales.get(key) ?? [];
    group.push(unit);
    locales.set(key, group);
  }
  return Object.freeze([...locales.values()].map((group) => {
    const summary = summarizeStudioLocalization(group);
    const qa = group.flatMap((unit) => evaluateStudioLocalizationQa(unit));
    const blockingIssueCount = qa.filter((item) => item.severity === "error").length;
    const warningIssueCount = qa.filter((item) => item.severity === "warning").length;
    const status = summary.total > 0
      && summary.completed === summary.total
      && blockingIssueCount === 0
      && warningIssueCount === 0
        ? "complete"
        : blockingIssueCount > 0
          ? "blocked"
          : "review";
    return Object.freeze({
      locale: group[0]!.targetLocale,
      status,
      blockingIssueCount,
      warningIssueCount,
    });
  }).sort((a, b) => a.locale.localeCompare(b.locale)));
}

export function studioLocalizationProjectStorageKey(projectId: string): string {
  return storageKey(projectId);
}
