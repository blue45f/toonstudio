/**
 * 3D 데생 인형 2인 구도 — 상대 인형 카드와 뷰포트 조작 대상 전환(B-02).
 *
 * 카드(포즈 탭)는 배치 요약·조작 대상 전환·상대 되돌리기·두 인형 프레이밍·상대 제거를,
 * 전환 칩(뷰포트 왼쪽 위)은 어느 탭에서든 주인공 ↔ 상대 전환을 맡는다. 상대가 없으면 둘 다
 * 그리지 않는다. 상태는 use-studio-mannequin-duo-partner 훅이 소유한다.
 */

import { Focus, Redo2, Undo2, UserMinus, UserRound, Users } from "lucide-react";
import { useId, type ReactElement } from "react";

import { studioSegmentChipClass } from "../studio-panel-ui";

import { describeStudioMannequinDuoPlacement } from "./studio-mannequin-duo-composition";
import "./studio-mannequin-duo-i18n";

import type { StudioMannequinDuoPartnerController } from "./use-studio-mannequin-duo-partner";
import type { StudioMannequinFigureId } from "./studio-mannequin-scene";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

type DuoView = Pick<
  StudioMannequinDuoPartnerController,
  | "partner"
  | "placement"
  | "activeFigure"
  | "history"
  | "setActiveFigure"
  | "undoPartner"
  | "redoPartner"
  | "frameBoth"
  | "removePartner"
>;

const FIGURES: readonly StudioMannequinFigureId[] = ["lead", "partner"];

function FigureToggle({
  duo,
  labelId,
  compact,
}: {
  readonly duo: DuoView;
  readonly labelId?: string;
  readonly compact?: boolean;
}): ReactElement {
  const t = useT();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-label={labelId ? undefined : t("studio.mannequinDuo.target", "조작할 인형")}
      className="flex items-center gap-1"
    >
      {FIGURES.map((figure) => (
        <button
          key={figure}
          type="button"
          aria-pressed={duo.activeFigure === figure}
          data-studio-mannequin-duo-figure={figure}
          onClick={() => duo.setActiveFigure(figure)}
          className={cn(studioSegmentChipClass(duo.activeFigure === figure), compact ? "shadow-sm" : undefined)}
        >
          {figure === "lead" ? <UserRound size={12} aria-hidden /> : <Users size={12} aria-hidden />}
          {figure === "lead"
            ? t("studio.mannequinDuo.lead", "주인공")
            : t("studio.mannequinDuo.partner", "상대")}
        </button>
      ))}
    </div>
  );
}

/** 뷰포트 왼쪽 위 전환 칩 — 관절·카메라 탭에서도 조작 대상을 바로 바꾼다. */
export function StudioMannequinDuoFigureSwitch({ duo }: { readonly duo: DuoView }): ReactElement | null {
  if (!duo.partner) return null;
  return (
    <div className="pointer-events-auto absolute left-2 top-2 z-10 rounded-full bg-panel/80 p-1 backdrop-blur-sm">
      <FigureToggle duo={duo} compact />
    </div>
  );
}

/** 포즈 탭의 2인 구도 카드. */
export function StudioMannequinDuoPartnerCard({ duo }: { readonly duo: DuoView }): ReactElement | null {
  const t = useT();
  const titleId = useId();
  const targetLabelId = useId();
  const { partner, placement } = duo;
  if (!partner) return null;
  const actionClass = buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" });
  return (
    <section
      aria-labelledby={titleId}
      data-studio-mannequin-duo-placement={placement?.compositionId ?? "restored"}
      className="mt-3 space-y-2 rounded-xl border border-line bg-card px-3 py-2.5"
    >
      <h3 id={titleId} className="text-xs font-bold text-fg">
        {t("studio.mannequinDuo.title", "2인 구도 — 상대 인형")}
      </h3>
      <p role="status" className="text-[0.7rem] leading-relaxed text-fg-2">
        {placement
          ? describeStudioMannequinDuoPlacement(placement)
          : t("studio.mannequinDuo.restored", "저장된 2인 구도입니다. 상대 인형도 함께 그려지고 캡처에 담깁니다.")}
      </p>
      <p className="text-[0.66rem] leading-relaxed text-fg-3">
        {t(
          "studio.mannequinDuo.position",
          { z: partner.offset[2].toFixed(2), x: partner.offset[0].toFixed(2) },
          "상대 위치 — 앞뒤 {z}m · 좌우 {x}m",
        )}
        {placement?.warnings[0] ? ` — ${placement.warnings[0]}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span id={targetLabelId} className="text-[0.66rem] font-semibold text-fg-2">
          {t("studio.mannequinDuo.target", "조작할 인형")}
        </span>
        <FigureToggle duo={duo} labelId={targetLabelId} />
      </div>
      <p className="text-[0.66rem] leading-relaxed text-fg-3">
        {t(
          "studio.mannequinDuo.hint",
          "상대를 고르면 뷰포트의 IK 핸들·관절 드래그와 1인 포즈 프리셋이 상대에게 적용됩니다. 뷰포트에서 인형을 눌러도 바뀝니다.",
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={duo.undoPartner} disabled={!duo.history.canUndo} className={actionClass}>
          <Undo2 size={12} aria-hidden />
          {t("studio.mannequinDuo.undo", "상대 되돌리기")}
        </button>
        <button type="button" onClick={duo.redoPartner} disabled={!duo.history.canRedo} className={actionClass}>
          <Redo2 size={12} aria-hidden />
          {t("studio.mannequinDuo.redo", "상대 다시 실행")}
        </button>
        <button type="button" onClick={duo.frameBoth} className={actionClass}>
          <Focus size={12} aria-hidden />
          {t("studio.mannequinDuo.frame", "두 인형 모두 보기")}
        </button>
        <button type="button" onClick={duo.removePartner} className={actionClass}>
          <UserMinus size={12} aria-hidden />
          {t("studio.mannequinDuo.remove", "상대 제거")}
        </button>
      </div>
    </section>
  );
}
