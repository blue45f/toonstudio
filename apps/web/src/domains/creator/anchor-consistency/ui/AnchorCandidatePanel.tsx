/**
 * 후보 비교 패널 — 후보 이미지 놓기, 정렬·견줄 앵커 고르기, 분석 진행·취소·다시 시도, 목록과 나란히 보기.
 *
 * 점수는 휴리스틱 참고 값이다. 이 패널은 맨 위에 그 한계를 먼저 밝히고, 점수가 없는 이유(앵커 없음·권리 확인 전·분석 중·실패)를
 * 상태 글로 보여 준다. 이미지는 이 기기 안에서만 처리한다.
 */
import { useMemo, useId } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";

import { ANCHOR_LIMITS, isAnchorAngleId } from "../anchor-capture-spec";
import type { AnchorCapturedFrame } from "../anchor-capture-session";
import { ANGLE_NAME_KEYS, SORT_MODES, SORT_MODE_KEYS, formatMegabytes, isAnchorSortMode } from "../anchor-lab-copy";
import { AnchorCandidateList } from "./AnchorCandidateList";
import { AnchorCompareView } from "./AnchorCompareView";
import { AnchorDropZone } from "./AnchorDropZone";
import type { AnchorCandidates } from "./use-anchor-candidates";
import { useObjectUrls } from "./use-object-urls";

export interface AnchorCandidatePanelProps {
  readonly candidates: AnchorCandidates;
  readonly frames: readonly AnchorCapturedFrame[];
  readonly anchorPreviewUrls: ReadonlyMap<string, string>;
  readonly rightsConfirmed: boolean;
}

const SELECT_CLASS =
  "h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80";

export function AnchorCandidatePanel({ candidates, frames, anchorPreviewUrls, rightsConfirmed }: AnchorCandidatePanelProps) {
  const t = useT();
  const sortId = useId();
  const anchorSelectId = useId();
  const hasAnchors = frames.length > 0;
  const accepts = rightsConfirmed && hasAnchors;
  const entries = useMemo(() => candidates.items.map((item) => ({ id: item.id, blob: item.file })), [candidates.items]);
  const candidatePreviewUrls = useObjectUrls(entries);
  const { counts } = candidates;
  const running = counts.active > 0;
  const progress = running
    ? t("anchorLab.candidates.progress", { done: counts.settled, total: counts.total })
    : counts.total > 0 && counts.failed === 0
      ? t("anchorLab.candidates.progressDone", { count: counts.total })
      : "";
  const hasScores = candidates.items.some((item) => item.displayed !== null);
  const basisAngle = candidates.anchorChoice === "best" ? t("anchorLab.candidates.anchorSelect.best") : t(ANGLE_NAME_KEYS[candidates.anchorChoice]);
  const reason = !rightsConfirmed ? t("anchorLab.rights.locked") : !hasAnchors ? t("anchorLab.candidates.needAnchor") : undefined;

  return (
    <section aria-labelledby="anchor-lab-candidates-title" className="space-y-4 rounded-3xl border border-line bg-panel p-4 sm:p-6">
      <header className="space-y-1">
        <h2 id="anchor-lab-candidates-title" className="text-xl font-bold text-fg">{t("anchorLab.candidates.title")}</h2>
        <p className="text-sm leading-relaxed text-fg-2">{t("anchorLab.candidates.lead")}</p>
      </header>

      <AnchorDropZone
        multiple
        disabled={!accepts}
        reason={reason}
        zoneLabel={t("anchorLab.candidates.drop")}
        hint={t("anchorLab.candidates.hint", { max: formatMegabytes(ANCHOR_LIMITS.maxImageBytes), count: candidates.maxCandidates })}
        chooseLabel={t("anchorLab.candidates.choose")}
        inputLabel={t("anchorLab.candidates.inputLabel")}
        onFiles={candidates.addFiles}
      />

      {candidates.skippedNotice !== null ? (
        <p role="status" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg">
          {t("anchorLab.candidates.limitReached", { count: candidates.maxCandidates, skipped: candidates.skippedNotice })}
        </p>
      ) : null}

      {candidates.anchorStatus === "computing" ? (
        <p role="status" className="text-sm text-fg-2">{t("anchorLab.candidates.anchorPreparing")}</p>
      ) : null}
      {candidates.anchorStatus === "error" || (candidates.anchorStatus === "ready" && candidates.anchorFailedAngles > 0) ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
          <span className="min-w-0 flex-1">{t("anchorLab.candidates.anchorFailed", { count: Math.max(1, candidates.anchorFailedAngles) })}</span>
          <button type="button" onClick={candidates.retryAnchors} className={buttonClass({ variant: "outline", size: "sm" })}>
            {t("anchorLab.candidates.anchorRetry")}
          </button>
        </div>
      ) : null}

      {counts.total === 0 ? (
        <p className="text-sm text-fg-3">{t("anchorLab.candidates.empty")}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full space-y-1.5 sm:w-64">
              <label htmlFor={sortId} className="block text-sm font-medium text-fg">{t("anchorLab.candidates.sort.label")}</label>
              <select
                id={sortId}
                value={candidates.sortMode}
                onChange={(event) => {
                  const mode = event.target.value;
                  if (isAnchorSortMode(mode)) candidates.setSortMode(mode);
                }}
                className={SELECT_CLASS}
              >
                {SORT_MODES.map((mode) => <option key={mode} value={mode}>{t(SORT_MODE_KEYS[mode])}</option>)}
              </select>
            </div>
            <div className="w-full space-y-1.5 sm:w-64">
              <label htmlFor={anchorSelectId} className="block text-sm font-medium text-fg">{t("anchorLab.candidates.anchorSelect.label")}</label>
              <select
                id={anchorSelectId}
                value={candidates.anchorChoice}
                disabled={candidates.anchorAngles.length === 0}
                onChange={(event) => {
                  const choice = event.target.value;
                  if (choice === "best" || isAnchorAngleId(choice)) candidates.setAnchorChoice(choice);
                }}
                className={SELECT_CLASS}
              >
                <option value="best">{t("anchorLab.candidates.anchorSelect.best")}</option>
                {candidates.anchorAngles.map((angleId) => <option key={angleId} value={angleId}>{t(ANGLE_NAME_KEYS[angleId])}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {running ? (
                <button type="button" onClick={candidates.cancel} className={buttonClass({ variant: "outline", size: "md" })}>
                  {t("anchorLab.candidates.cancel")}
                </button>
              ) : null}
              {!running && counts.failed > 0 ? (
                <button
                  type="button"
                  onClick={() => { candidates.retry(candidates.items.filter((item) => item.status === "failed" || item.status === "cancelled").map((item) => item.id)); }}
                  className={buttonClass({ variant: "outline", size: "md" })}
                >
                  {t("anchorLab.candidates.retryFailed")}
                </button>
              ) : null}
              <button type="button" onClick={candidates.clearAll} className={buttonClass({ variant: "ghost", size: "md" })}>
                {t("anchorLab.candidates.clear")}
              </button>
            </div>
          </div>
          <p className="text-xs text-fg-3">{t("anchorLab.candidates.sortNote")}</p>
          {hasScores ? <p className="text-sm text-fg-2">{t("anchorLab.score.chosenAnchor", { angle: basisAngle })}</p> : null}
          <p role="status" className="min-h-5 text-sm text-fg-2">{progress}</p>

          <AnchorCandidateList
            items={candidates.items}
            selectedId={candidates.selectedId}
            previewUrls={candidatePreviewUrls}
            onSelect={candidates.select}
          />
          <AnchorCompareView
            candidates={candidates}
            frames={frames}
            anchorPreviewUrls={anchorPreviewUrls}
            candidatePreviewUrls={candidatePreviewUrls}
          />
        </div>
      )}
    </section>
  );
}
