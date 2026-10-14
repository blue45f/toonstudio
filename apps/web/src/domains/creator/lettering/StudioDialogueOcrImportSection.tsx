/**
 * Studio Dialogue OCR Import Section — 이미지에서 읽은 대사(OCR)를 번역 초안으로
 * 받아 "번역 채우기 → 자동 배치 확인 → 사람 검수 → 승인분만 캔버스 반영"을 한
 * 화면에서 끝내는 섹션. 대사 번역 패널의 다섯 번째 화면(E)이다.
 *
 * 앞단(OCR 실행)은 이 컴포넌트 밖에 있다: 호스트가 OCR 공급자 결과(블록 목록)를
 * 넘기거나, 사용자가 외부 OCR 도구의 결과를 붙여 넣으면 순수 코어
 * (studio-dialogue-ocr-import.ts)가 읽기 순서·자동 배치까지 끝낸 검수 대기 초안을
 * 만든다. 번역 생성(BYOK)도 기존 번역 동선의 몫이고, 이 화면은 초안을 사람이
 * 읽고 고치고 판정하는 자리다 — 상태·문서 변경은 전부 콜백으로 호스트에 위임하고,
 * 이 컴포넌트는 붙여넣기 입력과 행 단위 편집 초안만 소유한다.
 *
 * 없는 데이터는 지어내지 않는다: 신뢰도가 없으면 배지를 그리지 않고, 배치 출처
 * (OCR 위치/자동 배치/쌓기 추정)를 행마다 그대로 표시한다. 승인되지 않은 초안은
 * 반영 버튼이 세지 않으며, 반영에서 막힌 초안은 호스트가 돌려준 사유를 보여 준다.
 */
import { Check, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { DialogueReviewStatus } from "./studio-dialogue-review";
import {
  groupOcrDrafts,
  ocrBlocksFromPlainText,
  summarizeOcrImport,
  OCR_IMPORT_BLOCK_REASON_LABEL,
  type OcrImportBlocked,
  type OcrImportDraft,
  type OcrPageInput,
  type OcrPlacementSource,
} from "./studio-dialogue-ocr-import";

import { cx } from "@/shared/lib/cx";

export type StudioDialogueOcrImportSectionProps = {
  /** 페이지 선택지(붙여넣기 대상) — id와 표시용 순번만 있으면 된다. */
  pages: readonly { id: string }[];
  /** 검수 대기 초안. null이면 아직 OCR 입력을 받지 않은 상태다. */
  drafts: readonly OcrImportDraft[] | null;
  /** 초안을 만들 때 비어 버려진 블록 수(호스트가 코어 결과에서 그대로 넘긴다). */
  skippedEmpty?: number;
  /** 지난 반영에서 막힌 초안과 사유 — 호스트가 buildOcrImportElements 결과를 넘긴다. */
  blocked?: readonly OcrImportBlocked[];
  /** 붙여넣기/OCR 결과로 초안 목록을 새로 만든다(기존 초안은 호스트 판단으로 교체). */
  onBuildDrafts: (input: OcrPageInput) => void;
  /** 행 단위 번역문 저장 — 호스트가 초안 상태를 갱신한다(검수 상태는 코어가 되돌린다). */
  onTranslationChange: (draftId: string, text: string) => void;
  /** 승인/수정 필요 판정 — null은 미검수 복귀. */
  onReviewChange: (draftId: string, status: DialogueReviewStatus | null) => void;
  /** 승인된 초안만 캔버스에 반영 — 실제 요소 생성은 코어 buildOcrImportElements가 한다. */
  onImportApproved: () => void;
};

const PLACEMENT_LABEL: Record<OcrPlacementSource, string> = {
  "ocr-box": "OCR 위치",
  "auto-layout": "자동 배치",
  stacked: "쌓기 추정",
  unplaced: "배치 없음",
};

const statusBadgeClass = (draft: OcrImportDraft) =>
  cx(
    "shrink-0 rounded-full border px-1.5 py-px text-[0.56rem] font-semibold",
    draft.translation === null
      ? "border-line bg-card text-fg-4"
      : draft.status === "approved"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : draft.status === "needs-edit"
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

export function StudioDialogueOcrImportSection({
  pages,
  drafts,
  skippedEmpty = 0,
  blocked = [],
  onBuildDrafts,
  onTranslationChange,
  onReviewChange,
  onImportApproved,
}: StudioDialogueOcrImportSectionProps) {
  const [pasteText, setPasteText] = useState("");
  const [pastePageId, setPastePageId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<ReadonlyMap<string, string>>(new Map());

  const targetPageId =
    pastePageId && pages.some((page) => page.id === pastePageId)
      ? pastePageId
      : (pages[0]?.id ?? null);

  const summary = useMemo(
    () =>
      drafts
        ? summarizeOcrImport(drafts)
        : {
            total: 0,
            translated: 0,
            untranslated: 0,
            approved: 0,
            needsEdit: 0,
            unreviewed: 0,
            lowConfidence: 0,
            unplaced: 0,
          },
    [drafts]
  );
  const groups = useMemo(() => (drafts ? groupOcrDrafts(drafts) : []), [drafts]);
  const blockedById = useMemo(
    () => new Map(blocked.map((entry) => [entry.draftId, entry.reason])),
    [blocked]
  );
  const pasteBlockCount = useMemo(() => ocrBlocksFromPlainText(pasteText).length, [pasteText]);

  const setDraft = (draftId: string, text: string | null) => {
    setEditDrafts((prev) => {
      const next = new Map(prev);
      if (text === null) next.delete(draftId);
      else next.set(draftId, text);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b border-line/60 px-3 py-2">
        <p className="text-[0.62rem] leading-relaxed text-fg-3" role="status">
          {drafts === null
            ? "이미지에서 읽은 대사를 붙여 넣으면 읽기 순서대로 검수 대기 초안이 만들어져요."
            : `초안 ${summary.total} · 번역 ${summary.translated} · 승인 ${summary.approved} · 수정 필요 ${summary.needsEdit} · 미검수 ${summary.unreviewed} · 미번역 ${summary.untranslated}`}
          {drafts !== null && summary.lowConfidence > 0 ? (
            <span className="font-semibold text-warn">
              {" "}
              · 인식 신뢰도 낮음 {summary.lowConfidence}
            </span>
          ) : null}
          {drafts !== null && summary.unplaced > 0 ? (
            <span className="font-semibold text-warn"> · 배치 없음 {summary.unplaced}</span>
          ) : null}
        </p>
        <p className="text-[0.58rem] leading-relaxed text-fg-4">
          번역문을 고치면 그 초안의 검수 상태는 미검수로 돌아가요. 캔버스에는 승인된 초안만
          들어가요.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2.5">
        <div className="space-y-1.5 rounded-lg border border-line bg-card px-2 py-2">
          <label
            className="block text-[0.62rem] font-medium text-fg-3"
            htmlFor="dialogue-ocr-paste"
          >
            OCR 결과 붙여넣기 (빈 줄로 대사 구분)
          </label>
          <div className="flex items-center gap-1.5">
            <label className="text-[0.62rem] text-fg-3" htmlFor="dialogue-ocr-page">
              넣을 페이지
            </label>
            <select
              id="dialogue-ocr-page"
              value={targetPageId ?? ""}
              onChange={(e) => setPastePageId(e.target.value)}
              className="rounded-lg border border-line bg-card px-1.5 py-1 text-[0.66rem] text-fg outline-none focus:border-accent/50"
            >
              {pages.map((page, index) => (
                <option key={page.id} value={page.id}>
                  {index + 1}페이지
                </option>
              ))}
            </select>
          </div>
          <textarea
            id="dialogue-ocr-paste"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={"첫 번째 대사\n\n두 번째 대사"}
            className="w-full resize-y rounded-lg border border-line bg-panel px-2 py-1.5 text-[0.66rem] leading-relaxed text-fg outline-none focus:border-accent/50"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.58rem] text-fg-4">
              {pasteBlockCount > 0
                ? `${pasteBlockCount}개 대사로 나뉘어요. 위치 정보가 없어 자동 배치로 추정해요.`
                : "OCR 도구에서 복사한 텍스트를 그대로 붙여 넣으세요."}
            </span>
            <button
              type="button"
              disabled={targetPageId === null || pasteBlockCount === 0}
              onClick={() => {
                if (targetPageId === null) return;
                onBuildDrafts({
                  pageId: targetPageId,
                  blocks: ocrBlocksFromPlainText(pasteText),
                });
                setPasteText("");
              }}
              className="shrink-0 rounded-lg border border-accent/40 bg-accent-soft px-2 py-1 text-[0.62rem] font-semibold text-accent transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              검수 대기 초안 만들기
            </button>
          </div>
          {skippedEmpty > 0 ? (
            <p className="text-[0.58rem] text-fg-4">
              비어 있는 블록 {skippedEmpty}개는 초안에서 제외했어요.
            </p>
          ) : null}
        </div>

        {drafts !== null && drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-4">
            읽을 수 있는 대사가 없었어요. OCR 결과를 다시 확인해 붙여 넣어 보세요.
          </p>
        ) : null}

        {groups.map((group) => (
          <section key={group.pageId} aria-label={`${group.pageIndex + 1}페이지 OCR 초안`}>
            <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-fg-3">
              {group.pageIndex + 1}페이지
            </p>
            <ul className="space-y-1.5">
              {group.drafts.map((draft) => {
                const untranslated = draft.translation === null;
                const draftText = editDrafts.get(draft.id);
                const shownText = draftText ?? draft.translation ?? "";
                const dirty =
                  draftText !== undefined && draftText !== (draft.translation ?? "");
                const blockedReason = blockedById.get(draft.id);
                return (
                  <li
                    key={draft.id}
                    className="space-y-1.5 rounded-lg border border-line bg-card px-2 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="whitespace-pre-wrap text-[0.66rem] leading-relaxed text-fg-2">
                        {draft.sourceText}
                      </p>
                      <span className={statusBadgeClass(draft)}>
                        {untranslated
                          ? "미번역"
                          : draft.status === "approved"
                            ? "승인"
                            : draft.status === "needs-edit"
                              ? "수정 필요"
                              : "미검수"}
                      </span>
                    </div>
                    <p className="flex flex-wrap items-center gap-1.5 text-[0.58rem] text-fg-4">
                      <span>{PLACEMENT_LABEL[draft.placementSource]}</span>
                      {draft.confidence !== null ? (
                        <span className={draft.lowConfidence ? "font-semibold text-warn" : ""}>
                          · 인식 신뢰도 {Math.round(draft.confidence * 100)}%
                          {draft.lowConfidence ? " — 원문을 꼭 확인하세요" : ""}
                        </span>
                      ) : null}
                      {blockedReason ? (
                        <span className="font-semibold text-warn">
                          · 반영 보류: {OCR_IMPORT_BLOCK_REASON_LABEL[blockedReason]}
                        </span>
                      ) : null}
                    </p>
                    <textarea
                      aria-label="번역문"
                      value={shownText}
                      onChange={(e) => setDraft(draft.id, e.target.value)}
                      rows={2}
                      placeholder="번역문을 입력하거나 번역 생성 결과를 기다리세요"
                      className="w-full resize-y rounded-lg border border-line bg-panel px-2 py-1.5 text-[0.66rem] leading-relaxed text-fg outline-none focus:border-accent/50"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!dirty}
                        onClick={() => {
                          onTranslationChange(draft.id, shownText);
                          setDraft(draft.id, null);
                        }}
                        className="rounded-lg border border-line bg-card px-1.5 py-1 text-[0.6rem] font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        번역문 저장
                      </button>
                      <button
                        type="button"
                        disabled={untranslated}
                        onClick={() =>
                          onReviewChange(
                            draft.id,
                            draft.status === "approved" ? null : "approved"
                          )
                        }
                        className={statusButtonClass(draft.status === "approved")}
                      >
                        <Check size={11} aria-hidden />
                        승인
                      </button>
                      <button
                        type="button"
                        disabled={untranslated}
                        onClick={() =>
                          onReviewChange(
                            draft.id,
                            draft.status === "needs-edit" ? null : "needs-edit"
                          )
                        }
                        className={statusButtonClass(draft.status === "needs-edit")}
                      >
                        {draft.status === "needs-edit" ? (
                          <X size={11} aria-hidden />
                        ) : (
                          <TriangleAlert size={11} aria-hidden />
                        )}
                        수정 필요
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {drafts !== null && drafts.length > 0 ? (
        <div className="border-t border-line/60 px-3 py-2">
          <button
            type="button"
            disabled={summary.approved === 0}
            onClick={onImportApproved}
            className="w-full rounded-lg border border-accent/40 bg-accent-soft px-2 py-1.5 text-[0.66rem] font-semibold text-accent transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            승인된 {summary.approved}개 캔버스에 말풍선으로 넣기
          </button>
        </div>
      ) : null}
    </div>
  );
}
