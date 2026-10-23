/**
 * 한계 안내 — 점수가 무엇이고 무엇이 아닌지, 이미지가 어디서 처리되는지를 화면 맨 위에 항상 보여 준다.
 *
 * 이 안내는 접히지 않는다. 일관성을 보장하거나 같은 캐릭터를 판정한다고 읽힐 수 있는 문구는 이 화면 어디에도 쓰지 않는다.
 */
import { Info } from "lucide-react";

import { useT } from "@/shared/lib/i18n";

import "../anchor-lab-i18n";

export function AnchorLimitsNotice() {
  const t = useT();
  return (
    <aside aria-labelledby="anchor-lab-limits-title" className="rounded-2xl border border-line-strong bg-card p-4 sm:p-5">
      <h2 id="anchor-lab-limits-title" className="flex items-center gap-2 font-semibold text-fg">
        <Info size={16} aria-hidden="true" className="text-accent" />
        {t("anchorLab.limits.title")}
      </h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-fg-2">
        <li>{t("anchorLab.limits.score")}</li>
        <li>{t("anchorLab.limits.noGuarantee")}</li>
        <li>{t("anchorLab.limits.local")}</li>
        <li>{t("anchorLab.limits.virtualOnly")}</li>
        <li>{t("anchorLab.limits.stage")}</li>
      </ul>
    </aside>
  );
}
