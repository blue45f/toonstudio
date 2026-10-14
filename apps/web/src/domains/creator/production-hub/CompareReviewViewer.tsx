import {
  Check,
  Columns2,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  Link2,
  Link2Off,
  Pin,
  Pipette,
  RotateCcw,
  ScanSearch,
  SlidersHorizontal,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  addStudioCommentReply,
  addStudioCommentThread,
  assignStudioCommentThread,
  createStudioCommentMessageId,
  reopenStudioCommentThread,
  resolveStudioCommentThread,
  type StudioCommentActor,
  type StudioCommentsDocument,
} from "../studio-comments";
import {
  COMPARE_PRESET_IDS,
  COMPARE_PRESET_LABELS,
  clampCompareScale,
  commentsDocumentToComparePins,
  comparePaneTransformCss,
  comparePanesAligned,
  comparePinsForPoolItem,
  comparePointFromPaneLocal,
  compareSourceKey,
  computeCompareContainRect,
  nudgeCompareOffset,
  resizeComparePanes,
  resolvePaneTransform,
  setCompareDiffOn,
  setCompareFlipBoth,
  setCompareFlipVertical,
  setCompareMode,
  setCompareOffset,
  setCompareOverlayOpacity,
  setComparePaneSource,
  setCompareSyncView,
  COMPARE_OFFSET_LIMIT,
  type ComparePin,
  type ComparePoolItem,
  type ComparePresetId,
  type CompareReviewMode,
  type CompareSession,
} from "./compare-review-model";
import { MANUSCRIPT_PIN_URGENT_PREFIX, type ManuscriptPinAssigneeOption } from "./manuscript-pin-feedback-model";
import { resolveMentionActors } from "./manuscript-pin-mention-autocomplete";
import { processComparePlaceholderArt, processCompareSliderClip } from "./process-compare-model";
import { ProcessCompareNoDataArt, ProcessComparePaneEmptyArt } from "./process-compare-empty-art";
import { useCompareReviewDiffRegions } from "./use-compare-review-diff";
import { useCompareReviewEyedropper } from "./use-compare-review-eyedropper";
import { useCompareReviewViewport } from "./use-compare-review-viewport";
import { useProcessCompareBlink } from "./use-process-compare-blink";
import { useProcessCompareSliderDrag } from "./use-process-compare-slider-drag";
import "./compare-review.css";

const MODE_ICONS: Record<CompareReviewMode, typeof Columns2> = {
  panes: Columns2,
  slider: SlidersHorizontal,
  blink: Zap,
  overlay: Layers,
};

const MODE_COPY: Record<CompareReviewMode, { ko: string; en: string }> = {
  panes: { ko: "나란히", en: "Side by side" },
  slider: { ko: "슬라이더", en: "Slider" },
  blink: { ko: "깜빡", en: "Blink" },
  overlay: { ko: "오버레이", en: "Overlay" },
};

const SOURCE_BADGE: Readonly<Record<ComparePoolItem["source"]["kind"], { readonly ko: string; readonly en: string }>> = {
  revision: { ko: "버전", en: "Version" },
  external: { ko: "외부", en: "External" },
  page: { ko: "회차", en: "Episode" },
  reference: { ko: "레퍼런스", en: "Reference" },
};

/** 요소 크기 측정(핀 레이어의 레터박스 보정용). jsdom 등에서는 0을 돌려준다. */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

interface DraftPin {
  readonly poolItemId: string;
  readonly pairedPoolItemId?: string;
  readonly x: number;
  readonly y: number;
}

export interface CompareReviewViewerProps {
  readonly session: CompareSession;
  readonly onSessionChange: (next: CompareSession) => void;
  readonly comments: StudioCommentsDocument;
  readonly onCommentsChange: (next: StudioCommentsDocument) => void;
  readonly currentActor: StudioCommentActor;
  readonly assigneeOptions?: readonly ManuscriptPinAssigneeOption[];
  /** false면 핀 작성·해결 등 편집 동작을 숨긴다(외부 검수 읽기 전용 등). */
  readonly canEdit?: boolean;
  /** 핀 모드는 소스 풀 띠와 공유한다. */
  readonly pinMode: boolean;
  readonly onPinModeChange: (next: boolean) => void;
  /** 스포이드로 찍은 색을 팔레트에 등록할 때 호출된다. 없으면 색 정보만 보여 준다. */
  readonly onPickColor?: (hex: string) => void;
  /** 프리셋은 소스 해석이 필요해 룸이 소유하고, 뷰어는 버튼만 올린다. */
  readonly onApplyPreset?: (preset: ComparePresetId) => void;
  readonly presetStatus?: string | null;
}

/**
 * 비교 검수 뷰어: 소스 풀의 이미지를 나란히/슬라이더/깜빡/오버레이로 비교하고,
 * 배율·이동을 동기화하며, 어느 이미지 위에든 검수 핀을 꽂는다.
 * 상태 계산은 compare-review-model, 댓글 연산은 studio-comments가 소유한다.
 */
export function CompareReviewViewer({
  session,
  onSessionChange,
  comments,
  onCommentsChange,
  currentActor,
  assigneeOptions = [],
  canEdit = true,
  pinMode,
  onPinModeChange,
  onPickColor,
  onApplyPreset,
  presetStatus,
}: CompareReviewViewerProps) {
  const bt = useBilingual("CompareReview");
  const viewport = useCompareReviewViewport();
  const eyedropper = useCompareReviewEyedropper();
  const slider = useProcessCompareSliderDrag();
  const [blinkMs, setBlinkMs] = useState(800);
  const [blinkOn, setBlinkOn] = useState(true);
  const { phase: blinkPhase, togglePhase: toggleBlinkPhase } = useProcessCompareBlink(
    session.mode === "blink",
    blinkOn,
    blinkMs,
  );

  const [eyedropperActive, setEyedropperActive] = useState(false);
  const [picked, setPicked] = useState<{ readonly hex: string; readonly r: number; readonly g: number; readonly b: number; readonly h: number; readonly s: number; readonly v: number; readonly fromLabel: string } | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const [focusedPane, setFocusedPane] = useState(0);
  const [draftPin, setDraftPin] = useState<DraftPin | null>(null);
  const [composerBody, setComposerBody] = useState("");
  const [composerUrgent, setComposerUrgent] = useState(false);
  const [composerAssigneeId, setComposerAssigneeId] = useState("");
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [naturalSizes, setNaturalSizes] = useState<Readonly<Record<string, { w: number; h: number }>>>({});

  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const paneStageRefs = useRef<(HTMLDivElement | null)[]>([]);
  // 차이 계산 훅은 안정적인 ref 객체를 요구한다(렌더마다 새 객체면 효과가 재실행된다).
  const imgARef = useMemo(() => ({ current: null as HTMLImageElement | null }), []);
  const imgBRef = useMemo(() => ({ current: null as HTMLImageElement | null }), []);
  const registerPaneImg = useCallback((index: number, el: HTMLImageElement | null) => {
    imgRefs.current[index] = el;
    if (index === 0) imgARef.current = el;
    if (index === 1) imgBRef.current = el;
  }, [imgARef, imgBRef]);

  const poolByKey = useMemo(
    () => new Map(session.pool.map((item) => [compareSourceKey(item.source), item])),
    [session.pool],
  );
  const paneItems = useMemo(
    () => session.panes.map((source) => poolByKey.get(compareSourceKey(source)) ?? null),
    [session.panes, poolByKey],
  );
  const pins = useMemo(() => commentsDocumentToComparePins(comments, session.pool), [comments, session.pool]);
  const openPinCount = useMemo(() => pins.filter((pin) => pin.status !== "resolved").length, [pins]);
  const urgentPinCount = useMemo(() => pins.filter((pin) => pin.status === "urgent").length, [pins]);
  const selectedPin = useMemo(() => pins.find((pin) => pin.id === selectedPinId) ?? null, [pins, selectedPinId]);
  const focusedItem = paneItems[Math.min(focusedPane, Math.max(0, paneItems.length - 1))] ?? null;
  const focusedPins = useMemo(
    () => (focusedItem ? comparePinsForPoolItem(pins, focusedItem.id) : []),
    [pins, focusedItem],
  );

  const compareA = paneItems[0] ?? null;
  const compareB = paneItems[1] ?? null;
  const artOf = useCallback(
    (item: ComparePoolItem | null) => (item ? (item.imageUrl ?? processComparePlaceholderArt("image", item.label, 0)) : null),
    [],
  );
  const artA = artOf(compareA);
  const artB = artOf(compareB);
  const aligned = comparePanesAligned(session);
  const diffRegions = useCompareReviewDiffRegions(
    session.diffOn,
    artA,
    artB,
    imgARef,
    imgBRef,
  );

  const announce = useCallback((message: string) => setLiveMessage(message), []);

  const handleModeChange = useCallback((next: CompareReviewMode) => {
    onSessionChange(setCompareMode(session, next));
    announce(bt(MODE_COPY[next].ko, MODE_COPY[next].en));
  }, [session, onSessionChange, announce, bt]);

  const noteNaturalSize = useCallback((src: string, img: HTMLImageElement) => {
    if (!img.naturalWidth) return;
    setNaturalSizes((prev) => (prev[src] ? prev : { ...prev, [src]: { w: img.naturalWidth, h: img.naturalHeight } }));
  }, []);

  /** 스테이지 안 콘텐츠 박스 클릭 → 이미지 정규화 좌표. pin/스포이드 공용. */
  const pointFromEvent = useCallback(
    (event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const local = {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
      return comparePointFromPaneLocal(local, session.flipBoth, session.flipVertical);
    },
    [session.flipBoth, session.flipVertical],
  );

  const pairedIdFor = useCallback(
    (poolItemId: string): string | undefined => {
      const other = paneItems.find((item) => item && item.id !== poolItemId);
      return other?.id;
    },
    [paneItems],
  );

  const handleImageClick = useCallback(
    (item: ComparePoolItem, imgEl: HTMLImageElement | null) => (event: React.MouseEvent<HTMLElement>) => {
      if (pinMode && canEdit) {
        const point = pointFromEvent(event);
        if (!point) return;
        setDraftPin({ poolItemId: item.id, pairedPoolItemId: pairedIdFor(item.id), x: point.x, y: point.y });
        setComposerBody("");
        setComposerUrgent(false);
        setComposerAssigneeId("");
        setSelectedPinId(null);
        return;
      }
      if (eyedropperActive) {
        const point = pointFromEvent(event);
        if (!point || !imgEl) return;
        const color = eyedropper.sample(imgEl, point);
        if (color) {
          setPicked({ ...color, fromLabel: item.label });
          setColorError(null);
        } else {
          setPicked(null);
          setColorError(bt(
            "이 이미지는 색을 찍을 수 없습니다. (외부 이미지 보안 제한)",
            "This image can't be sampled (external image security limit).",
          ));
        }
      }
    },
    [pinMode, canEdit, eyedropperActive, eyedropper, pointFromEvent, pairedIdFor, bt],
  );

  const submitDraftPin = useCallback(() => {
    if (!draftPin || !composerBody.trim()) return;
    const threadId = createStudioCommentMessageId("comment");
    const mentions = resolveMentionActors(composerBody, assigneeOptions);
    let next = addStudioCommentThread(
      comments,
      {
        id: threadId,
        anchor: {
          type: "compare-image",
          poolItemId: draftPin.poolItemId,
          x: draftPin.x,
          y: draftPin.y,
          ...(draftPin.pairedPoolItemId ? { pairedPoolItemId: draftPin.pairedPoolItemId } : {}),
        },
        author: currentActor,
        body: composerUrgent ? `${MANUSCRIPT_PIN_URGENT_PREFIX}${composerBody.trim()}` : composerBody.trim(),
        mentions,
      },
      new Date(),
    );
    if (composerAssigneeId) {
      const option = assigneeOptions.find((candidate) => candidate.id === composerAssigneeId);
      if (option) {
        next = assignStudioCommentThread(next, threadId, { id: option.id, displayName: option.displayName }, new Date());
      }
    }
    onCommentsChange(next);
    setDraftPin(null);
    setSelectedPinId(`pin-${threadId}`);
    announce(bt("핀을 꽂았습니다.", "Pin added."));
  }, [draftPin, composerBody, composerUrgent, composerAssigneeId, comments, currentActor, assigneeOptions, onCommentsChange, announce, bt]);

  const submitReply = useCallback(() => {
    if (!selectedPin || !replyBody.trim()) return;
    const mentions = resolveMentionActors(replyBody, assigneeOptions);
    const next = addStudioCommentReply(
      comments,
      selectedPin.threadId,
      { id: createStudioCommentMessageId("reply"), author: currentActor, body: replyBody.trim(), mentions },
      new Date(),
    );
    onCommentsChange(next);
    setReplyBody("");
  }, [selectedPin, replyBody, comments, currentActor, assigneeOptions, onCommentsChange]);

  const toggleResolvePin = useCallback((pin: ComparePin) => {
    const thread = comments.threads.find((candidate) => candidate.id === pin.threadId);
    if (!thread) return;
    const next = thread.resolved
      ? reopenStudioCommentThread(comments, thread.id, new Date())
      : resolveStudioCommentThread(comments, thread.id, currentActor, new Date());
    onCommentsChange(next);
  }, [comments, currentActor, onCommentsChange]);

  const assignPin = useCallback((pin: ComparePin, assigneeId: string | null) => {
    const option = assigneeId ? assigneeOptions.find((candidate) => candidate.id === assigneeId) : undefined;
    if (assigneeId && !option) return;
    const assignee = option ? { id: option.id, displayName: option.displayName } : null;
    onCommentsChange(assignStudioCommentThread(comments, pin.threadId, assignee, new Date()));
  }, [comments, assigneeOptions, onCommentsChange]);

  const selectedThread = useMemo(
    () => (selectedPin ? comments.threads.find((thread) => thread.id === selectedPin.threadId) ?? null : null),
    [comments, selectedPin],
  );

  if (session.pool.length < 2 || paneItems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-panel p-6 text-center" data-testid="crv-empty">
        <ProcessCompareNoDataArt />
        <p className="mt-2 text-sm font-bold text-fg">{bt("비교할 이미지가 아직 모자랍니다", "Not enough images to compare yet")}</p>
        <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-fg-2">
          {bt(
            "위 소스 풀에 버전·외부 이미지·지난 회차 중 2개 이상을 모아 페인에 배치하세요.",
            "Collect at least 2 sources (versions, external images, past episodes) in the pool above and place them in panes.",
          )}
        </p>
        <div className="crv-live" aria-live="polite">{liveMessage}</div>
      </div>
    );
  }

  const zoomPercent = Math.round(
    clampCompareScale(session.syncView ? viewport.shared.scale : viewport.localFor(Math.max(0, focusedPane)).scale) * 100,
  );

  return (
    <div data-testid="crv-root" className="space-y-3">
      {/* ── 툴바 ── */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={bt("비교 검수 도구", "Compare review tools")}>
        <div className="inline-flex rounded-xl border border-line bg-panel p-1" role="group" aria-label={bt("비교 방식", "Compare mode")}>
          {(Object.keys(MODE_ICONS) as CompareReviewMode[]).map((mode) => {
            const Icon = MODE_ICONS[mode];
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={session.mode === mode}
                onClick={() => handleModeChange(mode)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold",
                  session.mode === mode ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <Icon size={15} aria-hidden="true" />
                {bt(MODE_COPY[mode].ko, MODE_COPY[mode].en)}
              </button>
            );
          })}
        </div>

        {onApplyPreset ? (
          <div className="inline-flex flex-wrap gap-1.5" role="group" aria-label={bt("검수 프리셋", "Review presets")}>
            {COMPARE_PRESET_IDS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onApplyPreset(preset)}
                className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-2.5 text-xs font-bold text-fg-2 hover:bg-raised"
              >
                {bt(COMPARE_PRESET_LABELS[preset].ko, COMPARE_PRESET_LABELS[preset].en)}
              </button>
            ))}
          </div>
        ) : null}

        <span className="ml-auto inline-flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={session.syncView}
            onClick={() => onSessionChange(setCompareSyncView(session, !session.syncView))}
            title={bt("한 페인을 확대·이동하면 모든 페인이 같은 배율·위치로 움직입니다", "Zoom and pan together across all panes")}
            className={cn("inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold", session.syncView ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2")}
          >
            {session.syncView ? <Link2 size={15} aria-hidden="true" /> : <Link2Off size={15} aria-hidden="true" />}
            {bt("배율·이동 잠금", "Lock zoom & pan")}
          </button>
          <button
            type="button"
            aria-pressed={session.flipBoth}
            onClick={() => onSessionChange(setCompareFlipBoth(session, !session.flipBoth))}
            title={bt("모든 페인을 동시에 좌우 반전해 구도를 확인합니다", "Flip all panes horizontally to check composition")}
            className={cn("inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold", session.flipBoth ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2")}
          >
            <FlipHorizontal2 size={15} aria-hidden="true" />
            {bt("양쪽 반전", "Flip both")}
          </button>
          <button
            type="button"
            aria-pressed={session.diffOn}
            onClick={() => onSessionChange(setCompareDiffOn(session, !session.diffOn))}
            title={bt("두 이미지의 차이가 큰 영역을 표시합니다", "Highlight areas with big differences")}
            className={cn("inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold", session.diffOn ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2")}
          >
            <ScanSearch size={15} aria-hidden="true" />
            {bt("차이 영역", "Differences")}
          </button>
          <button
            type="button"
            aria-pressed={eyedropperActive}
            onClick={() => { setEyedropperActive((v) => !v); if (pinMode) onPinModeChange(false); }}
            title={bt("이미지를 눌러 색을 찍고 팔레트에 등록합니다", "Click the image to sample a color")}
            className={cn("inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold", eyedropperActive ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2")}
          >
            <Pipette size={15} aria-hidden="true" />
            {bt("스포이드", "Eyedropper")}
          </button>
          <button
            type="button"
            aria-pressed={pinMode}
            onClick={() => { onPinModeChange(!pinMode); setEyedropperActive(false); }}
            className={cn("inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold", pinMode ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2")}
          >
            <Pin size={15} aria-hidden="true" />
            {bt("핀 꽂기", "Add pins")}
          </button>
        </span>
      </div>

      {presetStatus ? <p role="status" className="text-xs font-bold text-accent">{presetStatus}</p> : null}
      {session.diffOn && !aligned && session.mode !== "panes" ? (
        <p role="status" className="text-xs text-fg-2">
          {bt("정렬 오프셋이 걸려 있어 차이 표시가 어긋날 수 있습니다. 고급 설정에서 오프셋을 0으로 맞추면 정확해집니다.", "Alignment offsets are set, so differences may be off. Zero the offsets in Advanced for exact results.")}
        </p>
      ) : null}

      {/* ── 스테이지 ── */}
      {session.mode === "panes" ? (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, paneItems.length)}, minmax(0, 1fr))` }}
          data-testid="crv-panes"
        >
          {paneItems.map((item, index) => {
            const source = session.panes[index];
            if (!source) return null;
            return (
              <ComparePaneStage
                key={compareSourceKey(source)}
                item={item}
                badge={String(index + 1)}
                pool={session.pool}
                onSelectSource={(next) => onSessionChange(setComparePaneSource(session, index, next))}
                transform={resolvePaneTransform(session, viewport.shared, source, viewport.localFor(index))}
                pins={item ? comparePinsForPoolItem(pins, item.id) : []}
                draftPin={draftPin && item && draftPin.poolItemId === item.id ? draftPin : null}
                selectedPinId={selectedPinId}
                onPinSelect={setSelectedPinId}
                interactive={pinMode || eyedropperActive}
                diffRegions={index === 0 && session.diffOn ? diffRegions : []}
                panHandlers={pinMode || eyedropperActive ? null : viewport.panHandlers(index, session.syncView)}
                onWheelZoom={(factor, center) => viewport.zoomAt(index, session.syncView, factor, center)}
                onImageClick={handleImageClick}
                onFocusPane={() => setFocusedPane(index)}
                noteNaturalSize={noteNaturalSize}
                naturalSizes={naturalSizes}
                registerImg={(el) => registerPaneImg(index, el)}
                registerStage={(el) => { paneStageRefs.current[index] = el; }}
                bt={bt}
              />
            );
          })}
        </div>
      ) : (
        <LayeredCompareStage
          mode={session.mode}
          itemA={compareA}
          itemB={compareB}
          transform={resolvePaneTransform(session, viewport.shared, session.panes[0] ?? session.pool[0].source, viewport.localFor(0))}
          opacity={session.overlayOpacity}
          slider={slider}
          blinkPhase={blinkPhase}
          diffRegions={session.diffOn ? diffRegions : []}
          pinsA={compareA ? comparePinsForPoolItem(pins, compareA.id) : []}
          pinsB={compareB ? comparePinsForPoolItem(pins, compareB.id) : []}
          draftPin={draftPin}
          selectedPinId={selectedPinId}
          onPinSelect={setSelectedPinId}
          interactive={pinMode || eyedropperActive}
          panHandlers={pinMode || eyedropperActive ? null : viewport.panHandlers(0, session.syncView)}
          onWheelZoom={(factor, center) => viewport.zoomAt(0, session.syncView, factor, center)}
          onImageClick={handleImageClick}
          noteNaturalSize={noteNaturalSize}
          naturalSizes={naturalSizes}
          registerImg={(index, el) => registerPaneImg(index, el)}
          bt={bt}
        />
      )}

      {/* ── 하단 바: 모드별 조절 ── */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-fg-2">
        {session.mode === "panes" ? (
          <div className="inline-flex items-center gap-1.5" role="group" aria-label={bt("페인 개수", "Pane count")}>
            <span className="font-bold">{bt("페인", "Panes")}</span>
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                aria-pressed={paneItems.length === count}
                onClick={() => onSessionChange(resizeComparePanes(session, count))}
                className={cn("min-h-11 rounded-lg border px-2.5 font-bold", paneItems.length === count ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2")}
              >
                {count}
              </button>
            ))}
          </div>
        ) : null}

        {session.mode === "overlay" ? (
          <label className="inline-flex min-w-56 flex-1 items-center gap-2">
            <span className="shrink-0 font-bold">{bt("위 이미지 투명도", "Top image opacity")}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(session.overlayOpacity * 100)}
              onChange={(event) => onSessionChange(setCompareOverlayOpacity(session, Number(event.target.value) / 100))}
              aria-label={bt("오버레이 불투명도", "Overlay opacity")}
              className="flex-1"
            />
            <span>{Math.round(session.overlayOpacity * 100)}%</span>
          </label>
        ) : null}

        {session.mode === "blink" ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={blinkOn} onChange={(e) => setBlinkOn(e.target.checked)} />
              {bt("자동 전환", "Auto toggle")}
            </label>
            <button type="button" className="min-h-11 rounded-lg border border-line bg-card px-2.5 font-bold text-fg-2" onClick={toggleBlinkPhase}>
              {bt("수동 전환", "Toggle manually")}
            </button>
          </span>
        ) : null}

        <span className="ml-auto inline-flex items-center gap-1.5" role="group" aria-label={bt("확대/축소", "Zoom")}>
          <button
            type="button"
            className="inline-grid size-11 place-items-center rounded-lg border border-line bg-card text-fg-2"
            onClick={() => viewport.setScale(focusedPane, session.syncView, (session.syncView ? viewport.shared.scale : viewport.localFor(focusedPane).scale) / 1.25)}
            aria-label={bt("축소", "Zoom out")}
          >
            <ZoomOut size={15} aria-hidden="true" />
          </button>
          <span className="min-w-12 text-center font-bold" data-testid="crv-zoomval">{zoomPercent}%</span>
          <button
            type="button"
            className="inline-grid size-11 place-items-center rounded-lg border border-line bg-card text-fg-2"
            onClick={() => viewport.setScale(focusedPane, session.syncView, (session.syncView ? viewport.shared.scale : viewport.localFor(focusedPane).scale) * 1.25)}
            aria-label={bt("확대", "Zoom in")}
          >
            <ZoomIn size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="inline-grid size-11 place-items-center rounded-lg border border-line bg-card text-fg-2"
            onClick={viewport.reset}
            aria-label={bt("배율·위치 초기화", "Reset zoom and position")}
          >
            <RotateCcw size={15} aria-hidden="true" />
          </button>
        </span>
      </div>

      {/* ── 고급: 정렬 오프셋·상하 반전·깜빡 주기 ── */}
      <details className="rounded-xl border border-line bg-panel px-3 py-2">
        <summary className="cursor-pointer text-xs font-bold text-fg-2">{bt("고급 설정", "Advanced settings")}</summary>
        <div className="mt-2 flex flex-wrap items-start gap-4 pb-1">
          <fieldset className="min-w-64">
            <legend className="text-[0.6875rem] font-bold text-fg-3">
              {bt("정렬 오프셋", "Alignment offset")} — {focusedItem ? focusedItem.label : bt("페인 없음", "No pane")}
            </legend>
            {focusedItem ? (
              <OffsetEditor
                session={session}
                item={focusedItem}
                onSessionChange={onSessionChange}
                bt={bt}
              />
            ) : null}
          </fieldset>
          <label className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-fg-2">
            <input
              type="checkbox"
              checked={session.flipVertical}
              onChange={(event) => onSessionChange(setCompareFlipVertical(session, event.target.checked))}
            />
            <FlipVertical2 size={14} aria-hidden="true" />
            {bt("상하 반전", "Flip vertically")}
          </label>
          {session.mode === "blink" ? (
            <label className="inline-flex items-center gap-2 text-xs font-bold text-fg-2">
              {bt("깜빡 주기", "Blink interval")}
              <input
                type="range"
                min={250}
                max={2000}
                step={50}
                value={blinkMs}
                onChange={(event) => setBlinkMs(Number(event.target.value))}
                aria-label={bt("깜빡 주기", "Blink interval")}
              />
              <span>{blinkMs}ms</span>
            </label>
          ) : null}
          <p className="max-w-md text-[0.6875rem] leading-5 text-fg-3">
            {bt(
              "여백 차이로 기준점이 어긋난 이미지는 오프셋을 한 번 맞춰 두면, 잠금을 켠 채 확대·이동해도 그 기준으로 함께 움직입니다.",
              "If margins shift the anchor point, set the offset once — with lock on, zoom and pan keep that alignment.",
            )}
          </p>
        </div>
      </details>

      {/* ── 스포이드 결과 ── */}
      {picked ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-3" data-testid="crv-picked-color">
          <span className="size-10 rounded-lg border border-line" style={{ backgroundColor: picked.hex }} aria-hidden="true" />
          <span className="text-xs leading-5 text-fg-2">
            <strong className="text-sm text-fg">{picked.hex}</strong>
            {` · RGB ${picked.r} ${picked.g} ${picked.b} · HSV ${picked.h}° ${picked.s}% ${picked.v}%`}
            <span className="block text-fg-3">{picked.fromLabel}</span>
          </span>
          {onPickColor ? (
            <button
              type="button"
              className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent"
              onClick={() => { onPickColor(picked.hex); announce(bt("팔레트에 등록했습니다.", "Added to palette.")); }}
            >
              <Check size={14} aria-hidden="true" /> {bt("팔레트에 등록", "Add to palette")}
            </button>
          ) : null}
          <button type="button" className="inline-grid size-11 place-items-center rounded-lg border border-line bg-card text-fg-2" onClick={() => setPicked(null)} aria-label={bt("색 정보 닫기", "Dismiss color")}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {colorError ? <p role="alert" className="text-xs font-bold text-bad">{colorError}</p> : null}

      {/* ── 핀 작성 폼 ── */}
      {draftPin ? (
        <form
          className="space-y-2 rounded-xl border border-accent/40 bg-accent-soft/30 p-3"
          data-testid="crv-pin-composer"
          onSubmit={(event) => { event.preventDefault(); submitDraftPin(); }}
        >
          <p className="text-xs font-black text-fg">
            {bt("핀 내용", "Pin note")} — {session.pool.find((item) => item.id === draftPin.poolItemId)?.label ?? ""}
          </p>
          <label className="sr-only" htmlFor="crv-pin-body">{bt("핀 내용", "Pin note")}</label>
          <textarea
            id="crv-pin-body"
            value={composerBody}
            onChange={(event) => setComposerBody(event.target.value)}
            rows={2}
            autoFocus
            placeholder={bt("무엇을 어떻게 고치면 되는지 적어 주세요", "Describe what to change and how")}
            className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-fg-2">
              <input type="checkbox" checked={composerUrgent} onChange={(event) => setComposerUrgent(event.target.checked)} />
              {bt("긴급 (필수 수정 — 승인 잠금)", "Urgent (required fix — locks approval)")}
            </label>
            {assigneeOptions.length ? (
              <label className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-2">
                {bt("담당자", "Assignee")}
                <select
                  value={composerAssigneeId}
                  onChange={(event) => setComposerAssigneeId(event.target.value)}
                  className="min-h-11 rounded-lg border border-line bg-card px-2 text-xs text-fg"
                >
                  <option value="">{bt("지정 안 함", "Unassigned")}</option>
                  {assigneeOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.displayName}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <span className="ml-auto inline-flex gap-1.5">
              <button type="button" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg-2" onClick={() => setDraftPin(null)}>
                {bt("취소", "Cancel")}
              </button>
              <button type="submit" disabled={!composerBody.trim()} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-xs font-bold text-on-accent disabled:opacity-50">
                {bt("핀 꽂기", "Add pin")}
              </button>
            </span>
          </div>
        </form>
      ) : null}

      {/* ── 핀 목록 + 스레드 ── */}
      <div className="rounded-xl border border-line bg-panel p-3" data-testid="crv-pin-list">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-black text-fg">{bt("비교 핀", "Compare pins")}</h3>
          <span className="text-[0.6875rem] text-fg-3">
            {focusedItem
              ? bt(`${focusedItem.label} 기준 · 미해결 ${openPinCount} · 긴급 ${urgentPinCount}`, `${focusedItem.label} · ${openPinCount} open · ${urgentPinCount} urgent`)
              : bt(`미해결 ${openPinCount} · 긴급 ${urgentPinCount}`, `${openPinCount} open · ${urgentPinCount} urgent`)}
          </span>
          {pinMode ? (
            <span className="ml-auto text-[0.6875rem] font-bold text-accent">{bt("이미지를 누르면 핀이 꽂힙니다", "Click an image to drop a pin")}</span>
          ) : null}
        </div>
        {focusedPins.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {focusedPins.map((pin) => (
              <li key={pin.id}>
                <button
                  type="button"
                  aria-pressed={selectedPinId === pin.id}
                  onClick={() => setSelectedPinId(selectedPinId === pin.id ? null : pin.id)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold",
                    selectedPinId === pin.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2",
                  )}
                >
                  <span className={cn("grid size-5 place-items-center rounded-full text-[0.625rem] text-white", pin.status === "urgent" ? "bg-bad" : pin.status === "resolved" ? "bg-good" : "bg-accent")}>
                    {pin.number}
                  </span>
                  <span className="max-w-44 truncate">{pin.body}</span>
                  {pin.status === "urgent" ? <span className="text-bad">{bt("긴급", "Urgent")}</span> : null}
                  {pin.status === "resolved" ? <span className="text-good">{bt("해결됨", "Resolved")}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-fg-3">
            {bt("이 이미지에는 아직 핀이 없습니다. '핀 꽂기'를 켜고 이미지를 누르세요.", "No pins on this image yet. Turn on 'Add pins' and click the image.")}
          </p>
        )}

        {selectedPin ? (
          <div className="mt-3 rounded-xl border border-line bg-card p-3" data-testid="crv-pin-thread">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-6 text-fg">{selectedPin.body}</p>
                <p className="mt-0.5 text-[0.6875rem] text-fg-3">
                  {selectedPin.authorName} · {selectedPin.createdAt.slice(0, 10)}
                  {selectedPin.pairedLabel ? bt(` · ${selectedPin.pairedLabel}와 비교 중`, ` · compared with ${selectedPin.pairedLabel}`) : ""}
                  {selectedPin.assigneeName ? bt(` · 담당 ${selectedPin.assigneeName}`, ` · Assignee ${selectedPin.assigneeName}`) : ""}
                </p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => toggleResolvePin(selectedPin)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-bold text-fg-2"
                >
                  <Check size={14} aria-hidden="true" />
                  {selectedPin.status === "resolved" ? bt("다시 열기", "Reopen") : bt("해결됨으로 표시", "Mark resolved")}
                </button>
              ) : null}
            </div>
            {selectedThread && selectedThread.replies.length ? (
              <ul className="mt-2 space-y-1.5">
                {selectedThread.replies.map((reply) => (
                  <li key={reply.id} className="rounded-lg bg-panel px-2.5 py-2 text-xs leading-5 text-fg-2">
                    <strong className="text-fg">{reply.author.displayName}</strong> · {reply.body}
                  </li>
                ))}
              </ul>
            ) : null}
            {canEdit ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {assigneeOptions.length ? (
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-2">
                    {bt("담당자", "Assignee")}
                    <select
                      value={selectedPin.assigneeId ?? ""}
                      onChange={(event) => assignPin(selectedPin, event.target.value || null)}
                      className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                    >
                      <option value="">{bt("지정 안 함", "Unassigned")}</option>
                      {assigneeOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.displayName}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <form
                  className="flex min-w-56 flex-1 gap-1.5"
                  onSubmit={(event) => { event.preventDefault(); submitReply(); }}
                >
                  <label className="sr-only" htmlFor="crv-reply-body">{bt("답글", "Reply")}</label>
                  <input
                    id="crv-reply-body"
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder={bt("답글 남기기", "Write a reply")}
                    className="min-h-11 flex-1 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
                  />
                  <button type="submit" disabled={!replyBody.trim()} className="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-xs font-bold text-on-accent disabled:opacity-50">
                    {bt("답글", "Reply")}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-[0.6875rem] text-fg-3" data-testid="crv-hint">
        {session.mode === "slider"
          ? bt("가운데 핸들을 드래그하세요 · ←/→ 키로 미세 조정", "Drag the center handle · ←/→ for fine control")
          : session.mode === "overlay"
            ? bt("두 이미지를 겹쳐 놓고 투명도를 조절해 선·구도의 어긋남을 확인하세요", "Stack the images and adjust opacity to spot line and layout drift")
            : session.mode === "blink"
              ? bt("두 이미지가 번갈아 표시됩니다 · 깜빡일 때 달라 보이는 곳이 차이입니다", "Images alternate · what changes between flips is the difference")
              : bt("휠로 확대 · 드래그로 이동 · 잠금을 켜면 모든 페인이 함께 움직입니다", "Wheel to zoom · drag to pan · with lock on, all panes move together")}
      </p>
      <div className="crv-live" aria-live="polite">{liveMessage}</div>
    </div>
  );
}

// ── 하위 부품 ───────────────────────────────────────────────────────────

type Bt = (ko: string, en: string) => string;

interface StageImageProps {
  readonly item: ComparePoolItem;
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly naturalSizes: Readonly<Record<string, { w: number; h: number }>>;
  readonly noteNaturalSize: (src: string, img: HTMLImageElement) => void;
  readonly registerImg: (el: HTMLImageElement | null) => void;
  readonly pins: readonly ComparePin[];
  readonly draftPin: DraftPin | null;
  readonly selectedPinId: string | null;
  readonly onPinSelect: (pinId: string | null) => void;
  readonly onContentClick: (event: React.MouseEvent<HTMLElement>) => void;
  /** 상대 이미지와의 차이 영역(이미지 콘텐츠 기준 %). 기준 이미지(A)에만 그린다. */
  readonly diffRegions?: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
}

/**
 * 스테이지 안의 이미지 한 장: contain 레터박스를 보정한 콘텐츠 박스 위에
 * 이미지를 그리고, 그 박스 기준으로 핀 레이어를 겹친다.
 */
function StageImage({
  item,
  stageWidth,
  stageHeight,
  naturalSizes,
  noteNaturalSize,
  registerImg,
  pins,
  draftPin,
  selectedPinId,
  onPinSelect,
  onContentClick,
  diffRegions = [],
}: StageImageProps) {
  const src = item.imageUrl ?? processComparePlaceholderArt("image", item.label, 0);
  const natural = naturalSizes[src];
  const rect = computeCompareContainRect(stageWidth, stageHeight, natural?.w ?? 0, natural?.h ?? 0);
  return (
    <div
      className="absolute"
      style={{ left: `${rect.leftPct}%`, top: `${rect.topPct}%`, width: `${rect.widthPct}%`, height: `${rect.heightPct}%` }}
      onClick={onContentClick}
    >
      <img
        ref={registerImg}
        src={src}
        alt={item.label}
        draggable={false}
        crossOrigin="anonymous"
        onLoad={(event) => noteNaturalSize(src, event.currentTarget)}
        className="block h-full w-full select-none object-fill"
      />
      <div className="absolute inset-0" aria-hidden={false}>
        {diffRegions.map((region, i) => (
          <div
            key={`diff-${i}`}
            className="crv-diff-region"
            data-testid="crv-diff-region"
            style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}
          />
        ))}
        {pins.map((pin) => (
          <button
            key={pin.id}
            type="button"
            aria-label={`핀 ${pin.number}: ${pin.body}`}
            aria-pressed={selectedPinId === pin.id}
            onClick={(event) => { event.stopPropagation(); onPinSelect(selectedPinId === pin.id ? null : pin.id); }}
            className={cn(
              "crv-pin",
              pin.status === "urgent" ? "crv-pin--urgent" : pin.status === "resolved" ? "crv-pin--resolved" : "crv-pin--open",
              selectedPinId === pin.id && "crv-pin--selected",
            )}
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
          >
            {pin.number}
          </button>
        ))}
        {draftPin ? (
          <span className="crv-pin crv-pin--draft" style={{ left: `${draftPin.x * 100}%`, top: `${draftPin.y * 100}%` }} aria-hidden="true">
            +
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface ComparePaneStageProps {
  readonly item: ComparePoolItem | null;
  readonly badge: string;
  readonly pool: readonly ComparePoolItem[];
  readonly onSelectSource: (source: ComparePoolItem["source"]) => void;
  readonly transform: ReturnType<typeof resolvePaneTransform>;
  readonly pins: readonly ComparePin[];
  readonly draftPin: DraftPin | null;
  readonly selectedPinId: string | null;
  readonly onPinSelect: (pinId: string | null) => void;
  readonly interactive: boolean;
  readonly diffRegions?: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  readonly panHandlers: ReturnType<ReturnType<typeof useCompareReviewViewport>["panHandlers"]> | null;
  readonly onWheelZoom: (factor: number, center: { x: number; y: number }) => void;
  readonly onImageClick: (item: ComparePoolItem, imgEl: HTMLImageElement | null) => (event: React.MouseEvent<HTMLElement>) => void;
  readonly onFocusPane: () => void;
  readonly noteNaturalSize: (src: string, img: HTMLImageElement) => void;
  readonly naturalSizes: Readonly<Record<string, { w: number; h: number }>>;
  readonly registerImg: (el: HTMLImageElement | null) => void;
  readonly registerStage: (el: HTMLDivElement | null) => void;
  readonly bt: Bt;
}

function ComparePaneStage({
  item,
  badge,
  pool,
  onSelectSource,
  transform,
  pins,
  draftPin,
  selectedPinId,
  onPinSelect,
  interactive,
  diffRegions = [],
  panHandlers,
  onWheelZoom,
  onImageClick,
  onFocusPane,
  noteNaturalSize,
  naturalSizes,
  registerImg,
  registerStage,
  bt,
}: ComparePaneStageProps) {
  const [sizeRef, size] = useElementSize<HTMLDivElement>();
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const badgeCopy = item ? SOURCE_BADGE[item.source.kind] : null;

  return (
    <section
      className="min-w-0 rounded-2xl border border-line bg-card"
      aria-label={bt(`비교 페인 ${badge}`, `Compare pane ${badge}`)}
      onClick={onFocusPane}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[0.6875rem] font-black text-on-accent" aria-hidden="true">
          {badge}
        </span>
        <label className="sr-only" htmlFor={`crv-pane-select-${badge}`}>{bt("이 페인에 표시할 소스", "Source for this pane")}</label>
        <select
          id={`crv-pane-select-${badge}`}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 text-xs font-bold text-fg"
          value={item?.id ?? ""}
          onChange={(event) => {
            const next = pool.find((candidate) => candidate.id === event.target.value);
            if (next) onSelectSource(next.source);
          }}
        >
          {!item ? <option value="">{bt("선택…", "Select…")}</option> : null}
          {pool.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
          ))}
        </select>
        {badgeCopy ? (
          <span className="shrink-0 rounded bg-panel px-1.5 py-0.5 text-[0.625rem] font-bold text-fg-3">{bt(badgeCopy.ko, badgeCopy.en)}</span>
        ) : null}
      </div>

      <div
        ref={(el) => { sizeRef.current = el; registerStage(el); }}
        className={cn("crv-stage relative w-full overflow-hidden bg-[#101418]", interactive ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing")}
        style={{ height: "min(58vh, 540px)" }}
        onWheel={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          onWheelZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, {
            x: (event.clientX - rect.left) / rect.width,
            y: (event.clientY - rect.top) / rect.height,
          });
        }}
        {...(panHandlers ?? {})}
        data-testid={`crv-stage-${badge}`}
      >
        <div className="absolute inset-0" style={{ transform: comparePaneTransformCss(transform) }}>
          {item ? (
            <StageImage
              item={item}
              stageWidth={size.width}
              stageHeight={size.height}
              naturalSizes={naturalSizes}
              noteNaturalSize={noteNaturalSize}
              registerImg={(el) => { imgElRef.current = el; registerImg(el); }}
              pins={pins}
              draftPin={draftPin}
              selectedPinId={selectedPinId}
              onPinSelect={onPinSelect}
              onContentClick={onImageClick(item, imgElRef.current)}
              diffRegions={diffRegions}
            />
          ) : (
            <div className="grid h-full place-items-center p-4 text-center">
              <div>
                <ProcessComparePaneEmptyArt />
                <p className="mt-2 text-xs text-white/70">{bt("위에서 소스를 선택하세요", "Choose a source above")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[0.6875rem] text-fg-3">
        <span className="min-w-0 truncate font-bold text-fg-2">{item ? item.label : bt("미선택", "Unselected")}</span>
        {item ? <time dateTime={item.addedAt}>{item.addedAt.slice(0, 10)}</time> : null}
      </div>
    </section>
  );
}

interface LayeredCompareStageProps {
  readonly mode: CompareReviewMode;
  readonly itemA: ComparePoolItem | null;
  readonly itemB: ComparePoolItem | null;
  readonly transform: ReturnType<typeof resolvePaneTransform>;
  readonly opacity: number;
  readonly slider: ReturnType<typeof useProcessCompareSliderDrag>;
  readonly blinkPhase: boolean;
  readonly diffRegions: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  readonly pinsA: readonly ComparePin[];
  readonly pinsB: readonly ComparePin[];
  readonly draftPin: DraftPin | null;
  readonly selectedPinId: string | null;
  readonly onPinSelect: (pinId: string | null) => void;
  readonly interactive: boolean;
  readonly panHandlers: ReturnType<ReturnType<typeof useCompareReviewViewport>["panHandlers"]> | null;
  readonly onWheelZoom: (factor: number, center: { x: number; y: number }) => void;
  readonly onImageClick: (item: ComparePoolItem, imgEl: HTMLImageElement | null) => (event: React.MouseEvent<HTMLElement>) => void;
  readonly noteNaturalSize: (src: string, img: HTMLImageElement) => void;
  readonly naturalSizes: Readonly<Record<string, { w: number; h: number }>>;
  readonly registerImg: (index: number, el: HTMLImageElement | null) => void;
  readonly bt: Bt;
}

/** 슬라이더·깜빡·오버레이 공용 레이어 스테이지. 두 이미지가 한 무대에서 겹친다. */
function LayeredCompareStage({
  mode,
  itemA,
  itemB,
  transform,
  opacity,
  slider,
  blinkPhase,
  diffRegions,
  pinsA,
  pinsB,
  draftPin,
  selectedPinId,
  onPinSelect,
  interactive,
  panHandlers,
  onWheelZoom,
  onImageClick,
  noteNaturalSize,
  naturalSizes,
  registerImg,
  bt,
}: LayeredCompareStageProps) {
  const [sizeRef, size] = useElementSize<HTMLDivElement>();
  const imgAElRef = useRef<HTMLImageElement | null>(null);
  const imgBElRef = useRef<HTMLImageElement | null>(null);
  const transformCss = comparePaneTransformCss(transform);

  /** 지금 클릭이 닿는 레이어의 항목. 슬라이더는 위치로, 깜빡은 현재 위상으로, 오버레이는 위 레이어로 정한다. */
  const activeItemAt = (event: React.MouseEvent<HTMLElement>): { item: ComparePoolItem; img: HTMLImageElement | null } | null => {
    if (mode === "slider") {
      const rect = event.currentTarget.getBoundingClientRect();
      const fraction = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      return fraction * 100 <= slider.position
        ? (itemA ? { item: itemA, img: imgAElRef.current } : null)
        : (itemB ? { item: itemB, img: imgBElRef.current } : null);
    }
    if (mode === "blink") {
      return blinkPhase
        ? (itemB ? { item: itemB, img: imgBElRef.current } : null)
        : (itemA ? { item: itemA, img: imgAElRef.current } : null);
    }
    return itemB ? { item: itemB, img: imgBElRef.current } : (itemA ? { item: itemA, img: imgAElRef.current } : null);
  };

  const layer = (
    item: ComparePoolItem | null,
    pins: readonly ComparePin[],
    index: 0 | 1,
    imgElRef: React.RefObject<HTMLImageElement | null>,
    layerStyle?: React.CSSProperties,
    layerRef?: React.RefObject<HTMLDivElement | null>,
    hidden = false,
    showDiff = false,
  ): ReactNode => (
    <div
      className="absolute inset-0"
      ref={layerRef}
      style={{ ...layerStyle, visibility: hidden ? "hidden" : undefined }}
      aria-hidden={hidden}
    >
      <div className="absolute inset-0" style={{ transform: transformCss }}>
        {item ? (
          <StageImage
            item={item}
            stageWidth={size.width}
            stageHeight={size.height}
            naturalSizes={naturalSizes}
            noteNaturalSize={noteNaturalSize}
            registerImg={(el) => { imgElRef.current = el; registerImg(index, el); }}
            pins={pins}
            draftPin={draftPin && draftPin.poolItemId === item.id ? draftPin : null}
            selectedPinId={selectedPinId}
            onPinSelect={onPinSelect}
            onContentClick={(event) => {
              event.stopPropagation();
              onImageClick(item, imgElRef.current)(event);
            }}
            diffRegions={showDiff ? diffRegions : []}
          />
        ) : null}
      </div>
      {item ? (
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
          {item.label}
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      ref={(el) => { sizeRef.current = el; if (mode === "slider") slider.stageRef.current = el; }}
      className={cn("crv-stage relative w-full overflow-hidden rounded-2xl bg-[#101418]", interactive ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing")}
      style={{ height: "min(58vh, 540px)" }}
      data-testid={`crv-stage-${mode}`}
      onWheel={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        onWheelZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, {
          x: (event.clientX - rect.left) / rect.width,
          y: (event.clientY - rect.top) / rect.height,
        });
      }}
      onClick={(event) => {
        // 레이어 콘텐츠가 처리하지 않은 빈 영역 클릭: 활성 레이어 기준으로 처리한다.
        if (!interactive) return;
        const active = activeItemAt(event);
        if (active) onImageClick(active.item, active.img)(event);
      }}
      {...(mode === "slider"
        ? {
            onPointerDown: slider.onPointerDown,
            onPointerMove: slider.onPointerMove,
            onPointerUp: slider.onPointerUp,
            onPointerCancel: slider.onPointerUp,
          }
        : (panHandlers ?? {}))}
    >
      {mode === "slider" ? (
        <>
          {layer(itemB, pinsB, 1, imgBElRef)}
          {layer(itemA, pinsA, 0, imgAElRef, { clipPath: processCompareSliderClip(slider.position) }, slider.beforeRef, false, true)}
          <div
            className="pcv-slider-handle"
            ref={slider.handleRef}
            data-testid="crv-slider-handle"
            data-dragging={slider.isDragging}
            style={{ left: `${slider.position}%` }}
            role="slider"
            tabIndex={0}
            aria-label={bt("이전·이후 비교 슬라이더", "Before-after compare slider")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(slider.position)}
            aria-valuetext={`${Math.round(slider.position)}%`}
            onKeyDown={slider.onKeyDown}
          >
            <div className="pcv-slider-line" aria-hidden="true" />
            <div className="pcv-slider-knob" aria-hidden="true">
              <SlidersHorizontal size={18} />
            </div>
          </div>
        </>
      ) : mode === "blink" ? (
        <>
          {layer(itemA, pinsA, 0, imgAElRef, { opacity: blinkPhase ? 0 : 1 }, undefined, false, true)}
          {layer(itemB, pinsB, 1, imgBElRef, { opacity: blinkPhase ? 1 : 0 })}
        </>
      ) : (
        <>
          {layer(itemA, pinsA, 0, imgAElRef, undefined, undefined, false, true)}
          {layer(itemB, pinsB, 1, imgBElRef, { opacity })}
        </>
      )}
    </div>
  );
}

interface OffsetEditorProps {
  readonly session: CompareSession;
  readonly item: ComparePoolItem;
  readonly onSessionChange: (next: CompareSession) => void;
  readonly bt: Bt;
}

function OffsetEditor({ session, item, onSessionChange, bt }: OffsetEditorProps) {
  const offset = session.offsets[compareSourceKey(item.source)] ?? { dx: 0, dy: 0 };
  const step = 0.005;
  return (
    <div className="mt-1 space-y-1.5">
      {(["dx", "dy"] as const).map((axis) => (
        <label key={axis} className="flex items-center gap-2 text-xs text-fg-2">
          <span className="w-14 shrink-0">{axis === "dx" ? bt("가로 이동", "Horizontal") : bt("세로 이동", "Vertical")}</span>
          <input
            type="range"
            min={-COMPARE_OFFSET_LIMIT}
            max={COMPARE_OFFSET_LIMIT}
            step={step}
            value={offset[axis]}
            aria-label={axis === "dx" ? bt("가로 정렬 오프셋", "Horizontal alignment offset") : bt("세로 정렬 오프셋", "Vertical alignment offset")}
            onChange={(event) => {
              const value = Number(event.target.value);
              onSessionChange(nudgeCompareOffset(session, item.source, {
                dx: axis === "dx" ? value - offset.dx : 0,
                dy: axis === "dy" ? value - offset.dy : 0,
              }));
            }}
            className="flex-1"
          />
          <span className="w-12 shrink-0 text-right">{offset[axis].toFixed(3)}</span>
        </label>
      ))}
      <button
        type="button"
        disabled={offset.dx === 0 && offset.dy === 0}
        onClick={() => onSessionChange(setCompareOffset(session, item.source, { dx: 0, dy: 0 }))}
        className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-2.5 text-xs font-bold text-fg-2 disabled:opacity-50"
      >
        {bt("오프셋 초기화", "Reset offset")}
      </button>
    </div>
  );
}
