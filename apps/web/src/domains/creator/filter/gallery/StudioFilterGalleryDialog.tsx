/**
 * 필터 갤러리 대화상자 — 효과를 분류·검색으로 골라 최대 8겹까지 쌓고, 겹마다 매개변수·불투명도·표시를 조절한다.
 *
 * 단일 필터 대화상자(StudioFilterDialog)와 같은 세션 계약(props)을 받아 세션 대화상자가 종류에 따라 둘 중 하나를
 * 띄운다. 미리보기는 두 곳에 보인다. 캔버스 미리보기는 기존 대화상자처럼 onPreview 패치로 캔버스에 직접 그리고(필터
 * 엔진이 같은 커널을 실행), 대화상자가 캔버스를 대부분 가리므로 대화상자 안 결과 미리보기 창(StudioFilterGalleryPreview)이
 * 같은 필드·같은 픽셀 크기로 계산한 결과를 함께 보인다. 적용하면 { filterGallery } 패치 하나를 넘긴다. 이 파일은 지연
 * 로드 청크라 등록부(커널 전체)를 바로 가져온다.
 */
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutGrid, RotateCcw, Search, Shuffle, Trash2, X } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactElement, type RefObject } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING, studioSegmentChipClass } from "../../studio-panel-ui";
import { useStudioModalSheet } from "../../useStudioModalSheet";
import { studioFilterDraftToPatch } from "../studio-filter-menu";

import { StudioFilterGalleryPreview } from "./StudioFilterGalleryPreview";
import { planStudioFilterGalleryPreview, studioFilterGalleryPreviewFields } from "./studio-filter-gallery-preview";
import {
  STUDIO_FILTER_GALLERY_EFFECTS,
  defaultStudioFilterGalleryParams,
  findStudioFilterGalleryEffect,
  isStudioFilterGalleryEntryActive,
  normalizeStudioFilterGalleryParams,
  normalizeStudioFilterGalleryStack,
  studioFilterGalleryStackCost,
} from "./studio-filter-gallery-registry";
import {
  STUDIO_FILTER_GALLERY_CATEGORIES,
  STUDIO_FILTER_GALLERY_CATEGORY_LABELS,
  STUDIO_FILTER_GALLERY_MAX_ENTRIES,
  STUDIO_FILTER_GALLERY_WORK_BUDGET,
} from "./studio-filter-gallery-types";

import type {
  StudioFilterGalleryCategory,
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryEntry,
  StudioFilterGalleryParamSpec,
  StudioFilterGalleryParamValue,
  StudioFilterGalleryStack,
} from "./studio-filter-gallery-types";
import type { ImageFilterFields } from "../../render/studio-konva-filter-fields";
import type { StudioFilterApplicationScope } from "../StudioFilterDialog";
import type { StudioFilterDraft, StudioFilterKind } from "../studio-filter-menu";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

type FilterPatch = Partial<ImageFilterFields>;

/**
 * 대상 이미지 요소. 필터 필드에 더해 문서 크기·뒤집기가 있으면 대화상자 안 미리보기를 캔버스와 같은 크기로 계산한다
 * (세션은 이미지 요소를 그대로 넘긴다).
 */
export type StudioFilterGalleryDialogImage = ImageFilterFields & {
  readonly width?: number;
  readonly height?: number;
  readonly flipped?: boolean;
  readonly flippedY?: boolean;
};

export interface StudioFilterGalleryDialogProps {
  activeKey: string;
  kind: StudioFilterKind;
  image: StudioFilterGalleryDialogImage;
  imageSrc?: string | null;
  initialDraft?: StudioFilterDraft;
  rootRef: RefObject<HTMLElement | null>;
  targetKind?: "image" | "page-composite";
  mutationLocked?: boolean;
  mutationLockReason?: string;
  applying?: boolean;
  applicationError?: string | null;
  selectionAvailable?: boolean;
  selectionFeatherPx?: number;
  selectionInverted?: boolean;
  onPreview: (patch: FilterPatch | null) => void;
  onApply: (patch: FilterPatch, draft: StudioFilterDraft, scope: StudioFilterApplicationScope) => void;
  onClose: () => void;
}

type CategoryView = "all" | StudioFilterGalleryCategory;

const EMPTY_STACK: StudioFilterGalleryStack = { version: 1, seed: 1, entries: [] };

function initialStack(image: ImageFilterFields, initialDraft: StudioFilterDraft | undefined): StudioFilterGalleryStack {
  const fromDraft = initialDraft?.kind === "filter-gallery" ? normalizeStudioFilterGalleryStack(initialDraft.stack) : null;
  return fromDraft ?? normalizeStudioFilterGalleryStack(image.filterGallery) ?? EMPTY_STACK;
}

function matchesQuery(effect: StudioFilterGalleryEffectDef, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [effect.id, effect.label, effect.description, ...effect.references, STUDIO_FILTER_GALLERY_CATEGORY_LABELS[effect.category]]
    .some((text) => text.toLowerCase().includes(needle));
}

/** 다음 시드 — 32비트 선형 합동 한 걸음(무늬 바꾸기 버튼). */
const nextSeed = (seed: number): number => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

/** 이 크기(픽셀 수) 이상까지 적용되는 조합은 상한을 따로 알리지 않는다(약 4000×4000). */
const WORK_LIMIT_NOTICE_PIXELS = 16_000_000;

/**
 * 작업량 등급과, 작업량 상한(픽셀 수 × cost 합) 안에서 이 조합을 적용할 수 있는 가장 큰 이미지 크기. 상한을 넘는 이미지는
 * 효과를 건너뛰므로(아무 변화 없음) 미리 알린다.
 */
function workLabel(cost: number): string {
  if (cost <= 0) return "효과 없음";
  const weight = cost < 10 ? "가벼움" : cost < 40 ? "보통" : "무거움";
  const limit = STUDIO_FILTER_GALLERY_WORK_BUDGET / cost;
  if (limit >= WORK_LIMIT_NOTICE_PIXELS) return weight;
  const side = Math.floor(Math.sqrt(limit)).toLocaleString("ko-KR");
  return `${weight} · 약 ${(limit / 1_000_000).toFixed(1)}MP(${side}×${side}px)까지 적용돼요. 더 큰 이미지에서는 적용되지 않아요`;
}

function ParamControl({
  spec,
  value,
  disabled,
  onChange,
}: {
  spec: StudioFilterGalleryParamSpec;
  value: StudioFilterGalleryParamValue | undefined;
  disabled: boolean;
  onChange: (value: StudioFilterGalleryParamValue) => void;
}): ReactElement {
  const id = `studio-filter-gallery-param-${spec.key}`;
  const labelClass = "text-[0.7rem] font-semibold text-fg-2";
  switch (spec.control) {
    case "slider": {
      const current = typeof value === "number" ? value : spec.default;
      return (
        <div className="grid gap-1">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={id} className={labelClass}>{spec.label}</label>
            <output htmlFor={id} className="tabular-nums text-[0.7rem] text-fg-3">
              {current}{spec.suffix ?? ""}
            </output>
          </div>
          <input
            id={id}
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={current}
            disabled={disabled}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>
      );
    }
    case "select":
      return (
        <div className="grid gap-1">
          <label htmlFor={id} className={labelClass}>{spec.label}</label>
          <select
            id={id}
            value={typeof value === "string" ? value : spec.default}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value)}
            className={cn("min-h-9 rounded-lg border border-line bg-card px-2 text-xs text-fg", STUDIO_FOCUS_RING)}
          >
            {spec.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      );
    case "color":
      return (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className={labelClass}>{spec.label}</label>
          <input
            id={id}
            type="color"
            value={typeof value === "string" ? value : spec.default}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value)}
            className={cn("h-8 w-12 cursor-pointer rounded border border-line bg-card", STUDIO_FOCUS_RING)}
          />
        </div>
      );
    case "toggle":
      return (
        <label htmlFor={id} className={cn("flex items-center justify-between gap-2", labelClass)}>
          {spec.label}
          <input
            id={id}
            type="checkbox"
            checked={typeof value === "boolean" ? value : spec.default}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.checked)}
            className="size-4 accent-[var(--color-accent)]"
          />
        </label>
      );
  }
}

export function StudioFilterGalleryDialog({
  activeKey,
  image,
  imageSrc,
  initialDraft,
  rootRef,
  targetKind = "image",
  mutationLocked = false,
  mutationLockReason,
  applying = false,
  applicationError,
  selectionAvailable = false,
  selectionFeatherPx = 0,
  selectionInverted = false,
  onPreview,
  onApply,
  onClose,
}: StudioFilterGalleryDialogProps): ReactElement {
  const dialogRef = useRef<HTMLElement>(null);
  const [stack, setStack] = useState<StudioFilterGalleryStack>(() => initialStack(image, initialDraft));
  // 겹마다 대화상자 안에서만 쓰는 고정 키. 순서를 바꿔도 행이 다시 만들어지지 않아 누른 버튼의 포커스가 남는다.
  const [rowKeys, setRowKeys] = useState<readonly number[]>(() => stack.entries.map((_entry, index) => index));
  const nextRowKey = useRef(stack.entries.length);
  const [moveFocus, setMoveFocus] = useState<{ readonly key: number; readonly delta: -1 | 1 } | null>(null);
  const [selected, setSelected] = useState<number | null>(() => (stack.entries.length > 0 ? 0 : null));
  const [category, setCategory] = useState<CategoryView>("all");
  const [query, setQuery] = useState("");
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const canUseSelectionScope = targetKind === "image" && selectionAvailable;
  const [applicationScope, setApplicationScope] = useState<StudioFilterApplicationScope>(
    () => (canUseSelectionScope ? "inside" : "whole"),
  );
  const editingLocked = mutationLocked || applying;
  const reportPreview = useEffectEvent(onPreview);

  useStudioModalSheet({
    activeKey,
    dialogRef,
    onDismiss: onClose,
    resolveInitialFocus: (dialog) => dialog.querySelector<HTMLElement>("[data-autofocus='true']"),
    resolveReturnFocus: () => (rootRef.current ?? null)?.querySelector<HTMLElement>("[data-studio-canvas-viewport]") ?? null,
    rootRef,
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      reportPreview(previewEnabled ? studioFilterDraftToPatch({ kind: "filter-gallery", stack }) : null);
    });
    return () => cancelAnimationFrame(frame);
  }, [previewEnabled, stack]);

  useEffect(() => () => reportPreview(null), []);

  useEffect(() => {
    if (!canUseSelectionScope && applicationScope !== "whole") setApplicationScope("whole");
  }, [applicationScope, canUseSelectionScope]);

  // 위·아래로 옮긴 뒤 옮긴 행의 같은 방향 버튼(맨 끝에 닿아 꺼졌으면 반대 방향 버튼)에 포커스를 둔다.
  useEffect(() => {
    if (!moveFocus) return;
    const row = dialogRef.current?.querySelector<HTMLElement>(`[data-gallery-row="${moveFocus.key}"]`);
    const same = row?.querySelector<HTMLButtonElement>(`[data-gallery-move="${moveFocus.delta}"]`);
    const other = row?.querySelector<HTMLButtonElement>(`[data-gallery-move="${-moveFocus.delta}"]`);
    (same && !same.disabled ? same : other)?.focus();
    setMoveFocus(null);
  }, [moveFocus]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<StudioFilterGalleryCategory, number>();
    for (const effect of STUDIO_FILTER_GALLERY_EFFECTS) counts.set(effect.category, (counts.get(effect.category) ?? 0) + 1);
    return counts;
  }, []);
  const visibleEffects = useMemo(
    () => STUDIO_FILTER_GALLERY_EFFECTS.filter((effect) =>
      (category === "all" || effect.category === category) && matchesQuery(effect, query)),
    [category, query],
  );
  const stackFull = stack.entries.length >= STUDIO_FILTER_GALLERY_MAX_ENTRIES;
  const selectedEntry = selected === null ? undefined : stack.entries[selected];
  const selectedEffect = selectedEntry ? findStudioFilterGalleryEffect(selectedEntry.id) : undefined;
  const cost = studioFilterGalleryStackCost(stack);
  const previewPlan = useMemo(
    () => planStudioFilterGalleryPreview({ width: image.width, height: image.height }, stack),
    [image.width, image.height, stack],
  );
  const previewFields = useMemo(() => studioFilterGalleryPreviewFields(image, stack), [image, stack]);

  const replaceEntries = (entries: readonly StudioFilterGalleryEntry[]) => setStack((current) => ({ ...current, entries }));
  const addEffect = (effect: StudioFilterGalleryEffectDef) => {
    if (editingLocked || stackFull) return;
    const entries = [...stack.entries, { id: effect.id, params: defaultStudioFilterGalleryParams(effect) }];
    replaceEntries(entries);
    const key = nextRowKey.current;
    nextRowKey.current += 1;
    setRowKeys((keys) => [...keys, key]);
    setSelected(entries.length - 1);
    setAnnouncement(`${effect.label} 효과를 ${entries.length}번째 겹으로 추가했어요.`);
  };
  const updateEntry = (index: number, update: (entry: StudioFilterGalleryEntry) => StudioFilterGalleryEntry) =>
    replaceEntries(stack.entries.map((entry, cursor) => (cursor === index ? update(entry) : entry)));
  const setParam = (index: number, effect: StudioFilterGalleryEffectDef, key: string, value: StudioFilterGalleryParamValue) =>
    updateEntry(index, (entry) => ({ ...entry, params: normalizeStudioFilterGalleryParams(effect, { ...entry.params, [key]: value }) }));
  const setOpacity = (index: number, percent: number) =>
    updateEntry(index, (entry) => {
      const { opacity: _previous, ...rest } = entry;
      return percent >= 100 ? rest : { ...rest, opacity: Math.max(0, percent) / 100 };
    });
  const toggleEntry = (index: number) =>
    updateEntry(index, (entry) => {
      const { enabled: _previous, ...rest } = entry;
      return entry.enabled === false ? rest : { ...rest, enabled: false };
    });
  const moveEntry = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= stack.entries.length) return;
    const entries = [...stack.entries];
    [entries[index], entries[target]] = [entries[target]!, entries[index]!];
    replaceEntries(entries);
    const keys = [...rowKeys];
    [keys[index], keys[target]] = [keys[target]!, keys[index]!];
    setRowKeys(keys);
    if (keys[target] !== undefined) setMoveFocus({ key: keys[target], delta });
    setSelected(target);
  };
  const removeEntry = (index: number) => {
    const removed = stack.entries[index];
    const entries = stack.entries.filter((_entry, cursor) => cursor !== index);
    replaceEntries(entries);
    setRowKeys((keys) => keys.filter((_key, cursor) => cursor !== index));
    setSelected(entries.length === 0 ? null : Math.min(index, entries.length - 1));
    const label = removed ? findStudioFilterGalleryEffect(removed.id)?.label ?? removed.id : "";
    setAnnouncement(`${label} 효과를 뺐어요.`);
  };

  const lockMessage = mutationLockReason ?? "선택한 이미지 또는 문서가 잠겨 있어 적용할 수 없습니다. 잠금을 해제하면 현재 미리보기 값을 적용할 수 있습니다.";
  const describedBy = ["studio-filter-gallery-description", mutationLocked ? "studio-filter-gallery-lock" : null,
    applicationError ? "studio-filter-gallery-error" : null].filter(Boolean).join(" ");

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-2 sm:p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-studio-modal-backdrop="true"
        onClick={onClose}
        className={cn("absolute inset-0 cursor-default", previewEnabled ? "bg-[oklch(0.08_0.01_70/0.28)]" : "bg-[oklch(0.08_0.01_70/0.78)] backdrop-blur-sm")}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-filter-gallery-title"
        aria-describedby={describedBy}
        aria-busy={applying || undefined}
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        className="relative flex max-h-[min(90dvh,46rem)] w-[min(60rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel text-fg shadow-2xl lg:w-[min(80rem,calc(100vw-2rem))]"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
            <LayoutGrid size={17} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="studio-filter-gallery-title" className="truncate text-sm font-bold tracking-tight">필터 갤러리</h2>
            <p id="studio-filter-gallery-description" className="mt-0.5 text-[0.7rem] leading-relaxed text-fg-3">
              {targetKind === "page-composite"
                ? "현재 보이는 페이지를 편집 가능한 합성 레이어로 만들고, 원본 레이어를 보존한 채 효과 스택을 적용합니다."
                : "선택한 이미지 레이어에 효과 스택을 비파괴로 저장합니다. 다시 열면 겹마다 고칠 수 있어요."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="필터 갤러리 닫기"
            className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised hover:text-fg", STUDIO_EASE, STUDIO_FOCUS_RING)}
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        <p aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>

        {/* 좁으면 미리보기를 위 띠로, 넓으면(lg) 왼쪽 열로 둔다. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[9rem_minmax(0,1fr)_minmax(0,1fr)] overflow-hidden md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:grid-rows-[11rem_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.05fr)_minmax(0,1fr)] lg:grid-rows-1">
          <StudioFilterGalleryPreview
            src={imageSrc}
            plan={previewPlan}
            flipped={image.flipped === true}
            flippedY={image.flippedY === true}
            fields={previewFields}
            className="md:col-span-2 lg:col-span-1"
          />
          <section aria-label="효과 찾기" className="flex min-h-0 flex-col gap-2 border-b border-line p-3 md:border-b-0 md:border-r">
            <label className="relative block">
              <span className="sr-only">효과 검색</span>
              <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
              <input
                type="search"
                data-autofocus="true"
                value={query}
                placeholder="효과·프로그램 메뉴 이름으로 찾기"
                onChange={(event) => setQuery(event.currentTarget.value)}
                className={cn("min-h-9 w-full rounded-lg border border-line bg-card pl-8 pr-2 text-xs", STUDIO_FOCUS_RING)}
              />
            </label>
            <div role="group" aria-label="분류" className="flex flex-wrap gap-1">
              <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")} className={studioSegmentChipClass(category === "all")}>
                전체 {STUDIO_FILTER_GALLERY_EFFECTS.length}
              </button>
              {STUDIO_FILTER_GALLERY_CATEGORIES.filter((entry) => categoryCounts.has(entry)).map((entry) => (
                <button key={entry} type="button" aria-pressed={category === entry} onClick={() => setCategory(entry)} className={studioSegmentChipClass(category === entry)}>
                  {STUDIO_FILTER_GALLERY_CATEGORY_LABELS[entry]} {categoryCounts.get(entry)}
                </button>
              ))}
            </div>
            <ul aria-label="효과 목록" className="grid min-h-0 flex-1 grid-cols-1 content-start gap-1.5 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2 [scrollbar-width:thin]">
              {visibleEffects.map((effect) => (
                <li key={effect.id}>
                  <button
                    type="button"
                    disabled={editingLocked || stackFull}
                    onClick={() => addEffect(effect)}
                    title={effect.description}
                    className={cn("flex w-full min-w-0 flex-col items-start gap-0.5 rounded-xl border border-line bg-card/60 px-2.5 py-2 text-left hover:border-accent/50 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45", STUDIO_EASE, STUDIO_FOCUS_RING)}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-fg">{effect.label}</span>
                      <span className="shrink-0 text-[0.6rem] text-fg-3">{STUDIO_FILTER_GALLERY_CATEGORY_LABELS[effect.category]}</span>
                    </span>
                    <span className="line-clamp-2 text-[0.62rem] leading-snug text-fg-3">{effect.description}</span>
                    <span className="truncate text-[0.58rem] text-fg-3/80">{effect.references.join(" · ")}</span>
                  </button>
                </li>
              ))}
              {visibleEffects.length === 0 ? <li className="text-xs text-fg-3">찾는 효과가 없어요.</li> : null}
            </ul>
          </section>

          <section aria-label="효과 스택" className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">효과 스택 {stack.entries.length}/{STUDIO_FILTER_GALLERY_MAX_ENTRIES}</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={editingLocked}
                  onClick={() => setStack((current) => ({ ...current, seed: nextSeed(current.seed) }))}
                  className={buttonClass({ variant: "ghost", className: "min-h-9 gap-1 px-2 text-[0.7rem]" })}
                >
                  <Shuffle size={13} aria-hidden /> 무늬 바꾸기
                </button>
                <button
                  type="button"
                  aria-pressed={previewEnabled}
                  onClick={() => setPreviewEnabled((current) => !current)}
                  className={buttonClass({ variant: "ghost", className: "min-h-9 gap-1 px-2 text-[0.7rem]" })}
                >
                  {previewEnabled ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />} 캔버스 미리보기
                </button>
              </div>
            </div>
            {stack.entries.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[0.7rem] text-fg-3">
                왼쪽에서 효과를 고르면 위에서부터 차례로 쌓여요. 아래로 갈수록 나중에 적용됩니다.
              </p>
            ) : (
              <ol aria-label="쌓인 효과" className="grid gap-1">
                {stack.entries.map((entry, index) => {
                  const effect = findStudioFilterGalleryEffect(entry.id);
                  const active = isStudioFilterGalleryEntryActive(entry);
                  const rowKey = rowKeys[index] ?? -1 - index;
                  const rowLabel = `${index + 1}번째 ${effect?.label ?? entry.id}`;
                  return (
                    <li key={rowKey} data-gallery-row={rowKey} className={cn("flex items-center gap-1 rounded-xl border px-1.5 py-1", selected === index ? "border-accent/60 bg-accent-soft" : "border-line bg-card/50")}>
                      <button
                        type="button"
                        aria-pressed={entry.enabled !== false}
                        aria-label={`${effect?.label ?? entry.id} ${entry.enabled === false ? "켜기" : "끄기"}`}
                        disabled={editingLocked}
                        onClick={() => toggleEntry(index)}
                        className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised", STUDIO_FOCUS_RING)}
                      >
                        {entry.enabled === false ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                      </button>
                      <button
                        type="button"
                        aria-current={selected === index ? "true" : undefined}
                        onClick={() => setSelected(index)}
                        className={cn("min-w-0 flex-1 truncate rounded-lg px-1.5 py-1 text-left text-xs font-semibold", active ? "text-fg" : "text-fg-3 line-through", STUDIO_FOCUS_RING)}
                      >
                        {index + 1}. {effect?.label ?? entry.id}
                        {entry.opacity !== undefined ? <span className="ml-1 text-[0.62rem] font-normal text-fg-3">{Math.round(entry.opacity * 100)}%</span> : null}
                      </button>
                      <button type="button" aria-label={`${rowLabel} 위로 이동`} data-gallery-move={-1} disabled={editingLocked || index === 0} onClick={() => moveEntry(index, -1)} className={cn("grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-raised disabled:opacity-35", STUDIO_FOCUS_RING)}>
                        <ArrowUp size={13} aria-hidden />
                      </button>
                      <button type="button" aria-label={`${rowLabel} 아래로 이동`} data-gallery-move={1} disabled={editingLocked || index === stack.entries.length - 1} onClick={() => moveEntry(index, 1)} className={cn("grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-raised disabled:opacity-35", STUDIO_FOCUS_RING)}>
                        <ArrowDown size={13} aria-hidden />
                      </button>
                      <button type="button" aria-label={`${effect?.label ?? entry.id} 빼기`} disabled={editingLocked} onClick={() => removeEntry(index)} className={cn("grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-bad disabled:opacity-35", STUDIO_FOCUS_RING)}>
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {selectedEntry && selectedEffect && selected !== null ? (
              <fieldset className="grid gap-2.5 rounded-xl border border-line bg-card/40 p-3" disabled={editingLocked}>
                <legend className="px-1 text-xs font-bold text-fg">{selectedEffect.label}</legend>
                <p className="text-[0.66rem] leading-relaxed text-fg-3">{selectedEffect.description}</p>
                {selectedEffect.params.length === 0 ? <p className="text-[0.66rem] text-fg-3">조절할 값이 없는 효과예요.</p> : null}
                {selectedEffect.params.map((spec) => (
                  <ParamControl
                    key={spec.key}
                    spec={spec}
                    value={selectedEntry.params[spec.key]}
                    disabled={editingLocked}
                    onChange={(value) => setParam(selected, selectedEffect, spec.key, value)}
                  />
                ))}
                <ParamControl
                  spec={{ key: "entryOpacity", label: "이 겹의 불투명도", control: "slider", min: 0, max: 100, step: 1, default: 100, suffix: "%" }}
                  value={Math.round((selectedEntry.opacity ?? 1) * 100)}
                  disabled={editingLocked}
                  onChange={(value) => setOpacity(selected, Number(value))}
                />
                <button
                  type="button"
                  onClick={() => updateEntry(selected, (entry) => ({ id: entry.id, params: defaultStudioFilterGalleryParams(selectedEffect) }))}
                  className={buttonClass({ variant: "ghost", className: "min-h-9 justify-self-start gap-1 px-2 text-[0.7rem]" })}
                >
                  <RotateCcw size={13} aria-hidden /> 기본값으로
                </button>
              </fieldset>
            ) : null}
            <p className="text-[0.66rem] text-fg-3">작업량: {workLabel(cost)}</p>
          </section>
        </div>

        <div className="shrink-0 space-y-2 px-4 pt-2">
          {canUseSelectionScope ? (
            <fieldset className="grid gap-1.5">
              <legend className="text-[0.7rem] font-semibold text-fg-2">적용 범위</legend>
              <div className="grid grid-cols-3 gap-1.5">
                {([["whole", "전체 이미지"], ["inside", "선택 안"], ["outside", "선택 밖"]] as const).map(([scope, label]) => (
                  <label key={scope} className={cn(studioSegmentChipClass(applicationScope === scope), "min-h-10 cursor-pointer justify-center", editingLocked && "cursor-not-allowed opacity-45")}>
                    <input type="radio" name="studio-filter-gallery-scope" value={scope} checked={applicationScope === scope} disabled={editingLocked} onChange={() => setApplicationScope(scope)} className="sr-only" />
                    <span className="truncate">{label}</span>
                  </label>
                ))}
              </div>
              <p className="text-[0.66rem] leading-relaxed text-fg-3">
                현재 선택{selectionInverted ? "(반전)" : ""}{selectionFeatherPx > 0 ? ` · 페더 ${selectionFeatherPx}px` : ""}를 마스크로 저장합니다.
              </p>
            </fieldset>
          ) : null}
          {mutationLocked ? (
            <p id="studio-filter-gallery-lock" role="status" className="rounded-xl border border-warn/35 bg-warn/10 px-3 py-2 text-[0.7rem] font-semibold text-warn">{lockMessage}</p>
          ) : null}
          {applicationError ? (
            <p id="studio-filter-gallery-error" role="alert" className="break-words rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{applicationError}</p>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-card/35 px-4 py-3">
          <button type="button" onClick={onClose} className={buttonClass({ variant: "ghost", className: "min-h-10" })}>취소</button>
          <button
            type="button"
            disabled={editingLocked}
            aria-busy={applying || undefined}
            onClick={() => {
              if (editingLocked) return;
              const draft: StudioFilterDraft = { kind: "filter-gallery", stack };
              onApply(studioFilterDraftToPatch(draft), draft, applicationScope);
            }}
            className={buttonClass({ variant: "solid", className: "min-h-10" })}
          >
            {applying ? "적용 중…" : applicationScope === "inside" ? "선택 안에 적용" : applicationScope === "outside" ? "선택 밖에 적용" : "적용"}
          </button>
        </footer>
      </section>
    </div>
  );
}
