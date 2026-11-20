/**
 * 일관성 소재 스트립 (Plotr 패리티 + 초과).
 *
 * - 3분류(인물 / 배경 / 소품) 필터 및 컷별 참조 핀 토글
 * - 2단계 X 삭제:
 *   1차 클릭(이미지 있음): 이미지만 비워 빈 슬롯(+)으로 전환 + 되돌리기 지원
 *   2차 클릭(빈 슬롯): 슬롯 자체 삭제 + 되돌리기(Undo) 지원
 * - 타 프로젝트 이름 기준 자동 매칭 가져오기(정규화 이름 대조, 빈 슬롯 우선 비파괴 채움)
 *
 * 독립 모듈로 설계되어 React.lazy 동적 import 경계 뒤에서 바로 마운트할 수 있다.
 */
import {
  Box,
  FolderInput,
  ImagePlus,
  Mountain,
  Pin,
  Plus,
  RotateCcw,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
  type DragEvent,
  type ReactElement,
} from "react";

import { cn } from "@/shared/lib/utils";

export type ConsistencyAssetCategory = "character" | "background" | "prop";

export interface ConsistencyAssetSlot {
  readonly id: string;
  readonly category: ConsistencyAssetCategory;
  readonly name: string;
  /** undefined면 빈 슬롯(+) 상태. 1차 X로 undefined 복귀, 2차 X로 슬롯 삭제. */
  readonly imageRef?: string;
  readonly styleNotes?: string;
  readonly pinnedCutIds: readonly string[];
}

export interface ExternalProjectAssetCatalog {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly slots: readonly ConsistencyAssetSlot[];
}

export interface AssetNameMatchPreviewItem {
  readonly targetSlotId: string;
  readonly sourceSlot: ConsistencyAssetSlot;
  readonly willOverwriteExisting: boolean;
}

export interface StudioConsistencyAssetStripProps {
  readonly slots: readonly ConsistencyAssetSlot[];
  readonly activeCutId?: string | null;
  readonly externalProjects?: readonly ExternalProjectAssetCatalog[];
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onChangeSlots: (nextSlots: readonly ConsistencyAssetSlot[]) => void;
  readonly onRequestImagePick?: (slotId: string) => void;
  readonly onDropImageData?: (slotId: string, imageRef: string) => void;
}

interface UndoEntry {
  readonly message: string;
  readonly previousSlots: readonly ConsistencyAssetSlot[];
}

interface CategoryMeta {
  readonly id: ConsistencyAssetCategory;
  readonly label: string;
  readonly Icon: LucideIcon;
}

const CATEGORIES: readonly CategoryMeta[] = Object.freeze([
  { id: "character", label: "인물", Icon: UserRound },
  { id: "background", label: "배경", Icon: Mountain },
  { id: "prop", label: "소품", Icon: Box },
]);

const INTERACTIVE_TRANSITION =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:transform-none";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function normalizeAssetNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/gu, "");
}

function categoryLabel(category: ConsistencyAssetCategory): string {
  return CATEGORIES.find((entry) => entry.id === category)?.label ?? "소품";
}

function computeNameMatches(
  currentSlots: readonly ConsistencyAssetSlot[],
  sourceSlots: readonly ConsistencyAssetSlot[],
  overwriteFilled: boolean,
): readonly AssetNameMatchPreviewItem[] {
  const sourceByKey = new Map<string, ConsistencyAssetSlot>();
  for (const source of sourceSlots) {
    if (!source.imageRef) continue;
    const key = normalizeAssetNameKey(source.name);
    if (key && !sourceByKey.has(key)) {
      sourceByKey.set(key, source);
    }
  }

  const matches: AssetNameMatchPreviewItem[] = [];
  for (const target of currentSlots) {
    const key = normalizeAssetNameKey(target.name);
    if (!key) continue;
    const matched = sourceByKey.get(key);
    if (!matched || !matched.imageRef) continue;
    const hasExisting = Boolean(target.imageRef);
    if (hasExisting && !overwriteFilled) continue;
    matches.push({
      targetSlotId: target.id,
      sourceSlot: matched,
      willOverwriteExisting: hasExisting,
    });
  }
  return matches;
}

function createNextSlotId(
  category: ConsistencyAssetCategory,
  existing: readonly ConsistencyAssetSlot[],
): string {
  const used = new Set(existing.map((slot) => slot.id));
  let sequence = existing.length + 1;
  while (used.has(`asset-${category}-${sequence}`)) {
    sequence += 1;
  }
  return `asset-${category}-${sequence}`;
}

export function StudioConsistencyAssetStrip({
  slots,
  activeCutId = null,
  externalProjects = [],
  disabled = false,
  className,
  onChangeSlots,
  onRequestImagePick,
  onDropImageData,
}: StudioConsistencyAssetStripProps): ReactElement {
  const [activeCategory, setActiveCategory] = useState<ConsistencyAssetCategory | "all">("all");
  const [newSlotName, setNewSlotName] = useState("");
  const [newSlotCategory, setNewSlotCategory] = useState<ConsistencyAssetCategory>("character");
  const [importOpen, setImportOpen] = useState(false);
  const [selectedExternalProjectId, setSelectedExternalProjectId] = useState<string>(
    externalProjects[0]?.projectId ?? "",
  );
  const [overwriteFilledOnImport, setOverwriteFilledOnImport] = useState(false);
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);

  const countsByCategory = useMemo(() => {
    const counts: Record<ConsistencyAssetCategory, number> = {
      character: 0,
      background: 0,
      prop: 0,
    };
    for (const slot of slots) {
      counts[slot.category] += 1;
    }
    return counts;
  }, [slots]);

  const visibleSlots = useMemo(
    () =>
      activeCategory === "all"
        ? slots
        : slots.filter((slot) => slot.category === activeCategory),
    [activeCategory, slots],
  );

  const pinnedCountForActiveCut = useMemo(() => {
    if (!activeCutId) return 0;
    return slots.filter((slot) => slot.pinnedCutIds.includes(activeCutId)).length;
  }, [activeCutId, slots]);

  const activeExternalProject = useMemo(
    () =>
      externalProjects.find((project) => project.projectId === selectedExternalProjectId) ??
      externalProjects[0] ??
      null,
    [externalProjects, selectedExternalProjectId],
  );

  const importMatches = useMemo(() => {
    if (!activeExternalProject) return [];
    return computeNameMatches(slots, activeExternalProject.slots, overwriteFilledOnImport);
  }, [activeExternalProject, overwriteFilledOnImport, slots]);

  const handleTwoStageRemove = useCallback(
    (slot: ConsistencyAssetSlot) => {
      if (disabled) return;
      if (slot.imageRef) {
        // 1차 X: 이미지만 제거하고 빈 슬롯(+) 상태로 되돌린다.
        const nextSlots = slots.map((entry) =>
          entry.id === slot.id ? { ...entry, imageRef: undefined } : entry,
        );
        setUndoEntry({
          message: `"${slot.name}" 이미지를 비워 빈 슬롯으로 돌렸어요.`,
          previousSlots: slots,
        });
        onChangeSlots(nextSlots);
        return;
      }
      // 2차 X: 빈 슬롯을 삭제하고 되돌리기 스냅샷을 남긴다.
      const nextSlots = slots.filter((entry) => entry.id !== slot.id);
      setUndoEntry({
        message: `"${slot.name}" 슬롯을 삭제했어요.`,
        previousSlots: slots,
      });
      onChangeSlots(nextSlots);
    },
    [disabled, onChangeSlots, slots],
  );

  const handleUndo = useCallback(() => {
    if (!undoEntry || disabled) return;
    onChangeSlots(undoEntry.previousSlots);
    setUndoEntry(null);
  }, [disabled, onChangeSlots, undoEntry]);

  const handleTogglePin = useCallback(
    (slot: ConsistencyAssetSlot) => {
      if (!activeCutId || disabled) return;
      const isPinned = slot.pinnedCutIds.includes(activeCutId);
      const nextPinned = isPinned
        ? slot.pinnedCutIds.filter((cutId) => cutId !== activeCutId)
        : [...slot.pinnedCutIds, activeCutId];
      onChangeSlots(
        slots.map((entry) =>
          entry.id === slot.id ? { ...entry, pinnedCutIds: nextPinned } : entry,
        ),
      );
    },
    [activeCutId, disabled, onChangeSlots, slots],
  );

  const handleAddSlot = useCallback(() => {
    if (disabled) return;
    const trimmed = newSlotName.trim();
    if (!trimmed) return;
    const nextSlot: ConsistencyAssetSlot = {
      id: createNextSlotId(newSlotCategory, slots),
      category: newSlotCategory,
      name: trimmed,
      pinnedCutIds: activeCutId ? [activeCutId] : [],
    };
    onChangeSlots([...slots, nextSlot]);
    setNewSlotName("");
  }, [activeCutId, disabled, newSlotCategory, newSlotName, onChangeSlots, slots]);

  const handleApplyNameMatchedImport = useCallback(() => {
    if (disabled || !activeExternalProject || importMatches.length === 0) return;
    const matchByTargetId = new Map(
      importMatches.map((match) => [match.targetSlotId, match.sourceSlot]),
    );
    const nextSlots = slots.map((slot) => {
      const matched = matchByTargetId.get(slot.id);
      if (!matched) return slot;
      return {
        ...slot,
        imageRef: matched.imageRef,
        styleNotes: slot.styleNotes || matched.styleNotes,
      };
    });
    setUndoEntry({
      message: `"${activeExternalProject.projectTitle}"에서 이름 일치 소재 ${importMatches.length}개를 가져왔어요.`,
      previousSlots: slots,
    });
    onChangeSlots(nextSlots);
    setImportOpen(false);
  }, [activeExternalProject, disabled, importMatches, onChangeSlots, slots]);

  const handleSlotDrop = useCallback(
    (slotId: string, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverSlotId(null);
      if (disabled) return;
      const droppedUri =
        event.dataTransfer.getData("text/uri-list") ||
        event.dataTransfer.getData("text/plain");
      const trimmedUri = droppedUri.trim();
      if (!trimmedUri) return;
      if (onDropImageData) {
        onDropImageData(slotId, trimmedUri);
        return;
      }
      onChangeSlots(
        slots.map((entry) =>
          entry.id === slotId ? { ...entry, imageRef: trimmedUri } : entry,
        ),
      );
    },
    [disabled, onChangeSlots, onDropImageData, slots],
  );

  return (
    <section
      aria-label="일관성 소재 스트립"
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-2xl border border-line bg-panel p-2 text-fg [word-break:keep-all]",
        className,
      )}
    >
      {/* 상단 필터 탭 + 현재 컷 참조 개수 + 타 프로젝트 가져오기 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div role="tablist" aria-label="소재 분류 필터" className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "all"}
            onClick={() => setActiveCategory("all")}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold tabular-nums",
              INTERACTIVE_TRANSITION,
              FOCUS_RING,
              activeCategory === "all"
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <span>전체</span>
            <span>{slots.length}</span>
          </button>
          {CATEGORIES.map((category) => {
            const Icon = category.Icon;
            const selected = activeCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold tabular-nums",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                  selected
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <Icon size={14} aria-hidden />
                <span>{category.label}</span>
                <span>{countsByCategory[category.id]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeCutId ? (
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold tabular-nums text-fg-2">
              <Pin size={13} aria-hidden className="text-accent" />
              소재 {pinnedCountForActiveCut} 참조
            </span>
          ) : null}

          {externalProjects.length > 0 ? (
            <button
              type="button"
              disabled={disabled}
              aria-expanded={importOpen}
              onClick={() => setImportOpen((open) => !open)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-45",
                INTERACTIVE_TRANSITION,
                FOCUS_RING,
              )}
            >
              <FolderInput size={14} aria-hidden />
              <span>타 프로젝트 매칭 가져오기</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* 타 프로젝트 이름 기준 자동 매칭 가져오기 패널 */}
      {importOpen && activeExternalProject ? (
        <div
          aria-label="타 프로젝트 이름 매칭 가져오기"
          className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-card p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-fg-2" htmlFor="consistency-external-project">
              가져올 작품
            </label>
            <select
              id="consistency-external-project"
              value={activeExternalProject.projectId}
              disabled={disabled}
              onChange={(event) => setSelectedExternalProjectId(event.target.value)}
              className={cn(
                "min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg",
                FOCUS_RING,
              )}
            >
              {externalProjects.map((project) => (
                <option key={project.projectId} value={project.projectId}>
                  {project.projectTitle}
                </option>
              ))}
            </select>

            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2">
              <input
                type="checkbox"
                checked={overwriteFilledOnImport}
                disabled={disabled}
                onChange={(event) => setOverwriteFilledOnImport(event.target.checked)}
                className="size-4 accent-accent"
              />
              <span>채워진 슬롯도 덮어쓰기</span>
            </label>

            <button
              type="button"
              disabled={disabled || importMatches.length === 0}
              onClick={handleApplyNameMatchedImport}
              className={cn(
                "ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-bold tabular-nums text-on-accent disabled:cursor-not-allowed disabled:opacity-45",
                INTERACTIVE_TRANSITION,
                FOCUS_RING,
              )}
            >
              <FolderInput size={14} aria-hidden />
              이름 일치 {importMatches.length}건 가져오기
            </button>
          </div>

          {importMatches.length === 0 ? (
            <p className="text-xs text-fg-3">
              이름이 일치하며 채울 수 있는 슬롯이 없습니다. 슬롯 이름을 맞추거나 덮어쓰기 옵션을 확인해 주세요.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5" aria-label="이름 일치 미리보기">
              {importMatches.map((match) => (
                <li
                  key={match.targetSlotId}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1 text-xs text-fg-2"
                >
                  <span className="font-semibold text-fg">{match.sourceSlot.name}</span>
                  <span className="text-fg-3">
                    · {categoryLabel(match.sourceSlot.category)}
                  </span>
                  <span className="rounded bg-accent-soft px-1.5 py-px text-[11px] font-semibold text-accent">
                    {match.willOverwriteExisting ? "교체" : "빈 슬롯 채움"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* 되돌리기 배너 (1차 이미지 비우기 / 2차 슬롯 삭제 / 매칭 가져오기) */}
      {undoEntry ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs text-fg"
        >
          <span>{undoEntry.message}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={handleUndo}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/50 bg-panel px-3 text-xs font-bold text-accent hover:bg-raised",
              INTERACTIVE_TRANSITION,
              FOCUS_RING,
            )}
          >
            <RotateCcw size={13} aria-hidden />
            되돌리기
          </button>
        </div>
      ) : null}

      {/* 소재 카드 스트립 */}
      <div
        role="list"
        aria-label="소재 슬롯 목록"
        className="flex gap-2 overflow-x-auto overscroll-contain pb-1"
      >
        {visibleSlots.map((slot) => {
          const isFilled = Boolean(slot.imageRef);
          const isPinned = Boolean(activeCutId && slot.pinnedCutIds.includes(activeCutId));
          const isDragOver = dragOverSlotId === slot.id;
          return (
            <div
              key={slot.id}
              role="listitem"
              data-asset-slot-id={slot.id}
              data-asset-slot-state={isFilled ? "filled" : "empty"}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverSlotId(slot.id);
              }}
              onDragLeave={() => setDragOverSlotId(null)}
              onDrop={(event) => handleSlotDrop(slot.id, event)}
              className={cn(
                "flex w-40 shrink-0 flex-col gap-1.5 rounded-xl border bg-card p-2",
                INTERACTIVE_TRANSITION,
                isDragOver
                  ? "border-accent bg-accent-soft"
                  : isPinned
                    ? "border-accent/60"
                    : "border-line",
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold text-fg-3">
                    {categoryLabel(slot.category)}
                  </span>
                  <p className="truncate text-xs font-bold text-fg">{slot.name}</p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleTwoStageRemove(slot)}
                  aria-label={
                    isFilled ? `${slot.name} 이미지 비우기` : `${slot.name} 슬롯 삭제`
                  }
                  title={isFilled ? "1차 클릭: 이미지만 비우기" : "2차 클릭: 슬롯 삭제"}
                  data-remove-stage={isFilled ? "clear-image" : "delete-slot"}
                  className={cn(
                    "grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg border border-line bg-panel text-fg-2 hover:border-bad/50 hover:bg-bad/15 hover:text-bad disabled:opacity-45",
                    INTERACTIVE_TRANSITION,
                    FOCUS_RING,
                  )}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>

              {isFilled ? (
                <div className="relative h-20 w-full overflow-hidden rounded-lg bg-raised outline-1 -outline-offset-1 outline-line">
                  <img
                    src={slot.imageRef}
                    alt={`${slot.name} 참조 이미지`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRequestImagePick?.(slot.id)}
                  aria-label={`${slot.name} 이미지 채우기`}
                  className={cn(
                    "flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong bg-panel text-xs font-semibold text-fg-2 hover:border-accent hover:bg-raised hover:text-accent disabled:opacity-45",
                    INTERACTIVE_TRANSITION,
                    FOCUS_RING,
                  )}
                >
                  <ImagePlus size={18} aria-hidden />
                  <span>+ 이미지 넣기</span>
                </button>
              )}

              {activeCutId ? (
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={isPinned}
                  onClick={() => handleTogglePin(slot)}
                  className={cn(
                    "inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border text-xs font-semibold",
                    INTERACTIVE_TRANSITION,
                    FOCUS_RING,
                    isPinned
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  <Pin size={13} aria-hidden />
                  <span>{isPinned ? "현재 컷 참조 중" : "이 컷에 참조"}</span>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 새 소재 슬롯 추가 행 */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleAddSlot();
        }}
        className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-2"
      >
        <label className="sr-only" htmlFor="consistency-new-slot-category">
          새 소재 분류
        </label>
        <select
          id="consistency-new-slot-category"
          value={newSlotCategory}
          disabled={disabled}
          onChange={(event) =>
            setNewSlotCategory(event.target.value as ConsistencyAssetCategory)
          }
          className={cn(
            "min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg",
            FOCUS_RING,
          )}
        >
          {CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="consistency-new-slot-name">
          새 소재 이름
        </label>
        <input
          id="consistency-new-slot-name"
          type="text"
          value={newSlotName}
          disabled={disabled}
          onChange={(event) => setNewSlotName(event.target.value)}
          placeholder="새 소재 이름 (예: 서연, 학교 옥상, 마법검)"
          className={cn(
            "min-h-11 min-w-44 flex-1 rounded-lg border border-line bg-card px-3 text-xs text-fg placeholder:text-fg-3",
            FOCUS_RING,
          )}
        />

        <button
          type="submit"
          disabled={disabled || newSlotName.trim().length === 0}
          className={cn(
            "inline-flex min-h-11 items-center gap-1 rounded-lg bg-accent px-3.5 text-xs font-bold text-on-accent enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
            INTERACTIVE_TRANSITION,
            FOCUS_RING,
          )}
        >
          <Plus size={14} aria-hidden />
          <span>슬롯 추가</span>
        </button>
      </form>
    </section>
  );
}

export default StudioConsistencyAssetStrip;
