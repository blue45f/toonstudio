/**
 * 툰스튜디오 가상 패널 모델 (Virtual Panel Model).
 *
 * 프로젝트 JSON/manifest 검증기, 예약 코어, 12 UI 설계와 완전히 분리된
 * 순수 가상 패널 도메인 모델 및 깊은 불변성(Deep Immutability) 보장 유틸리티.
 */

export type VirtualPanelKind =
  | "setup"
  | "dialogue"
  | "action"
  | "reaction"
  | "reveal"
  | "transition";

export type VirtualPanelTextField = "title" | "dialogue" | "caption" | "notes";

/**
 * 패널 내부의 텍스트 블록(대사, 캡션, 연출 노트 등).
 */
export interface VirtualPanelTextContent {
  readonly title: string;
  readonly dialogue: string;
  readonly caption: string;
  readonly notes: string;
}

/**
 * 가상 패널 엔티티.
 * `order` 는 문서 내에서의 0-based 연속 읽기 순서(readingOrder)를 나타낸다.
 */
export interface VirtualPanel {
  readonly id: string;
  readonly kind: VirtualPanelKind;
  readonly order: number;
  readonly text: VirtualPanelTextContent;
  readonly characterTags: readonly string[];
  readonly estimatedHeightPx: number;
}

/**
 * 가상 패널 보드(문서) 상태.
 */
export interface VirtualPanelBoardState {
  readonly boardId: string;
  readonly episodeCode: string;
  readonly revision: number;
  readonly panels: readonly VirtualPanel[];
}

/**
 * 새 가상 패널 생성 시 사용하는 입력 계약.
 */
export interface VirtualPanelDraftInput {
  readonly id: string;
  readonly kind?: VirtualPanelKind;
  readonly text?: Partial<VirtualPanelTextContent>;
  readonly characterTags?: readonly string[];
  readonly estimatedHeightPx?: number;
}

/**
 * 가상 패널 보드 생성 입력 계약.
 */
export interface VirtualPanelBoardSeedInput {
  readonly boardId: string;
  readonly episodeCode?: string;
  readonly revision?: number;
  readonly panels?: readonly VirtualPanelDraftInput[];
}

export const VALID_PANEL_KINDS: ReadonlySet<VirtualPanelKind> = new Set<VirtualPanelKind>([
  "setup",
  "dialogue",
  "action",
  "reaction",
  "reveal",
  "transition",
]);

export const VALID_TEXT_FIELDS: ReadonlySet<VirtualPanelTextField> =
  new Set<VirtualPanelTextField>(["title", "dialogue", "caption", "notes"]);

const PANEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export type CommandErrorCode =
  | "INVALID_BOARD_SEED"
  | "INVALID_CAPACITY"
  | "INVALID_COMMAND_SHAPE"
  | "INVALID_PANEL_ID"
  | "DUPLICATE_PANEL_ID"
  | "PANEL_NOT_FOUND"
  | "INDEX_OUT_OF_RANGE"
  | "INVALID_REORDER_PERMUTATION"
  | "INVALID_TEXT_FIELD"
  | "INVALID_TEXT_VALUE"
  | "INVALID_PANEL_DRAFT"
  | "TRANSACTION_ALREADY_ACTIVE"
  | "TRANSACTION_NOT_ACTIVE";

/**
 * 잘못된 명령이나 설정이 주어졌을 때 발생하는 도메인 방어 예외.
 */
export class ToonCommandHistoryError extends Error {
  readonly code: CommandErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: CommandErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ToonCommandHistoryError";
    this.code = code;
    this.details = details ? deepFreezeClone(details) : undefined;
  }
}

/**
 * 객체와 배열을 재귀적으로 복제하고 `Object.freeze` 를 적용하여
 * 호출자가 원본 참조를 수정하더라도 엔진 내부/반환 상태가 절대 변하지 않도록 보장한다.
 */
export function deepFreezeClone<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    const clonedArray = value.map((item) => deepFreezeClone(item));
    return Object.freeze(clonedArray) as unknown as T;
  }
  const record = value as Record<string, unknown>;
  const clonedObj: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    clonedObj[key] = deepFreezeClone(record[key]);
  }
  return Object.freeze(clonedObj) as T;
}

export function isValidPanelId(id: unknown): id is string {
  return typeof id === "string" && PANEL_ID_PATTERN.test(id.trim()) && id.trim() === id;
}

/**
 * 패널 초안 입력을 검증하고 정규화된 불변 `VirtualPanel` 로 변환한다.
 */
export function normalizeVirtualPanelDraft(
  draft: VirtualPanelDraftInput,
  order: number,
): VirtualPanel {
  if (!draft || typeof draft !== "object") {
    throw new ToonCommandHistoryError(
      "INVALID_PANEL_DRAFT",
      "패널 생성 입력은 객체여야 합니다.",
    );
  }
  if (!isValidPanelId(draft.id)) {
    throw new ToonCommandHistoryError(
      "INVALID_PANEL_ID",
      `유효하지 않은 패널 ID 입니다: ${String(draft.id)}`,
      { panelId: draft.id },
    );
  }
  const kind: VirtualPanelKind = draft.kind ?? "dialogue";
  if (!VALID_PANEL_KINDS.has(kind)) {
    throw new ToonCommandHistoryError(
      "INVALID_PANEL_DRAFT",
      `지원하지 않는 패널 종류입니다: ${String(kind)}`,
      { kind },
    );
  }
  const estimatedHeightPx = draft.estimatedHeightPx ?? 720;
  if (
    typeof estimatedHeightPx !== "number" ||
    !Number.isSafeInteger(estimatedHeightPx) ||
    estimatedHeightPx <= 0 ||
    estimatedHeightPx > 20_000
  ) {
    throw new ToonCommandHistoryError(
      "INVALID_PANEL_DRAFT",
      `유효하지 않은 패널 높이(estimatedHeightPx)입니다: ${String(estimatedHeightPx)}`,
      { estimatedHeightPx },
    );
  }

  const rawText = draft.text ?? {};
  if (typeof rawText !== "object" || rawText === null) {
    throw new ToonCommandHistoryError(
      "INVALID_PANEL_DRAFT",
      "패널 text 속성은 객체여야 합니다.",
    );
  }

  const title = rawText.title ?? "";
  const dialogue = rawText.dialogue ?? "";
  const caption = rawText.caption ?? "";
  const notes = rawText.notes ?? "";
  if (
    typeof title !== "string" ||
    typeof dialogue !== "string" ||
    typeof caption !== "string" ||
    typeof notes !== "string"
  ) {
    throw new ToonCommandHistoryError(
      "INVALID_TEXT_VALUE",
      "패널의 모든 텍스트 필드는 문자열이어야 합니다.",
    );
  }

  const rawTags = draft.characterTags ?? [];
  if (!Array.isArray(rawTags)) {
    throw new ToonCommandHistoryError(
      "INVALID_PANEL_DRAFT",
      "characterTags 는 문자열 배열이어야 합니다.",
    );
  }
  const cleanedTags: string[] = [];
  const seenTags = new Set<string>();
  for (const tag of rawTags) {
    if (typeof tag !== "string" || tag.trim() === "") {
      throw new ToonCommandHistoryError(
        "INVALID_PANEL_DRAFT",
        "characterTags 에는 비어 있지 않은 문자열만 허용됩니다.",
      );
    }
    const normalizedTag = tag.trim();
    if (!seenTags.has(normalizedTag)) {
      seenTags.add(normalizedTag);
      cleanedTags.push(normalizedTag);
    }
  }

  return deepFreezeClone({
    id: draft.id,
    kind,
    order,
    text: {
      title,
      dialogue,
      caption,
      notes,
    },
    characterTags: cleanedTags,
    estimatedHeightPx,
  });
}

/**
 * 패널 배열의 `order` 필드를 배열 인덱스(`0..n-1`)와 일치하도록 재정규화한다.
 */
export function reindexVirtualPanels(
  panels: readonly VirtualPanel[],
): readonly VirtualPanel[] {
  return deepFreezeClone(
    panels.map((panel, index) =>
      panel.order === index
        ? panel
        : {
            ...panel,
            order: index,
          },
    ),
  );
}

/**
 * 초기 가상 패널 보드 상태를 생성한다.
 * 외부에서 전달된 seed 객체를 깊게 복제하고 동결하여 원본 불변성을 보장한다.
 */
export function createVirtualPanelBoard(
  seed: VirtualPanelBoardSeedInput,
): VirtualPanelBoardState {
  if (!seed || typeof seed !== "object") {
    throw new ToonCommandHistoryError(
      "INVALID_BOARD_SEED",
      "보드 초기 시드 입력이 유효하지 않습니다.",
    );
  }
  if (!isValidPanelId(seed.boardId)) {
    throw new ToonCommandHistoryError(
      "INVALID_BOARD_SEED",
      `유효하지 않은 boardId 입니다: ${String(seed.boardId)}`,
      { boardId: seed.boardId },
    );
  }
  const episodeCode = (seed.episodeCode ?? "ep-001").trim();
  if (!episodeCode) {
    throw new ToonCommandHistoryError(
      "INVALID_BOARD_SEED",
      "episodeCode 는 비어 있을 수 없습니다.",
    );
  }
  const revision = seed.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new ToonCommandHistoryError(
      "INVALID_BOARD_SEED",
      "초기 revision 은 0 이상의 정수여야 합니다.",
      { revision },
    );
  }

  const rawPanels = seed.panels ?? [];
  if (!Array.isArray(rawPanels)) {
    throw new ToonCommandHistoryError(
      "INVALID_BOARD_SEED",
      "panels 는 배열이어야 합니다.",
    );
  }

  const seenIds = new Set<string>();
  const normalizedPanels: VirtualPanel[] = [];
  for (let i = 0; i < rawPanels.length; i += 1) {
    const draft = rawPanels[i]!;
    const panel = normalizeVirtualPanelDraft(draft, i);
    if (seenIds.has(panel.id)) {
      throw new ToonCommandHistoryError(
        "DUPLICATE_PANEL_ID",
        `초기 보드에 중복된 패널 ID 가 존재합니다: ${panel.id}`,
        { panelId: panel.id },
      );
    }
    seenIds.add(panel.id);
    normalizedPanels.push(panel);
  }

  return deepFreezeClone({
    boardId: seed.boardId,
    episodeCode,
    revision,
    panels: normalizedPanels,
  });
}
