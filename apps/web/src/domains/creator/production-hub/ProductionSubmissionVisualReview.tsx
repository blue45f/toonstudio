import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductionProjectAggregate, Submission } from "@toonstudio/core/production";
import type { StudioReviewPreviewRead } from "../project-graph/studio-project-graph-client";
import type { PinnedSubmissionVisualSource, SubmissionVisualReviewData } from "./production-submission-visual-review";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type VisualState = { kind: "loading" } | { kind: "error"; message: string }
  | { kind: "ready"; data: SubmissionVisualReviewData; pages: readonly StudioReviewPreviewRead[] };
type BaselineState = { kind: "idle" } | { kind: "loading"; revisionId: string } | { kind: "error"; revisionId: string; message: string }
  | { kind: "ready"; revisionId: string; pages: readonly StudioReviewPreviewRead[] };

function PinnedImage({ preview, label, onRefresh, onLoaded }: { readonly preview: StudioReviewPreviewRead | undefined; readonly label: string;
  readonly onRefresh: () => void; readonly onLoaded: () => void }) {
  const bt = useBilingual("ProductionSubmissionVisualReview");
  const [failed, setFailed] = useState(false);
  const [expired] = useState(() => preview != null && preview.expiresAt <= Date.now());
  useEffect(() => { if (expired) onRefresh(); }, [expired, onRefresh]);
  if (!preview) return <p className="p-6 text-sm text-fg-2">{bt("이 버전에는 해당 순번의 이미지가 없습니다.", "This version has no image at this position.")}</p>;
  return failed || expired ? <p role="alert" className="p-6 text-sm text-bad">{bt("이미지를 다시 확인하고 있습니다. 복구되지 않으면 이미지 새로고침을 눌러 주세요.", "Checking the image again. Refresh images if it does not recover.")}</p>
    : <img src={preview.url} alt={label} className="block h-auto w-full" referrerPolicy="no-referrer" onLoad={onLoaded} onError={() => { setFailed(true); onRefresh(); }} />;
}

/** 선택 제출본과 저장된 입력본만 읽는다. 핀 작성은 같은 고정 버전의 Studio 검수에 맡긴다. */
export function ProductionSubmissionVisualReview({ aggregate, submission }: {
  readonly aggregate: ProductionProjectAggregate;
  readonly submission: Submission;
}) {
  const identity = JSON.stringify([aggregate.projectId, aggregate.workId, submission.id, submission.deliverableId, submission.revisionRef, submission.inputRevisionRefs,
    aggregate.deliverables.find((entry) => entry.id === submission.deliverableId)?.scope,
    aggregate.submissions.filter((entry) => entry.deliverableId === submission.deliverableId && entry.id !== submission.id)
      .map((entry) => [entry.id, entry.projectId, entry.submittedAt, entry.revisionRef]),
    (aggregate.studioRevisionLinks ?? []).filter((entry) => entry.submissionId === submission.id)
      .map((entry) => [entry.projectId, entry.workId, entry.deliverableId, entry.studioRevisionRef, entry.status === "superseded"])]);
  return <SubmissionVisualReview key={identity}
    aggregate={aggregate} submission={submission} />;
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
  const autoInFlight = useRef(new Set<string>());
  const requestGeneration = useRef(0);
  const demo = aggregate.projectId === "sample-project";

  useEffect(() => {
    if (!opened || demo) return;
    requestGeneration.current += 1;
    setAutoRefreshCount(0);
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const { loadSubmissionVisualReview, loadPinnedSubmissionPreviews } = await import("./production-submission-visual-review");
        if (cancelled) return;
        const data = await loadSubmissionVisualReview(request.aggregate, request.submission);
        if (cancelled) return;
        const pages = await loadPinnedSubmissionPreviews(data.submission);
        if (!cancelled) setState({ kind: "ready", data, pages });
      } catch (cause) {
        if (!cancelled) setState({ kind: "error", message: cause instanceof Error ? cause.message : bt("원고 이미지를 불러오지 못했습니다.", "Could not load manuscript images.") });
      }
    })();
    return () => { cancelled = true; requestGeneration.current += 1; };
  }, [opened, refresh, request, demo, bt]);

  const baseline = state.kind === "ready" ? state.data.baselines.find((entry) => entry.revision.id === baselineId) ?? null : null;
  useEffect(() => {
    if (!baseline) { setBaselineState({ kind: "idle" }); return; }
    let cancelled = false;
    setBaselineState({ kind: "loading", revisionId: baseline.revision.id });
    void import("./production-submission-visual-review").then(({ loadPinnedSubmissionPreviews }) => {
      if (cancelled) return null;
      return loadPinnedSubmissionPreviews(baseline);
    }).then((pages) => {
      if (!pages) return;
      if (!cancelled) setBaselineState({ kind: "ready", revisionId: baseline.revision.id, pages });
    }).catch((cause: unknown) => {
      if (!cancelled) setBaselineState({ kind: "error", revisionId: baseline.revision.id, message: cause instanceof Error ? cause.message : bt("기준 원고를 불러오지 못했습니다.", "Could not load the baseline.") });
    });
    return () => { cancelled = true; };
  }, [baseline, bt]);

  const currentBaselineState = baseline && baselineState.kind !== "idle" && baselineState.revisionId === baseline.revision.id ? baselineState : null;
  const baselinePages = currentBaselineState?.kind === "ready" ? currentBaselineState.pages : [];
  const ordinals = state.kind === "ready" ? [...new Set([...state.pages, ...baselinePages].map((page) => page.ordinal))].sort((left, right) => left - right) : [];
  const selectedOrdinal = ordinal !== null && ordinals.includes(ordinal) ? ordinal : ordinals[0];
  const currentPage = state.kind === "ready" ? state.pages.find((page) => page.ordinal === selectedOrdinal) : undefined;
  const baselinePage = baselinePages.find((page) => page.ordinal === selectedOrdinal);
  const imageKey = (source: PinnedSubmissionVisualSource, page: StudioReviewPreviewRead) => `${source.artifact.id}:${source.revision.id}:${source.revision.rootGraphHash}:${page.ordinal}`;
  const autoRefresh = useCallback((source: PinnedSubmissionVisualSource, page: StudioReviewPreviewRead) => {
    const sourceKey = `${source.artifact.id}:${source.revision.id}:${source.revision.rootGraphHash}`;
    const attemptKey = `${sourceKey}:${page.ordinal}`;
    if (autoAttempts.current.has(attemptKey) || autoInFlight.current.has(sourceKey)) return;
    autoAttempts.current.add(attemptKey); autoInFlight.current.add(sourceKey);
    const generation = requestGeneration.current;
    setAutoRefreshCount((value) => value + 1);
    void import("./production-submission-visual-review").then(({ loadPinnedSubmissionPreviews }) => loadPinnedSubmissionPreviews(source))
      .then((pages) => {
        if (generation !== requestGeneration.current) return;
        setState((current) => current.kind === "ready" && current.data.submission.revision.id === source.revision.id
          && current.data.submission.revision.rootGraphHash === source.revision.rootGraphHash ? { ...current, pages } : current);
        setBaselineState((current) => current.kind === "ready" && current.revisionId === source.revision.id ? { ...current, pages } : current);
      }).catch(() => { /* 같은 정본의 자동 조회는 한 번만 시도하고 실패 시 이미지의 재조회 안내를 유지한다. */ })
      .finally(() => { autoInFlight.current.delete(sourceKey); if (generation === requestGeneration.current) setAutoRefreshCount((value) => Math.max(0, value - 1)); });
  }, []);
  const renderImage = (source: PinnedSubmissionVisualSource, page: StudioReviewPreviewRead | undefined) => <PinnedImage key={page ? `${page.url}:${page.expiresAt}` : `${source.revision.id}:missing`}
    preview={page} label={`${source.label} · ${Number(selectedOrdinal) + 1}`}
    onRefresh={() => { if (page) autoRefresh(source, page); }} onLoaded={() => { if (page) autoAttempts.current.delete(imageKey(source, page)); }} />;

  return <section className="border-b border-line bg-panel/50 p-4" aria-label={bt("고정 제출 원고 이미지", "Pinned submission images")}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-black">{bt("제출 원고 이미지", "Submitted manuscript images")}</h3>
        <p className="mt-1 text-xs text-fg-2">{bt("선택한 제출본의 저장 버전을 확인하고, 이전 제출본·고정 입력본과 비교합니다.", "Inspect the saved submission and compare it with previous submissions or pinned inputs.")}</p>
      </div>
      <button type="button" className={buttonClass({ variant: "outline", className: "min-h-11" })} disabled={demo || (opened && state.kind === "loading")}
        onClick={() => { setOpened(true); setRefresh((value) => value + 1); }}>
        {opened ? bt("이미지 새로고침", "Refresh images") : bt("제출 원고 이미지 열기", "Open submitted images")}
      </button>
    </div>
    {demo ? <p className="mt-2 text-xs text-fg-3">{bt("예시 프로젝트의 계획 도식입니다. 실제 프로젝트에서 저장된 원고 이미지를 확인할 수 있습니다.", "This sample uses plan diagrams. Saved manuscript images are available in your projects.")}</p> : null}
    {opened && state.kind === "loading" ? <p role="status" className="mt-3 text-sm">{bt("제출본의 고정 버전과 원고 이미지를 확인하는 중…", "Checking the pinned submission and loading images…")}</p> : null}
    {opened && state.kind === "error" ? <p role="alert" className="mt-3 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm">{state.message}</p> : null}
    {opened && state.kind === "ready" ? <div className="mt-4 space-y-3">
      <p className="break-all text-xs text-fg-2">{state.data.submission.artifact.title} · {state.data.submission.label} · {state.data.submission.revision.id}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold">{bt("비교 기준본", "Comparison baseline")}
          <select className="ml-2 min-h-11 max-w-full rounded-lg border border-line bg-card px-2" value={baseline?.revision.id ?? ""} onChange={(event) => setBaselineId(event.target.value)}>
            <option value="">{bt("제출본만 보기", "Submission only")}</option>
            {state.data.baselines.map((entry) => <option key={entry.revision.id} value={entry.revision.id}>{entry.label} · {entry.artifact.title} · {entry.revision.id}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">{bt("이미지 순번", "Image position")}
          <select className="ml-2 min-h-11 rounded-lg border border-line bg-card px-2" value={selectedOrdinal ?? ""} onChange={(event) => setOrdinal(Number(event.target.value))}>
            {ordinals.map((value, index) => <option key={value} value={value}>{index + 1} / {ordinals.length} · #{value + 1}</option>)}
          </select>
        </label>
        {state.data.submission.reviewHref ? <a className={buttonClass({ variant: "outline", className: "min-h-11" })} href={state.data.submission.reviewHref}>{["open", "changes-requested"].includes(state.data.submission.review.status)
          ? bt("이 고정본에 핀 의견 남기기", "Leave pinned feedback on this version") : bt("이 고정본의 핀 의견 확인", "View pinned feedback on this version")}</a> : null}
      </div>
      {!state.data.baselines.length ? <p className="text-xs text-fg-2">{bt("비교 가능한 이전 제출본·고정 입력본의 이미지 검수가 없습니다.", "No image review is available for a previous submission or pinned input.")}</p> : null}
      {autoRefreshCount > 0 ? <p role="status" className="text-xs">{bt("같은 고정 원고의 이미지 주소를 갱신하는 중…", "Refreshing image URLs for the same pinned manuscript…")}</p> : null}
      {currentBaselineState?.kind === "loading" ? <p role="status" className="text-xs">{bt("고정 기준본 이미지 불러오는 중…", "Loading the pinned baseline…")}</p> : null}
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
