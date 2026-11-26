import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { approvedCutChangeSchema, type ApprovedCutChange } from "@toonstudio/studio-project-model";
import { z } from "zod";
import { api } from "@/platform/api";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { studioVirtualSpaceReviewHref } from "./studio-virtual-space-review-invitation";
import { reviewOverlayAllowed } from "./studio-review-comparison-model";
import { parseStudioVirtualSpaceReviewSubject, sameStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";
import type { StudioVirtualSpaceReviewPreview } from "./studio-virtual-space-review-preview";

const DialogueReview = lazy(() => import("../ai/StudioApprovedDialogueReview").then(module => ({ default: module.StudioApprovedDialogueReview })));
const resultSchema = z.object({ approved: z.unknown(), current: z.unknown(), decidedAt: z.string().datetime(), changes: z.array(approvedCutChangeSchema) }).strict();
const control = "min-h-11 min-w-0 rounded-lg border border-line bg-card px-3 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
type State = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; changes: readonly ApprovedCutChange[]; decidedAt: string };
type Preview = StudioVirtualSpaceReviewPreview;

interface Props {
  approved: StudioVirtualSpaceReviewSubject;
  current: StudioVirtualSpaceReviewSubject;
  beforePages: readonly Preview[];
  afterPages: readonly Preview[];
  imagesReady?: boolean;
  onSelectChange?: (change: ApprovedCutChange) => void;
  renderImage: (side: "before" | "after", page: Preview, frameId: string | null) => ReactNode;
}

export function StudioApprovedCutComparison(props: Props) {
  return <CutChanges key={JSON.stringify([props.approved, props.current])} {...props} />;
}

function CutChanges({ approved, current, beforePages, afterPages, renderImage, onSelectChange, imagesReady = true }: Props) {
  const bt = useBilingual("StudioApprovedCutComparison");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [overlay, setOverlay] = useState(false);
  const [opacity, setOpacity] = useState(50);
  // 서명 URL 갱신으로 부모가 재렌더되어도 같은 두 고정본의 비교를 다시 요청하지 않는다.
  const [pair] = useState(() => ({ approved, current }));
  useEffect(() => {
    const abort = new AbortController();
    void api.post<unknown>("/studio-project-graph/approved-cut-changes", pair, { signal: abort.signal })
      .then(raw => {
        const result = resultSchema.parse(raw);
        if (!sameStudioVirtualSpaceReviewSubject(pair.approved, parseStudioVirtualSpaceReviewSubject(result.approved))
          || !sameStudioVirtualSpaceReviewSubject(pair.current, parseStudioVirtualSpaceReviewSubject(result.current))) throw new Error("comparison_subject_mismatch");
        if (!abort.signal.aborted) setState({ kind: "ready", changes: result.changes, decidedAt: result.decidedAt });
      }).catch(() => { if (!abort.signal.aborted) setState({ kind: "failed" }); });
    return () => abort.abort();
  }, [pair, attempt]);

  const row = state.kind === "ready" ? state.changes[index] : undefined;
  useEffect(() => {
    if (row) onSelectChange?.(row);
  }, [onSelectChange, row]);

  const pageFrames = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    for (const page of [...beforePages, ...afterPages]) {
      if (page.mapping.status !== "mapped") continue;
      const { id, frames } = page.mapping.page;
      result.set(id, new Map(frames.map((frame, i) => [frame.id, i + 1])));
    }
    return result;
  }, [beforePages, afterPages]);
  if (state.kind === "loading") return <p role="status">{bt("승인본과 수정본의 컷을 대조하고 있어요.", "Checking both saved versions…")}</p>;
  if (state.kind === "failed") return <div className="space-y-2">
    <p role="alert">{bt("두 원본의 승인 기록과 변경 내용을 확인하지 못했어요. 검수본을 다시 선택하거나 재시도해 주세요.", "Could not verify both snapshots and the approval. Choose the snapshots again or retry.")}</p>
    <button className={control} type="button" onClick={() => { setState({ kind: "loading" }); setAttempt(value => value + 1); }}>{bt("비교 다시 시도", "Retry comparison")}</button>
  </div>;

  if (!imagesReady) return <p role="status">{bt("고정 원고 이미지를 불러오고 있어요.", "Loading pinned manuscript images…")}</p>;
  const labelForKind = { dialogue: bt("대사", "Dialogue"), image: bt("이미지", "Image"), layer: bt("레이어", "Layer"), page: bt("페이지", "Page") };
  const label = (item: ApprovedCutChange) => {
    const position = (item.afterIndex ?? item.beforeIndex ?? 0) + 1;
    const ordinal = item.frameId ? pageFrames.get(item.pageId)?.get(item.frameId) : undefined;
    const frame = ordinal ? bt(`${ordinal}컷`, `Cut ${ordinal}`) : item.frameId;
    return [bt(`${position}페이지`, `Page ${position}`), frame, item.kinds.map(kind => labelForKind[kind]).join(" · ")].filter(Boolean).join(" / ");
  };
  const find = (pages: readonly Preview[], ordinal: number | null) => row && ordinal !== null
    ? pages.find(p => p.ordinal === ordinal && p.mapping.status === "mapped" && p.mapping.page.id === row.pageId) : undefined;
  const before = find(beforePages, row?.beforeIndex ?? null), after = find(afterPages, row?.afterIndex ?? null);
  const canOverlay = before && after && reviewOverlayAllowed(before, after);
  const pane = (side: "before" | "after", page?: Preview) => {
    if (page && row) return renderImage(side, page, row.frameId);
    const absent = (side === "before" ? row?.beforeIndex : row?.afterIndex) === null;
    return <p className="p-4 text-sm">{absent ? bt("이 버전에는 이 페이지가 없어요.", "This page is absent in this version.")
      : bt("이 페이지의 고정 이미지를 확인하지 못했어요.", "The pinned image for this page could not be verified.")}</p>;
  };
  const select = (next: number) => { setIndex(next); setOverlay(false); setOpacity(50); };
  return <section aria-label={bt("승인 후 변경 목록", "Changes since approval")} className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <a className="inline-flex min-h-11 items-center text-accent underline" href={studioVirtualSpaceReviewHref(approved)}>{bt("이전 승인 기록", "Previous approval")} · <time dateTime={state.decidedAt}>{new Date(state.decidedAt).toLocaleDateString()}</time></a>
      <a className="inline-flex min-h-11 items-center text-accent underline" href={studioVirtualSpaceReviewHref(current)}>{bt("수정본 검수 메모", "Review notes for the revision")}</a>
    </div>
    {!row ? <p role="status">{bt("승인 이후 바뀐 컷이 없어요.", "No source cuts changed since approval.")}</p> : <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 grow basis-64 text-sm font-semibold">{bt(`다시 볼 변경 항목 ${state.changes.length}개`, `${state.changes.length} changes to review`)}
          <select aria-label={bt(`다시 볼 변경 항목 ${state.changes.length}개`, `${state.changes.length} changes to review`)} className={`${control} mt-1 block w-full`} value={index} onChange={event => select(Number(event.target.value))}>
            {state.changes.map((item,i) => <option key={JSON.stringify([item.pageId,item.frameId])} value={i}>{label(item)}</option>)}
          </select>
        </label>
        <button type="button" className={control} disabled={index + 1 >= state.changes.length} onClick={() => select(index + 1)}>{bt("다음 변경", "Next change")}</button>
      </div>
      {row.dialogue.map(line => <div key={JSON.stringify([line.origin, line.elementId, line.locale])} className="min-w-0 space-y-2 border-l-2 border-accent pl-3">
        {line.origin || line.locale ? <p className="text-xs font-medium text-fg-2">{[
          line.origin === "master" ? bt("공통 레이어", "Master layer") : null,
          line.locale === "source" ? bt("저장된 원문", "Saved source text")
            : line.locale ? bt(`번역 대사 · ${line.locale}`, `Translation · ${line.locale}`) : null,
        ].filter(Boolean).join(" / ")}</p> : null}
        <dl className="grid min-w-0 gap-2 text-sm sm:grid-cols-2">
          {([[bt("승인 대사", "Approved dialogue"),line.before],[bt("수정 대사", "Revised dialogue"),line.after]] as const).map(([term,value]) =>
            <div key={term}><dt className="font-semibold text-fg-2">{term}</dt><dd className="whitespace-pre-wrap break-words">{value || bt("대사 없음", "No dialogue")}</dd></div>)}
        </dl>
        <Suspense fallback={null}><DialogueReview cutId={JSON.stringify([row.pageId, row.frameId, line.origin, line.elementId, line.locale])} approvedDialogue={line.before ?? ""} currentDialogue={line.after ?? ""} /></Suspense>
      </div>)}
      {canOverlay ? <div className="flex flex-wrap items-center gap-3"><button type="button" className={control} aria-pressed={overlay} onClick={() => setOverlay(!overlay)}>{bt("변경 이미지 겹쳐 보기", "Overlay changed images")}</button>
        {overlay ? <label className="text-sm">{bt("수정본 불투명도", "Revised image opacity")} <input type="range" min={0} max={100} value={opacity} onChange={e => setOpacity(Number(e.target.value))} /></label> : null}</div> : null}
      {overlay && canOverlay ? <div className="relative mx-auto max-w-3xl">{pane("before", before)}<div className="absolute inset-x-0 top-0" style={{opacity:opacity/100}}>{pane("after",after)}</div></div> :
        <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2">{(["before","after"] as const).map(side => <div key={side} className="min-w-0">
          <h4 className="mb-1 text-sm font-semibold">{side === "before" ? bt("승인 이미지", "Approved image") : bt("수정 이미지", "Revised image")}</h4>{pane(side, side === "before" ? before : after)}</div>)}</div>}
    </>}
  </section>;
}
