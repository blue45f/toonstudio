import { CalendarClock, Layers, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  EPISODE_FLOW_STAGE_ZERO,
  derivePreSerializationBuffer,
  preBufferViewerForRoleLens,
  preSerializationBufferWarning,
  projectPreBufferForViewer,
  type PreSerializationBufferDigest,
} from "./pre-serialization-buffer";

/**
 * 준비 회차 버퍼 패널 — 회차 흐름 0단계(연재 준비·사전제작)를 명시하고
 * 버퍼 잔량·소진 위험을 보여 준다. 계산은 pre-serialization-buffer 순수
 * 모듈이 하고, 이 컴포넌트는 뷰 분리(운영진/작가)와 표시만 소유한다.
 * - 운영진 뷰: 잔량· bufferedDays·소진율(순소진)·소진 예상일·위험 등급·
 *   제작 캘린더 링크까지 마감 위험 지표 전부.
 * - 작가 뷰: 준비 회차 수와 목표까지 남은 회차, 다음 행동 한 가지.
 *   소진율·소진 예상일은 작가에게 압박 지표라 이 뷰에서는 그리지 않는다.
 * 아이콘은 lucide 컴포넌트 직접 사용(식별자 인자 패턴 없음).
 */
export function PreSerializationBufferPanel({
  digest,
  roleLens,
  projectId,
}: Readonly<{
  digest: PreSerializationBufferDigest;
  roleLens: CreatorRoleLens;
  projectId: string;
}>) {
  const bt = useBilingual("PreSerializationBufferPanel");
  const view = useMemo(
    () => projectPreBufferForViewer(digest, preBufferViewerForRoleLens(roleLens)),
    [digest, roleLens],
  );
  const warning = preSerializationBufferWarning(digest, bt);
  const scheduleHref = `/production/projects/${encodeURIComponent(projectId)}/schedule`;
  const toneClass = digest.riskLevel === "critical" || digest.riskLevel === "danger"
    ? "border-danger/40 bg-danger/5"
    : digest.riskLevel === "caution"
      ? "border-warn/40 bg-warn/5"
      : "border-line bg-panel/40";
  const progressPercent = Math.min(100, Math.round(digest.readinessRatio * 100));

  return (
    <section className={`rounded-2xl border p-4 ${toneClass}`} aria-label={bt("준비 회차 버퍼", "Prepared-episode buffer")}>
      <div className="flex flex-wrap items-center gap-2">
        <Layers size={16} aria-hidden className="text-accent" />
        <span className="rounded-full border border-line bg-card px-2.5 py-1 text-xs font-bold text-fg-2">
          {bt(EPISODE_FLOW_STAGE_ZERO.label.ko, EPISODE_FLOW_STAGE_ZERO.label.en)}
        </span>
        <strong className="text-sm font-bold text-fg">
          {bt(
            `준비 회차 ${digest.preparedCount}/${digest.targetPreparedCount}회`,
            `Prepared: ${digest.preparedCount}/${digest.targetPreparedCount}`,
          )}
        </strong>
        {digest.phase === "stage-0" && digest.daysUntilLaunch !== null ? (
          <span className="text-sm text-fg-2">
            {bt(`연재 시작까지 ${digest.daysUntilLaunch}일`, `${digest.daysUntilLaunch} day(s) to launch`)}
          </span>
        ) : null}
        {view.viewer === "ops" ? (
          <span className="text-xs font-semibold text-fg-3">
            {bt(`위험 등급: ${view.riskLevel}`, `Risk: ${view.riskLevel}`)}
          </span>
        ) : null}
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-line/60"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={digest.targetPreparedCount}
        aria-valuenow={digest.preparedCount}
        aria-label={bt("비축 목표 대비 준비 회차", "Prepared episodes against the stockpile target")}
      >
        <div className="h-full bg-accent" style={{ width: `${progressPercent}%` }} />
      </div>

      {warning ? (
        <p className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-fg-2" role="alert">
          <TriangleAlert size={15} aria-hidden className="mt-1 shrink-0 text-warn" />
          <span>
            <span className="font-semibold text-fg">{warning.title}. </span>
            {warning.reason}
          </span>
        </p>
      ) : null}

      {view.viewer === "ops" ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold text-fg-3">{bt("버퍼 잔량", "Buffer left")}</dt>
            <dd className="font-bold text-fg">{bt(`${view.preparedCount}회 · 약 ${view.bufferedDays}일`, `${view.preparedCount} ep. · ~${view.bufferedDays}d`)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-fg-3">{bt("소진율 (순소진/주)", "Burn rate (net/week)")}</dt>
            <dd className="font-bold text-fg">
              {view.netBurnPerWeek}
              {view.assumesNoReplenishment ? <span className="ml-1 text-xs font-semibold text-fg-3">{bt("(제작 속도 미입력·보충 0 가정)", "(pace unknown, no refill assumed)")}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-fg-3">{bt("소진 예상일", "Runs out on")}</dt>
            <dd className="font-bold text-fg">{view.projectedExhaustionDate ?? bt("지속 가능", "Sustainable")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-fg-3">{bt("연재 시작일 (캘린더)", "Launch (calendar)")}</dt>
            <dd className="font-bold text-fg">{view.launchDate ?? bt("미정", "Not set")}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm leading-6 text-fg-2" role="status">
          {view.nextAction === "ready-to-launch"
            ? bt("비축 목표를 채웠어요. 연재를 시작할 준비가 됐어요.", "Stockpile target reached — ready to launch.")
            : view.nextAction === "prepare-next-episode"
              ? bt(`다음 회차 1개만 더 완성하면 목표까지 ${Math.max(0, view.shortfall - 1)}회가 남아요.`, `Finish one more episode and ${Math.max(0, view.shortfall - 1)} will remain to the target.`)
              : bt(`준비 회차가 ${view.preparedCount}회 있어요. 한 회차씩 이어서 쌓아 두세요.`, `${view.preparedCount} prepared episode(s) in reserve. Keep adding one at a time.`)}
        </p>
      )}

      <div className="mt-3">
        <Link className={buttonClass({ variant: "outline", size: "sm" })} to={scheduleHref}>
          <CalendarClock size={14} aria-hidden /> {bt("연재 캘린더에서 보기", "Open the serialization calendar")}
        </Link>
      </div>
    </section>
  );
}

/** 개요 표면용 — aggregate에서 연재 시작일·주기·준비 회차를 도출해 패널을 그린다. */
export function AggregatePreSerializationBufferPanel({
  aggregate,
  roleLens,
}: Readonly<{
  aggregate: Pick<ProductionProjectAggregate, "projectId" | "episodes" | "releasePlans" | "seasonPlans">;
  roleLens: CreatorRoleLens;
}>) {
  const digest = useMemo(
    () => derivePreSerializationBuffer({
      episodes: aggregate.episodes,
      releasePlans: aggregate.releasePlans ?? [],
      seasonPlans: aggregate.seasonPlans,
      today: new Date().toISOString().slice(0, 10),
    }),
    [aggregate],
  );
  return <PreSerializationBufferPanel digest={digest} roleLens={roleLens} projectId={aggregate.projectId} />;
}
