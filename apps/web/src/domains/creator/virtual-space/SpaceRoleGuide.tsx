import { ArrowUpRight, MapPin } from "lucide-react";
import { Suspense, useMemo, useState } from "react";

import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

import { rankCreatorProductionWork } from "../production-hub/creator-role-production-work";
import {
  studioVirtualProductionDestination,
  type StudioVirtualProductionDestination,
} from "./studio-virtual-space-production-route";
import {
  STUDIO_VIRTUAL_SPACE_WORK_REASON_LABELS,
} from "./studio-virtual-space-role-preset";
import type { SpaceRolePreset } from "./use-space-role-preset";

const MAX_ROLE_WORK = 2;

const LazyStudioHyperAutomationOsPanel = lazyRetry(
  () =>
    import("../hyper-automation-os/StudioHyperAutomationOsPanel").then((module) => ({
      default: module.StudioHyperAutomationOsPanel,
    })),
  "StudioHyperAutomationOsPanel",
);

/**
 * 수동 프로 0% ↔ 99% 원클릭 하이퍼 오토메이션 OS 접이식 진입점.
 * 비로그인 게스트와 직군 미설정 사용자도 /studio/space 작업 시작 팝오버에서
 * 1클릭으로 도달할 수 있도록 독립 노출하고, 펼칠 때만 본체를 지연 마운트한다.
 */
export function HyperAutomationOsDisclosure() {
  const bt = useBilingual("SpaceRoleGuide");
  const [hyperAutoOpen, setHyperAutoOpen] = useState(false);

  return (
    <details
      className="hyper-auto-os__disclosure"
      data-testid="studio-hyper-automation-os-disclosure"
      onToggle={(event) => setHyperAutoOpen(event.currentTarget.open)}
    >
      <summary>
        {bt(
          "하이퍼 오토메이션 OS: 수동 프로 0% ↔ 99% 원클릭 웹툰 자동 생성",
          "Hyper Automation OS: Manual Pro 0% ↔ 99% One-Click Webtoon",
        )}
      </summary>
      {hyperAutoOpen ? (
        <Suspense fallback={<p>{bt("하이퍼 오토메이션 OS 불러오는 중…", "Loading Hyper Automation OS…")}</p>}>
          <LazyStudioHyperAutomationOsPanel />
        </Suspense>
      ) : null}
    </details>
  );
}

/**
 * 작업 시작 안내 안에 들어가는 직군 가이드.
 *
 * 직군이 정한 순서대로 ① 직군 우선 업무 (기존 랭킹 재사용) ② 직군 빠른 실행
 * ③ 추천 공간 이동을 보여 준다. 직군이 없으면 아무것도 그리지 않고,
 * 추천에 없는 업무·공간도 기존 동선으로 전부 닿을 수 있다 (프리셋은 강조만).
 */
export function SpaceRoleGuide({
  role,
  aggregate,
  onGuide,
  onGuidePlace,
  showHyperAutomationDisclosure = true,
}: {
  readonly role: SpaceRolePreset;
  readonly aggregate: ProductionProjectAggregate | null;
  readonly onGuide?: (destination: StudioVirtualProductionDestination) => void;
  readonly onGuidePlace?: (roomId: string) => void;
  /** 바깥 컨테이너(StudioVirtualSpaceOfficeStart)가 이미 노출 중이면 중복 렌더를 막기 위해 false로 둔다. */
  readonly showHyperAutomationDisclosure?: boolean;
}) {
  const bt = useBilingual("SpaceRoleGuide");
  const { definition } = role;

  const ranked = useMemo(
    () => (aggregate
      ? rankCreatorProductionWork(aggregate, {
          userId: role.userId,
          activeRole: role.activeRole,
          limit: MAX_ROLE_WORK,
        })
      : []),
    [aggregate, role.activeRole, role.userId],
  );
  const taskById = useMemo(
    () => new Map((aggregate?.tasks ?? []).map((task) => [task.id, task] as const)),
    [aggregate],
  );

  if (!definition) return null;

  const roleName = role.customRoleLabel ?? bt(definition.label.ko, definition.label.en);
  return <div className="studio-vspace-role-guide" aria-label={bt("내 직군 안내", "Your role guide")}>
    <div className="studio-vspace-role-guide__head">
      <span className="studio-vspace-role-guide__badge">{roleName}</span>
      <strong>{bt(definition.workspaceTitle.ko, definition.workspaceTitle.en)}</strong>
      <small>{bt(definition.workspaceSummary.ko, definition.workspaceSummary.en)}</small>
    </div>
    {ranked.length ? <ul className="studio-vspace-role-guide__work">
      {ranked.map((item) => {
        const task: ProductionTask | undefined = taskById.get(item.id);
        const destination = task ? studioVirtualProductionDestination(task) : null;
        return <li key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <small>
              {item.reasons.slice(0, 2).map((reason) => bt(...STUDIO_VIRTUAL_SPACE_WORK_REASON_LABELS[reason])).join(" · ")}
              {item.due ? ` · ${bt(
                `마감 ${new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(`${item.due}T00:00:00`))}`,
                `Due ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${item.due}T00:00:00`))}`,
              )}` : ""}
            </small>
          </div>
          {destination && onGuide ? <button type="button" onClick={() => onGuide(destination)}>
            {bt("작업 공간으로 이동", "Walk to workspace")}<ArrowUpRight size={15} aria-hidden />
          </button> : null}
        </li>;
      })}
    </ul> : null}
    <div className="studio-vspace-role-guide__actions">
      {definition.actions.map((action) => (
        <Link key={action.href} href={action.href}>
          <span>{bt(action.label.ko, action.label.en)}</span>
          <ArrowUpRight size={14} aria-hidden />
        </Link>
      ))}
    </div>
    {onGuidePlace && role.preset.places.length ? <div className="studio-vspace-role-guide__places">
      <span><MapPin size={13} aria-hidden />{bt("내 직군 추천 공간", "Spaces for your role")}</span>
      <div>
        {role.preset.places.map((place) => (
          <button key={place.id} type="button" onClick={() => onGuidePlace(place.roomId)}>
            {bt(place.labelKo, place.labelEn)}
          </button>
        ))}
      </div>
    </div> : null}
    {showHyperAutomationDisclosure ? <HyperAutomationOsDisclosure /> : null}
  </div>;
}
