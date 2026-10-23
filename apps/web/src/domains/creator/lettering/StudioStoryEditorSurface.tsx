/**
 * Studio Story Editor Surface — 스토리 에디터 전용 표면.
 *
 * 회차 전체(다페이지) 대사를 한 표면에서 문서처럼 읽고 고치는 전용 뷰.
 * 플로팅 일괄 편집 패널과 다른 점은 저장 모델이다: 여기서는 행을 고쳐도
 * 바로 커밋하지 않고 초안으로 쌓았다가, "모두 저장" 한 번으로 페이지별
 * 문서에 재배포한다(studio-story-editor.applyStoryEditorDrafts).
 * 표면을 연 뒤 캔버스에서 먼저 바뀐 대사는 저장 때 충돌로 돌아오며,
 * 충돌한 행의 초안은 지우지 않아 사람이 비교해 다시 정할 수 있다.
 *
 * 맞춤법·띄어쓰기 지적은 studio-dialogue-spellcheck 를 초안 텍스트에도
 * 그대로 돌려 표시한다 — QC·최종 검사와 같은 결과 공유가 목적이라
 * 이 표면 전용 규칙은 두지 않는다. 고치기 후보 적용은 초안만 바꾼다.
 * 분할·병합·페이지 이동은 기존 구조 연산 콜백이 있을 때만 버튼을 낸다.
 */
import {
  ArrowRight,
  Check,
  Combine,
  Copy,
  Lock,
  RotateCcw,
  Save,
  Scissors,
  SpellCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { DialoguePageLike } from "./studio-dialogue-batch";
import { checkDialogueSpelling, type DialogueSpellFinding } from "./studio-dialogue-spellcheck";
import {
  applySpellFixToText,
  buildStoryEditorView,
  collectStoryEditorDrafts,
  type StoryEditorApplyResult,
  type StoryEditorDraft,
} from "./studio-story-editor";

import { cx } from "@/shared/lib/cx";
import { useT } from "@/shared/lib/i18n";

import "../studio-brush-canvas-status-i18n";

export type StudioStoryEditorSurfaceProps = {
  pages: readonly DialoguePageLike[];
  currentPageId: string;
  selectedId: string | null;
  onClose: () => void;
  /** 행의 위치 찾기 → 캔버스 요소 선택(다른 페이지면 전환 포함). */
  onSelectElement: (pageId: string, elId: string) => void;
  /**
   * 모두 저장 — 호스트가 applyStoryEditorDrafts 결과를 단일 히스토리 커밋으로
   * 반영하고 그 결과를 돌려준다. 충돌 목록 표시가 이 반환값에 의존한다.
   */
  onSaveDrafts: (drafts: readonly StoryEditorDraft[]) => StoryEditorApplyResult;
  /** 커서 위치 분할(기존 구조 연산). 없으면 버튼을 그리지 않는다. */
  onSplitText?: (pageId: string, elId: string, text: string, offset: number) => void;
  /** 다음 대사와 병합(기존 구조 연산). 없으면 버튼을 그리지 않는다. */
  onMergeWithNext?: (pageId: string, elId: string, text: string) => void;
  /** 다른 페이지로 이동/복사(기존 구조 연산). 없으면 버튼을 그리지 않는다. */
  onTransferElement?: (
    pageId: string,
    elId: string,
    targetPageId: string,
    mode: "move" | "copy",
    text: string
  ) => void;
};

const severityClass = (severity: DialogueSpellFinding["severity"]) =>
  severity === "error"
    ? "border-bad/40 bg-bad/10 text-bad"
    : severity === "warning"
      ? "border-warn/40 bg-warn/10 text-warn"
      : "border-line bg-card text-fg-3";

export function StudioStoryEditorSurface({
  pages,
  currentPageId,
  selectedId,
  onClose,
  onSelectElement,
  onSaveDrafts,
  onSplitText,
  onMergeWithNext,
  onTransferElement,
}: StudioStoryEditorSurfaceProps) {
  const t = useT();
  /** 초안 편집 맵 — 저장 전에는 문서에 닿지 않는다. */
  const [edits, setEdits] = useState<Readonly<Record<string, string>>>({});
  const [lastResult, setLastResult] = useState<StoryEditorApplyResult | null>(null);
  const [structureRowId, setStructureRowId] = useState<string | null>(null);
  const [selectionByItem, setSelectionByItem] = useState<
    Readonly<Record<string, { start: number; end: number } | null>>
  >({});
  const [transferTargetByItem, setTransferTargetByItem] = useState<Readonly<Record<string, string>>>(
    {}
  );

  const view = useMemo(() => buildStoryEditorView(pages), [pages]);

  // 맞춤법 지적은 초안 텍스트 기준으로 다시 돌린다 — 저장 전에 고친 결과를
  // 같은 검사로 바로 확인할 수 있게(검사 엔진·옵션은 뷰 모델과 동일).
  const findingsByItem = useMemo(() => {
    const items = view.rows.map((row) => ({
      id: row.id,
      pageId: row.pageId,
      pageIndex: row.pageIndex,
      elType: row.elType,
      text: edits[row.id] ?? row.text,
      hidden: row.hidden,
      locked: row.locked,
    }));
    const map = new Map<string, DialogueSpellFinding[]>();
    for (const finding of checkDialogueSpelling(items)) {
      const list = map.get(finding.itemId);
      if (list) list.push(finding);
      else map.set(finding.itemId, [finding]);
    }
    return map;
  }, [view, edits]);

  const { drafts, lockedEditIds } = useMemo(
    () => collectStoryEditorDrafts(view, edits),
    [view, edits]
  );
  const findingCount = useMemo(
    () => [...findingsByItem.values()].reduce((sum, list) => sum + list.length, 0),
    [findingsByItem]
  );

  const currentTextOf = (id: string, fallback: string) => edits[id] ?? fallback;

  const saveAll = () => {
    if (drafts.length === 0) return;
    const result = onSaveDrafts(drafts);
    setLastResult(result);
    if (result.applied.length > 0) {
      const appliedIds = new Set(result.applied.map((draft) => draft.elementId));
      setEdits((prev) => {
        const next: Record<string, string> = {};
        for (const [id, value] of Object.entries(prev)) {
          if (!appliedIds.has(id)) next[id] = value;
        }
        return next;
      });
    }
  };

  return (
    <section aria-label="스토리 에디터" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line/60 px-3 py-2">
        <p className="text-xs font-bold text-fg">
          스토리 에디터
          <span className="ml-1.5 font-medium text-fg-3">
            {view.groups.length}페이지 · 대사 {view.totalCount}개
          </span>
        </p>
        {drafts.length > 0 ? (
          <span className="rounded-full border border-accent/40 bg-accent-soft px-1.5 py-px text-[0.56rem] font-semibold text-accent">
            바뀐 대사 {drafts.length}개 · 저장 전
          </span>
        ) : null}
        {findingCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-1.5 py-px text-[0.56rem] font-semibold text-warn">
            <SpellCheck size={11} aria-hidden /> 맞춤법 의심 {findingCount}건
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="스토리 에디터 닫기"
          className="ml-auto grid size-11 shrink-0 place-items-center rounded-lg border border-line text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        <p className="text-[0.62rem] leading-relaxed text-fg-3">
          회차 전체 대사를 한곳에서 고치는 표면이에요. 고친 내용은 아래{" "}
          <strong className="font-semibold text-fg-2">모두 저장</strong>을 누르기 전에는
          캔버스에 반영되지 않고, 저장하면 페이지별 말풍선에 한 번에 반영돼요.
        </p>
        {lockedEditIds.length > 0 ? (
          <p className="mt-1.5 flex items-start gap-1 text-[0.62rem] leading-relaxed text-warn">
            <Lock size={12} aria-hidden className="mt-px shrink-0" />
            잠긴 대사는 이 표면에서도 고칠 수 없어 저장에서 제외돼요.
          </p>
        ) : null}

        {view.groups.length === 0 ? (
          <p className="py-6 text-center text-[0.68rem] text-fg-3">
            {t("studio.brushCanvasStatus.lettering.storyEditorNoDialogueYet", "아직 대사가 없어요. 캔버스에 말풍선을 놓으면 여기에 읽기 순서대로 모여요.")}
          </p>
        ) : (
          view.groups.map((group) => (
            <div key={group.pageId} className="mt-3">
              <p className="flex items-center gap-1.5 text-[0.66rem] font-bold text-fg-2">
                {group.pageLabel}
                {group.pageId === currentPageId ? (
                  <span className="rounded-full border border-line bg-card px-1.5 py-px text-[0.54rem] font-semibold text-fg-3">
                    지금 편집 중
                  </span>
                ) : null}
                <span className="font-medium text-fg-3">{group.rows.length}개</span>
              </p>
              <div className="mt-1.5 space-y-2">
                {group.rows.map((row) => {
                  const value = currentTextOf(row.id, row.text);
                  const changed = value !== row.text;
                  const findings = findingsByItem.get(row.id) ?? row.findings;
                  const selection = selectionByItem[row.id];
                  const transferTarget =
                    transferTargetByItem[row.id] ??
                    pages.find((page) => page.id !== row.pageId)?.id ??
                    "";
                  return (
                    <div
                      key={row.id}
                      className={cx(
                        "rounded-xl border p-2",
                        row.id === selectedId
                          ? "border-accent/50 bg-accent-soft/40"
                          : "border-line bg-card/55"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectElement(row.pageId, row.id)}
                          className="rounded-full border border-line bg-panel px-1.5 py-px text-[0.56rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          aria-label={`${row.pageLabel} ${row.orderInPage}번째 대사 위치 찾기`}
                        >
                          {row.pageLabel} · {row.orderInPage}번째
                        </button>
                        <span className="text-[0.56rem] font-medium text-fg-3">{row.typeLabel}</span>
                        {changed ? (
                          <span className="rounded-full border border-accent/40 bg-accent-soft px-1.5 py-px text-[0.54rem] font-semibold text-accent">
                            바뀜 · 저장 전
                          </span>
                        ) : null}
                        {row.locked ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-line bg-card px-1.5 py-px text-[0.54rem] font-semibold text-fg-3">
                            <Lock size={10} aria-hidden /> 잠김
                          </span>
                        ) : null}
                        {row.hidden ? (
                          <span className="rounded-full border border-line bg-card px-1.5 py-px text-[0.54rem] font-semibold text-fg-3">
                            숨김
                          </span>
                        ) : null}
                        {(onSplitText || onMergeWithNext || onTransferElement) && !row.locked ? (
                          <button
                            type="button"
                            aria-expanded={structureRowId === row.id}
                            onClick={() =>
                              setStructureRowId((prev) => (prev === row.id ? null : row.id))
                            }
                            className="ml-auto min-h-8 rounded-lg border border-line bg-panel px-2 text-[0.6rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            구조 편집
                          </button>
                        ) : null}
                      </div>

                      <textarea
                        value={value}
                        disabled={row.locked}
                        rows={Math.min(5, Math.max(2, value.split("\n").length + 1))}
                        onChange={(event) =>
                          setEdits((prev) => ({ ...prev, [row.id]: event.target.value }))
                        }
                        onSelect={(event) => {
                          // 갱신 함수는 핸들러가 끝난 뒤 실행될 수 있어 그때는 currentTarget 이 null 이다. 값을 먼저 읽어 둔다.
                          const { selectionStart, selectionEnd } = event.currentTarget;
                          setSelectionByItem((prev) => ({
                            ...prev,
                            [row.id]: { start: selectionStart ?? 0, end: selectionEnd ?? 0 },
                          }));
                        }}
                        aria-label={`${row.pageLabel} ${row.orderInPage}번째 대사 편집`}
                        className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-[0.7rem] leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                      />

                      {findings.length > 0 ? (
                        <ul className="mt-1.5 space-y-1">
                          {findings.map((finding) => (
                            <li
                              key={finding.id}
                              className="flex flex-wrap items-center gap-1.5 text-[0.6rem] leading-relaxed text-fg-3"
                            >
                              <span
                                className={cx(
                                  "shrink-0 rounded-full border px-1.5 py-px text-[0.54rem] font-semibold",
                                  severityClass(finding.severity)
                                )}
                              >
                                맞춤법 의심
                              </span>
                              <span className="min-w-0 flex-1">{finding.message}</span>
                              {finding.fix && !row.locked ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEdits((prev) => ({
                                      ...prev,
                                      [row.id]: applySpellFixToText(value, finding.fix!),
                                    }))
                                  }
                                  className="min-h-8 shrink-0 rounded-lg border border-line bg-panel px-2 text-[0.58rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                                >
                                  후보 적용: “{finding.fix.replacement}”
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {structureRowId === row.id && !row.locked ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2">
                          {onSplitText ? (
                            <button
                              type="button"
                              disabled={!selection || selection.start <= 0 || selection.start >= value.length}
                              onClick={() =>
                                selection && onSplitText(row.pageId, row.id, value, selection.start)
                              }
                              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-[0.6rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Scissors size={12} aria-hidden /> 커서에서 나누기
                            </button>
                          ) : null}
                          {onMergeWithNext ? (
                            <button
                              type="button"
                              onClick={() => onMergeWithNext(row.pageId, row.id, value)}
                              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-[0.6rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                            >
                              <Combine size={12} aria-hidden /> 다음 대사와 합치기
                            </button>
                          ) : null}
                          {onTransferElement && pages.length > 1 ? (
                            <>
                              <select
                                value={transferTarget}
                                onChange={(event) =>
                                  setTransferTargetByItem((prev) => ({
                                    ...prev,
                                    [row.id]: event.target.value,
                                  }))
                                }
                                aria-label="옮길 페이지"
                                className="min-h-9 rounded-lg border border-line bg-panel px-1.5 text-[0.6rem] text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                              >
                                {pages.map((page, pageIndex) =>
                                  page.id === row.pageId ? null : (
                                    <option key={page.id} value={page.id}>
                                      {pageIndex + 1}페이지
                                    </option>
                                  )
                                )}
                              </select>
                              <button
                                type="button"
                                disabled={!transferTarget}
                                onClick={() =>
                                  transferTarget &&
                                  onTransferElement(row.pageId, row.id, transferTarget, "move", value)
                                }
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-[0.6rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
                              >
                                <ArrowRight size={12} aria-hidden /> 이동
                              </button>
                              <button
                                type="button"
                                disabled={!transferTarget}
                                onClick={() =>
                                  transferTarget &&
                                  onTransferElement(row.pageId, row.id, transferTarget, "copy", value)
                                }
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-[0.6rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
                              >
                                <Copy size={12} aria-hidden /> 복사
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {lastResult ? (
          <div className="mt-3 rounded-xl border border-line bg-card/55 p-2.5" aria-live="polite">
            <p className="flex items-center gap-1.5 text-[0.66rem] font-bold text-fg">
              <Check size={13} aria-hidden className="text-good" />
              저장 결과 · {lastResult.applied.length}개 반영
              {lastResult.changedPageIds.length > 0
                ? ` (${lastResult.changedPageIds.length}페이지)`
                : ""}
            </p>
            {lastResult.conflicts.length > 0 ? (
              <ul className="mt-1.5 space-y-1.5">
                {lastResult.conflicts.map((conflict) => (
                  <li key={`${conflict.pageId}:${conflict.elementId}:${conflict.reason}`} className="text-[0.6rem] leading-relaxed text-fg-3">
                    <span className="inline-flex items-center gap-0.5 font-semibold text-warn">
                      <TriangleAlert size={11} aria-hidden /> 저장 안 됨
                    </span>{" "}
                    {conflict.message}
                    {conflict.currentText !== undefined ? (
                      <span className="mt-0.5 block">
                        지금 내용: “{conflict.currentText}” · 표면에서 쓰던 내용: “
                        {conflict.attemptedText}”
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[0.6rem] text-fg-3">충돌 없이 모두 반영됐어요.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 border-t border-line/60 px-3 py-2">
        <button
          type="button"
          disabled={Object.keys(edits).length === 0}
          onClick={() => {
            setEdits({});
            setLastResult(null);
          }}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-[0.66rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw size={13} aria-hidden /> 변경 취소
        </button>
        <button
          type="button"
          disabled={drafts.length === 0}
          onClick={saveAll}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-2.5 text-[0.7rem] font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save size={14} aria-hidden />
          모두 저장{drafts.length > 0 ? ` (${drafts.length}개)` : ""}
        </button>
      </div>
    </section>
  );
}
