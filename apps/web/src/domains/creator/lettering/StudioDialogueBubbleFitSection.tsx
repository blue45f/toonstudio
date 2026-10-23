/**
 * Studio Dialogue Bubble Fit Section — 대사-말풍선 핏 사전 경고 목록 (REPORT L-2).
 *
 * 대사 일괄 편집 패널(StudioDialogueBatchPanel) 안에 접이식 섹션으로 얹히는
 * 식자 전 검수 표면이다. 대사가 확정·수정될 때마다 패널이 코어
 * (studio-dialogue-bubble-fit)의 사전 계산 결과를 그대로 보여 준다 —
 * 식자에 착수하기 전에 "어느 컷이 안 들어가는지"를 목록으로 아는 것이 목적이다.
 *
 * 경계:
 *  · 이 섹션은 경고만 보여 준다. 대사나 말풍선을 고치는 경로는 없다 —
 *    행을 누르면 캔버스에서 해당 말풍선이 선택될 뿐이고, 고치는 일은
 *    작가가 목록(인라인 수정)이나 캔버스에서 직접 한다.
 *  · 수치는 전부 "예상"이다 — 실제 렌더와 같은 핏 판정을 미리 돌린 값이지만,
 *    글꼴이 작품 테마와 다르면 달라질 수 있음을 하단 고지로 밝힌다.
 *  · 크기를 몰라 계산하지 못한 말풍선은 숨기지 않고 "확인 불가"로 따로
 *    보여 준다("들어간다"는 뜻이 아니다).
 */
import { TriangleAlert } from "lucide-react";

import {
  groupBubbleFitWarnings,
  type BubbleFitWarning,
  type BubbleFitWarningKind,
  type DialogueBubbleFitSummary,
} from "./studio-dialogue-bubble-fit";

import { cx } from "@/shared/lib/cx";
import { useT } from "@/shared/lib/i18n";

import "../studio-brush-canvas-status-i18n";

export type StudioDialogueBubbleFitSectionProps = {
  /** 코어 사전 계산 결과의 경고 목록(페이지 순서). */
  warnings: readonly BubbleFitWarning[];
  /** 코어 사전 계산 요약 — "모두 들어감" 상태 표시와 확인 불가 집계에 쓴다. */
  summary: DialogueBubbleFitSummary;
  /** 경고 행 클릭 → 캔버스에서 해당 말풍선 선택(패널의 onSelectElement 위임). */
  onSelectElement: (pageId: string, elId: string) => void;
};

const KIND_LABEL: Record<BubbleFitWarningKind, string> = {
  overflow: "넘침 예상",
  shrink: "자동 축소 예정",
  unmeasurable: "확인 불가", // i18n-exempt: 렌더 지점 배지에서 studio.brushCanvasStatus.lettering.bubbleFitUnmeasurable 키로 해석한다
};

const KIND_BADGE_CLASS: Record<BubbleFitWarningKind, string> = {
  overflow: "border-warn/45 bg-warn/10 text-fg-2",
  shrink: "border-line bg-card text-fg-3",
  unmeasurable: "border-line bg-card text-fg-4",
};

export function StudioDialogueBubbleFitSection({
  warnings,
  summary,
  onSelectElement,
}: StudioDialogueBubbleFitSectionProps) {
  const t = useT();
  const groups = groupBubbleFitWarnings(warnings);

  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] leading-relaxed text-fg-3">
        대사가 확정되는 대로 말풍선 핏을 미리 계산했어요. 식자에 들어가기 전에 아래
        컷부터 확인해 주세요. 자동으로 고치지는 않아요.
      </p>

      {warnings.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-line bg-card/45 px-2.5 py-2 text-[0.65rem] leading-relaxed text-good"
        >
          검사한 말풍선 {summary.checkedCount}개 모두 지금 크기에 들어갈 것으로 보여요.
        </p>
      ) : (
        <div className="space-y-2.5">
          {groups.map((group) => (
            <section key={group.pageId} aria-label={`${group.pageIndex + 1}페이지 핏 경고`}>
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
                          {warning.kind === "unmeasurable" ? t("studio.brushCanvasStatus.lettering.bubbleFitUnmeasurable", "확인 불가") : KIND_LABEL[warning.kind]}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[0.66rem] font-medium text-fg-2">
                          {warning.excerpt || "(빈 대사)"}
                        </span>
                      </span>
                      <span className="block text-[0.6rem] leading-snug text-fg-3">
                        {warning.message}
                      </span>
                      {warning.kind === "overflow" && warning.requiredHeight != null ? (
                        <span className="mt-0.5 block text-[0.58rem] tabular-nums text-fg-4">
                          지금 높이 {warning.boxHeight}px → 필요 높이 약 {warning.requiredHeight}px
                        </span>
                      ) : null}
                      {warning.kind === "shrink" && warning.fittedFontSize != null ? (
                        <span className="mt-0.5 block text-[0.58rem] tabular-nums text-fg-4">
                          글자 {warning.fontSize}px → 약 {warning.fittedFontSize}px
                        </span>
                      ) : null}
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
          크기 정보가 없어 확인하지 못한 말풍선이 {summary.unmeasurableCount}개 있어요.
          "들어간다"는 뜻은 아니에요.
        </p>
      ) : null}
      <p className="text-[0.6rem] leading-snug text-fg-4">
        실제 식자와 같은 핏 계산을 미리 돌린 예상이에요. 작품 글꼴·테마가 다르면 결과가
        달라질 수 있어요.
      </p>
    </div>
  );
}
