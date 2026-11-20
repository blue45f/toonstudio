/**
 * 스토리 에디터 전 페이지 대사 일괄 검색·치환 + `[컷 N]` 대본 시드 패널 (React.lazy 독립 모듈).
 *
 * - 전체 페이지 또는 현재 페이지 범위에서 대사를 실시간 검색하고 이전/다음 이동
 * - 단건 치환("이 항목 바꾸기") 및 일괄 치환("모두 바꾸기") + 1클릭 되돌리기
 * - 잠긴 대사 자동 보호 및 건수 안내
 * - 접이식 `[컷 N]` 대본 시드 영역에서 대본 -> 컷·말풍선 시드 및 캔버스 대사 역동기화 지원
 */
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Lock,
  Replace,
  ReplaceAll,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import {
  planDialogueReplace,
  type DialoguePageLike,
  type DialogueReplacePlan,
  type DialogueReplaceScope,
} from "./studio-dialogue-batch";
import {
  collectStoryDialogueMatches,
  replaceSingleStoryMatch,
  runStoryBatchFindReplace,
  seedPanelsFromScript,
  type SeededScriptCanvasResult,
  type StoryDialogueMatch,
} from "./studio-script-to-panels-seed";

import { cn } from "@/shared/lib/utils";

export interface StudioStoryEditorFindReplaceProps {
  readonly pages: readonly DialoguePageLike[];
  readonly currentPageId: string;
  readonly disabled?: boolean;
  readonly className?: string;
  /** 단건/일괄 치환 결과를 호스트 문서 상태에 단일 히스토리 커밋으로 반영한다. */
  readonly onApplyPages: (
    nextPages: readonly DialoguePageLike[],
    summary: { readonly replacedCount: number; readonly plan?: DialogueReplacePlan },
  ) => void;
  /** 매치 항목 클릭 또는 이전/다음 이동 시 해당 페이지·말풍선으로 점프한다. */
  readonly onNavigateMatch?: (pageId: string, elementId: string) => void;
  /** 대본 `[컷 N]` 시드 결과를 호스트에 넘긴다(선택). */
  readonly onSeedFromScript?: (result: SeededScriptCanvasResult) => void;
}

const INTERACTIVE_TRANSITION =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:transform-none";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function renderExcerptSegments(match: StoryDialogueMatch): {
  readonly before: string;
  readonly hit: string;
  readonly after: string;
} {
  const windowStart = Math.max(0, match.start - 14);
  const windowEnd = Math.min(match.fullText.length, match.end + 18);
  const prefix = windowStart > 0 ? "…" : "";
  const suffix = windowEnd < match.fullText.length ? "…" : "";
  return {
    before: `${prefix}${match.fullText.slice(windowStart, match.start)}`,
    hit: match.fullText.slice(match.start, match.end),
    after: `${match.fullText.slice(match.end, windowEnd)}${suffix}`,
  };
}

export function StudioStoryEditorFindReplace({
  pages,
  currentPageId,
  disabled = false,
  className,
  onApplyPages,
  onNavigateMatch,
  onSeedFromScript,
}: StudioStoryEditorFindReplaceProps): ReactElement {
  const [findQuery, setFindQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [scope, setScope] = useState<DialogueReplaceScope>("all");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lastUndoPages, setLastUndoPages] = useState<readonly DialoguePageLike[] | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState("");

  const matches = useMemo(
    () =>
      collectStoryDialogueMatches(pages, findQuery, {
        caseSensitive,
        scope,
        currentPageId,
      }),
    [caseSensitive, currentPageId, findQuery, pages, scope],
  );

  const replacePlan = useMemo(
    () =>
      planDialogueReplace(pages, findQuery, replaceText, {
        caseSensitive,
        scope,
        currentPageId,
        includeLocked: false,
      }),
    [caseSensitive, currentPageId, findQuery, pages, replaceText, scope],
  );

  const clampedActiveIndex =
    matches.length === 0 ? 0 : Math.min(activeIndex, matches.length - 1);
  const activeMatch = matches[clampedActiveIndex] ?? null;

  const jumpToIndex = useCallback(
    (nextIndex: number) => {
      if (matches.length === 0) return;
      const wrapped = ((nextIndex % matches.length) + matches.length) % matches.length;
      setActiveIndex(wrapped);
      const target = matches[wrapped];
      if (target) {
        onNavigateMatch?.(target.pageId, target.elementId);
      }
    },
    [matches, onNavigateMatch],
  );

  const handleFindKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      jumpToIndex(clampedActiveIndex + (event.shiftKey ? -1 : 1));
    },
    [clampedActiveIndex, jumpToIndex],
  );

  const handleReplaceCurrent = useCallback(() => {
    if (disabled || !activeMatch || activeMatch.locked) return;
    const nextPages = replaceSingleStoryMatch(pages, activeMatch, replaceText);
    if (nextPages === pages) return;
    setLastUndoPages(pages);
    setStatusMessage(
      `${activeMatch.pageIndex + 1}페이지 대사 1건을 "${replaceText}"(으)로 바꿨어요.`,
    );
    onApplyPages(nextPages, { replacedCount: 1 });
  }, [activeMatch, disabled, onApplyPages, pages, replaceText]);

  const handleReplaceAll = useCallback(() => {
    if (disabled || replacePlan.totalCount === 0) return;
    const { pages: nextPages, plan } = runStoryBatchFindReplace(
      pages,
      findQuery,
      replaceText,
      {
        caseSensitive,
        scope,
        currentPageId,
        includeLocked: false,
      },
    );
    if (nextPages === pages) return;
    setLastUndoPages(pages);
    setStatusMessage(
      `${plan.pageCount}페이지에서 총 ${plan.totalCount}건을 일괄 치환했어요.`,
    );
    onApplyPages(nextPages, { replacedCount: plan.totalCount, plan });
  }, [
    caseSensitive,
    currentPageId,
    disabled,
    findQuery,
    onApplyPages,
    pages,
    replacePlan.totalCount,
    replaceText,
    scope,
  ]);

  const handleUndoLastReplace = useCallback(() => {
    if (disabled || !lastUndoPages) return;
    onApplyPages(lastUndoPages, { replacedCount: 0 });
    setLastUndoPages(null);
    setStatusMessage("직전 대사 치환을 되돌렸어요.");
  }, [disabled, lastUndoPages, onApplyPages]);

  const handleSeedScript = useCallback(() => {
    if (disabled || !onSeedFromScript || !scriptDraft.trim()) return;
    const seeded = seedPanelsFromScript(scriptDraft);
    onSeedFromScript(seeded);
    setStatusMessage(
      `대본에서 ${seeded.totalCutCount}컷 · 대사 ${seeded.totalDialogueCount}개를 시드했어요.`,
    );
  }, [disabled, onSeedFromScript, scriptDraft]);

  return (
    <section
      aria-label="스토리 에디터 대사 검색 및 치환"
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-2xl border border-line bg-panel p-3 text-fg [word-break:keep-all]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Search size={15} aria-hidden className="text-accent" />
          <h2 className="text-sm font-bold text-fg">전 페이지 대사 검색 · 치환</h2>
        </div>

        <div role="group" aria-label="검색 범위" className="inline-flex gap-1">
          <button
            type="button"
            aria-pressed={scope === "all"}
            disabled={disabled}
            onClick={() => {
              setScope("all");
              setActiveIndex(0);
            }}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-xs font-semibold",
              INTERACTIVE_TRANSITION,
              FOCUS_RING,
              scope === "all"
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            전체 페이지
          </button>
          <button
            type="button"
            aria-pressed={scope === "current"}
            disabled={disabled}
            onClick={() => {
              setScope("current");
              setActiveIndex(0);
            }}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-xs font-semibold",
              INTERACTIVE_TRANSITION,
              FOCUS_RING,
              scope === "current"
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            현재 페이지
          </button>
        </div>
      </div>

      {/* 찾기 입력 + 이전/다음 매치 이동 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor="story-find-input">
          찾을 대사
        </label>
        <input
          id="story-find-input"
          type="text"
          value={findQuery}
          disabled={disabled}
          onChange={(event) => {
            setFindQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleFindKeyDown}
          placeholder="찾을 대사나 인물 이름 입력"
          className={cn(
            "min-h-11 min-w-44 flex-1 rounded-lg border border-line bg-card px-3 text-xs text-fg placeholder:text-fg-3",
            FOCUS_RING,
          )}
        />

        <span
          aria-live="polite"
          className="min-w-16 text-center text-xs font-semibold tabular-nums text-fg-2"
        >
          {matches.length > 0 ? `${clampedActiveIndex + 1} / ${matches.length}건` : "0건"}
        </span>

        <button
          type="button"
          disabled={disabled || matches.length === 0}
          onClick={() => jumpToIndex(clampedActiveIndex - 1)}
          aria-label="이전 일치 항목"
          className={cn(
            "grid min-h-11 min-w-11 place-items-center rounded-lg border border-line bg-card text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-40",
            INTERACTIVE_TRANSITION,
            FOCUS_RING,
          )}
        >
          <ChevronUp size={15} aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled || matches.length === 0}
          onClick={() => jumpToIndex(clampedActiveIndex + 1)}
          aria-label="다음 일치 항목"
          className={cn(
            "grid min-h-11 min-w-11 place-items-center rounded-lg border border-line bg-card text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-40",
            INTERACTIVE_TRANSITION,
            FOCUS_RING,
          )}
        >
          <ChevronDown size={15} aria-hidden />
        </button>
      </div>

      {/* 바꿀 내용 입력 + 단건/일괄 치환 버튼 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor="story-replace-input">
          바꿀 대사
        </label>
        <input
          id="story-replace-input"
          type="text"
          value={replaceText}
          disabled={disabled}
          onChange={(event) => setReplaceText(event.target.value)}
          placeholder="바꿀 내용 입력"
          className={cn(
            "min-h-11 min-w-44 flex-1 rounded-lg border border-line bg-card px-3 text-xs text-fg placeholder:text-fg-3",
            FOCUS_RING,
          )}
        />

        <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2">
          <input
            type="checkbox"
            checked={caseSensitive}
            disabled={disabled}
            onChange={(event) => {
              setCaseSensitive(event.target.checked);
              setActiveIndex(0);
            }}
            className="size-4 accent-accent"
          />
          <span>대소문자 구분</span>
        </label>

        <button
          type="button"
          disabled={disabled || !activeMatch || activeMatch.locked}
          onClick={handleReplaceCurrent}
          className={cn(
            "inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40",
            INTERACTIVE_TRANSITION,
            FOCUS_RING,
          )}
        >
          <Replace size={14} aria-hidden />
          <span>이 항목 바꾸기</span>
        </button>

        <button
          type="button"
          disabled={disabled || replacePlan.totalCount === 0}
          onClick={handleReplaceAll}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-bold tabular-nums text-on-accent enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
            INTERACTIVE_TRANSITION,
            FOCUS_RING,
          )}
        >
          <ReplaceAll size={14} aria-hidden />
          <span>모두 바꾸기 ({replacePlan.totalCount}건)</span>
        </button>
      </div>

      {/* 잠긴 대사 제외 경고 및 직전 작업 안내 */}
      {replacePlan.lockedSkipped > 0 ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-warn tabular-nums">
          <Lock size={13} aria-hidden />
          잠긴 대사 {replacePlan.lockedSkipped}건은 보호되어 일괄 치환에서 제외됩니다.
        </p>
      ) : null}

      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs text-fg"
        >
          <span>{statusMessage}</span>
          {lastUndoPages ? (
            <button
              type="button"
              disabled={disabled}
              onClick={handleUndoLastReplace}
              className={cn(
                "inline-flex min-h-11 items-center gap-1 rounded-lg border border-accent/50 bg-panel px-2.5 text-xs font-bold text-accent hover:bg-raised",
                INTERACTIVE_TRANSITION,
                FOCUS_RING,
              )}
            >
              <RotateCcw size={13} aria-hidden />
              치환 되돌리기
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 검색 결과 목록 */}
      {findQuery.length > 0 && matches.length > 0 ? (
        <ul
          aria-label="일치하는 대사 목록"
          className="max-h-48 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-line bg-card p-1.5"
        >
          {matches.slice(0, 50).map((match, index) => {
            const excerpt = renderExcerptSegments(match);
            const isCurrent = index === clampedActiveIndex;
            return (
              <li key={match.matchId}>
                <button
                  type="button"
                  onClick={() => jumpToIndex(index)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs",
                    INTERACTIVE_TRANSITION,
                    FOCUS_RING,
                    isCurrent
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-transparent bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-fg-2">
                    {match.pageIndex + 1}p
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {excerpt.before}
                    <mark className="rounded bg-accent px-0.5 text-on-accent">
                      {excerpt.hit}
                    </mark>
                    {excerpt.after}
                  </span>
                  {match.locked ? (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-warn">
                      <Lock size={11} aria-hidden /> 잠김
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* 접이식 [컷 N] 대본 시드 입력 */}
      {onSeedFromScript ? (
        <details className="rounded-xl border border-line bg-card px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-fg-2">
            <FileText size={14} aria-hidden className="text-accent" />
            <span>대본([컷 N])에서 컷·말풍선 자동 시드</span>
          </summary>
          <div className="mt-2 flex flex-col gap-2 pb-1">
            <label className="sr-only" htmlFor="story-script-seed-textarea">
              대본 입력
            </label>
            <textarea
              id="story-script-seed-textarea"
              rows={4}
              value={scriptDraft}
              disabled={disabled}
              onChange={(event) => setScriptDraft(event.target.value)}
              placeholder={"[컷 1 - 로우 앵글]\n민수: 오늘 늦겠네!\n나레이션: 비가 쏟아지기 시작했다."}
              className={cn(
                "w-full rounded-lg border border-line bg-panel p-2.5 text-xs leading-relaxed text-fg placeholder:text-fg-3",
                FOCUS_RING,
              )}
            />
            <button
              type="button"
              disabled={disabled || scriptDraft.trim().length === 0}
              onClick={handleSeedScript}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-bold text-on-accent disabled:opacity-40",
                INTERACTIVE_TRANSITION,
                FOCUS_RING,
              )}
            >
              <Sparkles size={14} aria-hidden />
              <span>대본으로 컷·말풍선 시드</span>
            </button>
          </div>
        </details>
      ) : null}
    </section>
  );
}

export default StudioStoryEditorFindReplace;
