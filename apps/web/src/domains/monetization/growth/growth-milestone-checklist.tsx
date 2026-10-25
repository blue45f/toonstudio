/**
 * growth-milestone-checklist.tsx — 확산 마일스톤 체크리스트 표시
 * 컴포넌트 (5단계, 2026-10-25).
 *
 * 서버가 준 완료 여부·보상 연결 상태만 표시한다. 완료 판정·보상
 * 지급은 서버 정본이 담당하고, 이 컴포넌트는 상태를 바꾸지 않는다.
 */
import { useT } from "@/shared/lib/i18n";

import {
  resolveGrowthMilestoneDisplay,
  type GrowthMilestoneDisplayItem,
} from "./growth-milestones";

export function GrowthMilestoneChecklist({
  items,
}: {
  readonly items: readonly GrowthMilestoneDisplayItem[];
}) {
  const t = useT();
  const display = resolveGrowthMilestoneDisplay(items);
  return (
    <section aria-label={t("growth.milestone.heading")}>
      <h2>{t("growth.milestone.heading")}</h2>
      <ul>
        {display.map((item) => (
          <li key={item.id}>
            <p>
              {item.completed ? "✓" : "○"} {t(item.titleKey)}
            </p>
            <p>{t(item.descriptionKey)}</p>
            <p>
              {t(item.statusKey)} · {t(item.rewardKey)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
