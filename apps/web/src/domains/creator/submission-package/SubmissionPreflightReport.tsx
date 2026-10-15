import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { useId } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { formatStudioByteSize } from "../export/studio-episode-byte-budget";

import { describeSubmissionIssue, SUBMISSION_COMPLETENESS_LABELS } from "./submission-package-messages";
import {
  SUBMISSION_PACKAGE_LIMITS,
  type SubmissionIssue,
  type SubmissionIssueSeverity,
  type SubmissionPackageLocale,
  type SubmissionPreflightReport as Report,
} from "./submission-package-types";

const SEVERITY_STYLE: Readonly<Record<SubmissionIssueSeverity, { readonly icon: LucideIcon; readonly className: string }>> = {
  error: { icon: CircleAlert, className: "border-bad/50 bg-bad-soft" },
  warning: { icon: TriangleAlert, className: "border-warn/50 bg-warning-soft" },
  info: { icon: Info, className: "border-line bg-card" },
};

export interface SubmissionPreflightReportProps {
  readonly report: Report;
  readonly locale: SubmissionPackageLocale;
}

function IssueItem({ issue, locale }: { readonly issue: SubmissionIssue; readonly locale: SubmissionPackageLocale }) {
  const bt = useBilingual("SubmissionPreflightReport");
  const style = SEVERITY_STYLE[issue.severity];
  const Icon = style.icon;
  const text = describeSubmissionIssue(issue, locale);
  const severityLabel: Readonly<Record<SubmissionIssueSeverity, string>> = {
    error: bt("막는 문제", "Blocking"),
    warning: bt("알림", "Heads-up"),
    info: bt("참고", "Note"),
  };
  return (
    <li className={cn("flex gap-2 rounded-xl border p-3 text-sm", style.className)}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        <span className="mr-1.5 rounded-full border border-line-strong px-1.5 py-0.5 text-[0.6875rem] font-bold text-fg-2">{severityLabel[issue.severity]}</span>
        <span className="font-semibold text-fg">{text.title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-fg-2">{text.hint}</span>
      </span>
    </li>
  );
}

export function SubmissionPreflightReport({ report, locale }: SubmissionPreflightReportProps) {
  const bt = useBilingual("SubmissionPreflightReport");
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const meterId = `${baseId}-meter`;
  const { completeness } = report;
  const cap = SUBMISSION_PACKAGE_LIMITS.maxTotalBytes;

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <h3 id={titleId} className="text-base font-black text-fg">
        {bt("만들기 전 점검", "Pre-build check")}
      </h3>

      <div>
        <p className="text-sm font-semibold text-fg">
          {formatI18nTemplate(bt("필수 구성 {done} / {total}", "Required parts {done} of {total}"), { done: completeness.done, total: completeness.total })}
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {completeness.items.map((item) => (
            <li
              key={item.key}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
                item.done ? "border-good/50 bg-good-soft text-fg" : "border-line bg-card text-fg-2",
              )}
            >
              {item.done ? <CircleCheck aria-hidden="true" className="size-3.5" /> : <span aria-hidden="true" className="size-3.5 text-center leading-none">○</span>}
              {SUBMISSION_COMPLETENESS_LABELS[item.key][locale]}
              <span className="sr-only">{item.done ? bt("(갖춤)", "(done)") : item.required ? bt("(아직 없음)", "(missing)") : bt("(선택, 아직 없음)", "(optional, missing)")}</span>
              {!item.required ? <span className="font-normal text-fg-3">{bt("선택", "optional")}</span> : null}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label htmlFor={meterId} className="text-sm font-semibold text-fg">
          {formatI18nTemplate(bt("전체 용량 {total} / 앱 상한 {cap}", "Total size {total} of the app's {cap} cap"), {
            total: formatStudioByteSize(report.totalBytes),
            cap: formatStudioByteSize(cap),
          })}
        </label>
        <meter
          id={meterId}
          className="mt-1 block h-2 w-full overflow-hidden rounded-full accent-accent"
          min={0}
          max={cap}
          low={SUBMISSION_PACKAGE_LIMITS.softTotalBytes}
          high={SUBMISSION_PACKAGE_LIMITS.softTotalBytes}
          optimum={0}
          value={Math.min(report.totalBytes, cap)}
        />
        <p className="mt-1 text-xs text-fg-3">
          {bt(
            "이 상한은 브라우저 메모리를 지키려고 앱이 정한 값이에요. 투고처의 규정이 아니에요.",
            "The cap is set by the app to protect browser memory. It is not a rule of any submission site.",
          )}
        </p>
      </div>

      <p role="status" className="text-sm font-semibold text-fg">
        {report.canBuild
          ? formatI18nTemplate(bt("만들 수 있어요 · 알릴 내용 {warnings}건", "Ready to build · {warnings} heads-up item(s)"), { warnings: report.warningCount })
          : formatI18nTemplate(bt("막는 문제 {errors}건을 고치면 만들 수 있어요", "Fix {errors} blocking item(s) to build"), { errors: report.errorCount })}
      </p>

      {report.issues.length === 0 ? (
        <p className="rounded-xl border border-good/50 bg-good-soft px-3 py-2 text-sm text-fg">{bt("막는 문제도, 알릴 내용도 없어요.", "Nothing blocks the build and nothing needs a heads-up.")}</p>
      ) : (
        <ul className="space-y-2">
          {report.issues.map((issue, index) => (
            <IssueItem key={`${issue.code}-${index}`} issue={issue} locale={locale} />
          ))}
        </ul>
      )}
    </section>
  );
}
