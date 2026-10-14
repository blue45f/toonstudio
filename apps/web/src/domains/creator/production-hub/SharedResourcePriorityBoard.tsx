import { useEffect, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { listProductionProjects } from "./production-dashboard-api";
import { getProductionProject, type ProductionProjectRecord } from "./production-api";
import {
  ASSET_LICENSE_USE_LABELS,
  SHARED_POOL_ROLE_LABELS,
  SHARED_PRIORITY_BAND_LABELS,
  SHARED_PRIORITY_REASON_LABELS,
  buildSharedResourceBoard,
  type AssetLicenseMetadata,
  type SharedPersonLoad,
  type SharedResourceBoard,
} from "./shared-resource-priority-license-model";

const LOAD_STATE_LABELS: Readonly<
  Record<SharedPersonLoad["state"] | "idle", { readonly ko: string; readonly en: string; readonly className: string }>
> = {
  over: { ko: "과부하", en: "Overloaded", className: "border-bad text-bad" },
  tight: { ko: "여유 없음", en: "Tight", className: "border-line text-warn" },
  ok: { ko: "적정", en: "Balanced", className: "border-line text-fg-2" },
  idle: { ko: "대기 없음", en: "Nothing queued", className: "border-line text-fg-3" },
};

const VERDICT_LABELS: Readonly<
  Record<"block" | "warn" | "allow", { readonly ko: string; readonly en: string; readonly className: string }>
> = {
  block: { ko: "배분 차단", en: "Blocked", className: "border-bad text-bad" },
  warn: { ko: "확인 후 배분", en: "Check first", className: "border-line text-warn" },
  allow: { ko: "배분 가능", en: "Clear", className: "border-line text-fg-2" },
};

/**
 * 공유 자원 통합 게시판 — 배경팀·채색팀 같은 공유 풀의 부하, 전 작품을
 * 하나의 순서로 정렬한 우선순위 큐, 에셋 라이선스 자동 검사, 배분 제안을
 * 한 화면에서 본다. 우선순위·검사 규칙은
 * shared-resource-priority-license-model의 명문화된 정책이 정본이다.
 *
 * 데이터: 접근할 수 있는 작품의 애그리게이트를 모아 집계한다(작품 수만큼
 * 읽는 N+1 로드는 조직 레인과 같은 허용 판단). 라이선스 메타데이터는
 * 호출자가 등록분을 넘길 수 있고, 없으면 요구사항 전부가
 * "메타데이터 없음 — 차단"으로 정직하게 표시된다.
 */
export function SharedResourcePriorityBoard({
  assetLicenses = [],
}: {
  readonly assetLicenses?: readonly AssetLicenseMetadata[];
}) {
  const bt = useBilingual("SharedResourcePriorityBoard");
  const [board, setBoard] = useState<SharedResourceBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      const list = await listProductionProjects().catch(() => null);
      if (!active) return;
      if (!list) {
        setBoard(null);
        setError(bt("작품 목록을 불러오지 못했습니다.", "Couldn't load your projects."));
        return;
      }
      const records = await Promise.all(
        list.projects.map((summary) => getProductionProject(summary.projectId).catch(() => null)),
      );
      if (!active) return;
      const aggregates = records
        .filter((item): item is ProductionProjectRecord => item !== null)
        .map((item) => item.aggregate);
      if (aggregates.length === 0 && list.projects.length > 0) {
        setBoard(null);
        setError(bt("공유 자원 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "Couldn't load shared resources. Please try again shortly."));
        return;
      }
      setBoard(buildSharedResourceBoard(aggregates, { now: new Date(), licenses: assetLicenses }));
    })().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assetLicenses는 호출자가 고정해 넘기는 등록분이다.
  }, [bt, refresh]);

  if (loading) {
    return <p role="status">{bt("공유 자원 현황을 모으는 중입니다.", "Gathering shared resources…")}</p>;
  }
  if (error) {
    return (
      <p className="text-sm leading-6 text-warn">
        {error}{" "}
        <button type="button" className="underline" onClick={() => setRefresh((value) => value + 1)}>
          {bt("다시 시도", "Retry")}
        </button>
      </p>
    );
  }
  if (!board || (board.queue.length === 0 && board.assetChecks.length === 0)) {
    return (
      <p className="text-sm leading-6 text-fg-2">
        {bt(
          "아직 집계할 열린 작업이나 에셋 요구가 없습니다. 작품에서 담당자·마감·견적을 넣고 에셋 요구를 등록하면 공유 풀 부하와 우선순위가 여기에 모입니다.",
          "No open work or asset needs to roll up yet. Assign owners, due dates, and estimates on the project screen and shared pool load and priority will gather here.",
        )}
      </p>
    );
  }

  const topQueue = board.queue.slice(0, 10);
  const problemAssets = board.assetChecks.filter((check) => check.verdict !== "allow");
  const clearAssetCount = board.assetChecks.length - problemAssets.length;

  return (
    <div>
      <p className="text-sm leading-6 text-fg-2">
        {bt(
          `앞으로 14일 창 기준 · 열린 작업 ${board.queue.length}건 · 라이선스 차단 에셋 ${board.blockedAssetCount}건 · 배분 제안 ${board.suggestions.length}건`,
          `Next-14-days window · ${board.queue.length} open tasks · ${board.blockedAssetCount} license-blocked assets · ${board.suggestions.length} allocation suggestions`,
        )}
        {board.unknownEstimateCount > 0 &&
          bt(
            ` · 견적이 없어 시간 합계에서 뺀 작업 ${board.unknownEstimateCount}건`,
            ` · ${board.unknownEstimateCount} task(s) without estimates are left out of the hour totals`,
          )}
      </p>

      <h3 className="mt-4 text-sm font-bold">{bt("공유 풀 부하 (역할별)", "Shared pool load, by role")}</h3>
      <ul className="mt-2 space-y-2">
        {board.pools.map((pool) => {
          const state = LOAD_STATE_LABELS[pool.state];
          const label = SHARED_POOL_ROLE_LABELS[pool.roleType];
          return (
            <li key={pool.roleType} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3 text-sm">
              <strong>{bt(label.ko, label.en)}</strong>
              <span className={`rounded-full border px-2 py-1 text-xs ${state.className}`}>{bt(state.ko, state.en)}</span>
              <span className="text-fg-2">
                {bt(
                  `구성원 ${pool.memberCount}명 · 열린 작업 ${pool.openTaskCount}건 · ${pool.loadHours}시간 / 창 용량 ${pool.capacityHours}시간`,
                  `${pool.memberCount} members · ${pool.openTaskCount} open tasks · ${pool.loadHours}h of ${pool.capacityHours}h window capacity`,
                )}
              </span>
              {pool.overdueCount > 0 && (
                <span className="text-bad">{bt(`지연 ${pool.overdueCount}건`, `${pool.overdueCount} overdue`)}</span>
              )}
              {pool.capacitySource === "default" && (
                <span className="text-xs text-fg-3">{bt("용량은 기본값(자원 달력 미등록)", "Capacity is the default (no resource calendars)")}</span>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="mt-4 text-sm font-bold">{bt("사람별 부하 (작품 합산)", "Load per person, across projects")}</h3>
      <ul className="mt-2 space-y-2">
        {board.people
          .filter((person) => person.openTaskCount > 0)
          .map((person) => {
            const state = LOAD_STATE_LABELS[person.state];
            return (
              <li key={person.partyId} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3 text-sm">
                <strong>{person.displayName}</strong>
                <span className={`rounded-full border px-2 py-1 text-xs ${state.className}`}>{bt(state.ko, state.en)}</span>
                <span className="text-fg-2">
                  {bt(
                    `작품 ${person.projectIds.length}개 · 작업 ${person.openTaskCount}건 · ${person.loadHours}시간 / ${person.capacityHours}시간`,
                    `${person.projectIds.length} projects · ${person.openTaskCount} tasks · ${person.loadHours}h of ${person.capacityHours}h`,
                  )}
                </span>
                {person.overdueCount > 0 && (
                  <span className="text-bad">{bt(`지연 ${person.overdueCount}건`, `${person.overdueCount} overdue`)}</span>
                )}
                {person.capacitySource === "default" && (
                  <span className="text-xs text-fg-3">{bt("용량 기본값", "Default capacity")}</span>
                )}
              </li>
            );
          })}
      </ul>

      <h3 className="mt-4 text-sm font-bold">{bt("우선순위 큐 (전 작품 통합)", "Priority queue, all projects")}</h3>
      <ol className="mt-2 space-y-2">
        {topQueue.map((entry) => {
          const band = SHARED_PRIORITY_BAND_LABELS[entry.score.band];
          return (
            <li key={`${entry.projectId}:${entry.taskId}`} className="rounded-lg border border-line p-3 text-sm leading-6">
              <span className="font-semibold">{entry.taskTitle}</span>
              <span className="text-fg-2"> ({entry.projectTitle})</span>{" "}
              <span className="rounded-full border border-line px-2 py-0.5 text-xs">
                {bt(band.ko, band.en)} · {entry.score.score}
                {bt("점", " pts")}
              </span>
              <br />
              <span className="text-fg-2">
                {entry.dueAt
                  ? bt(`마감 ${new Date(entry.dueAt).toLocaleDateString("ko-KR")}`, `Due ${new Date(entry.dueAt).toLocaleDateString("en-US")}`)
                  : bt("마감 미정", "No due date")}
                {entry.assigneeNames.length > 0
                  ? bt(` · 담당 ${entry.assigneeNames.join(", ")}`, ` · ${entry.assigneeNames.join(", ")}`)
                  : bt(" · 미배정", " · Unassigned")}
                {entry.remainingHours !== null
                  ? bt(` · 남은 ${entry.remainingHours}시간`, ` · ${entry.remainingHours}h left`)
                  : bt(" · 견적 없음", " · No estimate")}
              </span>
              {entry.score.reasons.length > 0 && (
                <>
                  <br />
                  <span className="text-xs text-fg-3">
                    {entry.score.reasons
                      .map((reason) => bt(SHARED_PRIORITY_REASON_LABELS[reason].ko, SHARED_PRIORITY_REASON_LABELS[reason].en))
                      .join(" · ")}
                  </span>
                </>
              )}
              {entry.licenseBlocked && (
                <>
                  <br />
                  <span className="text-xs text-bad">
                    {bt(
                      "라이선스가 차단된 에셋이 필요해 배분을 멈췄습니다. 권리부터 확인하세요.",
                      "Needs a license-blocked asset — allocation is paused until the rights are sorted.",
                    )}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs leading-6 text-fg-3">
        {bt(
          "점수 규칙: 마감 지남 40 · 48시간 이내 30 · 7일 이내 15 · 후반 공정 최대 15 · 긴급 지정 20 · 기다리는 후행 작업 건당 5(최대 15) · 막힌 작업 10. 70점부터 P0입니다.",
          "Scoring: overdue 40 · due in 48h 30 · due in 7 days 15 · late stage up to 15 · urgent 20 · waiting downstream 5 each (max 15) · blocked 10. P0 starts at 70.",
        )}
      </p>

      {board.suggestions.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-bold">{bt("배분 제안", "Allocation suggestions")}</h3>
          <ul className="mt-2 space-y-2">
            {board.suggestions.map((suggestion) => (
              <li key={`${suggestion.taskId}:${suggestion.toPartyId}`} className="rounded-lg border border-line p-3 text-sm leading-6">
                <span className="font-semibold">{suggestion.taskTitle}</span>
                <span className="text-fg-2"> ({suggestion.projectTitle})</span>
                <br />
                {bt(
                  `${suggestion.toName}(${SHARED_POOL_ROLE_LABELS[suggestion.roleType].ko})에게 배분 제안 · ${suggestion.reason === "unassigned" ? "미배정 해소" : "풀 과부하 분산"} · ${SHARED_PRIORITY_BAND_LABELS[suggestion.priorityBand].ko}${suggestion.hours !== null ? ` · ${suggestion.hours}시간` : ""}`,
                  `Suggest ${suggestion.toName} (${SHARED_POOL_ROLE_LABELS[suggestion.roleType].en}) · ${suggestion.reason === "unassigned" ? "fills an unassigned task" : "spreads an overloaded pool"} · ${SHARED_PRIORITY_BAND_LABELS[suggestion.priorityBand].en}${suggestion.hours !== null ? ` · ${suggestion.hours}h` : ""}`,
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-6 text-fg-3">
            {bt(
              "제안은 초안입니다. 실제 배분은 작품 화면에서 확정하세요. 라이선스가 차단된 에셋이 필요한 작업은 제안에서 제외했습니다.",
              "Suggestions are drafts — confirm on the project screen. Tasks needing license-blocked assets are excluded.",
            )}
          </p>
        </>
      )}

      <h3 className="mt-4 text-sm font-bold">{bt("에셋 라이선스 자동 검사", "Asset license checks")}</h3>
      {problemAssets.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-fg-2">
          {bt(
            `검사한 에셋 ${board.assetChecks.length}건 모두 배분 가능합니다.`,
            `All ${board.assetChecks.length} checked assets are clear to allocate.`,
          )}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {problemAssets.map((check) => {
            const verdict = VERDICT_LABELS[check.verdict];
            return (
              <li key={`${check.projectId}:${check.requirementId}`} className="rounded-lg border border-line p-3 text-sm leading-6">
                <strong>{check.title}</strong>{" "}
                <span className={`rounded-full border px-2 py-1 text-xs ${verdict.className}`}>{bt(verdict.ko, verdict.en)}</span>{" "}
                <span className="text-xs text-fg-3">
                  {bt(ASSET_LICENSE_USE_LABELS[check.use].ko, ASSET_LICENSE_USE_LABELS[check.use].en)}
                </span>
                <ul className="mt-1 list-disc pl-5 text-fg-2">
                  {check.issues.map((issue) => (
                    <li key={issue.code}>{issue.message}</li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      {clearAssetCount > 0 && problemAssets.length > 0 && (
        <p className="mt-2 text-xs leading-6 text-fg-3">
          {bt(`문제없는 에셋 ${clearAssetCount}건은 목록에서 접었습니다.`, `${clearAssetCount} clear asset(s) are folded out of this list.`)}
        </p>
      )}
      <p className="mt-2 text-xs leading-6 text-fg-3">
        {bt(
          "검사는 사용·배분 시점에 자동으로 돕니다. 라이선스 메타데이터가 없는 에셋, 권리 미확인, 비상업 라이선스의 상업 사용, 재배포 금지 에셋의 공유, 허용되지 않은 작품·용도, 만료는 차단하고, 만료 임박·출처표기 의무는 경고합니다.",
          "Checks run automatically at use and allocation time. Missing metadata, unconfirmed rights, noncommercial licenses in commercial work, sharing redistribution-forbidden assets, unlicensed projects or uses, and expiry block allocation; upcoming expiry and attribution duties warn.",
        )}
      </p>
    </div>
  );
}
