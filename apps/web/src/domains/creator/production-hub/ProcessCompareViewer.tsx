import {
  Clapperboard,
  Columns2,
  FlipHorizontal2,
  FlipVertical2,
  Globe,
  History,
  ImagePlus,
  Images,
  Layers,
  Link2,
  Link2Off,
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
} from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./process-compare.css";
import {
  applyProcessComparePreset,
  applySyncedScroll,
  areProcessCompareOffsetsAligned,
  buildExternalCompareItem,
  canOpenProcessCompare,
  clampProcessCompareBlinkMs,
  clampProcessCompareOverlayOpacity,
  clampProcessCompareZoom,
  compareSourceKindLabel,
  countProcessCompareItemsBySourceKind,
  defaultProcessCompareSources,
  externalCompareAssetIdForFile,
  externalCompareAssetIdForUrl,
  findProcessCompareItem,
  groupProcessCompareItems,
  mergeProcessCompareItems,
  PROCESS_COMPARE_BLINK_MAX_MS,
  PROCESS_COMPARE_BLINK_MIN_MS,
  PROCESS_COMPARE_OFFSET_LIMIT,
  PROCESS_COMPARE_PRESET_IDS,
  PROCESS_COMPARE_PRESET_LABELS,
  processComparePaneKey,
  processComparePaneTransformCss,
  processComparePlaceholderArt,
  processCompareSliderClip,
  resolveProcessComparePaneTransform,
  setProcessComparePaneOffset,
  validateExternalCompareUrl,
  zoomProcessCompareIn,
  zoomProcessCompareOut,
  type ProcessCompareItem,
  type ProcessCompareLayout,
  type ProcessCompareMode,
  type ProcessComparePaneOffset,
  type ProcessComparePaneSource,
  type ProcessComparePresetId,
} from "./process-compare-model";
import { useProcessCompareViewport } from "./use-process-compare-viewport";
import { useProcessCompareBlink } from "./use-process-compare-blink";
import { useProcessCompareDiffRegions } from "./use-process-compare-diff";
import { useProcessCompareSliderDrag } from "./use-process-compare-slider-drag";
import { ProcessCompareNoDataArt, ProcessComparePaneEmptyArt } from "./process-compare-empty-art";

const MODE_ICONS: Record<ProcessCompareMode, typeof Columns2> = {
  panes: Columns2,
  slider: SlidersHorizontal,
  blink: Zap,
  overlay: Layers,
};

const MODE_COPY: Record<ProcessCompareMode, { ko: string; en: string }> = {
  panes: { ko: "나란히 보기", en: "Side by side" },
  slider: { ko: "비포·애프터", en: "Before / After" },
  blink: { ko: "깜빡임 비교", en: "Blink compare" },
  overlay: { ko: "오버레이", en: "Overlay" },
};

/** 검수 프리셋 3종 아이콘 (FLAGSHIP §5.7). 라벨은 모델의 PROCESS_COMPARE_PRESET_LABELS가 정본. */
const PRESET_ICONS: Record<ProcessComparePresetId, typeof History> = {
  "previous-episode": History,
  "storyboard": Clapperboard,
  "external-brief": Images,
};

/** 프리셋 상대 소스가 풀에 없을 때의 안내 문구. 기준 원고가 없을 때는 공통 문구를 쓴다. */
const PRESET_NO_COUNTERPART_COPY: Record<ProcessComparePresetId, { ko: string; en: string }> = {
  "previous-episode": {
    ko: "지난 회차 페이지가 소스 풀에 없습니다. 이전 회차 페이지를 풀에 추가하면 바로 비교할 수 있습니다.",
    en: "No previous-episode page is in the source pool yet. Add one to the pool to compare right away.",
  },
  "storyboard": {
    ko: "콘티 리비전이 소스 풀에 없습니다. 콘티 버전이 불러와지면 바로 비교할 수 있습니다.",
    en: "No storyboard revision is in the source pool yet. Load the storyboard version to compare.",
  },
  "external-brief": {
    ko: "시안(외부 이미지)이 소스 풀에 없습니다. 아래에서 파일이나 주소를 추가해 주세요.",
    en: "No client draft (external image) is in the source pool yet. Add a file or URL below.",
  },
};

interface PaneViewportProps {
  readonly item: ProcessCompareItem | null;
  readonly badge: string;
  readonly groups: ReturnType<typeof groupProcessCompareItems>;
  readonly onSelect: (source: ProcessComparePaneSource) => void;
  /** 이 페인의 실제 변환 CSS (공유/개별 뷰포트 + 정렬 오프셋 + 반전 합성 결과). */
  readonly transformCss: string;
  readonly gestures: ReturnType<ReturnType<typeof useProcessCompareViewport>["gestureHandlers"]>;
  readonly viewportRef: (el: HTMLDivElement | null) => void;
  readonly onScrollSync: (el: HTMLDivElement) => void;
  readonly bt: (ko: string, en: string) => string;
}

/** 단일 비교 페인: 소스 피커 + 줌/스크롤 뷰포트. */
function ComparePane({
  item,
  badge,
  groups,
  onSelect,
  transformCss,
  gestures,
  viewportRef,
  onScrollSync,
  bt,
}: PaneViewportProps) {
  const selectedValue = item ? `${item.processId}::${item.revisionId}` : "";
  const artSeed = item ? item.revisionIndex : 0;
  const imageSrc = item?.imageUrl ?? (item ? processComparePlaceholderArt(item.kind, item.processLabel, artSeed) : null);

  return (
    <section className="pcv-pane" aria-label={bt(`비교 페인 ${badge}`, `Compare pane ${badge}`)}>
      <div className="pcv-pane-head">
        <span className="pcv-pane-badge" aria-hidden="true">{badge}</span>
        <select
          className="pcv-picker"
          value={selectedValue}
          onChange={(event) => {
            const [processId, revisionId] = event.target.value.split("::");
            if (processId && revisionId) onSelect({ processId, revisionId });
          }}
          aria-label={bt("이 페인에 표시할 공정과 버전 선택", "Choose process and version for this pane")}
        >
          <option value="">{bt("선택…", "Select…")}</option>
          {groups.map((group) => (
            <optgroup key={group.processId} label={group.processLabel}>
              {group.items.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.processLabel} · {candidate.revisionLabel}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div
        className="pcv-viewport"
        ref={viewportRef}
        onScroll={(event) => onScrollSync(event.currentTarget)}
        onPointerDown={gestures.onPointerDown}
        onPointerMove={gestures.onPointerMove}
        onPointerUp={gestures.onPointerUp}
        onPointerCancel={gestures.onPointerCancel}
        onWheel={gestures.onWheel}
        data-testid={`pcv-viewport-${badge}`}
      >
        {item && imageSrc ? (
          <div className="pcv-zoomwrap" style={{ transform: transformCss }}>
            <img
              className="pcv-image"
              src={imageSrc}
              alt={`${item.processLabel} ${item.revisionLabel}`}
              draggable={false}
            />
          </div>
        ) : (
          <div className="pcv-empty">
            <ProcessComparePaneEmptyArt />
            <p>{bt("위에서 공정과 버전을 선택하세요", "Choose a process and version above")}</p>
          </div>
        )}
      </div>
      <div className="pcv-foot">
        <span className="pcv-status" data-tone={item ? item.statusTone : "ready"}>
          {item
            ? `${bt(compareSourceKindLabel(item.sourceKind).ko, compareSourceKindLabel(item.sourceKind).en)} · ${item.processLabel} · ${item.revisionLabel}`
            : bt("미선택", "Unselected")}
        </span>
        {item ? <time dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time> : null}
      </div>
    </section>
  );
}

export interface ProcessCompareViewerProps {
  readonly items: readonly ProcessCompareItem[];
  /** 버전 외 소스(지난 회차 페이지·레퍼런스 보드 이미지)를 같은 풀에 합치는 추가 항목. */
  readonly extraItems?: readonly ProcessCompareItem[];
  /** 외부 파일·URL 추가 UI를 숨긴다(읽기 전용 표면). 기본은 표시. */
  readonly allowExternalAdd?: boolean;
  readonly initialLayout?: ProcessCompareLayout;
  readonly onClose?: () => void;
  readonly title?: string;
}

/**
 * 공정 비교 뷰어: 2~4개 페인 나란히 보기 + 비포·애프터 슬라이더 + 깜빡임 비교.
 * 시각적 품질이 최우선 — 슬라이더 드래그는 직접 DOM 업데이트로 60fps를 노린다.
 */
export function ProcessCompareViewer({ items, extraItems, allowExternalAdd = true, initialLayout = 2, onClose, title }: ProcessCompareViewerProps) {
  const bt = useBilingual("ProcessCompare");
  // 소스 풀: 부모가 준 버전·지난 회차·레퍼런스 항목 + 이 뷰어에서 직접 추가한 외부 이미지를 한 풀로 합친다.
  const [addedItems, setAddedItems] = useState<readonly ProcessCompareItem[]>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlNote, setUrlNote] = useState("");
  const [poolError, setPoolError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const poolItems = useMemo(
    () => mergeProcessCompareItems(items, extraItems ?? [], addedItems),
    [items, extraItems, addedItems],
  );
  const poolCounts = useMemo(() => countProcessCompareItemsBySourceKind(poolItems), [poolItems]);

  const addFiles = useCallback((files: readonly File[]) => {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const dataUrl: string = reader.result;
        setAddedItems((prev) => mergeProcessCompareItems(prev, [buildExternalCompareItem({
          assetId: externalCompareAssetIdForFile(file),
          label: file.name,
          imageUrl: dataUrl,
          createdAt: file.lastModified > 0 ? new Date(file.lastModified).toISOString() : new Date().toISOString(),
        })]));
        setPoolError(null);
      };
      reader.onerror = () => setPoolError(bt("파일을 읽지 못했습니다. 다른 이미지를 시도해 주세요.", "Could not read that file. Try another image."));
      reader.readAsDataURL(file);
    }
  }, [bt]);

  const addUrl = useCallback(() => {
    const check = validateExternalCompareUrl(urlDraft);
    if (!check.ok) {
      setPoolError(check.reason === "protocol"
        ? bt("http 또는 https 주소만 추가할 수 있습니다.", "Only http or https URLs can be added.")
        : bt("올바른 이미지 주소를 입력해 주세요.", "Enter a valid image URL."));
      return;
    }
    let label = check.url;
    try {
      const parsed = new URL(check.url);
      const tail = parsed.pathname.split("/").filter(Boolean).pop();
      label = tail ? decodeURIComponent(tail) : parsed.hostname;
    } catch { /* 이미 검증된 주소라 도달하지 않지만 라벨은 원문을 쓴다 */ }
    setAddedItems((prev) => mergeProcessCompareItems(prev, [buildExternalCompareItem({
      assetId: externalCompareAssetIdForUrl(check.url),
      label,
      imageUrl: check.url,
      createdAt: new Date().toISOString(),
      originNote: urlNote.trim() ? urlNote.trim() : null,
    })]));
    setUrlDraft("");
    setUrlNote("");
    setPoolError(null);
  }, [bt, urlDraft, urlNote]);
  const [layout, setLayout] = useState<ProcessCompareLayout>(initialLayout);
  const [mode, setMode] = useState<ProcessCompareMode>("panes");
  const [sources, setSources] = useState<readonly ProcessComparePaneSource[]>(() =>
    defaultProcessCompareSources(items, initialLayout),
  );
  // 2단계: 배율·이동 잠금(기본 켜짐). 켜지면 공유 뷰포트+스크롤 동기가 함께 움직이고,
  // 끄면 페인별 개별 뷰포트로 독립 조작한다. 잠금 상태는 툴바 버튼으로 항상 보인다(§5.1).
  const [syncView, setSyncView] = useState(true);
  const viewport = useProcessCompareViewport();
  const [offsets, setOffsets] = useState<Readonly<Record<string, ProcessComparePaneOffset>>>({});
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [blinkMs, setBlinkMs] = useState(800);
  const [blinkOn, setBlinkOn] = useState(true);
  const [diffOn, setDiffOn] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  // 프리셋 적용 결과 안내(성공 배치/실패 사유). 풀 스트립 안에 상태 문구로 보여 준다.
  const [presetMessage, setPresetMessage] = useState<{ readonly tone: "ok" | "warn"; readonly text: string } | null>(null);

  const viewportRefs = useRef<(HTMLDivElement | null)[]>([]);
  const syncingRef = useRef(false);
  const imgARef = useRef<HTMLImageElement | null>(null);
  const imgBRef = useRef<HTMLImageElement | null>(null);

  const slider = useProcessCompareSliderDrag();
  const { phase: blinkPhase, togglePhase: toggleBlinkPhase } = useProcessCompareBlink(
    mode === "blink",
    blinkOn,
    blinkMs,
  );

  const groups = useMemo(() => groupProcessCompareItems(poolItems), [poolItems]);
  const canOpen = canOpenProcessCompare(poolItems);

  const paneItems = useMemo(
    () => sources.map((source) => findProcessCompareItem(poolItems, source)),
    [sources, poolItems],
  );

  // 풀이 뒤늦게 채워지거나(실데이터 로드·외부 추가) 페인이 풀 밖 항목을 가리키면 기본 구성으로 다시 맞춘다.
  useEffect(() => {
    setSources((prev) => {
      const valid = prev.filter((source) => findProcessCompareItem(poolItems, source) !== null);
      if (valid.length === prev.length && valid.length > 0) return prev;
      if (valid.length > 0) return valid;
      return defaultProcessCompareSources(poolItems, layout);
    });
  }, [poolItems, layout]);

  // 슬라이더/깜빡임 모드에서 쓰는 두 페인 (첫 두 페인)
  const compareA = paneItems[0] ?? null;
  const compareB = paneItems[1] ?? null;
  const artA = compareA ? (compareA.imageUrl ?? processComparePlaceholderArt(compareA.kind, compareA.processLabel, compareA.revisionIndex)) : null;
  const artB = compareB ? (compareB.imageUrl ?? processComparePlaceholderArt(compareB.kind, compareB.processLabel, compareB.revisionIndex)) : null;

  const diffRegions = useProcessCompareDiffRegions(diffOn, mode, artA, artB, imgARef, imgBRef);

  // 페인별 실제 변환: 잠금이면 공유 뷰포트, 아니면 페인 개별 뷰포트에
  // 그 소스의 정렬 오프셋과 전 페인 동시 반전을 합성한다(모델의 순수 함수).
  const paneTransformCss = useCallback((index: number): string => {
    const source = sources[index];
    return processComparePaneTransformCss(resolveProcessComparePaneTransform({
      syncView,
      shared: viewport.shared,
      local: viewport.localFor(index),
      offset: source ? (offsets[processComparePaneKey(source)] ?? null) : null,
      flipHorizontal,
      flipVertical,
    }));
  }, [sources, syncView, viewport, offsets, flipHorizontal, flipVertical]);

  const displayScale = viewport.viewportFor(0, syncView).scale;
  const offsetsAligned = areProcessCompareOffsetsAligned(offsets);

  const handleZoomStep = useCallback((direction: 1 | -1) => {
    const step = direction === 1 ? zoomProcessCompareIn : zoomProcessCompareOut;
    if (syncView) {
      viewport.setScale(0, true, step(viewport.shared.scale));
      return;
    }
    // 잠금 해제 시에는 각 페인이 자기 배율에서 한 단계씩 움직인다.
    for (let i = 0; i < layout; i += 1) viewport.setScale(i, false, step(viewport.localFor(i).scale));
  }, [syncView, viewport, layout]);

  const handleResetView = useCallback(() => {
    viewport.reset();
    setOffsets({});
    setLiveMessage(bt("보기 초기화", "View reset"));
  }, [viewport, bt]);

  const modeLabel = useCallback((m: ProcessCompareMode) => bt(MODE_COPY[m].ko, MODE_COPY[m].en), [bt]);

  const handleModeChange = useCallback((next: ProcessCompareMode) => {
    setMode(next);
    setLiveMessage(bt(MODE_COPY[next].ko, MODE_COPY[next].en));
  }, [bt]);

  // 레이아웃 변경 시 페인 수 맞추기
  const handleLayoutChange = useCallback((next: ProcessCompareLayout) => {
    setLayout(next);
    setSources((prev) => {
      if (prev.length === next) return prev;
      if (prev.length > next) return prev.slice(0, next);
      const filled = [...prev];
      const defaults = defaultProcessCompareSources(poolItems, next);
      for (const candidate of defaults) {
        if (filled.length >= next) break;
        if (!filled.some((s) => s.processId === candidate.processId && s.revisionId === candidate.revisionId)) {
          filled.push(candidate);
        }
      }
      return filled;
    });
  }, [poolItems]);

  const handlePaneSelect = useCallback((index: number, source: ProcessComparePaneSource) => {
    setSources((prev) => prev.map((s, i) => (i === index ? source : s)));
  }, []);

  // 검수 프리셋 원클릭 적용: 모델이 고른 [현재 원고, 상대 소스] 쌍을 2페인 나란히로 배치한다.
  // 프리셋은 배치가 끝이며, 이후 페인·모드 조작은 자유다(§5.7). 실패하면 사유별 안내를 남긴다.
  const handleApplyPreset = useCallback((preset: ProcessComparePresetId) => {
    const result = applyProcessComparePreset(poolItems, preset, sources);
    const label = PROCESS_COMPARE_PRESET_LABELS[preset];
    if (!result.ok) {
      setPresetMessage({
        tone: "warn",
        text: result.reason === "no-current"
          ? bt("현재 원고가 소스 풀에 없습니다. 버전이 불러와지거나, 비교할 이미지를 첫 페인에 먼저 배치해 주세요.", "No current manuscript is in the source pool. Load a version, or place an image in the first pane first.")
          : bt(PRESET_NO_COUNTERPART_COPY[preset].ko, PRESET_NO_COUNTERPART_COPY[preset].en),
      });
      return;
    }
    setSources(result.sources);
    setLayout(2);
    setMode("panes");
    const text = bt(
      `${label.ko}: ${result.current.processLabel} · ${result.current.revisionLabel} ↔ ${result.counterpart.processLabel} · ${result.counterpart.revisionLabel}`,
      `${label.en}: ${result.current.processLabel} · ${result.current.revisionLabel} ↔ ${result.counterpart.processLabel} · ${result.counterpart.revisionLabel}`,
    );
    setPresetMessage({ tone: "ok", text });
    setLiveMessage(text);
  }, [bt, poolItems, sources]);

  const handleScrollSync = useCallback((el: HTMLDivElement) => {
    if (!syncView || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const targets = viewportRefs.current.filter((node): node is HTMLDivElement => node !== null && node !== el);
      applySyncedScroll(targets, el);
    } finally {
      syncingRef.current = false;
    }
  }, [syncView]);

  const poolStrip = (
    <section
      className="pcv-pool"
      data-testid="pcv-source-pool"
      data-drag-over={dragOver}
      aria-label={bt("비교 소스 풀", "Compare source pool")}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (allowExternalAdd) addFiles([...event.dataTransfer.files]);
      }}
    >
      <div className="pcv-pool-head">
        <strong>{bt("비교 소스 풀", "Source pool")}</strong>
        <span className="pcv-pool-counts">
          {(Object.keys(poolCounts) as Array<keyof typeof poolCounts>).map((kind) => (
            <span key={kind} className="pcv-pool-badge" data-kind={kind}>
              {bt(compareSourceKindLabel(kind).ko, compareSourceKindLabel(kind).en)} {poolCounts[kind]}
            </span>
          ))}
        </span>
      </div>
      {poolItems.length ? (
        <ul className="pcv-pool-list">
          {poolItems.map((item) => (
            <li key={item.id} data-kind={item.sourceKind}>
              {item.processLabel} · {item.revisionLabel}
              {item.originNote ? <span className="pcv-pool-note"> ({item.originNote})</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pcv-pool-empty">{bt("아직 비교 소스가 없습니다. 버전이 불러와지거나, 아래에서 외부 이미지를 추가하면 바로 비교할 수 있습니다.", "No compare sources yet. Add an external image below, or wait for versions to load.")}</p>
      )}
      <div className="pcv-pool-presets" role="group" aria-label={bt("검수 프리셋", "Review presets")}>
        <span className="pcv-pool-presets-label">{bt("원클릭 프리셋", "One-click presets")}</span>
        {PROCESS_COMPARE_PRESET_IDS.map((preset) => {
          const PresetIcon = PRESET_ICONS[preset];
          const label = PROCESS_COMPARE_PRESET_LABELS[preset];
          return (
            <button
              key={preset}
              type="button"
              className="pcv-tool-btn"
              data-testid={`pcv-preset-${preset}`}
              onClick={() => handleApplyPreset(preset)}
              title={bt("현재 원고를 첫 페인에, 상대 소스를 두 번째 페인에 자동으로 배치합니다", "Place the current manuscript in the first pane and its counterpart in the second, automatically")}
            >
              <PresetIcon size={15} aria-hidden="true" />
              {bt(label.ko, label.en)}
            </button>
          );
        })}
      </div>
      {presetMessage ? (
        <p className="pcv-pool-preset-msg" data-tone={presetMessage.tone} role="status">{presetMessage.text}</p>
      ) : null}
      {allowExternalAdd ? (
        <div className="pcv-pool-add">
          <label className="pcv-tool-btn">
            <ImagePlus size={15} aria-hidden="true" />
            {bt("파일 추가", "Add file")}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              aria-label={bt("외부 이미지 파일 추가", "Add external image files")}
              onChange={(event) => {
                addFiles([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
          </label>
          <input
            type="url"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            placeholder="https://…"
            aria-label={bt("외부 이미지 주소", "External image URL")}
          />
          <input
            type="text"
            value={urlNote}
            onChange={(event) => setUrlNote(event.target.value)}
            placeholder={bt("출처 메모 (선택)", "Source note (optional)")}
            aria-label={bt("외부 이미지 출처 메모", "External image source note")}
          />
          <button type="button" className="pcv-tool-btn" onClick={addUrl} disabled={!urlDraft.trim()}>
            <Globe size={15} aria-hidden="true" />
            {bt("주소 추가", "Add URL")}
          </button>
          <span className="pcv-pool-hint">{bt("이미지 파일을 이 영역에 끌어다 놓아도 추가됩니다", "Drop image files here to add them")}</span>
        </div>
      ) : null}
      {poolError ? <p className="pcv-pool-error" role="alert">{poolError}</p> : null}
    </section>
  );

  if (!canOpen) {
    return (
      <div className="pcv-root" data-testid="pcv-root">
        {poolStrip}
        <div className="pcv-empty">
          <ProcessCompareNoDataArt />
          <p>{bt("비교할 소스가 2개 이상 필요합니다", "Need at least 2 sources to compare")}</p>
          <p className="pcv-empty-hint">
            {bt(
              "버전·지난 회차·레퍼런스 중 2개 이상이 풀에 있거나, 위 풀에서 외부 이미지를 추가하면 바로 나란히 비교할 수 있습니다",
              "Add an external image in the pool above, or load at least 2 versions, pages or references",
            )}
          </p>
          {onClose ? (
            <button type="button" className="pcv-tool-btn" data-primary="true" onClick={onClose}>
              <X size={15} aria-hidden="true" />
              {title ?? bt("닫기", "Close")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="pcv-root" data-testid="pcv-root">
      {poolStrip}
      {/* ── 툴바 ── */}
      <div className="pcv-toolbar" role="toolbar" aria-label={bt("비교 도구", "Compare tools")}>
        <div className="pcv-seg" role="group" aria-label={bt("비교 방식", "Compare mode")}>
          {(Object.keys(MODE_ICONS) as ProcessCompareMode[]).map((m) => {
            const Icon = MODE_ICONS[m];
            return (
              <button
                key={m}
                type="button"
                data-active={mode === m}
                onClick={() => handleModeChange(m)}
                aria-pressed={mode === m}
                title={modeLabel(m)}
              >
                <Icon size={15} aria-hidden="true" />
                {modeLabel(m)}
              </button>
            );
          })}
        </div>

        {mode === "panes" && (
          <div className="pcv-seg" role="group" aria-label={bt("페인 개수", "Pane count")}>
            {([2, 3, 4] as ProcessCompareLayout[]).map((n) => (
              <button
                key={n}
                type="button"
                data-active={layout === n}
                onClick={() => handleLayoutChange(n)}
                aria-pressed={layout === n}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="pcv-tool-btn"
          data-active={syncView}
          onClick={() => setSyncView((v) => !v)}
          aria-pressed={syncView}
          data-testid="pcv-sync-lock"
          title={bt("한 페인을 확대·이동·스크롤하면 전 페인이 같은 배율·같은 정렬 기준으로 함께 움직임", "Zoom, pan and scroll every pane together at the same scale and alignment")}
        >
          {syncView ? <Link2 size={15} aria-hidden="true" /> : <Link2Off size={15} aria-hidden="true" />}
          {bt("배율·이동 잠금", "Sync zoom & pan")}
        </button>

        <button
          type="button"
          className="pcv-tool-btn"
          data-active={flipHorizontal}
          onClick={() => setFlipHorizontal((v) => !v)}
          aria-pressed={flipHorizontal}
          data-testid="pcv-flip-both"
          title={bt("전 페인을 동시에 좌우 반전 (구도·밸런스 검수)", "Flip every pane horizontally at once (composition check)")}
        >
          <FlipHorizontal2 size={15} aria-hidden="true" />
          {bt("양쪽 반전", "Flip both")}
        </button>

        {(mode === "slider" || mode === "blink" || mode === "overlay") && (
          <button
            type="button"
            className="pcv-tool-btn"
            data-active={diffOn}
            onClick={() => setDiffOn((v) => !v)}
            aria-pressed={diffOn}
            title={bt("두 이미지 간 차이가 큰 영역을 표시", "Highlight areas with big differences")}
          >
            <ScanSearch size={15} aria-hidden="true" />
            {bt("차이 표시", "Show diff")}
          </button>
        )}
      </div>

      {/* ── 나란히 보기 ── */}
      {mode === "panes" && (
        <div className="pcv-panes" data-layout={layout}>
          {paneItems.map((item, index) => (
            <ComparePane
              key={`pane-${index}`}
              item={item}
              badge={String(index + 1)}
              groups={groups}
              onSelect={(source) => handlePaneSelect(index, source)}
              transformCss={paneTransformCss(index)}
              gestures={viewport.gestureHandlers(index, syncView)}
              viewportRef={(el) => { viewportRefs.current[index] = el; }}
              onScrollSync={handleScrollSync}
              bt={bt}
            />
          ))}
        </div>
      )}

      {/* ── 비포·애프터 슬라이더 ── */}
      {mode === "slider" && (
        <div
          className="pcv-slider-stage"
          ref={slider.stageRef}
          data-testid="pcv-slider-stage"
          onPointerDown={slider.onPointerDown}
          onPointerMove={slider.onPointerMove}
          onPointerUp={slider.onPointerUp}
          onPointerCancel={slider.onPointerUp}
          onWheel={viewport.gestureHandlers(0, syncView).onWheel}
        >
          <div className="pcv-slider-layer" data-testid="pcv-slider-after">
            {artB ? (
              <img ref={imgBRef} src={artB} alt={compareB ? `${compareB.processLabel} ${compareB.revisionLabel}` : ""} draggable={false} crossOrigin="anonymous" style={{ transform: paneTransformCss(1) }} />
            ) : null}
            <span className="pcv-slider-tag" data-side="after">
              {compareB ? `${compareB.processLabel} · ${compareB.revisionLabel}` : bt("이후", "After")}
            </span>
          </div>
          <div
            className="pcv-slider-layer"
            ref={slider.beforeRef}
            data-testid="pcv-slider-before"
            style={{ clipPath: processCompareSliderClip(slider.position) }}
          >
            {artA ? (
              <img ref={imgARef} src={artA} alt={compareA ? `${compareA.processLabel} ${compareA.revisionLabel}` : ""} draggable={false} crossOrigin="anonymous" style={{ transform: paneTransformCss(0) }} />
            ) : null}
            <span className="pcv-slider-tag" data-side="before">
              {compareA ? `${compareA.processLabel} · ${compareA.revisionLabel}` : bt("이전", "Before")}
            </span>
          </div>
          {diffOn && diffRegions.map((region, i) => (
            <div
              key={i}
              className="pcv-diff-region"
              data-testid="pcv-diff-region"
              style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}
            />
          ))}
          <div
            className="pcv-slider-handle"
            ref={slider.handleRef}
            data-testid="pcv-slider-handle"
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
        </div>
      )}

      {/* ── 깜빡임 비교 ── */}
      {mode === "blink" && (
        <div className="pcv-blink-stage" data-testid="pcv-blink-stage">
          <div className="pcv-blink-layer" style={{ opacity: blinkPhase ? 0 : 1 }} data-testid="pcv-blink-a">
            {artA ? (
              <img ref={imgARef} src={artA} alt={compareA ? `${compareA.processLabel} ${compareA.revisionLabel}` : ""} draggable={false} crossOrigin="anonymous" style={{ transform: paneTransformCss(0) }} />
            ) : null}
            <span className="pcv-slider-tag" data-side="before">
              {compareA ? `${compareA.processLabel} · ${compareA.revisionLabel}` : bt("이전", "Before")}
            </span>
          </div>
          <div className="pcv-blink-layer" style={{ opacity: blinkPhase ? 1 : 0 }} data-testid="pcv-blink-b">
            {artB ? (
              <img ref={imgBRef} src={artB} alt={compareB ? `${compareB.processLabel} ${compareB.revisionLabel}` : ""} draggable={false} crossOrigin="anonymous" style={{ transform: paneTransformCss(1) }} />
            ) : null}
            <span className="pcv-slider-tag" data-side="after">
              {compareB ? `${compareB.processLabel} · ${compareB.revisionLabel}` : bt("이후", "After")}
            </span>
          </div>
          {diffOn && diffRegions.map((region, i) => (
            <div
              key={i}
              className="pcv-diff-region"
              data-testid="pcv-diff-region"
              style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}
            />
          ))}
          <div className="pcv-blink-controls">
            <label>
              <input
                type="checkbox"
                checked={blinkOn}
                onChange={(e) => setBlinkOn(e.target.checked)}
              />
              {bt("자동 전환", "Auto toggle")}
            </label>
            <button type="button" className="pcv-tool-btn" onClick={toggleBlinkPhase}>
              {bt("수동 전환", "Toggle manually")}
            </button>
            <details className="pcv-advanced">
              <summary>{bt("고급 설정", "Advanced settings")}</summary>
              <label>
                {bt("주기", "Interval")}
                <input
                  type="range"
                  min={PROCESS_COMPARE_BLINK_MIN_MS}
                  max={PROCESS_COMPARE_BLINK_MAX_MS}
                  step={50}
                  value={blinkMs}
                  onChange={(e) => setBlinkMs(clampProcessCompareBlinkMs(Number(e.target.value)))}
                  aria-label={bt("깜빡임 주기", "Blink interval")}
                />
                <span>{blinkMs}ms</span>
              </label>
            </details>
          </div>
        </div>
      )}

      {/* ── 오버레이 비교 (2단계 신규) ── */}
      {mode === "overlay" && (
        <div
          className="pcv-overlay-stage"
          data-testid="pcv-overlay-stage"
          onWheel={viewport.gestureHandlers(0, syncView).onWheel}
        >
          <div className="pcv-overlay-layer" data-testid="pcv-overlay-base">
            {artA ? (
              <img ref={imgARef} src={artA} alt={compareA ? `${compareA.processLabel} ${compareA.revisionLabel}` : ""} draggable={false} crossOrigin="anonymous" style={{ transform: paneTransformCss(0) }} />
            ) : null}
            <span className="pcv-slider-tag" data-side="before">
              {compareA ? `${compareA.processLabel} · ${compareA.revisionLabel}` : bt("기준", "Base")}
            </span>
          </div>
          <div
            className="pcv-overlay-layer"
            data-testid="pcv-overlay-top"
            style={{ opacity: overlayOpacity }}
          >
            {artB ? (
              <img ref={imgBRef} src={artB} alt={compareB ? `${compareB.processLabel} ${compareB.revisionLabel}` : ""} draggable={false} crossOrigin="anonymous" style={{ transform: paneTransformCss(1) }} />
            ) : null}
            <span className="pcv-slider-tag" data-side="after">
              {compareB ? `${compareB.processLabel} · ${compareB.revisionLabel}` : bt("겹침", "Overlay")}
            </span>
          </div>
          {diffOn && diffRegions.map((region, i) => (
            <div
              key={i}
              className="pcv-diff-region"
              data-testid="pcv-diff-region"
              style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}
            />
          ))}
          <div className="pcv-overlay-controls">
            <label>
              {bt("겹친 이미지 투명도", "Overlay opacity")}
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(overlayOpacity * 100)}
                onChange={(e) => setOverlayOpacity(clampProcessCompareOverlayOpacity(Number(e.target.value) / 100))}
                aria-label={bt("오버레이 투명도", "Overlay opacity")}
                data-testid="pcv-overlay-opacity"
              />
              <span>{Math.round(overlayOpacity * 100)}%</span>
            </label>
          </div>
        </div>
      )}

      {/* ── 하단 상태바 ── */}
      <div className="pcv-statusbar">
        <span data-testid="pcv-hint">
          {mode === "slider"
            ? bt("가운데 핸들을 잡고 드래그하세요 · ←/→ 키로 미세 조정", "Drag the center handle · ←/→ for fine control")
            : mode === "blink"
              ? bt("두 이미지가 번갈아 표시됩니다 · 차이가 보이는 곳을 찾으세요", "Images alternate · spot the differences")
              : mode === "overlay"
                ? bt("투명도를 조절해 두 이미지의 어긋남을 확인하세요 · Ctrl+휠로 확대 · 드래그로 이동", "Adjust opacity to check alignment · Ctrl+wheel to zoom · drag to pan")
                : bt("드래그로 이동 · Ctrl+휠로 확대 · 잠금을 켜면 전 페인이 함께 움직임", "Drag to pan · Ctrl+wheel to zoom · with sync lock every pane moves together")}
        </span>
        {diffOn && mode !== "panes" && !offsetsAligned ? (
          <span className="pcv-align-note">{bt("정렬 오프셋이 있어 차이 표시가 어긋날 수 있습니다", "Alignment offsets are set — diff highlights may be shifted")}</span>
        ) : null}
        <div className="pcv-zoomctl" role="group" aria-label={bt("확대/축소", "Zoom")}>
          <button type="button" className="pcv-tool-btn" onClick={() => handleZoomStep(-1)} aria-label={bt("축소", "Zoom out")} disabled={displayScale <= 0.5}>
            <ZoomOut size={15} aria-hidden="true" />
          </button>
          <span className="pcv-zoomval" data-testid="pcv-zoomval">{Math.round(clampProcessCompareZoom(displayScale) * 100)}%</span>
          <button type="button" className="pcv-tool-btn" onClick={() => handleZoomStep(1)} aria-label={bt("확대", "Zoom in")} disabled={displayScale >= 4}>
            <ZoomIn size={15} aria-hidden="true" />
          </button>
          <button type="button" className="pcv-tool-btn" onClick={handleResetView} aria-label={bt("보기 초기화 (배율·이동·정렬 오프셋)", "Reset view (zoom, pan, alignment offsets)")}>
            <RotateCcw size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── 고급: 페인별 정렬 오프셋 + 상하 반전 (기본 동선은 단순하게, 펼쳤을 때만 §5.1·5.3) ── */}
      <details className="pcv-advanced pcv-align-fold">
        <summary>{bt("정렬 오프셋 · 상하 반전 (고급)", "Alignment offsets · flip vertical (advanced)")}</summary>
        <label className="pcv-align-flip">
          <input
            type="checkbox"
            checked={flipVertical}
            onChange={(e) => setFlipVertical(e.target.checked)}
          />
          <FlipVertical2 size={14} aria-hidden="true" />
          {bt("전 페인 상하 반전", "Flip every pane vertically")}
        </label>
        {(mode === "panes" ? paneItems : paneItems.slice(0, 2)).map((item, index) => {
          const source = sources[index];
          if (!item || !source) return null;
          const key = processComparePaneKey(source);
          const offset = offsets[key] ?? { dx: 0, dy: 0 };
          return (
            <div key={key} className="pcv-align-row">
              <span className="pcv-align-label">{`${index + 1}. ${item.processLabel} · ${item.revisionLabel}`}</span>
              <label>
                {bt("가로", "X")}
                <input
                  type="range"
                  min={-PROCESS_COMPARE_OFFSET_LIMIT}
                  max={PROCESS_COMPARE_OFFSET_LIMIT}
                  step={0.01}
                  value={offset.dx}
                  onChange={(e) => setOffsets((prev) => setProcessComparePaneOffset(prev, key, { dx: Number(e.target.value), dy: offset.dy }))}
                  aria-label={bt(`${index + 1}번 페인 가로 정렬 오프셋`, `Pane ${index + 1} horizontal alignment offset`)}
                />
              </label>
              <label>
                {bt("세로", "Y")}
                <input
                  type="range"
                  min={-PROCESS_COMPARE_OFFSET_LIMIT}
                  max={PROCESS_COMPARE_OFFSET_LIMIT}
                  step={0.01}
                  value={offset.dy}
                  onChange={(e) => setOffsets((prev) => setProcessComparePaneOffset(prev, key, { dx: offset.dx, dy: Number(e.target.value) }))}
                  aria-label={bt(`${index + 1}번 페인 세로 정렬 오프셋`, `Pane ${index + 1} vertical alignment offset`)}
                />
              </label>
              <span className="pcv-align-val">{`${Math.round(offset.dx * 100)}%, ${Math.round(offset.dy * 100)}%`}</span>
            </div>
          );
        })}
      </details>

      {/* 닫기: 다이얼로그로 쓸 때 부모가 전달 */}
      {onClose ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="pcv-tool-btn pcv-close" onClick={onClose}>
            <X size={15} aria-hidden="true" />
            {title ?? bt("닫기", "Close")}
          </button>
        </div>
      ) : null}
      <div className="pcv-live" aria-live="polite" data-testid="pcv-live">{liveMessage}</div>
    </div>
  );
}
