/**
 * 작가용 요약 화면의 가져오기 흐름 — 여러 파일(또는 붙여넣은 글)을 읽어 검증하고, 상태 리듀서로 합친다.
 *
 * 화면이 아닌 곳에 두는 이유: 파일 하나가 잘못돼도 나머지는 계속 가져오고, 실패한 파일은 사유와 함께
 * 남겨 다시 시도할 수 있어야 하는데, 이 규칙을 렌더링 코드와 섞으면 시험하기 어렵기 때문이다.
 */
import { parseReaderFeedbackText, readReaderFeedbackFile, type ReaderFeedbackFileLike, type ReaderFeedbackParseErrorCode } from "./reader-feedback-io";
import { READER_FEEDBACK_LIMITS, type ReaderFeedbackResponse } from "./reader-feedback-schema";
import { mergeReaderFeedback } from "./reader-feedback-summary";
import { cleanFeedbackText } from "./reader-feedback-text";

export type ImportFailureCode = ReaderFeedbackParseErrorCode | "read-failed";

export interface ImportReport {
  readonly id: number;
  /** 화면에 보일 이름. 길이를 자르고 제어 문자를 지운 값이다. */
  readonly name: string;
  readonly source: "file" | "paste" | "example";
  readonly status: "ok" | "failed";
  readonly code: ImportFailureCode | null;
  /** 검증 실패 첫 위치(스키마 경로). 그 밖의 실패는 null. */
  readonly path: string | null;
  /** 이 파일에서 읽은 응답 수(합치기 전, 중복 포함). */
  readonly accepted: number;
  /** 같은 파일을 다시 읽으면 성공할 수 있는 실패(읽기 오류)인지. 형식 오류는 다시 읽어도 같으므로 false. */
  readonly retryable: boolean;
}

export interface ImportSource extends ReaderFeedbackFileLike {
  readonly name: string;
  readonly source: "file" | "paste";
}

export interface ImportOutcome {
  readonly reports: readonly ImportReport[];
  readonly incoming: readonly ReaderFeedbackResponse[];
}

function displayName(name: string): string {
  return cleanFeedbackText(name, 80) || "(이름 없음)";
}

/** 한 소스를 읽고 검증한다. 어떤 실패도 예외가 아니라 보고서로 돌려준다. */
async function importOne(source: ImportSource, id: number): Promise<{ report: ImportReport; incoming: readonly ReaderFeedbackResponse[] }> {
  const name = displayName(source.name);
  const failed = (code: ImportFailureCode, path: string | null = null): { report: ImportReport; incoming: readonly ReaderFeedbackResponse[] } =>
    ({ report: { id, name, source: source.source, status: "failed", code, path, accepted: 0, retryable: code === "read-failed" && source.source === "file" }, incoming: [] });
  const read = await readReaderFeedbackFile(source);
  if (!read.ok) return failed(read.code);
  const parsed = parseReaderFeedbackText(read.text);
  if (!parsed.ok) return failed(parsed.code, parsed.issues[0]?.path ?? null);
  const incoming = parsed.file.responses;
  return { report: { id, name, source: source.source, status: "ok", code: null, path: null, accepted: incoming.length, retryable: false }, incoming };
}

/** 소스를 차례로 읽는다. 보고서 id 는 firstId 부터 순서대로 붙는다. */
export async function importReaderFeedbackSources(sources: readonly ImportSource[], firstId: number): Promise<ImportOutcome> {
  const reports: ImportReport[] = [];
  const incoming: ReaderFeedbackResponse[] = [];
  for (const [index, source] of sources.entries()) {
    const result = await importOne(source, firstId + index);
    reports.push(result.report);
    incoming.push(...result.incoming);
  }
  return { reports, incoming };
}

/** 붙여넣은 글을 소스로 만든다. 크기는 UTF-8 바이트 수다. */
export function pastedSource(text: string, name: string): ImportSource {
  return { name, source: "paste", size: new TextEncoder().encode(text).length, text: async () => text };
}

// ───────────────────────── 상태 ─────────────────────────

export interface MergeCounts {
  readonly added: number;
  readonly updated: number;
  readonly duplicates: number;
  readonly overflow: number;
}

export interface PanelState {
  readonly responses: readonly ReaderFeedbackResponse[];
  /** 가져오기 보고서. 최근 가져오기가 앞에 오고, 같은 가져오기 안에서는 파일을 고른 순서다. */
  readonly reports: readonly ImportReport[];
  /** 가장 최근 합치기 결과. 아직 가져온 적 없으면 null. */
  readonly lastMerge: MergeCounts | null;
  /** 파일 수 상한 때문에 읽지 않은 파일 수(가장 최근 가져오기 기준). */
  readonly skippedFiles: number;
  /** 아직 끝나지 않은 가져오기 수(마지막으로 비운 뒤에 시작한 것만). 0 보다 크면 읽는 중 표시를 한다. */
  readonly pending: number;
  readonly selectedKey: string | null;
  /**
   * 비운 횟수. 가져오기는 시작할 때의 값을 들고 있다가 끝나면서 돌려주고, 그 사이에 비웠다면(값이 다르면)
   * 늦게 끝난 결과를 버린다. 그렇지 않으면 비운 화면이 이미 비우기를 누른 응답으로 다시 채워진다.
   */
  readonly generation: number;
}

export const INITIAL_PANEL_STATE: PanelState = {
  responses: [],
  reports: [],
  lastMerge: null,
  skippedFiles: 0,
  pending: 0,
  selectedKey: null,
  generation: 0,
};

export type PanelAction =
  | { readonly type: "loading" }
  /** `generation`은 가져오기를 시작할 때의 `PanelState.generation`. 그 사이에 비웠다면 이 결과는 버려진다. */
  | { readonly type: "imported"; readonly generation: number; readonly outcome: ImportOutcome; readonly skippedFiles: number }
  /** 실패한 보고서 하나를 다시 읽은 결과. 같은 id 의 보고서를 바꿔 끼운다. */
  | { readonly type: "retried"; readonly generation: number; readonly outcome: ImportOutcome }
  | { readonly type: "select"; readonly key: string | null }
  | { readonly type: "dismiss-reports" }
  | { readonly type: "clear" };

const MAX_REPORTS = 30;

function mergeCounts(result: ReturnType<typeof mergeReaderFeedback>): MergeCounts {
  return { added: result.added, updated: result.updated, duplicates: result.duplicates, overflow: result.overflow };
}

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "loading":
      return { ...state, pending: state.pending + 1 };
    case "imported": {
      if (action.generation !== state.generation) return state;
      const merged = mergeReaderFeedback(state.responses, action.outcome.incoming);
      return {
        ...state,
        responses: merged.responses,
        reports: action.outcome.reports.concat(state.reports).slice(0, MAX_REPORTS),
        lastMerge: mergeCounts(merged),
        skippedFiles: action.skippedFiles,
        pending: Math.max(0, state.pending - 1),
      };
    }
    case "retried": {
      if (action.generation !== state.generation) return state;
      const merged = mergeReaderFeedback(state.responses, action.outcome.incoming);
      const replacement = action.outcome.reports[0];
      return {
        ...state,
        responses: merged.responses,
        reports: replacement ? state.reports.map((report) => (report.id === replacement.id ? replacement : report)) : state.reports,
        lastMerge: mergeCounts(merged),
        pending: Math.max(0, state.pending - 1),
      };
    }
    case "select":
      return { ...state, selectedKey: action.key };
    case "dismiss-reports":
      return { ...state, reports: [] };
    case "clear":
      // 읽고 있던 가져오기는 이 시점에 버린 것으로 본다: 읽는 중 표시도 함께 끄고, 늦게 끝난 결과는 위에서 걸러진다.
      return { ...INITIAL_PANEL_STATE, generation: state.generation + 1 };
  }
}

/** 한 번에 읽을 수 있는 파일 수까지만 남기고, 남은 수를 함께 알려 준다. */
export function limitSources<T>(items: readonly T[]): { readonly kept: readonly T[]; readonly skipped: number } {
  const kept = items.slice(0, READER_FEEDBACK_LIMITS.maxFiles);
  return { kept, skipped: items.length - kept.length };
}
