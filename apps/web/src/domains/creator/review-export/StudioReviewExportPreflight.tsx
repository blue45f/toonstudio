import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceVerifiedReview } from "../virtual-space/studio-virtual-space-review-invitation";

/** Display of the verified input only. prepareStudioReviewExport remains the final authority check. */
export function StudioReviewExportPreflight({
  verified,
}: {
  readonly verified: StudioVirtualSpaceVerifiedReview;
}) {
  const bt = useBilingual("StudioReviewExportPreflight");
  const previews = verified.revision.blobRefs?.filter(
    (reference) => reference.role === "preview",
  );

  return (
    <details className="rounded-lg border border-line bg-panel/40 p-3">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {bt("전달 기준·포함 범위 확인", "Check delivery source and contents")}
      </summary>

      <div data-review-export-summary="contents" className="mt-2 space-y-2">
        <dl className="grid min-w-0 gap-2 text-xs sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold text-fg">
            {bt("출력 방식", "Output profile")}
          </dt>
          <dd className="text-fg-2">
            {bt(
              "저장된 검수 이미지 원본 + SHA-256 목록(manifest.json) + 안내문(README.txt)을 ZIP으로 묶기 · 크기·색상·플랫폼 규격 변환 없음",
              "Original stored review images plus SHA-256 manifest and README in ZIP. No resize, color or platform-profile conversion.",
            )}
          </dd>
          <dt className="font-semibold text-fg">
            {bt("입력 이미지", "Input images")}
          </dt>
          <dd className="text-fg-2">
            {previews
              ? bt(
                  `${previews.length}개 · 전체 목록과 각 파일을 다시 검증합니다.`,
                  `${previews.length} images; the complete list and every file will be reverified.`,
                )
              : bt("목록 확인 필요", "Image list needs verification")}
          </dd>
          <dt className="font-semibold text-fg">
            {bt("제외 항목", "Excluded items")}
          </dt>
          <dd className="text-fg-2">
            {bt(
              "편집 가능한 작업 원본·검토 의견·팀원 명단·서명 URL은 포함하지 않습니다.",
              "Editable source files, review comments, team roster, and signed URLs are excluded.",
            )}
          </dd>
          <dt className="font-semibold text-fg">
            {bt("승인 기록 시각", "Recorded approval time")}
          </dt>
          <dd className="text-fg-2">
            {verified.review.decidedAt ? (
              <time dateTime={verified.review.decidedAt}>
                {verified.review.decidedAt}
              </time>
            ) : (
              bt("확인 필요", "Needs verification")
            )}
          </dd>
        </dl>

        <p className="text-xs leading-5 text-fg-2">
          {bt(
            "다른 최신 원고로 바꾸지 않습니다. 준비가 끝나도 현재 승인·권한·파일 목록을 다시 확인하며 하나라도 맞지 않으면 다운로드하지 않습니다. 이 파일은 전자서명·공개 게시·수신자의 인수 확인이 아닙니다.",
            "The latest editable draft is never substituted. Approval, access and the full file list are rechecked after preparation; any mismatch stops download. This is not a digital signature, public release or recipient acceptance.",
          )}
        </p>
      </div>

      <div
        data-review-export-summary="identifiers"
        className="mt-3 border-t border-line pt-3"
      >
        <p className="text-xs font-semibold text-fg-3">
          {bt(
            "기술 식별값 · 원본 해시 대조 정보",
            "Technical identifiers & source digest",
          )}
        </p>
        <dl className="mt-2 grid min-w-0 gap-1.5 text-xs sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold text-fg-2">
            {bt("고정 검수본", "Pinned review")}
          </dt>
          <dd className="break-all text-fg-3">{verified.subject.reviewId}</dd>
          <dt className="font-semibold text-fg-2">
            {bt("출력 기준 버전", "Source revision")}
          </dt>
          <dd className="break-all text-fg-3">{verified.subject.revisionId}</dd>
          <dt className="font-semibold text-fg-2">
            {bt("원본 내용 식별값", "Source content digest")}
          </dt>
          <dd className="break-all font-mono text-fg-3">
            {verified.subject.rootGraphHash}
          </dd>
        </dl>
      </div>
    </details>
  );
}
