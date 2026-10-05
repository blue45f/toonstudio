/**
 * Studio Dialogue Review Section — 적용된 번역의 원문↔번역 대조 검수 화면.
 *
 * 대사 번역 패널의 세 번째 화면이다. 초안 검토(적용 전)와 달리, 이미 문서에 들어간
 * 번역(dialogueI18n)을 회차 전체에서 나란히 놓고 사람이 판정한다:
 *  · 행마다 원문 스냅샷과 번역문을 대조하고, 번역문을 그 자리에서 고칠 수 있다
 *    (저장은 행 단위 명시 버튼 — 키 입력마다 문서 커밋이 생기지 않게).
 *  · 검수 상태(승인/수정 필요)를 항목·로케일별로 남긴다. 번역문을 고치면 상태는
 *    순수 코어(studio-dialogue-review)가 자동으로 미검수로 되돌린다.
 *  · 용어집 규칙이 있으면 행마다 위반을 규칙 기반으로 표시한다(번역 메모리와 같은
 *    판정 함수 재사용 — 원문이 기록돼 있지 않은 행은 검사할 수 없어 건너뛴다).
 *
 * 없는 데이터는 지어내지 않는다: 원문 스냅샷이 없으면 "원문 미기록", 번역이 없으면
 * "미번역"으로 구분해 표시한다. 상태·저장 같은 문서 변경은 전부 콜백으로 호스트에
 * 위임하고, 이 컴포넌트는 표시와 행 단위 편집 초안만 소유한다.
 */
import { Check, CircleAlert, Crosshair, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  findStudioTranslationMemoryGlossaryConflicts,
  parseStudioTranslationMemoryGlossaryText,
  type StudioTranslationMemoryGlossaryConflict,
} from "../studio-translation-glossary";
import {
  collectDialogueReviewRows,
  groupDialogueReviewRows,
  summarizeDialogueReview,
  type DialogueReviewPageLike,
  type DialogueReviewStatus,
} from "./studio-dialogue-review";
import { localeLabel } from "./studio-dialogue-translate";

import { cx } from "@/shared/lib/cx";

export type StudioDialogueReviewSectionProps = {
  pages: readonly DialogueReviewPageLike[];
  /** 지금 캔버스에 표시 중인 로케일 — 번역문 저장 시 el.text 동기화 판단용으로 그대로 넘긴다. */
  activeLocale: string;
  /** 번역이 하나라도 있는 로케일 목록(원문 제외). 비어 있으면 빈 상태 안내만 보인다. */
  availableLocales: string[];
  /** 용어집 자유 텍스트 — 위반 검사의 규칙 원본. 비어 있으면 검사를 건너뛴다. */
  glossary: string;
  onTextChange: (pageId: string, elId: string, locale: string, text: string) => void;
  onStatusChange: (
    pageId: string,
    elId: string,
    locale: string,
    status: DialogueReviewStatus | null
  ) => void;
  /** 발견 → 캔버스 요소 선택. 없으면 행의 위치 찾기 버튼을 그리지 않는다. */
  onRevealCue?: (pageId: string, elId: string) => void;
};

const statusBadgeClass = (status: DialogueReviewStatus | null, untranslated: boolean) =>
  cx(
    "shrink-0 rounded-full border px-1.5 py-px text-[0.56rem] font-semibold",
    untranslated
      ? "border-line bg-card text-fg-4"
      : status === "approved"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : status === "needs-edit"
          ? "border-warn/40 bg-warn/10 text-warn"
          : "border-line bg-card text-fg-3"
  );

const statusButtonClass = (active: boolean) =>
  cx(
    "inline-flex items-center gap-0.5 rounded-lg border px-1.5 py-1 text-[0.6rem] font-semibold transition-colors",
    active
      ? "border-accent/40 bg-accent-soft text-accent"
      : "border-line bg-card text-fg-2 hover:bg-raised"
  );

export function StudioDialogueReviewSection({
  pages,
  activeLocale,
  availableLocales,
  glossary,
  onTextChange,
  onStatusChange,
  onRevealCue,
}: StudioDialogueReviewSectionProps) {
  const [selectedLocale, setSelectedLocale] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<ReadonlyMap<string, string>>(new Map());

  const reviewLocale =
    selectedLocale && availableLocales.includes(selectedLocale)
      ? selectedLocale
      : availableLocales.includes(activeLocale)
        ? activeLocale
        : (availableLocales[0] ?? null);

  const glossaryRules = useMemo(
    () => parseStudioTranslationMemoryGlossaryText(glossary),
    [glossary]
  );
  const rows = useMemo(
    () => (reviewLocale ? collectDialogueReviewRows(pages, reviewLocale) : []),
    [pages, reviewLocale]
  );
  const summary = useMemo(
    () =>
      reviewLocale
        ? summarizeDialogueReview(pages, reviewLocale)
        : { total: 0, translated: 0, untranslated: 0, approved: 0, needsEdit: 0, unreviewed: 0 },
    [pages, reviewLocale]
  );
  // 행별 용어집 위반 — 원문 스냅샷이 있는 번역 행만 검사할 수 있다(없으면 판정 근거가 없다).
  const conflictsById = useMemo(() => {
    const map = new Map<string, StudioTranslationMemoryGlossaryConflict[]>();
    if (!reviewLocale || glossaryRules.length === 0) return map;
    for (const row of rows) {
      if (row.sourceText === null || row.translation === null) continue;
      const conflicts = findStudioTranslationMemoryGlossaryConflicts({
        sourceText: row.sourceText,
        translation: row.translation,
        sourceLocale: "",
        targetLocale: reviewLocale,
        rules: glossaryRules,
      });
      if (conflicts.length > 0) map.set(row.id, conflicts);
    }
    return map;
  }, [rows, glossaryRules, reviewLocale]);
  const conflictRowCount = conflictsById.size;
  const groups = groupDialogueReviewRows(rows);

  if (reviewLocale === null) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-4">
          아직 적용된 번역이 없어요. 먼저 번역을 생성해 적용하면 여기서 원문과 나란히 검수할 수
          있어요.
        </p>
      </div>
    );
  }

  const setDraft = (elId: string, text: string | null) => {
    setEditDrafts((prev) => {
      const next = new Map(prev);
      if (text === null) next.delete(elId);
      else next.set(elId, text);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b border-line/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <label className="text-[0.66rem] font-medium text-fg-3" htmlFor="dialogue-review-locale">
            검수 언어
          </label>
          <select
            id="dialogue-review-locale"
            value={reviewLocale}
            onChange={(e) => setSelectedLocale(e.target.value)}
            className="rounded-lg border border-line bg-card px-1.5 py-1 text-[0.66rem] text-fg outline-none focus:border-accent/50"
          >
            {availableLocales.map((code) => (
              <option key={code} value={code}>
                {localeLabel(code)} ({code})
              </option>
            ))}
          </select>
        </div>
        <p className="text-[0.62rem] leading-relaxed text-fg-3" role="status">
          번역 {summary.translated}/{summary.total} · 승인 {summary.approved} · 수정 필요{" "}
          {summary.needsEdit} · 미검수 {summary.unreviewed} · 미번역 {summary.untranslated}
          {glossaryRules.length > 0 && conflictRowCount > 0 ? (
            <span className="font-semibold text-warn"> · 용어집 위반 {conflictRowCount}행</span>
          ) : null}
        </p>
        <p className="text-[0.58rem] leading-relaxed text-fg-4">
          번역문을 고치면 그 대사의 검수 상태는 미검수로 돌아가요.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-4">
            검수할 말풍선·텍스트가 없어요.
          </p>
        ) : (
          <div className="space-y-2.5">
            {groups.map((group) => (
              <section key={group.pageId} aria-label={`${group.pageIndex + 1}페이지 검수`}>
                <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-fg-3">
                  {group.pageIndex + 1}페이지
                </p>
                <ul className="space-y-1.5">
                  {group.rows.map((row) => {
                    const untranslated = row.translation === null;
                    const draftText = editDrafts.get(row.id);
                    const shownText = draftText ?? row.translation ?? "";
                    const dirty = draftText !== undefined && draftText !== (row.translation ?? "");
                    const conflicts = conflictsById.get(row.id) ?? [];
                    return (
                      <li key={row.id} className="rounded-lg border border-line bg-card/45 p-1.5">
                        <div className="mb-1 flex min-w-0 items-start gap-1.5">
                          <p className="min-w-0 flex-1 text-[0.64rem] leading-snug text-fg-3">
                            {row.sourceText === null ? (
                              <span className="italic text-fg-4">원문 미기록</span>
                            ) : (
                              <>원문: {row.sourceText}</>
                            )}
                            {row.hidden ? <span className="text-fg-4"> · 숨김</span> : null}
                            {row.locked ? <span className="text-fg-4"> · 잠금</span> : null}
                          </p>
                          <span className={statusBadgeClass(row.status, untranslated)}>
                            {untranslated
                              ? "미번역"
                              : row.status === "approved"
                                ? "승인됨"
                                : row.status === "needs-edit"
                                  ? "수정 필요"
                                  : "미검수"}
                          </span>
                          {onRevealCue ? (
                            <button
                              type="button"
                              onClick={() => onRevealCue(row.pageId, row.id)}
                              title="캔버스에서 이 대사 선택"
                              aria-label="캔버스에서 이 대사 선택"
                              className="grid size-5 shrink-0 place-items-center rounded-md border border-line text-fg-3 transition-colors hover:bg-raised"
                            >
                              <Crosshair size={11} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                        <textarea
                          value={shownText}
                          onChange={(e) => setDraft(row.id, e.target.value)}
                          disabled={row.locked}
                          rows={Math.min(4, Math.max(1, shownText.split("\n").length))}
                          placeholder={untranslated ? "번역이 없어요 — 직접 입력해 저장할 수 있어요" : undefined}
                          aria-label={`${group.pageIndex + 1}페이지 대사 번역`}
                          className="w-full resize-y rounded-lg border border-line bg-card px-2 py-1 text-[0.7rem] leading-snug text-fg outline-none transition-colors placeholder:text-fg-4 focus:border-accent/50 disabled:opacity-60"
                        />
                        {conflicts.length > 0 ? (
                          <ul className="mt-1 space-y-0.5">
                            {conflicts.map((conflict, index) => (
                              <li
                                key={`${conflict.kind}-${conflict.sourceTerm}-${index}`}
                                className="flex items-start gap-1 text-[0.6rem] leading-snug text-warn"
                              >
                                <TriangleAlert size={10} className="mt-px shrink-0" aria-hidden />
                                <span>용어집: {conflict.message}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {dirty ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  onTextChange(row.pageId, row.id, reviewLocale, draftText);
                                  setDraft(row.id, null);
                                }}
                                className="inline-flex items-center gap-0.5 rounded-lg bg-accent px-1.5 py-1 text-[0.6rem] font-semibold text-on-accent transition-opacity hover:opacity-90"
                              >
                                <Check size={10} aria-hidden /> 저장
                              </button>
                              <button
                                type="button"
                                onClick={() => setDraft(row.id, null)}
                                className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-card px-1.5 py-1 text-[0.6rem] font-semibold text-fg-2 transition-colors hover:bg-raised"
                              >
                                <X size={10} aria-hidden /> 편집 취소
                              </button>
                            </>
                          ) : null}
                          <span className="flex-1" />
                          <button
                            type="button"
                            disabled={untranslated || row.locked}
                            aria-pressed={row.status === "approved"}
                            onClick={() =>
                              onStatusChange(
                                row.pageId,
                                row.id,
                                reviewLocale,
                                row.status === "approved" ? null : "approved"
                              )
                            }
                            className={cx(statusButtonClass(row.status === "approved"), "disabled:cursor-not-allowed disabled:opacity-50")}
                          >
                            <Check size={10} aria-hidden /> 승인
                          </button>
                          <button
                            type="button"
                            disabled={untranslated || row.locked}
                            aria-pressed={row.status === "needs-edit"}
                            onClick={() =>
                              onStatusChange(
                                row.pageId,
                                row.id,
                                reviewLocale,
                                row.status === "needs-edit" ? null : "needs-edit"
                              )
                            }
                            className={cx(statusButtonClass(row.status === "needs-edit"), "disabled:cursor-not-allowed disabled:opacity-50")}
                          >
                            <CircleAlert size={10} aria-hidden /> 수정 필요
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
