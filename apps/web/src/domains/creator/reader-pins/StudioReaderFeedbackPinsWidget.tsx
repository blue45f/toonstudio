/**
 * 독자·어시스턴트 오탈자·작화 피드백 핀 수집 & 컷 점프 위젯.
 *
 * 컷 좌표 (x, y), 4종 카테고리(오탈자·작화수정·말풍선·연출제안), 상태(열림·해결됨) 관리와
 * JSON 공유·병합, 원클릭 해당 컷/좌표 점프 콜백을 제공한다.
 */

import {
  Check,
  CheckCircle2,
  ClipboardCopy,
  Crosshair,
  FileJson2,
  MapPin,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";

import {
  clampNormalizedCoordinate,
  createReaderFeedbackPin,
  exportReaderFeedbackPinsJson,
  filterReaderFeedbackPins,
  mergeReaderFeedbackPins,
  parseReaderFeedbackPinsJson,
  READER_FEEDBACK_AUTHOR_ROLE_LABELS,
  READER_FEEDBACK_AUTHOR_ROLES,
  READER_FEEDBACK_PIN_CATEGORIES,
  READER_FEEDBACK_PIN_CATEGORY_LABELS,
  READER_FEEDBACK_PIN_STATUS_LABELS,
  removeReaderFeedbackPin,
  resolveReaderFeedbackPinJumpTarget,
  summarizeReaderFeedbackPins,
  updateReaderFeedbackPinStatus,
  type ReaderFeedbackAuthorRole,
  type ReaderFeedbackPin,
  type ReaderFeedbackPinCategory,
  type ReaderFeedbackPinJumpTarget,
  type ReaderFeedbackPinStatus,
} from "./reader-feedback-pins-model";

import { cn } from "@/shared/lib/utils";

export interface ReaderFeedbackPinPageOption {
  readonly id: string;
  readonly label: string;
}

export interface StudioReaderFeedbackPinsWidgetProps {
  readonly pages: readonly ReaderFeedbackPinPageOption[];
  readonly currentPageId: string;
  readonly pins: readonly ReaderFeedbackPin[];
  readonly activePinId?: string | null;
  readonly placementMode?: boolean;
  readonly draftCoordinate?: { readonly pageId: string; readonly x: number; readonly y: number } | null;
  readonly onChangePins: (nextPins: readonly ReaderFeedbackPin[]) => void;
  readonly onTogglePlacementMode?: () => void;
  readonly onJumpToPin: (target: ReaderFeedbackPinJumpTarget) => void;
  readonly onOpenPinInEditor?: (target: ReaderFeedbackPinJumpTarget) => void;
  readonly episodeLabel?: string;
}

export function StudioReaderFeedbackPinsWidget({
  pages,
  currentPageId,
  pins,
  activePinId = null,
  placementMode = false,
  draftCoordinate = null,
  onChangePins,
  onTogglePlacementMode,
  onJumpToPin,
  onOpenPinInEditor,
  episodeLabel,
}: StudioReaderFeedbackPinsWidgetProps): ReactElement {
  const defaultPageId = pages.find((page) => page.id === currentPageId)?.id ?? pages[0]?.id ?? "";

  const [categoryFilter, setCategoryFilter] = useState<ReaderFeedbackPinCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ReaderFeedbackPinStatus | "all">("all");
  const [selectedPageId, setSelectedPageId] = useState<string>(defaultPageId);
  const [cutIndex, setCutIndex] = useState<number>(1);
  const [coordXPercent, setCoordXPercent] = useState<number>(50);
  const [coordYPercent, setCoordYPercent] = useState<number>(50);
  const [category, setCategory] = useState<ReaderFeedbackPinCategory>("typo");
  const [authorRole, setAuthorRole] = useState<ReaderFeedbackAuthorRole>("assistant");
  const [authorName, setAuthorName] = useState("");
  const [comment, setComment] = useState("");
  const [jsonDrawerOpen, setJsonDrawerOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  const effectivePageId =
    draftCoordinate?.pageId
    || (pages.some((page) => page.id === selectedPageId) ? selectedPageId : defaultPageId);
  const effectiveXPercent = draftCoordinate ? Math.round(draftCoordinate.x * 100) : coordXPercent;
  const effectiveYPercent = draftCoordinate ? Math.round(draftCoordinate.y * 100) : coordYPercent;

  const pageLabelMap = useMemo(
    () => new Map(pages.map((page) => [page.id, page.label])),
    [pages],
  );
  const summary = useMemo(() => summarizeReaderFeedbackPins(pins), [pins]);
  const visiblePins = useMemo(
    () =>
      filterReaderFeedbackPins(pins, {
        category: categoryFilter,
        status: statusFilter,
      }),
    [categoryFilter, pins, statusFilter],
  );
  const exportedJson = useMemo(
    () => exportReaderFeedbackPinsJson(pins, { episodeLabel }),
    [episodeLabel, pins],
  );

  function handleAddPin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setErrorText(null);
    if (!effectivePageId) {
      setErrorText("핀을 남길 페이지가 없습니다.");
      return;
    }
    if (!comment.trim()) {
      setErrorText("피드백 내용을 입력해 주세요.");
      return;
    }
    const created = createReaderFeedbackPin({
      pageId: effectivePageId,
      cutIndex,
      x: clampNormalizedCoordinate(effectiveXPercent / 100),
      y: clampNormalizedCoordinate(effectiveYPercent / 100),
      category,
      authorRole,
      authorName,
      comment,
    });
    const nextPins = [created, ...pins];
    onChangePins(nextPins);
    setComment("");
    setNotice(
      `${READER_FEEDBACK_PIN_CATEGORY_LABELS[created.category]} 핀을 ${created.cutIndex}컷 (${Math.round(created.x * 100)}%, ${Math.round(created.y * 100)}%)에 추가했습니다.`,
    );
  }

  async function handleCopyJson(): Promise<void> {
    setErrorText(null);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportedJson);
      }
      setCopiedJson(true);
      setNotice(`피드백 핀 ${pins.length}건을 JSON으로 복사했습니다.`);
    } catch {
      setErrorText("클립보드에 복사하지 못했습니다. 아래 JSON 텍스트를 직접 복사해 주세요.");
    }
  }

  function handleMergeJson(): void {
    setErrorText(null);
    const parsed = parseReaderFeedbackPinsJson(importJsonText);
    if (!parsed.ok) {
      setErrorText(parsed.errorKo);
      return;
    }
    const result = mergeReaderFeedbackPins(pins, parsed.pins);
    onChangePins(result.merged);
    setImportJsonText("");
    setNotice(
      `JSON 병합 완료: 추가 ${result.addedCount}건 · 갱신 ${result.updatedCount}건 · 중복 제외 ${result.skippedDuplicateCount}건`,
    );
  }

  return (
    <section
      data-testid="studio-reader-feedback-pins-widget"
      aria-label="독자·어시스턴트 피드백 핀"
      className="mt-3 border-t border-line pt-3 text-xs text-fg"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <MapPin size={14} className="text-accent" aria-hidden />
          <h4 className="text-xs font-bold text-fg">독자·어시스턴트 피드백 핀</h4>
        </div>
        <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.64rem] font-semibold tabular-nums text-fg-2">
          열림 {summary.openCount} · 해결 {summary.resolvedCount}
        </span>
      </div>

      {/* 핀 추가 폼 */}
      <form onSubmit={handleAddPin} className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/70 p-2.5">
        <div className="grid grid-cols-2 gap-1.5">
          <label className="space-y-1">
            <span className="block text-[0.64rem] font-semibold text-fg-3">페이지</span>
            <select
              aria-label="피드백 대상 페이지"
              value={effectivePageId}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setSelectedPageId(event.target.value)
              }
              className="min-h-11 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg outline-none focus:border-accent"
            >
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[0.64rem] font-semibold text-fg-3">컷 번호</span>
            <input
              type="number"
              min={1}
              max={999}
              aria-label="피드백 대상 컷 번호"
              value={cutIndex}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setCutIndex(Math.max(1, Number(event.target.value) || 1))
              }
              className="min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="space-y-1">
            <span className="block text-[0.64rem] font-semibold text-fg-3">분류</span>
            <select
              aria-label="피드백 카테고리"
              value={category}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setCategory(event.target.value as ReaderFeedbackPinCategory)
              }
              className="min-h-11 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg outline-none focus:border-accent"
            >
              {READER_FEEDBACK_PIN_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {READER_FEEDBACK_PIN_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[0.64rem] font-semibold text-fg-3">작성자 역할</span>
            <select
              aria-label="피드백 작성자 역할"
              value={authorRole}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setAuthorRole(event.target.value as ReaderFeedbackAuthorRole)
              }
              className="min-h-11 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg outline-none focus:border-accent"
            >
              {READER_FEEDBACK_AUTHOR_ROLES.map((role) => (
                <option key={role} value={role}>
                  {READER_FEEDBACK_AUTHOR_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="space-y-1">
            <span className="block text-[0.64rem] font-semibold text-fg-3">좌표 X (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              aria-label="핀 X 좌표 퍼센트"
              value={effectiveXPercent}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setCoordXPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))
              }
              className="min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[0.64rem] font-semibold text-fg-3">좌표 Y (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              aria-label="핀 Y 좌표 퍼센트"
              value={effectiveYPercent}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setCoordYPercent(Math.min(100, Math.max(0, Number(event.target.value) || 0)))
              }
              className="min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg outline-none focus:border-accent"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="block text-[0.64rem] font-semibold text-fg-3">작성자 이름(선택)</span>
          <input
            type="text"
            value={authorName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setAuthorName(event.target.value)}
            placeholder="예: 채색 어시, 베타 독자"
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-[0.64rem] font-semibold text-fg-3">피드백 내용</span>
          <textarea
            rows={2}
            value={comment}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setComment(event.target.value)}
            placeholder="예: 말풍선 대사 '갔읍니다' → '갔습니다' 오탈자 수정"
            className="w-full resize-y rounded-lg border border-line bg-panel px-2.5 py-2 text-xs leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {onTogglePlacementMode ? (
            <button
              type="button"
              aria-pressed={placementMode}
              onClick={onTogglePlacementMode}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                placementMode
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised",
              )}
            >
              <Crosshair size={14} aria-hidden />
              {placementMode ? "미리보기 클릭 대기 중" : "미리보기 클릭 지정"}
            </button>
          ) : null}
          <button
            type="submit"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Plus size={14} aria-hidden />
            피드백 핀 추가
          </button>
        </div>
      </form>

      {/* 필터 바 */}
      <div className="mt-2.5 space-y-1.5">
        <div className="flex flex-wrap gap-1" role="group" aria-label="피드백 카테고리 필터">
          {(["all", ...READER_FEEDBACK_PIN_CATEGORIES] as const).map((cat) => {
            const active = categoryFilter === cat;
            const label =
              cat === "all"
                ? `전체 ${summary.total}`
                : `${READER_FEEDBACK_PIN_CATEGORY_LABELS[cat]} ${summary.byCategory[cat]}`;
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={active}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg border px-2 text-[0.68rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="피드백 상태 필터">
          {(["all", "open", "resolved"] as const).map((status) => {
            const active = statusFilter === status;
            const label =
              status === "all"
                ? "모든 상태"
                : READER_FEEDBACK_PIN_STATUS_LABELS[status];
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg border px-2.5 text-[0.68rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                {label}
              </button>
            );
          })}
          <button
            type="button"
            aria-expanded={jsonDrawerOpen}
            onClick={() => setJsonDrawerOpen((prev) => !prev)}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <FileJson2 size={14} aria-hidden />
            JSON 공유·병합
          </button>
        </div>
      </div>

      {/* JSON 공유 & 병합 섹션 */}
      {jsonDrawerOpen ? (
        <div
          data-testid="reader-pins-json-drawer"
          className="mt-2.5 space-y-2 rounded-xl border border-line bg-card p-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.68rem] font-bold text-fg">JSON 공유 내보내기</span>
            <button
              type="button"
              onClick={() => void handleCopyJson()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {copiedJson ? <Check size={13} aria-hidden /> : <ClipboardCopy size={13} aria-hidden />}
              JSON 복사
            </button>
          </div>
          <textarea
            readOnly
            aria-label="내보낼 피드백 핀 JSON"
            rows={4}
            value={exportedJson}
            className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 font-mono text-[0.64rem] text-fg-2"
          />
          <label className="block space-y-1">
            <span className="block text-[0.68rem] font-bold text-fg">
              외부 피드백 JSON 붙여넣기·병합
            </span>
            <textarea
              aria-label="병합할 피드백 핀 JSON 입력"
              rows={3}
              value={importJsonText}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setImportJsonText(event.target.value)
              }
              placeholder='{"schemaVersion":1,"kind":"toonstudio.reader-feedback-pins","pins":[...]}'
              className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 font-mono text-[0.64rem] text-fg outline-none placeholder:text-fg-3 focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={handleMergeJson}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-accent/60 bg-accent-soft px-3 text-xs font-bold text-accent hover:bg-accent/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Upload size={14} aria-hidden />
            JSON 병합 적용
          </button>
        </div>
      ) : null}

      {errorText ? (
        <p role="alert" className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-2 text-[0.68rem] font-semibold text-danger">
          {errorText}
        </p>
      ) : null}
      {notice ? (
        <p role="status" aria-live="polite" className="mt-2 text-[0.68rem] font-medium text-accent">
          {notice}
        </p>
      ) : null}

      {/* 핀 목록 */}
      <div className="mt-2.5 space-y-1.5">
        {visiblePins.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-2.5 py-4 text-center text-[0.68rem] text-fg-3">
            조건에 맞는 피드백 핀이 없습니다.
          </p>
        ) : (
          <ul className="space-y-1.5" aria-label="피드백 핀 목록">
            {visiblePins.map((pin) => {
              const target = resolveReaderFeedbackPinJumpTarget(pin);
              const isResolved = pin.status === "resolved";
              const isActive = pin.id === activePinId;
              const pageLabel = pageLabelMap.get(pin.pageId) ?? pin.pageId;
              return (
                <li
                  key={pin.id}
                  data-feedback-pin-item={pin.id}
                  className={cn(
                    "rounded-xl border p-2.5 transition-colors",
                    isActive
                      ? "border-accent bg-accent-soft/30"
                      : "border-line bg-card",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[0.62rem] font-bold text-fg">
                      {READER_FEEDBACK_PIN_CATEGORY_LABELS[pin.category]}
                    </span>
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[0.62rem] font-semibold",
                        isResolved
                          ? "border-good/40 bg-good/10 text-good"
                          : "border-accent/40 bg-accent-soft text-accent",
                      )}
                    >
                      {READER_FEEDBACK_PIN_STATUS_LABELS[pin.status]}
                    </span>
                    <span className="text-[0.62rem] font-medium tabular-nums text-fg-3">
                      {pageLabel} · {pin.cutIndex}컷 ({target.xPercent}%, {target.yPercent}%)
                    </span>
                  </div>
                  <p className="mt-1.5 text-[0.72rem] leading-relaxed text-fg">{pin.comment}</p>
                  <p className="mt-1 text-[0.62rem] text-fg-3">
                    {READER_FEEDBACK_AUTHOR_ROLE_LABELS[pin.authorRole]} · {pin.authorName}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onJumpToPin(target)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-accent/60 bg-accent-soft px-2.5 text-[0.68rem] font-bold text-accent hover:bg-accent/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Crosshair size={13} aria-hidden />
                      컷 위치 점프
                    </button>
                    {onOpenPinInEditor ? (
                      <button
                        type="button"
                        onClick={() => onOpenPinInEditor(target)}
                        className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-2.5 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        편집 컷 열기
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        onChangePins(
                          updateReaderFeedbackPinStatus(
                            pins,
                            pin.id,
                            isResolved ? "open" : "resolved",
                          ),
                        )
                      }
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {isResolved ? (
                        <>
                          <RotateCcw size={13} aria-hidden />
                          다시 열기
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={13} aria-hidden />
                          해결 표시
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`${pin.cutIndex}컷 피드백 핀 삭제`}
                      onClick={() => onChangePins(removeReaderFeedbackPin(pins, pin.id))}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-panel text-fg-3 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
