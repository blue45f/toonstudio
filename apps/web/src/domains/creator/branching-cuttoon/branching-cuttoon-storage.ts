/**
 * 분기형 컷툰 로컬 저장 — 작가의 초안과 독자의 읽던 위치를 이 브라우저의 localStorage 에만 둔다.
 *
 * 서버로 보내지 않고, 저장이 막혀 있거나(프라이빗 창, 용량, 차단) 값이 깨져 있어도 화면은 계속 동작한다:
 * 읽기는 null 로, 쓰기는 false 로 알릴 뿐 던지지 않는다. 저장소 접근은 shared 의 브라우저 설정 도우미를 거친다.
 *
 * 읽던 위치의 키는 작품 단위(`...progress.v1.<workId>`)이고 값에 그래프 판 지문이 들어 있다. 판이 다르면 기록을 되살리지 않고
 * 처음부터 시작한다(model 의 restoreReaderState 가 따르는 fail-closed 규칙). 작품마다 기록이 하나뿐이라 판이 바뀔 때마다 키가 쌓이지 않는다.
 */
import {
  BRANCHING_IMPORT_LIMITS,
  parseBranchingCuttoonJson,
  restoreReaderState,
  serializeBranchingCuttoon,
  toProgressRecord,
  type BranchingCuttoonGraph,
  type BranchingReaderState,
} from "./model";

import { readBrowserPreference, writeBrowserPreference, type StorageResolver } from "@/shared/lib/browser-preferences";

export const BRANCHING_DRAFT_STORAGE_KEY = "toonstudio.branching-cuttoon.draft.v1";
const PROGRESS_KEY_PREFIX = "toonstudio.branching-cuttoon.progress.v1.";
const WORK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/u;

/** 실제 브라우저의 localStorage. 접근이 막혀 있으면 도우미가 null/false 로 처리한다. */
export const browserLocalStorage: StorageResolver = () => globalThis.localStorage;

/** 키에 쓸 수 있는 작품 식별자만 통과시킨다. 아니면 초안용 "draft". */
export function branchingWorkKey(workId: string): string {
  return WORK_ID_PATTERN.test(workId) ? workId : "draft";
}

export function progressStorageKey(workId: string): string {
  return `${PROGRESS_KEY_PREFIX}${branchingWorkKey(workId)}`;
}

export type DraftReadResult =
  | { readonly kind: "none" }
  | { readonly kind: "restored"; readonly graph: BranchingCuttoonGraph }
  | { readonly kind: "unreadable" };

/** 저장된 초안을 읽는다. 값이 없으면 none, 있는데 읽을 수 없으면 unreadable. */
export function readDraft(resolve: StorageResolver): DraftReadResult {
  const raw = readBrowserPreference(resolve, BRANCHING_DRAFT_STORAGE_KEY);
  if (raw === null) return { kind: "none" };
  const parsed = parseBranchingCuttoonJson(raw);
  return parsed.ok ? { kind: "restored", graph: parsed.graph } : { kind: "unreadable" };
}

/**
 * 초안을 저장한다. 저장하지 못하면 false. 가져오기 상한(1MiB)을 넘는 글은 다음에 읽을 수 없으므로 쓰지 않고,
 * 마지막으로 잘 저장된 초안을 그대로 둔다.
 */
export function writeDraft(resolve: StorageResolver, graph: BranchingCuttoonGraph): boolean {
  const text = serializeBranchingCuttoon(graph);
  if (text.length > BRANCHING_IMPORT_LIMITS.maxTextLength) return false;
  return writeBrowserPreference(resolve, BRANCHING_DRAFT_STORAGE_KEY, text);
}

export interface ProgressReadResult {
  /** 되살린 읽기 상태. 없으면 null — 호출한 쪽이 처음부터 시작한다. */
  readonly state: BranchingReaderState | null;
  /**
   * none: 저장된 기록이 없거나 아직 한 장면도 넘기지 않았다.
   * resumed: 읽던 위치를 되살렸다.
   * reset: 기록이 있었지만 이 그래프 판의 것이 아니거나 깨져 있어 버렸다.
   */
  readonly outcome: "none" | "resumed" | "reset";
}

export function readProgress(resolve: StorageResolver, workId: string, graph: BranchingCuttoonGraph): ProgressReadResult {
  const raw = readBrowserPreference(resolve, progressStorageKey(workId));
  if (raw === null) return { state: null, outcome: "none" };
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return { state: null, outcome: "reset" };
  }
  const state = restoreReaderState(graph, record);
  if (!state) return { state: null, outcome: "reset" };
  const untouched = state.trail.length === 0 && state.nodeId === graph.startNodeId;
  return { state, outcome: untouched ? "none" : "resumed" };
}

/** 읽던 위치를 저장한다. 저장하지 못하면 false — 읽기는 그대로 계속한다. */
export function writeProgress(
  resolve: StorageResolver,
  workId: string,
  graph: BranchingCuttoonGraph,
  state: BranchingReaderState,
): boolean {
  return writeBrowserPreference(resolve, progressStorageKey(workId), JSON.stringify(toProgressRecord(graph, state)));
}
