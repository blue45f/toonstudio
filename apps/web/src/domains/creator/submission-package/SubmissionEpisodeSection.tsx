import { ArrowDown, ArrowUp, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/shared/components/ui/button";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { formatStudioByteSize } from "../export/studio-episode-byte-budget";

import type { SubmissionDraftActions } from "./use-submission-package-draft";
import type { SubmissionEpisodeState } from "./submission-package-draft-state";
import { describeSubmissionIssue } from "./submission-package-messages";
import { isReadableSubmissionPage } from "./submission-package-preflight";
import {
  SUBMISSION_PACKAGE_MIN_EPISODES,
  type SubmissionEpisodeStats,
  type SubmissionIssue,
  type SubmissionPackageLocale,
  type SubmissionPageFile,
} from "./submission-package-types";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 aria-[invalid=true]:border-bad";

export type SubmissionEpisodeActions = Pick<
  SubmissionDraftActions,
  "updateEpisode" | "addEpisode" | "removeEpisode" | "addFiles" | "removePage" | "movePage"
>;

export interface SubmissionEpisodeSectionProps {
  readonly episodes: readonly SubmissionEpisodeState[];
  readonly stats: readonly SubmissionEpisodeStats[];
  readonly issues: readonly SubmissionIssue[];
  readonly locale: SubmissionPackageLocale;
  /** 점검 기준 폭(px). 기준이 없으면 null. */
  readonly targetWidthPx: number | null;
  readonly restoredFromSaved: boolean;
  readonly actions: SubmissionEpisodeActions;
}

function IssueLines({ issues, locale }: { readonly issues: readonly SubmissionIssue[]; readonly locale: SubmissionPackageLocale }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className={cn("flex gap-1.5 text-xs leading-relaxed", issue.severity === "error" ? "text-bad" : "text-fg-2")}>
          <TriangleAlert aria-hidden="true" className={cn("mt-0.5 size-3.5 shrink-0", issue.severity === "error" ? "text-bad" : "text-warn")} />
          <span>{describeSubmissionIssue(issue, locale).title}</span>
        </li>
      ))}
    </ul>
  );
}

interface PageRowProps {
  readonly page: SubmissionPageFile;
  readonly index: number;
  readonly count: number;
  readonly targetWidthPx: number | null;
  readonly issues: readonly SubmissionIssue[];
  readonly locale: SubmissionPackageLocale;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRemove: () => void;
}

function PageRow({ page, index, count, targetWidthPx, issues, locale, onMove, onRemove }: PageRowProps) {
  const bt = useBilingual("SubmissionEpisodeSection");
  const readable = isReadableSubmissionPage(page);
  const offWidth = readable && targetWidthPx !== null && page.width !== targetWidthPx;
  return (
    <li className="rounded-xl border border-line bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-8 shrink-0 text-xs font-bold tabular-nums text-fg-3">{index + 1}</span>
        <span className="min-w-0 flex-1 break-all text-sm font-medium text-fg">{page.name}</span>
        <span className="text-xs tabular-nums text-fg-2">
          {readable ? `${page.width} × ${page.height}px` : bt("읽지 못함", "Unreadable")}
        </span>
        <span className="text-xs tabular-nums text-fg-2">{formatStudioByteSize(page.size)}</span>
        {offWidth ? (
          <span className="rounded-full border border-warn/60 bg-warning-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-fg">
            {formatI18nTemplate(bt("폭 기준 {target}px과 달라요", "Differs from the {target}px width"), { target: targetWidthPx ?? 0 })}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="quiet"
            disabled={index === 0}
            data-page-move={`${page.id}:up`}
            aria-label={formatI18nTemplate(bt("{name}을(를) 위로 옮기기", "Move {name} up"), { name: page.name })}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="quiet"
            disabled={index === count - 1}
            data-page-move={`${page.id}:down`}
            aria-label={formatI18nTemplate(bt("{name}을(를) 아래로 옮기기", "Move {name} down"), { name: page.name })}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="quiet"
            aria-label={formatI18nTemplate(bt("{name}을(를) 목록에서 빼기", "Remove {name} from the list"), { name: page.name })}
            onClick={onRemove}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </span>
      </div>
      <IssueLines issues={issues} locale={locale} />
    </li>
  );
}

interface EpisodeCardProps {
  readonly episode: SubmissionEpisodeState;
  readonly stats: SubmissionEpisodeStats | undefined;
  readonly issues: readonly SubmissionIssue[];
  readonly locale: SubmissionPackageLocale;
  readonly targetWidthPx: number | null;
  readonly actions: SubmissionEpisodeActions;
}

function EpisodeCard({ episode, stats, issues, locale, targetWidthPx, actions }: EpisodeCardProps) {
  const bt = useBilingual("SubmissionEpisodeSection");
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const fileId = `${baseId}-files`;
  const cardRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // 순서를 바꾼 직후, 옮긴 줄의 같은 방향 단추(끝에 닿아 꺼졌다면 반대 방향 단추)로 초점을 돌려준다.
  const lastMove = useRef<{ readonly pageId: string; readonly direction: "up" | "down" } | null>(null);
  useEffect(() => {
    const move = lastMove.current;
    if (!move) return;
    lastMove.current = null;
    const buttons = Array.from(cardRef.current?.querySelectorAll<HTMLButtonElement>("[data-page-move]") ?? []);
    const find = (direction: "up" | "down") => buttons.find((button) => button.dataset.pageMove === `${move.pageId}:${direction}`);
    const same = find(move.direction);
    const target = same && !same.disabled ? same : find(move.direction === "up" ? "down" : "up");
    target?.focus();
  }, [episode.pages]);
  const own = issues.filter((issue) => issue.target.kind === "episode" && issue.target.episodeId === episode.id);
  const numberInvalid = own.some((issue) => issue.code === "episode-number-invalid" || issue.code === "episode-number-duplicate");
  const label = Number.isFinite(episode.number) && episode.number > 0 ? formatI18nTemplate(bt("{number}화", "Episode {number}"), { number: episode.number }) : bt("회차", "Episode");

  return (
    <li>
      <section ref={cardRef} className="rounded-2xl border border-line bg-panel p-4" aria-labelledby={headingId}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 ref={headingRef} id={headingId} tabIndex={-1} className="text-base font-black text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80">
            {label}
            {episode.title.trim() ? <span className="ml-2 font-semibold text-fg-2">{episode.title.trim()}</span> : null}
          </h4>
          <Button
            type="button"
            size="sm"
            variant="quiet"
            aria-label={formatI18nTemplate(bt("{label} 지우기", "Remove {label}"), { label })}
            onClick={() => actions.removeEpisode(episode.id)}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {bt("회차 지우기", "Remove episode")}
          </Button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[7rem_1fr_1fr]">
          <label className="block text-sm font-bold text-fg">
            {bt("회차 번호", "Number")}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              className={INPUT_CLASS}
              value={Number.isFinite(episode.number) ? episode.number : ""}
              aria-invalid={numberInvalid ? true : undefined}
              onChange={(event) => actions.updateEpisode(episode.id, { number: event.target.valueAsNumber })}
            />
          </label>
          <label className="block text-sm font-bold text-fg">
            {bt("제목", "Title")}
            <input type="text" autoComplete="off" className={INPUT_CLASS} value={episode.title} onChange={(event) => actions.updateEpisode(episode.id, { title: event.target.value })} />
          </label>
          <label className="block text-sm font-bold text-fg">
            {bt("한 줄 메모 (선택)", "One-line note (optional)")}
            <input type="text" autoComplete="off" className={INPUT_CLASS} value={episode.note} onChange={(event) => actions.updateEpisode(episode.id, { note: event.target.value })} />
          </label>
        </div>

        {episode.document ? (
          <p className="mt-2 text-xs leading-relaxed text-fg-3">
            {episode.document.width !== null && episode.document.height !== null
              ? formatI18nTemplate(
                  bt(
                    "연결된 스튜디오 문서: {width} × {height}px · {pages}쪽. 이 문서를 에디터에서 PNG·JPEG로 내보낸 이미지를 아래에 추가해 주세요.",
                    "Linked Studio document: {width} × {height}px · {pages} page(s). Add the images you exported from this document as PNG or JPEG below.",
                  ),
                  { width: episode.document.width, height: episode.document.height, pages: episode.document.pageCount },
                )
              : bt("연결된 스튜디오 문서가 있어요. 이 문서를 에디터에서 PNG·JPEG로 내보낸 이미지를 아래에 추가해 주세요.", "A Studio document is linked. Add the images you exported from it as PNG or JPEG below.")}
          </p>
        ) : null}

        <div className="mt-3">
          <label htmlFor={fileId} className="text-sm font-bold text-fg">
            {bt("원고 이미지 추가 (PNG·JPEG·WebP, 여러 장 가능)", "Add manuscript images (PNG, JPEG, WebP; several at once)")}
          </label>
          <input
            id={fileId}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="mt-1 block w-full text-sm text-fg-2 file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-fg hover:file:border-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80"
            onChange={(event) => {
              const input = event.currentTarget;
              const files = Array.from(input.files ?? []);
              input.value = "";
              void actions.addFiles(episode.id, files);
            }}
          />
          <p className="mt-1 text-xs text-fg-3">
            {bt("이름 순(숫자 크기 순)으로 정렬해 담아요. 순서는 아래에서 바꿀 수 있어요. 파일은 이 브라우저 밖으로 나가지 않아요.", "Files are sorted by name (numerically). You can reorder below. Files never leave this browser.")}
          </p>
        </div>

        <div aria-busy={episode.reading > 0} className="mt-3">
          {episode.reading > 0 ? (
            <p role="status" className="rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg-2">
              {formatI18nTemplate(bt("이미지 {count}장의 크기와 형식을 읽는 중…", "Reading size and format of {count} image(s)…"), { count: episode.reading })}
            </p>
          ) : null}
          {episode.pages.length === 0 && episode.reading === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-4 text-sm text-fg-2">{bt("아직 이미지가 없어요. 위에서 이 회차의 원고 이미지를 골라 주세요.", "No images yet. Choose this episode's manuscript images above.")}</p>
          ) : null}
          {episode.pages.length > 0 ? (
            <ol className="space-y-1.5" aria-label={formatI18nTemplate(bt("{label} 원고 이미지 목록", "{label} manuscript images"), { label })}>
              {episode.pages.map((page, index) => (
                <PageRow
                  key={page.id}
                  page={page}
                  index={index}
                  count={episode.pages.length}
                  targetWidthPx={targetWidthPx}
                  issues={issues.filter((issue) => issue.target.kind === "page" && issue.target.pageId === page.id)}
                  locale={locale}
                  onMove={(direction) => {
                    lastMove.current = { pageId: page.id, direction: direction === -1 ? "up" : "down" };
                    actions.movePage(episode.id, page.id, direction);
                  }}
                  onRemove={() => {
                    // 누른 단추가 사라지므로 이 회차의 제목으로 초점을 옮긴다.
                    headingRef.current?.focus();
                    actions.removePage(episode.id, page.id);
                  }}
                />
              ))}
            </ol>
          ) : null}
        </div>

        <p role="status" className="mt-2 text-xs tabular-nums text-fg-2">
          {formatI18nTemplate(bt("이미지 {pages}장 · 가로 폭 {widths} · 합계 {size}", "{pages} image(s) · width {widths} · {size} in total"), {
            pages: stats?.readablePageCount ?? 0,
            widths: stats && stats.widths.length > 0 ? `${stats.widths.join(", ")}px` : "—",
            size: formatStudioByteSize(stats?.totalBytes ?? 0),
          })}
        </p>
        <IssueLines issues={own} locale={locale} />
      </section>
    </li>
  );
}

export function SubmissionEpisodeSection({ episodes, stats, issues, locale, targetWidthPx, restoredFromSaved, actions }: SubmissionEpisodeSectionProps) {
  const bt = useBilingual("SubmissionEpisodeSection");
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // 회차를 더하면 새 회차의 번호 칸으로, 지우면(누른 단추가 사라지므로) 이 구역의 제목으로 초점을 옮긴다.
  const previousCount = useRef(episodes.length);
  useEffect(() => {
    const before = previousCount.current;
    previousCount.current = episodes.length;
    if (episodes.length > before) listRef.current?.querySelector<HTMLInputElement>("li:last-child input")?.focus();
    else if (episodes.length < before) headingRef.current?.focus();
  }, [episodes.length]);
  const usable = stats.filter((entry) => entry.readablePageCount > 0).length;
  const enough = usable >= SUBMISSION_PACKAGE_MIN_EPISODES;
  const packageIssues = issues.filter((issue) => issue.target.kind === "episodes");

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div>
        <h3 ref={headingRef} id={titleId} tabIndex={-1} className="text-base font-black text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80">
          {bt("회차 원고", "Episode manuscripts")}
        </h3>
        <p className={cn("mt-1 text-sm leading-relaxed", enough ? "text-fg-2" : "font-semibold text-fg")}>
          {formatI18nTemplate(
            bt("이미지가 담긴 회차 {usable}화 / 투고에는 최소 {required}화가 필요해요.", "{usable} episode(s) with images / a submission needs at least {required}."),
            { usable, required: SUBMISSION_PACKAGE_MIN_EPISODES },
          )}
        </p>
        {restoredFromSaved ? (
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            {bt("지난번에 적은 회차 번호·제목·메모를 불러왔어요. 이미지 파일은 저장하지 않으므로 다시 골라 주세요.", "Episode numbers, titles and notes from last time were restored. Image files are never saved, so choose them again.")}
          </p>
        ) : null}
        <IssueLines issues={packageIssues} locale={locale} />
      </div>
      <ol ref={listRef} className="space-y-3">
        {episodes.map((episode) => (
          <EpisodeCard
            key={episode.id}
            episode={episode}
            stats={stats.find((entry) => entry.episodeId === episode.id)}
            issues={issues}
            locale={locale}
            targetWidthPx={targetWidthPx}
            actions={actions}
          />
        ))}
      </ol>
      <Button type="button" size="sm" variant="outline" onClick={actions.addEpisode}>
        <Plus aria-hidden="true" className="size-4" />
        {bt("회차 추가", "Add episode")}
      </Button>
    </section>
  );
}
