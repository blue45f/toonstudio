import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProductionProjectAggregate, Submission } from "@toonstudio/core/production";
import type { PinnedSubmissionPreview, PinnedSubmissionVisualSource, SubmissionVisualReviewData } from "./production-submission-visual-review";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const ProductionSubmissionWriterRoom = lazy(() => import("./ProductionSubmissionWriterRoom"));

type VisualState = { kind: "loading" } | { kind: "error"; message: string; captureHref?: string | null }
  | { kind: "ready"; data: SubmissionVisualReviewData; pages: readonly PinnedSubmissionPreview[]; complete: boolean };
type BaselineState = { kind: "idle" } | { kind: "loading"; revisionId: string; sourceKey: string }
  | { kind: "error"; revisionId: string; sourceKey: string; message: string }
  | { kind: "ready"; revisionId: string; sourceKey: string; pages: readonly PinnedSubmissionPreview[]; complete: boolean };

const bindingGenerations = new WeakMap<PinnedSubmissionVisualSource, number>();
let nextBindingGeneration = 0;
const previewSourceKey = (source: PinnedSubmissionVisualSource) => {
  if (source.outputEvidence && !bindingGenerations.has(source)) bindingGenerations.set(source, ++nextBindingGeneration);
  return JSON.stringify([source.projectId, source.workId, source.artifact.id, source.revision.id,
    source.revision.rootGraphHash, source.review.id, source.outputEvidence ? bindingGenerations.get(source) : null]);
};

function PinnedImage({ preview, label, canRefresh, onRefresh, onLoaded, selectedFrames = [] }: { readonly preview: PinnedSubmissionPreview | undefined; readonly label: string; readonly canRefresh: boolean;
  readonly selectedFrames?: readonly string[];
  readonly onRefresh: () => void; readonly onLoaded: () => void }) {
  const bt = useBilingual("ProductionSubmissionVisualReview");
  const [failed, setFailed] = useState(false);
  const selectedFrameIds = new Set(selectedFrames);
  const [expired] = useState(() => preview != null && preview.expiresAt <= Date.now());
  useEffect(() => { if (canRefresh && (expired || failed)) onRefresh(); }, [canRefresh, expired, failed, onRefresh]);
  if (!preview) return <p className="p-6 text-sm text-fg-2">{bt("이 버전에는 해당 순번의 이미지가 없습니다.", "This version has no image at this position.")}</p>;
  return failed || expired ? <p role="alert" className="p-6 text-sm text-bad">{bt("이미지를 다시 확인하고 있습니다. 복구되지 않으면 이미지 새로고침을 눌러 주세요.", "Checking the image again. Refresh images if it does not recover.")}</p>
    : <div className="relative"><img src={preview.url} alt={label} className="block h-auto w-full" referrerPolicy="no-referrer" onLoad={onLoaded} onError={() => setFailed(true)} />
      {preview.mapping.status === "mapped" && selectedFrames.length > 0 ? <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full text-accent"
        viewBox={`0 0 ${preview.mapping.page.width} ${preview.mapping.page.height}`} preserveAspectRatio="none">
        {preview.mapping.page.frames.filter((frame) => selectedFrameIds.has(frame.id)).map((frame) => frame.polygon
          ? <polygon key={frame.id} points={frame.polygon.map((point) => `${point.x},${point.y}`).join(" ")} fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          : <rect key={frame.id} x={frame.bounds.x} y={frame.bounds.y} width={frame.bounds.width} height={frame.bounds.height}
            fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      </svg> : null}</div>;
}

/** 선택 제출본과 저장된 입력본만 읽는다. 핀 작성은 같은 고정 버전의 Studio 검수에 맡긴다. */
export function ProductionSubmissionVisualReview({ aggregate, submission }: {
  readonly aggregate: ProductionProjectAggregate;
  readonly submission: Submission;
}) {
  const identity = JSON.stringify([aggregate.projectId, aggregate.workId, submission.id, submission.deliverableId, submission.revisionRef, submission.inputRevisionRefs, submission.sourceEvidence,
    aggregate.deliverables.find((entry) => entry.id === submission.deliverableId)?.scope,
    aggregate.submissions.filter((entry) => entry.deliverableId === submission.deliverableId && entry.id !== submission.id)
      .map((entry) => [entry.id, entry.projectId, entry.submittedAt, entry.revisionRef, entry.sourceEvidence]),
    (aggregate.studioRevisionLinks ?? []).filter((entry) => entry.submissionId === submission.id)
      .map((entry) => [entry.projectId, entry.workId, entry.deliverableId, entry.studioRevisionRef, entry.status === "superseded"])]);
  return <>{submission.sourceEvidence?.documentRole === "story" || submission.revisionRef.lineage === "narrative" ? <Suspense fallback={null}>
    <ProductionSubmissionWriterRoom aggregate={aggregate} submission={submission} />
  </Suspense> : null}<SubmissionVisualReview key={identity} aggregate={aggregate} submission={submission} /></>;
}

function SubmissionVisualReview({ aggregate, submission }: { readonly aggregate: ProductionProjectAggregate; readonly submission: Submission }) {
  const bt = useBilingual("ProductionSubmissionVisualReview");
  // 같은 정본을 주기적으로 재조회해 객체만 바뀌어도 이미지 조회와 비교 상태를 유지한다.
  const [request] = useState(() => ({ aggregate, submission }));
  const [opened, setOpened] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<VisualState>({ kind: "loading" });
  const [baselineId, setBaselineId] = useState("");
  const [baselineState, setBaselineState] = useState<BaselineState>({ kind: "idle" });
  const [ordinal, setOrdinal] = useState<number | null>(null);
  const [mode, setMode] = useState<"compare" | "overlay">("compare");
  const [opacity, setOpacity] = useState(0.5);
  const [autoRefreshCount, setAutoRefreshCount] = useState(0);
  const autoAttempts = useRef(new Set<string>());
  const autoInFlight = useRef(new Map<string, AbortController>());
  const requestGeneration = useRef(0);
  const demo = aggregate.projectId === "sample-project";
  const cancelAutoRefreshes = useCallback(() => {
    for (const controller of autoInFlight.current.values()) controller.abort();
    autoInFlight.current.clear();
  }, []);
  useLayoutEffect(() => () => { requestGeneration.current += 1; cancelAutoRefreshes(); }, [cancelAutoRefreshes]);

  useEffect(() => {
    if (!opened || demo) return;
    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    setAutoRefreshCount(0);
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const { loadSubmissionVisualReview, loadPinnedSubmissionPreviews } = await import("./production-submission-visual-review");
        if (cancelled) return;
        const data = await loadSubmissionVisualReview(request.aggregate, request.submission);
        if (cancelled) return;
        const pages = await loadPinnedSubmissionPreviews(data.submission, { signal: controller.signal,
          onValidatedPrefix: (prefix) => {
            if (!cancelled && generation === requestGeneration.current) setState({ kind: "ready", data, pages: prefix, complete: false });
          } });
        if (!cancelled && generation === requestGeneration.current) setState({ kind: "ready", data, pages, complete: true });
      } catch (cause) {
        if (!cancelled && generation === requestGeneration.current) setState({ kind: "error", message: cause instanceof Error ? cause.message : bt("원고 이미지를 불러오지 못했습니다.", "Could not load manuscript images."),
          captureHref: cause instanceof Error && "captureHref" in cause && typeof cause.captureHref === "string" ? cause.captureHref : null });
      }
    })();
    return () => { cancelled = true; controller.abort(); cancelAutoRefreshes(); requestGeneration.current += 1; };
  }, [opened, refresh, request, demo, bt, cancelAutoRefreshes]);

  const baseline = state.kind === "ready" ? state.data.baselines.find((entry) => (entry.comparisonKey ?? entry.sourceRevisionRef.id) === baselineId) ?? null : null;
  useEffect(() => {
    if (!baseline) { setBaselineState({ kind: "idle" }); return; }
    let cancelled = false;
    const generation = requestGeneration.current;
    const controller = new AbortController();
    const sourceKey = previewSourceKey(baseline);
    setBaselineState({ kind: "loading", revisionId: baseline.revision.id, sourceKey });
    void import("./production-submission-visual-review").then(({ loadPinnedSubmissionPreviews }) => {
      if (cancelled) return null;
      return loadPinnedSubmissionPreviews(baseline, { signal: controller.signal, onValidatedPrefix: (prefix) => {
        if (!cancelled && generation === requestGeneration.current) setBaselineState({ kind: "ready", revisionId: baseline.revision.id, sourceKey, pages: prefix, complete: false });
      } });
    }).then((pages) => {
      if (!pages) return;
      if (!cancelled && generation === requestGeneration.current) setBaselineState({ kind: "ready", revisionId: baseline.revision.id, sourceKey, pages, complete: true });
    }).catch((cause: unknown) => {
      if (!cancelled && generation === requestGeneration.current) setBaselineState({ kind: "error", revisionId: baseline.revision.id, sourceKey, message: cause instanceof Error ? cause.message : bt("기준 원고를 불러오지 못했습니다.", "Could not load the baseline.") });
    });
    return () => { cancelled = true; controller.abort(); };
  }, [baseline, bt]);

  const submissionAutoKey = state.kind === "ready" ? previewSourceKey(state.data.submission) : null;
  const baselineAutoKey = baseline ? previewSourceKey(baseline) : null;
  const currentBaselineState = baseline && baselineState.kind !== "idle" && baselineState.revisionId === baseline.revision.id
    && baselineState.sourceKey === baselineAutoKey ? baselineState : null;
  useLayoutEffect(() => {
    let cancelled = 0;
    for (const [key, controller] of autoInFlight.current) {
      if (key === submissionAutoKey || key === baselineAutoKey) continue;
      controller.abort(); autoInFlight.current.delete(key); cancelled += 1;
    }
    if (cancelled) setAutoRefreshCount((value) => Math.max(0, value - cancelled));
  }, [submissionAutoKey, baselineAutoKey]);
  const baselinePages = currentBaselineState?.kind === "ready" ? currentBaselineState.pages : [];
  const ordinals = state.kind === "ready" ? [...new Set([...state.pages, ...baselinePages].map((page) => page.ordinal))].sort((left, right) => left - right) : [];
  const selectedOrdinal = ordinal !== null && ordinals.includes(ordinal) ? ordinal : ordinals[0];
  const currentPage = state.kind === "ready" ? state.pages.find((page) => page.ordinal === selectedOrdinal) : undefined;
  const baselinePage = baselinePages.find((page) => page.ordinal === selectedOrdinal);
  const imageKey = (source: PinnedSubmissionVisualSource, page: PinnedSubmissionPreview) => `${previewSourceKey(source)}:${page.ordinal}`;
  const autoRefresh = useCallback((source: PinnedSubmissionVisualSource, page: PinnedSubmissionPreview) => {
    const sourceKey = previewSourceKey(source);
    const attemptKey = `${sourceKey}:${page.ordinal}`;
    if (autoAttempts.current.has(attemptKey) || autoInFlight.current.has(sourceKey)) return;
    const controller = new AbortController();
    autoAttempts.current.add(attemptKey); autoInFlight.current.set(sourceKey, controller);
    const generation = requestGeneration.current;
    const currentRequest = () => generation === requestGeneration.current && !controller.signal.aborted
      && autoInFlight.current.get(sourceKey) === controller;
    setAutoRefreshCount((value) => value + 1);
    void import("./production-submission-visual-review").then(({ refreshPinnedSubmissionPreview }) => currentRequest()
      ? refreshPinnedSubmissionPreview(source, page, { signal: controller.signal }) : null)
      .then((updated) => {
        if (!updated || !currentRequest()) return;
        const replace = (entry: PinnedSubmissionPreview) => entry.ordinal === page.ordinal && entry.sha256 === page.sha256
          ? { ...entry, url: updated.url, expiresAt: updated.expiresAt } : entry;
        setState((current) => current.kind === "ready" && current.complete && previewSourceKey(current.data.submission) === sourceKey
          ? { ...current, pages: current.pages.map(replace) } : current);
        setBaselineState((current) => current.kind === "ready" && current.complete && current.sourceKey === sourceKey
          ? { ...current, pages: current.pages.map(replace) } : current);
      }).catch((cause: unknown) => {
        if (!currentRequest()) return;
        const message = cause instanceof Error ? cause.message : bt("고정 원고 이미지를 다시 확인해 주세요.", "Check the pinned manuscript images again.");
        setState((current) => current.kind === "ready" && previewSourceKey(current.data.submission) === sourceKey
          ? { kind: "error", message, captureHref: cause instanceof Error && "captureHref" in cause && typeof cause.captureHref === "string" ? cause.captureHref : null } : current);
        setBaselineState((current) => current.kind === "ready" && current.sourceKey === sourceKey
          ? { kind: "error", revisionId: source.revision.id, sourceKey, message } : current);
      })
      .finally(() => {
        if (autoInFlight.current.get(sourceKey) !== controller) return;
        autoInFlight.current.delete(sourceKey);
        if (generation === requestGeneration.current) setAutoRefreshCount((value) => Math.max(0, value - 1));
      });
  }, [bt]);
  const renderImage = (source: PinnedSubmissionVisualSource, page: PinnedSubmissionPreview | undefined) => {
    const complete = state.kind === "ready" && (source.revision.id === state.data.submission.revision.id
      ? state.complete : currentBaselineState?.kind === "ready" && currentBaselineState.complete === true);
    return <PinnedImage key={page ? `${page.url}:${page.expiresAt}` : `${source.revision.id}:missing`}
      preview={page} label={`${source.label} · ${Number(selectedOrdinal) + 1}`} canRefresh={complete}
      selectedFrames={source.outputEvidence?.pages.find((entry) => entry.ordinal === page?.ordinal)?.frameIds}
      onRefresh={() => { if (page && complete) autoRefresh(source, page); }}
      onLoaded={() => { if (page) autoAttempts.current.delete(imageKey(source, page)); }} />;
  };

  return <section className="border-b border-line bg-panel/50 p-4" aria-label={bt("고정 제출 원고 이미지", "Pinned submission images")}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-black">{bt("제출 원고 이미지", "Submitted manuscript images")}</h3>
        <p className="mt-1 text-xs text-fg-2">{bt("선택한 제출본의 저장 버전을 확인하고, 이전 제출본·고정 입력본과 비교합니다.", "Inspect the saved submission and compare it with previous submissions or pinned inputs.")}</p>
      </div>
      <button type="button" className={buttonClass({ variant: "outline", className: "min-h-11" })} disabled={demo || (opened && state.kind === "loading")}
        onClick={() => { requestGeneration.current += 1; cancelAutoRefreshes(); setAutoRefreshCount(0); setOpened(true); setRefresh((value) => value + 1); }}>
        {opened ? bt("이미지 새로고침", "Refresh images") : bt("제출 원고 이미지 열기", "Open submitted images")}
      </button>
    </div>
    {demo ? <p className="mt-2 text-xs text-fg-3">{bt("예시 프로젝트의 계획 도식입니다. 실제 프로젝트에서 저장된 원고 이미지를 확인할 수 있습니다.", "This sample uses plan diagrams. Saved manuscript images are available in your projects.")}</p> : null}
    {opened && state.kind === "loading" ? <p role="status" className="mt-3 text-sm">{bt("제출본의 고정 버전과 원고 이미지를 확인하는 중…", "Checking the pinned submission and loading images…")}</p> : null}
    {opened && state.kind === "error" ? <div role="alert" className="mt-3 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm"><p>{state.message}</p>
      {state.captureHref ? <a href={state.captureHref} className={buttonClass({ variant: "outline", className: "mt-3 min-h-11" })}>{bt("이 제출 정본으로 검수 이미지 만들기", "Create review images from this exact submission")}</a> : null}</div> : null}
    {opened && state.kind === "ready" ? <div className="mt-4 space-y-3">
      <p className="break-all text-xs text-fg-2">{state.data.submission.artifact.title} · {state.data.submission.label} · {bt("제출 정본", "Submitted source")} {state.data.submission.sourceRevisionRef.id}</p>
      {state.data.submission.outputEvidence ? <p className="text-sm text-fg-2">{state.data.submission.outputEvidence.selectionMode === "document"
        ? bt("문서 전체를 이 작업의 제출 원고로 연결했습니다.", "The entire document is bound to this task output.")
        : state.data.submission.outputEvidence.selectionMode === "frames"
          ? bt("명시적으로 연결한 프레임을 강조합니다. 원본 이미지의 문맥은 함께 표시합니다.", "Bound frames are highlighted with the original image context.")
          : bt("명시적으로 연결한 페이지만 이 작업의 제출 원고로 표시합니다.", "Only the explicitly bound pages are shown for this task output.")}</p> : null}
      {state.data.submission.mapping === "captured-source" ? <p className="break-all text-xs text-fg-2">{bt("서버가 같은 제출 정본에서 만든 검수 이미지임을 확인했습니다.", "The server verified these images were captured from the same submitted source.")} · {state.data.submission.revision.id}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold">{bt("비교 기준본", "Comparison baseline")}
          <select className="ml-2 min-h-11 max-w-full rounded-lg border border-line bg-card px-2" value={baseline ? baseline.comparisonKey ?? baseline.sourceRevisionRef.id : ""} onChange={(event) => setBaselineId(event.target.value)}>
            <option value="">{bt("제출본만 보기", "Submission only")}</option>
            {state.data.baselines.map((entry) => <option key={entry.comparisonKey ?? entry.sourceRevisionRef.id} value={entry.comparisonKey ?? entry.sourceRevisionRef.id}>{entry.label} · {entry.artifact.title} · {entry.sourceRevisionRef.id}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">{bt("이미지 순번", "Image position")}
          <select className="ml-2 min-h-11 rounded-lg border border-line bg-card px-2" value={selectedOrdinal ?? ""} onChange={(event) => setOrdinal(Number(event.target.value))}>
            {ordinals.map((value, index) => <option key={value} value={value}>{index + 1} / {ordinals.length} · #{value + 1}</option>)}
          </select>
        </label>
        {state.complete && state.data.submission.reviewHref ? <a className={buttonClass({ variant: "outline", className: "min-h-11" })} href={state.data.submission.reviewHref}>{["open", "changes-requested"].includes(state.data.submission.review.status)
          ? bt("이 고정본에 핀 의견 남기기", "Leave pinned feedback on this version") : bt("이 고정본의 핀 의견 확인", "View pinned feedback on this version")}</a> : null}
      </div>
      {!state.complete ? <p role="status" className="text-sm">{bt(`확인된 원고 ${state.pages.length}장을 표시하고 있습니다. 나머지 원고를 확인 중입니다.`, `Showing ${state.pages.length} verified manuscript images while checking the remaining pages.`)}</p> : null}
      {!state.data.baselines.length ? <p className="text-xs text-fg-2">{bt("비교 가능한 이전 제출본·고정 입력본의 이미지 검수가 없습니다.", "No image review is available for a previous submission or pinned input.")}</p> : null}
      {autoRefreshCount > 0 ? <p role="status" className="text-xs">{bt("같은 고정 원고의 이미지 주소를 갱신하는 중…", "Refreshing image URLs for the same pinned manuscript…")}</p> : null}
      {currentBaselineState?.kind === "loading" ? <p role="status" className="text-xs">{bt("고정 기준본 이미지 불러오는 중…", "Loading the pinned baseline…")}</p> : null}
      {currentBaselineState?.kind === "ready" && !currentBaselineState.complete ? <p role="status" className="text-xs">{bt("확인된 기준 원고부터 표시하고 있습니다. 나머지 원고를 확인 중입니다.", "Showing verified baseline images while checking the remaining pages.")}</p> : null}
      {currentBaselineState?.kind === "error" ? <p role="alert" className="text-sm text-bad">{currentBaselineState.message}</p> : null}
      {baseline && currentBaselineState?.kind === "ready" ? <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={bt("실제 원고 비교 방식", "Manuscript comparison mode")} className="flex gap-2">
          {(["compare", "overlay"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} className={buttonClass({ variant: "outline", className: "min-h-11" })} onClick={() => setMode(value)}>{value === "compare" ? bt("원고 나란히", "Side by side") : bt("원고 겹쳐 보기", "Overlay")}</button>)}
        </div>
        {mode === "overlay" ? <label className="flex items-center gap-2 text-xs">{bt("제출본 불투명도", "Submission opacity")}<input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label> : null}
      </div> : null}
      <div className="max-h-[48rem] overflow-auto rounded-xl border border-line bg-canvas">
        {baseline && currentBaselineState?.kind === "ready" && mode === "overlay" && currentPage && baselinePage ? <div className="relative mx-auto max-w-3xl">
          {renderImage(baseline, baselinePage)}
          <div className="absolute inset-x-0 top-0" style={{ opacity }}>{renderImage(state.data.submission, currentPage)}</div>
        </div> : <div className={baseline && currentBaselineState?.kind === "ready" ? "grid items-start gap-3 sm:grid-cols-2" : "mx-auto max-w-3xl"}>
          {baseline && currentBaselineState?.kind === "ready" ? <figure><figcaption className="bg-panel p-2 text-xs font-bold">{baseline.label} · {baseline.revision.id}</figcaption>{renderImage(baseline, baselinePage)}</figure> : null}
          <figure><figcaption className="bg-panel p-2 text-xs font-bold">{state.data.submission.label} · {state.data.submission.revision.id}</figcaption>{renderImage(state.data.submission, currentPage)}</figure>
        </div>}
      </div>
      <p className="text-xs text-fg-3">{bt("이미지 순번끼리 비교합니다. 원고 구성이 바뀌었다면 각 고정본의 순번을 확인하세요. 만료된 주소는 같은 고정본으로 자동 갱신합니다.", "Images are paired by position. Check each version if the page structure changed. Expired URLs refresh automatically for the same pinned version.")}</p>
    </div> : null}
  </section>;
}
