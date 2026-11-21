/**
 * 선택 반응형 하단 컨텍스트 프롬프트 바 (Plotr 패리티 + 초과).
 *
 * 캔버스 선택 요소 개수(0 / 1 / 2+)에 따라 하단 프롬프트 바와 상단 심화 보정
 * 도구모음이 별도 메뉴 탐색 없이 자동으로 전이된다:
 * - 0개 선택: 새로 생성(create)
 * - 1개 선택: 수정 · 화풍 변경(edit / restyle) + 심화 보정 도구모음(M/L/B · 분리 · 배경 지우기 · 유동화 · 자동 채색)
 * - 2개 이상 선택: 선택 순서(#1, #2, ...) 기반 번호순 참조 합성(composite)
 *
 * 동적 import(React.lazy)에 적합하도록 외부 에디터 런타임 상태를 직접 구독하지 않는
 * 독립 모듈로 설계했다.
 */
import {
  ArrowDown,
  ArrowUp,
  Brush,
  Eraser,
  Lasso,
  Layers,
  Palette,
  PaintBucket,
  Scissors,
  Sparkles,
  SquareDashed,
  Wand2,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

import { cn } from "@/shared/lib/utils";

export type SelectionPromptBarMode = "create" | "edit" | "composite";
export type SelectionEditSubMode = "edit" | "restyle";

export type SelectionRefinementToolId =
  | "marquee"
  | "lasso"
  | "brush-select"
  | "detach-object"
  | "remove-bg"
  | "liquify"
  | "auto-color";

export interface SelectionContextPromptItem {
  readonly id: string;
  readonly label: string;
  readonly kind?: "layer" | "cut" | "character" | "background" | "prop";
  readonly thumbnailUrl?: string;
}

export interface SelectionStylePreset {
  readonly id: string;
  readonly label: string;
  readonly caption?: string;
}

export interface SelectionCreateSubmission {
  readonly prompt: string;
  readonly stylePresetId: string | null;
}

export interface SelectionEditSubmission {
  readonly targetId: string;
  readonly prompt: string;
  readonly subMode: SelectionEditSubMode;
  readonly stylePresetId: string | null;
  readonly preserveComposition: boolean;
}

export interface SelectionCompositeSubmission {
  readonly orderedTargetIds: readonly string[];
  readonly prompt: string;
}

export interface StudioSelectionContextPromptBarProps {
  readonly selectedItems: readonly SelectionContextPromptItem[];
  readonly activeRefinementTool?: SelectionRefinementToolId | null;
  readonly stylePresets?: readonly SelectionStylePreset[];
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onSubmitCreate: (payload: SelectionCreateSubmission) => void;
  readonly onSubmitEdit: (payload: SelectionEditSubmission) => void;
  readonly onSubmitComposite: (payload: SelectionCompositeSubmission) => void;
  readonly onSelectRefinementTool?: (
    tool: SelectionRefinementToolId,
    targetId: string,
  ) => void;
  readonly onReorderSelection?: (orderedIds: readonly string[]) => void;
  readonly onRemoveFromSelection?: (id: string) => void;
  readonly onClearSelection?: () => void;
}

interface RefinementToolSpec {
  readonly id: SelectionRefinementToolId;
  readonly label: string;
  readonly shortcut?: string;
  readonly Icon: LucideIcon;
}

const DEFAULT_STYLE_PRESETS: readonly SelectionStylePreset[] = Object.freeze([
  { id: "webtoon-clean", label: "웹툰 선화" },
  { id: "rough-sketch", label: "러프 콘티" },
  { id: "watercolor", label: "수채화" },
  { id: "monochrome-comic", label: "흑백 만화" },
  { id: "cinematic", label: "시네마틱" },
  { id: "fantasy-illust", label: "판타지 일러" },
]);

const REFINEMENT_TOOLS: readonly RefinementToolSpec[] = Object.freeze([
  { id: "marquee", label: "사각 영역", shortcut: "M", Icon: SquareDashed },
  { id: "lasso", label: "올가미", shortcut: "L", Icon: Lasso },
  { id: "brush-select", label: "브러시 선택", shortcut: "B", Icon: Brush },
  { id: "detach-object", label: "객체 분리", Icon: Scissors },
  { id: "remove-bg", label: "배경 지우기", Icon: Eraser },
  { id: "liquify", label: "유동화", Icon: Waves },
  { id: "auto-color", label: "자동 채색", Icon: PaintBucket },
]);

const INTERACTIVE_TRANSITION =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:transform-none";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function resolveMode(selectionCount: number): SelectionPromptBarMode {
  if (selectionCount <= 0) return "create";
  if (selectionCount === 1) return "edit";
  return "composite";
}

function modeBadgeText(mode: SelectionPromptBarMode, count: number): string {
  if (mode === "create") return "0개 선택 · 새로 생성";
  if (mode === "edit") return "1개 선택 · 수정 · 화풍 · 심화 보정";
  return `${count}개 선택 · 번호순 참조 합성`;
}

function placeholderForMode(
  mode: SelectionPromptBarMode,
  subMode: SelectionEditSubMode,
  firstLabel: string,
): string {
  if (mode === "create") {
    return "새로 만들 컷의 장면, 인물, 구도를 한 줄로 적어 보세요";
  }
  if (mode === "edit") {
    return subMode === "restyle"
      ? `"${firstLabel}"의 구도는 유지하고 바꿀 화풍 디테일을 적어 보세요 (선택)`
      : `"${firstLabel}"에서 고칠 표정·의상·배경을 적어 보세요`;
  }
  return "#1 인물을 #2 배경에 자연스럽게 배치해 주세요";
}

export function StudioSelectionContextPromptBar({
  selectedItems,
  activeRefinementTool = null,
  stylePresets = DEFAULT_STYLE_PRESETS,
  busy = false,
  disabled = false,
  className,
  onSubmitCreate,
  onSubmitEdit,
  onSubmitComposite,
  onSelectRefinementTool,
  onReorderSelection,
  onRemoveFromSelection,
  onClearSelection,
}: StudioSelectionContextPromptBarProps): ReactElement {
  const mode = resolveMode(selectedItems.length);
  const firstItem = selectedItems[0] ?? null;

  const [prompt, setPrompt] = useState("");
  const [editSubMode, setEditSubMode] = useState<SelectionEditSubMode>("edit");
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(
    stylePresets[0]?.id ?? null,
  );
  const [preserveComposition, setPreserveComposition] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const effectiveDisabled = disabled || busy;
  const trimmedPrompt = prompt.trim();

  const canSubmit = useMemo(() => {
    if (effectiveDisabled) return false;
    if (mode === "edit" && editSubMode === "restyle") {
      return Boolean(selectedStyleId || trimmedPrompt.length > 0);
    }
    return trimmedPrompt.length > 0;
  }, [editSubMode, effectiveDisabled, mode, selectedStyleId, trimmedPrompt.length]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    if (mode === "create") {
      onSubmitCreate({ prompt: trimmedPrompt, stylePresetId: selectedStyleId });
      setPrompt("");
      return;
    }
    if (mode === "edit" && firstItem) {
      onSubmitEdit({
        targetId: firstItem.id,
        prompt: trimmedPrompt,
        subMode: editSubMode,
        stylePresetId: editSubMode === "restyle" ? selectedStyleId : null,
        preserveComposition,
      });
      setPrompt("");
      return;
    }
    if (mode === "composite") {
      onSubmitComposite({
        orderedTargetIds: selectedItems.map((item) => item.id),
        prompt: trimmedPrompt,
      });
      setPrompt("");
    }
  }, [
    canSubmit,
    editSubMode,
    firstItem,
    mode,
    onSubmitComposite,
    onSubmitCreate,
    onSubmitEdit,
    preserveComposition,
    selectedItems,
    selectedStyleId,
    trimmedPrompt,
  ]);

  const handleInsertReferenceToken = useCallback((index: number) => {
    const token = `#${index + 1}`;
    setPrompt((previous) => {
      const sep = previous.length === 0 || previous.endsWith(" ") ? "" : " ";
      return `${previous}${sep}${token} `;
    });
    inputRef.current?.focus();
  }, []);

  const handleMoveItem = useCallback(
    (index: number, delta: -1 | 1) => {
      if (!onReorderSelection) return;
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= selectedItems.length) return;
      const next = selectedItems.map((item) => item.id);
      const current = next[index];
      const swap = next[targetIndex];
      if (!current || !swap) return;
      next[index] = swap;
      next[targetIndex] = current;
      onReorderSelection(next);
    },
    [onReorderSelection, selectedItems],
  );

  useEffect(() => {
    if (mode !== "edit" || !firstItem || !onSelectRefinementTool || effectiveDisabled) {
      return;
    }
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toUpperCase();
      const matched = REFINEMENT_TOOLS.find((tool) => tool.shortcut === key);
      if (matched) {
        event.preventDefault();
        onSelectRefinementTool(matched.id, firstItem.id);
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [effectiveDisabled, firstItem, mode, onSelectRefinementTool]);

  const primaryCtaLabel = useMemo(() => {
    if (busy) return "작업 중";
    if (mode === "create") return "새로 생성";
    if (mode === "edit") return editSubMode === "restyle" ? "화풍 변경" : "선택 수정";
    return "참조 합성";
  }, [busy, editSubMode, mode]);

  return (
    <section
      aria-label="선택 반응형 제작 바"
      data-selection-prompt-mode={mode}
      data-selection-count={selectedItems.length}
      className={cn(
        "flex w-full max-w-4xl flex-col gap-2 rounded-2xl border border-line bg-panel/95 p-2 text-fg shadow-lg backdrop-blur-md [word-break:keep-all]",
        className,
      )}
    >
      {/* 1개 선택 시 상단 심화 보정 도구모음 자동 활성화 */}
      {mode === "edit" && firstItem ? (
        <div
          role="toolbar"
          aria-label="심화 보정 도구"
          className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line/80 bg-card px-2 py-1.5"
        >
          <span className="mr-1 text-xs font-semibold text-fg-2">심화 보정</span>
          {REFINEMENT_TOOLS.map((tool) => {
            const isActive = activeRefinementTool === tool.id;
            const Icon = tool.Icon;
            return (
              <button
                key={tool.id}
                type="button"
                disabled={effectiveDisabled || !onSelectRefinementTool}
                aria-pressed={isActive}
                aria-label={
                  tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label
                }
                data-refinement-tool={tool.id}
                onClick={() => onSelectRefinementTool?.(tool.id, firstItem.id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                  isActive
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <Icon size={14} aria-hidden />
                <span>{tool.label}</span>
                {tool.shortcut ? (
                  <kbd
                    className={cn(
                      "rounded border px-1 py-px text-[10px] font-bold tabular-nums",
                      isActive
                        ? "border-on-accent/40 bg-on-accent/15 text-on-accent"
                        : "border-line bg-raised text-fg-2",
                    )}
                  >
                    {tool.shortcut}
                  </kbd>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* 2개 이상 선택 시 번호순(#1, #2, ...) 참조 칩 행 */}
      {mode === "composite" ? (
        <div
          role="list"
          aria-label="번호순 참조 대상"
          className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line/80 bg-card px-2 py-1.5"
        >
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg-2">
            <Layers size={14} aria-hidden className="text-accent" />
            참조 순서
          </span>
          {selectedItems.map((item, index) => (
            <div
              key={item.id}
              role="listitem"
              data-composite-index={index + 1}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel pl-1.5 pr-1"
            >
              <button
                type="button"
                disabled={effectiveDisabled}
                onClick={() => handleInsertReferenceToken(index)}
                aria-label={`#${index + 1} ${item.label} 프롬프트에 넣기`}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 px-1.5 text-xs font-semibold text-fg hover:text-accent",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                )}
              >
                <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-on-accent">
                  #{index + 1}
                </span>
                <span className="max-w-32 truncate">{item.label}</span>
              </button>
              {onReorderSelection ? (
                <div className="flex items-center">
                  <button
                    type="button"
                    disabled={effectiveDisabled || index === 0}
                    onClick={() => handleMoveItem(index, -1)}
                    aria-label={`#${index + 1} 앞으로 옮기기`}
                    className={cn(
                      "grid min-h-11 min-w-11 place-items-center rounded-md text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-35",
                      INTERACTIVE_TRANSITION,
                      FOCUS_RING,
                    )}
                  >
                    <ArrowUp size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={effectiveDisabled || index === selectedItems.length - 1}
                    onClick={() => handleMoveItem(index, 1)}
                    aria-label={`#${index + 1} 뒤로 옮기기`}
                    className={cn(
                      "grid min-h-11 min-w-11 place-items-center rounded-md text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-35",
                      INTERACTIVE_TRANSITION,
                      FOCUS_RING,
                    )}
                  >
                    <ArrowDown size={13} aria-hidden />
                  </button>
                </div>
              ) : null}
              {onRemoveFromSelection ? (
                <button
                  type="button"
                  disabled={effectiveDisabled}
                  onClick={() => onRemoveFromSelection(item.id)}
                  aria-label={`#${index + 1} ${item.label} 선택 해제`}
                  className={cn(
                    "grid min-h-11 min-w-11 place-items-center rounded-md text-fg-2 hover:bg-raised hover:text-fg",
                    INTERACTIVE_TRANSITION,
                    FOCUS_RING,
                  )}
                >
                  <X size={13} aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* 상태 헤더 & 모드 전환(1개 선택: 수정 vs 화풍 변경) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-semibold tabular-nums text-fg-2"
          >
            <Sparkles size={13} aria-hidden className="text-accent" />
            {modeBadgeText(mode, selectedItems.length)}
          </span>

          {mode === "edit" ? (
            <div
              role="tablist"
              aria-label="단일 선택 작업 모드"
              className="inline-flex items-center gap-1 rounded-xl border border-line bg-card p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={editSubMode === "edit"}
                disabled={effectiveDisabled}
                onClick={() => setEditSubMode("edit")}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-semibold",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                  editSubMode === "edit"
                    ? "bg-accent text-on-accent"
                    : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <Wand2 size={13} aria-hidden />
                수정
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={editSubMode === "restyle"}
                disabled={effectiveDisabled}
                onClick={() => setEditSubMode("restyle")}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-semibold",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                  editSubMode === "restyle"
                    ? "bg-accent text-on-accent"
                    : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <Palette size={13} aria-hidden />
                화풍 변경
              </button>
            </div>
          ) : null}
        </div>

        {selectedItems.length > 0 && onClearSelection ? (
          <button
            type="button"
            disabled={effectiveDisabled}
            onClick={onClearSelection}
            className={cn(
              "inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg",
              INTERACTIVE_TRANSITION,
              FOCUS_RING,
            )}
          >
            <X size={13} aria-hidden />
            선택 해제
          </button>
        ) : null}
      </div>

      {/* 화풍 선택(0선택 새로 생성 또는 1선택 화풍 변경) */}
      {(mode === "create" || (mode === "edit" && editSubMode === "restyle")) &&
      stylePresets.length > 0 ? (
        <div
          role="group"
          aria-label="화풍 프리셋"
          className="flex flex-wrap items-center gap-1.5 px-1"
        >
          {stylePresets.map((preset) => {
            const active = selectedStyleId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={effectiveDisabled}
                aria-pressed={active}
                onClick={() => setSelectedStyleId(active ? null : preset.id)}
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-xs font-semibold enabled:active:scale-[0.98]",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {preset.label}
              </button>
            );
          })}

          {mode === "edit" && editSubMode === "restyle" ? (
            <label className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2">
              <input
                type="checkbox"
                checked={preserveComposition}
                disabled={effectiveDisabled}
                onChange={(event) => setPreserveComposition(event.target.checked)}
                className="size-4 accent-accent"
              />
              <span>구도 유지</span>
            </label>
          ) : null}
        </div>
      ) : null}

      {/* 메인 프롬프트 입력 + 실행 CTA */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <label className="sr-only" htmlFor="studio-selection-context-prompt-input">
          장면 지시 입력
        </label>
        <input
          ref={inputRef}
          id="studio-selection-context-prompt-input"
          type="text"
          value={prompt}
          disabled={effectiveDisabled}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={placeholderForMode(mode, editSubMode, firstItem?.label ?? "선택 대상")}
          className={cn(
            "min-h-11 flex-1 rounded-lg border border-line bg-card px-3 text-sm text-fg placeholder:text-fg-3",
            INTERACTIVE_TRANSITION,
            FOCUS_RING,
          )}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-bold text-on-accent enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
            INTERACTIVE_TRANSITION,
            FOCUS_RING,
          )}
        >
          <Sparkles size={15} aria-hidden />
          {primaryCtaLabel}
        </button>
      </form>
    </section>
  );
}

export default StudioSelectionContextPromptBar;
