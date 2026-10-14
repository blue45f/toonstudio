import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { TeamWorkspaceSummary } from "@toonstudio/contracts/production-workspace";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { OrganizationRole } from "./organization-model";
import {
  AI_USAGE_MEMBER_ROW_MIN_TEAM_SIZE,
  buildTeamAiUsageReport,
  type AiBlockReason,
  type AiUsageDailyRecord,
} from "./team-ai-usage-model";

const REASON_LABELS: Record<AiBlockReason, { readonly ko: string; readonly en: string }> = {
  "daily-request-budget": { ko: "하루 요청 한도 도달", en: "Daily request budget reached" },
  "daily-token-budget": { ko: "하루 토큰 한도 도달", en: "Daily token budget reached" },
  "rate-limit": { ko: "제공자 속도 제한", en: "Provider rate limit" },
  "payment-required": { ko: "제공자 결제 필요", en: "Provider payment required" },
  authentication: { ko: "연결 인증 실패", en: "Connection authentication failed" },
};

function percent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/**
 * 팀 AI 사용 모니터링 카드 본문.
 *
 * records가 null이면 서버 AI 집계가 아직 연결되지 않은 상태다. 지금 AI 사용량은
 * 서버가 아니라 각자 기기의 무료 AI 안전 원장에만 남으므로(서버 사용량 계약의
 * externalAiEnabled·meteredProvidersEnabled가 모두 꺼져 있음), 남의 사용량을
 * 지어내 보여주지 않고 미연결 상태와 개인정보 경계만 먼저 드러낸다.
 * 조직 서버 계약에 AI 사용량 집계가 붙으면 records에 같은 모양의 행이 들어와
 * 이 패널이 그대로 실데이터를 그린다.
 */
export function TeamAiUsagePanel({
  linkedTeams,
  viewerRole,
  records,
}: {
  linkedTeams: readonly TeamWorkspaceSummary[];
  viewerRole: OrganizationRole;
  records: readonly AiUsageDailyRecord[] | null;
}) {
  const bt = useBilingual("TeamAiUsagePanel");

  const report = useMemo(() => {
    if (records === null) return null;
    const linkedIds = new Set(linkedTeams.map((team) => team.id));
    return buildTeamAiUsageReport({
      records: records.filter((record) => linkedIds.has(record.workspaceId)),
      teams: linkedTeams.map((team) => ({ id: team.id, name: team.name })),
      viewerRole,
    });
  }, [records, linkedTeams, viewerRole]);

  const privacyBox = (
    <div className="rounded-lg border border-line bg-raised p-3 text-sm leading-6 text-fg-2">
      <p className="font-bold text-fg">{bt("개인정보 경계 — 관리자가 볼 수 있는 것과 없는 것", "Privacy boundary — what admins can and cannot see")}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>{bt("보는 것은 숫자뿐입니다: 요청 횟수·예약 토큰·차단 건수와 차단 사유. 프롬프트·답변·생성한 이미지 내용은 수집 항목 자체가 없어 이 표면에 나타날 수 없습니다.", "Counts only: request counts, reserved tokens, blocks and block reasons. Prompts, responses, and generated content are never collected, so they cannot appear here.")}</li>
        <li>{bt("시간은 하루 단위까지만 봅니다. 몇 시에 무엇을 했는지는 기록하지 않습니다.", "Time is daily at most. There is no record of what was done at what hour.")}</li>
        <li>{bt(`구성원별 행은 조직 대표·운영 관리자만 봅니다. 매니저는 팀 합계만 보고, 활동 구성원이 ${AI_USAGE_MEMBER_ROW_MIN_TEAM_SIZE}명보다 적은 팀은 구성원별 행을 접어 합계만 보여줍니다.`, `Per-member rows are visible only to the organization owner and admins. Managers see team totals only, and teams with fewer than ${AI_USAGE_MEMBER_ROW_MIN_TEAM_SIZE} active members collapse to totals so nobody is singled out.`)}</li>
        <li>{bt("자기 AI 키(BYOK) 사용량은 본인과 제공자 사이의 일이라 팀 집계에 포함하지 않습니다.", "Usage on a member's own AI key (BYOK) stays between that member and their provider — it is never part of team totals.")}</li>
      </ul>
    </div>
  );

  if (report && report.visibility === "none") {
    return (
      <div>
        {privacyBox}
        <p className="mt-4 text-sm leading-6 text-fg-2">
          {bt("이 표면은 조직 대표·운영 관리자·매니저만 열 수 있습니다. 구성원의 AI 사용량은 위 경계 안에서만 집계되며, 본인의 사용량은 각 AI 표면의 쿼터 표시에서 직접 확인할 수 있습니다.",
            "This surface is for the organization owner, admins, and managers. Member AI usage is aggregated only within the boundary above; you can always check your own usage in the quota display on each AI surface.")}
        </p>
      </div>
    );
  }

  if (records === null || report === null) {
    return (
      <div>
        {privacyBox}
        <p className="mt-4 rounded-lg border border-warn/50 bg-raised p-3 text-sm leading-6 text-fg-2">
          {bt("아직 서버 집계가 연결되지 않았습니다. 지금 AI 사용량은 각자 기기의 무료 AI 안전 원장에만 남아 서버로 모이지 않으므로, 팀 사용량을 지어내 보여주지 않습니다. 조직 서버 계약에 AI 사용량 집계(하루 단위·숫자만)가 붙으면 이 표면이 같은 모양으로 실데이터를 표시합니다. 그 전까지 본인 사용량은 각 AI 표면의 쿼터 표시에서 확인할 수 있습니다.",
            "Server aggregation isn't connected yet. AI usage currently lives only in the free-AI safety ledger on each person's own device and never reaches the server, so this surface won't invent team figures. Once the organization server contract gains AI usage aggregation (daily, counts only), this surface shows the real data in exactly this shape. Until then, check your own usage in the quota display on each AI surface.")}
        </p>
      </div>
    );
  }

  if (linkedTeams.length === 0) {
    return (
      <div>
        {privacyBox}
        <p className="mt-4 text-sm leading-6 text-fg-2">{bt("연결한 팀이 없어 집계할 AI 사용량이 없습니다. 아래 팀 연결에서 팀을 연결하면 연결 팀의 AI 사용량이 여기에 집계됩니다.", "No linked teams yet, so there is no AI usage to aggregate. Link a team below and its AI usage will be rolled up here.")}</p>
      </div>
    );
  }

  if (report.recordCount === 0) {
    return (
      <div>
        {privacyBox}
        <p className="mt-4 text-sm leading-6 text-fg-2">{bt("집계 기간에 기록된 플랫폼 AI 사용량이 없습니다. 자기 키(BYOK) 사용량은 경계상 집계에 들어오지 않습니다.", "No platform AI usage was recorded in this period. Own-key (BYOK) usage never enters this aggregation by design.")}</p>
      </div>
    );
  }

  const maxDailyRequests = Math.max(1, ...report.dailySeries.map((point) => point.requests));

  return (
    <div>
      {privacyBox}

      <dl className="mt-4 grid gap-3 sm:grid-cols-4">
        <div><dt className="text-sm text-fg-2">{bt("총 AI 요청", "Total AI requests")}</dt><dd className="mt-1 text-xl font-black">{report.totals.requests.toLocaleString()}</dd></div>
        <div><dt className="text-sm text-fg-2">{bt("예약 토큰 합", "Reserved tokens")}</dt><dd className="mt-1 text-xl font-black">{report.totals.reservedTokens.toLocaleString()}</dd></div>
        <div><dt className="text-sm text-fg-2">{bt("차단 건수", "Blocked attempts")}</dt><dd className="mt-1 text-xl font-black">{report.totals.blocked.toLocaleString()}</dd></div>
        <div><dt className="text-sm text-fg-2">{bt("차단율", "Block rate")}</dt><dd className="mt-1 text-xl font-black">{percent(report.totals.blockRate)}</dd></div>
      </dl>
      <p className="mt-2 text-xs leading-6 text-fg-3">
        {bt(`집계 기간 ${report.days[0]} ~ ${report.days[report.days.length - 1]} (UTC) · 연결 팀 ${report.teams.length}개 · 차단율은 전체 시도(실행된 요청 + 차단된 시도) 대비입니다.`,
          `Period ${report.days[0]} – ${report.days[report.days.length - 1]} (UTC) · ${report.teams.length} linked team(s) · block rate is blocked attempts out of all attempts (completed requests + blocked attempts).`)}
        {report.excludedByok.requests + report.excludedByok.blocked > 0 &&
          bt(` 자기 키(BYOK) 사용 ${report.excludedByok.requests.toLocaleString()}건은 경계상 이 합계에서 빠져 있습니다.`,
            ` ${report.excludedByok.requests.toLocaleString()} own-key (BYOK) request(s) are excluded from these totals by the privacy boundary.`)}
      </p>

      {report.blockedByReason.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold">{bt("차단 사유별", "Blocks by reason")}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {report.blockedByReason.map((row) => (
              <li key={row.reason} className="rounded-full border border-warn/60 px-2 py-1 text-xs">
                {bt(REASON_LABELS[row.reason].ko, REASON_LABELS[row.reason].en)} · {row.count.toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-bold">{bt("날짜별 추이", "Daily trend")}</h3>
        <ul className="mt-2 space-y-1">
          {report.dailySeries.map((point) => (
            <li key={point.day} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-fg-2">{point.day}</span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-raised" role="img" aria-label={bt(`${point.day} 요청 ${point.requests}건, 차단 ${point.blocked}건`, `${point.day}: ${point.requests} requests, ${point.blocked} blocked`)}>
                <span className="block h-full bg-accent" style={{ width: `${Math.round((point.requests / maxDailyRequests) * 100)}%` }} />
              </span>
              <span className="shrink-0 text-fg-2">{bt(`요청 ${point.requests.toLocaleString()} · 차단 ${point.blocked.toLocaleString()}`, `${point.requests.toLocaleString()} req · ${point.blocked.toLocaleString()} blocked`)}</span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-4 space-y-3">
        {report.teams.map((team) => (
          <li key={team.workspaceId} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-3">
              <strong className="mr-auto">{team.name}</strong>
              <span className="text-sm text-fg-2">
                {bt(`요청 ${team.requests.toLocaleString()} · 예약 토큰 ${team.reservedTokens.toLocaleString()} · 차단 ${team.blocked.toLocaleString()} (${percent(team.blockRate)}) · 활동 구성원 ${team.activeMemberCount}명`,
                  `${team.requests.toLocaleString()} requests · ${team.reservedTokens.toLocaleString()} reserved tokens · ${team.blocked.toLocaleString()} blocked (${percent(team.blockRate)}) · ${team.activeMemberCount} active members`)}
              </span>
              <Link className="underline" to={`/team/people/${team.workspaceId}`}>{bt("팀 열기", "Open team")}</Link>
            </div>
            {team.memberRowState === "visible" && (
              <table className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="text-fg-2">
                    <th className="py-1 pr-3 font-semibold">{bt("구성원", "Member")}</th>
                    <th className="py-1 pr-3 font-semibold">{bt("요청", "Requests")}</th>
                    <th className="py-1 pr-3 font-semibold">{bt("예약 토큰", "Tokens")}</th>
                    <th className="py-1 pr-3 font-semibold">{bt("차단", "Blocked")}</th>
                    <th className="py-1 font-semibold">{bt("활동 일수", "Active days")}</th>
                  </tr>
                </thead>
                <tbody>
                  {team.memberRows.map((row) => (
                    <tr key={row.memberId} className="border-t border-line">
                      <td className="py-1 pr-3">{row.memberName}</td>
                      <td className="py-1 pr-3">{row.requests.toLocaleString()}</td>
                      <td className="py-1 pr-3">{row.reservedTokens.toLocaleString()}</td>
                      <td className="py-1 pr-3">{row.blocked.toLocaleString()}</td>
                      <td className="py-1">{row.activeDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {team.memberRowState === "suppressed-small-team" && (
              <p className="mt-2 text-xs leading-6 text-fg-3">
                {bt(`활동 구성원이 ${AI_USAGE_MEMBER_ROW_MIN_TEAM_SIZE}명보다 적어 구성원별 행을 접었습니다 — 소규모 팀에서 개인 사용량이 그대로 드러나지 않게 하기 위한 경계입니다. 팀 합계만 표시합니다.`,
                  `Per-member rows are collapsed because fewer than ${AI_USAGE_MEMBER_ROW_MIN_TEAM_SIZE} members were active — a boundary so individual usage isn't exposed in very small teams. Team totals only.`)}
              </p>
            )}
            {team.memberRowState === "hidden-by-role" && (
              <p className="mt-2 text-xs leading-6 text-fg-3">
                {bt("구성원별 행은 조직 대표·운영 관리자만 볼 수 있습니다. 매니저에게는 팀 합계만 표시합니다.",
                  "Per-member rows are visible only to the organization owner and admins. Managers see team totals only.")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
