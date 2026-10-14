/**
 * Studio Dialogue Length Budget Section — 다국어 대사 길이 예산 표면 (REPORT L-3).
 *
 * 대사 일괄 편집 패널(StudioDialogueBatchPanel) 안에 접이식 섹션으로 얹히는
 * 집필 시점 검수 표면이다. 코어(studio-dialogue-length-budget)가 원문만으로
 * 계산한 언어별 예상 길이(회차 합계 + 대사별)와 말풍선 위험 목록을 그대로
 * 보여 준다 — 번역이 들어오기 전에 "어느 대사가 어느 언어에서 터질지"를
 * 아는 것이 목적이다.
 *
 * 경계:
 *  · 이 섹션은 예산만 보여 준다. 대사를 줄이거나 말풍선을 키우는 경로는
 *    없다 — 행을 누르면 캔버스에서 해당 말풍선이 선택될 뿐이다.
 *  · 수치는 전부 "예상"이다. 팽창률은 기본 상수이거나, 실제 번역이 쌓인
 *    작품에서는 실측 중앙값(작품 보정)으로 바뀌며, 어느 쪽인지 행마다
 *    배지로 밝힌다.
 *  · 핏을 확인하지 못한 말풍선(크기 없음·세로쓰기)과 원문을 단정할 수
 *    없는 대사는 숨기지 않고 하단에 따로 고지한다.
 */
import { TriangleAlert } from "lucide-react";

import {
  formatExpansionPercent,
  formatExpansionRate,
  groupLengthBudgetWarnings,
  type DialogueLengthBudgetResult,
  type LengthBudgetWarningKind,
} from "./studio-dialogue-length-budget";

import { cx } from "@/shared/lib/cx";

export type StudioDialogueLengthBudgetSectionProps = {
  /** 코어 예산 계산 결과 전체(프로필·합계·경고·요약). */
  result: DialogueLengthBudgetResult;
  /** 경고 행 클릭 → 캔버스에서 해당 말풍선 선택(패널의 onSelectElement 위임). */
  onSelectElement: (pageId: string, elId: string) => void;
};

const KIND_LABEL: Record<LengthBudgetWarningKind, string> = {
  overflow: "번역 시 넘침 예상",
  shrink: "번역 시 자동 축소 예정",
};

const KIND_BADGE_CLASS: Record<LengthBudgetWarningKind, string> = {
  overflow: "border-warn/45 bg-warn/10 text-fg-2",
  shrink: "border-line bg-card text-fg-3",
};

export function StudioDialogueLengthBudgetSection({
  result,
  onSelectElement,
}: StudioDialogueLengthBudgetSectionProps) {
  const { totals, warnings, summary } = result;
  const groups = groupLengthBudgetWarnings(warnings);

  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] leading-relaxed text-fg-3">
        원문을 쓰는 지금, 언어별 번역 예상 길이를 미리 계산했어요. 번역이 들어오기
        전에 아래 대사와 말풍선부터 확인해 주세요. 자동으로 고치지는 않아요.
      </p>

      {/* 언어별 예산 — 원문 총 길이 → 예상 총 길이, 팽창률 출처(기본/실측)를 함께 밝힌다. */}
      <ul className="space-y-1" aria-label="언어별 예상 길이">
        {totals.map((total) => (
          <li
            key={total.locale}
            className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-line bg-card/45 px-2 py-1.5"
          >
            <span className="text-[0.66rem] font-medium text-fg-2">{total.label}</span>
            <span className="rounded-full border border-line px-1.5 py-px text-[0.55rem] font-semibold tabular-nums text-fg-3">
              {formatExpansionRate(total.rate)} · {formatExpansionPercent(total.rate)}
            </span>
            <span className="rounded-full border border-line px-1.5 py-px text-[0.55rem] text-fg-4">
              {total.rateSource === "measured"
                ? `작품 실측 ${total.sampleCount}건`
                : "기본값"}
            </span>
            <span className="ml-auto text-[0.6rem] tabular-nums text-fg-3">
              원문 {total.sourceTotalLength}자 → 예상 약 {total.expectedTotalLength}자
            </span>
            {total.atRiskCount > 0 ? (
              <span className="w-full text-[0.58rem] text-warn">
                이 언어로 넘침이 예상되는 말풍선 {total.atRiskCount}개
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {warnings.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-line bg-card/45 px-2.5 py-2 text-[0.65rem] leading-relaxed text-good"
        >
          {summary.checkedBubbleCount > 0
            ? `검사한 말풍선 ${summary.checkedBubbleCount}개 모두 번역 예상 길이로도 들어갈 것으로 보여요.`
            : "말풍선 크기가 없어 번역 넘침까지는 확인하지 못했어요. 위 예상 길이를 참고해 주세요."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {groups.map((group) => (
            <section
              key={group.pageId}
              aria-label={`${group.pageIndex + 1}페이지 길이 예산 경고`}
            >
              <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-fg-3">
                {group.pageIndex + 1}페이지
              </p>
              <ul className="space-y-1.5">
                {group.warnings.map((warning) => (
                  <li key={warning.id}>
                    <button
                      type="button"
                      onClick={() => onSelectElement(warning.pageId, warning.itemId)}
                      className="w-full rounded-lg border border-line bg-card/45 p-2 text-left transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <span className="mb-1 flex items-center gap-1.5">
                        <TriangleAlert
                          size={11}
                          aria-hidden
                          className={cx(
                            "shrink-0",
                            warning.kind === "overflow" ? "text-warn" : "text-fg-4"
                          )}
                        />
                        <span
                          className={cx(
                            "rounded-full border px-1.5 py-px text-[0.55rem] font-semibold",
                            KIND_BADGE_CLASS[warning.kind]
                          )}
                        >
                          {KIND_LABEL[warning.kind]}
                        </span>
                        <span className="rounded-full border border-line px-1.5 py-px text-[0.55rem] font-semibold text-fg-3">
                          {warning.label}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[0.66rem] font-medium text-fg-2">
                          {warning.excerpt || "(빈 대사)"}
                        </span>
                      </span>
                      <span className="block text-[0.6rem] leading-snug text-fg-3">
                        {warning.message}
                      </span>
                      {warning.kind === "overflow" && warning.predictedHeight != null ? (
                        <span className="mt-0.5 block text-[0.58rem] tabular-nums text-fg-4">
                          지금 높이 {warning.boxHeight}px → 필요 높이 약 {warning.predictedHeight}px
                        </span>
                      ) : null}
                      {warning.kind === "shrink" && warning.fittedFontSize != null ? (
                        <span className="mt-0.5 block text-[0.58rem] tabular-nums text-fg-4">
                          글자 {warning.fontSize}px → 약 {warning.fittedFontSize}px
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-[0.58rem] tabular-nums text-fg-4">
                        팽창률 {formatExpansionRate(warning.rate)} (
                        {warning.rateSource === "measured" ? "작품 실측" : "기본값"})
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {summary.unmeasurableCount > 0 ? (
        <p className="text-[0.6rem] leading-snug text-fg-4">
          크기 정보가 없어 번역 넘침을 확인하지 못한 말풍선이 {summary.unmeasurableCount}개
          있어요. "들어간다"는 뜻은 아니에요.
        </p>
      ) : null}
      {summary.verticalCount > 0 ? (
        <p className="text-[0.6rem] leading-snug text-fg-4">
          세로쓰기 말풍선 {summary.verticalCount}개는 예상 길이만 계산했어요(넘침 판정은
          가로쓰기 기준이에요).
        </p>
      ) : null}
      {summary.sourceUncertainCount > 0 ? (
        <p className="text-[0.6rem] leading-snug text-fg-4">
          번역은 있지만 원문이 기록되지 않아 예산에서 제외한 대사가{" "}
          {summary.sourceUncertainCount}개 있어요.
        </p>
      ) : null}
      <p className="text-[0.6rem] leading-snug text-fg-4">
        예상 길이는 글자 수 기준의 보수적 추정이에요. 실제 번역이 쌓이면 팽창률이 작품
        실측값으로 자동 보정돼요.
      </p>
    </div>
  );
}
