import { CheckCircle2, CircleAlert } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioPublishPackageReadiness } from "./studio-publish-package-readiness";

export function StudioPublishPackageReadinessSummary({
  readiness,
  summary,
  onReviewRequiredChecks,
}: {
  readonly readiness: StudioPublishPackageReadiness;
  readonly summary: string;
  readonly onReviewRequiredChecks?: () => void;
}) {
  const bt = useBilingual("StudioPublishPackageReadinessSummary");
  const hasRequiredChecks = !readiness.checksAvailable
    || readiness.structuralErrors.length + readiness.humanConfirmationErrors.length > 0;
  return <section aria-label={bt("패키지 생성 준비", "Package creation readiness")} className="mt-3 space-y-2 text-[0.7rem] leading-relaxed">
    <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${readiness.canExport
      ? "border-good/30 bg-good/10 text-good" : "border-bad/30 bg-bad/10 text-bad"}`}>
      {readiness.canExport ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden />
        : <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />}
      <span>{readiness.checksAvailable ? summary : bt("현재 목적지의 필수 점검을 확인해야 파일을 생성할 수 있어요.", "Required checks for this destination must be available before files can be created.")}</span>
    </div>
    <p className="text-fg-3">{bt("파일 계획 오류", "File plan errors")} {readiness.packageErrorCount}
      {" · "}{bt("원고 필수 점검", "Required manuscript checks")} {readiness.structuralErrors.length}
      {" · "}{bt("사람이 직접 확인할 필수 항목", "Required creator confirmations")} {readiness.humanConfirmationErrors.length}</p>
    {hasRequiredChecks ? <div className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2">
      <details>
        <summary className="min-h-9 cursor-pointer py-2 font-semibold text-fg">{bt("남은 필수 점검 보기", "View remaining required checks")}</summary>
        {readiness.structuralErrors.length ? <div className="mt-1">
          <p className="font-semibold">{bt("원고에서 해결할 항목", "Manuscript items to resolve")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">{readiness.structuralErrors.map((issue, index) =>
            <li key={`${issue.code}:${issue.path ?? "root"}:${index}`}>{issue.message}</li>)}</ul>
        </div> : null}
        {readiness.humanConfirmationErrors.length ? <div className="mt-2">
          <p className="font-semibold">{bt("창작자가 직접 답하고 확인할 항목", "Items the creator must answer and confirm")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">{readiness.humanConfirmationErrors.map((issue, index) =>
            <li key={`${issue.code}:${issue.path ?? "root"}:${index}`}>{issue.message}</li>)}</ul>
        </div> : null}
      </details>
      <p className="mt-1 text-fg-3">{bt("등급·표현·권리·정책에 대한 답변은 자동으로 선택하지 않습니다. 자체 확인 완료는 플랫폼 승인을 뜻하지 않습니다.", "Rating, content, rights and policy answers are not selected automatically. Completing the self-check does not mean platform approval.")}</p>
      {onReviewRequiredChecks ? <button type="button" onClick={onReviewRequiredChecks}
        className="mt-2 min-h-11 rounded-lg border border-line bg-card px-3 font-semibold text-fg hover:bg-raised">
        {bt("필수 점검 열기", "Open required checks")}</button> : null}
    </div> : null}
  </section>;
}
