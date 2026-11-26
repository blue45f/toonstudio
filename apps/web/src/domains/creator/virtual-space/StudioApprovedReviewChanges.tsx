import { useCallback } from "react";
import type { ApprovedCutChange } from "@toonstudio/studio-project-model";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioApprovedCutComparison } from "./StudioApprovedCutComparison";
import { StudioReviewImage } from "./StudioPinnedReviewPreview";
import type { StudioVirtualSpaceReviewChoice } from "./studio-virtual-space-review-invitation";
import type { StudioVirtualSpaceReviewPreview } from "./studio-virtual-space-review-preview";
import type { StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";
import type { useStudioPinnedReviewPreviews } from "./use-studio-pinned-review-previews";

type Approval = NonNullable<StudioVirtualSpaceReviewChoice["priorApproval"]>;
type PreviewState = ReturnType<typeof useStudioPinnedReviewPreviews>;

function cursorFor(refs: Approval["beforeRefs"], ordinal: number | null) {
  if (ordinal === null || ordinal < 32) return null;
  const previous = refs.find(ref => ref.role === "preview" && ref.ordinal === ordinal - 1);
  return previous ? `${previous.ordinal}.${previous.sha256}` : null;
}

/** 컷 테두리는 각 버전의 고정 원본 좌표로 그려 이동 전후의 위치 차이도 보인다. */
function MarkedImage({ page, frameId, label }: { page: StudioVirtualSpaceReviewPreview; frameId: string | null; label: string }) {
  const mapped = page.mapping.status === "mapped" ? page.mapping.page : null;
  const frame = frameId && mapped ? mapped.frames.find(item => item.id === frameId) : null;
  return <div className="relative">
    <StudioReviewImage key={page.sha256} preview={page} label={label} className="block h-auto w-full" figureClassName="" />
    {mapped && frame ? <svg className="pointer-events-none absolute inset-0 size-full text-accent" aria-hidden="true"
      viewBox={`0 0 ${mapped.width} ${mapped.height}`} preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2">
      {frame.polygon ? <polygon vectorEffect="non-scaling-stroke" points={frame.polygon.map(p => `${p.x},${p.y}`).join(" ")} />
        : <rect vectorEffect="non-scaling-stroke" {...frame.bounds} />}
    </svg> : null}
  </div>;
}

export function StudioApprovedReviewChanges({ approved, current, approval, before, after, onSelectChange }: {
  approved: StudioVirtualSpaceReviewSubject; current: StudioVirtualSpaceReviewSubject;
  approval: Approval; before: PreviewState; after: PreviewState;
  onSelectChange: (change: ApprovedCutChange) => void;
}) {
  const bt = useBilingual("StudioApprovedReviewChanges");
  const setBefore = before.setCursor, setAfter = after.setCursor;
  const select = useCallback((change: ApprovedCutChange) => {
    onSelectChange(change);
    setBefore(cursorFor(approval.beforeRefs, change.beforeIndex));
    setAfter(cursorFor(approval.afterRefs, change.afterIndex));
  }, [onSelectChange, approval, setBefore, setAfter]);

  if ((before.result && !before.result.ok) || (after.result && !after.result.ok)) return <div className="space-y-2">
    <p role="alert">{bt("검수 이미지에 접근할 수 없어요.", "Could not read the pinned images.")}</p>
    <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm"
      onClick={() => { before.refresh(); after.refresh(); }}>{bt("이미지 다시 확인", "Retry images")}</button>
  </div>;
  return <StudioApprovedCutComparison approved={approved} current={current} onSelectChange={select} imagesReady={Boolean(before.result?.ok && after.result?.ok)}
    beforePages={before.result?.ok ? before.result.previews : []} afterPages={after.result?.ok ? after.result.previews : []}
    renderImage={(side, page, frameId) => <MarkedImage page={page} frameId={frameId}
      label={side === "before" ? bt("승인본 변경 위치", "Changed area in the approved version") : bt("수정본 변경 위치", "Changed area in the revised version")} />} />;
}
