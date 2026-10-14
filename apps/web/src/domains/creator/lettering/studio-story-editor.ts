/**
 * Studio Story Editor — 스토리 에디터 전용 표면의 순수 코어.
 *
 * 기존 일괄 편집 패널(StudioDialogueBatchPanel)은 캔버스 옆 플로팅 패널에서
 * 행마다 포커스 아웃/⌘Enter 로 즉시 커밋한다. 회차 전체 대사를 "한 문서처럼"
 * 읽고 고치는 전용 표면에는 세 가지가 더 필요하다:
 *  1. 회차 단위 뷰 모델 — 읽기 순서 목록 + 페이지·페이지 내 순번 배지 정보와
 *     맞춤법 검사 결과를 행에 붙인 형태. 검사는 기존
 *     studio-dialogue-spellcheck 를 그대로 돌려, QC·최종 검사와 같은 결과를
 *     이 표면에서도 공유한다(새 검사 규칙 금지).
 *  2. 초안(draft) 수집 — 표면에서 바뀐 행만 골라 저장 단위로 만든다.
 *     잠긴 행의 수정 시도는 초안에 넣지 않고 따로 보고한다.
 *  3. 페이지 문서 재배포 어댑터 — 저장 시 초안을 페이지별 문서에 한 번에
 *     반영한다. 표면을 연 뒤 캔버스에서 먼저 바뀐 대사(stale), 잠긴 대사,
 *     사라진 대사는 덮어쓰지 않고 충돌로 돌려준다. 구조 연산(분할·병합·이동)은
 *     기존 studio-dialogue-structure 가 담당하므로 여기서는 만들지 않는다.
 *
 * 규칙(studio-dialogue-batch 와 동일 규율):
 *  - Konva/DOM 의존 없음(전부 순수·결정적). 사용자 노출 문자열은 한글.
 *  - 입력 배열/객체는 절대 변형하지 않는다. 바뀐 페이지·요소만 새 객체로 만들고,
 *    적용된 것이 하나도 없으면 입력 배열을 그대로(참조 동일) 돌려준다.
 */
import { isEffectivelyLocked } from "../studio-layers";

import {
  collectDialogueItems,
  dialogueItemTypeLabel,
  isDialogueElement,
  type DialogueBatchItem,
  type DialoguePageLike,
} from "./studio-dialogue-batch";
import {
  checkDialogueSpelling,
  summarizeDialogueSpellcheck,
  type DialogueSpellcheckOptions,
  type DialogueSpellcheckSummary,
  type DialogueSpellFinding,
  type DialogueSpellFix,
} from "./studio-dialogue-spellcheck";

// ── 뷰 모델 ────────────────────────────────────────────────────────────────

/** 전용 표면의 한 행 — 대사 목록 항목 + 위치 배지 + 맞춤법 지적. */
export type StoryEditorRow = {
  /** DialogueBatchItem.id 와 같다(요소 id). */
  id: string;
  pageId: string;
  /** 0 기준 페이지 순번. */
  pageIndex: number;
  /** 표시용 페이지 라벨 — "1페이지". */
  pageLabel: string;
  /** 페이지 안 읽기 순서(1부터). 배지 "1페이지 · 2번째 대사" 의 뒷부분. */
  orderInPage: number;
  elType: DialogueBatchItem["elType"];
  /** "말풍선·생각" / "텍스트" — batch 의 라벨 함수를 그대로 쓴다. */
  typeLabel: string;
  /** 저장 시점 원문(초안의 originalText 와 대조하는 기준). */
  text: string;
  hidden: boolean;
  locked: boolean;
  /** 이 행에 대한 맞춤법·띄어쓰기 지적(검사 결과 공유). */
  findings: readonly DialogueSpellFinding[];
};

export type StoryEditorPageGroup = {
  pageId: string;
  pageIndex: number;
  pageLabel: string;
  rows: StoryEditorRow[];
};

export type StoryEditorView = {
  rows: StoryEditorRow[];
  groups: StoryEditorPageGroup[];
  /** 맞춤법 요약 — QC 합류형과 같은 구조를 그대로 공유한다. */
  spellSummary: DialogueSpellcheckSummary;
  totalCount: number;
  lockedCount: number;
  hiddenCount: number;
  /** 지적이 하나라도 있는 행 수. */
  flaggedRowCount: number;
};

/**
 * 회차(다페이지) 대사를 전용 표면용 뷰 모델로 펼친다.
 * 읽기 순서는 collectDialogueItems 의 판정을 그대로 따르고, 맞춤법 지적은
 * checkDialogueSpelling 을 같은 옵션으로 돌린 결과를 행에 붙인다 —
 * 다른 표면(QC)에서 보는 결과와 어긋나지 않는다.
 */
export function buildStoryEditorView(
  pages: readonly DialoguePageLike[],
  spellOptions: DialogueSpellcheckOptions = {}
): StoryEditorView {
  const items = collectDialogueItems(pages);
  const findings = checkDialogueSpelling(items, spellOptions);
  const spellSummary = summarizeDialogueSpellcheck(items, findings, spellOptions);

  const findingsByItem = new Map<string, DialogueSpellFinding[]>();
  for (const finding of findings) {
    const list = findingsByItem.get(finding.itemId);
    if (list) list.push(finding);
    else findingsByItem.set(finding.itemId, [finding]);
  }

  const orderByPage = new Map<string, number>();
  const rows: StoryEditorRow[] = items.map((item) => {
    const orderInPage = (orderByPage.get(item.pageId) ?? 0) + 1;
    orderByPage.set(item.pageId, orderInPage);
    return {
      id: item.id,
      pageId: item.pageId,
      pageIndex: item.pageIndex,
      pageLabel: `${item.pageIndex + 1}페이지`,
      orderInPage,
      elType: item.elType,
      typeLabel: dialogueItemTypeLabel(item),
      text: item.text,
      hidden: item.hidden,
      locked: item.locked,
      findings: findingsByItem.get(item.id) ?? [],
    };
  });

  const groups: StoryEditorPageGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.pageId === row.pageId) {
      last.rows.push(row);
    } else {
      groups.push({
        pageId: row.pageId,
        pageIndex: row.pageIndex,
        pageLabel: row.pageLabel,
        rows: [row],
      });
    }
  }

  return {
    rows,
    groups,
    spellSummary,
    totalCount: rows.length,
    lockedCount: rows.filter((row) => row.locked).length,
    hiddenCount: rows.filter((row) => row.hidden).length,
    flaggedRowCount: rows.filter((row) => row.findings.length > 0).length,
  };
}

// ── 초안 수집 ──────────────────────────────────────────────────────────────

/** 저장 단위 1건 — 표면에서 바뀐 대사 하나. */
export type StoryEditorDraft = {
  pageId: string;
  elementId: string;
  /** 표면을 열 때(뷰 모델 생성 시점)의 원문. 재배포 때 stale 판정 기준. */
  originalText: string;
  text: string;
};

export type StoryEditorDraftCollection = {
  drafts: StoryEditorDraft[];
  /** 바뀌었지만 잠겨 있어 초안에서 제외된 요소 id(표면 안내용). */
  lockedEditIds: string[];
};

/**
 * 표면의 편집 맵(요소 id → 현재 입력값)에서 실제로 바뀐 행만 초안으로 모은다.
 * 원문과 같으면 제외하고, 잠긴 행은 초안에 넣지 않는다.
 */
export function collectStoryEditorDrafts(
  view: Pick<StoryEditorView, "rows">,
  edits: ReadonlyMap<string, string> | Readonly<Record<string, string>>
): StoryEditorDraftCollection {
  const read = (id: string): string | undefined =>
    edits instanceof Map ? edits.get(id) : (edits as Readonly<Record<string, string>>)[id];
  const drafts: StoryEditorDraft[] = [];
  const lockedEditIds: string[] = [];
  for (const row of view.rows) {
    const edited = read(row.id);
    if (edited === undefined || edited === row.text) continue;
    if (row.locked) {
      lockedEditIds.push(row.id);
      continue;
    }
    drafts.push({
      pageId: row.pageId,
      elementId: row.id,
      originalText: row.text,
      text: edited,
    });
  }
  return { drafts, lockedEditIds };
}

// ── 페이지 문서 재배포 어댑터 ──────────────────────────────────────────────

export type StoryEditorConflictReason = "stale" | "locked" | "missing";

export type StoryEditorConflict = {
  pageId: string;
  elementId: string;
  reason: StoryEditorConflictReason;
  /** stale 일 때 지금 페이지에 들어 있는 텍스트(사람이 비교해 고르게). */
  currentText?: string;
  /** 적용하려던 텍스트. */
  attemptedText: string;
  /** 사용자에게 보여 줄 한 줄 설명. */
  message: string;
};

export type StoryEditorApplyResult = {
  /** 재배포가 끝난 페이지 배열. 적용이 하나도 없으면 입력과 참조 동일. */
  pages: readonly DialoguePageLike[];
  applied: StoryEditorDraft[];
  conflicts: StoryEditorConflict[];
  /** 텍스트가 실제로 바뀐 페이지 id(문서 순서). */
  changedPageIds: string[];
};

const CONFLICT_MESSAGE: Record<StoryEditorConflictReason, string> = {
  stale: "이 대사는 표면을 연 뒤 캔버스에서 먼저 바뀌었어요. 덮어쓰지 않았으니 최신 내용을 확인해 주세요.",
  locked: "잠긴 대사라 저장하지 않았어요. 잠금을 풀고 다시 시도해 주세요.",
  missing: "이 대사가 페이지에서 사라져 저장할 곳이 없어요.",
};

/**
 * 초안 묶음을 페이지별 문서에 재배포한다 — 전용 표면 저장의 단일 진입점.
 * 호스트는 결과가 입력과 다를 때만 단일 히스토리 커밋으로 반영하면 된다.
 * 충돌한 초안은 해당 요소만 건너뛰고 나머지는 정상 적용한다(전부-아니면-전무가
 * 아니다: 3페이지 중 1곳이 stale 이어도 나머지 저장이 막히면 표면이 무용해진다).
 */
export function applyStoryEditorDrafts(
  pages: readonly DialoguePageLike[],
  drafts: readonly StoryEditorDraft[]
): StoryEditorApplyResult {
  if (drafts.length === 0) {
    return { pages, applied: [], conflicts: [], changedPageIds: [] };
  }

  const applied: StoryEditorDraft[] = [];
  const conflicts: StoryEditorConflict[] = [];
  const changedPageIds: string[] = [];

  const next = pages.map((page) => {
    const pageDrafts = drafts.filter((draft) => draft.pageId === page.id);
    if (pageDrafts.length === 0) return page;
    const groups = page.groups ?? [];
    let pageChanged = false;
    const elements = page.elements.map((el) => {
      const draft = pageDrafts.find((candidate) => candidate.elementId === el.id);
      if (!draft || !isDialogueElement(el)) return el;
      if (isEffectivelyLocked(el, groups)) {
        conflicts.push({
          pageId: page.id,
          elementId: el.id,
          reason: "locked",
          currentText: el.text,
          attemptedText: draft.text,
          message: CONFLICT_MESSAGE.locked,
        });
        return el;
      }
      if (el.text === draft.text) return el;
      if (el.text !== draft.originalText) {
        conflicts.push({
          pageId: page.id,
          elementId: el.id,
          reason: "stale",
          currentText: el.text,
          attemptedText: draft.text,
          message: CONFLICT_MESSAGE.stale,
        });
        return el;
      }
      pageChanged = true;
      applied.push(draft);
      return { ...el, text: draft.text };
    });
    // 페이지에 없는 초안(요소 삭제·페이지 불일치)은 missing 으로 보고한다.
    for (const draft of pageDrafts) {
      const exists = page.elements.some(
        (el) => el.id === draft.elementId && isDialogueElement(el)
      );
      if (!exists) {
        conflicts.push({
          pageId: page.id,
          elementId: draft.elementId,
          reason: "missing",
          attemptedText: draft.text,
          message: CONFLICT_MESSAGE.missing,
        });
      }
    }
    if (!pageChanged) return page;
    changedPageIds.push(page.id);
    return { ...page, elements };
  });

  // 초안이 가리키는 페이지 자체가 없으면 missing 으로 보고한다.
  for (const draft of drafts) {
    if (!pages.some((page) => page.id === draft.pageId)) {
      conflicts.push({
        pageId: draft.pageId,
        elementId: draft.elementId,
        reason: "missing",
        attemptedText: draft.text,
        message: CONFLICT_MESSAGE.missing,
      });
    }
  }

  const changed = applied.length > 0;
  return {
    pages: changed ? next : pages,
    applied,
    conflicts,
    changedPageIds: changed ? changedPageIds : [],
  };
}

// ── 맞춤법 고치기 후보 적용 ────────────────────────────────────────────────

/**
 * 맞춤법 지적의 fix 후보를 텍스트에 적용한다. 범위 밖 fix 는 무변경으로 돌려준다.
 * 적용 자체는 표면의 초안만 바꾸고, 문서 반영은 저장(재배포)을 거쳐야 한다.
 */
export function applySpellFixToText(text: string, fix: DialogueSpellFix): string {
  if (
    !Number.isFinite(fix.start) ||
    !Number.isFinite(fix.end) ||
    fix.start < 0 ||
    fix.end < fix.start ||
    fix.end > text.length
  ) {
    return text;
  }
  return text.slice(0, fix.start) + fix.replacement + text.slice(fix.end);
}
