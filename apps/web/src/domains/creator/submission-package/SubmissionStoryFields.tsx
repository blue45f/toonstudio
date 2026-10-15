import { useId, type ReactNode } from "react";

import { Button } from "@/shared/components/ui/button";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { SubmissionDraftField } from "./submission-package-draft-state";
import { describeSubmissionIssue } from "./submission-package-messages";
import { codePointLength, normalizeSingleLine, normalizeUserText } from "./submission-package-text";
import { SUBMISSION_PACKAGE_LIMITS, type SubmissionIssue, type SubmissionPackageLocale } from "./submission-package-types";

const FIELD_CLASS =
  "mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 aria-[invalid=true]:border-bad";

export interface SubmissionStoryFieldsProps {
  readonly values: Readonly<Record<SubmissionDraftField, string>>;
  readonly issues: readonly SubmissionIssue[];
  readonly locale: SubmissionPackageLocale;
  /** 프로젝트에 적어 둔 설명. 시놉시스가 비어 있을 때 한 번에 넣을 수 있다. */
  readonly projectDescription: string;
  readonly onChange: (field: SubmissionDraftField, value: string) => void;
}

interface FieldProps {
  readonly label: string;
  readonly hint?: string;
  readonly field: SubmissionDraftField;
  readonly value: string;
  readonly max: number;
  readonly issues: readonly SubmissionIssue[];
  readonly locale: SubmissionPackageLocale;
  readonly multiline?: { readonly rows: number };
  readonly onChange: (field: SubmissionDraftField, value: string) => void;
  readonly extra?: ReactNode;
}

function StoryField({ label, hint, field, value, max, issues, locale, multiline, onChange, extra }: FieldProps) {
  const bt = useBilingual("SubmissionStoryFields");
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const hintId = `${baseId}-hint`;
  const issueId = `${baseId}-issue`;
  const issueField = field === "authorName" ? "author" : field;
  const own = issues.filter((issue) => issue.target.kind === "story" && issue.target.field === issueField);
  const blocking = own.filter((issue) => issue.severity === "error");
  const length = codePointLength(field === "logline" || field === "synopsis" ? normalizeUserText(value) : normalizeSingleLine(value));
  const describedBy = [hint ? hintId : "", own.length > 0 ? issueId : ""].filter(Boolean).join(" ") || undefined;
  const common = {
    id: inputId,
    value,
    "aria-invalid": blocking.length > 0 ? true : undefined,
    "aria-describedby": describedBy,
    className: FIELD_CLASS,
  } as const;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-bold text-fg">
          {label}
        </label>
        {extra}
      </div>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-xs leading-relaxed text-fg-3">
          {hint}
        </p>
      ) : null}
      {multiline ? (
        <textarea {...common} rows={multiline.rows} onChange={(event) => onChange(field, event.target.value)} />
      ) : (
        <input {...common} type="text" autoComplete="off" onChange={(event) => onChange(field, event.target.value)} />
      )}
      <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
        <ul id={issueId} className="min-w-0 flex-1 space-y-0.5 text-xs">
          {own.map((issue) => (
            <li key={issue.code} className={cn(issue.severity === "error" ? "text-bad" : "text-fg-2")}>
              {describeSubmissionIssue(issue, locale).title}
            </li>
          ))}
        </ul>
        <p className={cn("shrink-0 text-xs tabular-nums", length > max ? "font-bold text-bad" : "text-fg-3")}>
          {formatI18nTemplate(bt("{length} / {max}자", "{length} / {max} characters"), { length, max })}
        </p>
      </div>
    </div>
  );
}

export function SubmissionStoryFields({ values, issues, locale, projectDescription, onChange }: SubmissionStoryFieldsProps) {
  const bt = useBilingual("SubmissionStoryFields");
  const titleId = useId();
  const description = normalizeUserText(projectDescription);
  const canImport = description.length > 0 && normalizeUserText(values.synopsis).length === 0;

  return (
    <fieldset className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5" aria-labelledby={titleId}>
      <legend id={titleId} className="px-1 text-base font-black text-fg">
        {bt("작품 소개", "About the work")}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <StoryField field="title" label={bt("작품 제목", "Title")} value={values.title} max={SUBMISSION_PACKAGE_LIMITS.titleChars} issues={issues} locale={locale} onChange={onChange} />
        <StoryField
          field="authorName"
          label={bt("작가명 (선택)", "Author name (optional)")}
          hint={bt("필명이나 이름. 표지에 함께 들어가요.", "A pen name or name. It appears on the cover.")}
          value={values.authorName}
          max={SUBMISSION_PACKAGE_LIMITS.authorChars}
          issues={issues}
          locale={locale}
          onChange={onChange}
        />
      </div>
      <StoryField
        field="logline"
        label={bt("로그라인", "Logline")}
        hint={bt("작품을 한두 문장으로 소개해 주세요.", "Pitch the work in one or two sentences.")}
        value={values.logline}
        max={SUBMISSION_PACKAGE_LIMITS.loglineChars}
        issues={issues}
        locale={locale}
        multiline={{ rows: 2 }}
        onChange={onChange}
      />
      <StoryField
        field="synopsis"
        label={bt("시놉시스", "Synopsis")}
        hint={bt("줄거리를 적어 주세요. 줄바꿈으로 문단을 나눠요.", "Write the story outline. Use line breaks to separate paragraphs.")}
        value={values.synopsis}
        max={SUBMISSION_PACKAGE_LIMITS.synopsisChars}
        issues={issues}
        locale={locale}
        multiline={{ rows: 6 }}
        onChange={onChange}
        extra={
          description.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canImport}
              title={canImport ? undefined : bt("시놉시스가 이미 적혀 있어서 덮어쓰지 않아요.", "The synopsis already has text, so it is not overwritten.")}
              onClick={() => onChange("synopsis", description)}
            >
              {bt("프로젝트 설명 넣기", "Use project description")}
            </Button>
          ) : null
        }
      />
    </fieldset>
  );
}
